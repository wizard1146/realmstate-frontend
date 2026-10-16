// Which kinds of news a player has turned off, kept in this browser. Each kind has two switches: in the News list
// at all, and (only if listed) as a pop-up card and on the message line. Grouped for people, not by the server's
// type names; a type not listed is under Other.
export const NEWS_KEY = 'realmstate.news.off';
export const QUIET_KEY = 'realmstate.news.quiet';

export const NEWS_GROUPS = [
  ['training', 'Training finished', 'troops, medics and recruits ready', ['troops_trained', 'training_done', 'medics_trained', 'troops_recovered']],
  ['building', 'Buildings finished', 'buildings ready', ['buildings_done']],
  ['land', 'Land and armies home', 'acres arriving, armies returning', ['land_arrived', 'army_returned']],
  ['attacks', 'Attacks on you', 'attacks, second strikes, land retaken, fires', ['attacked', 'attack_report', 'second_strike', 'land_retaken', 'burned']],
  ['shadows', 'Spies and magic', 'thieves caught, hexes cast and suffered, operations against you, auto-casts held', ['autocast_held', 'spies_caught', 'framing_uncovered', 'rite_resisted', 'hex_cast', 'hex_suffered', 'operation_suffered', 'afflicted']],
  ['market', 'Market and auctions', 'orders filled, outbid, offers, characters', ['order_filled', 'outbid', 'auction_unsold', 'trade_failed', 'offer_received', 'offer_declined', 'character_sold', 'character_bought', 'character_auctioned']],
  ['science', 'Science and the Colloquium', 'research chosen, tiers reached, academics leaving', ['research_chosen', 'project_tier', 'academic_left']],
  ['state', 'Your state', 'leaders, taxes, treasury, aid, vigils', ['leader_chosen', 'leader_removed', 'treasury_share', 'granted', 'tax_changed', 'state_renamed', 'aid_sent', 'aid_arrived', 'vigil_opened', 'vigil_begun', 'vigil_ended']],
  ['wars', 'Wars and peace', 'wars, ceasefires, blockades', ['war_declared', 'war_ended', 'peace_offered', 'ceasefire_proposed', 'ceasefire_agreed', 'ceasefire_broken', 'ceasefire_ended', 'blockade_raised', 'blockade_lifted']],
  ['troubles', 'Troubles at home', 'starving, desertion, generals lost', ['starving', 'deserted', 'general_killed']],
  ['quests', 'Quests and Truths', 'invitations, asks, Truths uncovered', ['quest_invited', 'quest_asks', 'quest_ended', 'truth_uncovered', 'truth_announced', 'character_wavering']],
  ['world', 'The world', 'dragons, wonders, realm work', ['dragon_raid', 'dragon_sighted', 'wonder_started', 'wonder_funded', 'wonder_lost', 'wonder_built', 'realm_work']],
  ['own', 'Your own orders', 'the results of what you sent', ['own_result']],
];
const GROUP_OF = new Map(NEWS_GROUPS.flatMap(([g, , , types]) => types.map((t) => [t, g])));

/** The groups turned off. */
const readSet = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); if (Array.isArray(v)) return new Set(v); } catch { /* storage off */ } return new Set(); };
const writeSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify([...v])); } catch { /* storage off */ } };
export const newsOff = () => readSet(NEWS_KEY);
export const setNewsOff = (groups) => writeSet(NEWS_KEY, groups);
/** The groups listed in News but without a pop-up. */
export const newsQuiet = () => readSet(QUIET_KEY);
export const setNewsQuiet = (groups) => writeSet(QUIET_KEY, groups);
/** Is this news item hidden by the player's settings? The end of an age and staff notes always show. */
export function newsHidden(n, off = newsOff()) {
  if (!n || n.type === 'age_ended' || n.type === 'admin_action') return false;
  return off.has(GROUP_OF.get(n.type) || 'other');
}
/** No pop-up card or message line for this item: it's off altogether, or listed without a pop-up. */
export function newsSilent(n) {
  if (!n || n.type === 'age_ended' || n.type === 'admin_action') return false;
  return newsHidden(n) || newsQuiet().has(GROUP_OF.get(n.type) || 'other');
}
/** The group a news item belongs to ('other' if none lists it). */
export const newsGroup = (n) => GROUP_OF.get(n?.type) || 'other';
