// Science, as every view shares it: categories, sciences, the rank ladder, and previews of an investment. Exact figures
// come from /me house.science and /rules. Previews use the engine's formula (bonus = per_root × isqrt(invested) / 100,
// then science efficiency); the efficiency is read back from your current bonuses, so a preview is exact once any
// science has books.
import { store } from './store.js';
import { STATS, pctBp } from './does.js';

export const CATS = ['economy', 'military', 'arcane'];
export const CAT_SHORT = { economy: 'ECON', military: 'MIL', arcane: 'ARC' };
export const sci = () => store.house?.science || null;
export const defs = () => store.rules?.sciences || [];
const snake = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
/** A rules stat ("ConstructionCost") in words ("build cost"). */
export const statLabel = (s) => (STATS[snake(s)] ? STATS[snake(s)][0] : snake(s).replace(/_/g, ' '));
export const statLong = (s) => (STATS[snake(s)] ? STATS[snake(s)][1] : '');

/** The engine's integer square root. */
export const isqrt = (n) => Math.floor(Math.sqrt(Math.max(0, n)));
/** One effect's raw bonus (before efficiency) at `invested` books, basis points, truncated like Rust. */
export const rawBp = (perRootBp, invested) => Math.trunc((Math.round(perRootBp * 100) * isqrt(invested)) / 100);

/**
 * Science efficiency as a multiplier, read back from a science whose bonus the server sent
 * (libraries and Wise academics raise it). { mult, exact }: exact false when nothing is invested yet.
 */
export function efficiency() {
  const s = sci();
  if (!s) return { mult: 1, exact: false };
  for (const row of s.sciences) {
    const d = defs().find((x) => x.science === row.science);
    if (!d || !row.invested) continue;
    // Only effects no other science shares, so the server's bonus is this science's alone.
    for (const [j, e] of d.effects.entries()) {
      const shared = defs().some((o) => o !== d && o.effects.some((f) => f.stat === e.stat));
      const raw = rawBp(e.per_root_bp, row.invested);
      if (!shared && raw && row.bonus_bp[j] != null) return { mult: row.bonus_bp[j] / raw, exact: true };
    }
  }
  return { mult: 1, exact: false };
}
/** A science's effects at `invested` books: [{ stat, bp }], using the read-back efficiency. */
export function bonusAt(d, invested, eff = efficiency()) {
  return d.effects.map((e) => ({ stat: e.stat, bp: Math.trunc(rawBp(e.per_root_bp, invested) * eff.mult) }));
}
export const rowOf = (id) => sci()?.sciences.find((r) => r.science === id) || null;
export const catOf = (d) => CATS.indexOf(d.category);
/** "+5.52% income, −3.64% build cost" */
export const effText = (list) => list.map((x) => `${pctBp(x.bp)} ${statLabel(x.stat)}`).join(', ') || '0';

/** The rank ladder from /rules: [{ from, books }] books per scientist a tick from `from` books written each. */
export const ranks = () => (store.rules?.params.science_ranks || []).map(([from, books]) => ({ from, books }));
const RANK_NAMES = ['recruit', 'scholar', 'master', 'professor'];
export const rankName = (i) => RANK_NAMES[i] || `rank ${i + 1}`;

