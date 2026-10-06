/* Critter Notes: a board, a free canvas of cards and arrows, filling the middle of the window.
   doc.board = { cards: [{ id, x, y, w, text, doc, color }], links: [{ id, a, b, label }] }.
   Mouse: right-click (or double-click) the canvas for a card; Enter finishes writing, Shift+Enter or Ctrl+Enter starts a
   new line; drag from a card's edge to another card for an arrow (or to the canvas for a new card on its end);
   double-click an arrow to write on it; right-click a card or arrow for everything else; drag the canvas to move around.
   Keyboard: Tab to a card, Enter to write in it, arrow keys move it, Delete removes it, N makes a new card. */
const BOARD = (() => {
  const COLORS = ['', '#f5a524', '#f87171', '#34d399', '#60a5fa', '#e879f9', '#2dd4bf'];
  const views = new Map();
  const EDGE = 9;   // how close to a card's edge a drag draws an arrow
  function render(host, d, o) {
    d.board = d.board || { cards: [], links: [] };
    const B = d.board; B.cards = B.cards || []; B.links = B.links || [];
    host.replaceChildren(); host.classList.add('boardhost');
    const ro = !!o.ro;
    const stage = h('div', { class: 'bstage' }), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('blinks'); stage.append(svg);
    const help = h('p', { class: 'bhelp hint', text: ro ? 'An empty board.' : 'Right-click for a card. Drag documents in from the sidebar. Drag from a card\'s edge to draw an arrow.' });
    let view = views.get(d.id) || { k: 1, x: 40, y: 40 }, sel = null;
    const bar = h('div', { class: 'bbar' },
      ro ? null : ib('plus', 'New card (N)', () => addCard(centre())), ro ? null : ib('note', 'Card for a document', e => docCard(e.currentTarget.getBoundingClientRect(), centre())),
      ib('zout', 'Zoom out', () => zoom(1 / 1.25)), ib('zin', 'Zoom in', () => zoom(1.25)), ib('fit', 'Fit everything', fit));
    host.append(stage, bar, help);
    const save = () => o.onChange();
    const toWorld = (cx, cy) => { const r = host.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; };
    function centre() { const r = host.getBoundingClientRect(); return toWorld(r.left + r.width / 2 - 110 * view.k, r.top + r.height / 2 - 40 * view.k); }
    const apply = () => { stage.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; views.set(d.id, view); };
    function zoom(f, cx, cy) { const r = host.getBoundingClientRect(); if (cx === undefined) { cx = r.width / 2; cy = r.height / 2; } const k2 = Math.max(0.2, Math.min(2.5, view.k * f)); view = { k: k2, x: cx - (cx - view.x) * (k2 / view.k), y: cy - (cy - view.y) * (k2 / view.k) }; apply(); }
    function fit() {
      if (!B.cards.length) { view = { k: 1, x: 60, y: 70 }; apply(); return; }
      const r = host.getBoundingClientRect(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of B.cards) { const e = stage.querySelector(`[data-id="${c.id}"]`), hh = e ? e.offsetHeight : 80; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + (c.w || 220)); y1 = Math.max(y1, c.y + hh); }
      const k = Math.max(0.2, Math.min(1.1, Math.min((r.width - 120) / (x1 - x0), (r.height - 140) / (y1 - y0))));
      view = { k, x: r.width / 2 - ((x0 + x1) / 2) * k, y: 30 + (r.height - 30) / 2 - ((y0 + y1) / 2) * k }; apply();
    }
    function addCard(at, extra = {}, write = true) {
      const c = { id: 'c' + Math.random().toString(36).slice(2, 9), x: Math.round(at.x), y: Math.round(at.y), w: 220, text: '', color: '', ...extra };
      B.cards.push(c); save(); draw(); const e = stage.querySelector(`[data-id="${c.id}"]`);
      if (!c.doc && write) edit(c, e); else if (e) e.focus();
      return c;
    }
    async function docCard(rect, at) { const x = await ED.pickDoc(rect, '', d.id, { title: 'A card for a document' }); if (x) addCard(at, { doc: x.id }); }
    function cardEl(c) {
      const t = c.doc && D(c.doc);
      const e = h('div', { class: 'bcard' + (c.doc ? ' isdoc' : '') + (sel === c.id ? ' sel' : ''), tabIndex: 0, role: 'group', 'data-id': c.id, style: `left:${c.x}px;top:${c.y}px;width:${c.w || 220}px;${c.color ? `--c:${c.color}` : t ? `--c:${typeColor(t)}` : ''}`, 'aria-label': t ? `Card for the document ${t.title}` : 'Card: ' + (MD.plain(c.text).slice(0, 80) || 'empty') });
      if (t) {
        const txt = MD.plain(t.body).replace(/\s+/g, ' ').trim();
        e.append(h('div', { class: 'bdh' }, h('span', { html: icon(TYPES[t.type].icon) }), h('b', { text: t.title })), txt ? h('p', { text: txt.slice(0, 160) + (txt.length > 160 ? '…' : '') }) : null);
      } else if (c.doc) e.append(h('p', { class: 'hint', text: 'That document is gone.' }));
      else { const b = h('div', { class: 'bmd prose' }); b.innerHTML = c.text.trim() ? MD.render(c.text, renderCtx()) : '<p class="hint">Empty card</p>'; e.append(b); }
      e.addEventListener('pointerdown', ev => down(ev, c, e));
      e.addEventListener('pointermove', ev => { if (!ro && !ev.buttons) e.classList.toggle('edge', nearEdge(ev, e)); });
      e.addEventListener('pointerleave', () => e.classList.remove('edge'));
      e.addEventListener('dblclick', ev => { ev.stopPropagation(); if (t) openDoc(t.id); else if (!ro) edit(c, e); });
      e.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); select(c.id); cardMenu(c, ev); });
      e.addEventListener('focus', () => select(c.id));
      e.addEventListener('keydown', ev => {
        if (ev.target !== e) return;
        const step = ev.shiftKey ? 50 : 10, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
        if (mv && !ro) { ev.preventDefault(); c.x += mv[0]; c.y += mv[1]; e.style.left = c.x + 'px'; e.style.top = c.y + 'px'; drawLinks(); save(); }
        else if (ev.key === 'Enter') { ev.preventDefault(); if (t) openDoc(t.id); else if (!ro) edit(c, e); }
        else if ((ev.key === 'Delete' || ev.key === 'Backspace') && !ro) { ev.preventDefault(); remove(c); }
        else if (ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey)) { ev.preventDefault(); const r = e.getBoundingClientRect(); cardMenu(c, { clientX: r.left + 20, clientY: r.bottom }); }
      });
      e.addEventListener('click', ev => { const a = ev.target.closest('a,button'); if (a && !t) readerClick(ev, d); });
      return e;
    }
    const nearEdge = (ev, e) => { const r = e.getBoundingClientRect(), m = EDGE * Math.max(0.6, view.k); return ev.clientX - r.left < m || r.right - ev.clientX < m || ev.clientY - r.top < m || r.bottom - ev.clientY < m; };
    // writing on a card: Enter finishes, Shift+Enter or Ctrl+Enter a new line, Escape too
    function edit(c, e) {
      if (ro) return;
      const ta = h('textarea', { class: 'bta', value: c.text, 'aria-label': 'What the card says', placeholder: 'Write. Enter finishes; Shift+Enter for a new line.' });
      e.replaceChildren(ta); e.classList.add('writing'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      const fitTa = () => { ta.style.height = 'auto'; ta.style.height = Math.max(64, ta.scrollHeight) + 'px'; }; fitTa();
      ta.addEventListener('input', () => { c.text = ta.value; fitTa(); save(); drawLinks(); });
      ta.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); const p = ta.selectionStart; ta.setRangeText('\n', p, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); return; }
        if ((ev.key === 'Enter' && !ev.shiftKey) || ev.key === 'Escape') { ev.preventDefault(); ta.blur(); }
      });
      ta.addEventListener('pointerdown', ev => ev.stopPropagation());
      ta.addEventListener('blur', () => { if (!c.text.trim() && !c.doc) { B.cards = B.cards.filter(x => x !== c); B.links = B.links.filter(l => l.a !== c.id && l.b !== c.id); save(); } draw(); const n = stage.querySelector(`[data-id="${c.id}"]`); if (n) n.focus(); });
    }
    function remove(c) { B.cards = B.cards.filter(x => x !== c); const gone = B.links.filter(l => l.a === c.id || l.b === c.id); B.links = B.links.filter(l => !gone.includes(l)); sel = null; save(); draw(); toast('Card removed.', { label: 'Undo', fn: () => { B.cards.push(c); B.links.push(...gone); save(); draw(); } }); }
    function select(id) { sel = id; stage.querySelectorAll('.bcard').forEach(x => x.classList.toggle('sel', x.dataset.id === id)); }
    // a card's menu: send it, make it a document, colour it, and the rest
    function cardMenu(c, ev) {
      const t = c.doc && D(c.doc), md = t ? `**${t.title}**\n\n${t.body}` : c.text, e = stage.querySelector(`[data-id="${c.id}"]`);
      menu([
        t ? { label: 'Open ' + t.title, icon: 'open', fn: () => openDoc(t.id) } : (ro ? null : { label: 'Write on it', icon: 'edit', fn: () => edit(c, e) }),
        '-',
        { label: 'Send to the table chat', icon: 'send', disabled: !TABLE.on() || !md.trim(), fn: () => VIEWS.say(md) },
        ...(TABLE.on() ? TABLE.players().map(p => ({ label: 'Whisper it to ' + p.name, icon: 'character', disabled: !md.trim(), fn: () => VIEWS.say(md, p.id) })) : []),
        t ? { label: 'Send the document to the table…', icon: 'table', disabled: !TABLE.on(), fn: () => VIEWS.sendMenu(t, { x: ev.clientX, y: ev.clientY }) } : null,
        !t && !ro ? { label: 'Make it a document…', icon: 'note', disabled: !c.text.trim(), fn: () => makeDoc(c, ev) } : null,
        !t && !ro ? { label: 'Add it to a document…', icon: 'plus', disabled: !c.text.trim(), fn: async () => { const x = await ED.pickDoc({ left: ev.clientX, bottom: ev.clientY }, '', d.id, { title: 'Add the card to…' }); if (!x) return; const td = D(x.id); td.body = td.body.trimEnd() + '\n\n' + c.text.trim() + '\n'; touch(td); toast(`Added to ${td.title}.`); } } : null,
        ro ? null : '-',
        ...(ro ? [] : COLORS.map(col => ({ label: col ? 'Colour' : 'No colour', icon: 'pie', color: col || null, check: (c.color || '') === col, fn: () => { c.color = col; save(); draw(); } }))),
        ro ? null : '-',
        ro ? null : { label: 'Duplicate', icon: 'copy', fn: () => { addCard({ x: c.x + 30, y: c.y + 30 }, { text: c.text, doc: c.doc, color: c.color, w: c.w }, false); } },
        ro ? null : { label: 'Remove the card', icon: 'trash', cls: 'bad', fn: () => remove(c) }
      ].filter(Boolean).filter((x, i, l) => !(x === '-' && (i === 0 || l[i - 1] === '-' || i === l.length - 1))), { x: ev.clientX, y: ev.clientY });
    }
    function makeDoc(c, ev) {
      menu([{ head: 'Make it a…' }, ...['note', 'character', 'location', 'faction', 'item', 'quest', 'event', 'lore'].map(k => ({ label: TYPES[k].name, icon: TYPES[k].icon, color: TYPES[k].color, fn: () => {
        const lines = c.text.trim().split('\n'), title = MD.plainInline(lines[0]).replace(/[\[\]|#]/g, '').slice(0, 80) || 'From the board';
        const x = newDoc({ type: k, title, body: lines.slice(1).join('\n').trim() + '\n' });
        c.doc = x.id; c.text = ''; save(); draw(); renderSide(); toast(`"${x.title}" is a document now; the card stands for it.`);
      } }))], { x: ev.clientX, y: ev.clientY });
    }
    function down(ev, c, e) {
      if (ev.button !== 0 || ev.target.closest('textarea,a,button')) return;
      ev.stopPropagation();
      if (!ro && nearEdge(ev, e)) return drawArrow(ev, c, e);
      const sx = ev.clientX, sy = ev.clientY, x0 = c.x, y0 = c.y; let moved = false; e.setPointerCapture(ev.pointerId);
      const mv = m => { if (ro) return; const dx = (m.clientX - sx) / view.k, dy = (m.clientY - sy) / view.k; if (!moved && Math.hypot(dx, dy) < 3) return; moved = true; c.x = Math.round(x0 + dx); c.y = Math.round(y0 + dy); e.style.left = c.x + 'px'; e.style.top = c.y + 'px'; drawLinks(); };
      const up = () => { e.removeEventListener('pointermove', mv); e.removeEventListener('pointerup', up); if (moved) save(); };
      e.addEventListener('pointermove', mv); e.addEventListener('pointerup', up);
    }
    // an arrow pulled out of a card's edge: onto another card, or onto the canvas for a new card at its end
    function drawArrow(ev, c, e) {
      ev.preventDefault();
      const ca = { x: e.offsetLeft + e.offsetWidth / 2, y: e.offsetTop + e.offsetHeight / 2 };
      const tmp = document.createElementNS(svg.namespaceURI, 'line'); tmp.setAttribute('class', 'bl tmp'); tmp.setAttribute('marker-end', 'url(#barr)'); tmp.setAttribute('x1', ca.x); tmp.setAttribute('y1', ca.y); tmp.setAttribute('x2', ca.x); tmp.setAttribute('y2', ca.y); svg.append(tmp);
      host.classList.add('linking'); host.setPointerCapture(ev.pointerId);
      const cardUnder = m => { const el = document.elementFromPoint(m.clientX, m.clientY); return el && el.closest ? el.closest('.bcard') : null; };
      const mv = m => { const p = toWorld(m.clientX, m.clientY); tmp.setAttribute('x2', p.x); tmp.setAttribute('y2', p.y); stage.querySelectorAll('.bcard.target').forEach(x => x.classList.remove('target')); const tc = cardUnder(m); if (tc && tc !== e) tc.classList.add('target'); };
      const up = m => {
        host.removeEventListener('pointermove', mv); host.removeEventListener('pointerup', up); host.classList.remove('linking'); tmp.remove();
        stage.querySelectorAll('.bcard.target').forEach(x => x.classList.remove('target'));
        const p = toWorld(m.clientX, m.clientY); if (Math.hypot(p.x - ca.x, p.y - ca.y) < 40) return;
        const tc = cardUnder(m), lid = 'l' + Math.random().toString(36).slice(2, 8);
        if (tc && tc !== e) { if (!B.links.some(l => l.a === c.id && l.b === tc.dataset.id)) B.links.push({ id: lid, a: c.id, b: tc.dataset.id, label: '' }); save(); drawLinks(); }
        else if (!tc) { const n = addCard({ x: p.x - 110, y: p.y - 30 }, {}, false); B.links.push({ id: lid, a: c.id, b: n.id, label: '' }); save(); draw(); edit(n, stage.querySelector(`[data-id="${n.id}"]`)); }
      };
      host.addEventListener('pointermove', mv); host.addEventListener('pointerup', up);
    }
    function drawLinks() {
      svg.replaceChildren();
      const defs = document.createElementNS(svg.namespaceURI, 'defs'); defs.innerHTML = '<marker id="barr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker>'; svg.append(defs);
      for (const l of B.links) {
        const a = stage.querySelector(`[data-id="${l.a}"]`), b = stage.querySelector(`[data-id="${l.b}"]`); if (!a || !b) continue;
        const ca = { x: a.offsetLeft + a.offsetWidth / 2, y: a.offsetTop + a.offsetHeight / 2 }, cb = { x: b.offsetLeft + b.offsetWidth / 2, y: b.offsetTop + b.offsetHeight / 2 };
        const edge = (c, e2, to) => { const dx = to.x - c.x, dy = to.y - c.y, sx = (e2.offsetWidth / 2 + 6) / Math.abs(dx || 1e-6), sy = (e2.offsetHeight / 2 + 6) / Math.abs(dy || 1e-6), s = Math.min(sx, sy); return { x: c.x + dx * s, y: c.y + dy * s }; };
        const p = edge(ca, a, cb), q = edge(cb, b, ca), mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const line = document.createElementNS(svg.namespaceURI, 'line');
        Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, 'marker-end': 'url(#barr)', class: 'bl' }).forEach(([k, v]) => line.setAttribute(k, v));
        const hit = document.createElementNS(svg.namespaceURI, 'line'); Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: 'blhit' }).forEach(([k, v]) => hit.setAttribute(k, v));
        const hitTitle = document.createElementNS(svg.namespaceURI, 'title'); hitTitle.textContent = ro ? (l.label || 'Arrow') : 'Double-click to write on it; right-click for more'; hit.append(hitTitle);
        hit.addEventListener('dblclick', ev => { ev.stopPropagation(); if (!ro) labelEdit(l, mid); });
        hit.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); if (!ro) linkMenu(l, ev, mid); });
        hit.addEventListener('pointerdown', ev => ev.stopPropagation());
        svg.append(line, hit);
        if (l.label) { const t = document.createElementNS(svg.namespaceURI, 'text'); t.setAttribute('x', mid.x); t.setAttribute('y', mid.y - 6); t.setAttribute('class', 'blt'); t.textContent = l.label; t.addEventListener('dblclick', ev => { ev.stopPropagation(); if (!ro) labelEdit(l, mid); }); t.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); if (!ro) linkMenu(l, ev, mid); }); t.addEventListener('pointerdown', ev => ev.stopPropagation()); svg.append(t); }
      }
    }
    // the words on an arrow, written where they sit
    function labelEdit(l, mid) {
      stage.querySelectorAll('.blinput').forEach(x => x.remove());
      const inp = h('input', { type: 'text', class: 'blinput', value: l.label || '', placeholder: 'leads to…', 'aria-label': 'Words on the arrow', style: `left:${mid.x}px;top:${mid.y}px` });
      stage.append(inp); inp.focus(); inp.select();
      const done = keep => { if (!inp.isConnected) return; if (keep) { l.label = inp.value.trim().slice(0, 60); save(); } inp.remove(); drawLinks(); };
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true)); inp.addEventListener('pointerdown', e => e.stopPropagation());
    }
    function linkMenu(l, ev, mid) {
      menu([{ label: l.label ? 'Change its words' : 'Write on the arrow', icon: 'edit', fn: () => labelEdit(l, mid) },
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
    // the canvas: right-click or double-click for a card, drag to move around, the wheel to zoom
    host.addEventListener('contextmenu', ev => { if (ev.target.closest('.bcard,.bbar') || ro) return; ev.preventDefault(); const p = toWorld(ev.clientX, ev.clientY); addCard({ x: p.x - 20, y: p.y - 20 }); });
    host.addEventListener('dblclick', ev => { if (ev.target.closest('.bcard,.bbar,.blinput,.blhit,.blt') || ro) return; const p = toWorld(ev.clientX, ev.clientY); addCard({ x: p.x - 20, y: p.y - 20 }); });
    host.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.bcard,.bbar,.blinput,.blhit,.blt') || ev.button !== 0) return;
      sel = null; stage.querySelectorAll('.bcard.sel').forEach(x => x.classList.remove('sel'));
      const sx = ev.clientX, sy = ev.clientY, v0 = { ...view }; host.setPointerCapture(ev.pointerId); host.classList.add('grab');
      const mv = m => { view = { ...v0, x: v0.x + m.clientX - sx, y: v0.y + m.clientY - sy }; apply(); };
      const up = () => { host.removeEventListener('pointermove', mv); host.removeEventListener('pointerup', up); host.classList.remove('grab'); };
      host.addEventListener('pointermove', mv); host.addEventListener('pointerup', up);
    });
    host.addEventListener('wheel', ev => { ev.preventDefault(); const r = host.getBoundingClientRect(); zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });
    host.addEventListener('dragover', ev => { if (ev.dataTransfer.types.includes('text/x-cn-doc')) ev.preventDefault(); });
    host.addEventListener('drop', ev => { const id = ev.dataTransfer.getData('text/x-cn-doc'); if (!id || !D(id) || ro) return; ev.preventDefault(); const p = toWorld(ev.clientX, ev.clientY); addCard({ x: p.x - 100, y: p.y - 30 }, { doc: id }); });
    host.addEventListener('keydown', ev => { if (ev.target === host && !ro && (ev.key === 'n' || ev.key === 'N')) { ev.preventDefault(); addCard(centre()); } });
    host.tabIndex = 0; host.setAttribute('role', 'application'); host.setAttribute('aria-label', `Board with ${B.cards.length} cards. Press N for a new card; Tab moves between cards; Enter writes in one.`);
    const first = !views.has(d.id);
    apply(); draw();
    if (first) fit();
  }
  return { render };
})();
