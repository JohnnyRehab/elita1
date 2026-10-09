/* Colour themes and a colour editor.
   - 4 built-in themes (css/themes.css): classic (the original look), dark, midnight, light.
   - "theme" button (Patch Parameters tool row) opens a window: pick a theme, edit single colours, reset, export / import a .json file.
   - The choice is kept in this browser (localStorage). Nothing is sent anywhere. The colours are CSS variables on <html>,
     so the whole UI (including the knobs and the oscilloscope) follows without a reload.
   ELITA.theme = {apply(name), set(var, hex), reset(), colors(), export(), import(text), list} */
(function () {
  const E = window.ELITA, root = document.documentElement, KEY = 'elita1-theme';
  const THEMES = [['classic', 'Classic'], ['dark', 'Dark'], ['midnight', 'Midnight'], ['light', 'Light']];
  // editable colours: [css variable, label]
  const GROUPS = [
    ['Panel', [['--page', 'page background'], ['--bg', 'panel background'], ['--hd', 'title band'], ['--ink', 'text'], ['--dk', 'outline / buttons'], ['--on-dk', 'button text'], ['--dk-sh', 'button shadow']]],
    ['LCD / scope', [['--lcd', 'LCD background'], ['--lcdf', 'LCD text / scope line'], ['--lcd-edge', 'LCD edge']]],
    ['Lamps / knobs', [['--led', 'LED off'], ['--on', 'LED on / accent'], ['--grn', 'green LED on'], ['--led-g', 'green LED off'], ['--knob', 'knob body'], ['--knob-acc', 'knob pointer'], ['--hi', 'lit number button'], ['--hi-fg', 'lit button text']]],
    ['Title / buttons', [['--tag', 'version / UPDATED'], ['--tag2', 'Start from'], ['--btn', 'folder / file buttons'], ['--btn-fg', 'their text'], ['--btn-in', 'BPM field']]],
    ['Keyboard', [['--key-w', 'white keys'], ['--key-fg', 'white key text'], ['--key-b', 'black keys'], ['--key-b-fg', 'black key text']]],
    ['Parameter list', [['--ch-fg', 'changed value text']]],
  ];
  const VARS = GROUPS.flatMap(g => g[1].map(v => v[0]));
  let state = {theme: 'classic', over: {}};
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') state = {theme: THEMES.some(t => t[0] === s.theme) ? s.theme : 'classic', over: s.over && typeof s.over === 'object' ? s.over : {}}; } catch (e) { /* no storage */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };
  const HEX = /^#[0-9a-f]{6}$/i;
  const cv = document.createElement('canvas').getContext('2d');
  const hexOf = c => { cv.fillStyle = '#000000'; cv.fillStyle = c; const h = cv.fillStyle; return h[0] === '#' ? h : '#000000'; };   // any css colour -> #rrggbb
  const cur = v => hexOf(getComputedStyle(root).getPropertyValue(v).trim() || '#000');

  function paint() {
    if (state.theme === 'classic') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', state.theme);
    VARS.forEach(v => root.style.removeProperty(v));
    Object.keys(state.over).forEach(v => { if (VARS.includes(v) && HEX.test(state.over[v])) root.style.setProperty(v, state.over[v]); });
    if (E.recolor) E.recolor();
    window.dispatchEvent(new Event('elita-theme'));
    sync();
  }
  function apply(name) { if (!THEMES.some(t => t[0] === name)) return false; state = {theme: name, over: {}}; save(); paint(); return true; }
  function setVar(v, hex) { if (!VARS.includes(v) || !HEX.test(hex)) return false; state.over[v] = hex.toLowerCase(); save(); paint(); return true; }
  function reset() { state.over = {}; save(); paint(); }
  const colors = () => Object.fromEntries(VARS.map(v => [v, cur(v)]));
  const exportText = () => JSON.stringify({elita1_theme: 1, theme: state.theme, colors: colors()}, null, 2) + '\n';
  function importText(t) {
    let o; try { o = JSON.parse(t); } catch (e) { return 'not a JSON file'; }
    if (!o || o.elita1_theme !== 1 || typeof o.colors !== 'object') return 'not an ELITA-1 theme file';
    const over = {}; Object.keys(o.colors).forEach(v => { if (VARS.includes(v) && HEX.test(o.colors[v])) over[v] = o.colors[v].toLowerCase(); });
    state = {theme: THEMES.some(x => x[0] === o.theme) ? o.theme : 'classic', over}; save(); paint(); return '';
  }
  E.theme = {apply, set: setVar, reset, colors, export: exportText, import: importText, list: THEMES.map(t => t[0]), vars: VARS};

  // ---- window ----
  const css = document.createElement('style');
  css.textContent = `#themedlg{ width:min(520px,94vw); max-height:86vh; padding:0; border:1px solid var(--dk); background:var(--bg); color:var(--ink); font:12px/1.4 "Hiragino Sans","Yu Gothic UI",system-ui,sans-serif; }
  #themedlg::backdrop{ background:rgba(0,0,0,.45); }
  #themedlg .th{ display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:var(--hd); border-bottom:1px solid var(--dk); font-weight:700; font-size:13px; }
  #themedlg .tb{ padding:8px 12px; overflow:auto; max-height:calc(86vh - 80px); }
  #themedlg button{ background:var(--dk); color:var(--on-dk); font:700 11px inherit; padding:3px 10px; border-radius:3px; box-shadow:inset 0 -2px 0 var(--dk-sh); cursor:pointer; }
  #themedlg .tt{ display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap; }
  #themedlg .tt button.cur{ outline:2px solid var(--on); outline-offset:1px; }
  #themedlg .sw{ display:inline-block; width:10px; height:10px; margin-right:4px; vertical-align:-1px; border:1px solid #000; }
  #themedlg h4{ margin:8px 0 3px; padding:1px 6px; font-size:11px; background:var(--sub-bg); }
  #themedlg .cg{ display:grid; grid-template-columns:1fr 1fr; gap:2px 14px; }
  #themedlg label{ display:flex; justify-content:space-between; align-items:center; gap:6px; }
  #themedlg label.ed span::after{ content:' •'; color:var(--on); }
  #themedlg input[type=color]{ width:34px; height:20px; padding:0; border:1px solid var(--dk); background:none; cursor:pointer; }
  #themedlg .tf{ display:flex; gap:6px; padding:5px 10px; border-top:1px solid var(--dk); background:var(--hd); align-items:center; }
  #themedlg .tf small{ margin-left:auto; opacity:.8; }
  #plist .tools button#ptheme{ background:var(--dk); }`;
  document.head.appendChild(css);
  const dlg = document.createElement('dialog'); dlg.id = 'themedlg';
  dlg.innerHTML = '<div class="th"><span>Theme</span><button type="button" id="thclose">close</button></div><div class="tb"><div class="tt" id="thlist"></div><div id="thcols"></div></div>' +
    '<div class="tf"><button type="button" id="threset">reset colours</button><button type="button" id="thexp">export .json</button><label class="btn-l"><button type="button" id="thimp">import .json</button></label><input type="file" id="thfile" accept=".json,application/json" hidden><small id="thmsg"></small></div>';
  document.body.appendChild(dlg);
  const $ = id => dlg.querySelector('#' + id);
  $('thlist').innerHTML = THEMES.map(t => `<button type="button" data-t="${t[0]}"><i class="sw"></i>${t[1]}</button>`).join('');
  $('thcols').innerHTML = GROUPS.map(g => `<h4>${g[0]}</h4><div class="cg">` + g[1].map(v => `<label data-v="${v[0]}"><span>${v[1]}</span><input type="color" data-v="${v[0]}"></label>`).join('') + '</div>').join('');
  let msgT = 0;
  const msg = m => { $('thmsg').textContent = m; clearTimeout(msgT); msgT = setTimeout(() => { $('thmsg').textContent = ''; }, 3500); };
  function sync() {
    dlg.querySelectorAll('#thlist button').forEach(b => b.classList.toggle('cur', b.dataset.t === state.theme));
    dlg.querySelectorAll('input[type=color]').forEach(i => { i.value = cur(i.dataset.v); i.parentNode.classList.toggle('ed', !!state.over[i.dataset.v]); });
    // small colour sample on the theme buttons: that theme's own background
    dlg.querySelectorAll('#thlist button').forEach(b => { const t = b.dataset.t; const sw = b.firstChild; sw.style.background = ({classic: '#C8C888', dark: '#2b2d2f', midnight: '#1c2740', light: '#ececec'})[t]; });
  }
  $('thlist').onclick = e => { const b = e.target.closest('button'); if (b) { apply(b.dataset.t); msg('theme: ' + b.dataset.t); } };
  $('thcols').oninput = e => { if (e.target.dataset && e.target.dataset.v) setVar(e.target.dataset.v, e.target.value); };
  $('threset').onclick = () => { reset(); msg('colours reset to the theme'); };
  $('thexp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportText()], {type: 'application/json'})); a.download = 'elita1-theme-' + state.theme + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  $('thimp').onclick = () => $('thfile').click();
  $('thfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const r = importText(await f.text()); msg(r || 'imported ' + f.name); };
  $('thclose').onclick = () => dlg.close();
  const tools = document.querySelector('#plist .tools');
  if (tools) { const b = document.createElement('button'); b.type = 'button'; b.id = 'ptheme'; b.textContent = 'theme'; b.title = 'colour theme / edit colours'; tools.appendChild(b); b.onclick = () => { sync(); dlg.showModal(); }; }
  paint();
})();
