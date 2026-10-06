// The market (RES › MARKET, pane and detail). Books per material from /market, your orders and
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
import { store, say, loadMarket } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, when, dayTime } from '../../core/words.js';
import { tabState } from './tabs.js';

/** RES pane and detail tabs. */
export const RES_TAB = tabState('realmstate.room.res', ['holdings', 'buildings', 'market'], { holdings: 'HOLDINGS', buildings: 'BUILDINGS', market: 'MARKET' });

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const MAX_Q = 1000000000;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
/** /state's leader is a house reference: { house, name, realm, state, seat }. */
export const leaderId = () => store.state?.leader ? (store.state.leader.house ?? store.state.leader.id) : null;
export const isLeader = () => !!(store.house && leaderId() != null && leaderId() === store.house.id);
const book = (m) => (store.market || []).find((x) => x.material === m);
const best = (b, side) => (side === 'buy' ? b?.bids?.[0] : b?.asks?.[0]);

/** The market fee on what an order fills at once, basis points: yours from /me, or the age's for the treasury. */
const feeBp = (treasury) => (treasury ? store.rules?.params?.market_fee_bp : store.house?.market_fee_bp) ?? 0;
/** Minutes an order stands before it can be cancelled. */
const lockMin = () => Math.round((store.rules?.params?.order_min_life_ms ?? 0) / 60000);
/** The cross-realm fee a buyer pays when the seller is in another realm, basis points (the age's). */
export const crossBp = () => store.rules?.params?.cross_realm_fee_bp ?? 0;
/** Gold a waiting buy holds: its price and room for the cross-realm fee (the server's buy_hold). */
const waitHold = (q, pr) => q * pr + Math.floor(q * pr * crossBp() / 10000);
/** Gold a buy holds when placed: its value at its own price plus the most fees it could pay. */
const buyHold = (q, pr, treasury) => waitHold(q, pr) + Math.floor(q * pr * feeBp(treasury) / 10000);
/** The most units `gold` can buy at `pr`, with room for the fees. */
const buyMax = (gold, pr, treasury) => {
  if (!pr) return 0;
  let n = Math.floor(gold * 10000 / (pr * (10000 + feeBp(treasury) + crossBp())));
  while (n > 0 && buyHold(n + 1, pr, treasury) <= gold) n++; // rounding down each fee can leave room for one more
  return n;
};
/** Where the cross-realm fee may apply to a buy of `m`: { you, makers, home } (home: your realm makes it). */
function crossWhere(m) {
  const you = store.house?.realm, makers = book(m)?.realms || [];
  return { you, makers, home: makers.includes(you) };
}
/** What an order would fill at once against the book shown (best price first, each at the waiting
 * order's price), the fee on it, and the most cross-realm fee a buy could pay on it (if every
 * seller is in another realm): { k, value, fee, cross }. An estimate: the book can change first. */
function fillNow(m, s, q, pr, treasury) {
  const rate = feeBp(treasury), xr = s === 'buy' ? crossBp() : 0;
  let k = 0, value = 0, fee = 0, cross = 0;
  for (const l of (s === 'buy' ? book(m)?.asks : book(m)?.bids) || []) {
    if (k >= q || (s === 'buy' ? l.price > pr : l.price < pr)) break;
    const n = Math.min(q - k, l.quantity);
    k += n; value += n * l.price; fee += Math.floor(n * l.price * rate / 10000); cross += Math.floor(n * l.price * xr / 10000);
  }
  return { k, value, fee, cross };
}

/** What a party holds: { gold, mat(m) } for you, or for the treasury. */
function holder(treasury) {
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

// ---------- the order form ----------
/** p: id prefix; full: the detail's version (with the treasury switch). */
export function formHTML(p, full = false) {
  const mats = (store.market || []).map((m) => m.material);
  const opts = mats.map((m) => `<option value="${esc(m)}">${esc(cap(m))}</option>`).join('');
  if (!full) {
    return `<form id="${p}-f" class="ticket mkt" novalidate>
      <span class="verb">ORDER</span>
      <span class="args"><label class="vh" for="${p}-side">Buy or sell</label><select id="${p}-side"><option value="buy">BUY</option><option value="sell">SELL</option></select>
        <label class="vh" for="${p}-q">Quantity</label><input id="${p}-q" type="number" min="1" value="100" class="w5"><button type="button" class="btn mini max" data-mktmax aria-label="Most you can order">MAX</button>
        <label class="vh" for="${p}-m">Material</label><select id="${p}-m">${opts}</select>
        <label for="${p}-p" title="Gold a unit: the most you pay (buy) or the least you take (sell)">@</label><input id="${p}-p" type="number" min="1" value="10" class="w5"></span>
      <span class="cost num" id="${p}-cost"></span>
      <button class="btn primary">EXEC</button>
    </form>
    <p class="small mkt-hold" id="${p}-hold"></p>`;
  }
  return `<form id="${p}-f" class="dform" novalidate>
    <span class="lbl" id="${p}-sidel">Side</span>
    <span class="srcpick" role="radiogroup" aria-labelledby="${p}-sidel"><label><input type="radio" name="${p}-side" value="buy" checked> Buy</label><label><input type="radio" name="${p}-side" value="sell"> Sell</label></span>
    <label for="${p}-m">Material</label><select id="${p}-m">${opts}</select>
    <label for="${p}-q">Quantity</label>
    <span class="field"><input id="${p}-q" type="number" min="1" value="100" inputmode="numeric"><button type="button" class="btn mini" data-mktmax aria-label="Most you can order">MAX</button></span>
    <label for="${p}-p">Price</label>
    <span class="field"><input id="${p}-p" type="number" min="1" value="10" inputmode="numeric"><small class="dim">gold a unit: the most you pay, or the least you take</small></span>
    <span class="lbl">For</span>
    <span class="trpick"><label class="check"><input type="checkbox" id="${p}-tr"> The state treasury</label> <small class="dim" id="${p}-trwhy"></small></span>
    <span class="quote num span" id="${p}-cost"></span>
    <p class="small span" id="${p}-hold"></p>
    <span class="btns span"><button class="btn primary">PLACE ORDER</button></span>
    <p class="dim small span">An order fills at once against waiting orders that meet your price, best price first, each at the waiting order's price; the rest waits in the book. What fills at once pays the market fee (<span id="${p}-fee">your fee</span> here; trading houses cut it); a waiting order pays no fee when it fills. A buyer from another realm than the seller's also pays the cross-realm fee (<span id="${p}-xfee">some</span> more, taker or not; trading houses don't cut it), so a buy holds room for it and gets it back for what comes from its own realm. An order stands <span id="${p}-lock">a few</span> minutes before you can cancel it. You may buy and sell one material at once, but your buy must be below your own sell (and the treasury's, if you lead): you can't trade with yourself.</p>
  </form>`;
}

/** Wires a form drawn by formHTML inside `box`. Returns { update() }. */
export function wireForm(box, on, p, full = false) {
  const $ = (id) => box.querySelector(`#${p}-${id}`);
  let priceTouched = false;
  const side = () => (full ? box.querySelector(`input[name="${p}-side"]:checked`)?.value : $('side').value) || 'buy';
  const treasury = () => !!(full && $('tr')?.checked);
  function fillOptions() {
    const sel = $('m');
    const mats = (store.market || []).map((m) => m.material);
    if (sel.options.length !== mats.length) {
      const v = sel.value;
      sel.innerHTML = mats.map((m) => `<option value="${esc(m)}">${esc(cap(m))}</option>`).join('');
      if (mats.includes(v)) sel.value = v;
    }
  }
  /** A starting price: the other side's best, else the last trade. */
  function suggest() {
    if (priceTouched) return;
    const b = book($('m').value);
    const other = best(b, side() === 'buy' ? 'sell' : 'buy');
    const v = other?.price || b?.last?.price || 0;
    if (v) $('p').value = String(v);
  }
  function update() {
    if (!store.house || !store.market) return;
    fillOptions();
    const m = $('m').value, s = side(), tr = treasury();
    const q = num($('q').value), pr = num($('p').value);
    const hd = holder(tr);
    const lead = isLeader();
    if (full) {
      $('fee').textContent = `${feeBp(tr) / 100}%`; // the treasury pays the age's full fee
      $('xfee').textContent = `${crossBp() / 100}%`;
      $('lock').textContent = String(lockMin());
      $('tr').disabled = !lead;
      if (!lead) $('tr').checked = false;
      $('trwhy').textContent = lead ? 'you lead the state' : 'leader only';
    }
    const need = s === 'buy' ? buyHold(q, pr, tr) : q;
    const have = s === 'buy' ? hd.gold : hd.mat(m);
    const crosses = (o) => (s === 'buy' ? o.price <= pr : o.price >= pr);
    const mine = (store.orders || []).find((o) => o.material === m && o.side !== s && (tr ? o.treasury || lead : !o.treasury || lead) && crosses(o));
    const why = !q ? 'choose a quantity' : !pr ? 'choose a price' : q > MAX_Q ? `at most ${fmt(MAX_Q)}` : mine ? `would fill your own ${mine.side} #${mine.order} at ${fmt(mine.price)}: ${s === 'buy' ? 'buy below' : 'sell above'} ${fmt(mine.price)} (no trading with yourself)` : need > have ? `${hd.who === 'you' ? 'you have' : 'the treasury has'} ${fmt(have)} ${s === 'buy' ? 'gold' : m}`
      : '';
    const c = $('cost');
    const { k, value, fee, cross } = fillNow(m, s, q, pr, tr), rest = q - k;
    const xb = crossBp(), xw = crossWhere(m);
    const now = k ? `≈${fmt(k)} now ${s === 'buy' ? `for ${fmt(value + fee)}g${cross ? ` (+≤${fmt(cross)}g cross-realm)` : ''}` : `→ ${fmt(value - fee)}g`}` : 'none fills now';
    c.textContent = `holds ${s === 'buy' ? `${fmt(need)}g` : `${fmt(q)} ${m}`} · ${now}${k && rest ? ` · ${fmt(rest)} wait` : ''}${full && why ? ` · ${why}` : ''}`;
    c.title = why ? `Can't: ${why}` : [
      s === 'buy' ? `Holds ${fmt(need)} gold: ${fmt(q * pr)} at your price, plus room for the ${feeBp(tr) / 100}% market fee${xb ? ` and the ${xb / 100}% cross-realm fee` : ''}; unused gold comes back at once.` : `Holds ${fmt(q)} ${m}.`,
      k ? `About ${fmt(k)} fill at once against waiting ${s === 'buy' ? 'asks' : 'bids'}, each at its own price: ${fmt(value)} gold ${s === 'buy' ? 'plus' : 'less'} a ${fmt(fee)} gold fee${s === 'buy' && cross ? `, and up to ${fmt(cross)} gold cross-realm fee for what comes from another realm` : ''}.` : `Nothing waits at ${fmt(pr)} or ${s === 'buy' ? 'less' : 'more'}, so nothing fills at once.`,
      rest ? `${fmt(rest)} wait in the book at ${fmt(pr)}; filled later, they pay no market fee${s === 'buy' && xb ? `, but up to ${xb / 100}% cross-realm fee` : ''}.` : '',
      s === 'buy' && xb ? `The cross-realm fee: up to ${xb / 100}% more if bought from another realm than yours (realm ${xw.you}). ${cap(m)} is made in realm${xw.makers.length === 1 ? '' : 's'} ${xw.makers.join(', ') || 'none'}${xw.home ? ', yours among them' : ''}, but anyone may resell it, and the book doesn't say who; what comes from your own realm gives the held fee back.` : '',
      `An order stands ${lockMin()} minutes before you can cancel it.`,
    ].filter(Boolean).join(' ');
    c.classList.toggle('short', !!why);
    const b = book(m);
    $('hold').innerHTML = `${tr ? 'Treasury' : 'You'}: <b class="num">${fmt(hd.gold)}</b> gold · <b class="num">${fmt(hd.mat(m))}</b> ${esc(m)}`
      + (s === 'buy' && xb ? ` <span class="dim">· up to ${xb / 100}% more if bought from another realm${xw.home ? '' : ` (${esc(m)} isn't made in yours)`}</span>` : '')
      + ` <span class="dim">· best bid ${b?.bids?.[0] ? `${fmt(b.bids[0].price)}×${fmt(b.bids[0].quantity)}` : '–'} · best ask ${b?.asks?.[0] ? `${fmt(b.asks[0].price)}×${fmt(b.asks[0].quantity)}` : '–'} · last ${b?.last?.volume ? `${fmt(b.last.price)} (T${b.last.tick}, ${fmt(b.last.volume)})` : 'none'}</span>`;
  }
  on(box.querySelector(`#${p}-f`), 'input', (ev) => {
    if (ev.target === $('p')) priceTouched = true;
    if (ev.target === $('m') || ev.target.name === `${p}-side` || ev.target === $('side')) suggest();
    update();
  });
  on(box, 'click', (ev) => {
    if (!ev.target.closest('[data-mktmax]')) return;
    const m = $('m').value, hd = holder(treasury());
    const pr = num($('p').value);
    const n = side() === 'buy' ? buyMax(hd.gold, pr, treasury()) : hd.mat(m);
    $('q').value = String(Math.min(MAX_Q, n));
    if (!n) say(`MAX is 0: ${side() === 'buy' ? (pr ? 'not enough gold at that price' : 'choose a price first') : `no ${m} to sell`}.`, 'bad');
    update();
  });
  on(box.querySelector(`#${p}-f`), 'submit', async (ev) => {
    ev.preventDefault();
    const out = await act.order({ side: side(), material: $('m').value, quantity: num($('q').value), price: num($('p').value), treasury: treasury() }, { button: ev.submitter });
    if (out) priceTouched = false;
    update();
  });
  suggest();
  update();
  return { update, set(m, s, price) { $('m').value = m; if (full) { const r = box.querySelector(`input[name="${p}-side"][value="${s}"]`); if (r) r.checked = true; } else $('side').value = s; if (price) { $('p').value = String(price); priceTouched = true; } else { priceTouched = false; suggest(); } update(); $('q').focus(); $('q').select(); } };
}

// ---------- your orders ----------
export function ordersHTML(compact = false) {
  const list = store.orders || [];
  if (!list.length) return `<p class="dim small">No open orders${isLeader() ? ', for you or the treasury' : ''}.</p>`;
  const lead = isLeader();
  const life = store.rules?.params?.order_min_life_ms ?? 0;
  return `<table class="tbl"><tr><th class="num">#</th><th>SIDE</th><th>MATERIAL</th><th class="num">QTY</th><th class="num">PRICE</th>${compact ? '' : '<th class="num">ESCROW</th><th>FOR</th><th>PLACED</th>'}<th></th></tr>`
    + list.map((o) => {
      const can = !o.treasury || lead;
      // The server decides; this only says when the lock lifts (the clocks may differ a little).
      const locked = life && o.placed_at + life > Date.now() ? ` title="An order stands ${lockMin()} minutes: cancel from ${esc(dayTime(o.placed_at + life))}"` : '';
      // A waiting buy holds its price and room for the cross-realm fee (orders placed before the fee held none).
      const esc2 = o.side === 'buy' ? `${fmt(waitHold(o.quantity, o.price))}g` : `${fmt(o.quantity)} ${o.material}`;
      return `<tr><td class="num dim">${o.order}</td><td class="${o.side === 'buy' ? 'up' : 'down'}">${o.side.toUpperCase()}</td><td>${esc(o.material)}${compact && o.treasury ? ' <span class="dim">T</span>' : ''}</td><td class="num">${fmt(o.quantity)}</td><td class="num">${fmt(o.price)}</td>`
        + `${compact ? '' : `<td class="num dim">${esc2}</td><td>${o.treasury ? 'treasury' : 'you'}</td><td class="small dim">${esc(when(o.placed_at))}</td>`}`
        + `<td><button type="button" class="btn mini" data-cancel="${o.order}"${can ? '' : ' disabled title="Treasury orders: the leader only"'}${can ? locked : ''} aria-label="Cancel order ${o.order}">CANCEL</button></td></tr>`;
    }).join('') + '</table>';
}
export function wireOrders(scope, on) {
  on(scope, 'click', (ev) => {
    const b = ev.target.closest('[data-cancel]');
    if (b) act.cancelOrder(b.dataset.cancel, { button: b });
  });
}

// ---------- the books ----------
/** One row per material: held, best bid and ask, last trade. Rows pick the material in the form. */
export function booksHTML() {
  const h = store.house;
  if (!store.market) return '<p class="dim">Loading the market…</p>';
  return `<table class="tbl"><tr><th>MATERIAL</th><th class="num">HELD</th><th class="num"><abbr title="Best bid: price × quantity">BID</abbr></th><th class="num"><abbr title="Best ask: price × quantity">ASK</abbr></th><th class="num"><abbr title="Last trade price">LAST</abbr></th><th></th></tr>`
    + store.market.map((m) => {
      const bd = m.bids[0], ak = m.asks[0];
      return `<tr><td title="${esc(m.description)}">${esc(cap(m.material))}</td><td class="num${h.materials[m.material] ? '' : ' zero'}">${fmt(h.materials[m.material] || 0)}</td>`
        + `<td class="num${bd ? '' : ' zero'}">${bd ? `${fmt(bd.price)}<span class="dim">×${fmt(bd.quantity)}</span>` : '·'}</td><td class="num${ak ? '' : ' zero'}">${ak ? `${fmt(ak.price)}<span class="dim">×${fmt(ak.quantity)}</span>` : '·'}</td>`
        + `<td class="num${m.last.volume ? '' : ' zero'}">${m.last.volume ? fmt(m.last.price) : '·'}</td>`
        + `<td><button type="button" class="btn mini" data-pick-mat="${esc(m.material)}" data-side="buy" aria-label="Buy ${esc(m.material)}">B</button><button type="button" class="btn mini" data-pick-mat="${esc(m.material)}" data-side="sell" aria-label="Sell ${esc(m.material)}">S</button></td></tr>`;
    }).join('') + '</table>';
}
/** The detail's full books: each material's bids and asks (10 levels each). A level's button
 * trades against it at once: SELL into a bid, BUY from an ask, at that price, as much as the level
 * shows and you hold (or can pay for, with the fee). It's an ordinary order, so it fills at once,
 * at that price or better, paying the market fee; anything left waits in the book. */
/** How much one click can trade against a level: { q, why } (why: the reason it's 0). */
function hitSize(side, m, price, quantity) {
  const h = store.house;
  const can = side === 'sell' ? (h.materials[m] || 0) : buyMax(h.gold, price, false);
  const q = Math.min(quantity, can, MAX_Q);
  return { q, why: q ? '' : side === 'sell' ? `you have no ${m}` : 'not enough gold' };
}
/** A made material's output this tick per realm, with its season (and depletion, if any). */
function outputNow(m) {
  const o = m.output_now?.[0];
  if (!o) return `${fmt(m.output_per_tick)}/tick`;
  const dep = o.depletion_bp < 10000 ? ` · deposit ${o.depletion_bp / 100}%` : '';
  return `<span title="Base ${fmt(m.output_per_tick)} a tick per realm; this tick's season is ${o.season_bp / 100}%${dep ? `, and the worked deposit gives ${o.depletion_bp / 100}%` : ''}">${fmt(o.per_tick)}/tick now (season ${o.season_bp / 100}%${dep})</span>`;
}
export function depthHTML() {
  if (!store.market) return '<p class="dim">Loading the market…</p>';
  const lvl = (rows, cls, side, m) => rows.length ? rows.map((r) => {
    const { q, why } = hitSize(side, m, r.price, r.quantity);
    const verb = side === 'buy' ? 'BUY' : 'SELL';
    const label = q ? `${verb} ${fmt(q)}` : verb;
    const tip = q ? `${side === 'buy' ? 'Buy' : 'Sell'} ${fmt(q)} ${m} at ${fmt(r.price)} now: fills at once, at this price or better, and pays the ${feeBp(false) / 100}% market fee` : `Can't: ${why}`;
    return `<tr><td class="num ${cls}">${fmt(r.price)}</td><td class="num">${fmt(r.quantity)}</td><td><button type="button" class="btn mini" data-hit-mat="${esc(m)}" data-side="${side}" data-price="${r.price}" data-qty="${r.quantity}"${q ? '' : ' disabled'} title="${esc(tip)}" aria-label="${esc(tip)}">${label}</button></td></tr>`;
  }).join('') : '<tr><td colspan="3" class="dim">none</td></tr>';
  return `<div class="dgrid">${store.market.map((m) => `<section><h4 class="sub">${esc(m.name || cap(m.material))} <span class="dim">${m.realms.length ? `realms ${m.realms.join(', ')} · ${outputNow(m)}` : 'refined'} · last ${m.last.volume ? `${fmt(m.last.price)} ×${fmt(m.last.volume)} at T${m.last.tick}` : 'none'}</span></h4>
    <p class="dim small">${esc(m.description)}</p>
    <div class="dgrid"><div><table class="tbl book"><tr><th class="num">BID</th><th class="num">QTY</th><th></th></tr>${lvl(m.bids, 'bid', 'sell', m.material)}</table></div>
    <div><table class="tbl book"><tr><th class="num">ASK</th><th class="num">QTY</th><th></th></tr>${lvl(m.asks, 'ask', 'buy', m.material)}</table></div></div></section>`).join('')}</div>`;
}

// ---------- the RES pane's MARKET tab ----------
export function paneHTML() {
  return `<div id="r-mk-form">${formHTML('r-mo')}</div>
    <h3 class="sub">BOOKS <span class="dim">best bid and ask · B/S fill the form</span></h3><div id="r-mk-books"></div>
    <h3 class="sub">YOUR ORDERS</h3><div id="r-mk-orders"></div>`;
}
export function wirePane(sec, on) {
  const form = wireForm(sec, on, 'r-mo');
  wireOrders(sec, on);
  on(sec, 'click', (ev) => { const b = ev.target.closest('[data-pick-mat]'); if (b) form.set(b.dataset.pickMat, b.dataset.side, Number(b.dataset.price) || 0); });
  function update(c) {
    if (!store.house) return;
    if (!c || c.has('market') || c.has('house') || c.has('state')) {
      form.update();
      sec.querySelector('#r-mk-books').innerHTML = booksHTML();
      sec.querySelector('#r-mk-orders').innerHTML = ordersHTML(true);
    }
  }
  update();
  return { update };
}

// ---------- the RES detail's MARKET tab ----------
export function detailHTML() {
  return `<div class="dgrid">
    <section><h3 class="sub">PLACE AN ORDER <span class="dim">fills at once against the book; the rest waits</span></h3>${formHTML('d-mo', true)}</section>
    <section><h3 class="sub">OPEN ORDERS <span class="dim">yours and your state's treasury's</span> <button type="button" class="btn mini" id="d-mk-reload">RELOAD</button></h3><div id="d-mk-orders"></div>
      <h3 class="sub gap">BOOKS <span class="dim">best bid and ask</span></h3><div id="d-mk-books"></div></section>
    <section class="wide"><h3 class="sub">DEPTH <span class="dim">every material's bids and asks; a level's button sells into that bid or buys from that ask at once (at that price or better, paying the market fee)</span></h3><div id="d-mk-depth"></div></section>
  </div>`;
}
export function wireDetail(sec, on) {
  const form = wireForm(sec, on, 'd-mo', true);
  wireOrders(sec, on);
  on(sec, 'click', (ev) => {
    const b = ev.target.closest('[data-pick-mat]');
    if (b) form.set(b.dataset.pickMat, b.dataset.side, Number(b.dataset.price) || 0);
    const hit = ev.target.closest('[data-hit-mat]');
    if (hit) {
      const { hitMat: m, side } = hit.dataset, price = Number(hit.dataset.price);
      const { q, why } = hitSize(side, m, price, Number(hit.dataset.qty));
      if (!q) say(`Can't: ${why}.`, 'bad');
      else act.order({ side, material: m, quantity: q, price }, { button: hit });
    }
    if (ev.target.closest('#d-mk-reload')) loadMarket();
  });
  function update(c) {
    if (!store.house) return;
    if (!c || c.has('market') || c.has('house') || c.has('state')) {
      form.update();
      sec.querySelector('#d-mk-orders').innerHTML = ordersHTML();
      sec.querySelector('#d-mk-books').innerHTML = booksHTML();
      sec.querySelector('#d-mk-depth').innerHTML = depthHTML();
    }
  }
  update();
  return { update, focus: () => sec.querySelector('#d-mo-m')?.focus() };
}
