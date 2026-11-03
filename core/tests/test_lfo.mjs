// LFO: the shapes against the LFO of the Tone engine (Tone.LFO through ELITA.core.lfoOut), the random LFOs by their statistics, and the key sync.
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module'; import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SR = 48000, CH = 16, N = 48000;
const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'js/core/elita_core.wasm')), {});
const e = instance.exports; e.ec_init(SR);
const core = (ty, hz, n, mode = 0) => { e.ec_dbg_lfo(ty, hz, n, mode); return Array.from(new Float32Array(e.memory.buffer, e.ec_dbg_buf(), n)); };
const {srv, port} = await serve(root), browser = await chromium.launch();
let fail = 0;
const check = (name, ok, info) => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(46) + info); };
for (const [ty, name] of [[0, 'saw'], [1, 'triangle'], [2, 'square'], [5, 'sine']]) for (const sp of [10, 64, 110, 127]) {
  const page = await browser.newPage(); await page.goto(`http://localhost:${port}/index.html?engine=tone`); await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.core && ELITA.core.Voice);
  const old = await page.evaluate(async ({ty, sp, N}) => {
    const b = await Tone.Offline(async () => { await ELITA.engine.start(); ELITA.setValue(42, ty); ELITA.setValue(43, sp); await new Promise(r => setTimeout(r, 50)); ELITA.core.lfoOut[0].connect(Tone.getDestination()); }, 1, 1, 48000);
    return {x: Array.from(b.getChannelData(0)), hz: ELITA.core.lfoSpd(sp)};
  }, {ty, sp, N});
  await page.close();
  const mine = core(ty, old.hz, N / CH), x = old.x.filter((_, i) => i % CH === 0);
  // the saw / square jump: compare away from the edges (the bandlimited edge rings in Chromium and is ideal here)
  const per = SR / old.hz / CH; let worst = 0, se = 0, n = 0;
  for (let i = 0; i < mine.length; i++) {
    const ph = (i % per) / per, edge = ty === 0 ? Math.min(Math.abs(ph - 0.5), ph, 1 - ph) < 2 / per + 0.02 : ty === 2 ? Math.min(ph, Math.abs(ph - 0.5), 1 - ph) < 2 / per + 0.02 : false;
    if (edge) continue; const d = Math.abs(mine[i] - x[i]); worst = Math.max(worst, d); se += d * d; n++;
  }
  check(`LFO ${name} at ${old.hz.toFixed(2)} Hz`, worst < 0.035 && n > 100, `max diff ${worst.toFixed(4)}  rms ${Math.sqrt(se / n).toFixed(4)}  (${n} points)`);
}
// random LFOs: S&H holds a uniform value for one period, the smoothed one glides
{
  const hz = 4, per = SR / hz / CH, v = core(3, hz, 40000);
  const steps = []; for (let i = 1; i < v.length; i++) if (v[i] !== v[i - 1]) steps.push(i);
  const gaps = steps.slice(1).map((s, i) => s - steps[i]), mean = v.reduce((a, b) => a + b) / v.length, mx = Math.max(...v), mn = Math.min(...v);
  check('S&H: new value every 1 / hz', gaps.every(g => Math.abs(g - per) <= 1.01) && gaps.length > 20, `period ${per} chunks, gaps ${Math.min(...gaps)}..${Math.max(...gaps)}`);
  check('S&H: values uniform in -1..1', Math.abs(mean) < 0.25 && mx > 0.7 && mn < -0.7 && mx <= 1 && mn >= -1, `mean ${mean.toFixed(3)} range ${mn.toFixed(2)}..${mx.toFixed(2)}`);
  const s = core(4, hz, 40000); let jump = 0; for (let i = 1; i < s.length; i++) jump = Math.max(jump, Math.abs(s[i] - s[i - 1]));
  check('smooth random: glides, no steps', jump < 2 / per * 1.01 + 1e-6 && Math.max(...s) > 0.5 && Math.min(...s) < -0.5, `max step per chunk ${jump.toFixed(4)} (<= ${(2 / per).toFixed(4)})`);
}
// key sync: a periodic LFO restarts at phase 0
{
  const hz = 5, v = core(1, hz, 60, 1), ref = core(1, hz, 60, 0);
  check('key sync restarts the phase', Math.abs(v[3]) < 1e-9 + Math.abs(ref[0]) && Math.abs(v[4] - ref[1]) < 1e-6 && Math.abs(v[6] - ref[3]) < 1e-6 && Math.abs(v[3] - ref[3]) > 1e-4, `after: ${v.slice(3, 7).map(x => x.toFixed(4)).join(' ')}  expected: ${ref.slice(0, 4).map(x => x.toFixed(4)).join(' ')}`);
}
await browser.close(); srv.close();
console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
