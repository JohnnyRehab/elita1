// Settings > DSP flavor: Filter = OpenSynth1 (cfg 12). Plays notes through the Wasm core and checks the filter behaves (node, no browser needed).
// run: node core/tests/test_os1_filter.mjs
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), SR = 48000;
const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'js/core/elita_core.wasm')), {}), e = instance.exports;
const mem = () => new Float32Array(e.memory.buffer);
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
// render `secs` seconds of one held note (saw, mix 0 = OSC1 only, filter envelope off) and return the left channel + a spectrum helper
function play({os1, type, cut, res, sat = 0, note = 48, secs = 0.5, w1 = 1, w2 = 1, mix = 0, trk = 0, lfo = 0}) {
  e.ec_init(SR); e.ec_set_cfg(0, 1); e.ec_set_cfg(12, os1 ? 1 : 0);
  const set = {0: w1, 1: w2, 5: mix, 14: type, 19: cut, 20: res, 23: sat, 21: 64, 22: trk, 24: 0, 25: 0, 27: 127, 29: 100, 30: 0, 17: 127};
  if (lfo) Object.assign(set, {57: 1, 42: 1, 41: 3, 43: 60, 44: lfo});   // LFO 1 (triangle, 60) -> cutoff
  Object.entries(set).forEach(([k, v]) => e.ec_set_param(+k, v)); e.ec_set_param(99, 100);
  e.ec_voice_down(0, note, 0.8, 0, 1);
  const out = []; for (let b = 0; b < Math.round(secs * SR / 128); b++) { e.ec_process(128); const m = mem(), p = e.ec_out_l() >> 2; for (let i = 0; i < 128; i++) out.push(m[p + i]); }
  return Float64Array.from(out);
}
const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length), tail = a => a.slice(a.length >> 1);
const band = (a, f0, f1) => { const x = tail(a), N = 4096, w = x.slice(0, N); let sum = 0;   // energy between f0 and f1 Hz by a plain DFT over a Hann window
  for (let k = Math.floor(f0 / SR * N); k <= Math.ceil(f1 / SR * N); k++) { let re = 0, im = 0; for (let n = 0; n < N; n++) { const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N), v = w[n] * h; re += v * Math.cos(2 * Math.PI * k * n / N); im -= v * Math.sin(2 * Math.PI * k * n / N); } sum += re * re + im * im; }
  return sum; };
const TYPES = ['LP12', 'LP24', 'HP12', 'BP12', 'LPDL'];
// 1. every type, several cutoffs and resonances: finite, not silent, no runaway
for (let t = 0; t < 5; t++) for (const [cut, res] of [[30, 0], [64, 40], [100, 90], [127, 127]]) {
  const y = play({os1: 1, type: t, cut, res}); const r = rms(tail(y)), pk = Math.max(...y.map(Math.abs));
  ok(y.every(Number.isFinite) && r > 1e-4 && pk < 4, `${TYPES[t]} cut ${cut} res ${res}: rms ${r.toFixed(4)} peak ${pk.toFixed(3)}`);
}
// 2. the cutoff does something: for the low-pass types the high band falls as the cutoff goes down; for HP the low band does
for (const t of [0, 1, 4]) { const lo = band(play({os1: 1, type: t, cut: 40, res: 0}), 4000, 8000), hi = band(play({os1: 1, type: t, cut: 110, res: 0}), 4000, 8000);
  ok(lo < hi * 0.1, `${TYPES[t]}: 4-8 kHz energy ${(10 * Math.log10(lo / hi)).toFixed(1)} dB lower at cutoff 40 than at 110`); }
{ const a = band(play({os1: 1, type: 2, cut: 110, res: 0}), 100, 400), b = band(play({os1: 1, type: 2, cut: 40, res: 0}), 100, 400);
  ok(a < b * 0.1, `HP12: 100-400 Hz energy ${(10 * Math.log10(a / b)).toFixed(1)} dB lower at cutoff 110 than at 40`); }
// 3. the setting really switches the filter (output differs from the default) and switching back restores it bit for bit
const base = play({os1: 0, type: 1, cut: 70, res: 30}), alt = play({os1: 1, type: 1, cut: 70, res: 30}), again = play({os1: 0, type: 1, cut: 70, res: 30});
ok(base.some((v, i) => Math.abs(v - alt[i]) > 1e-3), 'OpenSynth1 filter output differs from the ELITA filter');
ok(base.every((v, i) => v === again[i]), 'with the setting off the output is identical to before (default sound unchanged)');
// 4. saturation (#23) works in OS1 mode and stays bounded
{ const clean = rms(tail(play({os1: 1, type: 1, cut: 80, res: 40, sat: 0}))), hot = play({os1: 1, type: 1, cut: 80, res: 40, sat: 127});
  ok(hot.every(Number.isFinite) && Math.abs(rms(tail(hot)) - clean) > 1e-4, 'saturation changes the level and stays finite'); }
// 5. toggling while a note sounds: no NaN, no silence
{ e.ec_init(SR); e.ec_set_cfg(0, 1); Object.entries({0: 1, 1: 1, 5: 0, 14: 4, 19: 90, 20: 60, 25: 0, 27: 127, 29: 100, 17: 127}).forEach(([k, v]) => e.ec_set_param(+k, v)); e.ec_set_param(99, 100);
  e.ec_voice_down(0, 48, 0.8, 0, 1); let good = true, pk = 0;
  for (let b = 0; b < 600; b++) { if (b % 50 === 0) e.ec_set_cfg(12, (b / 50) & 1); e.ec_process(128); const m = mem(), p = e.ec_out_l() >> 2; for (let i = 0; i < 128; i++) { if (!Number.isFinite(m[p + i])) good = false; if (b > 20) pk = Math.max(pk, Math.abs(m[p + i])); } }
  ok(good && pk > 0.01, `toggling the filter 12 times while a note holds: finite, peak ${pk.toFixed(3)}`); }
// 6. no DC latch (found in review of v0.5.7b): with the cutoff pushed high by #19, key track and the LFO, the state-variable filter used to settle on a constant level (LP12 +0.64, HP12 / BP12 -0.69, AC almost 0).
//    HP12 / BP12 must not pass DC (a small residual of up to about 0.03 is the filter's own asymmetry at the top of its range: the original code alone leaves 0.007 to 0.019 for a saw at 16 kHz; the latch was 0.6 to 0.7);
//    LP12 must carry the same DC as the input does (compared with the ELITA filter).
{ const mean = a => { const t = a.slice(a.length >> 1); return t.reduce((s, x) => s + x, 0) / t.length; }; let n = 0; const bad = [];
  for (const t of [0, 2, 3]) for (const note of [72, 84, 96, 108]) for (const [w1, w2, mix] of [[1, 1, 0], [0, 2, 64], [2, 2, 127]]) for (const trk of [64, 127]) for (const lfo of [0, 40]) {
    n++; const o = mean(play({os1: 1, type: t, cut: 127, res: 0, note, w1, w2, mix, trk, lfo, secs: 0.3}));
    const ref = t === 0 ? mean(play({os1: 0, type: t, cut: 127, res: 0, note, w1, w2, mix, trk, lfo, secs: 0.3})) : 0;
    if (Math.abs(o - ref) > 0.05) bad.push(`${TYPES[t]} note ${note} wave ${w1}/${w2} mix ${mix} trk ${trk} lfo ${lfo}: DC ${o.toFixed(3)} (expected ${ref.toFixed(3)})`); }
  ok(bad.length === 0, `no DC latch in ${n} high-cutoff conditions (key track, LFO, pulse / sine / saw)` + (bad.length ? ': ' + bad.slice(0, 3).join('; ') : '')); }
{ const y = play({os1: 1, type: 0, cut: 127, res: 0, trk: 64, note: 84}), t = y.slice(y.length >> 1), m = t.reduce((s, x) => s + x, 0) / t.length, ac = Math.sqrt(t.reduce((s, x) => s + (x - m) ** 2, 0) / t.length);
  ok(Math.abs(m) < 0.02 && ac > 0.03, `reported case LP12, #19 127, #22 64, note 84: DC ${m.toFixed(4)}, AC ${ac.toFixed(4)}`); }
console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
