// Font lab for the war room: try a monospace face for the data and a face for the labels, as
// named pairs or one at a time, plus a size. A design tool for choosing; not meant for players.
//
// System faces need nothing. Web faces (marked "web") load from Google Fonts only when picked;
// whichever we settle on gets self-hosted, so the shipped page keeps no outside requests.

const KEY = 'realmstate.room.fonts';
const HOVER_KEY = 'realmstate.room.hover';

/** Row hover highlight: on unless turned off; remembered per browser. */
export function rowHover(on) {
  if (on !== undefined) {
    try { localStorage.setItem(HOVER_KEY, on ? 'on' : 'off'); } catch { /* storage off */ }
  }
  let v = 'on';
  try { v = localStorage.getItem(HOVER_KEY) || 'on'; } catch { /* storage off */ }
  document.documentElement.dataset.rowHover = v;
  return v === 'on';
}

const SYS = 'system';
const WEB = 'web';

/** Monospace faces for numbers, tables and inputs. */
export const MONOS = [
  { name: 'SF Mono', css: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace', src: SYS },
  { name: 'Menlo', css: 'Menlo, monospace', src: SYS },
  { name: 'Monaco', css: 'Monaco, monospace', src: SYS },
  { name: 'PT Mono', css: '"PT Mono", monospace', src: SYS },
  { name: 'Andale Mono', css: '"Andale Mono", monospace', src: SYS },
  { name: 'Courier New', css: '"Courier New", Courier, monospace', src: SYS },
  { name: 'JetBrains Mono', css: '"JetBrains Mono", monospace', src: WEB, gf: 'JetBrains+Mono:wght@400;600;700' },
  { name: 'IBM Plex Mono', css: '"IBM Plex Mono", monospace', src: WEB, gf: 'IBM+Plex+Mono:wght@400;600;700' },
  { name: 'Fira Code', css: '"Fira Code", monospace', src: WEB, gf: 'Fira+Code:wght@400;600;700' },
  { name: 'Source Code Pro', css: '"Source Code Pro", monospace', src: WEB, gf: 'Source+Code+Pro:wght@400;600;700' },
  { name: 'Roboto Mono', css: '"Roboto Mono", monospace', src: WEB, gf: 'Roboto+Mono:wght@400;600;700' },
  { name: 'DM Mono', css: '"DM Mono", monospace', src: WEB, gf: 'DM+Mono:wght@400;500' },
  { name: 'Space Mono', css: '"Space Mono", monospace', src: WEB, gf: 'Space+Mono:wght@400;700' },
  { name: 'Red Hat Mono', css: '"Red Hat Mono", monospace', src: WEB, gf: 'Red+Hat+Mono:wght@400;600;700' },
  { name: 'Martian Mono', css: '"Martian Mono", monospace', src: WEB, gf: 'Martian+Mono:wght@400;600;700' },
  { name: 'Azeret Mono', css: '"Azeret Mono", monospace', src: WEB, gf: 'Azeret+Mono:wght@400;600;700' },
  { name: 'Inconsolata', css: 'Inconsolata, monospace', src: WEB, gf: 'Inconsolata:wght@400;600;700' },
  { name: 'Courier Prime', css: '"Courier Prime", monospace', src: WEB, gf: 'Courier+Prime:wght@400;700' },
  { name: 'Share Tech Mono', css: '"Share Tech Mono", monospace', src: WEB, gf: 'Share+Tech+Mono' },
  { name: 'VT323', css: 'VT323, monospace', src: WEB, gf: 'VT323' },
];

/** Faces for headers, pane titles, labels and buttons. "Same as data" keeps it all monospace. */
export const LABELS = [
  { name: 'Same as data', css: null, src: SYS },
  { name: 'System sans', css: 'system-ui, -apple-system, sans-serif', src: SYS },
  { name: 'Avenir Next Condensed', css: '"Avenir Next Condensed", "Avenir Next", sans-serif', src: SYS },
  { name: 'Futura', css: 'Futura, sans-serif', src: SYS },
  { name: 'Gill Sans', css: '"Gill Sans", sans-serif', src: SYS },
  { name: 'Optima', css: 'Optima, sans-serif', src: SYS },
  { name: 'Iowan Old Style', css: '"Iowan Old Style", Georgia, serif', src: SYS },
  { name: 'Baskerville', css: 'Baskerville, Georgia, serif', src: SYS },
  { name: 'Inter', css: 'Inter, sans-serif', src: WEB, gf: 'Inter:wght@400;600;700' },
  { name: 'IBM Plex Sans Condensed', css: '"IBM Plex Sans Condensed", sans-serif', src: WEB, gf: 'IBM+Plex+Sans+Condensed:wght@400;600;700' },
  { name: 'Barlow Condensed', css: '"Barlow Condensed", sans-serif', src: WEB, gf: 'Barlow+Condensed:wght@400;600;700' },
  { name: 'Archivo Narrow', css: '"Archivo Narrow", sans-serif', src: WEB, gf: 'Archivo+Narrow:wght@400;600;700' },
  { name: 'Oswald', css: 'Oswald, sans-serif', src: WEB, gf: 'Oswald:wght@400;600;700' },
  { name: 'Rajdhani', css: 'Rajdhani, sans-serif', src: WEB, gf: 'Rajdhani:wght@400;600;700' },
  { name: 'Space Grotesk', css: '"Space Grotesk", sans-serif', src: WEB, gf: 'Space+Grotesk:wght@400;600;700' },
  { name: 'Cinzel', css: 'Cinzel, serif', src: WEB, gf: 'Cinzel:wght@400;600;700' },
  { name: 'Cormorant SC', css: '"Cormorant SC", serif', src: WEB, gf: 'Cormorant+SC:wght@500;600;700' },
];

/** Named pairs: [name, data face, label face, size px]. DEFAULT is the war room's own look. */
export const PAIRS = [
  ['Terminal', 'SF Mono', 'Same as data', 13],
  ['Menlo console', 'Menlo', 'Same as data', 13],
  ['JetBrains all through', 'JetBrains Mono', 'Same as data', 13],
  ['Plex: condensed labels', 'IBM Plex Mono', 'IBM Plex Sans Condensed', 13],
  ['Field manual', 'JetBrains Mono', 'Barlow Condensed', 13],
  ['Quartermaster', 'Roboto Mono', 'Oswald', 13],
  ['Engraved orders', 'IBM Plex Mono', 'Cinzel', 13],
  ['Clerk’s ledger', 'Courier Prime', 'Iowan Old Style', 14],
  ['Swiss desk', 'DM Mono', 'Inter', 13],
  ['Grotesk (default)', 'IBM Plex Mono', 'Space Grotesk', 12],
  ['Signals', 'Share Tech Mono', 'Rajdhani', 14],
  ['Ops room', 'Red Hat Mono', 'Archivo Narrow', 13],
  ['Draughtsman', 'Martian Mono', 'Futura', 12],
  ['Old phosphor', 'VT323', 'VT323', 17],
];

export const DEFAULT = PAIRS.findIndex((p) => p[0].startsWith('Grotesk'));

const byName = (list, name) => list.find((f) => f.name === name) || list[0];
const loaded = new Set();

function loadWeb(face) {
  if (face.src !== WEB || loaded.has(face.gf)) return;
  loaded.add(face.gf);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${face.gf}&display=swap`;
  link.dataset.fontlab = '';
  document.head.append(link);
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function write(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage off */ }
}

/** Applies a choice to the page (the war room's CSS reads these properties). */
export function apply({ mono, label, size }) {
  const m = byName(MONOS, mono);
  const l = byName(LABELS, label);
  loadWeb(m);
  loadWeb(l);
  const s = document.documentElement.style;
  s.setProperty('--room-mono', m.css);
  s.setProperty('--room-label', l.css || m.css);
  s.setProperty('--room-scale', String(size / 13));
}

/** Removes the lab's overrides (when leaving the war room). */
export function clear() {
  const s = document.documentElement.style;
  for (const p of ['--room-mono', '--room-label', '--room-scale']) s.removeProperty(p);
  delete document.documentElement.dataset.rowHover;
}

/** Applies the saved choice, if any. */
export function restore() {
  const v = read();
  if (v) apply(v);
}

const opt = (f, sel) => `<option value="${f.name}"${f.name === sel ? ' selected' : ''}>${f.name}${f.src === WEB ? ' · web' : ''}</option>`;

/**
 * The lab's toggle button (for the bar) and its panel. `on` registers listeners for unmount.
 * `blocked()` true (say, a modal detail view is open) turns the lab's keys off.
 */
export function mountFontLab(root, on, { blocked = () => false } = {}) {
  const d = PAIRS[DEFAULT];
  let v = read() || { pair: DEFAULT, mono: d[1], label: d[2], size: d[3] };
  const btn = root.querySelector('#r-fonts');
  const panel = document.createElement('section');
  panel.id = 'r-fontlab';
  panel.className = 'fontlab';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Font lab');
  panel.innerHTML = `
    <header><b>FONT LAB</b> <span class="dim">try faces; F toggles</span><button class="btn mini" data-close aria-label="Close font lab">×</button></header>
    <label>Pair
      <span class="row"><button class="btn mini" data-step="-1" aria-label="Previous pair">‹</button>
      <select data-k="pair">${PAIRS.map((p, i) => `<option value="${i}">${i + 1}. ${p[0]}</option>`).join('')}</select>
      <button class="btn mini" data-step="1" aria-label="Next pair">›</button></span></label>
    <label>Data (monospace) <select data-k="mono">${MONOS.map((f) => opt(f, v.mono)).join('')}</select></label>
    <label>Labels <select data-k="label">${LABELS.map((f) => opt(f, v.label)).join('')}</select></label>
    <label>Size <span class="row"><input data-k="size" type="range" min="11" max="17" step="1" value="${v.size}"> <output class="num">${v.size}px</output></span></label>
    <p class="specimen"><span class="lab">GOLD</span> <span class="num">1,234,567</span> · <span class="lab">MIGHT</span> <span class="num">80,904</span><br><span class="dim">0O 1lI 5S 8B — Pikemen+ 6/0 ≈ 30,000g</span></p>
    <label class="check"><input type="checkbox" data-k="hover"> Row hover highlight</label>
    <p class="dim small">Web faces load from Google Fonts while testing; the chosen one gets self-hosted.</p>
    <button class="btn mini" data-reset>Reset to default</button>`;
  root.querySelector('.room').append(panel);
  const $ = (k) => panel.querySelector(`[data-k="${k}"]`);
  $('pair').value = String(v.pair ?? DEFAULT);
  $('hover').checked = rowHover();

  function set(next, fromPair) {
    v = { ...v, ...next };
    if (fromPair) {
      const p = PAIRS[v.pair];
      v = { ...v, mono: p[1], label: p[2], size: p[3] };
      $('mono').value = v.mono;
      $('label').value = v.label;
      $('size').value = v.size;
    }
    panel.querySelector('output').textContent = `${v.size}px`;
    apply(v);
    write(v);
  }
  const open = (yes = panel.hidden) => {
    panel.hidden = !yes;
    btn.setAttribute('aria-expanded', String(yes));
    if (yes) {
      root.querySelector('#r-palettelab [data-close]')?.click(); // one lab at a time; they share a spot
      $('pair').focus();
    }
  };

  on(btn, 'click', () => open());
  on(panel, 'click', (ev) => {
    if (ev.target.closest('[data-close]')) return open(false);
    if (ev.target.closest('[data-reset]')) { $('pair').value = String(DEFAULT); return set({ pair: DEFAULT }, true); }
    const step = ev.target.closest('[data-step]');
    if (step) {
      const i = (Number($('pair').value) + Number(step.dataset.step) + PAIRS.length) % PAIRS.length;
      $('pair').value = String(i);
      set({ pair: i }, true);
    }
  });
  on(panel, 'input', (ev) => {
    const k = ev.target.dataset.k;
    if (k === 'hover') rowHover(ev.target.checked);
    else if (k === 'pair') set({ pair: Number(ev.target.value) }, true);
    else if (k === 'size') set({ size: Number(ev.target.value) });
    else if (k) set({ [k]: ev.target.value });
  });
  on(document, 'keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || blocked()) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName) && !panel.contains(document.activeElement);
    if (typing) return;
    if ((ev.key === 'f' || ev.key === 'F') && !panel.contains(document.activeElement)) { ev.preventDefault(); open(); }
    else if (ev.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); }
    else if (!panel.hidden && (ev.key === '[' || ev.key === ']')) {
      panel.querySelector(`[data-step="${ev.key === '[' ? -1 : 1}"]`).click();
    }
  });
  apply(v);
}
