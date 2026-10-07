// Land and buildings: the sums, limits and reasons behind explore, build and raze orders, for every view.
// Plain data and words, no markup: each view draws its own forms. Prices are the server's (core/prices.js);
// when it sends none (an old server), callers fall back to ≈ estimates and MAX is off.
import { store, tickMs, nextTickAt } from './store.js';
import * as price from './prices.js';
import { fmt, SOLDIER } from './words.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const sum = (o) => Object.values(o || {}).reduce((a, x) => a + x, 0);

/** "12 ore, 4 timber" */
export const matText = (mats) => Object.entries(mats).map(([m, q]) => `${fmt(q)} ${m}`).join(', ');
/** "3 ticks" */
export const ticks = (t) => `${t} tick${t === 1 ? '' : 's'}`;
/** A number of ticks as a duration at the age's tick length: "40 min", "3.5 h". */
export const dur = (t) => {
  const ms = t * (store.age?.tick_ms || store.rules.params.tick_ms);
  const m = Math.round(ms / 60000);
  return m < 120 ? `${m} min` : `${Math.round(m / 6) / 10} h`;
};

// ---------- land ----------
/** Where your land is: built, being built, barren, and what's on the way (explored, or with armies). */
export function landSplit(h = store.house) {
  const built = sum(h.buildings), building = sum(h.constructing);
  const withArmies = (h.pending || []).filter((x) => x.kind === 'army').reduce((a, x) => a + (x.land || 0), 0);
  return { built, building, barren: h.barren, held: h.land, explored: Math.max(0, h.incoming_land - withArmies), withArmies, incoming: h.incoming_land };
}

/**
 * Land on its way, tick by tick, as Utopia shows it: for each of the next `n` ticks, the acres that arrive before
 * it (+1: before the next tick; +2: in the tick after; ...). Land arrives at its exact time, not on a tick, so
 * each job goes in the tick period it lands in. Returns { explored: [n], armies: [n], later: { explored, armies },
 * ends: [n] } where ends[k] is when period k+1 ends (the tick's time).
 */
export function landByTick(n = 24, h = store.house) {
  const t = tickMs(), now = Date.now(), next = nextTickAt() || now + t;
  const out = { explored: Array(n).fill(0), armies: Array(n).fill(0), later: { explored: 0, armies: 0 }, ends: Array.from({ length: n }, (_, k) => next + k * t) };
  for (const x of h.pending || []) {
    const acres = x.kind === 'explore' ? x.count : x.kind === 'army' ? x.land || 0 : 0;
    if (!acres) continue;
    const k = x.done_at <= next ? 0 : Math.ceil((x.done_at - next) / t);
    const key = x.kind === 'explore' ? 'explored' : 'armies';
    if (k < n) out[key][k] += acres; else out.later[key] += acres;
  }
  return out;
}

/**
 * Buildings being built, tick by tick (as landByTick): [{ id, ticks: [n], later }] per building, in rules order,
 * each count in the tick period it finishes in; and ends[k], when period k+1 ends.
 */
export function buildByTick(n = 24, h = store.house) {
  const t = tickMs(), now = Date.now(), next = nextTickAt() || now + t;
  const rows = new Map();
  for (const x of h.pending || []) {
    if (x.kind !== 'build' || !x.count) continue;
    if (!rows.has(x.what)) rows.set(x.what, { id: x.what, ticks: Array(n).fill(0), later: 0 });
    const r = rows.get(x.what), k = x.done_at <= next ? 0 : Math.ceil((x.done_at - next) / t);
    if (k < n) r.ticks[k] += x.count; else r.later += x.count;
  }
  const order = (store.rules?.buildings || []).map((b) => b.building);
  return { rows: [...rows.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)), ends: Array.from({ length: n }, (_, k) => next + k * t) };
}

// ---------- explore ----------
/** Why MAX finds no acres to explore. */
export const exploreWhy = () => (!price.have() ? '' : price.explorable() === 0 ? 'no explorable acres left: more come each tick (or ask a statemate for aid)' : store.house.units[SOLDIER] < price.exploreSoldiers(1) ? `no soldiers to settle land (${fmt(price.exploreSoldiers(1))} per acre, ${fmt(store.house.units[SOLDIER])} at home): draft more` : store.house.gold < price.exploreCost(1) ? 'not enough gold for one acre' : 'nothing fits');

// ---------- build ----------
/**
 * Several build rows at once ([{ id, n }]): what they cost together and what's left.
 * Returns { gold, barren, materials, left: { gold, barren, materials }, over } (over: more than you hold).
 */
export function buildTotals(rows, h = store.house) {
  const t = { gold: 0, barren: 0, materials: {} };
  for (const { id, n } of rows) {
    const c = n0(n);
    if (!c) continue;
    const cost = price.buildCost(id, c);
    t.gold += cost.gold;
    t.barren += c;
    for (const [m, q] of Object.entries(cost.materials)) t.materials[m] = (t.materials[m] || 0) + q;
  }
  const mats = {};
  for (const [m, q] of Object.entries(h.materials)) mats[m] = q - (t.materials[m] || 0);
  t.left = { gold: h.gold - t.gold, barren: h.barren - t.barren, materials: mats };
  t.over = t.barren > h.barren || t.gold > h.gold || Object.entries(t.materials).some(([m, q]) => q > (h.materials[m] || 0));
  return t;
}
/** What's wrong with one row on its own (the per-order limit, the building's cap), or ''. */
export function buildRowProblem(id, n) {
  const c = n0(n);
  if (!c) return '';
  if (c > price.buildLimit()) return `at most ${fmt(price.buildLimit())} per order`;
  if (c > price.buildRoom(id)) return `a house may own ${price.buildingPrice(id).max_count} at most`;
  return '';
}
/** The most of one building that fits what the other rows leave: { n, why } (why: the reason when n is 0). */
export function buildMaxRow(id, others) {
  const budget = buildTotals(others).left;
  const n = price.buildMax(id, budget);
  const why = budget.barren <= 0 ? 'no barren land left after the other rows' : price.buildRoom(id) <= 0 ? 'you already have as many as a house may own'
    : price.buildingPrice(id).gold > budget.gold ? 'not enough gold left after the other rows' : 'not enough materials';
  return { n, why };
}

// ---------- raze ----------
/** Gold to raze one building now: raze_cost_base + raze_cost_per_land_milli × land / 1000 (integer division, as the engine). */
export const razeEach = (h = store.house) => {
  const P = store.rules.params;
  return P.raze_cost_base + Math.floor((P.raze_cost_per_land_milli * h.land) / 1000);
};
/** The buildings you could raze (finished ones you own), in rules order. */
export const razeable = (h = store.house) => store.rules.buildings.filter((b) => (h.buildings[b.building] || 0) > 0);
/** The most of a building you can raze: what you own, and what your gold pays for. */
export const razeMax = (id, h = store.house) => Math.min(h.buildings[id] || 0, Math.floor(h.gold / Math.max(1, razeEach(h))));
/** Why n of a building can't be razed, or ''. */
export function razeProblem(id, n, h = store.house) {
  const have = h.buildings[id] || 0, gold = n0(n) * razeEach(h);
  return !id ? 'nothing built' : n0(n) > have ? `you have ${fmt(have)} of those` : gold > h.gold ? `needs ${fmt(gold)} gold; you have ${fmt(h.gold)}` : '';
}

