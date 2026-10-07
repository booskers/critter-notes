// Puts Critter Notes' page into ./www: the notebook, Homebase (the same client the Critter app uses) and the SRD
// compendium, so items, monsters and spells can be looked up offline while planning.
// What comes from Critter is kept in ./shared, so this project builds on its own:
//   shared/homebase-client.js    crittervtt-desktop/app/shim/homebase-client.js
//   shared/homebase.config.json  crittervtt-desktop/app/homebase.config.json, the built-in Homebase address
//   shared/srd/*.json            crittervtt/srd, the SRD compendium
// When Critter's sources sit next to this folder (../crittervtt-desktop/app, ../crittervtt/srd), each build refreshes ./shared.
//   HOMEBASE_SERVER=<url>          use another built-in Homebase for this build ("none" for none: testing)
import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'www'), shared = join(here, 'shared');
await mkdir(out, { recursive: true }); await mkdir(join(shared, 'srd'), { recursive: true });
for (const f of await readdir(out)) await rm(join(out, f), { recursive: true, force: true });

const app = join(here, '..', 'crittervtt-desktop', 'app'), srdSrc = join(here, '..', 'crittervtt', 'srd');
let from = 'shared/';
if (existsSync(join(app, 'shim', 'homebase-client.js'))) {
  await copyFile(join(app, 'shim', 'homebase-client.js'), join(shared, 'homebase-client.js'));
  if (existsSync(join(app, 'homebase.config.json'))) await copyFile(join(app, 'homebase.config.json'), join(shared, 'homebase.config.json'));
  if (existsSync(srdSrc)) for (const f of await readdir(srdSrc)) if (f.endsWith('.json')) await copyFile(join(srdSrc, f), join(shared, 'srd', f));
  from = 'Critter\'s sources (refreshed shared/)';
}
if (!existsSync(join(shared, 'homebase-client.js'))) throw new Error('shared/homebase-client.js is missing: build once next to Critter\'s sources, or copy it in');

const cfgFile = join(shared, 'homebase.config.json');
const cfg = existsSync(cfgFile) ? JSON.parse(await readFile(cfgFile, 'utf8')) : {};
if (process.env.HOMEBASE_SERVER !== undefined) cfg.server = process.env.HOMEBASE_SERVER === 'none' ? '' : process.env.HOMEBASE_SERVER;
if (!cfg.server) delete cfg.server;
delete cfg.firebase;
await build({ entryPoints: [join(shared, 'homebase-client.js')], bundle: true, format: 'iife', minify: true, target: 'chrome120', outfile: join(out, 'homebase.js'), logLevel: 'warning' });
// the version shows under the logo; it comes from package.json
const version = JSON.parse(await readFile(join(here, 'package.json'), 'utf8')).version;
await writeFile(join(out, 'config.js'), `window.HOMEBASE_CONFIG = ${JSON.stringify(cfg)};\nwindow.APP_VERSION = ${JSON.stringify(version)};\n`);

for (const f of await readdir(join(here, 'src'))) await copyFile(join(here, 'src', f), join(out, f));
await mkdir(join(out, 'srd'), { recursive: true });
let n = 0; for (const f of await readdir(join(shared, 'srd'))) if (f.endsWith('.json')) { await copyFile(join(shared, 'srd', f), join(out, 'srd', f)); n++; }
// the web version (notes.crittervtt.com): a service worker that keeps every file of this build for offline use (its cache
// is named after a fingerprint of the files, so each new build replaces it), and the web server's security headers
{
  const { createHash } = await import('node:crypto');
  const list = [], hash = createHash('sha1');
  const walk = async (dir, rel = '') => { for (const e of await readdir(join(dir, rel), { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) await walk(dir, r); else if (!/^(sw\.js|_headers)$/.test(r)) { list.push(r); hash.update(r).update(await readFile(join(dir, r))); } } };
  await walk(out);
  const sw = await readFile(join(here, 'src', 'sw.template.js'), 'utf8');
  await writeFile(join(out, 'sw.js'), sw.replaceAll('__VERSION__', version + '-' + hash.digest('hex').slice(0, 10)).replaceAll('__FILES__', JSON.stringify(['./', ...list.filter(f => f !== 'sw.template.js')])));
  await rm(join(out, 'sw.template.js'), { force: true });
  await copyFile(join(here, 'src', '_headers'), join(out, '_headers'));
}
console.log(`www ready: Homebase ${cfg.server ? 'at ' + cfg.server : 'not configured (the app will ask)'}, ${n} SRD files, shared code from ${from}`);
