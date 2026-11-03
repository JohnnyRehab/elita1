// probe: native DynamicsCompressorNode behaviour (diagnosis tool). run: node core/tests/probe_comp.mjs
import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module';
import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const {srv, port} = await serve(root);
const browser = await chromium.launch(), page = await browser.newPage();
await page.goto(`http://localhost:${port}/core/tests/blank.html`);
const res = await page.evaluate(async () => {
  const SR = 48000, out = {};
  const run = async (opt, sig, ch = 1) => {
    const n = sig[0].length, ctx = new OfflineAudioContext(ch, n, SR), b = ctx.createBuffer(ch, n, SR);
    sig.forEach((s, c) => b.getChannelData(c).set(s));
    const src = ctx.createBufferSource(); src.buffer = b;
    const c = ctx.createDynamicsCompressor(); ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach(k => { if (opt[k] !== undefined) c[k].value = opt[k]; });
    src.connect(c); c.connect(ctx.destination); src.start();
    const r = await ctx.startRendering(); return Array.from({length: ch}, (_, i) => Array.from(r.getChannelData(i)));
  };
  const sine = (a, f, n) => Array.from({length: n}, (_, i) => a * Math.sin(2 * Math.PI * f * i / SR));
  const lim = {threshold: -2, ratio: 20, attack: 0.003, release: 0.01, knee: 30};
  for (const a of [0.001, 0.05, 0.2, 0.5, 0.8, 1.0, 1.5]) {
    const x = sine(a, 440, 24000), y = (await run(lim, [x]))[0];
    let sx = 0, sy = 0; for (let i = 12000; i < 24000; i++) { sx += x[i] ** 2; sy += y[i] ** 2; }
    out['lim amp ' + a] = (10 * Math.log10(sy / sx)).toFixed(3) + ' dB';
  }
  const comp = {threshold: -20, ratio: 4, attack: 0.01, release: 0.15, knee: 6};
  for (const a of [0.01, 0.1, 0.5]) {
    const x = sine(a, 440, 48000), y = (await run(comp, [x]))[0];
    let sx = 0, sy = 0; for (let i = 24000; i < 48000; i++) { sx += x[i] ** 2; sy += y[i] ** 2; }
    out['comp amp ' + a] = (10 * Math.log10(sy / sx)).toFixed(3) + ' dB';
  }
  { const x = new Array(4800).fill(0); x[2400] = 1; const y = (await run(lim, [x]))[0]; out['impulse delay'] = y.findIndex(v => Math.abs(v) > 0.1) - 2400; out['impulse peak'] = Math.max(...y.map(Math.abs)); }
  return out;
});
console.log(JSON.stringify(res, null, 1)); await browser.close(); srv.close();
