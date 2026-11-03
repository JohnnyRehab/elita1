// A/B: the Tone.js engine and the C++ / Wasm core play the same patch and note in an OfflineAudioContext; the two renderings are compared sample by sample.
// run: node core/tests/test_ab.mjs [--save dir]   (the old engine is the reference: the aim of M1 is "the same sound", not a new one)
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module'; import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SR = 48000, DUR = 1.6, NOTE_OFF = 0.4;                          // 0.4 s = 150 render blocks: the note-off lands on a block boundary in both engines
const save = process.argv.includes('--save') ? process.argv[process.argv.indexOf('--save') + 1] : null;
const CASES = [
  {name: 'default patch (saw, LP24)', set: {}},
  {name: 'LP12, res 100, env amt, sustain', set: {14: 0, 20: 100, 19: 60, 21: 110, 17: 60, 27: 90}},
  {name: 'osc2 pulse + p/w, pitch +12, mix 64', set: {5: 64, 1: 2, 8: 50, 2: 76, 3: 80}},
  {name: 'unison 3, detune 60', set: {73: 1, 93: 3, 75: 60, 5: 64}},
  {name: 'unison 4 (Synth1 spec limit lifted)', set: {73: 1, 93: 4, 75: 90, 5: 64}, limits: 'synth1'},
  {name: 'HP12, res 90', set: {14: 2, 20: 90, 19: 50}},
  {name: 'BP12, res 120', set: {14: 3, 20: 120, 19: 70}},
  {name: 'filter sat 100, LPDL', set: {23: 100, 14: 4, 20: 80}},
  {name: 'noise osc2, mix 64', set: {1: 4, 5: 64}, stoch: true},   // random: compared by level, envelope and band spectrum, not by waveform
  {name: 'noise only, filter open', set: {1: 4, 5: 127, 19: 127, 20: 0}, stoch: true},
  {name: 'noise only, LP24 frq 80', set: {1: 4, 5: 127, 19: 80, 20: 0}, stoch: true},
  {name: 'triangle + sine, mix 64', set: {0: 3, 1: 3, 5: 64}},
  {name: 'key track 100, note C5', set: {22: 100, 19: 60}, note: 72},
  {name: 'velocity 0.4, sens 127, filter vel', set: {30: 127, 24: 1, 21: 110}, vel: 0.4},
  {name: 'tune / det / key shift / osc2 fine', set: {72: 90, 76: 60, 9: 5, 2: 70, 3: 80, 5: 64}},
  {name: 'gain 60, vol 80, pan 90', set: {29: 60, vol: 80, 90: 90}},
  {name: 'phase 40 (restart each note)', set: {91: 40, 5: 64}, envTol: 2.5},   // the Tone engine restarts the oscillators 3 ms late (stop / start scheduling); the core starts at once
  {name: 'sine osc1, long attack/decay', set: {0: 0, 25: 60, 26: 80, 27: 50}},
  // ---- M2a: sub / ring / sync / FM ----
  {name: 'sub sine, level 80 (+ osc1 saw)', set: {95: 80, 96: 0, 5: 64}},
  {name: 'sub triangle -1 oct, osc1 muted', set: {95: 100, 96: 1, 97: 1, 5: 0}},
  {name: 'sub saw + osc1', set: {95: 90, 96: 2}},
  {name: 'sub square -1 oct', set: {95: 90, 96: 3, 97: 1, 5: 32}},
  {name: 'sub saw with unison 3, detune 60', set: {95: 90, 96: 2, 73: 1, 93: 3, 75: 60, 5: 32}},
  {name: 'ring saw x saw (osc2 +7)', set: {7: 1, 2: 71, 5: 64}},
  {name: 'ring tri x pulse, unison 3 (osc2 +12)', set: {7: 1, 0: 3, 1: 2, 8: 60, 2: 77, 73: 1, 93: 3, 75: 40, 5: 64}},
  {name: 'sync saw slave (+7)', set: {6: 1, 2: 71, 5: 64}},
  {name: 'sync pulse slave (+12, p/w 40)', set: {6: 1, 1: 2, 2: 77, 8: 40, 5: 64}},
  {name: 'sync triangle slave (+5)', set: {6: 1, 1: 3, 2: 69, 5: 64}},
  {name: 'sync saw slave, PolyBLEP', set: {6: 1, 2: 71, 5: 64}, syncAA: true},
  {name: 'sync pulse slave, PolyBLEP', set: {6: 1, 1: 2, 2: 77, 8: 40, 5: 64}, syncAA: true},
  {name: 'sync + unison 3 (slave is single)', set: {6: 1, 2: 71, 73: 1, 93: 3, 75: 50, 5: 64}},
  {name: 'FM 60, osc2 +12, osc2 muted', set: {45: 60, 2: 77, 5: 0}, stoch: true},
  {name: 'FM 90 + sub, osc2 +7', set: {45: 90, 2: 71, 5: 20, 95: 80, 96: 0}, stoch: true},
  {name: 'FM 40 with unison 3', set: {45: 40, 2: 77, 5: 20, 73: 1, 93: 3, 75: 60}, stoch: true},
  // ---- M2b: LFO / mod envelope / ladder / slop / unison pitch layer ----
  {name: 'LFO1 triangle -> OSC2 pitch', set: {57: 1, 41: 1, 42: 1, 43: 64, 44: 60, 5: 64}},
  {name: 'LFO1 saw down -> pitch (both OSCs + sub)', set: {57: 1, 41: 2, 42: 0, 43: 48, 44: 70, 95: 60, 5: 40}, fixLag: true, nmseTol: -16},
  {name: 'LFO1 sine -> cutoff', set: {57: 1, 41: 3, 42: 5, 43: 70, 44: 80, 19: 70, 20: 60}},
  {name: 'LFO2 square -> tremolo', set: {58: 1, 46: 4, 47: 2, 48: 60, 49: 90}},
  {name: 'LFO1 sine -> pulse width', set: {0: 2, 8: 60, 57: 1, 41: 5, 42: 5, 43: 64, 44: 100}},
  {name: 'LFO2 triangle -> FM depth (panel FM 0)', set: {58: 1, 46: 6, 47: 1, 48: 60, 49: 60, 5: 64}},
  {name: 'LFO1 sine -> pan', set: {57: 1, 41: 7, 42: 5, 43: 64, 44: 100}},
  {name: 'LFO1 -> pitch + LFO2 -> cutoff, both on', set: {57: 1, 41: 2, 42: 1, 43: 60, 44: 40, 58: 1, 46: 3, 47: 5, 48: 80, 49: 60, 19: 70, 20: 50, 5: 64}},
  {name: 'LFO tempo sync (1.33 beats)', set: {57: 1, 41: 3, 42: 1, 43: 64, 44: 90, 67: 1, 19: 64, 20: 70}},
  {name: 'LFO pitch + unison 3 + stereo width', set: {73: 1, 93: 3, 75: 40, 5: 64, 57: 1, 41: 2, 42: 1, 43: 64, 44: 60, 84: 90}},
  // fixLag / nmseTol: pitch sweeps of 2700 cents in a few ms leave a constant phase offset (0.03 .. 0.08 cycle) because Tone's envelope and oscillator start differ by a few samples; pitch track, level and envelope match
  {name: 'mod env -> OSC2 pitch', set: {10: 1, 11: 100, 12: 20, 13: 60, 71: 0, 5: 64}, fixLag: true, nmseTol: -4},
  {name: 'mod env -> FM depth', set: {10: 1, 11: 110, 12: 10, 13: 70, 71: 1, 5: 64}, fixLag: true, nmseTol: -18},
  {name: 'mod env -> pulse width', set: {0: 2, 10: 1, 11: 20, 12: 10, 13: 60, 71: 2}},
  {name: 'ladder, res 80', set: {20: 80, 19: 70}, filter: 'ladder'},
  {name: 'ladder, stage saturation, res 100', set: {20: 100, 19: 64, 21: 90}, filter: 'ladder', ladsat: 'stage'},
  {name: 'ladder, bass feedback, res 90', set: {20: 90, 19: 60}, filter: 'ladder', ladfb: 150},
  {name: 'ladder + LFO cutoff + filter env', set: {20: 70, 19: 50, 21: 100, 57: 1, 41: 3, 42: 1, 43: 64, 44: 60}, filter: 'ladder'},
  {name: 'slop high (voice 0)', set: {5: 64, 2: 76}, analog: {slop: 9}},
  {name: 'unison pitch layer +12', set: {73: 1, 93: 3, 75: 40, 85: 36, 5: 64}},
  {name: 'pitch layer -12 + stereo width', set: {73: 1, 93: 3, 75: 40, 85: 12, 84: 100, 5: 64}},
  {name: 'pitch layer +7 + ring', set: {73: 1, 93: 3, 75: 40, 85: 31, 7: 1, 5: 64, 2: 76}},
  {name: 'pitch layer +5 + sync', set: {73: 1, 93: 3, 75: 40, 85: 29, 6: 1, 5: 64, 2: 70}},
  // ---- M3: effects (both engines have the same 6 ms limiter look-ahead, so the lag is 0) ----
  {name: 'fx a.d.1 distortion', set: {77: 1, 78: 0, 79: 80, 80: 90, 81: 100}},
  {name: 'fx a.d.2 distortion, low-pass', set: {77: 1, 78: 1, 79: 100, 80: 50, 81: 90}},
  {name: 'fx d.d. distortion', set: {77: 1, 78: 2, 79: 70, 80: 100, 81: 110}},
  {name: 'fx deci. (rate 60, 8 bit)', set: {77: 1, 78: 3, 79: 60, 80: 50, 81: 100}},
  {name: 'fx ring mod', set: {77: 1, 78: 4, 79: 60, 81: 100}},
  {name: 'fx comp. (deep)', set: {77: 1, 78: 5, 79: 100, 80: 30, 81: 127}},
  {name: 'fx phaser ph.1', set: {77: 1, 78: 6, 79: 90, 80: 70, 81: 80}, restartLfos: true},
  {name: 'fx phaser ph.4, feedback', set: {77: 1, 78: 9, 79: 100, 80: 60, 81: 110}, restartLfos: true},
  {name: 'EQ boost 100', set: {61: 70, 62: 110, 63: 60}},
  {name: 'EQ cut', set: {61: 40, 62: 10, 63: 100}},
  {name: 'tone bright', set: {60: 110}},
  {name: 'tone dark', set: {60: 20}},
  {name: 'chorus x1', set: {66: 1, 56: 80, 52: 60, 53: 90, 54: 60, 55: 64, 64: 1}, restartLfos: true},
  {name: 'chorus x2 + feedback', set: {66: 1, 56: 90, 52: 80, 53: 100, 54: 50, 55: 110, 64: 2}},
  {name: 'chorus x3', set: {66: 1, 56: 90, 52: 60, 53: 80, 54: 70, 55: 64, 64: 3}},
  {name: 'chorus x4', set: {66: 1, 56: 100, 52: 70, 53: 90, 54: 40, 55: 64, 64: 4}},
  {name: 'delay ST', set: {65: 1, 37: 90, 35: 8, 36: 70, 82: 0}},
  {name: 'delay X (cross feedback)', set: {65: 1, 37: 100, 35: 5, 36: 90, 82: 1}},
  {name: 'delay PP (ping-pong)', set: {65: 1, 37: 100, 35: 5, 36: 90, 82: 2}},
  {name: 'delay spread 110, tone low-cut', set: {65: 1, 37: 100, 35: 8, 36: 80, 83: 110, 98: 100}},
  {name: 'delay tone high-cut', set: {65: 1, 37: 100, 35: 8, 36: 80, 98: 30}},
  {name: 'delay + pan 90 + unison', set: {65: 1, 37: 80, 35: 7, 36: 60, 90: 90, 73: 1, 93: 3, 75: 40, 5: 64}},
  {name: 'limiter engaged (loud)', set: {29: 127, vol: 127, 73: 1, 93: 3, 75: 60, 5: 64, 95: 127}},
];
const {srv, port} = await serve(root);
const browser = await chromium.launch({args: ['--autoplay-policy=no-user-gesture-required']});
async function renderOld(c) {
  const page = await browser.newPage(); await page.goto(`http://localhost:${port}/index.html?engine=tone`); await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.core && ELITA.core.Voice);
  const out = await page.evaluate(async ({c, SR, DUR, NOTE_OFF}) => {
    const buf = await Tone.Offline(async () => {
      if (c.limits) ELITA.core.LIMITS = c.limits;
      if (c.syncAA) ELITA.core.SYNC_AA = true;
      if (c.filter) ELITA.core.FILTER = c.filter; if (c.ladsat) ELITA.core.LADDER_SAT = c.ladsat; if (c.ladfb) ELITA.core.LADDER_FBHP = c.ladfb; if (c.analog) Object.assign(ELITA.core.analog, c.analog);
      await ELITA.engine.start();
      Object.entries(c.set).forEach(([no, v]) => ELITA.setValue(no === 'vol' ? 'vol' : +no, v));
      await new Promise(r => setTimeout(r, 50));                        // the engine applies the panel in a microtask
      // Tone.Offline starts a chorus LFO whose phase is set after start() about 0.25 s late (measured); restart them at 0 so that the free-running LFOs of both engines begin together
      if (c.restartLfos) { const S = ELITA.core; [S.chorus, S.chorus2, S.fx.phLfo].forEach(l => { l.stop(0); l.start(0); }); }
      const v = ELITA.core.voices[0]; v.down(c.note || 60, c.vel || 0.8);
      v.amp.triggerRelease(NOTE_OFF); v.fe.triggerRelease(NOTE_OFF);
    }, DUR, 2, SR);
    return [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))];
  }, {c, SR, DUR, NOTE_OFF});
  await page.close(); return out;
}
async function renderNew(c) {
  const page = await browser.newPage(); await page.goto(`http://localhost:${port}/index.html?engine=core`); await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.engine.core);
  const out = await page.evaluate(async ({c, SR, DUR, NOTE_OFF}) => {
    if (c.limits) { ELITA.core.LIMITS = c.limits; ELITA.engine.refresh(); }
    if (c.syncAA) ELITA.core.SYNC_AA = true;
    if (c.filter) ELITA.core.FILTER = c.filter; if (c.ladsat) ELITA.core.LADDER_SAT = c.ladsat; if (c.ladfb) ELITA.core.LADDER_FBHP = c.ladfb; if (c.analog) Object.assign(ELITA.core.analog, c.analog);
    Object.entries(c.set).forEach(([no, v]) => ELITA.setValue(no === 'vol' ? 'vol' : +no, v));
    const ctx = new OfflineAudioContext(2, Math.round(DUR * SR), SR), core = ELITA.engine.core;
    // the LFOs of both engines start at time 0 and the note-on of the Tone engine is 6 ms late, but the LFO phase seen by the note agrees best with no lead (measured: error -29 dB at 0, -20 dB at 6 ms): c.lead (s) advances the core's LFOs for diagnosis
    await core.attach(ctx, null, [{k: 'la', i: 0, v: c.lead ?? 0, t: 0}, {k: 'la', i: 1, v: c.lead ?? 0, t: 0}, {k: 'on', i: 0, n: c.note || 60, vel: c.vel || 0.8, g: 0, r: 1, t: 0}, {k: 'off', i: 0, t: NOTE_OFF}]);
    const b = await ctx.startRendering(); return [Array.from(b.getChannelData(0)), Array.from(b.getChannelData(1))];
  }, {c, SR, DUR, NOTE_OFF});
  await page.close(); return out;
}
function compare(a, b) {
  const N = a.length; let best = {lag: 0, r: -2};
  const dot = (lag, n) => { let s = 0, sa = 0, sb = 0; for (let i = 2000; i < n; i++) { const j = i + lag; if (j < 0 || j >= N) continue; s += a[i] * b[j]; sa += a[i] * a[i]; sb += b[j] * b[j]; } return s / Math.sqrt(sa * sb + 1e-30); };
  if (compare.fix !== undefined) best = {lag: compare.fix, r: dot(compare.fix, 24000)};            // fast pitch sweeps pull the best-correlation lag away from the real delay: use the known one
  else for (let lag = -600; lag <= 600; lag++) { const r = dot(lag, 24000); if (r > best.r) best = {lag, r}; }
  let sab = 0, saa = 0, sbb = 0, n = 0; for (let i = 0; i < N; i++) { const j = i + best.lag; if (j < 0 || j >= N) continue; sab += a[i] * b[j]; saa += a[i] * a[i]; sbb += b[j] * b[j]; n++; }
  const g = sab / (sbb + 1e-30);                                         // best gain to apply to the new rendering
  let e = 0; for (let i = 0; i < N; i++) { const j = i + best.lag; if (j < 0 || j >= N) continue; e += (a[i] - g * b[j]) ** 2; }
  const rmsOld = Math.sqrt(saa / n), rmsNew = Math.sqrt(sbb / n);
  // level over time: rms in 50 ms windows, the worst difference in dB where the old one is above -60 dB
  let wd = 0; const W = 2400; for (let s = 0; s + W <= N; s += W) { let x = 0, y = 0; for (let i = s; i < s + W; i++) { const j = i + best.lag; if (j < 0 || j >= N) { x = y = -1; break; } x += a[i] ** 2; y += b[j] ** 2; } if (x > 0 && x / W > 1e-6) wd = Math.max(wd, Math.abs(10 * Math.log10((y + 1e-30) / x))); }
  return {lag: best.lag, corr: best.r, levelDb: 20 * Math.log10(rmsNew / rmsOld), nmse: 10 * Math.log10(e / (saa + 1e-30)), envDb: wd, rmsOld, rmsNew};
}
const only = process.argv.includes('--only') ? +process.argv[process.argv.indexOf('--only') + 1] : null;
// --case '{"name":"..","set":{"6":1,...},"stoch":false}' (repeatable): run ad-hoc cases instead of the list (for diagnosing a difference)
process.argv.forEach((a, i) => { if (a === '--case') { if (!CASES.adhoc) { CASES.length = 0; CASES.adhoc = true; } CASES.push(JSON.parse(process.argv[i + 1])); } });

function fft(re, im) {                                                  // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
    const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, b = i + k + len / 2, xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
    re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; } }
}
function octaveBands(x, from, to) {                                     // mean power per octave band (dB), Hann-windowed 4096-point segments
  const N = 4096, edges = [100, 200, 400, 800, 1600, 3200, 6400, 12800], P = new Float64Array(N / 2); let cnt = 0;
  for (let s = from; s + N <= to; s += N / 2) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); fft(re, im); for (let k = 0; k < N / 2; k++) P[k] += re[k] ** 2 + im[k] ** 2; cnt++; }
  return edges.slice(0, -1).map((lo, b) => { let e = 0; for (let k = Math.ceil(lo * N / SR); k < edges[b + 1] * N / SR; k++) e += P[k]; return 10 * Math.log10(e / cnt + 1e-30); });
}
function compareStoch(a, b, lag) {
  const from = 3000, to = 19000;                                         // the held part of the note (0.06 .. 0.4 s)
  const ba = octaveBands(a, from, to), bb = octaveBands(b, from + lag, to + lag), band = Math.max(...ba.map((v, i) => Math.abs(v - bb[i])));
  let x = 0, y = 0; for (let i = from; i < to; i++) { x += a[i] ** 2; y += b[i + lag] ** 2; }
  let wd = 0; const W = 2400; for (let st = 2400; st + W <= a.length - 600; st += W) { let u = 0, v = 0; for (let i = st; i < st + W; i++) { u += a[i] ** 2; v += b[i + lag] ** 2; } if (u / W > 1e-6) wd = Math.max(wd, Math.abs(10 * Math.log10((v + 1e-30) / u))); }
  return {lag, corr: NaN, levelDb: 10 * Math.log10(y / x), nmse: NaN, envDb: wd, bandDb: band, bands: ba.map((v, i) => (bb[i] - v).toFixed(1)).join(' '), rmsOld: Math.sqrt(x / (to - from))};
}
let fail = 0; const rows = [];
for (const c of CASES) {
  if (only !== null && CASES.indexOf(c) !== only) continue;
  const [oldL, oldR] = await renderOld(c), [newL, newR] = await renderNew(c);
  compare.fix = c.fixLag ? 0 : undefined;
  const L = c.stoch ? compareStoch(oldL, newL, 0) : compare(oldL, newL), R = c.stoch ? compareStoch(oldR, newR, 0) : compare(oldR, newR);
  const ok = Math.abs(R.levelDb) < 1.0 && (c.stoch ? (L.rmsOld > 1e-4 && Math.abs(L.levelDb) < 1.0 && L.envDb < 1.5 && L.bandDb < 2.0)
                     : (L.rmsOld > 1e-4 && Math.abs(L.levelDb) < 1.0 && L.nmse < (c.nmseTol || -20) && L.envDb < (c.envTol || 1.5)));
  if (!ok) fail++;
  console.log((ok ? 'ok   ' : 'FAIL ') + c.name.padEnd(40) + `lag ${String(L.lag).padStart(4)}  corr ${L.corr.toFixed(4)}  level ${L.levelDb.toFixed(2).padStart(6)} dB  err ${L.nmse.toFixed(1).padStart(6)} dB  env ${L.envDb.toFixed(2)} dB${c.stoch ? '  octave-band diff ' + L.bandDb.toFixed(2) + ' dB [new-old per octave 100..12800 Hz: ' + L.bands + ']' : ''}  (R: err ${R.nmse.toFixed(1)} dB, level ${R.levelDb.toFixed(2)} dB)  rms old ${L.rmsOld.toFixed(4)}`);
  rows.push({c: c.name, L, R});
  if (save) { fs.mkdirSync(save, {recursive: true}); const k = CASES.indexOf(c); fs.writeFileSync(path.join(save, `case${k}.json`), JSON.stringify({name: c.name, SR, oldL, newL})); }
}
await browser.close(); srv.close();
console.log(fail ? fail + ' of ' + CASES.length + ' differ' : 'all passed'); process.exit(fail ? 1 : 0);
