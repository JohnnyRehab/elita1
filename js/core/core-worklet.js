/* ELITA-1 sound engine, AudioWorklet side: runs the Wasm DSP core (core/elita_core.cpp) and nothing else.
   Messages from the main thread (port.postMessage): {a: [event, ...]} a batch of events, {module} the compiled Wasm module (when it was not passed in processorOptions).
   event = {k, ...}: k 'p' {i, v} parameter / 'c' {i, v} config / 'on' {i, n, vel, g, r} voice down / 'off' {i} voice up / 'ks' {i} LFO key sync / 'la' {i, v} (tests) advance an LFO by v seconds. An event with t (context seconds) is applied at the first
   block that starts at or after t (the offline tests use this); live events have no t and are applied at once. */
class ElitaCore extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.ready = false; this.pend = [];
    this.port.onmessage = ev => {
      const d = ev.data;
      if (d.module) this.boot(d.module);
      if (d.a) this.queue(d.a);
    };
    if (o.module) this.boot(o.module);
    if (o.init) this.queue(o.init);                      // initial state and (offline) timed events: present from the first block on
  }
  boot(module) {
    const e = this.e = new WebAssembly.Instance(module, {}).exports;
    e.ec_init(sampleRate);
    this.l = new Float32Array(e.memory.buffer, e.ec_out_l(), 1024);
    this.r = new Float32Array(e.memory.buffer, e.ec_out_r(), 1024);
    this.ready = true;
    this.port.postMessage({ready: true});
  }
  queue(list) {
    for (const ev of list) {
      const t = ev.t;
      if (t === undefined || t === null) this.apply(ev); else { this.pend.push(ev); this.pend.sort((x, y) => x.t - y.t); }
    }
  }
  apply(ev) {
    const e = this.e; if (!e) return;
    switch (ev.k) {
      case 'p': e.ec_set_param(ev.i, ev.v); break;
      case 'c': e.ec_set_cfg(ev.i, ev.v); break;
      case 'on': e.ec_voice_down(ev.i, ev.n, ev.vel, ev.g, ev.r); break;
      case 'off': e.ec_voice_up(ev.i); break;
      case 'ks': e.ec_lfo_sync(ev.i); break;                   // LFO key sync
      case 'la': e.ec_lfo_advance(ev.i, ev.v); break;          // tests: advance a free-running LFO by v seconds
      default: break;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!this.ready || !out || !out.length) return true;
    while (this.pend.length && this.pend[0].t <= currentTime + 1e-9) this.apply(this.pend.shift());
    const n = out[0].length, e = this.e;
    e.ec_process(n);
    out[0].set(this.l.subarray(0, n));
    if (out[1]) out[1].set(this.r.subarray(0, n));
    return true;
  }
}
registerProcessor('elita-core', ElitaCore);
