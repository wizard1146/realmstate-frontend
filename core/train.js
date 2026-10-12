// Training: the trade-off between training from soldiers and recruiting straight from peasants, in words.
import { store } from './store.js';
import { fmt, THIEF, SOLDIER } from './words.js';

/** The trade-off between training from soldiers and recruiting straight from peasants, in a sentence. */
export function trainNote(direct, slot) {
  const P = store.rules.params;
  const h = store.house;
  const upg = Number(slot) !== THIEF ? `, ${P.train_plus_bp / 100}% come out upgraded` : '';
  return direct
    ? `Direct from peasants (${fmt(h.peasants)}): +${P.direct_cost_bp / 100}% gold, +${P.direct_time_bp / 100}% time, ${P.direct_fail_bp / 100}% fail back to peasants, ${P.direct_death_bp / 100}% die, never upgraded.`
    : `From soldiers (${fmt(h.units[SOLDIER])} at home): base price and time, ${P.train_fail_bp / 100}% fail back to soldiers, ${P.train_death_bp / 100}% die${upg}.`;
}
