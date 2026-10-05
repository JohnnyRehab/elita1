# 更新履歴

バージョンを上げるときは、ここに「何をしたか」を追記します（新しいものが上）。
バージョンの数字は Claude が判断して上げ、上げる前に確認を取ります。表示は `index.html` のバージョン表示と UPDATED の日付です。

## ver 0.4.0 — 2026.10.5

- **EQ tone**（`#60`）を実装。64 が平坦、上げると明るく、下げると暗くなります。
- **Velocity** を実装。アンプの vel（`#30`）とフィルターの vel（`#24`）。画面の鍵盤は、クリックした高さで強さが変わります（上が弱く、下が強い）。PC キーボードは 0.8 固定で、以前と同じ音です。
- **パッチの書き出し**: Patch Parameters の `export .sy1` で、今のパネルを Synth1 形式（`ver=113`、CRLF）の `.sy1` として保存。ファクトリー 128 音色の「読み込み → 書き出し」で値の一致を確認。
- **入力欄を数字だけに**: Patch Parameters の値と BPM 欄には、数字しか入りません（BPM は 40〜300 の整数、key shift のみマイナス記号可）。
- **更新履歴の表示**: 画面上部の「UPDATED」をクリックすると、`history.md` の最新の更新内容を表示（全バージョンへの切り替えもできます）。
- **MML プレーヤー**を追加（`js/mml.js`、`ELITA.mml.play / stop / parse`）。画面左上のアイコンをクリックすると、今の音で短いジングルが鳴ります。
- README を更新（書き出し、MML、EQ tone、Velocity）。

## ver 0.3.0 — 2026.10.5

- **Patch Parameters の値を入力欄に変更**。数字を打って Enter（または欄の外をクリック）で、そのパラメーターを変更できます。↑↓ で ±1（Shift で ±8）、Esc で取り消し。範囲外の数字は範囲内に丸め、数字以外は元に戻します。つまみと音にもすぐ反映されます。
- 画面下の BPM 欄が見えなくなっていた不具合を修正（`css/params.css`）。
- パラメーター一覧で、LFO の tempo sync / key sync が「not used」と表示されていた誤りを修正。
- `history.md` を追加（0.2.0 の作業）。バージョン更新の運用を決定（Claude が判断し、上げる前に確認する）。

## ver 0.2.0 — 2026.10.5

- **Arpeggiator を実装**（`#31`〜`#34`, `#59`）。ON の間、押している鍵盤を拍に合わせて順に鳴らします（up / down / up&down / random、1〜4 オクターブ、gate）。ラッチはなし。
- **BPM 欄を追加**（画面下、既定 120）。Arpeggiator、LFO の tempo sync、Delay の時間に使います。
- **LFO の tempo sync / key sync**（`#67`〜`#70`）を実装。
- **Delay の type / spread / tone**（`#82` / `#83` / `#98`）を実装。
- ファクトリープリセット 128 音色で再検証。エラーなし、音割れなし。OSC1 の波形番号（0 sine / 1 saw）と Play mode の番号（1 mono / 2 legato）の裏付けを確認。README に結果を追記。
- BPM 欄に入力中は、PC キーボードの演奏キーが反応しないように変更。

## ver 0.1.0 — 2026.10.5

Tone.js で音が出る最初のバージョン。

- Synth1 風の画面（Oscillators / LFO / Amplifier / Filter / Arpeggiator / Effect / EQ・Pan / Tempo Delay / Chorus / Voice）に Tone.js のエンジンを接続。つまみは Synth1 のパラメータ番号で管理。
- 6 ボイス・ポリ、mono / legato、portamento、unison（最大 4）。
- OSC1 / OSC2（pulse・p/w、sync、ring、noise）、Sub オシレーター、FM、Mod Envelope。
- フィルター（LP12 / LP24 / HP12 / BP12、キートラック、sat）、LFO 1 / 2（S&H・ランダム対応）、Chorus、Delay、EQ・Pan。
- `.sy1` パッチの読み込み（1 ファイル、フォルダ指定と ↑↓ キー切り替え）。
- 画面の鍵盤と PC キーボードでの演奏、オクターブ切り替え。
- 右側のパラメータ一覧、オシロスコープ、デバッグモード（コンソールで音の経路を表示）。
- README を追加。

## ver 0.0.1 — 2021.01.30

- 画面の骨組みのみ（音は出ない）。
