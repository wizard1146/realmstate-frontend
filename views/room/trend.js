// Per-tick change and history for each resource, from the tick reports (/ticks and each live tick,
// newest first, at most 48). A report holds the deltas (gold, food, ..., materials {id: delta}) and
// `levels` {key: level after the tick}.
import { store } from '../../core/store.js';
import { fmt } from '../../core/words.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const sum = (a) => a.reduce((x, y) => x + y, 0);

/** Resource rows for the RES detail: [key, label, held now (or null to use the latest level)]. */
export function resourceRows(h = store.house) {
  return [
    ['gold', 'Gold', h.gold], ['food', 'Food', h.food], ['peasants', 'Peasants', h.peasants],
    ['soldiers', 'Soldiers', h.units[0]], ['troops', 'Troops (home, all units)', sum(h.units)],
    ['land', 'Land', h.land], ['incoming_land', 'Land incoming', h.incoming_land],
    ['books', 'Books', null], ['renown', 'Renown', h.renown], ['horses', 'Horses', h.horses],
    ...Object.keys(h.materials).map((m) => [m, cap(m), h.materials[m]]),
  ];
}
/** The change one report records for a key (materials included). */
export function deltaOf(r, key) {
  if (!r) return null;
  if (typeof r[key] === 'number') return r[key];
  if (r.materials && typeof r.materials[key] === 'number') return r.materials[key];
  return null;
}
/** The change over the last tick, or null when no report has it. */
export const lastDelta = (key) => deltaOf(store.ticks[0], key);
/** The mean change over the last n ticks (as many as there are), or null with fewer than 2. */
export function avgDelta(key, n = 12) {
  const v = store.ticks.slice(0, n).map((r) => deltaOf(r, key)).filter((x) => x != null);
  return v.length < 2 ? null : sum(v) / v.length;
}
/** The latest level the reports know for a key (for rows the house doesn't send, like books). */
export const latestLevel = (key) => store.ticks[0]?.levels?.[key] ?? null;
/** Levels oldest first: [{ tick, at, v }]. */
export function series(key) {
  return store.ticks.filter((r) => r.levels && typeof r.levels[key] === 'number')
    .map((r) => ({ tick: r.tick, at: r.at, v: r.levels[key] })).reverse();
}
/** "+1,234" / "−56" / "0"; fractions to one place. */
export function signed(n) {
  if (n == null) return '·';
  const r = Math.abs(n) < 10 && !Number.isInteger(n) ? Math.round(Math.abs(n) * 10) / 10 : Math.round(Math.abs(n));
  return `${n > 0 && r ? '+' : n < 0 && r ? '−' : ''}${fmt(r)}`;
}
/** A cell class for a change: up, down or zero. */
export const tone = (n) => (n == null || Math.round(n * 10) === 0 ? 'zero' : n > 0 ? 'up' : 'down');
