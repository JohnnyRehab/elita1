// CPU cost of the OpenSynth1 filter (cfg 12) next to the ELITA filter, Wasm core alone (node). run: node core/tests/bench_os1.mjs [sampleRate]
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), SR = +process.argv[2] || 48000;
const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'js/core/elita_core.wasm')), {}), e = instance.exports;
const budgetMs = 128 / SR * 1000, TYPES = ['LP12', 'LP24', 'HP12', 'BP12', 'LPDL'];
const best = (f, k = 5) => { let m = Infinity; for (let i = 0; i < k; i++) m = Math.min(m, f()); return m; };
function run(n, uni, type, os1) {
  e.ec_init(SR); e.ec_set_cfg(0, n); e.ec_set_cfg(1, 8); e.ec_set_cfg(12, os1 ? 1 : 0);
  Object.entries({85: 24, 19: 90, 20: 60, 21: 70, 27: 127, 17: 127, 5: 64, 73: uni > 1 ? 1 : 0, 93: uni, 75: 70, 29: 100, 1: 1, 14: type}).forEach(([k, v]) => e.ec_set_param(+k, v)); e.ec_set_param(99, 100);
  for (let i = 0; i < n; i++) e.ec_voice_down(i, 36 + (i * 5) % 48, 0.8, 0, 1);
  for (let b = 0; b < 300; b++) e.ec_process(128);
  return best(() => { const t = performance.now(); for (let b = 0; b < 1500; b++) e.ec_process(128); return (performance.now() - t) / 1500; }) / budgetMs * 100;
}
console.log(`sample rate ${SR} Hz; % of one core (lower is better)\n`);
console.log('voices x unison'.padEnd(18) + 'filter'.padEnd(8) + 'ELITA'.padStart(9) + 'OpenSynth1'.padStart(12) + 'ratio'.padStart(8));
for (const [n, u] of [[5, 1], [16, 4], [32, 8]]) for (const t of [0, 1, 4]) { const a = run(n, u, t, 0), b = run(n, u, t, 1); console.log(`${n} x ${u}`.padEnd(18) + TYPES[t].padEnd(8) + a.toFixed(1).padStart(9) + b.toFixed(1).padStart(12) + (b / a).toFixed(2).padStart(8)); }
