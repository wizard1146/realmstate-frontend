// The world feed (GET /world/news, and live "world_news" messages): news every player may know. Wars declared and
// ended, ceasefires, Truths announced, dragons sighted, and big market moves (never who traded). Read on demand,
// again at most once a minute as the ticks go, and added to as live news arrives; each view draws it its own way.
import { notify } from './store.js';
import { api } from './api.js';
import { fmt, dragonWho } from './words.js';
import { stateName } from './world.js';

const KEEP = 30;
/** Straightline's world news strip, on unless turned off (Configuration > News); kept in this browser. */
export const FEED_KEY = 'realmstate.line.feed';
export const feedOn = () => { try { return JSON.parse(localStorage.getItem(FEED_KEY)) !== false; } catch { return true; } };
/** items: newest first; ok: false once the server has said it has no feed (an older one), so views can hide it. */
export const feed = { items: [], ok: true, at: 0 };

export async function loadWorldNews({ force = false } = {}) {
  if (!force && Date.now() - feed.at < 60000) return;
  feed.at = Date.now();
  try { feed.items = (await api(`/world/news?limit=${KEEP}`)).slice(0, KEEP); feed.ok = true; } catch (e) { if (e.status === 404) feed.ok = false; }
  notify('worldnews');
}
/** A live world_news message. */
export function addWorldNews(n) {
  if (feed.items.some((x) => x.at === n.at && x.type === n.type)) return;
  feed.items.unshift(n);
  if (feed.items.length > KEEP) feed.items.length = KEEP;
  notify('worldnews', n);
}

const st = (s) => (s ? stateName(s.realm, s.state) : 'a state');
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const mat = (m) => cap(String(m || 'a material'));
/** One item as [label, text]: a short kind ("War", "Market") and its line. Null for a kind this page doesn't know. */
export function worldLine(n) {
  switch (n.type) {
    case 'war_declared': return ['War', `${st(n.by)} declared ${n.kind === 'general' ? 'war' : 'an intra-realm war'} on ${st(n.on)}`];
    case 'war_ended': return ['Peace', `The war between ${st(n.a)} and ${st(n.b)} ended${n.winner ? `: ${st(n.winner)} won` : ''}`];
    case 'ceasefire_agreed': return ['Peace', `${st(n.a)} and ${st(n.b)} agreed a ${fmt(n.ticks)}-tick ceasefire`];
    case 'ceasefire_broken': return ['War', `${st(n.by)} broke a ceasefire`];
    case 'ceasefire_ended': return ['Peace', `The ceasefire between ${st(n.a)} and ${st(n.b)} ended`];
    case 'truth_announced': return ['Truth', `${st(n.by)} uncovered a Truth: ${n.truth}`];
    case 'dragon_sighted': return ['Dragon', `${dragonWho(n)} struck in ${n.realm_name || `realm ${n.realm}`}`];
    case 'market_trade': return ['Market', `A ${n.side === 'buy' ? 'buyer took' : 'seller sold'} ${fmt(n.units)} ${String(n.material)} at ${fmt(n.price)} gold`];
    case 'market_swing': {
      const up = n.to > n.from, pct = n.from ? Math.round((100 * Math.abs(n.to - n.from)) / n.from) : 0;
      return ['Market', `${mat(n.material)} ${up ? 'rose' : 'fell'} from ${fmt(n.from)} to ${fmt(n.to)} gold (${up ? '+' : '−'}${pct}%)`];
    }
    default: return null;
  }
}
export const worldItems = () => feed.items.map((n) => [n, worldLine(n)]).filter(([, l]) => l);
