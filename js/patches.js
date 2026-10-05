/* Patch browser: pick a folder of .sy1 files, step through them with the arrow keys (↑ next, ↓ previous).
   Chrome / Edge: folder picker (File System Access API). Other browsers: folder upload dialog (webkitdirectory). */
(function () {
  const E = window.ELITA, $ = id => document.getElementById(id);
  let list = [], cur = -1;
  const pad = n => String(n).padStart(3, '0');
  async function decode(file) {
    const b = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', {fatal: true}).decode(b); } catch (e) { return new TextDecoder('shift_jis').decode(b); }
  }
  async function show(i) {
    if (!list.length) return;
    cur = (i + list.length) % list.length;
    const f = list[cur], res = E.loadSy1(await decode(f));
    $('pname').textContent = res.name;
    $('pidx').textContent = pad(cur + 1) + '/' + pad(list.length);
    $('pinfo').textContent = f.name + '  ver ' + res.ver + ' / ' + res.applied + ' params';
    if (E.engine) E.engine.allOff();
  }
  function setFiles(files, label) {
    list = files.filter(f => /\.sy1$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));
    if (!list.length) { $('pinfo').textContent = 'no .sy1 files found' + (label ? ' in ' + label : ''); return; }
    show(0);
  }
  async function pickDir() {
    if (window.showDirectoryPicker) {
      try {
        const dir = await showDirectoryPicker({id: 'elita1-patches'}), fs = [];
        for await (const [name, h] of dir.entries()) if (h.kind === 'file' && /\.sy1$/i.test(name)) fs.push(await h.getFile());
        setFiles(fs, dir.name);
      } catch (e) { if (e.name !== 'AbortError') $('pinfo').textContent = 'folder error: ' + e.message; }
    } else $('dirin').click();
  }
  $('dirbtn').onclick = pickDir;
  $('dirin').onchange = e => { setFiles([...e.target.files]); e.target.value = ''; };
  $('pprev').onclick = () => show(cur - 1);   // ▼ (same direction as the ↓ key)
  $('pnext').onclick = () => show(cur + 1);   // ▲ (same direction as the ↑ key)
  // single files / drops also join the list so the arrows keep working
  $('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) { list = [f]; cur = 0; $('pidx').textContent = ''; } });
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || !list.length) return;
    const t = e.target.tagName; if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
    const k = {ArrowUp: 1, ArrowDown: -1}[e.key];
    if (k) { e.preventDefault(); show(cur + k); }
  });
})();
