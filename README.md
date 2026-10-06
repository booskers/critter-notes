# Critter Notes

A notebook for game masters: plan sessions, write the world, draw maps, boards and mind maps, and send it all to a Critter table.
It is the third app beside **Critter** (the table) and **Critter Sounds** (the music), and talks to both through the same Homebase.

This repository is private. © Polychrome, all rights reserved.

## Running and building

```
npm install
npm start          # builds www/ and opens the app
npm run dist       # dist/Critter Notes Setup 1.0.0.exe (unsigned)
npm run icons      # remakes the icons from logo-src/critter-logo.svg (Electron draws them)
```

`build.mjs` puts the page in `www/`: the files in `src/`, the Homebase client and the SRD compendium. Those last two come from
Critter and are kept in `shared/`, so this project builds on its own. When Critter's sources sit next to this folder
(`../critboard-desktop/app`, `../critboard/srd`), each build refreshes `shared/` from them.
`HOMEBASE_SERVER=<url>` builds with another Homebase, `HOMEBASE_SERVER=none` with none (for testing).

The page also runs in a browser (it keeps campaigns in IndexedDB there).
Test settings: `CBN_VAULT=<folder>` keeps campaigns elsewhere, `CBN_USERDATA=<folder>` keeps settings elsewhere.

## The layout

- **Sidebar:** the campaign, Find (Ctrl+K) and New, then the campaign's views (Home, Timeline, Threads, Relationships, Graph), then the documents, grouped by kind or as a tree you arrange. Table and Sounds status sit at the bottom.
- **The page:** a document's title, its folded-away **Details** (fields, picture, relationships), then the writing. The bar above holds only Read/Write, the mind map, Send to table, and More.
- **Side panel** (documents only): the outline and backlinks, the linked table, Critter Sounds.
- **Focus** (Ctrl+. or the corner button) hides everything but the page.
- **Appearance:** dark, light or as Windows is set; reading text size and font; the writing toolbar on or off.

## Where campaigns live

`Documents\Critter Notes\<campaign>\` (the folder can be changed from the menu):
- `campaign.json`: name, game, colour, linked table, calendar, campaign clocks, shared world.
- `docs\<id>.json`: one file per document `{ id, type, title, parent, order, body, fields, tags, img, rels, map, board, … }`. `body` is Markdown.
- `images\<sha1>.<ext>`: pictures, named by their content.

Deleted documents and campaigns go to the Windows recycle bin. **Export as Markdown** writes an Obsidian-ready copy;
**Import Markdown** reads one back (front matter, folders named after kinds, `![[picture]]` embeds). **Back up** writes one JSON file with the pictures inside.

## Writing

| Write | Get |
| --- | --- |
| `[[Title]]`, `[[Title\|words]]`, `[[Title#Heading]]` | a link to a document (renames update every link) |
| `[[table:<id>\|Name]]` | an entry in the linked table's Library |
| `[[srd:dnd5e/npc/Zombie\|Zombies]]` | an SRD entry, with a card and "add to the table" |
| `[[sound:pad/<id>\|Thunder]]` | a button that plays it on Critter Sounds |
| `[[roll:2d6+3]]` | a dice button |
| `> [!branch] If they…` | an alternative path (also `read`, `secret`, `clue`, `combat`, `loot`, `scene`, `question`…) |
| `- [ ] clue` | a box to tick; unfound secrets and clues come along to the next session |
| a table headed `\| d6 \| … \|` | a random table with a Roll button; the result can go to the table's chat |

`[[` and `/` (at the start of a line) open pickers while writing. Ctrl+Shift+E opens the encounter builder.

## Kinds of documents and the views

Session, quest, character, location, faction, item, lore, event, map, board and note, each with its own fields (`src/kinds.js`).
- **Sessions** start from the Lazy DM's steps; **Run** gives a clock, a timestamped log and the table's chat.
- **Timeline:** documents with a date in the world's own calendar (months, days and era are set per campaign), with "today in the world" and buttons to move it on.
- **Threads:** progress clocks (on factions, quests, or the campaign's own), quests by status, and every clue: planned in which session, found in which.
- **Relationships:** ties between documents ("ally of", "owes"…) set in Details, drawn as a web.
- **Encounter builder:** SRD creatures with D&D 5e XP thresholds, Pathfinder 2e XP budgets or Daggerheart battle points.
- **Boards:** free canvases of cards (text or documents) joined by labelled arrows.
- **Shared world:** another campaign whose documents this one links to and reads, read only.

## The table

A campaign is linked with a lobby code, or with Critter's **music code** to also cue Critter Sounds. Nothing in Critter
had to change; Notes writes what Critter already reads (`src/table.js`):
- `lobbies/<code>/notes/<id>`: a note in the GM's notebook, or a handout (`dm: true`), with each player's copy. **Keep it shown** updates the handout and the players' unchanged copies as you write.
- `lobbies/<code>/ents/<id>`: an NPC or item in the Library (`owner: 'gm'`); sending again updates it.
- `lobbies/<code>/scenes/<id>` + `scenebg/<id>_<n>` + the lobby's `scenes` list: a map as a new hidden scene.
- `lobbies/<code>/log/<id>`: a line in the chat (random table results), credited to the GM.
- It reads the Library, the GM's notebook, scenes, players and the chat log.

## Critter Sounds

`critboard-desktop/music/src/notes-bridge.js` (in the Critter Sounds repository) publishes `lobbies/<code>/soundcat/main`
and plays cues from `lobbies/<code>/cues/<id>` `{ op, kind, ref, name, ts, sig }`, where `sig` is SHA-256 of
`<music key>|<id>|<op>|<kind>|<ref>`. Cues without the key are ignored.

## Accessibility

Every view is checked with axe-core in both themes. The sidebar is a keyboard tree (arrows, Enter, Shift+F10), menus and
dialogs keep focus where it belongs, mind map nodes, map pins and board cards are reachable by keyboard, and reduced motion is respected.
