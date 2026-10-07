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
let saveT = 0, saveFirst = 0;
// a debounce that still runs at least every `max` ms while calls keep coming
const debounceMax = (fn, ms, max) => { let t = 0, first = 0; return (...a) => { clearTimeout(t); const now = Date.now(); if (!first) first = now; t = setTimeout(() => { first = 0; fn(...a); }, now - first > max ? 0 : ms); }; };
function touch(doc, quiet) {
  if (!A.docs.has(doc.id)) return;
  histRecord(doc.id, snapOf(doc));
  doc.updated = Date.now(); A.dirty.add(doc.id); clearTimeout(saveT); if (!saveFirst) saveFirst = Date.now(); saveT = setTimeout(flush, Date.now() - saveFirst > 3000 ? 0 : 600); if (!quiet) reindexSoon();
  PLAN.liveTouch(doc); SYNC.dirty(doc);
}
async function flush() {
  clearTimeout(saveT); saveFirst = 0;
  const ids = [...A.dirty]; A.dirty.clear();
  for (const id of ids) { const d = A.docs.get(id); if (!d) continue; try { await STORE.saveDoc(cid(), d); } catch (e) { A.dirty.add(id); toast('Could not save "' + d.title + '": ' + errText(e)); } }
}
async function saveCamp() { if (!A.camp) return; histRecord('#camp', campSnap()); A.camp.updated = Date.now(); try { await STORE.saveCampaign(A.camp); } catch (e) { toast('Could not save the campaign: ' + errText(e)); } SYNC.campDirty(); }

/* ---------- the undo history: every change to a document (and to the campaign) can be undone and redone from anywhere ---------- */
// each step keeps the before and after of what it changed; typing in one document within 1.5 s is one step;
// how many steps are kept is a setting (A.prefs.undoSteps). Text fields keep their own Ctrl+Z while you type in them.
const HIST = { undo: [], redo: [], snap: new Map(), quiet: 0, batch: null };
const histMax = () => Math.max(10, Math.min(1000, +A.prefs.undoSteps || 100));
const snapOf = d => JSON.stringify(d, (k, v) => (k === 'updated' ? undefined : v));
const campSnap = () => (A.camp ? JSON.stringify(A.camp, (k, v) => (k === 'updated' || k === 'last' ? undefined : v)) : null);
function histReset() { HIST.undo = []; HIST.redo = []; HIST.snap = new Map(); for (const d of A.docs.values()) HIST.snap.set(d.id, snapOf(d)); HIST.snap.set('#camp', campSnap()); }
function histLabel(ch) {
  if (ch.id === '#camp') return 'Change the campaign';
  const b = ch.before && JSON.parse(ch.before), a = ch.after && JSON.parse(ch.after), t = (a || b || {}).title || 'a document';
  if (!b) return `Create "${t}"`;
  if (!a) return `Delete "${t}"`;
  if (b.title !== a.title) return `Rename "${b.title}" to "${a.title}"`;
  if (b.body !== a.body) return `Write in "${t}"`;
  if (JSON.stringify(b.fields) !== JSON.stringify(a.fields)) return `Change the details of "${t}"`;
  if (JSON.stringify(b.board) !== JSON.stringify(a.board)) return `Change the board "${t}"`;
  if (JSON.stringify(b.map) !== JSON.stringify(a.map)) return `Change the map "${t}"`;
  return `Change "${t}"`;
}
function histRecord(id, after) {
  if (HIST.quiet) { HIST.snap.set(id, after); return; }
  const before = HIST.snap.has(id) ? HIST.snap.get(id) : null;
  if (before === after) return;
  HIST.snap.set(id, after);
  const ch = { id, before, after };
  if (HIST.batch) { const same = HIST.batch.find(c => c.id === id); if (same) same.after = after; else HIST.batch.push(ch); return; }
  const top = HIST.undo[HIST.undo.length - 1], now = Date.now();
  // more typing in the same document a moment later joins the step before
  if (top && top.changes.length === 1 && top.changes[0].id === id && top.changes[0].after === before && before && after && now - top.t < 1500 && !top.closed) { top.changes[0].after = after; top.t = now; top.label = histLabel(top.changes[0]); }
  else { HIST.undo.push({ changes: [ch], t: now, label: histLabel(ch) }); if (HIST.undo.length > histMax()) HIST.undo.splice(0, HIST.undo.length - histMax()); }
  HIST.redo = [];
}
// several changes as one step (a delete that moves its children, a tidy-up)
function histGroup(label, fn) {
  const outer = !HIST.batch; if (outer) HIST.batch = [];
  const done = () => { if (!outer) return; const ch = HIST.batch; HIST.batch = null; if (ch.length) { HIST.undo.push({ changes: ch, t: Date.now(), label: label || histLabel(ch[0]) }); if (HIST.undo.length > histMax()) HIST.undo.splice(0, HIST.undo.length - histMax()); HIST.redo = []; } };
  let r; try { r = fn(); } catch (e) { done(); throw e; }
  if (r && typeof r.then === 'function') return r.finally(done);
  done(); return r;
}
async function histApply(id, state) {
  if (id === '#camp') { if (!A.camp || !state) return; const o = JSON.parse(state); for (const k of Object.keys(A.camp)) if (k !== 'updated' && k !== 'last' && !(k in o)) delete A.camp[k]; Object.assign(A.camp, o); HIST.snap.set(id, state); await saveCamp(); return; }
  if (state === null) { if (A.docs.has(id)) { A.docs.delete(id); A.dirty.delete(id); SYNC.removed(id); await STORE.trashDoc(cid(), id).catch(() => {}); } HIST.snap.delete(id); return; }
  const o = JSON.parse(state); let d = A.docs.get(id);
  if (d) { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, o); } else { d = o; A.docs.set(id, d); }
  d.updated = Date.now(); A.dirty.add(id); SYNC.dirty(d); HIST.snap.set(id, state);
}
async function histStep(dir) {
  if (A.ed) A.ed.commit();
  const from = dir < 0 ? HIST.undo : HIST.redo, to = dir < 0 ? HIST.redo : HIST.undo, e = from.pop();
  if (!e) { toast(dir < 0 ? 'Nothing to undo.' : 'Nothing to redo.'); return; }
  e.closed = true; HIST.quiet++;
  try { for (const c of dir < 0 ? [...e.changes].reverse() : e.changes) await histApply(c.id, dir < 0 ? c.before : c.after); }
  finally { HIST.quiet--; }
  to.push(e);
  await flush(); reindex(); renderSide();
  const v = A.view; if (v.k === 'doc' && !D(v.id)) go({ k: 'home' }, true); else renderMain();
  toast((dir < 0 ? 'Undone: ' : 'Redone: ') + e.label, dir < 0 ? { label: 'Redo', fn: () => histStep(1) } : { label: 'Undo', fn: () => histStep(-1) });
}
const undo = () => histStep(-1), redo = () => histStep(1);
// the history, to go back several steps at once
function historyDialog() {
  if (A.ed) A.ed.commit();
  const when = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  const list = h('div', { class: 'histlist', role: 'list' });
  const draw = () => list.replaceChildren(
    h('div', { class: 'histrow now', role: 'listitem' }, h('span', { class: 'hl', text: 'Now' }), h('span', { class: 'ht', text: HIST.redo.length ? `${HIST.redo.length} undone step${HIST.redo.length === 1 ? '' : 's'} can be redone` : '' })),
    ...[...HIST.undo].reverse().map((e, i) => h('button', { type: 'button', class: 'histrow', role: 'listitem', title: 'Undo back to before this', onclick: async () => { for (let k = 0; k <= i; k++) await histStep(-1); draw(); } },
      h('span', { class: 'hl', text: e.label }), h('span', { class: 'ht', text: when(e.t) }))),
    HIST.undo.length ? null : h('p', { class: 'hint', text: 'Nothing changed yet since this campaign was opened.' }));
  draw();
  const m = modal('Undo history', h('div', {}, h('p', { class: 'hint', text: `Click a step to undo it and everything after it. ${histMax()} steps are kept (Settings › Writing). Ctrl+Z undoes, Ctrl+Y redoes.` }), list),
    [btn('undo', 'Redo', async () => { await histStep(1); draw(); }, 'ghost'), btn(null, 'Close', () => m.close(), 'primary')]);
}
// Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) anywhere but in a text field, which keeps its own
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'y') return;
  if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"],.modal')) return;
  if (!A.camp || SYNC.isPlayer()) return;
  e.preventDefault();
  if (k === 'y' || e.shiftKey) redo(); else undo();
});

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
  // one step in the undo history: the document, and its children moving up a level
  await histGroup(`Delete "${d.title}"`, async () => {
    const kids = [...A.docs.values()].filter(x => x.parent === id);
    kids.forEach(k => { k.parent = d.parent || ''; touch(k, true); });
    A.docs.delete(id); A.dirty.delete(id); SYNC.removed(id); histRecord(id, null);
    await STORE.trashDoc(cid(), id).catch(e => toast('Could not delete it: ' + errText(e)));
  });
  reindex();
  if (A.view.k === 'doc' && A.view.id === id) go({ k: 'home' }, true); else render();
  toast(`Deleted "${d.title}".`, { label: 'Undo', fn: () => undo() });
}
// renaming keeps every link to it working
function renameDoc(d, title) {
  // one step in the undo history, with every link that changed along with it
  const was = d.title, ok = histGroup(null, () => renameDocNow(d, title));
  const top = HIST.undo[HIST.undo.length - 1];
  if (ok && top && top.changes.some(c => c.id === d.id)) top.label = `Rename "${was}" to "${d.title}"`;
  return ok;
}
function renameDocNow(d, title) {
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
  graph: { name: 'Graph', icon: 'graph', render: m => VIEWS.graph(m), hint: 'Everything and how it links (Ctrl+G)' },
  settings: { name: 'Settings', icon: 'gear', render: m => VIEWS.settings(m), nav: false }
};
function go(view, replace) {
  // leaving a document locks it, when that's how you like it
  if (A.prefs.autoLock && A.view.k === 'doc' && (view.k !== 'doc' || view.id !== A.view.id)) { const was = A.docs.get(A.view.id); if (was && !was.locked && was.body.trim()) { if (A.ed) A.ed.commit(); was.locked = true; touch(was, true); } }
  if (A.view.k !== 'none' && !replace && JSON.stringify(view) !== JSON.stringify(A.view)) { A.back.push(A.view); A.fwd = []; if (A.back.length > 80) A.back.shift(); }
  A.view = view;
  if (A.camp) { A.camp.last = view.k === 'doc' && A.docs.has(view.id) ? view.id : ''; saveCampSoon(); }
  render();
  if (view.line !== undefined) setTimeout(() => scrollToLine(view.line), 30);
  // keyboard and screen reader users land at the top of what just opened
  if (!replace && document.activeElement && document.activeElement.closest && !document.activeElement.closest('#side,#main,#right')) setTimeout(() => { const t = $('#main h1, #main .title'); if (t && view.line === undefined) t.focus({ preventScroll: true }); }, 40);
}
const saveCampLater = debounceMax(() => { campPending = false; saveCamp(); }, 800, 3000), saveCampSoon = () => { campPending = true; saveCampLater(); };
function goBack() { if (!A.back.length) return; A.fwd.push(A.view); A.view = A.back.pop(); render(); }
function goFwd() { if (!A.fwd.length) return; A.back.push(A.view); A.view = A.fwd.pop(); render(); }
const openDoc = (id, extra) => { if (D(id)) go({ k: 'doc', id, ...(extra || {}) }); };
const modeOf = d => { const m = A.modes.get(d.id); if (isRO(d)) return m === 'mind' ? 'mind' : 'read'; if (d.type === 'board' || d.type === 'map') return 'read'; return m === 'mind' || m === 'run' ? m : 'read'; };
function setMode(d, m) { if (A.ed) A.ed.commit(); A.modes.set(d.id, m); renderMain(); }

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
  const st = document.documentElement.style, ink = c => { const n = parseInt(c.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#04110f' : '#ffffff'; };
  if (A.prefs.accent) { st.setProperty('--accent', A.prefs.accent); st.setProperty('--accent-ink', ink(A.prefs.accent)); } else { st.removeProperty('--accent'); st.removeProperty('--accent-ink'); }
  if (A.prefs.accent2) st.setProperty('--accent2', A.prefs.accent2); else st.removeProperty('--accent2');
  // the shared design system's knobs: surface tint, how far pictures spill their colour, and the font pairing
  st.setProperty('--hue', (Number.isFinite(A.prefs.tint) ? A.prefs.tint : 4) + '%');
  st.setProperty('--bleed', Number.isFinite(A.prefs.bleed) ? A.prefs.bleed : 1);
  applyFontSet(document.documentElement, A.prefs.fonts || 'Easy reading');
  const gb = $('#gearBtn'); if (gb) gb.classList.toggle('on', A.view.k === 'settings');
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
  const nav = $('#nav'); nav.replaceChildren(...Object.entries(PAGES).filter(([k, p]) => p.nav !== false && !(SYNC.isPlayer() && (k === 'threads' || k === 'rels'))).map(([k, p]) => h('button', { type: 'button', class: 'navb' + (A.view.k === k ? ' on' : ''), title: p.hint || p.name, 'aria-current': A.view.k === k ? 'page' : null, onclick: () => go({ k }) }, h('span', { html: icon(p.icon) }), h('span', { text: p.name }))));
  $('#sideMode').innerHTML = icon(A.prefs.side === 'tree' ? 'list' : 'folder');
  $('#sideMode').title = $('#sideMode').ariaLabel = A.prefs.side === 'tree' ? 'Group the documents by kind' : 'Arrange the documents as a tree';
  const box = $('#tree'), q = $('#sideFilter').value.trim().toLowerCase(), cur = A.view.k === 'doc' ? A.view.id : '';
  box.replaceChildren();
  if (q) {
    const hits = [...A.docs.values()].filter(d => d.title.toLowerCase().includes(q) || docTags(d).some(t => t.includes(q.replace(/^#/, '')))).sort((a, b) => a.title.localeCompare(b.title));
    box.append(h('div', { class: 'tsec static', role: 'status' }, h('span', { text: plural(hits.length, 'match', 'matches') })), h('div', { role: 'tree', 'aria-label': 'Matches' }, hits.map(d => row(d, 1))));
    return roving();
  }
  if (SYNC.isPlayer()) {
    box.append(section('mine', 'Your notes', 'note', () => newPlayerNote(), [...A.docs.values()].sort((a, b) => b.updated - a.updated).map(d => row(d, 1)), null, A.docs.size));
    for (const t of Object.keys(TYPES)) { const list = [...A.wdocs.values()].filter(d => d.type === t).sort((a, b) => a.title.localeCompare(b.title)); if (list.length) box.append(section('p-' + t, TYPES[t].plural, TYPES[t].icon, null, list.map(d => row(d, 1)), TYPES[t].color, list.length)); }
    if (!A.wdocs.size) box.append(h('p', { class: 'hint pad', text: 'Nothing shared with you yet.' }));
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
      const sec = section('k-' + t, TYPES[t].plural, TYPES[t].icon, () => create(t), grouped(t, list), TYPES[t].color, list.length);
      // dropped on the kind's own heading: out of its group
      const hd = sec.querySelector('.tsec'); dropTo(hd, id => { const d = A.docs.get(id); if (!d || d.type !== t) return false; const by = groupBy(t); if (by === 'group') d.group = ''; else if (by) d.fields[by] = ''; touch(d); renderSide(); return true; });
      hd.append(ib('dots', 'Group ' + TYPES[t].plural.toLowerCase() + '…', e => groupMenu(t, e.currentTarget), 'tadd'));
      box.append(sec);
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
      'data-doc': d.id, onclick: () => openDoc(d.id), oncontextmenu: e => { e.preventDefault(); if (!ro) docMenu(d, e.clientX, e.clientY); } },
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
  // a kind's documents in groups: your own groups (drag documents in and out), or by one of their fields
  function grouped(t, list) {
    const by = groupBy(t); if (!by) return list.map(d => row(d, 1));
    const key = d => String(by === 'group' ? d.group || '' : (d.fields || {})[by] || '').trim(), names = new Set(list.map(key).filter(Boolean));
    if (by === 'group') for (const g of ((A.camp.groups || {})[t] || [])) names.add(g);
    const out = [];
    for (const g of [...names].sort((a, b) => a.localeCompare(b))) {
      const k = 'g-' + t + '-' + by + '-' + g, closed = !!A.prefs.closed[k], items = list.filter(d => key(d) === g);
      const head = h('div', { class: 'tgsec' + (closed ? ' closed' : '') }, h('button', { type: 'button', class: 'tsecb', 'aria-expanded': String(!closed), onclick: () => { A.prefs.closed[k] = !closed; savePrefs(); renderSide(); } }, h('span', { class: 'tcar', html: icon('down') }), h('span', { class: 'grow', text: g }), h('span', { class: 'tcount', text: items.length })),
        by === 'group' ? ib('dots', 'Group ' + g, e => menu([{ label: 'Rename the group', icon: 'edit', fn: async () => { const n = await ask('Rename the group', g); if (!n) return; list.filter(d => d.group === g).forEach(d => { d.group = n; touch(d, true); }); const gs = (A.camp.groups || {})[t] || []; A.camp.groups[t] = gs.map(x => (x === g ? n : x)); saveCamp(); renderSide(); } }, { label: 'Remove the group (keep its documents)', icon: 'trash', cls: 'bad', fn: () => { list.filter(d => d.group === g).forEach(d => { d.group = ''; touch(d, true); }); if (A.camp.groups && A.camp.groups[t]) A.camp.groups[t] = A.camp.groups[t].filter(x => x !== g); saveCamp(); renderSide(); } }], e.currentTarget), 'tadd') : null);
      dropTo(head, id => { const d = A.docs.get(id); if (!d || d.type !== t) return false; if (by === 'group') d.group = g; else d.fields[by] = g; touch(d); renderSide(); return true; });
      out.push(h('div', { class: 'tgroup2' }, head, closed ? null : h('div', { role: 'group', 'aria-label': g }, items.map(d => row(d, 2)))));
    }
    const loose = list.filter(d => !key(d));
    if (loose.length && names.size) out.push(h('div', { class: 'tgsec static' }, h('span', { text: by === 'group' ? 'In no group' : 'Not set' })));
    out.push(...loose.map(d => row(d, 1)));
    return out;
  }
  function dropTo(el, fn) {
    el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-cn-doc')) { e.preventDefault(); el.classList.add('dropin'); } });
    el.addEventListener('dragleave', () => el.classList.remove('dropin'));
    el.addEventListener('drop', e => { el.classList.remove('dropin'); const id = e.dataTransfer.getData('text/x-cn-doc'); if (id && fn(id)) e.preventDefault(); });
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
// how a kind is grouped in the sidebar: 'group' (your own groups), a field's key, or '' for not at all
const groupBy = t => (A.prefs.groupBy || {})[t] ?? (t === 'character' ? 'group' : '');
function groupMenu(t, at) {
  const opts = [['group', 'Your own groups'], ...(FIELDS[t] || []).filter(([, , k]) => k === 'sel' || k === 'link' || k === 'text').filter(([k]) => !['secret', 'voice', 'want', 'goal', 'reward', 'player', 'mood', 'value'].includes(k)).map(([k, l]) => [k, l]), ['', 'Not grouped']];
  menu([{ head: 'Group ' + TYPES[t].plural.toLowerCase() + ' by' }, ...opts.map(([k, l]) => ({ label: l, check: groupBy(t) === k, fn: () => { A.prefs.groupBy = { ...(A.prefs.groupBy || {}), [t]: k }; savePrefs(); renderSide(); } })),
    '-', { label: 'New group…', icon: 'plus', fn: async () => { const n = await ask('Name the group', '', { placeholder: 'The Wick Society, Suspects, Dead…', hint: 'Drag ' + TYPES[t].plural.toLowerCase() + ' onto a group to put them in it, and onto the heading to take them out.' }); if (!n) return; A.camp.groups = A.camp.groups || {}; A.camp.groups[t] = [...new Set([...(A.camp.groups[t] || []), n])]; A.prefs.groupBy = { ...(A.prefs.groupBy || {}), [t]: 'group' }; savePrefs(); await saveCamp(); renderSide(); } }], at);
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
  if (!A.camp) { if (document.getElementById('drawer')) DRAWER.mount(); VIEWS.welcome(main); return; }
  if (PAGES[A.view.k]) return PAGES[A.view.k].render(main);
  if (A.view.k === 'doc' && D(A.view.id)) return renderDoc(main, D(A.view.id));
  A.view = { k: 'home' }; VIEWS.home(main);
}

function renderDoc(main, d) {
  const mode = modeOf(d), ro = isRO(d), full = d.type === 'board' || d.type === 'map';
  const locked = ro || !!d.locked || mode === 'run';
  main.className = 'docmain m-' + mode + ' t-' + d.type + (full ? ' full' : '');
  A.ed = null;
  const crumbs = []; for (let p = D(d.parent); p && crumbs.length < 6; p = D(p.parent)) crumbs.unshift(p);
  // the bar: where it is; then the lock, the mind map, sending, and everything else under More
  const lockBtn = !ro && !full ? h('button', { type: 'button', class: 'ib lockb' + (d.locked ? ' on' : ''), 'aria-pressed': String(!!d.locked), title: d.locked ? 'Locked: nothing changes by accident. Click to unlock and write (Ctrl+E)' : 'Unlocked: you can write. Click to lock it (Ctrl+E)', 'aria-label': d.locked ? 'Locked. Unlock to write' : 'Unlocked. Lock it', html: icon(d.locked ? 'lock' : 'unlock'), onclick: () => toggleLock(d) }) : null;
  const bar = h('div', { class: 'docbar', role: 'toolbar', 'aria-label': 'Document' },
    h('nav', { class: 'crumbs', 'aria-label': 'Where this document is' }, ...crumbs.flatMap(p => [h('button', { type: 'button', class: 'crumb', text: p.title, 'data-doc': p.id, onclick: () => openDoc(p.id) }), h('span', { class: 'csep', html: icon('right'), 'aria-hidden': 'true' })]),
      full ? h('span', { class: 'crumb cur', html: icon(TYPES[d.type].icon) }) : h('span', { class: 'crumb cur', text: TYPES[d.type].name + (ro ? ' · ' + A.wname : '') })),
    full ? fullTitle(d, ro) : null,
    h('div', { class: 'grow' }),
    d.type === 'session' && !ro ? btn(mode === 'run' ? 'stop' : 'play', mode === 'run' ? 'Stop running' : 'Run the session', () => setMode(d, mode === 'run' ? 'read' : 'run'), 'tiny runb' + (mode === 'run' ? ' on' : ' accent2')) : null,
    full ? h('button', { type: 'button', class: 'ib' + (A.prefs.drawer ? ' on' : ''), 'aria-pressed': String(!!A.prefs.drawer), title: 'Details and notes', 'aria-label': 'Details and notes', html: icon('panel'), onclick: () => { A.prefs.drawer = !A.prefs.drawer; savePrefs(); renderMain(); } }) : null,
    lockBtn,
    !full ? h('button', { type: 'button', class: 'ib mindb' + (mode === 'mind' ? ' on' : ''), title: 'Mind map (Ctrl+M)', 'aria-label': 'Mind map', 'aria-pressed': String(mode === 'mind'), html: icon('mind'), onclick: () => setMode(d, mode === 'mind' ? 'read' : 'mind') }) : null,
    SYNC.isPlayer() ? null : btn('send', 'Send to table', e => VIEWS.sendMenu(d, e.currentTarget), 'tiny primary sendb'),
    ro || SYNC.isPlayer() ? null : ib('dots', 'More for this document', e => docMenu(d, e.currentTarget)));
  main.append(bar);
  if (mode === 'mind') { main.append(h('h1', { class: 'sr', text: `${d.title}: mind map` }), mindPane(d)); return; }
  // boards and maps take the whole middle; their details and words open in a drawer
  if (full) {
    const stage = h('div', { class: 'fullstage' }); main.append(h('h1', { class: 'sr', text: `${d.title} (${TYPES[d.type].name})` }), stage);
    if (d.type === 'board') { const host = h('div', { class: 'boardbox' }); stage.append(host); queueMicrotask(() => BOARD.render(host, d, { onChange: () => touch(d), ro })); }
    else stage.append(mapPane(d, ro));
    if (A.prefs.drawer) {
      const dr = h('aside', { class: 'drawer', 'aria-label': 'Details and notes' }, ib('x', 'Close', () => { A.prefs.drawer = false; savePrefs(); renderMain(); }, 'drawx'), propsBox(d, ro), h('div', { class: 'rsec', text: 'Notes' }));
      const body = h('div', { class: 'dbody' }); dr.append(body); stage.append(dr);
      A.ed = ED.mount(body, d, { locked: ro });
    }
    return;
  }
  const scroll = h('div', { class: 'docscroll', 'data-pan': 'y' }), page = h('div', { class: 'page' });
  if (ro) page.append(SYNC.isPlayer() ? h('div', { class: 'robar', role: 'note' }, h('span', { html: icon('eye') }), h('span', { text: 'Shared with you by the GM. Read only.' })) : h('div', { class: 'robar', role: 'note' }, h('span', { html: icon('globe') }), h('span', {}, 'From the shared world ', h('b', { text: A.wname }), '. Read only here.'), h('span', { class: 'grow' }), btn('open', 'Open it there', () => openWorldDoc(d), 'tiny')));
  // the page runs up under the document bar and the title bar: a banner spans the whole middle from the window's top, and a picture's glow spreads freely
  main.classList.add('flow');
  scroll.addEventListener('scroll', () => main.classList.toggle('scrolled', scroll.scrollTop > 24), { passive: true });
  const head = docHead(d, ro), bn = head.querySelector(':scope > .banner');
  if (bn) scroll.append(bn);
  page.append(h('h1', { class: 'sr', text: `${d.title} (${TYPES[d.type].name})` }), head);
  if (d.live && TABLE.on()) page.append(h('div', { class: 'livebar', role: 'note' }, h('span', { html: icon('eye') }), h('span', { text: 'The players see this. Changes reach their notes a few seconds after you write them.' }), h('span', { class: 'grow' }), btn(null, 'Stop showing it', () => { d.live = false; touch(d, true); renderMain(); renderSide(); }, 'tiny ghost')));
  if (d.carried) { page.append(h('p', { class: 'hint note', text: `${plural(d.carried, 'unrevealed clue')} came along from the last session.` })); delete d.carried; }
  page.append(propsBox(d, ro));
  if (mode === 'run') page.append(VIEWS.runBar(d));
  const body = h('div', { class: 'dbody' }); page.append(body);
  A.ed = ED.mount(body, d, { locked });
  if (mode === 'run') page.append(VIEWS.runLog(d));
  scroll.append(page); main.append(scroll);
  if (!locked && !d.body.trim()) setTimeout(() => { if (!document.activeElement || !document.activeElement.closest('.title')) A.ed && A.ed.focus(); }, 40);
}
function toggleLock(d) { if (isRO(d)) return; if (A.ed) A.ed.commit(); d.locked = !d.locked; touch(d, true); renderMain(); toast(d.locked ? 'Locked. It can still be read, ticked and sent, but not changed.' : 'Unlocked. Write away.'); }
// the title of a board or map, written in its bar
function fullTitle(d, ro) {
  const t = h('input', { type: 'text', class: 'ftitle', value: d.title, readOnly: ro, 'aria-label': 'Title', size: Math.max(6, d.title.length) });
  t.addEventListener('input', () => { t.size = Math.max(6, t.value.length); });
  t.addEventListener('keydown', e => { if (e.key === 'Enter') t.blur(); if (e.key === 'Escape') { t.value = d.title; t.blur(); } });
  t.addEventListener('change', () => { if (t.value.trim() && t.value.trim() !== d.title) { renameDoc(d, t.value); paintTitle(); renderSide(); } t.value = d.title; });
  return t;
}
// who sees a document: only the GM and co-writers, every player, or some of them (they get it without secrets)
function accessChip(d) {
  const to = SYNC.visibleTo(d), names = Array.isArray(to) ? to.map(id => (TABLE.players().find(p => p.id === id) || {}).name).filter(Boolean) : [];
  const label = !to ? 'Only writers' : to === 'all' ? 'All players see it' : names.join(', ') + ' see' + (names.length === 1 ? 's' : '') + ' it';
  return h('button', { type: 'button', class: 'accchip' + (to ? ' open' : ''), title: 'Who can read this', 'aria-label': 'Who can read this: ' + label, onclick: e => menu([{ head: 'Who can read it' },
    { label: 'Only the GM and co-writers', icon: 'lock', check: !to, fn: () => { d.access = ''; touch(d, true); renderMain(); } },
    { label: 'Every player', sub: 'Without secrets, paths and clues', icon: 'users', check: to === 'all', fn: () => { d.access = 'all'; touch(d, true); renderMain(); } },
    ...TABLE.players().map(p => ({ label: p.name, icon: 'character', check: Array.isArray(to) && to.includes(p.id), fn: () => { const cur = Array.isArray(d.access) ? d.access : []; d.access = cur.includes(p.id) ? cur.filter(x => x !== p.id) : [...cur, p.id]; touch(d, true); renderMain(); } }))], e.currentTarget) },
    h('span', { html: icon(to ? 'eye' : 'eye-off') }), h('span', { text: label }));
}
// the top of a document: a banner (offered on hover for some kinds), the portrait with its colours bleeding out, the title
const BANNER_KINDS = ['character', 'location', 'faction', 'quest', 'session'], PIC_KINDS = ['character', 'location', 'item', 'faction', 'lore', 'quest', 'event'];
function docHead(d, ro) {
  const wrap = h('div', { class: 'dtop' + (d.banner ? ' hasbanner' : '') + (d.img ? ' haspic' : '') });
  if (d.banner) {
    const bn = h('div', { class: 'banner' }, h('img', { 'data-cimg': d.banner, alt: '' }));
    if (!ro) bn.append(h('div', { class: 'bantools' }, btn('image', 'Change banner', async () => { const f = await pickImage(); if (f) { d.banner = f; touch(d); renderMain(); } }, 'tiny glass'), btn('x', 'Remove', () => { d.banner = ''; touch(d); renderMain(); }, 'tiny glass')));
    wrap.append(bn);
  } else if (!ro && BANNER_KINDS.includes(d.type)) wrap.append(h('div', { class: 'banhover' }, btn('image', 'Add a banner', async () => { const f = await pickImage(); if (f) { d.banner = f; touch(d); renderMain(); } }, 'tiny ghost')));
  const title = h('textarea', { class: 'title', rows: 1, value: d.title, spellcheck: true, placeholder: 'Untitled', 'aria-label': 'Title', readOnly: ro });
  const fit = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
  title.addEventListener('input', fit); requestAnimationFrame(fit); setTimeout(fit, 50);
  // and again once a web font (a font set, the dyslexia font) has arrived and made the title wider or narrower
  if (document.fonts) { document.fonts.ready.then(fit); setTimeout(fit, 900); }
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); if (A.ed) A.ed.focus(); } if (e.key === 'Escape') { title.value = d.title; title.blur(); } });
  const keepTitle = () => { if (!ro && title.value.trim() && title.value.trim() !== d.title) { renameDoc(d, title.value); if (document.activeElement !== title) title.value = d.title; paintTitle(); renderSide(); } };   // (while it's being typed in, the box is left alone)
  const titleSoon = debounce(keepTitle, 1200);
  title.addEventListener('input', () => { if (!ro) titleSoon(); });
  title.addEventListener('commit-title', keepTitle);
  title.addEventListener('blur', () => { keepTitle(); title.value = d.title; });
  const kind = h('button', { type: 'button', class: 'kindchip', style: `--c:${typeColor(d)}`, disabled: ro, title: ro ? '' : 'Change what kind of document this is', 'aria-label': `Kind: ${TYPES[d.type].name}${ro ? '' : '. Change it'}`, onclick: e => kindMenu(d, e.currentTarget) }, h('span', { html: icon(TYPES[d.type].icon) }), h('span', { text: TYPES[d.type].name }));
  const words = h('div', { class: 'dtitle' }, h('div', { class: 'dchips' }, kind, SYNC.isWriter() && SYNC.S.on && !ro ? accessChip(d) : null), title);
  if (d.img) {
    const pic = h('button', { type: 'button', class: 'portrait', disabled: ro, 'aria-label': `Picture of ${d.title}${ro ? '' : '. Change or remove it'}`, onclick: e => menu([{ label: 'Change the picture', icon: 'image', fn: async () => { const f = await pickImage(); if (f) { d.img = f; touch(d); renderMain(); } } }, { label: 'Remove the picture', icon: 'x', cls: 'bad', fn: () => { d.img = ''; touch(d); renderMain(); } }], e.currentTarget) }, h('img', { 'data-cimg': d.img, alt: '' }));
    const glow = h('div', { class: 'glow', 'aria-hidden': 'true' });
    STORE.imageUrl(cid(), d.img).then(u => { if (u) glow.style.backgroundImage = `url("${u}")`; });
    wrap.append(glow, h('div', { class: 'dhero' }, pic, words));
  } else {
    if (!ro && PIC_KINDS.includes(d.type)) words.append(h('div', { class: 'addpic' }, btn('image', 'Add a picture', async () => { const f = await pickImage(); if (f) { d.img = f; touch(d); renderMain(); } }, 'tiny ghost')));
    wrap.append(h('div', { class: 'dhero nopic' }, words));
  }
  // a picture dropped on the top becomes the portrait
  if (!ro) { wrap.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.type.startsWith('image/'))) e.preventDefault(); }); wrap.addEventListener('drop', async e => { const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (!f) return; e.preventDefault(); d.img = await STORE.putImage(cid(), f, f.name); touch(d); renderMain(); }); }
  hydrate(wrap);
  return wrap;
}
// a shared-world document is changed in its own campaign
async function openWorldDoc(d) { const id = d.id, w = d.world; await openCampaign(w); openDoc(id); }
function scrollToLine(line) {
  const d = A.view.k === 'doc' && D(A.view.id); if (!d) return;
  const r = $('.vis [data-line="' + line + '"]') || [...$$('.vis [data-line]')].reverse().find(e => +e.dataset.line <= line);
  if (r) { r.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1400); return; }

}

/* ---------- details: the fields, picture and relationships, folded away when they're not wanted ---------- */
let fid = 0;
function propsBox(d, ro) {
  const fl = (FIELDS[d.type] || []).filter(f => !f[4] || f[4](d)); d.fields = d.fields || {};
  // folded by default where there's little to fill in (notes, boards); the choice is remembered per kind
  const closed = A.prefs.details[d.type] ?? !(FIELDS[d.type] || []).length;
  const grid = h('div', { class: 'props' });
  for (const [k, label, kind, opts] of fl) {
    if (ro && (d.fields[k] === undefined || d.fields[k] === '' || d.fields[k] === null)) continue;
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
  const inner = h('div', { class: 'propin' }, grid);
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
        if (!id && (SYNC.isPlayer() || isRO(D(A.view.id) || {}))) return `<a class="wl unknown" href="#" data-unknown="${esc(li.title)}">${esc(label)}</a>`;
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
  if (document.body.classList.contains('touring')) return;   // the tour shows hover cards itself
  const a = e.target.closest('.wl[data-doc],.wl[data-unknown],.wl[data-new],.tl[data-ent],.tl[data-srd]'), card = $('#hov');
  if (e.target.closest('#hov')) { clearTimeout(hovT); return; }
  if (card.classList.contains('sticky')) return;
  if (!a) { if (hovFor) { clearTimeout(hovT); hovT = setTimeout(hideHover, 250); } return; }
  if (a === hovFor) return;
  clearTimeout(hovT); hovT = setTimeout(() => peek(a), 900);
});
// how a document begins, kept in its shape: its first sections under their headings, lists as lists, a few lines in all
function excerptOf(src) {
  const out = h('div', { class: 'hx' }); let n = 0, sec = null;
  for (const raw of String(src).split(/\r?\n/)) {
    if (n >= 6) break;
    const l = raw.trim(); if (!l || /^(>|\||---|```|!\[)/.test(l)) continue;
    const hd = /^#{1,6}\s+(.*)/.exec(l);
    if (hd) { if (n >= 4) break; sec = h('div', { class: 'hxs' }, h('div', { class: 'hxh', text: MD.plain(hd[1]).trim() })); out.append(sec); continue; }
    const li = /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)/.exec(l);
    const t = MD.plain(li ? li[1] : l).replace(/\s+/g, ' ').trim(); if (!t) continue;
    const el = h(li ? 'li' : 'p', { text: t.length > 150 ? t.slice(0, 150) + '…' : t }), box = sec || out;
    if (li) { let ul = box.lastElementChild; if (!ul || ul.tagName !== 'UL') { ul = h('ul'); box.append(ul); } ul.append(el); } else box.append(el);
    n++;
  }
  out.querySelectorAll('.hxs').forEach(x => { if (x.children.length < 2) x.remove(); });
  return out.children.length ? out : null;
}
async function peek(a, sticky) {
  const card = $('#hov'); clearTimeout(hovT);
  if (!sticky && card.classList.contains('sticky')) return;
  hovFor = a; card.replaceChildren(); card.classList.toggle('sticky', !!sticky);
  card.classList.remove('rich', 'unknown');
  if (a.dataset.doc) {
    // a little card of the place, person or thing: its banner and portrait, what it is, the facts that matter, how it begins
    const d = D(a.dataset.doc); if (!d) return;
    const player = SYNC.isPlayer();
    const flds = (FIELDS[d.type] || []).filter(([k, , , , show]) => d.fields && d.fields[k] !== undefined && d.fields[k] !== '' && k !== 'secret' && (!show || show(d))).slice(0, 4);
    const ban = d.banner || d.img;
    card.classList.add('rich');
    if (ban) card.append(h('div', { class: 'hban' + (d.banner ? '' : ' frompic') }, h('img', { 'data-cimg': ban, alt: '' })));
    card.append(h('div', { class: 'hhead' + (ban ? '' : ' plain') },
      d.img ? h('img', { class: 'hav', 'data-cimg': d.img, alt: '' }) : h('span', { class: 'hav none', style: `--c:${typeColor(d)}`, html: icon(TYPES[d.type].icon) }),
      h('div', { class: 'hname' }, h('div', { class: 'hk', style: `--c:${typeColor(d)}`, html: icon(TYPES[d.type].icon) + `<span>${TYPES[d.type].name}</span>` }), h('b', { class: 'ht', text: d.title }))));
    if (flds.length) card.append(h('div', { class: 'hf' }, ...flds.map(([k, l]) => h('span', {}, h('i', { text: l + ' ' }), String(d.fields[k])))));
    const src = player ? MD.forPlayers(d.body || '') : String(d.body || '').replace(/^> \[!secret\][^\n]*(\n>[^\n]*)*/gm, '');
    card.append(excerptOf(src) || h('p', { class: 'hint', text: 'Nothing written yet.' }));
    hydrate(card);
  } else if (a.dataset.unknown) {
    // a link the reader can't open: the GM hasn't shared it (or it isn't written)
    card.classList.add('unknown');
    card.append(h('div', { class: 'hk', html: icon('eye-off') + '<span>Not something you know</span>' }), h('b', { class: 'ht', text: a.dataset.unknown }),
      h('p', { text: 'This isn\'t information you have yet. Maybe your character should ask around about it?' }));
  } else if (a.dataset.new) {
    card.append(h('div', { class: 'hk', html: icon('plus') + '<span>Not written yet</span>' }), h('b', { class: 'ht', text: a.dataset.new }), h('p', { class: 'hint', text: 'Click the link to start this document.' }));
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

/* ============================== map and mind map panes ============================== */
const mapViews = new Map(), mindViews = new Map();
function mapPane(d, ro) {
  if (!d.map) d.map = { img: '', w: 0, h: 0, pins: [] };
  const M = d.map, wrap = h('div', { class: 'mapwrap' });
  const choose = async () => { const f = await pickImage(); if (f) { M.img = f; M.w = 0; touch(d); mapViews.delete(d.id); renderMain(); } };
  if (!M.img) {
    const empty = h('div', { class: 'mapempty' }, h('span', { html: icon('map') }), h('b', { text: 'A map with pins' }), h('p', { class: 'hint', text: 'Choose a picture of your world, a city or a dungeon (or drop one here). Right-click it to place pins that lead to its places, people and deeper maps.' }),
      h('div', { class: 'row center' }, btn('image', 'Choose a picture', choose, 'primary'), TABLE.on() ? btn('table', 'From a table scene', e => VIEWS.scenePicker(e.currentTarget, async sc => { const f = await VIEWS.sceneToFile(sc); if (f) { M.img = f; touch(d); renderMain(); } })) : null));
    empty.addEventListener('dragover', e => e.preventDefault());
    empty.addEventListener('drop', async e => { const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (!f) return; e.preventDefault(); M.img = await STORE.putImage(cid(), f, f.name); touch(d); renderMain(); });
    wrap.append(empty); return wrap;
  }
  const host = h('div', { class: 'mapbox' }); wrap.append(host);
  // the map's own settings float over it, top right
  if (!ro) wrap.append(h('div', { class: 'maptools' },
    ib('image', 'Change the picture', choose),
    TABLE.on() ? ib('table', 'Use a table scene', e => VIEWS.scenePicker(e.currentTarget, async sc => { const f = await VIEWS.sceneToFile(sc); if (f) { M.img = f; M.w = 0; touch(d); mapViews.delete(d.id); renderMain(); } })) : null,
    ib('pie', 'Edges: soft or old paper', e => menu([{ head: 'The map\'s edges' }, ...[['blur', 'Soft: blur outwards'], ['paper', 'Old map paper'], ['none', 'Plain']].map(([k, l]) => ({ label: l, check: (M.edge || 'blur') === k, fn: () => { M.edge = k; touch(d, true); renderMain(); } }))], e.currentTarget)),
    ib('fit', 'The map\'s scale', e => scaleDialog(d, e.currentTarget))));
  STORE.imageUrl(cid(), M.img).then(url => {
    const mv = MAPV.render(host, d, {
      url, ro, view: mapViews.get(d.id), onView: v => mapViews.set(d.id, v),
      typeOf: id => (D(id) || {}).type, titleOf: id => (D(id) || {}).title || '',
      onChange: () => touch(d), onOpen: id => openDoc(id),
      preview: id => { const x = D(id); if (!x) return ''; const t = MD.plain(x.body).replace(/\s+/g, ' ').trim(); return `<div class="hk" style="--c:${typeColor(x)}">${icon(TYPES[x.type].icon)}<span>${TYPES[x.type].name}</span></div><b>${esc(x.title)}</b>${t ? `<p>${esc(t.slice(0, 200))}${t.length > 200 ? '…' : ''}</p>` : ''}`; },
      pickDoc: q => { q = q.toLowerCase(); return [...A.docs.values()].filter(x => x.id !== d.id && (!q || x.title.toLowerCase().includes(q))).sort((a, b) => (a.title.toLowerCase().startsWith(q) ? 0 : 1) - (b.title.toLowerCase().startsWith(q) ? 0 : 1)).slice(0, 6).map(x => ({ id: x.id, title: x.title, type: x.type })); },
      create: (title, type) => { const x = newDoc({ type, title, parent: d.id }); renderSide(); return x.id; }
    });
    host.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-cn-doc')) e.preventDefault(); });
    host.addEventListener('drop', e => { const id = e.dataTransfer.getData('text/x-cn-doc'); if (!id || !D(id) || ro) return; e.preventDefault(); mv.pinAt(e, id, D(id).title); });
  });
  return wrap;
}
// how wide the map is in the world, so the scale bar can say how far things are
function scaleDialog(d, at) {
  const M = d.map, sc = M.scale || {};
  const w = h('input', { type: 'number', min: 0, step: 'any', value: sc.w || '', placeholder: '120', 'aria-label': 'How wide the map is' });
  const u = h('select', { 'aria-label': 'In' }, ...['miles', 'km', 'leagues', 'feet', 'metres', 'days of travel', 'squares'].map(x => h('option', { value: x, text: x, selected: (sc.unit || 'miles') === x })));
  const m = modal('The map\'s scale', h('div', { class: 'form' }, h('p', { class: 'hint', text: 'How far is it from the left edge of the map to the right? A scale bar then shows in the corner.' }), h('div', { class: 'row' }, w, u)),
    [btn(null, 'No scale', () => { delete M.scale; touch(d, true); m.close(); renderMain(); }, 'ghost'), btn('check', 'Save', () => { M.scale = { w: +w.value || 0, unit: u.value }; touch(d, true); m.close(); renderMain(); }, 'primary')]);
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
  if (SYNC.isPlayer()) { newPlayerNote(); return; }
  menu([{ head: parent ? 'New inside ' + D(parent).title : 'New document' }, ...Object.entries(TYPES).map(([t, x]) => ({ label: x.name, sub: x.hint, icon: x.icon, color: x.color, fn: () => create(t, parent) }))], at || $('#newBtn'));
}
async function newPlayerNote() { const id = await SYNC.newNote(''); if (!id) return; for (let i = 0; i < 20 && !A.docs.has(id); i++) await new Promise(r => setTimeout(r, 100)); openDoc(id); setTimeout(() => { const t = $('.dtitle .title'); if (t) t.focus(); }, 60); }
function create(type, parent) { const d = newDoc({ type, parent: parent || '' }); if (parent) { A.prefs.open[parent] = true; savePrefs(); } openDoc(d.id); setTimeout(() => { const t = $('.dtitle .title, .ftitle'); if (t && type !== 'session') { t.focus(); t.select(); } }, 40); }
function kindMenu(d, at) {
  menu([{ head: 'What kind of document is this?' }, ...Object.entries(TYPES).map(([t, x]) => ({ label: x.name, icon: x.icon, color: x.color, cls: t === d.type ? 'on' : '', fn: () => { if (t === d.type) return; d.type = t; if (t === 'map' && !d.map) d.map = { img: '', w: 0, h: 0, pins: [] }; touch(d); render(); } }))], at);
}
function docMenu(d, at, y) {
  if (SYNC.isPlayer() || isRO(d)) return;
  const pos = typeof at === 'number' ? { x: at, y } : at, here = A.view.k === 'doc' && A.view.id === d.id, m = modeOf(d);
  // a narrow document bar folds Run and the mind map in here (the lock is always here)
  const bar = $('.docbar'), narrow = here && !!bar && bar.clientWidth <= 560;
  menu([
    here ? null : { label: 'Open', icon: 'open', fn: () => openDoc(d.id) },
    narrow && d.type === 'session' ? { label: m === 'run' ? 'Stop running' : 'Run the session', icon: m === 'run' ? 'stop' : 'play', fn: () => setMode(d, m === 'run' ? 'read' : 'run') } : null,
    narrow && !['board', 'map'].includes(d.type) ? { label: 'Mind map', icon: 'mind', check: m === 'mind', fn: () => setMode(d, m === 'mind' ? 'read' : 'mind') } : null,
    here && !['board', 'map'].includes(d.type) ? { label: d.locked ? 'Unlock it' : 'Lock it', icon: d.locked ? 'unlock' : 'lock', fn: () => toggleLock(d) } : null,
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

/* ---------- right-click: whatever doesn't do something of its own offers a sensible menu ---------- */
// a document (a link, a chip, a card, a node): its menu; read-only, just Open
function docContext(d, e) {
  if (!d) return; if (e && e.preventDefault) e.preventDefault();
  if (SYNC.isPlayer() || isRO(d)) menu([{ head: d.title }, { label: 'Open', icon: 'open', fn: () => openDoc(d.id) }], { x: e.clientX, y: e.clientY });
  else docMenu(d, e.clientX, e.clientY);
}
document.addEventListener('contextmenu', e => {
  if (e.defaultPrevented || !(e.target instanceof Element)) return;
  const t = e.target;
  // text fields keep the system's menu (spelling, copy, paste)
  if (t.closest('input,textarea,select,[contenteditable="true"],.menu,.tourov')) return;
  const at = { x: e.clientX, y: e.clientY }, sel = String(getSelection() || '').trim();
  const copy = sel ? [{ label: 'Copy', icon: 'copy', fn: () => navigator.clipboard.writeText(sel).catch(() => {}) }, '-'] : [];
  const de = t.closest('[data-doc]'); if (de && D(de.dataset.doc)) return docContext(D(de.dataset.doc), e);
  e.preventDefault();
  const tag = t.closest('.tag[data-tag]');
  if (tag) return menu([...copy, { label: 'Everything tagged #' + tag.dataset.tag, icon: 'hash', fn: () => tag.click() }], at);
  const nb = t.closest('.navb');
  if (nb) return menu([{ label: 'Open ' + nb.textContent.trim(), icon: 'open', fn: () => nb.click() }], at);
  if (!A.camp) return menu([...copy, { label: 'Take the tour', icon: 'compass', fn: () => TOUR.ask() }, { label: 'Settings', icon: 'gear', fn: () => go({ k: 'settings' }) }], at);
  const un = HIST.undo[HIST.undo.length - 1], re = HIST.redo[HIST.redo.length - 1];
  menu([...copy,
    SYNC.isPlayer() ? null : { label: un ? 'Undo: ' + un.label : 'Nothing to undo', sub: 'Ctrl+Z', icon: 'undo', disabled: !un, fn: () => undo() },
    re ? { label: 'Redo: ' + re.label, sub: 'Ctrl+Y', icon: 'refresh', fn: () => redo() } : null,
    SYNC.isPlayer() ? null : { label: 'Undo history…', icon: 'log', fn: () => historyDialog() },
    '-',
    SYNC.isPlayer() ? null : { label: 'New document…', sub: 'Ctrl+N', icon: 'plus', fn: () => $('#newBtn').click() },
    { label: 'Find…', sub: 'Ctrl+K', icon: 'search', fn: () => $('#findBtn').click() },
    '-',
    { label: 'Back', icon: 'back', disabled: !A.back.length, fn: () => $('#backBtn').click() },
    { label: 'Home', icon: 'home', fn: () => go({ k: 'home' }) },
    '-',
    { label: 'Settings', icon: 'gear', fn: () => go({ k: 'settings' }) }].filter(Boolean), at);
});

// everything not yet written, written now: the open document's last keystrokes, the title being typed, the campaign
async function saveAllNow() {
  if (A.ed) A.ed.commit();
  const t = document.activeElement; if (t && t.matches && t.matches('textarea.title')) t.dispatchEvent(new Event('commit-title'));
  await flush(); if (A.camp && campPending) await saveCamp();
}
let campPending = false;
addEventListener('blur', () => { saveAllNow().catch(() => {}); });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveAllNow().catch(() => {}); });
addEventListener('pagehide', () => { saveAllNow().catch(() => {}); });

/* ============================== campaigns ============================== */
async function loadCampaigns() { A.camps = (await STORE.listCampaigns().catch(() => [])).sort((a, b) => (b.updated || 0) - (a.updated || 0)); }
async function openCampaign(id) {
  await flush(); SYNC.stop();
  const meta = A.camps.find(c => c.id === id); if (!meta) return;
  A.camp = meta; A.docs = new Map(); A.back = []; A.fwd = []; A.modes = new Map(); mapViews.clear(); mindViews.clear();
  A.prefs.lastCamp = id; savePrefs();
  try { for (const d of await STORE.loadDocs(id)) { if (d && d.id) { d.body = String(d.body || ''); d.title = String(d.title || 'Untitled'); d.fields = d.fields || {}; if (!TYPES[d.type]) d.type = 'note'; A.docs.set(d.id, d); } } }
  catch (e) { toast('Could not read the campaign: ' + errText(e)); }
  await PLAN.loadWorld();
  reindex(); histReset();
  A.view = { k: 'none' };
  go(meta.last && D(meta.last) ? { k: 'doc', id: meta.last } : { k: 'home' }, true);
  if (meta.table) TABLE.connect(meta.table); else TABLE.disconnect();
  if (meta.share && meta.share.on) SYNC.start(); SYNC.paintRole();
  DRAWER.mount();
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
    { label: 'Join a campaign…', icon: 'users', fn: () => VIEWS.joinMenu(at) },
    { label: 'Settings', icon: 'gear', fn: () => go({ k: 'settings' }) }], at);
}

/* ============================== keys and the window ============================== */
document.addEventListener('keydown', e => {
  const c = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), inText = e.target.closest('input,textarea,select,[contenteditable]');
  if ($('.modal') && !(c && k === 'k')) return;
  if (c && (k === 'k' || k === 'p') && A.camp) { e.preventDefault(); if ($('.card.quick')) return; quickOpen(); return; }
  if (c && k === 'n' && A.camp) { e.preventDefault(); newDocMenu(null); return; }
  if (c && k === 's') { e.preventDefault(); flush().then(() => toast('Saved.')); return; }
  if (c && !e.shiftKey && k === 'e' && A.view.k === 'doc') { e.preventDefault(); toggleLock(D(A.view.id)); return; }
  if (c && k === 'm' && A.view.k === 'doc') { e.preventDefault(); const d = D(A.view.id); setMode(d, modeOf(d) === 'mind' ? 'read' : 'mind'); return; }
  if (c && k === 'g' && A.camp) { e.preventDefault(); go({ k: 'graph' }); return; }
  if (c && k === '\\') { e.preventDefault(); A.prefs.right = !A.prefs.right; savePrefs(); renderRight(); return; }
  if (c && k === '.') { e.preventDefault(); toggleFocus(); return; }
  if (c && e.shiftKey && k === 'e' && A.view.k === 'doc') { e.preventDefault(); PLAN.encounter(t => { const d = D(A.view.id); if (A.ed && !d.locked) A.ed.insertBlockMd(t.trim()); else { d.body = d.body.trimEnd() + String.fromCharCode(10, 10) + t; touch(d); renderMain(); } }); return; }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return; }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goFwd(); return; }
  if (e.key === 'Escape') { if ($('.menu')) closeMenu(); else if (A.prefs.focus && !inText) toggleFocus(false); hideHover(); }
  if (!inText && (e.key === 'F1' || e.key === '?')) { e.preventDefault(); VIEWS.shortcuts(); }
});
document.addEventListener('mouseup', e => { if (e.button === 3) goBack(); if (e.button === 4) goFwd(); });
// one rule everywhere: dragging empty space moves the view, along the way it can move. Documents and pages go up and
// down; the timeline goes sideways; boards, maps, mind maps and the graph go every way (they handle their own).
const PAN_EMPTY = '.docscroll, .page, .pagemain, .pagein, .home, .homein, .hcols, .hcol, .phead, .dtop, .dhero, .vwrap, .rbody, .welcome, .hero';
document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.pointerType === 'touch' || !e.target.matches || !e.target.matches(PAN_EMPTY)) return;
  const sc = e.target.closest('.docscroll, .pagemain, .home, .rbody'); if (!sc || sc.scrollHeight <= sc.clientHeight) return;
  const y0 = e.clientY, t0 = sc.scrollTop; let on = false;
  const mv = m => { const dy = m.clientY - y0; if (!on && Math.abs(dy) < 4) return; if (!on) { on = true; sc.classList.add('panning'); getSelection().removeAllRanges(); } sc.scrollTop = t0 - dy; };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); sc.classList.remove('panning'); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
function wireWindow() {
  const desk = window.desk;
  document.body.classList.toggle('desk', !!desk);
  $('#appMenu').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); if (desk) desk.winCmd('menu', { x: r.left, y: r.bottom }); else VIEWS.pageMenu(e.currentTarget); };
  if (desk) {
    $('.wb-min').onclick = () => desk.winCmd('min'); $('.wb-max').onclick = () => desk.winCmd('max'); $('.wb-close').onclick = () => desk.winCmd('close');
    $('#titlebar').addEventListener('dblclick', e => { if (!e.target.closest('button')) desk.winCmd('max'); });
    desk.onWinState(s => { document.body.classList.toggle('wmax', !!s.max); document.body.classList.toggle('wblur', !s.focus); document.body.classList.toggle('wfull', !!s.full); });
    desk.onKey(k => VIEWS.command(k));
    desk.onCloseAsked(async () => { await saveAllNow().catch(() => {}); desk.quitOk(); });
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
  $('#gearBtn').onclick = () => go({ k: 'settings' });
  $('#roleChip').onclick = () => go({ k: 'settings' });
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
const refreshReaderSoon = debounce(() => { if (A.ed && !A.ed.root.contains(document.activeElement)) A.ed.render(); }, 200);
function paintChips() {
  const T = TABLE.T, c = $('#tableChip'), s = $('#soundChip');
  c.className = 'chip ' + ({ on: 'ok', connecting: 'warn', error: 'bad', missing: 'bad' }[T.state] || '');
  c.querySelector('span').textContent = T.state === 'on' ? `Table ${T.code}` : T.state === 'connecting' ? 'Linking…' : T.state === 'off' ? 'No table linked' : 'Table not found';
  c.title = T.why || (T.state === 'on' ? 'Linked to the Critter VTT table ' + T.code : 'Link this campaign to its Critter VTT table to send things to it and take things from it');
  const snd = T.state === 'on' && T.sounds && Date.now() - (+T.sounds.ts || 0) < 36 * 3600e3;
  s.hidden = T.state !== 'on' || SYNC.isPlayer(); s.className = 'chip ' + (snd && T.keyOk ? 'ok' : snd ? 'warn' : '');
  s.querySelector('span').textContent = snd ? (T.keyOk ? 'Sounds ready' : T.key ? 'Sounds: key out of date' : 'Sounds: no music key') : 'Sounds not seen';
  s.onclick = () => { A.prefs.right = true; A.prefs.rightTab = 'sounds'; savePrefs(); renderRight(); };
}

async function boot() {
  wireWindow(); paintChips(); applyLook();
  await loadCampaigns();
  await TOUR.sweep();
  const last = A.camps.find(c => c.id === A.prefs.lastCamp) || A.camps[0];
  if (last) await openCampaign(last.id); else render();
  // the first time Notes opens, it offers the tour once
  if (!A.prefs.tourAsked) setTimeout(() => { if (!document.querySelector('.modal')) TOUR.ask(); }, 900);
}
boot();
