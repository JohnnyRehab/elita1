/* ELITA-1 panel (NexusUI.js dials + HTML buttons). Every control is registered under its Synth1 parameter number (raw values).
   Host hooks:  ELITA.onChange = (no, value) => {}   called when the user moves a control
                ELITA.set(no, value)                 move a control without firing onChange
                ELITA.loadSy1(text)                  load a .sy1 patch into the panel
   Knobs: drag up/down, mouse wheel (+shift = x8), double-click = default. Buttons: click. LCD: click / right-click / wheel. */
(function () {
  const P = {}, DEF = {}, ctl = {}, NAME = {};
  let silent = false, sect = '';
  const E = window.ELITA = {params: P, onChange: null, set, loadSy1};
  const $ = id => document.getElementById(id);
  const h = (tag, cls, p, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; p.appendChild(e); return e; };
  const sec = (id, name) => { sect = name; return h('div', 'body', $(id)); };
  const row = (p, c) => h('div', 'row ' + (c || ''), p);
  const col = (p, c) => h('div', 'col ' + (c || ''), p);
  const cell = (p, label) => { const c = h('div', 'ctl', p), w = h('div', 'w', c); if (label) h('span', '', c, label); return w; };
  const btn = (p, cls, text) => { const b = h('button', cls, p, text); b.type = 'button'; return b; };
  const T = a => a.map((t, v) => ({v, t}));

  function reg(no, def, fn, label) { ctl[no] = fn; P[no] = DEF[no] = def; NAME[no] = sect + ' ' + label; silent = true; fn(def); silent = false; }
  function emit(no, v) { if (silent) return; P[no] = v; $('pinfo').textContent = NAME[no] + ' = ' + v; if (E.onChange) E.onChange(no, v); }
  function set(no, v) { if (!ctl[no]) return; silent = true; try { ctl[no](v); } finally { silent = false; } P[no] = v; }
  const choose = (no, v) => { set(no, v); emit(no, v); };

  /* ---- widgets ---- */
  function knob(p, no, label, def = 0, size = 34) {
    const w = cell(p, label);
    const d = new Nexus.Dial(w, {size: [size, size], interaction: 'vertical', mode: 'relative', min: 0, max: 127, step: 1, value: def});
    d.colorize('accent', '#ff4a36'); d.colorize('fill', '#2b2b2b');
    const put = v => { v = Math.max(0, Math.min(127, Math.round(v))); silent = true; d.value = v; silent = false; emit(no, v); };
    d.on('change', v => emit(no, Math.round(v)));
    w.addEventListener('dblclick', () => put(DEF[no]));
    w.addEventListener('wheel', e => { e.preventDefault(); put(P[no] + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 8 : 1)); }, {passive: false});
    reg(no, def, v => { d.value = v; }, label);
  }
  // lamp + dark button; led: 'r' red, 'g' green, 'n' = number button that turns yellow
  function sw(p, no, label, def = 0, led = 'r', text) {
    const t = h('span', 'tg ' + led, p); h('i', 'led', t);
    const b = btn(t, 'sb', text || label), show = v => t.classList.toggle('on', !!v);
    b.onclick = () => { const v = P[no] ? 0 : 1; show(v); emit(no, v); };
    reg(no, def, show, label);
  }
  // LCD-style button that cycles through items
  function lcd(p, no, label, items, def = 0) {
    items = items.map(i => typeof i === 'string' ? {t: i} : i);
    const b = btn(p, 'lcd'), show = v => { const it = items[v]; b.innerHTML = it ? (it.img ? `<img src="img/${it.img}.svg" alt="">` : it.t) : '?' + v; };
    const go = d => choose(no, (P[no] + d + items.length) % items.length);
    b.onclick = () => go(1);
    b.oncontextmenu = e => { e.preventDefault(); go(-1); };
    b.onwheel = e => { e.preventDefault(); go(e.deltaY < 0 ? 1 : -1); };
    reg(no, def, show, label);
  }
  function num(p, no, label, min, max, def) {
    const w = h('div', 'ctl', p), b = h('div', 'nbox', w), v = h('span', '', b), a = h('span', 'ar', b);
    const up = btn(a, '', '▲'), dn = btn(a, '', '▼');
    const put = x => { x = Math.max(min, Math.min(max, x)); v.textContent = x; emit(no, x); };
    up.onclick = () => put(P[no] + 1); dn.onclick = () => put(P[no] - 1);
    b.onwheel = e => { e.preventDefault(); put(P[no] + (e.deltaY < 0 ? 1 : -1)); };
    if (label) h('span', '', w, label);
    reg(no, def, x => { v.textContent = x; }, label);
  }
  function radio(p, no, v, c) {
    const l = h('label', 'lamp', p), i = h('input', '', l);
    i.type = 'radio'; i.name = 'p' + no; i.value = v; h('i', '', l);
    if (c && c.img) { const im = h('img', '', l); im.src = 'img/' + c.img + '.svg'; im.alt = c.img; } else if (c && c.t) l.append(c.t);
    i.onchange = () => emit(no, v);
  }
  const regRadio = (no, def, label) => reg(no, def, v => document.querySelectorAll('input[name=p' + no + ']').forEach(x => { x.checked = +x.value === +v; }), label);
  const cycle = (p, no, vals, text) => { btn(p, 'sb', text).onclick = () => choose(no, vals[(vals.indexOf(P[no]) + 1) % vals.length]); };
  // lamp list; `button` adds a cycling button above it (Synth1 "type" / "range" / "dest.")
  function lamps(p, no, items, def, cls, label, button) {
    const w = h('div', 'lw', p);
    if (button) cycle(w, no, items.map(i => i.v), button);
    const box = h('div', 'lamps ' + (cls || ''), w);
    items.forEach(it => radio(box, no, it.v, it));
    regRadio(no, def, label);
  }

  /* ---- value lists (display order; raw values follow Synth1 files) ---- */
  const W1 = [{v: 0, img: 'sin'}, {v: 1, img: 'saw'}, {v: 3, img: 'triangle'}, {v: 2, img: 'square'}];
  const W2 = [{v: 3, img: 'triangle'}, {v: 2, img: 'square'}, {v: 1, img: 'saw'}, {v: 4, t: 'noise'}];

  /* ---- Oscillators ---- */
  let o = sec('oscillators', 'osc'), g = h('div', 'osc', o), r, c;
  r = row(g, 'top'); h('span', 'tag', r, '1'); lamps(r, 0, W1, 1, 'g2', 'osc1 wave'); knob(r, 76, 'det'); knob(r, 45, 'FM');
  r = row(g, 'top'); knob(r, 95, 'sub'); lamps(r, 96, W1, 1, 'g2', 'sub wave'); lamps(r, 97, T(['0oct', '-1oct']), 1, '', 'sub oct');
  c = col(g);
  r = row(c, 'top'); h('span', 'tag', r, '2'); lamps(r, 1, W2, 1, 'g2', 'osc2 wave'); sw(r, 7, 'ring'); sw(r, 6, 'sync');
  r = row(c); sw(r, 4, 'track', 1, 'g'); knob(r, 2, 'pitch', 64); knob(r, 3, 'fine', 64);
  c = col(g);
  num(c, 9, 'key shift', -24, 24, 0);
  r = row(c); knob(r, 5, 'mix'); knob(r, 8, 'p/w', 127);
  r = row(c); knob(r, 91, 'phase'); knob(r, 72, 'tune', 64);
  r = row(g, 'span'); sw(r, 10, 'm.env'); knob(r, 12, 'A'); knob(r, 13, 'D', 64); knob(r, 11, 'amt', 64);
  lamps(r, 71, T(['osc2', 'FM', 'p/w']), 0, 'h', 'm.env dest', 'dest.');

  /* ---- LFO 1 | shared destination names | LFO 2 ---- */
  o = sec('lfo', 'lfo'); g = h('div', 'lfo7', o);
  const LD = ['osc2', 'osc1,2', 'filter', 'amp', 'p/w', 'FM', 'pan'];
  const LT = [{img: 'saw'}, {img: 'triangle'}, {img: 'sin'}, {img: 'square'}, 's&h', 'rnd'];
  const l1 = h('div', 'lb', g), mid = h('div', 'lc', g), l2 = h('div', 'lb rr', g);
  [[l1, 1, 57, 42, 41, 43, 44, 67, 68, 2], [l2, 2, 58, 47, 46, 48, 49, 69, 70, 3]].forEach(([b, n, on, ty, ds, sp, am, ts, ks, dd]) => {
    sect = 'lfo' + n;
    const q = row(b); if (n === 1) { sw(q, on, 'on', 0, 'n', '1'); lcd(q, ty, 'type', LT, 2); cycle(q, ds, [1, 2, 3, 4, 5, 6, 7], 'dst'); }
    else { cycle(q, ds, [1, 2, 3, 4, 5, 6, 7], 'dst'); lcd(q, ty, 'type', LT, 2); sw(q, on, 'on', 0, 'n', '2'); }
    const k = row(b); knob(k, sp, 'spd', 64); knob(k, am, 'amt', 32);
    h('span', 'sync', b, '-sync-');
    const s = row(b); sw(s, ts, 'tempo', 0, 'g'); sw(s, ks, 'key', 0, 'g');
    P[ds] = dd;
  });
  LD.forEach((t, i) => { radio(mid, 41, i + 1, null); h('span', '', mid, t); radio(mid, 46, i + 1, null); });
  sect = 'lfo1'; regRadio(41, 2, 'dst'); sect = 'lfo2'; regRadio(46, 3, 'dst');

  /* ---- Amplifier ---- */
  o = sec('amplifier', 'amp'); r = row(o);
  knob(r, 25, 'A'); knob(r, 26, 'D', 64); knob(r, 27, 'S', 100); knob(r, 28, 'R', 40); knob(r, 29, 'gain', 100); knob(r, 30, 'vel', 64);

  /* ---- Filter ---- */
  o = sec('filter', 'filter'); r = row(o);
  knob(r, 15, 'A'); knob(r, 16, 'D', 70); knob(r, 17, 'S', 40); knob(r, 18, 'R', 40); knob(r, 21, 'amt', 85);
  r = row(o);
  knob(r, 19, 'frq', 80); knob(r, 20, 'res', 20); knob(r, 23, 'sat'); knob(r, 22, 'trk'); sw(r, 24, 'vel', 1, 'g');
  r = row(o, 'ftype');   // type button + its lamps side by side, below frq / res / sat / trk
  cycle(r, 14, [0, 1, 2, 3, 4], 'type');
  lamps(r, 14, T(['LP12', 'LP24', 'HP12', 'BP12', 'LPDL']), 1, 'h', 'type');

  /* ---- Arpeggiator ---- */
  o = sec('arpeggiator', 'arp'); r = row(o, 'top');
  sw(r, 59, 'on', 0, 'r', 'ON'); knob(r, 33, 'beat', 64); knob(r, 34, 'gate', 64);
  r = row(o, 'top');
  lamps(r, 31, T(['updown', 'up', 'down', 'random']), 0, '', 'type', 'type');
  lamps(r, 32, T(['1oct', '2oct', '3oct', '4oct']), 0, '', 'range', 'range');

  /* ---- Effect / Equalizer-Pan / Tempo Delay / Chorus ---- */
  o = sec('effect', 'fx'); r = row(o);
  sw(r, 77, 'on', 0, 'r', 'ON'); lcd(r, 78, 'type', ['a.d.1', 'a.d.2', 'd.d.', 'deci.', 'r.m.', 'comp.', 'phaser']);
  knob(r, 79, 'ctl1', 0, 30); knob(r, 80, 'ctl2', 0, 30); knob(r, 81, 'level', 0, 30);
  o = sec('equalizer-pan', 'eq'); r = row(o);
  knob(r, 61, 'freq', 64); knob(r, 62, 'level', 64); knob(r, 63, 'Q', 64); knob(r, 60, 'tone', 64); knob(r, 90, 'L-R', 64);
  o = sec('tempo-delay', 'delay'); r = row(o, 'split');
  c = col(r, 'sw'); sw(c, 65, 'on', 0, 'r', 'ON'); lcd(c, 82, 'type', ['ST', 'X', 'PP']);   // indicator + ON stacked vertically
  r = row(r, 'kn');
  knob(r, 35, 'time', 8, 28); knob(r, 83, 'sprd', 0, 28); knob(r, 36, 'fdbk', 40, 28); knob(r, 98, 'tone', 0, 28); knob(r, 37, 'd/w', 20, 28);
  o = sec('chrous-flanger', 'chorus'); r = row(o, 'split');
  c = col(r, 'sw'); sw(c, 66, 'on', 0, 'r', 'ON'); lcd(c, 64, 'type', ['x0?', 'x1', 'x2', 'x3', 'x4'], 2);
  r = row(r, 'kn');
  knob(r, 52, 'time', 64, 28); knob(r, 53, 'deph', 64, 28); knob(r, 54, 'rate', 50, 28); knob(r, 55, 'fdbk', 64, 28); knob(r, 56, 'levl', 64, 28);

  /* ---- Voice ---- */
  o = sec('voice', 'voice'); r = row(o, 'top');
  lamps(r, 38, T(['poly', 'mono', 'legato']), 0, '', 'mode'); num(r, 94, 'poly', 1, 32, 16);
  r = row(o); sw(r, 73, 'unison', 0, 'g'); knob(r, 39, 'porta'); sw(r, 74, 'auto', 0, 'g');
  r = row(o); num(r, 93, 'num', 1, 8, 4); knob(r, 75, 'det', 40); knob(r, 92, 'phase'); knob(r, 84, 'sprd', 64); knob(r, 85, 'pitch', 24);

  /* ---- Bottom: vol ---- */
  sect = 'vol'; knob($('vol'), 'vol', 'vol', 100, 40);

  /* ---- patch loading ---- */
  function loadSy1(text) {
    const L = text.replace(/\r/g, '').split('\n');
    Object.keys(DEF).forEach(no => { if (no !== 'vol') set(no, DEF[no]); });   // old patches lack some numbers
    let n = 0;
    L.slice(3).forEach(l => { const m = l.match(/^\s*(\d+)\s*,\s*(-?\d+)\s*$/); if (m && ctl[+m[1]]) { set(+m[1], +m[2]); n++; } });
    Object.keys(P).forEach(no => { if (E.onChange && no !== 'vol') E.onChange(+no, P[no]); });
    return {name: L[0] || '(no name)', ver: (L[2] || '').replace(/^ver=/, ''), applied: n};
  }
  async function readFile(f) {
    const b = await f.arrayBuffer();
    let t; try { t = new TextDecoder('utf-8', {fatal: true}).decode(b); } catch (e) { t = new TextDecoder('shift_jis').decode(b); }
    const res = loadSy1(t);
    $('pname').textContent = res.name; $('pinfo').textContent = 'ver ' + res.ver + ' / ' + res.applied + ' params';
  }
  $('file').onchange = e => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ''; };
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(x => /\.sy1$/i.test(x.name)); if (f) readFile(f); });
})();
