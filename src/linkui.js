/* The device link's screens: Settings › Your devices, linking a device (the computer's side, with its code and the
   requests that come in), and linking to a computer (the phone's side: nearby computers, or a code). */
'use strict';
const LINKUI = (() => {
  const ago = t => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString(); };

  // Settings › Your devices
  function settingsSection(sec, row) {
    if (!A.camp || SYNC.isPlayer()) return null;
    if (!LINK.linked()) return sec('Your devices',
      row('Link a phone, tablet or browser', 'This campaign on your other devices, kept in step both ways: what you add or remove on one, the others do too. End-to-end encrypted: the Homebase only carries it, it can\'t read it. On the same Wi-Fi the other device finds this one by itself.', btn('link', 'Link a device…', () => offerDialog(), 'tiny primary')),
      row('This device', LINK.deviceName(), btn('edit', 'Rename…', () => renameDevice(), 'tiny ghost')));
    const L = LINK.L, list = h('div', { class: 'devlist' }, h('p', { class: 'hint', text: 'Looking…' }));
    LINK.devices().then(ds => list.replaceChildren(...(ds.length ? ds : [{ n: LINK.deviceName(), here: true }]).map(d => h('div', { class: 'devrow' + (d.here || d.live ? ' live' : '') },
      h('span', { class: 'dot', 'aria-hidden': 'true' }), h('b', { text: d.n || 'A device' }),
      h('small', { text: d.here ? 'this device' : d.live ? 'here now' : 'last seen ' + ago(d.seen) }))))).catch(() => list.replaceChildren(h('p', { class: 'hint', text: 'Offline: the list comes back with the connection.' })));
    const state = h('span', { text: L.status === 'ok' ? `In step. Checked ${ago(L.checked)}.` : L.status === 'offline' ? 'Offline: changes are kept here and go out when the connection is back.' : 'Checking…' });
    return sec('Your devices',
      h('div', { class: 'setrow' }, h('div', { class: 'sl' }, h('b', { text: 'Linked' }), state), h('div', { class: 'sc' },
        btn('refresh', 'Sync check', async e => { const b = e.currentTarget; b.disabled = true; const r = await LINK.check(); b.disabled = false; toast(r.ok ? `All ${plural(r.docs, 'document')} match on this device and the link.` : r.why || `${plural(r.differ, 'document')} differed and ${r.differ === 1 ? 'is' : 'are'} being brought in step.`); renderMain(); }, 'tiny'),
        btn('link', 'Link another…', () => offerDialog(), 'tiny ghost'))),
      h('div', { class: 'setrow' }, h('div', { class: 'sl' }, h('b', { text: 'Devices' }), list)),
      row('This device', LINK.deviceName(), btn('edit', 'Rename…', () => renameDevice(), 'tiny ghost'), btn(null, 'Unlink this device', async () => { if (await confirmBox('Unlink this device?', 'The campaign stays here as it is now, but stops keeping in step with your other devices.', 'Unlink')) { await LINK.unlinkHere(); renderMain(); toast('This device is unlinked.'); } }, 'tiny ghost')),
      row('A device lost or given away?', 'Remove the link everywhere: the Homebase forgets it, every device keeps its own copy, unlinked. Then link the devices you keep again (with a new key).', btn('trash', 'Remove the link…', async () => { if (await confirmBox('Remove the link everywhere?', 'Every device keeps its own copy of the campaign, but they stop keeping in step. Link them again afterwards with a new key.', 'Remove it', true)) { await LINK.wipe(); renderMain(); toast('The link is removed. Link your devices again when you like.'); } }, 'tiny ghost bad')));
  }
  async function renameDevice() { const n = await ask('What should this device be called?', LINK.deviceName(), { ok: 'Rename' }); if (n) { LINK.rename(n); renderMain(); } }

  // the computer's side: a code, the network, and the requests to approve
  async function offerDialog() {
    const body = h('div', { class: 'linkoffer' }, h('p', { class: 'hint', text: 'Getting a code…' }));
    const m = modal('Link a device', body, [btn(null, 'Done', () => m.close(), 'primary')], { onClose: () => LINK.endOffer() });
    try {
      const first = !LINK.linked();
      if (first) body.replaceChildren(h('p', { class: 'hint', text: 'Getting this campaign ready to link: it goes up encrypted, document by document…' }));
      const o = await LINK.offer(req => {
        const card = h('div', { class: 'linkreq', role: 'group', 'aria-label': 'A device wants to link' },
          h('p', {}, h('b', { text: req.name }), ' wants to link. Does it show these digits?'),
          h('div', { class: 'sas', 'aria-label': 'The digits: ' + req.digits.split('').join(' ') }, ...req.digits.split('').map(c => h('span', { text: c }))),
          h('div', { class: 'row' }, btn(null, 'No, decline', async () => { await req.decline(); card.remove(); }, 'ghost'), btn('link', 'Yes, link it', async () => { await req.approve(); card.replaceChildren(h('p', {}, h('b', { text: req.name }), ' is linked. It\'s bringing the campaign in now.')); toast(req.name + ' is linked.'); }, 'primary')));
        body.append(card); card.scrollIntoView({ block: 'nearest' });
      });
      body.replaceChildren(
        h('p', { text: 'On the other device, open Critter Notes (the app, or notes.crittervtt.com) and choose "Link to my computer".' }),
        h('div', { class: 'linkcode', 'aria-label': 'The code: ' + o.code.split('').join(' ') }, ...o.code.split('').map(c => h('span', { text: c }))),
        h('p', { class: 'hint', text: 'On the same Wi-Fi it finds this computer by itself; anywhere else, type this code. You\'ll approve it here, after checking both screens show the same four digits.' }));
    } catch (e) { body.replaceChildren(h('p', { class: 'err', text: errText(e) })); }
  }

  // the phone's side: nearby computers, or a code
  function joinDialog(code0) {
    let stopNear = null;
    const inp = h('input', { type: 'text', class: 'code', maxLength: 7, placeholder: 'K7QX2M', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, id: 'linkCode', value: code0 || '' });
    const near = h('div', { class: 'nearlist', role: 'list', 'aria-label': 'Computers on this network' }, h('p', { class: 'hint', text: 'Looking for computers on this network…' }));
    const body = h('div', { class: 'linkjoin' },
      h('p', { text: 'On your computer: Settings › Your devices › Link a device. It shows a code, and on the same Wi-Fi it appears here.' }),
      near,
      h('label', { class: 'hint', for: 'linkCode', text: 'Or type its code' }), h('div', { class: 'row' }, inp, btn('link', 'Link', () => go2(inp.value), 'primary')));
    const m = modal('Link to my computer', body, [btn(null, 'Cancel', () => m.close(), 'ghost')], { onClose: () => { if (stopNear) stopNear(); } });
    LINK.nearby(list => {
      near.replaceChildren(...(list.length ? list.map(c => h('div', { role: 'listitem' }, h('button', { type: 'button', class: 'nearrow', onclick: () => go2(c.code) }, h('span', { html: icon('link') }), h('span', {}, h('b', { text: c.name }), h('small', { text: c.camp })))))
        : [h('p', { class: 'hint', text: 'None on this network right now.' })]));
    }).then(s => { stopNear = s; }).catch(() => near.replaceChildren(h('p', { class: 'hint', text: 'Can\'t look on this network: choose a Homebase first (the menu › Homebase).' })));
    async function go2(code) {
      if (stopNear) { stopNear(); stopNear = null; }
      body.replaceChildren(h('p', { class: 'hint', text: 'Asking the computer…' }));
      try {
        const meta = await LINK.join(code, (digits, pcName, camp) => body.replaceChildren(
          h('p', {}, 'Check that ', h('b', { text: pcName || 'your computer' }), ' shows the same digits, then approve it there:'),
          h('div', { class: 'sas' }, ...digits.split('').map(c => h('span', { text: c }))),
          h('p', { class: 'hint', text: camp ? `Campaign: ${camp}` : '' })));
        m.close(); toast(`Linked: ${meta.name} is coming in.`);
      } catch (e) { body.replaceChildren(h('p', { class: 'err', text: errText(e) }), h('div', { class: 'row' }, btn(null, 'Try again', () => { m.close(); joinDialog(); }, 'primary'))); }
    }
    if (code0) go2(code0); else setTimeout(() => inp.focus(), 100);
  }
  // a link from the computer's QR code or a shared address: notes.crittervtt.com/#link=K7QX2M
  function fromAddress() {
    const m = /[#&]link=([A-Za-z0-9]{6})/.exec(location.hash); if (!m) return;
    history.replaceState(history.state, '', location.pathname + location.search);
    setTimeout(() => joinDialog(m[1]), 600);
  }
  return { settingsSection, offerDialog, joinDialog, fromAddress };
})();
