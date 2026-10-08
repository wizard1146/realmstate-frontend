// Attacks, as every view shares them: which units can attack, what a kind needs, the army's quote (troops, raw offense,
// mercenary gold, problems) and each extra's MAX. Rules (from the engine's attack checks):
//  - one mount (horse or chariot) per troop sent, thieves excluded, mercenaries included;
//  - at most one mercenary per `mercenary_ratio` of your own troops sent, `mercenary_gold` each;
//  - mercenaries fight with your race's slot-8 stats; survivors leave after the battle;
//  - races may differ: their own mercenary ratio, upgraded mercenaries (the upgrade material each,
//    upgrade_bonus_bp stronger), and keeping a second strike (at war, a general with enough traits).
import { store, slotUsed } from './store.js';
import * as price from './prices.js';
import { fmt, esc, names, MERC, THIEF, UNIT_ORDER } from './words.js';

const ELITE_SLOTS = [3, 7, 9];

/** The unit slots that can attack: anything with offense, thieves excepted. */
export const attackSlots = (race) => UNIT_ORDER.filter((i) => i !== THIEF && (race.units[i]?.off || 0) > 0 && slotUsed(race, i));
/** Kinds that let you choose the building the land comes from first (Flanked Ambush). */
export const buildingChoice = (kindId) => !!(store.rules?.params.attacks || []).find((x) => x.id === kindId)?.choose_building;
export const buildingOptions = () => `<option value="">any (spread over every building)</option>${(store.rules?.buildings || []).map((b) => `<option value="${esc(b.building)}">${esc(b.name)}</option>`).join('')}`;

/** What an attack kind needs, in a sentence. */
export function attackHint(kindId) {
  const k = store.rules.params.attacks.find((x) => x.id === kindId);
  if (!k) return '';
  const need = [k.own_state ? 'own state only' : 'other states only'];
  if (k.range_min_bp) need.push(`target ≥ ${k.range_min_bp / 100}% of your land`);
  if (k.requires_trait) need.push(`a ${names.traits[k.requires_trait] || k.requires_trait} general leading`);
  if (k.requires_building) need.push(`a finished ${names.buildings[k.requires_building] || k.requires_building}`);
  if (k.cost_material) need.push(`1 ${k.cost_material} per ${k.troops_per_material} troops`);
  if (k.war_only) need.push('war only');
  return `${k.name}: takes ${k.takes}; ${need.join('; ')}.`;
}

export const EXTRAS = ['medics', 'horses', 'chariots', 'mercs', 'upmercs'];
/** One mercenary per this many of your own troops: your race's ratio (from prices), else the age's. */
export const mercRatio = () => Math.max(1, store.house?.prices?.mercenary?.ratio ?? store.rules.params.mercenary_ratio);
const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const ratio = mercRatio;
/** A unit's offense as your house fights now (race bonuses, mirroring), else the race's. */
const offOf = (race, slot) => store.house?.unit_points?.[slot]?.[0] ?? race.units[slot]?.off ?? 0;

/** Reads the extras from a form scope. */
export function readExtras(scope) {
  const out = {};
  for (const k of EXTRAS) out[k] = num(scope.querySelector(`[data-x="${k}"]`)?.value);
  out.double = !!scope.querySelector('[data-x="double"]')?.checked;
  return out;
}

/**
 * The quote for an attack: units by slot (own troops, no mercenaries), extras from readExtras.
 * Returns { own, riders, off, mercMax, mercGold, mountMax, problems: [text] }.
 */
export function attackQuote(race, units, x) {
  const P = store.rules.params;
  const h = store.house;
  let own = 0, riders = 0, off = 0;
  units.forEach((n, slot) => {
    if (!n || slot === MERC) return;
    own += n;
    if (slot !== THIEF) riders += n;
    off += n * offOf(race, slot);
  });
  const mercOff = offOf(race, MERC) || (P.mercenary_off ?? 0);
  const mercMax = Math.floor(own / ratio());
  // Exact with your mercenary-cost modifier when the server sends it.
  const mercGold = price.mercenaryCost(x.mercs) ?? x.mercs * P.mercenary_gold;
  riders += x.mercs;
  off += x.mercs * mercOff + x.horses * P.horse_offense + x.chariots * P.chariot_offense;
  // Upgraded mercenaries: stronger, for the upgrade material.
  const up = x.upmercs || 0;
  off += Math.floor(up * mercOff * P.upgrade_bonus_bp / 10000);
  const upCost = up ? (price.upgradeCost(1, up) ?? up * P.upgrade_cost) : 0;
  const problems = [];
  if (x.mercs > mercMax) problems.push(`at most ${fmt(mercMax)} mercenaries with ${fmt(own)} of your own troops (1 per ${ratio()})`);
  if (up > x.mercs) problems.push(`only ${fmt(x.mercs)} mercenaries hired to upgrade`);
  if (upCost > (h.materials[P.upgrade_material] || 0)) problems.push(`upgrading ${fmt(up)} mercenaries takes ${fmt(upCost)} ${P.upgrade_material}; you have ${fmt(h.materials[P.upgrade_material] || 0)}`);
  if (mercGold > h.gold) problems.push(`${fmt(x.mercs)} mercenaries cost ${fmt(mercGold)} gold; you have ${fmt(h.gold)}`);
  if (x.medics > h.medics) problems.push(`${fmt(h.medics)} medics at home`);
  if (x.horses > h.horses) problems.push(`${fmt(h.horses)} horses at home`);
  if (x.chariots > h.chariots) problems.push(`${fmt(h.chariots)} chariots at home`);
  if (x.horses + x.chariots > riders) problems.push(`one mount per troop: ${fmt(riders)} troops sent`);
  return { own, riders, off, mercMax, mercGold, mountMax: riders, problems };
}

/** MAX for one extra, given the current form: [value, why-if-zero]. */
export function extraMax(k, q, x) {
  const P = store.rules.params;
  const h = store.house;
  if (k === 'medics') return [h.medics, 'no medics at home (train some in MIL)'];
  if (k === 'horses') return [Math.min(h.horses, Math.max(0, q.riders - x.chariots)), h.horses ? 'every troop sent already has a mount: send more troops' : 'no horses at home'];
  if (k === 'chariots') return [Math.min(h.chariots, Math.max(0, q.riders - x.horses)), h.chariots ? 'every troop sent already has a mount: send more troops' : 'no chariots at home (build some in MIL)'];
  const byGold = price.mercenaryCost(1) != null ? price.largest(q.mercMax, (n) => price.mercenaryCost(n) <= h.gold) : Math.floor(h.gold / Math.max(1, P.mercenary_gold));
  if (k === 'upmercs') {
    const have = h.materials[P.upgrade_material] || 0;
    const byStock = price.upgradeCost(1, 1) != null ? price.largest(x.mercs, (n) => price.upgradeCost(1, n) <= have) : Math.floor(have / Math.max(1, P.upgrade_cost));
    return [Math.min(x.mercs, byStock), x.mercs ? `no ${P.upgrade_material} (buy some on the MARKET)` : 'hire mercenaries first'];
  }
  return [Math.min(q.mercMax, byGold), q.own ? 'not enough gold' : `choose your own troops first (1 mercenary per ${ratio()})`];
}

/** The quote line: troops, raw offense, mercenary gold and any problem. */
export function quoteText(q, x) {
  const P = store.rules.params;
  const parts = [`${fmt(q.own)} troops`];
  if (x.mercs) parts.push(`+${fmt(x.mercs)} hired`);
  parts.push(`raw off ${fmt(q.off)}`);
  if (x.mercs) parts.push(`${fmt(q.mercGold)}g hire`);
  if (x.horses || x.chariots) parts.push(`${fmt(x.horses + x.chariots)}/${fmt(q.riders)} mounted`);
  return { text: parts.join(' · '), title: `Raw offense: troops' offense + mercenaries (${ratio()}:1 max) + ${P.horse_offense} a horse + ${P.chariot_offense} a chariot, before modifiers. Mercenaries cost ${price.mercenaryCost(1) != null ? `exactly ${fmt(price.mercenaryCost(x.mercs || 1))} gold for ${fmt(x.mercs || 1)}, with your modifiers` : `${fmt(P.mercenary_gold)} gold each before modifiers`}; survivors leave after the battle.${q.problems.length ? ` Can't: ${q.problems.join('; ')}.` : ''}` };
}

/**
 * The army's offense as the engine adds it up (commands.rs `strength`), part by part, from the server's bonuses
 * (house.prices.offense). units: by slot, mercenaries in slot 8; x: the extras; general: an id or ''; vsRace: the
 * target's race identity; kind: an attack id. Returns null on a server too old to send the bonuses.
 *   plain + mounts + apply(elite, elite_bp), then apply(that, offense_bp)
 */
export function offenseParts(race, units, x, general, vsRace, kind) {
  const o = store.house?.prices?.offense, P = store.rules.params;
  if (!o) return null;
  const pt = (k) => store.house.unit_points?.[k]?.[0] ?? race.units[k]?.off ?? 0;
  let plain = 0, elite = 0;
  units.forEach((n, k) => { if (n && k !== THIEF) { if (ELITE_SLOTS.includes(k)) elite += n * pt(k); else plain += n * pt(k); } });
  const mounts = x.horses * P.horse_offense + x.chariots * P.chariot_offense + Math.floor((x.upmercs || 0) * pt(MERC) * P.upgrade_bonus_bp / 10000);
  const vs = (store.rules.races || []).findIndex((r) => r?.identity === vsRace), at = P.attacks.findIndex((k) => k.id === kind);
  const [base, eliteBase] = o.bp.none || [0, 0], [withG, eliteWithG] = (general && o.bp[String(general)]) || [base, eliteBase];
  // The bonuses that hold for this battle only: against this race, or for this kind of attack.
  const conds = (o.conds || []).filter(([, r, k]) => (r == null || r === vs) && (k == null || k === at));
  const extra = (stat) => conds.filter(([s]) => s === stat).reduce((a, c) => a + c[3], 0);
  const eliteBp = eliteWithG + extra('elite_offense'), offBp = withG + extra('offense');
  const eliteAfter = price.apply(elite, eliteBp), sub = plain + mounts + eliteAfter;
  return { plain, elite, eliteBp, eliteAfter, mounts, sub, offBp, total: price.apply(sub, offBp),
    parts: { house: base, general: withG - base, battle: extra('offense'), eliteHouse: eliteBase, eliteGeneral: eliteWithG - eliteBase, eliteBattle: extra('elite_offense') } };
}
