/* ELITA-1 key map: which PC key does what (the data behind Settings > Key config).
   Keys are identified by KeyboardEvent.code (the physical key), so the map works with any keyboard layout and while a Japanese IME is on.
   Actions: n0 .. n24 (the 25 keys of the on-screen keyboard, n0 = the lowest key), octDown, octUp, patchNext, patchPrev, allOff.
   The default is the layout ELITA-1 always had (A W S E D F T G Y H U J K O L P, Z / X, up / down arrow). Saved in this browser (localStorage 'elita1-keys').
   ELITA.keymap = {actionOf(code), codeOf(action), label(code), set(action, code), clear(action), preset(name), reset(), get(), export(), import(text), typing(e), on(fn), actions, presets} */
(function () {
  const E = window.ELITA, KEY = 'elita1-keys';
  const NOTES = Array.from({length: 25}, (_, i) => 'n' + i), FUNCS = ['octDown', 'octUp', 'patchNext', 'patchPrev', 'allOff'], ACTIONS = NOTES.concat(FUNCS);
  const FNAME = {octDown: 'Octave down', octUp: 'Octave up', patchNext: 'Next patch', patchPrev: 'Previous patch', allOff: 'All notes off'};
  const from = (codes, start = 0) => { const m = {}; codes.forEach((c, i) => { m['n' + (start + i)] = c; }); return m; };
  const PRESETS = {
    elita: {name: 'ELITA (A W S E …)', map: Object.assign(from(['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP']),
      {octDown: 'KeyZ', octUp: 'KeyX', patchNext: 'ArrowUp', patchPrev: 'ArrowDown'})},
    daw: {name: 'DAW style (Z S X D C V …, Q 2 W 3 E …)', map: Object.assign(from(['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM']),
      from(['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI'], 12),
      {octDown: 'ArrowLeft', octUp: 'ArrowRight', patchNext: 'ArrowUp', patchPrev: 'ArrowDown'})},
  };
  // keys that must stay free: modifiers, Esc / Tab / Enter / Space (dialogs, buttons), Backspace / Delete (clear in Key config), F keys, lock and system keys
  const RESERVED = /^(Shift|Control|Alt|Meta|OS)(Left|Right)$|^(Escape|Tab|Enter|NumpadEnter|Space|Backspace|Delete|CapsLock|ContextMenu|PrintScreen|Pause|ScrollLock|NumLock|Insert|F\d+|Unidentified|Process)$/;
  const validCode = c => typeof c === 'string' && /^[A-Za-z0-9]{1,24}$/.test(c) && !RESERVED.test(c);
  let map = {}, rev = {}, subs = [];
  const index = () => { rev = {}; Object.keys(map).forEach(a => { rev[map[a]] = a; }); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({v: 1, map})); } catch (e) { /* no storage */ } };
  const notify = () => subs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  const clean = o => { const m = {}, seen = {}; ACTIONS.forEach(a => { const c = o && o[a]; if (validCode(c) && !seen[c]) { m[a] = c; seen[c] = 1; } }); return m; };
  map = Object.assign({}, PRESETS.elita.map);
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.v === 1 && s.map && typeof s.map === 'object') map = clean(s.map); } catch (e) { /* default */ }
  index();

  // label shown for a code: the character on this keyboard layout (Chrome: navigator.keyboard.getLayoutMap), otherwise derived from the code
  let layout = null;
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { layout = m; notify(); }).catch(() => {});
  const ARROW = {ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'}, PUNCT = {Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Quote: "'", Backquote: '`', IntlYen: '¥', IntlRo: '_'};
  function label(code) {
    if (!code) return '';
    if (ARROW[code]) return ARROW[code];
    const l = layout && layout.get(code); if (l && l.length === 1) return l.toUpperCase();
    if (/^Key[A-Z]$/.test(code)) return code[3];
    if (/^Digit\d$/.test(code)) return code[5];
    if (/^Numpad/.test(code)) return 'Num' + code.slice(6).replace('Multiply', '*').replace('Divide', '/').replace('Add', '+').replace('Subtract', '-').replace('Decimal', '.');
    return PUNCT[code] || code.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  function set(action, code) {
    if (!ACTIONS.includes(action)) return {ok: false, err: 'unknown action'};
    if (!validCode(code)) return {ok: false, err: (label(code) || code) + ' cannot be used (reserved key)'};
    const prev = rev[code]; let moved = null;
    if (prev && prev !== action) { delete map[prev]; moved = prev; }
    map[action] = code; index(); save(); notify();
    return {ok: true, moved};
  }
  function clear(action) { if (map[action]) { delete map[action]; index(); save(); notify(); } }
  function preset(name) { if (!PRESETS[name]) return false; map = Object.assign({}, PRESETS[name].map); index(); save(); notify(); return true; }
  const reset = () => preset('elita');
  const exportText = () => JSON.stringify({elita1_keys: 1, map}, null, 2) + '\n';
  function importText(t) {
    let o; try { o = JSON.parse(t); } catch (e) { return 'not a JSON file'; }
    if (!o || o.elita1_keys !== 1 || typeof o.map !== 'object' || !o.map) return 'not an ELITA-1 key map file';
    map = clean(o.map); index(); save(); notify(); return '';
  }
  // true while a key press must not be treated as playing: modifier combinations, text fields, open dialogs (Settings, Key config, theme, …)
  const typing = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    const t = e.target; if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return true;
    return !!document.querySelector('dialog[open]');
  };
  E.keymap = {actionOf: c => rev[c] || null, codeOf: a => map[a] || null, label, set, clear, preset, reset, get: () => Object.assign({}, map), export: exportText, import: importText,
    typing, on: f => { subs.push(f); }, actions: ACTIONS, notes: NOTES, funcs: FUNCS, names: FNAME, presets: Object.keys(PRESETS).map(k => [k, PRESETS[k].name]), reserved: c => !validCode(c)};
})();
