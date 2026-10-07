/* Critter Notes in a web browser (notes.crittervtt.com): what the desktop app gets from its files and folders.
   - Safe: campaigns live only in this browser (IndexedDB) unless sharing is turned on; Notes asks the browser to keep them
     for good (navigator.storage.persist) so they aren't cleared when space runs low, and Settings › Files says whether it did.
   - Backed up: "Download everything" (every campaign, pictures and all, one file that "Restore a backup" reads back), and a
     reminder on Home when there are changes no backup has seen for a week.
   - Downloads: Markdown export as a .zip, the Windows app from GitHub.
   - Installable and offline: a web app manifest and a service worker (sw.js, written by build.mjs), registered here. */
'use strict';
const WEB = (() => {
  const on = !window.desk;
  const DESKTOP = 'https://github.com/booskers/critter-notes/releases/latest/download/Critter-Notes-Setup.exe';

  /* ---------- keeping the campaigns ---------- */
  let kept = null;   // true: the browser promised to keep them; false: it may clear them; null: it can't say
  async function keep(ask) {
    if (!on || !navigator.storage || !navigator.storage.persisted) return null;
    try { kept = await navigator.storage.persisted(); if (!kept && ask) kept = await navigator.storage.persist(); } catch { kept = null; }
    return kept;
  }
  async function usage() { try { const e = await navigator.storage.estimate(); return e; } catch { return null; } }

  /* ---------- downloads ---------- */
  const blobToData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  const stamp = () => new Date().toISOString().slice(0, 10);
  // every campaign in one file: { app, v: 2, at, all: [{ camp, docs, images }] }
  async function everything() {
    await flush();
    const all = [];
    for (const c of A.camps.filter(x => !x.tour)) {
      const docs = A.camp && A.camp.id === c.id ? [...A.docs.values()] : await STORE.loadDocs(c.id).catch(() => []);
      const files = new Set(), images = {};
      for (const d of docs) { if (d.img) files.add(d.img); if (d.banner) files.add(d.banner); if (d.map && d.map.img) files.add(d.map.img); for (const m of String(d.body || '').matchAll(/!\[[^\]]*\]\(img:([^)\s]+)\)/g)) files.add(m[1]); }
      if (c.cover) files.add(c.cover);
      for (const f of files) { try { images[f] = await blobToData(await (await fetch(await STORE.imageUrl(c.id, f))).blob()); } catch {} }
      all.push({ camp: c, docs, images });
    }
    return { app: 'critter-notes', v: 2, at: Date.now(), all };
  }
  async function downloadEverything() {
    const j = await everything();
    if (!j.all.length) { toast('There\'s nothing to back up yet.'); return; }
    const name = `Critter Notes, everything ${stamp()}.critter-notes.json`;
    if (on) download(name, new Blob([JSON.stringify(j)], { type: 'application/json' }));
    else if (!(await STORE.saveFile(name, JSON.stringify(j)).catch(() => null))) return;
    A.prefs.lastBackup = Date.now(); savePrefs();
    toast(`Downloaded ${plural(j.all.length, 'campaign')} in one file. "Restore a backup" brings them back.`);
    if (A.view.k === 'home') renderMain();
  }

  /* ---------- a .zip (stored, no compression: Markdown and pictures are small or already compressed) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(entries) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    const d = new Date(), dt = ((d.getFullYear() - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const e of entries) {
      const name = enc.encode(e.path), data = e.data instanceof Uint8Array ? e.data : enc.encode(e.data), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(10, dt, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(12, dt, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const csize = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
  // Markdown export in a browser: the same files the desktop app writes, in one .zip
  async function exportMdZip(cid, name, files) {
    const entries = [];
    for (const f of files) {
      if (f.img) { try { entries.push({ path: f.path, data: new Uint8Array(await (await fetch(await STORE.imageUrl(cid, f.img))).arrayBuffer()) }); } catch {} }
      else entries.push({ path: f.path, data: f.text });
    }
    const file = `${String(name).replace(/[\\/:*?"<>|]+/g, ' ').trim()} (Markdown) ${stamp()}.zip`;
    download(file, zip(entries));
    return file;
  }

  /* ---------- Home: a backup reminder ---------- */
  // changes no backup has seen, for a week (or never backed up, after a few days of use): a gentle card, never a pop-up
  function reminder() {
    if (!on || !A.camp || SYNC.isPlayer()) return null;
    const last = +A.prefs.lastBackup || 0, snooze = +A.prefs.backupSnooze || 0, now = Date.now(), changed = Math.max(...A.camps.map(c => +c.updated || 0));
    if (now < snooze || changed <= last) return null;
    const first = +A.prefs.firstUse || (A.prefs.firstUse = now, savePrefs(), now);
    if (last ? now - last < 7 * 864e5 : now - first < 3 * 864e5) return null;
    return h('section', { class: 'hcard backupcard', role: 'note' },
      h('div', { class: 'hrow' }, h('h2', { text: 'Back up your campaigns' })),
      h('p', { text: (last ? `The last backup is from ${new Date(last).toLocaleDateString()}.` : 'Nothing is backed up yet.') + ' Your campaigns live only in this browser: one file keeps them safe anywhere.' }),
      h('div', { class: 'row' }, btn('download', 'Download everything', () => downloadEverything(), 'tiny primary'), btn(null, 'Later', () => { A.prefs.backupSnooze = now + 3 * 864e5; savePrefs(); renderMain(); }, 'tiny ghost')));
  }

  /* ---------- Settings › Files, in a browser ---------- */
  function settingsRows(row) {
    if (!on) return [row('Download everything', 'Every campaign, pictures and all, in one file. "Restore a backup" brings them back.', btn('download', 'Download…', () => downloadEverything(), 'tiny'))];
    const state = h('span', { text: 'Asking the browser…' });
    keep(false).then(async k => {
      const u = await usage(), mb = u && u.usage ? ` They take ${(u.usage / 1048576).toFixed(1)} MB here.` : '';
      state.textContent = (k === true ? 'This browser keeps your campaigns for good; it won\'t clear them when space runs low.' : k === false ? 'This browser may clear your campaigns if it runs out of space. Download a backup now and then, or add Notes to your home screen.' : 'Your campaigns live only in this browser.') + mb;
    });
    return [
      h('div', { class: 'setrow' }, h('div', { class: 'sl' }, h('b', { text: 'Kept in this browser' }), state), h('div', { class: 'sc' }, btn(null, 'Ask to keep them', async () => { const k = await keep(true); toast(k ? 'The browser will keep them.' : 'The browser didn\'t promise to keep them. Back them up now and then.'); renderMain(); }, 'tiny ghost'))),
      row('Download everything', 'Every campaign, pictures and all, in one file. "Restore a backup" brings them back, here or in the desktop app.' + (A.prefs.lastBackup ? ` Last downloaded ${new Date(+A.prefs.lastBackup).toLocaleDateString()}.` : ''), btn('download', 'Download…', () => downloadEverything(), 'tiny primary')),
      row('The desktop app', 'Critter Notes for Windows keeps campaigns as plain files in a folder of your choice.', h('a', { class: 'btn tiny ghost', href: DESKTOP, rel: 'noopener', text: 'Download for Windows' }))
    ];
  }

  /* ---------- offline and installable ---------- */
  function register() {
    if (!on || !('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      // a new version waiting: say so, and use it on the next start (or now, if asked)
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('A new version of Critter Notes is ready.', { label: 'Use it now', fn: async () => { await saveAllNow().catch(() => {}); w.postMessage('skip'); setTimeout(() => location.reload(), 300); } }); }); });
    }).catch(() => {});
  }
  if (on) { addEventListener('load', register); keep(false).then(k => { if (k === false && A.camps && A.camps.length) keep(true); }); }
  return { on, keep, downloadEverything, everything, exportMdZip, reminder, settingsRows, zip, DESKTOP };
})();
