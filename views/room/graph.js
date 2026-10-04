// The resource graph: a second, smaller dialog above the RES detail with an inline-SVG line chart
// of one resource's level over the tick reports kept (up to 48). Esc closes it first and focus goes
// back to the row. Mouse over the chart, or focus it and use the arrow keys, to read a point.
import { store } from '../../core/store.js';
import { fmt, esc, fullTime } from '../../core/words.js';
import * as trend from './trend.js';

let W = 560; // the chart's width in SVG units: the box's own width, so labels stay at their real size
const H = 230, L = 58, R = 12, T = 12, B = 30;

/** A tidy step for about `n` gridlines over a span: 1, 2 or 5 times a power of ten. */
function niceStep(span, n = 4) {
  const raw = span / n || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
}
const short = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return fmt(v);
};

/** The chart's SVG for points [{tick, v}] (two or more). */
function chart(pts, label) {
  let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const t0 = pts[0].tick, t1 = pts[pts.length - 1].tick;
  const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const grid = [];
  for (let v = lo; v <= hi + step / 2; v += step) {
    grid.push(`<line class="g-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="g-lab" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(short(v))}</text>`);
  }
  const xs = niceStep(t1 - t0, 5);
  for (let t = Math.ceil(t0 / xs) * xs; t <= t1; t += xs) {
    grid.push(`<line class="g-tickm" x1="${x(t)}" x2="${x(t)}" y1="${H - B}" y2="${H - B + 4}"/><text class="g-lab" x="${x(t)}" y="${H - B + 16}" text-anchor="middle">T${t}</text>`);
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.tick).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const dots = pts.length <= 48 ? pts.map((p) => `<circle class="g-dot" cx="${x(p.tick)}" cy="${y(p.v)}" r="1.8"/>`).join('') : '';
  return {
    svg: `<svg class="g-svg" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(label)} by tick, T${t0} to T${t1}. Use the left and right arrow keys to read each point.">
      ${grid.join('')}<line class="g-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      <path class="g-line" d="${d}"/>${dots}
      <line class="g-cross" y1="${T}" y2="${H - B}" visibility="hidden"/><circle class="g-pt" r="4" visibility="hidden"/></svg>`,
    x, y,
  };
}

/** Mounts the graph dialog inside `host` (the RES detail dialog). Returns { open(key, label, from), close(), update() }. */
export function mountGraph(host) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg gdlg';
  dlg.setAttribute('aria-labelledby', 'r-g-title');
  dlg.innerHTML = `<header class="dlg-h"><h2 id="r-g-title"></h2><button type="button" class="btn ghost mini" data-gclose aria-label="Close graph (Esc)">ESC&nbsp;×</button></header>
    <div class="g-body"><p class="g-sum"></p><div class="g-chart"></div><p class="g-read dim" aria-live="polite"></p></div>`;
  host.append(dlg);
  let key = null, label = '', back = null, pts = [], geo = null, idx = -1;

  function point(i) {
    const svg = dlg.querySelector('.g-svg');
    if (!svg || !pts.length) return;
    idx = Math.max(0, Math.min(pts.length - 1, i));
    const p = pts[idx];
    const cx = geo.x(p.tick), cy = geo.y(p.v);
    const cross = svg.querySelector('.g-cross'), dot = svg.querySelector('.g-pt');
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
    const prev = pts[idx - 1];
    dlg.querySelector('.g-read').textContent = `Tick ${p.tick}: ${fmt(p.v)} ${label.toLowerCase()}${prev ? ` (${trend.signed(p.v - prev.v)} on the tick before)` : ''}${p.at ? ` · ${fullTime(p.at)}` : ''}`;
  }
  function render() {
    if (!key) return;
    pts = trend.series(key);
    dlg.querySelector('#r-g-title').innerHTML = `<span class="key">G</span>${esc(label.toUpperCase())} <span class="dim">level by tick</span>`;
    const box = dlg.querySelector('.g-chart');
    if (pts.length < 2) {
      dlg.querySelector('.g-sum').textContent = pts.length ? `Latest ${fmt(pts[0].v)} at tick ${pts[0].tick}.` : '';
      box.innerHTML = '<p class="dim">Not enough tick reports yet: graphs fill in as ticks pass.</p>';
      dlg.querySelector('.g-read').textContent = '';
      geo = null;
      return;
    }
    const a = pts[0], z = pts[pts.length - 1], ch = z.v - a.v;
    const pct = a.v ? ` (${ch >= 0 ? '+' : '−'}${Math.abs((100 * ch) / a.v).toFixed(1)}%)` : '';
    dlg.querySelector('.g-sum').innerHTML = `Latest <b class="num">${fmt(z.v)}</b> at T${z.tick} · over ${pts.length - 1} tick${pts.length === 2 ? '' : 's'} (T${a.tick}–T${z.tick}): <b class="num ${trend.tone(ch)}">${esc(trend.signed(ch))}${esc(pct)}</b>`;
    W = Math.max(280, Math.min(720, Math.round(box.clientWidth || 560)));
    geo = chart(pts, label);
    const hadFocus = box.contains(document.activeElement);
    box.innerHTML = geo.svg;
    if (hadFocus) box.querySelector('.g-svg').focus();
    const keep = idx;
    dlg.querySelector('.g-read').textContent = 'Hover the chart, or focus it and use ← →, to read a tick.';
    if (keep >= 0) point(Math.min(keep, pts.length - 1));
  }
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-gclose]')) dlg.close(); });
  dlg.addEventListener('close', () => { key = null; idx = -1; const b = back; back = null; if (b && b.isConnected) b.focus(); });
  dlg.addEventListener('mousemove', (ev) => {
    const svg = ev.target.closest('.g-svg');
    if (!svg || !geo) return;
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(geo.x(p.tick) - sx) < Math.abs(geo.x(pts[best].tick) - sx)) best = i; });
    point(best);
  });
  dlg.addEventListener('keydown', (ev) => {
    if (!ev.target.classList?.contains('g-svg') || !geo) return;
    const m = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[ev.key];
    if (m === undefined) return;
    ev.preventDefault();
    point(idx < 0 ? (m < 0 ? pts.length - 1 : 0) : m === -Infinity ? 0 : m === Infinity ? pts.length - 1 : idx + m);
  });

  return {
    open(k, lbl, from) {
      key = k; label = lbl; back = from || document.activeElement; idx = -1;
      if (!dlg.open) dlg.showModal();
      render();
      (dlg.querySelector('.g-svg') || dlg.querySelector('[data-gclose]')).focus();
    },
    close() { if (dlg.open) dlg.close(); },
    isOpen: () => dlg.open,
    update() { if (dlg.open) render(); },
  };
}
