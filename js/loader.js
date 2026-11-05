/* ELITA-1 boot loader: picks the sound engine and writes the script tags (in order, synchronously) for it.
   Engine choice (Settings > Sound engine, kept in localStorage 'elita1-settings'.engine):
     'core' (default)  the C++ / Wasm core in one AudioWorklet (js/core). Tone.js and the Tone-based voice / effect files are NOT loaded.
     'tone'            the original Tone.js engine (js/Tone.js, worklets.js, voice.js, fx.js, debug.js).
   ?engine=core / ?engine=tone in the URL overrides the choice for this page view (used by the tests); Settings does not rewrite it.
   If the browser cannot run the core (no AudioWorklet / WebAssembly, bulk memory or SIMD), the Tone.js engine is used instead and Settings says so.
   window.ELITA_BOOT = {stored, active, forced, reason}  (ELITA itself is created later by ui.js). */
(function () {
  const KEY = 'elita1-settings', DEFAULT = 'core';
  const valid = v => v === 'core' || v === 'tone';
  let stored = DEFAULT;
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && valid(s.engine)) stored = s.engine; } catch (e) { /* no storage: default */ }
  let forced = null; try { const q = new URLSearchParams(location.search).get('engine'); if (valid(q)) forced = q; } catch (e) { /* ignore */ }
  let fell = null; try { fell = sessionStorage.getItem('elita1-engine-fallback'); } catch (e) { /* ignore */ }
  const can = () => {                                           // what js/core needs: AudioWorklet, WebAssembly, bulk memory and SIMD (the module is built with -msimd128 -mbulk-memory)
    if (typeof AudioWorkletNode === 'undefined' || typeof WebAssembly === 'undefined') return 'AudioWorklet / WebAssembly are not available';
    const ok = bytes => { try { return WebAssembly.validate(new Uint8Array(bytes)); } catch (e) { return false; } };
    if (!ok([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 3, 1, 0, 1, 10, 14, 1, 12, 0, 65, 0, 65, 0, 65, 0, 252, 10, 0, 0, 11])) return 'WebAssembly bulk memory is not available';
    if (!ok([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])) return 'WebAssembly SIMD is not available';
    return '';
  };
  const want = forced || stored;
  let active = want, reason = '';
  if (want === 'core') { const why = can(); if (why) { active = 'tone'; reason = why; } }
  if (fell && !forced && want === 'core') { active = 'tone'; reason = fell; }          // the core failed to start earlier in this tab
  window.ELITA_BOOT = {stored, active, forced, reason};
  const common1 = ['NexusUI.js', 'ui.js', 'calib.js'];
  const tone = ['Tone.js'].concat(common1, ['worklets.js', 'voice.js', 'fx.js', 'notes.js', 'debug.js', 'engine.js']);
  const core = common1.concat(['notes.js', 'engine.js', 'core/core-engine.js']);   // engine.js keeps the BPM box and the engine contract; it never touches Tone while S.CORE is set
  const tail = ['keymap.js', 'keys.js','voiceind.js', 'patches.js', 'scope.js', 'params.js', 'history.js', 'mml.js', 'log.js', 'midi.js', 'theme.js', 'settings.js', 'keyconfig.js'];
  const base = (document.currentScript && document.currentScript.src || location.href + 'js/').replace(/[^/]*$/, '');
  (active === 'core' ? core : tone).concat(tail).forEach(f => document.write('<script src="' + base + f + '"><\/script>'));
})();
