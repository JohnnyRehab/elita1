// OpenSynth1 oscillator and LFO waveforms (MIT, see NOTICE-OpenSynth1.md): Synth1Voice::getOsc1Sample / getOsc2Sample / getSubOscSample / getLfoSample and polyBlep,
// copied as is from Source/PluginProcessor.cpp, made free functions. The only changes: the noise of OSC2 takes its random value (-1..1) as an argument instead of juce::Random,
// and juce / std calls go through os1m. Needs namespace os1m (see os1_filter.h).
#pragma once
inline float os1PolyBlep(float t, float dt) {
  if (dt <= 0.0f)
    return 0.0f;
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1.0f;
  } else if (t > 1.0f - dt) {
    t = (t - 1.0f) / dt;
    return t * t + t + t + 1.0f;
  }
  return 0.0f;
}
inline float os1Saw(float phase, float dt, float pw, bool antiAlias) {
  float fraction = 1.0f;
  if (pw > 0.5f) {
    fraction = 1.0f - (pw - 0.5f) * 1.8f;
  }
  float safePw = os1m::jlimit(0.05f, 1.0f, fraction);
  float val = -1.0f;
  if (phase < safePw) {
    val = 2.0f * (phase / safePw) - 1.0f;
  }
  if (antiAlias) {
    val -= os1PolyBlep(phase, dt);
    if (safePw < 1.0f) {
      val += os1PolyBlep(os1m::fmod(phase + 1.0f - safePw, 1.0f), dt);
    }
  }
  return val;
}
inline float os1Pulse(float phase, float dt, float pw, bool antiAlias) {
  float val = (phase < pw) ? 1.0f : -1.0f;
  if (antiAlias) {
    val += os1PolyBlep(phase, dt);
    val -= os1PolyBlep(os1m::fmod(phase + 1.0f - pw, 1.0f), dt);
  }
  return val;
}
inline float os1Tri(float phase, float pw) {
  float safePw = os1m::jlimit(0.01f, 0.99f, pw);
  if (phase < safePw) {
    return 2.0f * (phase / safePw) - 1.0f;
  } else {
    return 1.0f - 2.0f * ((phase - safePw) / (1.0f - safePw));
  }
}
// shape 0 sine, 1 saw, 2 pulse, 3 triangle
inline float os1Osc1Sample(float phase, float dt, int shape, float pw, bool antiAlias = true) {
  switch (shape) {
  case 0: return os1m::sin(phase * os1m::twoPi_f);
  case 1: return os1Saw(phase, dt, pw, antiAlias);
  case 2: return os1Pulse(phase, dt, pw, antiAlias);
  case 3: return os1Tri(phase, pw);
  default: return 0.0f;
  }
}
// shape 0 off, 1 saw, 2 pulse, 3 triangle, 4 noise (noiseRnd = a random value in -1..1, used only by the noise)
inline float os1Osc2Sample(float phase, float dt, int shape, float pw, bool antiAlias, float noiseRnd) {
  switch (shape) {
  case 0: return 0.0f;
  case 1: return os1Saw(phase, dt, pw, antiAlias);
  case 2: return os1Pulse(phase, dt, pw, antiAlias);
  case 3: return os1Tri(phase, pw);
  case 4: return noiseRnd;
  default: return 0.0f;
  }
}
// shape 0 sine, 1 triangle, 2 saw down, 3 square
inline float os1SubSample(float phase, int shape) {
  switch (shape) {
  case 0: return os1m::sin(phase * os1m::twoPi_f);
  case 1: return 2.0f * os1m::abs(2.0f * phase - 1.0f) - 1.0f;
  case 2: return 1.0f - 2.0f * phase;
  case 3: return (phase < 0.5f) ? 1.0f : -1.0f;
  default: return 0.0f;
  }
}
// shape 0 saw down, 1 triangle, 2 square, 3 S&H (rCurr), 4 smoothed random, 5 sine
inline float os1LfoSample(float phase, int shape, float rCurr, float rNext) {
  switch (shape) {
  case 0: return 1.0f - 2.0f * phase;
  case 1: return 2.0f * os1m::abs(2.0f * phase - 1.0f) - 1.0f;
  case 2: return (phase < 0.5f) ? 1.0f : -1.0f;
  case 3: return rCurr;
  case 4: {
    float s = 0.5f - 0.5f * os1m::cos(phase * os1m::pi_f);
    return rCurr + (rNext - rCurr) * s;
  }
  case 5: return os1m::sin(phase * os1m::twoPi_f);
  default: return os1m::sin(phase * os1m::twoPi_f);
  }
}
