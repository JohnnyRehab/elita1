/* ELITA-1 AudioWorklet sources: hard-sync oscillator (voice) and decimator (effect section). Loaded as one module by engine.js. */
(function () {
const E = window.ELITA, S = (E.core = E.core || {});
S.SYNC_SRC = `class S extends AudioWorkletProcessor {
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
registerProcessor('decimator', D);`;
})();
