/* On-screen keyboard + PC keyboard for ELITA-1. Audio starts on the first click / key press (browser autoplay rule). */
(function () {
  const E = window.ELITA.engine, $ = id => document.getElementById(id);
  const kb = $('kb'), BASE = 48, KEYS = 25, WHITES = 15;      // 48 = C3 (C4 = MIDI 60 = middle C, A4 = 440 Hz)
  const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'], noteName = n => NAMES[n % 12] + (Math.floor(n / 12) - 1);
  const MAP = 'awsedftgyhujkolp', held = {}, els = [];
  let oct = 0, wi = 0;
  const base = () => BASE + oct * 12, mark = (n, on) => els[n - base()] && els[n - base()].classList.toggle('on', on);
  const on = (n, vel) => { E.start().then(() => E.noteOn(n, vel)); }, off = n => { E.start().then(() => E.noteOff(n)); };
  function relabel() { els.forEach((el, i) => { el.firstChild.textContent = noteName(base() + i); }); $('oct').textContent = noteName(base()) + ' – ' + noteName(base() + KEYS - 1); }
  for (let i = 0; i < KEYS; i++) {
    const black = [1, 3, 6, 8, 10].includes(i % 12), el = document.createElement('div');
    el.className = 'key ' + (black ? 'b' : 'w');
    el.innerHTML = '<span></span>' + (i < MAP.length ? '<small>' + MAP[i].toUpperCase() + '</small>' : '');
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
  addEventListener('keydown', e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'z') return shiftOct(-1);
    if (k === 'x') return shiftOct(1);
    const i = MAP.indexOf(k); if (i < 0 || held[k] != null) return;
    held[k] = base() + i; on(held[k]); mark(held[k], true);
  });
  addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (held[k] != null) { off(held[k]); mark(held[k], false); delete held[k]; } });
  addEventListener('blur', () => E.allOff());
  // first gesture anywhere starts the audio context; status text
  addEventListener('pointerdown', () => E.start(), {once: true});
  setInterval(() => { const v = E.voices(); $('vc').textContent = v ? 'voices ' + v.filter(x => x.on).length + '/' + E.POLY + ($('vc').dataset.v ? '  vel ' + $('vc').dataset.v : '') : 'click / press a key to start audio'; }, 150);
})();
