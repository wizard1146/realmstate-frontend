// Straightline's view of one war, shared by the Wars page's Track window and your War page: a strip of what each side
// held when it began and holds now (houses, land, might, renown), and four charts of both sides tick by tick, side A
// in ink and side B in red, a gold line where it began. Data: /wars/:id/series (state totals over the ticks).
// Also the war's battles between the two states, as your house and your state's news tell them (warLedger).
import { api } from '../../core/api.js';
import { store, tickMs } from '../../core/store.js';
import { fmt, esc } from '../../core/words.js';

export const SERIES = [['land', 'Land'], ['might', 'Might'], ['houses', 'Houses'], ['renown', 'Renown']];
const same = (a, b) => a && b && a.realm === b.realm && a.state === b.state;
const signed = (n) => `<span class="${n > 0 ? 'up' : n < 0 ? 'down' : 'dim'}">${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}</span>`;
const pctOf = (n, base) => (base ? ` <span class="dim">(${n >= 0 ? '+' : '−'}${Math.abs((100 * n) / base).toFixed(1)}%)</span>` : '');

const cache = new Map();   // war id -> its series, or an Error (kept for the session; a war being fought reloads after a minute)
/** A war's series (/wars/:id/series), cached; an Error when it can't be had. */
export async function warSeries(id, fresh = false) {
  const c = cache.get(id);
  if (c && !fresh && !(c instanceof Error) && Date.now() - c.got < 60000) return c.d;
  let d;
  try { d = await api(`/wars/${id}/series`); } catch (e) { d = e; }
  cache.set(id, { d, got: Date.now() });
  return d;
}

/** The value at or just after tick t (the series' first value when t is before it). */
const at = (ticks, vs, t) => { const i = ticks.findIndex((x) => x >= t); return vs[i < 0 ? vs.length - 1 : i] ?? null; };
const last = (vs) => vs.filter((v) => v != null).slice(-1)[0];

let gid = 0;
/** One chart: both sides' lines with a soft fill under each, faint guide lines, a gold line where the war began. */
function chart(label, ticks, a, b, start) {
  const W = 600, H = 200, all = [...a, ...b].filter((v) => v != null);
  if (!ticks.length || !all.length) return '';
  const lo0 = Math.min(...all), hi0 = Math.max(...all), pad = (hi0 - lo0) * 0.08 || Math.max(1, hi0 * 0.05);
  const lo = Math.max(0, lo0 - pad), hi = hi0 + pad, span = hi - lo || 1, t0 = ticks[0], t1 = ticks[ticks.length - 1] || t0 + 1;
  const x = (t) => ((t - t0) / Math.max(1, t1 - t0)) * W, y = (v) => H - ((v - lo) / span) * H;
  const pts = (vs) => vs.map((v, i) => (v == null ? null : [x(ticks[i]), y(v)])).filter(Boolean);
  const id = `wv${++gid}`;
  const path = (vs, cls) => {
    const p = pts(vs);
    if (!p.length) return '';
    const d = p.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    return `<path class="fill ${cls}" fill="url(#${id}${cls})" d="${d}L${p[p.length - 1][0].toFixed(1)},${H}L${p[0][0].toFixed(1)},${H}Z"/><path class="line ${cls}" d="${d}"/>`;
  };
  const da = (last(a) ?? 0) - (at(ticks, a, start) ?? 0), db = (last(b) ?? 0) - (at(ticks, b, start) ?? 0);
  const sx = start >= t0 && start <= t1 ? x(start) : null;
  return `<figure class="wv-chart"><figcaption><span class="wv-k">${label}</span><span class="wv-now"><b class="a">${fmt(last(a) ?? 0)}</b> ${signed(da)}<i>·</i><b class="b">${fmt(last(b) ?? 0)}</b> ${signed(db)}</span></figcaption>
    <div class="wv-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${label}: both sides over the ticks">
      <defs>${['a', 'b'].map((c) => `<linearGradient id="${id}${c}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="g0 ${c}"/><stop offset="1" class="g1 ${c}"/></linearGradient>`).join('')}</defs>
      ${[0.25, 0.5, 0.75].map((f) => `<line class="grid" x1="0" x2="${W}" y1="${(H * f).toFixed(1)}" y2="${(H * f).toFixed(1)}"/>`).join('')}
      ${sx != null ? `<rect class="war" x="${sx.toFixed(1)}" y="0" width="${(W - sx).toFixed(1)}" height="${H}"/><line class="start" x1="${sx.toFixed(1)}" x2="${sx.toFixed(1)}" y1="0" y2="${H}"/>` : ''}
      ${path(a, 'a')}${path(b, 'b')}</svg>
      ${sx != null ? `<span class="wv-began" style="left:${((100 * sx) / W).toFixed(1)}%">war began</span>` : ''}
      <span class="wv-hi">${fmt(Math.round(hi0))}</span><span class="wv-lo">${fmt(Math.round(lo0))}</span></div>
    <span class="wv-axis"><span>tick ${fmt(t0)}</span><span>tick ${fmt(t1)}</span></span></figure>`;
}

/** The strip: for each side, each total when the war began, now, and the change. */
function strip(d, start, an, bn) {
  const row = (side, name, cls) => `<tr><th scope="row"><b class="${cls}">${name}</b></th>${SERIES.map(([k]) => {
    const vs = d[side]?.[k] || [], v0 = at(d.ticks, vs, start) ?? 0, v1 = last(vs) ?? 0;
    return `<td class="num"><span class="wv-was">${fmt(v0)} →</span> ${fmt(v1)}<br>${signed(v1 - v0)}${k === 'land' || k === 'might' ? pctOf(v1 - v0, v0) : ''}</td>`;
  }).join('')}</tr>`;
  return `<table class="tbl wv-strip"><caption class="vh">What each side held when the war began, and holds now</caption><thead><tr><th></th>${SERIES.map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr></thead>
    <tbody>${row('a_series', an, 'a')}${row('b_series', bn, 'b')}</tbody></table>`;
}

/**
 * A war's view, as HTML: the strip and the four charts. d: its series (or an Error); start: the tick it began;
 * an, bn: the sides' names (already escaped), in the series' order (a, b).
 */
export function warView(d, start, an, bn) {
  if (d instanceof Error) {
    return `<p class="dim">${d.status === 404 ? 'The game doesn\'t keep a history of each state yet, so this war can\'t be tracked.' : esc(d.message)}</p>`;
  }
  return `<div class="wv">${strip(d, start, an, bn)}<div class="wv-charts">${SERIES.map(([k, l]) => chart(l, d.ticks || [], d.a_series?.[k] || [], d.b_series?.[k] || [], start)).join('')}</div></div>`;
}

/** The series with its sides swapped (so your state reads first). */
export const swapped = (d) => (d instanceof Error ? d : { ...d, a: d.b, b: d.a, a_series: d.b_series, b_series: d.a_series });

/**
 * The war's battles between your state (`me`) and `foe` since tick `start`, from your news and your state's news:
 * { ours: { n, won, land, killed, lost }, theirs: { n, won, land, killed, lost }, byHouse: Map(house id -> acres net) }.
 * `ours` are your state's attacks on them (land taken), `theirs` theirs on you (land you lost). Statemates' news
 * reaches you only when they're people, or robots since the game began keeping it; veiled attackers can't be told.
 */
export function warLedger(me, foe, start) {
  const since = (store.nextAt || Date.now()) - (store.tick + 1 - start) * tickMs();
  const items = [...(store.news || []), ...(store.stateNews || [])].filter((n) => (n.at || 0) >= since);
  const sum = (xs) => (xs || []).reduce((s, v) => s + (Number(v) || 0), 0);
  const ours = { n: 0, won: 0, land: 0, killed: 0, lost: 0 }, theirs = { n: 0, won: 0, land: 0, killed: 0, lost: 0 };
  const byHouse = new Map(), add = (id, v) => byHouse.set(id, (byHouse.get(id) || 0) + v);
  const mine = (n) => n.house ?? store.house?.id;
  const seen = new Set();   // the same battle can arrive twice (your news and your state's)
  for (const n of items) {
    const k = `${n.type}:${n.at}:${mine(n)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (n.type === 'attack_report' && same(n.target, foe)) {
      ours.n++; if (n.success) ours.won++;
      const land = n.success ? Number(n.land) || 0 : 0;
      ours.land += land; ours.killed += sum(n.enemy_lost); ours.lost += sum(n.troops_lost);
      add(mine(n), land); add(n.target.house, -land);
    } else if (n.type === 'attacked' && n.by && same(n.by, foe)) {
      theirs.n++; if (n.success) theirs.won++;
      const land = Number(n.land_lost) || 0;
      theirs.land += land; theirs.lost += sum(n.troops_lost);
      add(mine(n), -land); add(n.by.house, land);
    }
  }
  return { ours, theirs, byHouse, me };
}
