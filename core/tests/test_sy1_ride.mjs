// Patch "98 Free Ride FX" (triangle OSC2 + unison + LFO1 -> filter): LFO destination 0/1-based on load / export, unison level and note-on cancellation (core engine as the app runs it).
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module'; import {serve} from './serve.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..', '..'), require = createRequire(import.meta.url), {chromium} = require('playwright');
const txt = fs.readFileSync(path.join(here, 'patches', 'free_ride_fx.sy1'), 'utf8');
const {srv, port} = await serve(root), browser = await chromium.launch({args: ['--autoplay-policy=no-user-gesture-required']}), page = await browser.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://localhost:${port}/index.html?engine=core`); await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.engine.core);
await page.evaluate(() => ELITA.engine.start()); await page.waitForTimeout(400);
let fail = 0; const report = (n, ok, m = '') => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + n.padEnd(54) + m); };
await page.evaluate(t => ELITA.loadSy1(t), txt);
report('file #41=2 (filter) -> panel 3 (filter)', await page.evaluate(() => ELITA.params[41]) === 3);
const out = await page.evaluate(() => ELITA.exportSy1('x')); report('export writes #41 back as 2', /\n41,2\r?\n/.test(out) && /\n46,\d+/.test(out), (out.match(/\n(41|46),\d+/g) || []).join(' ').replace(/\s+/g, ' '));
const def = await page.evaluate(() => { ELITA.loadSy1('Init\r\ncolor=default\r\nver=113\r\n'); return [ELITA.params[41], ELITA.params[46]]; });
report('panel defaults unchanged (2 / 3 = Synth1 raw 1 / 2)', def[0] === 2 && def[1] === 3, def.join(' / '));
const peak = async (sets, ms = 1500) => { await page.evaluate(([t, s]) => { ELITA.engine.allOff(); ELITA.loadSy1(t); for (const k in s) ELITA.setValue(+k, s[k]); }, [txt, sets]); await page.waitForTimeout(400);
  await page.evaluate(() => ELITA.engine.noteOn(60, 0.8)); const w = []; let m = 0, early = 0;
  for (let i = 0; i < ms / 50; i++) { await page.waitForTimeout(50); const v = await page.evaluate(() => { const l = ELITA.engine.levels(); return Math.max(l.l, l.r); }); m = Math.max(m, v); if (i < 3) early = Math.max(early, v); }
  await page.evaluate(() => ELITA.engine.noteOff(60)); await page.waitForTimeout(800); return {m, early}; };
const base = {57: 0, 59: 0, 19: 127, 21: 64, 27: 127, 31: 2, 65: 0, 66: 0, 29: 100};            // LFO off, arpeggiator off, filter open, sustain full, no delay / chorus
const off = await peak({...base, 73: 0}), on0 = await peak({...base, 73: 1, 75: 0}), on = await peak({...base, 73: 1}, 3000);   // detune 0 and the patch's own detune 22
console.log('unison off', off.m.toFixed(3), 'early', off.early.toFixed(3), '| on, detune 0', on0.m.toFixed(3), 'early', on0.early.toFixed(3), '| on, detune 22', on.m.toFixed(3));
report('unison on (detune 0) is not cancelled at note-on', on0.early > 0.3 * off.early);
report('unison on (detune 22) / off level within 3 dB', Math.abs(20 * Math.log10(on.m / off.m)) < 3, (20 * Math.log10(on.m / off.m)).toFixed(1) + ' dB');
report('no page errors', errors.length === 0, errors.join(' | '));
await browser.close(); srv.close(); console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
