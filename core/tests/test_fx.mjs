// Verifies the C++ effect blocks against the real Web Audio nodes in Chromium (run: node core/tests/test_fx.mjs)
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module';
import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..', '..');
const SR = 48000;
const {instance} = await WebAssembly.instantiate(fs.readFileSync(path.join(root, 'js/core/elita_core.wasm')), {});
const e = instance.exports; e.ec_init(SR);
const dbg = n => new Float32Array(e.memory.buffer, e.ec_dbg_buf(), n);
const {srv, port} = await serve(root);
const browser = await chromium.launch(), page = await browser.newPage();
await page.goto(`http://localhost:${port}/core/tests/blank.html`);
let fail = 0;
const report = (ok, name, info) => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(46) + info); };
const rms = x => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const diffDb = (a, b, from = 0) => { let e2 = 0, s2 = 0; for (let i = from; i < a.length; i++) { e2 += (a[i] - b[i]) ** 2; s2 += a[i] ** 2; } return 10 * Math.log10((e2 + 1e-30) / (s2 + 1e-30)); };

// ---- DynamicsCompressorNode ----
let seed = 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1;
const N = 24000;
const sig = {
  'sine 0.05 -> 0.9 -> 0.05': () => { const l = Array.from({length: N}, (_, i) => (i < 6000 ? 0.05 : i < 14000 ? 0.9 : 0.05) * Math.sin(2 * Math.PI * 440 * i / SR)); return [l, l.slice()]; },
  'noise bursts': () => { const l = Array.from({length: N}, (_, i) => (i % 8000 < 3000 ? 0.7 : 0.02) * rnd()); return [l, l.slice()]; },
  'stereo: L loud, R quiet': () => { const l = Array.from({length: N}, (_, i) => (i > 3000 && i < 15000 ? 0.9 : 0.1) * Math.sin(2 * Math.PI * 330 * i / SR)); const r = Array.from({length: N}, (_, i) => 0.05 * Math.sin(2 * Math.PI * 523 * i / SR)); return [l, r]; },
  'stereo: L quiet, R loud': () => { const r = Array.from({length: N}, (_, i) => (i > 3000 && i < 15000 ? 0.9 : 0.1) * Math.sin(2 * Math.PI * 330 * i / SR)); const l = Array.from({length: N}, (_, i) => 0.05 * Math.sin(2 * Math.PI * 523 * i / SR)); return [l, r]; },
};
const CFG = {
  'limiter  (-2 dB, 20:1, 3 / 10 ms, knee 30)': {threshold: -2, ratio: 20, attack: 0.003, release: 0.01, knee: 30},
  'comp deep (-44 dB, 15.5:1, 100 ms attack)': {threshold: -44, ratio: 15.5, attack: 0.1, release: 0.15, knee: 6},
  'comp mild (-12 dB, 4:1, 10 ms attack)': {threshold: -12, ratio: 4, attack: 0.01, release: 0.15, knee: 6},
};
const native = (opt, [l, r]) => page.evaluate(async ({opt, l, r, SR}) => {
  const ctx = new OfflineAudioContext(2, l.length, SR), b = ctx.createBuffer(2, l.length, SR);
  b.getChannelData(0).set(l); b.getChannelData(1).set(r);
  const src = ctx.createBufferSource(); src.buffer = b;
  const c = ctx.createDynamicsCompressor(); Object.keys(opt).forEach(k => { c[k].value = opt[k]; });
  src.connect(c); c.connect(ctx.destination); src.start();
  const o = await ctx.startRendering(); return [Array.from(o.getChannelData(0)), Array.from(o.getChannelData(1))];
}, {opt, l, r, SR});
for (const [cn, opt] of Object.entries(CFG)) for (const [sn, mk] of Object.entries(sig)) {
  const [l, r] = mk(), [nl, nr] = await native(opt, [l, r]);
  const d = dbg(2 * N); d.set(l, 0); d.set(r, N);
  e.ec_dbg_comp(N, opt.threshold, opt.knee, opt.ratio, opt.attack, opt.release, 0.006);
  const ml = Array.from(dbg(2 * N).slice(0, N)), mr = Array.from(dbg(2 * N).slice(N, 2 * N));
  const dl = diffDb(nl, ml), dr = diffDb(nr, mr);
  report(dl < -50 && dr < -50, cn.slice(0, 12) + ' / ' + sn, `L ${dl.toFixed(1)} dB  R ${dr.toFixed(1)} dB  (rms native ${rms(nl).toFixed(4)})`);
}
await browser.close(); srv.close();
console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
