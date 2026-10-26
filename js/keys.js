/* On-screen keyboard + PC keyboard for ELITA-1. Audio starts on the first click / key press (browser autoplay rule). */
(function () {
  const E = window.ELITA.engine, $ = id => document.getElementById(id);
  const kb = $('kb'), BASE = 48, KEYS = 25, WHITES = 15;      // 48 = C3 (C4 = MIDI 60 = middle C, A4 = 440 Hz)
  const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'], noteName = n => NAMES[n % 12] + (Math.floor(n / 12) - 1);
  const KM = window.ELITA.keymap, held = {}, els = [];     // key assignments: Settings > Key config (js/keymap.js)
  let oct = 0, wi = 0;
  const base = () => BASE + oct * 12, mark = (n, on) => els[n - base()] && els[n - base()].classList.toggle('on', on);
  const on = (n, vel) => { E.start().then(() => E.noteOn(n, vel)); }, off = n => { E.start().then(() => E.noteOff(n)); };
  function relabel() { els.forEach((el, i) => { el.firstChild.textContent = noteName(base() + i); el.lastChild.textContent = KM.label(KM.codeOf('n' + i)); }); $('oct').textContent = noteName(base()) + ' – ' + noteName(base() + KEYS - 1); }
  for (let i = 0; i < KEYS; i++) {
    const black = [1, 3, 6, 8, 10].includes(i % 12), el = document.createElement('div');
    el.className = 'key ' + (black ? 'b' : 'w');
    el.innerHTML = '<span></span><small></small>';
    if (black) el.style.left = 'calc(' + (wi / WHITES * 100) + '% - var(--bw) / 2)'; else wi++;
    el.onpointerdown = ev => {   // on-screen keys: where you click sets the velocity (top = soft, bottom = loud)
      const r = el.getBoundingClientRect(), v = Math.max(0.15, Math.min(1, 0.15 + 0.85 * (ev.clientY - r.top) / r.height));
      el._n = base() + i; on(el._n, v); el.classList.add('on'); $('vc').dataset.v = Math.round(v * 127); };
    el.onpointerup = el.onpointerleave = el.onpointercancel = () => { if (el._n == null) return; off(el._n); el._n = null; el.classList.remove('on'); };
    els.push(el); kb.append(el);
  }
  function shiftOct(d) {
    const o = Math.max(-2, Math.min(2, oct + d)); if (o === oct) return;
    Object.keys(held).forEach(k => { off(held[k]); mark(held[k], false); delete held[k]; });
    els.forEach(el => { if (el._n != null) { off(el._n); el._n = null; } el.classList.remove('on'); });
    oct = o; relabel();
  }
  relabel();
  $('octdn').onclick = () => shiftOct(-1); $('octup').onclick = () => shiftOct(1);
  const releaseAll = () => { Object.keys(held).forEach(k => { off(held[k]); mark(held[k], false); delete held[k]; }); };
  addEventListener('keydown', e => {                           // keys are matched by e.code (physical key), see js/keymap.js
    if (e.repeat || KM.typing(e)) return;
    const a = KM.actionOf(e.code); if (!a) return;
    if (a === 'octDown') { e.preventDefault(); return shiftOct(-1); }
    if (a === 'octUp') { e.preventDefault(); return shiftOct(1); }
    if (a === 'allOff') { e.preventDefault(); releaseAll(); E.allOff(); return; }
    if (a[0] !== 'n') return;                                  // patchNext / patchPrev: js/patches.js
    e.preventDefault(); if (held[e.code] != null) return;
    held[e.code] = base() + +a.slice(1); on(held[e.code]); mark(held[e.code], true);
  });
  addEventListener('keyup', e => { if (held[e.code] != null) { off(held[e.code]); mark(held[e.code], false); delete held[e.code]; } });
  KM.on(() => { releaseAll(); relabel(); });                   // the map was changed (Key config): release held notes, update the key labels
  addEventListener('blur', () => { E.allOff(); Object.keys(held).forEach(k => { mark(held[k], false); delete held[k]; }); });
  // first gesture anywhere starts the audio context; status text
  addEventListener('pointerdown', () => E.start(), {once: true});
  setInterval(() => { const v = E.voices(); $('vc').textContent = v ? 'voices ' + v.filter(x => x.on).length + '/' + E.POLY + (E.limits === 'synth1' ? ' (Synth1 spec)' : '') + ($('vc').dataset.v ? '  vel ' + $('vc').dataset.v : '') : 'click / press a key to start audio'; }, 150);
})();
