/* ELITA-1 effects: effect section (distortion / deci. / r.m. / comp. / phaser), stereo delay, chorus, EQ, tone, LFO speed. */
(function () {
const E = window.ELITA, S = (E.core = E.core || {});
const {LFO_WAVE} = S;
const LFO_BEATS = [64, 32, 16, 8, 4, 3, 2, 1.5, 1.3333, 1, 0.75, 0.6667, 0.5, 0.375, 0.3333, 0.25, 0.125];   // tempo-sync divisions (beats per LFO cycle), slow -> fast; provisional
// Effect section (#77-81): 0 a.d.1 / 1 a.d.2 / 2 d.d. / 3 deci. / 4 r.m. / 5 comp. / 6-9 ph.1-4 (numbering follows the panel order, a guess).
// Distortions: ctl1 = drive, ctl2 = low-pass cutoff, level = dry/wet balance. Other types: see applyFxSection. All curves and ranges are provisional.
const FX_K = 8;                                           // the shaper sees x*FX_K (its input range is -1..1), the pre gain is drive/FX_K
const FX_CURVES = [
  x => Math.tanh(x + 0.35) - Math.tanh(0.35),             // a.d.1: asymmetric soft clip (even harmonics); the DC offset is removed by the high-pass
  x => Math.tanh(x),                                      // a.d.2: symmetric soft clip
  x => Math.round(Math.max(-1, Math.min(1, x * 1.3)) * 96) / 96,   // d.d.: hard clip with a fine (about 7 bit) step
];
const PH_STAGES = [2, 4, 8, 12];                         // ph.1..ph.4 = 1 / 2 / 4 / 6 notch stages (2 all-pass filters each)
function makeFx() {
  const G = v => new Tone.Gain(v);
  const f = {input: G(1), dry: G(1), pre: G(1 / FX_K), wet: G(0), post: G(1), out: G(1), curve: -1, phN: 0,
    shaper: new Tone.WaveShaper(x => x, 4096), hp: new Tone.Filter(20, 'highpass'), lp: new Tone.Filter(20000, 'lowpass')};
  f.input.connect(f.dry); f.dry.connect(f.out);
  f.input.chain(f.pre, f.shaper, f.hp, f.lp, f.post, f.wet, f.out);
  // deci.: sample-rate / bit reduction in an AudioWorklet (bypassed if the worklet could not be loaded)
  f.gDeci = G(0);
  if (S.SYNC_OK) {
    f.dc = Tone.getContext().createAudioWorkletNode('decimator', {numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit'});
    f.dcIn = G(4); f.dcOut = G(0.25);                      // the signal is small, so scale it up before quantizing (keeps few-bit settings audible)
    f.input.connect(f.dcIn); Tone.connect(f.dcIn, f.dc); Tone.connect(f.dc, f.dcOut); f.dcOut.connect(f.gDeci); f.gDeci.connect(f.out);
  }
  // r.m.: ring modulation with an internal sine
  f.rmOsc = new Tone.Oscillator(200, 'sine').start(); f.rmMul = new Tone.Multiply(0); f.gRm = G(0);
  f.rmOsc.connect(f.rmMul.factor); f.input.chain(f.rmMul, f.gRm, f.out);
  // comp.
  f.comp = new Tone.Compressor({threshold: -20, ratio: 4, attack: 0.01, release: 0.15, knee: 6}); f.cmk = G(1); f.gComp = G(0);
  f.input.chain(f.comp, f.cmk, f.gComp, f.out);
  // ph.1-4: chain of 12 all-pass filters (the first N are used), swept by an LFO, with feedback through a one-block delay
  f.phIn = G(1); f.phOut = G(1); f.gPh = G(0);
  f.ap = Array.from({length: 12}, () => new Tone.Filter({type: 'allpass', frequency: 600, Q: 0.7}));
  f.phLfo = new Tone.LFO({frequency: 0.5, min: -300, max: 300});
  f.phFb = G(0); f.phDel = new Tone.Delay(0.003, 0.01);
  f.input.connect(f.phIn); f.phOut.chain(f.gPh, f.out);
  f.phOut.chain(f.phFb, f.phDel, f.phIn);
  f.ap.forEach(a => f.phLfo.connect(a.frequency));
  return f;
}
function phBuild(n) {                                      // connect the first n all-pass filters
  S.fx.ap.forEach(a => a.disconnect()); try { S.fx.phIn.disconnect(S.fx.ap[0]); } catch (e) { /* first call: not connected yet */ }
  S.fx.phIn.connect(S.fx.ap[0]); for (let i = 0; i < n - 1; i++) S.fx.ap[i].connect(S.fx.ap[i + 1]); S.fx.ap[n - 1].connect(S.fx.phOut);
  S.fx.phN = n;
}
function applyFxSection(p) {
  const ty = p[78] | 0, on = !!p[77], c1 = p[79] / 127, c2 = p[80] / 127, lv = p[81] / 127;
  const dist = on && ty >= 0 && ty < FX_CURVES.length, deci = on && ty === 3 && !!S.fx.dc, rm = on && ty === 4, cmp = on && ty === 5, ph = on && ty >= 6 && ty <= 9;
  if (dist && S.fx.curve !== ty) { S.fx.shaper.setMap(x => FX_CURVES[ty](x * FX_K)); S.fx.curve = ty; }
  const drive = Math.pow(40, c1);
  S.fx.pre.gain.value = drive / FX_K;
  S.fx.post.gain.value = 1 / Math.pow(drive, 0.55);          // keep the loudness roughly constant as the drive rises
  S.fx.lp.frequency.value = 500 * Math.pow(40, c2);          // 500 Hz .. 20 kHz
  S.fx.hp.frequency.value = ty === 0 ? 120 : 20;             // a.d.1 loses its low end (negative feedback)
  if (deci) S.fx.dc.port.postMessage({hold: Math.pow(100, 1 - c1), lv: Math.pow(2, Math.round(1 + c2 * 15) - 1)});   // ctl1: 44.1 kHz .. ~441 Hz, ctl2: 1 .. 16 bits
  S.fx.rmOsc.frequency.value = 20 * Math.pow(250, c1);       // r.m.: 20 Hz .. 5 kHz
  { const d = cmp ? c1 : 0, thr = -4 - d * 40, ratio = 1.5 + d * 14;                // comp.: ctl1 = depth, ctl2 = attack (1 .. 100 ms)
    S.fx.comp.threshold.value = thr; S.fx.comp.ratio.value = ratio; S.fx.comp.attack.value = 0.001 * Math.pow(100, c2);
    S.fx.cmk.gain.value = 1; }                                // (Web Audio's DynamicsCompressor already applies its own automatic make-up gain)
  if (ph) {                                                // ph.n: ctl1 = LFO depth, ctl2 = LFO speed, level = feedback
    const n = PH_STAGES[ty - 6]; if (S.fx.phN !== n) phBuild(n);
    S.fx.phLfo.min = -c1 * 550; S.fx.phLfo.max = c1 * 550; S.fx.phLfo.frequency.value = 0.05 * Math.pow(160, c2);
    S.fx.phFb.gain.value = lv * 0.85;
    if (S.fx.phLfo.state !== 'started') S.fx.phLfo.start();
  } else if (S.fx.phLfo.state === 'started') S.fx.phLfo.stop();
  const cs = Math.cos(lv * Math.PI / 2), sn = Math.sin(lv * Math.PI / 2);
  const mixed = dist || deci || rm || cmp;                 // level = dry / wet balance (phasers: level is the feedback and the mix is fixed)
  S.fx.dry.gain.value = mixed ? cs : ph ? 0.55 : 1;
  S.fx.wet.gain.value = dist ? sn : 0; S.fx.gRm.gain.value = rm ? sn : 0; S.fx.gComp.gain.value = cmp ? sn : 0;
  S.fx.gPh.gain.value = ph ? 0.55 : 0; S.fx.gDeci.gain.value = deci ? sn : 0;
  S.fx.on = dist || deci || rm || cmp || ph; S.fx.type = ty;
}

// Stereo delay with 3 types (#82: 0 = ST: L/R in parallel, 1 = X: feedback crosses L<->R, 2 = PP: mono in, ping-pong) -- numbering is a guess.
// #83 spread: +-100 ms shift between the channels (64 = none, default 66); #98 tone on the wet signal: 64 = flat, below = high-cut (low-pass), above = low-cut (high-pass), default 64 (Synth1 manual; the cutoff ranges are provisional).
function makeDelay() {
  const G = v => new Tone.Gain(v), D = () => new Tone.Delay(0.25, 2);
  const d = {input: G(1), output: G(1), dry: G(1), wet: G(0), split: new Tone.Split(2), merge: new Tone.Merge(),
    dl: D(), dr: D(), lpL: new Tone.Filter(20000, 'lowpass'), lpR: new Tone.Filter(20000, 'lowpass'), hpL: new Tone.Filter(20, 'highpass'), hpR: new Tone.Filter(20, 'highpass'),
    iLL: G(1), iRL: G(0), iLR: G(0), iRR: G(1), fLL: G(0), fLR: G(0), fRL: G(0), fRR: G(0)};
  d.input.connect(d.dry); d.dry.connect(d.output);
  d.input.connect(d.split);
  d.split.connect(d.iLL, 0); d.split.connect(d.iLR, 0); d.split.connect(d.iRL, 1); d.split.connect(d.iRR, 1);
  d.iLL.connect(d.dl); d.iRL.connect(d.dl); d.iLR.connect(d.dr); d.iRR.connect(d.dr);
  d.dl.connect(d.lpL); d.dr.connect(d.lpR); d.lpL.connect(d.hpL); d.lpR.connect(d.hpR);
  d.hpL.connect(d.fLL); d.hpL.connect(d.fLR); d.hpR.connect(d.fRL); d.hpR.connect(d.fRR);
  d.fLL.connect(d.dl); d.fRL.connect(d.dl); d.fLR.connect(d.dr); d.fRR.connect(d.dr);   // f<from><to> naming is by output side: fLL = L->L, fLR = L->R, fRL = R->L, fRR = R->R
  d.hpL.connect(d.merge, 0, 0); d.hpR.connect(d.merge, 0, 1);
  d.merge.connect(d.wet); d.wet.connect(d.output);
  return d;
}
function applyDelay(p) {
  const d = S.delay, ty = p[82] | 0, fb = Math.min(0.9, p[36] / 127 * 0.9), t = Math.min(2, (p[35] + 1) * 60 / S.BPM / 16);
  const sh = (p[83] - 64) / 64 * 0.1;                          // seconds: > 0 delays the right channel, < 0 the left
  d.dl.delayTime.value = Math.min(2, t + Math.max(0, -sh)); d.dr.delayTime.value = Math.min(2, t + Math.max(0, sh));
  const cross = ty === 1 || ty === 2, mono = ty === 2;
  d.iLL.gain.value = mono ? 0.5 : 1; d.iRL.gain.value = mono ? 0.5 : 0; d.iLR.gain.value = 0; d.iRR.gain.value = mono ? 0 : 1;
  d.fLL.gain.value = cross ? 0 : fb; d.fRR.gain.value = cross ? 0 : fb;
  d.fLR.gain.value = cross ? fb : 0; d.fRL.gain.value = cross ? fb : 0;
  const lp = p[98] < 64 ? 20000 * Math.pow(1500 / 20000, (64 - p[98]) / 64) : 20000, hp = p[98] > 64 ? 20 * Math.pow(800 / 20, (p[98] - 64) / 63) : 20;   // provisional ranges: low-pass 20 k .. 1.5 kHz, high-pass 20 .. 800 Hz
  d.lpL.frequency.value = lp; d.lpR.frequency.value = lp; d.hpL.frequency.value = hp; d.hpR.frequency.value = hp;
  const w = p[65] ? p[37] / 127 : 0;
  d.dry.gain.value = Math.cos(w * Math.PI / 2); d.wet.gain.value = Math.sin(w * Math.PI / 2) * 1.2;
  d.wetAmt = w; d.time = t; d.fb = fb; d.type = ty;
}
// Provisional curves for the shared blocks (LFO speed, delay, chorus)
function applyFx(p) {
  S.master.gain.rampTo(p[29] / 127 * Math.pow(p.vol / 127, 2) * 0.9, 0.02);
  S.eq.frequency.value = 100 * Math.pow(100, p[61] / 127);          // 100 Hz .. 10 kHz (provisional)
  S.eq.gain.value = (p[62] - 64) / 64 * 12; S.eq.Q.value = 0.3 + p[63] / 127 * 6;
  const tn = (p[60] - 64) / 64 * 9;                                 // #60 tone: 64 = flat, up = brighter (highs +, lows -), down = darker; max about ±9 dB each side (provisional)
  S.toneLo.gain.value = -tn; S.toneHi.gain.value = tn;
  applyFxSection(p);
  S.panner.pan.value = Math.max(-1, Math.min(1, (p[90] - 64) / 63));
  [[42, 43], [47, 48]].forEach(([t, sp], k) => {
    const sync = p[[67, 69][k]];                                // tempo sync: the speed knob picks a beat division instead of a rate
    const hz = sync ? 1 / (LFO_BEATS[Math.round(p[sp] / 127 * 16)] * 60 / S.BPM) : 0.1 * Math.pow(200, p[sp] / 127);   // free: 0.1 .. 20 Hz
    const ty = p[t], rnd = ty === 3 || ty === 5;
    S.lfos[k].frequency.value = hz;
    if (rnd) {                                              // 3 = S&H (stepped), 5 = smooth random (glides to each new value)
      if (S.lfos[k].state === 'started') S.lfos[k].stop();
      if (S.shTimer[k] === null || S.shTimer[k].hz !== hz || S.shTimer[k].ty !== ty) {
        if (S.shTimer[k]) clearInterval(S.shTimer[k].id);
        const f = () => { const v = Math.random() * 2 - 1; if (ty === 5) S.shSig[k].rampTo(v, 1 / hz); else S.shSig[k].value = v; };
        f(); S.shTimer[k] = {hz, ty, id: setInterval(f, 1000 / hz)};
      }
    } else {
      if (S.shTimer[k]) { clearInterval(S.shTimer[k].id); S.shTimer[k] = null; S.shSig[k].value = 0; }
      const wt = LFO_WAVE[ty] || 'sine';
      if (S.lfos[k].type !== wt) S.lfos[k].type = wt;                    // assigning the type rebuilds the waveform (about 4 ms): only when it really changed
      if (S.lfos[k].state !== 'started') S.lfos[k].start();
    }
  });
  applyDelay(p);
  S.chorus.delayTime = 2 + p[52] / 127 * 8;                            // ms
  S.chorus.depth = p[53] / 127;
  S.chorus.frequency.value = 0.1 + Math.pow(p[54] / 127, 2) * 8;
  S.chorus.feedback.value = Math.max(0, p[55] - 64) / 63 * 0.9;        // 64 = 0
  S.chorus.wet.value = p[66] ? p[56] / 127 : 0;
  // Chorus type: indicator "xN" = value N (Oldage Leader x2, Pain Leader x4). Approximation:
  // x1 = mono LFO, x2 = L/R opposite phase, x3/x4 = extra detuned 2nd stage in series.
  const n = Math.max(1, Math.min(4, p[64]));
  const spr = n === 1 ? 0 : 180; if (S.chorus.spread !== spr) S.chorus.spread = spr;   // the setter resets the LFO phase (expensive): only when it changed
  S.chorus2.delayTime = (2 + p[52] / 127 * 8) * 1.3;
  S.chorus2.depth = p[53] / 127 * 0.8;
  S.chorus2.frequency.value = S.chorus.frequency.value * 1.37;
  S.chorus2.feedback.value = 0;
  S.chorus2.wet.value = p[66] && n >= 3 ? p[56] / 127 * (n === 4 ? 0.8 : 0.5) : 0;
}
Object.assign(S, {makeFx, makeDelay, applyFx});
S.scan.push(applyFx, applyDelay);
})();
