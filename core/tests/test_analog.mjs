// Analog character: slow drift statistics (pitch of a held sine over 60 s) and the exact bypass when it is off. Slop is checked sample by sample in test_ab.mjs.
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SR = 48000;
const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'js/core/elita_core.wasm')), {});
const e = instance.exports; let fail = 0;
const check = (name, ok, info) => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(46) + info); };
function run(drift, seconds, voices = 1) {
  e.ec_init(SR); e.ec_set_cfg(0, 5);
  const set = (i, v) => e.ec_set_param(i, v);
  set(0, 0); set(5, 0); set(1, 1); set(95, 0); set(19, 127); set(20, 0); set(14, 0); set(27, 127); set(25, 0); set(29, 127); set(99, 127); set(72, 64);   // sine OSC1, filter open, full sustain
  e.ec_set_cfg(7, drift);
  e.ec_voice_down(0, 57, 0.8, 0, 1);      // A3 = 220 Hz
  const blocks = Math.floor(seconds * SR / 128), L = new Float32Array(e.memory.buffer, e.ec_out_l(), 128);
  const out = new Float32Array(blocks * 128);
  for (let b = 0; b < blocks; b++) { e.ec_process(128); out.set(L, b * 128); }
  return out;
}
// pitch per 100 ms window from the zero crossings (rising), in cents against 220 Hz
function windows(x) {
  const W = SR / 10, res = [];
  for (let s = 0; s + W <= x.length; s += W) {
    const z = []; for (let i = s + 1; i < s + W; i++) if (x[i - 1] < 0 && x[i] >= 0) z.push(i - 1 + -x[i - 1] / (x[i] - x[i - 1]));
    if (z.length > 5) res.push(1200 * Math.log2((z.length - 1) * SR / (z[z.length - 1] - z[0]) / 220));
  }
  return res;
}
const base = windows(run(0, 6)).slice(5);
check('drift off: pitch constant', Math.max(...base) - Math.min(...base) < 1.0, `spread ${(Math.max(...base) - Math.min(...base)).toFixed(3)} cents (measuring resolution)`);
for (const dr of [2, 8]) {
  const w = windows(run(dr, 120)).slice(30), m = w.reduce((a, b) => a + b) / w.length, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length);
  const exp = dr * 0.24 * 2.06;                      // AR(1): innovation uniform +-g, pole 0.96  ->  sd = g / sqrt(3) / sqrt(1 - 0.96^2)
  check(`drift ${dr}: pitch wander rms`, sd > exp * 0.6 && sd < exp * 1.5 && Math.abs(m) < exp, `sd ${sd.toFixed(2)} cents (expected about ${exp.toFixed(2)}), mean ${m.toFixed(2)}`);
}
console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
