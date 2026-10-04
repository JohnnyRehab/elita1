/* Text list of every patch parameter, next to the panel. Read-only; follows the panel live (ELITA.params / ELITA.onChange). */
(function () {
  const E = window.ELITA, $ = id => document.getElementById(id), box = $('plist');
  const L = (...a) => a, onoff = ['off', 'on'];
  const W1 = {0: 'sine', 1: 'saw', 2: 'pulse', 3: 'tri'}, W2 = {0: 'sine?', 1: 'saw', 2: 'pulse', 3: 'tri', 4: 'noise'};
  const LD = ['none', 'osc2', 'osc1,2', 'filter', 'amp', 'p/w', 'FM', 'pan'], LT = ['saw', 'tri', 'sine', 'square', 's&h', 'rnd'];
  const FT = ['LP12', 'LP24', 'HP12', 'BP12', 'LPDL'], FX = ['a.d.1', 'a.d.2', 'd.d.', 'deci.', 'r.m.', 'comp.', 'phaser'];
  const T = a => v => a[v], X = a => v => a[v];
  // [no, label, decoder?]   section → optional sub-groups
  const SEC = [
    ['Oscillators', [
      ['OSC 1', [[0, 'wave', v => W1[v]], [76, 'det'], [45, 'FM'], [95, 'sub'], [96, 'sub wave', v => W1[v]], [97, 'sub oct', T(['0oct', '-1oct'])]]],
      ['OSC 2', [[1, 'wave', v => W2[v]], [2, 'pitch'], [3, 'fine'], [7, 'ring', T(onoff)], [6, 'sync', T(onoff)], [4, 'track', T(onoff)]]],
      ['Mix / Mod', [[9, 'key shift'], [5, 'mix'], [8, 'p/w'], [91, 'phase'], [72, 'tune'], [10, 'm.env', T(onoff)], [12, 'm.env A'], [13, 'm.env D'], [11, 'm.env amt'], [71, 'm.env dest', T(['osc2', 'FM', 'p/w'])]]]]],
    ['LFO', [
      ['LFO 1', [[57, 'on', T(onoff)], [42, 'type', T(LT)], [41, 'dest', T(LD)], [43, 'spd'], [44, 'amt'], [67, 'tempo sync', T(onoff)], [68, 'key sync', T(onoff)]]],
      ['LFO 2', [[58, 'on', T(onoff)], [47, 'type', T(LT)], [46, 'dest', T(LD)], [48, 'spd'], [49, 'amt'], [69, 'tempo sync', T(onoff)], [70, 'key sync', T(onoff)]]]]],
    ['Amplifier', [['', [[25, 'A'], [26, 'D'], [27, 'S'], [28, 'R'], [29, 'gain'], [30, 'vel']]]]],
    ['Filter', [['', [[15, 'A'], [16, 'D'], [17, 'S'], [18, 'R'], [21, 'amt'], [19, 'frq'], [20, 'res'], [23, 'sat'], [22, 'trk'], [24, 'vel', T(onoff)], [14, 'type', T(FT)]]]]],
    ['Arpeggiator', [['', [[59, 'on', T(onoff)], [31, 'type', T(['updown', 'up', 'down', 'random'])], [32, 'range', v => (+v + 1) + 'oct'], [33, 'beat'], [34, 'gate']]]]],
    ['Effect', [['', [[77, 'on', T(onoff)], [78, 'type', T(FX)], [79, 'ctl1'], [80, 'ctl2'], [81, 'level']]]]],
    ['Equalizer / Pan', [['', [[61, 'freq'], [62, 'level'], [63, 'Q'], [60, 'tone'], [90, 'L-R']]]]],
    ['Tempo Delay', [['', [[65, 'on', T(onoff)], [82, 'type', T(['ST', 'X', 'PP'])], [35, 'time'], [83, 'sprd'], [36, 'fdbk'], [98, 'tone'], [37, 'd/w']]]]],
    ['Chorus / Flanger', [['', [[66, 'on', T(onoff)], [64, 'type', v => 'x' + v], [52, 'time'], [53, 'deph'], [54, 'rate'], [55, 'fdbk'], [56, 'levl']]]]],
    ['Voice', [['', [[38, 'mode', T(['poly', 'mono', 'legato'])], [94, 'poly'], [73, 'unison', T(onoff)], [93, 'unison num'], [75, 'unison det'], [92, 'unison phase'], [84, 'unison sprd'], [85, 'unison pitch'], [39, 'porta'], [74, 'porta auto', T(onoff)]]]]],
    ['Other', [['', [[40, 'pb range'], [50, 'midi sens 1'], [51, 'midi sens 2'], [86, 'midi 86'], [87, 'midi 87'], [88, 'midi 88'], [89, 'midi 89'], ['vol', 'master vol']]]]]
  ];
  box.innerHTML = '<div class="ph"><span>Patch Parameters</span><small id="pcount"></small></div>' +
    '<div class="pn"><b id="pn1">Init patch</b><span id="pn2">&nbsp;</span></div>' +
    '<div class="tools"><label><input type="checkbox" id="onlych"> changed only</label><button type="button" id="pcopy">copy text</button></div>' +
    '<div class="scroll" id="pscroll"></div>' +
    '<div class="foot"><span><i class="sw1" style="background:var(--led)"></i>changed from default</span><span style="opacity:.6">– not used = engine ignores it</span></div>';
  const sc = $('pscroll'), rows = [];
  SEC.forEach(([title, groups]) => {
    const s = document.createElement('section'); s.innerHTML = '<h3>' + title + '</h3>'; sc.append(s);
    groups.forEach(([gt, items]) => {
      if (gt) { const h = document.createElement('h4'); h.textContent = gt; s.append(h); }
      items.forEach(([no, label, dec]) => {
        const r = document.createElement('div'); r.className = 'r';
        r.innerHTML = '<span class="no">' + (no === 'vol' ? '' : '#' + no) + '</span><span class="nm">' + label + '</span><span class="v"></span>';
        s.append(r); rows.push({no, label, dec, r, v: r.lastChild, sec: s, title});
      });
    });
  });
  let q = false, used = null;
  function render() {
    q = false;
    const P = E.params, D = E.defaults; used = used || (E.engine && E.engine.used ? E.engine.used() : null);
    let nch = 0;
    rows.forEach(o => {
      const val = P[o.no]; if (val === undefined) { o.r.classList.add('off'); return; }
      const t = o.dec ? o.dec(val) : null, ch = val !== D[o.no];
      o.v.innerHTML = (t != null ? '<em>' + t + '</em>' : '') + '<i>' + val + '</i>';
      o.r.classList.toggle('ch', ch); if (ch) nch++;
      o.r.classList.toggle('un', !!used && o.no !== 'vol' && !used.has(+o.no));
    });
    document.querySelectorAll('#plist section').forEach(s => s.classList.toggle('has', !!s.querySelector('.r.ch')));
    document.querySelectorAll('#plist h4').forEach(h => { let n = h.nextElementSibling, any = false; while (n && n.classList.contains('r')) { any = any || n.classList.contains('ch'); n = n.nextElementSibling; } h.classList.toggle('has', any); });
    $('pcount').textContent = rows.filter(o => P[o.no] !== undefined).length + ' params / ' + nch + ' changed';
    $('pn1').textContent = $('pname').textContent;
    $('pn2').textContent = ($('pidx').textContent ? $('pidx').textContent + '  ' : '') + ($('pinfo').textContent.startsWith('ver') || /\.sy1/.test($('pinfo').textContent) ? $('pinfo').textContent : '');
  }
  const later = () => { if (!q) { q = true; requestAnimationFrame(render); } };
  const prev = E.onChange; E.onChange = (n, v) => { if (prev) prev(n, v); later(); };
  new MutationObserver(later).observe($('pname'), {childList: true, characterData: true, subtree: true});
  new MutationObserver(later).observe($('pidx'), {childList: true, characterData: true, subtree: true});
  $('onlych').onchange = e => box.classList.toggle('onlych', e.target.checked);
  $('pcopy').onclick = () => {
    const P = E.params, out = ['# ' + $('pname').textContent];
    SEC.forEach(([title, groups]) => { out.push('', '[' + title + ']'); groups.forEach(([gt, items]) => items.forEach(([no, label, dec]) => { if (P[no] === undefined) return; const t = dec ? dec(P[no]) : null; out.push((no === 'vol' ? '   ' : ('#' + no).padStart(3)) + ' ' + (gt ? gt + ' ' : '') + label + ' = ' + P[no] + (t != null ? ' (' + t + ')' : '')); })); });
    navigator.clipboard && navigator.clipboard.writeText(out.join('\n')).then(() => { $('pcopy').textContent = 'copied'; setTimeout(() => $('pcopy').textContent = 'copy text', 1200); });
  };
  const fit = () => { const m = $('main'); if (m) box.style.setProperty('--mainh', m.getBoundingClientRect().height + 'px'); };
  addEventListener('load', () => { fit(); render(); }); addEventListener('resize', fit); setTimeout(() => { fit(); render(); }, 500);
})();
