// Generals: the shared maths and small pieces both the MIL pane and its detail use (traits and
// what they do, trait slots, the exact recruit cost, settling in, heir slots, the attack picker).
// Sources: /rules traits and params, /me house.generals and defender, /hall, /colloquium.
import { store } from '../../core/store.js';
import * as price from '../../core/prices.js';
import { fmt, esc } from '../../core/words.js';
import { STATS, pctBp } from './does.js';
import { tabState } from './tabs.js';

export const MIL_TAB = tabState('realmstate.room.mil', ['forces', 'generals', 'hall'], { forces: 'FORCES', generals: 'GENERALS', hall: 'HALL OF DEEDS' });
const P = () => store.rules.params;

// ---------- traits ----------
export const traits = () => store.rules?.traits || [];
export const traitDef = (id) => traits().find((t) => t.trait === id || t.name === id);
export const traitName = (id) => traitDef(id)?.name || id;
/** "+5% offense" (all of a trait's effects, in the words the war room uses). */
export const traitDoes = (id) => (traitDef(id)?.effects || []).map(([stat, bp]) => `${pctBp(bp)} ${(STATS[stat] || [String(stat).replace(/_/g, ' ')])[0]}`).join(', ');
/** "Bellator (+5% offense)" for each trait. */
export const traitsText = (list) => (list || []).map((t) => `${traitName(t)}${traitDoes(t) ? ` (${traitDoes(t)})` : ''}`).join(', ') || 'no traits';

// ---------- slots and cost ----------
/** Trait slots from renown alone (params.general_trait_renown), and the renown for the next one. */
export function renownSlots(renown = store.house?.renown || 0) {
  const ladder = P().general_trait_renown || [];
  return { n: ladder.filter((need) => renown >= need).length, next: ladder.find((need) => renown < need) ?? null };
}
/**
 * Trait slots in all: renown, plus the buildings and Colloquium tiers that add one. The server
 * doesn't send the extras; they are read from the rules' wording (a building that lets generals
 * carry one more trait; a project whose last tier adds a trait slot). { total, parts: [text] }.
 */
export function traitSlots() {
  const h = store.house;
  const r = renownSlots();
  const parts = [`${r.n} from renown`];
  // The server's own count (renown, buildings and Colloquium) when it sends one.
  if (typeof h.general_trait_slots === 'number') {
    const extra = h.general_trait_slots - r.n;
    if (extra > 0) parts.push(`+${extra} from buildings and the Colloquium`);
    return { total: h.general_trait_slots, parts, next: r.next };
  }
  let total = r.n;
  for (const b of store.rules.buildings) {
    if (/one more trait/i.test(b.description || '') && (h.buildings[b.building] || 0) > 0) { total += 1; parts.push(`+1 ${b.name}`); }
  }
  for (const p of store.colloquium?.projects || []) {
    if (/adds a trait slot/i.test(p.description || '') && p.tier >= p.tiers.length) { total += 1; parts.push(`+1 ${p.name}`); }
  }
  return { total, parts, next: r.next };
}
/** A Colloquium project at a tier that touches what generals cost (its exact size isn't sent). */
export const costTouched = () => (store.colloquium?.projects || []).find((p) => p.tier > 0 && /generals cost/i.test(p.description || '')) || null;
/** What a general with `count` traits costs: { elites, material, amount, exact, why }. */
export function recruitQuote(count) {
  const p = P(), h = store.house;
  const exact = price.generalCost(count);
  if (exact) {
    const elites = h.units[3] || 0, held = h.materials[exact.material] || 0;
    const why = h.generals.length >= exact.max ? `a house keeps at most ${exact.max} generals`
      : elites < exact.elites ? `needs ${fmt(exact.elites)} elites at home; you have ${fmt(elites)}`
        : held < exact.amount ? `needs ${fmt(exact.amount)} ${exact.material}; you have ${fmt(held)}` : '';
    return { elites: exact.elites, material: exact.material, amount: exact.amount, exact: true, touched: null, held, why };
  }
  const amount = p.general_cost * count;
  const elites = h.units[3] || 0;
  const held = h.materials[p.general_material] || 0;
  const touched = costTouched();
  const why = (h.generals.length >= p.general_max) ? `a house keeps at most ${p.general_max} generals`
    : elites < p.general_elites ? `needs ${fmt(p.general_elites)} elites at home; you have ${fmt(elites)}`
      : !touched && held < amount ? `needs ${fmt(amount)} ${p.general_material}; you have ${fmt(held)}` : '';
  return { elites: p.general_elites, material: p.general_material, amount, exact: !touched, touched, held, why };
}
export const mayPick = () => (store.house?.renown || 0) >= P().general_pick_renown;

// ---------- a general's state ----------
/** Settling in after joining a house (bought or recalled): the end time, or 0. From the record's last stint. */
export function settlingUntil(g) {
  if (typeof g.settling_until === 'number') return g.settling_until > Date.now() ? g.settling_until : 0;
  const st = g.record?.stints || [];
  const joined = st.length > 1 || (g.record?.raised_age != null && g.record.raised_age !== store.age?.age);
  if (!joined || !st.length) return 0;
  const until = st[st.length - 1].from + P().settling_ticks * (store.age?.tick_ms || P().tick_ms);
  return until > Date.now() ? until : 0;
}
/** The Hall listing of one of your characters, if it's on the market. */
export const listingOf = (kind, id) => (store.hall?.listings || []).find((l) => l.character?.kind === kind && l.character?.id === id) || null;
/** Why a general can't lead an attack now ('' if it can). */
export function cantLead(g) {
  if (g.away) return 'away with an army';
  if (listingOf('general', g.id)) return 'on the market';
  return '';
}

// ---------- the attack forms' general picker ----------
/** <option>s: none, then each general at home (traits in the label); away or listed ones disabled. */
export function generalOptions(sel = '') {
  const gs = store.house?.generals || [];
  return '<option value="">no general</option>' + gs.map((g) => {
    const why = cantLead(g);
    const def = store.house.defender === g.id ? ', main general' : '';
    return `<option value="${g.id}"${String(g.id) === String(sel) && !why ? ' selected' : ''}${why ? ' disabled' : ''}>${esc(g.name)} · ${esc((g.traits || []).map(traitName).join('/') || 'no traits')}${why ? ` (${why})` : def}</option>`;
  }).join('');
}
/** One line on the chosen general: what its traits do, and that it leaves the defense if it was main general. */
export function generalLine(id) {
  const g = (store.house?.generals || []).find((x) => String(x.id) === String(id));
  if (!g) return (store.house?.generals || []).length ? 'No general: the army fights on its own.' : 'No generals yet (MIL › GENERALS raises one).';
  const s = settlingUntil(g);
  return `${g.name}: ${traitsText(g.traits)}${s ? `; still settling in (${pctBp(P().settling_penalty_bp)} offense)` : ''}${store.house.defender === g.id ? '; leaving, it stops commanding the home defense' : ''}. ${fmt(P().general_death_bp / 100)}% chance it falls if the attack fails.`;
}
/** Fills a <select> with the picker, keeping the choice when it's still possible. */
export function fillPicker(selectEl) {
  if (!selectEl || document.activeElement === selectEl) return;
  const v = selectEl.value;
  selectEl.innerHTML = generalOptions(v);
}

// ---------- heirs ----------
/** Heir slots now (renown) and if your state wins the age. */
export function heirSlots(renown = store.house?.renown || 0) {
  const ladder = P().heir_slots_renown || [];
  const now = ladder.filter((need) => renown >= need).length;
  return { now, ifWon: now + (P().heir_winner_slots || 0), next: ladder.find((need) => renown < need) ?? null };
}
// The server sends the marks (house.heirs); an older one only takes them, so this browser also
// remembers the last list it sent for the house: [{ kind, id }].
const markKey = () => `realmstate.room.heirs.${store.age?.age || 0}.${store.house?.id}`;
export function marks() {
  if (Array.isArray(store.house?.heirs)) return store.house.heirs;
  try { const v = JSON.parse(localStorage.getItem(markKey()) || 'null'); return Array.isArray(v) ? v : null; } catch { return null; }
}
export function saveMarks(list) { try { localStorage.setItem(markKey(), JSON.stringify(list)); } catch { /* storage off */ } }
/** The remembered marks, without characters you no longer have. */
export function liveMarks() {
  const h = store.house;
  const have = (m) => (m.kind === 'general' ? h.generals.some((g) => g.id === m.id) : h.science?.academics.some((a) => a.id === m.id));
  return (marks() || []).filter(have);
}
export const charName = (m) => (m.kind === 'general' ? store.house.generals.find((g) => g.id === m.id)?.name : store.house.science?.academics.find((a) => a.id === m.id)?.name) || `${m.kind} ${m.id}`;
/** The character a LIST button chose, for the Hall tab's list form to pick up once. */
export const sellPick = { v: null, set(x) { this.v = x; }, take() { const x = this.v; this.v = null; return x; } };
/** A traded character can't change hands again until this time (0 if it can): its last sale + the cooldown. */
export function cooldownUntil(x) {
  const r = x.record || {}, st = r.stints || [];
  if (!r.transfers || !st.length) return 0;
  const until = st[st.length - 1].from + P().trade_cooldown_ticks * (store.age?.tick_ms || P().tick_ms);
  return until > Date.now() ? until : 0;
}
