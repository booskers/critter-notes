// Makes Critter Notes' icons: Critter's emblem (from logo-src/critter-logo.svg, its lettering left out) over an open book,
// in Notes' teal. Writes src/icon.svg, build/icon.ico (16 to 256 px), build/icon.png and assets/icon.png (1024 px).
// Run it with Electron, which draws the SVG:  npx electron make-icons.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const COLOR = '#10b39b';
const logo = fs.readFileSync(path.join(__dirname, 'logo-src', 'critter-logo.svg'), 'utf8');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12); off += buf.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p.buf)]);
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false });
  await w.loadURL('data:text/html,<body></body>');
  const out = await w.webContents.executeJavaScript(`(async () => {
    // the emblem: the logo without its lettering (the paths after the third), measured where it really sits
    const host = document.createElement('div'); host.innerHTML = ${JSON.stringify(logo.replace(/^[\s\S]*?(<svg)/, '$1'))}; document.body.append(host);
    const svg = host.querySelector('svg'); svg.setAttribute('width', '1570'); svg.setAttribute('height', '471');
    [...svg.querySelectorAll('path')].slice(3).forEach(p => p.remove());
    svg.querySelectorAll('path,circle,ellipse,rect,polygon').forEach(p => { p.removeAttribute('style'); p.setAttribute('fill', '${COLOR}'); });
    const b = svg.getBBox();
    svg.removeAttribute('width'); svg.removeAttribute('height'); svg.removeAttribute('style');
    svg.setAttribute('viewBox', [b.x, b.y, b.width, b.height].join(' '));
    // the emblem sits on an open book
    const ew = 520, eh = Math.round(ew * b.height / b.width);
    const inner = svg.outerHTML.replace('<svg', '<svg x="' + (500 - ew / 2) + '" y="' + (650 - eh) + '" width="' + ew + '" height="' + eh + '" preserveAspectRatio="xMidYMid meet"').replace(/ xmlns(:\\w+)?="[^"]*"/g, '').replace(/ xml:space="[^"]*"/g, '').replace(/ affinity:[\\w-]+="[^"]*"/g, '');
    const book = '<path fill="${COLOR}" d="M488 722C406 678 258 660 88 686v262c170-26 318-10 400 34z M512 722c82-44 230-62 400-36v262c-170-26-318-10-400 34z"/>';
    // the lines of writing on the pages are cut out of them
    const lines = '<g stroke="#000" stroke-width="18" stroke-linecap="round" fill="none"><path d="M166 762c100-12 196-4 266 20 M166 826c100-12 196-4 266 20 M166 890c100-12 196-4 266 20 M834 762c-100-12-196-4-266 20 M834 826c-100-12-196-4-266 20 M834 890c-100-12-196-4-266 20"/></g>';
    const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><mask id="pg" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000"><rect width="1000" height="1000" fill="#fff"/>' + lines + '</mask></defs>' + inner + '<g mask="url(#pg)">' + book + '</g></svg>';
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(icon)));
    await img.decode();
    const draw = n => { const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, n, n); return c.toDataURL('image/png').split(',')[1]; };
    return { icon, big: draw(1024), sizes: ${JSON.stringify(SIZES)}.map(n => [n, draw(n)]) };
  })()`);
  const big = Buffer.from(out.big, 'base64');
  for (const d of ['build', 'assets', 'src']) fs.mkdirSync(path.join(__dirname, d), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'build', 'icon.png'), big);
  fs.writeFileSync(path.join(__dirname, 'assets', 'icon.png'), big);
  fs.writeFileSync(path.join(__dirname, 'build', 'icon.ico'), ico(out.sizes.map(([size, b]) => ({ size, buf: Buffer.from(b, 'base64') }))));
  fs.writeFileSync(path.join(__dirname, 'src', 'icon.svg'), out.icon);
  console.log('icons made:', SIZES.join(', '), 'px and 1024 px');
  app.quit();
});
