// The OpenSynth1 filter as built into the core (freestanding math: own sin / tan / exp / log) against the original code with the C library (golden, JUCE shim).
// The two differ only by the accuracy of the math functions, so the outputs must agree to float precision.
#include <cstdio>
#include <cmath>
#include "juce_shim.h"
float golden_rnd = 0;
namespace golden {
#include "golden_filter.h"
}
extern "C" { void ec_init(double); void ec_dbg_os1(int, double, double, int); float* ec_dbg_buf(); }
static unsigned rs = 1; static double urand() { rs ^= rs << 13; rs ^= rs >> 17; rs ^= rs << 5; return (double)(int)rs * (1.0 / 2147483648.0); }
int main() {
  const int N = 4000; int fails = 0; double worst = 0;
  for (double sr : {44100.0, 48000.0, 96000.0}) {
    ec_init(sr);
    for (int type = 0; type < 5; type++) for (double hz : {80.0, 400.0, 1500.0, 6000.0, 14000.0}) for (double res : {0.0, 0.3, 0.7, 0.9}) {
      ec_dbg_os1(type, hz, res, N); const float* o = ec_dbg_buf();
      golden::OpenSynthFilter g; rs = 1; double maxd = 0, peak = 0;
      for (int i = 0; i < N; i++) {
        float in = i == 0 ? 1.0f : (float)(urand() * 0.5), y = g.processSample(in, (float)hz, (float)res, type, (float)sr);
        double d = std::fabs((double)y - o[i]); if (d > maxd) maxd = d; if (std::fabs(y) > peak) peak = std::fabs(y);
        if (!std::isfinite(o[i])) { printf("non-finite output type %d hz %g res %g\n", type, hz, res); fails++; break; }
      }
      double rel = maxd / (peak > 1e-9 ? peak : 1); if (rel > worst) worst = rel;
      if (rel > 1e-4) { printf("DIFF sr %g type %d hz %g res %g: max |diff| %.3g, peak %.3g\n", sr, type, hz, res, maxd, peak); fails++; }
    }
  }
  printf("%s: worst relative difference %.3g\n", fails ? "FAIL" : "PASS", worst);
  return fails != 0;
}
