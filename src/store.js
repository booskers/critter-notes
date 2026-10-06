/* Critter Notes: where campaigns are kept. In the desktop app, plain files in the campaigns folder (main.js);
   in a browser, IndexedDB. Both answer the same calls. */
const STORE = (() => {
  const desk = window.desk || null;
  const hex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-1', buf))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
  const extOf = (name, type) => { let e = String(name || '').split('.').pop().toLowerCase(); if (!/^(png|jpe?g|webp|gif|svg|avif)$/.test(e)) e = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' }[type] || 'png'; return e === 'jpeg' ? 'jpg' : e; };

  if (desk) {
    return {
      kind: 'files',
      vault: () => desk.vault(),
      pickVault: () => desk.pickVault(),
      openFolder: cid => desk.openFolder(cid),
      listCampaigns: () => desk.campList(),
      saveCampaign: meta => desk.campSave(meta),
      trashCampaign: cid => desk.campTrash(cid),
      loadDocs: cid => desk.docList(cid),
      saveDoc: (cid, doc) => desk.docSave(cid, doc),
      trashDoc: (cid, id) => desk.docTrash(cid, id),
      async putImage(cid, blob, name) { const bytes = new Uint8Array(await blob.arrayBuffer()); return desk.imgPut(cid, name || 'picture.' + extOf('', blob.type), bytes); },
      copyImage: (from, to, file) => desk.imgCopy(from, to, file),
      imageUrl: async (cid, file) => `app://notes/img/${cid}/${encodeURIComponent(file)}`,
      exportMd: (cid, name, files) => desk.exportMd(cid, name, files),
      saveFile: (name, text) => desk.saveFile(name, text),
      openFile: () => desk.openFile()
    };
  }

  // a browser: everything in IndexedDB
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('critter-notes', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('camps'); d.createObjectStore('docs').createIndex('cid', 'cid'); d.createObjectStore('images'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store); let out; Promise.resolve(fn(s)).then(v => { out = v; }); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }); };
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const urls = new Map();
  return {
    kind: 'browser',
    vault: async () => ({ root: 'this browser' }),
    pickVault: async () => null,
    openFolder: async () => false,
    listCampaigns: () => tx('camps', 'readonly', s => req(s.getAll())),
    saveCampaign: meta => tx('camps', 'readwrite', s => { s.put(JSON.parse(JSON.stringify(meta)), meta.id); }),
    async trashCampaign(cid) {
      await tx('camps', 'readwrite', s => { s.delete(cid); });
      const docs = await this.loadDocs(cid); await tx('docs', 'readwrite', s => { docs.forEach(d => s.delete(cid + '/' + d.id)); });
    },
    loadDocs: cid => tx('docs', 'readonly', async s => (await req(s.index('cid').getAll(cid))).map(x => x.doc)),
    saveDoc: (cid, doc) => tx('docs', 'readwrite', s => { s.put({ cid, doc: JSON.parse(JSON.stringify(doc)) }, cid + '/' + doc.id); }),
    trashDoc: (cid, id) => tx('docs', 'readwrite', s => { s.delete(cid + '/' + id); }),
    async putImage(cid, blob, name) { const file = (await hex(await blob.arrayBuffer())) + '.' + extOf(name, blob.type); await tx('images', 'readwrite', s => { s.put(blob, cid + '/' + file); }); return file; },
    async copyImage(from, to, file) { const b = await tx('images', 'readonly', s => req(s.get(from + '/' + file))); if (b) await tx('images', 'readwrite', s => { s.put(b, to + '/' + file); }); },
    async imageUrl(cid, file) {
      const k = cid + '/' + file; if (urls.has(k)) return urls.get(k);
      const b = await tx('images', 'readonly', s => req(s.get(k))); const u = b ? URL.createObjectURL(b) : ''; urls.set(k, u); return u;
    },
    exportMd: async () => null,
    async saveFile(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.append(a); a.click(); a.remove(); return name; },
    openFile: () => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = () => { const f = i.files[0]; if (!f) return res(null); f.text().then(res, () => res(null)); }; i.click(); })
  };
})();
