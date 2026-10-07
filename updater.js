// In-app updates from the app's GitHub releases. The same file ships in Critter VTT, Critter Sounds and Critter Notes.
// electron-updater reads latest.yml from the newest release, downloads only what changed (blockmap) and checks the sha512.
// The pop-up (update.html) shows the version, its most important changes, Update now / Later / Skip this version,
// a link to the changelog, and the download's progress. Installing hands over to the installer, which shows only its
// progress bar for an update (--updated) and starts the app again.
// Settings live in <userData>/updates.json: { auto: check when the app starts, skip: a version not to offer again }.
//   UPDATE_TEST_FEED=<url>        look for updates at a plain web folder instead (for testing)
//   UPDATE_TEST_VERSION=<x.y.z>   pretend to be this version (for testing)
const { app, BrowserWindow, ipcMain, shell, net } = require('electron');
const path = require('node:path'), fs = require('node:fs');

module.exports = function setupUpdates({ owner, repo, name, parent, page, beforeInstall, changelog = 'CHANGELOG.md' }) {
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const changelogUrl = `${repoUrl}/blob/main/${changelog}`;
  const FILE = () => path.join(app.getPath('userData'), 'updates.json');
  let prefs = null;
  const getPrefs = () => { if (!prefs) { try { prefs = JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { prefs = {}; } } return { auto: prefs.auto !== false, skip: prefs.skip || '' }; };
  const setPrefs = patch => { prefs = { ...getPrefs(), ...patch }; try { fs.writeFileSync(FILE(), JSON.stringify(prefs, null, 1)); } catch {} return getPrefs(); };

  let au = null, why = '';
  try { au = require('electron-updater').autoUpdater; } catch (e) { why = 'The updater is missing from this build.'; }
  if (au) {
    au.autoDownload = false; au.autoInstallOnAppQuit = false; au.allowPrerelease = false;
    au.logger = null;
    // a packaged app carries app-update.yml (made by electron-builder from "publish"); running from source, or testing, writes its own
    if (process.env.UPDATE_TEST_FEED || !app.isPackaged) {
      au.forceDevUpdateConfig = true;
      const yml = path.join(app.getPath('userData'), 'dev-app-update.yml'), cache = `updaterCacheDirName: ${repo}-updater\n`;
      try { fs.mkdirSync(path.dirname(yml), { recursive: true }); fs.writeFileSync(yml, process.env.UPDATE_TEST_FEED ? `provider: generic\nurl: ${process.env.UPDATE_TEST_FEED}\n${cache}` : `provider: github\nowner: ${owner}\nrepo: ${repo}\n${cache}`); au.updateConfigPath = yml; } catch {}
    }
    if (process.env.UPDATE_TEST_VERSION) { try { const { SemVer } = require('semver'); au.currentVersion = new SemVer(process.env.UPDATE_TEST_VERSION); } catch {} }
  }
  const current = () => (au && au.currentVersion && au.currentVersion.version) || app.getVersion();

  // the pop-up, and what it shows
  let dlg = null, state = { step: 'idle' }, info = null, busy = false;
  const send = patch => { state = { ...state, ...patch }; if (dlg && !dlg.isDestroyed()) dlg.webContents.send('upd:state', state); };
  async function look() {
    const wc = page && page();
    if (!wc || wc.isDestroyed()) return { accent: '#ff5c00', scheme: 'dark' };
    try {
      return await wc.executeJavaScript(`(() => { const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
        return { accent: v('--accent') || '#ff5c00', scheme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', lang: (document.documentElement.lang || 'en').slice(0, 2) }; })()`);
    } catch { return { accent: '#ff5c00', scheme: 'dark' }; }
  }
  async function open() {
    if (dlg && !dlg.isDestroyed()) { dlg.show(); dlg.focus(); return; }
    const p = parent && parent(), L = await look();
    dlg = new BrowserWindow({
      width: 460, height: 300, useContentSize: true, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      frame: false, show: false, parent: p || undefined, modal: !!p, backgroundColor: L.scheme === 'light' ? '#f4f3f1' : '#16171b',
      title: `${name} updates`, skipTaskbar: !!p,
      webPreferences: { preload: path.join(__dirname, 'update-preload.js'), contextIsolation: true, sandbox: true }
    });
    dlg.setMenu(null);
    dlg.on('closed', () => { dlg = null; });
    dlg.webContents.on('will-navigate', e => e.preventDefault());
    dlg.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const q = new URLSearchParams({ name, accent: L.accent, scheme: L.scheme, lang: L.lang || 'en', version: current() });
    await dlg.loadFile(path.join(__dirname, 'update.html'), { search: q.toString() });
    dlg.webContents.send('upd:state', state);
  }
  // the changes worth showing: the release notes' list items (or the changelog's section for that version), at most five
  const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  function highlights(notes) {
    if (Array.isArray(notes)) notes = notes.map(n => n && n.note).join('\n');
    notes = String(notes || '');
    let items = [...notes.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map(m => strip(m[1]));
    if (!items.length) items = notes.split(/\r?\n/).filter(l => /^\s*[-*]\s+/.test(l)).map(l => strip(l.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '')));
    return items.filter(Boolean).filter(t => !/^windows installer/i.test(t)).slice(0, 5);
  }
  async function fromChangelog(version) {
    try {
      const r = await net.fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/${changelog}`);
      if (!r.ok) return [];
      const md = await r.text(), at = md.indexOf(`## ${version}`);
      if (at < 0) return [];
      const next = md.indexOf('\n## ', at + 4);
      return highlights(md.slice(at, next < 0 ? undefined : next));
    } catch { return []; }
  }

  async function check(manual) {
    if (!au) { if (manual) { await open(); send({ step: 'error', message: why }); } return; }
    if (busy) { if (manual) await open(); return; }
    busy = true;
    if (manual) { await open(); send({ step: 'checking' }); }
    try {
      const r = await au.checkForUpdates();
      info = r && r.updateInfo;
      const newer = r && r.isUpdateAvailable !== undefined ? r.isUpdateAvailable : info && info.version !== current();
      if (!info || !newer) { if (manual) send({ step: 'current', version: current() }); return; }
      if (!manual && getPrefs().skip === info.version) return;
      let notes = highlights(info.releaseNotes);
      if (!notes.length) notes = await fromChangelog(info.version);
      await open();
      send({ step: 'available', version: info.version, from: current(), notes, date: info.releaseDate || '' });
    } catch (e) {
      if (manual) send({ step: 'error', message: friendly(e) });
    } finally { busy = false; }
  }
  const friendly = e => {
    const m = String((e && e.message) || e || '');
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR_INTERNET|ERR_NAME_NOT_RESOLVED|offline/i.test(m)) return 'Couldn\'t reach GitHub. Check the internet connection and try again.';
    if (/latest\.yml/i.test(m)) return 'No update information was found on GitHub yet.';
    if (/\b404\b/.test(m)) return 'The new version\'s installer isn\'t on GitHub yet. Try again a little later.';
    if (/sha512|checksum/i.test(m)) return 'The download didn\'t arrive intact, so it wasn\'t installed. Try again.';
    return m.split('\n')[0].slice(0, 200) || 'Something went wrong.';
  };
  if (au) {
    au.on('download-progress', p => send({ step: 'downloading', percent: p.percent || 0, done: p.transferred || 0, total: p.total || 0, speed: p.bytesPerSecond || 0 }));
    au.on('update-downloaded', () => {
      send({ step: 'installing' });
      // the installer takes over: it closes the app, shows its progress bar and starts the app again
      // (the app's own windows close first, so a page can write its last changes; the app stays alive until the installer starts)
      setTimeout(async () => {
        app.removeAllListeners('window-all-closed');
        try { if (beforeInstall) await Promise.race([beforeInstall(), new Promise(r => setTimeout(r, 6000))]); } catch {}
        au.quitAndInstall(false, true);
      }, 1200);
    });
  }
  ipcMain.on('upd:act', async (e, act) => {
    if (!dlg || e.sender !== dlg.webContents) return;
    if (act === 'update' && info) {
      send({ step: 'downloading', percent: 0, done: 0, total: 0, speed: 0 });
      try { await au.downloadUpdate(); } catch (err) { send({ step: 'error', message: friendly(err) }); }
    } else if (act === 'skip' && info) { setPrefs({ skip: info.version }); dlg.close(); }
    else if (act === 'later' || act === 'close') dlg.close();
    else if (act === 'changelog') shell.openExternal(changelogUrl);
    else if (act === 'releases') shell.openExternal(`${repoUrl}/releases`);
    else if (act === 'retry') { send({ step: 'checking' }); busy = false; check(true); }
  });
  ipcMain.on('upd:size', (e, h) => { if (dlg && e.sender === dlg.webContents) { const [w] = dlg.getContentSize(); dlg.setContentSize(w, Math.max(160, Math.min(640, Math.round(h)))); if (!dlg.isVisible()) dlg.show(); } });
  // what the app's own page may ask
  ipcMain.handle('upd:get', () => ({ ...getPrefs(), version: current(), repo: repoUrl, changelog: changelogUrl, ready: !!au }));
  ipcMain.handle('upd:set', (e, patch) => setPrefs({ auto: !!(patch && patch.auto) }));
  ipcMain.handle('upd:check', () => { check(true); return true; });
  ipcMain.handle('upd:github', () => shell.openExternal(repoUrl));

  return {
    repoUrl, changelogUrl,
    check: () => check(true),
    // a quiet look a few seconds after starting, when the setting is on; it only speaks up when there is something new
    onStart() { if (getPrefs().auto && (app.isPackaged || process.env.UPDATE_TEST_FEED)) setTimeout(() => check(false), 6000); },
    menuItems: () => [
      { label: 'Check for updates…', click: () => check(true) },
      { label: 'Check for updates when starting', type: 'checkbox', checked: getPrefs().auto, click: m => setPrefs({ auto: m.checked }) },
      { label: `${name} on GitHub`, click: () => shell.openExternal(repoUrl) }
    ]
  };
};
