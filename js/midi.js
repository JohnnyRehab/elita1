/* MIDI input for ELITA-1 (Web MIDI API: Chrome / Edge; Safari does not support it).
   Another application (a sequencer in another browser tab, a DAW, a hardware keyboard) can play ELITA-1 through a MIDI port.
   Between two browser tabs a virtual MIDI port is needed: macOS "IAC Driver", Windows "loopMIDI" (or any other virtual port).
   UI: "MIDI" button next to the patch display -> panel (device, channel, pitch-bend range, clock -> BPM, velocity, CC map).
   Received:  Note On/Off (+velocity), Pitch Bend, Control Change (CC map below, CC64 sustain), CC120/123 all off, MIDI clock (24 ppqn) / start / stop.
   CC map:    default CC1 -> LFO1 amt, CC74 -> filter frq, CC71 -> filter res, CC64 -> sustain.  Right-click a knob -> "LEARN CC", then move a CC.
              The settings and the CC map are kept in this browser (localStorage).
   Console:   ELITA.midi.state()   ELITA.midi.send([0x90, 60, 100])  (feeds a message in as if it came from the port: handy for testing) */
(function () {
  const E = window.ELITA, EN = E.engine, $ = id => document.getElementById(id), KEY = 'elita1.midi';
  const DEFMAP = {1: 44, 74: 19, 71: 20, 64: 'hold'};
  const BENDS = [1, 2, 3, 5, 7, 12, 24];
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], nn = n => NOTES[n % 12] + (Math.floor(n / 12) - 1);
  let cfg = {dev: '', ch: 0, bend: 2, clock: true, vel: true, map: Object.assign({}, DEFMAP)};   // ch 0 = OMNI, 1..16
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) cfg = Object.assign(cfg, s, {map: Object.assign({}, s.map || DEFMAP)}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };

  let access = null, input = null, err = '', learning = null, panel = null, last = '', bpmShown = 0, clockOn = false, flash = 0;
  const down = new Set(), sus = new Set(); let hold = false;       // physically held notes / notes kept alive by the sustain pedal
  const ticks = []; let tickCount = 0;

  const nameOf = t => t === 'hold' ? 'sustain (hold)' : (E.names && E.names[t]) || ('#' + t);

  /* ---------- engine side ---------- */
  const play = (n, v) => EN.start().then(() => EN.noteOn(n, v));
  function noteOn(n, v) { sus.delete(n); down.add(n); play(n, cfg.vel ? Math.max(0.05, v / 127) : 0.8); }
  function noteOff(n) { down.delete(n); if (hold) sus.add(n); else EN.noteOff(n); }
  function setHold(on) { if (on === hold) return; hold = on; if (!on) { sus.forEach(n => { if (!down.has(n)) EN.noteOff(n); }); sus.clear(); } }
  function allOff() { down.clear(); sus.clear(); hold = false; EN.allOff(); }
  function param(no, v) { E.set(no, v); if (E.onChange) E.onChange(no, v); const i = $('pinfo'); if (i) i.textContent = (E.names[no] || '#' + no) + ' = ' + v; }
  function cc(c, v) {
    if (learning != null) { learn(c); return; }
    const t = cfg.map[c];
    if (t === 'hold') setHold(v >= 64);
    else if (t != null) param(t, v);
    else if (c === 120 || c === 123) allOff();
  }

  /* ---------- clock -> BPM ---------- */
  function clockTick(ts) {
    ticks.push(ts); if (ticks.length > 49) ticks.shift();
    if (++tickCount % 24 || ticks.length < 25 || !cfg.clock) return;
    const bpm = 60000 / ((ticks[ticks.length - 1] - ticks[0]) / (ticks.length - 1) * 24);
    if (bpm >= 30 && bpm <= 330) { bpmShown = bpm; const r = Math.round(bpm); if (r !== E.bpm() && E.setBpm) E.setBpm(r); }
  }

  /* ---------- message handler ---------- */
  function onMsg(ev) { handle(ev.data, ev.timeStamp); }
  function handle(d, ts) {
    const s = d[0];
    if (s >= 0xF8) {                                                // realtime (any channel)
      if (s === 0xF8) { clockOn = true; clockTick(ts); }
      else if (s === 0xFA || s === 0xFB) { ticks.length = 0; tickCount = 0; last = s === 0xFA ? 'start' : 'continue'; }
      else if (s === 0xFC) { last = 'stop'; ticks.length = 0; tickCount = 0; }
      return pulse();
    }
    if (s < 0x80 || s >= 0xF0) return;
    if (cfg.ch && (s & 15) !== cfg.ch - 1) return;
    const k = s & 0xF0;
    if (k === 0x90 && d[2] > 0) { noteOn(d[1], d[2]); last = 'note ' + nn(d[1]) + ' vel ' + d[2]; }
    else if (k === 0x80 || k === 0x90) { noteOff(d[1]); last = 'off ' + nn(d[1]); }
    else if (k === 0xE0) { const v = ((d[2] << 7) | d[1]) - 8192; EN.bend(v / 8192 * cfg.bend); last = 'bend ' + (v / 8192 * cfg.bend).toFixed(2); }
    else if (k === 0xB0) { cc(d[1], d[2]); last = 'CC' + d[1] + ' = ' + d[2]; }
    pulse();
  }

  /* ---------- device handling ---------- */
  function attach() {
    if (input) { input.onmidimessage = null; input = null; }
    if (access && cfg.dev) { access.inputs.forEach(i => { if (!input && (i.id === cfg.dev || i.name === cfg.dev)) input = i; }); }
    if (input) { input.onmidimessage = onMsg; }
    allOffSafe(); status(); render();
  }
  const allOffSafe = () => { down.clear(); sus.clear(); hold = false; EN.bend(0); };
  async function init() {
    if (access) return true;
    if (!navigator.requestMIDIAccess) { err = 'Web MIDI is not supported in this browser (use Chrome or Edge).'; return false; }
    try { access = await navigator.requestMIDIAccess({sysex: false}); err = ''; access.onstatechange = () => { attach(); }; return true; }
    catch (e) { err = 'MIDI access was not allowed (' + (e.message || e.name) + ').'; return false; }
  }
  const devices = () => { const a = []; if (access) access.inputs.forEach(i => a.push({id: i.id, name: i.name || i.id, ok: i.state === 'connected'})); return a; };

  /* ---------- CC learn ---------- */
  function startLearn(no) { cancelLearn(); learning = no; const w = document.querySelector('[data-no="' + no + '"]'); if (w) w.classList.add('learning'); status(); render(); }
  function cancelLearn() { learning = null; document.querySelectorAll('.learning').forEach(w => w.classList.remove('learning')); status(); render(); }
  function learn(c) {
    const no = learning;
    Object.keys(cfg.map).forEach(k => { if (cfg.map[k] === no) delete cfg.map[k]; });
    cfg.map[c] = no; save(); last = 'CC' + c + ' -> ' + nameOf(no); cancelLearn();
  }
  let ctx = null;
  const closeCtx = () => { if (ctx) { ctx.remove(); ctx = null; } };
  document.addEventListener('contextmenu', e => {
    const w = e.target.closest && e.target.closest('[data-no]'); if (!w) return;
    e.preventDefault(); closeCtx();
    const no = +w.dataset.no, cur = Object.keys(cfg.map).filter(k => cfg.map[k] === no);
    ctx = document.createElement('div'); ctx.className = 'lcdmenu pl';
    const add = (t, f) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'lcdopt'; b.textContent = t; b.onclick = () => { closeCtx(); f(); }; ctx.appendChild(b); };
    add('LEARN CC… (' + (E.names[no] || '#' + no) + ')', async () => { if (await init()) { if (!input) openPanel(); startLearn(no); } else openPanel(); });
    cur.forEach(k => add('clear CC' + k, () => { delete cfg.map[k]; save(); render(); }));
    document.body.appendChild(ctx);
    ctx.style.left = Math.min(e.clientX, innerWidth - ctx.offsetWidth - 4) + 'px'; ctx.style.top = Math.min(e.clientY, innerHeight - ctx.offsetHeight - 4) + 'px';
  });
  document.addEventListener('pointerdown', e => { if (ctx && !ctx.contains(e.target)) closeCtx(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCtx(); if (learning != null) cancelLearn(); } });

  /* ---------- UI ---------- */
  const pb = $('pbtns'), btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn midibtn'; btn.textContent = 'MIDI'; btn.title = 'MIDI input (Web MIDI)'; pb && pb.appendChild(btn);
  const stat = document.createElement('div'); stat.id = 'midistat'; document.body.appendChild(stat);
  const dot = document.createElement('i'); dot.className = 'mdot'; btn.append(' ', dot);
  function pulse() { flash = performance.now(); btn.classList.add('act'); stat.textContent = statusText(); clearTimeout(pulse.t); pulse.t = setTimeout(() => btn.classList.remove('act'), 90); }
  const statusText = () => input ? 'MIDI IN  ' + (input.name || input.id) + ' | ch ' + (cfg.ch || 'OMNI') + (last ? ' | ' + last : '') + (clockOn && cfg.clock && bpmShown ? ' | ♪ ' + bpmShown.toFixed(1) + ' BPM' : '') + (learning != null ? ' | LEARN: move a CC for ' + nameOf(learning) : '') : '';
  function status() {
    btn.classList.toggle('on', !!input); stat.textContent = statusText(); stat.style.display = input || learning != null ? 'block' : 'none';
    if (!input && learning != null) stat.textContent = 'LEARN: select a MIDI device first';
  }
  function openPanel() {
    if (panel) { closePanel(); return; }
    panel = document.createElement('div'); panel.className = 'lcdmenu midipanel'; document.body.appendChild(panel);
    init().then(() => { render(); place(); });
    render(); place();
  }
  function closePanel() { if (panel) { panel.remove(); panel = null; } }
  function place() {
    if (!panel) return;
    const r = btn.getBoundingClientRect();
    panel.style.left = Math.max(4, Math.min(r.left - 380, innerWidth - panel.offsetWidth - 4)) + 'px';
    panel.style.top = Math.max(4, Math.min(r.bottom - panel.offsetHeight, innerHeight - panel.offsetHeight - 4)) + 'px';
  }
  document.addEventListener('pointerdown', e => { if (panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePanel(); }, true);
  btn.onclick = openPanel;

  function render() {
    if (!panel) return;
    const h = (tag, cls, p, t) => { const e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; p.appendChild(e); return e; };
    const b = (p, t, f, cls) => { const e = h('button', cls || 'lcdopt', p, t); e.type = 'button'; e.onclick = ev => { ev.stopPropagation(); f(); }; return e; };
    const line = (p, label) => { const r = h('div', 'mrow', p); h('span', 'dim', r, label); return h('span', '', r); };
    panel.textContent = '';
    const hd = h('div', 'mhead', panel); h('span', '', hd, 'MIDI INPUT'); h('span', 'dim', hd, err ? 'unavailable' : access ? 'Web MIDI: ready' : 'Web MIDI: …');
    if (err) { h('div', 'merr', panel, err); }
    h('div', 'dim', panel, 'device');
    const list = devices();
    list.forEach(d => b(panel, d.name + (d.ok ? '' : ' (offline)'), () => { cfg.dev = d.id; save(); EN.start(); attach(); }, 'lcdopt' + (input && input.id === d.id ? ' sel' : '')));
    b(panel, '(none)', () => { cfg.dev = ''; save(); attach(); }, 'lcdopt' + (!input ? ' sel' : ''));
    if (access && !list.length) h('div', 'dim', panel, 'no MIDI input found: connect a keyboard or create a virtual port (IAC Driver / loopMIDI)');
    const step = (p, label, get, fn) => { const v = line(p, label); b(v, '<', () => { fn(-1); save(); render(); }, 'sb2'); h('span', 'val', v, get()); b(v, '>', () => { fn(1); save(); render(); }, 'sb2'); };
    step(panel, 'channel', () => cfg.ch ? cfg.ch : 'OMNI', d => { cfg.ch = (cfg.ch + d + 17) % 17; });
    step(panel, 'pitch-bend range', () => '±' + cfg.bend, d => { cfg.bend = BENDS[Math.max(0, Math.min(BENDS.length - 1, BENDS.indexOf(cfg.bend) + d))]; });
    const tg = (label, key, extra) => { const v = line(panel, label); b(v, (cfg[key] ? '[x] ' : '[ ] ') + (extra ? extra() : ''), () => { cfg[key] = !cfg[key]; save(); render(); }, 'lcdopt tgl'); };
    tg('clock → BPM sync', 'clock', () => bpmShown ? bpmShown.toFixed(1) : '');
    tg('velocity → amp', 'vel');
    h('div', 'msep dim', panel, 'CC MAP   (right-click a knob → LEARN CC)');
    const ks = Object.keys(cfg.map).map(Number).sort((a, c) => a - c);
    ks.forEach(k => { const r = h('div', 'mrow', panel); h('span', '', r, 'CC ' + k); const t = h('span', 'tgt', r, '→ ' + nameOf(cfg.map[k])); b(r, '×', () => { delete cfg.map[k]; save(); render(); }, 'sb2'); });
    if (learning != null) h('div', 'mrow', panel).textContent = 'learning… ' + nameOf(learning);
    const ft = h('div', 'mfoot', panel);
    b(ft, 'reset map', () => { cfg.map = Object.assign({}, DEFMAP); save(); render(); }, 'btn');
    b(ft, 'export', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({elita1MidiMap: cfg.map}, null, 1)], {type: 'application/json'})); a.download = 'elita1-midimap.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }, 'btn');
    const imp = h('label', 'btn', ft, 'import'); const f = h('input', '', imp); f.type = 'file'; f.accept = '.json';
    f.onchange = () => { const fl = f.files[0]; if (!fl) return; fl.text().then(t => { try { const m = JSON.parse(t).elita1MidiMap; if (m && typeof m === 'object') { cfg.map = {}; Object.keys(m).forEach(k => { if (m[k] === 'hold' || E.names[m[k]]) cfg.map[+k] = m[k]; }); save(); render(); } } catch (e) { err = 'import failed: not a CC map file'; render(); } }); };
    b(ft, 'close', closePanel, 'btn r');
    place();
  }

  // restore the last device quietly: only if the permission was already granted (no prompt without a click)
  if (navigator.permissions && navigator.permissions.query && navigator.requestMIDIAccess && cfg.dev) {
    navigator.permissions.query({name: 'midi'}).then(p => { if (p.state === 'granted') init().then(attach); }).catch(() => {});
  }
  status();
  E.midi = {state: () => ({device: input && input.name, channel: cfg.ch, bend: cfg.bend, clock: cfg.clock, vel: cfg.vel, map: Object.assign({}, cfg.map), hold, bpm: bpmShown}), send: d => handle(d, performance.now()), config: cfg, open: openPanel};
})();
