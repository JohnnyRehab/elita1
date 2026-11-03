import path from 'path'; import {createRequire} from 'module';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
import {serve} from './serve.mjs';
const {srv, port} = await serve(new URL('../..', import.meta.url).pathname);
const b = await chromium.launch(), page = await b.newPage(); await page.goto(`http://localhost:${port}/core/tests/blank.html`);
const r = await page.evaluate(async () => {
  const out = {};
  for (const [name, dt, viaTone] of [['delay 4.8 smp in loop', 0.0001, false], ['delay 200 smp in loop', 200 / 48000, false], ['delay 128 in loop', 128 / 48000, false]]) {
    const ctx = new OfflineAudioContext(1, 2000, 48000), buf = ctx.createBuffer(1, 2000, 48000); buf.getChannelData(0)[10] = 1;
    const src = ctx.createBufferSource(); src.buffer = buf; const d = ctx.createDelay(1); d.delayTime.value = dt; const g = ctx.createGain(); g.gain.value = 0.5;
    src.connect(d); d.connect(g); g.connect(d); d.connect(ctx.destination); src.start();
    const o = (await ctx.startRendering()).getChannelData(0); const peaks = []; for (let i = 0; i < o.length; i++) if (Math.abs(o[i]) > 0.01) peaks.push([i, +o[i].toFixed(3)]);
    out[name] = peaks.slice(0, 6);
  }
  return out;
});
console.log(JSON.stringify(r)); await b.close(); srv.close();
