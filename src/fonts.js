/* The font pairings shared by Critter VTT, Critter Sounds and Critter Notes (see critter-design/).
   "Easy reading" (Atkinson Hyperlegible Next, bundled with the app) is the base; the others load from Google Fonts
   when they're picked and fall back to the system fonts offline. */
const FONT_SETS = [
  // [name, titles, interface, reading]
  ['Easy reading', 'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible Next'],
  ['Zalando', 'Zalando Sans Expanded', 'Zalando Sans', 'Literata'],
  ['Critter classic', 'Grenze', 'Alegreya Sans', 'Spectral'],
  ['Storybook', 'Fraunces', 'Nunito', 'Literata'],
  ['Arcane', 'Cinzel', 'Alegreya Sans', 'Alegreya'],
  ['Inkwell', 'Young Serif', 'Figtree', 'Newsreader'],
  ['Pulp', 'Texturina', 'Rubik', 'Spectral'],
  ['Neon', 'Unbounded', 'Onest', 'Atkinson Hyperlegible Next'],
  ['Jolly Roger', 'Pirata One', 'Outfit', 'Alegreya'],
  ['Studio', 'Syne', 'Bricolage Grotesque', 'Newsreader'],
  // the same in Critter VTT and Critter Sounds: OpenDyslexic (Fontsource), with Lexend where it can't load
  ['Dyslexia-friendly', 'OpenDyslexic', 'OpenDyslexic', 'OpenDyslexic']
];
// each face: its Google Fonts query ('' = bundled), serif or sans, and the weight titles use
const FONT_FACES = {
  'Atkinson Hyperlegible Next': ['', 'sans', 750], 'Zalando Sans Expanded': ['Zalando+Sans+Expanded:wght@200..900', 'sans', 700],
  'Zalando Sans': ['Zalando+Sans:ital,wght@0,200..900;1,200..900', 'sans', 750], 'Literata': ['Literata:opsz,wght@7..72,200..900', 'serif', 650],
  'Grenze': ['Grenze:wght@400;500;600;700', 'serif', 700], 'Alegreya Sans': ['Alegreya+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400', 'sans', 700],
  'Spectral': ['Spectral:wght@400;500;600;700', 'serif', 650], 'Fraunces': ['Fraunces:opsz,wght@9..144,300..900', 'serif', 650],
  'Nunito': ['Nunito:wght@300..900', 'sans', 750], 'Cinzel': ['Cinzel:wght@400..900', 'serif', 700], 'Alegreya': ['Alegreya:wght@400..900', 'serif', 700],
  'Young Serif': ['Young+Serif', 'serif', 400], 'Figtree': ['Figtree:wght@300..900', 'sans', 700], 'Newsreader': ['Newsreader:opsz,wght@6..72,200..800', 'serif', 650],
  'Texturina': ['Texturina:opsz,wght@12..72,300..900', 'serif', 650], 'Rubik': ['Rubik:wght@300..900', 'sans', 700], 'Unbounded': ['Unbounded:wght@300..900', 'sans', 650],
  'Onest': ['Onest:wght@300..800', 'sans', 700], 'Pirata One': ['Pirata+One', 'serif', 400], 'Outfit': ['Outfit:wght@300..800', 'sans', 700],
  'Syne': ['Syne:wght@400..800', 'sans', 750], 'Bricolage Grotesque': ['Bricolage+Grotesque:opsz,wght@12..96,300..800', 'sans', 750],
  'OpenDyslexic': ['Lexend:wght@300..800', 'sans', 700]
};
const DYS_CSS = ['https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic@5/index.css', 'https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic@5/700.css'];
function fontStack(name) {
  const f = FONT_FACES[name] || FONT_FACES['Atkinson Hyperlegible Next'];
  if (f[0] && !document.querySelector(`link[data-font="${f[0]}"]`)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.font = f[0];
    l.href = `https://fonts.googleapis.com/css2?family=${f[0]}&display=swap`; document.head.append(l);
  }
  if (name === 'OpenDyslexic') {
    for (const u of DYS_CSS) if (!document.querySelector(`link[href="${u}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; document.head.append(l); }
    return '"OpenDyslexic","Lexend",sans-serif';
  }
  return `"${name}",${f[1] === 'serif' ? 'Georgia,serif' : '"Atkinson Hyperlegible Next","Segoe UI",system-ui,sans-serif'}`;
}
const fontSet = name => FONT_SETS.find(s => s[0] === name) || FONT_SETS[0];
// sets the three font roles (and the title weight) on an element, from a pairing's name
function applyFontSet(el, name) {
  const [, d, u, r] = fontSet(name), st = el.style;
  st.setProperty('--font-display', fontStack(d)); st.setProperty('--fw-display', (FONT_FACES[d] || [0, 0, 750])[2]);
  st.setProperty('--font-ui', fontStack(u)); st.setProperty('--font-read', fontStack(r));
  // the dyslexia set also opens up lines and words a little (on the page itself, not on a preview)
  if (el === document.documentElement) el.classList.toggle('dysfont', d === 'OpenDyslexic');
}
