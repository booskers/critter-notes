/* Critter Notes: the notes drawer. A tab at the very bottom of the window, over everything, that slides up into a small canvas
   for to-do lists and quick notes. The canvas moves when its empty space is dragged (or with the wheel); right-click it for a
   new to-do list, note or link; drag the top edge to make the drawer taller or shorter. A block dragged out of the drawer onto
   a document goes into that document where it's dropped. It belongs to the campaign (A.camp.drawer), so it's in the undo
   history; Home lists its open to-dos. Settings › Notes drawer turns it off. */
'use strict';
const DRAWER = (() => {
  let el = null, panel = null, world = null, canvas = null, tab = null;
  const st = () => { if (!A.camp.drawer) A.camp.drawer = { blocks: [], vx: 40, vy: 30 }; return A.camp.drawer; };
  const save = () => saveCampSoon();
  const on = () => A.prefs.drawer !== false && !!A.camp && !SYNC.isPlayer();
  const H = () => Math.max(170, Math.min(innerHeight - 90, +A.prefs.drawerH || 320));
  // with no campaign (the welcome screen) or for players, there's no drawer
  const unmount = () => { if (el) el.remove(); el = panel = world = canvas = tab = null; };
  const openTodos = () => (A.camp && A.camp.drawer ? A.camp.drawer.blocks : []).filter(b => b.kind === 'todo').reduce((n, b) => n + b.items.filter(i => !i.done && i.t.trim()).length, 0);
  const nid = () => Math.random().toString(36).slice(2, 10);

  function mount() {
    if (el) el.remove(); el = null;
    if (!on()) return;
    tab = h('button', { type: 'button', class: 'drtab', 'aria-expanded': String(!!A.prefs.drawerOpen), 'aria-controls': 'drpanel', title: 'The notes drawer (Ctrl+J)', onclick: () => toggle() });
    panel = h('section', { id: 'drpanel', class: 'drpanel', 'aria-label': 'Notes drawer', style: `height:${H()}px` });
    el = h('div', { id: 'drawer', class: 'ndrawer' + (A.prefs.drawerOpen ? ' open' : '') }, tab, panel);
    document.body.append(el); el.style.setProperty('--drh', H() + 'px');
    paintTab(); build();
  }
  function paintTab() {
    if (!tab) return; const n = openTodos();
    tab.replaceChildren(...[h('span', { class: 'drti', html: icon('tasks') }), h('span', { text: 'Notes drawer' }), n ? h('span', { class: 'drcount', text: String(n), title: n + ' to-do' + (n === 1 ? '' : 's') + ' open' }) : null, h('span', { class: 'drchev', html: icon('back') })].filter(Boolean));
    tab.setAttribute('aria-expanded', String(!!A.prefs.drawerOpen));
  }
  function toggle(open = !A.prefs.drawerOpen) {
    if (!el) return; A.prefs.drawerOpen = open; savePrefs();
    el.classList.toggle('open', open); paintTab();
    if (open) setTimeout(() => { const f = panel.querySelector('textarea,input'); if (!f) canvas.focus(); }, 300);
  }
  function build() {
    const grip = h('div', { class: 'drgrip', role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': 'Drawer height', 'aria-valuemin': '170', 'aria-valuemax': String(innerHeight - 90), 'aria-valuenow': String(H()), tabIndex: 0, title: 'Drag to make the drawer taller or shorter (or the arrow keys)' });
    const told = () => { grip.setAttribute('aria-valuenow', String(Math.round(panel.offsetHeight || H()))); grip.setAttribute('aria-valuemax', String(innerHeight - 90)); };
    canvas = h('div', { class: 'drcanvas', role: 'group', tabIndex: 0, 'aria-label': 'The drawer\'s canvas. Right-click for a new to-do list or note; drag empty space to move around.' });
    world = h('div', { class: 'drworld' }); canvas.append(world);
    const head = h('div', { class: 'drhead' },
      h('b', { text: 'Notes drawer' }), h('span', { class: 'hint', text: 'Right-click for a to-do list or a note · drag a block onto a document to put it there' }), h('span', { class: 'grow' }),
      btn('tasks', 'To-do list', () => add('todo'), 'tiny'), btn('note', 'Note', () => add('note'), 'tiny ghost'), ib('x', 'Close the drawer', () => toggle(false)));
    panel.replaceChildren(grip, head, canvas);
    paintWorld();
    // the top edge sets the height
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0) return; e.preventDefault(); grip.setPointerCapture(e.pointerId); panel.classList.add('sizing');
      const y0 = e.clientY, h0 = panel.offsetHeight;
      const mv = m => { const v = Math.max(170, Math.min(innerHeight - 90, h0 + (y0 - m.clientY))) + 'px'; panel.style.height = v; el.style.setProperty('--drh', v); };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); panel.classList.remove('sizing'); A.prefs.drawerH = panel.offsetHeight; savePrefs(); told(); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('keydown', e => { const d = { ArrowUp: 30, ArrowDown: -30 }[e.key]; if (!d) return; e.preventDefault(); A.prefs.drawerH = Math.max(170, Math.min(innerHeight - 90, panel.offsetHeight + d)); panel.style.height = A.prefs.drawerH + 'px'; el.style.setProperty('--drh', A.prefs.drawerH + 'px'); savePrefs(); told(); });
    // empty space moves the canvas; the wheel too
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.drb')) return; e.preventDefault();
      const s = st(), sx = e.clientX, sy = e.clientY, x0 = s.vx, y0 = s.vy; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grab');
      const mv = m => { s.vx = x0 + m.clientX - sx; s.vy = y0 + m.clientY - sy; place(); };
      const up = () => { canvas.removeEventListener('pointermove', mv); canvas.removeEventListener('pointerup', up); canvas.classList.remove('grab'); save(); };
      canvas.addEventListener('pointermove', mv); canvas.addEventListener('pointerup', up);
    });
    canvas.addEventListener('wheel', e => { if (e.target.closest('textarea') && e.target.scrollHeight > e.target.clientHeight) return; e.preventDefault(); const s = st(); if (e.shiftKey) s.vx -= e.deltaY; else { s.vx -= e.deltaX; s.vy -= e.deltaY; } place(); save(); }, { passive: false });
    // right-click: something new where it was clicked
    canvas.addEventListener('contextmenu', e => {
      if (e.target.closest('textarea,input')) return;
      e.preventDefault(); e.stopPropagation();
      const b = e.target.closest('.drb'), r = canvas.getBoundingClientRect(), s = st(), at = { x: e.clientX, y: e.clientY }, wx = e.clientX - r.left - s.vx, wy = e.clientY - r.top - s.vy;
      if (b) { const blk = s.blocks.find(x => x.id === b.dataset.id); if (blk) return blockMenu(blk, at); }
      menu([{ head: 'The notes drawer' },
        { label: 'New to-do list', icon: 'tasks', fn: () => add('todo', wx, wy) },
        { label: 'New note', icon: 'note', fn: () => add('note', wx, wy) },
        { label: 'A link to a document…', icon: 'link', fn: () => pickLink(wx, wy, at) },
        '-',
        { label: 'Back to the start', icon: 'home', fn: () => { s.vx = 40; s.vy = 30; place(); save(); } },
        { label: 'Close the drawer', icon: 'x', fn: () => toggle(false) }], at);
    });
  }
  function place() { const s = st(); world.style.transform = `translate(${s.vx}px,${s.vy}px)`; }
  function paintWorld() { if (!world) return; place(); world.replaceChildren(...st().blocks.map(blockEl)); paintTab(); }
  function add(kind, x, y, extra = {}) {
    const s = st(), r = canvas.getBoundingClientRect();
    if (x === undefined) { const n = s.blocks.length; x = -s.vx + 30 + (n % 5) * 30; y = -s.vy + 20 + (n % 5) * 24; }
    const b = { id: nid(), kind, x: Math.round(x), y: Math.round(y), w: kind === 'note' ? 260 : 250, ...(kind === 'todo' ? { title: '', items: [{ id: nid(), t: '', done: false }] } : kind === 'note' ? { text: '' } : {}), ...extra };
    s.blocks.push(b); save(); paintWorld();
    const n = world.querySelector(`[data-id="${b.id}"] ${kind === 'todo' ? '.drtitle' : 'textarea'}`); if (n) n.focus();
    if (!A.prefs.drawerOpen) toggle(true);
    return b;
  }
  function remove(b) { const s = st(); s.blocks = s.blocks.filter(x => x !== b); save(); paintWorld(); }
  function blockMenu(b, at) {
    menu([{ head: b.kind === 'todo' ? 'To-do list' : b.kind === 'note' ? 'Note' : 'Link' },
      A.view.k === 'doc' && A.ed && D(A.view.id) && !D(A.view.id).locked ? { label: 'Put it into "' + D(A.view.id).title + '"', icon: 'send', fn: () => dropInto(b, null) } : null,
      b.kind === 'todo' ? { label: 'Tick off all', icon: 'tasks', fn: () => { b.items.forEach(i => { i.done = true; }); save(); paintWorld(); } } : null,
      { label: 'Copy as Markdown', icon: 'copy', fn: () => navigator.clipboard.writeText(mdOf(b)).catch(() => {}) },
      '-', { label: 'Remove it', icon: 'trash', cls: 'bad', fn: () => remove(b) }].filter(Boolean), at);
  }
  async function pickLink(x, y, at) {
    const d = await ED.pickDoc({ left: at.x, right: at.x, top: at.y, bottom: at.y }, '', null, { title: 'A link in the drawer' });
    if (d && d.id) add('link', x, y, { doc: d.id, w: 220 });
  }
  // what a block becomes in a document
  function mdOf(b) {
    if (b.kind === 'todo') return [b.title.trim() ? `**${b.title.trim()}**` : '', ...b.items.filter(i => i.t.trim()).map(i => `- [${i.done ? 'x' : ' '}] ${i.t.trim()}`)].filter(Boolean).join('\n');
    if (b.kind === 'link') { const d = D(b.doc); return d ? `[[${d.title}]]` : ''; }
    return String(b.text || '').trim();
  }
  // into the open document: where it was dropped, or at the caret
  function dropInto(b, pt) {
    const d = A.view.k === 'doc' && D(A.view.id), md = mdOf(b);
    if (!md) { toast('There\'s nothing in it yet.'); return false; }
    if (!d || !A.ed || isRO(d)) { toast('Open a document to put it in.'); return false; }
    if (d.locked) { toast('This document is locked. Unlock it (the lock above it) to drop things in.'); return false; }
    histGroup(`Put a ${b.kind === 'todo' ? 'to-do list' : b.kind} into "${d.title}"`, () => { if (pt) A.ed.dropMd(md, pt.x, pt.y); else A.ed.insertBlockMd(md); A.ed.commit(); });
    toast(`Put into "${d.title}".`, { label: 'Undo', fn: () => undo() });
    return true;
  }
  function blockEl(b) {
    const s = st();
    const grip = h('div', { class: 'drbh', title: 'Drag to move it, or onto a document to put it there' },
      h('span', { class: 'drgr', html: icon('move') }), h('span', { class: 'drk', text: b.kind === 'todo' ? 'To-do' : b.kind === 'note' ? 'Note' : 'Link' }), h('span', { class: 'grow' }),
      ib('dots', 'More for this block', e => { e.stopPropagation(); blockMenu(b, e.currentTarget); }));
    const box = h('div', { class: 'drb k-' + b.kind, 'data-id': b.id, style: `left:${b.x}px;top:${b.y}px;width:${b.w}px` }, grip);
    if (b.kind === 'note') {
      const ta = h('textarea', { class: 'drnote', rows: 3, placeholder: 'A thought, a name, a twist…', 'aria-label': 'Note', value: b.text || '' });
      const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(320, ta.scrollHeight) + 'px'; };
      ta.addEventListener('input', () => { b.text = ta.value; fit(); save(); }); queueMicrotask(fit);
      box.append(ta);
    } else if (b.kind === 'todo') {
      const title = h('input', { type: 'text', class: 'drtitle', placeholder: 'To do', 'aria-label': 'List title', value: b.title || '', oninput: e => { b.title = e.target.value; save(); } });
      const list = h('div', { class: 'drlist', role: 'list' });
      const row = (it, i) => {
        const cb = h('input', { type: 'checkbox', checked: !!it.done, 'aria-label': 'Done', onchange: e => { it.done = e.target.checked; r.classList.toggle('done', it.done); save(); paintTab(); } });
        const inp = h('input', { type: 'text', value: it.t, placeholder: 'Something to do', 'aria-label': 'To-do', oninput: e => { it.t = e.target.value; save(); paintTab(); } });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); const n = { id: nid(), t: '', done: false }; b.items.splice(b.items.indexOf(it) + 1, 0, n); save(); draw(); list.querySelectorAll('input[type=text]')[b.items.indexOf(n)].focus(); }
          if (e.key === 'Backspace' && !inp.value && b.items.length > 1) { e.preventDefault(); const k = b.items.indexOf(it); b.items.splice(k, 1); save(); draw(); const f = list.querySelectorAll('input[type=text]')[Math.max(0, k - 1)]; if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
        });
        const r = h('div', { class: 'dritem' + (it.done ? ' done' : ''), role: 'listitem' }, cb, inp); return r;
      };
      const draw = () => list.replaceChildren(...b.items.map(row));
      draw();
      box.append(title, list, h('button', { type: 'button', class: 'dradd', onclick: () => { const n = { id: nid(), t: '', done: false }; b.items.push(n); save(); draw(); list.lastElementChild.querySelector('input[type=text]').focus(); } }, h('span', { html: icon('plus') }), 'Add'));
    } else {
      const d = D(b.doc);
      box.append(d ? h('button', { type: 'button', class: 'drlink', 'data-doc': d.id, style: `--c:${typeColor(d)}`, onclick: () => openDoc(d.id) }, h('span', { html: icon(TYPES[d.type].icon) }), h('b', { text: d.title })) : h('p', { class: 'hint', text: 'This document is gone.' }));
    }
    // moving it: within the drawer, or out of it onto a document
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.ib')) return; e.preventDefault(); grip.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, x0 = b.x, y0 = b.y; let ghost = null, over = null;
      box.classList.add('lift');
      const mv = m => {
        const pr = panel.getBoundingClientRect(), out = m.clientY < pr.top - 4;
        if (out) {
          if (!ghost) { ghost = box.cloneNode(true); ghost.classList.add('drghost'); document.body.append(ghost); box.classList.add('carried'); }
          ghost.style.left = (m.clientX - 30) + 'px'; ghost.style.top = (m.clientY - 16) + 'px';
          const t = document.elementFromPoint(m.clientX, m.clientY), body = t && t.closest('.dbody');
          if (over && over !== body) over.classList.remove('dropok'); over = body; if (body) body.classList.add('dropok');
        } else {
          if (ghost) { ghost.remove(); ghost = null; box.classList.remove('carried'); if (over) over.classList.remove('dropok'); over = null; }
          b.x = Math.round(x0 + m.clientX - sx); b.y = Math.round(y0 + m.clientY - sy); box.style.left = b.x + 'px'; box.style.top = b.y + 'px';
        }
      };
      const up = u => {
        grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); box.classList.remove('lift', 'carried');
        if (ghost) { ghost.remove(); if (over) { over.classList.remove('dropok'); if (dropInto(b, { x: u.clientX, y: u.clientY })) remove(b); } }
        else save();
      };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
    });
    return box;
  }
  // the to-dos for Home: every open one, and ticking them off there too
  function todosCard() {
    const lists = (A.camp && A.camp.drawer ? A.camp.drawer.blocks : []).filter(b => b.kind === 'todo' && b.items.some(i => i.t.trim()));
    if (!lists.length) return null;
    return h('section', { class: 'hcard todos' }, h('div', { class: 'hrow' }, h('h2', { text: 'To do' }), h('span', { class: 'grow' }), on() ? btn('tasks', 'Open the drawer', () => toggle(true), 'tiny ghost') : null),
      ...lists.map(b => h('div', { class: 'tdlist' }, b.title.trim() ? h('b', { text: b.title }) : null,
        ...b.items.filter(i => i.t.trim()).map(it => h('label', { class: 'tditem' + (it.done ? ' done' : '') }, h('input', { type: 'checkbox', checked: !!it.done, onchange: e => { it.done = e.target.checked; e.target.parentElement.classList.toggle('done', it.done); save(); paintTab(); if (el) paintWorld(); } }), h('span', { text: it.t }))))));
  }
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'j' && el) { e.preventDefault(); toggle(); } });
  addEventListener('resize', () => { if (panel && el) { panel.style.height = H() + 'px'; el.style.setProperty('--drh', H() + 'px'); } });
  return { mount, unmount, toggle, add, todosCard, paint: paintWorld, get open() { return !!A.prefs.drawerOpen; } };
})();
