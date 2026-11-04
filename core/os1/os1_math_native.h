// os1m for host builds (tests): the C library. The Wasm core defines its own os1m from its freestanding math (see elita_core.cpp).
#pragma once
#include <algorithm>
#include <cmath>
namespace os1m {
constexpr double pi = 3.14159265358979323846;
constexpr float pi_f = (float)3.141592653589793, twoPi_f = (float)6.283185307179586;
template <class T> inline T jlimit(T lo, T hi, T v) { return v < lo ? lo : (hi < v ? hi : v); }
template <class T> inline T max(T a, T b) { return a < b ? b : a; }
template <class T> inline T min(T a, T b) { return b < a ? b : a; }
inline float abs(float x) { return std::fabs(x); }
inline double abs(double x) { return std::fabs(x); }
inline float sin(float x) { return std::sin(x); }
inline double sin(double x) { return std::sin(x); }
inline float cos(float x) { return std::cos(x); }
inline double cos(double x) { return std::cos(x); }
inline double tan(double x) { return std::tan(x); }
inline double exp(double x) { return std::exp(x); }
inline double log(double x) { return std::log(x); }
inline float pow(float a, float b) { return std::pow(a, b); }
inline double pow(double a, double b) { return std::pow(a, b); }
inline float fmod(float a, float b) { return std::fmod(a, b); }
inline bool isfinite(double x) { return std::isfinite(x); }
}
