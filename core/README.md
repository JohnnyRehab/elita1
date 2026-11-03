# ELITA-1 サウンドエンジン "core"（C++ / Wasm、M4）

Tone.js ベースの音声処理を、**1 つの AudioWorklet 内で動く C++ の DSP コア（WebAssembly）**に置き換えるための実装です。
パネル（つまみ・スイッチ・表示）、パッチの読み書き、キーボード、MIDI、アルペジエーターなど **UI の部分は変更していません**。変更したのは、エンジンを選ぶための次の 3 点だけです。

- `index.html`: スクリプトの並びを `js/loader.js` 1 本に置き換えました（エンジンに応じて必要なファイルだけを読み込みます）。
- `js/settings.js`: Settings の先頭に **Sound engine** の項目を追加しました。
- `js/notes.js` / `js/engine.js`: Tone.js がなくても動くようにする小さな修正（下記）。

## エンジンの選び方（M4）

**Settings > Sound engine** で選びます（URL の指定は不要です）。

| 選択 | 内容 |
| --- | --- |
| **C++ / Wasm（既定）** | 音声処理の全てが 1 つの AudioWorklet 内の C++ コアで動きます。**Tone.js は読み込まれません**（`Tone.js`、`voice.js`、`fx.js`、`worklets.js`、`debug.js` を読み込まない）。 |
| Tone.js（従来のエンジン） | 変更なしの従来エンジン。比較用、およびコアが動かないブラウザー向けに残してあります。 |

- 切り替えるとページが再読み込みされます（エンジンごとに読み込むファイルが違うため）。現在のパッチ（`.sy1` として書き出したもの）と master volume は引き継がれ、鳴っている音は止まります。
- 選択はブラウザーの localStorage に保存されます（`elita1-settings` の `engine`）。「reset to defaults」ではエンジンは戻りません（再読み込みが起きるため）。
- **自動のフォールバック:** ブラウザーが AudioWorklet・WebAssembly（bulk memory、SIMD）に対応していないとき、またはコアの起動に失敗したときは、そのタブだけ Tone.js で動き、Settings にその理由が表示されます（保存された選択は変わりません）。
- テストや比較用に、URL の `?engine=core` / `?engine=tone` でそのページだけ強制もできます。強制した選択は保存されません。
- 既定を変えたい場合は `js/loader.js` の `DEFAULT` を書き換えます。


## 現在の範囲（マイルストーン M3：M1 + M2 + エフェクト全般。音声処理は全て C++ コアに移りました）

| 実装済み | 未実装（パネルの値は無視され、パラメーター一覧では "not used" 表示） |
| --- | --- |
| OSC1 / OSC2（sine / saw / pulse / triangle / noise）、mix、unison（本数・detune）、pitch / fine / key track / tune / det / key shift、phase、sub（波形・オクターブ・レベル）、ring、hard sync（PolyBLEP / PolyBLAMP 切替対応）、FM、unison stereo width（#84）、unison pitch layer（#85）、LFO ×2（全波形、7 つの行き先、テンポ同期、キーシンク）、Mod Envelope（OSC2 pitch / FM / pulse width） | （ボイス機能は M2b で全て実装済み） |
| フィルター（LP12 / LP24 / HP12 / BP12 / LPDL）、resonance、saturation、key track、フィルターエンベロープ、velocity | （フィルター機能は全て実装済み） |
| アンプ（エンベロープ、gain、velocity）、master volume、pan、ソフトクリップ | （全て実装済み） |
| エフェクト部（a.d.1 / a.d.2 / d.d. の 3 種のディストーション、deci.、r.m.、comp.、ph.1〜4 のフェイザー）、EQ（peaking）、tone（low / high shelf）、chorus（x1〜x4、2 段）、stereo delay（ST / X / PP、spread、tone）、リミッター（Chromium の DynamicsCompressorNode と同じアルゴリズム） | （全て実装済み） |
| ポルタメント（mono / legato の glide）、ピッチベンド、ラダーフィルター（Settings の Filter = ladder、saturation・bass feedback 切替）、ボイスごとの slop / drift（Settings） | アルペジエーターの発音タイミングの高精度化（現状は `notes.js` の JS タイマーのまま） |

ボイス割り当て（poly / mono / legato）とアルペジエーターは `js/notes.js` をそのまま使います。コアは「ボイスの集合」として、`ec_voice_down` / `ec_voice_up` を受けるだけです。

## 構成

| ファイル | 役割 |
| --- | --- |
| `core/elita_core.cpp` | DSP コア本体（freestanding C++17。libc・例外・ヒープなし。数学関数も自前） |
| `core/build.sh` | `js/core/elita_core.wasm` をビルド（clang と wasm-ld のみ。Emscripten 不要） |
| `js/loader.js` | 起動時に使うエンジンを決め、そのエンジンに必要なスクリプトタグを順に書き出す |
| `js/core/elita_core.wasm` | ビルド済みバイナリ（約 190KB）。コミットしてあるので、利用するだけならビルド不要 |
| `js/core/core-worklet.js` | AudioWorkletProcessor。Wasm を動かして出力を書き込むだけ |
| `js/core/core-engine.js` | メインスレッド側。`ELITA.engine` と同じ口（start / noteOn / noteOff / allOff / voices / wave …）を提供 |
| `core/tests/` | 検証（下記） |

`js/engine.js` への変更は `refresh()` の先頭に 1 行（`S.CORE` なら何もしない）だけです。`js/notes.js` の LFO 再同期は `Tone.now()` を `window.Tone` があるときだけ呼ぶようにし、`js/core/core-engine.js` は `debug.js` がない場合のために空の `S.dbgNote` を用意します。

## ビルド

```sh
./core/build.sh        # clang >= 15 と wasm-ld が必要
```

## 検証（Chromium が必要。`playwright` を使用）

| コマンド | 内容 |
| --- | --- |
| `node core/tests/test_curves.mjs` | 数学関数と曲線を `calib.js` と比較（誤差 1e-9 以内） |
| `node core/tests/test_filter_env.mjs` | フィルターを実際の `BiquadFilterNode`、エンベロープを `Tone.Envelope` と比較 |
| `node core/tests/test_osc.mjs` | オシレーターを解析的なスペクトルと Chromium のネイティブ `OscillatorNode` と比較 |
| `node core/tests/test_ab.mjs [--only N] [--case JSON]` | **旧エンジンと新コアに同じパッチ・同じ音を弾かせ、波形を比較**（79 ケース） |
| `node core/tests/test_fx.mjs` | コンプレッサー / リミッターを実際の `DynamicsCompressorNode` と比較（-80 dB 以下の差） |
| `node core/tests/test_lfo.mjs` | LFO の波形・速度・ランダム・キーシンクを単体で検証 |
| `node core/tests/test_analog.mjs` | slop（ボイス別オフセット）と drift（ゆらぎの大きさ）の統計を検証 |
| `node core/tests/test_page.mjs` | 実際のページ（`?engine=core`）で発音・解放・つまみ・PC キーボード演奏を確認 |
| `node core/tests/test_engine_switch.mjs` | Settings のエンジン切替（既定がコアで Tone.js 不読み込み、切替とパッチの引き継ぎ、保存、`?engine=` の強制、SIMD なし・起動失敗時のフォールバック） |
| `node core/tests/bench_wasm.mjs` | Wasm 単体の CPU 負荷（Node） |
| `node core/tests/bench_ab.mjs` | 旧エンジンとの CPU 負荷比較（Chromium、時間がかかります） |

## 計測結果（M4）

同じ Chromium（ヘッドレス、48kHz）で、N ボイスを鳴らし続けたときの CPU 負荷です（1 コアに対する割合。100% を超えるとリアルタイムで再生できません）。`node core/tests/bench_ab.mjs` で再現できます。

| 構成 | 旧エンジン（Tone.js） | 新コア（C++ / Wasm） | 比 |
| --- | --- | --- | --- |
| 1 ボイス | 38.0% | 1.7% | 約 22 倍 |
| 5 ボイス（ELITA 上限） | 35.3% | 1.6% | 約 22 倍 |
| 5 ボイス、unison 3 | 73.5% | 2.9% | 約 25 倍 |
| 16 ボイス、unison 4 | 247.0% | 9.9% | 約 25 倍 |
| 32 ボイス、unison 8（Synth1 の最大） | 1608.0% | 34.2% | 約 47 倍 |

- **M3（エフェクト込み、Wasm 単体）:** 32 ボイス・unison 8 でエフェクトなしが 14.4%、ph.4 + chorus x3 + stereo delay を全てオンにして 15.3%、1 ボイスにエフェクトだけで 2.3% です（`bench_wasm.mjs`、1 コア換算）。エフェクトの追加分は 1 コアの約 1% で、旧エンジンの Chromium 上での再測定（`bench_ab.mjs`）は M3 では行っていません。
- 初期化にかかる時間も、旧エンジンは 0.5〜11 秒（ボイス数に比例）、新コアは約 0.05〜0.08 秒です。
- Wasm 単体（Node）の測定では、32 ボイス × unison 8 で 1 コアの約 15%（5 ボイス・unison 3 で 1.8%）です（`bench_wasm.mjs`）。M1 の 14% から微増にとどまるのは、stereo width（既定で有効）の第 2 セットと、LFO・ラダー等の追加分を含めた値です。
- 旧エンジンは M1 時点で LFO・エフェクト等も含むグラフを持ちますが、旧エンジン側のこれらの項目はオフにして測定しています。新コアは M2b までの機能（ボイス部は全て）を含みます。M3 でエフェクトが入ると数値は増えます。
- 上の表は M4（エフェクトの有効化とリミッターを含む全機能）での Chromium 上の測定です。同じ測定でも旧エンジン側の値は実行ごとに 10〜50% 程度ばらつきます（M2b の測定では 1 ボイスが 32.5%、32 ボイスが 1579%）。新コアは M1 の 32 ボイスで 23.4% でしたが、M2 以降の機能（stereo width、リミッターなど）が増えた分と測定のばらつきが重なって 34.2% です。比は約 22〜47 倍です。

## 音の一致（M3）

`test_ab.mjs` の 79 ケース（M3 でエフェクトの 23 ケース〔ディストーション 3 種、deci.、r.m.、comp.、フェイザー、chorus x1〜x4、delay の各タイプ・spread・tone、unison との組み合わせ〕を追加。M2a で sub / ring / sync / FM と unison・stereo width の組み合わせ 16 ケース、M2b で LFO・Mod Envelope・ラダー・slop・pitch layer の 22 ケースを追加）で、旧エンジンと同じパッチ・同じ音を弾かせ、波形を比較しています（全て合格）。波形の相関は 0.9986〜1.0000、レベル差は最大 0.7 dB、エンベロープ差は最大 1.7 dB（位相再起動の #91 のケース。他は 0.4 dB 以内）です。ノイズは乱数のため、レベルと帯域スペクトルで比較しています。

例外として、**2700 セントを数 ms で動かす急峻なピッチスイープ**（Mod Envelope → OSC2 pitch の速いアタック、LFO の saw down）は、波形の誤差が大きくなります（-4.9 / -17.6 dB。他は -20 dB 以下）。音量・エンベロープ・ピッチの軌跡は一致し、残るのは約 0.03〜0.08 周期の一定の位相差です。旧エンジンの Tone でエンベロープと発振器の開始が数サンプルずれることに由来し、コア側の不具合ではないと判断しています。テストではこの 3 ケースだけ遅れを固定し、許容値を個別に緩めています（`test_ab.mjs` のコメント参照）。

## 旧エンジンとの意図的な差

- **発音の遅れ（M3 で訂正）:** 旧エンジンの約 6 ms の遅れは、Tone のスケジューリングではなく、最後段のリミッター（`DynamicsCompressorNode`）の先読み 6 ms でした。新コアも同じ先読み 6 ms を再現しているため、M3 以降は A/B の遅れが 0 になります（M1〜M2 の記述は誤りでした）。先読みはコアの設定 11（`ec_set_cfg(11, 秒)`、0〜20 ms）で変えられ、0 にすると遅れもなくなります。既定は旧エンジンと同じ 6 ms で、Settings には出していません。6 ms 以外の値は A/B では検証していません（出力が有限であることだけ確認）。
- **フェイザー:** 旧エンジンは `Tone.LFO` を `Filter.frequency` に繋ぐため、Tone が信号の元の値（600 Hz）を上書きし、スイープは 0 Hz を中心に ±depth になります（負の周波数は 0 に丸められます）。新コアもこの挙動を再現しています（A/B で確認）。
- **位相の再起動（#91）:** 旧エンジンは発振器を 3ms 遅らせて再開します。新コアは即座に再開します。
- **パルス波:** 旧エンジンは帯域制限なし（エイリアシングあり）。新コアは帯域制限しており、折り返し雑音がありません。位置と幅は一致させています。
- **ノイズ:** 乱数のため波形は一致しません。レベルと帯域スペクトルは一致させています。

- **unison stereo width:** コアの処理はモノラルのまま。旧エンジンの左右 2 系統を、ボイス内でモノに畳み込む係数 ((cos θ + sin θ)/2) で再現しています（A/B で一致）。ボイス内ソフトクリップの左右別処理の差は無視しています。
- **unison pitch layer（#85）:** 値が 24（初期値）以外のとき、第 3 のコピー群（`phU1` / `phU2`）を追加し、全 OSC レベルを 1/√2 にします。ベンチマーク（`bench_wasm.mjs`）はパネルの初期値 #85 = 24 を設定して測定しています（以前はこの設定がなく、pitch layer が有効な状態で測っていました）。

## 設計メモ

- **Tone の挙動の再現:** エンベロープは Tone の「指数アプローチ + 90% 以降は線形」、フィルター周波数エンベロープは Hz の線形補間（`exponent: 1`）、FatOscillator は `-6 - count×1.1 dB` と位相の等間隔配置（遅れ方向）、ノイズは Tone の 2ch バッファを mono に畳んだ -3.01dB、のように、旧エンジンの副産物まで含めて再現しています。
- **Biquad:** Web Audio 仕様（現行 Chromium）の式です。`Q_OFF`（-5dB）の補正を含む既存の調整値がそのまま使えます。
- **Offline での注意:** OfflineAudioContext では、port メッセージがレンダリング開始に間に合わないことがあるため、初期状態とタイマー付きイベントは `processorOptions` で渡します（`attach(ctx, destination, extraEvents)`）。
