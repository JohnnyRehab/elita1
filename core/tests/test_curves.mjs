// Compares the C++ math library and the calibration curves with js/calib.js / Math.* (run: node core/tests/test_curves.mjs)
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import {fileURLToPath} from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..', '..');
const ctx = {window: {ELITA: {}}, Math}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, 'js/calib.js'), 'utf8'), ctx);
const S = ctx.window.ELITA.core;
const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'js/core/elita_core.wasm')), {});
const e = instance.exports; e.ec_init(48000);
let fail = 0;
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
function check(name, f, g, xs, tol) {
  let worst = 0, wx = 0;
  for (const x of xs) { const r = Math.abs(g(x)) < 1e-9 ? Math.abs(f(x) - g(x)) : rel(f(x), g(x)); if (r > worst) { worst = r; wx = x; } }
  const ok = worst <= tol; if (!ok) fail++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(22) + 'worst rel err ' + worst.toExponential(2) + ' at x=' + wx);
}
const lin = (a, b, n) => Array.from({length: n + 1}, (_, i) => a + (b - a) * i / n);
check('exp',  x => e.ec_dbg_curve(8, x),  Math.exp, lin(-20, 20, 400), 1e-9);
check('log',  x => e.ec_dbg_curve(9, x),  Math.log, lin(0.001, 1000, 400), 1e-9);
check('sin',  x => e.ec_dbg_curve(10, x), Math.sin, lin(-50, 50, 1000), 1e-9);
check('tanh', x => e.ec_dbg_curve(11, x), Math.tanh, lin(-9, 9, 400), 1e-9);
check('pow(2.7,x)', x => e.ec_dbg_curve(12, x), x => Math.pow(2.7, x), lin(-30, 30, 400), 1e-9);
const v127 = lin(0, 127, 254);
check('cutoff (table)', x => e.ec_dbg_curve(0, x), x => { S.CUT_SMOOTH = false; return S.cutoff(x); }, v127, 1e-9);
check('cutoff (pchip)', x => e.ec_dbg_curve(1, x), x => { S.CUT_SMOOTH = true; return S.cutoff(x); }, v127, 1e-8);
check('gainCurve',  x => e.ec_dbg_curve(2, x), S.gainCurve, v127, 1e-9);
check('time',       x => e.ec_dbg_curve(3, x), S.time, v127, 1e-9);
check('tEnv',       x => e.ec_dbg_curve(4, x), S.tEnv, v127, 1e-9);
check('T60',        x => e.ec_dbg_curve(5, x), S.T60, v127, 1e-9);
check('ktSlope below', x => e.ec_dbg_curve(6, x), x => S.KT_SLOPE(x, false), v127, 1e-9);
check('ktSlope above', x => e.ec_dbg_curve(7, x), x => S.KT_SLOPE(x, true), v127, 1e-9);
console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
