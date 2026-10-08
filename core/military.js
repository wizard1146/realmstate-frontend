// Military logic every view shares: who is under arms, the workshop's jobs (medics, upgrades, chariots, refining) and
// training by tick. Costs follow the engine (military.rs, buildings.rs):
//   medics:   n × medic_gold gold + n × medic_material_cost medic material + n peasants (exact)
//   upgrade:  n × upgrade_cost (upgrade_cost_elite for elites) upgrade material, × your
//             upgrade-cost modifier (exact from prices.upgrade; ≈ on an old server)
//   chariots: n × chariot_horses horses + chariot_material_cost material + chariot_gold gold (exact)
//   refine:   the age's recipes (/rules recipes); the yield × your refining modifier (prices.refine).
import { store, raceOf, tickMs, nextTickAt } from './store.js';
import * as act from './actions.js';
import * as price from './prices.js';
import { fmt, ELITE_PP } from './words.js';

const sum = (a) => (a || []).reduce((x, y) => x + y, 0);
/** Everyone under arms (every unit home and away, and in training) and its share of the population. */
export function armed(h = store.house) {
  const n = sum(h.units) + sum(h.away) + (h.training || 0);
  return { armed: n, pct: h.population > 0 ? (100 * n) / h.population : 0 };
}

/**
 * What finishes in each of the next n ticks: a row per unit slot in training, medics, and armies coming home.
 * Returns { rows: [{ id: slot | 'medics' | 'army', ticks[], later }], ends } as core/land.js buildByTick.
 */
export function trainByTick(n = 24, h = store.house) {
  const t = tickMs(), now = Date.now(), next = nextTickAt() || now + t;
  const rows = new Map();
  const add = (id, at, count) => {
    if (!count) return;
    if (!rows.has(id)) rows.set(id, { id, ticks: Array(n).fill(0), later: 0 });
    const r = rows.get(id), k = at <= next ? 0 : Math.ceil((at - next) / t);
    if (k < n) r.ticks[k] += count; else r.later += count;
  };
  for (const x of h.pending || []) {
    if (x.kind === 'train') add(x.slot, x.done_at, x.count);
    else if (x.kind === 'medics') add('medics', x.done_at, x.count);
    else if (x.kind === 'army') add('army', x.done_at, sum(x.units) || x.count);
  }
  const rank = (id) => (id === 'army' ? 99 : id === 'medics' ? 98 : [0, 1, 5, 2, 6, 3, 7, 9, 4].indexOf(id));
  return { rows: [...rows.values()].sort((a, b) => rank(a.id) - rank(b.id)), ends: Array.from({ length: n }, (_, k) => next + k * t) };
}

const BATCH = 1000000;
const ELITE_SLOTS = [3, 7, ELITE_PP];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const stock = (m) => store.house.materials[m] || 0;

/** The age's refining recipes as [{ id, inputs: {material: qty}, output, quantity }], or null if the server doesn't send them. */
export function recipes() {
  const r = store.rules.recipes || store.rules.params.recipes;
  if (!Array.isArray(r)) return null;
  return r.map((x) => ({ id: x.recipe ?? x.id, inputs: Array.isArray(x.inputs) ? Object.fromEntries(x.inputs) : x.inputs || {}, output: x.output, quantity: x.quantity }));
}
/** Materials no realm produces (made by refining), from /market, when the recipes are unknown. */
const derived = () => (store.market || []).filter((m) => !m.output_per_tick && !(m.realms || []).length);

/**
 * Every job: { id, group, label, each, quote(n) -> { text, title, short, exact }, max() -> [n, why], send(n, opts) }.
 */
export function jobs() {
  const P = store.rules.params;
  const h = store.house;
  const race = raceOf(h.race) || { units: [] };
  const out = [];
  // medics
  const mm = P.medic_material;
  out.push({
    id: 'medics', group: 'TRAIN', label: 'Medics',
    each: `${fmt(P.medic_gold)}g + ${fmt(P.medic_material_cost)} ${mm} + 1 peasant`,
    quote(n) {
      const g = n * P.medic_gold, m = n * P.medic_material_cost;
      const why = g > h.gold ? `needs ${fmt(g)} gold; you have ${fmt(h.gold)}` : m > stock(mm) ? `needs ${fmt(m)} ${mm}; you have ${fmt(stock(mm))}` : n > h.peasants ? `needs ${fmt(n)} peasants; you have ${fmt(h.peasants)}` : n > BATCH ? `at most ${fmt(BATCH)} at a time` : '';
      return { text: `${fmt(g)}g +${fmt(m)} ${mm}`, short: !!why, why, exact: true, title: why ? `Can't: ${why}` : `Exact: ${fmt(g)} gold, ${fmt(m)} ${mm} and ${fmt(n)} peasants; ready in about ${P.train_ticks} ticks` };
    },
    max() {
      const n = Math.min(BATCH, Math.floor(h.gold / Math.max(1, P.medic_gold)), P.medic_material_cost ? Math.floor(stock(mm) / P.medic_material_cost) : BATCH, h.peasants);
      return [n, h.gold < P.medic_gold ? 'not enough gold for one' : stock(mm) < P.medic_material_cost ? `no ${mm} (buy some on the MARKET)` : 'no peasants'];
    },
    send: (n, o) => act.trainMedics(n, o),
  });
  // upgrades: offense, defense, elite, and elite+ -> elite++ (races that upgrade twice; the server decides)
  const um = P.upgrade_material;
  const ups = [[1, 5], [2, 6], [3, 7]];
  // Elite+ -> elite++ only for races with the flag (unknown on an old server: offer it, the server decides).
  if (race.units[ELITE_PP] && price.raceHas(h.race, 'elite_plus_plus') !== false) ups.push([7, ELITE_PP]);
  for (const [from, to] of ups) {
    const per = ELITE_SLOTS.includes(from) ? P.upgrade_cost_elite : P.upgrade_cost;
    // Exact when the server sends prices.upgrade; otherwise ≈ before the modifier.
    const exact = price.upgradeCost(from, 1) != null;
    const cost = (n) => (exact ? price.upgradeCost(from, n) : n * per);
    const ap = exact ? '' : '≈';
    const fu = race.units[from] || { name: `slot ${from}` }, tu = race.units[to] || { name: `slot ${to}` };
    out.push({
      id: `upgrade:${from}`, group: 'UPGRADE', label: `${fu.name} → ${tu.name}`,
      note: from === 7 ? 'races that upgrade twice' : '',
      // The rate, not one unit's cost: the server rounds the whole order down, so 1 × 0.9 would read as 0.
      each: `${ap}${exact ? +(cost(10000) / 10000).toFixed(2) : fmt(per)} ${um}`,
      quote(n) {
        const m = cost(n);
        const why = n > h.units[from] ? `you have ${fmt(h.units[from])} ${fu.name} at home` : m > stock(um) ? `needs ${ap}${fmt(m)} ${um}; you have ${fmt(stock(um))}` : '';
        return { text: `${ap}${fmt(m)} ${um}`, short: !!why, why, exact, title: why ? `Can't: ${why}` : `${exact ? 'Exact' : `≈ before your upgrade-cost modifier (an old server doesn't send it)`}: ${fmt(m)} ${um}. ${fmt(n)} ${fu.name} train for about ${P.train_ticks} ticks.` };
      },
      max() {
        const n = exact ? price.largest(Math.min(BATCH, h.units[from]), (k) => cost(k) <= stock(um)) : Math.min(BATCH, h.units[from], per ? Math.floor(stock(um) / per) : BATCH);
        return [n, !h.units[from] ? `no ${fu.name} at home` : `no ${um} (buy some on the MARKET)`];
      },
      send: (n, o) => act.upgrade(from, n, o),
    });
  }
  // chariots
  const cm = P.chariot_material;
  out.push({
    id: 'chariots', group: 'BUILD', label: 'Chariots',
    each: `${fmt(P.chariot_horses)} horse + ${fmt(P.chariot_material_cost)} ${cm} + ${fmt(P.chariot_gold)}g`,
    quote(n) {
      const hs = n * P.chariot_horses, m = n * P.chariot_material_cost, g = n * P.chariot_gold;
      const why = hs > h.horses ? `needs ${fmt(hs)} horses at home; you have ${fmt(h.horses)}` : m > stock(cm) ? `needs ${fmt(m)} ${cm}; you have ${fmt(stock(cm))}` : g > h.gold ? `needs ${fmt(g)} gold; you have ${fmt(h.gold)}` : '';
      return { text: `${fmt(g)}g +${fmt(hs)}h +${fmt(m)} ${cm}`, short: !!why, why, exact: true, title: why ? `Can't: ${why}` : `Exact: ${fmt(hs)} horses, ${fmt(m)} ${cm} and ${fmt(g)} gold. Ready at once.` };
    },
    max() {
      const d = (have, per) => (per ? Math.floor(have / per) : BATCH);
      const n = Math.min(BATCH, d(h.horses, P.chariot_horses), d(stock(cm), P.chariot_material_cost), d(h.gold, P.chariot_gold));
      return [n, h.horses < P.chariot_horses ? 'no horses at home (stables breed them)' : stock(cm) < P.chariot_material_cost ? `no ${cm} (refine or buy some)` : 'not enough gold'];
    },
    send: (n, o) => act.buildChariots(n, o),
  });
  // refining
  const rs = recipes();
  if (rs) {
    for (const r of rs) {
      const ins = Object.entries(r.inputs);
      out.push({
        id: `refine:${r.id}`, group: 'REFINE', label: `${cap(r.output)}`,
        each: `${ins.map(([m, q]) => `${fmt(q)} ${m}`).join(' + ')} → ${fmt(r.quantity)}`,
        quote(n) {
          const short = ins.find(([m, q]) => n * q > stock(m));
          const why = short ? `needs ${fmt(n * short[1])} ${short[0]}; you have ${fmt(stock(short[0]))}` : '';
          const made = price.refineYield(r.quantity, n);
          const out = made ?? n * r.quantity;
          return { text: `${ins.map(([m, q]) => `${fmt(n * q)} ${m}`).join(' +')} → ${made == null ? '≈' : ''}${fmt(out)}`, short: !!why, why, exact: true, title: why ? `Can't: ${why}` : `Exact inputs; makes ${fmt(out)} ${r.output}${made == null ? ' before your refining-yield modifier' : ''}. At once.` };
        },
        max() { return [Math.min(BATCH, ...ins.map(([m, q]) => Math.floor(stock(m) / q))), `not enough ${ins.map(([m]) => m).join(' or ')}`]; },
        send: (n, o) => act.refine(r.id, n, o),
      });
    }
  } else {
    for (const m of derived()) {
      out.push({
        id: `refine:${m.material}`, group: 'REFINE', label: m.name || cap(m.material), noMax: true,
        each: m.description || 'recipe not sent',
        quote: () => ({ text: 'inputs ?', short: false, exact: false, title: `The server doesn't send this age's recipes yet, so the inputs aren't known here: ${m.description || ''} The result line says what was made, or what was missing.` }),
        max: () => [null, 'the server does not send recipes'],
        send: (n, o) => act.refine(m.material, n, o),
      });
    }
  }
  return out;
}
export const jobById = (id) => jobs().find((j) => j.id === id);
