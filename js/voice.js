/* ELITA-1 voice: oscillators (+unison / sub / ring / sync / FM / noise) -> filter -> amp, plus the envelopes and LFO sends of one note. */
(function () {
const E = window.ELITA, P = E.params, S = (E.core = E.core || {});
const {UNI_MAX, REFV, SUBW, OSC1, OSC2, FTYPE, time, CUT_OCT, Q_OFF, cutoff} = S;
class Voice {
  constructor(out, lfoSrc) {
    this.o1 = new Tone.OmniOscillator({type:'sawtooth'});
    this.o2 = new Tone.OmniOscillator({type:'sawtooth'});
    this.nz = new Tone.Noise('white');
    this.g1 = new Tone.Gain(); this.g2 = new Tone.Gain(); this.gn = new Tone.Gain(0);
    this.f = new Tone.Filter({type:'lowpass', rolloff:-24}); this._qn = 0;
    this.fe = new Tone.FrequencyEnvelope({baseFrequency:200, octaves:4});
    this.amp = new Tone.AmplitudeEnvelope();
    this.o1.connect(this.g1); this.o2.connect(this.g2); this.nz.connect(this.gn);
    [this.g1, this.g2, this.gn].forEach(g => g.connect(this.f));
    this.fe.connect(this.f.frequency);
    this.vg = new Tone.Gain(1);                      // tremolo stage (LFO -> amp)
    // Filter saturation (#23): parallel tanh shaper after the filter, crossfaded with the clean signal
    this.satDry = new Tone.Gain(1); this.satPre = new Tone.Gain(1 / 8); this.satWet = new Tone.Gain(0);
    this.satShaper = new Tone.WaveShaper(x => Math.tanh(8 * x), 2048);          // input is pre-scaled by drive/8, so the output is tanh(drive * x)
    this.f.connect(this.satDry); this.satDry.connect(this.amp);
    this.f.connect(this.satPre); this.satPre.connect(this.satShaper); this.satShaper.connect(this.satWet); this.satWet.connect(this.amp);
    this.amp.connect(this.vg); this.vg.connect(out);
    this.sd = lfoSrc.map(l => { const g = new Tone.Gain(0); l.connect(g); return g; });   // LFO depth sends
    this.dst = [[], []];
    // Sub oscillator: follows OSC1 pitch (0 / -1 oct), no unison
    this.so = new Tone.OmniOscillator({type: 'sine'}); this.sg = new Tone.Gain(0);
    this.so.connect(this.sg); this.sg.connect(this.f); this.so.start();
    // Ring mod: osc1 x osc2 replaces the osc2 signal
    this.mul = new Tone.Multiply(0); this.gr = new Tone.Gain(0);
    this.o1.connect(this.mul); this.o2.connect(this.mul.factor); this.mul.connect(this.gr); this.gr.connect(this.f);
    // Hard sync: worklet slave oscillator restarted by osc1 (stays null if the worklet failed to load)
    this.sy = null; this.sg2 = new Tone.Gain(0); this.sg2.connect(this.f);
    if (S.SYNC_OK) { this.sy = Tone.getContext().createAudioWorkletNode('sync-osc', {numberOfInputs: 0, outputChannelCount: [1]}); Tone.connect(this.sy, this.sg2); }
    // FM: osc2 acts as the modulator of osc1 pitch (cents)
    this.fm = new Tone.Gain(0); this.o2.connect(this.fm); this.fm.connect(this.o1.detune);
    // Mod envelope: attack -> decay to 0, ignores note-off
    this.me = new Tone.Envelope({attack: 0.001, decay: 0.1, sustain: 0, release: 0.01});
    this.mg = new Tone.Gain(0); this.me.connect(this.mg); this.mt = [];
    [this.o1, this.o2, this.nz].forEach(s => s.start());
    this.on = false; this.note = null; this.t = 0; this.freq = 440; this.midi = 60; this.velF = 1;
  }
  // Unison pitch (#85): a second layer of OSC1/OSC2 transposed by (value - 24) semitones, created only when needed
  layer(on) {
    if (on && !this.u1) {
      this.u1 = new Tone.OmniOscillator({type: 'sawtooth'}); this.u2 = new Tone.OmniOscillator({type: 'sawtooth'});
      this.gu1 = new Tone.Gain(0); this.gu2 = new Tone.Gain(0);
      this.u1.connect(this.gu1); this.u2.connect(this.gu2); this.gu1.connect(this.f); this.gu2.connect(this.f);
      this.uOn = false;
    }
    if (!this.u1 || on === this.uOn) return;
    this.uOn = on;
    if (on) { this.u1.start(); this.u2.start(); } else { this.u1.stop(); this.u2.stop(); this.gu1.gain.value = this.gu2.gain.value = 0; }
  }
  // Unison pan width (#84): a second, independent copy of OSC1/OSC2 (r1/r2) goes to the opposite side of the main copy.
  // The signal is merged into 2 channels in front of the filter; the filter / saturation / amp are Web Audio nodes, so they process L and R separately.
  panStereo(on) {
    if (on && !this.r1) {
      this.r1 = new Tone.OmniOscillator({type: 'sawtooth'}); this.r2 = new Tone.OmniOscillator({type: 'sawtooth'});
      this.gr1 = new Tone.Gain(0); this.gr2 = new Tone.Gain(0);
      this.mainBus = new Tone.Gain(1); this.rBus = new Tone.Gain(1);
      this.mL = new Tone.Gain(); this.mR = new Tone.Gain(); this.rL = new Tone.Gain(); this.rR = new Tone.Gain();
      this.pm = new Tone.Merge();
      this.r1.connect(this.gr1); this.r2.connect(this.gr2); this.gr1.connect(this.rBus); this.gr2.connect(this.rBus);
      this.mainBus.connect(this.mL); this.mainBus.connect(this.mR); this.rBus.connect(this.rL); this.rBus.connect(this.rR);
      this.mL.connect(this.pm, 0, 0); this.rL.connect(this.pm, 0, 0); this.mR.connect(this.pm, 0, 1); this.rR.connect(this.pm, 0, 1);
      this.pm.connect(this.f);
      this.rOn = false;
    }
    if (!this.r1 || on === this.rOn) return;
    this.rOn = on;
    if (on) {
      this.g1.disconnect(this.f); this.g2.disconnect(this.f); this.g1.connect(this.mainBus); this.g2.connect(this.mainBus);
      this.r1.start(); this.r2.start();
    } else {
      this.g1.disconnect(this.mainBus); this.g2.disconnect(this.mainBus); this.g1.connect(this.f); this.g2.connect(this.f);
      this.r1.stop(); this.r2.stop(); this.gr1.gain.value = this.gr2.gain.value = 0;
    }
  }
  setType(o, t) { if (o.type !== t) o.type = t; }
  setQOff() { this._qn = this.f._filters.length; this.f._filters.forEach(x => { x.Q.value = Q_OFF; }); }   // native biquad Q (dB) offset; Tone's own Q signal cannot go negative
  trackCut(p) { this.fe.baseFrequency = Math.min(20000, cutoff(p[19]) * Math.pow(2, (this.midi - 60) / 12 * p[22] / 127)); }
  route(g, list, key) {           // reconnect only when the target set changed
    const cur = this[key];
    if (list.length !== cur.length || list.some((t, i) => t !== cur[i])) {
      g.disconnect(); list.forEach(t => g.connect(t)); this[key] = list;
    }
  }
  apply(p) {                                  // order matters (as before the split): oscillators -> filter / envelopes -> LFO and mod routing -> pitch
    const r = this.applyOsc(p);
    this.applyFilter(p);
    this.applyMod(p, r.lay, r.pan);
    this.setPitch(p);
  }
  // oscillators: unison, mix, ring / sync / noise, sub.  Returns which extra copies are active (lay = unison pitch layer, pan = unison stereo width).
  applyOsc(p) {
    // Unison: fat oscillators (not available for pulse)
    const uni = p[73] ? Math.max(1, Math.min(UNI_MAX, p[93])) : 1, spread = p[75] / 127 * 100;
    const shape = (o, t) => {
      const ty = uni > 1 && t !== 'pulse' ? 'fat' + t : t;
      this.setType(o, ty);
      if (ty.startsWith('fat')) { if (o.count !== uni) o.count = uni; o.spread = spread; }
    };
    const lay = uni > 1 && p[85] !== 24;
    this.layer(lay);
    shape(this.o1, OSC1[p[0]] || 'sawtooth');
    const t2 = OSC2[p[1]] || 'sawtooth', noise = t2 === 'noise';
    shape(this.o2, noise ? 'sawtooth' : t2);
    if (lay) { shape(this.u1, OSC1[p[0]] || 'sawtooth'); shape(this.u2, noise ? 'sawtooth' : t2); }
    const pan = uni > 1 && p[84] > 0 && (this.o1.type.startsWith('fat') || this.o2.type.startsWith('fat'));
    this.panStereo(pan);
    if (pan) { shape(this.r1, OSC1[p[0]] || 'sawtooth'); shape(this.r2, noise ? 'sawtooth' : t2); }
    const w = -0.9 + 0.9 * p[8] / 127;               // pulse width (right = square)
    [this.o1, this.o2, ...(lay ? [this.u1, this.u2] : []), ...(pan ? [this.r1, this.r2] : [])].forEach(o => { if (o.type === 'pulse') o.width.value = w; });
    const m = p[5] / 127 * Math.PI / 2;
    const un = 1 / Math.sqrt(uni) * (lay ? Math.SQRT1_2 : 1) * (pan ? Math.SQRT1_2 : 1);                    // keep level steady with more unison voices
    this.g1.gain.value = Math.cos(m) * 0.5 * un;
    const ring = p[7] && !noise, sync = p[6] && this.sy && !ring && !noise, s2 = Math.sin(m) * 0.5 * un;
    this.g2.gain.value = noise || ring || sync ? 0 : s2;
    this.gr.gain.value = ring ? s2 * un : 0;
    this.sg2.gain.value = sync ? s2 : 0;
    if (this.sy) this.sy.port.postMessage({t: p[1] % 4, w: (-0.9 + 0.9 * p[8] / 127 + 1) / 2});
    if (pan) {                                  // width 0 = both copies centred, 127 = main copy hard left / second copy hard right
      const th = Math.PI / 4 * (1 - p[84] / 127), a = Math.cos(th), b = Math.sin(th);
      this.mL.gain.value = a; this.mR.gain.value = b; this.rL.gain.value = b; this.rR.gain.value = a;
      this.gr1.gain.value = this.g1.gain.value; this.gr2.gain.value = this.g2.gain.value;
    }
    if (lay) { this.gu1.gain.value = this.g1.gain.value; this.gu2.gain.value = this.g2.gain.value; }
    this.gn.gain.value = noise ? Math.sin(m) * 0.5 : 0;
    // Sub oscillator (wave values follow OSC1; assumed, unverified). Pulse is a fixed square.
    this.setType(this.so, SUBW[p[96]] || 'sine');          // sub wave numbering differs from OSC1 (1 = triangle confirmed on Synth1 with the Piano patch)
    this.sg.gain.value = p[95] / 127 * 0.5 * Math.cos(m);       // scales with the OSC1 side of the mix
    return {lay, pan};
  }
  // filter (type, resonance, saturation, cutoff, filter env) and the filter / amp envelopes
  applyFilter(p) {
    const [ft, ro] = FTYPE[p[14]] || FTYPE[1];
    this.f.type = ft; if (this.f.rolloff !== ro) this.f.rolloff = ro;
    this.f.Q.value = Math.pow(p[20] / 127, 2) * 14.5;   // dB per stage, added to the -5 dB offset set in setQOff (softer knee at res 0 like Synth1)
    if (this.f._filters.length !== this._qn) this.setQOff();
    { const sat = p[23] / 127, wet = Math.min(1, sat * 3);                       // 0 = bypass (exactly clean)
      this.satDry.gain.value = 1 - wet; this.satWet.gain.value = wet * 0.5; this.satPre.gain.value = (1 + sat * 14) / 8; }
    this.trackCut(p);
    this.fe.octaves = p[21] / 127 * CUT_OCT * (p[24] ? this.velF : 1);           // #21 amt is unipolar (0 = no envelope): in the 128 factory patches 91 are below 64 and 8 equal 64, so a bipolar reading would close the filter in most patches
    this.fe.attack = time(p[15]); this.fe.decay = time(p[16]);
    this.fe.sustain = p[17] / 127; this.fe.release = time(p[18]);
    this.amp.attack = time(p[25]); this.amp.decay = time(p[26]);
    this.amp.sustain = p[27] / 127; this.amp.release = time(p[28]);
  }
  // LFO routing, FM depth and the mod envelope.  lay / pan: which extra oscillator copies exist (their detune / width inputs get the same modulation).
  applyMod(p, lay, pan) {
    // LFO routing (shared LFOs; on/dest/depth param numbers)
    let trem = 0;
    const pw = o => o.type === 'pulse' ? [o.width] : [];   // pulse-width signal is recreated when the type changes
    [[57, 41, 44], [58, 46, 49]].forEach(([on, ds, dp], k) => {
      const dest = p[on] ? p[ds] : -1, d = p[dp] / 127;
      const tg = {1: [this.o2.detune, ...(lay ? [this.u2.detune] : []), ...(pan ? [this.r2.detune] : [])], 2: [this.o1.detune, this.o2.detune, this.so.detune, ...(lay ? [this.u1.detune, this.u2.detune] : []), ...(pan ? [this.r1.detune, this.r2.detune] : [])], 3: [this.f.detune], 4: [this.vg.gain],
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
  }
  setPitch(p, glide = 0) {
    const tune = (p[72] - 64) / 64 * 100 / 1200;                  // #72 tune: +-100 cents on both oscillators (provisional range)
    const det = p[76] / 127 * 50 / 1200;                          // #76 det: 0..+50 cents added to OSC1 (provisional range)
    // #2 OSC2 pitch: 0..127 -> -60..+60 semitones (64 = centre), rounded to whole semitones. The 128 factory patches support this scale:
    // 77 -> +12, 89 -> +24, 102 -> +36 (octaves). #3 fine: 66 = no offset, 1 cent per step (66 is the factory value in 55 of 128 patches; scale provisional).
    const semi = Math.round(p[2] <= 64 ? -60 + p[2] * 60 / 64 : (p[2] - 64) * 60 / 63);
    const st = semi + (p[3] - 66) / 100;
    const base2 = p[4] ? this.freq : Tone.Frequency(60, 'midi').toFrequency();   // #4 OSC2 kbd track off: fixed pitch (C4) regardless of the key
    const bk = Math.pow(2, S.BEND / 12);                              // MIDI pitch bend (semitones, set by js/midi.js), applied to every oscillator
    const f1 = this.freq * bk * Math.pow(2, tune + det);
    const f2 = base2 * bk * Math.pow(2, st / 12 + tune);
    const set = (sig, f) => glide > 0 ? sig.rampTo(f, glide) : (sig.value = f);
    set(this.o1.frequency, f1);
    set(this.so.frequency, this.freq * bk * (p[97] ? 0.5 : 1));
    set(this.o2.frequency, f2);
    if (this.rOn) { set(this.r1.frequency, f1); set(this.r2.frequency, f2); }
    if (this.uOn) { const k = Math.pow(2, (p[85] - 24) / 12); set(this.u1.frequency, f1 * k); set(this.u2.frequency, f2 * k); }
    if (this.sy) [['f1', f1], ['f2', f2]].forEach(([n, f]) => {
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
    const now = Tone.now(), s = P[30] / 127;
    // phase (#91 osc, #92 unison): oscillators free-run by default; with a nonzero phase they restart at that angle on every note-on.
    // #91 -> OSC1/OSC2/Sub (0..127 = 0..360 deg); #92 is added on top only while unison is on (a fat oscillator cannot offset its voices separately, so this is provisional)
    const ph = P[91] + (P[73] && P[93] > 1 ? P[92] : 0);
    if (ph || this.phased) {
      const deg = ph / 127 * 360, t0 = now + 0.003;
      [this.o1, this.o2, this.so, ...(this.uOn ? [this.u1, this.u2] : []), ...(this.rOn ? [this.r1, this.r2] : [])].forEach(o => { o.stop(now); o.phase = deg; o.start(t0); });
      this.phased = ph > 0;
    }
    // velocity (#30 amp sens, #24 filter switch). Relative to the reference velocity REFV (0.8 = PC keys), so a PC-key note sounds the same as before velocity existed.
    this.amp.triggerAttack(now, REFV * (1 - s * (1 - vel)) / (1 - s * (1 - REFV)));          // sens 0 = fixed level, 127 = level follows velocity
    this.velF = Math.max(0, Math.min(1.25, vel / REFV));                                   // #24 on: filter envelope amount follows velocity
    if (P[24]) this.fe.octaves = P[21] / 127 * CUT_OCT * this.velF;
    this.fe.triggerAttack(now); this.me.triggerAttack(now);
  }
  up() {
    this.on = false; this.note = null; this.t = performance.now();
    const now = Tone.now();
    this.amp.triggerRelease(now); this.fe.triggerRelease(now);
  }
}
S.Voice = Voice;
S.scan.push(Voice.prototype.apply, Voice.prototype.applyOsc, Voice.prototype.applyFilter, Voice.prototype.applyMod, Voice.prototype.setPitch, Voice.prototype.down, Voice.prototype.trackCut);
})();
