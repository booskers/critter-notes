/* Critter Notes: the device link. One campaign on several of your own devices (the desktop app, a phone, a tablet, a
   browser), kept in step device to device. Nothing is stored on the Homebase: every device keeps the whole campaign,
   and the Homebase only introduces devices to each other and, when a network won't let them talk directly, passes
   their messages along without being able to read them.
   - A linked campaign has a space id and a key K (256 bits) that only the devices have. Its devices meet in a Homebase
     room whose name is a fingerprint of the space under K, each showing a presence sealed with K.
   - Two devices that meet talk directly (WebRTC; inside the home network when they share one) and, until that's up or
     when a network blocks it, through the room, every message sealed with K. The direct connection is set up with
     messages sealed under K too, so only a device with the key can be on the other end.
   - Meeting, each sends its index (per document: a fingerprint, kept / in the trash / deleted for good, when). Each
     side asks for what the other has newer, measured against what the two last agreed on, so only changes travel.
     While both are open, a change goes over within seconds.
   - A document changed on both while they were apart keeps both: the newer wins, the other goes to the trash as a
     "conflict copy" (both devices make the same copy, so it appears once).
   - Changes made while the other device is closed reach it the next time both are open at once.
   Pairing: the computer shows a 6-letter code; on the same network the phone just sees it listed. Both make an ECDH key
   pair, swap the public halves through a short-lived room, and show the same 4 digits made from both; once the
   computer's owner approves, the space id and key go to the phone sealed under their shared secret. */
'use strict';
const LINK = (() => {
  const L = { on: false, sp: '', key: null, mac: null, room: '', tok: 0, status: 'off', why: '', checked: 0, peers: new Map(), pushT: new Map(), firstT: new Map(), queue: new Map(),
    traffic: { direct: 0, relay: 0, msgs: 0 }, log: [] };
  const enc = s => new TextEncoder().encode(s), dec = b => new TextDecoder().decode(b);
  // (app.js loads after this file, so its helpers are only used inside functions)
  const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = (n, abc = 'abcdefghijkmnpqrstuvwxyz23456789') => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => abc[b % abc.length]).join('');
  const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const linked = () => !!(A.camp && A.camp.link && A.camp.link.space);
  const dev = () => LS.get('deviceId', '') || (() => { const v = 'd' + rand(10); LS.set('deviceId', v); return v; })();
  function deviceName() {
    const saved = LS.get('deviceName', ''); if (saved) return saved;
    const u = navigator.userAgent, os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(u)) ? 'iPad' : /Android/.test(u) ? (/Mobile/.test(u) ? 'Android phone' : 'Android tablet') : /Windows/.test(u) ? 'Windows PC' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Device';
    const app = window.desk ? 'Critter Notes app' : /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'browser';
    return `${os} · ${app}`;
  }
  // what this device agreed on with each other device (fingerprints), deleted-for-good markers, the devices it knows
  const stKey = () => 'link:' + (A.camp && A.camp.id);
  let ST = null;
  const st = () => { const c = A.camp && A.camp.id; if (!ST || ST._c !== c) ST = Object.assign({ base: {}, gone: {}, devs: {}, got: [] }, LS.get('link:' + c, {}), { _c: c }); return ST; };
  const saveSt = debounce(() => { if (ST && ST._c) LS.set('link:' + ST._c, ST); }, 800);
  const baseOf = d => st().base[d] || (st().base[d] = {});

  /* ---------- keys and fingerprints ---------- */
  async function keys(raw) {
    const bytes = unb64(raw);
    L.key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    L.mac = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  async function seal(obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, L.key, enc(JSON.stringify(obj)))) }; }
  async function unseal(x) { return JSON.parse(dec(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(x.iv) }, L.key, unb64(x.ct)))); }
  // the same content gives the same fingerprint on every device (keys sorted; when it last changed doesn't count)
  const LOCAL_KEYS = new Set(['updated', 'wasShared', 'carried']);
  const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => v[k] !== undefined && !LOCAL_KEYS.has(k)).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v ?? null);
  async function print(obj) { const s = await crypto.subtle.sign('HMAC', L.mac, enc(stable(obj))); return [...new Uint8Array(s).slice(0, 9)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  const hc = new Map();   // fingerprints, remembered until a document changes
  async function printOf(id, d) { if (id === '_camp') return print(d); const c = hc.get(id); if (c && c.d === d && c.u === d.updated && d.updated) return c.h; const h = await print(d); hc.set(id, { d, u: d.updated, h }); return h; }
  // what of the campaign itself travels (not the link, sharing or this device's settings)
  const CAMP_KEYS = ['name', 'sys', 'cal', 'clocks', 'groups', 'color', 'drawer', 'world'];
  const campPart = () => { const m = {}; for (const k of CAMP_KEYS) if (A.camp[k] !== undefined) m[k] = A.camp[k]; return m; };
  const localOf = id => id === '_camp' ? campPart() : A.docs.get(id) || A.trash.get(id) || null;
  // this device's index: id -> [fingerprint, 0 kept / 1 in the trash / 2 deleted for good, when]
  let seq = 0;
  const hello = async want => { const q = ++seq; return { t: 'hello', q, idx: await myIndex(), want: want ? 1 : undefined }; };
  async function myIndex() {
    const idx = { _camp: [await print(campPart()), 0, A.camp.updated || 0] };
    for (const m of [A.docs, A.trash]) for (const [id, d] of m) idx[id] = [await printOf(id, d), d.trashed ? 1 : 0, d.updated || 0];
    for (const [id, t] of Object.entries(st().gone)) if (!idx[id]) idx[id] = ['', 2, t];
    return idx;
  }
  const myEntry = async id => { if (st().gone[id] && !localOf(id)) return ['', 2, st().gone[id]]; const d = localOf(id); return d ? [await printOf(id, d), d.trashed ? 1 : 0, id === '_camp' ? A.camp.updated || 0 : d.updated || 0] : null; };

  /* ---------- the Homebase as a meeting place: a socket of its own, in a few rooms at once; nothing is stored ---------- */
  const W = { ws: null, open: false, peer: 'p' + rand(12), rooms: new Map(), backoff: 1000, t: 0, ping: 0, onEvt: null };
  function wireBase() {
    const CFG = window.HOMEBASE_CONFIG || {}, ls = k => { try { return localStorage.getItem(k); } catch { return null; } };
    const built = typeof CFG.server === 'string' && /^https?:\/\//.test(CFG.server) ? CFG.server.replace(/\/+$/, '') : '';
    let mode = ls('hb.mode'), srv = ls('hb.server') || '';
    if (mode === 'homebase' && !built) mode = '';
    if (!mode) { if (built) mode = 'homebase'; else if (/^https?:$/.test(location.protocol) && !CFG.noServedDefault) { mode = 'server'; srv = location.origin; } }
    return mode === 'homebase' ? built : mode === 'server' ? srv : '';
  }
  function wire() {
    if (W.ws) return;
    const base = wireBase(); if (!base) { setStatus('offline', 'Choose a Homebase first (the Critter Notes menu › Homebase).'); return; }
    let uid, key; try { uid = localStorage.getItem('hb.uid'); key = localStorage.getItem('hb.key'); if (!uid || !key) { uid = 'u' + rand(20); key = rand(40); localStorage.setItem('hb.uid', uid); localStorage.setItem('hb.key', key); } } catch { return; }
    const ws = W.ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', uid, key, caps: ['pres'] }));
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      L.traffic.relay += ev.data.length;
      if (m.t === 'hello') { if (!m.ok) return; W.open = true; W.backoff = 1000; for (const r of W.rooms.values()) raw({ t: 'join', room: r.name, peer: W.peer, presence: r.presence }); clearInterval(W.ping); W.ping = setInterval(() => raw({ t: 'ping' }), 30000); if (L.status === 'offline') setStatus(L.peers.size ? 'ok' : 'alone'); return; }
      const r = W.rooms.get(m.room); if (!r) return;
      if (m.t === 'peers') { r.peers = new Map((m.peers || []).filter(p => p.peer !== W.peer).map(p => [p.peer, p.presence || {}])); r.onPeers(r.peers); }
      else if (m.t === 'pres') { if (m.peer === W.peer) return; r.peers.set(m.peer, m.presence || {}); r.onPeers(r.peers); }
      else if (m.t === 'evt' && m.peer !== W.peer && r.onEvt) r.onEvt(m);
    };
    ws.onclose = () => {
      if (W.ws !== ws) return;
      W.ws = null; W.open = false; clearInterval(W.ping);
      for (const r of W.rooms.values()) { r.peers = new Map(); r.onPeers(r.peers); }
      if (W.rooms.size) { setStatus('offline', 'No connection to the Homebase: changes are kept here and go over when it\'s back.'); clearTimeout(W.t); W.t = setTimeout(wire, W.backoff); W.backoff = Math.min(30000, W.backoff * 2); }
    };
  }
  const raw = m => { if (W.open) try { const s = JSON.stringify(m); W.ws.send(s); L.traffic.relay += s.length; } catch {} };
  function joinRoom(name, presence, onPeers, onEvt) {
    const r = { name, presence, peers: new Map(), onPeers, onEvt };
    W.rooms.set(name, r); wire(); raw({ t: 'join', room: name, peer: W.peer, presence });
    return {
      presence: p => { r.presence = p; raw({ t: 'presence', room: name, peer: W.peer, presence: p }); },
      emit: (to, topic, data) => raw({ t: 'emit', room: name, peer: W.peer, to, topic, data }),
      leave: () => { if (W.rooms.get(name) !== r) return; W.rooms.delete(name); raw({ t: 'leave', room: name }); if (!W.rooms.size) { const ws = W.ws; W.ws = null; W.open = false; clearInterval(W.ping); clearTimeout(W.t); try { ws && ws.close(); } catch {} } }
    };
  }

  /* ---------- starting with a campaign ---------- */
  let room = null;
  async function start() {
    stop(); if (!linked()) { paint(); return; }
    const tok = ++L.tok; hc.clear();
    try {
      L.sp = A.camp.link.space; await keys(A.camp.link.key); if (tok !== L.tok) return;
      L.on = true; setStatus('alone');
      // the room's name gives nothing away (a fingerprint of the space under its key)
      L.room = 'nl_' + (await print({ room: L.sp })).slice(0, 16);
      room = joinRoom(L.room, {}, peersChanged, onRelay);
      tellPresence.fresh();
      purgeGone();
    } catch (e) { L.on = false; setStatus('offline', errText(e)); }
  }
  function stop() {
    // what was still waiting to go out goes first, to the devices open now; then the lines close
    const pending = [...L.pushT.keys()], peers = [...L.peers.values()], rm = room, camp = A.camp;
    for (const t of L.pushT.values()) clearTimeout(t); L.pushT.clear(); L.firstT.clear(); L.queue.clear();
    if (ST && ST._c) LS.set('link:' + ST._c, ST);
    L.tok++; L.peers = new Map(); early.clear(); room = null; L.on = false; setStatus('off');
    (async () => { if (pending.length && peers.length && camp === A.camp) for (const id of pending) await push(id, peers).catch(() => {}); await new Promise(r => setTimeout(r, pending.length ? 1500 : 0)); peers.forEach(closePeer); if (rm) rm.leave(); })();
  }
  // the deleted-for-good markers are kept 90 days, long enough for any device to hear of it
  function purgeGone() { const g = st().gone, old = Date.now() - 90 * 864e5; let n = 0; for (const [id, t] of Object.entries(g)) if (t < old) { delete g[id]; n++; } if (n) saveSt(); }

  /* ---------- the other devices: who's here, and a line to each ---------- */
  // at most every 15 s while things keep changing (the changes themselves go over the line at once)
  const throttle = (fn, ms) => { let last = 0, t = 0; const f = () => { clearTimeout(t); const wait = Math.max(300, ms - (Date.now() - last)); t = setTimeout(() => { last = Date.now(); fn(); }, wait); }; f.fresh = () => { last = 0; f(); }; return f; };
  const tellPresence = throttle(async () => { if (!room || !L.on) return; try { room.presence({ s: await seal({ dev: dev(), n: deviceName(), dg: await digest(), at: Date.now() }) }); } catch {} }, 15000);
  async function digest() {
    const idx = await myIndex(), parts = Object.keys(idx).filter(id => idx[id][1] !== 2).sort().map(id => id + ':' + idx[id][0] + idx[id][1]);
    const s = await crypto.subtle.sign('HMAC', L.mac, enc(parts.join('|'))); return [...new Uint8Array(s).slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let chain = Promise.resolve();
  const early = new Map();   // messages from a device whose presence hasn't been read yet
  function peersChanged(list) { chain = chain.then(() => readPeers(list)).catch(e => console.warn('link peers', e)); }
  async function readPeers(list) {
    const tok = L.tok, seen = new Set(); let came = false;
    for (const [wp, pres] of list) {
      if (!pres || !pres.s) continue;
      let p; try { p = await unseal(pres.s); } catch { continue; }   // without the key: not one of ours
      if (tok !== L.tok || !p.dev || p.dev === dev()) continue;
      seen.add(p.dev);
      let P = L.peers.get(p.dev);
      if (!P || P.wp !== wp) {
        if (P) closePeer(P);
        P = { dev: p.dev, wp, n: p.n, room, pc: null, dc: null, direct: false, parts: new Map(), idx: null };
        L.peers.set(p.dev, P); came = true;
        st().devs[p.dev] = { n: p.n, seen: Date.now() }; saveSt();
        send(P, await hello(true));   // and theirs back, even if they knew us already
        directLine(P);
        for (const msg of early.get(p.dev) || []) inbound(P, msg); early.delete(p.dev);
      }
      P.n = p.n; P.dg = p.dg; st().devs[p.dev] = { n: p.n, seen: Date.now() };
    }
    for (const [d, P] of L.peers) if (!seen.has(d)) { closePeer(P); L.peers.delete(d); }
    if ([...L.peers.values()].some(Q => Q.waiting)) setStatus('syncing'); else settled(); compare();
    // a device arriving gets what was waiting at once
    if (came) sendAll();
  }
  function closePeer(P) { try { P.dc && P.dc.close(); } catch {} try { P.pc && P.pc.close(); } catch {} P.pc = P.dc = null; P.direct = false; }
  // the direct line: WebRTC, set up with sealed messages through the room; the device with the smaller id calls
  const ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }];
  function directLine(P) {
    if (LS.get('linkDirect', true) === false || typeof RTCPeerConnection === 'undefined') return;
    const pc = P.pc = new RTCPeerConnection({ iceServers: ICE });
    const dc = P.dc = pc.createDataChannel('notes', { negotiated: true, id: 0, ordered: true });
    dc.onopen = () => { P.direct = true; paint(); };
    dc.onclose = () => { P.direct = false; paint(); };
    dc.onmessage = e => { L.traffic.direct += e.data.length; L.traffic.msgs++; inbound(P, JSON.parse(e.data)); };
    pc.onicecandidate = e => { if (e.candidate) send(P, { t: 'ice', c: e.candidate.toJSON() }, true); };
    if (dev() < P.dev) pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => send(P, { t: 'sdp', d: pc.localDescription.toJSON() }, true)).catch(() => {});
  }
  async function onSignal(P, m) {
    // a new call (the other side started over): a fresh line
    if (m.t === 'sdp' && m.d.type === 'offer') { closePeer(P); directLine(P); }
    const pc = P.pc; if (!pc) return;
    try {
      if (m.t === 'sdp') { await pc.setRemoteDescription(m.d); if (m.d.type === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); send(P, { t: 'sdp', d: pc.localDescription.toJSON() }, true); } }
      else if (m.t === 'ice') await pc.addIceCandidate(m.c);
    } catch {}
  }
  // a message to one device: directly when that's up, else sealed through the room; big ones in pieces
  const PART = 40000;
  async function send(P, msg, viaRoom) {
    msg._s = dev();   // who sent it
    if (!msg.q) msg.q = ++seq;   // in what order (direct and relayed messages can overtake each other)
    const s = JSON.stringify(msg), pieces = s.length > PART ? Array.from({ length: Math.ceil(s.length / PART) }, (_, i) => ({ t: 'part', _s: msg._s, k: msg.k || rand(6), i, n: Math.ceil(s.length / PART), d: s.slice(i * PART, (i + 1) * PART) })) : [msg];
    for (const one of pieces) {
      if (!viaRoom && P.direct && P.dc && P.dc.readyState === 'open') {
        if (P.dc.bufferedAmount > 4e6) await new Promise(r => { P.dc.bufferedAmountLowThreshold = 1e6; P.dc.onbufferedamountlow = r; setTimeout(r, 5000); });
        const t = JSON.stringify(one); try { P.dc.send(t); L.traffic.direct += t.length; L.traffic.msgs++; continue; } catch {}
      }
      const rr = P.room || room; if (rr) { rr.emit(P.wp, 'nl', { x: await seal(one) }); L.traffic.msgs++; }
    }
  }
  async function onRelay(m) {
    if (m.topic !== 'nl' || !m.data || !m.data.x) return;
    let msg; try { msg = await unseal(m.data.x); } catch { return; }
    const P = L.peers.get(msg._s);
    if (!P) { if (msg._s) { const q = early.get(msg._s) || []; if (q.length < 400) q.push(msg); early.set(msg._s, q); } return; }
    inbound(P, msg);
  }
  let work = Promise.resolve();
  const seenQ = new Map();   // per device and page: the newest message number heard
  function inbound(P, msg) {
    if (msg.t === 'part') {
      const k = msg.k, got = P.parts.get(k) || []; got[msg.i] = msg.d; P.parts.set(k, got);
      if (got.filter(x => x !== undefined).length < msg.n) return;
      P.parts.delete(k); msg = JSON.parse(got.join(''));
    }
    // one message at a time, in order: two answers about the same document never interleave
    const tok = L.tok; work = work.then(() => tok === L.tok && handle(P, msg)).catch(e => console.warn('link', msg.t, e));
  }

  /* ---------- the conversation between two devices ---------- */
  async function handle(P, m) {
    if (!L.on) return;
    if (m.t === 'sdp' || m.t === 'ice') return onSignal(P, m);
    if (m.q) { const sk = P.dev + ':' + P.wp, last = seenQ.get(sk) || 0; if (m.t === 'hello' && m.q < last) { send(P, await hello(true)); return; } if (m.q > last) seenQ.set(sk, m.q); }
    if (m.t === 'hello') { if (dev() < P.dev && (!P.pc || /closed|failed/.test(P.pc.connectionState))) { closePeer(P); directLine(P); }
      P.idx = m.idx; if (m.want) send(P, await hello(false)); return reconcile(P, m.idx); }
    if (m.t === 'get') { for (const id of m.ids || []) { const d = localOf(id); if (d) await send(P, { t: 'doc', id, doc: d, h: await printOf(id, d), u: id === '_camp' ? A.camp.updated || 0 : undefined, k: 'd' + id }); else if (st().gone[id]) await send(P, { t: 'gone', id, at: st().gone[id] }); else send(P, { t: 'none', id }); } return; }
    if (m.t === 'doc') return receive(P, m.id, m.doc, m.u);
    if (m.t === 'gone') return goneThere(P, m.id, m.at);
    if (m.t === 'none') return arrived(P, m.id);
    if (m.t === 'ok') { const e = await myEntry(m.id); if (e && e[0] === m.h) { baseOf(P.dev)[m.id] = m.h; saveSt(); } return; }
    if (m.t === 'pic?') return sendPic(P, m.f);
    if (m.t === 'pic') return gotPic(P, m);
  }
  // meeting: per document, who changed it since the two last agreed? This side asks for what it should take.
  async function reconcile(P, theirs) {
    setStatus('syncing');
    const mine = await myIndex(), base = baseOf(P.dev), want = [], joiner = !!(A.camp.link && A.camp.link.joined);
    for (const id of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const m = mine[id], r = theirs[id], b = base[id];
      if (!r) continue;                                   // they've never had it: they ask for it
      if (m && m[0] === r[0] && m[1] === r[1]) { if (r[0]) base[id] = r[0]; continue; }
      if (r[1] === 2) {                                   // deleted for good there
        if (!m || m[1] === 2) continue;
        // a deletion wins only over a copy that's unchanged since the two last agreed and older than the deletion (a tie keeps it)
        if ((b ? m[0] === b : true) && m[2] < r[2]) { L.log.push({ rm: id, why: 'meeting', from: P.n + ' ' + P.dev, b, m, r }); await removeLocal(id, r[2]); }
        continue;                                         // changed here since: they take it back from us
      }
      if (!m) { want.push(id); continue; }
      if (m[1] === 2) { if ((b && r[0] !== b) || r[2] >= m[2]) want.push(id); continue; }   // deleted here, changed there since: it comes back
      if (id === '_camp' && b === undefined) { if (joiner) want.push(id); continue; }  // a new device takes the campaign's settings
      if (m[0] === b) { want.push(id); continue; }        // only they changed it
      if (r[0] === b) continue;                           // only we changed it: they ask
      want.push(id);                                      // both: conflict, settled when it arrives
    }
    saveSt();
    if (!want.length) { settled(); return; }
    P.waiting = new Set(want);   // (before asking: the answers can come back quickly)
    const w = P.waiting; setTimeout(() => { if (P.waiting === w) { P.waiting = null; settled(); } }, 15000);   // a line that dropped them: the next meeting asks again
    for (let i = 0; i < want.length; i += 200) await send(P, { t: 'get', ids: want.slice(i, i + 200) });
  }
  const settled = debounce(() => { if (!L.on) return; L.checked = Date.now(); picSweep(); setStatus(L.peers.size ? 'ok' : 'alone'); tellPresence(); saveSt(); }, 300);
  // a document from another device: take it, or keep both if it changed here too
  function arrived(P, id) { if (P.waiting) { P.waiting.delete(id); if (!P.waiting.size) P.waiting = null; } if (![...L.peers.values()].some(Q => Q.waiting)) settled(); }
  async function receive(P, id, doc, u) {
    arrived(P, id);
    const h = await print(doc), b = baseOf(P.dev)[id], m = await myEntry(id);
    let result = h;
    const mineT = id === '_camp' ? A.camp.updated || 0 : (localOf(id) || {}).updated || 0, theirT = id === '_camp' ? u || 0 : (doc && doc.updated) || 0;
    if (m && m[1] === 2 && !((b && h !== b) || theirT >= m[2])) { send(P, { t: 'gone', id, at: m[2] }); return; }   // a stale copy of something deleted: it stays deleted
    if (!m || m[1] === 2 || m[0] === h || (id === '_camp' && b === undefined && A.camp.link.joined)) await apply(id, doc, h, u);
    else {
      // two different versions: the newer wins, on every device alike (a tie goes to the larger fingerprint). The other
      // is kept in the trash as a conflict copy when it held changes of its own since the two last agreed.
      const theirsNewer = theirT > mineT || (theirT === mineT && h > m[0]);
      if (id === '_camp') { if (theirsNewer) await apply(id, doc, h, u); else result = m[0]; }
      else {
        const local = localOf(id), loser = theirsNewer ? local : doc, lh = theirsNewer ? m[0] : h;
        if (lh !== b) {
          const copyId = 'd' + lh.slice(0, 10), title = String(loser.title || 'Untitled').replace(/ \(conflict copy\)$/, '') + ' (conflict copy)';
          if (!A.trash.has(copyId) && !A.docs.has(copyId)) {
            const copy = { ...JSON.parse(JSON.stringify(loser)), id: copyId, title, trashed: loser.updated || 1, conflict: 'changed on two devices', updated: loser.updated || 1 };
            L.log.push({ at: Date.now(), id, from: P.n + ' ' + P.dev, b, mine: m[0], theirs: h, kept: theirsNewer ? 'theirs' : 'mine', copy: copyId });
            A.trash.set(copyId, copy); await STORE.saveDoc(cid(), copy); queuePush(copyId);
            toast(`"${local.title}" was changed on two devices. Both are kept: the older one is in the trash.`);
          }
          paintTrash();
        }
        if (theirsNewer) await apply(id, doc, h); else result = m[0];
      }
    }
    if (result === h) { baseOf(P.dev)[id] = h; saveSt(); }
    if (P.idx) P.idx[id] = [h, doc && doc.trashed ? 1 : 0, (doc && doc.updated) || 0];
    send(P, { t: 'ok', id, h: result });
    if (L.peers.size > 1 || result !== h) queuePush(id);
    if (id !== '_camp' && !(st().gone[id])) needPics(P, localOf(id));
    tellPresence();
  }
  async function apply(id, doc, h, u) {
    delete st().gone[id];
    if (id === '_camp') { for (const k of CAMP_KEYS) if (doc[k] !== undefined) A.camp[k] = doc[k]; if (u) A.camp.updated = u; await STORE.saveCampaign(A.camp).catch(() => {}); HIST.snap.set('#camp', campSnap()); render(); return; }
    // the document being written in right now waits for a pause
    if (A.view.k === 'doc' && A.view.id === id && A.ed && A.ed.root.contains(document.activeElement)) { L.queue.set(id, doc); return; }
    const was = A.docs.get(id) || A.trash.get(id);
    if (was) { for (const k of Object.keys(was)) delete was[k]; Object.assign(was, doc); }
    const d = was || doc;
    A.docs.delete(id); A.trash.delete(id); (d.trashed ? A.trash : A.docs).set(id, d);
    if (h) hc.set(id, { d, u: d.updated, h }); else hc.delete(id);
    await STORE.saveDoc(cid(), d); HIST.snap.set(id, d.trashed ? null : snapOf(d));
    reindexSoon(); paintTrash();
    if (A.view.k === 'doc' && A.view.id === id && d.trashed) go({ k: 'home' }, true); else if (A.view.k !== 'doc' || A.view.id === id) renderMain();
  }
  setInterval(() => { for (const [id, doc] of L.queue) { if (A.view.k === 'doc' && A.view.id === id && A.ed && A.ed.root.contains(document.activeElement)) continue; L.queue.delete(id); apply(id, doc, ''); } }, 2500);
  async function removeLocal(id, at) {
    A.docs.delete(id); A.trash.delete(id); hc.delete(id); HIST.snap.delete(id); st().gone[id] = at || Date.now();
    await STORE.trashDoc(cid(), id).catch(() => {}); reindexSoon(); paintTrash(); saveSt();
    if (A.view.k === 'doc' && A.view.id === id) go({ k: 'home' }, true);
  }
  async function goneThere(P, id, at) {
    arrived(P, id); if (P.idx) P.idx[id] = ['', 2, at];
    const m = await myEntry(id), b = baseOf(P.dev)[id];
    if (!m || m[1] === 2) return;
    if ((b ? m[0] === b : true) && m[2] < at) { L.log.push({ rm: id, why: 'gone msg', from: P.n + ' ' + P.dev, b, m, at }); await removeLocal(id, at); for (const Q of L.peers.values()) if (Q.dev !== P.dev && (!Q.idx || !Q.idx[id] || Q.idx[id][1] !== 2)) { send(Q, { t: 'gone', id, at }); if (Q.idx) Q.idx[id] = ['', 2, at]; } }
  }

  /* ---------- sending a change: a moment after it's made (at most every 6 s while it keeps changing); with no other
     device open nothing is sent at all: the next meeting brings it ---------- */
  function dirty(d) { if (L.on && d && d.id) queuePush(d.id); }
  function campDirty() { if (L.on) queuePush('_camp'); }
  function queuePush(id) {
    if (!L.peers.size) { tellPresence(); return; }
    clearTimeout(L.pushT.get(id)); const now = Date.now(); if (!L.firstT.has(id)) L.firstT.set(id, now);
    L.pushT.set(id, setTimeout(() => { L.pushT.delete(id); L.firstT.delete(id); push(id); }, now - L.firstT.get(id) > 6000 ? 0 : 1500));
  }
  const sendAll = () => { for (const [id, t] of L.pushT) { clearTimeout(t); L.pushT.delete(id); L.firstT.delete(id); push(id); } };
  addEventListener('pagehide', sendAll); document.addEventListener('visibilitychange', () => { if (document.hidden) sendAll(); });
  async function push(id, to) {
    if (!L.on && !to) return;
    const d = localOf(id); if (!d) return;
    const h = await printOf(id, d);
    for (const P of to || L.peers.values()) if (!P.idx || !P.idx[id] || P.idx[id][0] !== h) { await send(P, { t: 'doc', id, doc: d, h, u: id === '_camp' ? A.camp.updated || 0 : undefined, k: 'd' + id + rand(3) }); if (P.idx) P.idx[id] = [h, d.trashed ? 1 : 0, d.updated || 0]; }
    tellPresence();
  }
  // deleted for good: the others hear of it now, or at the next meeting (the marker is kept 90 days)
  async function gone(id) {
    if (!A.camp || !linked()) return;
    const at = Date.now(); st().gone[id] = at; hc.delete(id); saveSt();
    for (const P of L.peers.values()) { send(P, { t: 'gone', id, at }); if (P.idx) P.idx[id] = ['', 2, at]; }
    tellPresence();
  }

  /* ---------- pictures: fetched from the device that has them, when missing here ---------- */
  const refs = d => d ? [d.img, d.banner, d.map && d.map.img, ...[...String(d.body || '').matchAll(/!\[[^\]]*\]\(img:([^)\s]+)\)/g)].map(m => m[1])].filter(Boolean) : [];
  const havePic = new Set();
  async function hasPic(f) { if (havePic.has(f) || st().got.includes(f)) return true; try { const u = await STORE.imageUrl(cid(), f); if (!u) return false; const r = await fetch(u); const ok = r.ok && (await r.blob()).size > 0; if (ok) havePic.add(f); return ok; } catch { return false; } }
  const asking = new Set();
  const tried = new Map();
  async function needPics(P, d) { for (const f of refs(d)) { if (asking.has(f) || await hasPic(f)) continue; asking.add(f); tried.set(f, new Set([P.dev])); send(P, { t: 'pic?', f }); setTimeout(() => asking.delete(f), 60000); } }
  // after a meeting: any picture still missing is asked for
  const picSweep = debounce(async () => { if (!L.on || !L.peers.size) return; const P = [...L.peers.values()][0]; for (const d of [...A.docs.values(), ...A.trash.values()]) await needPics(P, d); }, 4000);
  async function sendPic(P, f) {
    try { const u = await STORE.imageUrl(cid(), f); const r = u && await fetch(u); if (!r || !r.ok) return send(P, { t: 'pic', f, none: 1 }); await send(P, { t: 'pic', f, d: b64(await r.arrayBuffer()), k: 'p' + rand(6) }); }
    catch { send(P, { t: 'pic', f, none: 1 }); }
  }
  async function gotPic(P, m) {
    if (m.none || !m.d) {
      // this one hasn't got it: the next open device that hasn't been asked
      const t = tried.get(m.f) || new Set(), Q = [...L.peers.values()].find(Q => !t.has(Q.dev));
      if (Q) { t.add(Q.dev); tried.set(m.f, t); send(Q, { t: 'pic?', f: m.f }); } else { asking.delete(m.f); tried.delete(m.f); }
      return;
    }
    asking.delete(m.f); tried.delete(m.f); havePic.add(m.f);
    const type = /\.svg$/i.test(m.f) ? 'image/svg+xml' : /\.jpe?g$/i.test(m.f) ? 'image/jpeg' : 'image/' + (m.f.split('.').pop() || 'png');
    await STORE.putImage(cid(), new Blob([unb64(m.d)], { type }), m.f);
    st().got.push(m.f); saveSt(); renderMain();
  }

  /* ---------- checks: digests in the presence, and a full comparison on request ---------- */
  let cmpT = 0;
  function compare() {
    clearTimeout(cmpT);
    cmpT = setTimeout(async () => { if (!L.on || !L.peers.size) return; const mine = await digest(); for (const P of L.peers.values()) if (P.dg && P.dg !== mine && !P.waiting) send(P, await hello(true)); }, 8000);
  }
  // Settings › Your devices › Sync check: both sides compare everything now
  async function check() {
    if (!L.on) return { ok: false, why: 'Not linked right now.' };
    if (!L.peers.size) return { ok: false, why: 'No other device is open right now. Open Critter Notes on it: the two compare and catch up by themselves.' };
    setStatus('checking');
    // compare, let what differs travel (both ways), and compare again: up to three rounds, 20 s at most
    const end = Date.now() + 20000, wait = ms => new Promise(r => setTimeout(r, ms)); let differ = 0;
    for (let round = 0; round < 3; round++) {
      for (const P of L.peers.values()) { P.idx = null; send(P, await hello(true)); }
      while (Date.now() < end && [...L.peers.values()].some(P => !P.idx || P.waiting)) await wait(200);
      if (L.pushT.size) { sendAll(); await wait(600); }
      const mine = await myIndex(); differ = 0;
      for (const P of L.peers.values()) for (const id of new Set([...Object.keys(mine), ...Object.keys(P.idx || {})])) { const a = mine[id], b = (P.idx || {})[id], live = x => x && x[1] !== 2; if (live(a) || live(b) ? !a || !b || a[0] !== b[0] || a[1] !== b[1] : false) differ++; }
      if (!differ || Date.now() > end) break;
      await wait(800);
    }
    L.checked = Date.now(); setStatus('ok');
    return { ok: differ === 0, differ, docs: A.docs.size + A.trash.size, devices: L.peers.size, direct: [...L.peers.values()].filter(P => P.direct).length };
  }

  /* ---------- status ---------- */
  function setStatus(s, why) { L.status = s; L.why = why || ''; paint(); }
  function paint() {
    const c = $('#linkChip'); if (!c) return;
    c.hidden = !linked(); if (!linked()) return;
    const n = L.peers.size, label = { off: 'Linked', offline: 'Linked · offline', checking: 'Checking…', syncing: 'Syncing…', alone: 'Linked · no other device open', ok: `Linked · in step with ${n}` }[L.status] || 'Linked';
    c.querySelector('span').textContent = label; c.className = 'chip ' + (L.status === 'ok' ? 'ok' : L.status === 'offline' ? 'warn' : '');
    const direct = [...L.peers.values()].filter(P => P.direct).length;
    c.title = L.why || (n ? `${n} other device${n === 1 ? '' : 's'} open; ${direct === n ? 'connected directly' : direct ? `${direct} directly, the rest through the Homebase (encrypted)` : 'through the Homebase (encrypted)'}. Settings › Your devices` : 'Your other devices catch up when they\'re open at the same time as this one. Settings › Your devices');
  }

  /* ---------- linking a new device: the computer offers, the phone joins (all through short-lived rooms) ---------- */
  let pairing = null;
  // make this campaign linkable: a space and a key, made here and kept here
  async function create() {
    A.camp.link = { space: 'nl' + rand(12), key: b64(crypto.getRandomValues(new Uint8Array(32))), since: Date.now() };
    await saveCamp(); ST = { base: {}, gone: {}, devs: {}, got: [], _c: A.camp.id }; saveSt();
    await start();
  }
  const sas = async (a, b, code) => { const x = new Uint8Array(await crypto.subtle.digest('SHA-256', enc([a, b, code].join('|')))); return String(((x[0] << 16) | (x[1] << 8) | x[2]) % 10000).padStart(4, '0'); };
  async function ecdh() { const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']); return { kp, pub: b64(await crypto.subtle.exportKey('raw', kp.publicKey)) }; }
  const shared = async (kp, otherPub) => crypto.subtle.deriveKey({ name: 'ECDH', public: await crypto.subtle.importKey('raw', unb64(otherPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, kp.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  // the computer's side: a code, the network's room (to be seen nearby) and the code's room; requests come in either
  async function offer(onRequest) {
    if (!wireBase()) throw new Error('Choose a Homebase first (the Critter Notes menu › Homebase).');
    if (!linked()) await create();
    endOffer();
    const code = rand(6, CODE_ABC), me = await ecdh(), pres = { app: 'notes-link', code, n: deviceName(), c: A.camp.name.slice(0, 60), o: me.pub };
    const p = pairing = { code, done: new Set(), rooms: [] };
    const onEvt = r => async m => {
      if (m.topic !== 'np-req' || !m.data || !m.data.pub || p.done.has(m.peer) || pairing !== p) return; p.done.add(m.peer);
      const digits = await sas(me.pub, m.data.pub, code);
      onRequest({ name: String(m.data.n || 'A device').slice(0, 60), digits,
        approve: async () => { const k = await shared(me.kp, m.data.pub), iv = crypto.getRandomValues(new Uint8Array(12));
          const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc(JSON.stringify({ space: A.camp.link.space, key: A.camp.link.key, name: A.camp.name, sys: A.camp.sys })));
          r().emit(m.peer, 'np-ans', { iv: b64(iv), ct: b64(ct) }); },
        decline: async () => r().emit(m.peer, 'np-ans', { no: 1 }) });
    };
    let lan, cr; lan = joinRoom('lan', pres, () => {}, onEvt(() => lan)); cr = joinRoom('np' + code, pres, () => {}, onEvt(() => cr));
    p.rooms = [lan, cr];
    return { code, url: `https://notes.crittervtt.com/#link=${code}` };
  }
  function endOffer() { if (!pairing) return; const p = pairing; pairing = null; setTimeout(() => p.rooms.forEach(r => r.leave()), 3000); }
  // the phone's side: computers on this network
  async function nearby(onList) {
    if (!wireBase()) throw new Error('no homebase');
    const r = joinRoom('lan', { app: 'notes-look', n: deviceName() }, peers => onList([...peers.values()].filter(p => p.app === 'notes-link').map(p => ({ code: p.code, name: p.n, camp: p.c }))));
    return () => r.leave();
  }
  async function join(code, onDigits) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) throw new Error('A link code has 6 letters and digits, like K7QX2M.');
    if (!wireBase()) throw new Error('Choose a Homebase first (the Critter Notes menu › Homebase).');
    const me = await ecdh();
    let r, found = null, answer;
    const ans = new Promise(res => { answer = res; });
    const pc = new Promise(res => { found = res; });
    r = joinRoom('np' + code, { app: 'notes-join', n: deviceName() }, peers => { for (const [wp, p] of peers) if (p.app === 'notes-link' && p.code === code && p.o) found({ wp, p }); }, m => { if (m.topic === 'np-ans' && m.data) answer(m.data); });
    try {
      const pcInfo = await Promise.race([pc, new Promise((_, rej) => setTimeout(() => rej(new Error('No computer is offering that code right now. Open Settings › Your devices › Link a device on it.')), 12000))]);
      const o = pcInfo.p;
      r.emit(pcInfo.wp, 'np-req', { pub: me.pub, n: deviceName() });
      onDigits(await sas(o.o, me.pub, code), o.n, o.c);
      const a = await Promise.race([ans, new Promise((_, rej) => setTimeout(() => rej(new Error('No answer from the computer. Try again, and approve it there.')), 180000))]);
      if (a.no) throw new Error('The computer said no.');
      const k = await shared(me.kp, o.o), got = JSON.parse(dec(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(a.iv) }, k, unb64(a.ct))));
      const have = A.camps.find(c => c.link && c.link.space === got.space);
      if (have) { await openCampaign(have.id); return have; }
      // a campaign of its own on this device, filled by the computer as soon as both are in the campaign's room
      const meta = { id: rid('c'), name: got.name || 'Linked campaign', sys: got.sys || 'generic', link: { space: got.space, key: got.key, since: Date.now(), joined: true }, created: Date.now(), updated: 0 };
      await STORE.saveCampaign(meta); A.camps.unshift(meta); await openCampaign(meta.id);
      return meta;
    } finally { r.leave(); }
  }
  // this device stops (the campaign stays here, unlinked)
  async function unlinkHere() { stop(); delete A.camp.link; await saveCamp(); LS.del(stKey()); ST = null; paint(); }
  // a new key: the devices you keep link again; one lost or given away can't reach them any more
  async function wipe() { if (!linked()) return; stop(); LS.del(stKey()); ST = null; delete A.camp.link; await create(); }
  async function devices() {
    const out = [{ id: dev(), n: deviceName(), here: true }];
    for (const [id, d] of Object.entries(st().devs)) if (id !== dev()) { const P = L.peers.get(id); out.push({ id, n: (P && P.n) || d.n, seen: d.seen, live: !!P, direct: !!(P && P.direct) }); }
    return out;
  }
  function rename(n) { LS.set('deviceName', String(n || '').trim().slice(0, 40)); tellPresence(); }
  return { start, stop, dirty, campDirty, gone, offer, endOffer, nearby, join, check, unlinkHere, wipe, devices, rename, deviceName, linked, paint, tell: () => tellPresence(), index: () => myIndex(), L };
})();
