/* Settings window ("settings" button under Patch Parameters).
   Engine options that are not patch parameters. The choice is kept in this browser (localStorage); nothing is sent anywhere.
   Defaults = the sound of ver 0.5.53 (everything below is off or "standard").
   ELITA.settings = {get(), set(key, value), reset(), items}      keys: filter / ladder / syncAA / slop / drift */
(function () {
  const E = window.ELITA, S = E.core, KEY = 'elita1-settings';
  const ITEMS = [
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
  const DEF = {filter: 'biquad', ladder: 'soft', syncAA: 0, slop: 0, drift: 0};
  const SLOP = [0, 2, 5, 9], DRIFT = [0, 2, 4, 8];
  const ok = (k, v) => { const it = ITEMS.find(x => x.k === k); return !!it && it.opts.some(o => o[0] === v); };
  let cur = Object.assign({}, DEF);
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') Object.keys(DEF).forEach(k => { if (ok(k, s[k])) cur[k] = s[k]; }); } catch (e) { /* no storage */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* ignore */ } };
  function apply() {
    S.FILTER = cur.filter; S.LADDER_SAT = cur.ladder; S.SYNC_AA = !!cur.syncAA;
    S.analog.slop = SLOP[cur.slop]; S.analog.drift = DRIFT[cur.drift];
    if (E.engine && E.engine.refresh) E.engine.refresh();
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
  #plist .tools button#pset{ background:var(--dk); }`;
  document.head.appendChild(css);
  const dlg = document.createElement('dialog'); dlg.id = 'setdlg';
  dlg.innerHTML = '<div class="th"><span>Settings</span><button type="button" id="setclose">close</button></div><div class="tb">' +
    ITEMS.map(it => `<div class="it" data-k="${it.k}"><h4>${it.title}</h4><div class="sg">${it.opts.map(o => `<button type="button" data-v="${o[0]}">${o[1]}</button>`).join('')}</div><p class="nt">${it.note}</p></div>`).join('') +
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
    const it = ITEMS.find(x => x.k === box.dataset.k), o = it.opts.find(x => String(x[0]) === b.dataset.v); set(it.k, o[0]);
  };
  dlg.querySelector('#setreset').onclick = reset;
  dlg.querySelector('#setclose').onclick = () => dlg.close();
  const tools = document.querySelector('#plist .tools');
  if (tools) { const b = document.createElement('button'); b.type = 'button'; b.id = 'pset'; b.textContent = 'settings'; b.title = 'engine settings (filter, hard sync, analog character)'; tools.appendChild(b); b.onclick = () => { paint(); dlg.showModal(); }; }
  paint();
})();
