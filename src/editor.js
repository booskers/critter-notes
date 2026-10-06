/* Critter Notes: the visual editor. A document is edited as it looks: paragraphs, headings, lists, boxes (alternative
   paths, read-aloud text, secrets…), tables and pictures, each a section you can drag. Markdown stays the format it is
   kept and exported in, but nobody has to write it.
   - Unlocked: write anywhere. Select text for bold, links and "make it an encounter / an alternative path…".
     The + beside the line you're on adds anything: into the line (a link, dice, a sound cue) or as the next section.
   - Locked: nothing changes by accident, but boxes still tick, dice roll and anything can be sent to the chat.
   - Right-click: link or unlink, make it something, send it to the chat or whisper it, and more.
   - A name of another document typed without a link gets a small bubble offering to link it. */
const ED = (() => {
  const atom = (html, md, cls = '') => `<span class="atom${cls}" contenteditable="false" data-md="${MD.esc(md)}">${html}</span>`;
  function ctx(editable) {
    const R = renderCtx();
    return {
      ...R,
      link: li => atom(R.link(li), `[[${li.raw}]]`),
      img: (src, alt) => atom(R.img(src, alt), `![${alt}](${src})`, ' pic'),
      tag: t => atom(R.tag(t), '#' + t),
      ext: (text, url, raw) => atom(`<a href="${MD.esc(url)}" class="ext" target="_blank" rel="noopener noreferrer">${MD.esc(text)}</a>`, raw),
      tableTools: b => PLAN.tableTools(b).replace('<div class="rtools">', '<div class="rtools" contenteditable="false">')
    };
  }

  /* ---------- drawing the sections ---------- */
  function blockHtml(b, c, editable) {
    const L = ` data-line="${b.line}"`;
    if (b.t === 'h') return `<h${Math.min(b.level, 4)} class="blk" data-level="${b.level}"${L}>${MD.inline(b.text, c) || '<br>'}</h${Math.min(b.level, 4)}>`;
    if (b.t === 'p') return `<p class="blk"${L}>${MD.inline(b.text, c) || '<br>'}</p>`;
    if (b.t === 'hr') return `<div class="blk hrb" data-k="hr" contenteditable="false"${L}><hr></div>`;
    if (b.t === 'code') return `<pre class="blk" data-k="code" spellcheck="false"${L}>${MD.esc(b.text) || '<br>'}</pre>`;
    if (b.t === 'quote') return `<blockquote class="blk"${L}>${b.blocks.map(x => blockHtml(x, c, editable)).join('') || '<p><br></p>'}</blockquote>`;
    if (b.t === 'callout') {
      const k = MD.CALLOUTS[b.kind];
      return `<div class="blk callout c-${b.kind}" data-k="callout" data-kind="${b.kind}" data-fold="${b.fold || ''}"${L}><div class="ch" contenteditable="false"><span class="cic">${icon(k.icon)}</span><span class="ctt" contenteditable="${editable}" data-ph="${MD.esc(k.label)}">${MD.inline(b.title, c)}</span><span class="ckind">${k.label}</span></div><div class="cb">${b.blocks.map(x => blockHtml(x, c, editable)).join('') || '<p><br></p>'}</div></div>`;
    }
    if (b.t === 'list') return listHtml(b, c, true);
    if (b.t === 'table') return `<div class="blk tblw" data-k="table" tabindex="0" role="region" aria-label="Table: ${MD.esc(b.head.map(MD.plainInline).join(', ').slice(0, 80))} (line ${b.line + 1})" data-align="${MD.esc(JSON.stringify(b.align))}"${L}>${c.tableTools(b)}<table><thead><tr>${b.head.map(x => `<th scope="col">${MD.inline(x, c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r, ri) => `<tr data-row="${ri}">${b.head.map((_, k) => `<td>${MD.inline(r[k] || '', c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return '';
  }
  function listHtml(l, c, top) {
    const tag = l.ordered ? 'ol' : 'ul', start = l.ordered && l.items[0] && l.items[0].num > 1 ? ` start="${l.items[0].num}"` : '';
    return `<${tag}${top ? ` class="blk" data-line="${l.line}"` : ''}${start}>${l.items.map(it => `<li data-line="${it.line}"${it.task === null ? '' : ` class="task${it.task ? ' done' : ''}"`}>${it.task === null ? '' : `<input type="checkbox" contenteditable="false" data-line="${it.line}"${it.task ? ' checked' : ''} aria-label="${MD.esc(MD.plainInline(it.text).slice(0, 120))}">`}${MD.inline(it.text, c) || (it.task === null ? '' : '')}${it.children ? listHtml(it.children, c, false) : ''}</li>`).join('')}</${tag}>`;
  }

  /* ---------- back to Markdown ---------- */
  function inl(node) {
    let s = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { s += n.nodeValue.replace(/ /g, ' ').replace(/​/g, ''); continue; }
      if (n.nodeType !== 1) continue;
      if (n.dataset && n.dataset.md !== undefined) { s += n.dataset.md; continue; }
      const t = n.tagName;
      if (t === 'BR') s += '\n';
      else if (t === 'B' || t === 'STRONG') s += wrapMark(inl(n), '**');
      else if (t === 'I' || t === 'EM') s += wrapMark(inl(n), '*');
      else if (t === 'S' || t === 'STRIKE' || t === 'DEL') s += wrapMark(inl(n), '~~');
      else if (t === 'MARK') s += wrapMark(inl(n), '==');
      else if (t === 'CODE') s += '`' + n.textContent + '`';
      else if (t === 'INPUT' || n.classList.contains('rtools') || n.classList.contains('ch') || t === 'UL' || t === 'OL') continue;
      else if (t === 'A' && /^https?:/.test(n.getAttribute('href') || '')) s += `[${n.textContent}](${n.getAttribute('href')})`;
      else if (t === 'DIV' || t === 'P') s += (s && !s.endsWith('\n') ? '\n' : '') + inl(n);
      else if (t === 'FONT' || t === 'SPAN' || t === 'U') {
        const st = n.style || {}; let x = inl(n);
        if (st.fontWeight === 'bold' || +st.fontWeight >= 600) x = wrapMark(x, '**'); if (st.fontStyle === 'italic') x = wrapMark(x, '*');
        s += x;
      } else s += inl(n);
    }
    return s;
  }
  // **x** around words, keeping spaces outside (Markdown won't bold "** x **")
  function wrapMark(x, m) { const a = /^\s*/.exec(x)[0], b = /\s*$/.exec(x)[0], core = x.trim(); return core ? a + m + core + m + b : x; }
  function listMd(l, depth) {
    const out = [], ord = l.tagName === 'OL'; let n = +l.getAttribute('start') || 1;
    for (const li of l.children) {
      if (li.tagName !== 'LI') continue;
      const box = li.querySelector(':scope > input[type=checkbox]');
      const text = inl(li).replace(/\n+/g, ' ').trim();
      out.push('  '.repeat(depth) + (ord ? `${n++}. ` : '- ') + (box ? (box.checked ? '[x] ' : '[ ] ') : '') + text);
      for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') out.push(...listMd(sub, depth + 1));
    }
    return out;
  }
  function blockMd(el) {
    if (el.nodeType === 3) return el.nodeValue.trim();
    if (el.nodeType !== 1) return '';
    const t = el.tagName, k = el.dataset.k;
    if (/^H[1-6]$/.test(t)) { const lv = +el.dataset.level || +t[1]; const x = inl(el).replace(/\n+/g, ' ').trim(); return x ? '#'.repeat(lv) + ' ' + x : ''; }
    if (k === 'hr') return '---';
    if (k === 'code' || t === 'PRE') return '```\n' + el.textContent.replace(/\n$/, '') + '\n```';
    if (k === 'callout') {
      const title = inl(el.querySelector('.ctt') || document.createElement('i')).replace(/\n+/g, ' ').trim();
      const body = blocksMd(el.querySelector('.cb'));
      return [`> [!${el.dataset.kind || 'note'}]${el.dataset.fold || ''}${title ? ' ' + title : ''}`, ...(body ? body.split('\n').map(l => (l ? '> ' + l : '>')) : [])].join('\n');
    }
    if (t === 'BLOCKQUOTE') return blocksMd(el).split('\n').map(l => (l ? '> ' + l : '>')).join('\n');
    if (t === 'UL' || t === 'OL') return listMd(el, 0).join('\n');
    if (k === 'table') {
      const tbl = el.querySelector('table'); if (!tbl) return '';
      const cell = c => inl(c).replace(/\n+/g, ' ').replace(/\|/g, '/').trim();
      const head = [...tbl.querySelectorAll('thead th')].map(cell), al = (() => { try { return JSON.parse(el.dataset.align || '[]'); } catch { return []; } })();
      const rows = [...tbl.querySelectorAll('tbody tr')].map(r => [...r.children].map(cell));
      return [`| ${head.join(' | ')} |`, `| ${head.map((_, i) => (al[i] === 'center' ? ':---:' : al[i] === 'right' ? '---:' : '---')).join(' | ')} |`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
    }
    return inl(el).replace(/^\n+|\n+$/g, '');
  }
  const blocksMd = box => box ? [...box.childNodes].map(blockMd).filter(x => x && x.trim()).join('\n\n') : '';

  /* ============================== the editor ============================== */
  // o: { locked, onChange() }; returns { root, setLocked, commit, insertMd, focus }
  function mount(host, d, o) {
    let locked = !!o.locked;
    const wrap = h('div', { class: 'vwrap' + (locked ? ' locked' : '') });
    const root = h('div', { class: 'vis prose', role: 'textbox', 'aria-multiline': 'true', 'aria-label': `Text of ${d.title}`, spellcheck: true });
    const gutter = h('div', { class: 'vgut', hidden: true },
      h('button', { type: 'button', class: 'vplus', title: 'Add something here', 'aria-label': 'Add something here', html: icon('plus'), onmousedown: e => e.preventDefault(), onclick: e => insertMenu(e.currentTarget) }),
      h('button', { type: 'button', class: 'vgrip', title: 'Drag to move this section; click for its menu', 'aria-label': 'Move this section, or its menu', draggable: true, html: '<svg viewBox="0 0 10 16" class="ic"><circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/></svg>', onmousedown: e => e.preventDefault(), onclick: e => sectionMenu(cur, e.currentTarget) }));
    const bar = h('div', { class: 'vbar', role: 'toolbar', 'aria-label': 'Selected text', hidden: true });
    const drop = h('div', { class: 'vdrop', hidden: true });
    const sugg = h('div', { class: 'vsugg', role: 'status', hidden: true });
    wrap.append(gutter, root, drop, bar, sugg); host.append(wrap);
    let cur = null;   // the section the caret (or the mouse) is on
    document.execCommand('defaultParagraphSeparator', false, 'p');

    function render() {
      const editable = !locked && !isRO(d);
      root.innerHTML = d.body.trim() ? MD.parse(d.body).map(b => blockHtml(b, ctx(editable), editable)).join('') : '<p class="blk"><br></p>';
      root.contentEditable = String(editable);
      root.classList.toggle('empty', !d.body.trim());
      root.dataset.ph = editable ? 'Write here. + or / adds anything; select text to make it an encounter, an alternative path, a link…' : 'Nothing written yet.';
      hydrate(root);
    }
    render();

    /* ---------- saving ---------- */
    let t = 0;
    const top = n => { while (n && n.parentNode !== root) n = n.parentNode; return n && n.parentNode === root ? n : null; };
    const tops = () => [...root.childNodes];
    function normalize() {
      for (const n of tops()) {
        if (n.nodeType === 3) { if (!n.nodeValue.trim()) { n.remove(); continue; } const p = document.createElement('p'); p.className = 'blk'; n.replaceWith(p); p.append(n); }
        else if (n.nodeType === 1 && n.tagName === 'DIV' && !n.dataset.k) { const p = document.createElement('p'); p.className = 'blk'; while (n.firstChild) p.append(n.firstChild); n.replaceWith(p); }
        else if (n.nodeType === 1) n.classList.add('blk');
      }
      if (!root.firstChild) root.innerHTML = '<p class="blk"><br></p>';
    }
    function commit() {
      clearTimeout(t); if (locked || isRO(d)) return;
      normalize();
      const md = blocksMd(root) + '\n';
      if (md.trim() !== d.body.trim()) { d.body = md.trim() ? md : ''; touch(d); if (o.onChange) o.onChange(); }
    }
    const soon = () => { clearTimeout(t); t = setTimeout(commit, 350); };
    // rebuild from Markdown after a change in structure, and put the caret back in the n-th section
    function reflow(md, focusAt) {
      d.body = md.trim() ? md.replace(/\n{3,}/g, '\n\n').trim() + '\n' : ''; touch(d); render();
      if (focusAt !== undefined) { const b = tops()[Math.max(0, Math.min(tops().length - 1, focusAt))]; if (b) placeEnd(b); }
      if (o.onChange) o.onChange();
    }
    const allMd = () => tops().map(blockMd);
    const joinMd = parts => parts.filter(x => x && x.trim()).join('\n\n');

    /* ---------- the caret ---------- */
    function placeEnd(el) {
      const target = el.querySelector('.cb') ? el.querySelector('.cb').lastElementChild || el : el;
      const r = document.createRange(); r.selectNodeContents(target); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); root.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' });
    }
    function caretBlock() { const s = getSelection(); if (!s.rangeCount || !root.contains(s.anchorNode)) return null; return top(s.anchorNode); }
    function blockAt(n) { const b = n && n.nodeType === 1 ? n.closest('.vis > *') : n && n.parentElement && n.parentElement.closest('.vis > *'); return b && b.parentNode === root ? b : null; }
    function showGutter(b) {
      cur = b; if (!b || locked || isRO(d)) { gutter.hidden = true; return; }
      gutter.hidden = false; gutter.style.top = (b.offsetTop + (/^H/.test(b.tagName) ? 6 : 1)) + 'px';
    }

    /* ---------- typing ---------- */
    root.addEventListener('input', e => {
      root.classList.remove('empty'); soon(); const b = caretBlock(); showGutter(b);
      if (b) { shortcuts(b, e); suggestSoon(b); linkAC(); }
    });
    root.addEventListener('blur', () => { setTimeout(() => { if (!wrap.contains(document.activeElement)) { commit(); bar.hidden = true; } }, 120); });
    root.addEventListener('mousemove', e => { if (locked) return; const b = blockAt(e.target); if (b && b !== cur && !document.activeElement.closest('.vbar')) showGutter(b); });
    document.addEventListener('selectionchange', onSel);
    function onSel() {
      if (!root.isConnected) { document.removeEventListener('selectionchange', onSel); return; }
      const s = getSelection(); if (!s.rangeCount || !root.contains(s.anchorNode)) { if (!bar.contains(document.activeElement)) bar.hidden = true; return; }
      const b = caretBlock(); if (b) showGutter(b);
      if (s.isCollapsed) { bar.hidden = true; return; }
      selectionBar(s.getRangeAt(0));
    }
    // Markdown habits still work: "## " makes a heading, "- " a list, "[] " a box to tick, "> " a quote, "---" a line
    function shortcuts(b, e) {
      if (b.tagName !== 'P' || (e && e.inputType && !/insertText/.test(e.inputType))) return;
      const txt = b.textContent;
      const m = /^(#{1,3}|[-*]|1\.|\[\s?\]|>)\s$/.exec(txt.replace(/ /g, ' ')) || (txt === '---' ? ['---', '---'] : null);
      if (!m) return;
      const i = tops().indexOf(b), parts = allMd(), k = m[1];
      parts[i] = k[0] === '#' ? k + ' ​' : k === '-' || k === '*' ? '- ​' : k === '1.' ? '1. ​' : k[0] === '[' ? '- [ ] ​' : k === '>' ? '> [!quote] ' : '---';
      if (k === '---') parts.splice(i + 1, 0, '');
      reflow(joinMd(parts) + (k === '---' && i === parts.length - 2 ? '\n\n​' : ''), k === '---' ? i + 1 : i);
    }
    root.addEventListener('keydown', e => {
      if (acKey(e)) return;
      if (e.key === 'Escape') { bar.hidden = true; sugg.hidden = true; return; }
      if (locked) return;
      const b = caretBlock(), s = getSelection();
      const c = e.ctrlKey || e.metaKey;
      if (c && !e.shiftKey && ['b', 'i'].includes(e.key.toLowerCase())) { e.preventDefault(); document.execCommand(e.key.toLowerCase() === 'b' ? 'bold' : 'italic'); soon(); return; }
      if (c && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); linkSelection(); return; }
      if (e.key === 'Tab' && s.anchorNode && s.anchorNode.parentElement && s.anchorNode.parentElement.closest('li')) { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); soon(); return; }
      if (e.key !== 'Enter' || e.shiftKey || c) return;
      // in a box's title: on to its body
      const ttl = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('.ctt');
      if (ttl) { e.preventDefault(); const cb = ttl.closest('.callout').querySelector('.cb'); const p = cb.firstElementChild || cb.appendChild(h('p', {}, h('br'))); const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); s.removeAllRanges(); s.addRange(r); return; }
      // a heading ends with a paragraph after it
      if (b && /^H\d$/.test(b.tagName) && atEnd(b)) { e.preventDefault(); const p = h('p', { class: 'blk' }, h('br')); b.after(p); const r = document.createRange(); r.setStart(p, 0); s.removeAllRanges(); s.addRange(r); soon(); return; }
      // an empty line in a box leaves the box
      const inBox = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('.callout .cb > p');
      if (inBox && !inBox.textContent.trim() && !inBox.nextElementSibling) { e.preventDefault(); const box = inBox.closest('.callout'); if (inBox.previousElementSibling) inBox.remove(); const p = h('p', { class: 'blk' }, h('br')); box.after(p); const r = document.createRange(); r.setStart(p, 0); s.removeAllRanges(); s.addRange(r); soon(); return; }
      // "/" on an empty line opens what can be added
    });
    const atEnd = el => { const s = getSelection(), r = document.createRange(); r.selectNodeContents(el); r.setStart(s.anchorNode, s.anchorOffset); return !r.toString().length; };
    root.addEventListener('paste', e => {
      if (locked) return;
      const files = [...(e.clipboardData.files || [])].filter(f => f.type.startsWith('image/'));
      e.preventDefault();
      if (files.length) { (async () => { for (const f of files) { const name = await STORE.putImage(cid(), f, f.name || 'pasted.png'); insertBlockMd(`![](img:${name})`); } })(); return; }
      const txt = e.clipboardData.getData('text/plain'); if (!txt) return;
      // a few lines of text are pasted as they are; Markdown with paragraphs becomes sections
      if (/\n\s*\n|^\s*(#{1,6}\s|[-*]\s|>\s|\d+\.\s)/m.test(txt)) insertBlockMd(txt.trim()); else document.execCommand('insertText', false, txt);
    });
    root.addEventListener('drop', e => {
      if (locked) return;
      const id = e.dataTransfer.getData('text/x-cn-doc');
      if (id && D(id)) { e.preventDefault(); placeAtPoint(e.clientX, e.clientY); insertInline(`[[${D(id).title}]]`); return; }
      const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); placeAtPoint(e.clientX, e.clientY); STORE.putImage(cid(), f, f.name).then(n => insertBlockMd(`![](img:${n})`)); }
    });
    const placeAtPoint = (x, y) => { const r = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y); if (r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); } };

    /* ---------- clicks: links, boxes, dice, cues ---------- */
    root.addEventListener('click', e => {
      const box = e.target.closest('input[type=checkbox]');
      if (box && root.contains(box)) {
        if (locked || isRO(d)) { if (isRO(d)) { e.preventDefault(); return; } d.body = MD.toggleTask(d.body, +box.dataset.line, box.checked); touch(d, true); }
        else soon();
        box.closest('li').classList.toggle('done', box.checked); return;
      }
      const a = e.target.closest('a,button'); if (a && root.contains(a)) readerClick(e, d);
    });
    root.addEventListener('dblclick', e => { if ((locked || isRO(d)) && !e.target.closest('a,button,input')) { if (!isRO(d)) toast('This document is locked. Unlock it (the lock above) to write.'); } });

    /* ---------- adding things ---------- */
    const INSERTS = [
      { head: 'Into this line' },
      { label: 'Link to a document', icon: 'link', inline: true, run: () => pickDocInto() },
      { label: 'Dice button', icon: 'dice', inline: true, run: () => insertInline('[[roll:1d20]]') },
      { label: 'Sound cue', icon: 'music', inline: true, run: a => VIEWS.soundPicker(a, s => insertInline(s)) },
      { head: 'As the next section' },
      { label: 'Alternative path', icon: 'branch', md: '> [!branch] If the party \n> - ' }, { label: 'Read-aloud text', icon: 'speech', md: '> [!read] \n> ' },
      { label: 'GM secret', icon: 'eye-off', md: '> [!secret] \n> ' }, { label: 'Clue', icon: 'key', md: '> [!clue] \n> ' },
      { label: 'Encounter builder…', icon: 'swords', run: () => PLAN.encounter(t => insertBlockMd(t.trim())) }, { label: 'Encounter (empty)', icon: 'swords', md: '> [!combat] \n> - ' },
      { label: 'Treasure', icon: 'gem', md: '> [!loot] \n> - ' }, { label: 'Scene', icon: 'clapper', md: '### Scene: ' }, { label: 'Open question', icon: 'help', md: '> [!question] \n> ' },
      { label: 'Heading', icon: 'heading', md: '## ​' }, { label: 'Checklist', icon: 'tasks', md: '- [ ] ​' }, { label: 'List', icon: 'list', md: '- ​' },
      { label: 'Table', icon: 'table2', md: '| Column | Column |\n| --- | --- |\n|  |  |' }, { label: 'Random table', icon: 'dice', md: PLAN.TABLE_SNIP.trim() },
      { label: 'Picture…', icon: 'image', run: async () => { const f = await pickImage(); if (f) insertBlockMd(`![](img:${f})`); } }, { label: 'Divider', icon: 'minus', md: '---' }
    ];
    function insertMenu(at) {
      const b = cur || caretBlock() || root.lastChild; cur = b;
      menu(INSERTS.map(it => it.head ? it : { label: it.label, icon: it.icon, fn: () => { if (!caretBlock() && b) placeEnd(b); it.run ? it.run(at) : insertBlockMd(it.md); } }), at);
    }
    // a section after the one the caret is on (or in its place, when that one is empty)
    function insertBlockMd(md) {
      commit();
      const b = caretBlock() || cur, list = tops(), i = b ? list.indexOf(b) : list.length - 1, parts = allMd();
      const empty = b && !b.textContent.trim() && !b.querySelector('img,input,.atom');
      if (empty) parts[i] = md; else parts.splice(i + 1, 0, md);
      reflow(joinMd(parts), empty ? i : i + 1);
      const nb = tops()[empty ? i : i + 1];
      if (nb) { const t2 = nb.querySelector('.ctt') || nb; const r = document.createRange(); r.selectNodeContents(t2); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
    // something within the line: at the caret, or at the end of the section
    function insertInline(md) {
      if (!caretBlock() && cur) placeEnd(cur);
      const html = MD.inline(md, ctx(true)) + ' ';
      root.focus(); document.execCommand('insertHTML', false, html); commit();
    }
    function pickDocInto() {
      const s = getSelection(), r = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      pickDoc(r ? r.getBoundingClientRect() : root.getBoundingClientRect(), '', d.id).then(x => { if (!x) return; if (r) { s.removeAllRanges(); s.addRange(r); } insertInline(`[[${x.title}]]`); });
    }

    /* ---------- sections: drag, menu ---------- */
    const grip = gutter.querySelector('.vgrip'); let dragged = null;
    grip.addEventListener('dragstart', e => { if (!cur) return; dragged = cur; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-cn-block', '1'); e.dataTransfer.setDragImage(cur, 10, 10); cur.classList.add('dragging'); });
    grip.addEventListener('dragend', () => { if (dragged) dragged.classList.remove('dragging'); dragged = null; drop.hidden = true; });
    root.addEventListener('dragover', e => {
      if (!dragged) return; e.preventDefault();
      const b = blockAt(document.elementFromPoint(e.clientX, e.clientY)) || root.lastChild; if (!b) return;
      const r = b.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      drop.hidden = false; drop.style.top = (after ? b.offsetTop + b.offsetHeight + 2 : b.offsetTop - 4) + 'px'; drop.dataset.at = tops().indexOf(b) + (after ? 1 : 0);
    });
    root.addEventListener('drop', e => {
      if (!dragged) return; e.preventDefault(); e.stopPropagation();
      commit(); const parts = allMd(), from = tops().indexOf(dragged); let to = +drop.dataset.at;
      const [m] = parts.splice(from, 1); if (to > from) to--; parts.splice(to, 0, m);
      dragged = null; drop.hidden = true; reflow(joinMd(parts), to);
    }, true);
    // the section's menu, also for the keyboard: move, turn into, send, remove
    function sectionMenu(b, at) {
      if (!b) return; commit();
      const i = tops().indexOf(b), md = blockMd(b), move = dir => { const p = allMd(); const j = i + dir; if (j < 0 || j >= p.length) return; [p[i], p[j]] = [p[j], p[i]]; reflow(joinMd(p), j); };
      menu([{ head: 'This section' },
        ...sendItems(() => md),
        '-',
        { label: 'Move up', icon: 'back', disabled: i <= 0, fn: () => move(-1) }, { label: 'Move down', icon: 'fwd', disabled: i >= tops().length - 1, fn: () => move(1) },
        { head: 'Turn it into' }, ...MAKE.map(([k, l, ic]) => ({ label: l, icon: ic, fn: () => { const p = allMd(); p[i] = turnInto(k, md); reflow(joinMd(p), i); } })),
        '-',
        { label: 'Duplicate', icon: 'copy', fn: () => { const p = allMd(); p.splice(i + 1, 0, md); reflow(joinMd(p), i + 1); } },
        { label: 'Remove the section', icon: 'trash', cls: 'bad', fn: () => { const p = allMd(); p.splice(i, 1); reflow(joinMd(p), i - 1); toast('Section removed.', { label: 'Undo', fn: () => { const q = allMd(); q.splice(i, 0, md); reflow(joinMd(q), i); } }); } }], at);
    }

    /* ---------- make it…: what selected text can become ---------- */
    const MAKE = [['combat', 'An encounter', 'swords'], ['branch', 'An alternative path', 'branch'], ['read', 'Read-aloud text', 'speech'], ['secret', 'A GM secret', 'eye-off'], ['clue', 'A clue', 'key'], ['loot', 'Treasure', 'gem'], ['question', 'An open question', 'help'], ['h', 'A heading', 'heading'], ['task', 'A checklist', 'tasks'], ['p', 'Plain text', 'note']];
    function turnInto(k, md) {
      const plain = md.replace(/^>\s?\[![^\]]*\][-+]?\s*/gm, '').replace(/^>\s?/gm, '').replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm, '').trim();
      if (k === 'p') return plain;
      if (k === 'h') return '## ' + plain.replace(/\n+/g, ' ');
      if (k === 'task') return plain.split('\n').filter(Boolean).map(l => '- [ ] ' + l).join('\n');
      const lines = plain.split('\n'), short = lines.length === 1 && plain.length <= 90;
      // one short line is the box's title; more becomes what's in it
      return short ? `> [!${k}] ${plain}\n> ` : `> [!${k}]\n` + lines.map(l => '> ' + l).join('\n');
    }
    function makeIt(k) {
      const s = getSelection(); if (!s.rangeCount) return; const r = s.getRangeAt(0); commit();
      const list = tops(), a = top(r.startContainer), z = top(r.endContainer); if (!a || !z) return;
      const i = list.indexOf(a), j = list.indexOf(z), parts = allMd();
      if (i === j && a.tagName === 'P') {
        // part of one paragraph: what's before and after stays a paragraph around it
        const pre = document.createRange(); pre.setStart(a, 0); pre.setEnd(r.startContainer, r.startOffset);
        const post = document.createRange(); post.setStart(r.endContainer, r.endOffset); post.setEnd(a, a.childNodes.length);
        const frag = x => { const dv = document.createElement('div'); dv.append(x.cloneContents()); return inl(dv).trim(); };
        parts.splice(i, 1, frag(pre), turnInto(k, frag(r)), frag(post));
        reflow(joinMd(parts), frag(pre) ? i + 1 : i);
      } else { const md = parts.slice(i, j + 1).join('\n\n'); parts.splice(i, j - i + 1, turnInto(k, md)); reflow(joinMd(parts), i); }
      bar.hidden = true;
    }

    /* ---------- the bar over selected text ---------- */
    function selectionBar(r) {
      const rect = r.getBoundingClientRect(), w = wrap.getBoundingClientRect(); if (!rect.width && !rect.height) return;
      const b = (ic, title, fn) => h('button', { type: 'button', class: 'ib', title, 'aria-label': title, html: icon(ic), onmousedown: e => e.preventDefault(), onclick: e => fn(e.currentTarget) });
      bar.replaceChildren(...(locked || isRO(d)
        ? [b('send', 'Send to the table chat', () => sendSel('chat')), b('users', 'Whisper it…', a => whisperMenu(a, () => selMd())), b('copy', 'Copy', () => copySel())]
        : [b('bold', 'Bold (Ctrl+B)', () => { document.execCommand('bold'); soon(); }), b('italic', 'Italic (Ctrl+I)', () => { document.execCommand('italic'); soon(); }),
          b('hl', 'Highlight', () => { wrapSel('mark'); }), b('link', 'Link to a document (Ctrl+K)', () => linkSelection()), h('span', { class: 'esep' }),
          h('button', { type: 'button', class: 'btn tiny ghost', onmousedown: e => e.preventDefault(), onclick: e => makeMenu(e.currentTarget) }, h('span', { text: 'Make it…' })),
          h('span', { class: 'esep' }), b('send', 'Send to the table chat', () => sendSel('chat'))]));
      bar.hidden = false;
      bar.style.left = Math.max(0, Math.min(w.width - bar.offsetWidth, rect.left - w.left + rect.width / 2 - bar.offsetWidth / 2)) + 'px';
      bar.style.top = (rect.top - w.top - bar.offsetHeight - 8 < 0 ? rect.bottom - w.top + 8 : rect.top - w.top - bar.offsetHeight - 8) + 'px';
    }
    function wrapSel(tag) { const s = getSelection(); if (!s.rangeCount) return; const r = s.getRangeAt(0), m = document.createElement(tag); try { r.surroundContents(m); } catch { m.append(r.extractContents()); r.insertNode(m); } commit(); }
    function makeMenu(at) { menu([{ head: 'Make it' }, ...MAKE.map(([k, l, ic]) => ({ label: l, icon: ic, fn: () => makeIt(k) }))], at); }
    const selMd = () => { const s = getSelection(); if (!s.rangeCount) return ''; const dv = document.createElement('div'); dv.append(s.getRangeAt(0).cloneContents()); return [...dv.childNodes].some(n => n.nodeType === 1 && /^(P|H\d|UL|OL|DIV|BLOCKQUOTE|PRE)$/.test(n.tagName)) ? blocksMd(dv) : inl(dv).trim(); };
    function copySel() { navigator.clipboard.writeText(getSelection().toString()).then(() => toast('Copied.')); }
    function sendSel(how) { const md = selMd(); if (md) VIEWS.say(md, how === 'chat' ? null : how); bar.hidden = true; }
    function sendItems(getMd) {
      return [{ label: 'Send to the table chat', icon: 'send', disabled: !TABLE.on(), fn: () => VIEWS.say(getMd()) },
        { label: 'Whisper it to…', icon: 'users', disabled: !TABLE.on() || !TABLE.players().length, fn: () => whisperMenu(null, getMd) }];
    }
    function whisperMenu(at, getMd) { const md = getMd(); menu([{ head: 'Whisper to' }, ...TABLE.players().map(p => ({ label: p.name, icon: 'character', fn: () => VIEWS.say(md, p.id) }))], at || { x: innerWidth / 2 - 80, y: innerHeight / 3 }); }

    /* ---------- links: from selected text, broken again, and suggested ---------- */
    function linkSelection() {
      const s = getSelection(); if (!s.rangeCount || s.isCollapsed) { pickDocInto(); return; }
      const r = s.getRangeAt(0).cloneRange(), text = s.toString().trim();
      pickDoc(r.getBoundingClientRect(), text, d.id).then(x => {
        if (!x) return; s.removeAllRanges(); s.addRange(r);
        const md = x.title.toLowerCase() === text.toLowerCase() ? `[[${x.title}]]` : `[[${x.title}|${text}]]`;
        document.execCommand('insertHTML', false, MD.inline(md, ctx(true))); commit(); bar.hidden = true;
      });
    }
    function unlink(a) { const li = MD.linkInfo(a.dataset.md.replace(/^\[\[|\]\]$/g, '')); a.replaceWith(document.createTextNode(li.label || li.title || li.ref || '')); commit(); }
    // a name of another document, typed without a link: offer to link it
    const suggestSoon = debounce(b => suggest(b), 700);
    function suggest(b) {
      if (locked || !b || !b.isConnected || A.prefs.suggest === false) { sugg.hidden = true; return; }
      d.noLink = d.noLink || [];
      const names = [...A.idx.title.entries()].filter(([k, id]) => id !== d.id && k.length >= 3 && !d.noLink.includes(k)).sort((x, y) => y[0].length - x[0].length);
      const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement.closest('.atom,code,.ch') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const low = n.nodeValue.toLowerCase();
        for (const [k, id] of names) {
          let at = low.indexOf(k);
          while (at >= 0 && (/[\p{L}\p{N}]/u.test(low[at - 1] || ' ') || /[\p{L}\p{N}]/u.test(low[at + k.length] || ' '))) at = low.indexOf(k, at + 1);
          if (at < 0) continue;
          const r = document.createRange(); r.setStart(n, at); r.setEnd(n, at + k.length);
          const rect = r.getBoundingClientRect(), w = wrap.getBoundingClientRect(), doc = D(id), text = n.nodeValue.slice(at, at + k.length);
          sugg.replaceChildren(h('span', { html: icon(TYPES[doc.type].icon), style: `color:${typeColor(doc)}` }), h('span', {}, 'Link ', h('b', { text: '“' + text + '”' }), '?'),
            h('button', { type: 'button', class: 'btn tiny primary', text: 'Link', onmousedown: e => e.preventDefault(), onclick: () => { const s = getSelection(), keep = s.rangeCount ? s.getRangeAt(0) : null; r.deleteContents(); const span = document.createElement('span'); span.innerHTML = MD.inline(text === doc.title ? `[[${doc.title}]]` : `[[${doc.title}|${text}]]`, ctx(true)); r.insertNode(span.firstChild); sugg.hidden = true; commit(); if (keep) { s.removeAllRanges(); s.addRange(keep); } } }),
            h('button', { type: 'button', class: 'ib tiny', title: 'Not this one', 'aria-label': `Don't link ${text} here`, html: icon('x'), onmousedown: e => e.preventDefault(), onclick: () => { d.noLink.push(k); touch(d, true); sugg.hidden = true; } }));
          sugg.hidden = false; sugg.style.left = Math.max(0, rect.left - w.left) + 'px'; sugg.style.top = (rect.bottom - w.top + 6) + 'px';
          return;
        }
      }
      sugg.hidden = true;
    }

    /* ---------- [[ and / while writing ---------- */
    let AC2 = null; const list = $('#ac');
    function linkAC() {
      const s = getSelection(); if (!s.isCollapsed || !s.anchorNode || s.anchorNode.nodeType !== 3) return closeAC();
      const before = s.anchorNode.nodeValue.slice(0, s.anchorOffset), k = before.lastIndexOf('[['), sl = /^\/([\w' ]{0,20})$/.exec(before.trim() === before.trimStart() ? before : '');
      const blk = top(s.anchorNode);
      if (k >= 0 && !before.slice(k).includes(']]')) return openAC('link', s.anchorNode, k, before.slice(k + 2));
      if (sl && blk && blk.tagName === 'P' && blk.textContent.trim() === before.trim()) return openAC('slash', s.anchorNode, before.indexOf('/'), sl[1]);
      closeAC();
    }
    async function openAC(kind, node, start, q) {
      const tok = AC2 = { kind, node, start, q, items: [], sel: 0 };
      let items;
      if (kind === 'slash') items = INSERTS.filter(x => !x.head && (!q || x.label.toLowerCase().includes(q.toLowerCase()))).map(x => ({ label: x.label, ic: x.icon, it: x }));
      else items = await linkItems(d, q);
      if (AC2 !== tok) return;
      tok.items = items; if (!items.length) return closeAC();
      list.replaceChildren(...items.map((it, i) => h('div', { class: 'aci' + (i === 0 ? ' on' : ''), id: 'ac-' + i, role: 'option', 'aria-selected': String(i === 0), onmousedown: e => { e.preventDefault(); pickAC(i); } },
        h('span', { class: 'aic', html: icon(it.ic), style: it.color ? `color:${it.color}` : '' }), h('span', { class: 'acl', text: it.label }), it.sub ? h('span', { class: 'acs', text: it.sub }) : null)));
      list.hidden = false; root.setAttribute('aria-activedescendant', 'ac-0');
      const r = document.createRange(); r.setStart(node, start); r.setEnd(node, Math.min(node.nodeValue.length, start + 1)); const rc = r.getBoundingClientRect();
      list.style.left = Math.max(8, Math.min(innerWidth - list.offsetWidth - 8, rc.left)) + 'px'; list.style.top = (rc.bottom + list.offsetHeight + 8 < innerHeight ? rc.bottom + 4 : rc.top - list.offsetHeight - 4) + 'px';
    }
    function closeAC() { if (AC2) { AC2 = null; list.hidden = true; root.removeAttribute('aria-activedescendant'); } }
    function acKey(e) {
      if (!AC2 || list.hidden) return false; const n = AC2.items.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); AC2.sel = (AC2.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; $$('#ac .aci').forEach((x, i) => { x.classList.toggle('on', i === AC2.sel); x.setAttribute('aria-selected', String(i === AC2.sel)); }); root.setAttribute('aria-activedescendant', 'ac-' + AC2.sel); return true; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickAC(AC2.sel); return true; }
      if (e.key === 'Escape') { e.preventDefault(); closeAC(); return true; }
      return false;
    }
    function pickAC(i) {
      const a = AC2, it = a && a.items[i]; if (!it) return; closeAC();
      const s = getSelection(), r = document.createRange(), end = s.anchorNode === a.node ? s.anchorOffset : a.node.nodeValue.length;
      const after = a.node.nodeValue.slice(end, end + 2) === ']]' ? 2 : 0;
      r.setStart(a.node, a.start); r.setEnd(a.node, end + after); s.removeAllRanges(); s.addRange(r);
      if (a.kind === 'link') { document.execCommand('insertHTML', false, MD.inline(it.ins, ctx(true)) + ' '); commit(); }
      else { document.execCommand('delete'); it.it.run ? it.it.run(root) : insertBlockMd(it.it.md); }
    }

    /* ---------- right-click ---------- */
    root.addEventListener('contextmenu', e => {
      const s = getSelection(), a = e.target.closest('.atom[data-md^="[["]'), b = blockAt(e.target);
      const hasSel = s.rangeCount && !s.isCollapsed && root.contains(s.anchorNode);
      const items = [];
      if (a) {
        const li = MD.linkInfo(a.dataset.md.slice(2, -2)), tid = li.kind === 'doc' && resolve(li.title);
        if (tid) items.push({ label: 'Open ' + D(tid).title, icon: 'open', fn: () => openDoc(tid) });
        if (!locked && !isRO(d)) items.push({ label: 'Remove the link (keep the words)', icon: 'x', fn: () => unlink(a) }, { label: 'Link it to another document…', icon: 'link', fn: () => { const r = document.createRange(); r.selectNode(a); s.removeAllRanges(); s.addRange(r); linkSelection(); } });
        items.push('-');
      }
      if (hasSel) {
        const spans = new Set(); const r = s.getRangeAt(0); let n = top(r.startContainer); const z = top(r.endContainer); while (n) { spans.add(n); if (n === z) break; n = n.nextSibling; }
        if (!locked && !isRO(d)) { items.push({ label: 'Link to a document…', icon: 'link', fn: () => linkSelection() }, { head: 'Make it' }, ...MAKE.slice(0, 7).map(([k, l, ic]) => ({ label: l, icon: ic, fn: () => makeIt(k) })), '-'); }
        const md = selMd();
        items.push(...sendItems(() => md).map(x => ({ ...x, label: x.label.replace('Send', spans.size > 1 ? `Send ${spans.size} sections` : 'Send') })), { label: 'Copy', icon: 'copy', fn: () => navigator.clipboard.writeText(s.toString()) });
      } else if (b) {
        const md = blockMd(b);
        items.push(...sendItems(() => md).map(x => ({ ...x, label: x.label.replace('Send', 'Send this section').replace('Whisper it', 'Whisper this section') })));
        if (!locked && !isRO(d)) items.push('-', { label: 'Add below…', icon: 'plus', fn: () => { cur = b; placeEnd(b); insertMenu({ x: e.clientX, y: e.clientY }); } }, { label: 'Section menu…', icon: 'dots', fn: () => sectionMenu(b, { x: e.clientX, y: e.clientY }) });
      }
      if (!items.filter(x => x !== '-').length) return;
      e.preventDefault(); menu(items.filter((x, i, l) => !(x === '-' && (i === 0 || l[i - 1] === '-' || i === l.length - 1))), { x: e.clientX, y: e.clientY });
    });

    function setLocked(v) { commit(); locked = v; wrap.classList.toggle('locked', v); bar.hidden = sugg.hidden = gutter.hidden = true; render(); }
    return { root, setLocked, commit, render, insertBlockMd, focus: () => { const b = root.lastElementChild; if (b) placeEnd(b); } };
  }

  // the link suggestions: documents (and the shared world's), the table's Library, Critter Sounds, the SRD
  async function linkItems(d, q) {
    const items = [], ql = q.toLowerCase().trim(), mode = /^(table|srd|sound|roll):/i.exec(q);
    if (!mode) {
      const docs = [...A.docs.values(), ...A.wdocs.values()].filter(x => x.id !== d.id && (!ql || x.title.toLowerCase().includes(ql))).sort((a, b) => (a.title.toLowerCase().startsWith(ql) ? 0 : 1) - (b.title.toLowerCase().startsWith(ql) ? 0 : 1) || b.updated - a.updated).slice(0, 7);
      items.push(...docs.map(x => ({ label: x.title, ic: TYPES[x.type].icon, color: typeColor(x), sub: (isRO(x) ? A.wname + ' · ' : '') + TYPES[x.type].name, ins: `[[${x.title}]]` })));
      if (ql && !resolve(q)) items.push({ label: `New: ${q.trim()}`, ic: 'plus', sub: 'A document to write later', ins: `[[${q.trim()}]]` });
    }
    const qq = mode ? q.slice(mode[0].length).toLowerCase().trim() : ql;
    if (TABLE.on() && (!mode || mode[1].toLowerCase() === 'table') && qq) items.push(...[...TABLE.T.ents.values()].filter(e => String(e.name || '').toLowerCase().includes(qq)).slice(0, 5).map(e => ({ label: e.name, ic: 'table', sub: `Table · ${e.kind}`, ins: `[[table:${e.id}|${e.name}]]` })));
    const sc = TABLE.T.sounds;
    if (sc && (!mode || mode[1].toLowerCase() === 'sound') && qq) for (const [k, l] of [['scene', 'scenes'], ['playlist', 'playlists'], ['pad', 'pads'], ['scape', 'scapes']]) items.push(...(sc[l] || []).filter(x => String(x.name).toLowerCase().includes(qq)).slice(0, 3).map(x => ({ label: x.name, ic: 'music', sub: 'Critter Sounds · ' + VIEWS.SOUND_KIND[k], ins: `[[sound:${k}/${x.id}|${x.name}]]` })));
    if (mode && mode[1].toLowerCase() === 'roll') items.push({ label: 'Roll ' + (qq || '1d20'), ic: 'dice', ins: `[[roll:${qq || '1d20'}]]` });
    if ((!mode || mode[1].toLowerCase() === 'srd') && qq.length >= 2) items.push(...(await SRD.search(campSys(), qq, 6)).map(x => ({ label: x.n, ic: x.kind === 'npc' ? 'character' : x.kind === 'item' ? 'item' : 'lore', sub: `SRD · ${x.c || SRD.KINDS[x.kind]}`, ins: `[[srd:${SRD.refOf(x)}|${x.n}]]` })));
    return items;
  }

  /* ---------- picking a document: a small search box, for links, pins and cards ---------- */
  // resolves { id, title } (a new document is made when asked for), or null
  function pickDoc(rect, q, except, o = {}) {
    return new Promise(res => {
      document.querySelectorAll('.dpick').forEach(x => x.remove());
      const inp = h('input', { type: 'search', value: q || '', placeholder: o.placeholder || 'Find a document, or name a new one', 'aria-label': 'Find a document' });
      const out = h('div', { class: 'dplist', role: 'listbox', 'aria-label': 'Documents' });
      const box = h('div', { class: 'dpick', role: 'dialog', 'aria-label': o.title || 'Link to a document' }, inp, out);
      let rows = [], sel = 0, done = false;
      const fin = v => { if (done) return; done = true; box.remove(); document.removeEventListener('pointerdown', away, true); res(v); };
      const away = e => { if (!box.contains(e.target)) fin(null); };
      const draw = () => {
        const v = inp.value.trim(), ql = v.toLowerCase();
        rows = [...A.docs.values(), ...A.wdocs.values()].filter(x => x.id !== except && (!ql || x.title.toLowerCase().includes(ql))).sort((a, b) => (a.title.toLowerCase().startsWith(ql) ? 0 : 1) - (b.title.toLowerCase().startsWith(ql) ? 0 : 1) || b.updated - a.updated).slice(0, 8).map(x => ({ id: x.id, title: x.title, doc: x }));
        if (v && !resolve(v)) for (const t of o.types || ['character', 'location', 'faction', 'item', 'note']) rows.push({ make: t, title: v });
        sel = Math.min(sel, rows.length - 1);
        out.replaceChildren(...rows.map((r, i) => h('div', { class: 'aci' + (i === sel ? ' on' : ''), role: 'option', 'aria-selected': String(i === sel), onmousedown: ev => { ev.preventDefault(); pick(i); } },
          h('span', { class: 'aic', html: icon(r.doc ? TYPES[r.doc.type].icon : 'plus'), style: r.doc ? `color:${typeColor(r.doc)}` : '' }),
          h('span', { class: 'acl', text: r.doc ? r.title : `New ${TYPES[r.make].name.toLowerCase()}: ${r.title}` }), r.doc ? h('span', { class: 'acs', text: TYPES[r.doc.type].name }) : null)));
        if (!rows.length) out.append(h('p', { class: 'hint', text: 'Type a name.' }));
      };
      const pick = i => { const r = rows[i]; if (!r) return; if (r.make) { const x = newDoc({ type: r.make, title: r.title }); renderSide(); fin({ id: x.id, title: x.title, made: true }); } else fin({ id: r.id, title: r.title }); };
      inp.addEventListener('input', () => { sel = 0; draw(); });
      inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % Math.max(1, rows.length); draw(); } if (e.key === 'Enter') { e.preventDefault(); pick(sel); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(null); } });
      document.body.append(box); draw();
      const x = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, rect.left || rect.x || innerWidth / 2 - 160)), y = (rect.bottom || rect.y || innerHeight / 3) + 6;
      box.style.left = x + 'px'; box.style.top = Math.min(innerHeight - box.offsetHeight - 8, y) + 'px';
      setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
      inp.focus(); inp.select();
    });
  }
  return { mount, pickDoc, blocksMd, linkItems };
})();
