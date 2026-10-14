// Science, as every view shares it: categories, sciences, the rank ladder, and previews of an investment. Exact figures
// come from /me house.science and /rules. Previews use the engine's formula: an effect nears its limit and never reaches
// it, bonus = limit × r / (r + r_half), r being the 2.125th root of the books invested times science efficiency and
// r_half the root of the age's science_half_at (an older server's per_root × isqrt(invested) / 100 still works). The
// efficiency is read back from your current bonuses, so a preview is exact (to a basis point) once any science has books.
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

/** The engine's integer square root (the old formula). */
export const isqrt = (n) => Math.floor(Math.sqrt(Math.max(0, n)));
/** Old formula: one effect's raw bonus (before efficiency) at `invested` books, basis points, truncated like Rust. */
export const rawBp = (perRootBp, invested) => Math.trunc((Math.round(perRootBp * 100) * isqrt(invested)) / 100);
/** A science's root: the 2.125th root of its books. */
export const sciRoot = (n) => (n > 0 ? Math.pow(n, 1 / 2.125) : 0);
const halfRoot = () => sciRoot(store.rules?.params.science_half_at || 350000);
/** Limit formula: an effect's bonus, basis points, at a root already raised by efficiency. */
const curve = (limitBp, r) => (r > 0 ? Math.trunc((limitBp * r) / (r + halfRoot())) : 0);
/** How far along the limit curve `invested` books are, 0 to 1 (the same for every effect: bonus = limit × share). */
export const shareAt = (invested, mult = 1) => { const r = sciRoot(invested) * mult; return r > 0 ? r / (r + halfRoot()) : 0; };
/** Books at which a science gives half its limit, at efficiency `mult`. */
export const halfBooks = (mult = 1) => Math.pow(halfRoot() / mult, 2.125);
/** True when the rules use the limit curve (an older server's sciences have per_root_bp and no limit). */
export const hasCurve = () => defs().length > 0 && defs().every((d) => d.effects.every((e) => e.limit_bp != null));
/** One effect's bonus at `invested` books with efficiency `mult`, basis points, by whichever formula the rules use. */
export const effectBp = (e, invested, mult = 1) => (e.limit_bp != null ? curve(e.limit_bp, sciRoot(invested) * mult) : Math.trunc(rawBp(e.per_root_bp, invested) * mult));

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
      const b = row.bonus_bp[j];
      if (shared || b == null || !b) continue;
      if (e.limit_bp != null) {
        // b = L × x / (x + h), so x = b × h / (L − b); efficiency is x over the plain root.
        const L = e.limit_bp, root = sciRoot(row.invested);
        if (Math.abs(b) >= Math.abs(L) || !root) continue;
        return { mult: (b * halfRoot()) / (L - b) / root, exact: true };
      }
      const raw = rawBp(e.per_root_bp, row.invested);
      if (raw) return { mult: b / raw, exact: true };
    }
  }
  return { mult: 1, exact: false };
}
/** A science's effects at `invested` books: [{ stat, bp }], using the read-back efficiency. */
export function bonusAt(d, invested, eff = efficiency()) {
  return d.effects.map((e) => ({ stat: e.stat, bp: effectBp(e, invested, eff.mult) }));
}
export const rowOf = (id) => sci()?.sciences.find((r) => r.science === id) || null;
export const catOf = (d) => CATS.indexOf(d.category);
/** "+5.52% income, −3.64% build cost" */
export const effText = (list) => list.map((x) => `${pctBp(x.bp)} ${statLabel(x.stat)}`).join(', ') || '0';

/** The rank ladder from /rules: [{ from, books }] books per scientist a tick from `from` books written each. */
export const ranks = () => (store.rules?.params.science_ranks || []).map(([from, books]) => ({ from, books }));
const RANK_NAMES = ['recruit', 'scholar', 'master', 'professor'];
export const rankName = (i) => RANK_NAMES[i] || `rank ${i + 1}`;

