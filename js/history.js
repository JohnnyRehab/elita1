/* Click "UPDATED: ..." in the title bar -> shows the newest entry of history.md (button inside: whole history).
   history.md is fetched, so the page must be served over http (python3 -m http.server); from file:// a fallback message is shown. */
(function () {
  const el = document.querySelector('#title .date'); if (!el) return;
  const css = document.createElement('style');
  css.textContent = `#title .date{ cursor:pointer; text-decoration:underline dotted; text-underline-offset:3px; }
  #title .date:hover{ background:#b00000; }
  #histdlg{ width:min(560px,92vw); max-height:80vh; padding:0; border:1px solid var(--dk); background:var(--bg); color:var(--ink); font:12px/1.5 "Hiragino Sans","Yu Gothic UI",system-ui,sans-serif; }
  #histdlg::backdrop{ background:rgba(0,0,0,.45); }
  #histdlg .hh{ display:flex; justify-content:space-between; align-items:center; padding:5px 10px; background:var(--hd); border-bottom:1px solid var(--dk); font-weight:700; font-size:13px; }
  #histdlg .hb{ padding:8px 14px 12px; overflow:auto; max-height:calc(80vh - 70px); }
  #histdlg h3{ margin:10px 0 4px; font-size:13px; padding:1px 8px; background:var(--dk); color:#fff; display:inline-block; }
  #histdlg h3:first-child{ margin-top:0; }
  #histdlg ul{ margin:4px 0 0; padding-left:18px; } #histdlg li{ margin:3px 0; }
  #histdlg code{ background:rgba(0,0,0,.12); padding:0 3px; font:11px ui-monospace,Menlo,Consolas,monospace; }
  #histdlg .hf{ display:flex; gap:6px; padding:5px 10px; border-top:1px solid var(--dk); background:var(--hd); }
  #histdlg button{ background:var(--dk); color:#fff; font:700 11px inherit; padding:2px 10px; border-radius:3px; box-shadow:inset 0 -2px 0 #222; cursor:pointer; }`;
  document.head.appendChild(css);
  el.title = 'click: show the latest update notes (history.md)'; el.setAttribute('role', 'button'); el.tabIndex = 0;
  const dlg = document.createElement('dialog'); dlg.id = 'histdlg';
  dlg.innerHTML = '<div class="hh"><span>Update history</span><button type="button" id="hclose">close</button></div><div class="hb" id="hbody"></div><div class="hf"><button type="button" id="hall">show all versions</button></div>';
  document.body.appendChild(dlg);
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  function render(md) {                      // minimal markdown: "## " = version heading, "- " = bullet, "**" bold, "`" code
    let h = '', open = false;
    md.split('\n').forEach(l => {
      if (/^## /.test(l)) { if (open) h += '</ul>'; open = false; h += '<h3>' + inline(l.slice(3)) + '</h3>'; }
      else if (/^- /.test(l)) { if (!open) { h += '<ul>'; open = true; } h += '<li>' + inline(l.slice(2)) + '</li>'; }
    });
    return h + (open ? '</ul>' : '');
  }
  let sections = null, all = false;
  const show = () => {
    $b = document.getElementById('hbody');
    $b.innerHTML = sections ? render((all ? sections : sections.slice(0, 1)).join('\n')) : '<p>history.md を読み込めませんでした。<code>python3 -m http.server</code> などで開くと表示できます。ファイルは <a href="history.md" target="_blank">history.md</a> です。</p>';
    document.getElementById('hall').textContent = all ? 'show latest only' : 'show all versions';
    document.getElementById('hall').hidden = !sections || sections.length < 2;
  };
  let $b;
  async function open() {
    all = false;
    if (!sections) {
      try { const r = await fetch('history.md', {cache: 'no-cache'}); if (!r.ok) throw 0; const t = await r.text(); sections = t.split(/^(?=## )/m).filter(s => /^## /.test(s)); }
      catch (e) { sections = null; }
    }
    show(); dlg.showModal();
  }
  el.addEventListener('click', open); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', e => e.stopPropagation());
  document.getElementById('hclose').onclick = () => dlg.close();
  document.getElementById('hall').onclick = () => { all = !all; show(); };
})();
