/* Critter Notes: a board, a free canvas of cards and arrows. doc.board = { cards: [{ id, x, y, w, text, doc, color }],
   links: [{ id, a, b, label }] }. A card holds a few lines of Markdown, or stands for a document.
   Mouse: double-click the canvas for a card, drag cards, drag documents in from the sidebar, "Connect" then two cards.
   Keyboard: Tab to a card, Enter to write in it (Escape to stop), arrow keys move it, Delete removes it. */
const BOARD = (() => {
  const COLORS = ['', '#f5a524', '#f87171', '#34d399', '#60a5fa', '#e879f9', '#2dd4bf'];
  const views = new Map();
  function render(host, d, o) {
    d.board = d.board || { cards: [], links: [] };
    const B = d.board; B.cards = B.cards || []; B.links = B.links || [];
    host.replaceChildren(); host.classList.add('boardhost');
    const stage = h('div', { class: 'bstage' }), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('blinks'); stage.append(svg);
    const help = h('p', { class: 'bhelp hint', text: 'Double-click for a card. Drag documents in from the sidebar. Connect joins two cards.' });
    let view = views.get(d.id) || { k: 1, x: 40, y: 40 }, sel = null, connecting = null;
    const connectBtn = h('button', { type: 'button', class: 'ib', title: 'Connect two cards with an arrow', 'aria-label': 'Connect two cards', 'aria-pressed': 'false', html: icon('link'), onclick: () => setConnect(!connecting) });
    const bar = h('div', { class: 'bbar' },
      ib('plus', 'New card (N)', () => addCard(centre())), ib('note', 'Card for a document', e => docMenu(e.currentTarget)), connectBtn,
      ib('zout', 'Zoom out', () => zoom(1 / 1.25)), ib('zin', 'Zoom in', () => zoom(1.25)), ib('fit', 'Fit everything', fit));
    const tools = h('div', { class: 'btools', hidden: true });
    host.append(stage, bar, tools, help);
    const save = () => o.onChange();
    function setConnect(v) { connecting = v ? { from: null } : null; connectBtn.classList.toggle('on', !!v); connectBtn.setAttribute('aria-pressed', String(!!v)); host.classList.toggle('connecting', !!v); if (v) toast('Choose the card the arrow starts from, then the one it points to.'); }
    function centre() { const r = host.getBoundingClientRect(); return { x: (r.width / 2 - view.x) / view.k - 100, y: (r.height / 2 - view.y) / view.k - 40 }; }
    const apply = () => { stage.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; views.set(d.id, view); };
    function zoom(f, cx, cy) { const r = host.getBoundingClientRect(); if (cx === undefined) { cx = r.width / 2; cy = r.height / 2; } const k2 = Math.max(0.2, Math.min(2.5, view.k * f)); view = { k: k2, x: cx - (cx - view.x) * (k2 / view.k), y: cy - (cy - view.y) * (k2 / view.k) }; apply(); }
    function fit() {
      if (!B.cards.length) { view = { k: 1, x: 40, y: 40 }; apply(); return; }
      const r = host.getBoundingClientRect(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of B.cards) { const e = stage.querySelector(`[data-id="${c.id}"]`), hh = e ? e.offsetHeight : 80; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + (c.w || 220)); y1 = Math.max(y1, c.y + hh); }
      const k = Math.max(0.2, Math.min(1.1, Math.min((r.width - 80) / (x1 - x0), (r.height - 120) / (y1 - y0))));
      view = { k, x: r.width / 2 - ((x0 + x1) / 2) * k, y: 24 + (r.height - 24) / 2 - ((y0 + y1) / 2) * k }; apply();
    }
    function addCard(at, extra = {}) {
      const c = { id: 'c' + Math.random().toString(36).slice(2, 9), x: Math.round(at.x), y: Math.round(at.y), w: 220, text: '', color: '', ...extra };
      B.cards.push(c); save(); draw(); const e = stage.querySelector(`[data-id="${c.id}"]`);
      if (!c.doc) edit(c, e); else e.focus();
      return c;
    }
    function docMenu(at) { menu([{ head: 'A card for…' }, ...[...A.docs.values()].filter(x => x.id !== d.id).sort((a, b) => b.updated - a.updated).slice(0, 20).map(x => ({ label: x.title, icon: TYPES[x.type].icon, color: typeColor(x), fn: () => addCard(centre(), { doc: x.id }) }))], at); }
    function cardEl(c) {
      const t = c.doc && D(c.doc);
      const e = h('div', { class: 'bcard' + (c.doc ? ' isdoc' : '') + (sel === c.id ? ' sel' : ''), tabIndex: 0, role: 'group', 'data-id': c.id, style: `left:${c.x}px;top:${c.y}px;width:${c.w || 220}px;${c.color ? `--c:${c.color}` : t ? `--c:${typeColor(t)}` : ''}`, 'aria-label': t ? `Card for the document ${t.title}` : 'Card: ' + (MD.plain(c.text).slice(0, 80) || 'empty') });
      if (t) {
        const txt = MD.plain(t.body).replace(/\s+/g, ' ').trim();
        e.append(h('div', { class: 'bdh' }, h('span', { html: icon(TYPES[t.type].icon) }), h('b', { text: t.title })), txt ? h('p', { text: txt.slice(0, 160) + (txt.length > 160 ? '…' : '') }) : null);
      } else if (c.doc) e.append(h('p', { class: 'hint', text: 'That document is gone.' }));
      else { const b = h('div', { class: 'bmd prose' }); b.innerHTML = c.text.trim() ? MD.render(c.text, renderCtx()) : '<p class="hint">Empty card</p>'; e.append(b); }
      e.addEventListener('pointerdown', ev => down(ev, c, e));
      e.addEventListener('dblclick', ev => { ev.stopPropagation(); if (t) openDoc(t.id); else edit(c, e); });
      e.addEventListener('focus', () => select(c.id));
      e.addEventListener('keydown', ev => {
        if (ev.target !== e) return;
        const step = ev.shiftKey ? 50 : 10, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
        if (mv) { ev.preventDefault(); c.x += mv[0]; c.y += mv[1]; e.style.left = c.x + 'px'; e.style.top = c.y + 'px'; drawLinks(); save(); }
        else if (ev.key === 'Enter') { ev.preventDefault(); if (t) openDoc(t.id); else edit(c, e); }
        else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); remove(c); }
      });
      e.addEventListener('click', ev => { const a = ev.target.closest('a,button'); if (a && !t) { readerClick(ev, d); } });
      return e;
    }
    function edit(c, e) {
      const ta = h('textarea', { class: 'bta', value: c.text, 'aria-label': 'What the card says', placeholder: 'Write. [[ links work here too.' });
      e.replaceChildren(ta); ta.focus();
      const fitTa = () => { ta.style.height = 'auto'; ta.style.height = Math.max(70, ta.scrollHeight) + 'px'; }; fitTa();
      ta.addEventListener('input', () => { c.text = ta.value; fitTa(); save(); });
      ta.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); ta.blur(); } });
      ta.addEventListener('pointerdown', ev => ev.stopPropagation());
      ta.addEventListener('blur', () => { if (!c.text.trim() && !c.doc) { B.cards = B.cards.filter(x => x !== c); save(); } draw(); const n = stage.querySelector(`[data-id="${c.id}"]`); if (n) n.focus(); });
    }
    function remove(c) { B.cards = B.cards.filter(x => x !== c); B.links = B.links.filter(l => l.a !== c.id && l.b !== c.id); sel = null; save(); draw(); toast('Card removed.', { label: 'Undo', fn: () => { B.cards.push(c); save(); draw(); } }); }
    function select(id) {
      sel = id; stage.querySelectorAll('.bcard').forEach(x => x.classList.toggle('sel', x.dataset.id === id));
      const c = B.cards.find(x => x.id === id); if (!c) { tools.hidden = true; return; }
      tools.replaceChildren(...COLORS.map(col => h('button', { type: 'button', class: 'sw' + ((c.color || '') === col ? ' on' : ''), style: `--c:${col || 'var(--panel3)'}`, title: col ? 'Colour' : 'No colour', 'aria-label': col ? 'Colour ' + col : 'No colour', onclick: () => { c.color = col; save(); draw(); select(c.id); } })),
        ib('trash', 'Remove the card (Delete)', () => remove(c)));
      tools.hidden = false;
    }
    function down(ev, c, e) {
      if (ev.button !== 0 || ev.target.closest('textarea,a,button')) return;
      ev.stopPropagation();
      if (connecting) {
        if (!connecting.from) { connecting.from = c.id; e.classList.add('from'); return; }
        if (connecting.from !== c.id) { B.links.push({ id: 'l' + Math.random().toString(36).slice(2, 8), a: connecting.from, b: c.id, label: '' }); save(); }
        setConnect(false); draw(); return;
      }
      const sx = ev.clientX, sy = ev.clientY, x0 = c.x, y0 = c.y; let moved = false; e.setPointerCapture(ev.pointerId);
      const mv = m => { const dx = (m.clientX - sx) / view.k, dy = (m.clientY - sy) / view.k; if (!moved && Math.hypot(dx, dy) < 3) return; moved = true; c.x = Math.round(x0 + dx); c.y = Math.round(y0 + dy); e.style.left = c.x + 'px'; e.style.top = c.y + 'px'; drawLinks(); };
      const up = () => { e.removeEventListener('pointermove', mv); e.removeEventListener('pointerup', up); if (moved) save(); };
      e.addEventListener('pointermove', mv); e.addEventListener('pointerup', up);
    }
    function drawLinks() {
      svg.replaceChildren();
      const defs = document.createElementNS(svg.namespaceURI, 'defs'); defs.innerHTML = '<marker id="barr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker>'; svg.append(defs);
      for (const l of B.links) {
        const a = stage.querySelector(`[data-id="${l.a}"]`), b = stage.querySelector(`[data-id="${l.b}"]`); if (!a || !b) continue;
        const ca = { x: a.offsetLeft + a.offsetWidth / 2, y: a.offsetTop + a.offsetHeight / 2 }, cb = { x: b.offsetLeft + b.offsetWidth / 2, y: b.offsetTop + b.offsetHeight / 2 };
        const edge = (c, e2, to) => { const dx = to.x - c.x, dy = to.y - c.y, sx = (e2.offsetWidth / 2 + 6) / Math.abs(dx || 1e-6), sy = (e2.offsetHeight / 2 + 6) / Math.abs(dy || 1e-6), s = Math.min(sx, sy); return { x: c.x + dx * s, y: c.y + dy * s }; };
        const p = edge(ca, a, cb), q = edge(cb, b, ca);
        const line = document.createElementNS(svg.namespaceURI, 'line');
        Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, 'marker-end': 'url(#barr)', class: 'bl' }).forEach(([k, v]) => line.setAttribute(k, v));
        const hit = document.createElementNS(svg.namespaceURI, 'line'); Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: 'blhit' }).forEach(([k, v]) => hit.setAttribute(k, v));
        hit.addEventListener('click', ev => { ev.stopPropagation(); linkMenu(l, ev); });
        svg.append(line, hit);
        if (l.label) { const t = document.createElementNS(svg.namespaceURI, 'text'); t.setAttribute('x', (p.x + q.x) / 2); t.setAttribute('y', (p.y + q.y) / 2 - 6); t.setAttribute('class', 'blt'); t.textContent = l.label; t.addEventListener('click', ev => { ev.stopPropagation(); linkMenu(l, ev); }); svg.append(t); }
      }
    }
    function linkMenu(l, ev) {
      menu([{ label: l.label ? 'Change its words' : 'Write on the arrow', icon: 'edit', fn: async () => { const t = await ask('Words on the arrow', l.label, { placeholder: 'leads to, if they fail…' }); if (t !== null) { l.label = t; save(); drawLinks(); } } },
        { label: 'Turn it around', icon: 'refresh', fn: () => { [l.a, l.b] = [l.b, l.a]; save(); drawLinks(); } },
        { label: 'Remove the arrow', icon: 'trash', cls: 'bad', fn: () => { B.links = B.links.filter(x => x !== l); save(); drawLinks(); } }], { x: ev.clientX, y: ev.clientY });
    }
    function draw() {
      stage.querySelectorAll('.bcard').forEach(e => e.remove());
      for (const c of B.cards) stage.append(cardEl(c));
      drawLinks();
      help.hidden = B.cards.length > 0;
      hydrate(stage);
    }
    host.addEventListener('dblclick', ev => { if (ev.target.closest('.bcard,.bbar,.btools')) return; const r = host.getBoundingClientRect(); addCard({ x: (ev.clientX - r.left - view.x) / view.k - 20, y: (ev.clientY - r.top - view.y) / view.k - 20 }); });
    host.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.bcard,.bbar,.btools') || ev.button !== 0) return;
      if (connecting) setConnect(false);
      sel = null; stage.querySelectorAll('.bcard.sel').forEach(x => x.classList.remove('sel')); tools.hidden = true;
      const sx = ev.clientX, sy = ev.clientY, v0 = { ...view }; host.setPointerCapture(ev.pointerId); host.classList.add('grab');
      const mv = m => { view = { ...v0, x: v0.x + m.clientX - sx, y: v0.y + m.clientY - sy }; apply(); };
      const up = () => { host.removeEventListener('pointermove', mv); host.removeEventListener('pointerup', up); host.classList.remove('grab'); };
      host.addEventListener('pointermove', mv); host.addEventListener('pointerup', up);
    });
    host.addEventListener('wheel', ev => { ev.preventDefault(); const r = host.getBoundingClientRect(); zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });
    host.addEventListener('dragover', ev => { if (ev.dataTransfer.types.includes('text/x-cn-doc')) ev.preventDefault(); });
    host.addEventListener('drop', ev => { const id = ev.dataTransfer.getData('text/x-cn-doc'); if (!id || !D(id)) return; ev.preventDefault(); const r = host.getBoundingClientRect(); addCard({ x: (ev.clientX - r.left - view.x) / view.k - 100, y: (ev.clientY - r.top - view.y) / view.k - 30 }, { doc: id }); });
    host.addEventListener('keydown', ev => { if (ev.target === host && (ev.key === 'n' || ev.key === 'N')) { ev.preventDefault(); addCard(centre()); } });
    host.tabIndex = 0; host.setAttribute('role', 'application'); host.setAttribute('aria-label', `Board with ${B.cards.length} cards. Press N for a new card; Tab moves between cards.`);
    const first = !views.has(d.id);
    apply(); draw();
    if (first) fit();
  }
  return { render };
})();
