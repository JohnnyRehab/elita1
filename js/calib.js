/* ELITA-1 calibration: wave tables, unit curves (time, cutoff) and the shared state object ELITA.core. Edit curves here. */
(function () {
const E = window.ELITA, S = (E.core = E.core || {});
const POLY = 5, UNI_MAX = 3, REFV = 0.8;   // ELITA limits: voices / unison voices per oscillator (clamped: CPU load and a repeatable timbre) / reference velocity (0.8 = PC keys)
// Settings > Voice limits: 'elita' (the numbers above) or 'synth1' (the ranges of the real Synth1 panel: poly 1..32, unison num 1..8). S.POLY = number of voices that exist, S.UNI_MAX = unison clamp; both are set by engine.js / settings.js.
const SYNTH1_LIM = {poly: 32, uni: 8};
// LFO type (#42 / #47), raw value -> shape (Synth1 AU, 2026.10.30): 0 saw down, 1 triangle, 2 pulse/square,
// 3 S&H, 4 smoothed random, 5 sine (4 was taken for saw up in 0.5.61; the manual and OpenSynth1 both list a smoothed random there).  The e5_type CSV is labelled by the requested norm band, not by the raw value
// (requested 2 -> raw 5 = sine, 3 -> raw 2 = pulse, 4 -> raw 3 = S&H, 5 -> raw 4 = saw up).
// 3 and 4 are random values (timer, see applyFx); 0 is a rising saw inverted at the send.
const LFO_WAVE = ['sawtooth','triangle','square',null,null,'sine'];
// Shared wave values (differs from the GUI display order). Confirmed on Synth1:
// osc1 3 = tri; osc2 1 = saw, 2 = pulse, 4 = noise. 0 = sine follows by elimination (osc1 has 4 shapes).
const SUBW = ['sine', 'triangle', 'sawtooth', 'square'];   // #96: 0 sine / 1 triangle (confirmed) / 2 saw / 3 square (the last two follow the Synth1 manual order, unverified)
const OSC1 = ['sine','sawtooth','pulse','triangle'];
const OSC2 = [null,'sawtooth','pulse','triangle','noise'];   // 0 = none (silent, as in OpenSynth1); the manual lists tri / saw / square / noise only
const FTYPE = [['lowpass',-12],['lowpass',-24],['highpass',-12],['bandpass',-12],['lowpass',-24]];
// ---- Curves tuned against Synth1 recordings (see history.md). Anything marked provisional is still to be measured. ----
const time = v => 0.001 * Math.pow(8000, v / 127);   // 1 ms .. 8 s
// Decay / release time (amp #26 #28, filter envelope #16 #18): measured on Synth1 (AU, saw, S = 0, time until the level has fallen by 60 dB, 2026.10): D 16 / 32 / 48 / 64 / 80 / 96 / 112 / 127 = 0.03 / 0.07 / 0.20 / 0.58 / 1.7 / 5.0 / ~16 / ~46 s.
// Decay and release gave the same curve. Fit: T60(v) = 0.0088 * exp(0.0665 v) s (-15% .. +8% over v 8..127).  Attack is a different curve and still uses time().
// Tone's exponential envelope reaches -60 dB after 6.908 * ln(t + 1) / ln(200) s for the time t that is set (checked by rendering), so t is set to exp(T60 * ln(200) / 6.908) - 1 to get the measured T60.
const T60 = v => 0.0088 * Math.exp(0.0665 * Math.max(0, Math.min(127, v)));
const tEnv = v => Math.exp(T60(v) * 0.7669) - 1;
const CUT_MIN = 28, CUT_MAX = 12300;                                  // highest cutoff the filter envelope reaches (Synth1 AU measurement: about 12.3 kHz)
const AMT_OCT = v => (v - 64) * 0.1495;   // #21 filter env amount: bipolar, zero at 64, 0.1495 oct per step (Synth1 AU measurement 2026.10.29: 63 / 64 / 65 = 649 / 716 / 799 Hz, 64 -> 72 = +1.20 oct)
// frq (#19) -> cutoff in Hz: log-interpolated table. Re-calibrated 2026.10.30 against the Synth1 AU measurement (E1, saw A2 / A3, fit_cutoff.py): the table was iterated until ELITA's own render,
// run through the same harmonic fit, gives the same fc as the AU (32..112 within 3 %). 0..24 are provisional (ELITA's output there is below the leak floor, the fit is not usable; set to about 0.67 x the AU fit).
// The AU ceiling is about 12.3 kHz (white noise at frq 127); 120 / 127 are above it on purpose (ELITA's fit reads low near the top), the envelope ceiling is CUT_MAX.
// Q_OFF: per-stage resonance offset in dB at res 0 (Synth1's knee is softer than a plain biquad with Q = 0 dB).
const Q_OFF = -5;
const CUT_TAB = [[0, 41], [8, 59], [16, 70], [24, 78], [32, 120], [40, 186], [48, 285], [56, 444], [64, 689], [72, 1074], [80, 1694], [88, 2699], [96, 4205], [104, 6629], [112, 10111], [120, 14504], [127, 14504]];
// log-interpolation through a [frq, Hz] table (shared by the biquad and ladder curves)
const interp = (tab, v) => {
  v = Math.max(0, Math.min(127, v));
  for (let i = 1; i < tab.length; i++) if (v <= tab[i][0]) {
    const a = tab[i - 1], b = tab[i], t = (v - a[0]) / (b[0] - a[0]);
    return a[1] * Math.pow(b[1] / a[1], t);
  }
  return tab[tab.length - 1][1];
};
// Smooth variant (Settings > Cutoff curve): a monotone cubic (Fritsch-Carlson / PCHIP) through the same points in (frq, log Hz). It passes exactly through every table point
// and has no kinks at them; between the points it follows the trend of the neighbours instead of a straight line. Not more "correct" until more points are measured.
const pchip = (tab, v) => {
  v = Math.max(0, Math.min(127, v)); const n = tab.length, x = tab.map(t => t[0]), y = tab.map(t => Math.log(t[1])), d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) { if (d[i - 1] * d[i] <= 0) m[i] = 0; else { const h0 = x[i] - x[i - 1], h1 = x[i + 1] - x[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); } }
  let i = 1; while (i < n - 1 && v > x[i]) i++;
  const h = x[i] - x[i - 1], t = (v - x[i - 1]) / h, t2 = t * t, t3 = t2 * t;
  return Math.exp((2 * t3 - 3 * t2 + 1) * y[i - 1] + (t3 - 2 * t2 + t) * h * m[i - 1] + (-2 * t3 + 3 * t2) * y[i] + (t3 - t2) * h * m[i]);
};
const cutoff = v => S.CUT_SMOOTH ? pchip(CUT_TAB, v) : interp(CUT_TAB, v);
// LFO speed (#43 / #48) in Hz, free run (Synth1 AU, 2026.10.29): 0..16 = 0.29 (floor), then about 12.5 units/oct.
const LFO_SPD = [[0, 0.29], [16, 0.29], [32, 0.5], [48, 1.32], [64, 3.32], [80, 8.35], [96, 20.98], [112, 52.75], [127, 94.72]];
// LFO pitch depth (#44 / #49) in cents peak-to-peak, measured on the osc2 pitch destination.
const LFO_PITCH = [[0, 0], [8, 132], [16, 279], [32, 666], [64, 1869], [100, 4392], [127, 6860]];
const lin = (tab, v) => { v = Math.max(0, Math.min(127, v)); for (let i = 1; i < tab.length; i++) if (v <= tab[i][0]) { const a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]); } return tab[tab.length - 1][1]; };
// lfoPitch is linear between the points: it starts at 0 cents, and the log interpolation of interp() gives NaN there (0 * Infinity), which broke every patch with an LFO pitch depth below 8.
const lfoSpd = v => interp(LFO_SPD, v), lfoPitch = v => lin(LFO_PITCH, v);
// Experimental ladder filter (S.FILTER = 'ladder'; chosen in Settings, or ELITA.engine.filterMode('ladder' | 'biquad') from the console).
// A 4-pole ladder fitted to the same Synth1 recordings as the biquad pair (A2 / A3 / A4 harmonics, frq 64..112) leaves the same residual (about 0.5 dB rms) with ONE free parameter (fc)
// instead of two (fc + resonance offset), so it is a simpler description of Synth1's knee.  fc (Hz) per frq: 64 -> 586, 80 -> 1454, 96 -> 3784, 112 -> 11955 (measured; not ratio-scaled).
// LAD_K: feedback at res 127 (4 = self-oscillation); res has not been measured on Synth1, so this is provisional.
// #22 key track (Synth1 AU measurement, saw at 6 notes): the pivot note is C3 (48), not C4. Slope in oct per oct, below / above the pivot:
// #22 = 127 / 96 / 64 / 32 -> 0.99 / 0.81 / 0.63 / 0.40 below and 0.90 / 0.72 / 0.51 / 0.26 above (notes 72 / 84 were not measurable). Fit: (v/127)^0.66 and 0.9 (v/127)^0.85.
const KT_BASE = 48, KT_SLOPE = (v, above) => v <= 0 ? 0 : above ? 0.9 * Math.pow(v / 127, 0.85) : Math.pow(v / 127, 0.66);
// #29 gain (Synth1 AU measurement: level in dB relative to 127, rms of a held saw): piecewise linear in dB; below 8 it fades to silence. Normalised so that 92 keeps the level it had with the old linear curve.
const GAIN_DB = [[8, -37.34], [16, -30.66], [24, -26.06], [32, -22.43], [40, -19.4], [48, -16.77], [56, -14.43], [64, -12.31], [72, -10.37], [80, -8.58], [88, -6.91], [96, -5.34], [104, -3.86], [112, -2.45], [120, -1.12], [127, 0]];
const gainDb = v => { v = Math.max(0, Math.min(127, v)); if (v < 8) return -37.34; for (let i = 1; i < GAIN_DB.length; i++) if (v <= GAIN_DB[i][0]) { const a = GAIN_DB[i - 1], b = GAIN_DB[i]; return a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]); } return 0; };
const GAIN_REF = Math.pow(10, gainDb(92) / 20) / (92 / 127);
const gainCurve = v => v <= 0 ? 0 : (v < 8 ? v / 8 : 1) * Math.pow(10, gainDb(v) / 20) / GAIN_REF;
// #30 velocity sensitivity: level in dB = -(1 - vel) * (sens / 127) * 29.5 (Synth1 AU measurement, vel 32 / 64 / 100 at sens 127 and 64; sens 0 = constant)
const VEL_DB = 29.5;
const LAD_K = 3.6;
// Ladder fc, measured directly with the 4-pole model: 64 -> 586, 80 -> 1454, 96 -> 3784, 112 -> 11955 Hz.
// Do not ratio-scale this table to CUT_TAB: the biquad fit is biased low, the ladder fit is not.  0..48 and 127 are extrapolated.
const CUT_TAB_LAD = [[0, 19], [16, 38], [32, 86], [48, 192], [64, 586], [80, 1454], [96, 3784], [112, 11955], [127, 30000]];
const cutoffLad = v => S.CUT_SMOOTH ? pchip(CUT_TAB_LAD, v) : interp(CUT_TAB_LAD, v);
// Settings (js/settings.js writes these): FILTER 'biquad' | 'ladder'; LADDER_SAT 'soft' | 'stage'; SYNC_AA = PolyBLEP / PolyBLAMP on the hard-sync oscillator;
// analog.slop = fixed per-voice detune (cents, max) and analog.drift = slow random pitch / cutoff wander (cents, rms-ish). All off by default = the sound of ver 0.5.53.
Object.assign(S, {LAD_K, cutoffLad, FILTER: 'biquad', LADDER_SAT: 'soft', LADDER_FBHP: 0, CUT_SMOOTH: false, SYNC_AA: false, analog: {slop: 0, drift: 0}});
Object.assign(S, {POLY, UNI_MAX, REFV, SYNTH1_LIM, LIMITS: 'elita', LFO_WAVE, LFO_SPD, LFO_PITCH, lfoSpd, lfoPitch, interp, SUBW, OSC1, OSC2, FTYPE, time, CUT_MIN, CUT_MAX, Q_OFF, cutoff, T60, tEnv, AMT_OCT, KT_BASE, KT_SLOPE, gainCurve, VEL_DB});
// shared mutable state (written by engine.js / voice.js / js/midi.js; read everywhere as S.xxx)
Object.assign(S, {BPM: 120, BEND: 0, SYNC_OK: false, voices: null, master: null, panner: null, eq: null, toneLo: null, toneHi: null, lim: null, clip: null, wave: null,
  lfos: null, lfoOut: null, shSig: null, shTimer: [null, null], chorus: null, chorus2: null, delay: null, fx: null, scan: []});
})();
