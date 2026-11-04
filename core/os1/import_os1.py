#!/usr/bin/env python3
"""Regenerate os1_filter.h and os1_env_class.inc from an OpenSynth1 checkout (MIT).
usage: import_os1.py <path-to-OpenSynth1-repo>
The code is copied as is; only these mechanical edits are made so that it builds without JUCE / libc (see NOTICE-OpenSynth1.md):
  juce::jlimit -> os1m::jlimit, juce::MathConstants<double>::pi -> os1m::pi, std::<fn>( -> os1m::<fn>(, <includes> removed,
  the filter's constructor no longer fills the cutoff table (a global constructor would never run in the Wasm module): call OpenSynthFilter::init() once."""
import re, sys, pathlib
src = pathlib.Path(sys.argv[1]) / 'Source'
out = pathlib.Path(__file__).parent

def conv(t):
    t = t.replace('juce::jlimit', 'os1m::jlimit').replace('juce::MathConstants<double>::pi', 'os1m::pi')
    t = re.sub(r'\bstd::(\w+)\(', r'os1m::\1(', t)
    return t

f = (src / 'OpenSynthFilter.h').read_text()
f = re.sub(r'#include <algorithm>\n#include <cmath>\n#include <juce_audio_basics/juce_audio_basics.h>\n', '', f)
old = '  OpenSynthFilter() {\n    initCutoffTable();\n    reset();\n  }\n'
assert old in f
f = f.replace(old, '  OpenSynthFilter() = default;\n  static void init() { initCutoffTable(); }   // [ELITA] was done in the constructor\n')
f = conv(f)
assert 'juce::' not in f and 'std::' not in f, 'unconverted symbol'
hdr = '// Imported from OpenSynth1 (MIT, (c) 2026 letsdig / OpenSynth1 Contributors) Source/OpenSynthFilter.h. See NOTICE-OpenSynth1.md. Do not edit: run import_os1.py.\n// Needs namespace os1m: jlimit / max / min / abs / sin / tan / exp / log / pow / isfinite / pi (os1_math_native.h or the core\'s own math).\n'
(out / 'os1_filter.h').write_text(hdr + f)

p = (src / 'PluginProcessor.h').read_text()
m = re.search(r'class Synth1ExponentialADSR \{.*?\n\};\n', p, re.S)
e = conv(m.group(0))
assert 'juce::' not in e and 'std::' not in e
(out / 'os1_env_class.inc').write_text('// Imported from OpenSynth1 (MIT) Source/PluginProcessor.h: class Synth1ExponentialADSR. See NOTICE-OpenSynth1.md. Do not edit: run import_os1.py.\n' + e)
print('ok')
