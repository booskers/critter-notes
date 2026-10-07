/* Critter Notes: the device link. One campaign on several of your own devices (the desktop app, a phone, a tablet, a
   browser), kept in step through the Homebase, end-to-end encrypted. Like Critter Sounds' music link, but for a campaign.
   On the Homebase, for a linked campaign with the space id S (random) and the space key K (256 bits, only ever on the
   devices themselves):
     lobbies/S            { notes: 1 }                       the space (its creator owns it)
     lobbies/S/i/<id>     { t, h, s, b }                     the index: one tiny entry per document: when, a fingerprint
                                                             (HMAC of the content under K), 0 kept / 1 in the trash / 2 gone, by which device
     lobbies/S/v/<dev>    { n, a, seen }                     the devices (a name like "iPhone · Safari", the app)
     lobbies/Sx/d/<id>    { iv, ct }                         a document (or _camp: the campaign's name, calendar…), AES-GCM under K
     lobbies/Sx/p/<pic>   { n, iv } + <pic>_<i> { d }        a picture, encrypted, in pieces
   Only the index is subscribed to (a few dozen bytes a document); contents come one at a time, only when the index says
   they changed, so opening a linked campaign costs kilobytes, not the whole campaign, and a change costs about its size.
   Each change is checked by its fingerprint. A document changed on two devices before they met keeps both: the newer wins,
   the other goes to the trash as a "conflict copy". Every device shows the others in a sealed presence (what's open, and a
   digest of everything it has), and a difference starts a check: the start of working together in real time.
   Pairing: the computer shows a 6-letter code (and a QR code); on the same network the phone just sees it listed. Both
   make an ECDH key pair, swap the public halves through a short-lived lobby, and show the same 4 digits made from both;
   once the computer's owner approves, the space id and key go to the phone sealed under their shared secret. The
   Homebase never sees K, so it can't read anything; the code alone can't link, because the computer asks first. */
'use strict';
const LINK = (() => {
  const L = { on: false, sp: '', key: null, mac: null, db: null, offs: [], remote: new Map(), pushT: new Map(), firstT: new Map(), busy: false, tok: 0,
    status: 'off', checked: 0, mismatches: 0, room: null, peers: [], queue: new Map(), traffic: { up: 0, down: 0, ops: 0 } };
  const enc = s => new TextEncoder().encode(s), dec = b => new TextDecoder().decode(b);
  // (app.js loads after this file, so its helpers are only used inside functions)
  const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = (n, abc = 'abcdefghijkmnpqrstuvwxyz23456789') => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => abc[b % abc.length]).join('');
  const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const linked = () => !!(A.camp && A.camp.link && A.camp.link.space);
  const P = (...a) => `lobbies/${L.sp}/` + a.join('/'), X = (...a) => `lobbies/${L.sp}x/` + a.join('/');
  const fid = f => String(f).replace(/[^\w]/g, '_').slice(0, 60);
  // this device: an id, and a name people recognise
  const dev = () => LS.get('deviceId', '') || (() => { const v = 'd' + rand(10); LS.set('deviceId', v); return v; })();
  function deviceName() {
    const saved = LS.get('deviceName', ''); if (saved) return saved;
    const u = navigator.userAgent, os = /iPhone/.test(u) ? 'iPhone' : /iPad|Macintosh.*Mobile/.test(u) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(u)) ? 'iPad' : /Android/.test(u) ? (/Mobile/.test(u) ? 'Android phone' : 'Android tablet') : /Windows/.test(u) ? 'Windows PC' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Device';
    const app = window.desk ? 'Critter Notes app' : /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'browser';
    return `${os} · ${app}`;
  }
  // this device's record of what it last agreed with the others on, per campaign (fingerprints, and pictures sent/got)
  const stKey = () => 'link:' + (A.camp && A.camp.id);
  let ST = null;
  const st = () => ST || (ST = Object.assign({ base: {}, sent: [], got: [] }, LS.get(stKey(), {})));
  const saveSt = debounce(() => { if (ST && A.camp) LS.set(stKey(), ST); }, 800);

  /* ---------- keys and fingerprints ---------- */
  async function keys(raw) {
    const bytes = unb64(raw);
    L.key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    L.mac = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  async function seal(obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, L.key, enc(JSON.stringify(obj)))) }; }
  async function unseal(x) { return JSON.parse(dec(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(x.iv) }, L.key, unb64(x.ct)))); }
  // the same content gives the same fingerprint on every device (keys sorted; when it last changed doesn't count)
  const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => v[k] !== undefined && !LOCAL_KEYS.has(k)).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v ?? null);
  const LOCAL_KEYS = new Set(['updated', 'wasShared', 'carried']);
  async function print(obj) { const s = await crypto.subtle.sign('HMAC', L.mac, enc(stable(obj))); return [...new Uint8Array(s).slice(0, 9)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  // what of the campaign itself travels (not the link, sharing or this device's settings)
  const CAMP_KEYS = ['name', 'sys', 'cal', 'clocks', 'groups', 'color', 'drawer', 'world'];
  const campPart = () => { const m = {}; for (const k of CAMP_KEYS) if (A.camp[k] !== undefined) m[k] = A.camp[k]; return m; };
  const localOf = id => id === '_camp' ? campPart() : A.docs.get(id) || A.trash.get(id) || null;

  /* ---------- talking to the Homebase (counted, for the traffic numbers) ---------- */
  const count = (o, dir) => { const n = JSON.stringify(o || {}).length; L.traffic[dir] += n; L.traffic.ops++; return o; };
  const put = (path, data) => { count(data, 'up'); return L.db.doc(path).set(data); };
  const del = path => { L.traffic.ops++; return L.db.doc(path).delete(); };
  const get = async path => { const s = await L.db.doc(path).get(); L.traffic.ops++; if (s.exists) count(s.data(), 'down'); return s.exists ? s.data() : null; };
  async function hb() { if (!window.claude || typeof window.claude.use !== 'function') throw new Error('Choose a Homebase first (the Critter Notes menu › Homebase).'); return window.claude.use('db'); }

  /* ---------- starting with a campaign ---------- */
  async function start() {
    stop(); if (!linked()) { paint(); return; }
    const tok = ++L.tok; ST = null; firstSnap = true;
    try {
      L.db = await hb(); if (tok !== L.tok) return;
      L.sp = A.camp.link.space; await keys(A.camp.link.key);
      L.on = true; setStatus('checking');
      put(P('v', dev()), { n: deviceName(), a: window.desk ? 'desktop' : 'web', seen: Date.now() }).catch(() => {});
      // the index: the first snapshot is everything there is; after that, only what changed comes over the network
      L.offs.push(L.db.collection(P('i')).onSnapshot(snap => onIndex(snap), () => setStatus('offline')));
      presenceRoom();
    } catch (e) { L.on = false; setStatus('offline', errText(e)); }
  }
  function stop() { L.tok++; L.offs.forEach(f => { try { f(); } catch {} }); L.offs = []; L.on = false; L.remote = new Map(); L.queue.clear(); leaveRoom(); setStatus('off'); }
  let firstSnap = true;
  async function onIndex(snap) {
    const now = new Map(); for (const d of snap.docs) now.set(d.id, d.data() || {});
    const changed = [...now].filter(([id, r]) => { const o = L.remote.get(id); return !o || o.h !== r.h || o.s !== r.s; }).map(([id]) => id);
    L.remote = now;
    const tok = L.tok;
    // the first time (or after being offline): everything, both ways; then just what changed
    const ids = firstSnap ? new Set([...now.keys(), ...A.docs.keys(), ...A.trash.keys(), '_camp']) : new Set(changed);
    firstSnap = false;
    setStatus('syncing');
    for (const id of ids) { if (tok !== L.tok) return; await reconcile(id).catch(e => console.warn('link', id, e)); }
    if (tok === L.tok) { L.checked = Date.now(); setStatus('ok'); saveSt(); tellPresence(); }
  }
  // one document: who changed it since the two last agreed?
  async function reconcile(id) {
    const r = L.remote.get(id), local = localOf(id), base = st().base[id], lh = local ? await print(local) : null;
    if (!r) { if (local) queuePush(id, true); return; }
    if (r.s === 2) { if (A.docs.has(id) || A.trash.has(id)) { if (!base || lh === base) await removeLocal(id); else queuePush(id, true); } else delete st().base[id]; return; }
    if (lh === r.h) { st().base[id] = r.h; return; }
    // a device that has never agreed on the campaign's own settings (just linked) takes them from the link
    if (!local || lh === base || (id === '_camp' && base === undefined)) return pull(id, r);
    if (r.h === base) return queuePush(id, true);
    return conflict(id, local, r);
  }
  // changed on both before they met: both kept; the newer wins, the other goes to the trash as a copy
  async function conflict(id, local, r) {
    if (id === '_camp') { if ((r.t || 0) > (A.camp.updated || 0)) return pull(id, r); return queuePush(id, true); }
    const theirs = await fetchDoc(id); if (!theirs) return queuePush(id, true);
    const mineNewer = (local.updated || 0) >= (theirs.updated || 0), loser = mineNewer ? theirs : { ...local };
    const copy = { ...loser, id: 'd' + rand(10), title: loser.title + ' (conflict copy)', trashed: Date.now(), conflict: `kept from ${mineNewer ? 'another device' : 'this device'}`, updated: Date.now() };
    A.trash.set(copy.id, copy); await STORE.saveDoc(cid(), copy); queuePush(copy.id, true);
    if (mineNewer) queuePush(id, true); else await apply(id, theirs, r.h);
    paintTrash(); toast(`"${local.title}" was changed on two devices. Both are kept: the older one is in the trash.`);
  }

  /* ---------- bringing a document in ---------- */
  async function fetchDoc(id) {
    const x = await get(X('d', id)); if (!x) return null;
    try { return await unseal(x); } catch { L.mismatches++; return null; }
  }
  async function pull(id, r) {
    const doc = await fetchDoc(id); if (!doc) return;
    const h = await print(doc);
    if (h !== r.h) L.mismatches++;   // newer than the index (it's being written): fine, the index catches up and this runs again
    await apply(id, doc, h);
  }
  async function apply(id, doc, h) {
    if (id === '_camp') { for (const k of CAMP_KEYS) if (doc[k] !== undefined) A.camp[k] = doc[k]; await STORE.saveCampaign(A.camp).catch(() => {}); HIST.snap.set('#camp', campSnap()); st().base[id] = h; render(); return; }
    // the document being written in right now waits for a pause
    if (A.view.k === 'doc' && A.view.id === id && A.ed && A.ed.root.contains(document.activeElement)) { L.queue.set(id, { doc, h }); return; }
    const was = A.docs.get(id) || A.trash.get(id);
    if (was) { for (const k of Object.keys(was)) delete was[k]; Object.assign(was, doc); }
    const d = was || doc;
    A.docs.delete(id); A.trash.delete(id); (d.trashed ? A.trash : A.docs).set(id, d);
    await STORE.saveDoc(cid(), d); HIST.snap.set(id, d.trashed ? null : snapOf(d)); st().base[id] = h;
    await fetchPics(d);
    reindexSoon(); paintTrash();
    if (A.view.k === 'doc' && A.view.id === id && d.trashed) go({ k: 'home' }, true); else if (A.view.k !== 'doc' || A.view.id === id) renderMain();
  }
  setInterval(() => { for (const [id, x] of L.queue) { if (A.view.k === 'doc' && A.view.id === id && A.ed && A.ed.root.contains(document.activeElement)) continue; L.queue.delete(id); apply(id, x.doc, x.h); } }, 2500);
  async function removeLocal(id) {
    A.docs.delete(id); A.trash.delete(id); delete st().base[id]; HIST.snap.delete(id);
    await STORE.trashDoc(cid(), id).catch(() => {}); reindexSoon(); paintTrash();
    if (A.view.k === 'doc' && A.view.id === id) go({ k: 'home' }, true);
  }

  /* ---------- sending a change: a moment after it's made (at most every 6 s while it keeps changing) ---------- */
  function dirty(d) { if (L.on && d && d.id) queuePush(d.id); }
  function campDirty() { if (L.on) queuePush('_camp'); }
  function queuePush(id, soon) {
    clearTimeout(L.pushT.get(id)); const now = Date.now(); if (!L.firstT.has(id)) L.firstT.set(id, now);
    L.pushT.set(id, setTimeout(() => { L.pushT.delete(id); L.firstT.delete(id); push(id); }, soon ? 50 : now - L.firstT.get(id) > 6000 ? 0 : 1500));
  }
  const pushing = new Set();
  async function push(id) {
    if (!L.on || pushing.has(id)) { if (pushing.has(id)) queuePush(id); return; }
    const local = localOf(id); if (!local) return;
    pushing.add(id);
    try {
      const h = await print(local);
      const r = L.remote.get(id); if (r && r.h === h) { st().base[id] = h; return; }
      if (id !== '_camp') await sendPics(local);
      // the content first, then the index that points at it, so no device ever finds an index entry without its content
      await put(X('d', id), await seal(local));
      const entry = { t: Date.now(), h, s: local.trashed ? 1 : 0, b: dev() };
      await put(P('i', id), entry); L.remote.set(id, entry); st().base[id] = h; saveSt(); tellPresence();
    } catch (e) { setStatus('offline', errText(e)); }
    finally { pushing.delete(id); }
  }
  // deleted for good: the content goes, and the index keeps a tombstone so devices that were away learn it too
  async function gone(id) {
    delete st().base[id]; saveSt(); if (!L.on) return;
    try { await del(X('d', id)); const entry = { t: Date.now(), h: '', s: 2, b: dev() }; await put(P('i', id), entry); L.remote.set(id, entry); tellPresence(); } catch {}
  }

  /* ---------- pictures: encrypted, in pieces of 600 kB; each sent once, fetched when missing ---------- */
  const refs = d => [d.img, d.banner, d.map && d.map.img, ...[...String(d.body || '').matchAll(/!\[[^\]]*\]\(img:([^)\s]+)\)/g)].map(m => m[1])].filter(Boolean);
  async function sendPics(d) {
    for (const f of refs(d)) {
      if (st().sent.includes(f) || st().got.includes(f)) continue;
      if (await get(X('p', fid(f)))) { st().sent.push(f); continue; }   // another device sent it already
      const url = await STORE.imageUrl(cid(), f); if (!url) continue;
      const v = crypto.getRandomValues(new Uint8Array(12)), bytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: v }, L.key, new Uint8Array(await (await fetch(url)).arrayBuffer())));
      const s = b64(bytes), n = Math.ceil(s.length / 600000);
      for (let i = 0; i < n; i++) await put(X('p', `${fid(f)}_${i}`), { d: s.slice(i * 600000, (i + 1) * 600000) });
      await put(X('p', fid(f)), { n, iv: b64(v), name: f }); st().sent.push(f); saveSt();
    }
  }
  async function fetchPics(d) {
    for (const f of refs(d)) {
      if (st().got.includes(f) || st().sent.includes(f)) continue;
      try {
        const m = await get(X('p', fid(f))); if (!m) continue;
        const parts = await Promise.all(Array.from({ length: m.n }, (_, i) => get(X('p', `${fid(f)}_${i}`)).then(x => (x ? x.d : ''))));
        const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(m.iv) }, L.key, unb64(parts.join(''))));
        await STORE.putImage(cid(), new Blob([bytes], { type: /\.svg$/i.test(f) ? 'image/svg+xml' : /\.jpe?g$/i.test(f) ? 'image/jpeg' : 'image/' + (f.split('.').pop() || 'png') }), f);
        st().got.push(f); saveSt();
      } catch (e) { console.warn('link picture', f, e); }
    }
  }

  /* ---------- the others, live: who's here, what they have open, and whether everything matches ---------- */
  // a digest of everything this device has (every document's fingerprint), so two devices can tell at a glance they agree
  async function digest() {
    const parts = [];
    for (const id of [...A.docs.keys(), ...A.trash.keys()].sort()) parts.push(id + ':' + (st().base[id] || '?'));
    const s = await crypto.subtle.sign('HMAC', L.mac, enc(parts.join('|'))); return [...new Uint8Array(s).slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('') + ':' + parts.length;
  }
  async function presenceRoom() {
    if (!L.on || L.room || pairing) return;
    try {
      const rc = await window.claude.use('room'); if (!L.on) return;
      // the room's name gives nothing away (a hash of the space under its key)
      const name = 'nl_' + (await print({ room: L.sp })).slice(0, 16);
      L.room = await rc.join(name);
      L.room.onPeers(async ({ peers }) => {
        const out = [];
        for (const p of peers) { if (p.sameTab || !p.presence || !p.presence.s) continue; try { out.push(await unseal(p.presence.s)); } catch {} }
        L.peers = out; paint(); compare();
      });
      tellPresence();
    } catch {}
  }
  function leaveRoom() { if (L.room) { try { L.room.leave(); } catch {} L.room = null; L.peers = []; } }
  const tellPresence = debounce(async () => { if (!L.room || !L.on) return; try { L.room.presence({ s: await seal({ dev: dev(), n: deviceName(), view: A.view.k === 'doc' ? A.view.id : A.view.k, dg: await digest(), at: Date.now() }) }); } catch {} }, 600);
  // another device reports a different digest: after things settle, look again (the index has the truth)
  let cmpT = 0;
  function compare() { clearTimeout(cmpT); cmpT = setTimeout(async () => { if (!L.on) return; const mine = await digest(); if (L.peers.some(p => p.dg && p.dg !== mine)) { firstSnap = true; onIndex({ docs: [...L.remote].map(([id, d]) => ({ id, data: () => d })) }); } }, 8000); }
  // the sync check: everything, now (Settings › Your devices)
  async function check() {
    if (!L.on) return { ok: false, why: 'Not linked right now.' };
    setStatus('checking');
    const snap = await L.db.collection(P('i')).get(); const before = L.mismatches;
    firstSnap = true; await onIndex(snap);
    let differ = 0;
    for (const [id, r] of L.remote) { if (r.s === 2) continue; const l = localOf(id); if (!l || (await print(l)) !== r.h) differ++; }
    for (const id of [...A.docs.keys(), ...A.trash.keys()]) if (!L.remote.has(id)) differ++;
    return { ok: differ === 0, differ, docs: A.docs.size + A.trash.size, fixed: L.mismatches - before, devices: L.peers.length };
  }

  /* ---------- status ---------- */
  function setStatus(s, why) { L.status = s; L.why = why || ''; paint(); }
  function paint() {
    const c = $('#linkChip'); if (!c) return;
    c.hidden = !linked();
    if (!linked()) return;
    const n = L.peers.length, label = { off: 'Not linked now', offline: 'Offline · saved here', checking: 'Checking…', syncing: 'Syncing…', ok: n ? `Linked · ${n} more device${n === 1 ? '' : 's'} here` : 'Linked · in step' }[L.status] || 'Linked';
    c.querySelector('span').textContent = label; c.className = 'chip ' + (L.status === 'ok' ? 'ok' : L.status === 'offline' ? 'warn' : '');
    c.title = L.why || 'Your devices: this campaign stays in step on all of them (Settings › Your devices)';
  }

  /* ---------- linking a new device: the computer offers, the phone joins ---------- */
  let pairing = null;
  // make this campaign linkable (once): a space, a key, everything up
  async function create() {
    L.db = await hb();
    const space = 'nl' + rand(12), raw = b64(crypto.getRandomValues(new Uint8Array(32)));
    L.sp = space; await keys(raw);
    count({}, 'up'); await L.db.doc(`lobbies/${space}`).set({ notes: 1, v: 1 });
    A.camp.link = { space, key: raw, since: Date.now() }; await saveCamp();
    ST = { base: {}, sent: [], got: [] }; firstSnap = true;
    await start();
  }
  const sas = async (a, b, code) => { const x = new Uint8Array(await crypto.subtle.digest('SHA-256', enc([a, b, code].join('|')))); return String(((x[0] << 16) | (x[1] << 8) | x[2]) % 10000).padStart(4, '0'); };
  async function ecdh() { const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']); return { kp, pub: b64(await crypto.subtle.exportKey('raw', kp.publicKey)) }; }
  const shared = async (kp, otherPub) => crypto.subtle.deriveKey({ name: 'ECDH', public: await crypto.subtle.importKey('raw', unb64(otherPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, kp.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  // the computer's side: a code, a QR code, the network's room, and the requests that come in
  async function offer(onRequest) {
    if (!linked()) await create();
    const db = await hb(), code = rand(6, CODE_ABC), me = await ecdh(), lobby = 'lobbies/np' + code;
    await db.doc(lobby).set({ o: me.pub, n: deviceName(), c: A.camp.name.slice(0, 60), at: Date.now() });
    pairing = { code, db, lobby, me, offs: [], done: new Set() };
    // phones on the same network see this computer listed (the Homebase's "lan" room is per network)
    leaveRoom();
    try { const rc = await window.claude.use('room'); pairing.lan = await rc.join('lan'); pairing.lan.presence({ app: 'notes-link', code, n: deviceName(), c: A.camp.name.slice(0, 60) }); } catch {}
    pairing.offs.push(db.collection(lobby + '/r').onSnapshot(async snap => {
      for (const d of snap.docs) {
        if (pairing.done.has(d.id)) continue; pairing.done.add(d.id);
        const r = d.data() || {}; if (!r.pub) continue;
        const digits = await sas(me.pub, r.pub, code);
        onRequest({ id: d.id, name: String(r.n || 'A device').slice(0, 60), digits,
          approve: async () => { const k = await shared(me.kp, r.pub), iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc(JSON.stringify({ space: A.camp.link.space, key: A.camp.link.key, name: A.camp.name, sys: A.camp.sys })));
            await db.doc(`${lobby}/a/${d.id}`).set({ iv: b64(iv), ct: b64(ct) }); },
          decline: async () => { await db.doc(`${lobby}/a/${d.id}`).set({ no: 1 }); } });
      }
    }, () => {}));
    return { code, url: `https://notes.crittervtt.com/#link=${code}` };
  }
  async function endOffer() {
    if (!pairing) return; const p = pairing; pairing = null;
    p.offs.forEach(f => { try { f(); } catch {} }); if (p.lan) { try { p.lan.leave(); } catch {} }
    // the short-lived lobby goes (after a moment, so the last answer gets read)
    setTimeout(async () => { try { const s = await p.db.collection(p.lobby + '/r').get(); for (const d of s.docs) { await p.db.doc(`${p.lobby}/r/${d.id}`).delete(); await p.db.doc(`${p.lobby}/a/${d.id}`).delete(); } await p.db.doc(p.lobby).delete(); } catch {} }, 15000);
    presenceRoom();
  }
  // the phone's side: computers on this network, then a code (typed, picked, or from the QR code)
  async function nearby(onList) {
    // one room at a time: the linked devices' room steps aside while looking
    const rc = await window.claude.use('room'); leaveRoom(); pairing = pairing || { looking: true }; const room = await rc.join('lan');
    const off = room.onPeers(({ peers }) => onList(peers.filter(p => !p.sameTab && p.presence && p.presence.app === 'notes-link').map(p => ({ code: p.presence.code, name: p.presence.n, camp: p.presence.c }))));
    return () => { try { off(); room.leave(); } catch {} if (pairing && pairing.looking) pairing = null; presenceRoom(); };
  }
  async function join(code, onDigits) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) throw new Error('A link code has 6 letters and digits, like K7QX2M.');
    const db = await hb(), lobby = 'lobbies/np' + code, root = await db.doc(lobby).get();
    if (!root.exists || !(root.data() || {}).o) throw new Error('No computer is offering that code right now. Open Settings › Your devices › Link a device on it.');
    const o = root.data(), me = await ecdh(), req = 'r' + rand(10);
    await db.doc(`${lobby}/r/${req}`).set({ pub: me.pub, n: deviceName(), at: Date.now() });
    onDigits(await sas(o.o, me.pub, code), o.n, o.c);
    // the answer: the space, sealed under the secret only these two share
    const ans = await new Promise((res, rej) => {
      const t = setTimeout(() => { off(); rej(new Error('No answer from the computer. Try again, and approve it there.')); }, 180000);
      const off = db.doc(`${lobby}/a/${req}`).onSnapshot(s => { if (s.exists) { clearTimeout(t); off(); res(s.data()); } }, () => {});
    });
    if (ans.no) throw new Error('The computer said no.');
    const k = await shared(me.kp, o.o), got = JSON.parse(dec(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ans.iv) }, k, unb64(ans.ct))));
    // a campaign of its own on this device, filled from the link
    const have = A.camps.find(c => c.link && c.link.space === got.space);
    if (have) { await openCampaign(have.id); return have; }
    const meta = { id: rid('c'), name: got.name || 'Linked campaign', sys: got.sys || 'generic', link: { space: got.space, key: got.key, since: Date.now() }, created: Date.now(), updated: Date.now() };
    await STORE.saveCampaign(meta); A.camps.unshift(meta); await openCampaign(meta.id);
    return meta;
  }
  // this device stops (the campaign stays here, unlinked)
  async function unlinkHere() { stop(); delete A.camp.link; await saveCamp(); LS.del && LS.del(stKey()); paint(); }
  // all devices: the Homebase forgets the space (each device keeps its own copy, unlinked)
  async function wipe() {
    if (!linked()) return; const db = await hb(), sp = A.camp.link.space;
    try { for (const col of [`lobbies/${sp}/i`, `lobbies/${sp}/v`, `lobbies/${sp}x/d`, `lobbies/${sp}x/p`]) { const s = await db.collection(col).get(); for (const d of s.docs) await db.doc(`${col}/${d.id}`).delete(); } await db.doc(`lobbies/${sp}`).delete(); } catch {}
    await unlinkHere();
  }
  async function devices() { if (!L.on) return []; const s = await L.db.collection(P('v')).get(); return s.docs.map(d => ({ id: d.id, ...d.data(), here: d.id === dev(), live: L.peers.some(p => p.dev === d.id) })); }
  function rename(n) { LS.set('deviceName', String(n || '').trim().slice(0, 40)); if (L.on) { put(P('v', dev()), { n: deviceName(), a: window.desk ? 'desktop' : 'web', seen: Date.now() }).catch(() => {}); tellPresence(); } }
  return { start, stop, dirty, campDirty, gone, offer, endOffer, nearby, join, check, unlinkHere, wipe, devices, rename, deviceName, linked, paint, tell: () => tellPresence(), L };
})();
