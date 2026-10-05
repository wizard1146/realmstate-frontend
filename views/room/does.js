// What each building does, from /me house.buildings_do: now, and with 1% more of your land in it
// (the "+1% land" line, like Utopia's). Stats are basis points; produces/holds are per tick / stock.
import { store } from '../../core/store.js';
import { fmt, esc } from '../../core/words.js';

/** Stat names (as /rules and the wiki effects page use them) in short readable words, with the wiki's meaning. */
export const STATS = {
  income: ['income', 'Gold earned from peasants each tick'],
  casualties_attacking: ['losses attacking', 'Your troops killed in battle when you attack'],
  casualties_defending: ['losses defending', 'Your troops killed in battle when you defend'],
  attack_gains: ['attack gains', 'Everything your attacks take (land, plunder, kills)'],
  population: ['population', 'How many people the land can hold'],
  food_production: ['food output', 'Food grown on land each tick'],
  food_consumption: ['food eaten', 'Food eaten each tick'],
  offense: ['offense', 'Offense of troops sent on attacks'],
  defense: ['defense', 'Defense of troops at home'],
  explore_cost: ['explore cost', 'Gold cost of exploring'],
  training_cost: ['training cost', 'Gold cost of training troops'],
  return_time: ['army return time', 'How long armies take to come home'],
  elite_offense: ['elite offense', 'Offense of elite troops (elite and elite+)'],
  elite_defense: ['elite defense', 'Defense of elite troops (elite and elite+)'],
  casualties: ['casualties', 'Troops killed in battle'],
  land_loss: ['land lost when hit', 'Land lost when attacked'],
  construction_cost: ['build cost', 'Gold cost of construction'],
  thief_strength: ['thief strength', 'Strength of your thieves when spying'],
  thief_defense: ['thief defense', 'Strength of your thieves against enemy spies'],
  market_fee: ['market fee', 'The market fee on your sales'],
  building_efficiency: ['building efficiency', 'Building efficiency (can pass 100%)'],
  construction_time: ['build time', 'Time to build'],
  land_gain: ['land taken', 'Land taken on a successful attack'],
  training_time: ['training time', 'Time to train troops, medics and upgrades'],
  thief_losses: ['thief losses', 'Thieves lost when caught spying'],
  science_efficiency: ['science strength', 'Strength of every science bonus'],
  scientist_spawn: ['scientist arrival', 'How fast new scientists arrive'],
  book_production: ['book output', 'Books scientists write each tick'],
  general_effect: ['general strength', "Strength of your generals' traits"],
  renown_gain: ['renown gain', 'Renown earned'],
  practice_books: ['practice books', 'Books from learning by doing and lost texts'],
  material_output: ['material output', "Your state's output of its realm's material"],
  upgrade_cost: ['upgrade cost', 'Material spent on unit upgrades'],
  building_materials: ['build materials', 'Materials spent on construction'],
  general_cost: ['general cost', 'Material spent on generals'],
  rescue: ['medic rescue', 'Troops your medics save'],
  refine_yield: ['refine yield', 'What refining makes'],
  paper_books: ['books per paper', 'Books each paper adds'],
  ward: ['ward', 'Resistance to hexes and divinations against you, and to storm damage'],
};
const statName = (s) => (STATS[s] ? STATS[s][0] : String(s).replace(/_/g, ' '));
const statLong = (s) => (STATS[s] ? STATS[s][1] : statName(s));

/** 1350 bp -> "+13.5%"; 148 -> "+1.48%". */
export function pctBp(bp) {
  const v = Math.abs(bp) / 100;
  const t = v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(2);
  return `${bp < 0 ? '−' : '+'}${t.replace(/\.?0+$/, '')}%`;
}
const plus = (n) => `${n < 0 ? '−' : '+'}${fmt(Math.abs(n))}`;

/** Parts of one side (now: 1, then: 2) as [{ short, long }]. With delta, the change now -> then. */
function parts(d, delta) {
  const out = [];
  const v = (x) => (delta ? x[2] - x[1] : x[1]);
  for (const x of d.stats || []) if (v(x)) out.push({ short: `${pctBp(v(x))} ${statName(x[0])}`, long: `${pctBp(v(x))} ${statName(x[0])}: ${statLong(x[0])}` });
  for (const x of d.produces || []) if (v(x)) out.push({ short: `${plus(v(x))} ${x[0]}/tick`, long: `${plus(v(x))} ${x[0]} a tick` });
  for (const x of d.holds || []) if (v(x)) out.push({ short: delta ? `holds ${plus(v(x))} ${x[0]}` : `holds ${fmt(v(x))} ${x[0]}`, long: `stores ${delta ? plus(v(x)) : fmt(v(x))} ${x[0]}` });
  const L = d.living || [0, 0];
  const lv = delta ? L[1] - L[0] : L[0];
  if (lv) out.push({ short: delta ? `${plus(lv)} people` : `houses ${fmt(lv)}`, long: `${delta ? 'room for ' : 'houses '}${delta ? plus(lv) : fmt(lv)} people` });
  return out;
}

/** The DOES cell for a building id: now (bright) and +1% land (dim). Returns { html, title } or null. */
export function doesCell(id, h = store.house) {
  const d = h.buildings_do?.[id];
  if (!d) return null;
  const now = parts(d, false), more = parts(d, true);
  const extra = Math.max(0, (d.more || 0) - (h.buildings[id] || 0));
  const join = (p) => p.map((x) => x.short).join(' · ');
  const html = `<span class="does-now">${now.length ? esc(join(now)) : '<span class="zero">nothing yet</span>'}</span>`
    + `<span class="does-more">+1% land (+${fmt(extra)}): ${esc(join(more) || 'no change')}</span>`;
  const title = `Now: ${now.map((x) => x.long).join('; ') || 'nothing (none built)'}\nWith 1% more land in it (${fmt(d.more || 0)} in all): ${more.map((x) => x.long).join('; ') || 'no change'}`;
  return { html, title };
}
