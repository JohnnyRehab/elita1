/* Patch browser: pick a folder of .sy1 files, step through them with the arrow keys (↑ next, ↓ previous).
   Chrome / Edge: folder picker (File System Access API). Other browsers: folder upload dialog (webkitdirectory). */
(function () {
  const E = window.ELITA, $ = id => document.getElementById(id);
  let list = [], cur = -1, names = [], namesReady = Promise.resolve();
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
    names = []; namesReady = Promise.all(list.map(async (f, i) => { try { names[i] = (await decode(f)).split(/\r?\n/, 1)[0].trim(); } catch (e) { names[i] = ''; } }));   // first line of a .sy1 = patch name
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
  // click the patch display: pick a patch straight from the chosen folder (no folder yet -> same as "folder...")
  let menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  async function openMenu() {
    closeMenu();
    await namesReady;
    if (menu) return;
    const box = $('lcdbox'), r = box.getBoundingClientRect();
    menu = document.createElement('div'); menu.className = 'lcdmenu pl'; menu.setAttribute('role', 'listbox');
    list.forEach((f, i) => {
      const o = document.createElement('button'); o.type = 'button'; o.className = 'lcdopt' + (i === cur ? ' sel' : ''); o.setAttribute('role', 'option');
      o.innerHTML = '<i></i><span></span>'; o.firstChild.textContent = pad(i + 1); o.lastChild.textContent = names[i] ? names[i] + '   (' + f.name.replace(/\.sy1$/i, '') + ')' : f.name.replace(/\.sy1$/i, '');
      o.onclick = () => { closeMenu(); show(i); };
      menu.appendChild(o);
    });
    const more = document.createElement('button'); more.type = 'button'; more.className = 'lcdopt more'; more.textContent = 'other folder…';
    more.onclick = () => { closeMenu(); pickDir(); }; menu.appendChild(more);
    document.body.appendChild(menu);
    menu.style.minWidth = Math.max(240, r.width) + 'px';
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    menu.style.left = Math.max(4, Math.min(r.left, innerWidth - mw - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(r.bottom - 1, innerHeight - mh - 4)) + 'px';
    const sel = menu.querySelector('.sel') || menu.firstChild; sel.scrollIntoView({block: 'center'}); sel.focus({preventScroll: true});
  }
  $('lcdbox').classList.add('pl-click'); $('lcdbox').title = 'click: choose a patch from the folder (no folder yet: choose a folder)';
  $('lcdbox').onclick = () => { if (!list.length) pickDir(); else openMenu(); };
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target) && !e.target.closest('#lcdbox')) closeMenu(); }, true);
  document.addEventListener('keydown', e => {
    if (!menu) return;
    if (e.key === 'Escape') { closeMenu(); return; }
    const k = {ArrowDown: 1, ArrowUp: -1, Home: 'h', End: 'e'}[e.key]; if (!k) return;
    e.preventDefault(); e.stopPropagation();
    const items = [...menu.querySelectorAll('.lcdopt')], i = items.indexOf(document.activeElement);
    items[k === 'h' ? 0 : k === 'e' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, (i < 0 ? 0 : i) + k))].focus();
  }, true);
  $('dirbtn').onclick = pickDir;
  $('dirin').onchange = e => { setFiles([...e.target.files]); e.target.value = ''; };
  $('pprev').onclick = () => show(cur - 1);   // ▼ (same direction as the ↓ key)
  $('pnext').onclick = () => show(cur + 1);   // ▲ (same direction as the ↑ key)
  // single files / drops also join the list so the arrows keep working
  $('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) { list = [f]; cur = 0; $('pidx').textContent = ''; } });
  addEventListener('keydown', e => {
    if (menu || e.ctrlKey || e.metaKey || e.altKey || !list.length) return;
    const t = e.target.tagName; if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
    const k = {ArrowUp: 1, ArrowDown: -1}[e.key];
    if (k) { e.preventDefault(); show(cur + k); }
  });
})();
