#!/usr/bin/env python3
"""Build and run the OpenSynth1 golden test: the ORIGINAL OpenSynth1 code (JUCE replaced by a tiny shim) against core/os1/* on the same inputs.
usage: os1_golden.py <path-to-OpenSynth1-repo>     (needs g++)"""
import re, sys, pathlib, subprocess, tempfile
repo = pathlib.Path(sys.argv[1]) / 'Source'
here = pathlib.Path(__file__).parent
tmp = pathlib.Path(tempfile.mkdtemp(prefix='os1golden_'))
shim = r'''#pragma once
#include <cmath>
#include <algorithm>
namespace juce {
template <class T> inline T jlimit(T lo, T hi, T v) { return v < lo ? lo : (hi < v ? hi : v); }
template <class T> struct MathConstants;
template <> struct MathConstants<double> { static constexpr double pi = 3.14159265358979323846; };
template <> struct MathConstants<float> { static constexpr float pi = 3.14159265358979323846f, twoPi = 6.28318530717958647692f, halfPi = 1.57079632679489661923f; };
}
extern float golden_rnd;
'''
(tmp / 'juce_shim.h').write_text(shim)
f = (repo / 'OpenSynthFilter.h').read_text().replace('#include <juce_audio_basics/juce_audio_basics.h>', '#include "juce_shim.h"')
(tmp / 'golden_filter.h').write_text(f)
p = (repo / 'PluginProcessor.h').read_text()
(tmp / 'golden_env.h').write_text('#include "juce_shim.h"\n' + re.search(r'class Synth1ExponentialADSR \{.*?\n\};\n', p, re.S).group(0))
c = (repo / 'PluginProcessor.cpp').read_text()
pb = re.search(r'inline float polyBlep\(.*?\n\}\n', c, re.S).group(0)
a = c.index('float Synth1Voice::getOsc1Sample'); b = c.index('void Synth1Voice::updateEnvelopes()')
osc = c[a:b].replace('Synth1Voice::', 'golden_').replace('random.nextFloat()', 'golden_rnd_next()')
osc = osc.replace('std::fmod', 'std::fmod')
(tmp / 'golden_osc.h').write_text('#include "juce_shim.h"\ninline float golden_rnd_next() { return (golden_rnd + 1.0f) * 0.5f; }\n' + pb + osc)
u = c[b:]
maps = u[u.index('auto mapTime'):u.index('if (ampAttack')]
(tmp / 'golden_maps.h').write_text('#include "juce_shim.h"\ninline void golden_maps(float p, float& t, float& s) {\n' + maps + '\n  t = mapTime(p); s = mapSustainLevel(p);\n}\n')
src = here / 'os1_golden.cpp'
exe = tmp / 'os1_golden'
subprocess.check_call(['g++', '-std=c++17', '-O2', '-I', str(tmp), '-I', str(here.parent / 'os1'), str(src), '-o', str(exe)])
rc = subprocess.call([str(exe)])
exe2 = tmp / 'os1_core_native'
subprocess.check_call(['clang++', '-std=c++17', '-O2', '-DEC_NATIVE', '-I', str(tmp), '-I', str(here.parent / 'os1'), str(here / 'os1_core_native.cpp'), str(here.parent / 'elita_core.cpp'), '-o', str(exe2)])
rc |= subprocess.call([str(exe2)])
sys.exit(rc)
