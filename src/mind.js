/* Critter Notes: two pictures of the writing.
   MIND: one document as a mind map. Headings, list items, callouts (alternative paths stand out) and links become
         branches; adding or renaming a branch writes it back into the text (MD.addChild / MD.rename).
   GRAPH: the whole campaign as a web: every document, joined by its links, pins and parent. */
const MIND = (() => {
  const PAL = ['#2dd4bf', '#f5a524', '#60a5fa', '#e879f9', '#34d399', '#f87171', '#a78bfa', '#fbbf24', '#38bdf8', '#fb7185'];
  const SVGNS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v); kids.forEach(k => k && e.append(k)); return e; };
  let measureCtx = null;
  const textW = (t, font) => { if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d'); measureCtx.font = font; return measureCtx.measureText(t).width; };
  function wrap(text, font, max) {
    const words = String(text || '').split(/\s+/).filter(Boolean), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (textW(t, font) > max && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/\s*\S*$/, '') + '…'; }
    return lines.length ? lines : [''];
  }
  const keyOf = n => n.kind + ':' + n.line + ':' + n.text.slice(0, 30);

  // o: { collapsed: Set, onOpen(node), onAdd(node, text), onRename(node, text), onToggle(key) }
  function render(host, root, o) {
    host.replaceChildren(); host.classList.add('mindhost');
    const svg = S('svg', { class: 'mind', width: '100%', height: '100%', role: 'group', 'aria-label': 'Mind map. Tab moves between branches; Enter picks one, Enter again goes to it.' }), world = S('g'); svg.append(world); host.append(svg);
    const tools = document.createElement('div'); tools.className = 'mindtools'; tools.hidden = true; host.append(tools);
    // sizes
    const prep = (n, depth, color) => {
      n.depth = depth; n.color = depth === 1 ? PAL[(n.idx || 0) % PAL.length] : color;
      const font = depth === 0 ? '700 17px "Segoe UI Variable Display","Segoe UI",system-ui' : n.kind === 'h' && depth <= 2 ? '650 13.5px "Segoe UI Variable Text","Segoe UI",system-ui' : '500 13px "Segoe UI Variable Text","Segoe UI",system-ui';
      n.font = font; const max = depth === 0 ? 240 : 210;
      const pre = n.kind === 'task' ? '☐ ' : '';
      n.lines = wrap(pre + n.text, font, max);
      const lh = depth === 0 ? 22 : 17;
      n.w = Math.max(depth === 0 ? 90 : 40, ...n.lines.map(l => textW(l, font))) + (n.kind === 'link' || n.kind === 'callout' ? 40 : 24);
      n.h = n.lines.length * lh + (depth === 0 ? 22 : 14); n.lh = lh;
      n.open = !o.collapsed.has(keyOf(n));
      (n.children || []).forEach((c, i) => { if (depth === 0) c.idx = i; prep(c, depth + 1, n.color); });
    };
    prep(root, 0, PAL[0]);
    const kids = n => (n.open ? n.children || [] : []);
    const VG = 12, HG = 54;
    const span = n => { const k = kids(n); n.sh = k.length ? Math.max(n.h, k.reduce((s, c) => s + span(c), 0) + VG * (k.length - 1)) : n.h; return n.sh; };
    // the top branches go right and left, whichever side is shorter
    const right = [], left = []; let rh = 0, lh2 = 0;
    for (const c of kids(root)) { const s = span(c); if (rh <= lh2) { right.push(c); rh += s + VG; } else { left.push(c); lh2 += s + VG; } }
    root.x = 0; root.y = 0;
    const place = (list, parent, dir) => {
      const total = list.reduce((s, c) => s + c.sh, 0) + VG * Math.max(0, list.length - 1);
      let y = parent.y - total / 2;
      for (const c of list) {
        c.dir = dir; c.y = y + c.sh / 2; c.x = parent.x + dir * (parent.w / 2 + HG + c.w / 2); y += c.sh + VG;
        place(kids(c), c, dir);
      }
    };
    place(right, root, 1); place(left, root, -1);
    // drawing
    const all = []; const walk = n => { all.push(n); kids(n).forEach(walk); }; walk(root);
    const edges = S('g', { class: 'medges' }), nodes = S('g', { class: 'mnodes' }); world.append(edges, nodes);
    for (const n of all) for (const c of kids(n)) {
      const x1 = n.x + c.dir * n.w / 2, y1 = n.y, x2 = c.x - c.dir * c.w / 2, y2 = c.y, mx = (x1 + x2) / 2;
      edges.append(S('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, stroke: c.color, class: 'medge' + (c.kind === 'callout' && c.ctype === 'branch' ? ' alt' : ''), 'stroke-width': Math.max(1.4, 3.4 - c.depth * 0.6) }));
    }
    let sel = null;
    for (const n of all) {
      const g = S('g', { class: `mnode k-${n.kind}${n.ctype ? ' c-' + n.ctype : ''}${n.done ? ' done' : ''}${n.depth === 0 ? ' root' : ''}`, transform: `translate(${n.x - n.w / 2},${n.y - n.h / 2})`, style: `--c:${n.color}` });
      g.append(S('rect', { width: n.w, height: n.h, rx: n.depth === 0 ? 14 : n.kind === 'link' ? n.h / 2 : 9 }));
      const tx = n.kind === 'link' || n.kind === 'callout' ? 30 : 12;
      if (n.kind === 'link' || n.kind === 'callout') { const ic = S('g', { class: 'mic', transform: `translate(9,${n.h / 2 - 8}) scale(.68)` }); ic.innerHTML = `<path d="${ICON_PATHS[n.kind === 'link' ? linkIcon(n) : (MD.CALLOUTS[n.ctype] || {}).icon || 'note'] || ICON_PATHS.note}"/>`; g.append(ic); }
      const t = S('text', { x: tx, y: (n.depth === 0 ? 11 : 7) + n.lh * 0.78, style: `font:${n.font}` });
      n.lines.forEach((l, i) => t.append(S('tspan', { x: tx, dy: i ? n.lh : 0 }, document.createTextNode(l))));
      g.append(t);
      if ((n.children || []).length && n.depth > 0) {
        const cx = n.dir > 0 ? n.w + 9 : -9, b = S('g', { class: 'mtog', transform: `translate(${cx},${n.h / 2})` });
        b.append(S('circle', { r: 8 }), S('text', { y: 3.5 }, document.createTextNode(n.open ? '−' : String(n.children.length))));
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', e => { e.stopPropagation(); o.onToggle(keyOf(n)); });
        g.append(b);
      }
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${n.kind === 'callout' ? (MD.CALLOUTS[n.ctype] || {}).label + ': ' : n.kind === 'link' ? 'Link: ' : n.kind === 'task' ? (n.done ? 'Done: ' : 'To do: ') : ''}${n.text}${(n.children || []).length ? `, ${n.children.length} branch${n.children.length === 1 ? '' : 'es'}${n.open ? '' : ', folded'}` : ''}`);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (sel === n) o.onOpen(n); else select(n, g); } if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && (n.children || []).length && n.depth > 0) { e.preventDefault(); o.onToggle(keyOf(n)); } });
      g.addEventListener('pointerdown', e => e.stopPropagation());
      g.addEventListener('click', e => { e.stopPropagation(); select(n, g); });
      g.addEventListener('dblclick', e => { e.stopPropagation(); o.onOpen(n); });
      nodes.append(g); n.g = g;
    }
    function linkIcon(n) { const k = n.link && n.link.kind; return k === 'table' ? 'table' : k === 'srd' ? 'lore' : k === 'sound' ? 'music' : 'link'; }
    function select(n, g) {
      if (sel) sel.g.classList.remove('sel'); sel = n; g.classList.add('sel');
      const canAdd = ['root', 'h', 'li', 'task', 'callout'].includes(n.kind) && !n.ro, canRename = ['h', 'li', 'task', 'callout'].includes(n.kind) && !n.ro;
      tools.replaceChildren(...[
        canAdd && btn('plus', 'Add a branch', () => ask(n, '', t => o.onAdd(n, t))),
        canRename && btn('edit', 'Rename', () => ask(n, n.text, t => o.onRename(n, t))),
        n.kind === 'link' ? btn('open', 'Open', () => o.onOpen(n)) : n.depth > 0 && btn('read', 'Show in the text', () => o.onOpen(n))
      ].filter(Boolean));
      tools.hidden = !tools.children.length; posTools();
    }
    const btn = (ic, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn tiny'; b.innerHTML = icon(ic) + `<span>${label}</span>`; b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
    function ask(n, val, fn) {
      tools.replaceChildren(); const inp = document.createElement('input'); inp.type = 'text'; inp.value = val; inp.placeholder = n.kind === 'root' ? 'A new heading' : 'A new branch'; inp.className = 'mindinp';
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) fn(inp.value.trim()); if (e.key === 'Escape') { tools.hidden = true; } };
      tools.append(inp, btn('check', 'OK', () => inp.value.trim() && fn(inp.value.trim()))); tools.hidden = false; posTools(); inp.focus(); inp.select();
    }
    // panning and zooming
    let view = o.view || null;
    const apply = () => { world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`); posTools(); if (o.onView) o.onView(view); };
    function posTools() { if (!sel || tools.hidden || !view) return; const r = host.getBoundingClientRect(); const x = view.x + sel.x * view.k, y = view.y + (sel.y + sel.h / 2) * view.k + 8; tools.style.left = Math.max(8, Math.min(r.width - 260, x - 120)) + 'px'; tools.style.top = Math.min(r.height - 44, y) + 'px'; }
    function fit() {
      const r = host.getBoundingClientRect(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const n of all) { x0 = Math.min(x0, n.x - n.w / 2 - 20); x1 = Math.max(x1, n.x + n.w / 2 + 20); y0 = Math.min(y0, n.y - n.h / 2); y1 = Math.max(y1, n.y + n.h / 2); }
      const want = Math.min((r.width - 40) / (x1 - x0), (r.height - 40) / (y1 - y0)), k = Math.min(1.25, Math.max(o.minFit || 0.2, want));
      // a big map opens readable, around its middle, rather than tiny
      const cx = want < k ? root.x : (x0 + x1) / 2, cy = want < k ? root.y : (y0 + y1) / 2;
      view = { k, x: r.width / 2 - cx * k, y: r.height / 2 - cy * k }; apply();
    }
    if (view) apply(); else { o.minFit = 0.55; fit(); o.minFit = 0.2; }
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k2 = Math.max(0.15, Math.min(3, view.k * Math.exp(-e.deltaY * 0.0015))); view = { k: k2, x: mx - (mx - view.x) * (k2 / view.k), y: my - (my - view.y) * (k2 / view.k) }; apply(); }, { passive: false });
    svg.addEventListener('pointerdown', e => {
      if (sel) { sel.g.classList.remove('sel'); sel = null; tools.hidden = true; }
      const sx = e.clientX, sy = e.clientY, v0 = { ...view }; svg.setPointerCapture(e.pointerId); svg.classList.add('grab');
      const mv = ev => { view = { ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy }; apply(); };
      const up = () => { svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); svg.classList.remove('grab'); };
      svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up);
    });
    return { fit, zoom: f => { const r = host.getBoundingClientRect(), k2 = Math.max(0.15, Math.min(3, view.k * f)); view = { k: k2, x: r.width / 2 - (r.width / 2 - view.x) * (k2 / view.k), y: r.height / 2 - (r.height / 2 - view.y) * (k2 / view.k) }; apply(); }, svg };
  }
  return { render, keyOf };
})();

const GRAPH = (() => {
  // nodes: [{ id, title, type, color, icon, img }], edges: [[a, b]]; o: { onOpen(id), onMenu(id, event), imageUrl(file), focus: id, labels }
  // a node shows its picture (ringed in its kind's colour) or its kind's icon
  function render(host, nodes, edges, o = {}) {
    host.replaceChildren(); host.classList.add('graphhost');
    const cv = document.createElement('canvas'); host.append(cv);
    const tip = document.createElement('div'); tip.className = 'gtip'; tip.hidden = true; host.append(tip);
    const g = cv.getContext('2d'), dpr = devicePixelRatio || 1;
    const N = nodes.map((n, i) => ({ ...n, i, x: Math.cos(i * 2.4) * (40 + 9 * Math.sqrt(i) * 6), y: Math.sin(i * 2.4) * (40 + 9 * Math.sqrt(i) * 6), vx: 0, vy: 0, deg: 0, nb: new Set() }));
    const byId = new Map(N.map(n => [n.id, n]));
    const E = edges.map(([a, b, l]) => [byId.get(a), byId.get(b), l]).filter(([a, b]) => a && b && a !== b);
    for (const [a, b] of E) { a.deg++; b.deg++; a.nb.add(b); b.nb.add(a); }
    N.forEach(n => {
      n.r = 10 + Math.min(10, Math.sqrt(n.deg) * 2.4);
      if (n.icon && typeof ICON_PATHS !== 'undefined' && ICON_PATHS[n.icon]) n.path = new Path2D(ICON_PATHS[n.icon]);
      if (n.img && o.imageUrl) Promise.resolve(o.imageUrl(n.img)).then(u => { if (!u) return; const im = new Image(); im.onload = () => { n.pic = im; n.r += 3; }; im.src = u; }).catch(() => {});
    });
    let W = 0, H = 0, view = { k: 1, x: 0, y: 0 }, alpha = 1, hover = null, drag = null, fitted = false;
    const size = () => { const r = host.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; if (!fitted) view = { k: 1, x: W / 2, y: H / 2 }; };
    const ro = new ResizeObserver(() => { size(); draw(); }); ro.observe(host); size();
    function tick() {
      // relaxed so the web doesn't knot up as it grows: more documents push each other apart harder, links between busy
      // documents grow longer, nothing overlaps (pictures and labels need room), and the pull to the middle eases off
      const n = N.length, grow = 1 + n / 60, rep = (o.len ? 6000 : 3200) * grow, spring = 0.02, len = o.len || 100, reach = 250000 * grow * grow;
      for (let i = 0; i < n; i++) { const a = N[i]; for (let j = i + 1; j < n; j++) { const b = N[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.01; if (d2 > reach) continue; const d = Math.sqrt(d2); let f = rep / d2; const room = a.r + b.r + 26; if (d < room) f += (room - d) * 0.6; dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; } }
      for (const [a, b] of E) { const L = len + 12 * Math.sqrt(a.deg + b.deg), dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, f = (d - L) * spring; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; }
      const pull = 0.004 / grow;
      for (const a of N) { a.vx -= a.x * pull; a.vy -= a.y * pull; if (a === drag) { a.vx = a.vy = 0; continue; } a.x += Math.max(-30, Math.min(30, a.vx * alpha)); a.y += Math.max(-30, Math.min(30, a.vy * alpha)); a.vx *= 0.55; a.vy *= 0.55; }
      alpha = Math.max(0, alpha * 0.985 - 0.0005);
    }
    const css = v => getComputedStyle(host).getPropertyValue(v).trim();
    function draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      g.save(); g.translate(view.x, view.y); g.scale(view.k, view.k);
      const lit = hover ? new Set([hover, ...hover.nb]) : o.focus && byId.get(o.focus) ? new Set([byId.get(o.focus), ...byId.get(o.focus).nb]) : null;
      g.lineWidth = 1.2 / view.k;
      const faint = css('--edge') || 'rgba(160,170,180,.28)', both = new Set(E.map(([a, b]) => a.id + '>' + b.id));
      for (const [a, b, l] of E) {
        const on = lit && lit.has(a) && lit.has(b) && (a === hover || b === hover || a.id === o.focus || b.id === o.focus);
        g.strokeStyle = g.fillStyle = on ? css('--accent') : lit ? 'rgba(160,170,180,.08)' : faint; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        if (o.directed) { const ang = Math.atan2(b.y - a.y, b.x - a.x), tx = b.x - Math.cos(ang) * (b.r + 3), ty = b.y - Math.sin(ang) * (b.r + 3), s = 7 / view.k; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - Math.cos(ang - 0.4) * s, ty - Math.sin(ang - 0.4) * s); g.lineTo(tx - Math.cos(ang + 0.4) * s, ty - Math.sin(ang + 0.4) * s); g.closePath(); g.fill(); }
        if (l && (view.k > 0.55 || on)) { const two = both.has(b.id + '>' + a.id), len = Math.hypot(b.x - a.x, b.y - a.y) || 1, off = two ? 9 / view.k : 0, nx = -(b.y - a.y) / len * off, ny = (b.x - a.x) / len * off; g.font = `500 ${11 / Math.max(0.6, Math.min(1.4, view.k))}px "Segoe UI Variable Text","Segoe UI",system-ui`; g.fillStyle = on ? css('--ink') : css('--muted'); g.textAlign = 'center'; const t = two ? 0.36 : 0.5; g.fillText(l, a.x + (b.x - a.x) * t + nx, a.y + (b.y - a.y) * t + ny - 4 / view.k); }
      }
      const ink = css('--ink') || '#ddd', muted = css('--muted') || '#999', surf = css('--surface-2') || css('--panel2') || '#1d1e23';
      for (const a of N) {
        g.globalAlpha = lit && !lit.has(a) ? 0.25 : 1;
        g.beginPath(); g.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        if (a.pic) {
          // the picture, cut to a circle and ringed in the kind's colour
          g.save(); g.clip(); const s = a.r * 2, iw = a.pic.naturalWidth, ih = a.pic.naturalHeight, c = Math.min(iw, ih);
          g.drawImage(a.pic, (iw - c) / 2, (ih - c) / 2, c, c, a.x - a.r, a.y - a.r, s, s); g.restore();
          g.beginPath(); g.arc(a.x, a.y, a.r, 0, Math.PI * 2); g.lineWidth = 2.5; g.strokeStyle = a.color; g.stroke();
        } else {
          // the kind's icon on a dark disc, ringed in its colour
          g.fillStyle = surf; g.fill(); g.lineWidth = 2; g.strokeStyle = a.color; g.stroke();
          if (a.path) { const s = a.r * 1.1; g.save(); g.translate(a.x - s / 2, a.y - s / 2); g.scale(s / 24, s / 24); g.lineWidth = 2; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = a.color; g.stroke(a.path); g.restore(); }
          else { g.fillStyle = a.color; g.beginPath(); g.arc(a.x, a.y, a.r * 0.35, 0, Math.PI * 2); g.fill(); }
        }
        if (a.id === o.focus || a === hover) { g.beginPath(); g.arc(a.x, a.y, a.r + 3.5 / view.k, 0, Math.PI * 2); g.lineWidth = 2 / view.k; g.strokeStyle = ink; g.stroke(); }
        const showLabel = view.k > 0.7 || a.deg >= 4 || a === hover || (lit && lit.has(a));
        if (showLabel) { g.font = `${a === hover ? 600 : 500} ${12 / Math.max(0.6, Math.min(1.4, view.k))}px "Segoe UI Variable Text","Segoe UI",system-ui`; g.fillStyle = a === hover ? ink : muted; g.textAlign = 'center'; g.fillText(a.title.length > 34 ? a.title.slice(0, 32) + '…' : a.title, a.x, a.y + a.r + 13 / Math.max(0.6, Math.min(1.4, view.k))); }
      }
      g.globalAlpha = 1; g.restore();
    }
    function fit() {
      if (!N.length) return; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const a of N) { x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); }
      const k = Math.min(1.6, Math.max(0.15, Math.min((W - 80) / (x1 - x0 || 1), (H - 80) / (y1 - y0 || 1))));
      view = { k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k }; fitted = true;
    }
    let raf = 0, steps = 0;
    let touched = false;
    const loop = () => { if (!host.isConnected) { ro.disconnect(); return; } if (alpha > 0.002) { for (let i = 0; i < (steps < 60 ? 3 : 1); i++) tick(); steps++; if ((steps === 40 || steps === 140) && !touched) fit(); } draw(); raf = requestAnimationFrame(loop); };
    // a head start, so it doesn't open in a heap
    for (let i = 0; i < Math.min(220, 40000 / Math.max(1, N.length)); i++) tick();
    fit(); loop();
    const at = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; };
    const hit = p => { let best = null, bd = Infinity; for (const a of N) { const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < a.r + 6 / view.k && d < bd) { best = a; bd = d; } } return best; };
    cv.addEventListener('pointermove', e => {
      if (drag || cv.dataset.pan) return;
      const n = hit(at(e)); if (n !== hover) { hover = n; cv.style.cursor = n ? 'pointer' : 'grab'; }
      if (n) { const r = host.getBoundingClientRect(); tip.hidden = false; tip.innerHTML = `${icon(TYPES[n.type] ? TYPES[n.type].icon : 'note')}<b></b><span>${n.deg} link${n.deg === 1 ? '' : 's'}</span>`; tip.querySelector('b').textContent = n.title; tip.style.left = Math.min(r.width - 200, e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; } else tip.hidden = true;
    });
    cv.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; });
    cv.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;   // the right button is for the menu
      const p0 = at(e), n = hit(p0), sx = e.clientX, sy = e.clientY, v0 = { ...view }; let moved = false; touched = true;
      cv.setPointerCapture(e.pointerId);
      if (n) { drag = n; alpha = Math.max(alpha, 0.3); } else cv.dataset.pan = '1';
      const mv = ev => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true; if (n) { const p = at(ev); n.x = p.x; n.y = p.y; alpha = Math.max(alpha, 0.2); } else view = { ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy }; };
      const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); delete cv.dataset.pan; drag = null; if (n && !moved && o.onOpen) o.onOpen(n.id); };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
    });
    // right-click on a node: its menu (elsewhere, the page's own)
    cv.addEventListener('contextmenu', e => { const n = hit(at(e)); if (n && o.onMenu) { e.preventDefault(); o.onMenu(n.id, e); } });
    cv.addEventListener('wheel', e => { e.preventDefault(); touched = true; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k2 = Math.max(0.1, Math.min(4, view.k * Math.exp(-e.deltaY * 0.0015))); view = { k: k2, x: mx - (mx - view.x) * (k2 / view.k), y: my - (my - view.y) * (k2 / view.k) }; }, { passive: false });
    return { fit, stop: () => { cancelAnimationFrame(raf); ro.disconnect(); } };
  }
  return { render };
})();
