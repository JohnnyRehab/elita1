/* MML (Music Macro Language) player for ELITA-1. Plays through the engine, so the sound is whatever patch is on the panel.
     ELITA.mml.play("t120 o4 l8 cdefgab>c")     play      ELITA.mml.stop()     stop
     ELITA.mml.parse(text)  ->  {events, duration, warnings}   (no sound; for tools / tests)
   Syntax (case-insensitive, spaces and line breaks are ignored; ';' splits the text into parallel tracks):
     c d e f g a b   note, + or # = sharp, - = flat, then an optional length (4 = quarter, 8 = eighth ...) and dots   e.g.  c+8.  e-4
     r               rest                                  &   tie: the next note of the same pitch continues it   e.g.  c4&c8
     l8              default length                        o4  octave (o4 c = middle C = MIDI 60)     > up one octave     < down one octave
     t120            tempo (BPM; default = the BPM box)    v12 velocity 0..15 (default 12 = 0.8)       q6  gate 1..8 (8 = full length, default)
     'ceg'4          chord (all notes at once, one length)     [ ... ]3   repeat 3 times (2 if no number)     // comment up to the end of the line
   Notes are played with engine.rawOn / rawOff, so the arpeggiator is bypassed. */
(function () {
  const E = window.ELITA, SEMI = {c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11};

  function expandLoops(s) {                         // [ ... ]N  -> repeated text (innermost first)
    let guard = 0, re = /\[([^\[\]]*)\](\d*)/;
    while (re.test(s) && guard++ < 200) s = s.replace(re, (_, body, n) => Array(Math.max(1, Math.min(64, n ? +n : 2)) + 1).join(body + ' '));
    return s;
  }

  function parseTrack(src, bpm, warnings, tn) {
    const ev = []; let i = 0, t = 0, oct = 4, len = 4, tempo = bpm, vel = 12, gate = 8, tie = null, end = 0;
    const s = src.toLowerCase();
    const num = () => { let j = i; while (j < s.length && s[j] >= '0' && s[j] <= '9') j++; const v = j > i ? +s.slice(i, j) : null; i = j; return v; };
    const dots = () => { let d = 0; while (s[i] === '.') { d++; i++; } return d; };
    const beats = (n, d) => { const l = n == null ? len : n; if (!l || l > 192) return null; let b = 4 / l, add = b / 2; for (let k = 0; k < d; k++) { b += add; add /= 2; } return b; };
    const sec = b => b * 60 / tempo;
    const midiOf = (ch, acc, o) => (o + 1) * 12 + SEMI[ch] + acc;
    function note(list, n, d) {                     // one note or chord of `list` (MIDI numbers)
      const b = beats(n, d); if (b == null) { warnings.push(`track ${tn}: bad length at "${s.slice(Math.max(0, i - 6), i)}"`); return; }
      const dur = sec(b), tied = s[i] === '&';
      list.forEach(m => {
        if (tie && tie.note === m && Math.abs(tie.end - t) < 1e-9) {                // continue the held note
          tie.end = t + dur; tie.off.t = tie.end - (tied ? 0 : dur * (1 - gate / 8)); tie.off.keep = tied;
          if (!tied) { tie = null; }
        } else {
          const on = {t, type: 'on', note: m, vel: Math.max(0.05, vel / 15)}, off = {t: t + (tied ? dur : dur * gate / 8), type: 'off', note: m};
          ev.push(on, off); if (tied) tie = {note: m, end: t + dur, off};
        }
      });
      if (!tied) tie = null; else i++;              // skip '&'
      t += dur; end = Math.max(end, t);
    }
    while (i < s.length) {
      const c = s[i++];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '|') continue;
      if (c === '/' && s[i] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c in SEMI) {
        let acc = 0; while (s[i] === '+' || s[i] === '#' || s[i] === '-') { acc += s[i] === '-' ? -1 : 1; i++; }
        const n = num(), d = dots(); note([midiOf(c, acc, oct)], n, d);
      } else if (c === "'") {                       // chord
        const list = []; let o = oct;
        while (i < s.length && s[i] !== "'") {
          const ch = s[i++]; if (ch in SEMI) { let acc = 0; while (s[i] === '+' || s[i] === '#' || s[i] === '-') { acc += s[i] === '-' ? -1 : 1; i++; } list.push(midiOf(ch, acc, o)); }
          else if (ch === '>') o++; else if (ch === '<') o--; else if (ch !== ' ') warnings.push(`track ${tn}: "${ch}" in a chord is ignored`);
        }
        i++; const n = num(), d = dots(); note(list, n, d);
      } else if (c === 'r') { const b = beats(num(), dots()); if (b != null) { t += sec(b); end = Math.max(end, t); tie = null; } }
      else if (c === 'l') { const n = num(); if (n >= 1 && n <= 192) len = n; else warnings.push(`track ${tn}: bad l`); }
      else if (c === 'o') { const n = num(); if (n != null && n >= 0 && n <= 8) oct = n; else warnings.push(`track ${tn}: o needs 0..8`); }
      else if (c === '>') oct = Math.min(8, oct + 1);
      else if (c === '<') oct = Math.max(0, oct - 1);
      else if (c === 't') { const n = num(); if (n >= 20 && n <= 400) tempo = n; else warnings.push(`track ${tn}: t needs 20..400`); }
      else if (c === 'v') { const n = num(); if (n != null && n >= 0 && n <= 15) vel = n; else warnings.push(`track ${tn}: v needs 0..15`); }
      else if (c === 'q') { const n = num(); if (n >= 1 && n <= 8) gate = n; else warnings.push(`track ${tn}: q needs 1..8`); }
      else warnings.push(`track ${tn}: "${c}" is ignored`);
    }
    return {ev, end};
  }

  function parse(text, bpm) {
    const warnings = [], b = bpm || (E.bpm ? E.bpm() : 120), events = []; let duration = 0;
    String(text).replace(/\/\/[^\n]*/g, '').split(';').forEach((tr, k) => {
      if (!tr.trim()) return;
      const r = parseTrack(expandLoops(tr), b, warnings, k + 1); events.push(...r.ev); duration = Math.max(duration, r.end);
    });
    events.sort((x, y) => x.t - y.t || (x.type === 'off' ? -1 : 1) - (y.type === 'off' ? -1 : 1));
    return {events, duration, warnings};
  }

  let timer = null, active = new Set();
  function stop() {
    clearInterval(timer); timer = null;
    const en = E.engine; active.forEach(n => en.rawOff(n)); active.clear();
  }
  function play(text) {
    stop();
    const p = parse(text); if (p.warnings.length) console.warn('[ELITA mml]', p.warnings.join('\n'));
    return E.engine.start().then(() => {
      const en = E.engine, t0 = performance.now() + 40; let k = 0;
      timer = setInterval(() => {
        const now = (performance.now() - t0) / 1000;
        while (k < p.events.length && p.events[k].t <= now) {
          const e = p.events[k++];
          if (e.type === 'on') { en.rawOn(e.note, e.vel); active.add(e.note); } else { en.rawOff(e.note); active.delete(e.note); }
        }
        if (k >= p.events.length) { clearInterval(timer); timer = null; }
      }, 5);
      return p;
    });
  }
  E.mml = {parse, play, stop};

  // clicking the app icon plays a short jingle with the current patch
  const JINGLE = "t160 o4 l16 q6 e g >c e g8 r16 q8 'ceg'2";
  const icon = document.querySelector('#title img'); if (!icon) return;
  icon.style.cursor = 'pointer'; icon.title = 'click: play a short MML jingle with the current sound'; icon.setAttribute('role', 'button');
  icon.addEventListener('click', () => E.mml.play(JINGLE));
})();
