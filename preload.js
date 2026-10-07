// What the Notes page may ask of the app: its campaigns folder, pictures, exports and the window.
const { contextBridge, ipcRenderer } = require('electron');
const on = (ch, fn) => { const h = (e, v) => fn(v); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };
contextBridge.exposeInMainWorld('desk', {
  vault: () => ipcRenderer.invoke('vault:get'),
  pickVault: () => ipcRenderer.invoke('vault:pick'),
  openFolder: cid => ipcRenderer.invoke('vault:open', cid),
  campList: () => ipcRenderer.invoke('camp:list'),
  campSave: meta => ipcRenderer.invoke('camp:save', meta),
  campTrash: cid => ipcRenderer.invoke('camp:trash', cid),
  docList: cid => ipcRenderer.invoke('doc:list', cid),
  docSave: (cid, doc) => ipcRenderer.invoke('doc:save', cid, doc),
  docTrash: (cid, id) => ipcRenderer.invoke('doc:trash', cid, id),
  imgPut: (cid, name, bytes) => ipcRenderer.invoke('img:put', cid, name, bytes),
  imgCopy: (from, to, file) => ipcRenderer.invoke('img:copy', from, to, file),
  exportMd: (cid, name, files) => ipcRenderer.invoke('export:md', cid, name, files),
  saveFile: (name, text) => ipcRenderer.invoke('file:save', name, text),
  openFile: () => ipcRenderer.invoke('file:open'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  winCmd: (c, arg) => ipcRenderer.send('win:cmd', c, arg),
  onWinState: fn => on('win:state', fn),
  onKey: fn => on('key', fn),
  onCloseAsked: fn => on('close-asked', fn),
  quitOk: () => ipcRenderer.send('quit-ok'),
  // updates from GitHub: { auto, skip, version, repo, changelog }, the on-start setting, a check now, the GitHub page
  updates: {
    get: () => ipcRenderer.invoke('upd:get'),
    set: auto => ipcRenderer.invoke('upd:set', { auto: !!auto }),
    check: () => ipcRenderer.invoke('upd:check'),
    github: () => ipcRenderer.invoke('upd:github')
  }
});
