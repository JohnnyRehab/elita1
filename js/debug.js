/* ELITA-1 debug mode (console helpers). Not needed for playing. */
(function () {
const E = window.ELITA, P = E.params, S = (E.core = E.core || {});
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
  const src = S.scan.map(f => f.toString()).join('\n');
  const u = new Set(); for (const m of src.matchAll(/\b[pP]\[(\d+)\]/g)) u.add(+m[1]);
  [41, 42, 43, 44, 46, 47, 48, 49, 57, 58, 67, 68, 69, 70].forEach(n => u.add(n));   // LFO params are read through index tables
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
  if (kind === 'off') { const v = S.voices.filter(x => x.note === n); console.log('%c[ELITA]%c note OFF %s (%d) → release voice %s', C, '', NOTE(n), n, v.map(x => S.voices.indexOf(x)).join(',') || '(none)'); return; }
  setTimeout(() => {   // after allocation
    const v = S.voices.filter(x => x.note === n);
    const vi = v.map(x => S.voices.indexOf(x)).join(',');
    const used = S.voices.filter(x => x.on).length;
    console.log('%c[ELITA]%c note ON  %s (midi %d, key shift %s → %s Hz) → voice #%s  [mode: %s, active voices %d/%d]', C, '', NOTE(n), n, P[9], r3(v[0] ? v[0].freq : 0), vi, ['poly','mono','legato'][P[38]] || P[38], used, S.POLY);
    if (v[0]) console.log('%c  path%c %s', C2, '', pathString(v[0]));
  }, 0);
}
function pathString(v) {
  const o1 = v.o1, o2 = v.o2, parts = [];
  const uni = o => o.count > 1 ? ' ×' + o.count + ' unison' + (P[93] > S.UNI_MAX ? ' (clamped from ' + P[93] + ')' : '') : '';
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
    v.useLad ? `→ FILTER(LADDER 24dB experimental, fc ${Math.round(v.fe.baseFrequency * v.ladScale.gain.value)}Hz, k ${r3(v.ladR.value)}, env ${r3(v.fe.octaves)} oct)` : `→ FILTER(${f.type} ${f.rolloff}dB, base ${Math.round(v.fe.baseFrequency)}Hz, Q ${r3(f.Q.value)}, env ${r3(v.fe.octaves)} oct)`,
    v.satWet.gain.value > 0 ? `→ SAT(tanh, drive ×${r3(v.satPre.gain.value * 8)}, wet ${r3(v.satWet.gain.value * 2)})` : '',
    `→ AMP(env A${r3(v.amp.attack)}s D${r3(S.T60(P[26]))}s(-60dB) S${r3(v.amp.sustain)} R${r3(S.T60(P[28]))}s(-60dB))`,
    lf.length ? `[${lf.join(', ')}]` : '', me ? `[mod env→${me}]` : '',
    '→ voice sum → master → EQ → Chorus → Delay → Pan → Limiter → SoftClip → OUT'].filter(Boolean).join(' ');
}
function chainRows() {
  const on = (b, x) => b ? 'ON' : 'bypass', w = n => r3(n.wet.value);
  return [
    {stage: 'master gain', state: 'ON', detail: `gain ${r3(S.master.gain.value)} (patch gain #29 × vol)`},
    {stage: 'EQ (peaking)', state: Math.abs(S.eq.gain.value) > 0.01 ? 'ON' : 'flat', detail: `${Math.round(S.eq.frequency.value)}Hz, ${r3(S.eq.gain.value)}dB, Q ${r3(S.eq.Q.value)}   tone ${r3(S.toneHi.gain.value)}dB (highs) / ${r3(S.toneLo.gain.value)}dB (lows)`},
    {stage: 'Chorus 1', state: on(P[66]), detail: `wet ${w(S.chorus)}, delay ${r3(S.chorus.delayTime)}ms, depth ${r3(S.chorus.depth)}, rate ${r3(S.chorus.frequency.value)}Hz, spread ${S.chorus.spread}, type x${P[64]}`},
    {stage: 'Chorus 2 (x3/x4 only)', state: on(S.chorus2.wet.value > 0), detail: `wet ${w(S.chorus2)}`},
    {stage: 'Delay', state: on(P[65]), detail: `type ${['ST', 'X', 'PP'][S.delay.type] || S.delay.type}, wet ${r3(S.delay.wetAmt)}, time ${r3(S.delay.time)}s (L ${Math.round(S.delay.dl.delayTime.value * 1000)} ms / R ${Math.round(S.delay.dr.delayTime.value * 1000)} ms), feedback ${r3(S.delay.fb)}, tone LP ${Math.round(S.delay.lpL.frequency.value)}Hz / HP ${Math.round(S.delay.hpL.frequency.value)}Hz`},
    {stage: 'Pan', state: Math.abs(S.panner.pan.value) > 0.01 ? 'ON' : 'center', detail: `pan ${r3(S.panner.pan.value)}`},
    {stage: 'Limiter → SoftClip(tanh)', state: 'ON', detail: 'safety'},
    {stage: 'Effect section (#77-81)', state: S.fx.on ? 'ON' : P[77] ? 'ON (deci. unavailable: AudioWorklet failed, passes through)' : 'off', detail: `type ${['a.d.1', 'a.d.2', 'd.d.', 'deci.', 'r.m.', 'comp.', 'ph.1', 'ph.2', 'ph.3', 'ph.4'][S.fx.type] || S.fx.type}, ctl1 ${P[79]}, ctl2 ${P[80]}, level ${P[81]} (placed before the EQ)`},
    {stage: 'Arpeggiator (#59, 31-34)', state: P[59] ? 'ON' : 'off', detail: `type ${['', 'up/down', 'up', 'down', 'random'][P[31]] || P[31]}, range ${(P[32] | 0) + 1} oct, beat #${P[33]}, gate ${P[34]}`}
  ];
}
function voiceRows(v, i) {
  return {voice: i, state: v.on ? 'HELD' : (v.amp.value > 0.001 ? 'release' : 'idle'), note: v.note == null ? '' : NOTE(v.note), path: pathString(v)};
}
function lfoRows() {
  return [0, 1].map(k => ({lfo: k + 1, on: !!P[[57, 58][k]], wave: S.shTimer[k] ? (S.shTimer[k].ty === 3 ? 'S&H (random steps)' : 'smooth random') : S.lfos[k].type, 'speed Hz': r3(S.lfos[k].frequency.value), depth: r3(P[[44, 49][k]]), dest: ['none','osc2 pitch','osc1,2 pitch','filter','amp','p/w','FM','pan (n/a)'][P[[41, 46][k]]] || P[[41, 46][k]]}));
}
function getMeters() {
  if (meters) return meters;
  const tap = n => { const m = new Tone.Meter({smoothing: 0.8}); n.connect(m); return m; };
  meters = {'voice sum (master in)': tap(S.master), 'after EQ': tap(S.toneHi), 'after Chorus': tap(S.chorus2), 'after Delay': tap(S.delay.output), 'after Pan': tap(S.panner), 'OUT': tap(S.clip)};
  S.voices.forEach((v, i) => { meters['voice' + i + ' filter out'] = tap(v.f); meters['voice' + i + ' amp out'] = tap(v.vg); });
  return meters;
}
window.ELITA.debug = {
  on() { DBG = true; lastP = {}; Object.keys(P).forEach(k => lastP[k] = P[k]); try { sessionStorage.setItem('elita-debug', '1'); } catch (e) {} if (S.voices) getMeters();
    console.log('%c[ELITA debug ON]%c  graph() voice(i) meters() params() unused()   — notes and parameter changes are logged', C, ''); if (S.voices) this.graph(); return 'debug on'; },
  off() { DBG = false; try { sessionStorage.removeItem('elita-debug'); } catch (e) {} return 'debug off'; },
  graph() {
    if (!S.voices) return console.warn('audio not started yet: click the page or press a key first');
    console.group('%c[ELITA] signal path', C);
    console.log('Per voice (' + S.POLY + ' voices):  [OSC1 | OSC2 | RING | SYNC | NOISE | SUB] → FILTER(+filter env) → AMP(+amp env) → sum');
    console.log('Shared:  voice sum → master → EQ → Chorus1 → Chorus2 → Delay → Pan → Limiter → SoftClip → speakers');
    console.log('Modulation: LFO1/LFO2 (shared, all voices), mod envelope (per voice)');
    console.log('Voices'); console.table(S.voices.map(voiceRows));
    console.log('Effect chain'); console.table(chainRows());
    console.log('LFOs'); console.table(lfoRows());
    console.groupEnd();
  },
  voice(i = 0) { const v = S.voices && S.voices[i]; if (!v) return 'no such voice';
    console.group('%c[ELITA] voice ' + i, C); console.log(pathString(v));
    console.table({osc1: {type: v.o1.type, unison: v.o1.count || 1, gain: r3(v.g1.gain.value), freq: r3(v.o1.frequency.value)},
      osc2: {type: v.o2.type, unison: v.o2.count || 1, gain: r3(v.g2.gain.value), freq: r3(v.o2.frequency.value)},
      sub: {type: v.so.type, unison: 1, gain: r3(v.sg.gain.value), freq: r3(v.so.frequency.value)},
      noise: {gain: r3(v.gn.gain.value)}, ring: {gain: r3(v.gr.gain.value)}, sync: {gain: r3(v.sg2.gain.value)}, fm: {gain: r3(v.fm.gain.value)}});
    console.groupEnd(); },
  meters() { if (!S.voices) return console.warn('audio not started yet');
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
Object.assign(S, {dbgParams, dbgNote, getMeters, usedSet});
})();
