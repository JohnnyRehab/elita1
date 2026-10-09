/* Session log: records what the user plays and changes, as a text file that can be handed to someone (e.g. Claude) for review.
   UI: "● log" button in the Patch Parameters panel -> starts recording; the button turns into "■ save log" -> stops and downloads elita1-log-YYYYMMDD-HHMMSS.txt.
   Console:  ELITA.log.start()   ELITA.log.stop()   ELITA.log.text()   ELITA.log.save()
   Recorded:  header (version, browser, audio), patch loads (with the parameters that differ from the defaults), parameter changes (grouped),
              key presses (note, velocity, voice), MML plays, BPM, output level while sound is playing, errors, final state as a .sy1 block.
   Not recorded:  anything outside this page, file contents other than the patch itself, keyboard text. Nothing is sent anywhere: the file is only saved on this computer. */
(function () {
  const E = window.ELITA, $ = id => document.getElementById(id);
  const MAXLINES = 30000, NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const nn = n => NOTES[n % 12] + (Math.floor(n / 12) - 1), p2 = n => String(n).padStart(2, '0'), db = x => x > 1e-5 ? (20 * Math.log10(x)).toFixed(1) : '-inf';
  let rec = null;

  const nameOf = no => (E.names && E.names[no]) || '';
  const fmtT = ms => { const s = ms / 1000; return '[' + p2(Math.floor(s / 60)) + ':' + p2(Math.floor(s % 60)) + '.' + String(Math.round(ms % 1000)).padStart(3, '0') + ']'; };
  function add(msg) {
    if (!rec) return;
    if (rec.lines.length >= MAXLINES) { if (!rec.full) { rec.full = true; rec.lines.push(fmtT(performance.now() - rec.t0) + ' (log is full: further events are not recorded)'); } return; }
    rec.lines.push(fmtT(performance.now() - rec.t0) + ' ' + msg);
  }
  const changedList = () => Object.keys(E.params).filter(k => k !== 'vol' && E.params[k] !== E.defaults[k]).map(Number).sort((a, b) => a - b)
    .map(k => '#' + k + ' ' + nameOf(k) + ' = ' + E.params[k] + ' (default ' + E.defaults[k] + ')');
  const patchName = () => { const n = $('pname'), i = $('pidx'); return ((E.patch && E.patch.name) || (n ? n.textContent : '?')) + (i && i.textContent ? '  ' + i.textContent : ''); };

  // ---- parameter changes: grouped, so a knob drag becomes one line; a whole patch load becomes one block ----
  function flush() {
    if (!rec) return;
    const keys = Object.keys(rec.pend).map(Number);
    rec.timer = null; if (!keys.length) return;
    if (keys.length >= 25) {                                                  // many at once = patch load / reset
      add('PATCH LOAD  "' + patchName() + '"  (' + keys.length + ' parameters set)');
      changedList().forEach(l => rec.lines.push('             ' + l));
      rec.patches.add(patchName());
    } else keys.sort((a, b) => a - b).forEach(k => {
      const o = rec.pend[k]; if (o.from === o.to) return;
      rec.counts[k] = (rec.counts[k] || 0) + o.n;
      add('PARAM  #' + k + ' ' + nameOf(k) + '  ' + o.from + ' -> ' + o.to + (o.n > 1 ? '  (' + o.n + ' steps)' : ''));
    });
    keys.forEach(k => { rec.last[k] = rec.pend[k].to; }); rec.pend = {};
  }
  function onParam(no, v) {
    if (!rec || no === 'vol' && false) return;
    const o = rec.pend[no] || (rec.pend[no] = {from: rec.last[no], to: v, n: 0}); o.to = v; o.n++;
    clearTimeout(rec.timer); rec.timer = setTimeout(flush, 400);
  }

  // ---- notes ----
  function wrapEngine() {
    const en = E.engine; if (!en || en._logWrapped) return; en._logWrapped = true;
    const on = en.noteOn, off = en.noteOff;
    en.noteOn = function (n, vel) {
      const r = on.apply(this, arguments);
      if (rec) { const v = en.voices && en.voices(), i = v ? v.findIndex(x => x.on && x.note === n) : -1, act = v ? v.filter(x => x.on).length : 0;
        rec.notes.push(n); add('NOTE on   ' + nn(n) + ' (' + n + ')  vel ' + Math.round((vel == null ? 0.8 : vel) * 127) + (i >= 0 ? '  voice#' + i : '') + '  active ' + act + '/' + en.POLY + (E.params[59] ? '  [arp on: steps are generated]' : '')); }
      return r;
    };
    en.noteOff = function (n) { const r = off.apply(this, arguments); if (rec) add('NOTE off  ' + nn(n) + ' (' + n + ')'); return r; };
  }
  function wrapMml() {
    if (!E.mml || E.mml._logWrapped) return; E.mml._logWrapped = true;
    const play = E.mml.play, stop = E.mml.stop;
    E.mml.play = function (t) { if (rec) add('MML play  ' + JSON.stringify(String(t).slice(0, 400))); return play.apply(this, arguments); };
    E.mml.stop = function () { if (rec) add('MML stop'); return stop.apply(this, arguments); };
  }

  // ---- level while sound is playing ----
  function sample() {
    const en = E.engine, v = en && en.voices && en.voices(); if (!rec || !v) return;
    const act = v.filter(x => x.on); if (!act.length) return;
    let pk = 0, ss = 0, c = 0; try { const w = en.wave(); if (w) for (const x of w.getValue()) { const a = Math.abs(x); if (a > pk) pk = a; ss += x * x; c++; } } catch (e) {}
    rec.maxPeak = Math.max(rec.maxPeak, pk);
    add('LEVEL     peak ' + db(pk) + ' dB  rms ' + db(c ? Math.sqrt(ss / c) : 0) + ' dB  sounding ' + act.map(x => x.note).sort((a, b) => a - b).map(nn).join(' '));
  }

  function start() {
    if (rec) return;
    wrapEngine(); wrapMml();
    const ctx = window.Tone && Tone.getContext && Tone.getContext();
    rec = {t0: performance.now(), when: new Date(), lines: [], pend: {}, last: Object.assign({}, E.params), counts: {}, notes: [], patches: new Set(), maxPeak: 0, timer: null, full: false};
    const ver = document.querySelector('#title .version'), upd = document.querySelector('#title .date'), bpm = $('bpm');
    const head = [
      'ELITA-1 session log',
      'app         : ' + (ver ? ver.textContent : '?') + '  ' + (upd ? upd.textContent : ''),
      'recorded    : ' + rec.when.toString(),
      'browser     : ' + navigator.userAgent,
      'audio       : ' + (ctx ? ctx.state + ', ' + (ctx.rawContext ? ctx.rawContext.sampleRate : '?') + ' Hz' : 'not started yet') + ', AudioWorklet ' + (window.AudioWorkletNode ? 'yes' : 'no'),
      'window      : ' + innerWidth + 'x' + innerHeight,
      'bpm box     : ' + (bpm ? bpm.value : '?'),
      'patch       : ' + patchName(),
      '',
      '== parameters at the start (only those that differ from the defaults) ==', ...(changedList().length ? changedList() : ['(all defaults)']), '',
      '== timeline (mm:ss.mmm from the start of the recording) =='];
    rec.head = head; rec.iv = setInterval(sample, 250); rec.uiIv = setInterval(ui, 500);
    rec.mo = new MutationObserver(() => { if (rec && rec.lastName !== patchName()) { rec.lastName = patchName(); setTimeout(() => add('PATCH NAME "' + patchName() + '"' + ($('pinfo') ? '  ' + $('pinfo').textContent.trim() : '')), 450); } });
    ['pname', 'pidx'].forEach(id => $(id) && rec.mo.observe($(id), {childList: true, characterData: true, subtree: true}));
    rec.lastName = patchName();
    rec.err = e => add('ERROR     ' + (e.message || (e.reason && (e.reason.message || e.reason)) || e));
    addEventListener('error', rec.err); addEventListener('unhandledrejection', rec.err);
    rec.bpm = () => add('BPM       ' + (bpm ? bpm.value : '?')); bpm && bpm.addEventListener('change', rec.bpm);
    add('START'); ui();
  }
  function stop() {
    if (!rec) return null; flush();
    const r = rec; clearInterval(r.iv); clearInterval(r.uiIv); r.mo.disconnect(); removeEventListener('error', r.err); removeEventListener('unhandledrejection', r.err);
    const bpm = $('bpm'); bpm && bpm.removeEventListener('change', r.bpm);
    r.lines.push(fmtT(performance.now() - r.t0) + ' STOP'); r.text = build(r); rec = null; E.log._last = r.text; ui(); return r.text;
  }
  function build(r) {
    const cnt = Object.keys(r.counts).map(Number).sort((a, b) => r.counts[b] - r.counts[a]).slice(0, 12).map(k => '#' + k + ' ' + nameOf(k) + ' x' + r.counts[k]);
    const nm = r.notes.length ? nn(Math.min(...r.notes)) + ' .. ' + nn(Math.max(...r.notes)) : '-';
    const sum = ['', '== summary ==', 'duration     : ' + ((performance.now() - r.t0) / 1000).toFixed(1) + ' s', 'notes played : ' + r.notes.length + '  (range ' + nm + ')',
      'patches      : ' + (r.patches.size ? [...r.patches].join(' / ') : '(none loaded during the recording)'), 'max peak     : ' + db(r.maxPeak) + ' dB', 'most changed : ' + (cnt.length ? cnt.join(', ') : '-')];
    const fin = ['', '== final state: parameters that differ from the defaults ==', ...(changedList().length ? changedList() : ['(all defaults)']),
      '', '== final state as a Synth1 patch (.sy1) =='];
    let sy = ''; try { sy = E.exportSy1().replace(/\r\n/g, '\n').trim(); } catch (e) { sy = '(export failed: ' + e.message + ')'; }
    return [...r.head, ...r.lines, ...sum, ...fin, sy, ''].join('\n');
  }
  function save() {
    const t = rec ? stop() : E.log._last; if (!t) return;
    const d = new Date(), f = 'elita1-log-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + '.txt';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], {type: 'text/plain;charset=utf-8'})); a.download = f; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return f;
  }
  E.log = {start, stop, save, text: () => rec ? build(Object.assign({}, rec, {lines: rec.lines.slice()})) : E.log._last || '', _last: ''};

  // ---- button (inside the Patch Parameters tool row) ----
  const css = document.createElement('style');
  css.textContent = '#plist .tools button.rec{ background:var(--btn); color:var(--btn-fg); } #plist .tools button.rec.on{ background:var(--btn); box-shadow:0 0 0 2px var(--on) inset; }';
  document.head.appendChild(css);
  const tools = document.querySelector('#plist .tools'); let btn = null;
  if (tools) {
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'rec'; btn.id = 'plog';
    btn.title = 'record what you play and change; click again to stop and save a .txt log'; tools.insertBefore(btn, tools.querySelector('#pexp') || tools.firstChild.nextSibling);
    btn.onclick = () => { if (rec) save(); else start(); };
  }
  function ui() {
    if (!btn) return;
    if (rec) { const s = Math.round((performance.now() - rec.t0) / 1000); btn.classList.add('on'); btn.textContent = '■ save log ' + Math.floor(s / 60) + ':' + p2(s % 60) + ' · ' + rec.lines.length; }
    else { btn.classList.remove('on'); btn.textContent = '● log'; }
  }
  ui();
  const prev = E.onChange; E.onChange = (n, v) => { if (prev) prev(n, v); onParam(n, v); };
})();
