// Verifies the C++ filter and envelope against the real thing in Chromium: BiquadFilterNode and Tone.Envelope (run: node core/tests/test_filter_env.mjs)
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module';
import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..', '..');
const SR = 48000;
const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'js/core/elita_core.wasm')), {});
const e = instance.exports; e.ec_init(SR);
const dbg = n => new Float32Array(e.memory.buffer, e.ec_dbg_buf(), n).slice();
const {srv, port} = await serve(root);
const browser = await chromium.launch(), page = await browser.newPage();
await page.goto(`http://localhost:${port}/core/tests/blank.html`);
let fail = 0;
const report = (name, ok, msg) => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(46) + msg); };

// ---- 1. BiquadFilterNode: impulse responses ----
const N = 2048, types = ['lowpass', 'highpass', 'bandpass'];
const cases = [];
for (const t of [0, 1]) for (const f of [20, 60, 300, 1000, 5000, 15000, 22000, 23990, 24000, 30000]) for (const q of [-5, -1, 0, 2.5, 9.5]) cases.push({t, f, q});
for (const f of [300, 1000, 5000, 24000]) for (const q of [-5, 0, 0.5, 2, 9.5]) cases.push({t: 2, f, q});
const ref = await page.evaluate(async ({cases, N, SR, types}) => {
  const out = [];
  for (const c of cases) {
    const ctx = new OfflineAudioContext(1, N, SR), b = ctx.createBiquadFilter();
    b.type = types[c.t]; b.frequency.value = c.f; b.Q.value = c.q;
    const buf = ctx.createBuffer(1, N, SR); buf.getChannelData(0)[0] = 1;
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(b); b.connect(ctx.destination); s.start();
    out.push(Array.from((await ctx.startRendering()).getChannelData(0)));
  }
  return out;
}, {cases, N, SR, types});
let worst = {err: 0}, nbad = 0;
cases.forEach((c, i) => {
  e.ec_dbg_biquad(c.t, c.f, c.q, N); const mine = dbg(N);
  let num = 0, den = 0; for (let k = 0; k < N; k++) { num += (mine[k] - ref[i][k]) ** 2; den += ref[i][k] ** 2; }
  const err = den > 0 ? Math.sqrt(num / den) : Math.sqrt(num);
  if (err > worst.err) worst = {err, c};
  if (err > 1e-3) { nbad++; if (nbad <= 6) console.log('     mismatch', types[c.t], 'f=' + c.f, 'Q=' + c.q, 'rel rms err', err.toExponential(2)); }
});
report('biquad impulse response (' + cases.length + ' cases)', nbad === 0, 'worst rel rms err ' + worst.err.toExponential(2) + ' (' + types[worst.c.t] + ' f=' + worst.c.f + ' Q=' + worst.c.q + ')');

// ---- 2. Tone.Envelope as configured in js/voice.js ----
const envCases = [
  {a: 0.001, d: 0.05, s: 0.0, r: 0.05, vel: 0.8, note: 0.4}, {a: 0.02, d: 0.3, s: 0.4, r: 0.4, vel: 1, note: 0.5},
  {a: 0.005, d: 1.5, s: 0.0, r: 2.0, vel: 0.9, note: 0.3}, {a: 0.3, d: 0.1, s: 1.0, r: 0.2, vel: 0.8, note: 0.6},
  {a: 0.001, d: 0.01, s: 0.7, r: 0.01, vel: 1.1, note: 0.2}, {a: 0.5, d: 0.5, s: 0.3, r: 0.8, vel: 0.8, note: 0.25},
];
const total = 1.6, TN = Math.round(total * SR);
const toneEnv = await page.evaluate(async ({envCases, total, SR}) => {
  const out = [];
  for (const c of envCases) {
    const buf = await Tone.Offline(() => {
      const env = new Tone.Envelope({attack: c.a, decay: c.d, sustain: c.s, release: c.r, attackCurve: 'linear', decayCurve: 'exponential', releaseCurve: 'exponential'}).toDestination();
      env.triggerAttack(0, c.vel); env.triggerRelease(c.note);
    }, total, 1, SR);
    out.push(Array.from(buf.getChannelData(0)));
  }
  return out;
}, {envCases, total, SR});
envCases.forEach((c, i) => {
  e.ec_dbg_env(c.a, c.d, c.s, c.r, c.vel, Math.round(c.note * SR), TN); const mine = dbg(TN), t = toneEnv[i];
  let worstAbs = 0, at = 0; for (let k = 0; k < TN; k++) { const d = Math.abs(mine[k] - t[k]); if (d > worstAbs) { worstAbs = d; at = k; } }
  report(`envelope A=${c.a} D=${c.d} S=${c.s} R=${c.r}`, worstAbs < 0.01 * c.vel, 'max abs diff ' + worstAbs.toExponential(2) + ' at t=' + (at / SR).toFixed(3) + 's (peak ' + c.vel + ')');
});
await browser.close(); srv.close();
console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
