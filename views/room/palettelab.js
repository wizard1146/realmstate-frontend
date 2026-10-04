// Palette lab for the war room: try a colour palette, beside the font lab. A design tool for
// choosing, like the font lab; remembered per browser until the chosen ones become a player setting.
//
// "Moss & bone" is the war room's own look and follows the system's light or dark setting.
// Every other palette is fixed light or dark. All text pairs meet 4.5:1 contrast.
// The lab also holds the pane glyphs switch: faint icons behind each pane (see room.css).

const KEY = 'realmstate.room.palette';
const GLYPH_KEY = 'realmstate.room.glyphs';

/** War-room colour properties, in the order each palette lists its values. */
const PROPS = ['--bone-bg', '--pane', '--pane-2', '--room-ink', '--room-muted', '--room-line', '--rule',
  '--head', '--head-ink', '--key', '--moss', '--moss-ink', '--rust', '--up', '--down', '--self', '--tgt',
  '--focus', '--ch-world', '--ch-realm', '--ch-state'];

/** [name, scheme, values in PROPS order]. Scheme 'auto' sets nothing and lets room.css decide. */
export const PALETTES = [
  ['Moss & bone (default)', 'auto', null],
  ['Moss & bone · light', 'light', ['#e4ddca', '#f3eee1', '#ebe5d4', '#1f2320', '#646a63', '#b7b19e', '#cfc8b4', '#343a3c', '#efe9da', '#9cbc7c', '#476b34', '#f3eee1', '#9b3a22', '#2f6b1c', '#a8321b', '#dfe7cf', '#f0dcc9', '#2f6b1c', '#2f5f86', '#8a5a00', '#476b34']],
  ['Moss & bone · dark', 'dark', ['#0d0f0e', '#151816', '#1b1f1c', '#e2dcc8', '#8b9187', '#2d332f', '#232825', '#222824', '#d9d2bd', '#9cbf78', '#8db36a', '#0d0f0e', '#e0846b', '#a6d27c', '#ef8a6c', '#1e2a1a', '#3a2a1e', '#a6d27c', '#7fb0d8', '#e0b050', '#8db36a']],
  ['Ironside', 'light', ['#d9dde0', '#eef0f1', '#e3e7ea', '#1b2228', '#56606a', '#a7b0b8', '#c6cdd3', '#26323c', '#e8edf1', '#8fb3cf', '#2c5d84', '#eef0f1', '#a33a2a', '#2b6a3a', '#a8321b', '#d6e3ee', '#f0dad2', '#2c5d84', '#2c5d84', '#8a5a00', '#2b6a3a']],
  ['Campaign parchment', 'light', ['#e8dcc2', '#f6efdc', '#efe5cc', '#2a1f18', '#6a5b4b', '#bfae8c', '#d8c9a8', '#4a1f1c', '#f3e7cf', '#d9a35a', '#7a2420', '#f6efdc', '#a2401c', '#3d6a22', '#9b2a1a', '#e6e2c4', '#f1d2c0', '#7a2420', '#2f5878', '#8a5a00', '#3d6a22']],
  ['Sandtable', 'light', ['#d8cfae', '#ece6cf', '#e2dabd', '#23221a', '#5c5845', '#aaa182', '#c7bf9f', '#4b4a32', '#efe9cf', '#c9b468', '#5a6627', '#ece6cf', '#9a3b1d', '#3f6a1d', '#a3361c', '#dde2c0', '#edd3bd', '#5a6627', '#2f5f86', '#7d5208', '#4f6b25']],
  ['Night watch', 'dark', ['#0b1018', '#121925', '#18202e', '#dfe6ee', '#8a96a6', '#2a3546', '#1f2836', '#1a2433', '#d6dee8', '#e3b060', '#e0a84a', '#0b1018', '#f08a70', '#8fd18a', '#f28b6e', '#1a2a3a', '#3a2a22', '#e0a84a', '#7fb0e0', '#e3b060', '#8fd18a']],
  ['Ember', 'dark', ['#121110', '#1a1817', '#211f1d', '#e8e2da', '#9a918a', '#36312d', '#2a2623', '#2a2522', '#ece4da', '#f08a4b', '#e8763a', '#121110', '#ff8f73', '#a8d28a', '#ff8f73', '#2a2a1c', '#3a2318', '#f0a070', '#82b4dc', '#e8b45a', '#a8d28a']],
  ['Phosphor', 'dark', ['#050a06', '#0a120b', '#0f1a10', '#9cf0a6', '#5d9a66', '#1d3a22', '#142a18', '#10261a', '#b6f5bd', '#6fe07d', '#6fe07d', '#050a06', '#ffb36b', '#b6ff9c', '#ff8a6b', '#0f2a14', '#2a1e0c', '#b6ff9c', '#7fd8e0', '#e8d060', '#6fe07d']],
  ['Amber terminal', 'dark', ['#0d0903', '#160f06', '#1d1409', '#ffc66b', '#b48a48', '#3a2a12', '#2a1e0c', '#2a1d0b', '#ffd38a', '#ffb347', '#ffb347', '#0d0903', '#ff7a5c', '#d8e07a', '#ff7a5c', '#2a200c', '#34160c', '#ffd38a', '#9fc8e8', '#ffb347', '#d8e07a']],
  ['Slate', 'light', ['#dcdee1', '#f1f2f4', '#e6e8eb', '#1c1f23', '#565c64', '#a9aeb5', '#c8ccd1', '#2b2f35', '#eceef1', '#9aa3ae', '#3e4a5a', '#f1f2f4', '#a33a2a', '#2b6a3a', '#a8321b', '#dfe3e9', '#f0dcd5', '#3e4a5a', '#2c5d84', '#8a5a00', '#2b6a3a']],
  ['Hot pink', 'dark', ['#140a10', '#1d0f18', '#25131f', '#ffe6f2', '#c48aa8', '#43233a', '#33192c', '#2e1426', '#ffd6ea', '#ff7ac0', '#ff3d9a', '#140a10', '#ffb070', '#9ef0b0', '#ff8a7a', '#3a1430', '#2a1e10', '#ff7ac0', '#8ec8ff', '#ffd166', '#9ef0b0']],
  ['Teal', 'dark', ['#071214', '#0c1a1d', '#112326', '#e2f4f3', '#82a9a8', '#1f3c40', '#173033', '#0f2b2f', '#d6f1ef', '#5ee6d6', '#2ad4c4', '#071214', '#ff8a70', '#b6f08a', '#ff7a9a', '#0f3236', '#33240f', '#5ee6d6', '#7fc4ff', '#ffd166', '#2ad4c4']],
  ['Magenta', 'light', ['#eedfe9', '#fbf3f8', '#f4e6ef', '#24121e', '#6b4f62', '#c9a9bd', '#e0c8d7', '#4a0f3a', '#fbe6f3', '#ff7ad1', '#a8137f', '#fbf3f8', '#a33a2a', '#2b6a3a', '#b0241b', '#f6dcee', '#f3e0c8', '#a8137f', '#2c5d84', '#8a5a00', '#2b6a3a']],
  ['Crimson', 'dark', ['#120809', '#1b0d0f', '#231114', '#f3e4e2', '#b08a88', '#3f2023', '#2f181a', '#2a0f13', '#f6dcd9', '#ff5a6e', '#ec4458', '#120809', '#ffb070', '#a8e08a', '#ff9b7a', '#3a1218', '#33240f', '#ff5a6e', '#8ec8ff', '#ffd166', '#a8e08a']],
  ['High contrast · light', 'light', ['#ffffff', '#ffffff', '#f0f0f0', '#000000', '#3d3d3d', '#000000', '#8a8a8a', '#000000', '#ffffff', '#ffd400', '#004f9e', '#ffffff', '#b00000', '#006100', '#b00000', '#e6f0ff', '#ffe3d6', '#004f9e', '#004f9e', '#7a4a00', '#006100']],
  ['High contrast · dark', 'dark', ['#000000', '#000000', '#141414', '#ffffff', '#c8c8c8', '#ffffff', '#6a6a6a', '#ffffff', '#000000', '#ffd400', '#ffd400', '#000000', '#ff6b6b', '#7dff7d', '#ff6b6b', '#0a2340', '#3a1a0a', '#ffd400', '#7fc0ff', '#ffd400', '#7dff7d']],
];

/** Swatch chips shown per palette: background, pane, header, accent, up, down. */
const CHIPS = ['--bone-bg', '--pane', '--head', '--moss', '--up', '--down'].map((p) => PROPS.indexOf(p));

// Saved by name, so adding a palette never shifts someone's choice.
function read() {
  let name = null;
  try { name = localStorage.getItem(KEY); } catch { /* storage off */ }
  return Math.max(0, PALETTES.findIndex((p) => p[0] === name));
}
function write(i) {
  try { localStorage.setItem(KEY, PALETTES[i][0]); } catch { /* storage off */ }
}

/** Removes the lab's overrides (when leaving the war room, or back to the default). */
export function clear() {
  const s = document.documentElement.style;
  for (const p of PROPS) s.removeProperty(p);
  s.removeProperty('color-scheme');
}

/** Pane glyphs: on, at 6% strength, unless changed; remembered per browser. `next` changes either. */
export function glyphs(next) {
  let v = { on: true, pct: 6 };
  try { v = { ...v, ...JSON.parse(localStorage.getItem(GLYPH_KEY)) }; } catch { /* storage off or unset */ }
  if (next) {
    v = { ...v, ...next };
    try { localStorage.setItem(GLYPH_KEY, JSON.stringify(v)); } catch { /* storage off */ }
  }
  const root = document.documentElement;
  root.dataset.glyphs = v.on ? 'on' : 'off';
  root.style.setProperty('--glyph-alpha', String(v.pct / 100));
  return v;
}

/** Removes the glyph settings from the page (when leaving the war room). */
export function clearGlyphs() {
  delete document.documentElement.dataset.glyphs;
  document.documentElement.style.removeProperty('--glyph-alpha');
}

/** Applies palette i to the page (inline properties beat room.css and its dark-mode block). */
export function apply(i) {
  clear();
  const [, scheme, vals] = PALETTES[i] || PALETTES[0];
  if (!vals) return;
  const s = document.documentElement.style;
  PROPS.forEach((p, k) => s.setProperty(p, vals[k]));
  s.setProperty('color-scheme', scheme);
}

function chips(vals) {
  if (!vals) return '<span class="dim small">follows system</span>';
  return CHIPS.map((k) => `<i style="background:${vals[k]}"></i>`).join('');
}

/**
 * The lab's toggle button (for the bar) and its panel. `on` registers listeners for unmount.
 * `blocked()` true (say, a modal detail view is open) turns the lab's keys off.
 */
export function mountPaletteLab(root, on, { blocked = () => false } = {}) {
  let cur = read();
  const btn = root.querySelector('#r-palette');
  const panel = document.createElement('section');
  panel.id = 'r-palettelab';
  panel.className = 'fontlab palettelab';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Palette lab');
  panel.innerHTML = `
    <header><b>PALETTE LAB</b> <span class="dim">try colours; P toggles, [ ] steps</span><button class="btn mini" data-close aria-label="Close palette lab">×</button></header>
    <fieldset class="pals"><legend class="vh">Palette</legend>
    ${PALETTES.map(([name, scheme, vals], i) => `<label class="pal"><input type="radio" name="r-pal" value="${i}"${i === cur ? ' checked' : ''}>
      <span class="pal-name">${name}${scheme === 'auto' ? '' : ` <span class="dim">${scheme}</span>`}</span><span class="chips" aria-hidden="true">${chips(vals)}</span></label>`).join('')}
    </fieldset>
    <div class="glyphs">
      <label class="check"><input type="checkbox" data-g="on"> Pane glyphs</label>
      <label class="check">Strength <input type="range" data-g="pct" min="2" max="12" step="1"> <output class="num"></output></label>
      <p class="dim small credit">Icons by Lorc, Delapouite and Caro Asercion from <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>.</p>
    </div>`;
  root.querySelector('.room').append(panel);
  const g = glyphs();
  const gOn = panel.querySelector('[data-g="on"]'), gPct = panel.querySelector('[data-g="pct"]'), gOut = panel.querySelector('.glyphs output');
  const showGlyphs = (v) => { gOn.checked = v.on; gPct.value = v.pct; gPct.disabled = !v.on; gOut.textContent = `${v.pct}%`; };
  showGlyphs(g);
  const radio = (i) => panel.querySelector(`input[value="${i}"]`);

  function set(i) {
    cur = i;
    radio(i).checked = true;
    apply(i);
    write(i);
  }
  const open = (yes = panel.hidden) => {
    panel.hidden = !yes;
    btn.setAttribute('aria-expanded', String(yes));
    if (yes) {
      root.querySelector('#r-fontlab [data-close]')?.click(); // one lab at a time; they share a spot
      radio(cur).focus();
    }
  };

  on(btn, 'click', () => open());
  on(panel, 'click', (ev) => { if (ev.target.closest('[data-close]')) open(false); });
  on(panel, 'input', (ev) => {
    if (ev.target.name === 'r-pal') set(Number(ev.target.value));
    else if (ev.target === gOn) showGlyphs(glyphs({ on: gOn.checked }));
    else if (ev.target === gPct) showGlyphs(glyphs({ pct: Number(gPct.value) }));
  });
  on(document, 'keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || blocked()) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName) && !panel.contains(document.activeElement);
    if (typing) return;
    if ((ev.key === 'p' || ev.key === 'P') && !panel.contains(document.activeElement)) { ev.preventDefault(); open(); }
    else if (ev.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); }
    else if (!panel.hidden && (ev.key === '[' || ev.key === ']')) {
      set((cur + (ev.key === '[' ? -1 : 1) + PALETTES.length) % PALETTES.length);
      radio(cur).focus();
    }
  });
  apply(cur);
  return { open };
}
