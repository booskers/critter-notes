/* Critter Notes: a map is a picture with pins. A pin points at a document (a town, a dungeon, another map to go
   deeper), so the map is a way into the campaign. doc.map = { img, w, h, pins: [{ id, x, y, label, doc, color }] }
   with x and y from 0 to 1 across the picture. */
const MAPV = (() => {
  const COLORS = ['#f5a524', '#f87171', '#34d399', '#60a5fa', '#e879f9', '#2dd4bf', '#fbbf24', '#e5e7eb'];
  // o: { url, docs: Map, titleOf(id), typeOf(id), onChange(), onOpen(id), preview(id) -> html, pickDoc(query) -> [{id,title,type}], create(title, type) -> id, view, onView(v) }
  function render(host, doc, o) {
    host.replaceChildren(); host.classList.add('maphost');
    const M = doc.map;
    const stage = el('div', 'mstage'), img = new Image(); img.className = 'mimg'; img.draggable = false; img.alt = `Map: ${doc.title}. Its pins are listed under the pin-list button.`; stage.append(img);
    const pinsL = el('div', 'mpins'), pop = el('div', 'mpop'); pop.hidden = true;
    const tip = el('div', 'mtip'); tip.hidden = true;
    const bar = el('div', 'mbar');
    let adding = false, view = o.view || null, openPin = null;
    const addBtn = tb('pin', 'Add a pin', () => setAdding(!adding)); addBtn.classList.add('addpin');
    bar.append(addBtn, tb('zin', 'Zoom in', () => zoomBy(1.3)), tb('zout', 'Zoom out', () => zoomBy(1 / 1.3)), tb('fit', 'Fit the map', fit));
    const listBtn = tb('list', 'All the pins', () => { list.hidden = !list.hidden; listBtn.classList.toggle('on', !list.hidden); drawList(); }); bar.append(listBtn);
    const list = el('div', 'mlist'); list.hidden = true;
    const edge = (M.edge || 'blur');
    stage.classList.add('edge-' + edge);
    if (edge === 'blur') { const under = new Image(); under.className = 'munder'; under.alt = ''; under.draggable = false; stage.prepend(under); img.addEventListener('load', () => { under.src = img.src; }, { once: true }); }
    if (edge === 'paper') { stage.append(el('div', 'mpaper')); img.style.clipPath = paperEdge(doc.id); stage.querySelector('.mpaper').style.clipPath = img.style.clipPath; }
    const sbar = el('div', 'mscale'); sbar.setAttribute('aria-hidden', 'true');
    host.append(stage, pinsL, bar, list, pop, tip, sbar);
    function setAdding(v) { adding = v; addBtn.classList.toggle('on', v); host.classList.toggle('adding', v); if (v) closePop(); }
    img.onload = () => { if (!M.w || !M.h || M.w !== img.naturalWidth) { M.w = img.naturalWidth; M.h = img.naturalHeight; } if (!view) fit(); else apply(); };
    img.src = o.url;
    const r = () => host.getBoundingClientRect();
    function fit() { const b = r(); if (!M.w) return; const k = Math.min((b.width - 24) / M.w, (b.height - 24) / M.h); view = { k, x: (b.width - M.w * k) / 2, y: (b.height - M.h * k) / 2 }; apply(); }
    function zoomBy(f, cx, cy) { const b = r(); if (cx === undefined) { cx = b.width / 2; cy = b.height / 2; } const k2 = Math.max(0.03, Math.min(8, view.k * f)); view = { k: k2, x: cx - (cx - view.x) * (k2 / view.k), y: cy - (cy - view.y) * (k2 / view.k) }; apply(); }
    function apply() { if (!view) return; paintScale(); stage.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`; stage.style.width = M.w + 'px'; stage.style.height = M.h + 'px'; drawPins(); if (o.onView) o.onView(view); }
    const toScreen = p => ({ x: view.x + p.x * M.w * view.k, y: view.y + p.y * M.h * view.k });
    const fromEvent = e => { const b = r(); return { x: (e.clientX - b.left - view.x) / (M.w * view.k), y: (e.clientY - b.top - view.y) / (M.h * view.k) }; };
    function drawPins() {
      pinsL.replaceChildren();
      for (const p of M.pins) {
        const s = toScreen(p), t = p.doc && o.typeOf(p.doc), e = el('div', 'mpin' + (p.doc && !t ? ' broken' : '') + (openPin === p.id ? ' open' : '') + (t === 'map' ? ' deeper' : ''));
        e.style.left = s.x + 'px'; e.style.top = s.y + 'px'; e.style.setProperty('--c', p.color || (t && TYPES[t] ? TYPES[t].color : COLORS[0]));
        e.innerHTML = `<span class="mpm">${icon(t && TYPES[t] ? TYPES[t].icon : 'pin')}</span>`;
        if (p.label) { const l = el('span', 'mpl'); l.textContent = p.label; e.append(l); }
        e.tabIndex = 0; e.setAttribute('role', 'button'); e.setAttribute('aria-label', `Pin: ${p.label || (t ? o.titleOf(p.doc) : 'unnamed')}${t ? ', leads to ' + o.titleOf(p.doc) : ''}`);
        e.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (ev.ctrlKey && p.doc && o.typeOf(p.doc)) o.onOpen(p.doc); else showPop(p); } });
        e.addEventListener('pointerdown', ev => dragPin(ev, p, e));
        e.addEventListener('dblclick', ev => { ev.stopPropagation(); if (p.doc && o.typeOf(p.doc)) o.onOpen(p.doc); });
        e.addEventListener('pointerenter', () => { if (!p.doc || openPin) return; const html = o.preview(p.doc); if (!html) return; tip.innerHTML = html; tip.hidden = false; const b = r(); tip.style.left = Math.min(b.width - 290, s.x + 16) + 'px'; tip.style.top = Math.min(b.height - 120, s.y + 10) + 'px'; });
        e.addEventListener('pointerleave', () => { tip.hidden = true; });
        pinsL.append(e);
      }
      if (openPin) placePop();
    }
    function dragPin(ev, p, e) {
      ev.stopPropagation(); if (ev.button !== 0) return;
      const sx = ev.clientX, sy = ev.clientY; let moved = false; e.setPointerCapture(ev.pointerId);
      const mv = m => { if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return; moved = true; tip.hidden = true; const q = fromEvent(m); p.x = Math.max(0, Math.min(1, q.x)); p.y = Math.max(0, Math.min(1, q.y)); const s = toScreen(p); e.style.left = s.x + 'px'; e.style.top = s.y + 'px'; if (openPin === p.id) placePop(); };
      const up = () => { e.removeEventListener('pointermove', mv); e.removeEventListener('pointerup', up); if (moved) o.onChange(); else showPop(p); };
      e.addEventListener('pointermove', mv); e.addEventListener('pointerup', up);
    }
    // the pin's card: its name, the document it leads to, its colour
    function showPop(p, fresh) {
      openPin = p.id; tip.hidden = true; pop.hidden = false; drawPins();
      const name = Object.assign(document.createElement('input'), { type: 'text', value: p.label || '', placeholder: 'What is here?', className: 'grow' });
      name.oninput = () => { p.label = name.value.slice(0, 60); o.onChange(true); const l = pinsL.querySelector('.mpin.open .mpl'); if (l) l.textContent = p.label; else drawPins(); };
      name.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') name.blur(); if (e.key === 'Escape') closePop(); };
      const linked = el('div', 'mplink');
      const drawLink = () => {
        linked.replaceChildren();
        const t = p.doc && o.typeOf(p.doc);
        if (t) {
          const a = el('button', 'btn tiny'); a.type = 'button'; a.innerHTML = icon(TYPES[t].icon) + '<span></span>'; a.querySelector('span').textContent = o.titleOf(p.doc); a.title = 'Open it'; a.onclick = () => o.onOpen(p.doc);
          const un = el('button', 'ib'); un.type = 'button'; un.innerHTML = icon('x'); un.title = 'Don\'t link this pin'; un.onclick = () => { p.doc = ''; o.onChange(); drawLink(); drawPins(); };
          linked.append(el('span', 'hint', 'Leads to'), a, un);
        } else {
          const q = Object.assign(document.createElement('input'), { type: 'text', placeholder: 'Link a document…', className: 'grow' });
          const res = el('div', 'mpres');
          const find = () => {
            res.replaceChildren();
            const v = q.value.trim(), hits = o.pickDoc(v || p.label || '').slice(0, 6);
            for (const d of hits) { const b = el('button', 'mpr'); b.type = 'button'; b.innerHTML = icon(TYPES[d.type].icon) + '<span></span>'; b.querySelector('span').textContent = d.title; b.onclick = () => { p.doc = d.id; if (!p.label) p.label = d.title; o.onChange(); showPop(p); }; res.append(b); }
            const nm = v || p.label;
            if (nm) for (const ty of ['location', 'character', 'map', 'note']) { const b = el('button', 'mpr new'); b.type = 'button'; b.innerHTML = icon('plus') + `<span>New ${TYPES[ty].name.toLowerCase()}: </span><b></b>`; b.querySelector('b').textContent = nm; b.onclick = () => { p.doc = o.create(nm, ty); if (!p.label) p.label = nm; o.onChange(); showPop(p); }; res.append(b); }
          };
          q.oninput = find; q.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') closePop(); };
          linked.append(q, res); find();
        }
      };
      drawLink();
      const sw = el('div', 'mpsw');
      for (const c of COLORS) { const b = el('button', 'sw' + ((p.color || '') === c ? ' on' : '')); b.type = 'button'; b.style.setProperty('--c', c); b.onclick = () => { p.color = c; o.onChange(); showPop(p); }; sw.append(b); }
      const auto = el('button', 'btn tiny ghost', 'Colour of its kind'); auto.type = 'button'; auto.onclick = () => { p.color = ''; o.onChange(); showPop(p); }; sw.append(auto);
      const del = el('button', 'btn tiny ghost bad'); del.type = 'button'; del.innerHTML = icon('trash') + '<span>Remove the pin</span>'; del.onclick = () => { M.pins = M.pins.filter(x => x !== p); closePop(); o.onChange(); };
      const close = el('button', 'ib'); close.type = 'button'; close.innerHTML = icon('x'); close.title = 'Close'; close.onclick = closePop;
      const head = el('div', 'row'); head.append(name, close);
      const foot = el('div', 'row'); foot.append(el('span', 'grow'), del);
      pop.replaceChildren(head, linked, sw, foot);
      placePop();
      if (fresh) { name.focus(); name.select(); }
    }
    // the card sits in the map's corner, away from the pin when the pin is on that side
    function placePop() { const p = M.pins.find(x => x.id === openPin); if (!p) return closePop(); const s = toScreen(p), b = r(); const left = s.x > b.width - 360 && s.y < pop.offsetHeight + 20; pop.style.left = left ? '10px' : 'auto'; pop.style.right = left ? 'auto' : '10px'; }
    function closePop() { if (!openPin) return; openPin = null; pop.hidden = true; drawPins(); }
    function drawList() {
      if (list.hidden) return;
      list.replaceChildren(el('div', 'sec', `${M.pins.length} pin${M.pins.length === 1 ? '' : 's'}`));
      for (const p of M.pins.slice().sort((a, b) => (a.label || '').localeCompare(b.label || ''))) {
        const t = p.doc && o.typeOf(p.doc), b = el('button', 'mlr'); b.type = 'button';
        b.innerHTML = `<i style="--c:${p.color || (t ? TYPES[t].color : COLORS[0])}"></i><span></span>`; b.querySelector('span').textContent = p.label || (t ? o.titleOf(p.doc) : 'Unnamed pin');
        b.onclick = () => { const bb = r(); const k = Math.max(view.k, 0.8); view = { k, x: bb.width / 2 - p.x * M.w * k, y: bb.height / 2 - p.y * M.h * k }; apply(); showPop(p); };
        list.append(b);
      }
      if (!M.pins.length) list.append(el('p', 'hint', 'No pins yet. Press the pin button, then click the map.'));
    }
    // panning, zooming and placing pins
    host.addEventListener('wheel', e => { if (e.target.closest('.mpop,.mlist')) return; e.preventDefault(); const b = r(); zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - b.left, e.clientY - b.top); }, { passive: false });
    host.addEventListener('pointerdown', e => {
      if (e.target.closest('.mpop,.mbar,.mlist,.mpin') || e.button !== 0) return;
      if (adding) { const q = fromEvent(e); if (q.x < 0 || q.y < 0 || q.x > 1 || q.y > 1) return; const p = { id: 'p' + Math.random().toString(36).slice(2, 10), x: q.x, y: q.y, label: '', doc: '', color: '' }; M.pins.push(p); setAdding(false); o.onChange(); showPop(p, true); return; }
      closePop();
      const sx = e.clientX, sy = e.clientY, v0 = { ...view }; host.setPointerCapture(e.pointerId); host.classList.add('grab');
      const mv = m => { view = { ...v0, x: v0.x + m.clientX - sx, y: v0.y + m.clientY - sy }; apply(); };
      const up = () => { host.removeEventListener('pointermove', mv); host.removeEventListener('pointerup', up); host.classList.remove('grab'); };
      host.addEventListener('pointermove', mv); host.addEventListener('pointerup', up);
    });
    // the scale: a bar of a round distance, as long as fits at this zoom
    function paintScale() {
      const sc = M.scale || {}; if (!(+sc.w > 0) || !M.w) { sbar.hidden = true; return; }
      const ppu = (M.w * view.k) / +sc.w; let best = null;
      for (let p = -3; p <= 6; p++) for (const m of [1, 2, 5]) { const L = m * 10 ** p, px = L * ppu; if (px >= 70 && px <= 190 && !best) best = { L, px }; }
      if (!best) { sbar.hidden = true; return; }
      sbar.hidden = false; sbar.replaceChildren(el('i'), el('span', '', `${best.L.toLocaleString()} ${sc.unit || 'miles'}`)); sbar.firstChild.style.width = best.px + 'px';
    }
    // right-click the map: a pin there, and a search for what it leads to
    host.addEventListener('contextmenu', async e => {
      if (o.ro || e.target.closest('.mpop,.mbar,.mlist,.mpin')) return; e.preventDefault();
      const q = fromEvent(e); if (q.x < 0 || q.y < 0 || q.x > 1 || q.y > 1) return;
      const p = { id: 'p' + Math.random().toString(36).slice(2, 10), x: q.x, y: q.y, label: '', doc: '', color: '' };
      M.pins.push(p); drawPins();
      const x = await ED.pickDoc({ left: e.clientX, bottom: e.clientY }, '', doc.id, { title: 'What is here?', placeholder: 'What is here? Find a document or name a new place', types: ['location', 'character', 'faction', 'map', 'note'] });
      if (!x) { M.pins = M.pins.filter(y => y !== p); drawPins(); return; }
      p.doc = x.id; p.label = x.title; o.onChange(); drawPins();
    });
    const ro = new ResizeObserver(() => { if (view) apply(); }); ro.observe(host);
    // a document dropped on the map becomes a pin where it lands
    function pinAt(e, docId, label) { if (!view) return; const q = fromEvent(e); if (q.x < 0 || q.y < 0 || q.x > 1 || q.y > 1) return; M.pins.push({ id: 'p' + Math.random().toString(36).slice(2, 10), x: q.x, y: q.y, label: label || '', doc: docId, color: '' }); o.onChange(); drawPins(); }
    return { fit, refresh: drawPins, adding: setAdding, pinAt };
  }
  // a torn, slightly uneven paper edge, the same for a map every time
  function paperEdge(seed) {
    let n = 0; for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296), pts = [], side = (k, f) => { for (let i = 0; i < 40; i++) pts.push(f(i / 40, 0.4 + rnd() * 1.6)); };
    side(0, (t, j) => `${(t * 100).toFixed(2)}% ${j.toFixed(2)}%`); side(1, (t, j) => `${(100 - j).toFixed(2)}% ${(t * 100).toFixed(2)}%`);
    side(2, (t, j) => `${(100 - t * 100).toFixed(2)}% ${(100 - j).toFixed(2)}%`); side(3, (t, j) => `${j.toFixed(2)}% ${(100 - t * 100).toFixed(2)}%`);
    return `polygon(${pts.join(',')})`;
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function tb(ic, title, fn) { const b = el('button', 'ib'); b.type = 'button'; b.innerHTML = icon(ic); b.title = title; b.onclick = e => { e.stopPropagation(); fn(); }; return b; }
  return { render, COLORS };
})();
