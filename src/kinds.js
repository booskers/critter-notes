/* Critter Notes: the kinds of documents, their fields and starting text, and the line icons. */
const ICON_PATHS = {
  note: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h4',
  session: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 10h16 M8 3v4 M16 3v4 M8 14h3 M8 17h6',
  quest: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12.01v-.02',
  character: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 21a7.5 7.5 0 0 1 15 0',
  location: 'M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  faction: 'M5 21V4 M5 4h12l-2.5 4.5L17 13H5',
  item: 'M6.5 3h11l4 6-10.5 12L.5 9z M.5 9h21 M11 21 7.5 9l3.5-6 3.5 6z',
  lore: 'M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5z M5 20.5A2.5 2.5 0 0 0 7.5 23H19v-5 M9 7h6',
  map: 'M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z M9 4v13.5 M15 6.5V20',
  home: 'M3 11.5 12 4l9 7.5 M5.5 9.5V20h13V9.5 M10 20v-5h4v5',
  graph: 'M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M11 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M8.4 5.9l7.2 1.2 M7 7.8l3 8.4 M16.7 9.7l-4.4 6.8',
  search: 'M11 18.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z M21 21l-4.6-4.6',
  plus: 'M12 5v14 M5 12h14', minus: 'M5 12h14',
  link: 'M10 13.5a4.5 4.5 0 0 0 6.8.5l2.9-2.9a4.6 4.6 0 0 0-6.5-6.5l-1.6 1.6 M14 10.5a4.5 4.5 0 0 0-6.8-.5l-2.9 2.9a4.6 4.6 0 0 0 6.5 6.5l1.6-1.6',
  send: 'M21.5 2.5 10.5 13.5 M21.5 2.5l-7 19-4-8-8-4z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'eye-off': 'M3 3l18 18 M10.6 5.1Q11.3 5 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2 M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16z M13.5 6.5l4 4',
  read: 'M2 5h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z M22 5h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z',
  split: 'M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M12 4v16',
  mind: 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M4 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M20 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M4 20.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M20 20.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M10.2 10.2 5.2 6 M13.8 10.2l5-4.2 M10.2 13.8l-5 4.2 M13.8 13.8l5 4.2',
  branch: 'M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9',
  speech: 'M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.4A8.4 8.4 0 1 1 21 11.5z M8 10h8 M8 13.5h5',
  key: 'M7.5 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z M12 12h9 M18 12v3 M21 12v2',
  swords: 'M14.5 17.5 3 6V3h3l11.5 11.5 M13 19l6-6 M16 16l4 4 M19 21l2-2 M14.5 6.5 18 3h3v3l-3.5 3.5 M5 14l4 4 M7 17l-3 3 M3 19l2 2',
  gem: 'M6.5 3h11l4 6-10.5 12L.5 9z M.5 9h21',
  clapper: 'M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M4 11 3.2 7.6l15.5-3.8.8 3.4z M8.6 6.5l2.3 3 M13.4 5.3l2.3 3',
  spark: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M5.6 5.6l2.8 2.8 M15.6 15.6l2.8 2.8 M5.6 18.4l2.8-2.8 M15.6 8.4l2.8-2.8',
  alert: 'M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9.5v4 M12 17h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7 M12 17h.01',
  quote: 'M6 7h4v6c0 2.2-1.3 4-4 4.5 M14 7h4v6c0 2.2-1.3 4-4 4.5',
  dice: 'M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3z M12 7.5l4.5 8h-9z M12 2.5v5 M3.5 7.3l4 8.2 M20.5 7.3l-4 8.2 M7.5 15.5 12 21.5l4.5-6',
  music: 'M9 18V5l11-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  image: 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M4 16l4.5-4.5 4 4 3-3L20 17 M15 9.01V9',
  pin: 'M9 3h6l-1 6 4 4H6l4-4z M12 13v8',
  x: 'M6 6l12 12 M18 6 6 18', check: 'M5 12.5l4.5 4.5L19 7',
  back: 'M15 5l-7 7 7 7', fwd: 'M9 5l7 7-7 7', down: 'M6 9l6 6 6-6', right: 'M9 6l6 6-6 6',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  play: 'M7 4.5v15l12.5-7.5z', stop: 'M6.5 6.5h11v11h-11z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  github: 'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4 M9 18c-4.51 2-5-2-7-2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  list: 'M9 6h12 M9 12h12 M9 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  tasks: 'M3 6.5l2 2 3.5-3.5 M3 16.5l2 2 3.5-3.5 M12 7h9 M12 17h9',
  heading: 'M6 4v16 M17 4v16 M6 12h11',
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7z M7 12h7a3.5 3.5 0 0 1 0 7H7z', italic: 'M10 4h8 M6 20h8 M14 4 10 20',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21a7 7 0 0 1 14 0 M16 3.6a4 4 0 0 1 0 7.3 M18 14.2a6 6 0 0 1 4 6.8',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  open: 'M7 17 17 7 M8 7h9v9',
  upload: 'M12 15V3 M7 8l5-5 5 5 M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  table: 'M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3z M12 7.5l4.5 8h-9z',
  hash: 'M5 9h15 M4 15h15 M10 3 8 21 M16 3l-2 18',
  undo: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  move: 'M5 9l-3 3 3 3 M9 5l3-3 3 3 M15 19l-3 3-3-3 M19 9l3 3-3 3 M2 12h20 M12 2v20',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  menu: 'M4 6h16 M4 12h16 M4 18h16', panel: 'M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M15 4v16',
  sidebar: 'M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M9 4v16',
  log: 'M8 6h13 M8 12h13 M8 18h9 M3 6h.01 M3 12h.01 M3 18h.01',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  flag: 'M5 21V4 M5 4h12l-2.5 4.5L17 13H5',
  board: 'M3 4h7v7H3z M14 4h7v5h-7z M14 13h7v7h-7z M3 15h7v5H3z M10 7.5h4 M17.5 9v4',
  timeline: 'M12 3v18 M12 6.5h6 M6 11.5h6 M12 16.5h5 M12 6.5h.01 M12 11.5h.01 M12 16.5h.01',
  event: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2 M3 3l3 3',
  rels: 'M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M9.5 6.5l5 0 M8.6 7.6l6.8 9.6',
  pie: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 3v9h9',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  focus: 'M8 3H5a2 2 0 0 0-2 2v3 M16 3h3a2 2 0 0 1 2 2v3 M8 21H5a2 2 0 0 1-2-2v-3 M16 21h3a2 2 0 0 0 2-2v-3',
  zin: 'M11 18.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z M21 21l-4.6-4.6 M11 8v6 M8 11h6',
  zout: 'M11 18.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z M21 21l-4.6-4.6 M8 11h6',
  lock: 'M6 11h12v10H6z M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  unlock: 'M6 11h12v10H6z M8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2',
  hl: 'M9 11l-4 4v3h3l4-4 M15 5l4 4-7 7-4-4z M4 21h16',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  table2: 'M3 5h18v14H3z M3 10h18 M9 5v14'
};
const icon = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[name] || ICON_PATHS.note}"/></svg>`;

const TYPES = {
  note: { name: 'Note', plural: 'Notes', icon: 'note', color: '#a3acb9', hint: 'Anything at all' },
  session: { name: 'Session', plural: 'Sessions', icon: 'session', color: '#f5a524', hint: 'A plan for one evening at the table' },
  quest: { name: 'Quest', plural: 'Quests', icon: 'quest', color: '#e879f9', hint: 'A thread the party can follow' },
  character: { name: 'Character', plural: 'Characters', icon: 'character', color: '#60a5fa', hint: 'An NPC, villain or player character' },
  location: { name: 'Location', plural: 'Locations', icon: 'location', color: '#34d399', hint: 'A place, from a tavern to a continent' },
  faction: { name: 'Faction', plural: 'Factions', icon: 'faction', color: '#f87171', hint: 'A guild, cult, court or company' },
  item: { name: 'Item', plural: 'Items', icon: 'item', color: '#fbbf24', hint: 'Treasure, relics, gear' },
  lore: { name: 'Lore', plural: 'Lore', icon: 'lore', color: '#a78bfa', hint: 'History, religion, rules of the world' },
  map: { name: 'Map', plural: 'Maps', icon: 'map', color: '#2dd4bf', hint: 'A picture with pins that lead to documents' },
  event: { name: 'Event', plural: 'Events', icon: 'event', color: '#38bdf8', hint: 'Something that happened, or will, in the world' },
  board: { name: 'Board', plural: 'Boards', icon: 'board', color: '#fb923c', hint: 'A free canvas of cards and arrows' }
};
// fields: [key, label, kind, options, showIf]; kinds: text, num, date, sel, link (a document by its title),
// wdate (a date in the world's own calendar: { y, m, d }), clock (a progress clock: { size, filled })
const FIELDS = {
  session: [['num', 'Session', 'num'], ['date', 'Date', 'date'], ['when', 'In the world', 'wdate'], ['status', 'Status', 'sel', ['Planned', 'Ready', 'Played']], ['arc', 'Part of', 'link']],
  quest: [['status', 'Status', 'sel', ['Rumour', 'Active', 'Done', 'Failed', 'Abandoned']], ['giver', 'Given by', 'link'], ['where', 'Where', 'link'], ['reward', 'Reward', 'text'], ['clock', 'Danger clock', 'clock']],
  character: [['role', 'Role', 'sel', ['NPC', 'Player character', 'Villain', 'Ally', 'Patron', 'Rival']], ['player', 'Played by', 'text', null, d => (d.fields || {}).role === 'Player character'], ['kin', 'Ancestry', 'text'], ['home', 'Found at', 'link'], ['faction', 'Faction', 'link'], ['status', 'Status', 'sel', ['Alive', 'Dead', 'Missing', 'Unknown']], ['voice', 'Voice & manner', 'text'], ['want', 'Wants', 'text'], ['secret', 'Secret', 'text']],
  location: [['kind', 'Kind', 'text'], ['region', 'Part of', 'link'], ['ruler', 'Ruled by', 'link'], ['mood', 'Feel', 'text']],
  faction: [['leader', 'Led by', 'link'], ['base', 'Based at', 'link'], ['goal', 'Goal', 'text'], ['stance', 'Towards the party', 'sel', ['Allied', 'Friendly', 'Neutral', 'Wary', 'Hostile']], ['clock', 'Plan clock', 'clock']],
  item: [['kind', 'Kind', 'text'], ['rarity', 'Rarity', 'sel', ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary', 'Artifact']], ['value', 'Value', 'text'], ['holder', 'Held by', 'link'], ['where', 'Found at', 'link']],
  lore: [['cat', 'Kind', 'text'], ['era', 'When', 'text']],
  map: [],
  event: [['when', 'When', 'wdate'], ['where', 'Where', 'link'], ['who', 'Who', 'text'], ['era', 'Era', 'text']],
  board: [],
  note: []
};
const TEMPLATES = {
  session: `## Recap
- What happened last time, in a few lines

## Strong start
> [!read] Opening
> Begin in the middle of something.

## Scenes
### Scene 1
- What the party finds here

> [!branch] If the party takes another way
> - What happens instead

## Secrets & clues
- [ ] A secret the party might learn, however they get there
- [ ] Another one

## Places
-

## People
-

## Monsters & encounters
> [!combat] Encounter
> - Who fights, and why

## Treasure
-

## Session log
`,
  quest: `## Hook
How the party hears of it.

## Steps
- [ ] First lead

## Outcomes
> [!branch] If they succeed
> -

> [!branch] If they fail
> -
`,
  character: `## Look
-

## Personality
-

## Story
What they did before the party met them.

## Relationships
-

> [!secret] What the players don't know
>
`,
  location: `> [!read] First look
> What the party sees, hears and smells.

## Who's here
-

## What's here
-

## Hooks
-

> [!secret] Hidden
>
`,
  faction: `## Goals
-

## Resources
-

## Members
-

## Relationships
-
`,
  item: `## Description
What it looks like.

## History
-

## Properties
-
`,
  event: 'What happened, and what it changed.\n', lore: '', map: '', note: '', board: ''
};
// what a document sent to the table becomes in Critter VTT's Library
const TABLE_KIND = { character: 'npc', item: 'item' };
