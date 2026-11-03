// Smoke test of the real page in ?engine=core: no console errors, a key press makes sound on the scope, release goes silent, UI changes reach the core.
import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module'; import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const {srv, port} = await serve(root);
const browser = await chromium.launch({args: ['--autoplay-policy=no-user-gesture-required']}), page = await browser.newPage();
const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(`http://localhost:${port}/index.html?engine=core`);
await page.waitForFunction(() => window.ELITA && ELITA.engine && ELITA.engine.core);
let fail = 0; const report = (n, ok, m = '') => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + n.padEnd(44) + m); };
const peak = () => page.evaluate(() => { const w = ELITA.engine.wave(); if (!w) return -1; const d = w.getValue(); let p = 0; for (const x of d) p = Math.max(p, Math.abs(x)); return p; });
await page.evaluate(() => ELITA.engine.start()); await page.waitForTimeout(300);
report('audio context running', await page.evaluate(() => ELITA.engine.core.ctx.state) === 'running', await page.evaluate(() => ELITA.engine.core.ctx.state + ', ' + ELITA.engine.core.ctx.sampleRate + ' Hz'));
report('silent before a note', (await peak()) < 1e-4, 'peak ' + (await peak()).toExponential(1));
await page.evaluate(() => ELITA.engine.noteOn(60, 0.8)); await page.waitForTimeout(400);
const p1 = await peak(); report('sound while key held', p1 > 0.02, 'peak ' + p1.toFixed(3));
report('voice shown as on', await page.evaluate(() => ELITA.engine.voices().filter(v => v.on).length) === 1);
await page.evaluate(() => ELITA.engine.noteOff(60)); await page.waitForTimeout(2500);
const p2 = await peak(); report('silent after release', p2 < 1e-3, 'peak ' + p2.toExponential(1));
// polyphony + a UI-driven change (filter cutoff to the floor must reduce the level of a bright saw)
await page.evaluate(() => { ELITA.setValue(19, 127); ELITA.engine.noteOn(48, 0.8); ELITA.engine.noteOn(55, 0.8); ELITA.engine.noteOn(64, 0.8); }); await page.waitForTimeout(500);
const open = await page.evaluate(() => { const d = ELITA.engine.wave().getValue(); let s = 0; for (let i = 1; i < d.length; i++) s += Math.abs(d[i] - d[i - 1]); return s; });
await page.evaluate(() => ELITA.setValue(19, 20)); await page.waitForTimeout(300);
const closed = await page.evaluate(() => { const d = ELITA.engine.wave().getValue(); let s = 0; for (let i = 1; i < d.length; i++) s += Math.abs(d[i] - d[i - 1]); return s; });
report('cutoff knob changes the sound', closed < open * 0.5, `waveform roughness ${open.toFixed(1)} -> ${closed.toFixed(1)}`);
report('3 voices active', await page.evaluate(() => ELITA.engine.voices().filter(v => v.on).length) === 3);
await page.evaluate(() => ELITA.engine.allOff()); await page.waitForTimeout(500);
report('allOff releases voices', await page.evaluate(() => ELITA.engine.voices().filter(v => v.on).length) === 0);
// real key press through the UI code path (keys.js)
await page.keyboard.down('a'); await page.waitForTimeout(400); const p3 = await peak(); await page.keyboard.up('a');
report('PC keyboard "a" plays', p3 > 0.02, 'peak ' + p3.toFixed(3));
report('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.screenshot({path: '/tmp/claude-0/-home-claude/2cb4a146-3960-54fd-bc2f-4d766c1a5da7/scratchpad/core_page.png'});
await browser.close(); srv.close(); console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
