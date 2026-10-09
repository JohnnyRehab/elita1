/* Oscilloscope below the panel: shows the final output (after the limiter / soft clip). Triggers on a rising zero crossing so the picture holds still. */
(function () {
  const cv = document.getElementById('scope'), cx = cv.getContext('2d'), W = cv.width, H = cv.height;
  let bg = '#0e2f2a', fg = '#35e6d0', grid = 'rgba(53,230,208,.18)';          // colours follow the theme (--lcd / --lcdf)
  const rgb = c => { const t = document.createElement('canvas').getContext('2d'); t.fillStyle = c; const h = t.fillStyle; return h[0] === '#' ? [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)) : [53, 230, 208]; };
  const colours = () => { const s = getComputedStyle(document.documentElement); bg = s.getPropertyValue('--lcd').trim() || bg; fg = s.getPropertyValue('--lcdf').trim() || fg; grid = 'rgba(' + rgb(fg).join(',') + ',.18)'; };
  colours(); window.addEventListener('elita-theme', colours);
  (function draw() {
    requestAnimationFrame(draw);
    cx.fillStyle = bg; cx.fillRect(0, 0, W, H);
    cx.strokeStyle = grid; cx.lineWidth = 1; cx.beginPath();
    for (let i = 1; i < 4; i++) { cx.moveTo(0, H * i / 4); cx.lineTo(W, H * i / 4); }
    for (let i = 1; i < 8; i++) { cx.moveTo(W * i / 8, 0); cx.lineTo(W * i / 8, H); }
    cx.stroke();
    const E = window.ELITA.engine, w = E && E.wave();
    if (!w) return;
    const d = w.getValue(), n = 1024;
    let s = 0; for (let i = 1; i < 1024; i++) if (d[i - 1] < 0 && d[i] >= 0) { s = i; break; }
    cx.strokeStyle = fg; cx.lineWidth = 3; cx.lineJoin = 'round'; cx.beginPath();
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * W, y = H / 2 - d[s + i] * H * 0.46; i ? cx.lineTo(x, y) : cx.moveTo(x, y); }
    cx.stroke();
  })();
})();
