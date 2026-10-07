/* Critter Notes: the planning tools around the documents.
   - the world's own calendar, dates in it, and the timeline
   - progress clocks (on factions and quests, and the campaign's own)
   - relationships between documents, and their web
   - threads: open quests, clocks, and every clue across the sessions (planned where, found when)
   - the encounter builder (D&D 5e, Pathfinder 2e and Daggerheart budgets), random tables
   - a shared world: another campaign whose documents this one can link to and read
   - live handouts that stay up to date at the table, and importing Markdown */
const PLAN = (() => {
  /* ============================== the calendar ============================== */
  function cal() {
    const c = (A.camp && A.camp.cal) || {};
    const months = Array.isArray(c.months) && c.months.length ? c.months : Array.from({ length: 12 }, (_, i) => 'Month ' + (i + 1));
    return { months, days: months.map((_, i) => Math.max(1, +(c.days || [])[i] || +c.dpm || 30)), era: c.era || '', now: c.now && Number.isFinite(+c.now.y) ? c.now : null };
  }
  const has = w => !!w && w.y !== '' && w.y !== undefined && Number.isFinite(+w.y);
  const wkey = w => (has(w) ? +w.y * 10000 + (+w.m || 1) * 100 + (+w.d || 1) : null);
  function wfmt(w, short) {
    if (!has(w)) return ''; const c = cal(), m = +w.m ? c.months[w.m - 1] || 'Month ' + w.m : '';
    return [+w.d ? w.d : '', m, w.y + (c.era && !short ? ' ' + c.era : '')].filter(x => x !== '').join(' ');
  }
  function addDays(w, n) {
    const c = cal(); let y = +w.y || 1, m = +w.m || 1, d = (+w.d || 1) + n;
    while (d > c.days[m - 1]) { d -= c.days[m - 1]; m++; if (m > c.months.length) { m = 1; y++; } }
    while (d < 1) { m--; if (m < 1) { m = c.months.length; y--; } d += c.days[m - 1]; }
    return { y, m, d };
  }
  // a date in the world: year, month and day, each labelled for screen readers
  function wdateInput(v, set, label) {
    v = v || {}; const c = cal();
    const day = h('input', { type: 'number', class: 'wd', min: 1, max: 99, value: v.d || '', placeholder: 'Day', 'aria-label': label + ': day' });
    const mon = h('select', { class: 'wm', 'aria-label': label + ': month' }, h('option', { value: '', text: 'Month' }), ...c.months.map((m, i) => h('option', { value: i + 1, text: m, selected: +v.m === i + 1 })));
    const yr = h('input', { type: 'number', class: 'wy', value: v.y ?? '', placeholder: 'Year', 'aria-label': label + ': year' });
    const now = c.now ? h('button', { type: 'button', class: 'ib tiny', title: 'The world\'s today', 'aria-label': 'Set to the world\'s today', html: icon('clock'), onclick: () => { yr.value = c.now.y; mon.value = c.now.m || ''; day.value = c.now.d || ''; fire(); } }) : null;
    const fire = () => set(yr.value === '' ? null : { y: +yr.value, m: +mon.value || 0, d: +day.value || 0 });
    [day, mon, yr].forEach(x => x.addEventListener('change', fire));
    return h('span', { class: 'wdate' }, day, mon, yr, now);
  }
  function calendarDialog() {
    const c = cal(), raw = (A.camp.cal || {});
    const months = h('textarea', { rows: 6, value: c.months.map((m, i) => `${m}, ${c.days[i]}`).join('\n'), 'aria-describedby': 'calHint' });
    const era = h('input', { type: 'text', value: raw.era || '', placeholder: 'e.g. DR, AE, After the Fall' });
    const now = wdateInput(c.now, v => { nowV = v; }, 'Today in the world'); let nowV = c.now;
    const m = modal('The world\'s calendar', h('div', { class: 'form' },
      h('label', {}, 'Months, one a line, with their days', months), h('p', { class: 'hint', id: 'calHint', text: 'Like "Hammer, 30". A month without a number of days has 30.' }),
      h('label', {}, 'Era (shown after the year)', era), h('div', { class: 'lbl' }, h('span', { text: 'Today in the world' }), now)),
      [btn(null, 'Cancel', () => m.close(), 'ghost'), btn('check', 'Save', async () => {
        const rows = months.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const x = /^(.*?)(?:[,;:\s]+(\d+))?$/.exec(l); return [x[1].trim() || 'Month', +x[2] || 30]; });
        A.camp.cal = { months: rows.map(r => r[0]), days: rows.map(r => r[1]), era: era.value.trim(), now: nowV };
        await saveCamp(); m.close(); renderMain();
      }, 'primary')]);
  }

  /* ============================== clocks ============================== */
  // a progress clock: click a slice to fill up to it (click the last filled one to empty it); arrow keys work too
  function clockEl(v, set, label, big) {
    v = { size: 6, filled: 0, ...(v || {}) };
    const s = big ? 64 : 34, r = s / 2 - 2, n = Math.max(2, Math.min(12, +v.size || 6));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${s} ${s}`); svg.setAttribute('width', s); svg.setAttribute('height', s); svg.classList.add('clk');
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2, c = s / 2;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${c},${c} L${c + r * Math.cos(a0)},${c + r * Math.sin(a0)} A${r},${r} 0 0 1 ${c + r * Math.cos(a1)},${c + r * Math.sin(a1)} Z`);
      if (i < v.filled) p.classList.add('on');
      p.addEventListener('click', e => { e.stopPropagation(); put(v.filled === i + 1 ? i : i + 1); });
      svg.append(p);
    }
    const wrap = h('span', { class: 'clock' + (big ? ' big' : ''), role: 'slider', tabIndex: 0, 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': n, 'aria-valuenow': v.filled, 'aria-valuetext': `${v.filled} of ${n}` });
    const put = f => { v.filled = Math.max(0, Math.min(n, f)); set({ ...v }); };
    wrap.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); put(v.filled + 1); } if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); put(v.filled - 1); } });
    const size = h('select', { class: 'csz', 'aria-label': label + ': slices', onchange: e => set({ ...v, size: +e.target.value, filled: Math.min(v.filled, +e.target.value) }) }, ...[4, 6, 8, 10, 12].map(k => h('option', { value: k, text: k + ' slices', selected: k === n })));
    wrap.append(svg, h('span', { class: 'cnum', text: `${v.filled}/${n}` }));
    return h('span', { class: 'clockw' }, wrap, size);
  }
  const clockText = (name, v) => { const n = +v.size || 6, f = +v.filled || 0; return `**${name}** ${'●'.repeat(f)}${'○'.repeat(Math.max(0, n - f))} ${f}/${n}`; };
  // every clock in the campaign: the campaign's own, and those on documents
  function allClocks() {
    const out = (A.camp.clocks || []).map(c => ({ ...c, own: true }));
    for (const d of A.docs.values()) for (const [k, l, kind] of FIELDS[d.type] || []) if (kind === 'clock' && d.fields && d.fields[k] && (+d.fields[k].filled || d.fields[k].size)) out.push({ id: d.id + ':' + k, name: d.title, sub: l, doc: d.id, key: k, ...d.fields[k] });
    return out;
  }

  /* ============================== relationships ============================== */
  const REL_WORDS = ['ally of', 'rival of', 'enemy of', 'friend of', 'parent of', 'child of', 'sibling of', 'married to', 'in love with', 'fears', 'owes', 'serves', 'employs', 'member of', 'leads', 'lives in', 'hunts', 'secretly works for', 'betrayed', 'protects'];
  function relsBox(d, ro) {
    d.rels = Array.isArray(d.rels) ? d.rels : [];
    const list = h('div', { class: 'rels' });
    const draw = () => {
      list.replaceChildren(...d.rels.map((r, i) => { const t = D(r.to); return h('span', { class: 'relc', style: t ? `--c:${typeColor(t)}` : '' }, h('i', { text: r.label || 'tied to' }), t ? h('button', { type: 'button', class: 'rell', text: t.title, onclick: () => openDoc(t.id) }) : h('s', { text: 'gone' }), ro ? null : ib('x', `Remove: ${r.label} ${t ? t.title : ''}`, () => { d.rels.splice(i, 1); touch(d); draw(); }, 'tiny')); }));
      // and what points here from elsewhere
      const inc = [...A.docs.values()].filter(x => x.id !== d.id && (x.rels || []).some(r => r.to === d.id));
      for (const x of inc) for (const r of x.rels.filter(r => r.to === d.id)) list.append(h('span', { class: 'relc in', style: `--c:${typeColor(x)}` }, h('button', { type: 'button', class: 'rell', text: x.title, onclick: () => openDoc(x.id) }), h('i', { text: r.label || 'tied to' })));
      if (!list.children.length) list.append(h('span', { class: 'hint', text: ro ? 'None.' : 'None yet.' }));
    };
    draw();
    if (ro) return h('div', { class: 'relbox' }, list);
    const lbl = h('input', { type: 'text', placeholder: 'ally of', list: 'relWords', 'aria-label': 'How they are tied' });
    const who = h('input', { type: 'text', placeholder: 'Who or what', list: 'titlesList', 'aria-label': 'Tied to which document', onfocus: fillTitles });
    const add = () => { const t = resolve(who.value); if (!t) { toast(who.value.trim() ? `There's no document called "${who.value.trim()}". Make it first, or pick one from the list.` : 'Pick a document.'); who.focus(); return; } if (t === d.id) return; d.rels.push({ to: t, label: lbl.value.trim() || 'tied to' }); touch(d); lbl.value = who.value = ''; draw(); lbl.focus(); };
    who.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    if (!$('#relWords')) document.body.append(h('datalist', { id: 'relWords' }, ...REL_WORDS.map(w => h('option', { value: w }))));
    return h('div', { class: 'relbox' }, list, h('div', { class: 'reladd' }, lbl, who, btn('plus', 'Add', add, 'tiny')));
  }

  /* ============================== pages ============================== */
  function pageHead(title, sub, ...tools) { return h('div', { class: 'phead' }, h('div', {}, h('h1', { text: title }), sub ? h('p', { class: 'hint', text: sub }) : null), h('span', { class: 'grow' }), ...tools); }
  // dates as a count of days, so the timeline can measure them
  const DPY = () => cal().days.reduce((a, b) => a + b, 0);
  function dayOf(w) { const c = cal(), m = Math.max(1, Math.min(c.months.length, +w.m || 1)); return (+w.y || 0) * DPY() + c.days.slice(0, m - 1).reduce((a, b) => a + b, 0) + Math.max(1, +w.d || 1) - 1; }
  function fromDay(n) { const c = cal(), dpy = DPY(), y = Math.floor(n / dpy); let r = n - y * dpy, m = 0; while (m < c.days.length - 1 && r >= c.days[m]) { r -= c.days[m]; m++; } return { y, m: m + 1, d: Math.floor(r) + 1 }; }
  function addMonths(w, n) { const c = cal(), L = c.months.length; let m = (+w.m || 1) - 1 + n, y = +w.y || 0; y += Math.floor(m / L); m = ((m % L) + L) % L; return { y, m: m + 1, d: Math.min(+w.d || 1, c.days[m]) }; }
  const step = (w, unit, n) => (unit === 0 ? addDays(w, n) : unit === 1 ? addDays(w, 7 * n) : unit === 2 ? addMonths(w, n) : addMonths(w, 12 * n));
  const UNITS = ['days', 'weeks', 'months', 'years'];

  /* ---------- today in the world, as a flip clock ---------- */
  // drag it right or left to move time; while dragging, the wheel changes the speed (days, weeks, months, years)
  function flipClock(now, set, moving) {
    const c = cal(); let shown = now ? { ...now } : null;
    const card = (cls, label) => h('div', { class: 'flip ' + cls }, h('span', { class: 'fv' }), h('small', { text: label }));
    const D1 = card('fd', 'day'), M1 = card('fm', 'month'), Y1 = card('fy', 'year');
    const hint = h('div', { class: 'fliphint', 'aria-hidden': 'true' });
    const box = h('div', { class: 'flipclock', role: 'slider', tabIndex: 0, 'aria-label': 'Today in the world. Drag, or use the arrow keys (Page Up and Down for months, Shift for years)' }, D1, M1, Y1, hint);
    const paint = () => {
      if (!shown) { D1.firstChild.textContent = '–'; M1.firstChild.textContent = 'Not set'; Y1.firstChild.textContent = '–'; return; }
      const v = [String(shown.d).padStart(2, '0'), c.months[shown.m - 1] || 'Month ' + shown.m, shown.y + (c.era ? ' ' + c.era : '')];
      [D1, M1, Y1].forEach((x, i) => { const f = x.firstChild; if (f.textContent !== v[i]) { f.textContent = v[i]; x.classList.remove('turn'); void x.offsetWidth; x.classList.add('turn'); } });
      box.setAttribute('aria-valuetext', wfmt(shown));
    };
    paint();
    let drag = null;
    box.addEventListener('pointerdown', e => {
      if (e.button !== 0) return; if (!shown) shown = { y: 1, m: 1, d: 1 };
      e.preventDefault(); box.setPointerCapture(e.pointerId); box.classList.add('dragging');
      drag = { x0: e.clientX, base: { ...shown }, unit: 0 }; hint.textContent = 'by ' + UNITS[0] + ' · the wheel changes the speed';
    });
    box.addEventListener('pointermove', e => { if (!drag) return; const n = Math.trunc((e.clientX - drag.x0) / 14); shown = step(drag.base, drag.unit, n); paint(); if (moving) moving(shown, drag.unit); });
    const end = () => { if (!drag) return; drag = null; box.classList.remove('dragging'); hint.textContent = ''; set(shown); };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    box.addEventListener('wheel', e => {
      e.preventDefault();
      if (!drag) { shown = step(shown || { y: 1, m: 1, d: 1 }, 0, e.deltaY < 0 ? 1 : -1); paint(); if (moving) moving(shown); clearTimeout(box.wt); box.wt = setTimeout(() => set(shown), 500); return; }
      // a faster or slower step from here on; what's already moved stays
      drag.unit = Math.max(0, Math.min(3, drag.unit + (e.deltaY < 0 ? 1 : -1))); drag.base = { ...shown }; drag.x0 = e.clientX ?? drag.x0;
      hint.textContent = 'by ' + UNITS[drag.unit] + ' · the wheel changes the speed';
    }, { passive: false });
    box.addEventListener('keydown', e => {
      const k = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [0, 1], ArrowDown: [0, -1], PageUp: [2, 1], PageDown: [2, -1] }[e.key]; if (!k) return;
      e.preventDefault(); shown = step(shown || { y: 1, m: 1, d: 1 }, e.shiftKey ? 3 : k[0], k[1]); paint(); if (moving) moving(shown); clearTimeout(box.wt); box.wt = setTimeout(() => set(shown), 400);
    });
    return box;
  }

  /* ---------- the timeline, left to right ---------- */
  const tlView = new Map();
  function timeline(main) {
    main.className = 'pagemain tlmain';
    const c = cal();
    const setNow = async w => { A.camp.cal = { ...(A.camp.cal || {}), now: w }; liveNow = null; await saveCamp(); paint(); };
    const head = pageHead('Timeline', 'Drag to move along it, scroll to zoom, right-click to add an event on that day.',
      btn('edit', 'Calendar', calendarDialog, 'ghost'), btn('plus', 'New event', () => { const e = newDoc({ type: 'event', fields: c.now ? { when: { ...c.now } } : {} }); openDoc(e.id); }, 'primary'));
    // while the clock turns, today's line travels with it (and the view follows it, so it never leaves the screen)
    // and the timeline zooms in to the clock's pace (days, weeks, months, years) if it's too far out to see the line move
    const nowMoving = (w, unit = 0) => {
      const n = dayOf(w), W = area.clientWidth, span = [120, 2 * 365, 8 * 365, 150 * 365][unit] * DPY() / 365, ppd = W / span;
      if (V.ppd < ppd * 0.5) V = { ppd, left: n - W / 2 / ppd };
      const px = x(n); if (px < 60 || px > W - 60) V = { ...V, left: n - W / 2 / V.ppd };
      liveNow = w; paint();
    };
    let liveNow = null;
    const nowRow = h('div', { class: 'nowrow' }, h('span', { class: 'nowl', text: 'Today in the world' }), flipClock(c.now, setNow, nowMoving));
    const area = h('div', { class: 'tlarea', role: 'region', 'aria-label': 'Timeline. Arrow keys move along it, plus and minus zoom.', tabIndex: 0 });
    const axis = h('div', { class: 'tlaxis' }), ticks = h('div', { class: 'tlticks' }), items = h('div', { class: 'tlitems' }), nowLine = h('div', { class: 'tlnow' });
    area.append(axis, ticks, nowLine, items);
    main.append(h('div', { class: 'tltop' }, head, nowRow), area);
    const list = [];
    for (const d of [...A.docs.values(), ...(SYNC.isPlayer() ? A.wdocs.values() : [])]) for (const [k, , kind] of FIELDS[d.type] || []) if (kind === 'wdate' && has(d.fields && d.fields[k])) list.push({ d, k, w: d.fields[k], n: dayOf(d.fields[k]) });
    list.sort((a, b) => a.n - b.n);
    // the view: px per day, and which day sits at the left edge
    let V = tlView.get(cid());
    const fit = () => {
      const W = area.clientWidth || 900, ns = list.map(x => x.n).concat(c.now ? [dayOf(c.now)] : []);
      if (!ns.length) { V = { ppd: 600 / DPY(), left: dayOf(c.now || { y: 1, m: 1, d: 1 }) - DPY() / 2 }; return; }
      const lo = Math.min(...ns), hi = Math.max(...ns), span = Math.max(30, hi - lo);
      const ppd = (W - 380) / span; V = { ppd, left: lo - 90 / ppd };
    };
    if (!V) fit();
    const x = n => (n - V.left) * V.ppd;
    function paint() {
      tlView.set(cid(), V);
      const W = area.clientWidth, dpy = DPY(), ypx = dpy * V.ppd;
      // ticks: months when there's room, else years in steps of 1, 2, 5, 10…
      ticks.replaceChildren();
      const leftDay = V.left, rightDay = V.left + W / V.ppd;
      if (ypx > c.months.length * 70) {
        let w = fromDay(Math.floor(leftDay)); w = { y: w.y, m: w.m, d: 1 };
        for (let i = 0; i < 400; i++) { const n = dayOf(w); if (n > rightDay) break; ticks.append(h('div', { class: 'tick' + (w.m === 1 ? ' major' : ''), style: `left:${x(n)}px` }, h('span', { text: w.m === 1 ? `${c.months[0]} ${w.y}` : c.months[w.m - 1] }))); w = addMonths(w, 1); }
      } else {
        const stepY = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find(s => s * ypx >= 90) || 10000;
        for (let y = Math.floor(leftDay / dpy / stepY) * stepY; y * dpy <= rightDay; y += stepY) ticks.append(h('div', { class: 'tick major', style: `left:${x(y * dpy)}px` }, h('span', { text: y + (c.era ? ' ' + c.era : '') })));
      }
      // today
      const now = liveNow || cal().now;
      if (now) { nowLine.hidden = false; nowLine.style.left = x(dayOf(now)) + 'px'; nowLine.dataset.label = 'Today · ' + wfmt(now, true); } else nowLine.hidden = true;
      // the events, in lanes above and below the line so they don't cover each other
      items.replaceChildren(); const lanes = [];
      for (const it of list) {
        const px = x(it.n); if (px < -260 || px > W + 40) continue;
        let lane = lanes.findIndex(end => end < px - 8); if (lane < 0) { lane = lanes.length; lanes.push(0); } lanes[lane] = px + 210;
        const up = lane % 2 === 0, depth = Math.floor(lane / 2), fut = now && it.n > dayOf(now);
        const txt = MD.plain(it.d.body).replace(/\s+/g, ' ').trim();
        const ro = isRO(it.d);
        const card = h('button', { type: 'button', class: 'tlcard' + (up ? ' up' : ' down') + (fut ? ' future' : ''), style: `left:${px}px;--lane:${depth};--c:${typeColor(it.d)}`, onclick: () => { if (!card.moved) openDoc(it.d.id); }, title: it.d.title },
          ro ? null : h('span', { class: 'tlh l', title: 'Drag to move it to another day', 'aria-hidden': 'true', onpointerdown: e => moveEvent(e, it, card) }),
          ro ? null : h('span', { class: 'tlh r', title: 'Drag to move it to another day', 'aria-hidden': 'true', onpointerdown: e => moveEvent(e, it, card) }),
          h('span', { class: 'tdate', text: wfmt(it.w, true) + (fut ? ' · to come' : '') }), h('span', { class: 'tlt' }, h('span', { class: 'tic', html: icon(TYPES[it.d.type].icon) }), h('b', { text: it.d.title })), txt ? h('small', { text: txt.slice(0, 80) + (txt.length > 80 ? '…' : '') }) : null);
        items.append(h('div', { class: 'tlstem' + (up ? ' up' : ' down'), style: `left:${px}px;--lane:${depth};--c:${typeColor(it.d)}` }), card);
      }
      if (!list.length) items.append(h('p', { class: 'tlempty hint', text: 'Nothing has a date in the world yet. Right-click the line to add an event, or give a session its date "in the world".' }));
    }
    // an event grabbed by its edge moves along the line to another day; a small box above it shows the old date and the new one
    function moveEvent(e, it, card) {
      if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
      const sx = e.clientX, n0 = it.n, w0 = { ...it.w }, stem = card.previousElementSibling, tip = h('div', { class: 'tlmove', role: 'status' });
      card.classList.add('moving'); card.setPointerCapture(e.pointerId); area.append(tip);
      let n = n0;
      const show = () => { const px = x(n); card.style.left = px + 'px'; if (stem) stem.style.left = px + 'px'; const r = card.getBoundingClientRect(), ar = area.getBoundingClientRect();
        tip.replaceChildren(h('span', { class: 'was', text: wfmt(w0, true) }), h('span', { text: ' → ' }), h('b', { text: wfmt(fromDay(n), true) }));
        tip.style.left = (r.left - ar.left + r.width / 2) + 'px'; tip.style.top = (r.top - ar.top - 8) + 'px'; };
      show();
      const mv = m => { const d = Math.round((m.clientX - sx) / V.ppd); if (d) card.moved = true; n = n0 + d; show(); };
      const up = () => {
        card.removeEventListener('pointermove', mv); card.removeEventListener('pointerup', up); card.removeEventListener('pointercancel', up); tip.remove(); card.classList.remove('moving');
        setTimeout(() => { card.moved = false; }, 0);
        if (n === n0) { paint(); return; }
        const w = fromDay(n); it.d.fields = { ...(it.d.fields || {}), [it.k]: w }; it.w = w; it.n = n; touch(it.d, true); list.sort((a, b) => a.n - b.n); paint();
        toast(`"${it.d.title}" moved to ${wfmt(w)}.`);
      };
      card.addEventListener('pointermove', mv); card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
    }
    // dragging the empty timeline moves along it; only sideways (and never selects the text on the page)
    area.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.tlcard')) return;
      e.preventDefault(); window.getSelection().removeAllRanges();
      const sx = e.clientX, l0 = V.left; area.setPointerCapture(e.pointerId); area.classList.add('grab');
      const mv = m => { V = { ...V, left: l0 - (m.clientX - sx) / V.ppd }; paint(); };
      const up = () => { area.removeEventListener('pointermove', mv); area.removeEventListener('pointerup', up); area.classList.remove('grab'); };
      area.addEventListener('pointermove', mv); area.addEventListener('pointerup', up);
    });
    const zoomAt = (f, cx) => { const day = V.left + cx / V.ppd, ppd = Math.max(0.00002, Math.min(60, V.ppd * f)); V = { ppd, left: day - cx / ppd }; paint(); };
    area.addEventListener('wheel', e => { e.preventDefault(); const r = area.getBoundingClientRect(); if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { V = { ...V, left: V.left + (e.deltaX || e.deltaY) / V.ppd }; paint(); } else zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left); }, { passive: false });
    area.addEventListener('keydown', e => { if (e.target !== area) return; const W = area.clientWidth; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); V = { ...V, left: V.left + (e.key === 'ArrowRight' ? 1 : -1) * W * 0.2 / V.ppd }; paint(); } if (e.key === '+' || e.key === '=') zoomAt(1.3, W / 2); if (e.key === '-') zoomAt(1 / 1.3, W / 2); });
    // right-click: an event on that day
    area.addEventListener('contextmenu', async e => {
      if (e.target.closest('.tlcard')) return; e.preventDefault();
      const r = area.getBoundingClientRect(), w = fromDay(Math.round(V.left + (e.clientX - r.left) / V.ppd));
      const t = await ask('What happens on ' + wfmt(w) + '?', '', { placeholder: 'The siege of Gallowmere', ok: 'Add the event' }); if (!t) return;
      const ev = newDoc({ type: 'event', title: t, fields: { when: w } }); renderSide();
      list.push({ d: ev, w, n: dayOf(w) }); list.sort((a, b) => a.n - b.n); paint(); toast(`"${ev.title}" is on the timeline.`, { label: 'Open it', fn: () => openDoc(ev.id) });
    });
    const ro = new ResizeObserver(() => paint()); ro.observe(area);
    queueMicrotask(() => { if (!tlView.has(cid())) fit(); paint(); });
  }
  // the web of relationships
  function relsPage(main) {
    main.className = 'graphmain';
    const nodes = new Map(), edges = [];
    for (const d of A.docs.values()) for (const r of d.rels || []) { const t = D(r.to); if (!t || !A.docs.has(t.id)) continue; nodes.set(d.id, d); nodes.set(t.id, t); edges.push([d.id, t.id, r.label]); }
    const bar = h('div', { class: 'graphbar' }, h('h1', { class: 'gtitle', text: 'Relationships' }), h('span', { class: 'hint', text: 'Who is tied to whom. Add ties in a document\'s details.' }), h('span', { class: 'grow' }));
    const host = h('div', { class: 'graphbox', role: 'img', 'aria-label': `A web of ${plural(nodes.size, 'document')} and ${plural(edges.length, 'relationship')}. The same ties are listed under the picture.` });
    main.append(bar, host);
    if (!edges.length) { host.removeAttribute('role'); host.append(h('div', { class: 'emptybox' }, h('span', { html: icon('rels') }), h('p', { text: 'No relationships yet. Open a character, faction or place, and add ties under Details › Relationships: "ally of", "owes", "secretly works for"…' }))); return; }
    const list = h('details', { class: 'rellist' }, h('summary', { text: `All ${plural(edges.length, 'tie')} as a list` }), h('ul', {}, ...edges.map(([a, b, l]) => h('li', {}, h('a', { href: '#', text: D(a).title, onclick: e => { e.preventDefault(); openDoc(a); } }), ` ${l} `, h('a', { href: '#', text: D(b).title, onclick: e => { e.preventDefault(); openDoc(b); } })))));
    main.append(list);
    queueMicrotask(() => GRAPH.render(host, [...nodes.values()].map(d => ({ id: d.id, title: d.title, type: d.type, color: typeColor(d) })), edges, { onOpen: id => openDoc(id), directed: true, len: 200 }));
  }
  // clues across the sessions: in which session each was planned, and in which it was found
  function clues() {
    const out = new Map(), sessions = sortedOf('session');
    for (const s of sessions) {
      let on = false;
      for (const l of String(s.body || '').split('\n')) {
        const hm = /^(#{1,6})\s+(.*)$/.exec(l); if (hm) { on = /secret|clue/i.test(hm[2]); continue; }
        const m = on && /^\s*[-*+]\s+\[([ xX])\]\s+(.*\S)/.exec(l); if (!m) continue;
        const text = MD.plainInline(m[2]), k = text.toLowerCase().replace(/\W+/g, ' ').trim(); if (!k || /^a secret the party might learn|^another one$/.test(k)) continue;
        const c = out.get(k) || { text, planned: s, found: null, seen: [] };
        c.seen.push(s); if (m[1] !== ' ' && !c.found) c.found = s;
        out.set(k, c);
      }
    }
    return [...out.values()];
  }
  function threads(main) {
    main.className = 'pagemain';
    const wrap = h('div', { class: 'pagein' });
    wrap.append(pageHead('Threads', 'What the party is chasing, what is ticking, and what they haven\'t found out yet.'));
    // clocks
    const clocks = allClocks(), cbox = h('div', { class: 'clocks' });
    for (const c of clocks) {
      const set = v => { if (c.own) { const x = A.camp.clocks.find(y => y.id === c.id); Object.assign(x, v); saveCamp(); } else { const d = D(c.doc); d.fields[c.key] = { size: v.size, filled: v.filled }; touch(d, true); } renderMain(); };
      cbox.append(h('div', { class: 'ccard' }, clockEl(c, set, c.name, true), h('div', { class: 'cct' },
        c.own ? h('input', { type: 'text', class: 'ctitle', value: c.name, 'aria-label': 'Clock name', onchange: e => { A.camp.clocks.find(y => y.id === c.id).name = e.target.value.trim() || 'Clock'; saveCamp(); } }) : h('button', { type: 'button', class: 'linkish', text: c.name, onclick: () => openDoc(c.doc) }),
        h('small', { text: c.own ? 'Campaign clock' : c.sub }), c.own ? ib('trash', 'Remove the clock ' + c.name, () => { A.camp.clocks = A.camp.clocks.filter(y => y.id !== c.id); saveCamp(); renderMain(); }, 'tiny') : null)));
    }
    const addClock = btn('plus', 'New clock', async () => { const n = await ask('Name the clock', '', { placeholder: 'The cult completes the ritual' }); if (!n) return; A.camp.clocks = [...(A.camp.clocks || []), { id: rid('k'), name: n, size: 6, filled: 0 }]; await saveCamp(); renderMain(); }, 'tiny');
    const showClocks = TABLE.on() && clocks.length ? btn('eye', 'Show them to the players', () => sendClocks(clocks), 'tiny ghost') : null;
    wrap.append(h('section', { class: 'hcard' }, h('div', { class: 'hrow' }, h('h2', { text: `Clocks (${clocks.length})` }), h('span', { class: 'grow' }), showClocks, addClock),
      clocks.length ? cbox : h('p', { class: 'hint', text: 'A clock fills as a threat moves forward. Make one here, or give a faction or quest its clock in Details.' })));
    // quests
    const qs = sortedOf('quest'), cols = ['Rumour', 'Active', 'Done', 'Failed'];
    const qb = h('div', { class: 'qcols' }, ...cols.map(st => { const l = qs.filter(q => ((q.fields || {}).status || 'Rumour') === st || (st === 'Failed' && (q.fields || {}).status === 'Abandoned')); return h('div', { class: 'qcol' }, h('h3', { text: `${st} (${l.length})` }), ...l.map(q => h('button', { type: 'button', class: 'lrow', style: `--c:${typeColor(q)}`, onclick: () => openDoc(q.id) }, h('span', { class: 'li', html: icon('quest') }), h('span', { class: 'lt', text: q.title })))); }));
    wrap.append(h('section', { class: 'hcard' }, h('div', { class: 'hrow' }, h('h2', { text: `Quests (${qs.length})` }), h('span', { class: 'grow' }), btn('plus', 'New quest', () => create('quest'), 'tiny')), qs.length ? qb : h('p', { class: 'hint', text: 'No quests yet.' })));
    // clues
    const cl = clues(), open = cl.filter(c => !c.found);
    const tbl = h('table', { class: 'cltable' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Clue' }), h('th', { scope: 'col', text: 'Planned in' }), h('th', { scope: 'col', text: 'Found in' }))),
      h('tbody', {}, ...cl.sort((a, b) => (a.found ? 1 : 0) - (b.found ? 1 : 0)).map(c => h('tr', { class: c.found ? 'found' : '' }, h('td', { text: c.text }),
        h('td', {}, h('button', { type: 'button', class: 'linkish', text: c.planned.title, onclick: () => openDoc(c.planned.id) })),
        h('td', {}, c.found ? h('button', { type: 'button', class: 'linkish', text: c.found.title, onclick: () => openDoc(c.found.id) }) : h('span', { class: 'hint', text: c.seen.length > 1 ? `Not yet (carried ${c.seen.length - 1}×)` : 'Not yet' }))))));
    wrap.append(h('section', { class: 'hcard' }, h('h2', { text: `Secrets & clues (${open.length} still to find)` }), cl.length ? h('div', { class: 'tblw' }, tbl) : h('p', { class: 'hint', text: 'Clues are the boxes under a session\'s "Secrets & clues" heading. Tick one when the party finds it.' })));
    main.append(wrap);
  }
  async function sendClocks(clocks) {
    try {
      const code = TABLE.T.code; A.camp.sent = A.camp.sent || {}; const s = A.camp.sent[code] = A.camp.sent[code] || {};
      s.clocks = await TABLE.sendNote({ id: s.clocks, title: 'Clocks', text: clocks.map(c => clockText(c.name, c)).join('\n\n'), handout: true, show: true });
      await saveCamp(); toast('The players see the clocks in their notes. Show them again to update them.');
    } catch (e) { toast('Could not send them: ' + errText(e)); }
  }

  /* ============================== the encounter builder ============================== */
  const XP5 = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
  const TH5 = [null, [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100], [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800], [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400], [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700]];
  const MULT5 = n => (n <= 1 ? 1 : n === 2 ? 1.5 : n <= 6 ? 2 : n <= 10 ? 2.5 : n <= 14 ? 3 : 4);
  const PF2 = { '-4': 10, '-3': 15, '-2': 20, '-1': 30, '0': 40, '1': 60, '2': 80, '3': 120, '4': 160 };
  const DH_COST = { minion: 1, social: 1, support: 1, horde: 2, ranged: 2, skulk: 2, standard: 2, leader: 3, bruiser: 4, solo: 5 };
  function rate(sys, party, picks) {
    const P = Math.max(1, +party.size || 4), L = Math.max(1, Math.min(20, +party.level || 1)), count = picks.reduce((s, p) => s + p.n, 0);
    if (!count) return null;
    if (sys === 'dnd5e') {
      const raw = picks.reduce((s, p) => s + (XP5[String((p.x.d || {}).cr ?? '0')] || 0) * p.n, 0), adj = Math.round(raw * MULT5(count)), th = TH5[L].map(t => t * P);
      const tier = adj >= th[3] ? 'Deadly' : adj >= th[2] ? 'Hard' : adj >= th[1] ? 'Medium' : adj >= th[0] ? 'Easy' : 'Trivial';
      return { tier, line: `${tier}: ${adj.toLocaleString()} XP adjusted (${raw.toLocaleString()} raw) for ${P} level ${L} characters. Easy ${th[0]}, Medium ${th[1]}, Hard ${th[2]}, Deadly ${th[3]}.`, pct: Math.min(1, adj / th[3]) };
    }
    if (sys === 'pf2e') {
      let xp = 0, off = 0; for (const p of picks) { const d = Math.max(-4, Math.min(4, (+(p.x.d || {}).level || 0) - L)); if ((+(p.x.d || {}).level || 0) - L > 4) off++; xp += (PF2[String(d)] || 0) * p.n; }
      const adj = P - 4, b = { Trivial: 40 + 10 * adj, Low: 60 + 15 * adj, Moderate: 80 + 20 * adj, Severe: 120 + 30 * adj, Extreme: 160 + 40 * adj };
      const tier = xp > b.Extreme || off ? 'Beyond extreme' : xp > b.Severe ? 'Extreme' : xp > b.Moderate ? 'Severe' : xp > b.Low ? 'Moderate' : xp > b.Trivial ? 'Low' : 'Trivial';
      return { tier, line: `${tier}: ${xp} XP for ${P} level ${L} characters. Low ${b.Low}, Moderate ${b.Moderate}, Severe ${b.Severe}, Extreme ${b.Extreme}.`, pct: Math.min(1, xp / b.Extreme) };
    }
    if (sys === 'daggerheart') {
      const bp = 3 * P + 2; let cost = 0;
      for (const p of picks) { const t = String((p.x.d || {}).type || p.x.c || '').toLowerCase().split(/\s+/).find(w => DH_COST[w]) || 'standard'; cost += t === 'minion' ? Math.ceil(p.n / P) : DH_COST[t] * p.n; }
      const tier = cost > bp + 2 ? 'Very hard' : cost > bp ? 'Hard' : cost < bp - 2 ? 'Easy' : 'Even';
      return { tier, line: `${tier}: ${cost} of ${bp} battle points for ${P} characters.`, pct: Math.min(1, cost / (bp + 3)) };
    }
    return { tier: '', line: `${count} creature${count === 1 ? '' : 's'}. This game has no budget in Critter Notes, so the numbers are up to you.`, pct: 0 };
  }
  function encounter(insert) {
    const sys = campSys(), party = { size: 4, level: 3, ...(A.camp.party || {}) }, picks = [];
    const name = h('input', { type: 'text', value: 'Encounter', 'aria-label': 'Name of the encounter' });
    const size = h('input', { type: 'number', min: 1, max: 12, value: party.size }), level = h('input', { type: 'number', min: 1, max: 20, value: party.level });
    const q = h('input', { type: 'search', placeholder: SRD.SYSTEMS[sys] ? `Find a ${SRD.SYSTEMS[sys]} creature…` : 'Find a creature…', 'aria-label': 'Find a creature', autofocus: true });
    const res = h('div', { class: 'list encres', role: 'list' }), chosen = h('div', { class: 'list' }), meter = h('div', { class: 'encm', role: 'status', 'aria-live': 'polite' });
    const draw = () => {
      party.size = +size.value || 4; party.level = +level.value || 1;
      chosen.replaceChildren(...picks.map((p, i) => h('div', { class: 'encrow' }, h('span', { class: 'lt', text: p.x.n }), h('small', { class: 'ls', text: p.x.c || '' }),
        ib('minus', 'One fewer ' + p.x.n, () => { p.n--; if (p.n < 1) picks.splice(i, 1); draw(); }, 'tiny'), h('b', { text: '×' + p.n }), ib('plus', 'One more ' + p.x.n, () => { p.n++; draw(); }, 'tiny'))));
      if (!picks.length) chosen.append(h('p', { class: 'hint', text: 'Nothing chosen yet. Search, then add creatures.' }));
      const r = rate(sys, party, picks);
      meter.replaceChildren(...(r ? [h('div', { class: 'encbar' }, h('i', { style: `width:${Math.round(r.pct * 100)}%` })), h('b', { text: r.tier }), h('span', { class: 'hint', text: r.line.replace(/^[^:]+: /, '') })] : [h('span', { class: 'hint', text: 'The difficulty shows once there are creatures.' })]));
    };
    const find = debounce(async () => {
      const hits = q.value.trim().length < 2 ? [] : await SRD.search(sys, q.value, 12, ['npc']);
      res.replaceChildren(...hits.map(x => h('button', { type: 'button', class: 'lrow', role: 'listitem', onclick: () => { const p = picks.find(y => y.x === x); if (p) p.n++; else picks.push({ x, n: 1 }); draw(); } }, h('span', { class: 'li', html: icon('plus') }), h('span', { class: 'lt', text: x.n }), h('span', { class: 'ls', text: x.c || '' }))));
      if (q.value.trim().length >= 2 && !hits.length) res.append(h('p', { class: 'hint', text: SRD.SYSTEMS[sys] && ['dnd5e', 'pf2e', 'daggerheart'].includes(sys) ? 'No creature by that name in the SRD.' : 'There\'s no SRD for this game in Critter Notes. Write the creatures in by hand.' }));
    }, 200);
    q.addEventListener('input', find); size.addEventListener('input', draw); level.addEventListener('input', draw); draw();
    const md = () => [`> [!combat] ${name.value.trim() || 'Encounter'}`, ...picks.map(p => `> - ${p.n} × [[srd:${SRD.refOf(p.x)}|${p.x.n}]]`), ...(rate(sys, party, picks) ? ['> ', `> *${rate(sys, party, picks).line}*`] : [])].join('\n') + '\n';
    const m = modal('Encounter builder', h('div', { class: 'enc' },
      h('div', { class: 'encparty' }, h('label', {}, 'Name', name), h('label', {}, 'Characters', size), h('label', {}, 'Their level', level)),
      h('div', { class: 'enccols' }, h('div', {}, h('div', { class: 'rsec', text: 'Find' }), q, res), h('div', {}, h('div', { class: 'rsec', text: 'In the encounter' }), chosen, meter))),
      [TABLE.on() ? btn('send', 'Add them to the table', async () => { if (!picks.length) return; try { for (const p of picks) await TABLE.sendEnt({ kind: 'npc', name: p.x.n, data: SRD.data(p.x), sys: p.x.sys }); toast(`${plural(picks.length, 'creature')} added to the table's Library.`); } catch (e) { toast('Could not add them: ' + errText(e)); } }, 'ghost') : null,
        btn(null, 'Cancel', () => m.close(), 'ghost'), btn('check', 'Put it in the document', () => { if (!picks.length) { q.focus(); return; } A.camp.party = { size: party.size, level: party.level }; saveCamp(); m.close(); insert(md()); }, 'primary')].filter(Boolean), { wide: true });
  }

  /* ============================== random tables ============================== */
  function tableTools(b) {
    const rt = MD.rollTable(b); if (!rt) return '';
    return `<div class="rtools"><button type="button" class="btn tiny rollt" data-rolltable="${b.line}">${icon('dice')}<span>Roll ${rt.n > 1 ? rt.n : ''}d${rt.s === 100 ? '%' : rt.s}</span></button></div>`;
  }
  function rollTableAt(btnEl, d) {
    const line = +btnEl.dataset.rolltable; let blk = null;
    const walk = bs => { for (const b of bs) { if (b.t === 'table' && b.line === line) blk = b; if (b.blocks) walk(b.blocks); } };
    walk(MD.parse(d.body)); const rt = blk && MD.rollTable(blk); if (!rt) return;
    let total = 0; for (let i = 0; i < rt.n; i++) total += 1 + Math.floor(Math.random() * rt.s);
    const row = rt.rows.find(r => total >= r.lo && total <= r.hi);
    const tbl = btnEl.closest('.tblw').querySelector('table');
    tbl.querySelectorAll('tr.hit').forEach(r => r.classList.remove('hit'));
    const result = row ? row.cells.slice(1).map(c => MD.plainInline(c)).join(' · ') : 'No row for that roll';
    if (row) { const tr = tbl.querySelector(`tr[data-row="${row.k}"]`); tr.classList.add('hit'); tr.scrollIntoView({ block: 'nearest' }); }
    bubble(btnEl, `<b>${total}</b><span>${esc(result)}</span>`);
    const title = MD.plainInline(rt.title) || d.title;
    if (TABLE.on()) toast(`Rolled ${total}: ${result}`, { label: 'Say it in the table chat', fn: () => TABLE.say(`🎲 **${title}** (${rt.n > 1 ? rt.n : ''}d${rt.s === 100 ? '%' : rt.s} → ${total}): ${result}`).then(() => toast('Posted in the table chat.'), e => toast('Could not post it: ' + errText(e))) });
  }
  const TABLE_SNIP = '| d6 | What happens |\n| --- | --- |\n| 1 | |\n| 2 | |\n| 3 | |\n| 4 | |\n| 5 | |\n| 6 | |\n';

  /* ============================== a shared world ============================== */
  // another campaign whose documents this one reads: link to them, read them, never change them from here
  async function loadWorld() {
    A.wdocs = new Map(); A.wname = '';
    const w = A.camp && A.camp.world && A.camps.find(c => c.id === A.camp.world && c.id !== A.camp.id);
    if (!w) return;
    try { for (const d of await STORE.loadDocs(w.id)) if (d && d.id && !A.docs.has(d.id)) { d.body = String(d.body || ''); d.fields = d.fields || {}; if (!TYPES[d.type]) d.type = 'note'; d.world = w.id; A.wdocs.set(d.id, d); } A.wname = w.name; }
    catch (e) { toast('Could not read the shared world: ' + errText(e)); }
  }

  /* ============================== live handouts ============================== */
  // a document kept shown to the players: its handout follows every change, a few seconds later
  const liveT = new Map();
  function liveTouch(d) {
    if (!d.live || !TABLE.on()) return;
    clearTimeout(liveT.get(d.id));
    liveT.set(d.id, setTimeout(() => VIEWS.send(d, 'show', true), 4000));
  }

  /* ============================== importing Markdown ============================== */
  function importMd(folder) {
    const i = h('input', { type: 'file', multiple: true, accept: folder ? undefined : '.md,.markdown,.txt,text/markdown' });
    if (folder) i.webkitdirectory = true;
    i.onchange = async () => {
      const files = [...i.files]; if (!files.length) return;
      const imgs = new Map(), md = files.filter(f => /\.(md|markdown|txt)$/i.test(f.name));
      toast(`Reading ${plural(md.length, 'file')}…`);
      for (const f of files.filter(f => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(f.name))) { try { imgs.set(f.name.toLowerCase(), await STORE.putImage(cid(), f, f.name)); } catch {} }
      const byPlural = Object.fromEntries(Object.entries(TYPES).flatMap(([k, t]) => [[t.plural.toLowerCase(), k], [t.name.toLowerCase(), k]]));
      const made = [], parents = [];
      for (const f of md) {
        let text = (await f.text()).replace(/\r\n?/g, '\n'), fm = {};
        const fmm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
        if (fmm) { text = text.slice(fmm[0].length); for (const l of fmm[1].split('\n')) { const x = /^([\w-]+):\s*(.*)$/.exec(l); if (!x) continue; let v = x[2].trim(); try { v = JSON.parse(v); } catch { if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean); } fm[x[1]] = v; } }
        const dir = (f.webkitRelativePath || '').split('/').slice(-2, -1)[0] || '';
        const type = TYPES[fm.type] ? fm.type : byPlural[dir.toLowerCase()] || 'note';
        // pictures: Obsidian's ![[name.png]] and ordinary ![](path/name.png) become pictures kept in the campaign
        text = text.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (a, n) => { const k = imgs.get(n.split('/').pop().toLowerCase()); return k ? `![](img:${k})` : a; })
          .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (a, alt, p) => { const k = imgs.get(decodeURIComponent(p).split('/').pop().toLowerCase()); return k ? `![${alt}](img:${k})` : a; });
        const fields = {}; for (const [k, , kind] of FIELDS[type] || []) if (fm[k] !== undefined) fields[k] = kind === 'num' ? +fm[k] : fm[k];
        const title = String(fm.title || f.name.replace(/\.(md|markdown|txt)$/i, ''));
        // a heading that only repeats the title is dropped
        text = text.replace(new RegExp('^#\\s+' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n+'), '');
        const d = newDoc({ type, title, body: text.trim() + '\n', fields, tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [] });
        made.push(d); if (fm.parent) parents.push([d, String(fm.parent).replace(/^\[\[|\]\]$/g, '')]);
      }
      reindex();
      for (const [d, p] of parents) { const t = resolve(p); if (t && t !== d.id) { d.parent = t; touch(d, true); } }
      await flush(); render();
      toast(`Imported ${plural(made.length, 'document')}${imgs.size ? ` and ${plural(imgs.size, 'picture')}` : ''}.`);
    };
    i.click();
  }

  return { flipClock, dayOf, cal, wfmt, wkey, has, addDays, wdateInput, calendarDialog, clockEl, clockText, allClocks, relsBox, timeline, relsPage, threads, clues, encounter, tableTools, rollTableAt, TABLE_SNIP, loadWorld, liveTouch, importMd };
})();
