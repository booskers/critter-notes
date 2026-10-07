// In-app updates from the app's GitHub releases. The same file ships in Critter VTT, Critter Sounds and Critter Notes.
// electron-updater reads latest.yml from the newest release, downloads only what changed (blockmap) and checks the sha512.
// The pop-up (update.html) shows the version, its most important changes, Update now / Later / Skip this version,
// a link to the changelog, and the progress. The whole update happens in here: the app unpacks the new version from the
// downloaded Critter Setup file (installer/Setup.cs) beside itself, closes, and the setup file swaps the files in without
// a window and starts the app again, which then says "Update successful" (or why not) from <install>/.critter/result.json.
// An install the old NSIS installer made can't be updated that way: its setup file runs with --updated instead (a small
// progress window, then the app starts again).
// Settings live in <userData>/updates.json: { auto: check when the app starts, skip: a version not to offer again }.
//   UPDATE_TEST_FEED=<url>        look for updates at a plain web folder instead (for testing)
//   UPDATE_TEST_VERSION=<x.y.z>   pretend to be this version (for testing)
const { app, BrowserWindow, ipcMain, shell, net } = require('electron');
const path = require('node:path'), fs = require('node:fs'), zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');

module.exports = function setupUpdates({ owner, repo, name, appId, parent, page, beforeInstall, changelog = 'CHANGELOG.md' }) {
  // the same id as the installer's shortcuts, so a pinned taskbar icon and the running app are one button
  if (appId && process.platform === 'win32') app.setAppUserModelId(appId);
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const changelogUrl = `${repoUrl}/blob/main/${changelog}`;
  const FILE = () => path.join(app.getPath('userData'), 'updates.json');
  let prefs = null;
  const getPrefs = () => { if (!prefs) { try { prefs = JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { prefs = {}; } } return { auto: prefs.auto !== false, skip: prefs.skip || '' }; };
  const setPrefs = patch => { prefs = { ...getPrefs(), ...patch }; try { fs.writeFileSync(FILE(), JSON.stringify(prefs, null, 1)); } catch {} return getPrefs(); };

  let au = null, why = '';
  try { au = require('electron-updater').autoUpdater; } catch (e) { why = 'The updater is missing from this build.'; }
  if (au) {
    au.autoDownload = false; au.autoInstallOnAppQuit = false; au.allowPrerelease = false; au.disableWebInstaller = true;
    au.logger = null;
    // a packaged app carries app-update.yml (made by electron-builder from "publish"); running from source, or testing, writes its own
    if (process.env.UPDATE_TEST_FEED || !app.isPackaged) {
      au.forceDevUpdateConfig = true;
      // a packaged app being tested keeps its own updater folder, so the test downloads where a real update would
      let own = null; try { own = (/^updaterCacheDirName:\s*(\S+)/m.exec(fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8')) || [])[1]; } catch {}
      const yml = path.join(app.getPath('userData'), 'dev-app-update.yml'), cache = `updaterCacheDirName: ${app.isPackaged && own ? own : repo + '-updater'}\n`;
      try { fs.mkdirSync(path.dirname(yml), { recursive: true }); fs.writeFileSync(yml, process.env.UPDATE_TEST_FEED ? `provider: generic\nurl: ${process.env.UPDATE_TEST_FEED}\n${cache}` : `provider: github\nowner: ${owner}\nrepo: ${repo}\n${cache}`); au.updateConfigPath = yml; } catch {}
    }
    if (process.env.UPDATE_TEST_VERSION) { try { const { SemVer } = require(require.resolve('semver', { paths: [path.dirname(require.resolve('electron-updater'))] })); au.currentVersion = new SemVer(process.env.UPDATE_TEST_VERSION); } catch {} }
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
    au.on('update-downloaded', ev => install(ev && ev.downloadedFile).catch(e => send({ step: 'error', message: friendly(e) })));
  }

  // ---- installing, inside the app ----
  const installDir = () => path.dirname(process.execPath);
  const metaDir = () => path.join(installDir(), '.critter');
  // the setup file's table of contents (see installer/Setup.cs): trailer "CRITPAK1" + payload start + length, then the manifest
  function readPack(file) {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size, t = Buffer.alloc(24);
      if (size < 32) return null;
      fs.readSync(fd, t, 0, 24, size - 24);
      if (t.toString('latin1', 0, 8) !== 'CRITPAK1') return null;
      const start = Number(t.readBigInt64LE(8)), h = Buffer.alloc(4);
      fs.readSync(fd, h, 0, 4, start);
      const ml = h.readInt32LE(0), mb = Buffer.alloc(ml);
      fs.readSync(fd, mb, 0, ml, start + 4);
      const m = JSON.parse(mb.toString('utf8'));
      m.dataStart = start + 4 + ml;
      return m;
    } finally { fs.closeSync(fd); }
  }
  function canWrite(dir) { try { const t = path.join(dir, `.write-test-${process.pid}`); fs.writeFileSync(t, ''); fs.rmSync(t); return true; } catch { return false; } }
  // every file of the new version into <install>/.critter/staged-<version>, each checked against its size and CRC-32
  async function unpack(file, m, dest, onProgress) {
    // Electron reads any *.asar as a folder; the new app.asar has to be written as the plain file it is
    const noAsar = process.noAsar;
    process.noAsar = true;
    try { await unpackFiles(file, m, dest, onProgress); } finally { process.noAsar = noAsar; }
  }
  async function unpackFiles(file, m, dest, onProgress) {
    fs.rmSync(dest, { recursive: true, force: true });
    const total = m.files.reduce((n, f) => n + f.c, 0) || 1;
    let done = 0, last = 0;
    for (const f of m.files) {
      const out = path.resolve(dest, f.p);
      if (!out.startsWith(path.resolve(dest) + path.sep)) throw new Error('The update contains a file outside the app\'s folder.');
      await fs.promises.mkdir(path.dirname(out), { recursive: true });
      let crc = 0, size = 0;
      const check = new (require('node:stream').Transform)({ transform(chunk, enc, cb) { crc = zlib.crc32(chunk, crc); size += chunk.length; cb(null, chunk); } });
      const src = fs.createReadStream(file, { start: m.dataStart + f.o, end: m.dataStart + f.o + f.c - 1, highWaterMark: 1 << 20 });
      src.on('data', c => { done += c.length; const now = Date.now(); if (now - last > 120) { last = now; onProgress(done / total); } });
      await pipeline(src, zlib.createInflateRaw(), check, fs.createWriteStream(out));
      if (size !== f.s || (crc >>> 0) !== (f.crc >>> 0)) throw new Error(`${f.p} didn't unpack intact. Try the update again.`);
    }
    onProgress(1);
  }
  async function closeWindows() {
    app.removeAllListeners('window-all-closed');
    try { if (beforeInstall) await Promise.race([beforeInstall(), new Promise(r => setTimeout(r, 6000))]); } catch {}
  }
  async function install(file) {
    const m = file && fs.existsSync(file) ? readPack(file) : null;
    const ours = app.isPackaged && m && m.files && m.files.length && fs.existsSync(path.join(metaDir(), 'install.json')) && canWrite(installDir());
    if (!ours) {
      // an install the NSIS installer made (or one in a folder this user can't write to): its setup file takes over
      send({ step: 'installing', percent: 100, handover: true });
      setTimeout(async () => { await closeWindows(); au.quitAndInstall(false, true); }, 1200);
      return;
    }
    const version = (m.app && m.app.version) || (info && info.version) || '';
    const staged = path.join(metaDir(), 'staged-' + version.replace(/[^\w.-]/g, '_'));
    send({ step: 'installing', percent: 0, version });
    try { await unpack(file, m, staged, p => send({ step: 'installing', percent: p * 100, version })); }
    catch (e) { const na = process.noAsar; process.noAsar = true; try { fs.rmSync(staged, { recursive: true, force: true }); } finally { process.noAsar = na; } throw e; }
    send({ step: 'restarting', version });
    await new Promise(r => setTimeout(r, 900));
    await closeWindows();
    // the setup file waits for this app to close, swaps the new files in (putting the old ones back if anything fails),
    // writes .critter/result.json and starts the app again
    const child = spawn(file, ['--apply', `--dir=${installDir()}`, `--staged=${staged}`, `--pid=${process.pid}`, `--from=${current()}`], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    app.exit(0);
  }
  // after a restart: what the setup file left for us
  function lastResult() {
    if (!app.isPackaged) return null;
    const f = path.join(metaDir(), 'result.json');
    let r = null;
    try { r = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch {}
    try { fs.rmSync(f, { force: true }); } catch {}
    if (!r && process.argv.includes('--updated')) r = { ok: true, version: app.getVersion() };
    return r;
  }
  // After an update nothing of it stays behind: the downloaded setup file (<updater cache>/pending, which the setup file
  // also removes once it has finished) and anything an interrupted install left in .critter. The copy kept as
  // <updater cache>/installer.exe stays: it's the installed version, which lets the next update download only what changed.
  function cacheDir() {
    let name = null;
    for (const f of [path.join(process.resourcesPath || '', 'app-update.yml'), path.join(app.getPath('userData'), 'dev-app-update.yml')]) {
      try { const m = /^updaterCacheDirName:\s*(\S+)/m.exec(fs.readFileSync(f, 'utf8')); if (m) name = m[1]; } catch {}
    }
    return name && !/[\\/]|\.\./.test(name) ? path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), name) : null;
  }
  function tidy(afterUpdate) {
    const noAsar = process.noAsar;
    process.noAsar = true;
    try {
      let dirs = [];
      try { dirs = fs.readdirSync(metaDir(), { withFileTypes: true }).filter(d => d.isDirectory() && /^(stage|old|staged-.+)$/.test(d.name)); } catch {}
      for (const d of dirs) {
        const p = path.join(metaDir(), d.name);
        // the old files set aside always go; an unpacked update on an ordinary start only when clearly forgotten
        // (another copy of the app could be unpacking one right now)
        try { if (afterUpdate || !d.name.startsWith('staged-') || Date.now() - fs.statSync(p).mtimeMs > 6 * 3600e3) fs.rmSync(p, { recursive: true, force: true }); } catch {}
      }
      const cache = cacheDir();
      if (afterUpdate && cache) fs.rmSync(path.join(cache, 'pending'), { recursive: true, force: true });
    } catch {} finally { process.noAsar = noAsar; }
  }
  async function pageReady() {
    const wc = page && page();
    if (wc && !wc.isDestroyed() && wc.isLoading()) await new Promise(r => { wc.once('did-finish-load', r); setTimeout(r, 10000); });
    await new Promise(r => setTimeout(r, 700));
  }
  async function showResult(r) {
    await pageReady();
    await open();
    if (r.ok && (!r.version || r.version === app.getVersion())) send({ step: 'updated', version: app.getVersion(), from: r.from || '' });
    else send({ step: 'error', failedUpdate: true, version: r.version || '', message: `${name} ${r.version || ''} couldn't be installed, so you still have ${app.getVersion()}.${r.error ? ' ' + String(r.error).split('\n')[0].slice(0, 200) : ''}` });
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
    // after an update the app says how it went instead
    onStart() {
      const r = lastResult();
      if (app.isPackaged) {
        tidy(false);
        // the setup file may still be finishing for a moment after starting the app again
        // (a failed update keeps its download, so Try again doesn't fetch it all again)
        if (r && r.ok) setTimeout(() => tidy(true), 8000);
      }
      if (r) { showResult(r).catch(() => {}); return; }
      if (getPrefs().auto && (app.isPackaged || process.env.UPDATE_TEST_FEED)) setTimeout(() => check(false), 6000);
    },
    menuItems: () => [
      { label: 'Check for updates…', click: () => check(true) },
      { label: 'Check for updates when starting', type: 'checkbox', checked: getPrefs().auto, click: m => setPrefs({ auto: m.checked }) },
      { label: `${name} on GitHub`, click: () => shell.openExternal(repoUrl) }
    ]
  };
};
