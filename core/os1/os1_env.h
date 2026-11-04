// OpenSynth1 amplitude / filter envelope (MIT, see NOTICE-OpenSynth1.md): the exponential ADSR class (generated) and the Synth1-value -> seconds / level maps
// (from Synth1Voice::updateEnvelopes, copied as is). Needs namespace os1m (see os1_filter.h).
#pragma once
#include "os1_env_class.inc"

// time knob 0..127 -> seconds (5 ms .. 1 s below 64, 1 s .. 6 s above)
inline float os1MapTime(float p) {
  float norm = os1m::jlimit(0.0f, 127.0f, p) / 127.0f;
  if (norm < 0.001f)
    return 0.005f;
  if (norm <= 0.5f) {
    float t = norm / 0.5f;
    float seconds = 0.005f * os1m::pow(200.0f, t);
    return os1m::jlimit(0.005f, 1.0f, (float)seconds);
  } else {
    float t = (norm - 0.5f) / 0.5f;
    float seconds = 1.0f * os1m::pow(6.0f, t);
    return os1m::jlimit(0.005f, 6.0f, (float)seconds);
  }
}
// sustain knob 0..127 -> level
inline float os1MapSustain(float p) {
  if (p <= 0.0f)
    return 0.0f;
  float norm = os1m::jlimit(0.0f, 127.0f, p) / 127.0f;
  return (float)os1m::pow(norm, 1.5f);
}
