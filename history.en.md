# Update history

[日本語版 / Japanese: history.md](history.md)

When the version is raised, what was done is added here (newest first).
Claude decides when to raise the version number and asks for confirmation first. The version shown on screen is the version label and the UPDATED date in `index.html`.
The in-app "UPDATED" window reads the Japanese `history.md`; this file is the English copy.

## ver 0.5.61 — 2026.10.30

The results of the single-parameter Synth1 AU measurement (OpenCode, `measure_kit`) are now in the numbers. ELITA's own output is run through the same fit script (`fit_cutoff.py`) and matched to the AU values. The `#29` and `#30` changes can make the output up to about +7 dB louder (to match the AU's reference).

- **`#19` cutoff table**: now 17 points in steps of 8 (frq 32..112 within 3 % of the AU). frq 0..24 cannot be estimated on the ELITA side, so those are provisional. The ceiling (`CUT_MAX`, 12.3 kHz) is unchanged, as measured. The ladder table was scaled by the same ratios.
- **`#21` zero point is 64, 0.1495 oct per step** (0.5.60 had 63 / about 0.156 oct). The `#19` table had been tuned about +0.156 oct too bright to compensate, so both were fixed together.
- **`#22` key track**: pivot note is C3 (C4 was wrong). Slope at #22 = 127 is 0.99 below / 0.90 above the pivot (oct per oct), compressed for smaller values (below (v/127)^0.66, above 0.9 (v/127)^0.85).
- **`#29` gain**: no longer linear; the AU dB table (127 = 0 dB, 64 = -12.3 dB, 32 = -22.4 dB). The level at 92 is as before.
- **`#30` velocity**: dB = -(1 - vel) x (sens / 127) x 29.5.
- **`#35` delay time**: a 20-step note-value table (0.1 .. 2000 ms at 120 BPM). Tempo sync is not verified.
- **`#83` spread**: the sides were swapped (0 delays the right channel, 127 the left). 64 is zero, +-100 ms on an exponential curve.
- **LFO** (from OpenCode's re-check `VERIFY_v0.5.60b`; the earlier "destination / wave lists disagree" was a mix-up between the test-case state numbers and the real values):
  - Wave numbers: `0 = saw down`, `1 = tri`, `2 = pulse`, `3 = s&h`, `4 = saw up`, `5 = sine`. There is no smooth `rnd`. `0` inverts the send to get a falling saw.
  - Speed (`#43` / `#48`, free run): the measured table, 0.29 .. 94.7 Hz (it was 0.1 .. 20 Hz, about 5 times too slow at the fast end).
  - Pitch depth (`#44` / `#49`): the measured table (8 -> 132, 64 -> 1869, 127 -> 6860 cents p-p).
  - Destination 7 (pan) is now implemented (a Panner per voice; depth `#44 / 100` is provisional).
- **`#98` tone**: 1-pole LP / HP (`Tone.OnePoleFilter`) with the measured 3 dB points (LP 0 -> 186 Hz .. 48 -> 5.9 kHz, HP 80 -> 40 Hz .. 127 -> 6.6 kHz).
- **Bug fix (same version):** `Tone.OnePoleFilter`, used for the `#98` 1-pole filters, is unstable above fs / pi (about 14 kHz at 44.1 kHz); with the delay ON the output turned into NaN and went silent. Replaced it with a bilinear one-pole filter.
- **Bug fix (same version):** the LFO pitch depth table (`#44` / `#49`) was log-interpolated, which gives NaN for depths 0..7. In 63 factory patches that use an LFO (Piano, Hit, the guitars, basses, strings...) only the first voice got the patch and the other voices kept the previous one (only the first key press sounded right). It is linear now, and one failing voice can no longer leave the others on the old patch. Checked on all 128 factory patches: every voice has the same settings.
- **Ladder table** is back to the directly fitted measurements (no biquad ratio scaling needed).
- Not yet applied / verified: LFO filter / p/w / FM depth (the filter's +-4800 cents is suspected to be too deep), tempo sync for LFO and delay, `#19` frq 0..16, `#24` velocity tracking, res / LP12 / HP / BP dependence, LFO key sync, and the 128-patch comparison (including the +3.3 dB `#29` and +4.0 dB `#30` headroom change).
- Check: ELITA's `#19` / `#22` / `#29` measured the same way as the AU: cutoff within 2 % (`#22` within 7 %), gain within 0.1 dB. The 128 factory patches have not been compared again yet.

## ver 0.5.60 — 2026.10.28

The interpretation of .sy1 values was reviewed against the Synth1 v1.12 manual's parameter tables and the values of the 128 factory patches, and the mismatches found were fixed (checklist: `audit_sy1_interpretation.md`).

- **The filter envelope amount (`#21`) is now bipolar (fixes a regression in 0.5.59).** In Synth1 `#21` is bipolar, with 63 as zero (manual: -63 to +64) and about +-10 oct (AU measurement). 0.5.59 added the legacy conversion (`63.5 + old / 2`) but the engine still read the value as unipolar (`v / 127 x 8.64 oct`), so the 16 patches whose old value was 0 (no envelope) opened by about 4.3 oct at the converted 63 (spectral centroid of 054 Voice 1.0 -> 4.0 kHz, 053 Choir 0.34 -> 1.0 kHz, 020 Church Organ 0.36 -> 0.76 kHz; 0.5.58 did not do this). The envelope range is kept within 28 Hz to 12.3 kHz, and negative values (the filter closing) now work.
  - Note: patches where the error of the base cutoff table `#19` (frq 0-48 are extrapolated) was being made up by `#21` (the Piano `002` and so on) get darker for now. This is a known state until `#19` is measured (0.5.59 did not aim at that compensation; it matched by chance through conversion plus the unipolar reading).
  - The now unused `CUT_OCT` was removed.
- **The arpeggiator type (`#31`) follows the manual order.** 1 = up/down, 2 = up, 3 = down, 4 = random (before: 1 = up, 2 = down, 3 = up/down, two of them wrong). 6 of the 8 factory arpeggio patches (`#31` = 1) now play up/down. The order of the panel button was changed to match.
- **The delay tone (`#98`) is bipolar with 64 = flat.** Below 64 a low-pass on the wet signal (down to about 1.5 kHz), above 64 a high-pass (up to about 800 Hz); the default is 64. Before, 64 put a low-pass at about 5.4 kHz and darkened the delay of patches saved by Synth1 as ver=113 (`#98` = 64). Factory patches have no `#98`, so they use the default 64 (flat). The cutoff ranges are provisional.
- **The delay spread (`#83`) shifts the channels by up to +-100 ms (64 = none, default 66).** Before, 0-127 stretched the right delay by x1 to x1.5, which made the right channel about 26% longer in ver=113 patches (66). The curve is provisional.
- **The range of the osc1,2 fine tune (`#72`) is +-62 cents** (manual: -62 to +61; before +-100 cents). All factory patches are 64, so factory sounds do not change.
- The delay line of the debug view (`ELITA.debug.graph()`) now shows the left / right delay (ms) and the tone LP / HP.
- Regression: all 128 factory patches loaded and played with no errors, and the conversion of the 6 patches re-saved by the real Synth1 still agrees.
- Next (not started): stop comparing whole patches and measure one parameter at a time on the AU (`#29` gain, `#22` key track, `#19` (0-127), `#35` delay time, the LFO destinations and waveforms, the cents of `#3` / `#72` / `#76`, `#5` mix, `#45` FM, the attack curve). For `#29`, a patch with #29 = 92 is 1-3 dB quieter than the AU and a patch with #29 = 52 is 6-8 dB louder, so the curve may not be linear.

## ver 0.5.59 — 2026.10.28

- **Patches of ver 105 and below are now converted on load, as the real Synth1 does.** Synth1 converts some values of old patches (all 128 factory patches are ver=105) into its internal form when it loads them, and writes ver=113 when you save. ELITA-1 used the raw values, so it sounded different from the real thing (pianos, drums and so on).
  - Measurement: I compared 6 factory patches re-saved by the real Synth1 (001 / 002 / 004 / 113 / 115 / 118) with their original values and derived the rules. With the same rules in ELITA, reloading all 6 gives the real Synth1's saved value for all 8 affected numbers (checked).
  - `#21` filter env amount: `floor(63.5 + old / 2)` (31 -> 79, 127 -> 127). `#37` delay d/w: `floor(old / 2)`. `#16 / #18 / #26 / #28` decay / release time: interpolated through 17 measured points (102 -> 97, 64 -> 62, 19 -> 6; the ends 0 and 127 are assumed). `#55` chorus feedback: 0 -> 64. `#54` chorus rate: 64 -> 50 (one observation each for the last two).
  - Versions 106-112 are left as they are, because it is not known whether they are converted (re-saving a 106 / 108 patch in the real Synth1 would tell). After loading, the display says "(converted to ver 113 values)".
  - Export still writes ver=113. With the conversion in place, a .sy1 exported after loading a ver=105 patch now matches what the real Synth1 saves (before, unconverted values were labelled ver=113).
  - Effect: the harmonic balance of the Piano (`002`) is now about 11 dB from the converted real-Synth1 AU render on average, down from about 20 dB (the AU render itself agrees with the real recording to 2-4 dB). Honky Piano (`004`) got a little worse by this measure, about 4 dB -> about 7 dB (see the open items below).
  - Note: `#37` d/w is halved, but ELITA's d/w curve (`v / 127`) is still a guess; the delay of the factory patches now sounds at about half the former amount (the real Synth1's new d/w curve is not measured). `#54` lowers the chorus rate from about 2.1 Hz to about 1.3 Hz.
- **The filter envelope peak is now stopped at 12.3 kHz.** Band-pass / high-pass patches with a large envelope amount (the hat `113`: BP, `#21` = 127) put the cutoff at 247 Hz x 400 = about 98 kHz, above half the sampling rate, and went silent (since 0.5.57; 113 is the only factory patch). The amount is limited so that the peak does not exceed 12.3 kHz, which is the ceiling measured on the Synth1 AU. 113 now sounds (peak 3e-6 -> 0.15). Low-pass patches whose peak was above 12.3 kHz (16 patches) lose a little of the very top.
- Regression: all 128 factory patches loaded and played with no errors, and every envelope time is finite.
- Tidy-up: the filter envelope amount calculation, which was written in two places, is now one `setAmt()`; the unused `ELITA.legacyConvert` was removed (no change in sound).
- **What the comparison showed (no code change)**: against the converted Synth1, the provisional base-cutoff table (`#19`, frq 0-48 extrapolated) is a bigger error than the `#21` formula or the sweep shape. Reading `#21` as "64-centred +-10 oct on the converted value" is consistent, but the Piano with `#19 = 44` fits best with a base about 1.5 octaves higher. The experimental sweep switch (octave-linear) is in a separate zip (`experiment_sweep.zip`) and is not in the main tree.
- Open: measure `#19` (frq 0-48) on the AU (`#19` = 0-80 with `#21` = 64), the shape of the filter envelope sweep (Hz-linear or octave-linear), how `#21` should be read (unipolar or bipolar), the real curves of `#37` / `#54`, and whether ver 106-112 are converted.

## ver 0.5.58 — 2026.10.27

- **The decay / release times of the amp and filter envelopes now follow Synth1 measurements.** Patches with S = 0, where the decay is the sound (pianos, guitars), faded several to more than ten times faster than on the real thing (a piano with D = 102: about 7.5 s on Synth1, about 1.4 s in ELITA).
  - Measurement (OpenCode rendered the Synth1 Audio Unit offline; saw wave, S = 0, filter fully open): the time for the level to fall 60 dB from the peak is 0.03 / 0.07 / 0.20 / 0.58 / 1.7 / 5.0 / about 16 / about 46 s for D = 16 / 32 / 48 / 64 / 80 / 96 / 112 / 127. Decay and release gave the same curve. I measured the supplied wav files again myself and confirmed the same values.
  - Fit: `T60(v) = 0.0088 × exp(0.0665 v)` s (−15% to +8% for v = 8–127). `T60()` / `tEnv()` in `calib.js`.
  - Tone.js's exponential envelope reaches −60 dB after `6.908 × ln(t + 1) / ln(200)` s for the time t that is set (checked by rendering). So the value of `time()` was never the real decay time, and the gap grew with D (D = 127 should have been 8 s by `time()` but was about 2.8 s). The new setting inverts this relation and passes `t = exp(T60 × 0.7669) − 1`.
  - ELITA measured again with the same neutral patch (time to fall 60 dB, ratio to Synth1): D = 16 → 1.00, 32 → 0.86, 48 → 0.85, 64 → 0.98, 80 → 1.08, 96 → 1.03, 112 → 15.1 s (0.96), 127 → 41 s (0.90). Before (0.5.57) it was 0.04–0.18.
  - Regression: all 128 factory patches loaded and played without errors, and all envelope times are finite. Strings (`001`, `090`) and MuteTrumpet (`060`) keep the same level over time within ±1 dB. Piano (`002`) now falls about 12 dB in 1.5 s (before: 58 dB), and Glocken (`010`) and Honky Piano (`004`) ring longer.
  - Attack (A) is a different curve (measured: A = 64 / 80 / 96 / 112 reaches −1 dB of the peak in 0.11 / 0.43 / 1.7 / 6.9 s) and its shape is unknown, so it is unchanged. The modulation envelope (`#12` / `#13`) is also unchanged because it has not been measured.
  - Assumptions: the filter envelope (`#16` decay, `#18` release) uses the same curve as the amp (only the amp was measured). The shape of the decay toward S > 0 (the time constant of the exponential toward S) is extrapolated from the S = 0 measurement.
- The debug view (`ELITA.debug.graph()`) now shows the amp decay / release as the number of seconds to fall 60 dB (Tone's internal values are huge and confusing).
- Still open: the dark Piano caused by the provisional filter frequency table (frq 0–48) is not addressed here. It needs Synth1 recordings (frq 0–48).

## ver 0.5.57 — 2026.10.26

- **Added "Ladder bass feedback" to the Ladder** (Settings): Full (default, as before) / High-passed (150 Hz). The low end is removed from the resonance feedback (feedback = output − its one-pole lowpass), so the bass thins out less at strong resonance. The structure was taken from the filter of js303 (a TB-303 clone) as an idea; no code or coefficients were copied. The implementation keeps the delay-free (ZDF) feedback solution and uses the previous sample only for the state of the lowpass.
  Measured (Node, ladder alone, 48 kHz): 55 Hz sine, cutoff 800 Hz, k = 3.6: gain Full −13.2 dB → High-passed −6.1 dB. No difference at k = 0 (−0.08 dB), and none at 440 Hz (−13.1 → −13.0 dB). No divergence with per-stage tanh either. **Not compared with Synth1** (resonance has not been recorded from Synth1), so whether it gets closer to the real thing is unconfirmed.
- **Added "Cutoff curve" to Settings**: Table (default, as before) / Smooth (a monotone cubic through the measured points). The two differ by at most 0.034 octave (about 2%) over the whole range, which is hard to hear. Both pass exactly through the measured points (frq 64–112). frq 0–48 stay provisional because there are no Synth1 recordings yet.
- **Why measurements are needed**: the Synth1 calibration patches (`calib_filter/`) are at hand, but the recorded wav files are not. Refitting the whole range with a polynomial needs recordings of frq 0 / 16 / 32 / 48 / 127 and of different resonance values.
- Updated the README (Japanese and English).

## ver 0.5.56 — 2026.10.23

- **Added Key config** ("Key config…" in Settings, `js/keymap.js` and `js/keyconfig.js`): the formerly fixed PC key assignments can now be changed. This covers all 25 keys, octave down / up, next / previous patch (↑ / ↓) and all notes off. Click a key of the diagram and press a key to assign it; for notes it moves on to the next key by itself. Esc stops, Delete / Backspace clears. Pressing a key that is in use moves it. Unusable keys (modifiers, Esc, Tab, Enter, Space, Backspace, Delete, F keys, lock keys) are rejected.
- Two presets: ELITA (default, the same layout as before) / DAW style (Z S X D C V … and Q 2 W 3 E …, octave on ← →). Reset and export / import (.json) are included. The layout is saved in the browser (`elita1-keys`).
- Keys are identified by `KeyboardEvent.code` (the physical key), so keyboard layout and Japanese IME state do not matter (`key=ち` with `code=KeyA` is recognised). Labels on screen use the character of the real layout where the browser supports it, otherwise they are derived from the code.
- **Behaviour change**: while Settings, theme or Key config (any dialog) is open, PC keys no longer play notes or switch patches (before, they did).
- Tests (Playwright): default layout unchanged / ↑ ↓ switch patches / learn mode, key stealing, Space rejected, Esc, all-notes-off assignment / kept after reload / DAW preset / export and import. No errors.
- Limits: 25 assignable keys (same as the on-screen keyboard). Some special keys may be taken by the browser.
- Small fixes from an external review (opencode / DeepSeek): `POLY` undefined in `debug.js` (the note-on log did not appear with debug on) now `S.POLY`; losing window focus also clears the record of held keys (the next press after releasing was silent); key names like `constructor` in an imported JSON no longer misbehave; a guard in the Settings button handler. The sound is unchanged.
- Updated the README (Japanese and English) and the screenshots. Added `docs/keyconfig.png`.

## ver 0.5.55 — 2026.10.16

- **Added "Voice limits" to Settings**: ELITA (default: 5 voices, unison up to 3) / **Synth1 spec** (the ranges of the real panel: the voice count follows the patch's poly number (`#94`, 1–32) and unison goes up to 8). While Synth1 spec is on, the screen says so: a yellow "SYNTH1 SPEC MODE" badge in the title bar, "(Synth1 spec)" next to the voice counter at the keyboard, and the settings button lit yellow. The choice is saved in the browser.
- The voice count can now change at run time (before, 5 voices were created at start-up and fixed): voices are added up to the needed number, and when the count goes down the extra voices are removed from the audio graph (idle voices keep their oscillators running). Added `Voice.dispose()`. `S.POLY` / `S.UNI_MAX` are the current limits, readable through `ELITA.engine.POLY` / `unisonMax` / `limits`.
- Measurement (relative values with this container's software audio): ELITA (5 voices) and Synth1 spec with poly 16 run in real time; with poly 32 the audio clock advances at only about half of real time even when idle. So poly 32 with unison 8 is very heavy, and what to expect on a real machine has not been measured. Changing the voice count, unison 8 (fat waves ×8) and 24 simultaneous notes with poly 32 all worked without errors.
- Still not supported: unison for pulse waves, even in Synth1 spec (Tone.js fat oscillators have no pulse). Stopping idle voices to reduce the load is a task for later.
- Updated the README (Japanese and English) and the screenshots. Added `docs/synth1mode.png`.

## ver 0.5.54 — 2026.10.15

- **Added a Settings window** (the "settings" button below Patch Parameters, `js/settings.js`): lets you choose how the engine behaves. The choice is saved in the browser. **`?filter=ladder` is removed**; use "Filter engine (Biquad / Ladder)" instead. All defaults give the same sound as before.
- **Added "Ladder character" to the ladder filter**: Soft limit (as before) / Per-stage tanh (tanh on the input and on every stage, ARGON style). Measured: with a small signal and resonance 0 the difference is −0.02 dB (practically the same). Near maximum resonance, Per-stage tanh levels off naturally (k = 3.6, amplitude 0.5: 10 dB lower, no runaway). CPU is about twice that of Soft limit (around 3% for 5 voices, rough estimate in Node). Note: the S term of ARGON's ladder (computing the contribution of the stored states to the output first) is already the structure ELITA-1's ladder uses.
- **PolyBLEP / PolyBLAMP for hard sync (optional)**: "Hard sync anti-aliasing" in Settings. Corrects the step at each sync reset, the edges of the slave wave and the corners of the triangle wave. With a non-integer-period signal, the power of components that are not harmonics (aliasing) dropped by about 15–20 dB for saw, pulse, triangle and sine alike. The output is delayed by 1 sample. Off by default. Note: with it off, the old code has a quirk where the slave phase right after a sync reset is off by one sample's worth (f2); it is left as it is so that the default sound does not change. With it on, the reset happens at the correct position.
- **Per-voice variance and slow drift (optional)**: "Voice variance" and "Slow drift" in Settings. Adds a fixed offset per voice number (about 2 / 5 / 9 cents) and a random wander with a time constant of about 3 s (updated every 100 ms) to pitch (OSC1 / OSC2 / sub) and cutoff. It adds to LFO, FM and bend, so they keep working. Off by default.
- **Tidied Patch Parameters**: removed the "copy text" button. The "export .sy1" button, which wrapped onto two lines, is now on one line (button text no longer wraps).
- Added English versions: `README.en.md` and `history.en.md` (language links at the top of each file). The in-app "UPDATED" window shows the Japanese `history.md`.
- Updated the README (Settings, the copy text description). Replaced the screenshot with the current screen (ver 0.5.54) and added images for Settings, the theme window and MIDI input (`docs/settings.png` / `theme.png` / `midi.png`). Fixed outdated statements about the voice count (5), the current state of filter tuning, the file list and the future candidates. Added English versions (`README.en.md`, `history.en.md`).

## ver 0.5.53 — 2026.10.14

- **Tuned the filter to Synth1 recordings**: the filter frq → cutoff mapping is now a log-interpolated table through the measured points (frq 64 ≈ 610 / 80 ≈ 1360 / 96 ≈ 3450 / 112 ≈ 10000 Hz; frq 0–48 are provisional extrapolated values). The per-stage Q at resonance 0 is about −5 dB, which softens the knee (Tone's Q cannot be negative, so the offset is set on the internal biquads). Overall a little darker, and the effect of frq is closer to Synth1.
- **Split engine.js by function** (the sound does not change): `calib.js` (calibration values, curves, POLY / UNI_MAX, the shared state `ELITA.core`) / `worklets.js` / `voice.js` (`Voice.apply` is split into three stages: OSC, filter, LFO/modulation) / `fx.js` / `notes.js` (including the arpeggiator) / `debug.js` / `engine.js` (start-up, global update, public API). Only `<script>` lines were added to `index.html`, and the public API (what is used from `ELITA.engine` / `ELITA.debug` / `ELITA.midi`) is the same. A sweep of the 128 presets and a render of the calibration patches confirmed it is equivalent to before the split.
- **One entry point for parameters** (against state mismatches): the only true state is `ELITA.params`. Added `ELITA.setValue(no, v)` (clamp the value → update the knob → update the engine); MIDI and the Patch Parameters input boxes now just call it. Values are clamped to knobs 0–127, switches 0–1, number boxes min–max, so an out-of-range value can no longer give "display 127, engine 200". `ELITA.check()` checks that the display and the values agree (it can also be used after loading a patch). All 128 standard patches agree, and the sweep is unchanged.
- **Code check and cleanup** (the sound does not change): removed unused variables (`mono` in `debug.js`, `flash` and `t` in `midi.js`, `L` and `X` in `params.js`, `P` in `fx.js`). The arpeggiator line in the debug view said "not implemented"; it now shows the actual settings (type / range / beat / gate).
- **Experimental: ladder filter (4 poles, 24 dB/oct)**: the default is still the previous filter. Open with `?filter=ladder` in the URL (or use `ELITA.engine.filterMode('ladder')` / `('biquad')` in the console) to switch. Fit to the Synth1 recordings (frq 64–112, harmonics at A2/A3/A4): ladder 0.29 dB (mean error), previous 0.91 dB; the ladder fits better with one parameter fewer. A separate frq → fc table is kept (`CUT_TAB_LAD` in `calib.js`). How resonance behaves on Synth1 is not measured; the values are provisional. The average level of the 128 standard patches is about 2.7 dB lower with the ladder. Types other than low-pass 24 dB (HP / BP / 12 dB) stay on the previous filter.
- Check after adding the ladder (the sound does not change): merged the doubled cutoff-table interpolation into one (`interp` in `calib.js`) and removed public items that nothing used (`CUT_TAB` / `CUT_TAB_LAD` / `applyDelay` / `isMono` / `keySync`).
- Updated the README.

## ver 0.5.52 — 2026.10.10

- **MIDI input** (Web MIDI, Chrome / Edge): added a "MIDI ●" button and a settings panel to the right of the patch display (`js/midi.js`). You can play from a sequencer in another tab through a virtual MIDI port.
- Note / velocity, pitch bend (±1–24 semitones; a bend function was added to the engine), sustain (CC64), all notes off (CC120/123), channel selection (OMNI / 1–16).
- **CC MAP and CC learn**: defaults are CC1 → LFO1 amt, CC74 → filter frq, CC71 → filter res. Right-click a knob → "LEARN CC…" to assign any CC. reset / export / import, saved in localStorage.
- **MIDI clock sync**: computes the BPM from the 24 ppqn clock and shows it in the BPM box (on/off in the settings).
- Shows the reception status at the bottom left of the screen. `ELITA.midi.send([...])` in the console lets you test without a device.
- Updated the README.
- **Polyphony 6 → 5, maximum unison voices 4 → 3** (less CPU load; `POLY` / `UNI_MAX` in `calib.js`). Patches with unison num of 4 or more are rounded to 3.
- Internal improvements (the sound does not change): updating when a knob / CC moves went from about 11 ms to about 2.5 ms (the LFO wave and the chorus spread are now set only when they change). The oscilloscope stops redrawing while silent, and MIDI clock no longer triggers screen updates. Removed unused constants.

## ver 0.5.51 — 2026.10.10

- **Click the patch display to pick a patch from the folder directly**: clicking the patch display (LCD) at the bottom shows the `.sy1` files of the selected folder as a list (number, patch name, file name). Click to load. ↑↓ keys move, Enter confirms, Esc or a click outside closes it. "other folder…" at the end of the list lets you pick another folder. With no folder selected, it works like "folder…".
- Bug fix: fixed the error (`allOff`) that appeared when a patch was loaded before sound had started (audio not yet running).
- Updated the README.

## ver 0.5.5 — 2026.10.9

- **Added a footer**: below the oscilloscope, a thank-you to the original "Synth1" (by Daichi / Ichiro Toda) and a link to the official home page (Daichi's Lab). It also states that ELITA-1 is an unofficial look-alike with no relation to the original. The colours follow the theme.
- Added the footer elements to `index.html` and the styles to `css/params.css`.
- **LCD selection list** (version unchanged): clicking the Effect type, Tempo Delay type or Chorus type display now opens a list of choices in place, so you can pick one directly (before, you could only step through them one by one). Right-click and the wheel still switch one at a time. Esc or a click outside closes it. The colours follow the theme.
- Updated the README (acknowledgements).

## ver 0.5.4 — 2026.10.9

- **Implemented the remaining Effect types** (`#78` = 3–9).
  - **deci.** (3): sample-rate and bit-depth reduction (AudioWorklet). ctl1 = frequency, ctl2 = bits, level = mix.
  - **r.m.** (4): ring modulator. ctl1 = modulation frequency, level = mix.
  - **comp.** (5): compressor. ctl1 = compression depth, ctl2 = attack, level = balance with the dry signal.
  - **ph.1–ph.4** (6–9): 1 / 2 / 4 / 6-stage phasers. ctl1 = LFO depth, ctl2 = LFO speed, level = feedback.
- Now every type of the Effect section (`#77`–`#81`) works. The type numbers, curves and ranges are all provisional.
- Removed "(parameter list mock)" from the title tag in `index.html` (the user's version was adopted).
- **Colour theme feature** (version unchanged): 4 standard themes (Classic / Dark / Midnight / Light), a colour picker for each colour, reset, `.json` export and import, saved in the browser. Open it with the "theme" button below Patch Parameters.
  - Moved hard-coded colours into CSS variables (`style.css` / `compact.css` / `params.css` / `history.js` / `log.js`). The knobs (`ui.js`) and the oscilloscope (`scope.js`) also read the variables.
  - New: `css/themes.css`, `js/theme.js`. Two lines added to `index.html`.
- Updated the README.

## ver 0.5.3 — 2026.10.9

- **Extended OSC2 pitch (`#2`) to ±60 semitones** (64 is the centre, rounded to semitones). Supported by the 128 factory sounds (77 → +12, 89 → +24, 102 → +36). Removes the former ±24 limit and the offset where 77 became +13.
- **OSC2 fine (`#3)` is based on 66** (55 factory patches use 66). 1 cent per step (provisional).
- **Extended the Effect type to 10 kinds, 0–9** (ph.1–ph.4 are separate types). deci. / r.m. / comp. / ph.1–4 only passed the signal through at this point.
- Comparison with the ChatGPT version: adopted the OSC2 pitch scale and the type range (0–9). Not adopted: the silent start-up bug (distortion curve NaN), the drive amount having no effect, the #3 base of 81 and the asymmetric #72 curve (no basis).
- Updated the README.

## ver 0.5.2 — 2026.10.9

- **Three distortions in the Effect section** (a.d.1 / a.d.2 / d.d.) implemented (`#77`–`#81`). ctl1 = drive, ctl2 = LPF, level = balance with the dry signal. Placed after the master and before the EQ. References: the official and unofficial Synth1 manuals. Ranges and curves are provisional.
- deci. / r.m. / comp. / phaser not yet implemented (turning them on only passes the signal through). Planned for the next stage.
- Added the state of the effect stages to the debug view (`ELITA.debug.graph()`).
- Updated the README.

## ver 0.5.1 — 2026.10.9

- **Phase** (`#91` osc / `#92` unison) implemented. At 0 the oscillators free-run; otherwise OSC1/OSC2/Sub start from that angle (0–127 = 0–360 degrees) on every note-on. `#92` is added to `#91` only while unison is on (provisional).
- **Unison pitch** (`#85`) implemented. When unison is on and the value is not 24, another layer of OSC1/OSC2 is added, shifted by (value − 24) semitones. The layer is created only when needed (provisional).
- **Unison pan width** (`#84`) implemented. Another set of OSC1/OSC2 is added and the two sets are spread left and right (0 = centre, 127 = full width). An approximation with two groups.
- The left and right signals were being folded down to mono along the way, so the channel count of EQ, tone, Pan, Limiter and Clip was set to 2 (the unison width now reaches the output).
- Updated the README (implemented items; only the Effect section `#77–81` and MIDI-related items remain unimplemented).
- Loading test of the 128 presets: no change in level or errors.

## ver 0.5.0 — 2026.10.8

- **Session log** added (`js/log.js`). "● log" below Patch Parameters starts recording, and "■ save log" saves `elita1-log-date.txt`. It records the notes played, knob changes, patch loads, MML, BPM, output level, errors and the final state (`.sy1` format). It is created only inside the browser and nothing is sent.
- **osc `tune` (`#72`)** implemented. 64 is the centre, ±100 cents on both OSCs (range provisional).
- **osc `det` (`#76`)** implemented. 0–127 raises OSC1 by up to +50 cents (range provisional).
- **OSC2 `track` (`#4`)** implemented. Off makes OSC2 fixed at C4 regardless of the key (pitch / fine are added).
- The screen is centred with a 10 px margin on all sides (`css/params.css`).
- Corrected the filter cutoff comment to the real range (50 Hz–20 kHz). Updated the README (log, implemented items).
- Loading test of the 128 presets: no change in level or errors.

## ver 0.4.0 — 2026.10.5

- **EQ tone** (`#60`) implemented. 64 is flat; raising it brightens, lowering it darkens.
- **Velocity** implemented. The amp vel (`#30`) and the filter vel (`#24`). The on-screen keys change strength with the height you click (weak at the top, strong at the bottom). The PC keyboard is fixed at 0.8, the same sound as before.
- **Patch export**: `export .sy1` in Patch Parameters saves the current panel as a `.sy1` in Synth1 format (`ver=113`, CRLF). Loading and exporting the 128 factory sounds gave matching values.
- **Digit-only input boxes**: only digits can be typed into the Patch Parameters values and the BPM box (BPM is an integer 40–300; only key shift allows a minus sign).
- **Update history display**: clicking "UPDATED" at the top of the screen shows the newest entry of `history.md` (you can also switch to all versions).
- **MML player** added (`js/mml.js`, `ELITA.mml.play / stop / parse`). Clicking the icon at the top left plays a short jingle with the current sound.
- Updated the README (export, MML, EQ tone, Velocity).

## ver 0.3.0 — 2026.10.5

- **Patch Parameters values are now input boxes.** Type a number and press Enter (or click outside the box) to change that parameter. ↑↓ change by ±1 (±8 with Shift), Esc cancels. Out-of-range numbers are clamped, and anything that is not a number reverts. The knob and the sound follow immediately.
- Fixed a bug where the BPM box at the bottom of the screen was not visible (`css/params.css`).
- Fixed the parameter list wrongly showing LFO tempo sync / key sync as "not used".
- Added `history.md` (the work of 0.2.0). Decided how versions are updated (Claude decides, and asks for confirmation before raising).

## ver 0.2.0 — 2026.10.5

- **Arpeggiator implemented** (`#31`–`#34`, `#59`). While ON, the held keys are played in turn in time with the beat (up / down / up&down / random, 1–4 octaves, gate). No latch.
- **Added the BPM box** (bottom of the screen, default 120). Used by the Arpeggiator, the LFO tempo sync and the Delay time.
- **LFO tempo sync / key sync** (`#67`–`#70`) implemented.
- **Delay type / spread / tone** (`#82` / `#83` / `#98`) implemented.
- Verified again with the 128 factory presets. No errors, no clipping. Confirmed the support for the OSC1 wave numbers (0 sine / 1 saw) and the Play mode numbers (1 mono / 2 legato). Added the results to the README.
- While typing in the BPM box, the PC keyboard playing keys no longer react.

## ver 0.1.0 — 2026.10.5

The first version that makes sound with Tone.js.

- Connected the Tone.js engine to the Synth1-style screen (Oscillators / LFO / Amplifier / Filter / Arpeggiator / Effect / EQ・Pan / Tempo Delay / Chorus / Voice). The knobs are managed by Synth1 parameter number.
- 6-voice poly, mono / legato, portamento, unison (up to 4).
- OSC1 / OSC2 (pulse and p/w, sync, ring, noise), Sub oscillator, FM, Mod Envelope.
- Filter (LP12 / LP24 / HP12 / BP12, key track, sat), LFO 1 / 2 (with S&H and random), Chorus, Delay, EQ・Pan.
- Loading `.sy1` patches (one file, or a folder with switching by the ↑↓ keys).
- Playing with the on-screen keys and the PC keyboard, octave switching.
- The parameter list on the right, the oscilloscope, the debug mode (shows the signal path in the console).
- Added the README.

## ver 0.0.1 — 2021.01.30

- Only the frame of the screen (no sound).
