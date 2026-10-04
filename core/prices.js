// Exact prices and order limits, from /me house.prices (the server's own numbers after every
// modifier). Integer maths only, matching the engine:
//   apply(base, bp) = floor(base * max(0, 10000 + bp) / 10000)
// If the server is too old to send prices, `have()` is false and callers fall back to estimates.
import { store, raceOf } from './store.js';

/** The engine's Ruleset::apply. Values stay well inside 2^53 for any legal order. */
export const apply = (base, bp) => Math.floor((base * Math.max(0, 10000 + (bp || 0))) / 10000);

const P = () => store.house?.prices || null;
/** Whether the server sent exact prices. */
export const have = () => !!P();

/** Largest n in [0, hi] with ok(n) true; ok must be monotone (true up to some n, then false). */
export function largest(hi, ok) {
  let lo = 0;
  hi = Math.max(0, Math.floor(hi));
  if (ok(hi)) return hi;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (ok(mid)) lo = mid; else hi = mid - 1;
  }
  return lo;
}

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));

// ---------- explore ----------
export const exploreLimit = () => P()?.explore.max ?? 1000;
/** Gold to explore n acres. */
export function exploreCost(n) {
  const e = P().explore;
  return apply(n0(n) * e.gold_per_acre, e.bp);
}
/** Soldiers (slot 0) spent to explore n acres: ceil(n * soldiers_milli_per_acre / 1000); 0 on an old server. */
export function exploreSoldiers(n) {
  const m = P()?.explore.soldiers_milli_per_acre || 0;
  return Math.ceil((n0(n) * m) / 1000);
}
/** Most acres you can explore now: gold, soldiers at home and the per-order limit. */
export function exploreMax(gold = store.house.gold, soldiers = store.house.units[0]) {
  return largest(exploreLimit(), (n) => exploreCost(n) <= gold && exploreSoldiers(n) <= soldiers);
}
/** Why n acres can't be explored now, or '' if they can. */
export function exploreProblem(n, h = store.house) {
  const c = n0(n);
  if (!c) return '';
  if (c > exploreLimit()) return `at most ${exploreLimit().toLocaleString('en-US')} acres per order`;
  const s = exploreSoldiers(c);
  if (s > h.units[0]) return `needs ${s.toLocaleString('en-US')} soldiers to settle; you have ${h.units[0].toLocaleString('en-US')} at home (draft more in MIL)`;
  if (exploreCost(c) > h.gold) return `needs ${exploreCost(c).toLocaleString('en-US')} gold; you have ${h.gold.toLocaleString('en-US')}`;
  return '';
}

// ---------- train ----------
export const trainLimit = () => P()?.train.max ?? 1000000;
const unitGold = (slot) => (raceOf(store.house?.race)?.units[Number(slot)] || {}).gold || 0;
/** The extra on recruiting straight from peasants, in basis points (+30% now). */
export const directBp = () => P()?.train.direct_bp ?? store.rules?.params.direct_cost_bp ?? 0;
/**
 * Gold to train n of a unit slot. From soldiers: apply(n * gold, bp). Straight from peasants
 * (direct): apply(apply(n * gold, bp), direct_bp).
 */
export function trainCost(slot, n, direct = false) {
  const c = apply(n0(n) * unitGold(slot), P().train.bp);
  return direct ? apply(c, directBp()) : c;
}
/** Who a training order draws on: soldiers (slot 0), or peasants when direct. */
export const trainPool = (direct, h = store.house) => (direct ? h.peasants : h.units[0]);
/** Most of a unit you can train now: soldiers (or peasants, direct), gold and the per-order limit. */
export function trainMax(slot, direct = false, h = store.house) {
  const cap = Math.min(trainLimit(), trainPool(direct, h));
  return largest(cap, (n) => trainCost(slot, n, direct) <= h.gold);
}

// ---------- build ----------
export const buildLimit = () => P()?.build.max ?? 100000;
/** { gold, materials: {material: per_building}, max_count } for a building identity. */
export const buildingPrice = (id) => P()?.build.buildings[id] || null;
/** Exact cost of n of a building: { gold, materials: {material: qty} } (materials only where > 0). */
export function buildCost(id, n) {
  const b = buildingPrice(id);
  const c = n0(n);
  const out = { gold: 0, materials: {} };
  if (!b || !c) return out;
  out.gold = c * b.gold;
  for (const [m, per] of Object.entries(b.materials)) {
    const q = apply(c * per, P().build.materials_bp);
    if (q) out.materials[m] = q;
  }
  return out;
}
/** How many more of a building the house may own (Infinity when uncapped). */
export function buildRoom(id, h = store.house) {
  const b = buildingPrice(id);
  if (!b || !b.max_count) return Infinity;
  return Math.max(0, b.max_count - (h.buildings[id] || 0) - (h.constructing[id] || 0));
}
/**
 * Most of a building that fits a budget { gold, barren, materials: {m: qty} }: the per-order
 * limit, barren acres, gold, each material and the building's max_count.
 */
export function buildMax(id, budget) {
  const b = buildingPrice(id);
  if (!b) return 0;
  const cap = Math.min(buildLimit(), budget.barren, buildRoom(id), b.gold ? Math.floor(budget.gold / b.gold) : Infinity);
  if (!(cap > 0)) return 0;
  return largest(cap, (n) => Object.entries(buildCost(id, n).materials).every(([m, q]) => q <= (budget.materials[m] || 0)));
}
/** What you hold that building draws on. */
export const buildBudget = (h = store.house) => ({ gold: h.gold, barren: h.barren, materials: { ...h.materials } });

/** Why n of a building can't be built from this budget, or '' if it can. */
export function buildProblem(id, n, budget) {
  const c = n0(n);
  if (!c) return '';
  if (c > buildLimit()) return `at most ${buildLimit().toLocaleString('en-US')} per order`;
  if (c > buildRoom(id)) return `a house may own ${buildingPrice(id).max_count} at most`;
  if (c > budget.barren) return 'not enough barren land';
  const cost = buildCost(id, c);
  if (cost.gold > budget.gold) return 'not enough gold';
  for (const [m, q] of Object.entries(cost.materials)) if (q > (budget.materials[m] || 0)) return `not enough ${m}`;
  return '';
}

// ---------- upgrades, mercenaries, refining, generals (null on a server too old to send them) ----------
const ELITES = [3, 7, 9];
/** Upgrade material for n of slot `from`: apply(n * each, bp), elites at the elite price. */
export function upgradeCost(from, n) {
  const u = P()?.upgrade;
  if (!u) return null;
  return apply(n0(n) * (ELITES.includes(Number(from)) ? u.elite : u.each), u.bp);
}
/** Gold to hire n mercenaries for an attack: apply(n * gold, bp). */
export function mercenaryCost(n) {
  const m = P()?.mercenary;
  return m ? apply(n0(n) * m.gold, m.bp) : null;
}
/** What `times` runs of a recipe make: apply(quantity * times, bp). */
export function refineYield(quantity, times) {
  const r = P()?.refine;
  return r ? apply(n0(quantity) * n0(times), r.bp) : null;
}
/** A general with `traits` traits: { elites, material, amount, max }. */
export function generalCost(traits) {
  const g = P()?.general;
  return g ? { elites: g.elites, material: g.material, amount: apply(g.per_trait * n0(traits), g.bp), max: g.max } : null;
}
/** Whether a race (identity) has a flag, e.g. 'elite_plus_plus'; null if the server doesn't send flags. */
export function raceHas(race, flag) {
  const r = raceOf(race);
  return Array.isArray(r?.flags) ? r.flags.includes(flag) : null;
}
