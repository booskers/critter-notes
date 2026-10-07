/* Critter Notes on phones and tablets. The layout itself is CSS (body.phone, body.tablet, body.touch); this file adds
   the parts a small touch screen needs, with the gestures people know from iPhones and iPads:
   - the sidebar slides in over the page (☰ or Documents) and goes again when a document is picked, the dimmed page is
     tapped, or it's swiped to the left
   - a tab bar at the bottom of a phone: Home, Documents, New, Find and To-dos (the notes drawer)
   - press and hold: the menu right-click gives (but in text, the system's own: select, copy, paste)
   - swipe from the left edge: back (in Safari that's the browser's own gesture, see webHistory in app.js; added to Notes
     on the home screen, where there's no browser around it, Notes does it itself)
   - pinch to zoom boards, maps, the timeline, mind maps and the graph (their own wheel zoom does the work)
   - swipe a sheet down to close it: dialogs, the side panel and the notes drawer on a phone
   - swipe a document in the sidebar to the left for Delete and More, as in Mail */
'use strict';
const MOBILE = (() => {
  const phoneQ = matchMedia('(max-width: 700px)'), tabletQ = matchMedia('(max-width: 1100px)'), coarseQ = matchMedia('(pointer: coarse)');
  const standalone = () => !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  const isPhone = () => phoneQ.matches, slideSide = () => tabletQ.matches;   // tablets in portrait slide the sidebar too
  let bar = null;

  function classes() {
    const b = document.body;
    b.classList.toggle('phone', phoneQ.matches);
    b.classList.toggle('tablet', !phoneQ.matches && tabletQ.matches);
    b.classList.toggle('touch', coarseQ.matches);
    b.classList.toggle('standalone', standalone());
    if (!slideSide()) b.classList.remove('sideopen');
    paintBar();
  }

  /* ---------- the sidebar, sliding in ---------- */
  function sideOpen(on) {
    if (!slideSide()) return false;
    const b = document.body; on = on === undefined ? !b.classList.contains('sideopen') : on;
    b.classList.toggle('sideopen', on);
    const t = document.getElementById('sideToggle'); if (t) t.setAttribute('aria-expanded', String(on));
    if (on) { const s = document.getElementById('side'); if (s) { s.hidden = false; setTimeout(() => { const f = s.querySelector('.trow.on, .trow, button'); if (f) f.focus({ preventScroll: true }); }, 260); } }
    paintBar();
    return true;
  }
  // the ☰ in the bar opens it instead of hiding it for good
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('#sideToggle');
    if (t && slideSide()) { e.preventDefault(); e.stopImmediatePropagation(); sideOpen(); return; }
    // picking something in the sidebar, or tapping the dimmed page, closes it
    if (document.body.classList.contains('sideopen')) {
      // a tap on the dimmed page beside it closes it (and does nothing else)
      if (!e.target.closest('#side,#tabbar,.menu,.modal,.dpick,#hov')) { e.preventDefault(); e.stopImmediatePropagation(); sideOpen(false); return; }
      const pick = e.target.closest && e.target.closest('#side .trow, #side .navb, #side [data-doc]');
      if (pick) setTimeout(() => sideOpen(false), 60);
    }
  }, true);

  /* ---------- the tab bar (phones) ---------- */
  function paintBar() {
    const want = isPhone() && !!A.camp;
    if (!want) { if (bar) { bar.remove(); bar = null; } return; }
    if (!bar) {
      bar = h('nav', { id: 'tabbar', 'aria-label': 'Main' });
      document.body.append(bar);
    }
    const on = k => (k === 'home' && A.view.k === 'home' && !document.body.classList.contains('sideopen')) || (k === 'docs' && document.body.classList.contains('sideopen')) || (k === 'todo' && DRAWER.open);
    const b = (k, ic, label, fn) => h('button', { type: 'button', class: 'tabb' + (on(k) ? ' on' : ''), 'aria-current': on(k) ? 'page' : null, onclick: fn }, h('span', { class: 'tbi', html: icon(ic) }), h('span', { class: 'tbl', text: label }));
    const todos = A.camp.drawer ? A.camp.drawer.blocks.filter(x => x.kind === 'todo').reduce((n, x) => n + x.items.filter(i => !i.done && i.t.trim()).length, 0) : 0;
    bar.replaceChildren(
      b('home', 'home', 'Home', () => { sideOpen(false); DRAWER.toggle(false); go({ k: 'home' }); }),
      b('docs', 'list', 'Documents', () => { DRAWER.toggle(false); sideOpen(); }),
      SYNC.isPlayer() ? null : h('button', { type: 'button', class: 'tabb new', 'aria-label': 'New document', onclick: e => { sideOpen(false); newDocMenu(null, e.currentTarget); } }, h('span', { class: 'tbi', html: icon('plus') })),
      b('find', 'search', 'Find', () => { sideOpen(false); quickOpen(); }),
      A.prefs.drawer === false || SYNC.isPlayer() ? null : b('todo', 'tasks', 'To-dos', () => { sideOpen(false); DRAWER.toggle(); paintBar(); }));
    if (todos) { const t = bar.querySelector('.tabb:last-child .tbi'); if (t) t.append(h('span', { class: 'tbc', text: String(todos) })); }
  }

  /* ---------- press and hold: the right-click menu ---------- */
  // followed with touch events (the browser may cancel the pointer once it decides what the press is); a finger that moves
  // more than a few pixels is scrolling, not holding. Where the browser has its own long-press menu event (Android),
  // that event simply reaches the same menu.
  let hold = null, heldAt = 0;
  // text being written keeps the system's own press-and-hold (select, copy, paste); a link or a card inside the text doesn't
  const textual = el => !el.closest('.wl,.tl,[data-doc],[contenteditable="false"]') && el.closest('input,textarea,select,[contenteditable="true"]');
  document.addEventListener('touchstart', e => {
    if (hold) { clearTimeout(hold.t); hold = null; }
    if (e.touches.length !== 1 || textual(e.target)) return;
    const t0 = e.touches[0];
    hold = { x: t0.clientX, y: t0.clientY, target: e.target, t: setTimeout(() => {
      if (!hold) return;
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: hold.x, clientY: hold.y, button: 2 });
      ev.fromHold = true; hold.target.dispatchEvent(ev); heldAt = Date.now(); hold = null;
      if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
    }, 520) };
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', e => { if (hold && e.touches[0] && Math.hypot(e.touches[0].clientX - hold.x, e.touches[0].clientY - hold.y) > 9) { clearTimeout(hold.t); hold = null; } }, { passive: true, capture: true });
  document.addEventListener('touchend', () => { if (hold) { clearTimeout(hold.t); hold = null; } }, { passive: true, capture: true });
  document.addEventListener('touchcancel', () => { if (hold) { clearTimeout(hold.t); hold = null; } }, { passive: true, capture: true });
  // the click a long-press ends with isn't a tap
  document.addEventListener('click', e => { if (Date.now() - heldAt < 700) { heldAt = 0; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // the browser's own long-press menu event (not in text): ours answers it, so the timer above stands down
  document.addEventListener('contextmenu', e => { if (!e.fromHold && hold) { clearTimeout(hold.t); hold = null; heldAt = Date.now(); } }, true);

  /* ---------- touches: pinch, edge swipe, sheets, sidebar rows ---------- */
  const PINCH = '.boardhost,.maphost,.tlarea,.graphhost,.mindhost,.drcanvas';
  let touch = null;
  document.addEventListener('touchstart', e => {
    const t0 = e.touches[0];
    if (e.touches.length === 2) {
      const host = e.target.closest && e.target.closest(PINCH);
      if (host) { const [a, b] = e.touches; touch = { kind: 'pinch', host, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) }; endPointerDrags(host); }
      return;
    }
    if (e.touches.length !== 1) return;
    const x = t0.clientX, y = t0.clientY, el = e.target;
    // a sheet's handle or top: swipe it down
    const sheet = el.closest && el.closest('.phone .modal .card, .phone #right, .phone .drpanel');
    if (sheet && (el.closest('.sheethandle,.chead,.rtabs,.drhead,.drgrip') || sheet.scrollTop <= 0 && el.closest('.chead'))) { touch = { kind: 'sheet', sheet, y0: y, x0: x, dy: 0 }; return; }
    // the open sidebar: swipe it left
    if (document.body.classList.contains('sideopen') && el.closest && el.closest('#side')) {
      const row = el.closest('#side .trow');
      touch = { kind: 'side', x0: x, y0: y, dx: 0, row }; return;
    }
    // a document in the sidebar (when it's not sliding): swipe left for actions
    const row = el.closest && el.closest('#side .trow');
    if (row) { touch = { kind: 'row', row, x0: x, y0: y, dx: 0 }; return; }
    // the left edge, on the home screen: back
    if (standalone() && x < 22 && A.back.length) { touch = { kind: 'edge', x0: x, y0: y, dx: 0 }; return; }
    touch = null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!touch) return;
    if (touch.kind === 'pinch') {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = e.touches, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
      if (!touch.d || !d) { touch.d = d; return; }
      const ratio = d / touch.d; touch.d = d;
      if (Math.abs(ratio - 1) < 0.002) return;
      // the views zoom by about exp(-deltaY × 0.0016) a wheel step: ask for this pinch's ratio
      const target = document.elementFromPoint(mx, my) || touch.host;
      target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: mx, clientY: my, deltaY: -Math.log(ratio) / 0.0016, deltaMode: 0, ctrlKey: true }));
      return;
    }
    const t = e.touches[0], dx = t.clientX - touch.x0, dy = t.clientY - (touch.y0 || 0);
    if (touch.kind === 'sheet') {
      touch.dy = Math.max(0, t.clientY - touch.y0);
      if (touch.dy > 6) { e.preventDefault(); touch.sheet.style.transition = 'none'; touch.sheet.style.transform = `translateY(${touch.dy}px)`; }
    } else if (touch.kind === 'side') {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(touch.dx) < 10) { touch = null; return; }
      touch.dx = Math.min(0, dx);
      const s = document.getElementById('side'); if (s && touch.dx < -6) { s.style.transition = 'none'; s.style.transform = `translateX(${touch.dx}px)`; }
    } else if (touch.kind === 'row') {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(touch.dx) < 10) { touch = null; return; }
      touch.dx = Math.max(-150, Math.min(0, dx));
      if (touch.dx < -8) { e.preventDefault(); touch.row.style.transition = 'none'; touch.row.style.transform = `translateX(${touch.dx}px)`; }
    } else if (touch.kind === 'edge') {
      touch.dx = Math.max(0, dx); edgeHint(touch.dx, t.clientY);
    }
  }, { passive: false });
  document.addEventListener('touchend', e => {
    if (!touch) return;
    const k = touch; if (k.kind === 'pinch' && e.touches.length) return;
    touch = null;
    if (k.kind === 'sheet') {
      k.sheet.style.transition = ''; k.sheet.style.transform = '';
      if (k.dy > 110) closeSheet(k.sheet);
    } else if (k.kind === 'side') {
      const s = document.getElementById('side'); if (s) { s.style.transition = ''; s.style.transform = ''; }
      if (k.dx < -70) sideOpen(false);
      else if (k.row && Math.abs(k.dx) < 8) { /* a tap: the click handles it */ }
    } else if (k.kind === 'row') {
      k.row.style.transition = '';
      if (k.dx < -60) revealRow(k.row); else { k.row.style.transform = ''; }
    } else if (k.kind === 'edge') {
      edgeHint(0); if (k.dx > 90) goBack();
    }
  });
  // two fingers start a pinch: the drag the first finger began ends there
  function endPointerDrags(host) {
    try { host.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true })); } catch {}
  }
  function closeSheet(sheet) {
    if (sheet.id === 'right') { A.prefs.right = false; savePrefs(); renderRight(); return; }
    if (sheet.classList.contains('drpanel')) { DRAWER.toggle(false); paintBar(); return; }
    const x = sheet.querySelector('.chead .ib'); if (x) x.click();   // a dialog: its own close button
  }
  // the arrow that follows the finger from the left edge
  let arrow = null;
  function edgeHint(dx, y) {
    if (!dx) { if (arrow) { arrow.remove(); arrow = null; } return; }
    if (!arrow) { arrow = h('div', { class: 'edgeback', 'aria-hidden': 'true', html: icon('back') }); document.body.append(arrow); }
    arrow.style.transform = `translate(${Math.min(dx, 110) - 44}px, ${y - 22}px)`; arrow.classList.toggle('ready', dx > 90);
  }
  // a document swiped left in the sidebar: Delete and More, like Mail
  function revealRow(row) {
    document.querySelectorAll('.rowacts').forEach(x => x.remove());
    document.querySelectorAll('#side .trow').forEach(r => { if (r !== row) r.style.transform = ''; });
    const id = row.dataset.id || (row.querySelector('[data-doc]') || {}).dataset?.doc || row.getAttribute('data-doc'); const d = id && D(id);
    if (!d || isRO(d) || SYNC.isPlayer()) { row.style.transform = ''; return; }
    row.style.transform = 'translateX(-140px)';
    const acts = h('div', { class: 'rowacts' },
      h('button', { type: 'button', class: 'more', onclick: e => { row.style.transform = ''; acts.remove(); const r = row.getBoundingClientRect(); docMenu(d, r.right - 150, r.bottom); } }, 'More'),
      h('button', { type: 'button', class: 'del', onclick: () => { acts.remove(); row.style.transform = ''; deleteDoc(d.id); } }, 'Delete'));
    row.parentElement.insertBefore(acts, row.nextSibling);
    const r = row.getBoundingClientRect(), pr = row.parentElement.getBoundingClientRect();
    acts.style.top = (r.top - pr.top + row.parentElement.scrollTop) + 'px'; acts.style.height = r.height + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function away(ev) { if (!ev.target.closest('.rowacts')) { acts.remove(); row.style.transform = ''; document.removeEventListener('pointerdown', away, true); } }, true), 0);
  }

  /* ---------- whenever a page is drawn ---------- */
  function onRender() {
    classes();
    // a phone shows one thing at a time: a new page closes the side panel's sheet
    if (isPhone() && A.prefs.right && !onRender.keepRight) { A.prefs.right = false; renderRight(); }
    onRender.keepRight = false;
  }
  for (const q of [phoneQ, tabletQ, coarseQ]) q.addEventListener('change', () => { classes(); if (typeof render === 'function' && A.camp) render(); });
  addEventListener('DOMContentLoaded', classes);
  return { onRender, sideOpen, paintBar, classes, isPhone };
})();
