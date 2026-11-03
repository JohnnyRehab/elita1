// CPU cost, Tone.js engine vs Wasm core, measured the same way in Chromium: an OfflineAudioContext renders N held voices; the render time of a long and a short
// run are subtracted, so the set-up cost (building the node graph / loading the module) drops out. Result = CPU share of a real-time stream.
// run: node core/tests/bench_ab.mjs
import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module'; import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SR = 48000;
const SCEN = [
  {name: '1 voice, default', n: 1, uni: 1, d: [1, 4]}, {name: '5 voices (ELITA limit), default', n: 5, uni: 1, d: [1, 4]}, {name: '5 voices, unison 3', n: 5, uni: 3, d: [1, 4]},
  {name: '16 voices, unison 4', n: 16, uni: 4, d: [0.5, 2]}, {name: '32 voices, unison 8 (Synth1 max)', n: 32, uni: 8, d: [0.5, 1.5]},
];
const SET = {19: 90, 20: 60, 21: 70, 27: 127, 17: 127, 5: 64, 75: 70, 29: 100, 1: 1};
const {srv, port} = await serve(root);
const browser = await chromium.launch({args: ['--autoplay-policy=no-user-gesture-required']});
const run = async (engine, s, dur) => {
  const page = await browser.newPage(); await page.goto(`http://localhost:${port}/index.html` + '?engine=' + (engine === 'core' ? 'core' : 'tone'));
  await page.waitForFunction(() => window.ELITA && ELITA.engine && (ELITA.core.Voice || ELITA.engine.core));
  const ms = await page.evaluate(async ({engine, s, dur, SR, SET}) => {
    const set = Object.assign({}, SET, {73: s.uni > 1 ? 1 : 0, 93: s.uni, 94: s.n});
    const prep = () => { if (s.n > 5 || s.uni > 3) ELITA.core.LIMITS = 'synth1'; Object.entries(set).forEach(([k, v]) => ELITA.setValue(+k, v)); };
    if (engine === 'old') {
      const t0 = performance.now();
      await Tone.Offline(async () => {
        await ELITA.engine.start(); prep(); await new Promise(r => setTimeout(r, 80));
        for (let i = 0; i < s.n; i++) ELITA.core.voices[i].down(36 + (i * 5) % 48, 0.8);
      }, dur, 2, SR);
      return performance.now() - t0;
    }
    prep(); ELITA.engine.refresh();
    const ctx = new OfflineAudioContext(2, Math.round(dur * SR), SR), ev = [];
    for (let i = 0; i < s.n; i++) ev.push({k: 'on', i, n: 36 + (i * 5) % 48, vel: 0.8, g: 0, r: 1, t: 0});
    const t0 = performance.now(); await ELITA.engine.core.attach(ctx, null, ev); await ctx.startRendering();
    return performance.now() - t0;
  }, {engine, s, dur, SR, SET});
  await page.close(); return ms;
};
const best = async (engine, s, dur, k = 2) => { let m = Infinity; for (let i = 0; i < k; i++) m = Math.min(m, await run(engine, s, dur)); return m; };
console.log('CPU share of one core for a real-time stream (render-time slope), lower is better\n');
console.log('scenario'.padEnd(40) + 'Tone.js engine'.padEnd(20) + 'Wasm core'.padEnd(20) + 'ratio');
for (const s of SCEN) {
  const r = {};
  for (const eng of ['old', 'core']) { const a = await best(eng, s, s.d[0]), b = await best(eng, s, s.d[1]); r[eng] = {pct: (b - a) / 1000 / (s.d[1] - s.d[0]) * 100, setup: a - (b - a) * s.d[0] / (s.d[1] - s.d[0])}; }
  const f = x => (x.pct.toFixed(1) + ' %').padEnd(10) + ('(setup ' + Math.max(0, x.setup).toFixed(0) + ' ms)').padEnd(10);
  console.log(s.name.padEnd(40) + f(r.old).padEnd(20) + f(r.core).padEnd(20) + (r.old.pct / Math.max(r.core.pct, 0.01)).toFixed(1) + 'x');
}
await browser.close(); srv.close();
