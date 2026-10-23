/* Settings window ("settings" button under Patch Parameters).
   Engine options that are not patch parameters. The choice is kept in this browser (localStorage); nothing is sent anywhere.
   Defaults = the sound of ver 0.5.53 (everything below is off or "standard").
   ELITA.settings = {get(), set(key, value), reset(), items}      keys: limits / filter / ladder / syncAA / slop / drift (the "Key config…" button opens js/keyconfig.js)
   "Voice limits" = Synth1 spec lifts the ELITA limits (5 voices, unison 3) to the ranges of the real Synth1 panel (poly up to 32 = the patch's poly number, unison up to 8).
   While it is on, a badge in the title bar says so. */
(function () {
  const E = window.ELITA, S = E.core, KEY = 'elita1-settings';
  const ITEMS = [
    {k: 'limits', title: 'Voice limits', opts: [['elita', 'ELITA (5 voices, unison 3)'], ['synth1', 'Synth1 spec (poly 32, unison 8)']],
     note: 'ELITA keeps 5 voices and at most 3 unison voices per oscillator, to stay light. Synth1 spec uses the ranges of the real panel: as many voices as the patch\'s poly number (up to 32) and up to 8 unison voices. It needs much more CPU (the sound may crackle on a slow computer), and a badge in the title bar shows that it is on. Unison is still not available for pulse waves.'},
    {k: 'filter', title: 'Filter engine', opts: [['biquad', 'Biquad'], ['ladder', 'Ladder']],
     note: 'Biquad: the standard filter, tuned to Synth1 recordings. Ladder: experimental 4-pole 24 dB/oct (zero-delay feedback). Only Low-pass 24 dB uses the ladder; HP / BP / 12 dB stay biquad.'},
    {k: 'ladder', title: 'Ladder character', opts: [['soft', 'Soft limit'], ['stage', 'Per-stage tanh']], needs: ['filter', 'ladder'],
     note: 'Soft limit: clean linear stages, only a strong resonance is limited. Per-stage tanh: every stage saturates like a transistor ladder (warmer, resonance levels off by itself).'},
    {k: 'syncAA', title: 'Hard sync anti-aliasing', opts: [[0, 'Off'], [1, 'PolyBLEP']],
     note: 'Smooths the jump at each sync reset and the edges of the slave wave (PolyBLEP / PolyBLAMP). Less aliasing in the sync sweep; adds a 1-sample delay to the sync oscillator.'},
    {k: 'slop', title: 'Voice variance', opts: [[0, 'Off'], [1, 'Low'], [2, 'Medium'], [3, 'High']],
     note: 'Each voice gets a small fixed pitch and cutoff offset (about 2 / 5 / 9 cents), like analog voice cards. The same note sounds slightly different on each of the 5 voices, always in the same way.'},
    {k: 'drift', title: 'Slow drift', opts: [[0, 'Off'], [1, 'Low'], [2, 'Medium'], [3, 'High']],
     note: 'Pitch and cutoff of each voice wander slowly and randomly (time constant about 3 s). Not repeatable from note to note.'},
  ];
  const DEF = {limits: 'elita', filter: 'biquad', ladder: 'soft', syncAA: 0, slop: 0, drift: 0};
  const SLOP = [0, 2, 5, 9], DRIFT = [0, 2, 4, 8];
  const ok = (k, v) => { const it = ITEMS.find(x => x.k === k); return !!it && it.opts.some(o => o[0] === v); };
  let cur = Object.assign({}, DEF);
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') Object.keys(DEF).forEach(k => { if (ok(k, s[k])) cur[k] = s[k]; }); } catch (e) { /* no storage */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* ignore */ } };
  function apply() {
    S.LIMITS = cur.limits; badge();
    S.FILTER = cur.filter; S.LADDER_SAT = cur.ladder; S.SYNC_AA = !!cur.syncAA;
    S.analog.slop = SLOP[cur.slop]; S.analog.drift = DRIFT[cur.drift];
    if (E.engine && E.engine.refresh) E.engine.refresh();
  }
  // Title-bar badge and highlighted settings button while the Synth1 spec is on
  function badge() {
    const on = cur.limits === 'synth1', t = document.getElementById('title');
    let b = document.getElementById('s1mode');
    if (on && !b && t) { b = document.createElement('h3'); b.id = 's1mode'; b.className = 's1mode'; b.title = 'Settings > Voice limits: Synth1 spec (poly up to 32, unison up to 8)'; b.textContent = 'SYNTH1 SPEC MODE'; const v = t.querySelector('.version'); t.insertBefore(b, v || null); }
    if (b) b.hidden = !on;
    const sb = document.getElementById('pset'); if (sb) sb.classList.toggle('s1on', on);
    document.body.classList.toggle('s1spec', on);
  }
  function set(k, v) { if (!ok(k, v)) return false; cur[k] = v; save(); apply(); paint(); return true; }
  function reset() { cur = Object.assign({}, DEF); save(); apply(); paint(); }
  E.settings = {get: () => Object.assign({}, cur), set, reset, items: ITEMS.map(i => i.k)};
  apply();                                                   // before the audio starts: the values are read when the voices are built / updated

  // ---- window ----
  const css = document.createElement('style');
  css.textContent = `#setdlg{ width:min(540px,94vw); max-height:86vh; padding:0; border:1px solid var(--dk); background:var(--bg); color:var(--ink); font:12px/1.4 "Hiragino Sans","Yu Gothic UI",system-ui,sans-serif; }
  #setdlg::backdrop{ background:rgba(0,0,0,.45); }
  #setdlg .th{ display:flex; justify-content:space-between; align-items:center; padding:4px 8px; background:var(--hd); border-bottom:1px solid var(--dk); font-weight:700; font-size:13px; }
  #setdlg .tb{ padding:6px 12px 10px; overflow:auto; max-height:calc(86vh - 80px); }
  #setdlg button{ background:var(--dk); color:var(--on-dk); font:700 11px inherit; padding:3px 10px; border-radius:3px; box-shadow:inset 0 -2px 0 var(--dk-sh); cursor:pointer; }
  #setdlg .it{ padding:6px 0 7px; border-bottom:1px solid var(--dk); }
  #setdlg .it:last-child{ border-bottom:0; }
  #setdlg .it.dis{ opacity:.45; }
  #setdlg .it h4{ margin:0 0 3px; font-size:12px; }
  #setdlg .sg{ display:flex; gap:4px; flex-wrap:wrap; }
  #setdlg .sg button.cur{ background:var(--hi); color:var(--hi-fg); box-shadow:inset 0 -2px 0 rgba(0,0,0,.25); }
  #setdlg .nt{ margin:4px 0 0; font-size:11px; opacity:.8; }
  #setdlg .tf{ display:flex; gap:6px; padding:5px 10px; border-top:1px solid var(--dk); background:var(--hd); align-items:center; }
  #setdlg .tf small{ margin-left:auto; opacity:.8; }
  #plist .tools button#pset{ background:var(--dk); }
  #plist .tools button#pset.s1on{ background:var(--hi); color:var(--hi-fg); }
  #title .s1mode{ padding:1px 10px; background:var(--hi); color:var(--hi-fg); font-weight:700; font-size:11px; letter-spacing:.04em; white-space:nowrap; }
  #title .s1mode[hidden]{ display:none; }
  #vc{ white-space:nowrap; }`;
  document.head.appendChild(css);
  const dlg = document.createElement('dialog'); dlg.id = 'setdlg';
  dlg.innerHTML = '<div class="th"><span>Settings</span><button type="button" id="setclose">close</button></div><div class="tb">' +
    ITEMS.map(it => `<div class="it" data-k="${it.k}"><h4>${it.title}</h4><div class="sg">${it.opts.map(o => `<button type="button" data-v="${o[0]}">${o[1]}</button>`).join('')}</div><p class="nt">${it.note}</p></div>`).join('') +
    '<div class="it"><h4>Keyboard</h4><div class="sg"><button type="button" id="setkeys">Key config…</button></div><p class="nt">Choose which PC keys play the notes (all 25 keys), shift the octave, switch patches and stop all notes. Not reset by "reset to defaults".</p></div>' +
    '</div><div class="tf"><button type="button" id="setreset">reset to defaults</button><small>saved in this browser</small></div>';
  document.body.appendChild(dlg);
  function paint() {
    ITEMS.forEach(it => {
      const box = dlg.querySelector(`.it[data-k="${it.k}"]`);
      box.querySelectorAll('button').forEach(b => b.classList.toggle('cur', String(cur[it.k]) === b.dataset.v));
      box.classList.toggle('dis', !!it.needs && cur[it.needs[0]] !== it.needs[1]);
    });
  }
  dlg.querySelector('.tb').onclick = e => {
    const b = e.target.closest('button'), box = b && b.closest('.it'); if (!b || !box) return;
    if (b.id === 'setkeys') { dlg.close(); if (E.keyconfig) E.keyconfig.open(); return; }
    const it = ITEMS.find(x => x.k === box.dataset.k), o = it.opts.find(x => String(x[0]) === b.dataset.v); set(it.k, o[0]);
  };
  dlg.querySelector('#setreset').onclick = reset;
  dlg.querySelector('#setclose').onclick = () => dlg.close();
  const tools = document.querySelector('#plist .tools');
  if (tools) { const b = document.createElement('button'); b.type = 'button'; b.id = 'pset'; b.textContent = 'settings'; b.title = 'settings: voice limits, filter, hard sync, analog character, keyboard'; tools.appendChild(b); b.onclick = () => { paint(); dlg.showModal(); }; }
  badge(); paint();
})();
