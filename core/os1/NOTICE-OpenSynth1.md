# OpenSynth1 から取り込んだコード

`core/os1/` の `os1_filter.h`、`os1_env_class.inc`、`os1_env.h`、`os1_osc.h` は、OpenSynth1 のソースコードを元にしています。

- 出典: https://github.com/letsdig/OpenSynth1 （取得時のコミット `0b6104273580d63c936c9b870cd18b3643014389`、`Source/OpenSynthFilter.h` と `Source/PluginProcessor.{h,cpp}`）
- ライセンス: MIT License, Copyright (c) 2026 letsdig / OpenSynth1 Contributors（下に全文）
- 変更点: JUCE と libc に依存しないための機械的な置換のみです（`import_os1.py`、`os1_osc.h` の冒頭コメント参照）。アルゴリズムと定数は変えていません。
- `core/tests/os1_golden.cpp` が、元のコード（JUCE を小さなシムに置き換えたもの）と取り込んだコードの出力が一致することを確認します。

---

MIT License

Copyright (c) 2026 letsdig / OpenSynth1 Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
