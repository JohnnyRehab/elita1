# 第三者のコードと素材 / Third-party notices

ELITA-1 本体のコードとドキュメントは MIT License です（[LICENSE](LICENSE)）。次の第三者のコードを含み、それぞれ下記のライセンスに従います。いずれも MIT License で、配布するときに著作権表示と許諾文を残す必要があります（このファイルとリンク先がそれを兼ねています）。

The ELITA-1 code and documentation are under the MIT License ([LICENSE](LICENSE)). The third-party code listed below is included under its own license. All are MIT-licensed; the copyright notice and permission notice must be kept when redistributing (this file and the files it points to do that).

| 名前 / Name | 版 / Version | 場所 / Where | 著作権 / Copyright | 出典 / Source |
| --- | --- | --- | --- | --- |
| Tone.js | 14.8.49 | `js/Tone.js`（無改変のビルド。npm `tone@14.8.49` の `build/Tone.js` と同一）。従来のエンジンを選んだときだけ読み込まれます | © 2014-2020 Yotam Mann | https://tonejs.github.io/ |
| NexusUI | 2.1.6 | `js/NexusUI.js`（無改変。npm `nexusui@2.1.6` の `dist/NexusUI.js` と同一） | 著者: Benjamin Taylor（`package.json`。上流に LICENSE ファイルはなく、`"license": "MIT"` の宣言のみ） | https://nexus-js.github.io/ui/ |
| destyle.css | 2.0.2 | `css/reset.css`（ファイル先頭の表記による） | © 2019 Nicolas Cusan | https://github.com/nicolas-cusan/destyle.css |
| OpenSynth1 | 取得時のコミット `0b6104273580d63c936c9b870cd18b3643014389` | `core/os1/`（フィルター、エンベロープ、オシレーターのコード。JUCE と libc に依存しない形に機械的に置換したもの） | © 2026 letsdig / OpenSynth1 Contributors | https://github.com/letsdig/OpenSynth1 |

C++ / Wasm コア（`core/elita_core.cpp`）は ELITA-1 のコードで、外部ライブラリ（libc を含む）を使っていません。ただし `core/os1/` のコードをビルドに取り込んでいます。

## 素材と名称 / Assets and names

- **Synth1:** 「Synth1」は Ichiro Toda 氏（Daichi's Lab）の製品名です。ELITA-1 は非公式のプロジェクトで、作者・配布元とは関係がありません。Synth1 のコード、画像、パッチ（`.sy1`）は含んでいません。
- **`img/e1.png`:** ELITA-1 のアイコンです。MIT License の対象外で、再利用する場合は作者の意向に従ってください。
- **AI の支援:** `img/e1.png` と `img/triangle.svg` には、Claude（Anthropic）が作成に関わったことを示すコンテンツ認証情報（C2PA）が埋め込まれています。AI が作った成果物の著作権の扱いは国や地域で異なります。

## ライセンス全文 / License texts

### Tone.js — MIT License

```
MIT License

Copyright (c) 2014-2020 Yotam Mann

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
```

Tone.js のビルドに付く短い表記は `js/Tone.js.LICENSE.txt` にあります（`js/Tone.js` の先頭がこのファイルを指しています）。

### NexusUI — MIT License

上流のリポジトリと npm パッケージには LICENSE ファイルがなく、`package.json` の `"license": "MIT"` と著者名（Benjamin Taylor）だけが示されています。著作権の年と名義は上流に記載がないため、ここでは書いていません。標準の MIT License の許諾文は次のとおりです。

The upstream repository and npm package ship no LICENSE file; only `"license": "MIT"` and the author name (Benjamin Taylor) are given in `package.json`. No copyright year or holder line is published upstream, so none is stated here. The standard MIT License terms:

```
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
```

### destyle.css — MIT License

```
MIT License

Copyright (c) 2019 Nicolas Cusan

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
```

### OpenSynth1 — MIT License

```
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
```
