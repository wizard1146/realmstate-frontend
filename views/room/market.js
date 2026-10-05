// The market (RES › MARKET, pane and detail). Books per material from /market, your orders and
// your state's treasury orders from /orders. Orders clear once a tick at one price per material.
// Escrow when placing (economy.rs place_order): a buy holds quantity × price gold (the difference
// comes back if it clears lower); a sell holds the goods. A sale pays the market fee (the house's
// market_fee_bp from /me, after trading houses; a treasury sale pays the age's full fee), which is
// destroyed. Leaders may trade from the treasury.
// Nobody trades with themselves: a trader may quote both sides of a material, but the server
// refuses a buy at or above its own sell (or a sell at or below its own buy), which could fill
// against it at the one clearing price. A leader and the treasury count as one trader.
import { store, say, loadMarket } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, when } from '../../core/words.js';
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

/** The market fee on a sale, basis points: yours from /me, or the age's for the treasury. */
const feeBp = (treasury) => (treasury ? store.rules?.params?.market_fee_bp : store.house?.market_fee_bp) ?? 0;
/** What a sale of `gold` pays after the fee. */
const afterFee = (gold, treasury) => gold - Math.floor(gold * feeBp(treasury) / 10000);

/** What a party holds: { gold, mat(m) } for you, or for the treasury. */
function holder(treasury) {
  if (treasury) { const t = store.state?.treasury || { gold: 0, materials: {} }; return { gold: t.gold, mat: (m) => t.materials[m] || 0, who: 'the treasury' }; }
  const h = store.house;
  return { gold: h.gold, mat: (m) => h.materials[m] || 0, who: 'you' };
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
    <p class="dim small span">Orders clear at the next tick, all at one price per material: buyers pay that price and get the rest of their escrow back. Sellers pay the market fee on what they receive; trading houses cut it. You may buy and sell one material at once, but your buy must be below your own sell (and the treasury's, if you lead): you can't trade with yourself.</p>
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
  /** A starting price: the other side's best, else the last clearing. */
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
      $('tr').disabled = !lead;
      if (!lead) $('tr').checked = false;
      $('trwhy').textContent = lead ? 'you lead the state' : 'leader only';
    }
    const need = s === 'buy' ? q * pr : q;
    const have = s === 'buy' ? hd.gold : hd.mat(m);
    const crosses = (o) => (s === 'buy' ? o.price <= pr : o.price >= pr);
    const mine = (store.orders || []).find((o) => o.material === m && o.side !== s && (tr ? o.treasury || lead : !o.treasury || lead) && crosses(o));
    const why = !q ? 'choose a quantity' : !pr ? 'choose a price' : q > MAX_Q ? `at most ${fmt(MAX_Q)}` : mine ? `would fill your own ${mine.side} #${mine.order} at ${fmt(mine.price)}: ${s === 'buy' ? 'buy below' : 'sell above'} ${fmt(mine.price)} (no trading with yourself)` : need > have ? `${hd.who === 'you' ? 'you have' : 'the treasury has'} ${fmt(have)} ${s === 'buy' ? 'gold' : m}`
      : '';
    const c = $('cost');
    const fee = feeBp(tr), net = afterFee(q * pr, tr);
    c.textContent = `${s === 'buy' ? `escrow ${fmt(need)}g` : `escrow ${fmt(q)} ${m} → ≥${fmt(net)}g${fee ? ` after ${fee / 100}% fee` : ''}`}${full && why ? ` · ${why}` : ''}`;
    c.title = why ? `Can't: ${why}` : s === 'buy' ? `Holds ${fmt(need)} gold until it clears; any gold above the clearing price comes back.` : `Holds ${fmt(q)} ${m}; pays at least ${fmt(net)} gold if it all clears (${fmt(q * pr)} less the ${fee / 100}% market fee, which is destroyed).`;
    c.classList.toggle('short', !!why);
    const b = book(m);
    $('hold').innerHTML = `${tr ? 'Treasury' : 'You'}: <b class="num">${fmt(hd.gold)}</b> gold · <b class="num">${fmt(hd.mat(m))}</b> ${esc(m)}`
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
    const n = side() === 'buy' ? (pr ? Math.floor(hd.gold / pr) : 0) : hd.mat(m);
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
  return `<table class="tbl"><tr><th class="num">#</th><th>SIDE</th><th>MATERIAL</th><th class="num">QTY</th><th class="num">PRICE</th>${compact ? '' : '<th class="num">ESCROW</th><th>FOR</th><th>PLACED</th>'}<th></th></tr>`
    + list.map((o) => {
      const can = !o.treasury || lead;
      const esc2 = o.side === 'buy' ? `${fmt(o.quantity * o.price)}g` : `${fmt(o.quantity)} ${o.material}`;
      return `<tr><td class="num dim">${o.order}</td><td class="${o.side === 'buy' ? 'up' : 'down'}">${o.side.toUpperCase()}</td><td>${esc(o.material)}${compact && o.treasury ? ' <span class="dim">T</span>' : ''}</td><td class="num">${fmt(o.quantity)}</td><td class="num">${fmt(o.price)}</td>`
        + `${compact ? '' : `<td class="num dim">${esc2}</td><td>${o.treasury ? 'treasury' : 'you'}</td><td class="small dim">${esc(when(o.placed_at))}</td>`}`
        + `<td><button type="button" class="btn mini" data-cancel="${o.order}"${can ? '' : ' disabled title="Treasury orders: the leader only"'} aria-label="Cancel order ${o.order}">CANCEL</button></td></tr>`;
    }).join('') + '</table>';
}
export function wireOrders(scope, on) {
  on(scope, 'click', (ev) => {
    const b = ev.target.closest('[data-cancel]');
    if (b) act.cancelOrder(b.dataset.cancel, { button: b });
  });
}

// ---------- the books ----------
/** One row per material: held, best bid and ask, last clearing. Rows pick the material in the form. */
export function booksHTML() {
  const h = store.house;
  if (!store.market) return '<p class="dim">Loading the market…</p>';
  return `<table class="tbl"><tr><th>MATERIAL</th><th class="num">HELD</th><th class="num"><abbr title="Best bid: price × quantity">BID</abbr></th><th class="num"><abbr title="Best ask: price × quantity">ASK</abbr></th><th class="num"><abbr title="Last clearing price">LAST</abbr></th><th></th></tr>`
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
 * shows and you hold (or can pay for). It's an ordinary order, so it fills at the next clearing,
 * at that price or better, and can be cancelled until then. */
/** How much one click can trade against a level: { q, why } (why: the reason it's 0). */
function hitSize(side, m, price, quantity) {
  const h = store.house;
  const can = side === 'sell' ? (h.materials[m] || 0) : Math.floor(h.gold / price);
  const q = Math.min(quantity, can, MAX_Q);
  return { q, why: q ? '' : side === 'sell' ? `you have no ${m}` : 'not enough gold' };
}
export function depthHTML() {
  if (!store.market) return '<p class="dim">Loading the market…</p>';
  const lvl = (rows, cls, side, m) => rows.length ? rows.map((r) => {
    const { q, why } = hitSize(side, m, r.price, r.quantity);
    const verb = side === 'buy' ? 'BUY' : 'SELL';
    const label = q ? `${verb} ${fmt(q)}` : verb;
    const tip = q ? `${side === 'buy' ? 'Buy' : 'Sell'} ${fmt(q)} ${m} at ${fmt(r.price)} now: fills at the next clearing, at this price or better` : `Can't: ${why}`;
    return `<tr><td class="num ${cls}">${fmt(r.price)}</td><td class="num">${fmt(r.quantity)}</td><td><button type="button" class="btn mini" data-hit-mat="${esc(m)}" data-side="${side}" data-price="${r.price}" data-qty="${r.quantity}"${q ? '' : ' disabled'} title="${esc(tip)}" aria-label="${esc(tip)}">${label}</button></td></tr>`;
  }).join('') : '<tr><td colspan="3" class="dim">none</td></tr>';
  return `<div class="dgrid">${store.market.map((m) => `<section><h4 class="sub">${esc(m.name || cap(m.material))} <span class="dim">${m.realms.length ? `realms ${m.realms.join(', ')} · ${fmt(m.output_per_tick)}/tick` : 'refined'} · last ${m.last.volume ? `${fmt(m.last.price)} ×${fmt(m.last.volume)} at T${m.last.tick}` : 'none'}</span></h4>
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
    <section><h3 class="sub">PLACE AN ORDER <span class="dim">cleared at the next tick</span></h3>${formHTML('d-mo', true)}</section>
    <section><h3 class="sub">OPEN ORDERS <span class="dim">yours and your state's treasury's</span> <button type="button" class="btn mini" id="d-mk-reload">RELOAD</button></h3><div id="d-mk-orders"></div>
      <h3 class="sub gap">BOOKS <span class="dim">best bid and ask</span></h3><div id="d-mk-books"></div></section>
    <section class="wide"><h3 class="sub">DEPTH <span class="dim">every material's bids and asks; a level's button sells into that bid or buys from that ask at once (it fills at the next clearing, at that price or better)</span></h3><div id="d-mk-depth"></div></section>
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
