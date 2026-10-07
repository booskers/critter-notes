# Changelog

## Next (not released yet)
- Your devices: link a campaign to your phone, tablet or a browser (notes.crittervtt.com), and it stays in step both ways: what you add, change, trash or restore on one, the others do too. On the same Wi-Fi the phone finds the computer by itself; anywhere else it types a 6-letter code. Both screens show the same four digits and the computer approves it.
- End-to-end encrypted with a key only your devices have: the Homebase carries the campaign but can't read it. Only a small index is watched; a change sends about its own size.
- A document changed on two devices while they were apart keeps both: the newer one wins, the other waits in the trash as a "conflict copy".
- Settings › Your devices: which devices are linked and which are here now, a sync check that compares everything, renaming this device, unlinking it, or removing the link everywhere (for a lost device).
- The trash: deleted documents wait 30 days (the trash button beside Settings), to restore or delete for good; on linked devices too. Undo brings a deleted document back from it.

## 1.5.2 (2026-10-07)
- Critter VTT's Homebase has a new address, live.crittervtt.com, and Notes now connects there (the old address keeps working for older versions).
- The connection to the Homebase sends several changes made at once together, and each one succeeds or fails on its own.

## 1.5.1 (2026-10-07)
- Home's top is never out of reach any more: in a window shorter than Home, its top part (the next session and the to-dos) slid up out of sight and couldn't be scrolled to.

## 1.5.0 (2026-10-07)
- Critter Setup, a new installer in the Critter look; updates now download only what changed.
- The notes drawer: a tab at the bottom of the window (Ctrl+J) slides up into a canvas of to-do lists, notes and links. Drag it taller or shorter, right-click for something new, and drag a block onto a document to put it there. Open to-dos show on Home; Settings can turn it off.
- A global undo history: Ctrl+Z and Ctrl+Y anywhere outside a text field, a rename or a delete is one step, a history window to go back several steps, and the number of steps in Settings › Writing.
- Right-click menus everywhere that right-click did nothing: documents (links, chips, cards, timeline events, graph nodes) get their menu, and empty space offers undo, new, find, back, home and settings.
- Home can show the campaign's cover as a blurred background. With a table linked, Critter VTT's cover is used, and a picture chosen in Notes goes to a table that has none. Settings can turn it off.
- Timeline: dragging it never selects text; today's line travels with the flip clock (the timeline zooms to the clock's pace); grab an event by its edge to move it to another day, with the old and new date shown above it.
- The relationships and the graph show each document's picture (ringed in its kind's colour) or its kind's icon, and spread out so busy webs don't knot up.
- Everything is saved as you type: within a second of a pause, and at least every few seconds while you keep typing (the title too), and at once when Notes loses focus or closes.
- A font for dyslexia (OpenDyslexic, with more room between lines and words), as in Critter VTT.
- The tour shows the notes drawer, and every card stays 12px inside the window at any size, beside what it explains.

## 1.4.0 (2026-10-07)
- A guided tour: the basics in two minutes, or everything in depth. It shows Critter Notes with a sample campaign, opens things and changes them around to show them off, and puts everything back when it ends. Offered once at the first start; again any time from Settings › Help, the welcome screen or the menu.
- Link cards: rest the pointer on a link for a second to see its banner, portrait, kind, the facts that matter and how it begins, with sections and lists kept in their shape.
- Players only ever see what was shared with them: a link to something they don't know says so, and suggests their character ask around.
- A banner spans the whole middle and flows up under the title bar; the document bar turns to glass once you scroll.
- A picture's glow spreads out softly to the edges instead of being cut off.

## 1.3.1 (2026-10-07)
- Campaigns are kept in Documents\CritterNotes now (next to Documents\CritterVTT).
- Campaigns in the old Documents\Critter Notes folder move there by themselves the first time Notes starts; a folder you chose yourself stays where it is.

## 1.3.0 (2026-10-07)
- Updates inside the app: Notes checks GitHub when it starts (Settings › Updates turns that off), shows the most important changes, and updates with one click.
- Update now, Later, or Skip this version, with a progress bar for the download and then the installer's own; Notes opens again by itself.
- Check for updates in Settings › Updates, Settings › Help, the About box and the logo menu.
- A GitHub button in Settings, About and the logo menu.
- Critter Notes is open source now: MIT License, made with love by booskers / Polychrome.

## 1.2.1 (2026-10-07)
- One flat button style shared with Critter VTT and Critter Sounds: 8px corners, no outlines, gradients or lift.
  The main action and anything switched on are filled with your highlight colour; the open tab takes the hover tone. Your colours are unchanged.

## 1.2.0 (2026-10-07)
- The shared Critter look: surfaces lift by light instead of lines, Atkinson Hyperlegible Next, a see-through title bar showing the mark, glows only on hover.
- New logo and app icons (the yellow book).
- The logo follows your highlight colour (a little deeper in the light theme).
- Chat lines and whispers you send to the table carry your colour.
- Settings: font pairings, surface tint and picture colour.

## 1.1.0 (2026-10-06)
- A visual editor: documents are written as they look, Markdown is only how they're kept and exported.
  The lock, the + beside your line, Make it… (encounter, alternative path, secret, clue…), draggable sections, link suggestions, right-click send and whisper.
- Writing together: the GM shares a campaign through the table's Homebase (sealed with AES-GCM); co-writers join with an invite code, players see only what's opened to them, and their notes are their Critter notes.
- First start asks: start a campaign, write with someone, or join as a player.
- Boards and maps fill the middle. Boards: right-click for a card, arrows from a card's edge, labels on arrows. Maps: blurred or old-paper edges, a scale bar, right-click for a pin.
- Timeline left to right with right-click to add an event; "Today in the world" as a flip clock.
- Character groups you drag into and out of; banners; big portraits with their colours bleeding outwards.
- Dragging empty space moves every view; a Settings page; whispers to players.

## 1.0.0 (2026-10-06)
- First release: sessions, quests, characters, locations, factions, items, lore, maps and notes, linked to each other and to a Critter VTT table and Critter Sounds.
