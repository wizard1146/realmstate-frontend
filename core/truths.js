// Truths, quests, the realm's work and World Wonders, as every view shares them: who leads your state, whether you can
// pay a quest's ask, the transmutation rate open to you, and what a wonder does. Reads /me and /rules only.
import { store } from './store.js';
import { fmt } from './words.js';

const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const CATS = ['economy', 'military', 'arcane'];

/** /state's leader is a house reference: { house, name, realm, state, seat }. */
export const leaderId = () => (store.state?.leader ? (store.state.leader.house ?? store.state.leader.id) : null);
export const isLeader = () => !!(store.house && leaderId() != null && leaderId() === store.house.id);
/** '' if you lead, else why a leader-only control is off. */
export const leaderWhy = () => (isLeader() ? '' : store.state?.leader ? `only the state's leader (${store.state.leader.name})` : 'only the state\'s leader, and your state has none yet');

/** What the house holds against a quest's ask: [enough?, the shortfall in words]. */
export function canPay(a) {
  const h = store.house;
  if (!a || !h) return [false, ''];
  const books = h.science?.books?.[CATS.indexOf(a.books_category || 'arcane')] ?? 0;
  const short = [
    a.gold > h.gold && `${fmt(a.gold - h.gold)} more gold`,
    a.material && a.amount > (h.materials?.[a.material] || 0) && `${fmt(a.amount - (h.materials?.[a.material] || 0))} more ${a.material}`,
    a.books > books && `${fmt(a.books - books)} more ${a.books_category || 'arcane'} books`,
    a.aether > h.aether && `${fmt(a.aether - h.aether)} more aether`,
  ].filter(Boolean);
  return [!short.length, short.join(', ')];
}

/** Transmutation open to you: { rate (in to 1), lesser, aether each, max }, rate 0 if you can't. */
export function transmuteRate() {
  const h = store.house, p = store.rules.params, tid = p.transmute_truth;
  const knows = (h?.truths || []).some((t) => t.id === tid);
  const rate = !tid ? 0 : knows ? p.transmute_in : h?.subscriber ? p.transmute_lesser_in : 0;
  return { rate, lesser: !knows && !!rate, aether: p.transmute_aether || 0, max: p.transmute_max, age: !!tid };
}

/** What a wonder does, in words, from its rules row. */
export function wonderDoes(w) {
  const out = (w.mods || []).map((m) => `${m.bp > 0 ? '+' : '−'}${pct(Math.abs(m.bp))} ${m.stat.replace(/_/g, ' ')} for your state`);
  if (w.academic_books_bp) out.push(`academics' books +${pct(w.academic_books_bp)} for your state`);
  if (w.resilience_gain_bp) out.push(`Spell Resilience ${(10000 + w.resilience_gain_bp) / 10000}× as fast, up to ${pct(w.resilience_max_bp)}, for your state`);
  if (w.revive_ticks) out.push(`once a season, the owner revives its army as it was ${w.revive_ticks} ticks earlier (${fmt(w.revive_renown)} renown)`);
  return out.join('; ');
}
