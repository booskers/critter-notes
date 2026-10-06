/* Critter Notes: writing a campaign together, through the table's Homebase.
   Roles (A.camp.share.role):
   - 'gm': the campaign's own author. Turning sharing on uploads it.
   - 'writer': a co-writer (co-owner). Joins with an invite code: the lobby code and the writer key. Everything syncs both ways.
   - 'player': joins with the lobby code and their Critter VTT player. Sees only what the GM shares with them, without secrets,
     and keeps their own notes, which are their notes in Critter VTT too.
   On the Homebase, under the lobby:
     cnw/<doc id>    { iv, ct, ts, by } a document, sealed with AES-GCM under a key made from the writer key; or { deleted, ts, by }
     cnw/_camp       the campaign's own settings (name, game, calendar, clocks, groups), sealed the same way
     cniw/<file>     { n, iv } and cniw/<file>_<i> { d }: a picture, sealed, in pieces
     cnp/<doc id>    { title, type, body, fields, img, banner, map, to: 'all' | [player ids], ts } what players may read, in the clear
     cnip/<file>…    the pictures those use, in the clear
   Players' own notes are Critter VTT's: lobbies/<code>/notes/<id> with owner = their player id.
   Anyone with the lobby code can reach a lobby's data (Critter VTT works that way too); the writer key is what keeps the GM's
   own documents, secrets and all, unreadable to them. Last change wins, per document. */
const SYNC = (() => {
  const S = { on: false, role: '', code: '', key: null, offs: [], pushT: new Map(), applying: false, queue: new Map(), tok: 0 };
  // this computer's id in the sync (made the first time it's needed; app.js isn't loaded yet when this file runs)
  let meV = ''; const me = () => meV || (meV = LS.get('syncId', '') || (() => { const v = rid('s'); LS.set('syncId', v); return v; })());
  const enc = s => new TextEncoder().encode(s), dec = b => new TextDecoder().decode(b);
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const P = (...a) => `lobbies/${S.code}/` + a.join('/');
  const fid = f => String(f).replace(/[^\w]/g, '_').slice(0, 60);
  const db = () => TABLE.T.db;
  async function keyFor(code, wkey) { const raw = await crypto.subtle.digest('SHA-256', enc(`critter-notes:${code}:${wkey}`)); return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  async function seal(obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, S.key, enc(JSON.stringify(obj)))) }; }
  async function unseal(x) { return JSON.parse(dec(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(x.iv) }, S.key, unb64(x.ct)))); }
  const role = () => (A.camp && A.camp.share && A.camp.share.on ? A.camp.share.role : '');
  const isWriter = () => role() === 'gm' || role() === 'writer';
  const isPlayer = () => role() === 'player';

  /* ---------- starting and stopping, with the campaign ---------- */
  async function start() {
    stop(); const sh = A.camp && A.camp.share; if (!sh || !sh.on) return;
    const tok = ++S.tok;
    for (let i = 0; i < 60 && !(TABLE.on() && TABLE.T.code === sh.code); i++) { await new Promise(r => setTimeout(r, 250)); if (tok !== S.tok) return; }
    if (!(TABLE.on() && TABLE.T.code === sh.code)) { toast('Could not reach the table to sync. Notes keeps trying when you reopen the campaign.'); return; }
    Object.assign(S, { on: true, role: sh.role, code: sh.code });
    if (isWriter()) {
      S.key = await keyFor(sh.code, sh.wkey);
      S.offs.push(db().collection(P('cnw')).onSnapshot(snap => onWriters(snap), () => {}));
    } else if (isPlayer()) {
      S.offs.push(db().collection(P('cnp')).onSnapshot(snap => onShared(snap), () => {}));
      S.offs.push(db().collection(P('notes')).where('owner', '==', sh.pid).onSnapshot(snap => onMyNotes(snap), () => {}));
    }
    paintRole();
  }
  function stop() { S.tok++; S.offs.forEach(f => { try { f(); } catch {} }); S.offs = []; S.on = false; S.key = null; }

  /* ---------- writers: everything, both ways ---------- */
  const seen = new Map();
  async function onWriters(snap) {
    let changed = false;
    for (const d0 of snap.docs) {
      const x = d0.data() || {}, id = d0.id;
      if (x.by === me() || seen.get(id) === x.ts) continue; seen.set(id, x.ts);
      try {
        if (id === '_camp') { const m = await unseal(x); if ((x.ts || 0) > (A.camp.syncTs || 0)) { for (const k of ['name', 'sys', 'cal', 'clocks', 'groups', 'color']) if (m[k] !== undefined) A.camp[k] = m[k]; A.camp.syncTs = x.ts; await STORE.saveCampaign(A.camp); changed = true; } continue; }
        const local = A.docs.get(id);
        if (x.deleted) { if (local && (local.updated || 0) <= x.ts) { A.docs.delete(id); await STORE.trashDoc(cid(), id).catch(() => {}); changed = true; } continue; }
        const doc = await unseal(x);
        if (local && (local.updated || 0) >= (doc.updated || 0)) continue;
        // the one being written in right now waits until the writing pauses
        if (A.view.k === 'doc' && A.view.id === id && A.ed && A.ed.root.contains(document.activeElement)) { S.queue.set(id, doc); continue; }
        A.docs.set(id, doc); await STORE.saveDoc(cid(), doc); await fetchImages(doc, 'w'); changed = true;
      } catch (e) { console.warn('sync', id, e); }
    }
    if (changed) { reindex(); render(); }
  }
  // after a pause in writing, a change someone else made to the open document comes in
  setInterval(() => { for (const [id, doc] of S.queue) { if (A.view.k === 'doc' && A.view.id === id && A.ed && A.ed.root.contains(document.activeElement)) continue; S.queue.delete(id); const l = A.docs.get(id); if (!l || (l.updated || 0) < (doc.updated || 0)) { A.docs.set(id, doc); STORE.saveDoc(cid(), doc); reindex(); render(); toast(`${doc.title} was changed by a co-writer.`); } } }, 3000);
  function dirty(d) {
    if (!S.on) return;
    if (isPlayer()) { if (d.cnote) { clearTimeout(S.pushT.get(d.id)); S.pushT.set(d.id, setTimeout(() => pushNote(d), 1200)); } return; }
    if (!isWriter()) return;
    clearTimeout(S.pushT.get(d.id)); S.pushT.set(d.id, setTimeout(() => push(d), 1200));
  }
  async function push(d) {
    if (!S.on || !isWriter() || !A.docs.has(d.id)) return;
    try {
      await sendImages(d, 'w');
      await db().doc(P('cnw', d.id)).set({ ...(await seal(d)), ts: d.updated || Date.now(), by: me() });
      await pushPlayers(d);
    } catch (e) { toast('Could not sync "' + d.title + '": ' + errText(e)); }
  }
  async function removed(id) { if (!S.on || !isWriter()) return; const ts = Date.now(); await db().doc(P('cnw', id)).set({ deleted: true, ts, by: me() }).catch(() => {}); await db().doc(P('cnp', id)).delete().catch(() => {}); }
  async function campDirty() {
    if (!S.on || !isWriter()) return;
    const m = {}; for (const k of ['name', 'sys', 'cal', 'clocks', 'groups', 'color']) if (A.camp[k] !== undefined) m[k] = A.camp[k];
    // only when something the others see has changed
    const sig = JSON.stringify(m); if (sig === S.campSig) return; S.campSig = sig; const ts = Date.now(); A.camp.syncTs = ts;
    await db().doc(P('cnw', '_camp')).set({ ...(await seal(m)), ts, by: me() }).catch(() => {});
  }
  // the GM turns sharing on: everything goes up
  async function share() {
    if (!TABLE.on()) { toast('Link the campaign to its Critter VTT table first.'); return false; }
    const wkey = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
    A.camp.share = { on: true, role: 'gm', code: TABLE.T.code, wkey, sent: [], psent: [], got: [] }; await saveCamp();
    await start(); if (!S.on) return false;
    const all = [...A.docs.values()]; let n = 0;
    toast(`Sharing ${plural(all.length, 'document')}…`);
    await campDirty();
    for (const d of all) { await push(d); n++; if (n % 10 === 0) toast(`Shared ${n} of ${all.length}…`); }
    toast('Shared. Co-writers join with the invite code in Settings; players with the lobby code.');
    return true;
  }
  async function unshare(wipe) {
    const sh = A.camp.share; if (!sh) return;
    if (wipe && TABLE.on()) { for (const col of ['cnw', 'cnp', 'cniw', 'cnip']) { try { const s = await db().collection(P(col)).get(); for (const d of s.docs) await db().doc(P(col, d.id)).delete(); } catch {} } }
    stop(); A.camp.share = { ...sh, on: false }; await saveCamp(); paintRole();
  }
  const inviteCode = () => (A.camp.share && A.camp.share.role !== 'player' ? `${A.camp.share.code}-${A.camp.share.wkey}` : '');

  /* ---------- what players see ---------- */
  const visibleTo = d => (d.access === 'all' ? 'all' : Array.isArray(d.access) && d.access.length ? d.access : null);
  async function pushPlayers(d) {
    const to = visibleTo(d);
    if (!to) { if (d.wasShared) { await db().doc(P('cnp', d.id)).delete().catch(() => {}); d.wasShared = false; } return; }
    const fields = {}; for (const [k, , kind] of FIELDS[d.type] || []) if (k !== 'secret' && d.fields && d.fields[k] !== undefined && d.fields[k] !== '') fields[k] = kind === 'clock' ? d.fields[k] : d.fields[k];
    const shared = id => { const x = A.docs.get(id); return x && visibleTo(x); };
    const doc = { title: d.title, type: d.type, body: MD.forPlayers(d.body), fields, img: d.img || '', banner: d.banner || '', to, ts: d.updated || Date.now(), created: d.created };
    if (d.map) doc.map = { img: d.map.img, w: d.map.w, h: d.map.h, edge: d.map.edge, scale: d.map.scale, pins: (d.map.pins || []).map(p => ({ id: p.id, x: p.x, y: p.y, label: p.label, color: p.color, doc: p.doc && shared(p.doc) ? p.doc : '' })) };
    if (d.board) doc.board = { cards: (d.board.cards || []).map(c => ({ ...c, doc: c.doc && shared(c.doc) ? c.doc : '' })), links: d.board.links || [] };
    await sendImages({ img: doc.img, banner: doc.banner, map: doc.map, body: doc.body }, 'p');
    await db().doc(P('cnp', d.id)).set(doc); d.wasShared = true;
  }
  // a player's campaign: what's shared with them, read only; and their own notes
  async function onShared(snap) {
    const pid = A.camp.share.pid, docs = new Map();
    for (const d0 of snap.docs) {
      const x = d0.data() || {}; if (!(x.to === 'all' || (Array.isArray(x.to) && x.to.includes(pid)))) continue;
      const d = { id: d0.id, type: TYPES[x.type] ? x.type : 'note', title: String(x.title || 'Untitled'), body: String(x.body || ''), fields: x.fields || {}, tags: [], img: x.img || '', banner: x.banner || '', map: x.map, board: x.board, created: x.created || x.ts, updated: x.ts || 0, world: 'campaign', locked: true };
      docs.set(d.id, d); fetchImages(d, 'p');
    }
    A.wdocs = docs; A.wname = A.camp.name; reindex(); render();
  }
  function onMyNotes(snap) {
    const keep = new Map([...A.docs].filter(([, d]) => !d.cnote));
    for (const d0 of snap.docs) {
      const x = d0.data() || {}; if (x.kind === 'head') continue;
      const id = 'cn_' + d0.id, old = A.docs.get(id);
      if (old && S.pushT.has(id)) { keep.set(id, old); continue; }
      keep.set(id, { id, cnote: d0.id, type: 'note', title: String(x.title || (String(x.text || '').split('\n')[0] || 'Note').replace(/^#+\s*/, '').slice(0, 60)), body: String(x.text || ''), fields: {}, tags: [], img: '', created: +x.ts || 0, updated: +x.ets || +x.ts || 0, fromGm: !!x.dm, parent: '', dm: !!x.dm });
    }
    A.docs = keep; reindex(); render();
  }
  async function pushNote(d) {
    S.pushT.delete(d.id); if (!S.on || !isPlayer()) return;
    const patch = { title: d.title.slice(0, 80), text: d.body.slice(0, 8000), ets: Date.now() };
    if (d.dm) patch.pe = true;   // a player's own copy of a handout: the GM's later changes leave it alone
    await db().doc(P('notes', d.cnote)).update(patch).catch(e => toast('Could not save your note at the table: ' + errText(e)));
  }
  async function newNote(title) {
    if (!S.on || !isPlayer()) return null; const nid = 'n' + rid(), now = Date.now();
    await db().doc(P('notes', nid)).set({ owner: A.camp.share.pid, kind: 'note', title: title || '', text: '', pos: now, ts: now, ets: now });
    return 'cn_' + nid;
  }

  /* ---------- pictures, in pieces ---------- */
  const refs = d => [d.img, d.banner, d.map && d.map.img, ...[...String(d.body || '').matchAll(/!\[[^\]]*\]\(img:([^)\s]+)\)/g)].map(m => m[1])].filter(Boolean);
  async function sendImages(d, kind) {
    const sh = A.camp.share, list = kind === 'w' ? (sh.sent = sh.sent || []) : (sh.psent = sh.psent || []);
    for (const f of refs(d)) {
      if (list.includes(f)) continue;
      const url = await STORE.imageUrl(cid(), f); if (!url) continue;
      let bytes = new Uint8Array(await (await fetch(url)).arrayBuffer()), iv = '';
      if (kind === 'w') { const v = crypto.getRandomValues(new Uint8Array(12)); bytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: v }, S.key, bytes)); iv = b64(v); }
      const s = b64(bytes), parts = Math.ceil(s.length / 180000), col = kind === 'w' ? 'cniw' : 'cnip';
      for (let i = 0; i < parts; i++) await db().doc(P(col, `${fid(f)}_${i}`)).set({ d: s.slice(i * 180000, (i + 1) * 180000) });
      await db().doc(P(col, fid(f))).set({ n: parts, name: f, iv });
      list.push(f); await saveCamp();
    }
  }
  async function fetchImages(d, kind) {
    const sh = A.camp.share; sh.got = sh.got || [];
    for (const f of refs(d)) {
      if (sh.got.includes(f)) continue;
      try {
        const col = kind === 'w' ? 'cniw' : 'cnip', meta = await db().doc(P(col, fid(f))).get(); if (!meta.exists) continue;
        const m = meta.data(); const parts = await Promise.all(Array.from({ length: m.n }, (_, i) => db().doc(P(col, `${fid(f)}_${i}`)).get().then(x => (x.exists ? x.data().d : ''))));
        let bytes = unb64(parts.join(''));
        if (m.iv) bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(m.iv) }, S.key, bytes));
        const got = await STORE.putImage(cid(), new Blob([bytes], { type: /\.svg$/i.test(f) ? 'image/svg+xml' : /\.jpe?g$/i.test(f) ? 'image/jpeg' : 'image/' + (f.split('.').pop() || 'png') }), f);
        sh.got.push(f); if (got !== f) console.warn('picture name differs', f, got);
      } catch (e) { console.warn('picture', f, e); }
    }
    await STORE.saveCampaign(A.camp).catch(() => {});
  }

  /* ---------- joining ---------- */
  // a co-writer's invite: "LOBBY-WRITERKEY"
  async function joinWriter(invite) {
    const [code, wkey] = String(invite || '').toUpperCase().replace(/\s+/g, '').split('-');
    if (!code || !wkey) throw new Error('An invite looks like 4SV6DJ-ABCDEFGHJK. Ask the GM for it (Settings › Sharing).');
    if (!(await TABLE.connect(code))) throw new Error(TABLE.T.why || 'No table uses that code on this Homebase.');
    const key = await keyFor(code, wkey), x = await db().doc(`lobbies/${code}/cnw/_camp`).get();
    if (!x.exists) throw new Error('That table has no shared campaign yet. The GM turns sharing on in Settings › Sharing.');
    let m; try { S.key = key; m = await unseal(x.data()); } catch { throw new Error('That invite code doesn\'t open this campaign. Check it with the GM.'); }
    const meta = { id: rid('c'), name: m.name || 'Shared campaign', sys: m.sys || 'generic', cal: m.cal, clocks: m.clocks, groups: m.groups, color: m.color || '', table: code, share: { on: true, role: 'writer', code, wkey, sent: [], psent: [], got: [] }, created: Date.now(), updated: Date.now() };
    await STORE.saveCampaign(meta); A.camps.unshift(meta); await openCampaign(meta.id);
    toast(`Joined ${meta.name} as a co-writer. Its documents are coming in.`);
  }
  // a player: the lobby, then which player they are (with its password when it has one)
  async function playersOf(code) {
    if (!(await TABLE.connect(code))) throw new Error(TABLE.T.why || 'No table uses that code on this Homebase.');
    return TABLE.players();
  }
  async function joinPlayer(code, p, password) {
    if (p.pw) { const h2 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc('critboard-player:' + p.id + ':' + (password || ''))))].map(b => b.toString(16).padStart(2, '0')).join(''); if (h2 !== p.pw) throw new Error('That isn\'t ' + p.name + '\'s password.'); }
    const camp = (TABLE.T.lobby && TABLE.T.lobby.camp && TABLE.T.lobby.camp.title) || 'Table ' + code;
    const meta = { id: rid('c'), name: camp, sys: TABLE.sys(), table: code, share: { on: true, role: 'player', code, pid: p.id, pname: p.name, got: [] }, created: Date.now(), updated: Date.now() };
    await STORE.saveCampaign(meta); A.camps.unshift(meta); await openCampaign(meta.id);
    toast(`Joined as ${p.name}. Your notes are your Critter VTT notes; what the GM shares shows up here.`);
  }

  function paintRole() {
    const c = $('#roleChip'); if (!c) return; const r = role();
    c.hidden = !r; c.querySelector('span').textContent = r === 'gm' ? 'Shared · GM' : r === 'writer' ? 'Co-writer' : r === 'player' ? 'Player · ' + (A.camp.share.pname || '') : '';
    c.className = 'chip ' + (S.on ? 'ok' : 'warn'); c.title = S.on ? 'Syncing with the table' : 'Not syncing right now';
  }
  return { start, stop, dirty, removed, campDirty, share, unshare, inviteCode, joinWriter, playersOf, joinPlayer, newNote, isWriter, isPlayer, role, visibleTo, paintRole, S };
})();
