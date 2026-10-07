// The update pop-up's only link to the app: it hears the updater's state and sends back what was pressed.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('upd', {
  onState: fn => ipcRenderer.on('upd:state', (e, s) => fn(s)),
  act: a => ipcRenderer.send('upd:act', String(a)),
  size: h => ipcRenderer.send('upd:size', Number(h) || 0)
});
