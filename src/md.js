/* Critter Notes' Markdown. Plain Markdown (Obsidian-flavoured) plus a few GM things:
     [[Title]] [[Title|label]] [[Title#Heading]]   links between documents
     [[table:<id>|Name]]                          something in the linked Critter table's Library
     [[srd:<sys>/<kind>/<name>|Name]]             an SRD entry (item, monster, spell…)
     [[sound:<kind>/<id>|Name]]                   a Critter Sounds cue (playlist, pad, scene, soundscape)
     [[roll:1d20+5]]                              a dice button
     > [!branch] If they bribe the guard          an alternative path (also read-aloud, secret, clue, combat, loot…)
     - [ ] a beat or clue to tick off             #tags anywhere
   Everything that is drawn carries data-line, so ticking a box or adding to the mind map can write back to the text. */
const MD = (() => {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const CALLOUTS = {
    branch: { label: 'Alternative path', icon: 'branch' }, read: { label: 'Read aloud', icon: 'speech' }, secret: { label: 'GM only', icon: 'eye-off' },
    clue: { label: 'Clue', icon: 'key' }, combat: { label: 'Encounter', icon: 'swords' }, loot: { label: 'Treasure', icon: 'gem' },
    scene: { label: 'Scene', icon: 'clapper' }, note: { label: 'Note', icon: 'note' }, tip: { label: 'Tip', icon: 'spark' },
    warning: { label: 'Careful', icon: 'alert' }, question: { label: 'Open question', icon: 'help' }, quote: { label: 'Quote', icon: 'quote' }
  };
  const ALIAS = { alt: 'branch', path: 'branch', option: 'branch', if: 'branch', readaloud: 'read', boxed: 'read', gm: 'secret', hidden: 'secret', danger: 'warning', caution: 'warning', encounter: 'combat', fight: 'combat', treasure: 'loot', reward: 'loot', info: 'note', abstract: 'note', summary: 'note', todo: 'note', hint: 'tip', success: 'tip', faq: 'question', help: 'question', cite: 'quote', bug: 'warning', example: 'note', failure: 'warning' };
  const calloutKind = k => { k = String(k || '').toLowerCase().replace(/[^a-z]/g, ''); return CALLOUTS[k] ? k : ALIAS[k] || 'note'; };

  const RX = {
    fence: /^\s*(```|~~~)\s*([\w-]*)\s*$/, head: /^(#{1,6})\s+(.*?)\s*#*\s*$/, hr: /^\s*([-*_])(\s*\1){2,}\s*$/,
    quote: /^\s*>/, item: /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/, task: /^\[([ xX])\]\s+(.*)$/,
    tsep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/, callout: /^\[!([\w-]+)\]([-+]?)\s*(.*)$/
  };
  const indentOf = s => { let n = 0; for (const c of s) { if (c === ' ') n++; else if (c === '\t') n += 4; else break; } return n; };
  const cells = s => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim());

  /* ---------- blocks ---------- */
  function parse(src, base = 0) {
    const L = String(src || '').replace(/\r\n?/g, '\n').split('\n'), out = [];
    let i = 0;
    const startsBlock = s => RX.head.test(s) || RX.fence.test(s) || RX.quote.test(s) || RX.item.test(s) || RX.hr.test(s);
    while (i < L.length) {
      const s = L[i];
      if (!s.trim()) { i++; continue; }
      let m;
      if ((m = RX.fence.exec(s))) {
        const fence = m[1], start = i; const body = []; i++;
        while (i < L.length && !L[i].trim().startsWith(fence)) body.push(L[i++]);
        i++; out.push({ t: 'code', lang: m[2], text: body.join('\n'), line: base + start }); continue;
      }
      if ((m = RX.head.exec(s))) { out.push({ t: 'h', level: m[1].length, text: m[2], line: base + i }); i++; continue; }
      if (RX.hr.test(s)) { out.push({ t: 'hr', line: base + i }); i++; continue; }
      if (RX.quote.test(s)) {
        const start = i, inner = [];
        while (i < L.length && RX.quote.test(L[i])) inner.push(L[i++].replace(/^\s*>\s?/, ''));
        const c = RX.callout.exec(inner[0] || '');
        if (c) out.push({ t: 'callout', kind: calloutKind(c[1]), raw: c[1].toLowerCase(), fold: c[2], title: c[3], blocks: parse(inner.slice(1).join('\n'), base + start + 1), line: base + start, end: base + i - 1 });
        else out.push({ t: 'quote', blocks: parse(inner.join('\n'), base + start), line: base + start, end: base + i - 1 });
        continue;
      }
      if (RX.item.test(s)) {
        const root = { ordered: /\d/.test(RX.item.exec(s)[2]), items: [], line: base + i }, stack = [{ indent: indentOf(s), list: root }];
        let last = null;
        while (i < L.length) {
          const x = L[i];
          if (!x.trim()) break;
          const im = RX.item.exec(x);
          if (!im) { if (last && indentOf(x) > 0 && !startsBlock(x)) { last.text += '\n' + x.trim(); i++; continue; } break; }
          const ind = indentOf(im[1]);
          while (stack.length > 1 && ind < stack[stack.length - 1].indent) stack.pop();
          let top = stack[stack.length - 1];
          if (ind > top.indent && last) { const nl = { ordered: /\d/.test(im[2]), items: [], line: base + i }; last.children = nl; stack.push({ indent: ind, list: nl }); top = stack[stack.length - 1]; }
          const tm = RX.task.exec(im[3]);
          last = { text: tm ? tm[2] : im[3], task: tm ? tm[1] !== ' ' : null, line: base + i, indent: ind, children: null, num: parseInt(im[2], 10) || 0 };
          top.list.items.push(last); i++;
        }
        out.push({ t: 'list', ...root }); continue;
      }
      if (s.includes('|') && i + 1 < L.length && RX.tsep.test(L[i + 1])) {
        const start = i, head = cells(s), align = cells(L[i + 1]).map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '')); i += 2;
        const rows = []; while (i < L.length && L[i].includes('|') && L[i].trim()) rows.push(cells(L[i++]));
        out.push({ t: 'table', head, align, rows, line: base + start }); continue;
      }
      const start = i, lines = [];
      while (i < L.length && L[i].trim() && (i === start || !startsBlock(L[i])) && !(L[i].includes('|') && i + 1 < L.length && RX.tsep.test(L[i + 1]))) lines.push(L[i++]);
      out.push({ t: 'p', text: lines.join('\n'), line: base + start });
    }
    return out;
  }

  /* ---------- inline ---------- */
  // wiki links: what they point at
  function linkInfo(raw) {
    let [target, label] = splitPipe(raw);
    target = target.trim();
    const m = /^(table|srd|sound|roll):(.*)$/i.exec(target);
    if (m) return { kind: m[1].toLowerCase(), ref: m[2].trim(), label: (label || '').trim() || (m[1].toLowerCase() === 'roll' ? m[2].trim() : m[2].split('/').pop().trim()), raw };
    const hash = target.indexOf('#');
    return { kind: 'doc', title: (hash >= 0 ? target.slice(0, hash) : target).trim(), heading: hash >= 0 ? target.slice(hash + 1).trim() : '', label: (label || '').trim(), raw };
  }
  function splitPipe(s) { const k = s.indexOf('|'); return k < 0 ? [s, ''] : [s.slice(0, k), s.slice(k + 1)]; }
  const INLINE = /`([^`\n]+)`|\[\[([^\]\n]+?)\]\]|!\[([^\]\n]*)\]\(([^)\s]+)\)|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>)\]]+)|(^|[\s(])#([\p{L}][\p{L}\p{N}_/-]*)/gu;
  function inline(s, ctx) {
    const keep = [];
    const put = html => '\u0000' + (keep.push(html) - 1) + '\u0000';
    let raw = String(s || '').replace(INLINE, (all, code, wiki, ialt, isrc, ltext, lurl, bare, pre, tag) => {
      if (code !== undefined) return put(`<code>${esc(code)}</code>`);
      if (wiki !== undefined) return put(ctx && ctx.link ? ctx.link(linkInfo(wiki)) : esc(linkInfo(wiki).label || wiki));
      if (isrc !== undefined) return put(ctx && ctx.img ? ctx.img(isrc, ialt) : '');
      if (lurl !== undefined && ctx && ctx.ext) return put(ctx.ext(ltext, lurl, all));
      if (bare !== undefined && ctx && ctx.ext) return put(ctx.ext(bare.replace(/^https?:\/\//, '').slice(0, 60), bare, all));
      if (lurl !== undefined) return put(`<a href="${esc(lurl)}" class="ext" target="_blank" rel="noopener noreferrer">${esc(ltext)}</a>`);
      if (bare !== undefined) return put(`<a href="${esc(bare)}" class="ext" target="_blank" rel="noopener noreferrer">${esc(bare.replace(/^https?:\/\//, '').slice(0, 60))}</a>`);
      if (tag !== undefined) return pre + put(ctx && ctx.tag ? ctx.tag(tag) : `<span class="tag">#${esc(tag)}</span>`);
      return all;
    });
    raw = esc(raw)
      .replace(/\*\*(?=\S)([^*]*?\S)\*\*/g, '<b>$1</b>').replace(/__(?=\S)([^_]*?\S)__/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, '$1<i>$2</i>').replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, '$1<i>$2</i>')
      .replace(/~~(?=\S)([^~]*?\S)~~/g, '<s>$1</s>').replace(/==(?=\S)([^=]*?\S)==/g, '<mark>$1</mark>')
      .replace(/\n/g, '<br>');
    return raw.replace(/\u0000(\d+)\u0000/g, (a, n) => keep[+n]);
  }
  // inline text without its markup: for titles in the mind map, search snippets and Critter
  function plainInline(s) {
    return String(s || '').replace(INLINE, (all, code, wiki, ialt, isrc, ltext, lurl, bare, pre, tag) => code !== undefined ? code : wiki !== undefined ? (linkInfo(wiki).label || linkInfo(wiki).title || linkInfo(wiki).ref) : isrc !== undefined ? '' : lurl !== undefined ? ltext : bare !== undefined ? bare : tag !== undefined ? pre + '#' + tag : all)
      .replace(/\*\*|__|~~|==/g, '').replace(/(^|\W)[*_](?=\S)|(?<=\S)[*_](?=\W|$)/g, '$1');
  }

  /* ---------- HTML ---------- */
  const slug = s => plainInline(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60);
  function renderBlocks(blocks, ctx) {
    return blocks.map(b => {
      if (b.t === 'h') return `<h${b.level} id="h-${slug(b.text)}" data-line="${b.line}">${inline(b.text, ctx)}</h${b.level}>`;
      if (b.t === 'p') { const lone = /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(b.text); return `<p data-line="${b.line}"${lone ? ' class="pic"' : ''}>${inline(b.text, ctx)}</p>`; }
      if (b.t === 'hr') return '<hr>';
      if (b.t === 'code') return `<pre data-line="${b.line}"><code>${esc(b.text)}</code></pre>`;
      if (b.t === 'quote') return `<blockquote data-line="${b.line}">${renderBlocks(b.blocks, ctx)}</blockquote>`;
      if (b.t === 'callout') {
        const c = CALLOUTS[b.kind], title = b.title ? inline(b.title, ctx) : esc(c.label), icon = ctx && ctx.icon ? ctx.icon(c.icon) : '';
        const head = `<span class="cic">${icon}</span><span class="ctt">${title}</span>${b.title && b.kind !== 'note' ? `<span class="ckind">${esc(c.label)}</span>` : ''}`;
        const extra = ctx && ctx.calloutTools ? ctx.calloutTools(b) : '';
        if (b.fold) return `<details class="callout c-${b.kind}" data-line="${b.line}"${b.fold === '+' ? ' open' : ''}><summary class="ch">${head}${extra}</summary><div class="cb">${renderBlocks(b.blocks, ctx)}</div></details>`;
        return `<div class="callout c-${b.kind}" data-line="${b.line}"><div class="ch">${head}${extra}</div>${b.blocks.length ? `<div class="cb">${renderBlocks(b.blocks, ctx)}</div>` : ''}</div>`;
      }
      if (b.t === 'list') return renderList(b, ctx);
      if (b.t === 'table') return `<div class="tblw">${ctx && ctx.tableTools ? ctx.tableTools(b) : ''}<table data-line="${b.line}"><thead><tr>${b.head.map((h, k) => `<th scope="col"${b.align[k] ? ` style="text-align:${b.align[k]}"` : ''}>${inline(h, ctx)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r, ri) => `<tr data-row="${ri}">${b.head.map((_, k) => `<td${b.align[k] ? ` style="text-align:${b.align[k]}"` : ''}>${inline(r[k] || '', ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      return '';
    }).join('\n');
  }
  function renderList(l, ctx) {
    const tag = l.ordered ? 'ol' : 'ul', start = l.ordered && l.items[0] && l.items[0].num > 1 ? ` start="${l.items[0].num}"` : '';
    return `<${tag}${start}${l.items.some(x => x.task !== null) ? ' class="tasks"' : ''}>${l.items.map(it => {
      const box = it.task === null ? '' : `<input type="checkbox" data-line="${it.line}"${it.task ? ' checked' : ''} aria-label="${esc(plainInline(it.text).slice(0, 120))}">`;
      return `<li data-line="${it.line}"${it.task === null ? '' : ` class="task${it.task ? ' done' : ''}"`}>${box}<span class="lt">${inline(it.text, ctx)}</span>${it.children ? renderList(it.children, ctx) : ''}</li>`;
    }).join('')}</${tag}>`;
  }
  const render = (src, ctx) => renderBlocks(parse(src), ctx);

  /* ---------- what a document says ---------- */
  function links(src) {
    const out = [], s = String(src || '').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
    for (const m of s.matchAll(/\[\[([^\]\n]+?)\]\]/g)) out.push(linkInfo(m[1]));
    return out;
  }
  function outline(src) { const out = []; walk(parse(src), b => { if (b.t === 'h') out.push({ level: b.level, text: plainInline(b.text), line: b.line }); }); return out; }
  function walk(blocks, fn) { for (const b of blocks) { fn(b); if (b.blocks) walk(b.blocks, fn); } }
  function tags(src) { const out = new Set(); const s = String(src || '').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/https?:\/\/\S+/g, ''); for (const m of s.matchAll(/(^|[\s(])#([\p{L}][\p{L}\p{N}_/-]*)/gu)) out.add(m[2].toLowerCase()); return [...out]; }
  function plain(src) {
    const out = [];
    const each = blocks => { for (const b of blocks) { if (b.t === 'h' || b.t === 'p') out.push(plainInline(b.text)); else if (b.t === 'code') out.push(b.text); else if (b.t === 'callout') { if (b.title) out.push(plainInline(b.title)); each(b.blocks); } else if (b.t === 'quote') each(b.blocks); else if (b.t === 'list') listText(b); else if (b.t === 'table') out.push([b.head, ...b.rows].map(r => r.map(plainInline).join(' · ')).join('\n')); } };
    const listText = l => l.items.forEach(it => { out.push(plainInline(it.text)); if (it.children) listText(it.children); });
    each(parse(src)); return out.join('\n');
  }
  // ticks or unticks the box on one line, wherever it sits (inside quotes and callouts too)
  function toggleTask(src, line, on) {
    const L = String(src).split('\n'); if (!L[line]) return src;
    L[line] = L[line].replace(/^((?:\s*>\s?)*\s*(?:[-*+]|\d{1,3}[.)])\s+)\[([ xX])\]/, (a, pre, x) => pre + '[' + ((on === undefined ? x === ' ' : on) ? 'x' : ' ') + ']');
    return L.join('\n');
  }

  /* ---------- the mind map: headings, list items, callouts and links, as a tree ---------- */
  function tree(src, title, o = {}) {
    const root = { text: title || 'Untitled', kind: 'root', line: -1, children: [] };
    const fromList = l => l.items.map(it => ({ text: plainInline(it.text), kind: it.task === null ? 'li' : 'task', done: !!it.task, line: it.line, children: [...(it.children ? fromList(it.children) : []), ...linkNodes(it.text, it.line, true)] }));
    const linkNodes = (text, line, skipFirst) => {
      const ls = []; for (const m of String(text).matchAll(/\[\[([^\]\n]+?)\]\]/g)) { const li = linkInfo(m[1]); if (li.kind === 'roll') continue; ls.push({ text: li.label || li.title || li.ref, kind: 'link', link: li, line, children: [] }); }
      // a list item that is just one link is that link; the item stands for it
      if (skipFirst && ls.length === 1 && plainInline(text).trim() === ls[0].text) return [];
      return ls;
    };
    const into = (blocks, parent) => {
      const stack = [{ level: 0, node: parent }];
      for (const b of blocks) {
        const top = () => stack[stack.length - 1].node;
        if (b.t === 'h') { while (stack.length > 1 && stack[stack.length - 1].level >= b.level) stack.pop(); const n = { text: plainInline(b.text), kind: 'h', level: b.level, line: b.line, children: [] }; top().children.push(n); stack.push({ level: b.level, node: n }); }
        else if (b.t === 'list') top().children.push(...fromList(b));
        else if (b.t === 'callout') { const n = { text: plainInline(b.title) || CALLOUTS[b.kind].label, kind: 'callout', ctype: b.kind, line: b.line, children: [] }; into(b.blocks, n); top().children.push(n); }
        else if (b.t === 'quote') into(b.blocks, top());
        else if (b.t === 'p') { if (o.paras) { const t = plainInline(b.text).split(/(?<=[.!?])\s/)[0]; if (t) top().children.push({ text: t.length > 70 ? t.slice(0, 68) + '…' : t, kind: 'p', line: b.line, children: linkNodes(b.text, b.line) }); } else top().children.push(...linkNodes(b.text, b.line)); }
        else if (b.t === 'table') b.rows.forEach((r, k) => top().children.push({ text: plainInline(r[0] || ''), kind: 'li', line: b.line + 2 + k, children: [], ro: true }));
      }
    };
    into(parse(src), root);
    return root;
  }
  // writing back from the mind map
  const QPRE = /^((?:\s*>\s?)*)/;
  function addChild(src, node, text) {
    const L = String(src || '').split('\n');
    text = String(text).replace(/\n/g, ' ').trim(); if (!text) return src;
    const insertAt = (at, line) => { L.splice(at, 0, line); return L.join('\n'); };
    if (node.kind === 'root') { while (L.length && !L[L.length - 1].trim()) L.pop(); if (L.length) L.push(''); L.push('## ' + text); return L.join('\n') + '\n'; }
    if (node.kind === 'h') {
      let k = node.line + 1; while (k < L.length && !RX.head.test(L[k])) k++;
      let at = k; while (at > node.line + 1 && !L[at - 1].trim()) at--;
      // a list keeps apart from a paragraph above it, and from the heading that follows
      const add = [];
      if (at > node.line + 1 && !RX.item.test(L[at - 1])) add.push('');
      add.push('- ' + text);
      if (at === k && k < L.length) add.push('');
      L.splice(at, 0, ...add); return L.join('\n');
    }
    if (node.kind === 'li' || node.kind === 'task' || node.kind === 'callout') {
      const pre = (QPRE.exec(L[node.line]) || ['', ''])[1], body = s => s.slice(pre.length);
      if (node.kind === 'callout') { let k = node.line + 1; while (k < L.length && RX.quote.test(L[k]) && L[k].startsWith(pre)) k++; return insertAt(k, pre + '> - ' + text); }
      const ind = indentOf(body(L[node.line]));
      let k = node.line + 1;
      while (k < L.length && L[k].trim() && L[k].startsWith(pre) && body(L[k]).trim() && indentOf(body(L[k])) > ind) k++;
      return insertAt(k, pre + ' '.repeat(ind + 2) + (node.kind === 'task' ? '- [ ] ' : '- ') + text);
    }
    return src;
  }
  function rename(src, node, text) {
    const L = String(src || '').split('\n'); if (node.line < 0 || !L[node.line]) return src;
    text = String(text).replace(/\n/g, ' ').trim(); if (!text) return src;
    if (node.kind === 'h') L[node.line] = L[node.line].replace(/^(#{1,6}\s+).*$/, (a, p) => p + text);
    else if (node.kind === 'li' || node.kind === 'task') L[node.line] = L[node.line].replace(/^((?:\s*>\s?)*\s*(?:[-*+]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?).*$/, (a, p) => p + text);
    else if (node.kind === 'callout') L[node.line] = L[node.line].replace(/^((?:\s*>\s?)*\[![\w-]+\][-+]?)\s*.*$/, (a, p) => p + ' ' + text);
    else return src;
    return L.join('\n');
  }

  /* ---------- for Critter: its notes know headings, bold, italic, lists and quotes ---------- */
  // secret callouts stay behind unless it's for the GM (gm: true); forPlayers drops clues, alternative paths and the like too
  function toCritter(src, ctx = {}) {
    const out = [];
    const each = (blocks, q) => {
      for (const b of blocks) {
        const p = q ? '> ' : '';
        if (b.t === 'h') out.push(p + '#'.repeat(Math.min(3, b.level)) + ' ' + flat(b.text));
        else if (b.t === 'p') { const t = flat(b.text); if (t.trim()) out.push(...t.split('\n').map(x => p + x)); }
        else if (b.t === 'hr') out.push(p + '---');
        else if (b.t === 'code') out.push(...b.text.split('\n').map(x => p + x));
        else if (b.t === 'quote') each(b.blocks, true);
        else if (b.t === 'callout') {
          if ((b.kind === 'secret' && !ctx.gm) || (ctx.forPlayers && ['branch', 'clue', 'combat', 'loot', 'question', 'scene', 'tip', 'warning'].includes(b.kind))) continue;
          out.push(`> **${flat(b.title) || CALLOUTS[b.kind].label}**`); each(b.blocks, true);
        }
        else if (b.t === 'list') list(b, 0, p);
        else if (b.t === 'table') { out.push(p + '**' + b.head.map(flat).join(' · ') + '**'); b.rows.forEach(r => out.push(p + '- ' + r.map(flat).join(' · '))); }
        out.push('');
      }
    };
    const list = (l, depth, p) => l.items.forEach((it, k) => { out.push(p + '  '.repeat(depth) + (l.ordered ? (k + 1) + '. ' : '- ') + (it.task === null ? '' : it.task ? '☑ ' : '☐ ') + flat(it.text)); if (it.children) list(it.children, depth + 1, p); });
    const flat = s => String(s || '').replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\[\[([^\]\n]+?)\]\]/g, (a, w) => { const li = linkInfo(w); return li.kind === 'roll' ? li.ref : '**' + (li.label || li.title || li.ref) + '**'; }).replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '[$1]($2)').replace(/==([^=]+)==/g, '**$1**');
    each(parse(src), false);
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // the first picture a document shows, for sending along
  const firstImage = src => { const m = /!\[[^\]]*\]\(([^)\s]+)\)/.exec(String(src || '')); return m ? m[1] : ''; };

  // a random table: a Markdown table whose first heading is a die (d6, 2d6, d%), its first column the rolls (4, 5-6, 00)
  function rollTable(b) {
    const m = /^(\d*)d(\d+|%)$/i.exec(String(b.head[0] || '').trim()); if (!m) return null;
    const rows = b.rows.map((r, k) => { const c = String(r[0] || '').replace(/[–—]/g, '-').trim(), rm = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(c); return rm ? { lo: +rm[1], hi: rm[2] ? +rm[2] : +rm[1], k, cells: r } : null; }).filter(Boolean);
    if (!rows.length) return null;
    return { n: +m[1] || 1, s: m[2] === '%' ? 100 : +m[2], rows, title: b.head.slice(1).join(' · ') };
  }

  // what players may read: without secrets, alternative paths, clues, encounters, treasure, scenes and open questions
  const GM_ONLY = ['secret', 'branch', 'clue', 'combat', 'loot', 'question', 'scene', 'tip', 'warning'];
  function forPlayers(src) {
    const L = String(src || '').split('\n'), drop = new Set();
    for (const b of parse(src)) if (b.t === 'callout' && GM_ONLY.includes(b.kind)) for (let i = b.line; i <= b.end; i++) drop.add(i);
    return L.filter((l, i) => !drop.has(i)).join('\n').replace(/\n{3,}/g, '\n\n');
  }

  return { forPlayers, esc, parse, render, rollTable, inline, plainInline, linkInfo, links, outline, tags, plain, toggleTask, tree, addChild, rename, toCritter, firstImage, slug, CALLOUTS, calloutKind };
})();
