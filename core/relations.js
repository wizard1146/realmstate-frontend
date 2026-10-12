// Relations between states: how one feels about another, and whether your state may declare war on another, as far
// as the page can tell (the server has the last word). The War Room's STATE › WAR and Straightline's War use these.
import { store } from './store.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);
export const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
/** "2:1" */
export const st = (s) => `${s.realm}:${s.state}`;
export const same = (a, b) => a && b && a.realm === b.realm && a.state === b.state;
/** "Normal 12.0", etc. */
export const feel = (f) => `${cap(f.relation)} ${(f.points / 100).toFixed(1)}`;
/** Why your state can't declare on `rel` (a /relations row), as far as the page can tell; '' if it might. */
export function declareWhy(rel) {
  const R = store.relations, P = store.rules.params, w = store.wars;
  if (!R || !rel) return '';
  if (R.war) return 'your state is already at war';
  if ((w?.wars || []).some((x) => same(x.a, rel.state) || same(x.b, rel.state))) return 'that state is already at war';
  if ((w?.ceasefires || []).some((c) => (same(c.a, rel.state) || same(c.b, rel.state)) && (same(c.a, R.state) || same(c.b, R.state)))) return 'you have a ceasefire with them';
  const [lo, hi] = R.war_range_bp;
  if (rel.land_ratio_bp < lo || rel.land_ratio_bp > hi) return `their land is ${pct(rel.land_ratio_bp)} of yours; war needs ${pct(lo)}–${pct(hi)}`;
  const T = R.thresholds, us = rel.we_feel.points, them = rel.they_feel.points;
  if (us >= T.declare_either && them >= T.declare_either) return '';
  if (them < T.hostile || us < T.unfriendly) return 'needs them Hostile toward you and you at least Unfriendly toward them';
  if (us >= T.hostile && us > them) return 'you are both Hostile and yours is higher: the declaration is theirs';
  return P.war_unique_attackers > 1 ? `also needs ${P.war_unique_attackers} different attackers across the pair (the server checks)` : '';
}
