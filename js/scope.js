/* Oscilloscope below the panel: shows the final output (after the limiter / soft clip). Triggers on a rising zero crossing so the picture holds still. */
(function () {
  const cv = document.getElementById('scope'), cx = cv.getContext('2d'), W = cv.width, H = cv.height;
  (function draw() {
    requestAnimationFrame(draw);
    cx.fillStyle = '#0e2f2a'; cx.fillRect(0, 0, W, H);
    cx.strokeStyle = 'rgba(53,230,208,.18)'; cx.lineWidth = 1; cx.beginPath();
    for (let i = 1; i < 4; i++) { cx.moveTo(0, H * i / 4); cx.lineTo(W, H * i / 4); }
    for (let i = 1; i < 8; i++) { cx.moveTo(W * i / 8, 0); cx.lineTo(W * i / 8, H); }
    cx.stroke();
    const E = window.ELITA.engine, w = E && E.wave();
    if (!w) return;
    const d = w.getValue(), n = 1024;
    let s = 0; for (let i = 1; i < 1024; i++) if (d[i - 1] < 0 && d[i] >= 0) { s = i; break; }
    cx.strokeStyle = '#35e6d0'; cx.lineWidth = 3; cx.lineJoin = 'round'; cx.beginPath();
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * W, y = H / 2 - d[s + i] * H * 0.46; i ? cx.lineTo(x, y) : cx.moveTo(x, y); }
    cx.stroke();
  })();
})();
