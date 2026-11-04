// ELITA-1 DSP core (milestone M1).
// Freestanding C++17: no libc, no exceptions, no heap. Builds for wasm32 (AudioWorklet) and for the host (tests, benchmarks) from this one file.
// The core is a "voice bank": voice allocation (poly / mono / legato / arpeggiator) stays in js/notes.js and calls ec_voice_down / ec_voice_up.
// Sound design follows js/voice.js of the Tone.js engine as closely as possible (see the notes next to each block); curves come from js/calib.js.
#include <stdint.h>

#ifdef EC_NATIVE
#define EC_API extern "C"
#else
#define EC_API extern "C" __attribute__((used, visibility("default")))
#endif

namespace {

// ---------------------------------------------------------------------------------------------------------------------------------
// Math (no libm): sin / exp2 / log2 / pow / tanh, accurate to about 1e-11 in double.
// ---------------------------------------------------------------------------------------------------------------------------------
constexpr double PI = 3.14159265358979323846;
constexpr double LN2 = 0.6931471805599453, LOG2E = 1.4426950408889634;

inline double dfloor(double x) { return __builtin_floor(x); }
inline double dsqrt(double x) { return __builtin_sqrt(x); }
inline double dabs(double x) { return __builtin_fabs(x); }
inline double dmin(double a, double b) { return a < b ? a : b; }
inline double dmax(double a, double b) { return a > b ? a : b; }
inline double clampd(double x, double lo, double hi) { return x < lo ? lo : x > hi ? hi : x; }

double msin(double x) {
  double k = dfloor(x * (2.0 / PI) + 0.5);
  double r = x - k * (PI / 2);
  int q = (int)((int64_t)k & 3);
  double r2 = r * r;
  double s = r * (1 + r2 * (-1 / 6.0 + r2 * (1 / 120.0 + r2 * (-1 / 5040.0 + r2 * (1 / 362880.0 + r2 * (-1 / 39916800.0 + r2 * (1 / 6227020800.0)))))));
  double c = 1 + r2 * (-1 / 2.0 + r2 * (1 / 24.0 + r2 * (-1 / 720.0 + r2 * (1 / 40320.0 + r2 * (-1 / 3628800.0 + r2 * (1 / 479001600.0 + r2 * (-1 / 87178291200.0)))))));
  return q == 0 ? s : q == 1 ? c : q == 2 ? -s : -c;
}
inline double mcos(double x) { return msin(x + PI / 2); }

double mexp2(double x) {
  if (x < -1021) return 0;
  if (x > 1020) x = 1020;
  double fl = dfloor(x), t = (x - fl) * LN2;
  double p = 1 + t * (1 + t / 2 * (1 + t / 3 * (1 + t / 4 * (1 + t / 5 * (1 + t / 6 * (1 + t / 7 * (1 + t / 8 * (1 + t / 9 * (1 + t / 10 * (1 + t / 11 * (1 + t / 12)))))))))));
  union { double d; uint64_t u; } v;
  v.u = (uint64_t)((int64_t)fl + 1023) << 52;
  return p * v.d;
}
inline double mexp(double x) { return mexp2(x * LOG2E); }

double mlog2(double x) {
  if (x <= 1e-300) return -1000;
  union { double d; uint64_t u; } v;
  v.d = x;
  int e = (int)((v.u >> 52) & 0x7ff) - 1023;
  v.u = (v.u & 0x000fffffffffffffULL) | 0x3ff0000000000000ULL;
  double m = v.d;
  if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
  double s = (m - 1) / (m + 1), s2 = s * s;
  double ln = 2 * s * (1 + s2 * (1 / 3.0 + s2 * (1 / 5.0 + s2 * (1 / 7.0 + s2 * (1 / 9.0 + s2 * (1 / 11.0 + s2 * (1 / 13.0 + s2 / 15.0)))))));
  return e + ln * LOG2E;
}
inline double mlog(double x) { return mlog2(x) * LN2; }
inline double mpow(double a, double b) { return a <= 0 ? 0 : mexp2(b * mlog2(a)); }
double mtanh(double x) {
  if (x > 9) return 1;
  if (x < -9) return -1;
  double e = mexp(2 * x);
  return (e - 1) / (e + 1);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Curves (ported from js/calib.js; all inputs are Synth1 raw values 0..127)
// ---------------------------------------------------------------------------------------------------------------------------------
constexpr double CUT_MIN = 28, CUT_MAX = 12300, Q_OFF = -5, VEL_DB = 29.5, REFV = 0.8;
constexpr int KT_BASE = 48;
const double CUT_TAB[17][2] = {{0, 41}, {8, 59}, {16, 70}, {24, 78}, {32, 120}, {40, 186}, {48, 285}, {56, 444}, {64, 689}, {72, 1074}, {80, 1694}, {88, 2699}, {96, 4205}, {104, 6629}, {112, 10111}, {120, 14504}, {127, 14504}};
const double GAIN_DB[16][2] = {{8, -37.34}, {16, -30.66}, {24, -26.06}, {32, -22.43}, {40, -19.4}, {48, -16.77}, {56, -14.43}, {64, -12.31}, {72, -10.37}, {80, -8.58}, {88, -6.91}, {96, -5.34}, {104, -3.86}, {112, -2.45}, {120, -1.12}, {127, 0}};

const double LFO_SPD[9][2] = {{0, 0.29}, {16, 0.29}, {32, 0.5}, {48, 1.32}, {64, 3.32}, {80, 8.35}, {96, 20.98}, {112, 52.75}, {127, 94.72}};   // LFO speed (Hz, free run)
const double LFO_PITCH[7][2] = {{0, 0}, {8, 132}, {16, 279}, {32, 666}, {64, 1869}, {100, 4392}, {127, 6860}};                                         // LFO pitch depth (cents p-p)
const double CUT_TAB_LAD[9][2] = {{0, 19}, {16, 38}, {32, 86}, {48, 192}, {64, 586}, {80, 1454}, {96, 3784}, {112, 11955}, {127, 30000}};              // ladder fc
const double LFO_BEATS[17] = {64, 32, 16, 8, 4, 3, 2, 1.5, 1.3333, 1, 0.75, 0.6667, 0.5, 0.375, 0.3333, 0.25, 0.125};                                 // tempo-sync LFO: beats per cycle
constexpr double LAD_K = 3.6;

double interpN(const double (*tab)[2], int n, double v) {      // log-interpolation through a [x, Hz] table (calib.js interp)
  v = clampd(v, 0, 127);
  for (int i = 1; i < n; i++) if (v <= tab[i][0]) {
    double t = (v - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]);
    return tab[i - 1][1] * mpow(tab[i][1] / tab[i - 1][1], t);
  }
  return tab[n - 1][1];
}
double linN(const double (*tab)[2], int n, double v) {         // linear interpolation (calib.js lin)
  v = clampd(v, 0, 127);
  for (int i = 1; i < n; i++) if (v <= tab[i][0]) return tab[i - 1][1] + (tab[i][1] - tab[i - 1][1]) * (v - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]);
  return tab[n - 1][1];
}
double pchipN(const double (*tab)[2], int n, double v) {       // monotone cubic through the same points in (x, log Hz) (calib.js pchip)
  v = clampd(v, 0, 127);
  double x[17], y[17], d[17], m[17];
  for (int i = 0; i < n; i++) { x[i] = tab[i][0]; y[i] = mlog(tab[i][1]); }
  for (int i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (int i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { double h0 = x[i] - x[i - 1], h1 = x[i + 1] - x[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  int i = 1;
  while (i < n - 1 && v > x[i]) i++;
  double h = x[i] - x[i - 1], t = (v - x[i - 1]) / h, t2 = t * t, t3 = t2 * t;
  return mexp((2 * t3 - 3 * t2 + 1) * y[i - 1] + (t3 - 2 * t2 + t) * h * m[i - 1] + (-2 * t3 + 3 * t2) * y[i] + (t3 - t2) * h * m[i]);
}
inline double interp17(double v) { return interpN(CUT_TAB, 17, v); }
inline double pchip17(double v) { return pchipN(CUT_TAB, 17, v); }
double gainDb(double v) {
  v = clampd(v, 0, 127);
  if (v < 8) return -37.34;
  for (int i = 1; i < 16; i++) if (v <= GAIN_DB[i][0]) {
    double a0 = GAIN_DB[i - 1][0], a1 = GAIN_DB[i - 1][1], b0 = GAIN_DB[i][0], b1 = GAIN_DB[i][1];
    return a1 + (b1 - a1) * (v - a0) / (b0 - a0);
  }
  return 0;
}
double gainCurve(double v) {
  static double ref = 0;
  if (ref == 0) ref = mpow(10, gainDb(92) / 20) / (92.0 / 127);
  if (v <= 0) return 0;
  return (v < 8 ? v / 8 : 1) * mpow(10, gainDb(v) / 20) / ref;
}
inline double timeCurve(double v) { return 0.001 * mpow(8000, v / 127); }                         // attack, mod env: 1 ms .. 8 s
inline double t60Curve(double v) { return 0.0088 * mexp(0.0665 * clampd(v, 0, 127)); }
inline double tEnvCurve(double v) { return mexp(t60Curve(v) * 0.7669) - 1; }                      // Tone envelope time giving the measured T60 (see calib.js)
inline double ampOct(double v) { return (v - 64) * 0.1495; }                                        // filter env amount in octaves
inline double ktSlope(double v, bool above) { return v <= 0 ? 0 : above ? 0.9 * mpow(v / 127, 0.85) : mpow(v / 127, 0.66); }

// ---------------------------------------------------------------------------------------------------------------------------------
// Band-limited wave tables (mip-mapped by octave, like a Web Audio PeriodicWave): saw, triangle. Sine is table 10 of either.
// ---------------------------------------------------------------------------------------------------------------------------------
constexpr int TN = 4096, NB = 11;                                  // table size, number of band-limited tables (1024, 512, ... 1 harmonics)
float SAWT[NB][TN + 1];                                            // x in [0,1): 2x - 1, zero-mean, band-limited (guard point at the end)
float TRIT[NB][TN + 1];                                            // Web Audio triangle (0 at x = 0, 1 at x = 1/4)
float SINT[TN + 1];
double thr[NB];                                                    // table k is used while f0 <= thr[k]
double SAWN = 1;                                                   // peak of the raw saw table (Gibbs overshoot): the pulse is built from raw differences, so it is scaled back by this
double SQ_NORM = 1;                                                // peak of the raw band-limited square (built from saw differences), used to normalise it like Chromium does
double SAW_NORM = 1;                                               // the saw tables are divided by this (peak incl. Gibbs overshoot); the pulse needs the true 2x - 1 scale back
bool tablesBuilt = false;
double SR = 44100, NYQ = 22050, ISR = 1.0 / 44100;

void buildTables() {
  static double stab[TN];
  for (int i = 0; i < TN; i++) stab[i] = msin(2 * PI * i / TN);
  for (int i = 0; i <= TN; i++) SINT[i] = (float)stab[i & (TN - 1)];
  for (int k = 0; k < NB; k++) {
    int H = 1024 >> k;
    for (int i = 0; i < TN; i++) {
      double s = 0, t = 0;
      for (int n = 1; n <= H; n++) {
        double v = stab[(n * i) & (TN - 1)];
        s += v / n;
        if (n & 1) t += ((n & 2) ? -1.0 : 1.0) * v / ((double)n * n);
      }
      SAWT[k][i] = (float)(-(2 / PI) * s);
      TRIT[k][i] = (float)((8 / (PI * PI)) * t);
    }
    SAWT[k][TN] = SAWT[k][0]; TRIT[k][TN] = TRIT[k][0];
  }
  // the same normalisation for every table (taken from the widest one), so that the level does not change with pitch
  double ms = 0, mt = 0;
  for (int i = 0; i < TN; i++) { ms = dmax(ms, dabs(SAWT[0][i])); mt = dmax(mt, dabs(TRIT[0][i])); }
  SAWN = ms;
  SAW_NORM = ms;
  for (int k = 0; k < NB; k++) for (int i = 0; i <= TN; i++) { SAWT[k][i] = (float)(SAWT[k][i] / ms); TRIT[k][i] = (float)(TRIT[k][i] / mt); }
  double mq = 0;                                                   // square = S(x - 1/2) - S(x): its peak (Gibbs overshoot) normalises it to 1
  for (int i = 0; i < TN; i++) mq = dmax(mq, dabs((SAWT[0][(i + TN / 2) & (TN - 1)] - SAWT[0][i]) * ms));
  SQ_NORM = mq;
  tablesBuilt = true;
}
inline int bandIndex(double f0) {
  int k = 0;
  while (k < NB - 1 && f0 > thr[k]) k++;
  return k;
}
inline float lookup(const float* t, double x) {                    // x in [0,1)
  double p = x * TN;
  int i = (int)p;
  float fr = (float)(p - i);
  return t[i] + (t[i + 1] - t[i]) * fr;
}
inline double wrap1(double x) { return x - dfloor(x); }

enum Wave { W_SINE = 0, W_SAW = 1, W_PULSE = 2, W_TRI = 3, W_NONE = 4, W_SQUARE = 5 };   // W_SQUARE: sub oscillator only (a native Web Audio square)

// Accumulate n samples of one oscillator copy into out. ph is advanced. duty is only used for the pulse.
// Phase conventions follow Web Audio / Tone: saw 0 -> 1 (at x = 1/2) -> -1 -> 0; pulse is high for x in (1/4 - duty/2, 1/4 + duty/2).
void renderCopy(int wave, double& ph, double inc, double duty, float gain, float* out, int n) {
  switch (wave) {
    case W_SINE: {
      for (int s = 0; s < n; s++) { out[s] += gain * lookup(SINT, ph); ph += inc; if (ph >= 1) ph -= 1; }
    } break;
    case W_SAW: {
      const float* t = SAWT[bandIndex(inc * SR)];
      for (int s = 0; s < n; s++) { double x = ph + 0.5; if (x >= 1) x -= 1; out[s] += gain * lookup(t, x); ph += inc; if (ph >= 1) ph -= 1; }
    } break;
    case W_TRI: {
      const float* t = TRIT[bandIndex(inc * SR)];
      for (int s = 0; s < n; s++) { out[s] += gain * lookup(t, ph); ph += inc; if (ph >= 1) ph -= 1; }
    } break;
    case W_PULSE: {                                                // pulse(x) = S(x - b) - S(x - a) + (2d - 1), S = band-limited 2x - 1; high on [a, b)
      // Tone's PulseOscillator thresholds a triangle (tri + width > 0), so the high part is centred on x = 1/4: a = 1/4 - d/2, b = 1/4 + d/2
      const float* t = SAWT[bandIndex(inc * SR)];
      const double a = 0.25 - duty / 2, b = 0.25 + duty / 2, c = 2 * duty - 1;
      for (int s = 0; s < n; s++) {
        double xb = ph - b; if (xb < 0) xb += 1;
        double xa = ph - a; if (xa < 0) xa += 1;
        out[s] += gain * (float)((lookup(t, xb) - lookup(t, xa)) * SAW_NORM + c);
        ph += inc; if (ph >= 1) ph -= 1;
      }
    } break;
    case W_SQUARE: {                                               // native square: high on [0, 1/2), peak-normalised
      const float* t = SAWT[bandIndex(inc * SR)];
      const float k = (float)(SAW_NORM / SQ_NORM);
      for (int s = 0; s < n; s++) {
        double xb = ph - 0.5; if (xb < 0) xb += 1;
        out[s] += gain * (lookup(t, xb) - lookup(t, ph)) * k;
        ph += inc; if (ph >= 1) ph -= 1;
      }
    } break;
    default: break;
  }
}

// One sample of a wave at phase ph (table k). The generic (slower) path, used when the frequency changes every sample (FM).
inline float waveAt(int wave, double ph, int k, double duty) {
  switch (wave) {
    case W_SINE: return lookup(SINT, ph);
    case W_SAW: { double x = ph + 0.5; if (x >= 1) x -= 1; return lookup(SAWT[k], x); }
    case W_TRI: return lookup(TRIT[k], ph);
    case W_PULSE: {
      const double a = 0.25 - duty / 2, b = 0.25 + duty / 2;
      double xb = ph - b; if (xb < 0) xb += 1;
      double xa = ph - a; if (xa < 0) xa += 1;
      return (float)((lookup(SAWT[k], xb) - lookup(SAWT[k], xa)) * SAW_NORM + (2 * duty - 1));
    }
    case W_SQUARE: { double xb = ph - 0.5; if (xb < 0) xb += 1; return (lookup(SAWT[k], xb) - lookup(SAWT[k], ph)) * (float)(SAW_NORM / SQ_NORM); }
    default: return 0;
  }
}
// Same as renderCopy, but the increment is incBase * mul[s] (FM: the detune of the oscillator is modulated by the audio of OSC2).
void renderCopyFM(int wave, double& ph, double incBase, double duty, float gain, const float* mul, float* out, int n) {
  for (int s = 0; s < n; s++) {
    double inc = incBase * mul[s];
    out[s] += gain * waveAt(wave, ph, wave == W_SINE ? 0 : bandIndex(inc * SR), duty);
    ph += inc; ph -= dfloor(ph);
  }
}

// Hard-sync slave oscillator: the port of the 'sync-osc' AudioWorklet of js/worklets.js. The slave restarts whenever the master (OSC1 frequency, no unison / FM) wraps.
// Without anti-aliasing the waves are the naive ones (saw 2x-1, pulse, triangle 4|x-1/2|-1, sine); with it PolyBLEP (steps) and PolyBLAMP (slope changes) are applied.
struct SyncOsc {
  double a = 0, b = 0, y1 = 0, c = 0;
  static double val(int t, double w, double x) { return t == 0 ? msin(2 * PI * x) : t == 1 ? 2 * x - 1 : t == 2 ? (x < w ? 1 : -1) : 4 * dabs(x - 0.5) - 1; }
  static double sl(int t, double x) { return t == 0 ? 2 * PI * mcos(2 * PI * x) : t == 1 ? 2 : t == 2 ? 0 : (x < 0.5 ? -4 : 4); }   // slope per phase unit
  void ev(double H, double dS, double d) {                         // a step H and a slope change dS (per sample) happened d samples (0..1) before the current sample
    d = d < 0 ? 0 : d > 1 ? 1 : d; double e = 1 - d;
    y1 += 0.5 * H * d * d + dS * d * d * d / 6;
    c += -0.5 * H * e * e + dS * e * e * e / 6;
  }
  double adv(int t, double w, double x0, double L, double dEnd, double f2) {   // slave phase x0 advances for L samples; the segment ends dEnd samples before the current sample
    if (f2 <= 0) return x0;
    double x1 = x0 + f2 * L;
    if (t == 2 && x0 < w && w <= x1) ev(-2, 0, dEnd + L - (w - x0) / f2);
    if (t == 3 && x0 < 0.5 && 0.5 <= x1) ev(0, 8 * f2, dEnd + L - (0.5 - x0) / f2);
    if (x1 >= 1) { ev(val(t, w, 0) - val(t, w, 1), (sl(t, 0) - sl(t, 1)) * f2, dEnd + L - (1 - x0) / f2); x1 -= 1; if (x1 >= 1) x1 -= dfloor(x1); }
    return x1;
  }
  // f1 / f2 are phase increments per sample. Writes n samples to out (aa: anti-aliased, 1 sample late).
  void run(int t, double w, bool aa, double f1, double f2, float* out, int n) {
    if (aa) {
      for (int i = 0; i < n; i++) {
        double A = a + f1, B;
        if (A >= 1) {
          A -= 1; double d = f1 > 0 ? dmin(A / f1, 1) : 0;
          double xb = adv(t, w, b, 1 - d, d, f2);
          ev(val(t, w, 0) - val(t, w, xb), (sl(t, 0) - sl(t, xb)) * f2, d);
          B = adv(t, w, 0, d, 0, f2);
        } else B = adv(t, w, b, 1, 0, f2);
        a = A; b = B;
        double v = val(t, w, b) + c; c = 0;
        out[i] = (float)y1; y1 = v;
      }
    } else {
      for (int i = 0; i < n; i++) {
        a += f1; if (a >= 1) { a -= 1; b = f1 > 0 ? a * f2 / f1 : 0; }
        b += f2; if (b >= 1) b -= 1;
        out[i] = (float)val(t, w, b);
      }
    }
  }
  void skip(double f1, double f2, int n) { a = wrap1(a + f1 * n); b = wrap1(b + f2 * n); }
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Envelope: the shape of Tone.Envelope / AmplitudeEnvelope / FrequencyEnvelope as used by js/voice.js
//   attack  = linear ramp (from the current value, so a retrigger is click-free; the time scales with the remaining distance)
//   decay / release = exponentialApproach: target ramp with time constant ln(t + 1) / ln(200) for 90 % of t, then a linear ramp to the target at t
// ---------------------------------------------------------------------------------------------------------------------------------
struct Env {
  enum { IDLE, ATT, DEC_E, DEC_L, SUS, REL_E, REL_L };
  int st = IDLE;
  double v = 0, inc = 0, k = 0, n = 0, vel = 1, dv = 0, decT = 0, relT = 0;
  bool hasDecay = false;
  void startDecay() {
    v = vel;
    if (hasDecay) {
      double tc = mlog(decT + 1) / mlog(200);
      k = mexp(-1 / (tc * SR)); n = 0.9 * decT * SR; st = DEC_E;
    } else st = SUS;
  }
  void trigger(double velocity, double atk, double dec, double sus) {
    vel = velocity; decT = dec; dv = velocity * sus; hasDecay = dec > 0 && sus < 1;
    double att = atk;
    if (v > 0) att = atk * (1 - v);
    if (att * SR < 1) startDecay();
    else { st = ATT; n = att * SR; inc = (vel - v) / n; }
  }
  void release(double rel) {
    if (v > 0) {
      relT = rel;
      if (rel * SR < 1) { v = 0; st = IDLE; }
      else { double tc = mlog(rel + 1) / mlog(200); k = mexp(-1 / (tc * SR)); n = 0.9 * rel * SR; st = REL_E; }
    } else { v = 0; st = IDLE; }
  }
  inline double tick() {
    const double out = v;                                          // the value of this sample; the state then moves on to the next one
    switch (st) {
      case ATT: v += inc; if (--n <= 0) startDecay(); break;
      case DEC_E: v = dv + (v - dv) * k; if (--n <= 0) { st = DEC_L; n = dmax(0.1 * decT * SR, 1); inc = (dv - v) / n; } break;
      case DEC_L: v += inc; if (--n <= 0) { v = dv; st = SUS; } break;
      case REL_E: v = v * k; if (--n <= 0) { st = REL_L; n = dmax(0.1 * relT * SR, 1); inc = -v / n; } break;
      case REL_L: v += inc; if (--n <= 0) { v = 0; st = IDLE; } break;
      default: break;
    }
    return out;
  }
  bool silent() const { return st == IDLE || (st == SUS && v <= 0); }
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Biquad: the Web Audio BiquadFilterNode formulas (spec / current Chromium: RBJ cookbook, Q in dB for LP / HP, linear for BP; verified against
// BiquadFilterNode impulse responses in core/tests/test_filter_env.mjs). Tone.Filter cascades these; js/voice.js adds Q_OFF to the Q parameter.
// ---------------------------------------------------------------------------------------------------------------------------------
enum FType { F_LP = 0, F_HP = 1, F_BP = 2, F_PEAK = 3, F_LSH = 4, F_HSH = 5, F_AP = 6 };
struct Biquad {
  double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
  inline double run(double x) { double y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; }
  void norm(double B0, double B1, double B2, double A0, double A1, double A2) { double i = 1 / A0; b0 = B0 * i; b1 = B1 * i; b2 = B2 * i; a1 = A1 * i; a2 = A2 * i; }
  // cutoff = f / nyquist. For LP / HP "qa" = 1 / (2 * 10^(Qdb / 20)); for BP "q" is the linear Q.
  void set(int type, double cutoff, double q, double qa, double gainDb = 0) {
    cutoff = clampd(cutoff, 0, 1);
    if (type >= F_PEAK) {                                          // peaking / shelves / all-pass (linear Q for peaking and all-pass; the shelves use S = 1), as Chromium
      const double A = mpow(10, gainDb / 40);
      if (type == F_AP) {
        if (cutoff > 0 && cutoff < 1 && q > 0) { double w0 = PI * cutoff, alpha = msin(w0) / (2 * q), k = mcos(w0); norm(1 - alpha, -2 * k, 1 + alpha, 1 + alpha, -2 * k, 1 - alpha); }
        else norm(1, 0, 0, 1, 0, 0);
      } else if (type == F_PEAK) {
        if (cutoff > 0 && cutoff < 1) {
          if (q > 0) { double w0 = PI * cutoff, alpha = msin(w0) / (2 * q), k = mcos(w0); norm(1 + alpha * A, -2 * k, 1 - alpha * A, 1 + alpha / A, -2 * k, 1 - alpha / A); }
          else norm(A * A, 0, 0, 1, 0, 0);
        } else norm(1, 0, 0, 1, 0, 0);
      } else if (cutoff > 0 && cutoff < 1) {
        const double w0 = PI * cutoff, alpha = msin(w0) / 2 * dsqrt(2.0), k = mcos(w0), k2 = 2 * dsqrt(A) * alpha, ap1 = A + 1, am1 = A - 1;
        if (type == F_LSH) norm(A * (ap1 - am1 * k + k2), 2 * A * (am1 - ap1 * k), A * (ap1 - am1 * k - k2), ap1 + am1 * k + k2, -2 * (am1 + ap1 * k), ap1 + am1 * k - k2);
        else norm(A * (ap1 + am1 * k + k2), -2 * A * (am1 + ap1 * k), A * (ap1 + am1 * k - k2), ap1 - am1 * k + k2, 2 * (am1 - ap1 * k), ap1 - am1 * k - k2);
      } else if ((type == F_LSH) == (cutoff >= 1)) norm(A * A, 0, 0, 1, 0, 0);                         // low shelf at nyquist / high shelf at 0: the whole band is shelved
      else norm(1, 0, 0, 1, 0, 0);
      return;
    }
    if (type == F_BP) {
      if (cutoff > 0 && cutoff < 1) {
        if (q > 0) { double w0 = PI * cutoff, alpha = msin(w0) / (2 * q), k = mcos(w0); norm(alpha, 0, -alpha, 1 + alpha, -2 * k, 1 - alpha); }
        else norm(1, 0, 0, 1, 0, 0);
      } else norm(0, 0, 0, 1, 0, 0);
      return;
    }
    if (cutoff >= 1 || cutoff <= 0) { norm((type == F_LP ? cutoff >= 1 : cutoff <= 0) ? 1 : 0, 0, 0, 1, 0, 0); return; }
    double w0 = PI * cutoff, cs = mcos(w0), alpha = msin(w0) * qa;
    if (type == F_LP) norm((1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + alpha, -2 * cs, 1 - alpha);
    else norm((1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + alpha, -2 * cs, 1 - alpha);
  }
};
inline double resonanceTerm(double qDb) { return 0.5 / mpow(10, qDb / 20); }   // qa of the formulas above

// ---------------------------------------------------------------------------------------------------------------------------------
// Engine state
// ---------------------------------------------------------------------------------------------------------------------------------
constexpr int MAXV = 32, MAXU = 8, CHUNK = 16, MAXF = 1024, NP = 100;
constexpr double PAN_C = 0.7071067811865476;                       // StereoPanner at pan 0 for a mono voice

double P[NP];                                                      // Synth1 raw values #0..#98, [99] = master volume
struct Cfg { int polyN = 5; int uniMax = 3; double bend = 0; int cutSmooth = 0; int syncAA = 0; double bpm = 120, slop = 0, drift = 0, lookahead = 0.006; int filter = 0, ladSat = 0; double ladFb = 0; int os1Filter = 0; } C;   // slop / drift: cents (Settings); filter 1 = ladder; ladFb: Hz or 0; os1Filter: 1 = the OpenSynth1 filter replaces the biquad / ladder
bool dirty = true;

// values derived from P (recomputed once per ec_process call after a change)
struct Glob {
  int w1 = W_SAW, w2 = W_SAW, uni = 1, n1 = 1, n2 = 1, ftype = F_LP, nst = 2;
  bool noise2 = false;
  double g1 = 0, g2 = 0, gn = 0, gf1 = 1, gf2 = 1, duty = 0.5;
  int wS = W_SINE, nS = 1, syncT = 1;                              // sub wave, sub copies (follows unison), sync slave wave
  bool pan = false;                                                // unison stereo width (#84): a second, independent set of OSC1 / OSC2 copies (the Tone engine's r1 / r2)
  double panK = 1;                                                 // (cos th + sin th) / 2: the voice panner folds the stereo pair to mono (channelCount 1)
  double gs = 0, gfS = 1, gr = 0, gsync = 0, fmG = 0, subMul = 1;   // sub gain / fat gain, ring gain, sync gain, FM depth in cents per unit of OSC2, sub octave factor
  double ratio[MAXU] = {1, 1, 1, 1, 1, 1, 1, 1};
  double qDb = Q_OFF, d = 0;
  double satWet = 0, satDry = 1, satG = 0, satPre = 1.0 / 8;
  double cutHz = 689;
  double tune = 0, det = 0, st2 = 0, bk = 1;
  double ampA = 0, ampD = 0, ampS = 0, ampR = 0, feA = 0, feD = 0, feS = 0, feR = 0;
  double velSens = 0;
  double masterTarget = 0, panTarget = 0;
  // M2b
  bool lay = false; double kU = 1;                                 // unison pitch layer (#85): a second set of copies transposed by (#85 - 24) semitones
  double wBase = -0.9;                                             // pulse width signal (-1..1) before modulation
  int lfoDest[2] = {0, 0}; double lfoScale[2] = {0, 0}, lfoSgn[2] = {1, 1}, vgBase = 1;   // LFO routing: destination 1..7 (0 = none), send gain, polarity, tremolo base gain
  int meKind = -1; double meScale = 0, meA = 0.001, meD = 0.1;     // mod envelope: destination 0 OSC2 pitch / 1 FM / 2 pulse width (-1 = off), send gain, times
  bool fmPossible = false;                                         // FM depth may be non-zero (panel, LFO or mod envelope)
  bool useLad = false; double ladScale = 1, ladK = 0;              // ladder filter (LP24 + Settings > Filter = ladder)
} G;

// Global LFOs (Tone.LFO min -1 / max 1 plus the random-value signals of js/fx.js). Types: 0 saw (the send inverts it), 1 triangle, 2 square, 3 S&H, 4 smoothed random, 5 / other sine.
// The periodic shapes are the Chromium oscillator shapes (the saw / square peaks are normalised: plateau 0.8486, measured on the Tone engine).
constexpr double LFO_NORM = 0.8486;
inline double urand(uint32_t& s) { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (double)(int32_t)s * (1.0 / 2147483648.0); }
struct Lfo {
  int type = 5; bool rnd = false; double hz = 1, ph = 0;
  double cur = 0, to = 0, slope = 0, tl = 0, period = 0; uint32_t rng = 2463534242u;
  void draw() {                                                    // js/fx.js: a new random value every 1 / hz
    double v = urand(rng);
    if (type == 4) { to = v; slope = (v - cur) / (SR / hz); } else { cur = to = v; slope = 0; }
  }
  void restartRandom() { period = SR / hz; tl = period; draw(); }
  void configure(int ty, double h) {
    bool r = ty == 3 || ty == 4;
    if (r && (!rnd || ty != type || h != hz)) { type = ty; hz = h; rnd = true; restartRandom(); }
    else if (!r) { if (rnd) { ph = 0; cur = to = slope = 0; } rnd = false; type = ty; hz = h; }
    else { hz = h; }
  }
  double value(double ahead = 0) const {                           // the value `ahead` samples from now (the chunk centre: the Tone engine's LFO is sample accurate)
    if (rnd) { double v = cur + slope * ahead; return (slope > 0 && v > to) || (slope < 0 && v < to) ? to : v; }
    double x = ph; if (ahead != 0) x = wrap1(x + hz * ahead * ISR);
    switch (type) {
      case 0: return (x < 0.5 ? 2 * x : 2 * x - 2) * LFO_NORM;
      case 1: return x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4;
      case 2: return (x < 0.5 ? 1 : -1) * LFO_NORM;
      default: return msin(2 * PI * x);
    }
  }
  void adv(int m) {
    if (rnd) {
      cur += slope * m; if (slope != 0 && ((slope > 0 && cur >= to) || (slope < 0 && cur <= to))) { cur = to; slope = 0; }
      tl -= m; while (tl <= 0) { tl += period; draw(); }
    } else ph = wrap1(ph + hz * m * ISR);
  }
  void keySync() { if (rnd) { cur = to = urand(rng); slope = 0; } else ph = 0; }
} LF[2];

// per-chunk modulation shared by every voice (LFO sends summed by destination)
struct Mod { double p2, pb, cut, vg, pw, fm, pan; };
Mod MODC[MAXF / CHUNK + 1];
double driftAcc = 0;
void fillMods(int frames) {
  const int nc = (frames + CHUNK - 1) / CHUNK;
  for (int c = 0; c < nc; c++) {
    const int m = frames - c * CHUNK < CHUNK ? frames - c * CHUNK : CHUNK;
    Mod M = {0, 0, 0, G.vgBase, 0, 0, 0};
    for (int k = 0; k < 2; k++) {
      if (G.lfoDest[k] != 0) {
        const double v = G.lfoSgn[k] * LF[k].value(m * 0.5) * G.lfoScale[k];
        switch (G.lfoDest[k]) { case 1: M.p2 += v; break; case 2: M.pb += v; break; case 3: M.cut += v; break; case 4: M.vg += v; break; case 5: M.pw += v; break; case 6: M.fm += v; break; case 7: M.pan += v; break; default: break; }
      }
      LF[k].adv(m);
    }
    MODC[c] = M;
  }
}
const double SL1[5] = {-0.8, 0.7, -0.45, 0.9, -1}, SL2[5] = {0.6, -0.9, 0.75, -0.5, 0.35}, SLC[5] = {0.6, -0.4, 0.9, -0.7, 0.2};   // per-voice slop offsets (js/voice.js)
inline double rt(int n, int c) { return n > 1 ? G.ratio[c] : 1.0; }          // detune ratio of copy c: only the fat copies are spread
inline double mtan(double x) { return msin(x) / mcos(x); }

// OpenSynth1 DSP (MIT, see os1/NOTICE-OpenSynth1.md), imported as is from core/os1. os1m = the math it needs, taken from this file's own freestanding functions.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunused-function"
#pragma clang diagnostic ignored "-Wunused-const-variable"   // the envelope and oscillator headers (os1_env.h, os1_osc.h) are not wired in yet
namespace os1m {
constexpr double pi = PI;
constexpr float pi_f = (float)PI, twoPi_f = (float)(2 * PI);
template <class T> inline T jlimit(T lo, T hi, T v) { return v < lo ? lo : (hi < v ? hi : v); }
template <class T> inline T max(T a, T b) { return a < b ? b : a; }
template <class T> inline T min(T a, T b) { return b < a ? b : a; }
inline float abs(float x) { return x < 0 ? -x : x; }
inline double abs(double x) { return x < 0 ? -x : x; }
inline float sin(float x) { return (float)msin(x); }
inline double sin(double x) { return msin(x); }
inline float cos(float x) { return (float)mcos(x); }
inline double cos(double x) { return mcos(x); }
inline double tan(double x) { return mtan(x); }
inline double exp(double x) { return mexp(x); }
inline double log(double x) { return mlog(x); }
inline float pow(float a, float b) { return (float)mpow(a, b); }
inline double pow(double a, double b) { return mpow(a, b); }
inline float fmod(float a, float b) { return a - b * (float)(int64_t)(a / b); }   // C fmod (truncation); the callers only pass positive values
inline bool isfinite(double x) { return __builtin_isfinite(x); }
}
#pragma clang diagnostic pop
#include "os1/os1_filter.h"   // OpenSynthFilter: LP12 / LP24 / HP12 / BP12 / LPDL (Settings > DSP flavor)
inline double thr_(double x) { return x > 4.5 ? 1 : x < -4.5 ? -1 : x * (27 + x * x) / (27 + 9 * x * x); }   // rational tanh of the ladder worklet

struct Glide {
  double cur = 8, tgt = 8, step = 0; int left = 0;               // log2(Hz)
  void set(double lf, double seconds, bool keep) {
    if (seconds > 0 && keep) { left = (int)(seconds * SR / CHUNK) + 1; step = (lf - cur) / left; tgt = lf; }
    else { cur = tgt = lf; left = 0; step = 0; }
  }
  inline void advance() { if (left > 0) { cur += step; if (--left == 0) cur = tgt; } }
};

struct Voice {
  Env amp, fe;
  Biquad f1[2];
  SyncOsc sy;
  bool everUsed = false;
  int note = 60;
  double midi = 60, freq = 261.6255653005986, velF = 1, octReq = 4, feBase = 689, feOct = 0;
  double ph1[MAXU] = {}, ph2[MAXU] = {}, phS[MAXU] = {}, phR1[MAXU] = {}, phR2[MAXU] = {}, phU1[MAXU] = {}, phU2[MAXU] = {};
  bool lastPan = false, lastLay = false;
  int idx = 0;
  Env me;                                                          // mod envelope (attack -> decay to 0, ignores note-off)
  double d1 = 0, d2 = 0, dc = 0; uint32_t drng = 12345;           // analog drift state (cents)
  double ls[4] = {}, lz = 0;                                       // ladder filter stages, feedback high-pass state
  OpenSynthFilter of; bool lastOs1 = false;                        // OpenSynth1 filter (C.os1Filter)
  int lastW1 = -1, lastW2 = -1, lastWS = -1, lastN1 = 0, lastN2 = 0, lastNS = 0, lastNst = 0, lastFt = -1;
  bool phased = false;
  Glide g1, g2;
  uint32_t rng = 1;
  double lastF = -1, lastQ = 0;

  // Tone builds a phase-shifted wave as x(theta - phi) (PeriodicWave real = -b sin(n phi), imag = b cos(n phi)): a positive phase DELAYS the wave, so the start phase is -(phi).
  // The copies of a fat oscillator have phi = deg + i / count (full turns); the first copy of a plain one has phi = deg.
  void resetPhases(int w, int n, double* ph, double deg) {
    (void)w;
    for (int i = 0; i < MAXU; i++) ph[i] = wrap1(-(deg + (n > 1 ? (double)i / n : 0)));
  }
  void trackCut() {                                                // js/voice.js trackCut + capOct
    double dn = midi - KT_BASE;
    feBase = dmin(20000, G.cutHz * mexp2(dn / 12 * ktSlope(P[22], dn > 0)));
    double req = octReq, hi = dmax(0, mlog2(CUT_MAX / feBase)), lo = dmin(0, mlog2(CUT_MIN / feBase));
    feOct = dmax(lo, dmin(req, hi));
  }
  void setAmt() { octReq = ampOct(P[21]) * (P[24] != 0 ? velF : 1); trackCut(); }
  void setPitch(double glide) {                                    // js/voice.js setPitch
    double base2 = P[4] != 0 ? freq : 261.6255653005986;
    double f1t = freq * G.bk * mexp2(G.tune + G.det);
    double f2t = base2 * G.bk * mexp2(G.st2 / 12 + G.tune);
    bool keep = everUsed;
    g1.set(mlog2(f1t), glide, keep); g2.set(mlog2(f2t), glide, keep);
  }
  void refresh() { setAmt(); setPitch(0); }                        // called when any parameter changed

  void down(int n, double vel, double glide, bool retrig) {
    if (amp.silent()) of.reset();                                  // OpenSynth1 filter: a fresh note on a silent voice starts from zero state (as startNote does there)
    midi = n + P[9]; note = n; freq = 440.0 * mexp2((midi - 69) / 12);
    setPitch(glide); trackCut();
    everUsed = true;
    me.trigger(1, G.meA, G.meD, 0);                                // retriggers on every key press, legato too (Synth1 manual)
    if (!retrig) return;
    double ph = P[91] + (P[73] != 0 && P[93] > 1 ? P[92] : 0);
    if (ph != 0 || phased) {                                       // OSC1, OSC2 and the sub restart at that angle (the hard-sync slave is not touched)
      double deg = ph / 127;
      resetPhases(G.w1, G.n1, ph1, deg); resetPhases(G.w2, G.n2, ph2, deg); resetPhases(G.wS, G.nS, phS, deg);
      resetPhases(G.w1, G.n1, phR1, deg); resetPhases(G.w2, G.n2, phR2, deg);
      resetPhases(G.w1, G.n1, phU1, deg); resetPhases(G.w2, G.n2, phU2, deg);
      phased = ph > 0;
    }
    double s = P[30] / 127;
    amp.trigger(REFV * mpow(10, VEL_DB * s * (vel - REFV) / 20), G.ampA, G.ampD, G.ampS);
    velF = clampd(vel / REFV, 0, 1.25);
    if (P[24] != 0) setAmt();
    fe.trigger(1, G.feA, G.feD, G.feS);
  }
  void up() { amp.release(G.ampR); fe.release(G.feR); }

  // free-running oscillators of a silent voice keep their phase
  void idle(int frames) {
    g1.advance(); g2.advance();
    double f1 = mexp2(g1.cur), f2 = mexp2(g2.cur);
    for (int c = 0; c < G.n1; c++) ph1[c] = wrap1(ph1[c] + f1 * (G.n1 > 1 ? G.ratio[c] : 1) * ISR * frames);
    for (int c = 0; c < G.n2; c++) ph2[c] = wrap1(ph2[c] + f2 * (G.n2 > 1 ? G.ratio[c] : 1) * ISR * frames);
    for (int c = 0; c < G.nS; c++) phS[c] = wrap1(phS[c] + f1 * G.subMul * G.ratio[c] * ISR * frames);
    for (int c = 0; c < G.n1; c++) phR1[c] = wrap1(phR1[c] + f1 * (G.n1 > 1 ? G.ratio[c] : 1) * ISR * frames);
    for (int c = 0; c < G.n2; c++) phR2[c] = wrap1(phR2[c] + f2 * (G.n2 > 1 ? G.ratio[c] : 1) * ISR * frames);
    for (int c = 0; c < G.n1; c++) phU1[c] = wrap1(phU1[c] + f1 * G.kU * (G.n1 > 1 ? G.ratio[c] : 1) * ISR * frames);
    for (int c = 0; c < G.n2; c++) phU2[c] = wrap1(phU2[c] + f2 * G.kU * (G.n2 > 1 ? G.ratio[c] : 1) * ISR * frames);
    if (!me.silent()) for (int i = 0; i < frames; i++) me.tick();   // the mod envelope keeps running while the voice is silent
    sy.skip(f1 * ISR, f2 * ISR, frames);
  }
  void driftTick() { const double g = C.drift * 0.24; d1 = d1 * 0.96 + urand(drng) * g; d2 = d2 * 0.96 + urand(drng) * g; dc = dc * 0.96 + urand(drng) * g; }

  void render(int n, float* mixL, float* mixR) {
    // wave / count changes rebuild the oscillators in Tone (new start phases); the extra sets (r1 / r2 stereo width, u1 / u2 pitch layer) are rebuilt with them
    const bool panOn = G.pan && !lastPan, layOn = G.lay && !lastLay;
    if (G.w1 != lastW1 || G.n1 != lastN1) { resetPhases(G.w1, G.n1, ph1, 0); resetPhases(G.w1, G.n1, phR1, 0); resetPhases(G.w1, G.n1, phU1, 0); lastW1 = G.w1; lastN1 = G.n1; }
    if (G.w2 != lastW2 || G.n2 != lastN2) { resetPhases(G.w2, G.n2, ph2, 0); resetPhases(G.w2, G.n2, phR2, 0); resetPhases(G.w2, G.n2, phU2, 0); lastW2 = G.w2; lastN2 = G.n2; }
    if (panOn) { resetPhases(G.w1, G.n1, phR1, 0); resetPhases(G.w2, G.n2, phR2, 0); }
    if (layOn) { resetPhases(G.w1, G.n1, phU1, 0); resetPhases(G.w2, G.n2, phU2, 0); }
    lastPan = G.pan; lastLay = G.lay;
    if (G.wS != lastWS || G.nS != lastNS) { resetPhases(G.wS, G.nS, phS, 0); lastWS = G.wS; lastNS = G.nS; }
    if (G.nst != lastNst || G.ftype != lastFt) { if (G.nst != lastNst) { f1[0] = Biquad(); f1[1] = Biquad(); } lastNst = G.nst; lastFt = G.ftype; }
    const bool os1 = C.os1Filter != 0; if (os1 != lastOs1) { of.reset(); lastOs1 = os1; }
    float osc[CHUNK], A[CHUNK], B[CHUNK], Sb[CHUNK], Y[CHUNK], fmul[CHUNK], Ar[CHUNK], Br[CHUNK], U1[CHUNK], U2[CHUNK];
    const bool needAr = G.pan && G.g1 != 0, needBr = G.pan && G.g2 != 0, needU1 = G.lay && G.g1 != 0, needU2 = G.lay && G.g2 != 0;
    const bool needA = G.g1 != 0 || G.gr != 0, needB = G.g2 != 0 || G.gr != 0 || G.fmPossible, needS = G.gs != 0, needY = G.gsync != 0;
    // analog character: fixed per-voice offsets (slop) + the slow drift, in cents (js/voice.js setAnalog)
    const int vi = idx % 5;
    const double c1 = SL1[vi] * C.slop + d1, c2 = SL2[vi] * C.slop + d2, cc = SLC[vi] * C.slop * 6 + dc * 3;
    const double ladHp = C.ladFb, ladHa = ladHp > 0 ? 1 - mexp(-2 * PI * ladHp * ISR) : 0;
    for (int s0 = 0; s0 < n; s0 += CHUNK) {
      int m = n - s0 < CHUNK ? n - s0 : CHUNK;
      const Mod& M = MODC[s0 / CHUNK];
      g1.advance(); g2.advance();
      double fo1 = mexp2(g1.cur), fo2 = mexp2(g2.cur);
      // modulation of this chunk: LFO sends (shared) + mod envelope (this voice) + slop / drift
      double mev = me.v;                                           // mod envelope at the chunk centre
      if (!me.silent()) { for (int s = 0; s < m; s++) { if (s == m / 2) mev = me.v; me.tick(); } }
      const double meV = mev * G.meScale;
      const double ce1 = c1 + M.pb, ce2c = c2 + M.p2 + M.pb, ce2 = ce2c + (G.meKind == 0 ? meV : 0);          // cents: OSC1 / sub / copies, OSC2 copies, OSC2 (the mod envelope reaches only the main OSC2)
      const double pf1 = ce1 != 0 ? mexp2(ce1 / 1200) : 1, pf2c = ce2c != 0 ? mexp2(ce2c / 1200) : 1, pf2 = ce2 != 0 ? mexp2(ce2 / 1200) : 1;
      const double fmC = G.fmG + M.fm + (G.meKind == 1 ? meV : 0);
      const bool fm = fmC != 0;
      const double duty = (M.pw == 0 && G.meKind != 2) ? G.duty : clampd((1 + G.wBase + M.pw + (G.meKind == 2 ? meV : 0)) * 0.5, 0, 1);   // LFO / mod envelope reach the main pulse oscillators only
      // OSC2 first: its audio is the FM source and the ring-modulation factor (A and B are the raw oscillator outputs, fat copies included)
      if (needB) { for (int s = 0; s < m; s++) B[s] = 0; for (int c = 0; c < G.n2; c++) renderCopy(G.w2, ph2[c], fo2 * rt(G.n2, c) * pf2 * ISR, duty, (float)G.gf2, B, m); }
      else for (int c = 0; c < G.n2; c++) ph2[c] = wrap1(ph2[c] + fo2 * rt(G.n2, c) * pf2 * ISR * m);
      if (fm) for (int s = 0; s < m; s++) fmul[s] = (float)mexp2(fmC * B[s] / 1200);
      if (needA) {
        for (int s = 0; s < m; s++) A[s] = 0;
        for (int c = 0; c < G.n1; c++) { double inc = fo1 * rt(G.n1, c) * pf1 * ISR; if (fm) renderCopyFM(G.w1, ph1[c], inc, duty, (float)G.gf1, fmul, A, m); else renderCopy(G.w1, ph1[c], inc, duty, (float)G.gf1, A, m); }
      } else for (int c = 0; c < G.n1; c++) ph1[c] = wrap1(ph1[c] + fo1 * rt(G.n1, c) * pf1 * ISR * m);
      if (needAr) { for (int s = 0; s < m; s++) Ar[s] = 0; for (int c = 0; c < G.n1; c++) renderCopy(G.w1, phR1[c], fo1 * rt(G.n1, c) * pf1 * ISR, G.duty, (float)G.gf1, Ar, m); }
      else if (G.pan) for (int c = 0; c < G.n1; c++) phR1[c] = wrap1(phR1[c] + fo1 * rt(G.n1, c) * pf1 * ISR * m);
      if (needBr) { for (int s = 0; s < m; s++) Br[s] = 0; for (int c = 0; c < G.n2; c++) renderCopy(G.w2, phR2[c], fo2 * rt(G.n2, c) * pf2c * ISR, G.duty, (float)G.gf2, Br, m); }
      else if (G.pan) for (int c = 0; c < G.n2; c++) phR2[c] = wrap1(phR2[c] + fo2 * rt(G.n2, c) * pf2c * ISR * m);
      if (needU1) { for (int s = 0; s < m; s++) U1[s] = 0; for (int c = 0; c < G.n1; c++) renderCopy(G.w1, phU1[c], fo1 * G.kU * rt(G.n1, c) * pf1 * ISR, G.duty, (float)G.gf1, U1, m); }
      else if (G.lay) for (int c = 0; c < G.n1; c++) phU1[c] = wrap1(phU1[c] + fo1 * G.kU * rt(G.n1, c) * pf1 * ISR * m);
      if (needU2) { for (int s = 0; s < m; s++) U2[s] = 0; for (int c = 0; c < G.n2; c++) renderCopy(G.w2, phU2[c], fo2 * G.kU * rt(G.n2, c) * pf2c * ISR, G.duty, (float)G.gf2, U2, m); }
      else if (G.lay) for (int c = 0; c < G.n2; c++) phU2[c] = wrap1(phU2[c] + fo2 * G.kU * rt(G.n2, c) * pf2c * ISR * m);
      if (needS) {
        for (int s = 0; s < m; s++) Sb[s] = 0;
        for (int c = 0; c < G.nS; c++) { double inc = fo1 * G.subMul * G.ratio[c] * pf1 * ISR; if (fm) renderCopyFM(G.wS, phS[c], inc, 0.5, (float)G.gfS, fmul, Sb, m); else renderCopy(G.wS, phS[c], inc, 0.5, (float)G.gfS, Sb, m); }
      } else for (int c = 0; c < G.nS; c++) phS[c] = wrap1(phS[c] + fo1 * G.subMul * G.ratio[c] * pf1 * ISR * m);
      if (needY) sy.run(G.syncT, G.duty, C.syncAA != 0, fo1 * ISR, fo2 * ISR, Y, m); else sy.skip(fo1 * ISR, fo2 * ISR, m);
      for (int s = 0; s < m; s++) {
        double v = 0;
        if (needA) v += G.g1 * (G.panK * (A[s] + (needAr ? Ar[s] : 0)));
        if (needU1) v += G.g1 * U1[s];
        if (needB) v += G.g2 * (G.panK * (B[s] + (needBr ? Br[s] : 0)));
        if (needU2) v += G.g2 * U2[s];
        if (G.gr != 0) v += G.gr * ((double)A[s] * B[s]);
        if (needS) v += G.gs * Sb[s];
        if (needY) v += G.gsync * Y[s];
        if (G.gn != 0) { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; v += G.gn * ((double)(int32_t)rng * (1.0 / 2147483648.0)); }
        osc[s] = (float)v;
      }
      // filter: cutoff = filter envelope output (linear in Hz between base and base * 2^oct, FrequencyEnvelope with exponent 1), moved in cents by the LFO / slop / drift
      double fev = fe.v;
      double fHz = feBase + fev * (feBase * mexp2(feOct) - feBase);
      const double cut = cc + M.cut;
      // OpenSynth1 filter: Elita's cutoff (envelope, key track, LFO, slop / drift) goes in as Hz; resonance = #20 / 127; saturation = OpenSynth1's soft clip in front of the filter
      double os1Hz = 0; float os1Res = 0, os1K = 0; const int os1Type = (int)clampd(P[14], 0, 4);
      if (os1) {
        os1Hz = cut != 0 ? fHz * mexp2(cut / 1200) : fHz; os1Hz = clampd(os1Hz, 15, dmin(16000, SR / 3));   // OpenSynth1's own range: its cutoff table ends at 16 kHz. Above SR/3 the state-variable filter's step F exceeds 1 and it latches to a DC value (key track / LFO push Elita's Hz that high)
        os1Res = (float)(P[20] / 127); os1K = P[23] > 0.01 ? (float)(P[23] / 127 * 6.0) : 0.0f;
      }
      if (os1) {
        // processed per sample below
      } else if (G.useLad) {
        // ladder worklet (js/worklets.js): zero-delay-feedback 4-pole, the cutoff is computed once per chunk
        double f = fHz * G.ladScale; if (cut != 0) f *= mexp2(cut / 1200);
        f = f < 8 ? 8 : f > SR * 0.45 ? SR * 0.45 : f;
        const double g = mtan(PI * ISR * f), Gc = g / (1 + g), G2 = Gc * Gc, G4 = G2 * G2, h = 1 / (1 + g), k = G.ladK;
        const bool sat = C.ladSat != 0;
        for (int s = 0; s < m; s++) {
          const double x = osc[s];
          const double Sx = (G2 * Gc * ls[0] + G2 * ls[1] + Gc * ls[2] + ls[3]) * h, z = ladHp > 0 ? lz : 0;
          double u = (x - k * (Sx - z)) / (1 + k * G4), y;
          if (sat) {
            y = thr_(u);
            for (int q = 0; q < 4; q++) { const double v = Gc * thr_(y - ls[q]), yy = v + ls[q]; ls[q] = yy + v; y = yy; }
          } else {
            { const double a = u < 0 ? -u : u; if (a > 1.5) { const double zz = (a - 1.5) / 1.5, t = zz > 4.5 ? 1 : zz * (27 + zz * zz) / (27 + 9 * zz * zz); u = (u < 0 ? -1 : 1) * (1.5 + 1.5 * t); } }
            double v = (u - ls[0]) * Gc; y = v + ls[0]; ls[0] = y + v; const double y1 = y;
            v = (y1 - ls[1]) * Gc; y = v + ls[1]; ls[1] = y + v; const double y2 = y;
            v = (y2 - ls[2]) * Gc; y = v + ls[2]; ls[2] = y + v; const double y3 = y;
            v = (y3 - ls[3]) * Gc; y = v + ls[3]; ls[3] = y + v;
          }
          if (ladHp > 0) lz += ladHa * (y - z);
          osc[s] = (float)y;
        }
      } else {
        const double fq = cut != 0 ? fHz * mexp2(cut / 1200) : fHz, q = G.qDb;
        if (fq != lastF || q != lastQ) {
          f1[0].set(G.ftype, fq * ISR * 2, q, G.d);
          if (G.nst > 1) { f1[1].b0 = f1[0].b0; f1[1].b1 = f1[0].b1; f1[1].b2 = f1[0].b2; f1[1].a1 = f1[0].a1; f1[1].a2 = f1[0].a2; }
          lastF = fq; lastQ = q;
        }
      }
      // pan (LFO destination 7): the voice's StereoPanner on a mono signal, equal power
      double gL = PAN_C, gR = PAN_C;
      if (M.pan != 0) { const double a = (clampd(M.pan, -1, 1) + 1) * (PI / 4); gL = mcos(a); gR = msin(a); }
      for (int s = 0; s < m; s++) {
        double x;
        if (os1) { float in = osc[s]; if (os1K != 0) in = (1.0f + os1K) * in / (1.0f + os1K * os1m::abs(in)); x = of.processSample(in, (float)os1Hz, os1Res, os1Type, (float)SR); }
        else { x = G.useLad ? (double)osc[s] : f1[0].run(osc[s]); if (!G.useLad && G.nst > 1) x = f1[1].run(x); }
        if (!os1 && G.satWet > 0) x = x * G.satDry + G.satG * mtanh(8 * clampd(x * G.satPre, -1, 1));
        x *= amp.tick() * M.vg; fe.tick();
        mixL[s0 + s] += (float)(x * gL); mixR[s0 + s] += (float)(x * gR);
      }
    }
  }
};

Voice V[MAXV];
float outL[MAXF], outR[MAXF], mixL[MAXF], mixR[MAXF];
double mg = 0, mgInc = 0; int mgLeft = 0;                          // master gain (20 ms ramp, Tone rampTo)
double peak = 0;

// ---------------------------------------------------------------------------------------------------------------------------------
// Effects (milestone M3). The chain of js/engine.js after the master gain:
//   effect section -> EQ (peaking) -> tone (low / high shelf) -> chorus -> chorus 2 -> stereo delay -> pan -> limiter -> soft clip
// Every block follows what the Tone engine builds from Web Audio nodes (js/fx.js): the compressor / limiter is Chromium's DynamicsCompressorNode algorithm,
// the delay lines are DelayNodes (linear interpolation, at least one render quantum when they sit in a feedback loop), the shaper is a WaveShaperNode.
// ---------------------------------------------------------------------------------------------------------------------------------
inline double dbToLin(double d) { return mpow(10, d / 20); }
inline double linToDb(double x) { return 20 * mlog2(x) * 0.30102999566398120; }
double matan(double t) {                                           // |t| <= 1: two half-angle reductions, then the Taylor series
  t = t / (1 + dsqrt(1 + t * t)); t = t / (1 + dsqrt(1 + t * t));
  const double t2 = t * t; double term = t, sum = 0;
  for (int k = 0; k < 10; k++) { sum += term / (2 * k + 1); term = -term * t2; }
  return 4 * sum;
}
double masin(double x) { x = clampd(x, -1, 1); return 2 * matan(x / (1 + dsqrt(1 - x * x))); }

// DynamicsCompressorNode (Blink's DynamicsCompressorKernel): soft-knee static curve, adaptive release, 6 ms pre-delay, automatic make-up gain.
struct Comp {
  static constexpr int PDMAX = 1024, DIV = 32;
  double dbThr = 1e9, dbKnee = 0, ratio = 0, linThr = 0, kneeThr = 0, kneeThrDb = 0, yptKneeDb = 0, slope = 1, k = 5;
  double attFrames = 1, relFrames = 1, satRelFrames = 1, master = 1, ka = 0, kb = 0, kc = 0, kd = 0, ke = 0;
  double det = 0, cg = 1, maxAtt = -1, rate = 1; int div = 0, wi = 0, ri = 0, lastPre = -1;
  float pre[2][PDMAX];
  double kneeCurve(double x, double kk) const { return x < linThr ? x : linThr + (1 - mexp(-kk * (x - linThr))) / kk; }
  double slopeAt(double x, double kk) const {
    if (x < linThr) return 1;
    const double x2 = x * 1.001, y = kneeCurve(x, kk), y2 = kneeCurve(x2, kk);
    return (linToDb(y2) - linToDb(y)) / (linToDb(x2) - linToDb(x));
  }
  double kAtSlope(double desired) const {
    const double x = dbToLin(dbThr + dbKnee); double minK = 0.1, maxK = 10000, kk = 5;
    for (int i = 0; i < 15; i++) { if (slopeAt(x, kk) < desired) maxK = kk; else minK = kk; kk = dsqrt(minK * maxK); }
    return kk;
  }
  double saturate(double x) const { return x < kneeThr ? kneeCurve(x, k) : dbToLin(yptKneeDb + slope * (linToDb(x) - kneeThrDb)); }
  // attack / release / pre-delay in seconds
  void params(double thr, double knee, double rat, double atk, double rel, double preDelay) {
    if (thr != dbThr || knee != dbKnee || rat != ratio) {
      dbThr = thr; linThr = dbToLin(thr); dbKnee = knee; ratio = rat; slope = 1 / rat;
      k = kAtSlope(1 / rat); kneeThrDb = thr + knee; kneeThr = dbToLin(kneeThrDb); yptKneeDb = linToDb(kneeCurve(kneeThr, k));
      master = mpow(1 / saturate(1), 0.6);
    }
    attFrames = dmax(0.001, atk) * SR; relFrames = rel * SR; satRelFrames = 0.0025 * SR;
    const double y1 = relFrames * 0.09, y2 = relFrames * 0.16, y3 = relFrames * 0.42, y4 = relFrames * 0.98;   // release zones of Blink
    ka = 0.9999999999999998 * y1 + 1.8432219684323923e-16 * y2 - 1.9373394351676423e-16 * y3 + 8.824516011816245e-18 * y4;
    kb = -1.5788320352845888 * y1 + 2.3305837032074286 * y2 - 0.9141194204840429 * y3 + 0.1623677525612032 * y4;
    kc = 0.5334142869106424 * y1 - 1.272736789213631 * y2 + 0.9258856042207512 * y3 - 0.18656310191776226 * y4;
    kd = 0.08783463138207234 * y1 - 0.1694162967925622 * y2 + 0.08588057951595272 * y3 - 0.00429891410546283 * y4;
    ke = -0.042416883008123074 * y1 + 0.1115693827987602 * y2 - 0.09764676325265872 * y3 + 0.028494263462021576 * y4;
    int pf = (int)(preDelay * SR); if (pf > PDMAX - 1) pf = PDMAX - 1;
    if (pf != lastPre) { lastPre = pf; for (int c = 0; c < 2; c++) for (int i = 0; i < PDMAX; i++) pre[c][i] = 0; wi = 0; ri = (PDMAX - pf) % PDMAX; }
  }
  void reset() { det = 0; cg = 1; maxAtt = -1; div = 0; lastPre = -1; dbThr = 1e9; }
  inline void run(double& l, double& r) {                          // one stereo frame, in place
    if (div == 0) {                                                // the envelope rate is chosen once per 32 frames
      const double scaled = masin(det) / (0.5 * PI);
      double diff = scaled > 0 ? linToDb(cg / scaled) : 1e31;                // a detector at 0: infinite difference (Blink replaces it by -1 / 1)
      if (scaled > cg) {                                           // releasing
        maxAtt = -1; if (diff != diff || diff > 1e30 || diff < -1e30) diff = -1;
        double x = clampd(diff, -12, 0); x = 0.25 * (x + 12);
        const double x2 = x * x, rf = ka + kb * x + kc * x2 + kd * x2 * x + ke * x2 * x2;
        rate = dbToLin(5 / rf);
      } else {                                                     // attacking
        if (diff != diff || diff > 1e30 || diff < -1e30) diff = 1;
        if (maxAtt == -1 || maxAtt < diff) maxAtt = diff;
        rate = 1 - mpow(0.25 / dmax(0.5, maxAtt), 1 / attFrames);
      }
      desired = scaled;
    }
    div = (div + 1) & (DIV - 1);
    pre[0][wi] = (float)l; pre[1][wi] = (float)r;
    const double al = dabs(l), ar = dabs(r), a = al > ar ? al : ar;
    const double att = a <= 0.0001 ? 1 : saturate(a) / a, attDb = dmax(2.0, -linToDb(att));
    const double rt = att > det ? dbToLin(attDb / satRelFrames) - 1 : 1;
    det += (att - det) * rt; if (det > 1) det = 1;
    if (rate < 1) cg += (desired - cg) * rate; else { cg *= rate; if (cg > 1) cg = 1; }
    const double g = master * msin(0.5 * PI * cg);
    l = pre[0][ri] * g; r = pre[1][ri] * g;
    if (++wi == PDMAX) wi = 0; if (++ri == PDMAX) ri = 0;
  }
  double desired = 1;
};

// DelayNode: a ring buffer read with linear interpolation. Called as read(frames) first, then put(x) for the same sample (frames >= 1).
struct Line {
  float* b = nullptr; int len = 0, w = 0;
  void init(float* buf, int n) { b = buf; len = n; clear(); }
  void clear() { for (int i = 0; i < len; i++) b[i] = 0; w = 0; }
  inline double read(double frames) const {
    if (frames > len - 2) frames = len - 2;
    double pos = w - frames; if (pos < 0) pos += len;
    const int i1 = (int)pos; const double f = pos - i1; const int i2 = i1 + 1 == len ? 0 : i1 + 1;
    return b[i1] * (1 - f) + b[i2] * f;
  }
  inline void put(double x) { b[w] = (float)x; if (++w == len) w = 0; }
};
constexpr int QUANTUM = 128;                                       // Chromium breaks every feedback loop with one render quantum: the fed-back signal arrives 128 frames late (measured, core/tests/probe_loop.mjs); the delay time itself is exact

constexpr int DLMAX = 196608;                                      // 2 s at 96 kHz
constexpr int CHMAX = 8192;                                        // 26 ms chorus delay at 192 kHz
constexpr int PHMAX = 2048;                                        // 10 ms phaser feedback delay
float DLBUF[2][DLMAX], CHBUF[2][2][CHMAX], PHBUF[2][PHMAX];

struct OnePoleIir { double b0 = 1, b1 = 0, a1 = 0, x1 = 0, y1 = 0;
  void lp(double f) { const double K = mtan(PI * dmin(f, 0.45 * SR) / SR); b0 = b1 = K / (1 + K); a1 = (K - 1) / (1 + K); }
  void hp(double f) { const double K = mtan(PI * dmin(f, 0.45 * SR) / SR); b0 = 1 / (1 + K); b1 = -b0; a1 = (K - 1) / (1 + K); }
  inline double run(double x) { const double y = b0 * x + b1 * x1 - a1 * y1; x1 = x; y1 = y; return y; } };

struct Chorus {                                                    // Tone.Chorus (two LFO-modulated delay lines, stereo feedback, equal-power wet / dry)
  Line l[2]; double ph = 0, dt = 0.0035, depth = 0.7, hz = 1.5, fb = 0, wet = 0, spread = 180; bool active = false;
  double fbr[2][QUANTUM] = {}; int fi = 0;                          // the wet output of 128 frames ago (feedback loop)
};
struct FxP {
  int ty = -1; bool dist = false, deci = false, rm = false, cmp = false, ph = false; int curve = -1, phN = 2;
  double dry = 1, wetD = 0, wetDeci = 0, wetRm = 0, wetCmp = 0, wetPh = 0, pre = 0.125, post = 1, hold = 1, lv = 32768, rmHz = 200;
  double cThr = -4, cRatio = 1.5, cAtt = 0.001, phDepth = 0, phHz = 0.05, phFb = 0;
  double eqHz = 1000, eqGain = 0, eqQ = 1, tone = 0;
  double dDry = 1, dWet = 0, dtL = 0, dtR = 0, dFb = 0, iLL = 1, iRL = 0, iLR = 0, iRR = 1, fLL = 0, fLR = 0, fRL = 0, fRR = 0, dLp = 20000, dHp = 20;
  bool dOn = false;
} FP;
float SHAPE[3][4096];
struct FxS {
  Biquad hp[2], lp[2], ap[12][2], eq[2], lo[2], hi[2];
  double dcC[2] = {0, 0}, dcH[2] = {0, 0}, rmPh = 0, phPh = 0; bool phWas = false;
  Line phLine[2];
  Chorus ch[2];
  Line dl[2]; OnePoleIir dlp[2], dhp[2]; double dyL = 0, dyR = 0; double dfr[2][QUANTUM] = {}; int dfi = 0;
  Comp comp, lim;
} X;
double wl[MAXF], wr[MAXF];

void fxInit() {
  for (int c = 0; c < 2; c++) {
    X.hp[c] = X.lp[c] = X.eq[c] = X.lo[c] = X.hi[c] = Biquad(); for (int i = 0; i < 12; i++) X.ap[i][c] = Biquad();
    X.dcC[c] = X.dcH[c] = 0; X.phLine[c].init(PHBUF[c], PHMAX); X.dl[c].init(DLBUF[c], DLMAX); X.dlp[c] = OnePoleIir(); X.dhp[c] = OnePoleIir();
    for (int j = 0; j < 2; j++) { X.ch[j].l[c].init(CHBUF[j][c], CHMAX); }
  }
  for (int j = 0; j < 2; j++) { X.ch[j].ph = 0; X.ch[j].active = false; X.ch[j].fi = 0; for (int q = 0; q < QUANTUM; q++) X.ch[j].fbr[0][q] = X.ch[j].fbr[1][q] = 0; }
  X.dfi = 0; for (int q = 0; q < QUANTUM; q++) X.dfr[0][q] = X.dfr[1][q] = 0;
  X.rmPh = X.phPh = 0; X.phWas = false; X.dyL = X.dyR = 0; X.comp.reset(); X.lim.reset(); FP = FxP();
  for (int t = 0; t < 3; t++) for (int i = 0; i < 4096; i++) {      // WaveShaper curves of js/fx.js (FX_CURVES), as Tone.WaveShaper.setMap builds them (4096 points over -1 .. 1; x * FX_K)
    const double x = (i / 4095.0 * 2 - 1) * 8;
    double y = t == 0 ? mtanh(x + 0.35) - mtanh(0.35) : t == 1 ? mtanh(x) : dfloor(clampd(x * 1.3, -1, 1) * 96 + 0.5) / 96;
    SHAPE[t][i] = (float)y;
  }
}
inline double shaper(const float* tab, double x) {                // WaveShaperNode: linear interpolation of the curve, clamped at both ends
  const double v = 0.5 * (x + 1) * 4095;
  if (v <= 0) return tab[0]; if (v >= 4095) return tab[4095];
  const int i = (int)v; const double f = v - i; return tab[i] * (1 - f) + tab[i + 1] * f;
}
const double DELAY_BEATS[20] = {0.0002, 1.0 / 24, 1.0 / 12, 0.125, 1.0 / 6, 0.25, 1.0 / 3, 0.375, 0.5, 2.0 / 3, 0.75, 0.875, 1, 4.0 / 3, 1.5, 1.75, 2, 3, 3.5, 4};
const double DELAY_LP[5][2] = {{0, 186}, {16, 583}, {32, 1950}, {48, 5910}, {64, 20000}};
const double DELAY_HP[5][2] = {{64, 20}, {80, 40}, {96, 236}, {112, 1425}, {127, 6562}};
const int PH_STAGES[4] = {2, 4, 8, 12};

// parameters -> effect settings (js/fx.js applyFx / applyFxSection / applyDelay)
void fxUpdate() {
  const int ty = (int)P[78]; const bool on = P[77] != 0;
  const double c1 = P[79] / 127, c2 = P[80] / 127, lv = P[81] / 127;
  FP.ty = ty;
  FP.dist = on && ty >= 0 && ty < 3; FP.deci = on && ty == 3; FP.rm = on && ty == 4; FP.cmp = on && ty == 5; FP.ph = on && ty >= 6 && ty <= 9;
  if (FP.dist) FP.curve = ty;
  const double drive = mpow(40, c1);
  FP.pre = drive / 8; FP.post = 1 / mpow(drive, 0.55);
  X.lp[0].set(F_LP, 500 * mpow(40, c2) * ISR * 2, 0, resonanceTerm(1)); X.hp[0].set(F_HP, (ty == 0 ? 120 : 20) * ISR * 2, 0, resonanceTerm(1));
  X.lp[1].b0 = X.lp[0].b0; X.lp[1].b1 = X.lp[0].b1; X.lp[1].b2 = X.lp[0].b2; X.lp[1].a1 = X.lp[0].a1; X.lp[1].a2 = X.lp[0].a2;
  X.hp[1].b0 = X.hp[0].b0; X.hp[1].b1 = X.hp[0].b1; X.hp[1].b2 = X.hp[0].b2; X.hp[1].a1 = X.hp[0].a1; X.hp[1].a2 = X.hp[0].a2;
  FP.hold = mpow(100, 1 - c1); FP.lv = mpow(2, dfloor(1 + c2 * 15 + 0.5) - 1);
  FP.rmHz = 20 * mpow(250, c1);
  { const double d = FP.cmp ? c1 : 0; FP.cThr = -4 - d * 40; FP.cRatio = 1.5 + d * 14; FP.cAtt = 0.001 * mpow(100, c2); }
  if (FP.ph) { FP.phN = PH_STAGES[ty - 6]; FP.phDepth = c1 * 550; FP.phHz = 0.05 * mpow(160, c2); FP.phFb = lv * 0.85; }
  const double cs = mcos(lv * PI / 2), sn = msin(lv * PI / 2), mixed = FP.dist || FP.deci || FP.rm || FP.cmp;
  FP.dry = mixed ? cs : FP.ph ? 0.55 : 1;
  FP.wetD = FP.dist ? sn : 0; FP.wetRm = FP.rm ? sn : 0; FP.wetCmp = FP.cmp ? sn : 0; FP.wetDeci = FP.deci ? sn : 0; FP.wetPh = FP.ph ? 0.55 : 0;
  // EQ (peaking) and tone (shelves)
  FP.eqHz = 100 * mpow(100, P[61] / 127); FP.eqGain = (P[62] - 64) / 64 * 12; FP.eqQ = 0.3 + P[63] / 127 * 6;
  X.eq[0].set(F_PEAK, FP.eqHz * ISR * 2, FP.eqQ, 0, FP.eqGain); X.eq[1] = X.eq[0];
  FP.tone = (P[60] - 64) / 64 * 9;
  X.lo[0].set(F_LSH, 300 * ISR * 2, 1, 0, -FP.tone); X.hi[0].set(F_HSH, 3000 * ISR * 2, 1, 0, FP.tone);
  { const Biquad a = X.lo[0], b = X.hi[0]; Biquad& lo = X.lo[1]; Biquad& hi = X.hi[1]; lo.b0 = a.b0; lo.b1 = a.b1; lo.b2 = a.b2; lo.a1 = a.a1; lo.a2 = a.a2; hi.b0 = b.b0; hi.b1 = b.b1; hi.b2 = b.b2; hi.a1 = b.a1; hi.a2 = b.a2; }   // the right channel has its own state
  // chorus (two stages)
  { const int n = (int)clampd(P[64], 1, 4); const bool cOn = P[66] != 0;
    Chorus& a = X.ch[0]; a.dt = (2 + P[52] / 127 * 8) / 1000; a.depth = P[53] / 127; a.hz = 0.1 + mpow(P[54] / 127, 2) * 8;
    a.fb = dmax(0, P[55] - 64) / 63 * 0.9; a.wet = cOn ? P[56] / 127 : 0; a.spread = n == 1 ? 0 : 180;
    Chorus& b = X.ch[1]; b.dt = a.dt * 1.3; b.depth = a.depth * 0.8; b.hz = a.hz * 1.37; b.fb = 0; b.spread = 180;
    b.wet = cOn && n >= 3 ? P[56] / 127 * (n == 4 ? 0.8 : 0.5) : 0; }
  // stereo delay
  { const int dty = (int)P[82]; const double fb = dmin(0.9, P[36] / 127 * 0.9);
    const double t = dmin(2, DELAY_BEATS[(int)clampd(P[35], 0, 19)] * 60 / C.bpm);
    const double x = dmin(1, dabs(P[83] - 64) / 63), sh = (P[83] > 64 ? 1.0 : P[83] < 64 ? -1.0 : 0.0) * (-0.1) * (mexp(6.58 * x) - 1) / (mexp(6.58) - 1);
    FP.dtL = dmin(2, t + dmax(0, -sh)); FP.dtR = dmin(2, t + dmax(0, sh));
    const bool cross = dty == 1 || dty == 2, mono = dty == 2;
    FP.iLL = mono ? 0.5 : 1; FP.iRL = mono ? 0.5 : 0; FP.iLR = 0; FP.iRR = mono ? 0 : 1;
    FP.fLL = cross ? 0 : fb; FP.fRR = cross ? 0 : fb; FP.fLR = cross ? fb : 0; FP.fRL = cross ? fb : 0;
    FP.dLp = P[98] < 64 ? interpN(DELAY_LP, 5, P[98]) : 20000; FP.dHp = P[98] > 64 ? interpN(DELAY_HP, 5, P[98]) : 20;
    for (int c = 0; c < 2; c++) { X.dlp[c].lp(FP.dLp); X.dhp[c].hp(FP.dHp); }
    const double w = P[65] != 0 ? P[37] / 127 : 0; FP.dDry = mcos(w * PI / 2); FP.dWet = msin(w * PI / 2) * 1.2; FP.dOn = w > 0; }
}

// the whole chain after the master gain, in place on wl / wr
void fxProcess(int n) {
  // ---- effect section ----
  if (FP.dist || FP.deci || FP.rm || FP.cmp || FP.ph || FP.dry != 1) {
    if (FP.cmp) X.comp.params(FP.cThr, 6, FP.cRatio, FP.cAtt, 0.15, 0.006);
    const bool phOn = FP.ph;
    if (phOn && !X.phWas) { X.phPh = 0; }
    X.phWas = phOn;
    double* ch[2] = {wl, wr};
    const float* tab = FP.dist ? SHAPE[FP.curve] : SHAPE[0];
    const double rmInc = FP.rmHz * ISR;
    for (int s0 = 0; s0 < n; s0 += 16) {
      const int m = n - s0 < 16 ? n - s0 : 16;
      if (phOn) {                                                  // all-pass frequency: 600 Hz + LFO (sine, +-depth)
        const double fHz = FP.phDepth * msin(2 * PI * X.phPh), cut = (fHz < 0 ? 0 : fHz) * ISR * 2;   // Tone.LFO -> Filter.frequency overrides the Signal's own 600 Hz, so the sweep is +-depth around 0 Hz; a negative frequency is clamped to 0 by BiquadFilterNode
        X.ap[0][0].set(F_AP, cut, 0.7, 0);
        for (int i = 0; i < 12; i++) for (int c = 0; c < 2; c++) { Biquad& b = X.ap[i][c]; const Biquad& a = X.ap[0][0]; b.b0 = a.b0; b.b1 = a.b1; b.b2 = a.b2; b.a1 = a.a1; b.a2 = a.a2; }
      }
      for (int s = s0; s < s0 + m; s++) {
        const double in[2] = {ch[0][s], ch[1][s]}; double out[2] = {in[0] * FP.dry, in[1] * FP.dry};
        double cl[2] = {in[0], in[1]};
        if (FP.cmp) { X.comp.run(cl[0], cl[1]); out[0] += FP.wetCmp * cl[0]; out[1] += FP.wetCmp * cl[1]; }
        const double rmv = FP.rm ? msin(2 * PI * X.rmPh) * FP.wetRm : 0;
        for (int c = 0; c < 2; c++) {
          const double x = in[c];
          if (FP.dist) { double y = shaper(tab, clampd(x * FP.pre, -1, 1)); y = X.lp[c].run(X.hp[c].run(y)); out[c] += y * FP.post * FP.wetD; }
          if (FP.deci) { double& cc = X.dcC[c]; cc += 1; if (cc >= FP.hold) { cc -= FP.hold; X.dcH[c] = dfloor(clampd(4 * x, -1, 1) * FP.lv + 0.5) / FP.lv; } out[c] += 0.25 * X.dcH[c] * FP.wetDeci; }
          if (FP.rm) out[c] += x * rmv;
          if (phOn) {
            double u = x + X.phLine[c].read(0.003 * SR + QUANTUM);
            for (int i = 0; i < FP.phN; i++) u = X.ap[i][c].run(u);
            X.phLine[c].put(FP.phFb * u); out[c] += FP.wetPh * u;
          }
        }
        X.rmPh += rmInc; if (X.rmPh >= 1) X.rmPh -= 1;
        if (phOn) { X.phPh += FP.phHz * ISR; if (X.phPh >= 1) X.phPh -= 1; }
        ch[0][s] = out[0]; ch[1][s] = out[1];
      }
    }
  } else { X.rmPh = wrap1(X.rmPh + FP.rmHz * ISR * n); X.phWas = false; }
  // ---- EQ, tone ----
  if (FP.eqGain != 0) for (int s = 0; s < n; s++) { wl[s] = X.eq[0].run(wl[s]); wr[s] = X.eq[1].run(wr[s]); }
  if (FP.tone != 0) for (int s = 0; s < n; s++) { wl[s] = X.hi[0].run(X.lo[0].run(wl[s])); wr[s] = X.hi[1].run(X.lo[1].run(wr[s])); }
  // ---- chorus x2 ----
  for (int j = 0; j < 2; j++) {
    Chorus& c = X.ch[j];
    if (c.wet <= 0) { if (c.active) { c.l[0].clear(); c.l[1].clear(); for (int q = 0; q < QUANTUM; q++) c.fbr[0][q] = c.fbr[1][q] = 0; c.active = false; } c.ph = wrap1(c.ph + c.hz * ISR * n); continue; }
    c.active = true;
    const double a = mcos(c.wet * PI / 2), b = msin(c.wet * PI / 2), dev = c.dt * c.depth, mn = dmax(c.dt - dev, 0), mx = c.dt + dev;
    const double pL = (90 - c.spread / 2) / 360, pR = (90 + c.spread / 2) / 360, inc = c.hz * ISR;
    for (int s = 0; s < n; s++) {
      const double vL = mn + (mx - mn) * (msin(2 * PI * (c.ph - pL)) + 1) / 2, vR = mn + (mx - mn) * (msin(2 * PI * (c.ph - pR)) + 1) / 2;
      const double yL = c.l[0].read(dmax(1.0, vL * SR)), yR = c.l[1].read(dmax(1.0, vR * SR));
      c.l[0].put(wl[s] + c.fb * c.fbr[0][c.fi]); c.l[1].put(wr[s] + c.fb * c.fbr[1][c.fi]);
      c.fbr[0][c.fi] = yL; c.fbr[1][c.fi] = yR; c.fi = (c.fi + 1) & (QUANTUM - 1);
      wl[s] = wl[s] * a + yL * b; wr[s] = wr[s] * a + yR * b;
      c.ph += inc; if (c.ph >= 1) c.ph -= 1;
    }
  }
  // ---- stereo delay ----
  if (!FP.dOn) { if (X.dl[0].len && (X.dyL != 0 || X.dyR != 0)) { X.dl[0].clear(); X.dl[1].clear(); X.dyL = X.dyR = 0; for (int q = 0; q < QUANTUM; q++) X.dfr[0][q] = X.dfr[1][q] = 0; for (int c = 0; c < 2; c++) { X.dlp[c].x1 = X.dlp[c].y1 = X.dhp[c].x1 = X.dhp[c].y1 = 0; } } }
  else for (int s = 0; s < n; s++) {
    const double xl = wl[s], xr = wr[s];
    const double rl = X.dl[0].read(dmax(1.0, FP.dtL * SR)), rr = X.dl[1].read(dmax(1.0, FP.dtR * SR));
    const double yl = X.dhp[0].run(X.dlp[0].run(rl)), yr = X.dhp[1].run(X.dlp[1].run(rr));
    const double bl = X.dfr[0][X.dfi], br = X.dfr[1][X.dfi]; X.dfr[0][X.dfi] = yl; X.dfr[1][X.dfi] = yr; X.dfi = (X.dfi + 1) & (QUANTUM - 1);
    // Chromium breaks a feedback loop where its graph walk meets a node it is already pulling (output side: hpL, then hpR): L->L, L->R and R->R arrive 128 frames late, R->L is direct (verified by the X / PP cases of test_ab.mjs)
    X.dl[0].put(FP.iLL * xl + FP.iRL * xr + FP.fLL * bl + FP.fRL * yr);
    X.dl[1].put(FP.iLR * xl + FP.iRR * xr + FP.fLR * bl + FP.fRR * br);
    X.dyL = yl; X.dyR = yr;
    wl[s] = xl * FP.dDry + yl * FP.dWet; wr[s] = xr * FP.dDry + yr * FP.dWet;
  }
}

void updateGlobals() {
  dirty = false;
  static const int FT[5][2] = {{F_LP, 1}, {F_LP, 2}, {F_HP, 1}, {F_BP, 1}, {F_LP, 2}};
  int ti = (int)clampd(P[14], 0, 4);
  G.ftype = FT[ti][0]; G.nst = FT[ti][1];
  double r = P[20] / 127;
  G.qDb = Q_OFF + r * r * 14.5; G.d = resonanceTerm(G.qDb);
  double sat = P[23] / 127;
  G.satWet = dmin(1, sat * 3); G.satDry = 1 - G.satWet; G.satG = G.satWet * 0.5; G.satPre = (1 + sat * 14) / 8;
  G.cutHz = C.cutSmooth ? pchip17(P[19]) : interp17(P[19]);
  // oscillators
  int w1 = (int)clampd(P[0], 0, 3), w2i = (int)clampd(P[1], 0, 4);
  G.w1 = w1; G.noise2 = w2i == 4; G.w2 = (w2i == 0 || w2i == 4) ? W_SAW : w2i;
  int uni = P[73] != 0 ? (int)clampd(P[93], 1, C.uniMax) : 1;
  if (uni > MAXU) uni = MAXU;
  G.uni = uni;
  bool fat1 = uni > 1 && w1 != W_PULSE, fat2 = uni > 1 && G.w2 != W_PULSE;
  G.n1 = fat1 ? uni : 1; G.n2 = fat2 ? uni : 1;
  double spread = P[75] / 127 * 100;
  for (int i = 0; i < MAXU; i++) G.ratio[i] = 1;
  // each copy has its own detune in the Tone FatOscillator: -spread/2 + i * spread / (count - 1) cents (one ratio table is shared by both oscillators)
  if (uni > 1) for (int i = 0; i < uni; i++) G.ratio[i] = mexp2((-spread / 2 + i * spread / (uni - 1)) / 1200);
  G.gf1 = fat1 ? mpow(10, (-6 - uni * 1.1) / 20) : 1; G.gf2 = fat2 ? mpow(10, (-6 - uni * 1.1) / 20) : 1;
  // unison stereo width: needs a fat OSC1 or OSC2; it adds a second set of copies and scales every OSC level by 1 / sqrt(2) (js/voice.js applyOsc)
  G.pan = uni > 1 && P[84] > 0 && (fat1 || fat2);
  { double th = PI / 4 * (1 - P[84] / 127); G.panK = G.pan ? (mcos(th) + msin(th)) / 2 : 1; }
  // unison pitch layer (#85): a second layer of copies transposed by (value - 24) semitones, mixed at the same level; it scales every OSC level by 1 / sqrt(2) as well
  G.lay = uni > 1 && P[85] != 24; G.kU = mexp2((P[85] - 24) / 12);
  double m = P[5] / 127 * PI / 2, un = 1 / dsqrt((double)uni) * (G.lay ? 0.7071067811865476 : 1) * (G.pan ? 0.7071067811865476 : 1);
  G.g1 = mcos(m) * 0.5 * un;
  bool none = w2i == 0;
  // ring (OSC1 x OSC2) and hard sync replace the direct OSC2 signal; noise and "none" exclude both (js/voice.js applyOsc)
  bool ring = P[7] != 0 && !G.noise2 && !none, sync = P[6] != 0 && !ring && !G.noise2 && !none;
  double s2 = none ? 0 : msin(m) * 0.5 * un;
  G.g2 = (G.noise2 || ring || sync) ? 0 : s2;
  G.gr = ring ? s2 * un : 0;
  G.gsync = sync ? s2 : 0;
  G.syncT = ((int)P[1]) & 3;
  G.fmG = none ? 0 : mpow(P[45] / 127, 2) * 4800;
  // sub: follows OSC1 pitch (or one octave down) and the unison copies (not pulse); level scales with the OSC1 side of the mix, without the unison normalisation
  { static const int SUBW[4] = {W_SINE, W_TRI, W_SAW, W_SQUARE}; G.wS = SUBW[(int)clampd(P[96], 0, 3)]; }
  G.nS = uni > 1 ? uni : 1; G.gfS = uni > 1 ? mpow(10, (-6 - uni * 1.1) / 20) : 1;
  G.gs = P[95] / 127 * 0.5 * mcos(m); G.subMul = P[97] != 0 ? 0.5 : 1;
  // Tone.Noise plays a STEREO buffer (two independent white noises) and the voice's Panner is mono, which averages the two channels: the noise of the Tone engine is
  // 1 / sqrt(2) of a unit white noise (-3.01 dB, measured in test_ab.mjs). The core generates one channel and applies the same factor.
  G.gn = G.noise2 ? msin(m) * 0.5 * 0.7071067811865476 : 0;
  G.wBase = -0.9 + 0.9 * P[8] / 127; G.duty = (G.wBase + 1) / 2;
  // pitch
  G.tune = (P[72] - 64) / 64 * 62 / 1200; G.det = P[76] / 127 * 50 / 1200;
  double p2 = P[2];
  double semi = p2 <= 64 ? -60 + p2 * 60 / 64 : (p2 - 64) * 60 / 63;
  semi = dfloor(semi + 0.5);
  G.st2 = semi + (P[3] - 66) / 100;
  G.bk = mexp2(C.bend / 12);
  // LFO 1 / 2: speed (free or tempo-synced), shape, routing (js/voice.js applyMod). Send gains: pitch cents (peak), cutoff 4800 cents, tremolo, pulse width, FM 2400 cents, pan
  { static const int ON[2] = {57, 58}, DS[2] = {41, 46}, DP[2] = {44, 49}, TY[2] = {42, 47}, SP[2] = {43, 48}, SY[2] = {67, 69};
    double trem = 0;
    for (int k = 0; k < 2; k++) {
      const double hz = P[SY[k]] != 0 ? 1 / (LFO_BEATS[(int)dfloor(clampd(P[SP[k]], 0, 127) / 127 * 16 + 0.5)] * 60 / C.bpm) : interpN(LFO_SPD, 9, P[SP[k]]);
      LF[k].configure((int)P[TY[k]], hz);
      const int dest = P[ON[k]] != 0 ? (int)P[DS[k]] : -1; const double d = P[DP[k]] / 127;
      G.lfoSgn[k] = P[TY[k]] == 0 ? -1 : 1;
      G.lfoDest[k] = dest >= 1 && dest <= 7 ? dest : 0;
      G.lfoScale[k] = dest < 1 ? 0 : dest <= 2 ? linN(LFO_PITCH, 7, P[DP[k]]) / 2 : dest == 3 ? d * 4800 : dest == 4 ? d / 2 : dest == 5 ? d * 0.9 : dest == 6 ? d * 2400 : dest == 7 ? dmin(1, P[DP[k]] / 100) : 0;
      if (dest == 4) trem += d / 2;
    }
    G.vgBase = 1 - trem; }
  // mod envelope: amount 64 = 0; destination 0 OSC2 pitch (4800 cents), 1 FM (2400 cents), 2 pulse width, other = none
  { const int md = (int)P[71]; const double amt = (P[11] - 64) / 64;
    G.meKind = P[10] != 0 && md >= 0 && md <= 2 ? md : -1;
    G.meScale = md == 0 ? amt * 4800 : md == 1 ? amt * 2400 : md == 2 ? amt * 0.9 : 0;
    G.meA = timeCurve(P[12]); G.meD = timeCurve(P[13]); }
  G.fmPossible = G.fmG != 0 || (G.meKind == 1 && G.meScale != 0);
  for (int k = 0; k < 2; k++) if (G.lfoDest[k] == 6 && G.lfoScale[k] != 0) G.fmPossible = true;
  // ladder filter: LP24 only; the envelope output (biquad table) is turned into the ladder's fc by the ratio of the two cutoff tables
  G.useLad = C.filter != 0 && G.ftype == F_LP && G.nst == 2;
  G.ladScale = (C.cutSmooth ? pchipN(CUT_TAB_LAD, 9, P[19]) : interpN(CUT_TAB_LAD, 9, P[19])) / G.cutHz;
  G.ladK = dmin(4, LAD_K * r * r);
  // envelopes
  G.ampA = timeCurve(P[25]); G.ampD = tEnvCurve(P[26]); G.ampS = P[27] / 127; G.ampR = tEnvCurve(P[28]);
  G.feA = timeCurve(P[15]); G.feD = tEnvCurve(P[16]); G.feS = P[17] / 127; G.feR = tEnvCurve(P[18]);
  // master
  double nt = gainCurve(P[29]) * mpow(P[99] / 127, 2) * 0.9;
  if (nt != G.masterTarget) { G.masterTarget = nt; mgLeft = (int)(0.02 * SR); mgInc = (nt - mg) / mgLeft; }
  G.panTarget = clampd((P[90] - 64) / 63, -1, 1);
  fxUpdate();
  for (int i = 0; i < MAXV; i++) V[i].refresh();
}

}  // namespace

// ---------------------------------------------------------------------------------------------------------------------------------
// C API
// ---------------------------------------------------------------------------------------------------------------------------------
EC_API void ec_init(double sampleRate) {
  SR = sampleRate; NYQ = SR / 2; ISR = 1 / SR;
  G = Glob(); C = Cfg();          // no static constructors run in the wasm module: initialise everything here
  for (int k = 0; k < NB; k++) thr[k] = NYQ / (1024 >> k);
  if (!tablesBuilt) buildTables();
  OpenSynthFilter::init();        // cutoff table of the OpenSynth1 filter
  for (int i = 0; i < NP; i++) P[i] = 0;
  P[99] = 100;
  for (int i = 0; i < MAXV; i++) { V[i] = Voice(); V[i].rng = 2463534242u + 7919u * i; V[i].drng = 88172645u + 104729u * i; V[i].idx = i; }
  for (int k = 0; k < 2; k++) { LF[k] = Lfo(); LF[k].rng = 2463534242u + 31337u * k; }
  driftAcc = 0;
  for (int i = 0; i < MAXV; i++) { V[i].resetPhases(W_SAW, 1, V[i].ph1, 0); V[i].resetPhases(W_SAW, 1, V[i].ph2, 0); }
  mg = 0; mgInc = 0; mgLeft = 0; G.masterTarget = -1; dirty = true;
  fxInit();
}
EC_API void ec_set_param(int id, double v) { if (id >= 0 && id < NP && P[id] != v) { P[id] = v; dirty = true; } }
EC_API void ec_set_cfg(int key, double v) {                       // 0 poly, 1 unison max, 2 pitch bend (semitones), 3 smooth cutoff curve, 4 hard-sync anti-aliasing, 5 BPM, 6 slop (cents), 7 drift, 8 ladder filter, 9 ladder stage saturation, 10 ladder feedback high-pass (Hz), 11 limiter look-ahead (s), 12 OpenSynth1 filter
  switch (key) {
    case 0: C.polyN = (int)clampd(v, 1, MAXV); for (int i = C.polyN; i < MAXV; i++) { V[i].amp = Env(); V[i].fe = Env(); } break;
    case 1: C.uniMax = (int)clampd(v, 1, MAXU); break;
    case 2: C.bend = v; break;
    case 3: C.cutSmooth = v != 0; break;
    case 4: C.syncAA = v != 0; break;
    case 5: C.bpm = clampd(v, 40, 300); break;
    case 6: C.slop = v; break;
    case 7: C.drift = v; if (v == 0) for (int i = 0; i < MAXV; i++) V[i].d1 = V[i].d2 = V[i].dc = 0; break;
    case 8: C.filter = v != 0; break;
    case 9: C.ladSat = v != 0; break;
    case 10: C.ladFb = v; break;
    case 11: C.lookahead = clampd(v, 0, 0.02); break;
    case 12: C.os1Filter = v != 0; break;
    default: break;
  }
  dirty = true;
}
EC_API void ec_voice_down(int i, int note, double vel, double glide, int retrig) { if (i >= 0 && i < C.polyN) { if (dirty) updateGlobals(); V[i].down(note, vel, glide, retrig != 0); } }
EC_API void ec_lfo_sync(int k) { if (k >= 0 && k < 2) LF[k].keySync(); }                 // key sync (#68 / #70): restart the phase / draw a new random value
EC_API void ec_lfo_advance(int k, double seconds) { if (dirty) updateGlobals(); if (k >= 0 && k < 2 && !LF[k].rnd) LF[k].ph = wrap1(LF[k].ph + LF[k].hz * seconds); }   // tests: free-running LFOs start before the first note
EC_API void ec_voice_up(int i) { if (i >= 0 && i < MAXV) V[i].up(); }
EC_API float* ec_out_l() { return outL; }
EC_API float* ec_out_r() { return outR; }
EC_API double ec_peak() { double p = peak; peak = 0; return p; }
EC_API int ec_active_voices() { int n = 0; for (int i = 0; i < C.polyN; i++) if (!V[i].amp.silent()) n++; return n; }

EC_API void ec_process(int frames) {
  if (frames > MAXF) frames = MAXF;
  if (dirty) updateGlobals();
  for (int i = 0; i < frames; i++) mixL[i] = mixR[i] = 0;
  fillMods(frames);
  if (C.drift > 0) { driftAcc += frames; while (driftAcc >= SR * 0.1) { driftAcc -= SR * 0.1; for (int i = 0; i < C.polyN; i++) V[i].driftTick(); } }   // js/engine.js: every 100 ms
  for (int i = 0; i < C.polyN; i++) {
    if (V[i].amp.silent()) V[i].idle(frames);
    else V[i].render(frames, mixL, mixR);
  }
  // master gain -> effects (js/fx.js) -> pan (StereoPanner on a stereo signal) -> limiter (Tone.Limiter(-2): a DynamicsCompressorNode) -> soft clip tanh(1.2 x) / 1.2 (the WaveShaper at the end of the chain)
  for (int s = 0; s < frames; s++) {
    if (mgLeft > 0) { mg += mgInc; if (--mgLeft == 0) mg = G.masterTarget; }
    wl[s] = mixL[s] * mg; wr[s] = mixR[s] * mg;
  }
  fxProcess(frames);
  X.lim.params(-2, 30, 20, 0.003, 0.01, C.lookahead);
  double pan = G.panTarget, x = pan <= 0 ? pan + 1 : pan, gl = mcos(x * PI / 2), gr = msin(x * PI / 2);
  for (int s = 0; s < frames; s++) {
    double l = wl[s], r = wr[s];
    if (pan != 0) { double il = l, ir = r; if (pan <= 0) { l = il + ir * gl; r = ir * gr; } else { l = il * gl; r = ir + il * gr; } }   // StereoPanner, stereo input: both outputs use the INPUT samples
    X.lim.run(l, r);
    l = clampd(l, -1, 1); r = clampd(r, -1, 1);
    l = mtanh(1.2 * l) / 1.2; r = mtanh(1.2 * r) / 1.2;
    outL[s] = (float)l; outR[s] = (float)r;
    double a = dmax(dabs(l), dabs(r)); if (a > peak) peak = a;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Debug / test exports (not used by the player)
// ---------------------------------------------------------------------------------------------------------------------------------
namespace { float DBG[1 << 16]; }
EC_API float* ec_dbg_buf() { return DBG; }
EC_API double ec_dbg_voice(int i, int which) {                       // internal state of a voice (tests)
  const Voice& v = V[i];
  switch (which) { case 0: return v.amp.st; case 1: return v.amp.v; case 2: return v.fe.st; case 3: return v.fe.v; case 4: return v.feBase; case 5: return v.feOct; case 6: return mexp2(v.g1.cur); case 7: return mexp2(v.g2.cur); case 8: return G.g1; case 9: return G.g2; case 10: return mg; case 11: return G.masterTarget; case 12: return G.ampA; case 13: return G.ampS; default: return 0; }
}
EC_API double ec_dbg_glob(int which) { switch (which) { case 0: return G.w1; case 1: return G.w2; case 2: return G.uni; case 3: return G.n1; case 4: return G.nst; case 5: return G.qDb; case 6: return G.cutHz; case 7: return G.g1; case 8: return G.ampA; case 9: return G.duty; case 10: return G.tune; case 11: return G.masterTarget; default: return -1; } }
EC_API void ec_dbg_comp(int n, double thr, double knee, double ratio, double atk, double rel, double preDelay) {   // tests: stereo in DBG[0..n) / DBG[n..2n), processed in place
  static Comp c; c.reset(); c.params(thr, knee, ratio, atk, rel, preDelay);
  for (int i = 0; i < n; i++) { double l = DBG[i], r = DBG[n + i]; c.run(l, r); DBG[i] = (float)l; DBG[n + i] = (float)r; }
}
EC_API uint32_t ec_dbg_addr(int w) { return (uint32_t)(uintptr_t)(w == 0 ? (void*)&G : w == 1 ? (void*)&P : w == 2 ? (void*)&V : (void*)&C); }
EC_API double ec_dbg_state(int which) { switch (which) { case 0: return dirty; case 1: return C.polyN; case 2: return P[99]; case 3: return P[19]; case 4: return G.uni; case 5: return mgLeft; default: return P[which - 100]; } }
EC_API double ec_dbg_curve(int which, double v) {
  switch (which) {
    case 0: return interp17(v);  case 1: return pchip17(v);  case 2: return gainCurve(v);  case 3: return timeCurve(v);
    case 4: return tEnvCurve(v); case 5: return t60Curve(v); case 6: return ktSlope(v, false); case 7: return ktSlope(v, true);
    case 8: return mexp(v); case 9: return mlog(v); case 10: return msin(v); case 11: return mtanh(v); case 12: return mpow(2.7, v);
    default: return 0;
  }
}
EC_API void ec_dbg_biquad(int type, double freqHz, double q, int n) {   // impulse response into DBG[0..n)
  Biquad b; b.set(type, freqHz / NYQ, q, resonanceTerm(q));
  for (int i = 0; i < n; i++) DBG[i] = (float)b.run(i == 0 ? 1.0 : 0.0);
}
EC_API void ec_dbg_os1(int type, double hz, double res, int n) {   // tests: the OpenSynth1 filter on an impulse followed by noise (xorshift, amplitude 0.5) into DBG[0..n)
  OpenSynthFilter f; uint32_t r = 1;
  for (int i = 0; i < n; i++) { float in = i == 0 ? 1.0f : (float)(urand(r) * 0.5); DBG[i] = f.processSample(in, (float)hz, (float)res, type, (float)SR); }
}
EC_API void ec_dbg_env(double atk, double dec, double sus, double rel, double vel, int noteSamples, int n) {   // envelope output into DBG[0..n)
  Env e; e.trigger(vel, atk, dec, sus);
  for (int i = 0; i < n; i++) { if (i == noteSamples) e.release(rel); DBG[i] = (float)e.tick(); }
}
EC_API void ec_dbg_lfo(int type, double hz, int chunks, int mode) {   // LFO value at the start of each chunk into DBG[0..chunks) (a fresh LFO; mode 1: also a key sync after 3 chunks)
  Lfo l; l.rng = 2463534242u; l.configure(type, hz);
  for (int i = 0; i < chunks; i++) { if (mode == 1 && i == 3) l.keySync(); DBG[i] = (float)l.value(); l.adv(CHUNK); }
}
EC_API void ec_dbg_wave(int wave, double f0, double duty, int n) {  // one oscillator copy into DBG[0..n)
  for (int i = 0; i < n; i++) DBG[i] = 0;
  double ph = 0;
  renderCopy(wave, ph, f0 * ISR, duty, 1.0f, DBG, n);
}
