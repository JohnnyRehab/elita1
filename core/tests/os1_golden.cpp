// Golden test: original OpenSynth1 code (namespace golden, JUCE shim) vs the extracted core/os1 code, on the same inputs. Everything must be bit-identical.
#include <cstdio>
#include <cstdint>
#include <cstring>
#include "juce_shim.h"
float golden_rnd = 0;
namespace golden {
#include "golden_filter.h"
#include "golden_env.h"
#include "golden_osc.h"
#include "golden_maps.h"
}
#include "os1_math_native.h"
#include "os1_filter.h"
#include "os1_env.h"
#include "os1_osc.h"

static uint32_t rs = 12345;
static double rnd() { rs ^= rs << 13; rs ^= rs >> 17; rs ^= rs << 5; return (rs >> 8) * (1.0 / 16777216.0); }
static long bad = 0, total = 0;
template <class T> static void chk(const char* what, T a, T b) { total++; if (std::memcmp(&a, &b, sizeof(T)) != 0) { if (bad < 12) printf("MISMATCH %s: golden %.9g ours %.9g\n", what, (double)a, (double)b); bad++; } }

int main() {
  // filter: all 5 modes, random cutoff / resonance, 2 sample rates, 20000 samples each
  OpenSynthFilter::init(); golden::OpenSynthFilter g0; (void)g0;
  for (int type = 0; type < 5; type++) for (double sr : {44100.0, 48000.0, 96000.0}) {
    golden::OpenSynthFilter g; OpenSynthFilter o;
    for (int i = 0; i < 20000; i++) {
      float in = (float)(rnd() * 2 - 1) * (i % 3000 < 1500 ? 1.0f : 0.1f), hz = (float)(30 + rnd() * rnd() * 12000), res = (float)(i % 5000 < 2500 ? rnd() : 0.95 + rnd() * 0.05);
      chk("filter", g.processSample(in, hz, res, type, (float)sr), o.processSample(in, hz, res, type, (float)sr));
    }
  }
  // cutoff mapping
  for (int i = 0; i < 20000; i++) {
    float c = (float)(rnd() * 127), tr = (float)(rnd() * 127), am = (float)(rnd() * 127), ev = (float)rnd(), lf = (float)(rnd() * 2 - 1); int n = (int)(rnd() * 127);
    chk("cutoff", golden::OpenSynthFilter::calculateCutoffHz(c, n, tr, am, ev, lf), OpenSynthFilter::calculateCutoffHz(c, n, tr, am, ev, lf));
  }
  // envelope: random parameters, note on / off at random points
  for (int k = 0; k < 40; k++) {
    golden::Synth1ExponentialADSR g; Synth1ExponentialADSR o; double sr = k % 2 ? 48000 : 44100; g.setSampleRate(sr); o.setSampleRate(sr);
    float a = (float)(rnd() * rnd() * 2), d = (float)(rnd() * 2), s = (float)rnd(), r = (float)(rnd() * 3);
    g.setParameters(a, d, s, r); o.setParameters(a, d, s, r);
    int off = (int)(rnd() * 90000); g.noteOn(); o.noteOn();
    for (int i = 0; i < 200000; i++) {
      if (i == off) { g.noteOff(); o.noteOff(); }
      if (i == off + 40000) { g.noteOn(); o.noteOn(); }
      chk("adsr", g.getNextSample(), o.getNextSample()); if (g.isActive() != o.isActive()) bad++;
    }
  }
  // knob maps, all 128 values
  for (int p = 0; p < 128; p++) { float t, s; golden::golden_maps((float)p, t, s); chk("mapTime", t, os1MapTime((float)p)); chk("mapSustain", s, os1MapSustain((float)p)); }
  // oscillators and LFO: random phase / increment / pulse width, every shape, anti-alias on and off
  for (int i = 0; i < 200000; i++) {
    float ph = (float)rnd(), dt = (float)(rnd() * rnd() * 0.3), pw = (float)(0.01 + rnd() * 0.98); int sh = (int)(rnd() * 5); bool aa = rnd() < 0.7; golden_rnd = (float)(rnd() * 2 - 1);
    if (sh < 4) chk("osc1", golden::golden_getOsc1Sample(ph, dt, sh, pw, aa), os1Osc1Sample(ph, dt, sh, pw, aa));
    chk("osc2", golden::golden_getOsc2Sample(ph, dt, sh, pw, aa), os1Osc2Sample(ph, dt, sh, pw, aa, (golden_rnd + 1.0f) * 0.5f * 2.0f - 1.0f));
    chk("sub", golden::golden_getSubOscSample(ph, sh % 4), os1SubSample(ph, sh % 4));
    float rc = (float)(rnd() * 2 - 1), rn = (float)(rnd() * 2 - 1); int ls = (int)(rnd() * 6);
    chk("lfo", golden::golden_getLfoSample(ph, ls, rc, rn), os1LfoSample(ph, ls, rc, rn));
  }
  printf("%s: %ld comparisons, %ld mismatches\n", bad ? "FAIL" : "PASS", total, bad);
  return bad != 0;
}
