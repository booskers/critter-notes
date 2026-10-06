/* Critter Notes and the table: a campaign can be linked to a Critter lobby through Homebase (the same connection the
   Critter app and Critter Sounds use). Notes then reads the table (its Library, the GM's notebook, scenes, players,
   the chat log and what Critter Sounds can play) and writes to it:
     lobbies/<code>/ents/<id>         Library entries (NPCs and items), owner 'gm'
     lobbies/<code>/notes/<id>        notes in the GM's notebook, or handouts (dm: true) with the players' copies
     lobbies/<code>/scenes/<id> + scenebg/<id>_<n> + the lobby's scene list    a map as a new scene, hidden until revealed
     lobbies/<code>/cues/<id>         a cue for Critter Sounds, signed with the music key (Sounds checks it, plays, deletes it)
   Everything is written as the lobby allows anyone with its code to; nothing here needs the Critter page to change. */
const TABLE = (() => {
  const T = { db: null, code: '', key: '', state: 'off', why: '', lobby: null, ents: new Map(), gm: new Map(), sounds: null, music: null, keyOk: null, pending: new Map(), offs: [], fns: new Set(), tok: 0 };
  const rand = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const emit = why => T.fns.forEach(f => { try { f(why); } catch (e) { console.error(e); } });
  const P = (...a) => `lobbies/${T.code}/` + a.join('/');
  // a lobby code, or Critter's music code (lobby code and key) for cueing Critter Sounds too
  function parse(s) {
    const parts = String(s || '').toUpperCase().replace(/\b(LOBBY|KEY)\b/g, ' ').split(/[^A-Z0-9]+/).filter(Boolean);
    if (!parts.length) return { code: '', key: '' };
    if (parts.length === 1 && parts[0].length > 8) return { code: parts[0].slice(0, 6), key: parts[0].slice(6) };
    return { code: parts[0], key: parts.slice(1).join('') };
  }
  const show = (code, key) => [code, key.slice(0, 5), key.slice(5)].filter(Boolean).join('-');

  async function connect(str) {
    const { code, key } = parse(str);
    disconnect(true);
    if (!code) { emit('state'); return false; }
    const tok = ++T.tok;
    Object.assign(T, { code, key, state: 'connecting', why: '' }); emit('state');
    if (!window.claude || typeof window.claude.use !== 'function') { T.state = 'error'; T.why = 'Choose a Homebase first (Critter Notes menu › Homebase).'; emit('state'); return false; }
    try {
      const db = await window.claude.use('db'); if (!db) throw new Error('no db');
      const snap = await Promise.race([db.doc('lobbies/' + code).get(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 12000))]);
      if (tok !== T.tok) return false;
      if (!snap.exists) { T.state = 'missing'; T.why = `No table uses the code ${code} on this Homebase.`; emit('state'); return false; }
      T.db = db; T.lobby = snap.data() || {};
      T.offs.push(db.doc(P().slice(0, -1)).onSnapshot(s => { T.lobby = s.exists ? s.data() || {} : null; emit('lobby'); }, () => {}));
      T.offs.push(db.collection(P('ents')).onSnapshot(s => { T.ents = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }])); emit('ents'); }, () => {}));
      T.offs.push(db.collection(P('notes')).where('owner', '==', 'gm').onSnapshot(s => { T.gm = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }])); emit('notes'); }, () => {}));
      T.offs.push(db.doc(P('soundcat', 'main')).onSnapshot(s => { T.sounds = s.exists ? s.data() || null : null; emit('sounds'); }, () => {}));
      T.offs.push(db.doc(P('state', 'music')).onSnapshot(async s => { T.music = s.exists ? s.data() || {} : {}; T.keyOk = !T.key ? null : !T.music.lk ? false : (await sha(T.key)) === T.music.lk; emit('sounds'); }, () => {}));
      // a cue Critter Sounds has taken is deleted; one still there after a while was not
      T.offs.push(db.collection(P('cues')).onSnapshot(s => { const here = new Set(s.docs.map(d => d.id)); for (const [id, p] of T.pending) if (!here.has(id) && p.seen) { T.pending.delete(id); p.done(true); } else if (here.has(id)) p.seen = true; }, () => {}));
      T.state = 'on'; emit('state');
      return true;
    } catch (e) {
      if (tok !== T.tok) return false;
      T.state = 'error'; T.why = 'Could not reach the Homebase. Check the connection, and that Notes uses the same Homebase as the table.'; emit('state'); return false;
    }
  }
  function disconnect(quiet) {
    T.tok++; T.offs.forEach(f => { try { f(); } catch {} }); T.offs = [];
    Object.assign(T, { db: null, state: 'off', why: '', lobby: null, ents: new Map(), gm: new Map(), sounds: null, music: null, keyOk: null });
    if (!quiet) emit('state');
  }
  const on = () => T.state === 'on' && !!T.db;
  const need = () => { if (!on()) throw new Error('This campaign isn\'t linked to a table right now.'); };
  const sys = () => (T.lobby && T.lobby.rules && T.lobby.rules.sys) || 'generic';
  const players = () => (Array.isArray(T.lobby && T.lobby.plist) ? T.lobby.plist : []).filter(p => p && /^pl_/.test(p.id));
  const scenes = () => { const l = (Array.isArray(T.lobby && T.lobby.scenes) ? T.lobby.scenes : []).filter(x => x && /^[\w-]{1,24}$/.test(String(x.id))).map(x => ({ id: String(x.id), name: String(x.name || 'Scene').slice(0, 30) })); if (!l.some(x => x.id === 'main')) l.unshift({ id: 'main', name: 'Main' }); return l; };

  /* ---------- pictures, made small enough for the table ---------- */
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be read.')); i.src = src; }); }
  async function jpeg(src, maxSide, limit, square) {
    const im = await loadImg(src);
    let max = maxSide, q = 0.86, out = '';
    for (let k = 0; k < 9; k++) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      if (square) { const s = Math.min(im.naturalWidth, im.naturalHeight); c.width = c.height = Math.min(max, s); g.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, c.width, c.height); }
      else { const f = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); c.width = Math.max(1, Math.round(im.naturalWidth * f)); c.height = Math.max(1, Math.round(im.naturalHeight * f)); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); }
      out = c.toDataURL('image/jpeg', q);
      if (out.length < limit) return { url: out, w: c.width, h: c.height };
      max = Math.round(max * 0.82); q = Math.max(0.55, q - 0.06);
    }
    throw new Error('That picture is too large to send.');
  }

  /* ---------- writing to the table ---------- */
  // a note in the GM's notebook in Critter, or a handout (shown to everyone at once with show: true)
  async function sendNote({ id, title, text, img, handout, show }) {
    need();
    const now = Date.now(), nid = id && T.gm.has(id) ? id : 'n' + rand(14);
    const old = T.gm.get(nid) || {};
    const pic = img ? (await jpeg(img, 1000, 390000)).url : '';
    // Critter shows a handout's title, but not a note's, so a note starts with it; Critter credits it "from the GM's notes"
    const body = handout || !title ? String(text || '') : `### ${title}\n\n${text || ''}`;
    const doc = { owner: 'gm', kind: 'note', title: String(title || '').slice(0, 80), text: body.slice(0, 8000), img: pic, pos: old.pos || now, ts: old.ts || now, ets: now, from: { t: 'notes', n: 'the GM' }, dm: !!handout, rev: old.rev || [], src: '', pe: false };
    await T.db.doc(P('notes', nid)).set(doc);
    if (handout && show) {
      // the same as Critter's "Show to everyone": a copy in each player's notes
      const have = new Set(); const all = await T.db.collection(P('notes')).where('src', '==', nid).get();
      for (const c of all.docs) {
        const x = c.data() || {}; have.add(x.owner);
        // the players' copies follow the handout, unless a player has changed theirs
        if (!x.pe && (x.text !== doc.text || x.title !== doc.title || x.img !== doc.img)) await T.db.doc(P('notes', c.id)).update({ title: doc.title, text: doc.text, img: doc.img });
      }
      for (const p of players()) if (!have.has(p.id)) await T.db.doc(P('notes', 'n' + rand(14))).set({ owner: p.id, kind: 'note', dm: true, src: nid, title: doc.title, text: doc.text, img: doc.img, pos: now, ts: now, from: { t: 'dm', n: 'GM' } });
      await T.db.doc(P('notes', nid)).update({ rev: 'all' });
    }
    return nid;
  }
  // an NPC or item in the table's Library; sending again updates it and keeps what the table changed on it
  async function sendEnt({ id, kind, name, data, img, sys: esys }) {
    need();
    const old = id && T.ents.get(id), eid = old ? id : kind[0] + '_' + rand(14), now = Date.now();
    const pics = img ? { img: (await jpeg(img, 256, 130000, true)).url, imgT: (await jpeg(img, 64, 18000, true)).url } : {};
    const doc = old
      ? { ...old, name: String(name || old.name).slice(0, 60), data: { ...(old.data || {}), ...data, name: String(name || old.name).slice(0, 60) }, ...pics, by: 'notes', ts: now }
      : { kind, sys: esys || sys(), owner: 'gm', name: String(name || '').slice(0, 60), shared: false, linked: true, data: { ...data, name: String(name || '').slice(0, 60) }, img: pics.img || '', imgT: pics.imgT || '', by: 'notes', ts: now };
    delete doc.id;
    await T.db.doc(P('ents', eid)).set(doc);
    return eid;
  }
  // a map as a new scene: hidden from the players until the GM reveals it in Critter
  async function sendScene({ id, name, img }) {
    need();
    const pic = await jpeg(img, 2600, 12 * 200000 - 1000);
    const sid = id && scenes().some(s => s.id === id) ? id : 'nt' + rand(8), src = pic.url, chunks = [];
    for (let i = 0; i < src.length; i += 200000) chunks.push(src.slice(i, i + 200000));
    const list = scenes();
    if (!list.some(s => s.id === sid) && list.length >= 24) throw new Error('The table already has 24 scenes, Critter\'s most. Remove one there first.');
    for (let i = 0; i < chunks.length; i++) await T.db.doc(P('scenebg', `${sid}_${i}`)).set({ d: chunks[i] });
    await T.db.doc(P('scenes', sid)).set({ bg: { mode: 'contain', size: 100, dim: 0, grid: false, x: 0, y: 0, w: pic.w, h: pic.h, v: rand(8), chunks: chunks.length }, n: chunks.length });
    const fresh = scenes(); const at = fresh.findIndex(s => s.id === sid);
    if (at >= 0) fresh[at].name = String(name || 'Map').slice(0, 30); else fresh.push({ id: sid, name: String(name || 'Map').slice(0, 30) });
    await T.db.doc(P().slice(0, -1)).update({ scenes: fresh });
    return sid;
  }
  // a cue for Critter Sounds: op 'play' or 'stop'; kind 'playlist' | 'pad' | 'scene' | 'scape' | 'all'
  async function cue(op, kind, ref, name) {
    need();
    if (!T.key) throw new Error('Link the campaign with the music code (from Critter\'s Music window) to cue Critter Sounds.');
    if (T.keyOk === false) throw new Error('That music key is out of date. Copy the music code from Critter\'s Music window again.');
    const id = 'q' + rand(14), sig = await sha([T.key, id, op, kind, ref].join('|')), db = T.db;
    const done = new Promise(res => {
      const p = { done: ok => { clearTimeout(p.t); res(ok); }, seen: false };
      p.t = setTimeout(() => { T.pending.delete(id); db.doc(P('cues', id)).delete().catch(() => {}); res(false); }, 6000);
      T.pending.set(id, p);
    });
    await db.doc(P('cues', id)).set({ op, kind, ref: String(ref || ''), name: String(name || '').slice(0, 80), ts: Date.now(), by: 'notes', sig });
    return done;
  }

  // a line in the table's chat, as the GM (from a random table, say)
  async function say(text) {
    need();
    await T.db.doc(P('log', 'n' + rand(16))).set({ k: 'msg', text: String(text).slice(0, 2000), uid: 'critter-notes', n: 'GM', c: '#10b39b', ts: Date.now(), from: { t: 'notes', n: 'the GM' } });
  }

  /* ---------- reading from the table ---------- */
  async function sceneImage(sid) {
    need();
    if (sid === 'main' || sid === (T.lobby && T.lobby.scene)) {
      const bg = T.lobby && T.lobby.bg; if (!bg || !bg.chunks) return '';
      const parts = await Promise.all(Array.from({ length: Math.min(12, +bg.chunks || 0) }, (_, i) => T.db.doc(P('bgdata', String(i))).get().then(s => (s.exists ? String((s.data() || {}).d || '') : ''))));
      return parts.join('');
    }
    const s = await T.db.doc(P('scenes', sid)).get(), d = s.exists ? s.data() || {} : {};
    if (!d.bg) return '';
    return (await Promise.all(Array.from({ length: Math.min(12, +d.n || 0) }, (_, i) => T.db.doc(P('scenebg', `${sid}_${i}`)).get().then(c => (c.exists ? String((c.data() || {}).d || '') : ''))))).join('');
  }
  // what was said and rolled at the table (and played by Critter Sounds) since a time
  async function chatSince(ts) {
    need();
    const [log, snd] = await Promise.all([T.db.collection(P('log')).get(), T.db.collection(P('soundlog')).get()]);
    const out = [];
    log.forEach(d => { const m = d.data() || {}; if (!(+m.ts >= ts) || m.hidden) return; out.push({ ts: +m.ts, who: String(m.an || m.n || ''), k: m.k, text: m.k === 'roll' ? `${m.label ? m.label + ': ' : ''}${m.expr || ''} = ${m.total ?? ''}${m.out && m.out.label ? ' (' + m.out.label + ')' : ''}` : String(m.text || '') }); });
    snd.forEach(d => { const m = d.data() || {}; if (!(+m.ts >= ts)) return; out.push({ ts: +m.ts, who: '♪', k: 'sound', text: String(m.text || '') }); });
    return out.sort((a, b) => a.ts - b.ts);
  }

  return { T, parse, show, connect, disconnect, on, sys, players, scenes, sendNote, sendEnt, sendScene, cue, say, sceneImage, chatSince, jpeg, onChange: fn => { T.fns.add(fn); return () => T.fns.delete(fn); } };
})();
