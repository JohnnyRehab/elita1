#!/bin/sh
# Build the DSP core: js/core/elita_core.wasm (loaded by the AudioWorklet).
# Needs only clang >= 15 and wasm-ld (no Emscripten, no libc). The built .wasm is committed, so players never need to build.
set -e
cd "$(dirname "$0")"
mkdir -p ../js/core
clang++ --target=wasm32 -std=c++17 -O3 -ffreestanding -fno-exceptions -fno-rtti -fno-math-errno -fno-stack-protector -nostdlib \
  -msimd128 -mbulk-memory -Wall -Wextra -fuse-ld=lld \
  -Wl,--no-entry -Wl,--export-dynamic -Wl,--initial-memory=8388608 -Wl,--max-memory=8388608 -Wl,-z,stack-size=131072 -Wl,--strip-all \
  elita_core.cpp -o ../js/core/elita_core.wasm
ls -l ../js/core/elita_core.wasm
