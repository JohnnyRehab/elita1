/* ELITA-1 AudioWorklet sources: hard-sync oscillator (voice) and decimator (effect section). Loaded as one module by engine.js. */
(function () {
const E = window.ELITA, S = (E.core = E.core || {});
S.SYNC_SRC = `class S extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{name: 'f1', defaultValue: 220, automationRate: 'k-rate'}, {name: 'f2', defaultValue: 220, automationRate: 'k-rate'}]; }
  constructor() { super(); this.a = 0; this.b = 0; this.t = 1; this.w = 0.5; this.aa = 0; this.y1 = 0; this.c = 0; this.port.onmessage = e => { this.t = e.data.t; this.w = e.data.w; this.aa = e.data.aa ? 1 : 0; }; }
  // ---- optional anti-aliasing (Settings > Hard sync): PolyBLEP for steps, PolyBLAMP for slope changes, 2-sample kernel, output delayed by 1 sample ----
  val(x) { const t = this.t; return t === 0 ? Math.sin(6.2832 * x) : t === 1 ? 2 * x - 1 : t === 2 ? (x < this.w ? 1 : -1) : 4 * Math.abs(x - 0.5) - 1; }
  sl(x) { const t = this.t; return t === 0 ? 6.2832 * Math.cos(6.2832 * x) : t === 1 ? 2 : t === 2 ? 0 : (x < 0.5 ? -4 : 4); }   // slope per phase unit
  ev(H, dS, d) {          // a step H and a slope change dS (per sample) happened d samples (0..1) before the current sample
    d = d < 0 ? 0 : d > 1 ? 1 : d; const e = 1 - d;
    this.y1 += 0.5 * H * d * d + dS * d * d * d / 6;       // correction of the previous sample
    this.c += -0.5 * H * e * e + dS * e * e * e / 6;        // correction of the current sample
  }
  adv(x0, L, dEnd, f2) {   // slave phase x0 advances for L samples; the segment ends dEnd samples before the current sample. Natural wrap and pulse edge are corrected.
    if (f2 <= 0) return x0;
    let x1 = x0 + f2 * L;
    if (this.t === 2 && x0 < this.w && this.w <= x1) this.ev(-2, 0, dEnd + L - (this.w - x0) / f2);
    if (this.t === 3 && x0 < 0.5 && 0.5 <= x1) this.ev(0, 8 * f2, dEnd + L - (0.5 - x0) / f2);   // triangle vertex
    if (x1 >= 1) { this.ev(this.val(0) - this.val(1), (this.sl(0) - this.sl(1)) * f2, dEnd + L - (1 - x0) / f2); x1 -= 1; if (x1 >= 1) x1 -= Math.floor(x1); }
    return x1;
  }
  processAA(out, f1, f2) {
    for (let n = 0; n < out.length; n++) {
      let a = this.a + f1, b;
      if (a >= 1) {                                   // master wrap: slave runs on to the reset instant, jumps to phase 0, then runs for the rest of the sample
        a -= 1; const d = f1 > 0 ? Math.min(a / f1, 1) : 0;
        const xb = this.adv(this.b, 1 - d, d, f2);
        this.ev(this.val(0) - this.val(xb), (this.sl(0) - this.sl(xb)) * f2, d);
        b = this.adv(0, d, 0, f2);
      } else b = this.adv(this.b, 1, 0, f2);
      this.a = a; this.b = b;
      const v = this.val(b) + this.c; this.c = 0;
      out[n] = this.y1; this.y1 = v;
    }
  }
  process(i, o, p) {
    const out = o[0][0], f1 = p.f1[0] / sampleRate, f2 = p.f2[0] / sampleRate;
    if (this.aa) { this.processAA(out, f1, f2); return true; }
    for (let n = 0; n < out.length; n++) {
      this.a += f1; if (this.a >= 1) { this.a -= 1; this.b = f1 > 0 ? this.a * f2 / f1 : 0; }   // master wrap resets the slave
      this.b += f2; if (this.b >= 1) this.b -= 1;
      const x = this.b;
      out[n] = this.t === 0 ? Math.sin(6.2832 * x) : this.t === 1 ? 2 * x - 1 : this.t === 2 ? (x < this.w ? 1 : -1) : 4 * Math.abs(x - 0.5) - 1;
    }
    return true;
  }
}
registerProcessor('sync-osc', S);
class D extends AudioWorkletProcessor {
  constructor() { super(); this.hold = 1; this.lv = 32768; this.c = [0, 0]; this.h = [0, 0]; this.port.onmessage = e => { this.hold = e.data.hold; this.lv = e.data.lv; }; }
  process(i, o) {
    const inp = i[0], out = o[0];
    for (let ch = 0; ch < out.length; ch++) {
      const x = inp[ch] || inp[0], y = out[ch];
      if (!x) { y.fill(0); continue; }
      for (let n = 0; n < y.length; n++) {
        this.c[ch] += 1;
        if (this.c[ch] >= this.hold) { this.c[ch] -= this.hold; this.h[ch] = Math.round(Math.max(-1, Math.min(1, x[n])) * this.lv) / this.lv; }
        y[n] = this.h[ch];
      }
    }
    return true;
  }
}
registerProcessor('decimator', D);
const th = x => x > 4.5 ? 1 : x < -4.5 ? -1 : x * (27 + x * x) / (27 + 9 * x * x);   // rational tanh
class L extends AudioWorkletProcessor {
  // Experimental 4-pole low-pass ladder (24 dB/oct), zero-delay-feedback (TPT one-pole stages, the resonance loop is solved instantaneously).
  // freq (Hz, a-rate) and detune (cents, a-rate) are driven by the filter envelope / LFO; res = feedback amount k (0 .. 4, self-oscillation at 4).
  // sat (k-rate, Settings > Ladder character): 0 = linear stages with a soft limit (default), 1 = tanh on the input and on every stage (transistor-ladder style, resonance saturates by itself).
  static get parameterDescriptors() { return [{name: 'freq', defaultValue: 0, minValue: 0, maxValue: 60000, automationRate: 'a-rate'}, {name: 'detune', defaultValue: 0, minValue: -100000, maxValue: 100000, automationRate: 'a-rate'}, {name: 'res', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'k-rate'}, {name: 'sat', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate'}, {name: 'fbhp', defaultValue: 0, minValue: 0, maxValue: 2000, automationRate: 'k-rate'}]; }
  constructor() { super(); this.s = [new Float64Array(4), new Float64Array(4)]; this.z = new Float64Array(2); }
  process(i, o, p) {
    const inp = i[0], out = o[0], n = out[0].length, fq = p.freq, dt = p.detune, k = p.res[0], sat = p.sat[0] > 0.5, hp = p.fbhp[0], ha = hp > 0 ? 1 - Math.exp(-2 * Math.PI * hp / sampleRate) : 0, lim = sampleRate * 0.45, K = Math.PI / sampleRate;
    if (!inp.length) { for (let c = 0; c < out.length; c++) { out[c].fill(0); this.s[c % 2].fill(0); this.z[c % 2] = 0; } return true; }
    for (let m = 0; m < n; m++) {
      let f = fq.length > 1 ? fq[m] : fq[0]; const d = dt.length > 1 ? dt[m] : dt[0];
      if (d) f *= Math.pow(2, d / 1200);
      f = f < 8 ? 8 : f > lim ? lim : f;
      const g = Math.tan(K * f), G = g / (1 + g), G2 = G * G, G4 = G2 * G2, h = 1 / (1 + g);
      for (let c = 0; c < out.length; c++) {
        const s = this.s[c % 2], x = (inp[c] || inp[0])[m];
        const S = (G2 * G * s[0] + G2 * s[1] + G * s[2] + s[3]) * h;                 // contribution of the stored states to the stage-4 output
        const zc = c % 2, z = hp > 0 ? this.z[zc] : 0;                                // feedback high-pass (Settings > Ladder bass feedback): the feedback is y4 - lowpass(y4), the slow lowpass state z is taken from the previous sample
        let u = (x - k * (S - z)) / (1 + k * G4);
        if (sat) { let y = th(u); for (let q = 0; q < 4; q++) { const v = G * th(y - s[q]), yy = v + s[q]; s[q] = yy + v; y = yy; } out[c][m] = y; if (hp > 0) this.z[zc] += ha * (y - z); continue; }
        { const a = u < 0 ? -u : u; if (a > 1.5) { const z = (a - 1.5) / 1.5, t = z > 4.5 ? 1 : z * (27 + z * z) / (27 + 9 * z * z); u = (u < 0 ? -1 : 1) * (1.5 + 1.5 * t); } }   // linear up to 1.5, then a soft limit toward 3: normal signals are untouched, a strong resonance cannot run away
        let v = (u - s[0]) * G, y = v + s[0]; s[0] = y + v; const y1 = y;
        v = (y1 - s[1]) * G; y = v + s[1]; s[1] = y + v; const y2 = y;
        v = (y2 - s[2]) * G; y = v + s[2]; s[2] = y + v; const y3 = y;
        v = (y3 - s[3]) * G; y = v + s[3]; s[3] = y + v;
        out[c][m] = y; if (hp > 0) this.z[zc] += ha * (y - z);
      }
    }
    return true;
  }
}
registerProcessor('ladder', L);`;
})();
