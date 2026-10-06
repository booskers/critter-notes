/* Homebase for Critter: stands in for the claude.ai page capabilities (db, room, user, downloads).
   By default it connects to the Homebase this app was built with (on Cloudflare, see homebase-cloudflare/).
   It can also use any self-hosted Homebase server, or nothing at all (offline). Built into www/homebase.js by build.mjs. */
const CFG = window.HOMEBASE_CONFIG || {};
const LS = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };
const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const BUILT_IN = typeof CFG.server === 'string' && /^https?:\/\//.test(CFG.server) ? CFG.server.replace(/\/+$/, '') : '';
const servedOverHttp = /^https?:$/.test(location.protocol) && !CFG.noServedDefault;
// where to connect: what the player chose, else the built-in Homebase, else the server that served this page
let MODE = LS.get('hb.mode'), SERVER = LS.get('hb.server') || '';
if (MODE === 'homebase' && !BUILT_IN) MODE = '';
if (!MODE) { if (BUILT_IN) MODE = 'homebase'; else if (servedOverHttp) { MODE = 'server'; SERVER = location.origin; } }

/* ---------- the connection screen ---------- */
function setupScreen(message) {
  const show = () => {
    document.getElementById('hbSetup')?.remove();
    const box = document.createElement('div'); box.id = 'hbSetup';
    // it wears the look of the app it opens in (the shared Critter design system's tokens), with Critter VTT's as the fallback
    box.innerHTML = `<style>#hbSetup{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:rgb(0 0 0/.5);backdrop-filter:blur(6px);font:15px/1.5 var(--font-ui,var(--f-body,system-ui,sans-serif));color:var(--ink,#ece8e0)}
#hbSetup .c{width:min(480px,calc(100vw - 32px));background:var(--surface-3,var(--panel-3,#1e1f24));border:0;border-radius:18px;padding:22px;box-shadow:0 24px 60px -12px rgb(0 0 0/.72),0 2px 8px rgb(0 0 0/.35)}
#hbSetup h2{margin:0 0 6px;font:750 20px/1.2 var(--font-display,var(--f-display,system-ui,sans-serif))}#hbSetup p{margin:6px 0 12px;color:var(--ink-2,var(--muted,#b5b0a8))}
#hbSetup .opt{display:grid;gap:8px;margin:12px 0}#hbSetup label{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:0;border-radius:14px;background:color-mix(in srgb,currentColor 6%,transparent);cursor:pointer}
#hbSetup label:has(input:checked){background:color-mix(in oklab,var(--accent,#ff5c00) 16%,transparent);box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--accent,#ff5c00) 60%,transparent)}#hbSetup label b{display:block}#hbSetup label small{color:var(--ink-2,var(--muted,#b5b0a8))}
#hbSetup input[type=radio]{accent-color:var(--accent,#ff5c00)}
#hbSetup input[type=text]{width:100%;box-sizing:border-box;margin-top:6px;padding:8px 10px;border-radius:10px;border:0;background:rgb(0 0 0/.24);box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 12%,transparent);color:inherit;font:inherit}
#hbSetup .r{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}#hbSetup button{padding:9px 16px;border-radius:10px;border:0;background:var(--accent,#ff5c00);color:var(--on-accent,var(--accent-ink,#141006));font:inherit;font-weight:700;cursor:pointer;box-shadow:inset 0 1px 0 rgb(255 255 255/.22)}
#hbSetup button:hover{box-shadow:0 8px 22px -8px var(--accent,#ff5c00),inset 0 1px 0 rgb(255 255 255/.22)}
#hbSetup .e{color:var(--bad,#ff7b7b);min-height:1.4em;margin:6px 0 0}</style>
<div class="c" role="dialog" aria-labelledby="hbT"><h2 id="hbT">Where do you play?</h2>
<p>Critter VTT shares tables through a Homebase. Everyone at the table needs to use the same one.</p>
<div class="opt">
${BUILT_IN ? `<label><input type="radio" name="hbm" value="homebase"><span><b>Homebase</b><small>The shared Homebase this app was built with. Nothing to set up.</small></span></label>` : ''}
<label><input type="radio" name="hbm" value="server"><span><b>Your own Homebase server</b><small>Someone at the table runs the Homebase server. Enter its address:</small><input type="text" id="hbUrl" placeholder="http://192.168.1.20:8787" spellcheck="false" autocomplete="off"></span></label>
<label><input type="radio" name="hbm" value="offline"><span><b>Offline</b><small>Play on this computer only.</small></span></label>
</div><p class="e" id="hbErr">${message || ''}</p><div class="r"><button type="button" id="hbGo">Continue</button></div></div>`;
    document.body.append(box);
    const radios = [...box.querySelectorAll('input[name=hbm]')], url = box.querySelector('#hbUrl'), err = box.querySelector('#hbErr');
    (radios.find(r => r.value === (MODE || (BUILT_IN ? 'homebase' : 'server'))) || radios[0]).checked = true;
    url.value = SERVER; url.onfocus = () => { radios.find(r => r.value === 'server').checked = true; };
    box.querySelector('#hbGo').onclick = async () => {
      const m = radios.find(r => r.checked).value;
      if (m === 'server') {
        let u = url.value.trim().replace(/\/+$/, ''); if (!u) { url.focus(); return; }
        if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
        err.textContent = 'Checking…';
        try { const j = await (await fetch(u + '/health')).json(); if (!j.ok) throw 0; } catch { err.textContent = 'No Homebase server answered at that address.'; return; }
        LS.set('hb.server', u);
      }
      LS.set('hb.mode', m); location.reload();
    };
  };
  if (document.body) show(); else addEventListener('DOMContentLoaded', show);
}
window.CRITBOARD_DESKTOP = { mode: MODE, server: MODE === 'homebase' ? BUILT_IN : SERVER, changeHomebase: () => setupScreen() };
if (!MODE) setupScreen();
if (MODE === 'homebase') startServer(BUILT_IN);
else if (MODE === 'server' && SERVER) startServer(SERVER);

/* ---------- shared pieces ---------- */
const downloads = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename || 'critter-file';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }
};
const peerShape = (x, uid, me) => ({ peer: x.peer, by: x.by, isMe: x.by === uid, sameTab: x.peer === me, kind: 'viewer', guest: false, presence: x.presence || {} });
function errCode(e) {
  const c = (e && e.code) || '';
  const err = new Error((e && e.message) || 'Homebase refused that.');
  err.code = /permission|not allowed|unauthenticated/.test(c + err.message) ? 'invalid_argument' : /exhausted|quota|too large/.test(c + err.message) ? 'quota_exceeded' : 'unavailable';
  return err;
}

/* ============================== a Homebase server (on Cloudflare, or self-hosted) ============================== */
function startServer(base) {
  let uid = LS.get('hb.uid'), key = LS.get('hb.key');
  if (!uid || !key) { uid = 'u' + rand(20); key = rand(40); LS.set('hb.uid', uid); LS.set('hb.key', key); }
  const scopeOf = path => { const s = path.split('/'); return s[0] === 'players' ? 'g' : s[0] === 'lobbies' && s[1] ? 'L' + s[1] : s[0] === 'data' && s[1] === 'users' && s[2] ? 'u' + s[2] : null; };

  // a local copy of every scope this page listens to, kept current by the server's pushes
  const docs = new Map(), ver = new Map(), scopes = new Map(), listeners = new Set(), waits = new Map();
  let verN = 0, ws = null, open = false, backoff = 500, rid = 0, room = null;
  const outq = [];
  const setLocal = (p, d) => { if (d === null || d === undefined) docs.delete(p); else docs.set(p, d); ver.set(p, ++verN); };
  const sendRaw = m => { if (open) ws.send(JSON.stringify(m)); else outq.push(m); };
  const request = m => new Promise((resolve, reject) => { const id = ++rid; waits.set(id, { resolve, reject }); sendRaw({ ...m, rid: id }); });
  function connect() {
    ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    ws.onopen = () => {
      open = true; backoff = 500;
      ws.send(JSON.stringify({ t: 'hello', uid, key }));
      for (const s of scopes.keys()) ws.send(JSON.stringify({ t: 'sub', scope: s }));
      if (room) ws.send(JSON.stringify({ t: 'join', room: room.name, peer: room.peer, presence: room.presence }));
      while (outq.length) ws.send(JSON.stringify(outq.shift()));
      if (room) room.conn(true);
    };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'snap') {
        const s = scopes.get(m.scope); if (!s) return;
        // a big scope arrives in parts; it counts once the last part is in
        if (m.more) { (s.parts = s.parts || []).push(...m.docs); return; }
        if (s.parts) { m.docs = [...s.parts, ...m.docs]; s.parts = null; }
        const seen = new Set(m.docs.map(x => x.p));
        for (const p of [...docs.keys()]) if (scopeOf(p) === m.scope && !seen.has(p)) setLocal(p, null);
        m.docs.forEach(x => setLocal(x.p, x.d)); s.loaded = true; s.resolve(); notify(m.scope);
      } else if (m.t === 'chg') { setLocal(m.p, m.d); notify(m.scope); }
      else if (m.t === 'ack') { const w = waits.get(m.rid); if (w) { waits.delete(m.rid); if (m.error) w.reject(errCode({ message: m.error })); else w.resolve(m); } }
      else if (m.t === 'peers' && room && m.room === room.name) room.peersIn(m.peers);
      else if (m.t === 'evt' && room && m.room === room.name) room.evtIn(m);
    };
    ws.onclose = () => { open = false; for (const s of scopes.values()) s.parts = null; if (room) room.conn(false); setTimeout(connect, backoff); backoff = Math.min(8000, backoff * 2); };
  }
  connect();
  // a small sign of life now and then, so quiet connections aren't closed along the way
  setInterval(() => { if (open) ws.send('{"t":"ping"}'); }, 25000);

  function ensureScope(scope) {
    let s = scopes.get(scope);
    if (!s) { s = { loaded: false }; s.ready = new Promise(r => { s.resolve = r; }); scopes.set(scope, s); sendRaw({ t: 'sub', scope }); }
    return s.ready;
  }
  const cmp = (a, b) => (a === b ? 0 : a === undefined || a === null ? -1 : b === undefined || b === null ? 1 : a < b ? -1 : 1);
  const test = (d, [f, op, v]) => { const x = d ? d[f] : undefined; return op === '==' ? x === v : op === '!=' ? x !== v : op === '<' ? x < v : op === '<=' ? x <= v : op === '>' ? x > v : op === '>=' ? x >= v : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : op === 'in' ? Array.isArray(v) && v.includes(x) : false; };
  function runQuery(q) {
    const depth = q.path.split('/').length + 1, pre = q.path + '/';
    let rows = []; for (const [p, d] of docs) if (p.startsWith(pre) && p.split('/').length === depth) rows.push([p, d]);
    for (const w of q.wheres) rows = rows.filter(([, d]) => test(d, w));
    if (q.order) rows.sort((a, b) => cmp(a[1][q.order[0]], b[1][q.order[0]]) * (q.order[1] === 'desc' ? -1 : 1));
    return q.lim ? rows.slice(0, q.lim) : rows;
  }
  const docSnap = p => ({ id: p.split('/').pop(), exists: docs.has(p), data: () => clone(docs.get(p)), ref: { path: p } });
  const querySnap = rows => { const d = rows.map(([p, v]) => ({ id: p.split('/').pop(), exists: true, data: () => clone(v), ref: { path: p } })); return { docs: d, size: d.length, empty: !d.length, forEach: f => d.forEach(f) }; };
  function notify(scope) {
    for (const l of listeners) {
      if (l.scope !== scope || !(scopes.get(scope) || {}).loaded) continue;
      let sig, snap;
      if (l.kind === 'doc') { sig = (docs.has(l.path) ? 'y' : 'n') + (ver.get(l.path) || 0); snap = () => docSnap(l.path); }
      else { const rows = runQuery(l.q); sig = rows.map(([p]) => p + ':' + (ver.get(p) || 0)).join('|'); snap = () => querySnap(rows); }
      if (sig === l.sig) continue;
      l.sig = sig; const s = snap();
      queueMicrotask(() => { if (listeners.has(l)) try { l.fn(s); } catch (e) { console.error(e); } });
    }
  }
  // writes show here at once; the server's echo confirms them
  function write(op, path, data) {
    // only documents in a scope this page follows are kept here (uploaded music pieces just go to the server)
    const scope = scopeOf(path);
    if (scope) { if (op === 'delete') setLocal(path, null); else if (op === 'update') setLocal(path, { ...(docs.get(path) || {}), ...clone(data) }); else setLocal(path, clone(data)); notify(scope); }
    return request({ t: 'write', ops: [{ op, path, data: op === 'delete' ? undefined : clone(data) }] }).then(() => {});
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      async get() { const s = scopes.get(scopeOf(path)); if (s && s.loaded) return docSnap(path); const r = await request({ t: 'get', path }); return { id: path.split('/').pop(), exists: !!r.exists, data: () => clone(r.data), ref: { path } }; },
      set: d => write('set', path, d), update: d => write('update', path, d), delete: () => write('delete', path),
      onSnapshot(fn, err) { const scope = scopeOf(path); if (!scope) { if (err) err(new Error('unknown place')); return () => {}; } const l = { scope, kind: 'doc', path, fn, sig: null }; listeners.add(l); ensureScope(scope).then(() => notify(scope)); return () => listeners.delete(l); },
      collection: sub => query(path + '/' + sub)
    };
  }
  function query(path, q = { wheres: [], order: null, lim: 0 }) {
    const Q = { ...q, path };
    return {
      path,
      where: (f, op, v) => query(path, { ...Q, wheres: [...Q.wheres, [f, op, v]] }),
      orderBy: (f, dir) => query(path, { ...Q, order: [f, dir || 'asc'] }),
      limit: n => query(path, { ...Q, lim: n }),
      doc: id => docRef(path + '/' + id),
      async add(d) { const id = rand(20); await write('set', path + '/' + id, d); return { id, path: path + '/' + id }; },
      async get() { await ensureScope(scopeOf(path)); return querySnap(runQuery(Q)); },
      onSnapshot(fn, err) { const scope = scopeOf(path); if (!scope) { if (err) err(new Error('unknown place')); return () => {}; } const l = { scope, kind: 'col', q: Q, fn, sig: null }; listeners.add(l); ensureScope(scope).then(() => notify(scope)); return () => listeners.delete(l); }
    };
  }
  const db = { doc: docRef, collection: p => query(p) };

  const roomCap = {
    async join(rawName) {
      const name = String(rawName).replace(/[^\w-]/g, '').slice(0, 60) || 'lobby', peer = 'p' + rand(12);
      const handlers = new Map(), peerFns = new Set(), connFns = new Set();
      let peers = [], connected = open, sendT = 0, lastSend = 0;
      const R = room = {
        name, peer, presence: {},
        conn(v) { connected = v; connFns.forEach(f => f({ connected: v })); },
        peersIn(list) { peers = list.map(x => peerShape(x, uid, peer)); if (!peers.some(p => p.sameTab)) peers.push(peerShape({ peer, by: uid, presence: R.presence }, uid, peer)); peerFns.forEach(f => { try { f({ peers }); } catch (e) { console.error(e); } }); },
        evtIn(m) { const msg = { topic: m.topic, data: m.data, peer: m.peer, by: m.by, isMe: m.by === uid, sameTab: m.peer === peer, kind: 'viewer', guest: false }; (handlers.get(m.topic) || []).forEach(f => { try { f(msg); } catch (e) { console.error(e); } }); }
      };
      sendRaw({ t: 'join', room: name, peer, presence: {} });
      const push = () => { lastSend = Date.now(); sendRaw({ t: 'presence', room: name, peer, presence: R.presence }); };
      return {
        async emit(topic, data) { await request({ t: 'emit', room: name, peer, topic, data: clone(data ?? null) }); },
        on(topic, fn) { if (!handlers.has(topic)) handlers.set(topic, new Set()); handlers.get(topic).add(fn); return () => handlers.get(topic).delete(fn); },
        async presence(patch) { for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete R.presence[k]; else R.presence[k] = clone(v); } clearTimeout(sendT); sendT = setTimeout(push, Math.max(0, 50 - (Date.now() - lastSend))); },
        peers: () => peers,
        onPeers(fn) { peerFns.add(fn); return () => peerFns.delete(fn); },
        onConnection(fn) { connFns.add(fn); return () => connFns.delete(fn); },
        connected: () => connected,
        async leave() { sendRaw({ t: 'leave', room: name }); if (room === R) room = null; }
      };
    }
  };
  const user = { id: async () => uid, me: async () => ({ id: uid }), isOwner: () => false, canEdit: () => true, can: () => true, profiles: async () => ({}) };
  // the table's autosaves on the Homebase (lobby owner and co-owners); an older Homebase that doesn't know them never answers
  const ask = m => Promise.race([request(m), new Promise((_, no) => setTimeout(() => no(errCode({ message: 'This Homebase has no autosaves yet. Update it to get them.' })), 9000))]);
  const homebase = {
    saves: async code => (await ask({ t: 'saves', scope: 'L' + code })).saves || [],
    saveNow: async (code, label) => (await ask({ t: 'savenow', scope: 'L' + code, label })).id,
    restore: async (code, id) => { await ask({ t: 'restore', scope: 'L' + code, id }); },
    // D&D Beyond, through this Homebase (lobby owner and co-owners): what: 'config' | 'items' | 'spells' | 'monsters'.
    // The CobaltSession cookie goes to the Homebase for this one call and is never stored there.
    // Plain HTTP rather than the socket: an import takes many calls and its answers can be megabytes.
    ddb: async (code, req) => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 180000);
      let r;
      try { r = await fetch(base + '/ddb', { method: 'POST', body: JSON.stringify({ ...req, uid, key, scope: 'L' + code }), signal: ctl.signal }); }
      catch { throw errCode({ message: 'D&D Beyond took too long to answer, or the Homebase couldn\'t be reached.' }); }
      finally { clearTimeout(t); }
      if (r.status === 404) throw errCode({ message: 'This Homebase is too old for D&D Beyond imports. Update it.' });
      let j = null; try { j = await r.json(); } catch {}
      if (!j || j.error) throw errCode({ message: (j && j.error) || 'The Homebase couldn\'t ask D&D Beyond.' });
      return j.data;
    }
  };
  window.claude = { use: async name => ({ db, room: roomCap, user, downloads, homebase }[name] || null) };
}
