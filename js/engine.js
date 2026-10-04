/* ELITA-1 audio engine (Tone.js). Signal flow follows Synth1:
   [OSC1 + OSC2 (+sub, ring/sync, FM, noise)] -> mix -> Filter (+filter env) -> Amp (+amp env) -> voice sum
   -> EQ -> Chorus -> Delay -> Pan -> Limiter -> out.   LFO1/2 and the mod envelope modulate pitch / filter / amp / p/w / FM.
   Reads the panel through ELITA.params (Synth1 raw values) and listens to ELITA.onChange. Not meant to be an exact Synth1 copy. */
(function () {
const P = window.ELITA.params, POLY = 6, BPM = 120;
const LFO_WAVE = ['sawtooth','triangle','sine','square','sine','sine'];
// Shared wave values (differs from the GUI display order). Confirmed on Synth1:
// osc1 3 = tri; osc2 1 = saw, 2 = pulse, 4 = noise. 0 = sine follows by elimination (osc1 has 4 shapes).
const OSC1 = ['sine','sawtooth','pulse','triangle'];
const OSC2 = ['sine','sawtooth','pulse','triangle','noise'];
const FTYPE = [['lowpass',-12],['lowpass',-24],['highpass',-12],['bandpass',-12],['lowpass',-24]];
const FTYPE_DUMMY=0;
// Provisional curves (to be tuned by ear)
const time = v => 0.001 * Math.pow(8000, v / 127);   // 1 ms .. 8 s
const cutoff = v => 50 * Math.pow(400, v / 127);    // 20 Hz .. 20 kHz

class Voice {
  constructor(out, lfos) {
    this.o1 = new Tone.OmniOscillator({type:'sawtooth'});
    this.o2 = new Tone.OmniOscillator({type:'sawtooth'});
    this.nz = new Tone.Noise('white');
    this.g1 = new Tone.Gain(); this.g2 = new Tone.Gain(); this.gn = new Tone.Gain(0);
    this.f = new Tone.Filter({type:'lowpass', rolloff:-24});
    this.fe = new Tone.FrequencyEnvelope({baseFrequency:200, octaves:4});
    this.amp = new Tone.AmplitudeEnvelope();
    this.o1.connect(this.g1); this.o2.connect(this.g2); this.nz.connect(this.gn);
    [this.g1, this.g2, this.gn].forEach(g => g.connect(this.f));
    this.fe.connect(this.f.frequency);
    this.vg = new Tone.Gain(1);                      // tremolo stage (LFO -> amp)
    this.f.connect(this.amp); this.amp.connect(this.vg); this.vg.connect(out);
    this.sd = lfos.map(l => { const g = new Tone.Gain(0); l.connect(g); return g; });   // LFO depth sends
    this.dst = [[], []];
    // Sub oscillator: follows OSC1 pitch (0 / -1 oct), no unison
    this.so = new Tone.OmniOscillator({type: 'sine'}); this.sg = new Tone.Gain(0);
    this.so.connect(this.sg); this.sg.connect(this.f); this.so.start();
    // Ring mod: osc1 x osc2 replaces the osc2 signal
    this.mul = new Tone.Multiply(0); this.gr = new Tone.Gain(0);
    this.o1.connect(this.mul); this.o2.connect(this.mul.factor); this.mul.connect(this.gr); this.gr.connect(this.f);
    // Hard sync: worklet slave oscillator restarted by osc1 (stays null if the worklet failed to load)
    this.sy = null; this.sg2 = new Tone.Gain(0); this.sg2.connect(this.f);
    if (SYNC_OK) { this.sy = Tone.getContext().createAudioWorkletNode('sync-osc', {numberOfInputs: 0, outputChannelCount: [1]}); Tone.connect(this.sy, this.sg2); }
    // FM: osc2 acts as the modulator of osc1 pitch (cents)
    this.fm = new Tone.Gain(0); this.o2.connect(this.fm); this.fm.connect(this.o1.detune);
    // Mod envelope: attack -> decay to 0, ignores note-off
    this.me = new Tone.Envelope({attack: 0.001, decay: 0.1, sustain: 0, release: 0.01});
    this.mg = new Tone.Gain(0); this.me.connect(this.mg); this.mt = [];
    [this.o1, this.o2, this.nz].forEach(s => s.start());
    this.on = false; this.note = null; this.t = 0; this.freq = 440; this.midi = 60;
  }
  setType(o, t) { if (o.type !== t) o.type = t; }
  trackCut(p) { this.fe.baseFrequency = Math.min(20000, cutoff(p[19]) * Math.pow(2, (this.midi - 60) / 12 * p[22] / 127)); }
  route(g, list, key) {           // reconnect only when the target set changed
    const cur = this[key];
    if (list.length !== cur.length || list.some((t, i) => t !== cur[i])) {
      g.disconnect(); list.forEach(t => g.connect(t)); this[key] = list;
    }
  }
  apply(p) {
    // Unison: fat oscillators (not available for pulse)
    const uni = p[73] ? Math.max(1, Math.min(8, p[93])) : 1, spread = p[75] / 127 * 100;
    const shape = (o, t) => {
      const ty = uni > 1 && t !== 'pulse' ? 'fat' + t : t;
      this.setType(o, ty);
      if (ty.startsWith('fat')) { if (o.count !== uni) o.count = uni; o.spread = spread; }
    };
    shape(this.o1, OSC1[p[0]] || 'sawtooth');
    const t2 = OSC2[p[1]] || 'sawtooth', noise = t2 === 'noise';
    shape(this.o2, noise ? 'sawtooth' : t2);
    const w = -0.9 + 0.9 * p[8] / 127;               // pulse width (right = square)
    [this.o1, this.o2].forEach(o => { if (o.type === 'pulse') o.width.value = w; });
    const m = p[5] / 127 * Math.PI / 2;
    const un = 1 / Math.sqrt(uni);                    // keep level steady with more unison voices
    this.g1.gain.value = Math.cos(m) * 0.5 * un;
    const ring = p[7] && !noise, sync = p[6] && this.sy && !ring && !noise, s2 = Math.sin(m) * 0.5 * un;
    this.g2.gain.value = noise || ring || sync ? 0 : s2;
    this.gr.gain.value = ring ? s2 * un : 0;
    this.sg2.gain.value = sync ? s2 : 0;
    if (this.sy) this.sy.port.postMessage({t: p[1] % 4, w: (-0.9 + 0.9 * p[8] / 127 + 1) / 2});
    this.gn.gain.value = noise ? Math.sin(m) * 0.5 : 0;
    // Sub oscillator (wave values follow OSC1; assumed, unverified). Pulse is a fixed square.
    this.setType(this.so, OSC1[p[96]] || 'sine');
    if (this.so.type === 'pulse') this.so.width.value = 0;
    this.sg.gain.value = p[95] / 127 * 0.5 * Math.cos(m);       // scales with the OSC1 side of the mix
    const [ft, ro] = FTYPE[p[14]] || FTYPE[1];
    this.f.type = ft; if (this.f.rolloff !== ro) this.f.rolloff = ro;
    this.f.Q.value = 0.5 + Math.pow(p[20] / 127, 2) * 9;
    this.trackCut(p);
    this.fe.octaves = (p[21] - 64) / 64 * 7;          // 64 = no envelope, below = negative
    this.fe.attack = time(p[15]); this.fe.decay = time(p[16]);
    this.fe.sustain = p[17] / 127; this.fe.release = time(p[18]);
    this.amp.attack = time(p[25]); this.amp.decay = time(p[26]);
    this.amp.sustain = p[27] / 127; this.amp.release = time(p[28]);
    // LFO routing (shared LFOs; on/dest/depth param numbers)
    let trem = 0;
    const pw = o => o.type === 'pulse' ? [o.width] : [];   // pulse-width signal is recreated when the type changes
    [[57, 41, 44], [58, 46, 49]].forEach(([on, ds, dp], k) => {
      const dest = p[on] ? p[ds] : -1, d = p[dp] / 127;
      const tg = {1: [this.o2.detune], 2: [this.o1.detune, this.o2.detune, this.so.detune], 3: [this.f.detune], 4: [this.vg.gain],
                  5: [...pw(this.o1), ...pw(this.o2)], 6: [this.fm.gain]}[dest] || [];
      if (tg.length !== this.dst[k].length || tg.some((t, i) => t !== this.dst[k][i])) {
        this.sd[k].disconnect(); tg.forEach(t => this.sd[k].connect(t)); this.dst[k] = tg;
      }
      this.sd[k].gain.value = dest < 1 ? 0 : dest <= 2 ? d * 1200 : dest === 3 ? d * 4800
                            : dest === 4 ? d / 2 : dest === 5 ? d * 0.9 : dest === 6 ? d * 2400 : 0;   // cents / cents / gain / width / fm cents
      if (dest === 4) trem += d / 2;
    });
    this.vg.gain.value = 1 - trem;
    // FM depth (provisional curve) and mod envelope routing
    this.fm.gain.value = Math.pow(p[45] / 127, 2) * 4800;
    const on = p[10], amt = (p[11] - 64) / 64, md = p[71];       // amount: 64 = 0
    this.me.attack = time(p[12]); this.me.decay = time(p[13]);
    const mt = !on ? [] : md === 0 ? [this.o2.detune] : md === 1 ? [this.fm.gain] : md === 2 ? [...pw(this.o1), ...pw(this.o2)] : [];
    this.route(this.mg, mt, 'mt');
    this.mg.gain.value = !on ? 0 : md === 0 ? amt * 4800 : md === 1 ? amt * 2400 : md === 2 ? amt * 0.9 : 0;
    this.setPitch(p);
  }
  setPitch(p, glide = 0) {
    const st = Math.max(-24, Math.min(24, p[2] - 64)) + (p[3] - 64) / 100;
    const f2 = this.freq * Math.pow(2, st / 12);
    const set = (sig, f) => glide > 0 ? sig.rampTo(f, glide) : (sig.value = f);
    set(this.o1.frequency, this.freq);
    set(this.so.frequency, this.freq * (p[97] ? 0.5 : 1));
    set(this.o2.frequency, f2);
    if (this.sy) [['f1', this.freq], ['f2', f2]].forEach(([n, f]) => {
      const a = this.sy.parameters.get(n), t = Tone.now();
      a.cancelScheduledValues(t); a.setValueAtTime(a.value, t);
      if (glide > 0) a.linearRampToValueAtTime(f, t + glide); else a.setValueAtTime(f, t);
    });
  }
  down(note, vel, glide = 0, retrig = true) {
    this.midi = note + P[9]; this.note = note; this.on = true; this.t = performance.now();
    this.freq = Tone.Frequency(note + P[9], 'midi').toFrequency();
    this.setPitch(P, glide); this.trackCut(P);
    if (!retrig) return;
    const now = Tone.now();
    this.amp.triggerAttack(now, vel); this.fe.triggerAttack(now); this.me.triggerAttack(now);
  }
  up() {
    this.on = false; this.note = null; this.t = performance.now();
    const now = Tone.now();
    this.amp.triggerRelease(now); this.fe.triggerRelease(now);
  }
}

let lim = null, clip = null, voices = null, master = null, panner = null, eq = null, wave = null, lfos = null, chorus = null, chorus2 = null, delay = null;
let SYNC_OK = false, prevMode = null;
const SYNC_SRC = `class S extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{name: 'f1', defaultValue: 220, automationRate: 'k-rate'}, {name: 'f2', defaultValue: 220, automationRate: 'k-rate'}]; }
  constructor() { super(); this.a = 0; this.b = 0; this.t = 1; this.w = 0.5; this.port.onmessage = e => { this.t = e.data.t; this.w = e.data.w; }; }
  process(i, o, p) {
    const out = o[0][0], f1 = p.f1[0] / sampleRate, f2 = p.f2[0] / sampleRate;
    for (let n = 0; n < out.length; n++) {
      this.a += f1; if (this.a >= 1) { this.a -= 1; this.b = f1 > 0 ? this.a * f2 / f1 : 0; }   // master wrap resets the slave
      this.b += f2; if (this.b >= 1) this.b -= 1;
      const x = this.b;
      out[n] = this.t === 0 ? Math.sin(6.2832 * x) : this.t === 1 ? 2 * x - 1 : this.t === 2 ? (x < this.w ? 1 : -1) : 4 * Math.abs(x - 0.5) - 1;
    }
    return true;
  }
}
registerProcessor('sync-osc', S);`;

async function initAudio() {
  try {
    await Tone.getContext().addAudioWorkletModule(URL.createObjectURL(new Blob([SYNC_SRC], {type: 'text/javascript'})));
    SYNC_OK = true;
  } catch (e) { console.warn('hard sync unavailable', e); }
  master = new Tone.Gain(0);
  eq = new Tone.Filter({type: 'peaking', frequency: 1000, Q: 1, gain: 0}); panner = new Tone.Panner(0);
  wave = new Tone.Waveform(2048);
  lfos = [0, 1].map(() => new Tone.LFO({min: -1, max: 1}).start());
  chorus = new Tone.Chorus({spread: 180}).start();
  chorus2 = new Tone.Chorus({spread: 180}).start();   // 2nd stage, only used for x3 / x4
  delay = new Tone.FeedbackDelay({delayTime: 0.25, feedback: 0.3, maxDelay: 2});
  lim = new Tone.Limiter(-2); clip = new Tone.WaveShaper(x => Math.tanh(x * 1.2) / 1.2, 2048);
  master.chain(eq, chorus, chorus2, delay, panner, lim, clip, Tone.getDestination());
  clip.connect(wave);
  voices = Array.from({length: POLY}, () => new Voice(master, lfos));
  applyAll();
}

// Provisional curves for the shared blocks (LFO speed, delay, chorus)
function applyFx(p) {
  master.gain.rampTo(p[29] / 127 * Math.pow(p.vol / 127, 2) * 0.9, 0.02);
  eq.frequency.value = 100 * Math.pow(100, p[61] / 127);          // 100 Hz .. 10 kHz (provisional)
  eq.gain.value = (p[62] - 64) / 64 * 12; eq.Q.value = 0.3 + p[63] / 127 * 6;
  panner.pan.value = Math.max(-1, Math.min(1, (p[90] - 64) / 63));
  [[42, 43], [47, 48]].forEach(([t, sp], k) => {
    lfos[k].type = LFO_WAVE[p[t]] || 'sine';
    lfos[k].frequency.value = 0.1 * Math.pow(200, p[sp] / 127);      // 0.1 .. 20 Hz
  });
  delay.delayTime.value = Math.min(2, (p[35] + 1) * 60 / BPM / 16);  // tempo-synced index (provisional)
  delay.feedback.value = Math.min(0.9, p[36] / 127 * 0.9);
  delay.wet.value = p[65] ? p[37] / 127 : 0;
  chorus.delayTime = 2 + p[52] / 127 * 8;                            // ms
  chorus.depth = p[53] / 127;
  chorus.frequency.value = 0.1 + Math.pow(p[54] / 127, 2) * 8;
  chorus.feedback.value = Math.max(0, p[55] - 64) / 63 * 0.9;        // 64 = 0
  chorus.wet.value = p[66] ? p[56] / 127 : 0;
  // Chorus type: indicator "xN" = value N (Oldage Leader x2, Pain Leader x4). Approximation:
  // x1 = mono LFO, x2 = L/R opposite phase, x3/x4 = extra detuned 2nd stage in series.
  const n = Math.max(1, Math.min(4, p[64]));
  chorus.spread = n === 1 ? 0 : 180;
  chorus2.delayTime = (2 + p[52] / 127 * 8) * 1.3;
  chorus2.depth = p[53] / 127 * 0.8;
  chorus2.frequency.value = chorus.frequency.value * 1.37;
  chorus2.feedback.value = 0;
  chorus2.wet.value = p[66] && n >= 3 ? p[56] / 127 * (n === 4 ? 0.8 : 0.5) : 0;
}
function applyAll() {
  dbgParams();
  if (P[38] !== prevMode) { prevMode = P[38]; allOff(); }   // release everything when the play mode changes
  applyFx(P); voices.forEach(v => v.apply(P));
}

// Poly: oldest released voice first, else steal the oldest held one.
// Mono / legato (#38 = 1 / 2): voice 0 only, last-note priority; legato keeps the envelopes running while notes overlap.
const stack = [];
const isMono = () => P[38] === 1 || P[38] === 2;
const glideTime = overlap => (!P[74] || overlap) ? Math.pow(P[39] / 127, 2) * 2 : 0;   // #74 auto: glide only when notes overlap
function allOff() { stack.length = 0; voices.forEach(v => v.on && v.up()); }
function noteOn(n, vel = 0.8) {
  if (!voices) return;
  dbgNote('on', n);
  if (isMono()) {
    if (stack.includes(n)) return;
    const overlap = stack.length > 0;
    stack.push(n);
    voices[0].down(n, vel, glideTime(overlap), !(overlap && P[38] === 2));
    return;
  }
  if (voices.some(v => v.note === n)) return;
  const byAge = (a, b) => a.t - b.t;
  const pool = voices.slice(0, Math.max(1, Math.min(POLY, P[94] || POLY)));
  const v = pool.filter(x => !x.on).sort(byAge)[0] || pool.slice().sort(byAge)[0];
  v.down(n, vel);
}
function noteOff(n) {
  if (!voices) return;
  dbgNote('off', n);
  if (isMono()) {
    const i = stack.indexOf(n);
    if (i < 0) return;
    const last = i === stack.length - 1;
    stack.splice(i, 1);
    if (!last) return;
    if (stack.length) voices[0].down(stack[stack.length - 1], 0.8, glideTime(true), P[38] === 1);
    else voices[0].up();
    return;
  }
  voices.filter(v => v.note === n).forEach(v => v.up());
}


// ================= debug mode =================
// Enable:  open the page with ?debug  (or #debug), or run  ELITA.debug.on()  in the console.  Disable: ELITA.debug.off()
// Console helpers:  ELITA.debug.graph()   signal path of the whole synth (voice + effect chain)
//                   ELITA.debug.voice(i)  one voice in detail      ELITA.debug.meters()  level (dB) at each stage
//                   ELITA.debug.params()  params that differ from the defaults, and whether the engine uses them
//                   ELITA.debug.unused()  Synth1 parameters the engine ignores
let DBG = false, lastP = {}, meters = null;
const C = 'color:#fff;background:#c33;padding:0 4px;border-radius:2px', C2 = 'color:#c33;font-weight:bold';
const nm = no => (window.ELITA.names && window.ELITA.names[no]) || '';
const r3 = x => typeof x === 'number' ? +x.toFixed(3) : x;
const NOTE = n => ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][n % 12] + (Math.floor(n / 12) - 1);
function usedSet() {   // Synth1 numbers the engine reads, found by scanning the engine source itself
  const src = [Voice.prototype.apply, Voice.prototype.setPitch, Voice.prototype.down, Voice.prototype.trackCut, applyFx, applyAll, noteOn, noteOff, glideTime, isMono].map(f => f.toString()).join('\n');
  const u = new Set(); for (const m of src.matchAll(/\b[pP]\[(\d+)\]/g)) u.add(+m[1]);
  [41, 42, 43, 44, 46, 47, 48, 49, 57, 58].forEach(n => u.add(n));   // LFO params are read through index tables
  return u;
}
function dbgParams() {
  if (!DBG) return;
  const ch = [];
  Object.keys(P).forEach(no => { if (P[no] !== lastP[no]) { if (lastP[no] !== undefined) ch.push([no, lastP[no], P[no]]); lastP[no] = P[no]; } });
  if (!ch.length) return;
  if (ch.length > 12) console.log('%c[ELITA]%c patch/preset: %d params changed → engine re-applied (ELITA.debug.graph() to see the path)', C, '', ch.length);
  else ch.forEach(([no, a, b]) => console.log('%c[ELITA]%c #%s %s: %s → %s  %s', C, '', no, nm(no), a, b, usedSet().has(+no) || no === 'vol' ? '' : '(not used by the engine)'));
}
function dbgNote(kind, n) {
  if (!DBG) return;
  if (kind === 'off') { const v = voices.filter(x => x.note === n); console.log('%c[ELITA]%c note OFF %s (%d) → release voice %s', C, '', NOTE(n), n, v.map(x => voices.indexOf(x)).join(',') || '(none)'); return; }
  const mono = isMono();
  setTimeout(() => {   // after allocation
    const v = voices.filter(x => x.note === n);
    const vi = v.map(x => voices.indexOf(x)).join(',');
    const used = voices.filter(x => x.on).length;
    console.log('%c[ELITA]%c note ON  %s (midi %d, key shift %s → %s Hz) → voice #%s  [mode: %s, active voices %d/%d]', C, '', NOTE(n), n, P[9], r3(v[0] ? v[0].freq : 0), vi, ['poly','mono','legato'][P[38]] || P[38], used, POLY);
    if (v[0]) console.log('%c  path%c %s', C2, '', pathString(v[0]));
  }, 0);
}
function pathString(v) {
  const o1 = v.o1, o2 = v.o2, parts = [];
  const uni = o => o.count > 1 ? ' ×' + o.count + ' unison' : '';
  if (v.g1.gain.value > 0.0001) parts.push(`OSC1(${o1.type}${uni(o1)}, g=${r3(v.g1.gain.value)})`);
  if (v.g2.gain.value > 0.0001) parts.push(`OSC2(${o2.type}${uni(o2)}, g=${r3(v.g2.gain.value)})`);
  if (v.gr.gain.value > 0.0001) parts.push(`RING(OSC1×OSC2, g=${r3(v.gr.gain.value)})`);
  if (v.sg2.gain.value > 0.0001) parts.push(`SYNC-OSC2(worklet, g=${r3(v.sg2.gain.value)})`);
  if (v.gn.gain.value > 0.0001) parts.push(`NOISE(g=${r3(v.gn.gain.value)})`);
  if (v.sg.gain.value > 0.0001) parts.push(`SUB(${v.so.type}, g=${r3(v.sg.gain.value)})`);
  const lf = [], t = ['pitch(osc2)', 'pitch(osc1,2)', 'filter', 'amp', 'p/w', 'FM'];
  [57, 58].forEach((on, k) => { if (P[on]) { const d = P[[41, 46][k]]; lf.push(`LFO${k + 1}→${t[d - 1] || 'none'}`); } });
  const me = P[10] ? ['osc2 pitch', 'FM', 'p/w'][P[71]] : null;
  const f = v.f;
  return [parts.join(' + ') || '(silent: all oscillator levels 0)',
    P[45] > 0 ? `[FM: OSC2→OSC1 pitch, depth ${r3(v.fm.gain.value)} cents]` : '',
    `→ FILTER(${f.type} ${f.rolloff}dB, base ${Math.round(v.fe.baseFrequency)}Hz, Q ${r3(f.Q.value)}, env ${r3(v.fe.octaves)} oct)`,
    `→ AMP(env A${r3(v.amp.attack)} D${r3(v.amp.decay)} S${r3(v.amp.sustain)} R${r3(v.amp.release)})`,
    lf.length ? `[${lf.join(', ')}]` : '', me ? `[mod env→${me}]` : '',
    '→ voice sum → master → EQ → Chorus → Delay → Pan → Limiter → SoftClip → OUT'].filter(Boolean).join(' ');
}
function chainRows() {
  const on = (b, x) => b ? 'ON' : 'bypass', w = n => r3(n.wet.value);
  return [
    {stage: 'master gain', state: 'ON', detail: `gain ${r3(master.gain.value)} (patch gain #29 × vol)`},
    {stage: 'EQ (peaking)', state: Math.abs(eq.gain.value) > 0.01 ? 'ON' : 'flat', detail: `${Math.round(eq.frequency.value)}Hz, ${r3(eq.gain.value)}dB, Q ${r3(eq.Q.value)}   [#60 tone: not used]`},
    {stage: 'Chorus 1', state: on(P[66]), detail: `wet ${w(chorus)}, delay ${r3(chorus.delayTime)}ms, depth ${r3(chorus.depth)}, rate ${r3(chorus.frequency.value)}Hz, spread ${chorus.spread}, type x${P[64]}`},
    {stage: 'Chorus 2 (x3/x4 only)', state: on(chorus2.wet.value > 0), detail: `wet ${w(chorus2)}`},
    {stage: 'Delay', state: on(P[65]), detail: `wet ${w(delay)}, time ${r3(delay.delayTime.value)}s, feedback ${r3(delay.feedback.value)}   [#82 type / #83 spread / #98 tone: not used]`},
    {stage: 'Pan', state: Math.abs(panner.pan.value) > 0.01 ? 'ON' : 'center', detail: `pan ${r3(panner.pan.value)}`},
    {stage: 'Limiter → SoftClip(tanh)', state: 'ON', detail: 'safety'},
    {stage: 'Effect section (#77-81)', state: P[77] ? 'ON (ignored)' : 'off', detail: 'not implemented'},
    {stage: 'Arpeggiator (#59, 31-34)', state: P[59] ? 'ON (ignored)' : 'off', detail: 'not implemented'}
  ];
}
function voiceRows(v, i) {
  return {voice: i, state: v.on ? 'HELD' : (v.amp.value > 0.001 ? 'release' : 'idle'), note: v.note == null ? '' : NOTE(v.note), path: pathString(v)};
}
function lfoRows() {
  return [0, 1].map(k => ({lfo: k + 1, on: !!P[[57, 58][k]], wave: lfos[k].type, 'speed Hz': r3(lfos[k].frequency.value), depth: r3(P[[44, 49][k]]), dest: ['none','osc2 pitch','osc1,2 pitch','filter','amp','p/w','FM','pan (n/a)'][P[[41, 46][k]]] || P[[41, 46][k]]}));
}
function getMeters() {
  if (meters) return meters;
  const tap = n => { const m = new Tone.Meter({smoothing: 0.8}); n.connect(m); return m; };
  meters = {'voice sum (master in)': tap(master), 'after EQ': tap(eq), 'after Chorus': tap(chorus2), 'after Delay': tap(delay), 'after Pan': tap(panner), 'OUT': tap(clip)};
  voices.forEach((v, i) => { meters['voice' + i + ' filter out'] = tap(v.f); meters['voice' + i + ' amp out'] = tap(v.vg); });
  return meters;
}
window.ELITA.debug = {
  on() { DBG = true; lastP = {}; Object.keys(P).forEach(k => lastP[k] = P[k]); try { sessionStorage.setItem('elita-debug', '1'); } catch (e) {} if (voices) getMeters();
    console.log('%c[ELITA debug ON]%c  graph() voice(i) meters() params() unused()   — notes and parameter changes are logged', C, ''); if (voices) this.graph(); return 'debug on'; },
  off() { DBG = false; try { sessionStorage.removeItem('elita-debug'); } catch (e) {} return 'debug off'; },
  graph() {
    if (!voices) return console.warn('audio not started yet: click the page or press a key first');
    console.group('%c[ELITA] signal path', C);
    console.log('Per voice (6 voices):  [OSC1 | OSC2 | RING | SYNC | NOISE | SUB] → FILTER(+filter env) → AMP(+amp env) → sum');
    console.log('Shared:  voice sum → master → EQ → Chorus1 → Chorus2 → Delay → Pan → Limiter → SoftClip → speakers');
    console.log('Modulation: LFO1/LFO2 (shared, all voices), mod envelope (per voice)');
    console.log('Voices'); console.table(voices.map(voiceRows));
    console.log('Effect chain'); console.table(chainRows());
    console.log('LFOs'); console.table(lfoRows());
    console.groupEnd();
  },
  voice(i = 0) { const v = voices && voices[i]; if (!v) return 'no such voice';
    console.group('%c[ELITA] voice ' + i, C); console.log(pathString(v));
    console.table({osc1: {type: v.o1.type, unison: v.o1.count || 1, gain: r3(v.g1.gain.value), freq: r3(v.o1.frequency.value)},
      osc2: {type: v.o2.type, unison: v.o2.count || 1, gain: r3(v.g2.gain.value), freq: r3(v.o2.frequency.value)},
      sub: {type: v.so.type, unison: 1, gain: r3(v.sg.gain.value), freq: r3(v.so.frequency.value)},
      noise: {gain: r3(v.gn.gain.value)}, ring: {gain: r3(v.gr.gain.value)}, sync: {gain: r3(v.sg2.gain.value)}, fm: {gain: r3(v.fm.gain.value)}});
    console.groupEnd(); },
  meters() { if (!voices) return console.warn('audio not started yet');
    const m = getMeters(); const rows = {};
    Object.keys(m).forEach(k => { const d = m[k].getValue(); rows[k] = {'level dB': r3(typeof d === 'number' ? d : d[0])}; });
    console.table(rows); return 'dB (-Infinity = silent). Play a note first, then run again.'; },
  params() {
    const u = usedSet(), rows = {};
    Object.keys(P).forEach(no => { if (P[no] !== window.ELITA.defaults[no]) rows['#' + no + ' ' + nm(no)] = {value: P[no], default: window.ELITA.defaults[no], 'used by engine': no === 'vol' || u.has(+no) ? 'yes' : 'NO'}; });
    console.table(rows); },
  unused() { const u = usedSet(), un = Object.keys(window.ELITA.defaults).filter(no => no !== 'vol' && !u.has(+no)).map(no => '#' + no + ' ' + nm(no));
    console.log('%c[ELITA]%c parameters on the panel that the engine does not use (%d):\n%s', C, '', un.length, un.join('\n')); return un; },
  get enabled() { return DBG; }
};
{ let q = false; try { q = sessionStorage.getItem('elita-debug') === '1'; } catch (e) {}
  if (/[?&#]debug\b/.test(location.search + location.hash) || q) window.ELITA.debug.on(); }

// ---- hook up to the panel ----
let pending = false, started = null;
function refresh() { if (!voices || pending) return; pending = true; queueMicrotask(() => { pending = false; applyAll(); }); }
async function start() {
  if (!started) started = (async () => { await Tone.start(); await initAudio(); document.body.classList.add('audio-on'); if (DBG) { getMeters(); window.ELITA.debug.graph(); } })();
  return started;
}
window.ELITA.onChange = () => refresh();
window.ELITA.engine = {start, noteOn, noteOff, allOff, voices: () => voices, wave: () => wave, POLY, used: usedSet};
})();
