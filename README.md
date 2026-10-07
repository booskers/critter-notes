# Critter Notes

A notebook for game masters: plan sessions, write the world, draw maps, boards and mind maps, and send it all to a Critter table.
It is the third app beside **Critter** (the table) and **Critter Sounds** (the music), and talks to both through the same Homebase.

Made with love by booskers / Polychrome. MIT License, see [LICENSE](LICENSE). What changed in each version: [CHANGELOG.md](CHANGELOG.md).

## Running and building

```
npm install
npm start          # builds www/ and opens the app
npm run dist       # dist/Critter-Notes-Setup.exe (Critter Setup, unsigned) + .blockmap + latest.yml
npm run icons      # remakes the icons from logo-src/critter-logo.svg (Electron draws them)
```

`build.mjs` puts the page in `www/`: the files in `src/`, the Homebase client and the SRD compendium. Those last two come from
Critter and are kept in `shared/`, so this project builds on its own. When Critter's sources sit next to this folder
(`../critboard-desktop/app`, `../critboard/srd`), each build refreshes `shared/` from them.
`HOMEBASE_SERVER=<url>` builds with another Homebase, `HOMEBASE_SERVER=none` with none (for testing).

The page also runs in a browser (it keeps campaigns in IndexedDB there).
Test settings: `CBN_VAULT=<folder>` keeps campaigns elsewhere, `CBN_USERDATA=<folder>` keeps settings elsewhere.

## The layout

- **Sidebar:** the campaign, Find (Ctrl+K) and New, the campaign's views (Home, Timeline, Threads, Relationships, Graph), then the documents: by kind (characters in your own groups, or grouped by role, faction…; drag them in and out) or as a tree you arrange. Table, Sounds and your role sit at the bottom, with the Settings gear.
- **A document:** an optional banner (offered when you hover the top), its picture big at the top left with its colours bleeding outwards and the title beside it, folded **Details** (fields, relationships, who may read it), then the writing. The bar holds only the lock, the mind map, Send to table and More.
- **Boards and maps** fill the whole middle; their details and notes open in a drawer.
- **Side panel** (documents only): outline and backlinks, the table, Critter Sounds.
- **Focus** (Ctrl+.) hides everything but the page. **Settings** (the gear) has the look (theme, your own colours, reading size and font), writing, the campaign, the table, sharing and files.
- **Dragging empty space** always moves the view, the way it can move: documents and pages up and down, the timeline sideways, boards, maps, mind maps and the graph every way.

## Where campaigns live

`Documents\CritterNotes\<campaign>\` (the folder can be changed from the menu; campaigns in the old `Documents\Critter Notes` move there once):
- `campaign.json`: name, game, colour, linked table, calendar, campaign clocks, shared world.
- `docs\<id>.json`: one file per document `{ id, type, title, parent, order, body, fields, tags, img, rels, map, board, … }`. `body` is Markdown.
- `images\<sha1>.<ext>`: pictures, named by their content.

Deleted documents and campaigns go to the Windows recycle bin. **Export as Markdown** writes an Obsidian-ready copy;
**Import Markdown** reads one back (front matter, folders named after kinds, `![[picture]]` embeds). **Back up** writes one JSON file with the pictures inside.

## The tour

`src/tour.js`: the basics or everything in depth, offered once at the first start and from Settings › Help, the welcome screen and the menus. It runs in a sample campaign of its own (`tour: true`), shows features off by opening and changing things there, then removes that campaign for good (`camp:remove`, only for tour campaigns) and restores the settings, campaign and page. A tour campaign left by a crash is removed at the next start.

## Writing

Documents are written as they look; Markdown is only how they're kept and exported.
- **The lock** above a document: unlocked, you write anywhere; locked, nothing changes by accident, but boxes tick, dice roll and anything can be sent (Ctrl+E switches).
- **Select text** for bold, italic, highlight, a link (Ctrl+K), or **Make it…** an encounter, an alternative path, read-aloud text, a secret, a clue, treasure, a heading, a checklist.
- **The + beside your line** adds anything: into the line (a link, dice, a sound cue) or as the next section (boxes, encounter builder, tables, random tables, pictures). **/** on an empty line does the same; **[[** links as you type.
- **Sections** (each paragraph, list, box or table) can be dragged by the handle beside them; the handle's menu moves, turns into, duplicates, sends or removes one.
- **Right-click:** link or unlink, make it something, send the selection or the section to the table chat, or whisper it to a player.
- **Link suggestions:** typing the name of another document offers a small bubble to link it; ✕ dismisses it for that name in that document.
- Markdown habits work too: `## `, `- `, `[] `, `> `, `---`.

| Kept as | Shows as |
| --- | --- |
| `[[Title]]`, `[[Title|words]]` | a link to a document (renames update every link) |
| `[[table:<id>|Name]]`, `[[srd:dnd5e/npc/Zombie|Zombies]]` | a table Library entry, an SRD entry |
| `[[sound:pad/<id>|Thunder]]`, `[[roll:2d6+3]]` | a Critter Sounds cue, a dice button |
| `> [!branch] If they…` | an alternative path (also read, secret, clue, combat, loot, scene, question…) |
| `- [ ] clue` | a box to tick; unfound clues come along to the next session |
| a table headed `| d6 | … |` | a random table with a Roll button |

## Kinds of documents and the views

Session, quest, character, location, faction, item, lore, event, map, board and note, each with its own fields (`src/kinds.js`).
- **Sessions** start from the Lazy DM's steps; **Run** gives a clock, a timestamped log and the table's chat.
- **Timeline:** left to right; drag to move along it, scroll to zoom, right-click to add an event on that day. "Today in the world" is a flip clock: drag it to move time, and while dragging the wheel changes the pace from days to weeks, months and years.
- **Threads:** progress clocks (on factions, quests, or the campaign's own), quests by status, and every clue: planned in which session, found in which.
- **Relationships:** ties between documents ("ally of", "owes"…) set in Details, drawn as a web.
- **Encounter builder:** SRD creatures with D&D 5e XP thresholds, Pathfinder 2e XP budgets or Daggerheart battle points.
- **Boards:** right-click the canvas for a card (Enter finishes, Shift or Ctrl+Enter for a new line); drag from a card's edge to another card for an arrow, or to the canvas for a new card on its end; double-click an arrow to write on it; right-click a card to send it, whisper it, make it a document or colour it.
- **Maps:** right-click to place a pin and pick (or make) the document it leads to; soft blurred or old-paper edges; a scale bar once you say how wide the map is.
- **Shared world:** another campaign whose documents this one links to and reads, read only.

## Writing together: GM, co-writers, players

Sharing goes through the linked Critter table's Homebase (Settings › Sharing). The first start of Notes asks which you are.
- **GM:** turns sharing on. The campaign is uploaded, sealed with AES-GCM under a key made from the **writer key**. Co-writers join with the invite code `<lobby>-<writer key>`.
- **Co-writer:** sees and changes everything; changes sync both ways (last change per document wins; a document being written in waits until the writing pauses).
- **Player:** joins with the lobby code and picks their Critter player (with its password, if it has one). They see only documents opened to them (the eye beside a document's kind: everyone, or chosen players), without secrets, alternative paths, clues or encounters, and read only. **Their notes are their Critter notes**: what they write appears in Critter, and handouts the GM sends them appear in Notes.
- On the Homebase: `cnw/` sealed documents, `cniw/` sealed pictures, `cnp/` and `cnip/` what players may read. Anyone with the lobby code can reach a lobby's data (Critter works that way); the writer key is what keeps the GM's own documents unreadable to them.

## The table

A campaign is linked with a lobby code, or with Critter's **music code** to also cue Critter Sounds. Nothing in Critter
had to change; Notes writes what Critter already reads (`src/table.js`):
- `notes/<id>`: a note in the GM's notebook, or a handout with each player's copy. Sent **to everyone**, every player gets it in their notes; **whispered**, only that player does, with a whisper telling them. **Keep it shown** updates the handout and the players' unchanged copies as you write.
- `whispers/<id>`: a whisper from the GM (`members: ['gm', <player id>]`), for any selected text, section, card or document.
- `log/<id>`: a line in the chat (selected text, sections, random table results), credited to the GM.
- `ents/<id>`: an NPC or item in the Library. `scenes/<id>` + `scenebg/`: a map as a hidden scene.

## Critter Sounds

`critboard-desktop/music/src/notes-bridge.js` (in the Critter Sounds repository) publishes `lobbies/<code>/soundcat/main`
and plays cues from `lobbies/<code>/cues/<id>` `{ op, kind, ref, name, ts, sig }`, where `sig` is SHA-256 of
`<music key>|<id>|<op>|<kind>|<ref>`. Cues without the key are ignored.

## Updates

The app updates itself from this repository's releases (`updater.js`, electron-updater). Settings › Updates turns the check
when Notes starts on or off; Settings › Help and the logo menu have **Check for updates**. The pop-up lists up to five changes
(the release notes' list, or this version's section of `CHANGELOG.md`), with **Update now**, **Later** and **Skip this version**,
then shows the download and the install.

Installing uses **Critter Setup** (`installer/`, the same in Critter VTT, Critter Sounds and Critter Notes): one small C# program, compiled when building with the C# compiler every Windows has, and the app's files packed behind it by `installer/pack.mjs` (name, colour, logo and files come from `package.json` › `critterSetup`, so the engine itself doesn't change from release to release). Its window follows the Critter look in dark or light, Windows' high-contrast colours, text size and animation settings, and reads out properly in screen readers. It installs for the user without administrator rights (`/S` silent, `/D=<folder>`, `--no-desktop`) and puts an uninstaller in the app's folder. Updates happen inside Notes: the pop-up downloads the new setup file (only the parts that changed, usually a megabyte or two), unpacks it beside the app with its own progress bar, and Notes restarts and says **Update successful**. Afterwards the download and everything else the update used are deleted; only the updater's `installer.exe` stays (a copy of the installed version, so the next update downloads just what changed). Installs made by the old NSIS installer switch over on their first update (a small progress window, then the app opens again). A release needs `Critter-Notes-Setup.exe`, its `.blockmap` and `latest.yml` from `dist/` (`npm run dist` makes all three). Testing: `UPDATE_TEST_FEED=<url of a folder with latest.yml>`, `UPDATE_TEST_VERSION=<x.y.z>`; `SETUP_TEST=1 node installer/pack.mjs` packs a " Test" edition with its own folder and Apps entry.

## Accessibility

Every view is checked with axe-core in both themes. The sidebar is a keyboard tree (arrows, Enter, Shift+F10), menus and
dialogs keep focus where it belongs, mind map nodes, map pins and board cards are reachable by keyboard, and reduced motion is respected.
