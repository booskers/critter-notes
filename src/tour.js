/* Critter Notes: the guided tour. Two lengths: the basics (a few minutes) or everything in depth.
   It runs in a campaign of its own (the sample, marked tour: true) so it can open things, switch views and dress documents
   up to show what they can do; at the end that campaign is removed for good and everything is put back as it was:
   the settings, the open campaign and the page. A tour campaign left behind by a crash is removed at the next start. */
'use strict';
const TOUR = (() => {
  let run = null;   // { steps, i, snap, camp, box, spot, card }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const byTitle = t => [...A.docs.values()].find(d => d.title === t);
  const byType = t => [...A.docs.values()].find(d => d.type === t);
  const open = async d => { if (d) { openDoc(d.id); await wait(500); } };
  const page = async k => { go({ k }); await wait(500); };
  const mode = async (d, m) => { if (d) { A.modes.set(d.id, m); openDoc(d.id); await wait(500); } };
  const hoverLink = async name => { const a = [...document.querySelectorAll('.wl[data-doc]')].find(x => x.textContent.includes(name)); if (!a) return; a.scrollIntoView({ block: 'center' }); await wait(250); peek(a); await wait(300); };

  // each step: where to look (a selector, or none for the middle), what it is, and what to do first to show it off
  const BASICS = [
    { title: 'Welcome to Critter Notes', text: 'A notebook for game masters: sessions, characters, places, maps and boards, all linked to each other and to your Critter VTT table. This tour uses a sample campaign and puts everything back when it ends.' },
    { el: '#campBtn', title: 'Your campaigns', text: 'Each campaign is a folder of plain files on your computer. Switch between them here, or start a new one.' },
    { el: '#findBtn', title: 'Find anything', text: 'Ctrl+K finds any document by name, and New (Ctrl+N) starts one.' },
    { el: '#tree', title: 'Your documents', text: 'Sessions, quests, characters, locations and more, sorted by kind. Drag characters into groups of your own.' },
    { el: '.docbar', before: async () => open(byType('session')), title: 'A session', text: 'Every document is written as it looks: no code to learn. The bar above holds the lock, the mind map, Run and Send to table.' },
    { el: '.lockb', title: 'The lock', text: 'Locked, nothing changes by accident, but boxes still tick, dice still roll and anything can still be sent. Ctrl+E switches it.' },
    { el: () => hovFor || document.querySelector('.wl[data-doc]'), before: async () => { await hoverLink('Mother Vey'); }, after: () => hideHover(), title: 'Links', text: 'Names become links to their documents. Rest the pointer on one for a second to see its picture and the facts that matter, without leaving the page.' },
    { el: '.sendb', title: 'Send to the table', text: 'Send a document, a section or a selection to your Critter VTT table: as a note, a handout for every player, or a whisper to one of them.' },
    { el: '#nav', title: 'Your views', text: 'Home, the Timeline of your world, Threads (clocks, quests and clues), Relationships and the Graph of everything.' },
    { el: '#gearBtn', title: 'Settings', text: 'Your colours, fonts and reading size, sharing with co-writers and players, the table and updates. That\'s the basics: the in-depth tour shows the rest.' }
  ];
  const DEPTH = [
    BASICS[0], BASICS[1], BASICS[2], BASICS[3],
    { el: '.dhero', before: async () => { const d = byTitle('Mother Vey'), m = byType('map'); if (d && m && m.map && m.map.img) { d.img = d.img || m.map.img; d.banner = d.banner || m.map.img; } await open(d); }, title: 'A character', text: 'A big picture whose colours spill into the page, and a banner across the top (hover the top edge of a document to add one). The title sits beside the picture.' },
    { el: '.propbox', title: 'Details', text: 'Each kind has its own fields: a character\'s role, faction and wants, a location\'s mood. Fields link to other documents, and relationships ("fears", "ally of") are drawn on the Relationships page.' },
    { el: '.dbody', before: async () => mode(byType('session'), 'edit'), title: 'Writing', text: 'Select text for bold, a link or Make it… an encounter, an alternative path, read-aloud text, a secret or a clue. The + beside your line adds dice, sound cues, tables and pictures. Each paragraph can be dragged by its handle.' },
    { el: '.lockb', title: 'The lock', text: 'Locked, nothing changes by accident, but boxes still tick, dice still roll and anything can still be sent. Ctrl+E switches it.' },
    { el: () => hovFor || document.querySelector('.wl[data-doc]'), before: async () => { A.modes.set(byType('session').id, 'read'); renderMain(); await wait(400); await hoverLink('Mother Vey'); }, after: () => hideHover(), title: 'Links and their cards', text: 'Rest the pointer on a link for a second: its banner, picture, facts and how it begins. Players only ever see what you shared with them.' },
    { el: '.docbar', before: async () => mode(byType('session'), 'run'), after: () => { const s = byType('session'); if (s) A.modes.set(s.id, 'read'); }, title: 'Running a session', text: 'Run gives you a clock, a timestamped log and the table\'s chat beside your plan, so nothing gets lost at the table.' },
    { el: '.mindb', before: async () => mode(byType('session'), 'mind'), after: () => { const s = byType('session'); if (s) A.modes.set(s.id, 'read'); }, title: 'Mind maps', text: 'Any document turns into a mind map of its headings, links and callouts. Drag to move around, wheel to zoom, double-click to open.' },
    { el: '#main', before: async () => open(byType('board')), title: 'Boards', text: 'Right-click the canvas for a card; Enter finishes it. Drag from a card\'s edge to another card for an arrow, and double-click an arrow to write on it. Right-click a card to send it or make it a document.' },
    { el: '#main', before: async () => open(byType('map')), title: 'Maps', text: 'A map fills the middle, with soft or old-paper edges and a scale. Right-click to place a pin and choose the document it leads to.' },
    { el: '.flipclock', before: async () => page('timeline'), title: 'Today in the world', text: 'Drag the flip clock to move time. While dragging, the mouse wheel changes the pace from days to weeks, months and years.' },
    { el: '#main', title: 'The timeline', text: 'Events from left to right by their date in your world. Drag empty space to move along it, scroll to zoom, right-click to add an event on that day.' },
    { el: '#main', before: async () => page('threads'), title: 'Threads', text: 'Progress clocks for factions and quests, quests by status, and every clue: planned in which session, found in which.' },
    { el: '#main', before: async () => page('graph'), title: 'The graph', text: 'Everything you wrote and how it links. Isolated documents stand out, so nothing gets forgotten.' },
    { el: '#right', before: async () => { await open(byType('session')); if (!A.prefs.right) { A.prefs.right = true; renderRight && renderRight(); } await wait(300); }, title: 'The side panel', text: 'The outline and backlinks of the open document, your Critter VTT table (its Library, scenes and players) and Critter Sounds cues.' },
    { el: '#focusBtn', title: 'Focus', text: 'Ctrl+. hides everything but the page, for writing without distractions.' },
    { el: '#gearBtn', title: 'Settings and sharing', text: 'Your colours and fonts, the table, updates, and sharing: co-writers see and change everything, players see only what you open to them, and their notes are their Critter VTT notes.' },
    { title: 'That\'s the tour', text: 'Everything goes back to how it was now: the sample campaign used for the tour is removed. You can take the tour again from Settings › Help or the Critter Notes menu.' }
  ];

  function ask() {
    const m = modal('Take the tour', h('div', { class: 'tourask' },
      h('p', { text: 'The tour shows Critter Notes with a sample campaign, opening things and changing them around to show what they can do. When it ends, everything is put back as it was.' }),
      h('div', { class: 'tourpick' },
        h('button', { type: 'button', class: 'tourch', onclick: () => { m.close(); start('basics'); } }, h('b', { text: 'The basics' }), h('span', { text: 'Ten stops, about two minutes: finding your way, writing, links and the table.' })),
        h('button', { type: 'button', class: 'tourch', onclick: () => { m.close(); start('depth'); } }, h('b', { text: 'Everything, in depth' }), h('span', { text: 'About twenty stops: pictures and banners, Make it…, running a session, mind maps, boards, maps, the timeline and more.' })))),
      [btn(null, 'Not now', () => m.close(), 'ghost')]);
    A.prefs.tourAsked = true; savePrefs();
  }

  async function start(kind) {
    if (run) return;
    if (A.ed) A.ed.commit(); await flush();
    const snap = { prefs: JSON.parse(JSON.stringify(A.prefs)), camp: A.camp && A.camp.id, view: JSON.parse(JSON.stringify(A.view)) };
    toast('Setting up the tour…');
    let meta;
    try { meta = await VIEWS.sample({ name: 'Tour (removed when it ends)', tour: true, quiet: true }); }
    catch (e) { toast('The tour couldn\'t start: ' + errText(e)); return; }
    run = { steps: kind === 'depth' ? DEPTH : BASICS, i: 0, snap, camp: meta.id };
    run.box = h('div', { class: 'tourov', role: 'presentation' });
    run.spot = h('div', { class: 'tourspot', 'aria-hidden': 'true' });
    run.card = h('div', { class: 'tourcard', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tourT', 'aria-describedby': 'tourX' });
    run.box.append(run.spot, run.card); document.body.append(run.box);
    document.body.classList.add('touring');
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', place);
    show(0);
  }
  const onKey = e => {
    if (!run) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
    else if (e.key === 'ArrowRight' && !e.target.closest('input,textarea,[contenteditable]')) { e.preventDefault(); next(1); }
    else if (e.key === 'ArrowLeft' && !e.target.closest('input,textarea,[contenteditable]')) { e.preventDefault(); next(-1); }
  };
  let busy = false;
  async function next(dir) {
    if (!run || busy) return;
    const s = run.steps[run.i]; if (s && s.after) { try { s.after(); } catch {} }
    const i = run.i + dir;
    if (i >= run.steps.length) return end();
    if (i < 0) return;
    show(i);
  }
  async function show(i) {
    busy = true; run.i = i;
    const s = run.steps[i];
    run.card.classList.add('moving');
    try { if (s.before) await s.before(); } catch (e) { console.warn('tour step', e); }
    busy = false; if (!run) return;
    const last = i === run.steps.length - 1;
    run.card.replaceChildren(
      h('div', { class: 'tourtop' }, h('span', { class: 'tourn', text: `${i + 1} of ${run.steps.length}` }), h('span', { class: 'grow' }), ib('x', 'End the tour', () => end())),
      h('h3', { id: 'tourT', text: s.title }), h('p', { id: 'tourX', text: s.text }),
      h('div', { class: 'row' }, i ? btn(null, 'Back', () => next(-1), 'ghost') : btn(null, 'End the tour', () => end(), 'ghost'), h('span', { class: 'grow' }), btn(null, last ? 'Finish' : 'Next', () => next(1), 'primary')));
    place();
    run.card.classList.remove('moving');
    const b = run.card.querySelector('.btn.primary'); if (b) b.focus();
  }
  function target() { const s = run && run.steps[run.i]; if (!s || !s.el) return null; const e = typeof s.el === 'function' ? s.el() : document.querySelector(s.el); return e && e.offsetParent !== null ? e : null; }
  function place() {
    if (!run) return;
    const el = target(), c = run.card, pad = 6;
    if (!el) { run.spot.hidden = true; run.box.classList.add('center'); c.style.left = Math.round((innerWidth - c.offsetWidth) / 2) + 'px'; c.style.top = Math.round((innerHeight - c.offsetHeight) / 2) + 'px'; return; }
    run.box.classList.remove('center'); run.spot.hidden = false;
    const r = el.getBoundingClientRect();
    let x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), w = Math.min(innerWidth - x - 4, r.width + pad * 2), hh = Math.min(innerHeight - y - 4, r.height + pad * 2);
    Object.assign(run.spot.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
    const cw = c.offsetWidth, ch = c.offsetHeight, gap = 14;
    // keep clear of a link's hover card too, when one is showing
    const hv = document.getElementById('hov');
    if (hv && !hv.hidden) {
      // the hover card hangs under (or over) the link: the tour card takes the other side, or sits beside the hover card
      const q = hv.getBoundingClientRect(), below = q.top >= r.top;
      let top = below ? r.top - ch - gap : r.bottom + gap, left = r.left;
      if (top < 8 || top + ch > innerHeight - 8) { left = q.right + gap + cw < innerWidth - 8 ? q.right + gap : q.left - gap - cw; top = q.top; }
      c.style.left = Math.round(Math.max(8, Math.min(innerWidth - cw - 8, left))) + 'px';
      c.style.top = Math.round(Math.max(8, Math.min(innerHeight - ch - 8, top))) + 'px';
      return;
    }
    // beside the spot if there's room (right, then left), else under it, else over it, else in the middle of it
    let left, top;
    // a whole view (a board, a map, a page): the card waits in its bottom-right corner, out of the way
    if (w * hh > innerWidth * innerHeight * 0.4) { left = x + w - cw - 24; top = y + hh - ch - 24; }
    else if (x + w + gap + cw < innerWidth - 8) { left = x + w + gap; top = y; }
    else if (x - gap - cw > 8) { left = x - gap - cw; top = y; }
    else if (y + hh + gap + ch < innerHeight - 8) { left = x; top = y + hh + gap; }
    else if (y - gap - ch > 8) { left = x; top = y - gap - ch; }
    else { left = x + (w - cw) / 2; top = y + (hh - ch) / 2; }
    c.style.left = Math.round(Math.max(8, Math.min(innerWidth - cw - 8, left))) + 'px';
    c.style.top = Math.round(Math.max(8, Math.min(innerHeight - ch - 8, top))) + 'px';
  }
  async function end() {
    if (!run) return;
    const r = run; run = null;
    document.removeEventListener('keydown', onKey, true); removeEventListener('resize', place);
    hideHover(); r.box.remove(); document.body.classList.remove('touring');
    // put everything back: settings first, then the tour's campaign goes, then the campaign and page that were open
    A.prefs = Object.assign(r.snap.prefs, { tourAsked: true, toured: true }); savePrefs(); applyLook();
    try { await flush(); } catch {}
    await removeTourCampaign(r.camp);
    if (r.snap.camp && A.camps.some(c => c.id === r.snap.camp)) { await openCampaign(r.snap.camp); if (r.snap.view && r.snap.view.k !== 'none') go(r.snap.view, true); }
    else { A.camp = null; A.docs = new Map(); TABLE.disconnect(); render(); }
    toast('The tour is over. Everything is back as it was.');
  }
  async function removeTourCampaign(id) {
    try { await STORE.removeCampaign(id); } catch (e) { console.warn('removing the tour campaign', e); }
    A.camps = A.camps.filter(c => c.id !== id);
    if (A.camp && A.camp.id === id) { A.camp = null; A.docs = new Map(); }
  }
  // a tour campaign left behind (the app closed during a tour) is removed at the next start
  async function sweep() { for (const c of A.camps.filter(c => c.tour)) await removeTourCampaign(c.id); }
  return { ask, start, end, sweep, get on() { return !!run; } };
})();
