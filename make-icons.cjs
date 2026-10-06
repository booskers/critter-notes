// Makes the app's icons from its mark in src/icon.svg (cut from the logo, square):
//   build/icon.ico (16 to 256 px, for Windows and the installer), build/icon.png and assets/icon.png (1024 px)
// Run it with Electron, which draws the SVG:  npx electron make-icons.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const icon = fs.readFileSync(path.join(__dirname, 'src', 'icon.svg'), 'utf8');
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
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  await w.loadURL('data:text/html,<body></body>');
  // drawn straight from the SVG at each size, so small icons stay crisp
  const out = await w.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(icon).toString('base64'))};
    await img.decode();
    const draw = n => { const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, n, n); return c.toDataURL('image/png').split(',')[1]; };
    return { big: draw(1024), sizes: ${JSON.stringify(SIZES)}.map(n => [n, draw(n)]) };
  })()`);
  const big = Buffer.from(out.big, 'base64');
  for (const d of ['build', 'assets']) fs.mkdirSync(path.join(__dirname, d), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'build', 'icon.png'), big);
  fs.writeFileSync(path.join(__dirname, 'assets', 'icon.png'), big);
  fs.writeFileSync(path.join(__dirname, 'build', 'icon.ico'), ico(out.sizes.map(([size, b]) => ({ size, buf: Buffer.from(b, 'base64') }))));
  console.log('icons made:', SIZES.join(', '), 'px and 1024 px');
  app.quit();
});
