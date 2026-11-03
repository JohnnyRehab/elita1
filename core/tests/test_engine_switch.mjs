// Settings > Sound engine: the default is the core without Tone.js, the switch reloads into the other engine and carries the patch, the choice is saved,
// ?engine= overrides it, and a browser that cannot run the core falls back to Tone.js. (run: node core/tests/test_engine_switch.mjs)
import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module'; import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const {srv, port} = await serve(root);
const browser = await chromium.launch({args: ['--autoplay-policy=no-user-gesture-required']});
let fail = 0; const report = (n, ok, m = '') => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + n.padEnd(54) + m); };
const url = (q = '') => `http://localhost:${port}/index.html${q}`;
async function open(ctx, q = '') {
  const page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url(q)); await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.settings); page.errors = errors; return page;
}
const info = page => page.evaluate(() => ({boot: ELITA_BOOT, tone: typeof window.Tone, core: !!ELITA.engine.core, cur: ELITA.settings.get().engine}));
const peak = page => page.evaluate(() => { const w = ELITA.engine.wave(); if (!w) return -1; let p = 0; for (const x of w.getValue()) p = Math.max(p, Math.abs(x)); return p; });
const play = async page => { await page.evaluate(() => ELITA.engine.start()); await page.waitForTimeout(300); await page.evaluate(() => ELITA.engine.noteOn(60, 0.8)); await page.waitForTimeout(500); const p = await peak(page); await page.evaluate(() => ELITA.engine.noteOff(60)); return p; };

// 1. fresh browser profile: the core is the default and Tone.js is not loaded at all
let ctx = await browser.newContext(); let page = await open(ctx);
let i = await info(page);
report('default engine is the core', i.boot.active === 'core' && i.core && i.cur === 'core', JSON.stringify(i.boot));
report('Tone.js is not loaded with the core', i.tone === 'undefined');
let scripts = await page.evaluate(() => [...document.scripts].map(s => s.src.split('/').pop()));
report('no Tone-based files loaded', !scripts.some(s => ['Tone.js', 'voice.js', 'fx.js', 'worklets.js', 'debug.js'].includes(s)), scripts.length + ' scripts');
report('core plays a note', (await play(page)) > 0.02);
// 2. Settings UI: change a patch value, then switch to Tone.js by clicking the button in the dialog
await page.evaluate(() => { ELITA.setValue(19, 33); ELITA.setValue('vol', 77); });
await page.click('#pset'); await page.waitForSelector('#setdlg[open]');
report('Settings lists the sound engine first', await page.evaluate(() => document.querySelector('#setdlg .it h4').textContent) === 'Sound engine');
report('current engine is highlighted', await page.evaluate(() => document.querySelector('#setdlg .it[data-k="engine"] button.cur').dataset.v) === 'core');
await Promise.all([page.waitForNavigation(), page.click('#setdlg .it[data-k="engine"] button[data-v="tone"]')]);
await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.settings);
i = await info(page);
report('switched to Tone.js after the click', i.boot.active === 'tone' && i.tone === 'object' && !i.core, JSON.stringify(i.boot));
report('patch value carried over (cutoff)', await page.evaluate(() => ELITA.params[19]) === 33);
report('volume carried over', await page.evaluate(() => ELITA.params.vol) === 77);
report('choice saved in localStorage', await page.evaluate(() => JSON.parse(localStorage.getItem('elita1-settings')).engine) === 'tone');
report('Tone.js engine plays a note', (await play(page)) > 0.02);
// 3. a new page view keeps the saved choice
await page.reload(); await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.settings);
report('saved choice survives a reload', (await info(page)).boot.active === 'tone');
// 4. back to the core; the other settings are untouched by the engine switch
await page.evaluate(() => ELITA.settings.set('slop', 2));
await Promise.all([page.waitForNavigation(), page.evaluate(() => ELITA.settings.set('engine', 'core'))]);
await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.settings);
i = await info(page);
report('switched back to the core', i.boot.active === 'core' && i.tone === 'undefined' && i.core);
report('other settings kept (voice variance)', await page.evaluate(() => ELITA.settings.get().slop) === 2);
report('"reset to defaults" does not switch the engine', await page.evaluate(() => { ELITA.settings.set('engine', 'core'); ELITA.settings.reset(); return ELITA.settings.get().engine; }) === 'core' && (await info(page)).boot.active === 'core');
report('core plays a note after the round trip', (await play(page)) > 0.02);
report('no console errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
await ctx.close();
// 5. ?engine= overrides the saved choice for that page view only
ctx = await browser.newContext(); page = await open(ctx, '?engine=tone');
i = await info(page);
report('?engine=tone forces Tone.js', i.boot.active === 'tone' && i.boot.forced === 'tone' && i.tone === 'object');
report('forced engine is not saved', await page.evaluate(() => { ELITA.settings.set('slop', 1); return JSON.parse(localStorage.getItem('elita1-settings')).engine; }) === 'core');
await ctx.close();
// 6. a browser that cannot run the core (no SIMD) falls back to Tone.js and says why
ctx = await browser.newContext(); await ctx.addInitScript(() => { const v = WebAssembly.validate.bind(WebAssembly); WebAssembly.validate = b => (b.length === 31 && b[b.length - 5] === 253 ? false : v(b)); });
page = await open(ctx); i = await info(page);
report('no SIMD: falls back to Tone.js', i.boot.active === 'tone' && i.boot.stored === 'core' && /SIMD/.test(i.boot.reason), i.boot.reason);
await page.click('#pset'); await page.waitForSelector('#setdlg[open]');
report('Settings explains the fallback', /SIMD/.test(await page.evaluate(() => document.querySelector('#setdlg .it[data-k="engine"] .nt').textContent)));
report('fallback engine plays a note', (await play(page)) > 0.02);
await ctx.close();
// 7. the core fails at run time (module cannot be compiled): one automatic reload into Tone.js, patch carried
ctx = await browser.newContext(); await ctx.addInitScript(() => { const c = WebAssembly.compile.bind(WebAssembly); WebAssembly.compile = () => Promise.reject(new Error('forced failure')); });
page = await open(ctx); await page.evaluate(() => { ELITA.setValue(19, 41); });
const nav = page.waitForNavigation().catch(() => null);
await page.evaluate(() => ELITA.engine.start().catch(() => {})); await nav; await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.settings);
i = await info(page);
report('run-time failure: reloads into Tone.js', i.boot.active === 'tone' && /failed to start/.test(i.boot.reason), i.boot.reason);
report('run-time failure: patch carried over', await page.evaluate(() => ELITA.params[19]) === 41);
report('run-time failure: saved choice kept', await page.evaluate(() => JSON.parse(localStorage.getItem('elita1-settings') || '{}').engine) !== 'tone');
await ctx.close();
await browser.close(); srv.close(); console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
