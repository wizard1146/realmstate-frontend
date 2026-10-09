// Rites, as every view shares them: kinds (self, divination, hex), what each does, its cost and length for your house
// (from the server's rite_costs), whether it may go on a state (relations, war), what's in force on you, your Spell
// Resilience and vengeance.
import { store } from './store.js';
import { fmt } from './words.js';

const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

const SELF = ['modifiers', 'veil', 'mirror_ward'];
const DIVINE = ['scry', 'omens', 'roads'];
export const rites = () => store.rules.params.rites || [];
export const riteById = (id) => rites().find((r) => r.id === id);
/** 'self', 'divination' or 'hex'. */
export const riteKind = (r) => (SELF.includes(r.effect.type) ? 'self' : DIVINE.includes(r.effect.type) ? 'divination' : 'hex');
export const KIND_LABEL = { self: 'Self rites (always work if you have the aether)', divination: 'Divinations (intel on a house, shared with your state)', hex: 'Hexes (burn resin; harm a house)' };
const mods = (r) => (r.mods || []).map((m) => `${m.bp > 0 ? '+' : '−'}${pct(Math.abs(m.bp))} ${m.stat.replace(/_/g, ' ')}`).join(', ');
export const sameSt = (a, b) => !!a && !!b && a.realm === b.realm && a.state === b.state;
export const stName = (s) => `${s.realm}:${s.state}`;

/**
 * A rite for your house now, as the server prices it (`rite_costs`): aether and incense grow with
 * land, a lasting rite's length with your shrine share. `exact` is false only on an old server,
 * which sends no `rite_costs`: then these are the listed numbers.
 */
export function riteFor(r) {
  const row = (store.house?.rite_costs || []).find((x) => x[0] === r.id);
  return row ? { aether: row[1], ticks: row[2], incense: row[3] ?? (r.incense || 0), exact: true } :{ aether: r.aether, ticks: r.ticks || 0, incense: r.incense || 0, exact: false };
}
export const ap = (c) => (c.exact ? '' : '≈');
/** How long a lasting rite runs for you: "9 ticks" (and, if short of full, "of 12"). */
export const lengthText = (r, c = riteFor(r)) => (r.ticks ? `${ap(c)}${c.ticks} tick${c.ticks === 1 ? '' : 's'}${c.ticks < r.ticks ? ` (${r.ticks} at full shrine share)` : ''}` : '');

/** Which relations a strong hex needs, in words: "unfriendly or hostile toward". */
const NEEDS_WORD = { unfriendly: 'unfriendly or hostile toward', hostile: 'hostile toward' };
export const needsText = (r) => (!r.needs ? '' : r.needs === 'war' ? 'only on a state yours is at war with' : `only on a state yours feels ${NEEDS_WORD[r.needs] || r.needs}, or is at war with`);
export const unfriendlyExtra = (r) => (r.needs && r.unfriendly_cost_bp && r.unfriendly_cost_bp !== 10000 ? `; ${pct(r.unfriendly_cost_bp)} of the aether while relations are only unfriendly` : '');

/** What a rite does, in a phrase (lasting rites: the length your house would get now). */
export function riteDoes(r, { table = false } = {}) {
  const e = r.effect;
  const len = table ? '' : lengthText(r); // the table has a TICKS column
  const dur = len ? ` for ${len}` : '';
  switch (e.type) {
    case 'modifiers': return `${mods(r)}${dur}`;
    case 'veil': return `your attacks show only "a veiled army"${dur}`;
    case 'mirror_ward': return `${pct(e.bp)} of hexes on you turn back on their caster${dur}`;
    case 'scry': return 'see their land, peasants, gold, food and troops';
    case 'omens': return 'see the rites and hexes in force on them';
    case 'roads': return 'see their armies on the road and whose land they carry';
    case 'loss': return `takes ${pct(e.bp)} of their ${e.of} at once`;
    case 'storm': return `wrecks ${pct(e.bp)} of all their buildings at once`;
    case 'seize': return `seizes ${pct(e.bp)} of their land at once, as barren land (less from a smaller house)`;
    case 'hellfire': return `kills ${pct(e.bp)} of their peasants and troops at home each tick${dur}`;
    case 'blight': return `cuts ${pct(e.bp)} of their material allotment${dur}`;
    case 'unravel': return 'ends one of the rites on them';
    case 'curse': return `${mods(r)}${dur}`;
    default: return e.type.replace(/_/g, ' ');
  }
}
/** A rite's cost for your house now: "≈" marks a number the server didn't send. */
export const riteCost = (r, c = riteFor(r)) => `${ap(c)}${fmt(c.aether)} aether${c.incense ? ` + ${fmt(c.incense)} ${store.rules.params.rite_material}` : ''}`;
/** One line about a rite: kind, cost, chance, effect, what it needs. */
export function riteLine(r) {
  const k = riteKind(r);
  const chance = k === 'self' ? 'always works if you have the aether' : `chance: adepts per acre, yours against theirs, ×${pct(r.chance_bp)}, less their ward${k === 'hex' ? ' and Spell Resilience, plus your vengeance on their state' : ''}`;
  const war = r.war_bonus_bp ? `; stronger at war (+${pct(r.war_bonus_bp)})` : '';
  const needs = r.needs ? ` ${needsText(r)[0].toUpperCase()}${needsText(r).slice(1)}${unfriendlyExtra(r)}.` : '';
  const hard = k === 'hex' && r.resilience_bp ? ` Landing it hardens them +${pct(r.resilience_bp)} resilience.` : '';
  return `${r.name} (${k}): ${riteDoes(r)}. Costs ${riteCost(r)}; ${chance}${war}.${needs}${hard}`;
}

/** Your Countercast Vengeance against a state (bp), from `/me`. */
export const vengeanceOn = (s) => ((store.house?.vengeance || []).find(([x]) => sameSt(x, s)) || [null, 0])[1];

/**
 * A divination or hex on a house of state `s`, as far as the page can tell from /relations and
 * /me: { blocked: why not ('' if it may go), feel, war, cost, approx, venge }. The server's answer
 * to CAST is the final word.
 */
export function riteOn(r, s) {
  const h = store.house, R = store.relations;
  const c = riteFor(r);
  const out = { blocked: '', feel: 'normal', war: false, cost: c.aether, approx: !c.exact, venge: vengeanceOn(s), known: !!R };
  if (sameSt(s, h)) { out.blocked = 'that house is in your own state'; return out; }
  if (!R) return out;
  out.war = !!R.war && (sameSt(R.war.a, s) || sameSt(R.war.b, s));
  const row = (R.relations || []).find((x) => sameSt(x.state, s));
  out.feel = row ? row.we_feel.relation : 'normal';
  out.points = row ? row.we_feel.points : 0;
  if (r.needs && !out.war) {
    const ok = r.needs === 'unfriendly' ? out.feel !== 'normal' : r.needs === 'hostile' ? out.feel === 'hostile' : false;
    if (!ok) out.blocked = `${r.name} needs your state ${r.needs === 'war' ? `at war with ${stName(s)}` : `to feel ${NEEDS_WORD[r.needs] || r.needs} ${stName(s)}, or to be at war with it`}; it feels ${out.feel} (${fmt(out.points)} hostility points)`;
  }
  if (!out.war && out.feel === 'unfriendly' && r.unfriendly_cost_bp && r.unfriendly_cost_bp !== 10000) {
    // The server sends the cost while only unfriendly; an older one doesn't, so work it out (≈).
    const sent = (store.house?.rite_costs_unfriendly || []).find((x) => x[0] === r.id);
    out.cost = sent ? sent[1] : Math.floor(c.aether * r.unfriendly_cost_bp / 10000);
    out.approx = !sent;
  }
  return out;
}
/** Can you afford it now? '' or why not. */
export function riteShort(r) {
  const h = store.house;
  const c = riteFor(r);
  if (h.aether < c.aether) return `needs ${ap(c)}${fmt(c.aether)} aether, you have ${fmt(h.aether)}`;
  const mat = store.rules.params.rite_material;
  if (c.incense && (h.materials[mat] || 0) < c.incense) return `needs ${ap(c)}${fmt(c.incense)} ${mat}, you have ${fmt(h.materials[mat] || 0)}`;
  return '';
}
/** Rites and hexes in force on you: [[name, until_tick, ticks_left]]. */
export const inForce = () => (store.house.rites || []).map(([n, until]) => [n, until, Math.max(0, until - store.tick)]);
/** Your Spell Resilience in a phrase: "15% (max 75%, fades 2.5% a tick)". */
export function resilienceText() {
  const P = store.rules.params, bp = store.house.resilience_bp || 0;
  const fade = P.resilience_decay_bp ? `, fades ${pct(P.resilience_decay_bp)} a tick` : '';
  return `${pct(bp)}${P.resilience_max_bp ? ` (max ${pct(P.resilience_max_bp)}${fade})` : ''}`;
}
/** Your vengeance, highest first: [[state, bp]]. */
export const vengeanceList = () => (store.house.vengeance || []).slice().sort((a, b) => b[1] - a[1]);
