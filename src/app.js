/* Critter Notes: the notebook. State lives in A; documents are plain objects saved through STORE.
   A document: { id, type, title, parent, order, body (Markdown), fields {}, tags [], img, map?, pinned, mind?, sheet?,
                 table? { lobby, ent }, sent { <lobby>: { note, handout, ent, scene } }, run? { start }, created, updated } */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'placeholder', 'type', 'title', 'draggable', 'spellcheck', 'tabIndex']);
function h(tag, a, ...kids) {
  const e = document.createElement(tag);
  if (a) for (const [k, v] of Object.entries(a)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v; else if (PROPS.has(k)) e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}
const ib = (ic, title, fn, cls) => h('button', { type: 'button', class: 'ib' + (cls ? ' ' + cls : ''), title, 'aria-label': title, html: icon(ic), onclick: e => { e.stopPropagation(); fn(e); } });
const btn = (ic, text, fn, cls) => h('button', { type: 'button', class: 'btn' + (cls ? ' ' + cls : ''), onclick: fn }, ic ? h('span', { class: 'bi', html: icon(ic) }) : null, text ? h('span', { text }) : null);
const esc = MD.esc;
const rid = (p = '') => p + Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const clone = v => JSON.parse(JSON.stringify(v));
const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const LS = { get(k, d) { try { const v = localStorage.getItem('cn.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('cn.' + k, JSON.stringify(v)); } catch {} } };
const errText = e => String((e && e.message) || e || 'Something went wrong').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const ago = ts => { const s = (Date.now() - ts) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : s < 86400 * 30 ? Math.floor(s / 86400) + ' d ago' : new Date(ts).toLocaleDateString(); };
const plural = (n, a, b) => `${n} ${n === 1 ? a : b || a + 's'}`;

/* ============================== state ============================== */
const A = { camps: [], camp: null, docs: new Map(), wdocs: new Map(), wname: '', view: { k: 'none' }, back: [], fwd: [], modes: new Map(), dirty: new Set(), idx: { title: new Map(), back: new Map(), tags: new Map() },
  prefs: Object.assign({ side: 'kind', right: innerWidth > 1280, rightTab: 'links', closed: { world: true }, open: {}, details: {}, theme: 'dark', readSize: 'm', readFont: 'serif', toolbar: true }, LS.get('prefs', {})) };
const savePrefs = () => LS.set('prefs', A.prefs);
const cid = () => A.camp && A.camp.id;
// a document of this campaign, or one read from its shared world
const D = id => A.docs.get(id) || A.wdocs.get(id);
const isRO = d => !!d && !A.docs.has(d.id);

/* ---------- saving ---------- */
let saveT = 0;
function touch(doc, quiet) {
  if (!A.docs.has(doc.id)) return;
  doc.updated = Date.now(); A.dirty.add(doc.id); clearTimeout(saveT); saveT = setTimeout(flush, 500); if (!quiet) reindexSoon();
  PLAN.liveTouch(doc);
}
async function flush() {
  clearTimeout(saveT);
  const ids = [...A.dirty]; A.dirty.clear();
  for (const id of ids) { const d = A.docs.get(id); if (!d) continue; try { await STORE.saveDoc(cid(), d); } catch (e) { A.dirty.add(id); toast('Could not save "' + d.title + '": ' + errText(e)); } }
}
async function saveCamp() { if (!A.camp) return; A.camp.updated = Date.now(); try { await STORE.saveCampaign(A.camp); } catch (e) { toast('Could not save the campaign: ' + errText(e)); } }

/* ---------- the index: titles, links, backlinks, tags ---------- */
function reindex() {
  const title = new Map(), back = new Map(), tags = new Map();
  for (const d of [...A.docs.values()].sort((a, b) => a.created - b.created)) { const k = d.title.trim().toLowerCase(); if (k && !title.has(k)) title.set(k, d.id); }
  // the shared world's documents can be linked to, unless this campaign has one by the same name
  for (const d of A.wdocs.values()) { const k = d.title.trim().toLowerCase(); if (k && !title.has(k)) title.set(k, d.id); }
  A.idx.title = title;
  for (const d of A.docs.values()) {
    for (const t of outLinks(d)) { if (t === d.id) continue; if (!back.has(t)) back.set(t, new Set()); back.get(t).add(d.id); }
    for (const t of docTags(d)) { if (!tags.has(t)) tags.set(t, new Set()); tags.get(t).add(d.id); }
  }
  A.idx.back = back; A.idx.tags = tags;
}
const reindexSoon = debounce(() => { reindex(); renderSide(); if (A.prefs.right && A.view.k === 'doc') renderRight(); }, 350);
const resolve = title => A.idx.title.get(String(title || '').trim().toLowerCase()) || null;
// the documents one document points at: its links, link fields, map pins, board cards and relationships
function outLinks(d) {
  const out = new Set();
  for (const li of MD.links(d.body)) if (li.kind === 'doc') { const t = resolve(li.title); if (t) out.add(t); }
  for (const [k, , kind] of FIELDS[d.type] || []) if (kind === 'link' && d.fields && d.fields[k]) { const t = resolve(d.fields[k]); if (t) out.add(t); }
  if (d.map) for (const p of d.map.pins || []) if (p.doc && D(p.doc)) out.add(p.doc);
  if (d.board) for (const c of d.board.cards || []) { if (c.doc && D(c.doc)) out.add(c.doc); for (const li of MD.links(c.text || '')) if (li.kind === 'doc') { const t = resolve(li.title); if (t) out.add(t); } }
  for (const r of d.rels || []) if (D(r.to)) out.add(r.to);
  return out;
}
const docTags = d => [...new Set([...MD.tags(d.body), ...(d.tags || []).map(t => String(t).toLowerCase())])];
const kidsOf = id => [...A.docs.values()].filter(d => (d.parent || '') === (id || '')).sort((a, b) => (a.order ?? a.created) - (b.order ?? b.created));
const typeColor = d => (TYPES[d.type] || TYPES.note).color;
function sortedOf(type) {
  const l = [...A.docs.values()].filter(d => d.type === type);
  if (type === 'session') return l.sort((a, b) => (+(a.fields || {}).num || 0) - (+(b.fields || {}).num || 0) || a.created - b.created);
  if (type === 'event') return l.sort((a, b) => (PLAN.wkey((a.fields || {}).when) ?? 1e12) - (PLAN.wkey((b.fields || {}).when) ?? 1e12) || a.title.localeCompare(b.title));
  return l.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
}
function uniqueTitle(t, except) { t = String(t || 'Untitled').trim() || 'Untitled'; let n = 1, x = t; while (A.docs.has(resolve(x)) && resolve(x) !== except) x = `${t} ${++n}`; return x; }

/* ============================== documents ============================== */
function newDoc(o = {}) {
  const type = TYPES[o.type] ? o.type : 'note', now = Date.now();
  const d = { id: rid('d'), type, title: uniqueTitle(o.title || (type === 'session' ? '' : 'Untitled ' + TYPES[type].name.toLowerCase())), parent: o.parent || '', order: now, body: o.body !== undefined ? o.body : TEMPLATES[type] || '', fields: o.fields || {}, tags: o.tags || [], img: o.img || '', created: now, updated: now };
  if (type === 'map') d.map = o.map || { img: '', w: 0, h: 0, pins: [] };
  if (type === 'board') d.board = o.board || { cards: [], links: [] };
  if (o.sheet) d.sheet = o.sheet; if (o.table) d.table = o.table; if (o.rels) d.rels = o.rels;
  if (type === 'session' && !o.title) {
    const prev = sortedOf('session'), n = prev.length ? (+(prev[prev.length - 1].fields || {}).num || prev.length) + 1 : 1;
    const now2 = PLAN.cal().now;
    d.fields = { num: n, date: new Date().toISOString().slice(0, 10), status: 'Planned', ...(now2 ? { when: { ...now2 } } : {}), ...(o.fields || {}) };
    d.title = uniqueTitle('Session ' + n);
    // the secrets and clues the party hasn't found yet come along to the next session
    const last = prev[prev.length - 1];
    if (last && o.body === undefined) { const carried = openClues(last); if (carried.length) { d.body = d.body.replace(/(## Secrets & clues\n)[\s\S]*?(\n## )/, (a, x, y) => x + carried.map(c => `- [ ] ${c}`).join('\n') + '\n' + y); d.carried = carried.length; } }
  }
  A.docs.set(d.id, d); touch(d, true); reindex();
  return d;
}
function openClues(doc) {
  const L = String(doc.body || '').split('\n'), out = []; let on = false;
  for (const l of L) { const hm = /^(#{1,6})\s+(.*)$/.exec(l); if (hm) { on = /secret|clue/i.test(hm[2]); continue; } if (on) { const m = /^\s*[-*+]\s+\[ \]\s+(.*\S)/.exec(l); if (m && !/^A secret the party might learn|^Another one$/.test(m[1])) out.push(m[1]); } }
  return out;
}
async function deleteDoc(id) {
  const d = A.docs.get(id); if (!d) return;
  const kids = [...A.docs.values()].filter(x => x.parent === id);
  kids.forEach(k => { k.parent = d.parent || ''; touch(k, true); });
  A.docs.delete(id); A.dirty.delete(id);
  await STORE.trashDoc(cid(), id).catch(e => toast('Could not delete it: ' + errText(e)));
  reindex();
  if (A.view.k === 'doc' && A.view.id === id) go({ k: 'home' }, true); else render();
  toast(`Deleted "${d.title}".`, { label: 'Undo', fn: () => { A.docs.set(d.id, d); kids.forEach(k => { k.parent = id; touch(k, true); }); touch(d); reindex(); go({ k: 'doc', id: d.id }); } });
}
// renaming keeps every link to it working
function renameDoc(d, title) {
  title = String(title || '').replace(/[\[\]|#]/g, '').trim().slice(0, 120); if (!title || title === d.title) return false;
  title = uniqueTitle(title, d.id);
  const old = d.title, rx = new RegExp('\\[\\[' + old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\]|#])', 'gi');
  let n = 0;
  for (const x of A.docs.values()) {
    let changed = false;
    const b = x.body.replace(rx, () => { n++; changed = true; return '[[' + title; });
    if (changed) x.body = b;
    for (const [k, , kind] of FIELDS[x.type] || []) if (kind === 'link' && x.fields && String(x.fields[k] || '').trim().toLowerCase() === old.toLowerCase()) { x.fields[k] = title; changed = true; n++; }
    if (changed) touch(x, true);
  }
  d.title = title; touch(d); reindex();
  if (n) toast(`Renamed. ${plural(n, 'link')} updated.`);
  return true;
}

/* ============================== navigation ============================== */
// the campaign-wide views, in the sidebar's order
const PAGES = {
  home: { name: 'Home', icon: 'home', render: m => VIEWS.home(m) },
  timeline: { name: 'Timeline', icon: 'timeline', render: m => PLAN.timeline(m), hint: 'Events by their date in the world' },
  threads: { name: 'Threads', icon: 'key', render: m => PLAN.threads(m), hint: 'Quests, clocks and clues' },
  rels: { name: 'Relationships', icon: 'rels', render: m => PLAN.relsPage(m), hint: 'Who is tied to whom' },
  graph: { name: 'Graph', icon: 'graph', render: m => VIEWS.graph(m), hint: 'Everything and how it links (Ctrl+G)' }
};
function go(view, replace) {
  if (A.view.k !== 'none' && !replace && JSON.stringify(view) !== JSON.stringify(A.view)) { A.back.push(A.view); A.fwd = []; if (A.back.length > 80) A.back.shift(); }
  A.view = view;
  if (A.camp) { A.camp.last = view.k === 'doc' && A.docs.has(view.id) ? view.id : ''; saveCampSoon(); }
  render();
  if (view.line !== undefined) setTimeout(() => scrollToLine(view.line), 30);
  // keyboard and screen reader users land at the top of what just opened
  if (!replace && document.activeElement && document.activeElement.closest && !document.activeElement.closest('#side,#main,#right')) setTimeout(() => { const t = $('#main h1, #main .title'); if (t && view.line === undefined) t.focus({ preventScroll: true }); }, 40);
}
const saveCampSoon = debounce(saveCamp, 800);
function goBack() { if (!A.back.length) return; A.fwd.push(A.view); A.view = A.back.pop(); render(); }
function goFwd() { if (!A.fwd.length) return; A.back.push(A.view); A.view = A.fwd.pop(); render(); }
const openDoc = (id, extra) => { if (D(id)) go({ k: 'doc', id, ...(extra || {}) }); };
const modeOf = d => { const m = A.modes.get(d.id); if (isRO(d)) return m === 'mind' ? 'mind' : 'read'; if (d.type === 'board') return 'read'; return m || (d.body.trim() || d.type === 'map' ? 'read' : 'edit'); };
function setMode(d, m) { A.modes.set(d.id, m); renderMain(); const f = m === 'edit' ? $('.editor textarea') : null; if (f) f.focus(); }

/* ============================== rendering ============================== */
function render() { applyLook(); renderSide(); renderMain(); renderRight(); paintTitle(); }
function paintTitle() {
  const d = A.view.k === 'doc' && D(A.view.id), p = PAGES[A.view.k];
  $('#winTitle').textContent = A.camp ? (d ? d.title + ' · ' : p && A.view.k !== 'home' ? p.name + ' · ' : '') + A.camp.name : '';
  document.title = (d ? d.title + ' · ' : p && A.camp ? p.name + ' · ' : '') + 'Critter Notes';
  $('#backBtn').disabled = !A.back.length; $('#fwdBtn').disabled = !A.fwd.length;
}
// the look: theme, reading size and font, focus mode
function applyLook() {
  const t = A.prefs.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : A.prefs.theme;
  document.documentElement.dataset.theme = t;
  document.documentElement.dataset.read = A.prefs.readSize; document.documentElement.dataset.font = A.prefs.readFont;
  document.body.classList.toggle('focus', !!A.prefs.focus && A.view.k === 'doc');
  document.body.classList.toggle('notools', !A.prefs.toolbar);
  $('#focusBtn').classList.toggle('on', !!A.prefs.focus); $('#focusBtn').setAttribute('aria-pressed', String(!!A.prefs.focus));
}
function toggleFocus(v) { A.prefs.focus = v === undefined ? !A.prefs.focus : v; savePrefs(); applyLook(); if (A.prefs.focus) toast('Focus: only the page. Ctrl+. or Escape brings everything back.'); }

/* ---------- the sidebar ---------- */
function renderSide() {
  const side = $('#side'); if (!A.camp) { side.hidden = true; return; }
  side.hidden = !!A.prefs.sideHidden;
  $('#sideToggle').setAttribute('aria-pressed', String(!A.prefs.sideHidden));
  $('#campName').textContent = A.camp.name; $('#campSys').textContent = SRD.SYSTEMS[campSys()] || '';
  $('#campDot').style.background = A.camp.color || 'var(--accent)';
  const nav = $('#nav'); nav.replaceChildren(...Object.entries(PAGES).map(([k, p]) => h('button', { type: 'button', class: 'navb' + (A.view.k === k ? ' on' : ''), title: p.hint || p.name, 'aria-current': A.view.k === k ? 'page' : null, onclick: () => go({ k }) }, h('span', { html: icon(p.icon) }), h('span', { text: p.name }))));
  $('#sideMode').innerHTML = icon(A.prefs.side === 'tree' ? 'list' : 'folder');
  $('#sideMode').title = $('#sideMode').ariaLabel = A.prefs.side === 'tree' ? 'Group the documents by kind' : 'Arrange the documents as a tree';
  const box = $('#tree'), q = $('#sideFilter').value.trim().toLowerCase(), cur = A.view.k === 'doc' ? A.view.id : '';
  box.replaceChildren();
  if (q) {
    const hits = [...A.docs.values()].filter(d => d.title.toLowerCase().includes(q) || docTags(d).some(t => t.includes(q.replace(/^#/, '')))).sort((a, b) => a.title.localeCompare(b.title));
    box.append(h('div', { class: 'tsec static', role: 'status' }, h('span', { text: plural(hits.length, 'match', 'matches') })), h('div', { role: 'tree', 'aria-label': 'Matches' }, hits.map(d => row(d, 1))));
    return roving();
  }
  const pinned = [...A.docs.values()].filter(d => d.pinned).sort((a, b) => a.title.localeCompare(b.title));
  if (pinned.length) box.append(section('pinned', 'Pinned', 'star', null, pinned.map(d => row(d, 1))));
  if (A.prefs.side === 'tree') {
    const draw = (pid, depth) => { const out = []; for (const d of kidsOf(pid)) { out.push(row(d, depth, true)); if (A.prefs.open[d.id] && kidsOf(d.id).length) out.push(...draw(d.id, depth + 1)); } return out; };
    box.append(section('all', 'Everything', 'folder', () => newDocMenu(null), draw('', 1)));
  } else {
    for (const t of Object.keys(TYPES)) {
      const list = sortedOf(t); if (!list.length && !['session', 'character', 'location'].includes(t)) continue;
      box.append(section('k-' + t, TYPES[t].plural, TYPES[t].icon, () => create(t), list.map(d => row(d, 1)), TYPES[t].color, list.length));
    }
  }
  if (!A.docs.size) box.append(h('p', { class: 'hint pad', text: 'Nothing written yet. Start with New, or Ctrl+N.' }));
  if (A.wdocs.size) box.append(section('world', 'From ' + A.wname, 'globe', null, [...A.wdocs.values()].sort((a, b) => a.title.localeCompare(b.title)).map(d => row(d, 1)), null, A.wdocs.size));
  roving();
  function section(key, title, ic, add, rows, color, count) {
    const closed = A.prefs.closed[key] ?? false;
    const head = h('div', { class: 'tsec' + (closed ? ' closed' : '') },
      h('button', { type: 'button', class: 'tsecb', 'aria-expanded': String(!closed), onclick: () => { A.prefs.closed[key] = !closed; savePrefs(); renderSide(); } },
        h('span', { class: 'tcar', html: icon('down') }), h('span', { class: 'tsi', html: icon(ic), style: color ? `color:${color}` : '' }), h('span', { class: 'grow', text: title }), count ? h('span', { class: 'tcount', text: count, 'aria-label': `(${count})` }) : null),
      add ? ib('plus', 'New ' + (TYPES[key.slice(2)] ? TYPES[key.slice(2)].name.toLowerCase() : 'document'), () => add(), 'tadd') : null);
    return h('div', { class: 'tgroup' }, head, closed ? null : h('div', { role: 'tree', 'aria-label': title }, rows));
  }
  function row(d, depth, tree) {
    const kids = tree && kidsOf(d.id).length, open = !!A.prefs.open[d.id], ro = isRO(d), live = !!d.live;
    const r = h('div', { class: 'trow' + (d.id === cur ? ' on' : '') + (ro ? ' ro' : ''), role: 'treeitem', tabIndex: -1, 'aria-level': depth, 'aria-selected': String(d.id === cur), 'aria-expanded': kids ? String(open) : null,
      draggable: !ro, style: `--d:${depth - 1};--c:${typeColor(d)}`, 'data-id': d.id, title: d.title + (ro ? ` (from ${A.wname}, read only)` : ''),
      onclick: () => openDoc(d.id), oncontextmenu: e => { e.preventDefault(); if (!ro) docMenu(d, e.clientX, e.clientY); } },
      tree ? h('span', { class: 'tcar2' + (kids ? '' : ' none') + (open ? ' open' : ''), html: icon('right'), 'aria-hidden': 'true', onclick: e => { e.stopPropagation(); if (!kids) return; A.prefs.open[d.id] = !open; savePrefs(); renderSide(); } }) : null,
      h('span', { class: 'ti', html: icon(TYPES[d.type].icon), 'aria-hidden': 'true' }), h('span', { class: 'tt', text: d.title }),
      live ? h('span', { class: 'tlive', html: icon('eye'), title: 'The players see this', 'aria-label': '(shown to the players)' }) : null,
      d.type === 'session' && (d.fields || {}).status === 'Played' ? h('span', { class: 'tdone', html: icon('check'), 'aria-label': '(played)' }) : null,
      tree ? ib('plus', 'New document inside ' + d.title, () => newDocMenu(d.id), 'tadd') : null);
    if (!ro) r.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-cn-doc', d.id); e.dataTransfer.setData('text/plain', `[[${d.title}]]`); e.dataTransfer.effectAllowed = 'copyMove'; });
    if (tree) {
      r.addEventListener('dragover', e => { if (!e.dataTransfer.types.includes('text/x-cn-doc')) return; e.preventDefault(); const b = r.getBoundingClientRect(), y = (e.clientY - b.top) / b.height; r.dataset.drop = y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'in'; });
      r.addEventListener('dragleave', () => { delete r.dataset.drop; });
      r.addEventListener('drop', e => { const id = e.dataTransfer.getData('text/x-cn-doc'), zone = r.dataset.drop; delete r.dataset.drop; if (!id || id === d.id) return; e.preventDefault(); moveDoc(id, d.id, zone); });
    }
    return r;
  }
  // one row in the tree takes Tab; the arrow keys move between rows
  function roving() { const rows = $$('.trow', box); const at = rows.find(r => r.classList.contains('on')) || rows[0]; if (at) at.tabIndex = 0; }
}
// the tree's keys: up and down, right and left open and close, Enter opens, Shift+F10 or the menu key for the document's menu
function treeKeys(e) {
  const r = e.target.closest('.trow'); if (!r) return;
  const rows = $$('#tree .trow'), i = rows.indexOf(r), d = D(r.dataset.id);
  const to = k => { const x = rows[Math.max(0, Math.min(rows.length - 1, k))]; if (!x) return; rows.forEach(y => { y.tabIndex = -1; }); x.tabIndex = 0; x.focus(); };
  if (e.key === 'ArrowDown') { e.preventDefault(); to(i + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); to(i - 1); }
  else if (e.key === 'Home') { e.preventDefault(); to(0); }
  else if (e.key === 'End') { e.preventDefault(); to(rows.length - 1); }
  else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && r.hasAttribute('aria-expanded')) { e.preventDefault(); A.prefs.open[d.id] = e.key === 'ArrowRight'; savePrefs(); renderSide(); const n = $(`#tree .trow[data-id="${d.id}"]`); if (n) { $$('#tree .trow').forEach(y => { y.tabIndex = -1; }); n.tabIndex = 0; n.focus(); } }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDoc(d.id); }
  else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') { e.preventDefault(); if (!isRO(d)) { const b = r.getBoundingClientRect(); docMenu(d, b.left + 20, b.bottom); } }
  else if (e.key === 'Delete' && !isRO(d)) { e.preventDefault(); deleteDoc(d.id); }
}
function moveDoc(id, target, zone) {
  const d = A.docs.get(id), t = A.docs.get(target); if (!d || !t) return;
  for (let p = t; p; p = A.docs.get(p.parent)) if (p.id === id) { toast('A document can\'t go inside itself.'); return; }
  if (zone === 'in') { d.parent = t.id; d.order = Date.now(); A.prefs.open[t.id] = true; savePrefs(); }
  else { d.parent = t.parent || ''; const sib = kidsOf(d.parent).filter(x => x.id !== id), k = sib.findIndex(x => x.id === t.id); const a = sib[zone === 'before' ? k - 1 : k], b = sib[zone === 'before' ? k : k + 1]; const oa = a ? (a.order ?? a.created) : (b ? (b.order ?? b.created) - 1000 : Date.now()), ob = b ? (b.order ?? b.created) : oa + 1000; d.order = (oa + ob) / 2; }
  touch(d); renderSide(); renderMain();
}
const campSys = () => (TABLE.on() && TABLE.T.lobby ? TABLE.sys() : (A.camp && A.camp.sys) || 'generic');

/* ---------- the main area ---------- */
let mainCleanup = null;
function renderMain() {
  if (mainCleanup) { try { mainCleanup(); } catch {} mainCleanup = null; }
  const main = $('#main'); main.replaceChildren(); main.className = '';
  hideHover(); applyLook();
  if (!A.camp) { VIEWS.welcome(main); return; }
  if (PAGES[A.view.k]) return PAGES[A.view.k].render(main);
  if (A.view.k === 'doc' && D(A.view.id)) return renderDoc(main, D(A.view.id));
  A.view = { k: 'home' }; VIEWS.home(main);
}

function renderDoc(main, d) {
  const mode = modeOf(d), ro = isRO(d); main.className = 'docmain m-' + mode + ' t-' + d.type;
  const crumbs = []; for (let p = D(d.parent); p && crumbs.length < 6; p = D(p.parent)) crumbs.unshift(p);
  const writing = mode === 'edit' || mode === 'split';
  // the bar: where it is; then reading or writing, the mind map, sending, and everything else under More
  const bar = h('div', { class: 'docbar', role: 'toolbar', 'aria-label': 'Document' },
    h('nav', { class: 'crumbs', 'aria-label': 'Where this document is' }, ...crumbs.flatMap(p => [h('button', { type: 'button', class: 'crumb', text: p.title, onclick: () => openDoc(p.id) }), h('span', { class: 'csep', html: icon('right'), 'aria-hidden': 'true' })]),
      h('span', { class: 'crumb cur', text: TYPES[d.type].name + (ro ? ' · ' + A.wname : '') })),
    h('div', { class: 'grow' }),
    d.type === 'session' && !ro ? btn(mode === 'run' ? 'stop' : 'play', mode === 'run' ? 'Stop running' : 'Run the session', () => setMode(d, mode === 'run' ? 'read' : 'run'), 'tiny' + (mode === 'run' ? ' on' : ' accent2')) : null,
    !ro && d.type !== 'board' ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Read or write' }, segBtn('read', 'Read', 'read', !writing && mode !== 'mind' && mode !== 'run'), segBtn('edit', 'Write', 'edit', writing)) : null,
    d.type !== 'board' ? h('button', { type: 'button', class: 'ib' + (mode === 'mind' ? ' on' : ''), title: 'Mind map (Ctrl+M)', 'aria-label': 'Mind map', 'aria-pressed': String(mode === 'mind'), html: icon('mind'), onclick: () => setMode(d, mode === 'mind' ? 'read' : 'mind') }) : null,
    btn('send', 'Send to table', e => VIEWS.sendMenu(d, e.currentTarget), 'tiny primary'),
    ro ? null : ib('dots', 'More for this document', e => docMenu(d, e.currentTarget)));
  function segBtn(m, label, ic, on) { return h('button', { type: 'button', class: 'segb' + (on ? ' on' : ''), 'aria-pressed': String(on), title: label + ' (Ctrl+E switches)', onclick: () => setMode(d, m === 'edit' && A.modes.get(d.id) === 'split' ? 'split' : m) }, h('span', { class: 'bi', html: icon(ic) }), h('span', { class: 'sl', text: label })); }
  main.append(bar);
  if (mode === 'mind') { main.append(h('h1', { class: 'sr', text: `${d.title}: mind map` }), mindPane(d)); return; }
  const scroll = h('div', { class: 'docscroll' }), page = h('div', { class: 'page' + (d.type === 'board' || d.type === 'map' ? ' wide' : '') });
  if (ro) page.append(h('div', { class: 'robar', role: 'note' }, h('span', { html: icon('globe') }), h('span', {}, 'From the shared world ', h('b', { text: A.wname }), '. Read only here.'), h('span', { class: 'grow' }), btn('open', 'Open it there', () => openWorldDoc(d), 'tiny')));
  // the title, and the kind of document it is
  const kindBtn = h('button', { type: 'button', class: 'kindbtn', style: `--c:${typeColor(d)}`, title: ro ? TYPES[d.type].name : `${TYPES[d.type].name}. Change what kind of document this is`, 'aria-label': `Kind: ${TYPES[d.type].name}${ro ? '' : '. Change it'}`, html: icon(TYPES[d.type].icon), disabled: ro, onclick: e => kindMenu(d, e.currentTarget) });
  const title = h('textarea', { class: 'title', rows: 1, value: d.title, spellcheck: true, placeholder: 'Untitled', 'aria-label': 'Title', readOnly: ro });
  const fit = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
  title.addEventListener('input', fit); requestAnimationFrame(fit);
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); const ta = $('.editor textarea'); if (ta) ta.focus(); } if (e.key === 'Escape') { title.value = d.title; title.blur(); } });
  title.addEventListener('blur', () => { if (!ro && title.value.trim() && title.value.trim() !== d.title) { renameDoc(d, title.value); title.value = d.title; paintTitle(); renderSide(); } else title.value = d.title; });
  // the page's heading for screen readers; the title field shows it to everyone else
  page.append(h('h1', { class: 'sr', text: `${d.title} (${TYPES[d.type].name})` }), h('div', { class: 'dhead' }, kindBtn, title));
  if (d.live && TABLE.on()) page.append(h('div', { class: 'livebar', role: 'note' }, h('span', { html: icon('eye') }), h('span', { text: 'The players see this. Changes reach their notes a few seconds after you write them.' }), h('span', { class: 'grow' }), btn(null, 'Stop showing it', () => { d.live = false; touch(d, true); renderMain(); renderSide(); }, 'tiny ghost')));
  if (d.carried) { page.append(h('p', { class: 'hint note', text: `${plural(d.carried, 'unrevealed clue')} came along from the last session.` })); delete d.carried; }
  page.append(propsBox(d, ro));
  if (d.type === 'map') page.append(mapPane(d, ro));
  if (d.type === 'board') { const host = h('div', { class: 'boardbox' }); page.append(host); queueMicrotask(() => BOARD.render(host, d, { onChange: () => touch(d) })); }
  if (mode === 'run') page.append(VIEWS.runBar(d));
  if (d.type !== 'board') {
    const body = h('div', { class: 'dbody' });
    if (writing) body.append(makeEditor(d));
    if (!writing || mode === 'split') body.append(makeReader(d, ro));
    page.append(body);
    if (mode === 'split') requestAnimationFrame(() => { const ta = $('.editor textarea', body), rd = $('.reader', body); if (ta && rd) ta.addEventListener('scroll', () => { rd.scrollTop = (ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight)) * (rd.scrollHeight - rd.clientHeight); }); });
  }
  if (mode === 'run') page.append(VIEWS.runLog(d));
  scroll.append(page); main.append(scroll);
  if (writing && !d.body.trim()) setTimeout(() => { const ta = $('.editor textarea'); if (ta && document.activeElement !== title) ta.focus(); }, 30);
}
// a shared-world document is changed in its own campaign
async function openWorldDoc(d) { const id = d.id, w = d.world; await openCampaign(w); openDoc(id); }
function scrollToLine(line) {
  const d = A.view.k === 'doc' && D(A.view.id); if (!d) return;
  const r = $('.reader [data-line="' + line + '"]') || [...$$('.reader [data-line]')].reverse().find(e => +e.dataset.line <= line);
  if (r) { r.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1400); return; }
  const ta = $('.editor textarea'); if (ta) { const pos = d.body.split('\n').slice(0, line).join('\n').length + (line ? 1 : 0); ta.focus(); ta.setSelectionRange(pos, pos); const lh = parseFloat(getComputedStyle(ta).lineHeight) || 24; ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 3); }
}

/* ---------- details: the fields, picture and relationships, folded away when they're not wanted ---------- */
let fid = 0;
function propsBox(d, ro) {
  const fl = (FIELDS[d.type] || []).filter(f => !f[4] || f[4](d)); d.fields = d.fields || {};
  // folded by default where there's little to fill in (notes, boards); the choice is remembered per kind
  const closed = A.prefs.details[d.type] ?? !(FIELDS[d.type] || []).length;
  const grid = h('div', { class: 'props' });
  for (const [k, label, kind, opts] of fl) {
    const v = d.fields[k] ?? '', id = 'f' + (++fid), set = val => { d.fields[k] = val; touch(d, kind !== 'link'); if (k === 'status' || k === 'num' || k === 'when') renderSide(); };
    let ctl;
    if (kind === 'sel') ctl = h('select', { id, disabled: ro, onchange: e => set(e.target.value) }, h('option', { value: '', text: '—' }), ...opts.map(o => h('option', { value: o, text: o, selected: o === v })));
    else if (kind === 'link') {
      const inp = h('input', { id, type: 'text', value: v, placeholder: 'A document…', list: 'titlesList', readOnly: ro });
      const go2 = h('button', { type: 'button', class: 'ib tiny', title: 'Open ' + v, 'aria-label': 'Open ' + (v || 'it'), html: icon('open'), hidden: !resolve(v), onclick: () => openDoc(resolve(inp.value)) });
      inp.addEventListener('input', () => { set(inp.value.trim()); go2.hidden = !resolve(inp.value); });
      inp.addEventListener('focus', fillTitles);
      ctl = h('span', { class: 'plink' }, inp, go2);
    } else if (kind === 'wdate') { ctl = PLAN.wdateInput(v || null, w => set(w), label); if (ro) ctl.querySelectorAll('input,select,button').forEach(x => { x.disabled = true; }); }
    else if (kind === 'clock') { ctl = PLAN.clockEl(v || { size: 6, filled: 0 }, w => { set(w); renderMain(); }, label); }
    else ctl = h('input', { id, type: kind === 'num' ? 'number' : kind === 'date' ? 'date' : 'text', value: v, readOnly: ro, oninput: e => set(kind === 'num' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value) });
    grid.append(kind === 'wdate' || kind === 'clock' ? h('span', { class: 'pl', text: label }) : h('label', { class: 'pl', for: id, text: label }), h('div', { class: 'pv' + (k === 'secret' ? ' secret' : '') }, ctl));
  }
  const tid = 'f' + (++fid);
  grid.append(h('label', { class: 'pl', for: tid, text: 'Tags' }), h('div', { class: 'pv' }, h('input', { id: tid, type: 'text', value: (d.tags || []).join(', '), placeholder: 'Comma, separated', readOnly: ro, oninput: e => { d.tags = e.target.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean); touch(d); } })));
  if (!['session', 'board', 'map'].includes(d.type)) grid.append(h('span', { class: 'pl', text: 'Relationships' }), h('div', { class: 'pv' }, PLAN.relsBox(d, ro)));
  const pic = ['character', 'location', 'item', 'faction', 'lore', 'quest', 'event'].includes(d.type);
  const inner = h('div', { class: 'propin' + (pic ? ' haspic' : '') }, grid);
  if (pic) {
    const frame = h('button', { type: 'button', class: 'pic' + (d.img ? '' : ' empty'), disabled: ro && !d.img, 'aria-label': d.img ? 'Change the picture' : 'Add a picture', title: d.img ? 'Change the picture' : 'Add a picture (or drop or paste one here)' });
    if (d.img) { frame.append(h('img', { 'data-cimg': d.img, alt: `Picture of ${d.title}` })); if (!ro) inner.append(ib('x', 'Remove the picture', () => { d.img = ''; touch(d); renderMain(); }, 'picx')); hydrate(frame); }
    else frame.innerHTML = icon('image') + '<span>Picture</span>';
    if (!ro) {
      frame.onclick = async () => { const f = await pickImage(); if (f) { d.img = f; touch(d); renderMain(); } };
      frame.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.type.startsWith('image/'))) e.preventDefault(); });
      frame.addEventListener('drop', async e => { const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (!f) return; e.preventDefault(); d.img = await STORE.putImage(cid(), f, f.name); touch(d); renderMain(); });
    }
    inner.append(frame);
  }
  if (d.table && d.table.ent) inner.append(h('div', { class: 'linkedent' }, h('span', { html: icon('table') }), h('span', { text: TABLE.T.ents.has(d.table.ent) ? 'Linked to the table\'s Library' : 'Came from a table\'s Library' })));
  // folded: a line of what's filled in
  const sum = fl.filter(([k, , kind]) => d.fields[k] && kind !== 'clock' && k !== 'secret').slice(0, 4).map(([k, l, kind]) => kind === 'wdate' ? PLAN.wfmt(d.fields[k], true) : String(d.fields[k])).filter(Boolean).join(' · ');
  const pid = 'p' + (++fid);
  const head = h('button', { type: 'button', class: 'prophead', 'aria-expanded': String(!closed), 'aria-controls': pid, onclick: () => { A.prefs.details[d.type] = !closed; savePrefs(); renderMain(); } },
    h('span', { class: 'tcar', html: icon('down') }), h('span', { class: 'phl', text: 'Details' }), closed && sum ? h('span', { class: 'phs', text: sum }) : null);
  return h('section', { class: 'propbox' + (closed ? ' closed' : ''), 'aria-label': 'Details' }, head, closed ? null : h('div', { id: pid }, inner));
}
function fillTitles() { const dl = $('#titlesList'); dl.replaceChildren(...[...A.docs.values()].sort((a, b) => a.title.localeCompare(b.title)).map(x => h('option', { value: x.title }))); }

/* ---------- reading ---------- */
function renderCtx() {
  return {
    icon: n => icon(n),
    tableTools: b => PLAN.tableTools(b),
    img: (src, alt) => src.startsWith('img:') ? `<img data-cimg="${esc(src.slice(4))}" alt="${esc(alt)}">` : /^https?:\/\//.test(src) ? `<img src="${esc(src)}" alt="${esc(alt)}" referrerpolicy="no-referrer" loading="lazy">` : '',
    tag: t => `<a class="tag" href="#" data-tag="${esc(t.toLowerCase())}">#${esc(t)}</a>`,
    link: li => {
      if (li.kind === 'doc') {
        const id = resolve(li.title), label = li.label || li.title + (li.heading ? ' › ' + li.heading : '');
        if (!id) return `<a class="wl new" href="#" data-new="${esc(li.title)}" title="Not written yet. Click to start it.">${esc(label)}</a>`;
        const x = D(id), w = isRO(x); return `<a class="wl${w ? ' world' : ''}" href="#" data-doc="${id}" data-h="${esc(li.heading)}" style="--c:${typeColor(x)}"${w ? ` title="From ${esc(A.wname)}"` : ''}>${icon(TYPES[x.type].icon)}${esc(label)}</a>`;
      }
      if (li.kind === 'table') { const e = TABLE.T.ents.get(li.ref); return `<a class="tl${e ? '' : ' off'}" href="#" data-ent="${esc(li.ref)}" title="In the table's Library">${icon('table')}${esc(li.label || (e && e.name) || 'Table entry')}</a>`; }
      if (li.kind === 'srd') return `<a class="tl srd" href="#" data-srd="${esc(li.ref)}" title="From the SRD">${icon('lore')}${esc(li.label)}</a>`;
      if (li.kind === 'sound') return `<button type="button" class="cue" data-cue="${esc(li.ref)}" data-name="${esc(li.label)}" title="Play it on Critter Sounds">${icon('play')}${esc(li.label)}</button>`;
      if (li.kind === 'roll') return `<button type="button" class="dice" data-roll="${esc(li.ref)}" title="Roll it">${icon('dice')}${esc(li.label || li.ref)}</button>`;
      return esc(li.raw);
    }
  };
}
function makeReader(d, ro) {
  const r = h('div', { class: 'reader prose' + (d.body.trim() ? '' : ' empty') });
  r.innerHTML = d.body.trim() ? MD.render(d.body, renderCtx()) : `<p class="hint">${ro ? 'Nothing written.' : 'Nothing written yet. Double-click here, or press Write.'}</p>`;
  hydrate(r);
  if (ro) r.querySelectorAll('input[type=checkbox]').forEach(c => { c.disabled = true; });
  r.addEventListener('change', e => {
    const c = e.target; if (c.type !== 'checkbox' || c.dataset.line === undefined) return;
    d.body = MD.toggleTask(d.body, +c.dataset.line, c.checked); touch(d, true);
    c.closest('li').classList.toggle('done', c.checked);
  });
  r.addEventListener('click', e => readerClick(e, d));
  r.addEventListener('dblclick', e => {
    if (e.target.closest('a,button,input,img')) return;
    const at = e.target.closest('[data-line]'), line = at ? +at.dataset.line : 0;
    if (!isRO(d) && (modeOf(d) === 'read' || modeOf(d) === 'run')) { A.modes.set(d.id, 'edit'); renderMain(); setTimeout(() => scrollToLine(line), 20); }
  });
  return r;
}
async function hydrate(root) { for (const im of root.querySelectorAll('img[data-cimg]')) { const u = await STORE.imageUrl(cid(), im.dataset.cimg).catch(() => ''); if (u) im.src = u; else im.classList.add('missing'); } }
function readerClick(e, d) {
  const a = e.target.closest('a,button'); if (!a) return;
  if (a.dataset.rolltable !== undefined) { e.preventDefault(); return PLAN.rollTableAt(a, d); }
  if (a.classList.contains('ext')) return;
  e.preventDefault();
  if (a.dataset.doc) { if (e.ctrlKey || e.metaKey) return peek(a); const t = D(a.dataset.doc); if (!t) return; const hd = a.dataset.h; const line = hd ? (MD.outline(t.body).find(x => x.text.toLowerCase() === hd.toLowerCase()) || {}).line : undefined; openDoc(t.id, line !== undefined ? { line } : null); return; }
  if (a.dataset.new) return createFromLink(a.dataset.new, a);
  if (a.dataset.ent || a.dataset.srd) return peek(a, true);
  if (a.dataset.cue) return VIEWS.playCue(a.dataset.cue, a.dataset.name, a);
  if (a.dataset.roll) return rollDice(a.dataset.roll, a);
  if (a.dataset.tag) { $('#sideFilter').value = '#' + a.dataset.tag; renderSide(); return; }
}
function createFromLink(title, anchor) {
  menu([{ head: `"${title}" isn't written yet. Make it a…` }, ...['character', 'location', 'faction', 'item', 'quest', 'event', 'lore', 'note', 'session', 'map'].map(t => ({ label: TYPES[t].name, icon: TYPES[t].icon, color: TYPES[t].color, fn: () => { const x = newDoc({ type: t, title }); if (x.title !== title) toast(`"${title}" is taken; this one is "${x.title}".`); openDoc(x.id); } }))], anchor);
}

/* ---------- dice ---------- */
function rollDice(expr, anchor) {
  const src = String(expr).replace(/\s+/g, '').toLowerCase(); let total = 0; const parts = [];
  const rx = /([+-]?)(\d*)d(\d+|%)(k[hl]\d+)?|([+-]?)(\d+)/g; let m, ok = false;
  while ((m = rx.exec(src))) {
    ok = true;
    if (m[3]) {
      const n = Math.min(100, +m[2] || 1), s = m[3] === '%' ? 100 : +m[3], sign = m[1] === '-' ? -1 : 1;
      let rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * s)), kept = rolls.slice();
      if (m[4]) { const k = +m[4].slice(2), srt = rolls.slice().sort((a, b) => (m[4][1] === 'h' ? b - a : a - b)); kept = srt.slice(0, k); }
      total += sign * kept.reduce((a, b) => a + b, 0); parts.push(`${sign < 0 ? '−' : parts.length ? '+' : ''}[${rolls.join(', ')}]`);
    } else { const v = (m[5] === '-' ? -1 : 1) * +m[6]; total += v; parts.push((v < 0 ? '−' : '+') + Math.abs(v)); }
  }
  if (!ok) { toast('That isn\'t a roll Critter Notes understands.'); return; }
  bubble(anchor, `<b>${total}</b><span>${esc(expr)} → ${esc(parts.join(' '))}</span>`);
}
function bubble(anchor, html) {
  const b = h('div', { class: 'bubble', html }); document.body.append(b);
  const r = anchor.getBoundingClientRect(); b.style.left = Math.min(innerWidth - b.offsetWidth - 8, r.left) + 'px'; b.style.top = (r.top - b.offsetHeight - 8) + 'px';
  setTimeout(() => b.classList.add('out'), 2600); setTimeout(() => b.remove(), 3000);
}

/* ---------- hover cards: a peek at a link without leaving ---------- */
let hovT = 0, hovFor = null;
function hideHover() { clearTimeout(hovT); const c = $('#hov'); if (c) { c.hidden = true; c.classList.remove('sticky'); } hovFor = null; }
document.addEventListener('mouseover', e => {
  const a = e.target.closest('.wl[data-doc],.tl[data-ent],.tl[data-srd]'), card = $('#hov');
  if (e.target.closest('#hov')) { clearTimeout(hovT); return; }
  if (card.classList.contains('sticky')) return;
  if (!a) { if (hovFor) { clearTimeout(hovT); hovT = setTimeout(hideHover, 250); } return; }
  if (a === hovFor) return;
  clearTimeout(hovT); hovT = setTimeout(() => peek(a), 380);
});
async function peek(a, sticky) {
  const card = $('#hov'); clearTimeout(hovT);
  if (!sticky && card.classList.contains('sticky')) return;
  hovFor = a; card.replaceChildren(); card.classList.toggle('sticky', !!sticky);
  if (a.dataset.doc) {
    const d = D(a.dataset.doc); if (!d) return;
    const flds = (FIELDS[d.type] || []).filter(([k]) => d.fields && d.fields[k] !== undefined && d.fields[k] !== '' && k !== 'secret').slice(0, 4);
    card.append(h('div', { class: 'hk', style: `--c:${typeColor(d)}`, html: icon(TYPES[d.type].icon) + `<span>${TYPES[d.type].name}</span>` }), h('b', { class: 'ht', text: d.title }));
    if (flds.length) card.append(h('div', { class: 'hf' }, ...flds.map(([k, l]) => h('span', {}, h('i', { text: l + ' ' }), String(d.fields[k])))));
    if (d.img) { const im = h('img', { class: 'hpic', 'data-cimg': d.img }); card.append(im); hydrate(card); }
    const txt = MD.plain(d.body).replace(/\s+/g, ' ').trim(); card.append(h('p', { text: txt ? txt.slice(0, 280) + (txt.length > 280 ? '…' : '') : 'Nothing written yet.' }));
  } else if (a.dataset.ent) {
    const e = TABLE.T.ents.get(a.dataset.ent);
    if (!e) card.append(h('b', { class: 'ht', text: 'Not at the table right now' }), h('p', { class: 'hint', text: TABLE.on() ? 'This entry isn\'t in the linked table\'s Library any more.' : 'Link this campaign to its table to see it.' }));
    else {
      card.append(h('div', { class: 'hk', html: icon('table') + `<span>${esc(e.kind)} in the table's Library</span>` }), h('b', { class: 'ht', text: e.name }));
      const t = String((e.data || {}).notes || (e.data || {}).desc || (e.data || {}).feature || (e.data || {}).traits || '').trim(); if (t) card.append(h('p', { text: t.slice(0, 300) }));
      if (sticky) card.append(h('div', { class: 'row' }, btn('note', 'Make a document from it', () => { hideHover(); VIEWS.entToDoc(e); }, 'tiny')));
    }
  } else if (a.dataset.srd) {
    card.append(h('p', { class: 'hint', text: 'Looking it up…' }));
    const x = await SRD.get(a.dataset.srd); if (hovFor !== a) return;
    card.replaceChildren();
    if (!x) card.append(h('b', { class: 'ht', text: 'Not in the SRD' }));
    else {
      card.append(h('div', { class: 'hk', html: icon('lore') + `<span>${esc(SRD.SYSTEMS[x.sys] || x.sys)} · ${esc(x.c || x.kind)}</span>` }), h('b', { class: 'ht', text: x.n }));
      if (x.s) card.append(h('div', { class: 'hf', text: x.s }));
      const t = String(x.x || (x.d && (x.d.traits || x.d.desc)) || ''); if (t) card.append(h('p', { text: t.slice(0, 360) + (t.length > 360 ? '…' : '') }));
      if (sticky) card.append(h('div', { class: 'row' },
        x.kind === 'item' || x.kind === 'npc' ? btn('send', 'Add to the table', () => { hideHover(); VIEWS.srdToTable(x); }, 'tiny') : null,
        btn('note', 'Make a document', () => { hideHover(); VIEWS.srdToDoc(x); }, 'tiny')));
    }
  }
  card.hidden = false;
  const r = a.getBoundingClientRect(), w = card.offsetWidth, ht = card.offsetHeight;
  card.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
  card.style.top = (r.bottom + ht + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - ht - 6)) + 'px';
}
document.addEventListener('pointerdown', e => { const c = $('#hov'); if (c && c.classList.contains('sticky') && !e.target.closest('#hov')) hideHover(); }, true);

/* ============================== the editor ============================== */
function makeEditor(d) {
  const ta = h('textarea', { class: 'src', value: d.body, spellcheck: true, 'aria-label': 'Text of ' + d.title, 'aria-autocomplete': 'list', 'aria-controls': 'ac', placeholder: 'Write here. [[ links to a document, an item or a monster; / adds a block (an alternative path, read-aloud text, a secret…).' });
  const tools = h('div', { class: 'etools', role: 'toolbar', 'aria-label': 'Writing tools' },
    ib('heading', 'Heading', () => linePrefix(ta, '## ')), ib('bold', 'Bold (Ctrl+B)', () => wrapSel(ta, '**')), ib('italic', 'Italic (Ctrl+I)', () => wrapSel(ta, '*')),
    ib('list', 'List', () => linePrefix(ta, '- ')), ib('tasks', 'Checklist', () => linePrefix(ta, '- [ ] ')), h('span', { class: 'esep' }),
    ib('branch', 'Alternative path', () => insertBlock(ta, '> [!branch] If the party |\n> - ')), ib('speech', 'Read-aloud text', () => insertBlock(ta, '> [!read] |\n> ')),
    ib('eye-off', 'GM secret', () => insertBlock(ta, '> [!secret] |\n> ')), ib('key', 'Clue', () => insertBlock(ta, '> [!clue] |\n> ')), h('span', { class: 'esep' }),
    ib('link', 'Link a document, item or monster ([[)', () => { replaceSel(ta, '[[', 2); acCheck(ta, d); }), ib('image', 'Picture', async () => { const f = await pickImage(); if (f) replaceSel(ta, `![](img:${f})\n`); }),
    ib('music', 'Sound cue', e => VIEWS.soundPicker(e.currentTarget, s => replaceSel(ta, s))), ib('dice', 'Dice button', () => replaceSel(ta, '[[roll:1d20]]')), h('span', { class: 'esep' }),
    ib('swords', 'Encounter builder', () => PLAN.encounter(t => insertLines(ta, t))), ib('table2', 'Random table', () => insertLines(ta, PLAN.TABLE_SNIP)));
  const wrap = h('div', { class: 'editor' }, tools, ta);
  const fit = () => { if (modeOf(d) === 'edit') { ta.style.height = 'auto'; ta.style.height = Math.max(360, ta.scrollHeight + 40) + 'px'; } };
  requestAnimationFrame(fit);
  const refreshPreview = debounce(() => { const rd = $('.reader', wrap.parentElement); if (rd) { const st = rd.scrollTop; rd.replaceWith(makeReader(d)); const n = $('.reader', $('#main')); if (n) n.scrollTop = st; } }, 250);
  ta.addEventListener('input', () => { d.body = ta.value; touch(d); fit(); if (modeOf(d) === 'split') refreshPreview(); acCheck(ta, d); });
  ta.addEventListener('keydown', e => editorKey(e, ta, d));
  ta.addEventListener('click', () => acCheck(ta, d));
  ta.addEventListener('blur', () => setTimeout(() => { if (!document.activeElement || !document.activeElement.closest('#ac')) acClose(); }, 150));
  ta.addEventListener('paste', async e => {
    const files = [...(e.clipboardData || {}).files || []].filter(f => f.type.startsWith('image/')); if (!files.length) return;
    e.preventDefault(); for (const f of files) { const name = await STORE.putImage(cid(), f, f.name || 'pasted.png'); replaceSel(ta, `![](img:${name})\n`); }
  });
  ta.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-cn-doc') || e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  ta.addEventListener('drop', async e => {
    const id = e.dataTransfer.getData('text/x-cn-doc');
    if (id && D(id)) { e.preventDefault(); ta.focus(); replaceSel(ta, `[[${D(id).title}]]`); return; }
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')); if (!files.length) return;
    e.preventDefault(); for (const f of files) { const name = await STORE.putImage(cid(), f, f.name); replaceSel(ta, `![](img:${name})\n`); }
  });
  return wrap;
}
// editing through execCommand keeps Ctrl+Z working
function replaceRange(ta, s, e, text, caret) { ta.focus(); ta.setSelectionRange(s, e); if (!document.execCommand('insertText', false, text)) { ta.setRangeText(text, s, e, 'end'); ta.dispatchEvent(new Event('input')); } const c = s + (caret === undefined ? text.length : caret); ta.setSelectionRange(c, c); }
function replaceSel(ta, text, caret) { replaceRange(ta, ta.selectionStart, ta.selectionEnd, text, caret); }
function wrapSel(ta, m) { const s = ta.selectionStart, e = ta.selectionEnd, t = ta.value.slice(s, e); replaceRange(ta, s, e, m + t + m, t ? undefined : m.length); }
function lineBounds(ta) { const v = ta.value, s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1; let e = v.indexOf('\n', ta.selectionEnd); if (e < 0) e = v.length; return [s, e]; }
function linePrefix(ta, p) { const [s, e] = lineBounds(ta); const lines = ta.value.slice(s, e).split('\n'); const all = lines.every(l => l.startsWith(p)); replaceRange(ta, s, e, lines.map(l => (all ? l.slice(p.length) : p + l.replace(/^(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?)/, ''))).join('\n')); }
function insertBlock(ta, snippet) {
  const v = ta.value, [s, e] = lineBounds(ta), cur = v.slice(s, e);
  const pre = cur.trim() ? (e < v.length ? '' : '\n') : '', at = cur.trim() ? e : s, lead = cur.trim() ? '\n\n' : (s > 0 && v[s - 2] !== '\n' && v[s - 1] === '\n' && v.slice(0, s).trim() ? '\n' : '');
  const k = snippet.indexOf('|'), text = lead + snippet.replace('|', '') + '\n';
  replaceRange(ta, at, cur.trim() ? e : e, (cur.trim() ? pre : '') + text, (cur.trim() ? pre.length : 0) + lead.length + (k < 0 ? snippet.length : k));
}
// a block of lines after the line the caret is on (or in its place, when that line is empty)
function insertLines(ta, text) {
  const [s, e] = lineBounds(ta), cur = ta.value.slice(s, e);
  if (!cur.trim()) replaceRange(ta, s, e, text); else replaceRange(ta, e, e, '\n\n' + text);
}
function editorKey(e, ta, d) {
  if (acKey(e, ta, d)) return;
  const c = e.ctrlKey || e.metaKey;
  if (c && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapSel(ta, '**'); return; }
  if (c && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapSel(ta, '*'); return; }
  if (c && e.key.toLowerCase() === 'l') { e.preventDefault(); replaceSel(ta, '[[', 2); acCheck(ta, d); return; }
  if (e.key === 'Tab') {
    e.preventDefault(); const [s, en] = lineBounds(ta), lines = ta.value.slice(s, en).split('\n');
    const isList = lines.some(l => /^\s*(?:>\s?)*\s*([-*+]|\d+[.)])\s/.test(l));
    if (!isList && !e.shiftKey && ta.selectionStart === ta.selectionEnd) { replaceSel(ta, '  '); return; }
    const out = lines.map(l => { const m = /^((?:\s*>\s?)*)(.*)$/.exec(l); return e.shiftKey ? m[1] + m[2].replace(/^ {1,2}|^\t/, '') : m[1] + '  ' + m[2]; });
    const pos = ta.selectionStart; replaceRange(ta, s, en, out.join('\n')); const shift = out[0].length - lines[0].length; ta.setSelectionRange(Math.max(s, pos + shift), Math.max(s, pos + shift));
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey && !c && ta.selectionStart === ta.selectionEnd) {
    const [s, en] = lineBounds(ta); if (ta.selectionStart !== en) return;
    const line = ta.value.slice(s, en), m = /^((?:\s*>\s?)*)(\s*)([-*+]|\d{1,3}[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (m) {
      e.preventDefault();
      if (!m[6].trim()) { replaceRange(ta, s, en, m[1].replace(/\s+$/, m[1] ? ' ' : '')); return; }
      const num = /\d/.test(m[3]) ? (parseInt(m[3], 10) + 1) + m[3].slice(-1) : m[3];
      replaceSel(ta, '\n' + m[1] + m[2] + num + m[4] + (m[5] ? '[ ] ' : ''));
      return;
    }
    const q = /^((?:\s*>\s?)+)(.*)$/.exec(line);
    if (q) { e.preventDefault(); if (!q[2].trim() && !/\[!/.test(line)) replaceRange(ta, s, en, ''); else replaceSel(ta, '\n' + q[1].replace(/\s*$/, ' ')); return; }
  }
}

/* ---------- [[ and / : picking a link or a block as you type ---------- */
const SLASH = [
  ['Alternative path', 'branch', '> [!branch] If the party |\n> - '], ['Read-aloud text', 'speech', '> [!read] |\n> '], ['GM secret', 'eye-off', '> [!secret] |\n> '],
  ['Clue', 'key', '> [!clue] |\n> '], ['Encounter', 'swords', '> [!combat] |\n> - '], ['Treasure', 'gem', '> [!loot] |\n> - '], ['Scene', 'clapper', '### Scene: |\n'],
  ['Open question', 'help', '> [!question] |\n> '], ['Heading', 'heading', '## |'], ['Checklist', 'tasks', '- [ ] |'], ['List', 'list', '- |'],
  ['Table', 'table2', '§table'], ['Random table', 'dice', '§rtable'], ['Encounter builder', 'swords', '§enc'], ['Divider', 'minus', '---\n|'], ['Link', 'link', '[[|'], ['Dice', 'dice', '[[roll:1d20|]]'],
  ['Sound cue', 'music', '§sound'], ['Picture', 'image', '§image'], ['Today\'s date', 'clock', '§date']
];
const SLASH_WORDS = { table2: 'grid columns rows', swords: 'combat fight monsters battle encounter builder', dice: 'roll random table', branch: 'alt option if choice fork', speech: 'boxed text description narrate', 'eye-off': 'hidden gm private', key: 'secret hint', gem: 'loot reward', clapper: 'scene', help: 'question todo', tasks: 'todo check box', image: 'map photo', music: 'audio cue pad playlist', dice: 'roll' };
let AC = null;
function acClose() { const p = $('#ac'); if (p) p.hidden = true; if (AC && AC.ta) AC.ta.removeAttribute('aria-activedescendant'); AC = null; }
async function acCheck(ta, d) {
  const pos = ta.selectionStart, before = ta.value.slice(0, pos), ls = before.lastIndexOf('\n') + 1, line = before.slice(ls);
  const wk = line.lastIndexOf('[[');
  if (wk >= 0 && !line.slice(wk).includes(']]')) { const q = line.slice(wk + 2); if (q.length <= 60) return acOpen(ta, d, 'link', ls + wk, q); }
  const sm = /^(\s*(?:>\s?)*)\/([\w' ]{0,20})$/.exec(line);
  if (sm) return acOpen(ta, d, 'slash', ls + sm[1].length, sm[2]);
  acClose();
}
async function acOpen(ta, d, kind, start, q) {
  const tok = AC = { ta, d, kind, start, q, items: [], sel: 0 };
  let items = [];
  if (kind === 'slash') { const qq = q.toLowerCase().trim(); items = SLASH.filter(([l, ic, snip]) => !qq || `${l} ${ic} ${snip} ${SLASH_WORDS[ic] || ''}`.toLowerCase().includes(qq)).map(([label, ic, snip]) => ({ label, ic, snip })); }
  else {
    const ql = q.toLowerCase().trim(), mode = /^(table|srd|sound|roll):/i.exec(q);
    if (!mode) {
      const docs = [...A.docs.values(), ...A.wdocs.values()].filter(x => x.id !== d.id && (!ql || x.title.toLowerCase().includes(ql))).sort((a, b) => (a.title.toLowerCase().startsWith(ql) ? 0 : 1) - (b.title.toLowerCase().startsWith(ql) ? 0 : 1) || b.updated - a.updated).slice(0, 7);
      items.push(...docs.map(x => ({ label: x.title, ic: TYPES[x.type].icon, color: typeColor(x), sub: (isRO(x) ? A.wname + ' · ' : '') + TYPES[x.type].name, ins: `[[${x.title}]]` })));
      if (ql && !resolve(q)) items.push({ label: `New: ${q.trim()}`, ic: 'plus', sub: 'A document to write later', ins: `[[${q.trim()}]]` });
    }
    const qq = mode ? q.slice(mode[0].length).toLowerCase().trim() : ql;
    if (TABLE.on() && (!mode || mode[1].toLowerCase() === 'table') && qq) items.push(...[...TABLE.T.ents.values()].filter(e => String(e.name || '').toLowerCase().includes(qq)).slice(0, 5).map(e => ({ label: e.name, ic: 'table', sub: `Table · ${e.kind}`, ins: `[[table:${e.id}|${e.name}]]` })));
    const sc = TABLE.T.sounds;
    if (sc && (!mode || mode[1].toLowerCase() === 'sound') && qq) for (const [k, l] of [['scene', 'scenes'], ['playlist', 'playlists'], ['pad', 'pads'], ['scape', 'scapes']]) items.push(...(sc[l] || []).filter(x => String(x.name).toLowerCase().includes(qq)).slice(0, 3).map(x => ({ label: x.name, ic: 'music', sub: 'Critter Sounds · ' + VIEWS.SOUND_KIND[k], ins: `[[sound:${k}/${x.id}|${x.name}]]` })));
    if (mode && mode[1].toLowerCase() === 'roll') items.push({ label: 'Roll ' + (qq || '1d20'), ic: 'dice', ins: `[[roll:${qq || '1d20'}]]` });
    if ((!mode || mode[1].toLowerCase() === 'srd') && qq.length >= 2) {
      const hits = await SRD.search(campSys(), qq, 6);
      if (AC !== tok) return;
      items.push(...hits.map(x => ({ label: x.n, ic: x.kind === 'npc' ? 'character' : x.kind === 'item' ? 'item' : 'lore', sub: `SRD · ${x.c || SRD.KINDS[x.kind]}`, ins: `[[srd:${SRD.refOf(x)}|${x.n}]]` })));
    }
  }
  tok.items = items;
  if (!items.length) { acClose(); return; }
  const p = $('#ac'); p.replaceChildren(...items.map((it, i) => h('div', { class: 'aci' + (i === 0 ? ' on' : ''), id: 'ac-' + i, role: 'option', 'aria-selected': String(i === 0), onmousedown: e => { e.preventDefault(); acPick(i); } },
    h('span', { class: 'aic', html: icon(it.ic), style: it.color ? `color:${it.color}` : '' }), h('span', { class: 'acl', text: it.label }), it.sub ? h('span', { class: 'acs', text: it.sub }) : null)));
  p.hidden = false; ta.setAttribute('aria-activedescendant', 'ac-0');
  const c = caretXY(ta, start), w = p.offsetWidth, ht = p.offsetHeight;
  p.style.left = Math.max(8, Math.min(innerWidth - w - 8, c.x)) + 'px'; p.style.top = (c.y + c.h + ht + 8 < innerHeight ? c.y + c.h + 4 : c.y - ht - 4) + 'px';
}
function acKey(e, ta, d) {
  if (!AC || AC.ta !== ta || $('#ac').hidden) return false;
  const n = AC.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); AC.sel = (AC.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; $$('#ac .aci').forEach((b, i) => { b.classList.toggle('on', i === AC.sel); b.setAttribute('aria-selected', String(i === AC.sel)); }); ta.setAttribute('aria-activedescendant', 'ac-' + AC.sel); $$('#ac .aci')[AC.sel].scrollIntoView({ block: 'nearest' }); return true; }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acPick(AC.sel); return true; }
  if (e.key === 'Escape') { e.preventDefault(); acClose(); return true; }
  return false;
}
async function acPick(i) {
  const { ta, kind, start, items, d } = AC || {}; const it = items && items[i]; if (!it) return;
  acClose();
  const end = ta.selectionStart;
  if (kind === 'link') { const after = ta.value.slice(end, end + 2) === ']]' ? 2 : 0; replaceRange(ta, start, end + after, it.ins); return; }
  if (it.snip === '§sound') { replaceRange(ta, start, end, ''); VIEWS.soundPicker(ta, s => replaceSel(ta, s)); return; }
  if (it.snip === '§image') { replaceRange(ta, start, end, ''); const f = await pickImage(); if (f) replaceSel(ta, `![](img:${f})\n`); return; }
  if (it.snip === '§table') { replaceRange(ta, start, end, '| Column | Column |\n| --- | --- |\n|  |  |\n', 2); return; }
  if (it.snip === '§rtable') { replaceRange(ta, start, end, PLAN.TABLE_SNIP); return; }
  if (it.snip === '§enc') { replaceRange(ta, start, end, ''); PLAN.encounter(t => insertLines(ta, t)); return; }
  if (it.snip === '§date') { replaceRange(ta, start, end, new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })); return; }
  // blocks inside a callout keep its "> "
  const ls = ta.value.lastIndexOf('\n', start - 1) + 1, pre = ta.value.slice(ls, start);
  const k = it.snip.indexOf('|'), text = it.snip.replace('|', '').split('\n').map((l, j) => (j ? pre + l : l)).join('\n');
  const caret = k < 0 ? text.length : it.snip.slice(0, k).split('\n').map((l, j) => (j ? pre + l : l)).join('\n').length;
  replaceRange(ta, start, end, text, caret);
  if (it.snip.startsWith('[[|')) acCheck(ta, d);
}
// where the caret is on screen, measured with a copy of the textarea
function caretXY(ta, pos) {
  const cs = getComputedStyle(ta), m = document.createElement('div');
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom', 'borderTopWidth', 'borderLeftWidth', 'boxSizing', 'tabSize']) m.style[p] = cs[p];
  Object.assign(m.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: ta.clientWidth + 'px', left: '-9999px', top: '0' });
  m.textContent = ta.value.slice(0, pos); const s = document.createElement('span'); s.textContent = '​'; m.append(s); document.body.append(m);
  const r = ta.getBoundingClientRect(), out = { x: r.left + s.offsetLeft - ta.scrollLeft, y: r.top + s.offsetTop - ta.scrollTop, h: parseFloat(cs.lineHeight) || 22 };
  m.remove(); return out;
}

/* ============================== map and mind map panes ============================== */
const mapViews = new Map(), mindViews = new Map();
function mapPane(d, ro) {
  const wrap = h('div', { class: 'mapwrap' });
  if (!d.map) d.map = { img: '', w: 0, h: 0, pins: [] };
  const tools = h('div', { class: 'maptools' },
    btn('image', d.map.img ? 'Change the picture' : 'Choose a picture', async () => { const f = await pickImage(); if (f) { d.map.img = f; d.map.w = 0; touch(d); mapViews.delete(d.id); renderMain(); } }, 'tiny'),
    TABLE.on() ? btn('table', 'From a table scene', e => VIEWS.scenePicker(e.currentTarget, async sc => { const f = await VIEWS.sceneToFile(sc); if (f) { d.map.img = f; d.map.w = 0; touch(d); mapViews.delete(d.id); renderMain(); } }), 'tiny') : null,
    h('span', { class: 'grow' }), h('span', { class: 'hint', text: d.map.img ? 'Drag a document here from the sidebar to pin it. Double-click a pin to open what it leads to.' : '' }));
  if (!ro) wrap.append(tools);
  if (!d.map.img) {
    const empty = h('div', { class: 'mapempty' }, h('span', { html: icon('map') }), h('b', { text: 'A map with pins' }), h('p', { class: 'hint', text: 'Choose a picture of your world, a city or a dungeon (drop or paste one here works too). Then place pins that lead to its places, people and deeper maps.' }), btn('image', 'Choose a picture', async () => { const f = await pickImage(); if (f) { d.map.img = f; touch(d); renderMain(); } }, 'primary'));
    empty.addEventListener('dragover', e => e.preventDefault());
    empty.addEventListener('drop', async e => { const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (!f) return; e.preventDefault(); d.map.img = await STORE.putImage(cid(), f, f.name); touch(d); renderMain(); });
    wrap.append(empty); return wrap;
  }
  const host = h('div', { class: 'mapbox' }); wrap.append(host);
  STORE.imageUrl(cid(), d.map.img).then(url => {
    const mv = MAPV.render(host, d, {
      url, view: mapViews.get(d.id), onView: v => mapViews.set(d.id, v),
      typeOf: id => (D(id) || {}).type, titleOf: id => (D(id) || {}).title || '',
      onChange: () => touch(d), onOpen: id => openDoc(id),
      preview: id => { const x = D(id); if (!x) return ''; const t = MD.plain(x.body).replace(/\s+/g, ' ').trim(); return `<div class="hk" style="--c:${typeColor(x)}">${icon(TYPES[x.type].icon)}<span>${TYPES[x.type].name}</span></div><b>${esc(x.title)}</b>${t ? `<p>${esc(t.slice(0, 200))}${t.length > 200 ? '…' : ''}</p>` : ''}`; },
      pickDoc: q => { q = q.toLowerCase(); return [...A.docs.values()].filter(x => x.id !== d.id && (!q || x.title.toLowerCase().includes(q))).sort((a, b) => (a.title.toLowerCase().startsWith(q) ? 0 : 1) - (b.title.toLowerCase().startsWith(q) ? 0 : 1)).slice(0, 6).map(x => ({ id: x.id, title: x.title, type: x.type })); },
      create: (title, type) => { const x = newDoc({ type, title, parent: d.id }); renderSide(); return x.id; }
    });
    host.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-cn-doc')) e.preventDefault(); });
    host.addEventListener('drop', e => { const id = e.dataTransfer.getData('text/x-cn-doc'); if (!id || !D(id)) return; e.preventDefault(); mv.pinAt(e, id, D(id).title); });
  });
  return wrap;
}
function mindPane(d) {
  const host = h('div', { class: 'mindwrap' });
  d.mind = d.mind || {}; const collapsed = new Set(d.mind.collapsed || []);
  const bar = h('div', { class: 'mindbar' },
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!d.mind.paras, onchange: e => { d.mind.paras = e.target.checked; touch(d, true); draw(); } }), 'Paragraphs too'),
    h('span', { class: 'grow' }), h('span', { class: 'hint', text: 'Click a branch to add to it or rename it; it writes into the text. Double-click to go there.' }),
    ib('zout', 'Zoom out', () => mv && mv.zoom(1 / 1.25)), ib('zin', 'Zoom in', () => mv && mv.zoom(1.25)), ib('fit', 'Fit', () => mv && mv.fit()));
  const box = h('div', { class: 'mindbox' }); host.append(bar, box);
  let mv = null;
  const draw = () => {
    mv = MIND.render(box, MD.tree(d.body, d.title, { paras: !!d.mind.paras }), {
      collapsed, view: mindViews.get(d.id), onView: v => mindViews.set(d.id, v),
      onToggle: k => { if (collapsed.has(k)) collapsed.delete(k); else collapsed.add(k); d.mind.collapsed = [...collapsed].slice(-300); touch(d, true); draw(); },
      onOpen: n => { if (n.kind === 'link') { const li = n.link; if (li.kind === 'doc') { const id = resolve(li.title); if (id) openDoc(id); else createFromLink(li.title, box); } return; } if (n.line >= 0) { A.modes.set(d.id, 'read'); go({ k: 'doc', id: d.id, line: n.line }, true); } },
      onAdd: (n, t) => { d.body = MD.addChild(d.body, n, t); if (n.kind !== 'root') collapsed.delete(MIND.keyOf(n)); touch(d); draw(); },
      onRename: (n, t) => { d.body = MD.rename(d.body, n, t); touch(d); draw(); }
    });
  };
  queueMicrotask(draw);
  return host;
}

/* ============================== menus, dialogs, toasts ============================== */
let menuFrom = null;
function menu(items, at) {
  closeMenu(true);
  menuFrom = document.activeElement;
  const m = h('div', { class: 'menu', role: 'menu', 'aria-label': (items[0] && items[0].head) || 'Menu' });
  for (const it of items) {
    if (it === '-') { m.append(h('div', { class: 'msep', role: 'separator' })); continue; }
    if (it.head) { m.append(h('div', { class: 'mhead', text: it.head, 'aria-hidden': 'true' })); continue; }
    m.append(h('button', { type: 'button', class: 'mi' + (it.cls ? ' ' + it.cls : ''), role: it.check !== undefined ? 'menuitemcheckbox' : 'menuitem', 'aria-checked': it.check !== undefined ? String(!!it.check) : null, tabIndex: -1, disabled: !!it.disabled, title: it.title || '', onclick: () => { closeMenu(); it.fn(); } },
      h('span', { class: 'mic', html: it.icon ? icon(it.icon) : '', style: it.color ? `color:${it.color}` : '' }), h('span', { class: 'ml', text: it.label }), it.sub ? h('span', { class: 'ms', text: it.sub }) : null));
  }
  document.body.append(m);
  let x, y; if (at && at.getBoundingClientRect) { const r = at.getBoundingClientRect(); x = r.left; y = r.bottom + 4; if (r.right - m.offsetWidth > 8 && x + m.offsetWidth > innerWidth - 8) x = r.right - m.offsetWidth; } else { x = at.x; y = at.y; }
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, x)) + 'px'; m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, y)) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', menuAway, true), 0);
  const its = () => $$('.mi:not(:disabled)', m), focusAt = k => { const l = its(); if (l.length) l[(k + l.length) % l.length].focus(); };
  m.addEventListener('keydown', e => {
    const l = its(), i = l.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(i + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0); } else if (e.key === 'End') { e.preventDefault(); focusAt(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); } else if (e.key === 'Tab') { e.preventDefault(); closeMenu(); }
    else if (e.key.length === 1 && /\S/.test(e.key)) { const k = l.findIndex((b, j) => j > i && b.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase())); const k2 = k >= 0 ? k : l.findIndex(b => b.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase())); if (k2 >= 0) l[k2].focus(); }
  });
  focusAt(0);
}
function menuAway(e) { if (!e.target.closest('.menu')) closeMenu(true); }
function closeMenu(quiet) {
  const had = $$('.menu').length; $$('.menu').forEach(m => m.remove()); document.removeEventListener('pointerdown', menuAway, true);
  if (had && !quiet && menuFrom && menuFrom.isConnected && !$('.modal')) menuFrom.focus();
}
let mid = 0;
function modal(title, body, foot, o = {}) {
  const from = document.activeElement, hid = 'dlg' + (++mid);
  const box = h('div', { class: 'modal', onpointerdown: e => { if (e.target === box && !o.sticky) close(); } });
  const card = h('div', { class: 'card' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': hid }, h('div', { class: 'chead' }, h('h2', { id: hid, text: title }), ib('x', 'Close', () => close())), h('div', { class: 'cbody' }, body), foot ? h('div', { class: 'cfoot' }, foot) : null);
  box.append(card); document.body.append(box);
  let shut = false;
  const close = () => { if (shut) return; shut = true; box.remove(); document.removeEventListener('keydown', onKey, true); if (o.onClose) o.onClose(); if (from && from.isConnected && !$('.modal')) from.focus(); };
  const onKey = e => {
    if (!box.isConnected || box !== $$('.modal').pop()) return;
    if (e.key === 'Escape' && !$('.menu')) { e.stopPropagation(); close(); }
    if (e.key === 'Tab') { const f = $$('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]', card).filter(x => x.offsetParent !== null); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  };
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => { const f = card.querySelector('[autofocus],input,textarea,select'); if (f) f.focus(); }, 20);
  return { close, card };
}
function ask(title, value, o = {}) {
  return new Promise(res => {
    const inp = h('input', { type: 'text', value: value || '', placeholder: o.placeholder || '', autofocus: true });
    let done = false; const fin = v => { if (done) return; done = true; m.close(); res(v); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) fin(inp.value.trim()); });
    const m = modal(title, h('div', {}, o.hint ? h('p', { class: 'hint', text: o.hint }) : null, inp), [btn(null, 'Cancel', () => fin(null), 'ghost'), btn(null, o.ok || 'OK', () => inp.value.trim() && fin(inp.value.trim()), 'primary')], { onClose: () => fin(null) });
    setTimeout(() => inp.select(), 30);
  });
}
function confirmBox(title, text, ok = 'OK', bad) {
  return new Promise(res => { let done = false; const fin = v => { if (done) return; done = true; m.close(); res(v); }; const m = modal(title, h('p', { text }), [btn(null, 'Cancel', () => fin(false), 'ghost'), btn(null, ok, () => fin(true), bad ? 'danger' : 'primary')], { onClose: () => fin(false) }); });
}
let toastT = 0;
function toast(msg, action) {
  const t = $('#toast'); t.replaceChildren(h('span', { text: msg }));
  if (action) t.append(h('button', { type: 'button', class: 'btn tiny', text: action.label, onclick: () => { t.hidden = true; action.fn(); } }));
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3800);
}
function pickImage() {
  return new Promise(res => {
    const i = h('input', { type: 'file', accept: 'image/*' });
    i.onchange = async () => { const f = i.files[0]; if (!f) return res(null); try { res(await STORE.putImage(cid(), f, f.name)); } catch (e) { toast(errText(e)); res(null); } };
    i.click();
  });
}

/* ---------- document menus ---------- */
function newDocMenu(parent, at) {
  menu([{ head: parent ? 'New inside ' + D(parent).title : 'New document' }, ...Object.entries(TYPES).map(([t, x]) => ({ label: x.name, sub: x.hint, icon: x.icon, color: x.color, fn: () => create(t, parent) }))], at || $('#newBtn'));
}
function create(type, parent) { const d = newDoc({ type, parent: parent || '' }); A.modes.set(d.id, type === 'map' ? 'read' : 'edit'); if (parent) { A.prefs.open[parent] = true; savePrefs(); } openDoc(d.id); setTimeout(() => { const t = $('.dhead .title'); if (t && type !== 'session') { t.focus(); t.select(); } }, 40); }
function kindMenu(d, at) {
  menu([{ head: 'What kind of document is this?' }, ...Object.entries(TYPES).map(([t, x]) => ({ label: x.name, icon: x.icon, color: x.color, cls: t === d.type ? 'on' : '', fn: () => { if (t === d.type) return; d.type = t; if (t === 'map' && !d.map) d.map = { img: '', w: 0, h: 0, pins: [] }; touch(d); render(); } }))], at);
}
function docMenu(d, at, y) {
  const pos = typeof at === 'number' ? { x: at, y } : at, here = A.view.k === 'doc' && A.view.id === d.id, m = modeOf(d);
  menu([
    here ? null : { label: 'Open', icon: 'open', fn: () => openDoc(d.id) },
    here && d.type !== 'board' ? { label: 'Write and read side by side', icon: 'split', check: m === 'split', fn: () => setMode(d, m === 'split' ? 'edit' : 'split') } : null,
    here ? { label: 'Focus on the page', icon: 'focus', check: !!A.prefs.focus, fn: () => toggleFocus() } : null,
    TABLE.on() ? { label: d.live ? 'Stop showing it to the players' : 'Keep it shown to the players', sub: d.live ? '' : 'They see every change', icon: 'eye', check: !!d.live, fn: () => { d.live = !d.live; touch(d, true); if (d.live) VIEWS.send(d, 'show'); render(); } } : null,
    '-',
    { label: 'New document inside it', icon: 'plus', fn: () => newDocMenu(d.id, pos) },
    { label: d.pinned ? 'Unpin' : 'Pin to the top', icon: 'star', fn: () => { d.pinned = !d.pinned; touch(d); renderSide(); } },
    { label: 'Rename', icon: 'edit', fn: async () => { const t = await ask('Rename', d.title); if (t) { renameDoc(d, t); render(); } } },
    { label: 'Duplicate', icon: 'copy', fn: () => { const c = newDoc({ type: d.type, title: d.title + ' copy', parent: d.parent, body: d.body, fields: clone(d.fields || {}), tags: clone(d.tags || []), img: d.img, map: d.map ? clone(d.map) : undefined }); openDoc(c.id); } },
    { label: 'Copy to another campaign…', icon: 'folder', disabled: A.camps.length < 2, fn: () => VIEWS.copyToCampaign(d) },
    { label: 'Copy as Markdown', icon: 'copy', fn: () => navigator.clipboard.writeText(`# ${d.title}\n\n${d.body}`).then(() => toast('Copied.'), () => toast('Couldn\'t copy.')) },
    '-',
    { label: 'Delete', icon: 'trash', cls: 'bad', fn: () => deleteDoc(d.id) }
  ].filter(Boolean), pos);
}

/* ---------- quick open (Ctrl+K) ---------- */
function quickOpen() {
  const inp = h('input', { type: 'text', placeholder: 'Find a document, or words in one…', autofocus: true }), list = h('div', { class: 'qlist' });
  let rows = [], sel = 0;
  const draw = () => {
    const q = inp.value.trim().toLowerCase(); rows = [];
    const all = [...A.docs.values()];
    if (!q) rows = all.sort((a, b) => b.updated - a.updated).slice(0, 12).map(d => ({ d }));
    else {
      for (const d of all) { const t = d.title.toLowerCase(), at = t.indexOf(q); if (at >= 0) rows.push({ d, s: at === 0 ? 0 : 1 }); }
      for (const d of all) { if (rows.some(r => r.d === d)) continue; const txt = MD.plain(d.body), k = txt.toLowerCase().indexOf(q); if (k >= 0) rows.push({ d, s: 2, snip: (k > 30 ? '…' : '') + txt.slice(Math.max(0, k - 30), k + 70).replace(/\s+/g, ' ') }); }
      rows.sort((a, b) => a.s - b.s || b.d.updated - a.d.updated); rows = rows.slice(0, 30);
      if (!resolve(q)) rows.push({ make: inp.value.trim() });
    }
    sel = Math.min(sel, rows.length - 1); if (sel < 0) sel = 0;
    list.replaceChildren(...rows.map((r, i) => h('button', { type: 'button', class: 'qrow' + (i === sel ? ' on' : ''), onclick: () => pick(i) },
      r.make ? [h('span', { class: 'aic', html: icon('plus') }), h('span', { class: 'acl', text: `New note: ${r.make}` })]
        : [h('span', { class: 'aic', html: icon(TYPES[r.d.type].icon), style: `color:${typeColor(r.d)}` }), h('span', { class: 'acl' }, h('span', { text: r.d.title }), r.snip ? h('small', { text: r.snip }) : null), h('span', { class: 'acs', text: ago(r.d.updated) })])));
  };
  const pick = i => { const r = rows[i]; if (!r) return; m.close(); if (r.make) { const d = newDoc({ type: 'note', title: r.make }); A.modes.set(d.id, 'edit'); openDoc(d.id); } else openDoc(r.d.id); };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % Math.max(1, rows.length); draw(); $('.qrow.on', list) && $('.qrow.on', list).scrollIntoView({ block: 'nearest' }); } if (e.key === 'Enter') { e.preventDefault(); pick(sel); } });
  const m = modal('Find', h('div', { class: 'qbox' }, inp, list), null, { wide: true });
  m.card.classList.add('quick'); draw();
}

/* ============================== campaigns ============================== */
async function loadCampaigns() { A.camps = (await STORE.listCampaigns().catch(() => [])).sort((a, b) => (b.updated || 0) - (a.updated || 0)); }
async function openCampaign(id) {
  await flush();
  const meta = A.camps.find(c => c.id === id); if (!meta) return;
  A.camp = meta; A.docs = new Map(); A.back = []; A.fwd = []; A.modes = new Map(); mapViews.clear(); mindViews.clear();
  A.prefs.lastCamp = id; savePrefs();
  try { for (const d of await STORE.loadDocs(id)) { if (d && d.id) { d.body = String(d.body || ''); d.title = String(d.title || 'Untitled'); d.fields = d.fields || {}; if (!TYPES[d.type]) d.type = 'note'; A.docs.set(d.id, d); } } }
  catch (e) { toast('Could not read the campaign: ' + errText(e)); }
  await PLAN.loadWorld();
  reindex();
  A.view = { k: 'none' };
  go(meta.last && D(meta.last) ? { k: 'doc', id: meta.last } : { k: 'home' }, true);
  if (meta.table) TABLE.connect(meta.table); else TABLE.disconnect();
}
async function createCampaign(o) {
  const meta = { id: rid('c'), name: String(o.name || 'New campaign').slice(0, 80), sys: o.sys || 'generic', color: o.color || '', table: o.table || '', created: Date.now(), updated: Date.now() };
  await STORE.saveCampaign(meta); A.camps.unshift(meta);
  await openCampaign(meta.id);
  return meta;
}
function campaignMenu(at) {
  menu([{ head: 'Campaigns' },
    ...A.camps.map(c => ({ label: c.name, icon: 'folder', cls: A.camp && c.id === A.camp.id ? 'on' : '', sub: SRD.SYSTEMS[c.sys] || '', fn: () => openCampaign(c.id) })),
    '-',
    { label: 'New campaign…', icon: 'plus', fn: () => VIEWS.newCampaign() },
    { label: 'Campaign settings…', icon: 'edit', disabled: !A.camp, fn: () => VIEWS.campaignSettings() }], at);
}

/* ============================== keys and the window ============================== */
document.addEventListener('keydown', e => {
  const c = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), inText = e.target.closest('input,textarea,select,[contenteditable]');
  if ($('.modal') && !(c && k === 'k')) return;
  if (c && (k === 'k' || k === 'p') && A.camp) { e.preventDefault(); if ($('.card.quick')) return; quickOpen(); return; }
  if (c && k === 'n' && A.camp) { e.preventDefault(); newDocMenu(null); return; }
  if (c && k === 's') { e.preventDefault(); flush().then(() => toast('Saved.')); return; }
  if (c && !e.shiftKey && k === 'e' && A.view.k === 'doc') { e.preventDefault(); const d = D(A.view.id); if (!isRO(d)) setMode(d, modeOf(d) === 'edit' || modeOf(d) === 'split' ? 'read' : 'edit'); return; }
  if (c && k === 'm' && A.view.k === 'doc') { e.preventDefault(); const d = D(A.view.id); setMode(d, modeOf(d) === 'mind' ? 'read' : 'mind'); return; }
  if (c && k === 'g' && A.camp) { e.preventDefault(); go({ k: 'graph' }); return; }
  if (c && k === '\\') { e.preventDefault(); A.prefs.right = !A.prefs.right; savePrefs(); renderRight(); return; }
  if (c && k === '.') { e.preventDefault(); toggleFocus(); return; }
  if (c && e.shiftKey && k === 'e' && A.view.k === 'doc') { e.preventDefault(); const ta = $('.editor textarea'); PLAN.encounter(t => { if (ta) insertLines(ta, t); else { const d = D(A.view.id); d.body = d.body.replace(/\s*$/, '') + '\n\n' + t; touch(d); renderMain(); } }); return; }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return; }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goFwd(); return; }
  if (e.key === 'Escape') { if ($('.menu')) closeMenu(); else if (A.prefs.focus && !inText) toggleFocus(false); hideHover(); acClose(); }
  if (!inText && (e.key === 'F1' || e.key === '?')) { e.preventDefault(); VIEWS.shortcuts(); }
});
document.addEventListener('mouseup', e => { if (e.button === 3) goBack(); if (e.button === 4) goFwd(); });
function wireWindow() {
  const desk = window.desk;
  document.body.classList.toggle('desk', !!desk);
  $('#appMenu').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); if (desk) desk.winCmd('menu', { x: r.left, y: r.bottom }); else VIEWS.pageMenu(e.currentTarget); };
  if (desk) {
    $('.wb-min').onclick = () => desk.winCmd('min'); $('.wb-max').onclick = () => desk.winCmd('max'); $('.wb-close').onclick = () => desk.winCmd('close');
    $('#titlebar').addEventListener('dblclick', e => { if (!e.target.closest('button')) desk.winCmd('max'); });
    desk.onWinState(s => { document.body.classList.toggle('wmax', !!s.max); document.body.classList.toggle('wblur', !s.focus); document.body.classList.toggle('wfull', !!s.full); });
    desk.onKey(k => VIEWS.command(k));
    desk.onCloseAsked(async () => { await flush().catch(() => {}); desk.quitOk(); });
  } else addEventListener('beforeunload', e => { if (A.dirty.size) { flush(); e.preventDefault(); } });
  $('#backBtn').onclick = goBack; $('#fwdBtn').onclick = goFwd;
  $('#campBtn').onclick = e => campaignMenu(e.currentTarget);
  $('#newBtn').onclick = e => newDocMenu(null, e.currentTarget);
  $('#findBtn').onclick = quickOpen;
  $('#sideFilter').addEventListener('input', renderSide);
  $('#sideMode').onclick = () => { A.prefs.side = A.prefs.side === 'tree' ? 'kind' : 'tree'; savePrefs(); renderSide(); };
  $('#sideToggle').onclick = () => { A.prefs.sideHidden = !A.prefs.sideHidden; savePrefs(); renderSide(); };
  $('#rightToggle').onclick = () => { A.prefs.right = !A.prefs.right; savePrefs(); renderRight(); };
  $('#rightToggle').setAttribute('aria-pressed', String(!!A.prefs.right));
  $('#tree').addEventListener('keydown', treeKeys);
  $('#focusBtn').onclick = () => toggleFocus();
  $('#skip').onclick = e => { e.preventDefault(); const t = $('#main .title, #main h1, #main'); t.focus(); };
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (A.prefs.theme === 'system') applyLook(); });
  $('#tableChip').onclick = () => { A.prefs.right = true; A.prefs.rightTab = 'table'; savePrefs(); renderRight(); };
  TABLE.onChange(why => { paintChips(); if (why === 'state' || why === 'lobby') renderSide(); if (A.prefs.right) renderRightSoon(); if (why === 'ents' && A.view.k === 'doc' && modeOf(D(A.view.id) || { id: '', body: '' }) !== 'edit') refreshReaderSoon(); });
  // the side panels can be made wider or narrower
  for (const [hd, key, side] of [['#sideGrip', 'sideW', 1], ['#rightGrip', 'rightW', -1]]) {
    const g = $(hd); g.addEventListener('pointerdown', e => {
      const sx = e.clientX, w0 = A.prefs[key] || (side > 0 ? 268 : 320); g.setPointerCapture(e.pointerId);
      const mv = m => { A.prefs[key] = Math.max(200, Math.min(520, w0 + side * (m.clientX - sx))); applyWidths(); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); savePrefs(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
  }
  applyWidths();
}
function applyWidths() { document.documentElement.style.setProperty('--side-w', (A.prefs.sideW || 268) + 'px'); document.documentElement.style.setProperty('--right-w', (A.prefs.rightW || 320) + 'px'); }
const renderRightSoon = debounce(() => renderRight(), 120);
const refreshReaderSoon = debounce(() => { const d = A.view.k === 'doc' && D(A.view.id), r = $('#main .reader'); if (d && r) { const st = $('#main .docscroll').scrollTop; r.replaceWith(makeReader(d)); $('#main .docscroll').scrollTop = st; } }, 200);
function paintChips() {
  const T = TABLE.T, c = $('#tableChip'), s = $('#soundChip');
  c.className = 'chip ' + ({ on: 'ok', connecting: 'warn', error: 'bad', missing: 'bad' }[T.state] || '');
  c.querySelector('span').textContent = T.state === 'on' ? `Table ${T.code}` : T.state === 'connecting' ? 'Linking…' : T.state === 'off' ? 'No table linked' : 'Table not found';
  c.title = T.why || (T.state === 'on' ? 'Linked to the Critter table ' + T.code : 'Link this campaign to its Critter table to send things to it and take things from it');
  const snd = T.state === 'on' && T.sounds && Date.now() - (+T.sounds.ts || 0) < 36 * 3600e3;
  s.hidden = T.state !== 'on'; s.className = 'chip ' + (snd && T.keyOk ? 'ok' : snd ? 'warn' : '');
  s.querySelector('span').textContent = snd ? (T.keyOk ? 'Sounds ready' : T.key ? 'Sounds: key out of date' : 'Sounds: no music key') : 'Sounds not seen';
  s.onclick = () => { A.prefs.right = true; A.prefs.rightTab = 'sounds'; savePrefs(); renderRight(); };
}

async function boot() {
  wireWindow(); paintChips(); applyLook();
  await loadCampaigns();
  const last = A.camps.find(c => c.id === A.prefs.lastCamp) || A.camps[0];
  if (last) await openCampaign(last.id); else render();
}
boot();
