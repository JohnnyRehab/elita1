/* Key config window (Settings > Keyboard > "Key config…"): choose which PC keys play the notes, shift the octave, switch patches and stop all notes.
   Click a key of the diagram (or a function below), then press the PC key you want: the note keys go on to the next note by themselves.
   Esc stops, Delete / Backspace clears the assignment. A key that is already used moves to the new place. Presets, reset, export / import (.json).
   The data lives in js/keymap.js (ELITA.keymap); this file is only the window.   ELITA.keyconfig = {open(), close()} */
(function () {
  const E = window.ELITA, KM = E.keymap, BASE = 48, NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = i => NAMES[i % 12] + (Math.floor((BASE + i) / 12) - 1);
  const css = document.createElement('style');
  css.textContent = `#keydlg{ width:min(720px,96vw); max-height:90vh; padding:0; border:1px solid var(--dk); background:var(--bg); color:var(--ink); font:12px/1.4 "Hiragino Sans","Yu Gothic UI",system-ui,sans-serif; }
  #keydlg::backdrop{ background:rgba(0,0,0,.45); }
  #keydlg .th{ display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:var(--hd); border-bottom:1px solid var(--dk); font-weight:700; font-size:13px; }
  #keydlg .tb{ padding:8px 12px 10px; overflow:auto; max-height:calc(90vh - 80px); }
  #keydlg button{ background:var(--dk); color:var(--on-dk); font:700 11px inherit; padding:3px 10px; border-radius:3px; box-shadow:inset 0 -2px 0 var(--dk-sh); cursor:pointer; }
  #keydlg .nt{ margin:0 0 6px; opacity:.85; }
  #keydlg .pre{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; align-items:center; }
  #keydlg .pre b{ font-size:11px; }
  #keydlg .pn{ position:relative; height:104px; display:flex; margin:4px 0 8px; user-select:none; }
  #keydlg .pk{ flex:1; position:relative; }
  #keydlg .pn .k{ display:flex; flex-direction:column; justify-content:flex-end; align-items:center; gap:1px; padding:0 0 4px; font:10px/1.15 inherit; text-align:center; box-shadow:none; }
  #keydlg .pn .w{ flex:1; background:var(--key-w); color:var(--key-fg); border:1px solid var(--dk); border-radius:0 0 3px 3px; }
  #keydlg .pn .b{ position:absolute; top:0; width:calc(100% / 15 * .62); height:62%; z-index:1; background:var(--key-b); color:var(--key-b-fg); border:1px solid var(--dk); border-radius:0 0 3px 3px; }
  #keydlg .pn .k small{ font-size:8px; opacity:.6; }
  #keydlg .pn .k .lb{ font:700 12px/1 inherit; min-height:12px; }
  #keydlg .k.sel{ outline:3px solid var(--on); outline-offset:-3px; z-index:2; }
  #keydlg .k.empty .lb{ opacity:.35; }
  #keydlg .acts{ display:grid; grid-template-columns:1fr 1fr; gap:4px 14px; }
  #keydlg .acts div{ display:flex; justify-content:space-between; align-items:center; gap:6px; }
  #keydlg .acts button.k{ min-width:74px; background:var(--btn-in); }
  #keydlg .acts button.k.sel{ outline:2px solid var(--on); outline-offset:1px; }
  #keydlg .acts button.k.empty{ opacity:.6; }
  #keydlg .acts .x{ padding:3px 7px; }
  #keydlg #kcmsg{ min-height:1.4em; margin:8px 0 0; font-weight:700; }
  #keydlg .tf{ display:flex; gap:6px; padding:5px 10px; border-top:1px solid var(--dk); background:var(--hd); align-items:center; }
  #keydlg .tf small{ margin-left:auto; opacity:.8; }
  #setdlg #setkeys{ background:var(--dk); }`;
  document.head.appendChild(css);
  const dlg = document.createElement('dialog'); dlg.id = 'keydlg';
  dlg.innerHTML = '<div class="th"><span>Key config</span><button type="button" id="kcclose">close</button></div><div class="tb">' +
    '<p class="nt">Click a key of the diagram (or a function), then press the PC key you want. Notes continue to the next key by themselves. Esc stops, Delete / Backspace clears.</p>' +
    '<div class="pre" id="kcpre"><b>Presets</b></div><div class="pn" id="kcpiano"></div><div class="acts" id="kcacts"></div><p id="kcmsg"></p></div>' +
    '<div class="tf"><button type="button" id="kcreset">reset to default</button><button type="button" id="kcexp">export .json</button><button type="button" id="kcimp">import .json</button><input type="file" id="kcfile" accept=".json,application/json" hidden><small>saved in this browser</small></div>';
  document.body.appendChild(dlg);
  const $ = id => dlg.querySelector('#' + id);
  let learn = null;                                                // the action waiting for a key
  const msg = (t, warn) => { $('kcmsg').textContent = t || ''; $('kcmsg').style.color = warn ? 'var(--on)' : ''; };
  const fname = a => a[0] === 'n' ? 'note ' + noteName(+a.slice(1)) : KM.names[a];
  // preset buttons
  KM.presets.forEach(([k, n]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.onclick = () => { stop(); KM.preset(k); msg('Preset: ' + n); }; $('kcpre').appendChild(b); });
  // piano diagram (same shape as the on-screen keyboard: 25 keys, C to C)
  let wi = 0;
  for (let i = 0; i < 25; i++) {
    const black = [1, 3, 6, 8, 10].includes(i % 12), b = document.createElement('button'); b.type = 'button';
    b.className = 'k ' + (black ? 'b' : 'w'); b.dataset.a = 'n' + i; b.innerHTML = '<small>' + noteName(i) + '</small><span class="lb"></span>';
    if (black) b.style.left = 'calc(' + (wi / 15 * 100) + '% - (100% / 15 * .62) / 2)'; else wi++;
    $('kcpiano').appendChild(b);
  }
  KM.funcs.forEach(a => {
    const d = document.createElement('div'); d.innerHTML = '<span>' + KM.names[a] + '</span><span><button type="button" class="k" data-a="' + a + '"><span class="lb"></span></button> <button type="button" class="x" data-x="' + a + '" title="clear">×</button></span>';
    $('kcacts').appendChild(d);
  });
  function paint() {
    dlg.querySelectorAll('.k[data-a]').forEach(b => {
      const c = KM.codeOf(b.dataset.a), l = b.querySelector('.lb'); l.textContent = c ? KM.label(c) : '–';
      b.classList.toggle('empty', !c); b.classList.toggle('sel', learn === b.dataset.a);
    });
  }
  KM.on(() => { if (dlg.open) paint(); });
  // learn mode: the next key press goes to the assignment (captured before keys.js sees it)
  function onKey(e) {
    if (!learn) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat || /^(Shift|Control|Alt|Meta|OS)(Left|Right)$/.test(e.code)) return;
    if (e.code === 'Escape') { stop(); msg('Stopped.'); return; }
    if (e.code === 'Backspace' || e.code === 'Delete') { KM.clear(learn); msg(fname(learn) + ': cleared'); next(); return; }
    const a = learn, r = KM.set(a, e.code);
    if (!r.ok) { msg(r.err, true); return; }
    msg(fname(a) + ' = ' + KM.label(e.code) + (r.moved ? '   (taken from ' + fname(r.moved) + ')' : ''));
    next();
  }
  function next() { if (learn && learn[0] === 'n' && +learn.slice(1) < 24) learn = 'n' + (+learn.slice(1) + 1); else learn = null; if (!learn) removeEventListener('keydown', onKey, true); paint(); if (learn) msg($('kcmsg').textContent + '   → now press a key for ' + fname(learn)); }
  function start(a) { if (!learn) addEventListener('keydown', onKey, true); learn = a; paint(); msg('Press a key for ' + fname(a) + ' … (Esc: stop, Delete: clear)'); }
  function stop() { learn = null; removeEventListener('keydown', onKey, true); paint(); }
  dlg.querySelector('.tb').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a) start(b.dataset.a);
    else if (b.dataset.x) { stop(); KM.clear(b.dataset.x); msg(fname(b.dataset.x) + ': cleared'); }
  });
  $('kcreset').onclick = () => { stop(); KM.reset(); msg('Reset to the default layout.'); };
  $('kcexp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([KM.export()], {type: 'application/json'})); a.download = 'elita1-keys.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  $('kcimp').onclick = () => $('kcfile').click();
  $('kcfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; stop(); const r = KM.import(await f.text()); msg(r || 'Imported ' + f.name, !!r); };
  $('kcclose').onclick = () => dlg.close();
  dlg.addEventListener('close', stop);
  E.keyconfig = {open() { msg(''); paint(); if (!dlg.open) dlg.showModal(); }, close() { dlg.close(); }};
})();
