// Everything a player can do. Both views call these; neither talks to the server directly.
// Each action reports its result in the message line and returns the outcome (or null on failure).
import { api, command, auth } from './api.js';
import { loadColloquium, loadHall, loadHeirs, loadMarket, loadState, loadWars, loadRelations, raceOf, store, say, refreshMe, refreshMeSoon, loadStateMembers, loadRankings, loadReports, addLocalNews, addChat, clearPrivate, setTarget, unitNames, CHANNELS } from './store.js';
import { describe, outcomeTone, fmt, names } from './words.js';
import * as commands from './commands.js';
import { have as havePrices } from './prices.js';

/**
 * Run a command. `estimate` (gold, before modifiers) is quoted next to the real cost from the
 * outcome, only from an old server that sends no exact prices. `quote` (exact gold, from core/prices.js) replaces it: the outcome's own cost is the
 * cross-check, and the line says so only if the two differ.
 */
async function run(cmd, { estimate, quote, button } = {}) {
  if (button) button.disabled = true;
  try {
    const out = await command(cmd);
    let est = '';
    if (quote != null && Number.isFinite(quote)) {
      if (out.gold != null && out.gold !== quote) est = ` (Quoted ${fmt(quote)} gold; prices changed before the order landed.)`;
    } else if (estimate != null && Number.isFinite(estimate) && !havePrices()) est = ` (Estimated ≈${fmt(estimate)} before modifiers.)`;
    say(describe(out) + est, outcomeTone(out));
    refreshMeSoon();
    return out;
  } catch (e) {
    say(e.message, 'bad');
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}
const me = () => store.house.id;

// ---------- cost estimates ----------
// Base prices from /rules and your house, before race, personality, science and other modifiers.
// Always shown with ≈; the real cost comes back in the command's outcome.
export const estimate = {
  explore: (acres) => (Number(acres) || 0) * store.rules.params.explore_gold_per_acre,
  build: (building, count) => {
    const b = store.rules.buildings.find((x) => x.building === building);
    return (Number(count) || 0) * (store.house.build_cost + ((b && b.extra_gold) || 0));
  },
  train: (unit, count, direct = false) => Math.floor((Number(count) || 0) * ((unitNames()[Number(unit)] || {}).gold || 0) * (direct ? 1 + (store.rules.params.direct_cost_bp || 0) / 10000 : 1)),
};
/** "≈6,000" */
export const approx = (n) => `≈${fmt(n)}`;

// ---------- your house ----------
export const explore = (acres, opts = {}) =>
  run({ type: 'explore', house: me(), acres: Number(acres) }, { estimate: estimate.explore(acres), ...opts });
export const build = (building, count, opts = {}) =>
  run({ type: 'build', house: me(), building, count: Number(count) }, { estimate: estimate.build(building, count), ...opts });
/** Train soldiers into a unit; direct: recruit straight from peasants (dearer, slower, less reliable). */
export const train = (unit, count, opts = {}) => {
  const { direct = false, ...rest } = opts;
  const cmd = { type: 'train', house: me(), unit: Number(unit), count: Number(count) };
  if (direct) cmd.direct = true;
  return run(cmd, { estimate: estimate.train(unit, count, direct), ...rest });
};
/** The share of your population to keep under arms, in basis points (soldiers are drafted toward it each tick). */
export const setDraft = (rateBp, opts = {}) => run({ type: 'set_draft', house: me(), rate_bp: Math.round(Number(rateBp)) }, opts);
/**
 * Several build orders at once (a construction grid): one `build` command per row, in order, so
 * each sees the gold and land the last one left. rows: [{ building, count }]. Returns one result
 * per row: { building, count, ok, out?, error? }. The server takes bursts of up to 30 commands.
 */
export async function buildMany(rows, { button } = {}) {
  if (button) button.disabled = true;
  const results = [];
  try {
    for (const r of rows) {
      try {
        const out = await command({ type: 'build', house: me(), building: r.building, count: Number(r.count) });
        results.push({ ...r, ok: true, out });
      } catch (e) {
        results.push({ ...r, ok: false, error: e.message });
      }
    }
  } finally {
    if (button) button.disabled = false;
  }
  const ok = results.filter((x) => x.ok);
  const bad = results.filter((x) => !x.ok);
  const gold = ok.reduce((a, x) => a + (x.out.gold || 0), 0);
  const n = ok.reduce((a, x) => a + x.out.count, 0);
  const parts = [];
  if (ok.length) parts.push(`Building ${fmt(n)} in ${ok.length} order${ok.length > 1 ? 's' : ''} for ${fmt(gold)} gold.`);
  if (bad.length) parts.push(`${bad.length} refused: ${bad.map((x) => `${names.buildings[x.building] || x.building} (${x.error})`).join('; ')}.`);
  say(parts.join(' ') || 'Nothing to build.', bad.length ? 'bad' : 'good');
  refreshMeSoon();
  return results;
}
// ---------- science ----------
/** Spend books of a science's category on it (they take effect at once). */
export const invest = (science, books, opts = {}) => run({ type: 'invest', house: me(), science, books: Number(books) }, opts);
/** Move scientists between categories (economy, military, arcane); their experience stays behind. */
export const assignScientists = (from, to, count, opts = {}) => run({ type: 'assign_scientists', house: me(), from, to, count: Number(count) }, opts);
/** Where new scientists go, and/or the paper scientists may use each tick. */
export function setScience({ focus, paper }, opts = {}) {
  const cmd = { type: 'set_science', house: me() };
  if (focus) cmd.focus = focus;
  if (paper != null && paper !== '') cmd.paper_budget = Number(paper);
  return run(cmd, opts);
}
/** Leader only: the state's Colloquium project. */
export const setResearch = (project, opts = {}) => run({ type: 'set_research', house: me(), project }, opts).then((o) => { if (o) loadColloquium(); return o; });
/** Give books of a category to the state's current Colloquium project. */
export const contribute = (category, books, opts = {}) => run({ type: 'contribute', house: me(), category, books: Number(books) }, opts).then((o) => { if (o) loadColloquium(); return o; });
/** Recruit a named academic with books of one category (and attributes, once you may choose them). */
export const recruitAcademic = (name, category, attributes = [], opts = {}) => run({ type: 'recruit_academic', house: me(), name, category, attributes }, opts);

// ---------- generals, heirs and the Hall of Deeds ----------
const hallAfter = (o) => { if (o) setTimeout(loadHall, 400); return o; };
/** A character reference as the engine reads it: { kind: 'general'|'academic', id }. */
export const charRef = (kind, id) => ({ kind, id: Number(id) });
/** Raise a general from elites and the general material. traits: identities, or [] for random. */
export const recruitGeneral = (name, traits = [], opts = {}) => run({ type: 'recruit_general', house: me(), name: String(name).trim(), traits }, opts);
/** Put a general at home in command of the home defense (null: none). */
export const setDefender = (general, opts = {}) => run({ type: 'set_defender', house: me(), general: general == null ? null : Number(general) }, opts);
/** The characters to keep into the next age, in order of preference ([] clears). heirs: [charRef]. */
export const markHeirs = (heirs, opts = {}) => run({ type: 'mark_heirs', house: me(), heirs }, opts);
/** Put a character on the market: an auction (reserve and ticks) or, with both null, open to offers. */
export function listCharacter(character, { reserve = null, ticks = null } = {}, opts = {}) {
  const cmd = { type: 'list', house: me(), character };
  if (reserve != null) Object.assign(cmd, { reserve: Number(reserve), ticks: Number(ticks) });
  return run(cmd, opts).then(hallAfter);
}
export const delist = (listing, opts = {}) => run({ type: 'delist', house: me(), listing: Number(listing) }, opts).then(hallAfter);
export const bid = (listing, price, opts = {}) => run({ type: 'bid', house: me(), listing: Number(listing), price: Number(price) }, opts).then(hallAfter);
export const makeOffer = (character, price, opts = {}) => run({ type: 'make_offer', house: me(), character, price: Number(price) }, opts).then(hallAfter);
export const acceptOffer = (offer, opts = {}) => run({ type: 'accept_offer', house: me(), offer: Number(offer) }, opts).then(hallAfter);
export const dropOffer = (offer, opts = {}) => run({ type: 'drop_offer', house: me(), offer: Number(offer) }, opts).then(hallAfter);
/** Bring back a heir kept from an earlier age (POST /heirs/recall, not /commands). */
export async function recallHeir(uid, { button } = {}) {
  if (button) button.disabled = true;
  try {
    const out = await api('/heirs/recall', { uid });
    say(describe(out), 'good');
    refreshMeSoon();
    loadHeirs();
    return out;
  } catch (e) { say(e.message, 'bad'); return null; } finally { if (button) button.disabled = false; }
}

export const leaveProtection = (opts = {}) => run({ type: 'leave_protection', house: me() }, opts);

// ---------- other houses ----------
/** "1:1:3" -> that house's public facts, read fresh from /states/:r/:s. Throws a readable Error. */
export async function resolveAddress(text) {
  const m = /^\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*$/.exec(text || '');
  if (!m) throw new Error('Write the address as realm:state:seat, for example 1:1:3.');
  const [r, s, seat] = m.slice(1).map(Number);
  const p = store.rules.params;
  if (r < 1 || r > p.realms || s < 1 || s > p.states_per_realm || seat < 1 || seat > p.houses_per_state) {
    throw new Error(`Addresses run from 1:1:1 to ${p.realms}:${p.states_per_realm}:${p.houses_per_state}.`);
  }
  const members = await loadStateMembers(r, s, { maxAge: 0 });
  const h = members.find((x) => x.seat === seat);
  if (!h) throw new Error(`No house sits at ${r}:${s}:${seat}.`);
  return h;
}

/**
 * Attack. target: a house (public facts) or an address string. kind: an id from params.attacks.
 * units: troops to send by slot (10 slots: soldiers 0, offense 1, elite 3, the upgrades 5, 7, 9
 * fight; slot 8 hires that many mercenaries for this attack). medics, horses, chariots: from home.
 */
export async function attack({ target, kind, units, general, medics = 0, horses = 0, chariots = 0, upgradedMercenaries = 0, doubleStrike = false }, opts = {}) {
  let h = target;
  if (typeof target === 'string') {
    try { h = await resolveAddress(target); } catch (e) { say(e.message, 'bad'); return null; }
  }
  // As many unit slots as this server's races have (an older server has fewer; newer pads with 0).
  const slots = raceOf(store.house.race)?.units?.length || 10;
  const sent = Array.from({ length: slots }, (_, i) => Math.max(0, Number(units[i]) || 0));
  if (units.slice(slots).some((n) => Number(n) > 0)) {
    say('This game server is older and has no mercenaries or elite++ yet; those were left out.', 'bad');
  }
  if (!sent.some((n, i) => n && i !== 8)) { say('Choose some troops to send (mercenaries only come with your own troops).', 'bad'); return null; }
  setTarget(h);
  const cmd = { type: 'attack', attacker: me(), target: h.id, units: sent, kind };
  if (general != null && general !== '') cmd.general = Number(general);
  for (const [k, v] of [['medics', medics], ['horses', horses], ['chariots', chariots], ['upgraded_mercenaries', upgradedMercenaries]]) if (Number(v) > 0) cmd[k] = Math.floor(Number(v));
  if (doubleStrike) cmd.double_strike = true;
  const out = await run(cmd, opts);
  if (out) loadRankings();
  return out;
}

// ---------- race mechanics ----------
/** A mirroring race: fight with the unit stats of `of` (a house id among your latest attackers), or your own (null). */
export const mirror = (of, opts = {}) => run({ type: 'mirror', house: me(), of: of == null || of === '' ? null : Number(of) }, opts);
/** Make the second strike kept with your last attack. */
export const secondStrike = (opts = {}) => run({ type: 'second_strike', house: me() }, opts);
/** Take back `acres` that house `from`'s army is still carrying home. */
export const retakeLand = (from, acres, opts = {}) => run({ type: 'retake_land', house: me(), from: Number(from), acres: Number(acres) }, opts);

/** A house from a house object or an address string; says why not and returns null. */
async function houseOf(target) {
  if (target && typeof target === 'object') return target;
  try { return await resolveAddress(target); } catch (e) { say(e.message, 'bad'); return null; }
}

/**
 * A thieves' operation against a house. extra: { material, category, building, frame: [realm, state] }
 * for the operations that need them. Intel lands in your state's reports.
 */
export async function operation(target, op, thieves, opts = {}, extra = {}) {
  const h = await houseOf(target);
  if (!h) return null;
  const cmd = { type: 'operation', house: me(), target: h.id, op, thieves: Number(thieves) };
  for (const k of ['material', 'category', 'building']) if (extra[k]) cmd[k] = extra[k];
  if (extra.frame) cmd.frame = extra.frame;
  setTarget(h);
  const out = await run(cmd, opts);
  if (out) addLocalNews({ type: 'own_result', outcome: out, target: h });
  if (out && out.intel) loadReports();
  return out;
}

/** Work a rite: on yourself (no target) or, for divinations and hexes, on a house. */
export async function cast(rite, target, opts = {}) {
  const cmd = { type: 'cast', house: me(), rite };
  if (target != null && target !== '') {
    const h = await houseOf(target);
    if (!h) return null;
    cmd.target = h.id;
    setTarget(h);
  }
  const out = await run(cmd, opts);
  if (out) addLocalNews({ type: 'own_result', outcome: out, target: cmd.target != null ? store.target : null });
  if (out && out.intel) loadReports();
  return out;
}

// ---------- military: medics, upgrades, chariots, refining, razing ----------
export const trainMedics = (count, opts = {}) => run({ type: 'train_medics', house: me(), count: Number(count) }, opts);
/** Upgrade troops of slot `unit` (1-3 base units; 7 elite+ for races that upgrade twice). */
export const upgrade = (unit, count, opts = {}) => run({ type: 'upgrade', house: me(), unit: Number(unit), count: Number(count) }, opts);
export const buildChariots = (count, opts = {}) => run({ type: 'build_chariots', house: me(), count: Number(count) }, opts);
/** Run a refining recipe `times` times (straight away). */
export const refine = (recipe, times, opts = {}) => run({ type: 'refine', house: me(), recipe, times: Number(times) }, opts);
/** Tear down buildings, leaving barren land. */
export const raze = (building, count, opts = {}) => run({ type: 'raze', house: me(), building, count: Number(count) }, opts);

// ---------- the market ----------
const marketAfter = (o) => { if (o) setTimeout(loadMarket, 400); return o; };
/** A market order; treasury: trade for your state (leader only). side: 'buy' | 'sell'. */
export const order = ({ side, material, quantity, price, treasury = false }, opts = {}) =>
  run({ type: 'order', house: me(), treasury: !!treasury, side, material, quantity: Number(quantity), price: Number(price) }, opts).then(marketAfter);
export const cancelOrder = (id, opts = {}) => run({ type: 'cancel', house: me(), order: Number(id) }, opts).then(marketAfter);

// ---------- your state: leadership, treasury, vigils ----------
const stateAfter = (o) => { if (o) setTimeout(loadState, 400); return o; };
/** vote: { type: 'for', house } | { type: 'against' } | { type: 'abstain' }. */
export const vote = (v, opts = {}) => run({ type: 'vote', house: me(), vote: v }, opts).then(stateAfter);
/** Give gold (material null) or a material to the state treasury. */
export const donate = (material, amount, opts = {}) => run({ type: 'donate', house: me(), material: material || null, amount: Number(amount) }, opts).then(stateAfter);
/** Leader only. */
export const setTax = (rateBp, opts = {}) => run({ type: 'set_tax', house: me(), rate_bp: Math.round(Number(rateBp)) }, opts).then(stateAfter);
/** Leader only: rename the state (1-40 characters, at most once every state_rename_ticks). */
export const renameState = (name, opts = {}) => run({ type: 'rename_state', house: me(), name: String(name) }, opts).then(stateAfter);
/** Aid to a house of your state: gold, food, soldiers, horses, aether, explorable or material:<id>. */
export const sendAid = (to, what, amount, opts = {}) => run({ type: 'send_aid', house: me(), to: Number(to), what, amount: Math.floor(Number(amount)) }, opts).then((o) => { if (o) stateAfter(o); return o; });
/** Leader only: treasury gold (material null) or a material to a house of the state. */
export const grant = (to, material, amount, opts = {}) => run({ type: 'grant', house: me(), to: Number(to), material: material || null, amount: Number(amount) }, opts).then(stateAfter);
/** Leader only: open a state vigil. */
export const openVigil = (vigil, opts = {}) => run({ type: 'open_vigil', house: me(), vigil }, opts).then(stateAfter);
export const giveToVigil = (aether, incense, opts = {}) => run({ type: 'give_to_vigil', house: me(), aether: Number(aether) || 0, incense: Number(incense) || 0 }, opts).then(stateAfter);
/** Steady a wavering general or academic: character = { kind, id }. */
export const reassure = (character, opts = {}) => run({ type: 'reassure', house: me(), character }, opts);

// ---------- war (leader only) ----------
const warAfter = (o) => { if (o) setTimeout(() => { loadWars(); loadRelations(); loadState(); }, 400); return o; };
export const declareWar = (realm, state, opts = {}) => run({ type: 'declare_war', house: me(), realm: Number(realm), state: Number(state) }, opts).then(warAfter);
export const offerPeace = (opts = {}) => run({ type: 'offer_peace', house: me() }, opts).then(warAfter);
export const withdraw = (opts = {}) => run({ type: 'withdraw', house: me() }, opts).then(warAfter);
export const proposeCeasefire = (realm, state, ticks, opts = {}) => run({ type: 'propose_ceasefire', house: me(), realm: Number(realm), state: Number(state), ticks: Number(ticks) }, opts).then(warAfter);
export const breakCeasefire = (realm, state, opts = {}) => run({ type: 'break_ceasefire', house: me(), realm: Number(realm), state: Number(state) }, opts).then(warAfter);

// ---------- chat ----------
/** Send a message to a channel (world, realm or state; state if left out). Returns true if it went. */
export async function sendChat(text, channel = 'state') {
  const ch = CHANNELS.includes(channel) ? channel : 'state';
  let t = String(text || '').trim();
  if (!t) return false;
  // "/wiki soldiers" is a command, not chat; "//text" sends "/text". Runs before any wait, so a
  // command that opens a tab does it inside the keypress.
  if (commands.isCommand(t)) {
    const done = commands.run(t);
    store.drafts[ch] = '';
    await done;
    return true;
  }
  if (t.startsWith('//')) t = t.slice(1);
  try {
    const m = await api(`/chat/${ch}`, { text: t });
    addChat({ channel: ch, ...m });
    store.drafts[ch] = '';
    return true;
  } catch (e) { say(e.message, 'bad'); return false; }
}

// ---------- account ----------
export async function signIn(email) {
  try { await auth.devLogin(String(email).trim()); say('Signed in.', 'good'); await refreshMe(); return true; } catch (e) { say(e.message, 'bad'); return false; }
}
export async function signOut() {
  try { await auth.logout(); } catch { /* signed out anyway */ }
  clearPrivate();
  await refreshMe();
  say('Signed out.');
}
/** Found a house. realm and state are optional (both or neither). */
export async function createHouse({ name, race, personality, realm, state }, opts = {}) {
  const cmd = { type: 'create_house', name: String(name).trim(), race, personality };
  if (realm && state) Object.assign(cmd, { realm: Number(realm), state: Number(state) });
  else if (realm || state) { say('Give both realm and state, or leave both blank.', 'bad'); return null; }
  const out = await run(cmd, opts);
  if (out) { await new Promise((r) => setTimeout(r, 450)); await refreshMe(); } // reads lag writes by ~¼ s
  return out;
}
