// Straightline's look: a theme (colours, a medieval set of its own) and fonts (heading face, body face, size),
// like the War Room's palette and font labs. Two buttons in the header and two panels; P and F open them.
// Themes are CSS blocks keyed on html[data-line-theme] (line.css); fonts are three CSS properties on :root.
// Web faces load from Google Fonts only when picked; whichever we settle on gets self-hosted.

const THEME_KEY = 'realmstate.line.theme';
const FONT_KEY = 'realmstate.line.fonts';
const ORN_KEY = 'realmstate.line.ornaments';

/** [id, name, swatches (page, menu, accent)]. 'auto' is Vellum by day, Night Vigil in dark mode. */
export const THEMES = [
  ['auto', 'Follow system', ['#fffdf8', '#23324a', '#b8892e']],
  ['vellum', 'Vellum', ['#fffdf8', '#23324a', '#b8892e']],
  ['oak', 'Oak & Iron', ['#fbf6ea', '#3b2c1e', '#8a6a3a']],
  ['crimson', 'Crimson Court', ['#fdf9f3', '#5a1620', '#c49a3a']],
  ['abbey', 'Abbey Green', ['#fafaf2', '#1f3a2c', '#a8893a']],
  ['vigil', 'Night Vigil', ['#1b1f26', '#10161f', '#d9ad55']],
  ['ember', 'Ember Hall', ['#201a15', '#0f0b08', '#e09a4a']],
  ['forest', 'Deepwood', ['#18211c', '#0b100d', '#c9b26a']],
  ['amethyst', 'Amethyst Court', ['#1e1825', '#0e0a13', '#d8b45a']],
  ['midnight', 'Midnight Ink', ['#151516', '#000000', '#c9a24a']],
  ['ink', 'Ink & Parchment', ['#fbf6e6', '#111111', '#7a1f12']],
];

const SYS = 'system';
const WEB = 'web';
/** Heading faces: page titles, menu groups, section headings. */
export const HEADS = [
  { name: 'Book serif', css: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif', src: SYS },
  { name: 'Cinzel', css: 'Cinzel, Georgia, serif', src: WEB, gf: 'Cinzel:wght@500;600;700' },
  { name: 'IM Fell English', css: '"IM Fell English", Georgia, serif', src: WEB, gf: 'IM+Fell+English' },
  { name: 'Cormorant Garamond', css: '"Cormorant Garamond", Georgia, serif', src: WEB, gf: 'Cormorant+Garamond:wght@500;600;700' },
  { name: 'EB Garamond', css: '"EB Garamond", Georgia, serif', src: WEB, gf: 'EB+Garamond:wght@500;600;700' },
  { name: 'Uncial Antiqua', css: '"Uncial Antiqua", Georgia, serif', src: WEB, gf: 'Uncial+Antiqua' },
  // Old-style faces with plain, full-height numbers (IM Fell's dip below the line and are hard to read in tables).
  { name: 'Playfair Display', css: '"Playfair Display", Georgia, serif', src: WEB, gf: 'Playfair+Display:wght@500;600;700' },
  { name: 'Fraunces', css: 'Fraunces, Georgia, serif', src: WEB, gf: 'Fraunces:wght@500;600;700' },
  { name: 'Lora', css: 'Lora, Georgia, serif', src: WEB, gf: 'Lora:wght@500;600;700' },
  { name: 'Bellefair', css: 'Bellefair, Georgia, serif', src: WEB, gf: 'Bellefair' },
  { name: 'Forum', css: 'Forum, Georgia, serif', src: WEB, gf: 'Forum' },
  { name: 'Rosarivo', css: 'Rosarivo, Georgia, serif', src: WEB, gf: 'Rosarivo' },
  { name: 'System sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', src: SYS },
];
/** Body faces: everything else, numbers included (always set as lining, tabular figures). */
export const BODIES = [
  { name: 'System sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif', src: SYS },
  { name: 'Georgia', css: 'Georgia, "Times New Roman", serif', src: SYS },
  { name: 'Alegreya Sans', css: '"Alegreya Sans", system-ui, sans-serif', src: WEB, gf: 'Alegreya+Sans:wght@400;500;700' },
  { name: 'EB Garamond', css: '"EB Garamond", Georgia, serif', src: WEB, gf: 'EB+Garamond:wght@400;500;700' },
  { name: 'Crimson Pro', css: '"Crimson Pro", Georgia, serif', src: WEB, gf: 'Crimson+Pro:wght@400;500;700' },
  { name: 'Source Sans 3', css: '"Source Sans 3", system-ui, sans-serif', src: WEB, gf: 'Source+Sans+3:wght@400;600;700' },
];
const FONT_DEFAULT = { head: 'Rosarivo', body: 'Source Sans 3', size: 15 };

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };
const byName = (list, n) => list.find((f) => f.name === n) || list[0];
const loaded = new Set();
function loadWeb(face) {
  if (face.src !== WEB || loaded.has(face.gf)) return;
  loaded.add(face.gf);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${face.gf}&display=swap`;
  document.head.append(link);
}

/** Applies the saved look (or the given parts of it) to the page. */
export function apply({ theme, fonts, ornaments } = {}) {
  const root = document.documentElement;
  theme ??= read(THEME_KEY, 'auto');
  fonts ??= { ...FONT_DEFAULT, ...read(FONT_KEY, {}) };
  ornaments ??= read(ORN_KEY, true);
  if (theme === 'auto') delete root.dataset.lineTheme; else root.dataset.lineTheme = theme;
  root.dataset.lineOrn = ornaments ? 'on' : 'off';
  const h = byName(HEADS, fonts.head), b = byName(BODIES, fonts.body);
  loadWeb(h); loadWeb(b);
  root.style.setProperty('--l-head-font', h.css);
  root.style.setProperty('--l-body-font', b.css);
  root.style.setProperty('--l-size', `${fonts.size}px`);
}
/** The saved look: { theme, fonts: { head, body, size }, ornaments }. */
export const look = () => ({ theme: read(THEME_KEY, 'auto'), fonts: { ...FONT_DEFAULT, ...read(FONT_KEY, {}) }, ornaments: read(ORN_KEY, true) });
/** Saves part of the look and applies it (the Configuration page; the header panels catch up when opened). */
export function setLook({ theme, fonts, ornaments }) {
  if (theme !== undefined) write(THEME_KEY, theme);
  if (fonts !== undefined) write(FONT_KEY, fonts);
  if (ornaments !== undefined) write(ORN_KEY, ornaments);
  apply();
}
export const FONT_DEFAULTS = FONT_DEFAULT;
/** Takes the look off the page (when leaving Straightline). */
export function clear() {
  const root = document.documentElement;
  delete root.dataset.lineTheme; delete root.dataset.lineOrn;
  for (const p of ['--l-head-font', '--l-body-font', '--l-size']) root.style.removeProperty(p);
}

const opt = (f, sel) => `<option value="${f.name}"${f.name === sel ? ' selected' : ''}>${f.name}${f.src === WEB ? ' · web' : ''}</option>`;

/** The two buttons (#l-theme, #l-fonts, already in the header) and their panels. `blocked()` turns the keys off. */
export function mountLook(root, on, { blocked = () => false } = {}) {
  let theme = read(THEME_KEY, 'auto');
  let fonts = { ...FONT_DEFAULT, ...read(FONT_KEY, {}) };
  let ornaments = read(ORN_KEY, true);
  const host = root.querySelector('.line');
  const tpanel = document.createElement('section');
  tpanel.className = 'look-panel'; tpanel.id = 'l-themepanel'; tpanel.hidden = true; tpanel.setAttribute('aria-label', 'Theme');
  tpanel.innerHTML = `<header><b>Theme</b><span class="dim">P toggles</span><button type="button" class="x" data-close aria-label="Close">×</button></header>
    <fieldset class="themes"><legend class="vh">Theme</legend>${THEMES.map(([id, name, sw]) => `<label class="theme"><input type="radio" name="l-theme" value="${id}"${id === theme ? ' checked' : ''}>
      <span>${name}</span><span class="chips" aria-hidden="true">${sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span></label>`).join('')}</fieldset>
    <label class="check"><input type="checkbox" data-k="orn"${ornaments ? ' checked' : ''}> Ornaments (corners and rules)</label>`;
  const fpanel = document.createElement('section');
  fpanel.className = 'look-panel'; fpanel.id = 'l-fontpanel'; fpanel.hidden = true; fpanel.setAttribute('aria-label', 'Fonts');
  fpanel.innerHTML = `<header><b>Fonts</b><span class="dim">F toggles</span><button type="button" class="x" data-close aria-label="Close">×</button></header>
    <label>Headings <select data-k="head">${HEADS.map((f) => opt(f, fonts.head)).join('')}</select></label>
    <label>Body <select data-k="body">${BODIES.map((f) => opt(f, fonts.body)).join('')}</select></label>
    <label>Size <span class="row"><input data-k="size" type="range" min="13" max="19" step="1" value="${fonts.size}"> <output>${fonts.size}px</output></span></label>
    <p class="specimen"><span class="h">The Crown of Valmark</span><br>Gold 1,234,567 · Land 430 acres · Might 80,904</p>
    <p class="dim small">Web faces load from Google Fonts while we choose; the chosen ones get self-hosted.</p>
    <button type="button" class="link" data-reset>Back to the default</button>`;
  host.append(tpanel, fpanel);
  const panels = { theme: [tpanel, root.querySelector('#l-theme')], fonts: [fpanel, root.querySelector('#l-fonts')] };
  const open = (which, yes) => {
    // The Configuration page may have changed the look since: start from what's saved.
    ({ theme, fonts, ornaments } = look());
    tpanel.querySelectorAll('input[name="l-theme"]').forEach((i) => { i.checked = i.value === theme; });
    tpanel.querySelector('[data-k="orn"]').checked = ornaments;
    sync();
    for (const [k, [p, b]] of Object.entries(panels)) {
      const show = k === which && (yes ?? p.hidden);
      p.hidden = !show; b.setAttribute('aria-expanded', String(show));
      if (show) p.querySelector('input:checked, select, input')?.focus();
    }
  };
  for (const [k, [p, b]] of Object.entries(panels)) {
    on(b, 'click', () => open(k));
    on(p, 'click', (ev) => { if (ev.target.closest('[data-close]')) { open(k, false); b.focus(); } });
  }
  on(tpanel, 'input', (ev) => {
    if (ev.target.name === 'l-theme') { theme = ev.target.value; write(THEME_KEY, theme); apply({ theme }); }
    if (ev.target.dataset.k === 'orn') { ornaments = ev.target.checked; write(ORN_KEY, ornaments); apply({ ornaments }); }
  });
  const sync = () => { fpanel.querySelector('[data-k="head"]').value = fonts.head; fpanel.querySelector('[data-k="body"]').value = fonts.body; fpanel.querySelector('[data-k="size"]').value = fonts.size; fpanel.querySelector('output').textContent = `${fonts.size}px`; };
  on(fpanel, 'input', (ev) => {
    const k = ev.target.dataset.k;
    if (!k) return;
    fonts = { ...fonts, [k]: k === 'size' ? Number(ev.target.value) : ev.target.value };
    write(FONT_KEY, fonts); apply({ fonts }); sync();
  });
  on(fpanel, 'click', (ev) => { if (ev.target.closest('[data-reset]')) { fonts = { ...FONT_DEFAULT }; write(FONT_KEY, fonts); apply({ fonts }); sync(); } });
  on(document, 'keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || blocked()) return;
    const t = ev.target;
    const inPanel = tpanel.contains(t) || fpanel.contains(t);
    if (!inPanel && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (ev.key === 'Escape' && (!tpanel.hidden || !fpanel.hidden)) { const k = !tpanel.hidden ? 'theme' : 'fonts'; open(k, false); panels[k][1].focus(); return; }
    if (inPanel) return;
    if (ev.key === 'p' || ev.key === 'P') { ev.preventDefault(); open('theme'); }
    else if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); open('fonts'); }
  });
  apply();
}
