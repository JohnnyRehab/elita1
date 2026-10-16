# ELITA-1

[日本語](README.md) | **English**

A free synthesizer for auditioning Synth1 patches (`.sy1`) in the browser.
The panel is built with NexusUI.js and the sound with Tone.js (Web Audio).

> **This is not a reproduction of Synth1.** The internal structure (OSC → Filter → Amp, LFO, Mod Envelope, effects) follows Synth1, but the mapping from knob values to sound includes guesses, so it will not sound the same as Synth1. It is meant for hearing the general character of a patch.
> This is an unofficial project and has no connection with the author or distributor of Synth1.

Current version: **ver 0.5.55** (see [history.en.md](history.en.md) for what changed)

![ELITA-1](docs/screenshot.png)

| Settings | Theme | MIDI input |
| --- | --- | --- |
| ![Settings](docs/settings.png) | ![Theme (Dark)](docs/theme.png) | ![MIDI input](docs/midi.png) |

When "Voice limits" in Settings is set to "Synth1 spec", a yellow "SYNTH1 SPEC MODE" badge appears in the title bar (image below).

![Synth1 spec mode](docs/synth1mode.png)


## Features

- A Synth1-style panel (Oscillators / LFO / Amplifier / Filter / Arpeggiator / Effect / EQ·Pan / Tempo Delay / Chorus / Voice). A compact version without the MIDI section
- 5-voice polyphony (mono / legato, portamento and unison are supported; unison is limited to 3 voices per oscillator)
- Loads `.sy1` patches (a single file, or pick a folder and switch with the ↑↓ keys)
- Play with the on-screen keyboard and the PC keyboard (with octave shift). Can also be played from external MIDI devices and sequencers (MIDI input, CC learn, clock sync)
- Oscilloscope display of the output waveform
- **Settings**: choose the voice limits (ELITA / Synth1 spec), the filter engine (Biquad / Ladder), hard-sync anti-aliasing (PolyBLEP), and per-voice variance and drift (see "How it works" below)
- **Themes**: 4 colour themes, with per-colour editing, export and import
- **MIDI input** (CC learn, BPM sync from MIDI clock), session log, and `.sy1` export
- Click "UPDATED" at the top of the screen to see the latest entry of `history.md` (`show all` for the whole history). The in-app viewer shows the Japanese `history.md`; the English version is [history.en.md](history.en.md).
- On the right, a text list of every parameter of the patch (changed items are highlighted, `changed only` filters the list). **The value fields are input boxes: type a number and press Enter (or click outside the field) to change that parameter.** ↑↓ change it by ±1 (Shift: ±8), Esc cancels. Numbers outside the range are clamped, and only digits can be typed (no letters or symbols; the minus sign is allowed only for key shift). The knobs and the sound follow immediately
- A debug mode that shows the signal path in the console

## Usage

### Starting

No build is needed. Some browsers restrict pages opened directly from `file://`, so a simple local server is recommended.

```bash
cd elita1
python3 -m http.server 8000
# open http://localhost:8000/index.html in the browser
```

Tone.js and NexusUI are bundled in `js/`, so it works without a network connection.

Click once inside the page or press a key to start the audio (a browser autoplay restriction).

### Playing

| Action | Effect |
| --- | --- |
| Click a key on the on-screen keyboard | Plays a note |
| `A W S E D F T G Y H U J K O L P` | Keyboard (one and a half octaves from C) |
| `Z` / `X` (or the `<` `>` buttons) | Octave down / up (the C3–C5 label changes) |

### Loading patches

- The `file` button, or drag and drop a `.sy1` file, loads one patch
- The `folder…` button picks a folder containing `.sy1` files (top level only, in name order)

Keys after a folder has been picked:

| Key | Action |
| --- | --- |
| `↑` | Next patch |
| `↓` | Previous patch |

It wraps around at the ends. The ▲▼ buttons on screen work the same way (▲ = next, ▼ = previous).
Chrome / Edge show a folder picker; Firefox / Safari show a folder upload screen. The folder has to be picked again after the page is reloaded.

### Exporting a patch

The `export .sy1` button in Patch Parameters (right side) saves the current state of the panel as a Synth1 `.sy1` file (it asks for a name and downloads `name.sy1`).

- The format is the same as Synth1's (CRLF line endings, the same order as the factory patches). It is written as `ver=113`, #0–#98.
- Items that were in a loaded patch but are not on the panel (`#40`, `#50`, `#51`, `#86`–`#89`) are written back unchanged.
- The patch name and file name are ASCII only (Japanese and other characters become `_`), because Synth1 reads names in the OS character encoding.
- Loading and then exporting the 128 factory patches gives identical values. However, loading an exported file into the real Synth1 has not been checked yet.

### MML (the icon jingle, and playing from the console)

Click the icon at the top left (`e1.png`) and a short jingle is played in MML with the current panel sound (the loaded patch).
`ELITA.mml` (`js/mml.js`) is provided as a base for driving ELITA-1 with MML in the future.

```js
ELITA.mml.play("t120 o4 l8 cdefgab>c")   // play (calling it again stops the previous one and restarts)
ELITA.mml.stop()                          // stop
ELITA.mml.parse(text)                     // returns {events, duration, warnings} without sound
```

| Syntax | Meaning |
| --- | --- |
| `c d e f g a b` | Notes. `+` / `#` raises by a semitone, `-` lowers. Followed by a length (4 = quarter, 8 = eighth, …) and dots, e.g. `c+8.` `e-4` |
| `r` | Rest |
| `&` | Tie to the next note of the same pitch, e.g. `c4&c8` |
| `l8` | Default length |
| `o4` | Octave (`o4 c` = middle C = MIDI 60). `>` goes up one, `<` goes down one |
| `t120` | Tempo (the default is the BPM field) |
| `v12` | Velocity 0–15 (default 12 = 0.8) |
| `q6` | Gate 1–8 (8 = full length, default 8) |
| `'ceg'4` | Chord (all at once, one length) |
| `[ ... ]3` | Repeat (twice if no number) |
| `;` | Track separator (played at the same time) |
| `//` | Comment to the end of the line |

Notes are played through `engine.rawOn` / `rawOff`, so MML notes are not broken up by the Arpeggiator even when it is on. There are 5 voices, so beyond 5 simultaneous notes the oldest ones are cut. Ties across chords are not supported.

### Knob operation

- Drag (up/down) to change the value, mouse wheel for ±1 (Shift: ±8)
- Double-click returns to the default value
- Click the patch display (LCD) at the bottom to choose a patch from the selected folder directly (if no folder is selected, it opens the folder picker). ↑↓ to move, Enter to confirm, Esc to close
- LCD-style buttons go to the next item on click, the previous one on right-click, and also with the wheel. For the Effect / Delay / Chorus type, a click opens a selection list so you can pick directly (right-click and wheel still move one step at a time)

### Debug mode

Open `index.html?debug`, or run `ELITA.debug.on()` in the console (`ELITA.debug.off()` ends it).

| Command | Content |
| --- | --- |
| `ELITA.debug.graph()` | The whole signal path (state per voice, effect stages ON/OFF and values, LFO destinations) |
| `ELITA.debug.voice(i)` | Breakdown of voice i (levels of OSC1/2, Sub, Noise, Ring, Sync, FM, …) |
| `ELITA.debug.meters()` | Level of each stage (dB). Run it while playing |
| `ELITA.debug.params()` | Items changed from the defaults, and whether the engine uses them |
| `ELITA.debug.unused()` | Parameters the engine does not read |

While debugging, the console shows which voice and which path a note takes each time a key is pressed, and which number changed from what to what each time a knob is moved.

### MIDI input (play from a sequencer in another app or tab)

Press "MIDI ●" to the right of the patch display to open the settings panel (Chrome / Edge only; Safari does not support Web MIDI). The first time, the browser asks for permission to use MIDI.

- **device**: choose the MIDI input device. To play from a sequencer in another tab (a web app), create a virtual MIDI port (the "IAC Driver" on macOS, loopMIDI or similar on Windows) and set the same port as the sequencer's output and ELITA-1's input.
- **channel**: OMNI or 1–16. **pitch-bend range**: ±1 to ±24 semitones. **velocity → amp**: apply velocity to the volume.
- Received: notes, velocity, pitch bend, CCs (below), CC120 / CC123 (all notes off), MIDI clock.
- **CC MAP**: the defaults are CC1 → LFO1 amt, CC74 → filter frq, CC71 → filter res, CC64 → sustain. Right-click a knob → "LEARN CC…", then move a CC on your MIDI device to assign it (Esc cancels). reset / export / import are available. Settings and assignments are saved in this browser.
- **clock → BPM sync**: calculates the BPM from the MIDI clock (24 ppqn) and shows it in the BPM field (rounded to an integer).
- The bottom left of the screen shows the receive status (device, last message, BPM from the clock). `ELITA.midi.send([0x90,60,100])` in the console lets you test without a device.

### Session log (record what was played, and share it)

Press "● log" at the bottom of Patch Parameters to start recording, and "■ save log" to save `elita1-log-date-time.txt`.
Recorded: the notes played (note name, velocity, voice), knob changes (number, name, before / after), patch loads (items that differ from the defaults), MML playback, BPM,
the output level about every 0.25 s, errors, and the final state (in `.sy1` format). The log is built inside the browser and is not sent anywhere.
Attach this txt when you want to tell the developer what the sound was doing.

### Themes (switching and editing colours)

The "theme" button at the bottom of Patch Parameters opens the colour window.
- 4 standard themes: Classic (the original colours), Dark, Midnight and Light. They switch instantly on click (no reload).
- Colour pickers (about 30 colours) change one colour at a time. A changed colour gets a "•". "reset colours" returns to the theme's colours.
- "export .json" saves the colours to a file and "import .json" loads them (so they can be shared).
- The chosen theme and edited colours are saved in this browser (`localStorage`). Nothing is sent anywhere.
- How it works: all colours are CSS variables (`:root` in `css/style.css`); `css/themes.css` overrides them per theme and `js/theme.js` handles switching and the window. The knobs (NexusUI) and the oscilloscope also read the variables, so they change together. To add your own theme, write `:root[data-theme="name"]{ ... }` in `css/themes.css` and add the name to `THEMES` in `js/theme.js`.

## Structure

```
elita1/
├── index.html          main page (panel + keyboard + waveform + parameter list)
├── css/
│   ├── reset.css
│   ├── style.css       Synth1-style look
│   ├── compact.css     layout of the compact version
│   ├── params.css      look of the parameter list
│   └── themes.css      colour themes
├── docs/               screenshots (screenshot / settings / theme / midi)
├── img/                icon (e1.png) and waveform icons (SVG)
└── js/
    ├── Tone.js         Tone.js 14.8.49 (bundled)
    ├── NexusUI.js      NexusUI (bundled)
    ├── ui.js           the panel; registers every knob by its Synth1 parameter number
    ├── calib.js        calibration (curves, wave tables, voice / unison counts) and the shared state ELITA.core
    ├── worklets.js     AudioWorklet sources (hard sync, decimator, ladder)
    ├── voice.js        one voice (OSC, unison, filter, envelopes, LFO sends)
    ├── fx.js           effects (effect section, delay, chorus, EQ)
    ├── notes.js        note handling (poly / mono / legato) and the arpeggiator
    ├── debug.js        debug mode (for the console)
    ├── engine.js       audio start-up, overall update (applyAll), hookup to the panel, public API (load last of the engine files)
    ├── keys.js         keyboard (on-screen / PC keys)
    ├── patches.js      folder selection and patch switching
    ├── scope.js        oscilloscope
    ├── params.js       parameter list (right side)
    ├── history.js      update-history viewer shown when "UPDATED" is clicked (reads history.md)
    ├── mml.js          MML player (the icon jingle, `ELITA.mml`)
    ├── log.js          session log recording (saved as txt)
    ├── midi.js         MIDI input (Web MIDI, CC learn, clock sync)
    ├── theme.js        colour theme switching and colour editing
    └── settings.js     Settings window (filter engine, hard-sync anti-aliasing, analog character)
```

### How it works

The panel (`ui.js`) manages every knob by its Synth1 parameter number (0–98) and exposes it as `window.ELITA`.

```js
ELITA.params          // current values { number: value }
ELITA.onChange        // (number, value) => {} called every time a knob moves
ELITA.set(no, value)  // set a value without the callback (clamped to the range)
ELITA.setValue(no, v) // set a value and notify the engine (MIDI and the input boxes use this). ELITA.params is the only owner of the state
ELITA.check()         // check that the display and the values agree (list of mismatches, empty = all agree)
ELITA.loadSy1(text)   // load .sy1 text
```

`engine.js` (with calib / voice / fx / notes) receives `ELITA.onChange` and updates the Tone.js nodes. The panel and the sound engine are separate, so the engine can be replaced on its own.

**Settings** (the "settings" button at the bottom of Patch Parameters): these are not patch parameters; they choose how the engine behaves. Your choices are saved in this browser (`localStorage`). All defaults give the same sound as before (0.5.53).

- **Voice limits**: ELITA (default: 5 voices, at most 3 unison voices per oscillator, to stay light) / Synth1 spec (the ranges of the real panel: as many voices as the patch's poly number, up to 32, and up to 8 unison voices). While Synth1 spec is on, a yellow "SYNTH1 SPEC MODE" badge is shown in the title bar, "(Synth1 spec)" appears next to the voice counter at the keyboard, and the settings button is lit yellow. CPU load becomes much higher (idle voices keep running too), and the sound may crackle on a slow computer. Unison for pulse waves is still not supported in this mode.
- **Filter engine**: Biquad (default, tuned to Synth1 recordings) / Ladder (experimental, 4-pole 24 dB/oct). Only the low-pass 24 dB type uses the ladder. The former `?filter=ladder` URL option has been removed.
- **Ladder character**: Soft limit (default) / Per-stage tanh (tanh on every stage, transistor-ladder style).
- **Hard sync anti-aliasing**: Off (default) / PolyBLEP. Reduces aliasing from the sync reset and the edges of the slave wave (measured: about 15–20 dB less aliased energy).
- **Voice variance**: Off / Low / Medium / High. A fixed pitch and cutoff offset per voice (about 2 / 5 / 9 cents).
- **Slow drift**: Off / Low / Medium / High. Pitch and cutoff wander slowly and randomly.

From the console you can also use `ELITA.settings.get()` / `ELITA.settings.set('filter', 'ladder')` / `ELITA.settings.reset()` and `ELITA.engine.filterMode('ladder' | 'biquad')`.

Signal path:

```
[OSC1 | OSC2 | RING | SYNC | NOISE | SUB] → Filter (+Filter Env) → Sat → Amp (+Amp Env) → voice sum
  → Master → EQ → Chorus → Delay → Pan → Limiter → SoftClip → output
LFO1 / LFO2 (shared by all voices) and the Mod Envelope (per voice) modulate pitch / filter / amp / P/W / FM
```

### The `.sy1` format

Line 1 is the patch name, line 2 is `color=…`, line 3 is `ver=…`, and the rest are `number,value` lines. The number of items depends on `ver` (75 / 87 / 99 items for 106 / 108 / 113); missing items are filled with defaults.

## Known issues and limitations

### Where the sound differs from Synth1

- **Only some parameter curves have been matched by measurement.** Filter frequency (frq 64–112) comes from a table derived from Synth1 recordings (frq 0–48 are extrapolated, provisional values). ADSR times, filter envelope amount, key tracking, resonance, LFO speed, FM depth, Delay time and Chorus are still guesses. Compared with Synth1, loudness, brightness and modulation depth will be off.
- **The low filter frequencies (frq 0–48) and the resonance are unmeasured.** Patches with a low frequency and high resonance may differ from Synth1 in loudness and brightness. `ELITA.debug.meters()` shows at which stage the level drops. The ladder (chosen in Settings) is experimental, and the average level of the 128 standard patches is about 2.7 dB lower than with the biquad.
- The filter's `LPDL` (Synth1's own filter) is replaced by LP24.
- LFO wave numbers (`#42` / `#47`): `1 = tri`, `2 = pulse` and `3 = s&h` were confirmed on the real Synth1. `0 = saw`, `4 = sine` and `5 = rnd` are guesses. `s&h` (stepped random values) and `rnd` (smoothly changing random values) are generated with a timer (the details differ from Synth1's behaviour).
- The filter `sat` (`#23`) is an approximation: a tanh saturator in parallel right after the filter (0 is a complete bypass). The distortion character differs from Synth1's.
- A simple soft clip is applied to the output (to stop level jumps when the resonance is high).

### Parameters not implemented (on the panel, but with no effect on the sound)

`ELITA.debug.unused()` shows the current list. The main ones:

- MIDI related (`#50`, `#51`, `#86–89`)

### Recently implemented

- OSC2 pitch (`#2`): 64 is the centre, ±60 semitones (rounded to whole semitones). In the 128 factory patches, 77 = +12, 89 = +24 and 102 = +36 (octaves). fine (`#3`) is based on 66 (55 of the factory patches use 66), 1 cent per step (provisional). The former ±24 semitone limit was removed.
- Effect section (`#77` on, `#78` type, `#79` ctl1, `#80` ctl2, `#81` level). type 0 = a.d.1 / 1 = a.d.2 / 2 = d.d. / 3 = deci. / 4 = r.m. / 5 = comp. / 6–9 = ph.1–ph.4 (the numbering is a guess). It sits after the master volume and before the EQ. All curves and ranges are provisional (the real manual gives no numbers).
  - Distortion (0–2): ctl1 = amount, ctl2 = LPF (500 Hz–20 kHz), level = balance with the dry signal. a.d.1 is asymmetric soft clipping plus a low cut (even harmonics), a.d.2 is tanh, d.d. is hard clipping with fine steps.
  - deci. (3): ctl1 = sampling frequency (44.1 kHz to about 441 Hz), ctl2 = bit depth (1–16), level = mix. Processed in an AudioWorklet.
  - r.m. (4): ctl1 = modulation frequency (sine wave, 20 Hz–5 kHz), ctl2 has no effect, level = mix.
  - comp. (5): ctl1 = depth of compression (threshold −4 to −44 dB, ratio 1.5–15.5), ctl2 = attack (1–100 ms), level = balance with the dry signal (parallel).
  - ph.1–ph.4 (6–9): phasers with 1 / 2 / 4 / 6 stages. ctl1 = LFO depth, ctl2 = LFO speed (0.05–8 Hz), level = feedback. The mix is fixed.
- Unison pan width (`#84`): when unison is ON (2 or more voices) and the value is above 0, another set of OSC1/OSC2 is added; the original set goes left and the added set goes right (0 = both centre, 127 = full left and right). After the filter, left and right are processed separately. Unlike the real thing, which pans each voice finely, this is an approximation with two groups. The unison sound spreads to the sides, at the cost of doubling the oscillators. The extra layer of Unison pitch, Sub and Noise stay in the centre.
- Unison pitch (`#85`): when unison is ON (2 or more voices) and the value is not 24, another layer of OSC1/OSC2 is added, shifted by (value − 24) semitones (24 = no shift, 36 = one octave up). The layer is created only when needed, so there is no extra load if it is not used. The interpretation of the shift is provisional. FM / ring / sync / Mod Envelope do not apply to the extra layer.
- Phase (`#91` osc, `#92` unison): at 0 the oscillators free-run as before; otherwise OSC1/OSC2/Sub start from that angle (0–127 = 0–360 degrees) on every note-on. `#92` is added to `#91` only while unison is on (the Tone.js fat oscillator cannot offset its voices individually, so this is provisional).
- osc `tune` (`#72`, 64 is the centre, ±100 cents, both OSCs), `det` (`#76`, 0–127 adds up to +50 cents to OSC1), and OSC2 `track` (`#4`; off fixes OSC2 at C4 regardless of the key, pitch/fine are added). The ranges are provisional.
- LFO tempo sync (`#67` / `#69`): the speed knob selects a beat division (17 steps from 64 beats to 1/8 beat). The tempo is set in the BPM field at the bottom (default 120, 40–300) and is also used for the Delay time (in Synth1 it comes from the host). The order of the divisions is provisional.
- Arpeggiator (`#59` on, `#31` type, `#32` oct range, `#33` beat, `#34` gate): while ON, the held keys are played in turn in time with the beat (no latch; it stops when all keys are released). The tempo is the BPM field. type is assumed to be 1 = up, 2 = down, 3 = up/down, 4 = random (1 is nearly all of the factory patches). beat has 19 steps from 0 to 18 (11 = 1/16 beat, a larger number is faster); values of 19 and above are scaled so that 127 maps to 18. The beat table is provisional. gate is the note length relative to one step (value / 127).
- EQ tone (`#60`): 64 is flat; raising it makes the sound brighter (highs +, lows −) and lowering it makes it darker (up to about ±9 dB at both ends). The curve is provisional.
- Velocity: the amp `vel` (`#30`) gives a constant level at 0 and a level proportional to the strength at 127. With the filter `vel` (`#24`) switch ON, the filter envelope amount also follows the strength. The reference strength is 0.8 (the fixed value of the PC keyboard), so a note played from the PC keys sounds the same as before velocity was implemented. On the on-screen keyboard the strength changes with the height of the click (weak at the top, strong at the bottom). The curve is provisional.
- LFO key sync (`#68` / `#70`): resets the LFO phase on every note (s&h / rnd draw a new value).
- Delay type / spread / tone (`#82` / `#83` / `#98`): type is assumed to be 0 = ST (independent left and right), 1 = X (feedback crosses left and right), 2 = PP (ping-pong from a mono input). spread makes the right delay time up to 1.5 times longer, and tone is a low-pass in the feedback path (0 = pass-through, 127 = about 1.5 kHz). The number mapping and the value curves are guesses.

### Value mappings not yet confirmed

The following were decided by comparing the patches at hand with the display of the real Synth1, or are guesses.

Wave number mapping (◎ = confirmed on the real Synth1 display, ○ = supported by how the 128 factory patches use it, △ = guess):

| Where | 0 | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| OSC1 (`#0`) | sine ○ | saw ○ | pulse ◎ | tri ◎ | – | – |
| OSC2 (`#1`) | (not on the real panel; not in the 128 patches) | saw ◎ | pulse ◎ | tri ◎ | noise ◎ | – |
| Sub (`#96`) | sine △ | tri ◎ | saw △ | pulse △ | – | – |
| LFO (`#42` / `#47`) | saw △ | tri ◎ | pulse ◎ | s&h ◎ | sine △ | rnd △ |

- The OSC2 panel has no sine (it has the four: tri / pulse / saw / noise). With `#1 = 0` the engine plays a sine.
- OSC1 `0` and `1` have not been seen lit on the real panel, but how the 128 patches use them supports the mapping. `0` gathers Piano, Bell, Flute, Whistle and Kick; `1` gathers Strings, Brass, Saw lead and Sync lead; `2` is Hammond / Church / Perc Organ, Clarinet and Square lead (sounds that suit pulse); `3` is Celesta, Glocken, Piccolo, Pan Flute and Telephone (sounds that suit tri). For OSC2 too, `4` is concentrated in hat, snare, Kick2, Wind, Machine Gun and Explosion (sounds that suit noise).
- The idea that "OSC1 is ordered sine / triangle / saw / square with the default 2 = saw" is not adopted, because it conflicts with `Square lead` having `#0 = 2` and `Saw lead` having `#0 = 1`.
- For LFO `0`, `4` and `5`, how the remaining waves (saw / sine / rnd) are assigned is a guess.
- The Play mode numbers (0 poly / 1 mono / 2 legato) are almost certain: in the factory presets mono (1) is used for drums and sequence sounds, and legato (2) for solo leads.
- The Chorus type treats the value N as `xN` and approximates the difference between `x1` and `x2–x4`. `x0` and `x3` are unverified.
- The meaning of `#94` (no name) is not settled. It is not in the factory presets (ver=105). The poly count on screen tops out at 5 voices.
- Some patches contain out-of-range values (negative `#9`, large `#86` / `#88`). A negative key shift is treated as a semitone shift.

### Checking with the 128 factory presets

The 128 sounds equivalent to the Synth1 factory presets (all `ver=105`, parameters 0–72 only) were all passed through the engine.

- No errors on loading or playing. No patch peaks above 0.95 (distorts).
- No silent patches (hat is an extremely short percussive sound that the measurement window barely catches).
- Value ranges: `#14` is 0–3, `#31` is 1–4, `#32` is 0–3, `#38` is 0–2, `#41` is 1–5, `#42` is 0–5, `#46` is 0–5, `#47` is 1–3, `#64` is 1 / 2 / 4. `#1` is never 0. All are within the current choices.
- `#23` (sat) is 0 in 123 patches; only 5 patches use it.

### Other

- By default the voice count is 5 (`POLY` in `calib.js`). To match the range of the Synth1 panel (poly up to 32), set "Voice limits" in Settings to "Synth1 spec".
- MIDI input works only with Web MIDI (Chrome / Edge). MIDI output, program change and the MIDI `#50` / `#51` / `#86–89` (sens group) are not supported.
- The screen has a fixed width (960 px for the main part plus 380 px for the parameter list on the right) and is not optimised for a phone in portrait. Touch playing is possible with the on-screen keyboard.
- The latest versions of Chrome / Edge / Firefox / Safari are assumed. Hard sync (OSC2 sync) uses an AudioWorklet, so it is disabled where AudioWorklet is unavailable.
- By default unison is limited to 3 voices for CPU load and repeatable timbre (`UNI_MAX` in `calib.js`; 8 in "Synth1 spec"). When a patch's `#93` is above the limit, it is clamped to the limit and the parameter list shows `clamped → 3`. Pulse waves are not unisoned (while an OSC is pulse it stays a single voice even with unison ON; for example ebm bass).
- CPU load in long continuous playback, or with many voices + unison + 2 chorus stages, has not been checked.

## Ideas for later

- Adjust each curve by comparing with Synth1 recordings (filter low range and resonance, ADSR times, filter envelope amount, key tracking)
- Switching patches with MIDI program change, MIDI output
- Remembering the last folder
- A spectrum display

## Update history

See [history.en.md](history.en.md) (Japanese: [history.md](history.md)). Clicking "UPDATED" at the top of the screen shows the latest entry on screen, in Japanese (it cannot be read when opened directly with `file://`, so open it through a simple server).

## Acknowledgements

ELITA-1 is modelled on the soft synth **Synth1** by Daichi (Ichiro Toda), with respect for its sound and design. Synth1 official page: [Daichi's Lab – Synth1](https://daichilab.sakura.ne.jp/softsynth/index.html). The same acknowledgement and link are also shown at the bottom of the screen (the footer).

## Libraries used

- [Tone.js](https://tonejs.github.io/) 14.8.49 (MIT License)
- [NexusUI](https://nexus-js.github.io/ui/) (MIT License)

## License and notes

- Decide the license of this repository's code when you publish it, and add a `LICENSE` file (for example MIT).
- **The rights to Synth1 patches (`.sy1`) belong to their authors.** Do not include them in the repository or redistribute them without permission. This repository contains no patches.
- "Synth1" is the product name of its author (Ichiro Toda). This project is unofficial and has no relation to the author or distributor.
- `img/e1.png` is the icon made for this project. If you reuse it, follow the author's wishes.
