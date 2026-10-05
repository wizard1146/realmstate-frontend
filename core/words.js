// Sentences: news items, command outcomes and intel reports, in plain words.
// Everything returned is plain text; callers escape it (esc) or set it with textContent.

/** "explorable acres", "bauxite", "gold". */
const aidName = (what) => String(what || '').replace('material:', '').replace(/^explorable$/, 'explorable acres');

let myHouseId = null;
/** The store tells words which house is yours (news reads differently for each side). */
export const setMyHouse = (id) => { myHouseId = id; };

/** Display names, filled from /rules and your race by the store. */
export const names = { buildings: {}, attacks: {}, ops: {}, rites: {}, units: [], traits: {}, mats: {} };

export const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : String(n ?? '–'));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const addr = (h) => `${h.realm}:${h.state}:${h.seat}`;
/**
 * Unit slots: 0 soldiers, 1 offense, 2 defense, 3 elite, 4 thieves, 5-7 the upgraded three,
 * 8 mercenaries (hired for one attack, never at home), 9 elite++ (elite+ upgraded again, by races
 * with the elite_plus_plus flag).
 */
export const SOLDIER = 0;
export const THIEF = 4;
export const MERC = 8;
export const ELITE_PP = 9;
export const UNIT_SLOTS = 10;
/** Slots you can train (from soldiers, or straight from peasants). Soldiers are drafted, never trained. */
export const TRAINABLE = [1, 2, 3, 4];
/** Unit slots in reading order: soldiers, each base unit followed by its upgrade(s), then thieves. Mercenaries (8) only in attack forms. */
export const UNIT_ORDER = [0, 1, 5, 2, 6, 3, 7, 9, 4];
export const isUpgrade = (slot) => (slot >= 5 && slot <= 7) || slot === ELITE_PP;
/** The base unit an upgraded slot comes from (5 -> 1, 9 -> 3), or the slot itself. */
export const baseOf = (slot) => (slot === ELITE_PP ? 3 : slot >= 5 && slot <= 7 ? slot - 4 : slot);
/** What a slot upgrades into (1 -> 5, 7 -> 9 when the race allows it), or null. */
export const upgradeOf = (slot, plusPlus = false) => ({ 1: 5, 2: 6, 3: 7, 7: plusPlus ? ELITE_PP : null }[slot] ?? null);
export const where = (h) => (h ? `${h.name} (${addr(h)})` : 'someone');
const st = (s) => `${s.realm}:${s.state}`;

// ---------- clock times: UTC by default, or the browser's local time (remembered per browser) ----------
const TIME_KEY = 'realmstate.time';
export const clock = { utc: (() => { try { return localStorage.getItem(TIME_KEY) !== 'local'; } catch { return true; } })() };
/** Set UTC (true) or local (false) for every clock time on the page; remembered per browser. */
export function setClockUtc(utc) {
  clock.utc = !!utc;
  try { localStorage.setItem(TIME_KEY, clock.utc ? 'utc' : 'local'); } catch { /* storage off */ }
}
/** "UTC" or "local": say which one a list shows. */
export const zoneLabel = () => (clock.utc ? 'UTC' : 'local');
const tz = () => (clock.utc ? { timeZone: 'UTC' } : {});
const dayKey = (ms) => new Date(ms).toLocaleDateString('en-CA', tz());
/** "Tue 14:05" */
export const when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, ...tz() });
/** "14:05" */
export const hhmm = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, ...tz() });
/** "14:05" today, otherwise "Tue 14:05". */
export const dayTime = (ms) => (dayKey(ms) === dayKey(Date.now()) ? hhmm(ms) : when(ms));
/** Full date and time with the zone, for tooltips: "3 Oct 2026, 14:05:09 UTC". */
export const fullTime = (ms) => `${new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, ...tz() })} ${zoneLabel()}`;
/** A training batch's spread: "ready 12:00–16:00, most at 14:00" (or "ready 14:00" when all at once). */
export function readySpread(o) {
  if (!o.first_at || !o.last_at || o.first_at === o.last_at) return `ready ${dayTime(o.ready_at || o.last_at)}`;
  return `ready ${dayTime(o.first_at)}–${dayTime(o.last_at)}, most at ${dayTime(o.ready_at)}`;
}
const ord = (n) => n + (['th', 'st', 'nd', 'rd'][n % 10 < 4 && Math.floor(n / 10) % 10 !== 1 ? n % 10 : 0]);
const bname = (b) => names.buildings[b] || b;
const uname = (i) => names.units[i] || 'troops';
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;

function verb(kind) {
  return { breach: 'breached', reclaim: 'took land back from', torch: 'torched', sack: 'sacked', massacre: 'massacred', blockade: 'blockaded', raze: 'razed land of' }[kind] || 'attacked';
}

function spoils(s, v) {
  const parts = spoilParts(s);
  return parts.length ? ` (${v} ${parts.join(', ')})` : '';
}
/** What an attack took (or cost), as phrases: ['1,200 gold', 'razed 3 buildings', ...]. */
export function spoilParts(s) {
  if (!s) return [];
  const parts = [];
  if (s.gold) parts.push(`${fmt(s.gold)} gold`);
  if (s.food) parts.push(`${fmt(s.food)} food`);
  Object.entries(s.materials || {}).forEach(([m, q]) => parts.push(`${fmt(q)} ${m}`));
  const books = (s.books || []).reduce((x, y) => x + y, 0);
  if (books) parts.push(`${fmt(books)} books`);
  if (s.buildings) parts.push(`razed ${fmt(s.buildings)} buildings`);
  if (s.peasants || s.thieves) parts.push(`killed ${fmt(s.peasants)} peasants and ${fmt(s.thieves)} thieves`);
  return parts;
}

/** "188 Pikemen finished training (12 came out as Pikemen+); 9 failed and went back to soldiers; 3 died. A general rose from the ranks: Aldric." */
function trainingDone(n) {
  const u = uname(n.unit);
  const up = names.units[upgradeOf(Number(n.unit))];
  const parts = [`${fmt(n.count)} ${u}${n.direct ? ' recruited from peasants' : ''} finished training${n.upgraded ? ` (${fmt(n.upgraded)} came out as ${up || 'upgraded'})` : ''}`];
  if (n.failed) parts.push(`${fmt(n.failed)} failed and went back to ${n.direct ? 'the peasants' : 'soldiers'}`);
  if (n.died) parts.push(`${fmt(n.died)} died`);
  let s = parts.join('; ') + '.';
  if (n.general) s += ` A general rose from the ranks: ${n.general}.`;
  return s;
}

/** One news item as a sentence (without the time). Returns [sentence, tone]; tone is 'bad', 'good' or ''. */
export function newsLine(n) {
  switch (n.type) {
    case 'attacked': return [`${n.by ? where(n.by) : 'A veiled army'} ${verb(n.kind)} us${n.success ? `${n.land_lost ? ` and took ${fmt(n.land_lost)} acres` : ''}${spoils(n.spoils, 'took')}` : ' and was driven off'}.`, n.success ? 'bad' : 'good'];
    case 'attack_report': return [`${names.attacks[n.kind] || n.kind || 'Attack'} on ${where(n.target)}: ${n.success ? `won${n.land ? `, ${fmt(n.land)} acres taken` : ''}${spoils(n.spoils, 'took')}` : 'repulsed'}; we lost ${fmt((n.troops_lost || []).reduce((a, b) => a + b, 0))} troops. Report card in NEWS.`, n.success ? 'good' : 'bad'];
    case 'spies_caught': return [`We caught ${fmt(n.caught)} thieves from ${where(n.by)}${n.op ? ` (${names.ops[n.op] || n.op})` : ''}${n.framing ? `, trying to frame ${st(n.framing)}` : ''}.`, 'good'];
    case 'framing_uncovered': return [`${where(n.by)} tried to frame our state for an operation against ${where(n.target)}.`, 'bad'];
    case 'character_wavering': return [`${n.name} of ${where(n.owner)} is wavering after being courted, until tick ${n.until_tick}.${n.reassure_gold ? ` Reassure for ${fmt(n.reassure_gold)} gold.` : ''}`, 'bad'];
    case 'character_auctioned': return [`${n.name} went to auction after wavering (reserve ${fmt(n.reserve)}).`, 'bad'];
    case 'vigil_opened': return [`${where(n.by)} opened the ${n.name}.`, ''];
    case 'vigil_begun': return [`The ${n.name} is in force until tick ${n.until_tick}.`, 'good'];
    case 'vigil_ended': return [`The ${n.name} has ended.`, ''];
    case 'age_ended': return [`The age is over. ${n.winner ? `State ${st(n.winner)} won. ` : ''}Our state finished ${ord(n.state_rank)}, our house ${ord(n.land_rank)} by land.`, ''];
    case 'rite_resisted': return [`We resisted ${n.rite} from ${where(n.by)}.`, 'good'];
    case 'hex_suffered': return [`${n.reflected ? 'Our own hex turned back on us' : 'A hex struck us'} (${n.rite}): ${n.taken && !String(n.what).includes('unravelled') ? `${fmt(n.taken)} ` : ''}${n.what}.`, 'bad'];
    case 'operation_suffered': return [`Thieves struck us (${n.op}): ${/delayed|growth|unsettled|cut/.test(n.what) ? n.what : `${fmt(n.taken)} ${n.what}`}${n.blamed ? `. They wore the colours of ${st(n.blamed)}` : ''}.`, 'bad'];
    case 'land_arrived': return [`${fmt(n.acres)} explored acres arrived.`, 'good'];
    case 'troops_trained': return [`${fmt(n.count)} ${uname(n.unit)} finished training.`, 'good'];
    case 'own_result': return [`${n.target ? `${n.outcome.type === 'cast' ? 'Rite on' : 'Thieves at'} ${where(n.target)}: ` : ''}${describe(n.outcome)}`, outcomeTone(n.outcome) === 'bad' ? 'bad' : 'good'];
    case 'training_done': return [trainingDone(n), 'good'];
    case 'starving': {
      const lost = (n.troops_lost || []).reduce((a, b) => a + b, 0);
      return [`Your house is starving: no food left. ${fmt(n.peasants)} peasants${lost ? ` and ${fmt(lost)} troops` : ''} died, and no peasants were born. Grow or buy food.`, 'bad'];
    }
    case 'army_returned': return [`Our army came home${n.land ? ` with ${fmt(n.land)} acres` : ''}.`, 'good'];
    case 'leader_chosen': return [`${where(n.leader)} was chosen to lead the state.`, ''];
    case 'leader_removed': return [`${where(n.was)} lost the leadership.`, ''];
    case 'order_filled': return [`${n.side === 'buy' ? 'Bought' : 'Sold'} ${fmt(n.quantity)} ${n.material} at ${fmt(n.price)}${n.left ? ` (${fmt(n.left)} still open)` : ''}.`, ''];
    case 'granted': return [`${where(n.by)} granted us ${fmt(n.amount)} ${n.material || 'gold'}.`, 'good'];
    case 'medics_trained': return [`${fmt(n.count)} medics are ready.`, 'good'];
    case 'general_killed': return [`Our general ${n.name} fell in battle.`, 'bad'];
    case 'buildings_done': return [`${fmt(n.count)} ${bname(n.building)} finished.`, 'good'];
    case 'research_chosen': return [`${where(n.by)} set the Colloquium to research ${n.project}.`, ''];
    case 'project_tier': return [`The Colloquium's ${n.project} ${n.tier > n.was ? 'reached' : 'fell to'} tier ${n.tier}.`, ''];
    case 'academic_left': return [`Our academic ${n.name} left; we no longer have the universities to keep them.`, 'bad'];
    case 'outbid': return [`Outbid for ${n.name} at ${fmt(n.price)}; your gold is back.`, ''];
    case 'auction_unsold': return [`${n.name}'s auction ended without a bid.`, ''];
    case 'trade_failed': return [`The sale of ${n.name} couldn't complete; any gold held went back.`, ''];
    case 'offer_received': return [`${where(n.by)} offers ${fmt(n.price)} for ${n.name}.`, ''];
    case 'offer_declined': return [`Your offer of ${fmt(n.price)} for ${n.name} ended; your gold is back.`, ''];
    case 'character_sold': return [`${n.name} went to ${where(n.to)} for ${fmt(n.price)}.`, ''];
    case 'character_bought': return [`${n.name} joins us from ${where(n.from)} for ${fmt(n.price)}.`, 'good'];
    case 'war_declared': return [`${st(n.by)} declared ${n.kind === 'general' ? 'war' : 'an intra-realm war'} on ${st(n.on)}.`, 'bad'];
    case 'war_ended': return [`The war between ${st(n.a)} and ${st(n.b)} ended ${n.winner ? `with ${st(n.winner)} the winner` : 'in peace'}.`, ''];
    case 'peace_offered': return [`${st(n.by)} offers peace.`, ''];
    case 'ceasefire_proposed': return [`${st(n.by)} proposes a ${n.ticks}-tick ceasefire.`, ''];
    case 'ceasefire_agreed': return [`${st(n.a)} and ${st(n.b)} agreed a ${n.ticks}-tick ceasefire.`, 'good'];
    case 'ceasefire_broken': return [`${st(n.by)} broke the ceasefire.`, 'bad'];
    case 'ceasefire_ended': return [`The ceasefire between ${st(n.a)} and ${st(n.b)} ended.`, ''];
    case 'blockade_raised': return [`${st(n.by)} is blockading our state: ${n.level_bp / 100}% of our material output is lost until tick ${n.until_tick}.`, 'bad'];
    case 'blockade_lifted': return ['The blockade on our state has lifted.', 'good'];
    case 'tax_changed': return [`${where(n.by)} set the state's tax to ${n.rate_bp / 100}%.`, ''];
    case 'state_renamed': return [`${where(n.by)} renamed our state from ${n.from} to ${n.to}.`, ''];
    case 'aid_sent': return [`${where(n.from)} sent us aid: ${fmt(n.amount)} ${aidName(n.what)}, arriving ${when(n.arrives_at)}.`, 'good'];
    case 'aid_arrived': return [`Aid arrived from ${where(n.from)}: ${fmt(n.amount)} ${aidName(n.what)}.`, 'good'];
    case 'admin_action': return [`The game's staff ${n.what}${n.note ? `: ${n.note}` : ''}.`, ''];
    case 'troops_recovered': return [`${fmt((n.units || []).reduce((a, b) => a + b, 0))} of our battle dead rose again and came home.`, 'good'];
    case 'afflicted': return [`${n.by ? where(n.by) : 'A veiled army'} afflicted us with ${n.name} until tick ${n.until_tick}.`, 'bad'];
    case 'second_strike': {
      const killed = fmt((n.killed || []).reduce((a, b) => a + b, 0));
      const ours = myHouseId === n.attacker?.id;
      return [ours ? `Second strike on ${where(n.target)}: ${n.success ? `${killed} specialists killed` : 'repulsed'}.` : `${where(n.attacker)} struck us a second time: ${n.success ? `${killed} specialists lost` : 'driven off'}.`, ours === n.success ? 'good' : 'bad'];
    }
    case 'land_retaken': return [myHouseId === n.by?.id ? `We took back ${fmt(n.acres)} acres from ${where(n.from)}'s army.` : `${where(n.by)} took back ${fmt(n.acres)} acres from our army on its way home.`, myHouseId === n.by?.id ? 'good' : 'bad'];
    default: return [`${String(n.type || 'Something').replace(/_/g, ' ')} happened.`, ''];
  }
}
export const newsText = (n) => newsLine(n)[0];
export const isBad = (n) => newsLine(n)[1] === 'bad';

/** A command's outcome as a sentence. Gold figures here are the real amounts the server charged. */
export function describe(o) {
  switch (o.type) {
    case 'created': return `House founded at ${o.realm}:${o.state}:${o.seat}.`;
    case 'protection_left': return 'You left protection. Others can now attack you, and you them.';
    case 'explored': return `Exploring ${fmt(o.acres)} acres for ${fmt(o.gold)} gold${o.soldiers ? ` and ${fmt(o.soldiers)} soldiers, who go to settle it` : ''}. They arrive ${when(o.arrives_at)}.${o.books ? ` The explorers found lost texts: ${fmt(o.books)} books.` : ''}`;
    case 'training': return `Training ${fmt(o.count)} ${uname(o.unit)} for ${fmt(o.gold)} gold, ${readySpread(o)} (${zoneLabel()}).`;
    case 'draft_set': return `Draft rate set to ${o.rate_bp / 100}%. Each tick, up to 1% of your peasants are drafted as soldiers until you reach it.`;
    case 'building': return `Building ${fmt(o.count)} ${bname(o.building)} for ${fmt(o.gold)} gold. Ready ${when(o.ready_at)}.`;
    case 'upgrading': return `Upgrading ${fmt(o.count)} troops into ${uname(o.unit)} for ${fmt(o.material)} ${names.mats.upgrade || 'material'}. Ready ${when(o.ready_at)}.`;
    case 'training_medics': return `Training ${fmt(o.count)} medics for ${fmt(o.gold)} gold and ${fmt(o.material)} ${names.mats.medic || 'material'}. Ready ${when(o.ready_at)}.`;
    case 'refined': return `Refined ${fmt(o.quantity)} ${o.material}.`;
    case 'chariots_built': return `${plural(o.count, 'chariot', 'chariots')} built and ready.`;
    case 'voted': return 'Vote cast. It stands until you change it; leadership is counted each tick.';
    case 'order_placed': return `Order #${o.order} placed; it clears at the next tick. What it needs is held in escrow until then.`;
    case 'order_cancelled': return `Order #${o.order} cancelled; its escrow went back.`;
    case 'donated': return 'Given to the state treasury.';
    case 'granted': return 'Granted from the treasury.';
    case 'tax_set': return 'Tax set. It applies from the next tick.';
    case 'reassured': return `Reassured for ${fmt(o.gold)} gold: they are loyal again.`;
    case 'vigil_opened': return 'Vigil opened. Houses of the state can now give aether and incense to it.';
    case 'gave_to_vigil': return o.begun ? 'Given. The vigil is complete and now in force.' : 'Given to the vigil.';
    case 'war_declared': return 'War declared.';
    case 'peace_offered': return o.ended ? 'Peace: they had offered too, so the war is over.' : 'Peace offered. If they offer too, the war ends in peace. Offer again to take it back.';
    case 'withdrew': return 'Withdrew from the war, conceding it.';
    case 'ceasefire_proposed': return o.agreed ? 'Ceasefire agreed: they had proposed the same, so it holds from now.' : 'Ceasefire proposed. It holds once they propose the same length.';
    case 'ceasefire_broken': return 'Ceasefire broken.';
    case 'attack': return `${names.attacks[o.kind] || o.kind}: ${o.success ? 'victory' : 'driven off'} at ${fmt(o.offense)} offense${o.land ? `; ${fmt(o.land)} acres taken` : ''}${spoils(o.spoils, 'took')}${o.protection_bp < 10000 ? ` (they've been hit often lately: ${o.protection_bp / 100}% of the usual)` : ''}${o.size_bp < 10000 ? ` (a smaller house: ${o.size_bp / 100}% of the usual gains)` : ''}${o.renown ? `, +${fmt(o.renown)} renown` : ''}${o.saved ? `; medics saved ${fmt(o.saved)}` : ''}${o.mercenary_gold ? `; mercenaries cost ${fmt(o.mercenary_gold)} gold (survivors leave)` : ''}${o.general_killed ? '; our general fell' : ''}. Army home ${when(o.returns_at)}. Report card in NEWS (Alt+4).`;
    case 'operation': return o.success
      ? `${names.ops[o.op] || o.op}: success${o.intel ? '. The report is in INTRIGUE, shared with your state.' : `: ${fmt(o.taken)} taken.`} Chance was ${o.chance_bp / 100}%, nerve left ${o.nerve_bp / 100}%.`
      : `${names.ops[o.op] || o.op}: our thieves were caught, ${fmt(o.thieves_lost)} lost. Chance was ${o.chance_bp / 100}%.`;
    case 'cast': return castLine(o);
    case 'spy': return o.success ? `Full Dossier: success. Report in INTRIGUE.` : `Full Dossier: our thieves were caught, ${fmt(o.thieves_lost)} lost.`;
    case 'invested': return 'Books invested; the science takes effect at once.';
    case 'scientists_moved': return 'Scientists moved. Their experience stayed behind, so the new category\'s rank may drop.';
    case 'science_set': return 'Science settings saved.';
    case 'research_set': return 'The Colloquium has a new project.';
    case 'contributed': return `Books given to the Colloquium${o.renown ? `; +${fmt(o.renown)} renown` : ''}.`;
    case 'academic_recruited': return `Academic recruited for ${fmt(o.books)} books${o.material ? ` and ${fmt(o.material)} paper` : ''}${o.attributes?.length ? `: ${o.attributes.join(', ')}` : ''}.`;
    case 'razed': return `Razed for ${fmt(o.gold)} gold.`;
    case 'general_raised': return `A general is raised for ${fmt(o.cost)} material${o.traits?.length ? `, with ${o.traits.map((t) => names.traits?.[t] || t).join(', ')}` : ''}.`;
    case 'defender_set': return 'Main general set: the home defense has its commander.';
    case 'heirs_marked': return 'Heirs marked. When the age ends you keep the first ones, as many as your slots then allow.';
    case 'listed': return `Listed in the Hall of Deeds (listing ${o.listing}).`;
    case 'delisted': return 'Taken off the market.';
    case 'bid_placed': return 'Bid placed; the gold is held until you win or are outbid.';
    case 'offer_made': return 'Offer made; the gold is held until it is answered or lapses.';
    case 'offer_accepted': return 'Offer accepted: sold.';
    case 'offer_dropped': return 'Offer dropped; any held gold went back.';
    case 'heir_recalled': return `${o.name} has returned and is settling in.`;
    case 'state_renamed': return `The state is now called ${o.name}.`;
    case 'aid_sent': return `Aid sent: ${fmt(o.amount)} ${aidName(o.what)} left; ${fmt(o.arriving)} will arrive ${when(o.arrives_at)}${o.tax_bp ? ` (after a ${o.tax_bp / 100}% tax on the receiver)` : ''}.`;
    case 'mirrored': return o.race ? `Your troops now fight with the unit stats of the ${o.race}.` : 'Your troops fight with their own unit stats again.';
    case 'second_strike': return `Second strike at ${fmt(o.offense)} offense: ${o.success ? `${fmt((o.killed || []).reduce((a, b) => a + b, 0))} of their specialists killed` : 'repulsed'}; we lost ${fmt((o.lost || []).reduce((a, b) => a + b, 0))}. Your general is spent for a while.`;
    case 'land_retaken': return `Took back ${fmt(o.acres)} acres for ${fmt(o.elites)} elites.`;
    default: return 'Done.';
  }
}
function castLine(o) {
  const n = names.rites[o.rite] || o.rite;
  const chance = o.chance_bp < 10000 ? ` Chance was ${o.chance_bp / 100}%.` : '';
  if (!o.success) return `${n}: it was resisted. Aether left ${fmt(o.aether)}.${chance}`;
  const what = o.reflected ? 'it worked, but a Mirror Ward turned it back on us'
    : o.intel ? 'the vision is in INTRIGUE, shared with your state'
      : o.until_tick ? `in force until tick ${o.until_tick}` : `done${o.taken ? ` (${fmt(o.taken)})` : ''}`;
  return `${n}: ${what}. Aether left ${fmt(o.aether)}.${chance}`;
}

/** Was this outcome a setback (for colouring the message)? */
export const outcomeTone = (o) => ((o.type === 'attack' || o.type === 'operation' || o.type === 'cast' || o.type === 'spy') && (!o.success || o.reflected) ? 'bad' : 'good');

const listing = (m) => Object.entries(m || {}).filter(([, n]) => n).map(([k, n]) => `${fmt(n)} ${k}`).join(', ') || 'none';
/** Troops as a spy sees them: {soldiers, offense, defense, elites} (base and upgraded together, no thieves). */
export function forcesText(f) {
  if (!f) return 'none';
  if (Array.isArray(f)) return f.map((n, i) => (n ? `${fmt(n)} ${names.units[i] || `slot ${i}`}` : '')).filter(Boolean).join(', ') || 'none'; // an old report
  const parts = [['soldiers', f.soldiers], ['offense', f.offense], ['defense', f.defense], ['elites', f.elites]].filter(([, n]) => n).map(([k, n]) => `${fmt(n)} ${k}`);
  return parts.join(', ') || 'none';
}
/** The four kinds as numbers, for a table: [['Soldiers', n], ...]. */
export const forcesRows = (f) => [['Soldiers', f?.soldiers || 0], ['Offense', f?.offense || 0], ['Defense', f?.defense || 0], ['Elites', f?.elites || 0]];

/** An intel report's kind: an operation's or rite's report has `kind`; a spy report is a dossier. */
export const reportKind = (r) => r.kind || 'dossier';
export const REPORT_LABEL = { survey: 'SURVEY', muster: 'MUSTER', ledgers: 'LEDGERS', archives: 'ARCHIVES', couriers: 'COURIERS', dossier: 'DOSSIER', scrying: 'SCRYING', omens: 'OMENS', roads: 'ROADS' };

/** Intel report rows: [label, value]. Values are numbers or plain text. */
export function intelRows(r) {
  switch (reportKind(r)) {
    case 'survey': return [['Land', r.land], ['Barren', r.barren], ['Buildings', listing(r.buildings)], ['Being built', listing(r.constructing)]];
    case 'muster': return [['Troops home', forcesText(r.units)], ['Troops away', forcesText(r.away)], ['In training', r.training], ['Medics', r.medics], ['Horses / chariots', `${fmt(r.horses)} / ${fmt(r.chariots)}`],
      ['Generals', (r.generals || []).map(([n, t, away]) => `${n} (${t.join(', ') || 'no traits'})${away ? ' away' : ''}`).join('; ') || 'none'], ['Main general', r.defender || 'none'],
      ['Armies coming home', (r.armies || []).map(([at, troops, land]) => `${fmt(troops)} troops${land ? ` with ${fmt(land)} acres` : ''}, ${when(at)}`).join('; ') || 'none']];
    case 'ledgers': return [['Gold', r.gold], ['Food', r.food], ['Materials', listing(r.materials)],
      ['Market orders', (r.orders || []).map(([side, m, q, p]) => `${side} ${fmt(q)} ${m} at ${fmt(p)}`).join('; ') || 'none']];
    case 'archives': return [['Books invested', listing(r.invested)], ['Unspent books (econ / mil / arc)', (r.books || []).map(fmt).join(' / ')],
      ['Scientists (econ / mil / arc)', (r.scientists || []).map(fmt).join(' / ')], ['Academics', (r.academics || []).map(([n, a]) => `${n} (${a.join(', ')})`).join('; ') || 'none']];
    case 'couriers': return r.news && r.news.length ? r.news.map((n) => [when(n.at), newsText(n)]) : [['News', 'nothing in the last day']];
    case 'scrying': return [['Land', r.land], ['Peasants', r.peasants], ['Gold', r.gold], ['Food', r.food], ['Troops home', forcesText(r.units)]];
    case 'omens': return r.rites && r.rites.length ? r.rites.map(([n, until]) => ['Rite in force', `${n} to tick ${until}`]) : [['Rites', 'none in force']];
    case 'roads': return r.armies && r.armies.length
      ? r.armies.map(([at, troops, land, from]) => ['Army', `${fmt(troops)} troops${land ? ` carrying ${fmt(land)} acres${from ? ` from ${where(from)}` : ''}` : ''}, home ${when(at)}`])
      : [['Armies', 'none on the road']];
    default: return [['Race', `${r.race || '?'} · ${r.personality || '?'}`], ['Land', `${fmt(r.land)}${r.incoming_land ? ` (+${fmt(r.incoming_land)} coming)` : ''}`], ['Peasants', r.peasants], ['Gold', r.gold], ['Food', r.food],
      ['Troops home', forcesText(r.units)], ['Troops away', forcesText(r.away)], ['In training', r.training], ['Medics', r.medics], ['Renown', r.renown],
      ['Horses / chariots', `${fmt(r.horses)} / ${fmt(r.chariots)}`], ['Adepts', r.adepts || 0], ['Materials', listing(r.materials)],
      ['Buildings', listing(r.buildings)], ['Barren', r.barren],
      ['Generals', (r.generals || []).map(([n, t]) => `${n} (${t.join(', ') || 'no traits'})`).join('; ') || 'none'],
      ['Academics', (r.academics || []).map(([n, a]) => `${n} (${a.join(', ')})`).join('; ') || 'none']];
  }
}

/** Empty-state lines: what will appear and where it comes from. */
export const empty = {
  news: 'No news yet. Things that happen to your house (land arriving, troops trained, attacks, state events) appear here as they happen.',
  chat: (st) => `No messages yet. Messages from the houses of state ${st} appear here live; what you send, your whole state sees.`,
  channel: { world: 'No messages on the world channel yet. Every house in every realm reads it.', realm: (r) => `No messages on realm ${r}'s channel yet. Every house in realm ${r} reads it.`, state: (st) => `No messages yet. The houses of state ${st} read this channel.` },
  reports: 'No reports yet. Intel from your state\'s thieves and divinations lands here, newest first.',
  members: 'No houses found in this state.',
  rankings: 'No houses ranked yet. Rankings list every house by land and refresh each tick.',
  standings: 'No state standings yet. They appear once houses hold land and refresh each tick.',
};

/** A tick report (what one tick changed for your house) as a compact line, or '' if nothing changed. */
const TICK_FIELDS = [['gold', 'gold'], ['food', 'food'], ['peasants', 'peasants'], ['soldiers', 'soldiers'], ['troops', 'troops'], ['land', 'acres'], ['incoming_land', 'acres coming'], ['books', 'books'], ['renown', 'renown'], ['horses', 'horses']];
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
export function tickLine(r) {
  const parts = TICK_FIELDS.filter(([k]) => r[k]).map(([k, label]) => `${signed(r[k])} ${label}`);
  return `Tick ${r.tick}: ${parts.join(' · ') || 'no change'}`;
}
