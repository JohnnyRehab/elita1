// Voice indicator on the real page: Voice panel top = patch box top, 16 cells lit while a voice sounds (release included), L/R bars move, "voices 0/5" text is gone; core and Tone engines.
import path from 'path'; import {fileURLToPath} from 'url'; import {createRequire} from 'module'; import {serve} from './serve.mjs';
const require = createRequire(import.meta.url), {chromium} = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const {srv, port} = await serve(root);
const browser = await chromium.launch({args: ['--autoplay-policy=no-user-gesture-required']});
let fail = 0; const report = (n, ok, m = '') => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + n.padEnd(54) + m); };
for (const eng of ['core', 'tone']) {
  console.log('--- engine=' + eng);
  const page = await browser.newPage({viewport: {width: 1400, height: 900}}), errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?engine=${eng}`);
  await page.waitForFunction(() => window.ELITA && ELITA.engine && document.querySelector('#vind .vc u'));
  const H0 = await page.evaluate(() => document.documentElement.scrollHeight);
  const g = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return {v: r('#voice'), p: r('#patchbox'), i: r('#vind'), k: r('#keys, .keys, #kb')}; }).catch(() => null);
  report('Voice top == patch box top', g && Math.abs(g.v.top - g.p.top) < 1.5, g && `voice ${g.v.top.toFixed(1)} patch ${g.p.top.toFixed(1)}`);
  report('indicator inside patch box height', g && g.i.bottom <= g.p.bottom + 1 && g.i.top >= g.v.bottom, g && `ind ${g.i.top.toFixed(1)}-${g.i.bottom.toFixed(1)}`);
  report('16 cells, no old #vc text', await page.locator('#vind .vc u').count() === 16 && await page.locator('#vc').count() === 0);
  await page.evaluate(() => ELITA.engine.start()); await page.waitForTimeout(500);
  const lit = () => page.locator('#vind .vc u.on').count();
  report('idle: none lit', await lit() === 0);
  await page.evaluate(() => { ELITA.setValue(14, 1); ELITA.setValue(28, 80); ELITA.engine.noteOn(60, 0.9); ELITA.engine.noteOn(64, 0.9); ELITA.engine.noteOn(67, 0.9); }); await page.waitForTimeout(500);
  report('3 notes: 3 cells lit', await lit() === 3, 'lit ' + await lit());
  report('count text', (await page.locator('#vind .vn').textContent()).startsWith('3/'), await page.locator('#vind .vn').textContent());
  const bar = () => page.evaluate(() => [...document.querySelectorAll('#vind .vm b')].map(b => +(b.style.transform.match(/scaleX\(([\d.]+)/) || [0, 0])[1]));
  const bl = await bar(); report('L/R bars move', bl[0] > 0.05 && bl[1] > 0.05, bl.join(' / '));
  await page.evaluate(() => { ELITA.engine.noteOff(60); ELITA.engine.noteOff(64); ELITA.engine.noteOff(67); }); await page.waitForTimeout(150);
  const rel = await lit(); await page.waitForTimeout(15000); const end = await lit();
  report('release: cells stay lit, then go out', rel >= 1 && end === 0, `during ${rel}, after ${end}`);
  report('page height unchanged by lighting', await page.evaluate(() => document.documentElement.scrollHeight) === H0);
  report('no console errors', errors.length === 0, errors.join(' | ').slice(0, 200));
  await page.screenshot({path: `/tmp/claude-0/-home-claude/51960c57-d5ac-54c9-928b-9acd00b21d9d/scratchpad/vind_${eng}.png`});
  await page.close();
}
await browser.close(); srv.close(); console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
