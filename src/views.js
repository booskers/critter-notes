/* Critter Notes: the views around the documents: welcome, the campaign's home, the graph, the side panel (links,
   the table, Critter Sounds), sending to the table, running a session, campaigns, exports and the sample campaign. */
const VIEWS = (() => {
  const SOUND_KIND = { scene: 'scene', playlist: 'playlist', pad: 'pad', scape: 'soundscape' };

  /* ============================== welcome ============================== */
  async function welcome(main) {
    main.className = 'welcome';
    const where = await STORE.vault().catch(() => ({ root: '' }));
    main.append(h('div', { class: 'hero' },
      h('img', { class: 'heroicon', src: 'icon.svg', alt: '' }),
      h('h1', { text: 'Critter Notes' }),
      h('p', { class: 'lead', text: 'Plan sessions, write your world, draw maps and mind maps, and send it all to your Critter table.' }),
      h('div', { class: 'row center' }, btn('plus', 'Start a campaign', () => newCampaign(), 'primary big'), btn('lore', 'Open the sample campaign', () => sample(), 'big'), btn('upload', 'Restore a backup', () => restore(), 'ghost big')),
      h('p', { class: 'hint', text: 'Coming from Obsidian or another notes app? Start a campaign, then import its Markdown files from the menu.' }),
      h('p', { class: 'hint', text: STORE.kind === 'files' ? `Campaigns are kept as plain files in ${where.root}.` : 'Campaigns are kept in this browser.' })));
  }

  /* ============================== the campaign's home ============================== */
  function home(main) {
    main.className = 'home';
    const all = [...A.docs.values()], sessions = sortedOf('session');
    const next = sessions.slice().reverse().find(s => (s.fields || {}).status !== 'Played') || sessions[sessions.length - 1];
    const wrap = h('div', { class: 'homein' });
    const now = PLAN.cal().now;
    wrap.append(h('div', { class: 'hhead' },
      h('div', {}, h('div', { class: 'eyebrow', text: [SRD.SYSTEMS[campSys()], TABLE.on() ? 'Table ' + TABLE.T.code : '', now ? 'Today: ' + PLAN.wfmt(now) : ''].filter(Boolean).join(' · ') }), h('h1', { text: A.camp.name, tabIndex: -1 })),
      h('div', { class: 'grow' }),
      h('div', { class: 'quick', role: 'group', 'aria-label': 'New' }, ...['session', 'character', 'location', 'quest', 'map', 'note'].map(t => h('button', { type: 'button', class: 'qnew', style: `--c:${TYPES[t].color}`, title: TYPES[t].hint, onclick: () => create(t) }, h('span', { html: icon(TYPES[t].icon), 'aria-hidden': 'true' }), h('b', { text: TYPES[t].name }))))));
    const cols = h('div', { class: 'hcols' }), left = h('div', { class: 'hcol' }), right = h('div', { class: 'hcol' }); cols.append(left, right); wrap.append(cols);
    // the next session
    if (next) {
      const f = next.fields || {}, outline = MD.outline(next.body), scenes = outline.filter(x => x.level === 3).length, branches = (next.body.match(/^\s*>\s*\[!branch\]/gmi) || []).length, clues = openClues(next).length;
      left.append(card(f.status === 'Played' ? 'Last session' : 'Next session', h('div', { class: 'nexts' },
        h('div', { class: 'nsh' }, h('span', { class: 'nsi', html: icon('session'), 'aria-hidden': 'true' }), h('div', {}, h('b', { text: next.title }), h('div', { class: 'hint', text: [f.date ? new Date(f.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '', f.status || 'Planned', PLAN.wfmt(f.when, true)].filter(Boolean).join(' · ') }))),
        h('div', { class: 'stats' }, stat(scenes, 'scenes'), stat(branches, 'alternative paths'), stat(clues, 'clues to find')),
        h('div', { class: 'row' }, btn('read', 'Open', () => openDoc(next.id)), btn('play', 'Run it', () => { A.modes.set(next.id, 'run'); openDoc(next.id); }, 'accent2'), h('span', { class: 'grow' }), btn('plus', 'Plan the next one', () => create('session'), 'ghost')))));
    } else left.append(card('Sessions', h('div', {}, h('p', { class: 'hint', text: 'No sessions planned yet. A session plan starts with the Lazy DM\'s steps: a strong start, scenes with alternative paths, secrets and clues, places, people, monsters and treasure. Clues the party doesn\'t find come along to the next session by themselves.' }), btn('plus', 'Plan the first session', () => create('session'), 'primary'))));
    // what's open: quests, clocks and clues, in short; the Threads page has it all
    const quests = sortedOf('quest').filter(q => ['Active', 'Rumour', ''].includes((q.fields || {}).status || ''));
    const threads = h('div', { class: 'list' });
    for (const q of quests.slice(0, 6)) threads.append(docRow(q, (q.fields || {}).status || 'Open'));
    const clocks = PLAN.allClocks().slice(0, 4);
    if (clocks.length) threads.append(h('div', { class: 'miniclocks' }, ...clocks.map(c => h('span', { class: 'mclk', title: `${c.name}: ${c.filled || 0} of ${c.size || 6}` }, h('i', { style: `--p:${Math.round(100 * (c.filled || 0) / (c.size || 6))}%` }), h('span', { text: c.name })))));
    const openCl = PLAN.clues().filter(c => !c.found);
    if (openCl.length) threads.append(h('button', { type: 'button', class: 'lrow clue', onclick: () => go({ k: 'threads' }) }, h('span', { class: 'li', html: icon('key') }), h('span', { class: 'lt', text: plural(openCl.length, 'clue') + ' still to find' }), h('span', { class: 'ls', text: 'Threads ›' })));
    left.append(card('Open threads', threads.children.length ? threads : h('p', { class: 'hint', text: 'Active quests, clocks and clues the party hasn\'t found show here.' })));
    // mentioned, not written yet
    const missing = new Map();
    for (const d of all) for (const li of MD.links(d.body)) if (li.kind === 'doc' && li.title && !resolve(li.title)) { const k = li.title.trim(); if (!missing.has(k)) missing.set(k, new Set()); missing.get(k).add(d.id); }
    if (missing.size) left.append(card('Mentioned, not written yet', h('div', { class: 'chips' }, ...[...missing].sort((a, b) => b[1].size - a[1].size).slice(0, 24).map(([t, set]) => h('button', { type: 'button', class: 'mchip', title: `Mentioned in ${plural(set.size, 'document')}. Click to write it.`, onclick: e => createFromLink(t, e.currentTarget) }, h('span', { text: t }), set.size > 1 ? h('i', { text: set.size, 'aria-label': `(in ${set.size})` }) : null)))));
    // recent
    const recent = h('div', { class: 'list' }); all.sort((a, b) => b.updated - a.updated).slice(0, 8).forEach(d => recent.append(docRow(d, ago(d.updated))));
    right.append(card('Recently changed', recent.children.length ? recent : h('p', { class: 'hint', text: 'Nothing yet.' })));
    const tags = [...A.idx.tags].sort((a, b) => b[1].size - a[1].size).slice(0, 24);
    if (tags.length) right.append(card('Tags', h('div', { class: 'chips' }, ...tags.map(([t, s]) => h('button', { type: 'button', class: 'mchip tagc', onclick: () => { $('#sideFilter').value = '#' + t; A.prefs.sideHidden = false; renderSide(); $('#sideFilter').focus(); } }, h('span', { text: '#' + t }), h('i', { text: s.size }))))));
    if (all.length < 15 && !A.prefs.noTips) right.append(h('section', { class: 'hcard' }, h('div', { class: 'hrow' }, h('h2', { text: 'Getting started' }), h('span', { class: 'grow' }), btn(null, 'Hide', () => { A.prefs.noTips = true; savePrefs(); renderMain(); }, 'tiny ghost')), h('ul', { class: 'tips' },
      h('li', { html: '<b>[[</b> links a document, a table entry, an SRD item or monster, or a Critter Sounds cue.' }),
      h('li', { html: '<b>/</b> at the start of a line adds a block: an alternative path, read-aloud text, a secret, an encounter, a random table…' }),
      h('li', { html: '<b>Mind map</b> (Ctrl+M) draws a document as branches; adding a branch writes it into the text.' }),
      h('li', { html: '<b>Send to table</b> puts a document in your Critter notebook, hands it out, or adds an NPC, item or map scene.' }),
      h('li', { html: '<b>Ctrl+K</b> finds anything. <b>Ctrl+.</b> hides everything but the page. <b>F1</b> lists every shortcut.' }))));
    main.append(wrap);
  }
  const card = (title, body) => h('section', { class: 'hcard' }, h('h2', { text: title }), body);
  const stat = (n, l) => h('div', { class: 'stat' }, h('b', { text: n }), h('span', { text: l }));
  const docRow = (d, sub) => h('button', { type: 'button', class: 'lrow', onclick: () => openDoc(d.id), style: `--c:${typeColor(d)}` }, h('span', { class: 'li', html: icon(TYPES[d.type].icon) }), h('span', { class: 'lt', text: d.title }), h('span', { class: 'ls', text: sub || '' }));

  /* ============================== the graph ============================== */
  function graph(main) {
    main.className = 'graphmain';
    const show = A.prefs.graphTypes || Object.fromEntries(Object.keys(TYPES).map(t => [t, true]));
    const bar = h('div', { class: 'graphbar' }, h('h1', { class: 'gtitle', text: 'Everything, and how it links' }), h('span', { class: 'grow' }),
      ...Object.entries(TYPES).map(([t, x]) => h('button', { type: 'button', class: 'tchip' + (show[t] !== false ? ' on' : ''), style: `--c:${x.color}`, title: 'Show or hide ' + x.plural.toLowerCase(), onclick: () => { show[t] = show[t] === false; A.prefs.graphTypes = show; savePrefs(); renderMain(); } }, h('i'), x.plural)),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!A.prefs.graphLonely, onchange: e => { A.prefs.graphLonely = e.target.checked; savePrefs(); renderMain(); } }), 'Unlinked too'));
    const host = h('div', { class: 'graphbox' }); main.append(bar, host);
    const docs = [...A.docs.values()].filter(d => show[d.type] !== false), ids = new Set(docs.map(d => d.id)), edges = [], seen = new Set();
    for (const d of docs) {
      for (const t of outLinks(d)) if (ids.has(t)) { const k = [d.id, t].sort().join('|'); if (!seen.has(k)) { seen.add(k); edges.push([d.id, t]); } }
      if (d.parent && ids.has(d.parent)) { const k = [d.id, d.parent].sort().join('|'); if (!seen.has(k)) { seen.add(k); edges.push([d.id, d.parent]); } }
    }
    const linked = new Set(edges.flat());
    const nodes = docs.filter(d => A.prefs.graphLonely || linked.has(d.id)).map(d => ({ id: d.id, title: d.title, type: d.type, color: typeColor(d) }));
    if (!nodes.length) { host.append(h('div', { class: 'empty', text: A.docs.size ? 'Nothing links to anything yet. Write [[ in a document to link another one.' : 'Nothing written yet.' })); return; }
    queueMicrotask(() => GRAPH.render(host, nodes, edges, { onOpen: id => openDoc(id) }));
  }

  /* ============================== the side panel ============================== */
  function renderRightPanel() {
    const r = $('#right'); $('#rightToggle').disabled = A.view.k !== 'doc';
    // the panel is about the open document; elsewhere it stays out of the way
    if (!A.camp || !A.prefs.right || A.view.k !== 'doc') { r.hidden = true; $('#rightToggle').classList.remove('on'); $('#rightToggle').setAttribute('aria-pressed', 'false'); return; }
    $('#rightToggle').setAttribute('aria-pressed', 'true');
    r.hidden = false; $('#rightToggle').classList.add('on');
    const tab = A.prefs.rightTab || 'links';
    const TABS = [['links', 'Links', 'link'], ['table', 'Table', 'table'], ['sounds', 'Sounds', 'music']];
    const pick = k => { A.prefs.rightTab = k; savePrefs(); renderRightPanel(); const t = $('#rtab-' + k); if (t) t.focus(); };
    const tabs = h('div', { class: 'rtabs', role: 'tablist', 'aria-label': 'Side panel' }, ...TABS.map(([k, l, ic], i) => h('button', { type: 'button', id: 'rtab-' + k, role: 'tab', 'aria-selected': String(tab === k), 'aria-controls': 'rpanel', tabIndex: tab === k ? 0 : -1, class: 'rtab' + (tab === k ? ' on' : ''), onclick: () => pick(k),
      onkeydown: e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); pick(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]); } } }, h('span', { html: icon(ic), 'aria-hidden': 'true' }), l)));
    const body = h('div', { class: 'rbody', id: 'rpanel', role: 'tabpanel', 'aria-labelledby': 'rtab-' + tab, tabIndex: 0 });
    const st = $('.rbody', r) ? $('.rbody', r).scrollTop : 0;
    r.replaceChildren(tabs, body);
    if (tab === 'links') linksTab(body); else if (tab === 'table') tableTab(body); else soundsTab(body);
    body.scrollTop = st;
  }
  function linksTab(body) {
    const d = A.view.k === 'doc' && D(A.view.id);
    if (!d) { body.append(h('p', { class: 'hint', text: 'Open a document to see its outline and what links to it.' })); return; }
    const ol = MD.outline(d.body);
    if (ol.length) body.append(sec('Outline'), h('div', { class: 'outline' }, ...ol.map(x => h('button', { type: 'button', class: 'oli', style: `--l:${x.level}`, text: x.text, onclick: () => { if (modeOf(d) === 'mind' || modeOf(d) === 'edit') A.modes.set(d.id, 'read'); go({ k: 'doc', id: d.id, line: x.line }, true); } }))));
    const back = [...(A.idx.back.get(d.id) || [])].map(D).filter(Boolean).sort((a, b) => b.updated - a.updated);
    body.append(sec(`Mentioned in (${back.length})`));
    if (!back.length) body.append(h('p', { class: 'hint', text: `Nothing links here yet. Write [[${d.title}]] in another document.` }));
    for (const b of back) {
      const txt = MD.plain(b.body), k = txt.toLowerCase().indexOf(d.title.toLowerCase());
      body.append(h('button', { type: 'button', class: 'blink', onclick: () => openDoc(b.id) }, h('span', { class: 'blt', style: `--c:${typeColor(b)}` }, h('span', { html: icon(TYPES[b.type].icon) }), h('b', { text: b.title })), k >= 0 ? h('small', { text: (k > 40 ? '…' : '') + txt.slice(Math.max(0, k - 40), k + 90).replace(/\s+/g, ' ') + '…' }) : null));
    }
    const out = [...outLinks(d)].map(D).filter(Boolean);
    if (out.length) body.append(sec(`Links to (${out.length})`), h('div', { class: 'chips' }, ...out.map(x => h('button', { type: 'button', class: 'mchip', style: `--c:${typeColor(x)}`, onclick: () => openDoc(x.id) }, h('span', { html: icon(TYPES[x.type].icon) }), h('span', { text: x.title })))));
    const kids = kidsOf(d.id);
    if (kids.length) body.append(sec(`Inside it (${kids.length})`), h('div', { class: 'chips' }, ...kids.map(x => h('button', { type: 'button', class: 'mchip', style: `--c:${typeColor(x)}`, onclick: () => openDoc(x.id) }, h('span', { html: icon(TYPES[x.type].icon) }), h('span', { text: x.title })))));
    const pinsIn = [...A.docs.values()].filter(m => m.map && (m.map.pins || []).some(p => p.doc === d.id));
    if (pinsIn.length) body.append(sec('On the map'), h('div', { class: 'chips' }, ...pinsIn.map(m => h('button', { type: 'button', class: 'mchip', style: `--c:${typeColor(m)}`, onclick: () => openDoc(m.id) }, h('span', { html: icon('map') }), h('span', { text: m.title })))));
  }
  const sec = (t, ...extra) => h('div', { class: 'rsec' }, h('span', { class: 'grow', text: t }), ...extra);

  /* ---------- the table ---------- */
  function tableTab(body) {
    const T = TABLE.T;
    if (T.state !== 'on') {
      const inp = h('input', { type: 'text', value: A.camp.table || '', placeholder: 'Lobby code or music code', class: 'code' });
      const go2 = async () => { A.camp.table = inp.value.trim(); await saveCamp(); if (await TABLE.connect(A.camp.table)) toast('Linked to table ' + TABLE.T.code + '.'); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go2(); });
      body.append(h('div', { class: 'linkbox' },
        h('b', { text: 'Link this campaign to its Critter table' }),
        h('p', { class: 'hint', text: 'Enter the lobby code to send notes, handouts, NPCs, items and maps to the table, and to take its Library, scenes and chat into your notes. With the music code from Critter\'s Music window instead, Notes can also cue Critter Sounds.' }),
        h('div', { class: 'row' }, inp, btn(null, T.state === 'connecting' ? 'Linking…' : 'Link', go2, 'primary')),
        T.why ? h('p', { class: 'hint bad', text: T.why }) : null,
        window.CRITBOARD_DESKTOP ? h('p', { class: 'hint', text: `Homebase: ${window.CRITBOARD_DESKTOP.mode === 'offline' ? 'offline' : window.CRITBOARD_DESKTOP.server || 'not chosen'}` }) : null));
      return;
    }
    const pl = TABLE.players();
    body.append(h('div', { class: 'tstat' }, h('div', {}, h('b', { text: 'Table ' + T.code }), h('div', { class: 'hint', text: `${SRD.SYSTEMS[TABLE.sys()] || TABLE.sys()} · ${plural(pl.length, 'player')}${T.key ? ' · music key ' + (T.keyOk ? 'works' : 'out of date') : ''}` })),
      h('span', { class: 'grow' }), ib('x', 'Unlink the table', async () => { A.camp.table = ''; await saveCamp(); TABLE.disconnect(); })));
    // the Library
    const d = A.view.k === 'doc' && D(A.view.id);
    const q = h('input', { type: 'text', placeholder: 'Search the Library', value: A.libQ || '' }), kind = h('select', {}, h('option', { value: '', text: 'Everything' }), ...['npc', 'item', 'char', 'spell', 'feat', 'class', 'origin'].map(k => h('option', { value: k, text: { npc: 'NPCs', item: 'Items', char: 'Characters', spell: 'Spells', feat: 'Features', class: 'Classes', origin: 'Origins' }[k], selected: A.libK === k })));
    const list = h('div', { class: 'list' });
    const drawLib = () => {
      A.libQ = q.value; A.libK = kind.value; const qq = q.value.trim().toLowerCase();
      const ents = [...T.ents.values()].filter(e => (!kind.value || e.kind === kind.value) && (!qq || String(e.name || '').toLowerCase().includes(qq))).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      list.replaceChildren(...ents.slice(0, 80).map(e => {
        const mine = [...A.docs.values()].find(x => x.table && x.table.ent === e.id && x.table.lobby === T.code);
        return h('div', { class: 'lrow ent' }, h('span', { class: 'li', html: icon(e.kind === 'item' ? 'item' : e.kind === 'npc' || e.kind === 'char' ? 'character' : 'lore') }), h('span', { class: 'lt', text: e.name || '(no name)' }), h('span', { class: 'ls', text: e.kind }),
          d ? ib('link', 'Link it in this document', () => insertInto(d, `[[table:${e.id}|${e.name}]]`)) : null,
          mine ? ib('open', 'Open its document', () => openDoc(mine.id)) : ib('note', 'Make a document from it', () => entToDoc(e)));
      }));
      if (!ents.length) list.append(h('p', { class: 'hint', text: T.ents.size ? 'Nothing matches.' : 'The table\'s Library is empty.' }));
      if (ents.length > 80) list.append(h('p', { class: 'hint', text: `And ${ents.length - 80} more: search to narrow it down.` }));
    };
    q.addEventListener('input', drawLib); kind.addEventListener('change', drawLib); drawLib();
    body.append(sec(`Library (${T.ents.size})`), h('div', { class: 'row' }, q, kind), list);
    // scenes
    const scenes = TABLE.scenes();
    body.append(sec(`Scenes (${scenes.length})`), h('div', { class: 'list' }, ...scenes.map(s => h('div', { class: 'lrow' }, h('span', { class: 'li', html: icon('map') }), h('span', { class: 'lt', text: s.name }), s.id === (T.lobby || {}).scene ? h('span', { class: 'ls', text: 'live' }) : null,
      ib('plus', 'Make a map from it', async () => { const f = await sceneToFile(s); if (!f) return; const m = newDoc({ type: 'map', title: s.name, map: { img: f, w: 0, h: 0, pins: [] } }); openDoc(m.id); })))));
    // players
    body.append(sec(`Players (${pl.length})`, pl.length ? btn(null, 'Make documents', () => playersToDocs(), 'tiny ghost') : null),
      pl.length ? h('div', { class: 'chips' }, ...pl.map(p => { const x = resolve(p.name); return h('button', { type: 'button', class: 'mchip', style: `--c:${p.color || '#888'}`, onclick: () => x ? openDoc(x) : playersToDocs([p]) }, h('span', { text: p.name })); })) : h('p', { class: 'hint', text: 'No players set up at the table yet.' }));
    // the GM's notebook in Critter
    const gm = [...T.gm.values()].filter(n => n.kind !== 'head').sort((a, b) => (b.ts || 0) - (a.ts || 0));
    body.append(sec(`Your Critter notebook (${gm.length})`), h('div', { class: 'list' }, ...gm.slice(0, 30).map(n => h('div', { class: 'lrow' }, h('span', { class: 'li', html: icon(n.dm ? 'send' : 'note') }), h('span', { class: 'lt', text: n.title || String(n.text || '').split('\n')[0].slice(0, 50) || 'Untitled' }), h('span', { class: 'ls', text: n.dm ? (n.rev === 'all' ? 'shown' : 'handout') : '' }),
      ib('download', 'Copy it into Notes', () => { const x = newDoc({ type: 'note', title: n.title || 'From Critter', body: String(n.text || '') }); openDoc(x.id); })))));
    if (d && d.type === 'session') body.append(sec('This session'), h('div', { class: 'row' }, btn('log', 'Add the table\'s chat', () => pullChat(d), 'tiny')));
  }
  function insertInto(d, text) {
    const ta = $('.editor textarea');
    if (ta && A.view.k === 'doc' && A.view.id === d.id) { replaceSel(ta, text); return; }
    d.body = d.body.replace(/\s*$/, '') + '\n\n' + text + '\n'; touch(d); renderMain(); toast('Added to the end of ' + d.title + '.');
  }

  /* ---------- Critter Sounds ---------- */
  function soundsTab(body) {
    const T = TABLE.T, sc = T.sounds;
    body.append(h('p', { class: 'hint', text: 'Critter Sounds plays to the table. Connected to the same table, it tells Notes what it can play, and Notes can cue it from here or from a [[sound:…]] link in your plans.' }));
    if (T.state !== 'on') { body.append(h('p', { class: 'hint bad', text: 'Link this campaign to its table first (the Table tab).' })); return; }
    if (!T.key) body.append(h('p', { class: 'hint warn', text: 'To cue sounds, link with the music code (from Critter\'s Music window) instead of the lobby code.' }));
    else if (T.keyOk === false) body.append(h('p', { class: 'hint warn', text: 'The music key is out of date. Copy the music code from Critter\'s Music window again and link with it.' }));
    if (!sc) { body.append(h('p', { class: 'hint', text: 'Critter Sounds hasn\'t connected to this table yet. Open it and connect it with the music code; its scenes, playlists, pads and soundscapes appear here.' })); return; }
    body.append(h('div', { class: 'row' }, h('span', { class: 'hint grow', text: `${sc.n || 'Critter Sounds'} · seen ${ago(+sc.ts || 0)}` }), btn('stop', 'Stop music', () => playCue('all/', 'everything', null, 'stop'), 'tiny ghost'), btn('stop', 'Stop pads', () => playCue('pads/', 'the pads', null, 'stop'), 'tiny ghost')));
    const d = A.view.k === 'doc' && D(A.view.id);
    for (const [k, l, t] of [['scene', 'scenes', 'Scenes'], ['playlist', 'playlists', 'Playlists'], ['pad', 'pads', 'Sound pads'], ['scape', 'scapes', 'Soundscapes']]) {
      const items = sc[l] || []; if (!items.length) continue;
      body.append(sec(`${t} (${items.length})`), h('div', { class: k === 'pad' ? 'pads' : 'list' }, ...items.map(x => k === 'pad'
        ? h('button', { type: 'button', class: 'pad', style: x.color ? `--c:${x.color}` : '', title: 'Play it (click again in Critter Sounds to stop)', onclick: e => playCue(`pad/${x.id}`, x.name, e.currentTarget) }, h('span', { text: x.name }))
        : h('div', { class: 'lrow' }, ib('play', 'Play it on Critter Sounds', e => playCue(`${k}/${x.id}`, x.name, e.currentTarget)), h('span', { class: 'lt', text: x.name }), d ? ib('plus', 'Put a cue for it in this document', () => insertInto(d, `[[sound:${k}/${x.id}|${x.name}]]`)) : null))));
    }
  }
  async function playCue(ref, name, anchor, op = 'play') {
    const [kind, ...rest] = String(ref).split('/'), id = rest.join('/');
    if (anchor) anchor.classList.add('busy');
    try {
      const ok = await TABLE.cue(op, kind, id, name);
      toast(ok ? (op === 'stop' ? `Stopped ${name}.` : `Playing ${name}.`) : 'Critter Sounds didn\'t answer. Is it open and connected to this table with the music code?');
    } catch (e) { toast(errText(e)); }
    finally { if (anchor) anchor.classList.remove('busy'); }
  }
  function soundPicker(anchor, insert) {
    const sc = TABLE.T.sounds;
    if (!sc) { toast(TABLE.on() ? 'Critter Sounds hasn\'t connected to this table yet. Open it and connect it with the music code.' : 'Link the campaign to its table first (the side panel\'s Table tab).'); return; }
    const items = [];
    for (const [k, l, t] of [['scene', 'scenes', 'Scenes'], ['playlist', 'playlists', 'Playlists'], ['pad', 'pads', 'Pads'], ['scape', 'scapes', 'Soundscapes']]) { if (!(sc[l] || []).length) continue; items.push({ head: t }); for (const x of sc[l].slice(0, 40)) items.push({ label: x.name, icon: 'music', fn: () => insert(`[[sound:${k}/${x.id}|${x.name}]]`) }); }
    if (!items.length) { toast('Critter Sounds has nothing to play yet.'); return; }
    menu(items, anchor.getBoundingClientRect ? anchor : { x: innerWidth / 2, y: innerHeight / 3 });
  }

  /* ============================== to the table ============================== */
  function sendMenu(d, at) {
    if (!TABLE.on()) { menu([{ head: 'Not linked to a table' }, { label: 'Link this campaign to its table…', icon: 'table', fn: () => { A.prefs.right = true; A.prefs.rightTab = 'table'; savePrefs(); renderRight(); } }, { label: 'Copy the text for Critter', icon: 'copy', fn: () => copyForCritter(d) }], at); return; }
    const s = ((d.sent || {})[TABLE.T.code]) || {}, has = (k, map) => s[k] && map.has(s[k]);
    const items = [{ head: 'Send to table ' + TABLE.T.code },
      { label: has('note', TABLE.T.gm) ? 'Update it in my Critter notebook' : 'To my Critter notebook', sub: 'For your eyes, secrets and all', icon: 'note', fn: () => send(d, 'note') },
      { label: has('handout', TABLE.T.gm) ? 'Update the handout' : 'As a handout, to show later', sub: 'Without secrets, clues or alternative paths', icon: 'send', fn: () => send(d, 'handout') },
      { label: 'As a handout, shown to everyone now', icon: 'eye', fn: () => send(d, 'show') },
      { label: d.live ? 'Stop keeping it shown' : 'Keep it shown, and up to date', sub: 'The players\' copy follows your changes', icon: 'refresh', check: !!d.live, fn: () => { d.live = !d.live; touch(d, true); if (d.live) send(d, 'show'); render(); } }];
    if (TABLE_KIND[d.type]) items.push({ label: (has('ent', TABLE.T.ents) || (d.table && d.table.lobby === TABLE.T.code && TABLE.T.ents.has(d.table.ent)) ? 'Update the ' : 'As an ') + (d.type === 'character' ? 'NPC' : 'item') + ' in the Library', sub: d.sheet ? 'With its game stats' : 'Its stats are added in Critter', icon: d.type === 'character' ? 'character' : 'item', fn: () => send(d, 'ent') });
    if (d.type === 'map') items.push({ label: s.scene && TABLE.scenes().some(x => x.id === s.scene) ? 'Update its scene' : 'As a new scene', sub: 'Hidden until you reveal it in Critter', icon: 'map', disabled: !(d.map && d.map.img), fn: () => send(d, 'scene') });
    items.push('-', { label: 'Copy the text for Critter', icon: 'copy', fn: () => copyForCritter(d) });
    menu(items, at);
  }
  function critterText(d, players) {
    const f = (FIELDS[d.type] || []).filter(([k, , kind]) => d.fields && d.fields[k] !== undefined && d.fields[k] !== '' && !(players && (k === 'secret' || kind === 'link'))).map(([k, l]) => `**${l}:** ${d.fields[k]}`).join(' · ');
    const body = MD.toCritter(d.body, players ? { forPlayers: true } : { gm: true });
    const pins = d.map && (d.map.pins || []).length ? '\n\n' + d.map.pins.map(p => `- ${p.label || (D(p.doc) || {}).title || 'Pin'}`).join('\n') : '';
    return ((f ? f + '\n\n' : '') + body + pins).trim();
  }
  function copyForCritter(d) { navigator.clipboard.writeText(critterText(d, false)).then(() => toast('Copied. Paste it into a note in Critter.'), () => toast('Couldn\'t copy.')); }
  async function picUrl(d) { const f = d.img || (d.map && d.map.img) || MD.firstImage(d.body).replace(/^img:/, ''); return f && !/^https?:/.test(f) ? STORE.imageUrl(cid(), f) : ''; }
  async function send(d, what, quiet) {
    if (!TABLE.on()) return;
    const code = TABLE.T.code; d.sent = d.sent || {}; const s = d.sent[code] = d.sent[code] || {};
    const say = toast; if (quiet) toast = () => {};
    try {
      toast('Sending…');
      if (what === 'note') { s.note = await TABLE.sendNote({ id: s.note, title: d.title, text: critterText(d, false), img: await picUrl(d) }); toast('It\'s in your notebook in Critter.'); }
      else if (what === 'handout' || what === 'show') { s.handout = await TABLE.sendNote({ id: s.handout, title: d.title, text: critterText(d, true), img: await picUrl(d), handout: true, show: what === 'show' }); toast(what === 'show' ? 'Shown to everyone. It\'s in their notes.' : 'The handout is ready in your Critter notebook. Show it from there when the time comes.'); }
      else if (what === 'ent') {
        const kind = TABLE_KIND[d.type], sys = TABLE.sys(), text = critterText(d, false);
        const data = { ...(d.sheet || {}) }, tf = kind === 'item' && sys === 'daggerheart' ? 'feature' : 'notes';
        data[tf] = [d.sheet && d.sheet[tf] && !String(d.sheet[tf]).startsWith(text.slice(0, 40)) ? d.sheet[tf] : '', text].filter(Boolean).join('\n\n').slice(0, 4000);
        if (kind === 'item' && d.fields && d.fields.kind && !data.kind) data.kind = String(d.fields.kind).toLowerCase();
        const prior = s.ent || (d.table && d.table.lobby === code ? d.table.ent : '');
        s.ent = await TABLE.sendEnt({ id: prior, kind, name: d.title, data, img: await picUrl(d), sys: d.sheet && d.sheetSys ? d.sheetSys : undefined });
        d.table = { lobby: code, ent: s.ent };
        toast(`${d.title} is in the table's Library.`);
      }
      else if (what === 'scene') { s.scene = await TABLE.sendScene({ id: s.scene, name: d.title, img: await STORE.imageUrl(cid(), d.map.img) }); toast('The map is a new scene at the table, hidden until you reveal it.'); }
      if (A.docs.has(d.id)) { A.dirty.add(d.id); flush(); }
    } catch (e) { say('Could not send it: ' + errText(e)); }
    finally { if (quiet) toast = say; }
  }

  /* ============================== from the table ============================== */
  async function sceneToFile(sc) {
    try { toast('Fetching the scene…'); const url = await TABLE.sceneImage(sc.id); if (!url) { toast('That scene has no picture.'); return null; } const blob = await (await fetch(url)).blob(); const f = await STORE.putImage(cid(), blob, 'scene.' + (blob.type.split('/')[1] || 'jpg')); toast('Done.'); return f; }
    catch (e) { toast('Could not fetch it: ' + errText(e)); return null; }
  }
  function scenePicker(at, fn) { menu([{ head: 'Scenes at the table' }, ...TABLE.scenes().map(s => ({ label: s.name, icon: 'map', fn: () => fn(s) }))], at); }
  async function entToDoc(e) {
    const D0 = e.data || {}, type = e.kind === 'item' ? 'item' : e.kind === 'npc' || e.kind === 'char' ? 'character' : 'lore';
    const lines = [];
    const stats = ['ac', 'hp', 'speed', 'cr', 'level'].filter(k => D0[k] !== undefined && D0[k] !== '').map(k => `**${k.toUpperCase()}** ${D0[k]}`);
    if (stats.length) lines.push(stats.join(' · '), '');
    for (const k of ['desc', 'notes', 'feature', 'traits', 'text', 'props']) if (D0[k]) lines.push(String(D0[k]), '');
    if (Array.isArray(D0.actions) && D0.actions.length) { lines.push('## Actions'); for (const a of D0.actions.slice(0, 12)) lines.push(`- **${a.name || 'Action'}**${a.text ? ': ' + a.text : ''}`); lines.push(''); }
    let img = '';
    if (e.img) try { img = await STORE.putImage(cid(), await (await fetch(e.img)).blob(), 'portrait.jpg'); } catch {}
    const d = newDoc({ type, title: e.name || 'From the table', body: lines.join('\n').trim() + '\n', fields: type === 'character' ? { role: e.kind === 'char' ? 'Player character' : 'NPC' } : type === 'item' ? { kind: D0.kind || '' } : {}, img, sheet: D0, table: { lobby: TABLE.T.code, ent: e.id } });
    d.sheetSys = e.sys; d.sent = { [TABLE.T.code]: { ent: e.id } }; touch(d, true);
    openDoc(d.id); toast(`${d.title} is a document now, linked to the table's copy.`);
  }
  function srdToDoc(x) {
    const type = x.kind === 'item' ? 'item' : x.kind === 'npc' ? 'character' : 'lore';
    const body = [x.s ? `*${x.s}*` : '', x.x || ''].filter(Boolean).join('\n\n');
    const d = newDoc({ type, title: x.n, body: body + '\n', fields: type === 'character' ? { role: 'NPC', kin: x.d && x.d.type || '' } : type === 'item' ? { kind: x.c || '' } : { cat: x.c || '' }, sheet: SRD.data(x), tags: [] });
    d.sheetSys = x.sys; touch(d, true); openDoc(d.id);
  }
  async function srdToTable(x) {
    if (!TABLE.on()) { toast('Link the campaign to its table first.'); return; }
    if (x.sys !== TABLE.sys() && !(await confirmBox('A different game', `This is ${SRD.SYSTEMS[x.sys]}, and the table plays ${SRD.SYSTEMS[TABLE.sys()] || TABLE.sys()}. Add it anyway?`, 'Add it'))) return;
    try { await TABLE.sendEnt({ kind: x.kind, name: x.n, data: SRD.data(x), sys: x.sys }); toast(`${x.n} is in the table's Library.`); } catch (e) { toast('Could not add it: ' + errText(e)); }
  }
  function playersToDocs(only) {
    let n = 0;
    for (const p of only || TABLE.players()) { if (resolve(p.name)) continue; newDoc({ type: 'character', title: p.name, fields: { role: 'Player character' }, body: TEMPLATES.character }); n++; }
    renderSide(); toast(n ? `Made ${plural(n, 'character document')}.` : 'Every player already has a document.');
  }

  /* ============================== running a session ============================== */
  function runBar(d) {
    d.run = d.run || {};
    const clock = h('span', { class: 'rclock' });
    const tick = () => { if (!clock.isConnected) return clearInterval(t); if (!d.run.start) { clock.textContent = 'Not started'; return; } const s = Math.floor(((d.run.end || Date.now()) - d.run.start) / 1000); clock.textContent = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
    const t = setInterval(tick, 1000); tick();
    const bar = h('div', { class: 'runbar' }, h('span', { html: icon('clock') }), clock,
      !d.run.start ? btn('play', 'Start the clock', () => { d.run.start = Date.now(); delete d.run.end; touch(d, true); renderMain(); }, 'tiny accent2') : null,
      h('span', { class: 'grow' }),
      TABLE.on() ? btn('log', 'Add the table\'s chat', () => pullChat(d), 'tiny') : null,
      btn('check', (d.fields || {}).status === 'Played' ? 'Played' : 'End the session', () => endSession(d), 'tiny' + ((d.fields || {}).status === 'Played' ? ' on' : '')));
    return bar;
  }
  function runLog(d) {
    const inp = h('input', { type: 'text', placeholder: 'What just happened? Enter adds it to the session log, with the time.' });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) { addToSection(d, 'Session log', [`- ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${inp.value.trim()}`]); inp.value = ''; refreshKeepFocus(); } });
    return h('div', { class: 'runlog' }, h('span', { html: icon('edit') }), inp);
  }
  function refreshKeepFocus() { const sc = $('.docscroll'), st = sc ? sc.scrollTop : 0; renderMain(); const s2 = $('.docscroll'); if (s2) s2.scrollTop = st; const i = $('.runlog input'); if (i) i.focus(); }
  function addToSection(d, heading, lines) {
    const L = d.body.split('\n'), at = L.findIndex(l => new RegExp('^#{1,6}\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i').test(l));
    if (at < 0) { d.body = d.body.replace(/\s*$/, '') + `\n\n## ${heading}\n` + lines.join('\n') + '\n'; }
    else { let k = at + 1; while (k < L.length && !/^#{1,6}\s/.test(L[k])) k++; while (k > at + 1 && !L[k - 1].trim()) k--; L.splice(k, 0, ...lines); d.body = L.join('\n'); }
    touch(d);
  }
  async function pullChat(d) {
    if (!TABLE.on()) { toast('Link the campaign to its table first.'); return; }
    const since = (d.run && d.run.start) || (d.fields && d.fields.date ? new Date(d.fields.date + 'T00:00').getTime() : Date.now() - 6 * 3600e3);
    try {
      const all = await TABLE.chatSince(since), have = d.body;
      const lines = all.map(m => `- ${new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${m.who && m.who !== '♪' ? '**' + m.who + '**: ' : m.who === '♪' ? '♪ ' : ''}${String(m.text).replace(/\n+/g, ' ').slice(0, 300)}`).filter(l => !have.includes(l)).slice(-300);
      if (!lines.length) { toast('Nothing new in the table\'s chat since the session started.'); return; }
      addToSection(d, 'At the table', lines); renderMain(); toast(`Added ${plural(lines.length, 'line')} from the table.`);
    } catch (e) { toast('Could not read the chat: ' + errText(e)); }
  }
  async function endSession(d) {
    d.fields = d.fields || {}; d.fields.status = 'Played'; d.run = d.run || {}; if (d.run.start && !d.run.end) d.run.end = Date.now(); touch(d); renderMain(); renderSide();
    const left = openClues(d).length;
    if (await confirmBox('Session played', `${left ? `${plural(left, 'clue')} wasn't found; it comes along to the next session. ` : ''}Plan the next session now?`, 'Plan it')) create('session');
  }

  /* ============================== campaigns ============================== */
  function sysSelect(v) { return h('select', {}, ...Object.entries(SRD.SYSTEMS).map(([k, l]) => h('option', { value: k, text: l, selected: k === (v || 'generic') }))); }
  function newCampaign() {
    const name = h('input', { type: 'text', placeholder: 'The Lantern Road', autofocus: true }), sys = sysSelect('dnd5e'), code = h('input', { type: 'text', placeholder: 'Optional: lobby code or music code', class: 'code' });
    const go2 = async () => { if (!name.value.trim()) { name.focus(); return; } m.close(); await createCampaign({ name: name.value.trim(), sys: sys.value, table: code.value.trim() }); };
    name.addEventListener('keydown', e => { if (e.key === 'Enter') go2(); });
    const m = modal('New campaign', h('div', { class: 'form' }, h('label', {}, 'Name', name), h('label', {}, 'Game', sys), h('label', {}, 'Critter table', code), h('p', { class: 'hint', text: 'The game decides which SRD items, monsters and spells [[ suggests. Linked to a table, the table\'s game counts.' })), [btn(null, 'Cancel', () => m.close(), 'ghost'), btn('plus', 'Create', go2, 'primary')]);
  }
  async function campaignSettings() {
    const c = A.camp; if (!c) return;
    const name = h('input', { type: 'text', value: c.name }), sys = sysSelect(c.sys), code = h('input', { type: 'text', value: c.table || '', placeholder: 'Lobby code or music code', class: 'code' });
    const colors = ['', '#2dd4bf', '#f5a524', '#60a5fa', '#e879f9', '#f87171', '#34d399', '#a78bfa'];
    let color = c.color || '';
    const sw = h('div', { class: 'mpsw' }, ...colors.map(x => h('button', { type: 'button', class: 'sw' + (x === color ? ' on' : ''), style: `--c:${x || 'var(--accent)'}`, title: x ? '' : 'Critter Notes\' own colour', onclick: e => { color = x; $$('.sw', sw).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); } })));
    const where = await STORE.vault().catch(() => ({}));
    const world = h('select', {}, h('option', { value: '', text: 'None' }), ...A.camps.filter(x => x.id !== c.id).map(x => h('option', { value: x.id, text: x.name, selected: x.id === c.world })));
    const save = async () => {
      c.name = name.value.trim() || c.name; c.sys = sys.value; c.color = color;
      if ((c.world || '') !== world.value) { c.world = world.value; await PLAN.loadWorld(); reindex(); }
      const was = c.table; c.table = code.value.trim(); await saveCamp(); m.close();
      if (c.table !== was || TABLE.T.state !== 'on') { if (c.table) TABLE.connect(c.table); else TABLE.disconnect(); }
      render();
    };
    const m = modal('Campaign settings', h('div', { class: 'form' },
      h('label', {}, 'Name', name), h('label', {}, 'Game', sys), h('label', {}, 'Colour', sw),
      h('label', {}, 'Critter table', code), h('p', { class: 'hint', text: 'The lobby code links Notes to the table. Critter\'s music code (lobby code and key, from its Music window) also lets Notes cue Critter Sounds.' }),
      h('label', {}, 'Shared world', world), h('p', { class: 'hint', text: 'Another campaign whose documents this one can link to and read: a setting you run several campaigns in. They stay read-only here.' }),
      h('div', { class: 'row' }, btn('timeline', 'The world\'s calendar…', () => { m.close(); PLAN.calendarDialog(); }, 'tiny')),
      h('div', { class: 'sep' }),
      h('div', { class: 'row wrap' },
        STORE.kind === 'files' ? btn('folder', 'Open its folder', () => STORE.openFolder(c.id)) : null,
        STORE.kind === 'files' ? btn('download', 'Export as Markdown', () => exportMd()) : null,
        btn('download', 'Back up', () => backup()), btn('upload', 'Restore a backup', () => restore())),
      h('p', { class: 'hint', text: STORE.kind === 'files' ? `Kept in ${where.root}.` : 'Kept in this browser. Back it up now and then.' }),
      h('div', { class: 'sep' }),
      h('div', { class: 'row' }, btn('trash', 'Delete this campaign', async () => {
        if (!(await confirmBox('Delete the campaign?', `"${c.name}" and its ${plural(A.docs.size, 'document')} go ${STORE.kind === 'files' ? 'to the recycle bin' : 'for good'}.`, 'Delete it', true))) return;
        m.close(); await flush(); await STORE.trashCampaign(c.id).catch(e => toast(errText(e)));
        A.camps = A.camps.filter(x => x.id !== c.id); A.camp = null; TABLE.disconnect();
        if (A.camps[0]) openCampaign(A.camps[0].id); else { A.docs = new Map(); A.view = { k: 'none' }; render(); }
      }, 'ghost bad'))),
      [btn(null, 'Cancel', () => m.close(), 'ghost'), btn('check', 'Save', save, 'primary')]);
  }
  async function copyToCampaign(d) {
    menu([{ head: 'Copy to…' }, ...A.camps.filter(c => c.id !== cid()).map(c => ({ label: c.name, icon: 'folder', fn: async () => {
      const copy = clone(d); copy.id = rid('d'); copy.parent = ''; copy.created = copy.updated = Date.now(); delete copy.sent; delete copy.table;
      const imgs = new Set([d.img, d.map && d.map.img, ...[...d.body.matchAll(/!\[[^\]]*\]\(img:([^)\s]+)\)/g)].map(m => m[1])].filter(Boolean));
      try { for (const f of imgs) await STORE.copyImage(cid(), c.id, f); await STORE.saveDoc(c.id, copy); toast(`Copied to ${c.name}.`); } catch (e) { toast('Could not copy it: ' + errText(e)); }
    } }))], { x: innerWidth / 2 - 100, y: innerHeight / 3 });
  }

  /* ============================== exports and backups ============================== */
  const safeName = s => String(s || 'Untitled').replace(/[<>:"/\\|?*\x00-\x1f#^[\]]/g, '').replace(/[. ]+$/, '').trim().slice(0, 80) || 'Untitled';
  async function exportMd() {
    await flush();
    const files = [], imgs = new Set();
    const fix = s => s.replace(/!\[([^\]]*)\]\(img:([^)\s]+)\)/g, (a, alt, f) => { imgs.add(f); return `![${alt}](../images/${f})`; })
      .replace(/\[\[(table|srd|sound|roll):([^\]|]*)(?:\|([^\]]*))?\]\]/gi, (a, k, ref, label) => label || ref.split('/').pop());
    for (const d of A.docs.values()) {
      const fm = ['---', `type: ${d.type}`, ...Object.entries(d.fields || {}).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), d.tags && d.tags.length ? `tags: [${d.tags.map(t => JSON.stringify(t)).join(', ')}]` : '', d.parent && D(d.parent) ? `parent: "[[${D(d.parent).title}]]"` : '', '---', ''].filter(x => x !== '');
      let body = fix(d.body);
      if (d.img) { imgs.add(d.img); body = `![](../images/${d.img})\n\n` + body; }
      if (d.map && d.map.img) { imgs.add(d.map.img); body = `![](../images/${d.map.img})\n\n` + body + `\n\n## Pins\n` + (d.map.pins || []).map(p => `- ${p.doc && D(p.doc) ? `[[${D(p.doc).title}${p.label && p.label !== D(p.doc).title ? '|' + p.label : ''}]]` : p.label || 'Pin'}`).join('\n'); }
      files.push({ path: `${TYPES[d.type].plural}/${safeName(d.title)}.md`, text: fm.join('\n') + '\n' + body + '\n' });
    }
    for (const f of imgs) files.push({ path: `images/${f}`, img: f });
    const out = await STORE.exportMd(cid(), A.camp.name, files).catch(e => { toast(errText(e)); return null; });
    if (out) toast('Exported to ' + out);
  }
  const blobToData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  async function backup() {
    await flush();
    const images = {}, files = new Set();
    for (const d of A.docs.values()) { if (d.img) files.add(d.img); if (d.map && d.map.img) files.add(d.map.img); for (const m of d.body.matchAll(/!\[[^\]]*\]\(img:([^)\s]+)\)/g)) files.add(m[1]); }
    for (const f of files) { try { images[f] = await blobToData(await (await fetch(await STORE.imageUrl(cid(), f))).blob()); } catch {} }
    const text = JSON.stringify({ app: 'critter-notes', v: 1, at: Date.now(), camp: A.camp, docs: [...A.docs.values()], images });
    const out = await STORE.saveFile(`${safeName(A.camp.name)} ${new Date().toISOString().slice(0, 10)}.critter-notes.json`, text).catch(e => { toast(errText(e)); return null; });
    if (out) toast('Backed up.');
  }
  async function restore() {
    const text = await STORE.openFile().catch(() => null); if (!text) return;
    let j; try { j = JSON.parse(text); } catch { toast('That isn\'t a Critter Notes backup.'); return; }
    if (!j || j.app !== 'critter-notes' || !j.camp || !Array.isArray(j.docs)) { toast('That isn\'t a Critter Notes backup.'); return; }
    const meta = { ...j.camp, id: rid('c'), name: A.camps.some(c => c.name === j.camp.name) ? j.camp.name + ' (restored)' : j.camp.name, updated: Date.now() };
    await STORE.saveCampaign(meta);
    for (const [f, data] of Object.entries(j.images || {})) { try { await STORE.putImage(meta.id, await (await fetch(data)).blob(), f); } catch {} }
    for (const d of j.docs) if (d && d.id) await STORE.saveDoc(meta.id, d);
    A.camps.unshift(meta); await openCampaign(meta.id); toast(`Restored ${meta.name}: ${plural(j.docs.length, 'document')}.`);
  }

  /* ============================== menus and help ============================== */
  function command(k) {
    if (k === 'new-campaign') newCampaign(); else if (k === 'campaign-settings') campaignSettings(); else if (k === 'open-folder') STORE.openFolder(cid());
    else if (k === 'vault') vaultDialog(); else if (k === 'export-md') exportMd(); else if (k === 'backup') backup(); else if (k === 'restore') restore();
    else if (k === 'shortcuts') shortcuts(); else if (k === 'about') about();
    else if (k === 'import-md' && A.camp) PLAN.importMd(false); else if (k === 'import-folder' && A.camp) PLAN.importMd(true); else if (k === 'appearance') appearance();
  }
  function pageMenu(at) {
    menu([{ label: 'New campaign…', icon: 'plus', fn: () => newCampaign() }, { label: 'Campaign settings…', icon: 'edit', disabled: !A.camp, fn: () => campaignSettings() }, '-',
      { label: 'Import Markdown files…', icon: 'upload', disabled: !A.camp, fn: () => PLAN.importMd(false) }, { label: 'Import a folder…', icon: 'folder', disabled: !A.camp, fn: () => PLAN.importMd(true) },
      { label: 'Back up this campaign…', icon: 'download', disabled: !A.camp, fn: () => backup() }, { label: 'Restore a backup…', icon: 'upload', fn: () => restore() }, '-',
      { label: 'Appearance…', icon: 'moon', fn: () => appearance() },
      { label: 'Homebase…', icon: 'globe', fn: () => window.CRITBOARD_DESKTOP && window.CRITBOARD_DESKTOP.changeHomebase() }, { label: 'Keyboard shortcuts', icon: 'help', fn: () => shortcuts() }, { label: 'About Critter Notes', icon: 'note', fn: () => about() }], at);
  }
  async function vaultDialog() {
    const v = await STORE.vault();
    const m = modal('Where campaigns are kept', h('div', {}, h('p', { text: v.root }), h('p', { class: 'hint', text: 'Each campaign is a folder of plain files: campaign.json, a docs folder with one file per document, and an images folder. Put it in a synced folder (OneDrive, Dropbox, a Git repository) to keep it safe.' })),
      [btn('folder', 'Open it', () => STORE.openFolder()), btn(null, 'Choose another folder…', async () => { const r = await STORE.pickVault(); if (r) { m.close(); await flush(); await loadCampaigns(); A.camp = null; if (A.camps[0]) openCampaign(A.camps[0].id); else render(); toast('Now using ' + r.root); } }, 'primary')]);
  }
  // how it looks and reads: theme, text size and font, the writing toolbar
  function appearance() {
    const P = A.prefs, opt = (name, label, val, cur) => h('label', { class: 'radio' }, h('input', { type: 'radio', name, value: val, checked: cur === val }), label);
    const box = h('div', { class: 'form' },
      h('fieldset', {}, h('legend', { text: 'Theme' }), opt('th', 'Dark', 'dark', P.theme), opt('th', 'Light', 'light', P.theme), opt('th', 'As Windows is set', 'system', P.theme)),
      h('fieldset', {}, h('legend', { text: 'Reading text' }), opt('rs', 'Small', 's', P.readSize), opt('rs', 'Medium', 'm', P.readSize), opt('rs', 'Large', 'l', P.readSize), opt('rs', 'Larger', 'xl', P.readSize)),
      h('fieldset', {}, h('legend', { text: 'Reading font' }), opt('rf', 'Book (serif)', 'serif', P.readFont), opt('rf', 'Plain (sans-serif)', 'sans', P.readFont)),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: P.toolbar, id: 'tbOn' }), 'Show the writing toolbar'));
    box.addEventListener('change', e => {
      const t = e.target; if (t.name === 'th') P.theme = t.value; else if (t.name === 'rs') P.readSize = t.value; else if (t.name === 'rf') P.readFont = t.value; else if (t.id === 'tbOn') P.toolbar = t.checked;
      savePrefs(); applyLook();
    });
    const m = modal('Appearance', box, [btn('check', 'Done', () => m.close(), 'primary')]);
  }
  function shortcuts() {
    const rows = [['Ctrl+K', 'Find anything'], ['Ctrl+N', 'New document'], ['Ctrl+E', 'Read or write'], ['Ctrl+M', 'Mind map'], ['Ctrl+G', 'The graph'], ['Ctrl+\\', 'Side panel'], ['Alt+← / Alt+→', 'Back and forward'], ['Ctrl+S', 'Save now (it saves by itself)'], ['Ctrl+.', 'Focus: only the page'], ['Ctrl+Shift+E', 'Encounter builder'],
      ['[[', 'Link a document, table entry, SRD entry or sound'], ['/', 'Add a block, at the start of a line'], ['Ctrl+B / Ctrl+I', 'Bold, italic'], ['Ctrl+L', 'Start a link'], ['Tab / Shift+Tab', 'Indent or outdent a list'], ['Double-click', 'Edit the text there'],
      ['↑ ↓ → ←', 'Move in the sidebar; open and close'], ['Shift+F10', 'The menu of a document in the sidebar'], ['N (on a board)', 'A new card; Enter writes in it, arrows move it']];
    const syn = [['[[Name]]', 'a link to a document; [[Name|other words]] shows other words'], ['> [!branch] If they…', 'an alternative path'], ['> [!read]', 'read-aloud text'], ['> [!secret]', 'GM only: never sent to players'], ['> [!clue]  > [!combat]  > [!loot]', 'a clue, an encounter, treasure'], ['- [ ] something', 'a box to tick'], ['#tag', 'a tag'], ['[[roll:2d6+3]]', 'a dice button'], ['[[sound:…]]', 'a Critter Sounds cue (pick one from the Sounds tab)'], ['| d6 | … |', 'a table whose first heading is a die gets a Roll button']];
    modal('Keyboard and writing', h('div', { class: 'keys' }, h('table', {}, ...rows.map(([k, l]) => h('tr', {}, h('td', {}, h('kbd', { text: k })), h('td', { text: l })))), h('h4', { text: 'Writing' }), h('table', {}, ...syn.map(([k, l]) => h('tr', {}, h('td', {}, h('code', { text: k })), h('td', { text: l }))))), null, { wide: true });
  }
  async function about() {
    const ix = await SRD.index(); const credits = Object.entries(ix.systems || {}).map(([k, v]) => h('p', { class: 'hint', text: `${SRD.SYSTEMS[k] || k}: ${v.credit || ''}` }));
    modal('About Critter Notes', h('div', {}, h('p', { text: 'Critter Notes 1.0: a notebook for game masters, made to work with Critter and Critter Sounds.' }), h('h4', { text: 'SRD content' }), ...credits), null, { wide: true });
  }

  /* ============================== the sample campaign ============================== */
  async function sample() {
    const meta = await createCampaign({ name: 'The Lantern Road (sample)', sys: 'dnd5e' });
    meta.cal = { months: ['Thaw', 'Seedfall', 'Highsun', 'Brightwane', 'Emberfall', 'Longdark'], days: [30, 30, 31, 30, 30, 32], era: 'AL', now: { y: 1204, m: 5, d: 12 } };
    meta.clocks = [{ id: 'kfog', name: 'The fog reaches the harbour', size: 6, filled: 2 }];
    await STORE.saveCampaign(meta);
    let mapFile = '';
    try { mapFile = await STORE.putImage(meta.id, await drawSampleMap(), 'gallowmere-reach.png'); } catch {}
    const mk = o => newDoc(o);
    const town = mk({ type: 'location', title: 'Gallowmere', fields: { kind: 'Fishing town', mood: 'Fog, tar and lantern smoke' }, tags: ['coast'], body: `> [!read] First look
> Gallowmere clings to the cliffs like a barnacle. Every door has a lantern, and every lantern is lit, even at noon.

## Who's here
- [[Mother Vey]], keeper of the lamps
- The Wick Society's chapterhouse, see [[The Wick Society]]

## What's here
- [[The Drowned Lantern]], the only tavern
- The harbour, half of it sunk

## Hooks
- [ ] The seventh lamp on the sea wall went out last night
- [ ] Fishermen won't sail past the [[Marrow's Hulk|wreck]]

> [!secret] Hidden
> The lamps keep something *in*, not something out. See [[The Long Dark]].
` });
    const tavern = mk({ type: 'location', title: 'The Drowned Lantern', parent: town.id, fields: { kind: 'Tavern', region: 'Gallowmere', ruler: 'Mother Vey' }, body: `> [!read] First look
> The floor is wet and the bar is a ship's keel. A brass lantern hangs from the ceiling, full of seawater, and something small swims in it.

## Who's here
- Barkeep Odo Fenn, knows every rumour, sells half of them
- Three fishermen who saw lights under the water

## Overheard at the bar
| d6 | Rumour |
| --- | --- |
| 1 | The seventh lamp burned green the night before it died |
| 2 | Brother Taddeo bought a boat he can't afford |
| 3 | A drowned sailor was seen buying ale |
| 4 | Mother Vey hasn't aged a day in forty years |
| 5 | The wreck rings its bell when the tide turns |
| 6 | Nothing true, but a good story about a mermaid |

## Prices
| Thing | Price |
| --- | --- |
| Ale | 4 cp |
| A bed | 5 sp |
| A rumour | 1 gp |
` });
    mk({ type: 'character', title: 'Mother Vey', fields: { role: 'Patron', kin: 'Human', home: 'Gallowmere', faction: 'The Wick Society', status: 'Alive', voice: 'Slow, warm, never blinks', want: 'Every lamp lit before the winter tide', secret: 'She is three hundred years old; the lamps keep her alive too' }, body: `## Look
- Grey braid wound with copper wire
- Smells of lamp oil and lavender

## Personality
- Kind until she's lied to
- Answers questions with questions

## Relationships
- Leads [[The Wick Society]]
- Fears [[Captain Ise Marrow]]

> [!secret] What the players don't know
> She lit the first lamp, and she knows what happens when the last one goes out.
` });
    mk({ type: 'character', title: 'Captain Ise Marrow', fields: { role: 'Villain', kin: 'Drowned human', home: "Marrow's Hulk", status: 'Unknown', voice: 'Wet laughter, speaks in the plural', want: 'Every lamp dark' }, tags: ['villain'], body: `## Story
Marrow sank with her ship forty years ago, chasing the [[The Last Lantern|Last Lantern]]. Something in [[The Long Dark]] gave her a second life, for a price.

## In a fight
Use the [[srd:dnd5e/npc/Bandit Captain|Bandit Captain]] with resistance to cold. Her crew are [[srd:dnd5e/npc/Zombie|Zombies]].
` });
    mk({ type: 'faction', title: 'The Wick Society', fields: { leader: 'Mother Vey', base: 'Gallowmere', goal: 'Keep the seven lamps burning', stance: 'Friendly' }, body: `## Goals
- Keep the seven lamps lit
- Find [[The Last Lantern]]

## Members
- [[Mother Vey]]
- Brother Taddeo, oil-merchant, secretly in debt to smugglers
` });
    mk({ type: 'item', title: 'The Last Lantern', fields: { kind: 'Wondrous item', rarity: 'Legendary', holder: 'Captain Ise Marrow' }, body: `## Description
A lantern of black glass. Its flame burns downward.

## Properties
- Sheds light only the bearer can see
- Once a day: [[roll:1d20+5]] to banish a shadow-born creature
` });
    const quest = mk({ type: 'quest', title: 'Light the Seven Lamps', fields: { status: 'Active', giver: 'Mother Vey', where: 'Gallowmere', reward: '500 gp and a Wick Society ring' }, body: `## Hook
The seventh lamp on the sea wall has gone out, and nobody will go near it.

## Steps
- [ ] Find out why the seventh lamp went out
- [ ] Bring oil from the wreck of [[Marrow's Hulk]]
- [ ] Relight the lamp at the winter tide

## Outcomes
> [!branch] If they succeed
> - [[Mother Vey]] trusts them with the truth about [[The Long Dark]]

> [!branch] If they fail
> - The fog rolls in for good; [[Captain Ise Marrow]] comes ashore
` });
    mk({ type: 'lore', title: 'The Long Dark', fields: { cat: 'History', era: 'Three centuries ago' }, body: `Before Gallowmere, the coast was a door. The first lamp was lit to keep it shut.

> [!secret]
> The door opens a little each time a lamp goes out. Seven dark lamps and it opens all the way.
` });
    mk({ type: 'session', title: 'Session 1: The Seventh Lamp', fields: { num: 1, date: new Date().toISOString().slice(0, 10), status: 'Ready' }, body: `## Strong start
> [!read] Opening
> The bell on the sea wall rings by itself at midnight. Every lantern in [[Gallowmere]] gutters at once, all but one.

## Scenes
### Scene 1: The Drowned Lantern
- Meet [[Mother Vey]] at [[The Drowned Lantern]]
- She offers the job: [[Light the Seven Lamps]]

> [!branch] If the party refuses
> - The fishermen beg instead; a child goes missing that night
> - Vey comes back with double the pay

### Scene 2: The sea wall
- The seventh lamp is full of seawater, not oil
- A [[srd:dnd5e/item/Potion of Healing|Potion of Healing]] in the keeper's hut

> [!combat] Drowned crew
> - 4 [[srd:dnd5e/npc/Zombie|Zombies]] climb the wall at the tide
> - They flee from bright light

> [!branch] If they go to the wreck first
> - Skip to Scene 3; the lamp goes out a second time while they're away

### Scene 3: Marrow's Hulk
- [[Captain Ise Marrow]] offers a deal: let the lamp die, and she spares the town

## Secrets & clues
- [ ] The seawater in the lamp is warm
- [ ] Brother Taddeo sold the lamp oil to smugglers
- [ ] Marrow's ship carried a black lantern when it sank
- [ ] Mother Vey's name is in a ship's log from three hundred years ago

## Treasure
- 40 gp in a drowned purse, a silver bell (25 gp)
- Clue to [[The Last Lantern]]

## Session log
` });
    if (mapFile) mk({ type: 'map', title: 'Gallowmere Reach', body: 'The coast around Gallowmere. Click a pin to see where it leads; drag documents from the sidebar onto the map to pin them.\n', map: { img: mapFile, w: 0, h: 0, pins: [
      { id: 'p1', x: 0.56, y: 0.47, label: 'Gallowmere', doc: town.id, color: '' }, { id: 'p2', x: 0.6, y: 0.53, label: 'The Drowned Lantern', doc: tavern.id, color: '' },
      { id: 'p3', x: 0.24, y: 0.68, label: "Marrow's Hulk", doc: '', color: '#f87171' }, { id: 'p4', x: 0.5, y: 0.36, label: 'The seventh lamp', doc: quest.id, color: '#f5a524' },
      { id: 'p5', x: 0.79, y: 0.24, label: 'Old watchtower', doc: '', color: '' }] } });
    // ties, clocks, events and a board, so every page has something on it
    const by = t => [...A.docs.values()].find(x => x.title === t);
    const vey = by('Mother Vey'), ise = by('Captain Ise Marrow'), wick = by('The Wick Society');
    vey.rels = [{ to: wick.id, label: 'leads' }, { to: ise.id, label: 'fears' }]; ise.rels = [{ to: by('The Last Lantern').id, label: 'hunts' }, { to: vey.id, label: 'swore revenge on' }];
    wick.fields.clock = { size: 8, filled: 3 }; by('Light the Seven Lamps').fields.clock = { size: 6, filled: 1 };
    [vey, ise, wick].forEach(x => touch(x, true));
    mk({ type: 'event', title: 'The first lamp is lit', fields: { when: { y: 904, m: 1, d: 1 }, where: 'Gallowmere', who: 'Mother Vey' }, body: 'The coast is a door, and Vey shuts it with fire.\n' });
    mk({ type: 'event', title: 'Marrow\'s ship goes down', fields: { when: { y: 1164, m: 6, d: 30 }, where: "Marrow's Hulk", who: 'Captain Ise Marrow' }, body: 'She chased a black lantern into the fog and never came back. Not as she was.\n' });
    mk({ type: 'event', title: 'The seventh lamp goes out', fields: { when: { y: 1204, m: 5, d: 11 }, where: 'Gallowmere' }, body: 'The night before the party arrives.\n' });
    mk({ type: 'event', title: 'The winter tide', fields: { when: { y: 1204, m: 6, d: 21 }, era: '' }, body: 'The lamp must burn by then, or the door opens.\n' });
    const s1 = by('Session 1: The Seventh Lamp'); s1.fields.when = { y: 1204, m: 5, d: 12 }; touch(s1, true);
    mk({ type: 'board', title: 'How Session 1 might go', board: { cards: [
      { id: 'c1', x: 0, y: 0, w: 220, text: '**Strong start**\nThe bell rings at midnight' },
      { id: 'c2', x: 300, y: -60, w: 220, doc: tavern.id },
      { id: 'c3', x: 300, y: 120, w: 220, text: 'The party refuses: a child goes missing', color: '#f5a524' },
      { id: 'c4', x: 600, y: 0, w: 220, text: 'The sea wall\n4 drowned crew', color: '#f87171' },
      { id: 'c5', x: 900, y: 0, w: 220, doc: quest.id }],
      links: [{ id: 'l1', a: 'c1', b: 'c2', label: '' }, { id: 'l2', a: 'c2', b: 'c3', label: 'if they say no' }, { id: 'l3', a: 'c2', b: 'c4', label: 'they take the job' }, { id: 'l4', a: 'c3', b: 'c4', label: 'later' }, { id: 'l5', a: 'c4', b: 'c5', label: '' }] } });
    reindex(); await flush(); go({ k: 'home' }, true);
    toast('Here is a small sample campaign to look around in.');
  }
  // a parchment coast drawn on the spot, so the sample has a map to pin
  function drawSampleMap() {
    const W = 1600, H = 1000, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const bg = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 900); bg.addColorStop(0, '#efe0bb'); bg.addColorStop(1, '#c9b07a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(90,60,20,${rnd() * 0.05})`; g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 3, 2 + rnd() * 3); }
    // the sea, on the left and bottom
    const coast = []; for (let i = 0; i <= 40; i++) { const t = i / 40; coast.push([W * (0.34 + 0.12 * Math.sin(t * 5.2) + 0.05 * Math.sin(t * 17) + (rnd() - 0.5) * 0.03), H * t]); }
    g.beginPath(); g.moveTo(0, 0); coast.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(0, H); g.closePath();
    g.fillStyle = '#9fb7b0'; g.fill();
    g.save(); g.clip(); g.strokeStyle = 'rgba(40,70,80,.25)'; g.lineWidth = 1.5;
    for (let y = 10; y < H; y += 26) { g.beginPath(); for (let x = 0; x < W * 0.6; x += 30) { g.moveTo(x + (y % 52 ? 0 : 15), y); g.quadraticCurveTo(x + 8 + (y % 52 ? 0 : 15), y - 5, x + 16 + (y % 52 ? 0 : 15), y); } g.stroke(); }
    g.restore();
    g.beginPath(); coast.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = '#4b3a22'; g.lineWidth = 4; g.stroke();
    // mountains, forests, a river and a road
    const mount = (x, y, s) => { g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y - s * 1.3); g.lineTo(x + s, y); g.fillStyle = '#d8c493'; g.fill(); g.strokeStyle = '#4b3a22'; g.lineWidth = 2.5; g.stroke(); g.beginPath(); g.moveTo(x, y - s * 1.3); g.lineTo(x + s * 0.3, y); g.strokeStyle = 'rgba(75,58,34,.5)'; g.stroke(); };
    for (let i = 0; i < 26; i++) mount(W * (0.68 + rnd() * 0.28), H * (0.08 + rnd() * 0.3), 22 + rnd() * 20);
    for (let i = 0; i < 160; i++) { const x = W * (0.62 + rnd() * 0.3), y = H * (0.55 + rnd() * 0.38); g.beginPath(); g.arc(x, y, 7 + rnd() * 5, 0, 7); g.fillStyle = '#7f8f4e'; g.fill(); g.strokeStyle = '#3d4422'; g.lineWidth = 1.6; g.stroke(); }
    g.beginPath(); g.moveTo(W * 0.82, H * 0.3); g.bezierCurveTo(W * 0.72, H * 0.42, W * 0.7, H * 0.5, W * 0.565, H * 0.47); g.strokeStyle = '#5f8a95'; g.lineWidth = 6; g.stroke();
    g.setLineDash([14, 10]); g.beginPath(); g.moveTo(W * 0.58, H * 0.48); g.bezierCurveTo(W * 0.66, H * 0.6, W * 0.74, H * 0.46, W * 0.99, H * 0.56); g.strokeStyle = '#6b4b26'; g.lineWidth = 3.5; g.stroke(); g.setLineDash([]);
    // the town and the wreck
    for (let i = 0; i < 14; i++) { const x = W * (0.55 + rnd() * 0.06), y = H * (0.44 + rnd() * 0.08); g.fillStyle = '#8a5a35'; g.fillRect(x, y, 10, 8); g.strokeStyle = '#3a2614'; g.lineWidth = 1.5; g.strokeRect(x, y, 10, 8); }
    g.save(); g.translate(W * 0.24, H * 0.68); g.rotate(-0.4); g.fillStyle = '#5a4026'; g.beginPath(); g.ellipse(0, 0, 34, 10, 0, 0, 7); g.fill(); g.fillRect(-2, -34, 4, 30); g.restore();
    // a compass
    g.save(); g.translate(W * 0.1, H * 0.13); g.strokeStyle = '#4b3a22'; g.fillStyle = '#4b3a22'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 44, 0, 7); g.stroke();
    for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -56); g.lineTo(8, 0); g.lineTo(-8, 0); g.closePath(); k % 2 ? g.stroke() : g.fill(); }
    g.restore(); g.font = 'italic 700 30px Georgia, serif'; g.fillStyle = '#4b3a22'; g.fillText('N', W * 0.1 - 10, H * 0.13 - 66);
    g.strokeStyle = '#4b3a22'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }

  return { appearance, SOUND_KIND, welcome, home, graph, renderRightPanel, sendMenu, send, runBar, runLog, playCue, soundPicker, scenePicker, sceneToFile, entToDoc, srdToDoc, srdToTable, copyToCampaign, newCampaign, campaignSettings, pageMenu, command, shortcuts, about, sample };
})();
function renderRight() { VIEWS.renderRightPanel(); }
