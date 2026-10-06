/* Critter Notes: the SRD compendium Critter ships (srd/index.json and srd/<sys>-<kind>.json, copied in by build.mjs).
   Entries look like { n: name, c: category, s: summary, d: sheet data, x: text }. Loaded one kind at a time. */
const SRD = (() => {
  let idx = null; const files = new Map();
  const KINDS = { item: 'Items', npc: 'Monsters & NPCs', spell: 'Spells', feat: 'Features', class: 'Classes', origin: 'Origins' };
  const SYSTEMS = { generic: 'Generic', dnd5e: 'D&D 5e', pf2e: 'Pathfinder 2e', daggerheart: 'Daggerheart', coc: 'Call of Cthulhu', pbta: 'Powered by the Apocalypse', blades: 'Blades in the Dark', v5: 'Vampire 5e', shadowrun: 'Shadowrun', savage: 'Savage Worlds', fate: 'Fate' };
  async function index() {
    if (idx) return idx;
    try { idx = await (await fetch('srd/index.json')).json(); } catch { idx = { systems: {} }; }
    return idx;
  }
  async function kind(sys, k) {
    const ix = await index(), f = ix.systems[sys] && ix.systems[sys].kinds[k] && ix.systems[sys].kinds[k].file;
    if (!f) return [];
    if (!files.has(f)) files.set(f, fetch('srd/' + f).then(r => r.json()).then(j => (j.items || []).map(x => ({ ...x, sys, kind: k }))).catch(() => []));
    return files.get(f);
  }
  const kindsOf = async sys => Object.keys(((await index()).systems[sys] || {}).kinds || {});
  async function search(sys, q, limit = 12, only) {
    q = String(q || '').toLowerCase().trim(); if (!q) return [];
    const out = [];
    for (const k of only || await kindsOf(sys)) for (const x of await kind(sys, k)) { const n = x.n.toLowerCase(), at = n.indexOf(q); if (at >= 0) out.push([at === 0 ? 0 : 1, n.length, x]); }
    return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map(x => x[2]);
  }
  // srd:<sys>/<kind>/<name>
  async function get(ref) {
    const [sys, k, ...rest] = String(ref || '').split('/'), name = rest.join('/').toLowerCase();
    return (await kind(sys, k)).find(x => x.n.toLowerCase() === name) || null;
  }
  const refOf = x => `${x.sys}/${x.kind}/${x.n}`;
  const credit = async sys => ((await index()).systems[sys] || {}).credit || '';
  // sheet data for Critter, the way Critter makes its own copy of an SRD entry
  function data(x) {
    const d = JSON.parse(JSON.stringify(x.d || {}));
    d.name = x.n; d.source = 'SRD';
    const tf = x.kind === 'item' ? (x.sys === 'daggerheart' ? 'feature' : 'notes') : { class: 'desc', spell: 'desc', feat: 'text', origin: 'desc' }[x.kind];
    if (tf && x.x && !d[tf]) d[tf] = String(x.x).slice(0, 4000);
    if (x.kind === 'item' && d.qty === undefined) d.qty = 1;
    if (x.kind === 'npc' && d.hp !== undefined && d.hpmax === undefined) d.hpmax = d.hp;
    return d;
  }
  return { KINDS, SYSTEMS, index, kind, kindsOf, search, get, refOf, credit, data };
})();
