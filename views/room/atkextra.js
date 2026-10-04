// The attack form's extras, shared by the ACT pane and its detail: medics, horses and chariots
// from home, and mercenaries hired for this attack. Rules (from the engine's attack checks):
//  - one mount (horse or chariot) per troop sent, thieves excluded, mercenaries included;
//  - at most one mercenary per `mercenary_ratio` of your own troops sent, `mercenary_gold` each;
//  - mercenaries fight with your race's slot-8 stats; survivors leave after the battle;
//  - races may differ: their own mercenary ratio, upgraded mercenaries (the upgrade material each,
//    upgrade_bonus_bp stronger), and keeping a second strike (at war, a general with enough traits).
import { store } from '../../core/store.js';
import * as price from '../../core/prices.js';
import { fmt, esc, MERC, THIEF } from '../../core/words.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
export const EXTRAS = ['medics', 'horses', 'chariots', 'mercs', 'upmercs'];
/** One mercenary per this many of your own troops: your race's ratio (from prices), else the age's. */
const ratio = () => Math.max(1, store.house?.prices?.mercenary?.ratio ?? store.rules.params.mercenary_ratio);
/** A unit's offense as your house fights now (race bonuses, mirroring), else the race's. */
const offOf = (race, slot) => store.house?.unit_points?.[slot]?.[0] ?? race.units[slot]?.off ?? 0;

/** The extras' fields. p: id prefix ('r-a' for the pane, 'd-a' for the detail). */
export function extrasHTML(p, race, compact = false) {
  const P = store.rules.params;
  const merc = race.units[MERC] || { name: P.mercenary_name || 'Mercenaries', off: P.mercenary_off || 0 };
  const f = (k, label, tag, title) => `<span class="troop x"><label for="${p}-${k}" title="${esc(title)}">${esc(label)}${tag ? ` <small>${esc(tag)}</small>` : ''}</label><span class="field"><input id="${p}-${k}" data-x="${k}" type="number" min="0" value="0" inputmode="numeric"><button type="button" class="btn mini max" data-max="x-${k}" aria-label="Most ${esc(label)} you can send">MAX</button></span>${compact ? '' : `<small class="home num" data-xhome="${k}"></small>`}</span>`;
  return f('medics', 'Medics', '', 'Medics at home to send: they save some of your dead')
    + f('horses', 'Horses', `+${P.horse_offense} off`, `Horses at home: +${P.horse_offense} offense each; one mount per troop sent (not thieves)`)
    + f('chariots', 'Chariots', `+${P.chariot_offense} off`, `Chariots at home: +${P.chariot_offense} offense each; one mount per troop sent (not thieves)`)
    + f('mercs', merc.name, `${merc.off} off`, `Hire for this attack: ${fmt(P.mercenary_gold)} gold each, one per ${ratio()} of your own troops sent; survivors leave after the battle`)
    + (race.race?.mercenary_upgrades ? f('upmercs', `${merc.name}+`, `${P.upgrade_material}`, `Of the mercenaries hired, how many fight upgraded (${P.upgrade_bonus_bp / 100}% stronger): ${P.upgrade_cost} ${P.upgrade_material} each`) : '')
    + (race.race?.double_strike ? `<span class="troop x"><label for="${p}-double" title="${esc(`At war, led by a general with ${race.race.double_strike.general_traits}+ traits: strike again within ${race.race.double_strike.window_ticks} ticks at ${race.race.double_strike.strength_bp / 100}% of this army's offense, killing specialists only; the general is then spent for ${race.race.double_strike.spent_ticks} ticks`)}"><input id="${p}-double" data-x="double" type="checkbox"> Keep a second strike</label></span>` : '');
}

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
