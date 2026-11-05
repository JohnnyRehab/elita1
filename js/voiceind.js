/* Voice indicator: 16 cells (one per voice slot; 32 in two rows when POLY > 16), lit while a voice sounds, release included,
   plus two level bars (L / R) and the count. Data: ELITA.engine.levels() (C++/Wasm core, ~30 Hz) or, for the Tone engine, voices() and wave(). */
(() => {
  'use strict';
  const E = () => window.ELITA && window.ELITA.engine, host = document.getElementById('vind');
  if (!host) return;
  host.innerHTML = '<div class="vm"><i><b></b></i><i><b></b></i></div><div class="vc"></div><div class="vn"></div>';
  const bars = host.querySelectorAll('.vm b'), grid = host.querySelector('.vc'), num = host.querySelector('.vn');
  let cells = [], size = 0, hold = [0, 0], last = 0;
  const build = n => { size = n; grid.innerHTML = ''; cells = [];     grid.style.gridTemplateColumns = 'repeat(16, 1fr)';
    for (let i = 0; i < (n > 16 ? 32 : 16); i++) { const u = document.createElement('u'); if (i >= n) u.className = 'x'; grid.append(u); cells.push(u); } };
  const db = p => Math.max(0, Math.min(1, 1 + Math.log10(Math.max(p, 1e-4)) / 3));      // peak -> 0..1 on a -60 dB scale
  function tick(t) {
    requestAnimationFrame(tick);
    const e = E(); if (!e) return;
    const n = Math.min(32, e.POLY || 16); if (n !== size) build(n);
    let mask = 0, l = 0, r = 0, lv = e.levels && e.levels();
    if (lv) { mask = lv.m; l = lv.l; r = lv.r; }
    else { const v = e.voices && e.voices(); if (v) v.forEach((x, i) => { if (i < 32 && (x.on || (x.amp && x.amp.value > 0.002))) mask |= 1 << i; });   // key held, or the amp envelope still running (release)
           const w = e.wave && e.wave(), a = w && w.getValue(); if (a && a.length) { let p = 0; for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i])); l = r = p; } }
    let cnt = 0;
    for (let i = 0; i < cells.length; i++) { const on = i < n && (mask >>> i & 1) === 1; if (on) cnt++; const c = cells[i].classList; if (c.contains('on') !== on) c.toggle('on', on); }
    num.textContent = cnt + '/' + n;
    const dt = Math.min(0.1, (t - last) / 1000 || 0.016); last = t;
    [l, r].forEach((p, k) => { const v = db(p); hold[k] = v > hold[k] ? v : Math.max(v, hold[k] - dt * 1.5); bars[k].style.transform = 'scaleX(' + hold[k].toFixed(3) + ')'; });
  }
  requestAnimationFrame(tick);
})();
