// The market's rules a page needs (the War Room's RES › MARKET and Straightline's Market use them). Books per material from /market, your orders and
// your state's treasury orders from /orders. Matching is continuous (economy.rs place_order): an
// order fills at once against waiting orders that meet its price, best price then oldest, each at
// the waiting order's price; the rest waits in the book. The side that fills at once (the taker)
// pays the market fee (the house's market_fee_bp from /me, after trading houses; the treasury pays
// the age's full fee); a waiting order pays none when it fills. A buyer whose realm isn't the
// seller's also pays the cross-realm fee (cross_realm_fee_bp from /rules; trading houses don't cut
// it), taker or not. The book doesn't say which realm a waiting order is from, so a buy holds
// quantity × price gold plus the most fees it could pay (market and cross-realm), as the server's
// escrow does, and unused gold comes back at once; a sell holds the goods. An
// order can't be cancelled for order_min_life_ms after it's placed. Leaders may trade from the
// treasury. Nobody trades with themselves: the server refuses a buy at or above its own sell (or a
// sell at or below its own buy). A leader and the treasury count as one trader.
import { store } from './store.js';
import { fmt, esc } from './words.js';
import { leaderId, isLeader } from './truths.js';

export { leaderId, isLeader };
export const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
export const MAX_Q = 1000000000;
export const cap = (s) => s[0].toUpperCase() + s.slice(1);
export const book = (m) => (store.market || []).find((x) => x.material === m);
export const best = (b, side) => (side === 'buy' ? b?.bids?.[0] : b?.asks?.[0]);

/** The market fee on what an order fills at once, basis points: yours from /me, or the age's for the treasury. */
export const feeBp = (treasury) => (treasury ? store.rules?.params?.market_fee_bp : store.house?.market_fee_bp) ?? 0;
/** Minutes an order stands before it can be cancelled. */
export const lockMin = () => Math.round((store.rules?.params?.order_min_life_ms ?? 0) / 60000);
/** The cross-realm fee a buyer pays when the seller is in another realm, basis points (the age's). */
export const crossBp = () => store.rules?.params?.cross_realm_fee_bp ?? 0;
/** A fee of `bp` on `gold`, rounded up (the engine's fee_on: a fee is a cost; an order's fees round once on its running total). */
export const feeOn = (gold, bp) => Math.floor((gold * bp + 9999) / 10000);
/** Gold a waiting buy holds: its price and room for the cross-realm fee (the engine's buy_hold). */
export const waitHold = (q, pr) => q * pr + feeOn(q * pr, crossBp());
/** Gold a buy must have when placed: what it holds waiting, plus the market fee it could pay taking, plus 1 (the engine's check). */
export const buyHold = (q, pr, treasury) => waitHold(q, pr) + feeOn(q * pr, feeBp(treasury)) + 1;
/** The most units `gold` can buy at `pr`, with room for the fees. */
export const buyMax = (gold, pr, treasury) => {
  if (!pr) return 0;
  let n = Math.floor(gold * 10000 / (pr * (10000 + feeBp(treasury) + crossBp())));
  while (n > 0 && buyHold(n, pr, treasury) > gold) n--;       // the fees round up: step back until it fits
  while (buyHold(n + 1, pr, treasury) <= gold) n++;            // or forward, if there's room for one more
  return n;
};
/** Where the cross-realm fee may apply to a buy of `m`: { you, makers, home } (home: your realm makes it). */
export function crossWhere(m) {
  const you = store.house?.realm, makers = book(m)?.realms || [];
  return { you, makers, home: makers.includes(you) };
}
/** What an order would fill at once against the book shown (best price first, each at the waiting
 * order's price), the fee on it, and the most cross-realm fee a buy could pay on it (if every
 * seller is in another realm): { k, value, fee, cross }. An estimate: the book can change first. */
export function fillNow(m, s, q, pr, treasury) {
  const rate = feeBp(treasury), xr = s === 'buy' ? crossBp() : 0;
  let k = 0, value = 0;
  for (const l of (s === 'buy' ? book(m)?.asks : book(m)?.bids) || []) {
    if (k >= q || (s === 'buy' ? l.price > pr : l.price < pr)) break;
    const n = Math.min(q - k, l.quantity);
    k += n; value += n * l.price;
  }
  // The fees round up once, on the running total (as the engine's place_order).
  return { k, value, fee: feeOn(value, rate), cross: feeOn(value, xr) };
}

/** What a party holds: { gold, mat(m) } for you, or for the treasury. */
export function holder(treasury) {
  if (treasury) { const t = store.state?.treasury || { gold: 0, materials: {} }; return { gold: t.gold, mat: (m) => t.materials[m] || 0, who: 'the treasury' }; }
  const h = store.house;
  return { gold: h.gold, mat: (m) => h.materials[m] || 0, who: 'you' };
}

// ---------- spoilage ----------
/** What each material would lose to spoilage at the next tick ({} when nothing, or no spoilage). */
export const spoils = (h = store.house) => h?.spoilage?.next || {};
/** One line on spoilage for a holdings view: the free allowance and what spoils next tick. */
export function spoilNote(h = store.house) {
  const s = h?.spoilage;
  if (!s) return '';
  const next = Object.entries(s.next);
  return `<p class="small ${next.length ? 'short' : 'dim'}">Spoilage: ${fmt(s.free)} of each material keep free (goods in sell orders count). `
    + (next.length ? `Next tick loses ${next.map(([m, n]) => `${fmt(n)} ${esc(m)}`).join(', ')}: sell or use the excess.` : 'Nothing spoils next tick.')
    + (store.rules?.params?.treasury_overflow ? " Your state's treasury overflow is shared among its houses before this." : '') + '</p>';
}
/** One line on what happens to a treasury's materials beyond its allowance (treasury overflow, or spoilage). */
export function treasuryNote() {
  const p = store.rules?.params;
  if (!p || !(p.spoil_max_bp > 0)) return '';
  const free = fmt(p.spoil_treasury_free || 0);
  return `<p class="small dim">${p.treasury_overflow
    ? `Treasury overflow: each tick, materials beyond ${free} of each are shared equally among the state's houses instead of spoiling (goods in its sell orders count toward the ${free}).`
    : `Spoilage: the treasury keeps ${free} of each material free (goods in its sell orders count); beyond that, some spoils each tick.`}</p>`;
}


/** How much one click can trade against a level: { q, why } (why: the reason it's 0). */
export function hitSize(side, m, price, quantity) {
  const h = store.house;
  const can = side === 'sell' ? (h.materials[m] || 0) : buyMax(h.gold, price, false);
  const q = Math.min(quantity, can, MAX_Q);
  return { q, why: q ? '' : side === 'sell' ? `you have no ${m}` : 'not enough gold' };
}
