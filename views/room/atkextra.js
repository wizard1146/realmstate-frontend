// The attack form's extras in the War Room (the ACT pane and its detail): medics, horses and chariots from home, and
// mercenaries hired for this attack. The maths (quote, MAX) are core/attack.js's, re-exported here.
import { store } from '../../core/store.js';
import { fmt, esc, MERC } from '../../core/words.js';
import { mercRatio as ratio } from '../../core/attack.js';

export { readExtras, attackQuote, extraMax, quoteText } from '../../core/attack.js';

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

