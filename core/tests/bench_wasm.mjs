// CPU cost of the Wasm core alone (Node / V8, the same JIT as Chrome): time per 128-frame block with N voices held, as a share of the real-time budget.
// run: node core/tests/bench_wasm.mjs [sampleRate]
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), SR = +process.argv[2] || 48000;
const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'js/core/elita_core.wasm')), {}), e = instance.exports;
const budgetMs = 128 / SR * 1000;
const SCEN = [
  {name: '1 voice, default saw', n: 1, uni: 1}, {name: '5 voices (ELITA limit), default', n: 5, uni: 1}, {name: '5 voices, unison 3', n: 5, uni: 3},
  {name: '16 voices, unison 4', n: 16, uni: 4}, {name: '16 voices, unison 8', n: 16, uni: 8}, {name: '32 voices, unison 8 (Synth1 max)', n: 32, uni: 8},
  {name: '32 voices, unison 8, pulse+saw, LP24 res', n: 32, uni: 8, pulse: true},
  {name: '32 voices, unison 8 + all effects (ph.4, chorus x3, delay)', n: 32, uni: 8, fx: true},
  {name: '1 voice, all effects only', n: 1, uni: 1, fx: true},
];
const best = (f, k = 5) => { let m = Infinity; for (let i = 0; i < k; i++) m = Math.min(m, f()); return m; };
console.log(`sample rate ${SR} Hz, block 128 frames = ${budgetMs.toFixed(3)} ms of real time\n`);
for (const s of SCEN) {
  e.ec_init(SR); e.ec_set_cfg(0, s.n); e.ec_set_cfg(1, 8);
  const set = {85: 24, 19: 90, 20: 60, 21: 70, 27: 127, 17: 127, 5: 64, 73: s.uni > 1 ? 1 : 0, 93: s.uni, 75: 70, 29: 100, 1: s.pulse ? 2 : 1, 8: 60};
  if (s.fx) Object.assign(set, {77: 1, 78: 9, 79: 100, 80: 60, 81: 100, 66: 1, 56: 80, 52: 60, 53: 90, 54: 50, 64: 3, 65: 1, 37: 80, 35: 8, 36: 70});   // effect section (ph.4), chorus x3, stereo delay
  Object.entries(set).forEach(([k, v]) => e.ec_set_param(+k, v)); e.ec_set_param(99, 100);
  for (let i = 0; i < s.n; i++) e.ec_voice_down(i, 36 + (i * 5) % 48, 0.8, 0, 1);
  for (let b = 0; b < 400; b++) e.ec_process(128);                                   // JIT warm-up and settle
  const blocks = 3000, ms = best(() => { const t = performance.now(); for (let b = 0; b < blocks; b++) e.ec_process(128); return (performance.now() - t) / blocks; });
  const act = e.ec_active_voices();
  console.log(`${s.name.padEnd(44)} ${ms.toFixed(4)} ms/block  = ${(ms / budgetMs * 100).toFixed(2).padStart(6)} % of one core   (${(budgetMs / ms).toFixed(0)}x real time, ${act} voices sounding)`);
}
