/* ELITA-1 sound engine "core": the C++ / Wasm DSP core in one AudioWorklet (see core/elita_core.cpp, js/core/core-worklet.js).
   Replaces ELITA.engine (the Tone.js engine of voice.js / fx.js / worklets.js / engine.js) when Settings > Sound engine is "C++ / Wasm" (the default; js/loader.js loads this file only then, and does not load Tone.js).
   Keeps the contract the panel code relies on: ELITA.params / ELITA.onChange in, ELITA.engine.{start, noteOn, noteOff, allOff, rawOn, rawOff, voices, wave, ...} out.
   Voice allocation, mono / legato / portamento and the arpeggiator stay in js/notes.js: the "voices" here are thin handles that forward down() / up() to the core.
   Milestones M1 + M2a + M2b + M3 cover: OSC1 / OSC2 (sine, saw, pulse, triangle, noise), mix, unison (num, detune), pitch / fine / key track / tune / det / key shift, phase, sub, ring, hard sync (+ PolyBLEP), FM, filter (LP12, LP24, HP12, BP12,
   saturation, key track, envelope, velocity), amplifier (envelope, gain, velocity), master volume, pan, soft clip. Plus M2b: LFO 1 / 2 (all shapes, destinations, tempo sync, key sync), mod envelope, ladder filter, voice slop / drift, unison pitch layer. Plus M3: the effect section (distortion x3, deci., r.m., comp., phaser x4), EQ, tone, chorus (x1 .. x4), stereo delay (ST / X / PP, spread, tone) and the output limiter. Every panel value is used now. */
(function () {
  const E = window.ELITA, P = E.params, S = (E.core = E.core || {});
  const BASE = (document.currentScript && document.currentScript.src || location.href).replace(/[^/]*$/, '');
  const ACTIVE = window.ELITA_BOOT ? window.ELITA_BOOT.active === 'core' : new URLSearchParams(location.search).get('engine') === 'core';   // js/loader.js decides (Settings > Sound engine)
  // Synth1 numbers the core reads (shown as "used" in the parameter list)
  const USED = [35, 36, 37, 52, 53, 54, 55, 56, 60, 61, 62, 63, 64, 65, 66, 77, 78, 79, 80, 81, 82, 83, 98, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 41, 42, 43, 44, 46, 47, 48, 49, 57, 58, 67, 68, 69, 70, 71, 85, 45, 84, 95, 96, 97, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 38, 39, 72, 73, 74, 75, 76, 90, 91, 92, 93, 94];
  const CFG = {poly: 0, uniMax: 1, bend: 2, cutSmooth: 3, syncAA: 4, bpm: 5, slop: 6, drift: 7, filter: 8, ladSat: 9, ladFb: 10, lookahead: 11, os1Filter: 12};
  // Settings the core takes from outside the patch (as config events)
  const settingsEvents = () => [{k: 'c', i: CFG.cutSmooth, v: S.CUT_SMOOTH ? 1 : 0}, {k: 'c', i: CFG.syncAA, v: S.SYNC_AA ? 1 : 0}, {k: 'c', i: CFG.bpm, v: S.BPM || 120},
    {k: 'c', i: CFG.slop, v: (S.analog && S.analog.slop) || 0}, {k: 'c', i: CFG.drift, v: (S.analog && S.analog.drift) || 0},
    {k: 'c', i: CFG.filter, v: S.FILTER === 'ladder' ? 1 : 0}, {k: 'c', i: CFG.ladSat, v: S.LADDER_SAT === 'stage' ? 1 : 0}, {k: 'c', i: CFG.ladFb, v: S.LADDER_FBHP || 0},
    {k: 'c', i: CFG.os1Filter, v: S.OS1_FILTER ? 1 : 0}];

  // A voice as seen by notes.js: the same fields as the Tone voice (on / note / t) and down() / up(), which go to the core.
  class CoreVoice {
    constructor(eng, idx) { this.eng = eng; this.idx = idx; this.on = false; this.note = null; this.t = 0; this.freq = 0; }
    down(note, vel, glide = 0, retrig = true) { this.on = true; this.note = note; this.t = performance.now(); this.freq = 1; this.eng.send({k: 'on', i: this.idx, n: note, vel, g: glide, r: retrig ? 1 : 0}); }
    up() { this.on = false; this.note = null; this.t = performance.now(); this.eng.send({k: 'off', i: this.idx}); }
    setAnalog() {} setPitch() {} dispose() {}
  }

  class CoreEngine {
    constructor() { this.ctx = null; this.node = null; this.out = null; this.analyser = null; this.buf = null; this.queue = []; this.ready = false; this.started = null; this.timed = null; }
    // Before attach() only note events are kept: parameters and settings are sent in full (stateEvents) when the node is created, and an older queued value
    // must not overwrite them.
    send(ev) { if (this.ready) this.node.port.postMessage({a: [ev]}); else if (ev.k === 'on' || ev.k === 'off') this.queue.push(ev); }
    // everything the core needs to sound like the panel, as events
    stateEvents() {
      const a = [];
      Object.keys(P).forEach(no => a.push({k: 'p', i: no === 'vol' ? 99 : +no, v: P[no]}));
      a.push({k: 'c', i: CFG.poly, v: S.POLY}, {k: 'c', i: CFG.uniMax, v: S.UNI_MAX}, {k: 'c', i: CFG.bend, v: S.BEND || 0}, ...settingsEvents());
      return a;
    }
    sendAll() { this.node.port.postMessage({a: this.stateEvents()}); }
    // Attach to an AudioContext (live or offline): load the module, compile Wasm, create the node. Resolves when the core has booted.
    // The initial state (panel, queued events and the optional `extra` events, which may carry a time t) goes in processorOptions, not through the port: in an
    // OfflineAudioContext port messages can arrive after the first blocks have been rendered, processorOptions are there from the first block on.
    async attach(ctx, destination, extra = []) {
      this.ctx = ctx;
      await ctx.audioWorklet.addModule(BASE + 'core-worklet.js');
      const bytes = await (await fetch(BASE + 'elita_core.wasm')).arrayBuffer();
      const module = await WebAssembly.compile(bytes);
      const init = this.stateEvents().concat(this.queue, extra); this.queue = [];
      const node = this.node = new AudioWorkletNode(ctx, 'elita-core', {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: {module, init}});
      await new Promise(res => { node.port.onmessage = ev => { if (ev.data && ev.data.ready) res(); }; });
      node.port.onmessage = null;
      if (!(ctx instanceof OfflineAudioContext)) {
        const an = this.analyser = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0; this.buf = new Float32Array(2048);
        node.connect(an); an.connect(destination || ctx.destination);
      } else node.connect(destination || ctx.destination);
      this.ready = true;
    }
    async start() {
      if (!this.started) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx({latencyHint: 'interactive'});           // created inside the user gesture that called start()
        this.started = (async () => { await this.attach(ctx); await ctx.resume(); document.body.classList.add('audio-on'); })();
      }
      return this.started;
    }
  }

  const eng = new CoreEngine();
  E.CoreEngine = CoreEngine;                                           // the offline tests create their own instances
  if (!ACTIVE) return;

  S.CORE = true;
  S.dbgNote = S.dbgNote || (() => {});                               // notes.js reports notes to the Tone engine's debug panel (js/debug.js, not loaded with the core)
  // ---- the contract with notes.js / keys.js / midi.js / scope.js ----
  // notes.js keySync (#68 / #70) restarts the LFO with stop() / start() or draws a new random value through shSig: both become one key-sync event for the core
  S.lfos = [0, 1].map(k => ({state: 'started', start() { eng.send({k: 'ks', i: k}); }, stop() {}}));
  S.shSig = [0, 1].map(k => ({get value() { return 0; }, set value(v) { eng.send({k: 'ks', i: k}); }}));
  S.voices = [];
  function syncVoices() {                                            // same rules as the Tone engine: ELITA limits = 5 voices / unison 3, Synth1 spec = the patch's poly (<= 32) / unison 8
    const syn = S.LIMITS === 'synth1';
    S.UNI_MAX = syn ? S.SYNTH1_LIM.uni : 3;
    S.POLY = syn ? Math.max(1, Math.min(S.SYNTH1_LIM.poly, P[94] || 16)) : 5;
    if (S.voices.length > S.POLY) { S.allOff(); S.voices.splice(S.POLY); }
    while (S.voices.length < S.POLY) S.voices.push(new CoreVoice(eng, S.voices.length));
    eng.send({k: 'c', i: CFG.poly, v: S.POLY}); eng.send({k: 'c', i: CFG.uniMax, v: S.UNI_MAX});
  }
  function refresh() {                                               // Settings changed: re-send what the core takes from outside the patch
    syncVoices();
    settingsEvents().forEach(ev => eng.send(ev));
    if (P[94] !== undefined) eng.send({k: 'p', i: 94, v: P[94]});
  }
  window.ELITA.onChange = (no, v) => { eng.send({k: 'p', i: no === 'vol' ? 99 : +no, v}); if (no === 94) refresh(); };
  syncVoices();
  const wave = {getValue() { if (!eng.analyser) return new Float32Array(2048); eng.analyser.getFloatTimeDomainData(eng.buf); return eng.buf; }};
  const {allOff, voiceOn, voiceOff, noteOn, noteOff} = S;
  window.ELITA.engine = {
    refresh, get POLY() { return S.POLY; }, get unisonMax() { return S.UNI_MAX; }, get limits() { return S.LIMITS; },
    filterMode: m => { if (m === 'ladder' || m === 'biquad') { if (E.settings) E.settings.set('filter', m); else S.FILTER = m; } return S.FILTER; },
    bend: s => { S.BEND = +s || 0; eng.send({k: 'c', i: CFG.bend, v: S.BEND}); },
    rawOn: voiceOn, rawOff: voiceOff, lfoHz: () => [0, 0],
    start: () => eng.start().then(() => { refresh(); eng.sendAll(); }).catch(err => {      // the core could not start (module / Wasm / AudioWorklet failure): fall back to the Tone.js engine
      console.error('[ELITA] the C++ / Wasm core failed to start', err);
      if (E.engineSwitch) E.engineSwitch.fallback(String(err && err.message || err)); else throw err;
    }),
    noteOn, noteOff, allOff, voices: () => S.voices, wave: () => (eng.analyser ? wave : null), used: () => new Set(USED),
    core: eng
  };
  console.info('[ELITA] sound engine: C++ / Wasm core (Tone.js is not loaded). Voices, LFO, mod envelope, filters, unison, effects and limiter all run in the core.');
})();
