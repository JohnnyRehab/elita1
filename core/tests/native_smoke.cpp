// Host build of the core with sanitizers: clang++ -std=c++17 -O1 -g -fsanitize=address,undefined -DEC_NATIVE native_smoke.cpp ../elita_core.cpp
#include <stdio.h>
extern "C" { void ec_init(double); void ec_set_param(int, double); void ec_voice_down(int, int, double, double, int); void ec_process(int); double ec_dbg_voice(int, int); double ec_dbg_state(int); float* ec_out_l(); }
int main() {
  ec_init(48000); ec_set_param(19, 80); ec_set_param(25, 0); ec_set_param(29, 100); ec_set_param(5, 0);
  ec_voice_down(0, 60, 0.8, 0, 1);
  printf("ampA=%g g1=%g dirty=%g amp.st=%g\n", ec_dbg_voice(0, 12), ec_dbg_voice(0, 8), ec_dbg_state(0), ec_dbg_voice(0, 0));
  double pk = 0; for (int b = 0; b < 200; b++) { ec_process(128); for (int i = 0; i < 128; i++) { double a = ec_out_l()[i] < 0 ? -ec_out_l()[i] : ec_out_l()[i]; if (a > pk) pk = a; } }
  printf("peak %g\n", pk);
}
