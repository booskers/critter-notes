// Packs the app into its setup file: Critter Setup (Setup.cs, compiled with the C# compiler every Windows has) followed by
// the app's files, then the two files the in-app updater reads from a GitHub release (<setup>.blockmap and latest.yml).
// The same file ships with Critter VTT, Critter Sounds and Critter Notes; each app's details come from its package.json
// (build.appId, build.productName, build.publish, and "critterSetup": { name, accent, description, dataDirs, artifactName }).
//   run in the app's folder after `electron-builder --win dir`:   node installer/pack.mjs
//   SETUP_TEST=1   a test identity (" Test" names, its own Apps entry and folder), so a test never touches a real install
//   SETUP_VERSION=<x.y.z>   another version number (for testing updates)
//   SETUP_DIST=<folder>   where electron-builder put win-unpacked (default: build.directories.output)
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const require = createRequire(path.join(ROOT, 'package.json'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (process.env.SETUP_VERSION) pkg.version = process.env.SETUP_VERSION;   // with electron-builder --config.extraMetadata.version=<same>
const b = pkg.build || {}, cfg = pkg.critterSetup || {}, pub = (b.publish || [])[0] || {};
const TEST = !!process.env.SETUP_TEST;
const productName = b.productName || pkg.productName || pkg.name;
const out = path.resolve(ROOT, process.env.SETUP_DIST || (b.directories && b.directories.output) || 'dist');
const unpacked = path.join(out, 'win-unpacked');
const exe = productName + '.exe';
if (!fs.existsSync(path.join(unpacked, exe))) throw new Error(`${path.relative(ROOT, unpacked)}\\${exe} is missing: run electron-builder --win dir first`);

const { UUID } = require('builder-util-runtime');
const sfx = TEST ? ' Test' : '';
const id = b.appId + (TEST ? '.test' : '');
const app = {
  id,
  name: (cfg.name || productName) + sfx,
  exe,
  folder: (cfg.folder || productName) + sfx,
  shortcut: (cfg.name || productName) + sfx,
  version: pkg.version,
  publisher: cfg.publisher || 'booskers / Polychrome',
  url: pub.owner ? `https://github.com/${pub.owner}/${pub.repo}` : '',
  description: cfg.description || pkg.description || '',
  accent: cfg.accent || '#ff5c00',
  // the key electron-builder's NSIS installer used, so an install made by it is found and its Apps entry updated in place
  regKey: UUID.v5(id, UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3')),
  updaterCache: `${pkg.name}${TEST ? '-test' : ''}-updater`,
  dataDirs: TEST ? [] : (cfg.dataDirs || [productName])
};
const artifact = (cfg.artifactName || productName.replace(/\s+/g, '-') + '-Setup') + (TEST ? '-Test' : '') + '.exe';
const setupFile = path.join(out, artifact);
console.log(`Critter Setup: ${app.name} ${app.version} -> ${path.relative(ROOT, setupFile)}`);

// 1. where the packaged app's updater looks (electron-updater reads resources/app-update.yml)
if (pub.provider === 'github')
  fs.writeFileSync(path.join(unpacked, 'resources', 'app-update.yml'), `owner: ${pub.owner}\nrepo: ${pub.repo}\nprovider: github\nupdaterCacheDirName: ${app.updaterCache}\n`);
for (const f of ['elevate.exe']) fs.rmSync(path.join(unpacked, 'resources', f), { force: true });   // NSIS-only helper

// 2. the engine, with this app's icon and version details
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'critter-setup-'));
const csc = [path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'), path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')].find(f => fs.existsSync(f));
if (!csc) throw new Error('The C# compiler of .NET Framework 4 (csc.exe) was not found');
const v4 = (pkg.version.split('-')[0].split('.').concat(['0', '0', '0']).slice(0, 3).join('.')) + '.0';
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
fs.writeFileSync(path.join(work, 'AssemblyInfo.cs'), [
  'using System.Reflection;',
  `[assembly: AssemblyTitle("${esc(app.name)} Setup")]`, `[assembly: AssemblyProduct("${esc(app.name)}")]`,
  `[assembly: AssemblyDescription("${esc(app.name)} Setup")]`, `[assembly: AssemblyCompany("${esc(app.publisher)}")]`,
  `[assembly: AssemblyCopyright("MIT licence, ${esc(app.publisher)}")]`,
  `[assembly: AssemblyVersion("${v4}")]`, `[assembly: AssemblyFileVersion("${v4}")]`, `[assembly: AssemblyInformationalVersion("${esc(pkg.version)}")]`, ''
].join('\n'));
const stub = path.join(work, 'setup.exe');
const icon = [path.join(ROOT, 'build', 'icon.ico')].find(f => fs.existsSync(f));
execFileSync(csc, ['/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', `/out:${stub}`, ...(icon ? [`/win32icon:${icon}`] : []),
  `/win32manifest:${path.join(HERE, 'setup.manifest')}`, '/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll', '/r:System.Web.Extensions.dll',
  path.join(HERE, 'Setup.cs'), path.join(work, 'AssemblyInfo.cs')], { stdio: 'inherit' });

// 3. the payload: every file as raw deflate (each on its own, so an update's blockmap finds the unchanged ones), plus artwork
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(unpacked).map(f => path.relative(unpacked, f).split(path.sep).join('/')).sort();
const assets = [];
const logo = [cfg.logo && path.join(ROOT, cfg.logo), path.join(ROOT, 'assets', 'icon.png'), path.join(ROOT, 'build', 'icon.png')].find(f => f && fs.existsSync(f));
if (logo) assets.push(['logo.png', logo]);
for (const [n, f] of [['font.ttf', path.join(HERE, 'font.ttf')], ['font-bold.ttf', path.join(HERE, 'font-bold.ttf')]]) if (fs.existsSync(f)) assets.push([n, f]);

const dataFile = path.join(work, 'data.bin');
const data = fs.openSync(dataFile, 'w');
let off = 0;
const deflate = buf => new Promise((res, rej) => zlib.deflateRaw(buf, { level: 9, memLevel: 9 }, (e, r) => e ? rej(e) : res(r)));
async function packAll(list) {
  const entries = [];
  // compress a few at a time, write in order
  const jobs = list.map(([name, file]) => ({ name, file }));
  let next = 0;
  const results = new Array(jobs.length);
  async function worker() {
    while (next < jobs.length) {
      const i = next++, buf = await fsp.readFile(jobs[i].file);
      results[i] = { raw: buf.length, crc: zlib.crc32(buf) >>> 0, z: await deflate(buf) };
    }
  }
  await Promise.all(Array.from({ length: Math.max(2, Math.min(8, os.cpus().length)) }, worker));
  for (let i = 0; i < jobs.length; i++) {
    const r = results[i];
    fs.writeSync(data, r.z);
    entries.push({ name: jobs[i].name, o: off, c: r.z.length, s: r.raw, crc: r.crc });
    off += r.z.length;
  }
  return entries;
}
const t0 = Date.now();
const assetEntries = (await packAll(assets)).map(e => ({ n: e.name, o: e.o, c: e.c, s: e.s, crc: e.crc }));
const fileEntries = (await packAll(files.map(f => [f, path.join(unpacked, f)]))).map(e => ({ p: e.name, o: e.o, c: e.c, s: e.s, crc: e.crc }));
fs.closeSync(data);
const manifest = Buffer.from(JSON.stringify({ format: 1, app, assets: assetEntries, files: fileEntries }), 'utf8');

// 4. the setup file: engine, manifest, data, trailer
const outFd = fs.openSync(setupFile + '.tmp', 'w');
const stubBytes = fs.readFileSync(stub);
fs.writeSync(outFd, stubBytes);
const len4 = Buffer.alloc(4); len4.writeInt32LE(manifest.length);
fs.writeSync(outFd, len4); fs.writeSync(outFd, manifest);
{
  const rd = fs.openSync(dataFile, 'r'), buf = Buffer.alloc(1 << 22); let n;
  while ((n = fs.readSync(rd, buf, 0, buf.length, null)) > 0) fs.writeSync(outFd, buf, 0, n);
  fs.closeSync(rd);
}
const trailer = Buffer.alloc(24);
trailer.write('CRITPAK1', 0, 'latin1');
trailer.writeBigInt64LE(BigInt(stubBytes.length), 8);
trailer.writeBigInt64LE(BigInt(4 + manifest.length + off), 16);
fs.writeSync(outFd, trailer);
fs.closeSync(outFd);
fs.renameSync(setupFile + '.tmp', setupFile);
fs.rmSync(work, { recursive: true, force: true });

// 5. what electron-updater reads: latest.yml (version, size, sha512) and the blockmap for downloading only what changed
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap.js');
const info = await buildBlockMap(setupFile, 'gzip', setupFile + '.blockmap');
if (!TEST || process.env.SETUP_TEST_YML) {
  const yml = `version: ${pkg.version}\nfiles:\n  - url: ${artifact}\n    sha512: ${info.sha512}\n    size: ${info.size}\npath: ${artifact}\nsha512: ${info.sha512}\nreleaseDate: '${new Date().toISOString()}'\n`;
  fs.writeFileSync(path.join(out, 'latest.yml'), yml);
}
const raw = fileEntries.reduce((n, e) => n + e.s, 0);
console.log(`  ${fileEntries.length} files, ${(raw / 1048576).toFixed(0)} MB -> ${(info.size / 1048576).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
