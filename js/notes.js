/* ELITA-1 note handling: poly / mono / legato voice allocation, key sync, arpeggiator. */
(function () {
const E = window.ELITA, P = E.params, S = (E.core = E.core || {});
// Poly: oldest released voice first, else steal the oldest held one.
// Mono / legato (#38 = 1 / 2): voice 0 only, last-note priority; legato keeps the envelopes running while notes overlap.
const stack = [];
// arpeggiator state (see the arpeggiator section below)
const ARP_BEATS = [4, 3, 2, 1.5, 1.3333, 1, 0.75, 0.6667, 0.5, 0.375, 0.3333, 0.25, 0.1875, 0.1667, 0.125, 0.09375, 0.08333, 0.0625, 0.04167];   // quarter-note beats per step, slow -> fast
const arp = {held: [], i: 0, dir: 1, timer: null, gateT: null, cur: null};
const isMono = () => P[38] === 1 || P[38] === 2;
const glideTime = overlap => (!P[74] || overlap) ? Math.pow(P[39] / 127, 2) * 2 : 0;   // #74 auto: glide only when notes overlap
function allOff() { stack.length = 0; arp.held.length = 0; clearTimeout(arp.timer); clearTimeout(arp.gateT); arp.timer = arp.gateT = arp.cur = null;
  if (S.voices) S.voices.forEach(v => v.on && v.up()); }
// key sync (#68 / #70): restart the LFO phase (or draw a new S&H value) on each note-on
function keySync() {
  [68, 70].forEach((no, k) => {
    if (!P[no] || !P[[57, 58][k]]) return;
    const ty = P[[42, 47][k]];
    if (ty === 3 || ty === 5) { S.shSig[k].value = Math.random() * 2 - 1; return; }
    if (S.lfos[k].state === 'started') { const t = Tone.now(); S.lfos[k].stop(t); S.lfos[k].start(t + 0.001); }
  });
}
function voiceOn(n, vel = 0.8) {
  if (!S.voices) return;
  keySync();
  S.dbgNote('on', n);
  if (isMono()) {
    if (stack.includes(n)) return;
    const overlap = stack.length > 0;
    stack.push(n);
    S.voices[0].down(n, vel, glideTime(overlap), !(overlap && P[38] === 2));
    return;
  }
  if (S.voices.some(v => v.note === n)) return;
  const byAge = (a, b) => a.t - b.t;
  const pool = S.voices.slice(0, Math.max(1, Math.min(S.POLY, P[94] || S.POLY)));
  const v = pool.filter(x => !x.on).sort(byAge)[0] || pool.slice().sort(byAge)[0];
  v.down(n, vel);
}
function voiceOff(n) {
  if (!S.voices) return;
  S.dbgNote('off', n);
  if (isMono()) {
    const i = stack.indexOf(n);
    if (i < 0) return;
    const last = i === stack.length - 1;
    stack.splice(i, 1);
    if (!last) return;
    if (stack.length) S.voices[0].down(stack[stack.length - 1], 0.8, glideTime(true), P[38] === 1);
    else S.voices[0].up();
    return;
  }
  S.voices.filter(v => v.note === n).forEach(v => v.up());
}

// ---- Arpeggiator (#59 on, #31 type, #32 oct range, #33 beat, #34 gate) ----
// While ON, held keys are not played directly: they are stepped through at the beat rate (follows the BPM box).
// type (#31, 1..4 in the factory files): 1 up, 2 down, 3 up/down, 4 random -- the numbering is a guess (the 128 factory patches use 1 almost everywhere).
// oct range #32: 0..3 = 1..4 octaves.  beat #33: 0..18 index (11 = 1/16), values above 18 are scaled down; table is provisional.
// gate #34: note length as a fraction of the step (value / 127).  No latch: releasing every key stops the arpeggio.
function arpList() {
  const base = arp.held.slice().sort((a, b) => a - b), oct = Math.max(0, Math.min(3, P[32] | 0)), all = [];
  for (let o = 0; o <= oct; o++) base.forEach(n => n + o * 12 <= 127 && all.push(n + o * 12));
  return all;
}
function arpStepSec() { const v = P[33], i = v > 18 ? Math.round(v / 127 * 18) : Math.max(0, v | 0); return ARP_BEATS[i] * 60 / S.BPM; }
function arpStop() {
  clearTimeout(arp.timer); clearTimeout(arp.gateT); arp.timer = arp.gateT = null;
  if (arp.cur !== null) { voiceOff(arp.cur); arp.cur = null; }
  arp.i = 0; arp.dir = 1;
}
function arpStep() {
  arp.timer = null;
  if (!arp.held.length || !P[59]) return arpStop();
  const l = arpList(), ty = P[31] | 0, n = l.length;
  let k;
  if (ty === 4) k = Math.floor(Math.random() * n);
  else if (ty === 3) { arp.i = (arp.i % n + n) % n; k = n - 1 - arp.i; arp.i++; }                 // 3 = down
  else if (ty === 1 && n > 1) {                                                                    // 1 = up/down
    if (arp.i >= n - 1) arp.dir = -1; else if (arp.i <= 0) arp.dir = 1; arp.i = Math.max(0, Math.min(n - 1, arp.i)); k = arp.i; arp.i += arp.dir; }
  else { arp.i = arp.i % n; k = arp.i; arp.i++; }
  if (arp.cur !== null) voiceOff(arp.cur);
  arp.cur = l[k]; voiceOn(arp.cur, 0.8);
  const step = arpStepSec(), note = arp.cur;
  clearTimeout(arp.gateT);
  arp.gateT = setTimeout(() => { if (arp.cur === note) { voiceOff(note); arp.cur = null; } }, Math.max(0.01, step * Math.max(0.05, Math.min(1, P[34] / 127))) * 1000);
  arp.timer = setTimeout(arpStep, step * 1000);
}
function noteOn(n, vel = 0.8) {
  if (!S.voices) return;
  if (!P[59]) return voiceOn(n, vel);
  if (arp.held.includes(n)) return;
  arp.held.push(n);
  S.dbgNote('on', n);
  if (arp.timer === null) arp.timer = setTimeout(arpStep, 20);   // short wait so the other notes of a chord are in the list before the first step
}
function noteOff(n) {
  if (!S.voices) return;
  const i = arp.held.indexOf(n);
  if (i >= 0) { arp.held.splice(i, 1); if (!arp.held.length) arpStop(); return; }
  voiceOff(n);
}
Object.assign(S, {arp, arpStop, allOff, voiceOn, voiceOff, noteOn, noteOff});
S.scan.push(keySync, voiceOn, voiceOff, noteOn, noteOff, arpStep, arpList, arpStepSec, glideTime, isMono);
})();
