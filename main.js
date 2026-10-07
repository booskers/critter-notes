// Critter Notes: a GM's notebook for planning sessions and writing a world, linked to a Critter table.
// The page is served as app://notes/. Campaigns live as plain files in a folder of the GM's choosing
// (Documents\Critter Notes by default): <campaign>/campaign.json, docs/<id>.json and images/<file>.
const { app, BrowserWindow, Menu, protocol, net, shell, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const WWW = path.join(__dirname, 'www');
const ICON = path.join(__dirname, 'assets', 'icon.png');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
// CBN_USERDATA=<folder>: keep settings elsewhere; CBN_VAULT=<folder>: keep campaigns elsewhere (both for testing)
if (process.env.CBN_USERDATA) app.setPath('userData', process.env.CBN_USERDATA);
let win = null;
// updates from the GitHub releases (updater.js); Notes writes its last changes before the installer takes over
const updates = require('./updater')({ owner: 'booskers', repo: 'critter-notes', name: 'Critter Notes', parent: () => win, page: () => win && win.webContents,
  beforeInstall: () => new Promise(res => { if (!win || win.isDestroyed()) return res(); win.once('closed', res); win.close(); }) });

/* ---------- settings and the campaigns folder ---------- */
const SETTINGS = () => path.join(app.getPath('userData'), 'notes-settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(SETTINGS(), 'utf8')); } catch {}
const saveSettings = () => fsp.writeFile(SETTINGS(), JSON.stringify(settings, null, 2)).catch(() => {});
const vault = () => process.env.CBN_VAULT || settings.vault || path.join(app.getPath('documents'), 'Critter Notes');
const ID = /^[\w-]{1,40}$/, FILE = /^[\w.-]{1,90}$/;
const IMG_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' };

// campaign id -> its folder, found by reading every campaign.json in the vault
let campDirs = new Map();
async function scanCampaigns() {
  const root = vault(), out = [];
  await fsp.mkdir(root, { recursive: true });
  campDirs = new Map();
  for (const e of await fsp.readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const dir = path.join(root, e.name);
    try {
      const meta = JSON.parse((await fsp.readFile(path.join(dir, 'campaign.json'), 'utf8')).replace(/^\uFEFF/, ''));
      if (!meta || !ID.test(meta.id) || campDirs.has(meta.id)) continue;
      campDirs.set(meta.id, dir); out.push(meta);
    } catch {}
  }
  return out;
}
async function campDir(cid) {
  if (!ID.test(cid)) throw new Error('bad campaign');
  if (!campDirs.has(cid)) await scanCampaigns();
  const d = campDirs.get(cid); if (!d) throw new Error('no such campaign');
  return d;
}
// a folder name from the campaign's name; it stays put when the campaign is renamed later
function folderFor(name) {
  const base = String(name || 'Campaign').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/, '').trim().slice(0, 60) || 'Campaign';
  let n = 1, p = path.join(vault(), base);
  while (fs.existsSync(p)) p = path.join(vault(), `${base} ${++n}`);
  return p;
}
// written whole or not at all, so a crash never leaves half a file
async function writeAtomic(file, text) { const tmp = file + '.' + process.pid + '.tmp'; await fsp.writeFile(tmp, text); await fsp.rename(tmp, file); }

/* ---------- the page and the pictures ---------- */
function serve(ses) {
  ses.protocol.handle('app', async req => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    const m = /^\/img\/([\w-]{1,40})\/([\w.-]{1,90})$/.exec(p);
    if (m) {
      try {
        const file = path.join(await campDir(m[1]), 'images', m[2]);
        const data = await fsp.readFile(file);
        return new Response(data, { headers: { 'Content-Type': IMG_TYPES[m[2].split('.').pop().toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'max-age=31536000, immutable' } });
      } catch { return new Response('Missing', { status: 404 }); }
    }
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(WWW, p));
    if (!file.startsWith(WWW)) return new Response('Not found', { status: 404 });
    // never cached, so a rebuilt page shows on the next reload
    return net.fetch(pathToFileURL(file).toString()).then(r => new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'text/plain', 'Cache-Control': 'no-store' } }));
  });
}

/* ---------- the window: frameless, with Critter's kind of title bar drawn by the page ---------- */
function createWindow() {
  serve(session.defaultSession);
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1380, height: b.height || 880, x: b.x, y: b.y, minWidth: 560, minHeight: 360, backgroundColor: '#0d0f0e', title: 'Critter Notes', icon: ICON, frame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true }
  });
  if (settings.maximized) win.maximize();
  win.loadURL('app://notes/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  // the page writes its last changes before the window goes
  let closing = false;
  win.on('close', e => {
    settings.maximized = win.isMaximized(); if (!settings.maximized) settings.bounds = win.getBounds(); saveSettings();
    if (!closing) { e.preventDefault(); win.webContents.send('close-asked'); setTimeout(() => { closing = true; if (win && !win.isDestroyed()) win.close(); }, 3000); }
  });
  ipcMain.removeAllListeners('quit-ok');
  ipcMain.on('quit-ok', () => { closing = true; if (win && !win.isDestroyed()) win.close(); });
  win.on('closed', () => { win = null; });
  const state = () => { if (win && !win.isDestroyed()) win.webContents.send('win:state', { max: win.isMaximized(), focus: win.isFocused(), full: win.isFullScreen() }); };
  for (const ev of ['maximize', 'unmaximize', 'focus', 'blur', 'enter-full-screen', 'leave-full-screen']) win.on(ev, state);
  win.webContents.on('did-finish-load', state);
  // spelling suggestions on right-click in the editor
  win.webContents.on('context-menu', (e, p) => {
    if (!p.isEditable || !p.misspelledWord) return;
    const items = p.dictionarySuggestions.slice(0, 6).map(s => ({ label: s, click: () => win.webContents.replaceMisspelling(s) }));
    items.push({ type: 'separator' }, { label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  const wc = win.webContents;
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const k = i.key.toLowerCase(), c = i.control || i.meta, run = fn => { e.preventDefault(); fn(); };
    if (c && !i.shift && k === 'r') run(() => wc.reload());
    else if (k === 'f11') run(() => win.setFullScreen(!win.isFullScreen()));
    else if (c && i.shift && k === 'i') run(() => wc.toggleDevTools());
    else if (c && k === '0') run(() => wc.setZoomLevel(0));
    else if (c && (k === '=' || k === '+')) run(() => wc.setZoomLevel(wc.getZoomLevel() + 0.5));
    else if (c && k === '-') run(() => wc.setZoomLevel(wc.getZoomLevel() - 0.5));
  });
}
function appMenu() {
  const wc = win && win.webContents, send = k => () => wc && wc.send('key', k);
  return Menu.buildFromTemplate([
    { label: 'New campaign…', click: send('new-campaign') },
    { label: 'Settings…', click: send('campaign-settings') },
    { label: 'Open the campaign folder', click: send('open-folder') },
    { label: 'Where campaigns are kept…', click: send('vault') },
    { type: 'separator' },
    { label: 'Import Markdown files…', click: send('import-md') },
    { label: 'Import a folder…', click: send('import-folder') },
    { label: 'Export as Markdown…', click: send('export-md') },
    { label: 'Back up this campaign…', click: send('backup') },
    { label: 'Restore a backup…', click: send('restore') },
    { type: 'separator' },
    { label: 'Appearance…', click: send('appearance') },
    { label: 'Homebase…', click: () => wc && wc.executeJavaScript('window.CRITBOARD_DESKTOP && window.CRITBOARD_DESKTOP.changeHomebase()') },
    { label: 'Keyboard shortcuts', click: send('shortcuts') },
    { label: 'About Critter Notes', click: send('about') },
    ...updates.menuItems(),
    { type: 'separator' },
    { label: 'View', submenu: [
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => wc && wc.reload() },
      { label: 'Full screen', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { label: 'Zoom in', accelerator: 'CmdOrCtrl+=', click: () => wc && wc.setZoomLevel(wc.getZoomLevel() + 0.5) },
      { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => wc && wc.setZoomLevel(wc.getZoomLevel() - 0.5) },
      { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => wc && wc.setZoomLevel(0) },
      { type: 'separator' },
      { label: 'Developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => wc && wc.toggleDevTools() }
    ] },
    { type: 'separator' },
    { label: 'Quit', click: () => win && win.close() }
  ]);
}
ipcMain.on('win:cmd', (e, cmd, arg) => {
  if (!win || BrowserWindow.fromWebContents(e.sender) !== win) return;
  if (cmd === 'min') win.minimize();
  else if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (cmd === 'close') win.close();
  else if (cmd === 'menu') appMenu().popup({ window: win, x: Math.round((arg && arg.x) || 8), y: Math.round((arg && arg.y) || 34) });
});

/* ---------- campaigns and documents ---------- */
ipcMain.handle('vault:get', () => ({ root: vault() }));
ipcMain.handle('vault:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Where should Critter Notes keep your campaigns?', defaultPath: vault(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.vault = r.filePaths[0]; await saveSettings(); campDirs = new Map();
  return { root: vault() };
});
ipcMain.handle('vault:open', async (e, cid) => { const p = cid ? await campDir(cid) : vault(); await fsp.mkdir(p, { recursive: true }); shell.openPath(p); return true; });
ipcMain.handle('camp:list', () => scanCampaigns());
ipcMain.handle('camp:save', async (e, meta) => {
  if (!meta || !ID.test(meta.id)) throw new Error('bad campaign');
  let dir = campDirs.get(meta.id);
  if (!dir) { await scanCampaigns(); dir = campDirs.get(meta.id); }
  if (!dir) { dir = folderFor(meta.name); await fsp.mkdir(path.join(dir, 'docs'), { recursive: true }); await fsp.mkdir(path.join(dir, 'images'), { recursive: true }); campDirs.set(meta.id, dir); }
  await writeAtomic(path.join(dir, 'campaign.json'), JSON.stringify(meta, null, 2));
  return true;
});
ipcMain.handle('camp:trash', async (e, cid) => { const d = await campDir(cid); await shell.trashItem(d); campDirs.delete(cid); return true; });
ipcMain.handle('doc:list', async (e, cid) => {
  const dir = path.join(await campDir(cid), 'docs'), out = [];
  await fsp.mkdir(dir, { recursive: true });
  for (const f of await fsp.readdir(dir)) {
    if (!/^[\w-]{1,40}\.json$/.test(f)) continue;
    try { const d = JSON.parse((await fsp.readFile(path.join(dir, f), 'utf8')).replace(/^\uFEFF/, '')); if (d && d.id === f.slice(0, -5)) out.push(d); }
    catch { await fsp.rename(path.join(dir, f), path.join(dir, f + `.unreadable-${Date.now()}`)).catch(() => {}); }
  }
  return out;
});
ipcMain.handle('doc:save', async (e, cid, doc) => {
  if (!doc || !ID.test(doc.id)) throw new Error('bad document');
  const dir = path.join(await campDir(cid), 'docs'); await fsp.mkdir(dir, { recursive: true });
  await writeAtomic(path.join(dir, doc.id + '.json'), JSON.stringify(doc, null, 1));
  return true;
});
// deleted documents go to the recycle bin, so nothing is lost for good by a slip
ipcMain.handle('doc:trash', async (e, cid, id) => {
  if (!ID.test(id)) throw new Error('bad document');
  const f = path.join(await campDir(cid), 'docs', id + '.json');
  if (fs.existsSync(f)) await shell.trashItem(f).catch(() => fsp.rm(f));
  return true;
});
// pictures are named by their content, so the same picture twice is kept once
ipcMain.handle('img:put', async (e, cid, name, bytes) => {
  const buf = Buffer.from(bytes);
  if (buf.length > 40e6) throw new Error('That picture is too large (40 MB at most).');
  let ext = String(name || '').split('.').pop().toLowerCase(); if (!IMG_TYPES[ext]) ext = 'png'; if (ext === 'jpeg') ext = 'jpg';
  const file = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20) + '.' + ext;
  const dir = path.join(await campDir(cid), 'images'); await fsp.mkdir(dir, { recursive: true });
  const p = path.join(dir, file); if (!fs.existsSync(p)) await fsp.writeFile(p, buf);
  return file;
});
ipcMain.handle('img:copy', async (e, from, to, file) => {
  if (!FILE.test(file)) throw new Error('bad file');
  const src = path.join(await campDir(from), 'images', file), dir = path.join(await campDir(to), 'images');
  await fsp.mkdir(dir, { recursive: true }); if (!fs.existsSync(path.join(dir, file))) await fsp.copyFile(src, path.join(dir, file));
  return true;
});
// Markdown for Obsidian and the like: <chosen folder>/<campaign>/..., with the pictures alongside
ipcMain.handle('export:md', async (e, cid, name, files) => {
  const r = await dialog.showOpenDialog(win, { title: 'Export the campaign as Markdown into…', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const safe = s => String(s).replace(/[<>:"\\|?*\x00-\x1f]/g, '').replace(/\.\.+/g, '.');
  const out = path.join(r.filePaths[0], safe(name).slice(0, 60) || 'Campaign');
  const src = await campDir(cid);
  for (const f of files) {
    const p = path.normalize(path.join(out, safe(f.path)));
    if (!p.startsWith(out)) continue;
    await fsp.mkdir(path.dirname(p), { recursive: true });
    if (f.img) { if (FILE.test(f.img)) await fsp.copyFile(path.join(src, 'images', f.img), p).catch(() => {}); }
    else await fsp.writeFile(p, f.text);
  }
  shell.openPath(out);
  return out;
});
ipcMain.handle('file:save', async (e, name, text) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'Critter Notes backup', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, text); return r.filePath;
});
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a Critter Notes backup', properties: ['openFile'], filters: [{ name: 'Critter Notes backup', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const st = await fsp.stat(r.filePaths[0]); if (st.size > 300e6) throw new Error('too large');
  return fsp.readFile(r.filePaths[0], 'utf8');
});
ipcMain.handle('open-external', (e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return true; });

app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); updates.onStart(); });
app.on('window-all-closed', () => app.quit());
