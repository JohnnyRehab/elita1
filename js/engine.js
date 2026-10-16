/* ELITA-1 audio engine (Tone.js). Signal flow follows Synth1:
   [OSC1 + OSC2 (+sub, ring/sync, FM, noise)] -> mix -> Filter (+filter env) -> Amp (+amp env) -> voice sum
   -> EQ -> Chorus -> Delay -> Pan -> Limiter -> out.   LFO1/2 and the mod envelope modulate pitch / filter / amp / p/w / FM.
   Reads the panel through ELITA.params (Synth1 raw values) and listens to ELITA.onChange. Not meant to be an exact Synth1 copy.
   Files: calib.js (curves, tables, shared state) / worklets.js / voice.js / fx.js / notes.js / debug.js / engine.js (this file: audio start-up, applyAll, panel hook-up, public API; load it last).
   Shared state lives in ELITA.core (S). */
(function () {
const E = window.ELITA, P = E.params, S = (E.core = E.core || {});
const {arp, arpStop, allOff, voiceOn, voiceOff, noteOn, noteOff} = S;
let prevMode = null, prevArp = false;
async function initAudio() {
  try {
    await Tone.getContext().addAudioWorkletModule(URL.createObjectURL(new Blob([S.SYNC_SRC], {type: 'text/javascript'})));
    S.SYNC_OK = true;
  } catch (e) { console.warn('hard sync unavailable', e); }
  S.master = new Tone.Gain(0);
  S.eq = new Tone.Filter({type: 'peaking', frequency: 1000, Q: 1, gain: 0}); S.panner = new Tone.Panner(0);
  S.wave = new Tone.Waveform(2048);
  S.lfos = [0, 1].map(() => new Tone.LFO({min: -1, max: 1}).start());
  S.shSig = [0, 1].map(() => new Tone.Signal(0));                 // S&H / random LFO value (set by a timer)
  S.lfoOut = S.lfos.map((l, k) => { const g = new Tone.Gain(1); l.connect(g); S.shSig[k].connect(g); return g; });
  S.chorus = new Tone.Chorus({spread: 180}).start();
  S.chorus2 = new Tone.Chorus({spread: 180}).start();   // 2nd stage, only used for x3 / x4
  S.delay = S.makeDelay();
  S.lim = new Tone.Limiter(-2); S.clip = new Tone.WaveShaper(x => Math.tanh(x * 1.2) / 1.2, 2048);
  S.toneLo = new Tone.Filter({type: 'lowshelf', frequency: 300, gain: 0}); S.toneHi = new Tone.Filter({type: 'highshelf', frequency: 3000, gain: 0});
  S.fx = S.makeFx();
  // Tone's mono-by-default nodes would fold the stereo unison (#84) down to mono: let them pass 2 channels
  [S.eq, S.toneLo, S.toneHi, S.panner, S.lim, S.clip, S.fx.shaper, S.fx.hp, S.fx.lp, S.fx.comp, ...S.fx.ap].forEach(n => [n.input, n.output, n._panner, n._shaper, ...(n._filters || [])].forEach(x => {
    if (x && typeof x.channelCount === 'number') { try { x.channelCount = 2; x.channelCountMode = 'max'; } catch (e) { /* fixed by the node */ } }
  }));
  S.master.chain(S.fx.input);
  S.fx.out.chain(S.eq, S.toneLo, S.toneHi, S.chorus, S.chorus2, S.delay.input);
  S.delay.output.chain(S.panner, S.lim, S.clip, Tone.getDestination());
  S.clip.connect(S.wave);
  window.__n = {fx: S.fx, master: S.master, eq: S.eq, toneLo: S.toneLo, toneHi: S.toneHi, chorus: S.chorus, chorus2: S.chorus2, dli: S.delay.input, dlo: S.delay.output, panner: S.panner, lim: S.lim, clip: S.clip};
  S.voices = [];
  applyAll();
}
// Voice count: ELITA limits = 5 fixed; Synth1 spec = the poly number of the patch (#94, 1..32). Grows on demand and removes the extra voices (their oscillators would keep running otherwise).
function syncVoices() {
  const syn = S.LIMITS === 'synth1';
  S.UNI_MAX = syn ? S.SYNTH1_LIM.uni : 3;
  S.POLY = syn ? Math.max(1, Math.min(S.SYNTH1_LIM.poly, P[94] || 16)) : 5;
  if (!S.voices || !S.master) return;
  if (S.voices.length > S.POLY) { allOff(); S.voices.splice(S.POLY).forEach(v => v.dispose()); }
  while (S.voices.length < S.POLY) { const v = new S.Voice(S.master, S.lfoOut); v.idx = S.voices.length; S.voices.push(v); }
}
function applyAll() {
  syncVoices();
  S.dbgParams();
  if (P[38] !== prevMode) { prevMode = P[38]; allOff(); }
  if (!!P[59] !== prevArp) { prevArp = !!P[59]; arp.held.length = 0; arpStop(); allOff(); }   // switching the arpeggiator releases held notes   // release everything when the play mode changes
  S.applyFx(P); S.voices.forEach(v => v.apply(P));
}

// ---- hook up to the panel ----
let pending = false, started = null;
function refresh() { if (!S.voices || pending) return; pending = true; queueMicrotask(() => { pending = false; applyAll(); }); }
async function start() {
  if (!started) started = (async () => { await Tone.start(); await initAudio(); document.body.classList.add('audio-on'); if (E.debug.enabled) { S.getMeters(); E.debug.graph(); } })();
  return started;
}
window.ELITA.onChange = () => refresh();
{ const b = document.getElementById('bpm');           // tempo box: drives LFO tempo-sync, delay time and the arpeggiator. Whole numbers only (digits, 40..300)
  const set = v => { v = Math.max(40, Math.min(300, parseInt(v, 10) || 120)); S.BPM = v; if (S.voices) refresh(); return v; };
  if (b) {
    const clean = s => String(s).normalize('NFKC').replace(/[^0-9]/g, '');
    b.addEventListener('beforeinput', ev => { if (ev.data && !ev.isComposing && clean(ev.data) !== ev.data) ev.preventDefault(); });   // letters, signs and '.' never get in
    b.addEventListener('input', () => { const c = clean(b.value); if (c !== b.value) b.value = c; if (c) set(c); });
    b.addEventListener('blur', () => { b.value = set(b.value || S.BPM); });                   // empty / out of range -> back to a valid value
    b.addEventListener('keydown', ev => { if (ev.key === 'Enter') b.blur(); else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); b.value = set((parseInt(b.value, 10) || S.BPM) + (ev.key === 'ArrowUp' ? 1 : -1) * (ev.shiftKey ? 10 : 1)); } ev.stopPropagation(); });
    b.addEventListener('focus', () => b.select());
  }
  window.ELITA.setBpm = v => { v = set(v); if (b) b.value = v; }; }
window.ELITA.bpm = () => S.BPM;
setInterval(() => { if (S.voices && S.analog.drift > 0) S.voices.forEach(v => v.setAnalog(S.analog, true)); }, 100);   // slow drift (Settings), only while it is on
window.ELITA.engine = {refresh, get POLY() { return S.POLY; }, get unisonMax() { return S.UNI_MAX; }, get limits() { return S.LIMITS; }, filterMode: m => { if (m === 'ladder' || m === 'biquad') { if (E.settings) E.settings.set('filter', m); else { S.FILTER = m; refresh(); } } return S.FILTER; }, bend: s => { S.BEND = +s || 0; if (S.voices) S.voices.forEach(v => v.freq && v.setPitch(P)); }, rawOn: voiceOn, rawOff: voiceOff, lfoHz: () => S.lfos.map(l => l.frequency.value), start, noteOn, noteOff, allOff, voices: () => S.voices, wave: () => S.wave, used: S.usedSet};
S.scan.push(applyAll);
})();
