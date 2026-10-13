// Thieves' operations, as every view shares them: the groups, what each does, its extra choice (a material, a kind of
// books, a building), its nerve cost (with a false flag, and if caught), and reading a false-flag address.
import { store } from './store.js';
import { fmt } from './words.js';

const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

// ---------- operations ----------
export const OP_GROUPS = [
  ['Intel', ['survey', 'muster', 'ledgers', 'archives', 'couriers', 'dossier']],
  ['Theft', ['steal_gold', 'steal_food', 'steal_material', 'steal_horses', 'steal_books', 'kidnap']],
  ['Sabotage', ['undermine', 'set_fires', 'cut_throats', 'foul_forges', 'poison_wells', 'silence_adepts']],
  ['Subversion', ['propaganda', 'forge_orders', 'unsettle_general', 'court_general', 'court_scholar', 'stir_unrest']],
];
export const groupOf = (o) => (OP_GROUPS.find(([, l]) => l.includes(o.effect)) || ['Other'])[0];
export const ops = () => store.rules.params.operations;
export const opById = (id) => ops().find((o) => o.id === id);

/** What an operation needs besides thieves: { key, label, options: [[value, text]] } or null. */
export function opExtra(o) {
  if (!o) return null;
  if (o.effect === 'steal_material') {
    const mats = Object.keys(store.house?.materials || {});
    return { key: 'material', label: 'Material', options: mats.map((m) => [m, m]) };
  }
  if (o.effect === 'steal_books') return { key: 'category', label: 'Books', options: [['economy', 'economy books'], ['military', 'military books'], ['arcane', 'arcane books']] };
  if (o.effect === 'set_fires') return { key: 'building', label: 'Building', options: store.rules.buildings.map((b) => [b.building, b.name]) };
  return null;
}

/** What an operation does, in a phrase. */
export function opDoes(o) {
  const cap = (what) => `${pct(o.amount_bp)} of their ${what}, at most ${fmt(o.cap_per_100_thieves)} per 100 thieves`;
  switch (o.effect) {
    case 'survey': return 'report: their land, barren acres and buildings';
    case 'muster': return 'report: their troops home and away, training, medics, generals, armies coming home';
    case 'ledgers': return 'report: their gold, food, materials and market orders';
    case 'archives': return 'report: their books, scientists and academics';
    case 'couriers': return 'report: their news from the last day';
    case 'dossier': return 'report: everything, a full dossier';
    case 'steal_gold': return `steals ${cap('gold')}`;
    case 'steal_food': return `steals ${cap('food')}`;
    case 'steal_material': return `steals ${cap('stock of one material')}`;
    case 'steal_horses': return `steals ${cap('horses')}`;
    case 'steal_books': return `steals ${cap('books of one kind')}`;
    case 'propaganda': return `${cap('soldiers')}: they defect to you`;
    case 'kidnap': return `carries off ${cap('peasants')} to your house`;
    case 'undermine': return `delays their construction ${o.delay_ticks} ticks`;
    case 'set_fires': return `burns ${pct(o.amount_bp)} of one building type, at most ${fmt(o.cap_per_100_thieves)} per 100 thieves`;
    case 'cut_throats': return `kills ${pct(o.amount_bp)} of their troops at home, at most ${fmt(o.cap_per_100_thieves)} per 100 thieves`;
    case 'foul_forges': return `delays their training ${o.delay_ticks} ticks`;
    case 'poison_wells': return `stops their peasant growth for ${o.delay_ticks} ticks`;
    case 'silence_adepts': return `kills ${pct(o.amount_bp)} of their adepts`;
    case 'forge_orders': return 'cancels their open market orders';
    case 'unsettle_general': return `their main general fights ${pct(o.amount_bp)} weaker for ${o.delay_ticks} ticks`;
    case 'court_general': return 'their best general wavers; left wavering, it goes to auction';
    case 'court_scholar': return 'their best academic wavers; left wavering, it goes to auction';
    case 'stir_unrest': return `their state's tax brings in half for ${o.delay_ticks} ticks`;
    default: return o.effect.replace(/_/g, ' ');
  }
}

/** Nerve an operation costs: on success, and if the thieves are caught (half as much again). */
export function opNerve(o, framed = false) {
  const P = store.rules.params;
  const base = o.nerve_bp + (framed ? Math.floor(o.nerve_bp * (P.false_flag_nerve_bp || 0) / 10000) : 0);
  return { ok: base, caught: base + Math.floor(base * (P.nerve_fail_extra_bp || 0) / 10000) };
}

/** One line about an operation: cost, chance and what it does. */
export function opLine(o, framed = false) {
  const n = opNerve(o, framed);
  const mat = o.cost_material ? `; spends 1 ${o.cost_material} per ${fmt(o.thieves_per_material)} thieves` : '';
  const war = o.war_bonus_bp ? `; +${pct(o.war_bonus_bp)} at war` : '';
  return `${o.name}: ${opDoes(o)}. Costs ${pct(n.ok)} nerve (${pct(n.caught)} if caught)${framed ? ', with the false flag' : ''}${mat}. Chance ×${pct(o.chance_bp)} of your spy chance, less their vigilance; adds ${pct(o.vigilance_bp)} vigilance on them${war}.`;
}

/** "6:2" -> [6, 2]; '' -> null; anything else throws. */
export function parseFrame(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const m = /^(\d+)\s*[:\s.,]\s*(\d+)$/.exec(t);
  if (!m) throw new Error('Write the state to frame as realm:state, for example 6:2, or leave it empty.');
  return [Number(m[1]), Number(m[2])];
}

