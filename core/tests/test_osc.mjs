// Oscillators: harmonic levels and aliasing floor against Chromium's native OscillatorNode (saw / triangle / sine) and Tone's pulse oscillator.
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module'; import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SR = 48000, N = 48000;
const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'js/core/elita_core.wasm')), {});
const e = instance.exports; e.ec_init(SR);
const mine = (wave, f, duty = 0.5) => { e.ec_dbg_wave(wave, f, duty, N); return new Float32Array(e.memory.buffer, e.ec_dbg_buf(), N).slice(); };
const {srv, port} = await serve(root), browser = await chromium.launch(), page = await browser.newPage();
await page.goto(`http://localhost:${port}/core/tests/blank.html`);
const natives = {sine: 0, sawtooth: 1, triangle: 3, square: 5};
const freqs = [110, 440, 1000, 3000, 8000, 12000];
const ref = {};
for (const [t, w] of Object.entries(natives)) for (const f of freqs) {
  ref[t + f] = await page.evaluate(async ({t, f, N, SR}) => { const ctx = new OfflineAudioContext(1, N, SR), o = ctx.createOscillator(); o.type = t; o.frequency.value = f; o.connect(ctx.destination); o.start();
    return Array.from((await ctx.startRendering()).getChannelData(0)); }, {t, f, N, SR});
}
const duty = 0.5 + (-0.9 + 0.9 * 40 / 127) / 2;   // p/w knob 40
const w = -0.9 + 0.9 * 40 / 127;
for (const f of freqs) ref['pulse' + f] = await page.evaluate(async ({f, N, SR, w}) => { const b = await Tone.Offline(() => { const o = new Tone.OmniOscillator({type: 'pulse', frequency: f}); o.width.value = w; o.toDestination().start(0); }, N / SR, 1, SR); return Array.from(b.getChannelData(0)); }, {f, N, SR, w});
await browser.close(); srv.close();

function analyse(x, f) {            // level of each harmonic (linear), and the energy that is neither DC nor on a harmonic (aliasing + noise), dB re the signal power
  const nh = Math.floor((SR / 2) / f), H = []; let et = 0, dc = 0; for (const v of x) { et += v * v; dc += v; } dc /= N;
  let eh = dc * dc;
  for (let k = 1; k <= nh; k++) { let re = 0, im = 0; const w = 2 * Math.PI * k * f / SR; for (let n = 0; n < N; n++) { re += x[n] * Math.cos(w * n); im += x[n] * Math.sin(w * n); } const a = 2 * Math.hypot(re, im) / N; H.push(a); eh += a * a / 2; }
  return {H, rms: Math.sqrt(et / N), dc, alias: 10 * Math.log10(Math.max(1e-30, (et / N - eh)) / (et / N))};
}
const db = a => 20 * Math.log10(Math.max(a, 1e-9));
// ideal (analytic) harmonic amplitudes
const ideal = {sine: (k) => k === 1 ? 1 : 0, sawtooth: k => 2 / (Math.PI * k), triangle: k => k % 2 ? 8 / (Math.PI * Math.PI * k * k) : 0, square: k => k % 2 ? 4 / (Math.PI * k) : 0, pulse: k => 4 / (Math.PI * k) * Math.abs(Math.sin(Math.PI * k * ((1 + w) / 2)))};
// scale of the normalised saw, measured once on Chromium's 110 Hz saw (full band, so the rms is that of the whole wave)
const sawScale = analyse(ref['sawtooth110'], 110).rms / Math.sqrt(1 / 3);
const sqScale = analyse(ref['square110'], 110).rms / 1;   // a unit square has rms 1; Chromium peak-normalises the band-limited square (Gibbs overshoot) too
let fail = 0;
const cases = [['sine', 0, 'sine'], ['sawtooth', 1, 'sawtooth'], ['triangle', 3, 'triangle'], ['square', 5, 'square'], ['pulse', 2, 'pulse']];
for (const [name, wv, key] of cases) for (const f of freqs) {
  const m = analyse(mine(wv, f, (1 + w) / 2), f), r = key === 'pulse' ? null : analyse(ref[key + f], f), rp = key === 'pulse' ? analyse(ref[key + f], f) : r;
  // harmonic error against the analytic spectrum, for harmonics below 12 kHz and above 1e-3 (the linear table interpolation rolls the very top off a little: reported separately)
  let w1 = 0, w2 = 0;
  // the saw is peak-normalised including its Gibbs overshoot, in Chromium too (rms agrees); apply that known scale to the ideal spectrum
  const sc = key === 'sawtooth' ? sawScale : key === 'square' ? sqScale : 1;
  m.H.forEach((a, i) => { const k = i + 1, id = ideal[key](k) * sc; if (id < 1e-3 || k * f >= 23500) return; const d = Math.abs(db(a) - db(id)); if (k * f < 12000) w1 = Math.max(w1, d); else w2 = Math.max(w2, d); });
  const chromiumLvl = r ? (20 * Math.log10(m.rms / r.rms)).toFixed(2) + ' dB' : 'n/a';
  // pass: harmonics below 12 kHz within 0.3 dB of the ideal; the non-harmonic floor below -70 dB (mine, in absolute terms); rms vs Chromium within 0.3 dB (saw / tri / sine)
  const ok = w1 < 0.3 && m.alias < -70 && (!r || Math.abs(20 * Math.log10(m.rms / r.rms)) < 0.3); if (!ok) fail++;
  console.log((ok ? 'ok   ' : 'FAIL ') + (name + ' ' + f + ' Hz').padEnd(18) + `vs ideal: <12k ${w1.toFixed(2)} dB, >12k ${w2.toFixed(2)} dB | rms vs Chromium ${chromiumLvl} | non-harmonic floor mine ${m.alias.toFixed(0)} dB, ${key === 'pulse' ? 'Tone pulse' : 'Chromium'} ${rp.alias.toFixed(0)} dB`);
}
console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
