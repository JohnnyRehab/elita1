# Update history

[日本語版 / Japanese: history.md](history.md)

When the version is raised, what was done is added here (newest first).
Claude decides when to raise the version number and asks for confirmation first. The version shown on screen is the version label and the UPDATED date in `index.html`.
The in-app "UPDATED" window reads the Japanese `history.md`; this file is the English copy.

## ver 0.5.56 — 2026.10.23

- **Added Key config** ("Key config…" in Settings, `js/keymap.js` and `js/keyconfig.js`): the formerly fixed PC key assignments can now be changed. This covers all 25 keys, octave down / up, next / previous patch (↑ / ↓) and all notes off. Click a key of the diagram and press a key to assign it; for notes it moves on to the next key by itself. Esc stops, Delete / Backspace clears. Pressing a key that is in use moves it. Unusable keys (modifiers, Esc, Tab, Enter, Space, Backspace, Delete, F keys, lock keys) are rejected.
- Two presets: ELITA (default, the same layout as before) / DAW style (Z S X D C V … and Q 2 W 3 E …, octave on ← →). Reset and export / import (.json) are included. The layout is saved in the browser (`elita1-keys`).
- Keys are identified by `KeyboardEvent.code` (the physical key), so keyboard layout and Japanese IME state do not matter (`key=ち` with `code=KeyA` is recognised). Labels on screen use the character of the real layout where the browser supports it, otherwise they are derived from the code.
- **Behaviour change**: while Settings, theme or Key config (any dialog) is open, PC keys no longer play notes or switch patches (before, they did).
- Tests (Playwright): default layout unchanged / ↑ ↓ switch patches / learn mode, key stealing, Space rejected, Esc, all-notes-off assignment / kept after reload / DAW preset / export and import. No errors.
- Limits: 25 assignable keys (same as the on-screen keyboard). Some special keys may be taken by the browser.
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
