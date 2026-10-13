// Market & Hall: buy or sell a material, your open orders, and the Hall of Deeds (bid, offer, delist; list one of
// yours; answer offers; reassure a wavering character). The sums are core/market.js and core/hall.js's; wording
// follows Straightline's Market and Hall pages.
import { store, loadMarket, loadHall } from '../../../core/store.js';
import * as act from '../../../core/actions.js';
import { fmt, esc, when, dayTime, addr } from '../../../core/words.js';
import { num, MAX_Q, cap, book, best, feeBp, lockMin, crossBp, waitHold, buyHold, buyMax, crossWhere, fillNow, holder, spoils, isLeader } from '../../../core/market.js';
import { deposit, roomFor } from '../../../core/hall.js';
import * as G from '../../../core/generals.js';

const where = (x) => (x ? `${x.name} (${addr(x)})` : 'someone');
const after = (load) => (o) => { if (o) act.afterPublish(load); return o; };
const LOADING_M = { ok: false, why: ['loading the market'], go: '–' };
const LOADING_H = { ok: false, why: ['loading the Hall of Deeds'], go: '–' };
/** Keep focus on the control with this data attribute across a redraw. */
const keepFocus = (body, attr) => { const a = document.activeElement; return body.contains(a) && a.dataset?.[attr] != null ? a.dataset[attr] : null; };

// ---------- materials ----------
const marketOrder = {
  id: 'market-order', group: 'market', name: 'Buy or sell', wiki: 'trade.html', keys: 'market order buy sell materials trade bid ask treasury',
  what: 'Order a material: it fills at once against waiting orders that meet your price; the rest waits in the book.',
  badge: () => `${fmt(store.house?.gold ?? 0)} gold`,
  mount(body, ctx) {
    let s = ctx.args.side === 'sell' ? 'sell' : 'buy', priceTouched = false;
    body.innerHTML = `<div class="ra-line"><span id="ra-msl">Side</span><span class="ra-seg" role="group" aria-labelledby="ra-msl"><button type="button" class="rg-btn ghost mini" data-side="buy">Buy</button><button type="button" class="rg-btn ghost mini" data-side="sell">Sell</button></span></div>
      <div class="ra-line"><label for="ra-mm">Material</label><select id="ra-mm"></select></div>
      <div class="ra-line"><label for="ra-mq">Quantity</label>${'<span class="ra-in"><input id="ra-mq" type="number" min="1" inputmode="numeric" value="100" aria-label="Quantity"><button type="button" class="rg-btn ghost mini" data-max aria-label="The most you can order">MAX</button></span>'}</div>
      <div class="ra-line"><label for="ra-mp">Price</label><span><input id="ra-mp" type="number" min="1" inputmode="numeric" value="10"> <span class="dim">gold each</span></span></div>
      <div class="ra-line"><label for="ra-mtr">For the treasury</label><span><input type="checkbox" id="ra-mtr"> <span class="dim" id="ra-mtrw"></span></span></div>
      <p class="ra-note" id="ra-mbk"></p>
      <table class="ra-tbl" id="ra-mbook"></table>
      <p class="ra-note" id="ra-mhave"></p>`;
    const $ = (id) => body.querySelector(`#ra-${id}`);
    const tr = () => $('mtr').checked;
    if (!store.market) loadMarket();
    /** A starting price: the other side's best, else the last trade (until you type one). */
    const suggest = () => {
      if (priceTouched) return;
      const b = book($('mm').value), o = best(b, s === 'buy' ? 'sell' : 'buy'), v = o?.price || b?.last?.price || 0;
      if (v) $('mp').value = String(v);
    };
    const draw = () => {
      body.querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === s)));
      const lead = isLeader();
      $('mtr').disabled = !lead; if (!lead) $('mtr').checked = false;
      $('mtrw').textContent = lead ? '(you lead your state)' : '(the leader only)';
      if (!store.market) { $('mbk').textContent = 'Loading the market…'; return; }
      const sel = $('mm'), list = store.market.map((m) => m.material);
      if (sel.options.length !== list.length) {
        const v = sel.value || ctx.args.material;
        sel.innerHTML = list.map((m) => `<option value="${esc(m)}">${esc(cap(m))}</option>`).join('');
        if (v && list.includes(v)) sel.value = v;
        suggest();
      }
      const m = sel.value, b = book(m), hd = holder(tr()), sp = spoils()[m];
      $('mbk').textContent = b ? `${b.last.volume ? `Last ${fmt(b.last.price)} × ${fmt(b.last.volume)} at tick ${fmt(b.last.tick)}.` : 'No trades yet.'} ${b.realms.length ? `Made in realm${b.realms.length === 1 ? '' : 's'} ${b.realms.join(', ')}${b.realms.includes(store.house.realm) ? ' (yours)' : ''}.` : 'Refined.'}` : '';
      // The top of the book: each level's price fills the form (sell into bids, buy from asks).
      const lv = (rows, side) => rows.slice(0, 5).map((r) => `<button type="button" class="rg-btn ghost mini" data-lvl="${side}" data-price="${r.price}" data-qty="${r.quantity}" aria-label="${side === 'buy' ? 'Buy from' : 'Sell into'} ${fmt(r.quantity)} at ${fmt(r.price)}">${fmt(r.price)} × ${fmt(r.quantity)}</button>`);
      const bids = lv(b?.bids || [], 'sell'), asks = lv(b?.asks || [], 'buy'), n = Math.max(bids.length, asks.length, 1);
      $('mbook').innerHTML = `<thead><tr><th>Bids <span class="dim">(sell into)</span></th><th>Asks <span class="dim">(buy from)</span></th></tr></thead><tbody>${Array.from({ length: n }, (_, i) => `<tr><td>${bids[i] || (i ? '' : '<span class="dim">none</span>')}</td><td>${asks[i] || (i ? '' : '<span class="dim">none</span>')}</td></tr>`).join('')}</tbody>`;
      const xb = crossBp(), xw = crossWhere(m);
      $('mhave').textContent = `${tr() ? 'The treasury has' : 'You have'} ${fmt(hd.gold)} gold and ${fmt(hd.mat(m))} ${m}${sp ? ` (${fmt(sp)} spoils next tick)` : ''}.${s === 'buy' && xb ? ` Bought from another realm, it costs up to ${xb / 100}% more${xw.home ? '' : ` (${m} isn't made in yours)`}.` : ''} What fills at once pays the market fee (${feeBp(tr()) / 100}%); a waiting order pays none. An order stands ${lockMin()} minutes before you can cancel it.`;
    };
    draw();
    ctx.on(body, 'click', (ev) => {
      const sd = ev.target.closest('[data-side]');
      if (sd) { s = sd.dataset.side; suggest(); draw(); ctx.refresh(); return; }
      const l = ev.target.closest('[data-lvl]');
      if (l) {
        s = l.dataset.lvl; priceTouched = true; $('mp').value = l.dataset.price;
        const pr = num(l.dataset.price), hd = holder(tr()), can = s === 'sell' ? hd.mat($('mm').value) : buyMax(hd.gold, pr, tr());
        $('mq').value = String(Math.min(num(l.dataset.qty), can, MAX_Q) || '');
        if (!can) ctx.say?.(s === 'sell' ? `You have no ${$('mm').value}.` : 'Not enough gold at that price.', 'bad');
        draw(); ctx.refresh(); return;
      }
      if (ev.target.closest('[data-max]')) {
        const m = $('mm').value, hd = holder(tr()), pr = num($('mp').value), n = s === 'buy' ? buyMax(hd.gold, pr, tr()) : hd.mat(m);
        $('mq').value = String(Math.min(MAX_Q, n));
        if (!n) ctx.say?.(`Max is 0: ${s === 'buy' ? (pr ? 'not enough gold at that price' : 'choose a price first') : `no ${m} to sell`}.`, 'bad');
        ctx.refresh();
      }
    });
    ctx.on($('mp'), 'input', () => { priceTouched = true; });
    ctx.on($('mm'), 'change', () => { priceTouched = false; suggest(); draw(); });
    ctx.on($('mtr'), 'change', draw);
    return {
      check() {
        if (!store.market) return LOADING_M;
        const m = $('mm').value, t = tr(), q = num($('mq').value), pr = num($('mp').value), hd = holder(t), lead = isLeader();
        const need = s === 'buy' ? buyHold(q, pr, t) : q, have = s === 'buy' ? hd.gold : hd.mat(m);
        const crosses = (o) => (s === 'buy' ? o.price <= pr : o.price >= pr);
        const mine = (store.orders || []).find((o) => o.material === m && o.side !== s && (t ? o.treasury || lead : !o.treasury || lead) && crosses(o));
        const why = [!q ? 'choose a quantity' : '', !pr ? 'choose a price' : '', q > MAX_Q ? `at most ${fmt(MAX_Q)}` : '',
          mine ? `it would fill your own ${mine.side} at ${fmt(mine.price)}; ${s === 'buy' ? 'buy below' : 'sell above'} it (no trading with yourself)` : '',
          q && pr && need > have ? `${hd.who === 'you' ? 'you have' : 'the treasury has'} ${fmt(have)} ${s === 'buy' ? 'gold' : m}` : ''].filter(Boolean);
        const { k, value, fee, cross } = fillNow(m, s, q, pr, t), rest = q - k;
        const text = `${cap(s)} ${fmt(q)} ${m} at up to ${fmt(pr)} gold each${t ? ' for the treasury' : ''}. It holds ${s === 'buy' ? `${fmt(need)} gold` : `${fmt(q)} ${m}`}. `
          + (k ? `About ${fmt(k)} fill${k === 1 ? 's' : ''} at once, ${s === 'buy' ? `for ${fmt(value + fee)} gold with the fee${cross ? ` (and up to ${fmt(cross)} cross-realm)` : ''}` : `for ${fmt(value - fee)} gold after the fee`}${rest ? `; ${fmt(rest)} wait in the book` : ''}.` : 'None fills at once; it waits in the book, and pays no fee when it fills.');
        return { ok: !why.length, why, text, go: `${cap(s)} ${fmt(q)}` };
      },
      async run(btn) {
        const o = await act.order({ side: s, material: $('mm').value, quantity: num($('mq').value), price: num($('mp').value), treasury: tr() }, { button: btn }).then(after(loadMarket));
        if (o) priceTouched = false;
        return o;
      },
      update(c) { if (!c || c.has('market') || c.has('house') || c.has('state')) draw(); },
    };
  },
};

const myOrders = {
  id: 'my-orders', group: 'market', name: 'Your orders', wiki: 'trade.html', keys: 'orders cancel open market waiting',
  what: 'Your open orders (and the treasury\'s, if you lead); cancel one.',
  badge: () => (store.orders ? `${fmt(store.orders.length)} open` : ''),
  stay: true,
  mount(body, ctx) {
    let pick = ctx.args.order != null ? String(ctx.args.order) : null;
    body.innerHTML = '<div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Order</th><th class="num">Price</th><th class="num">Holding</th><th>Placed</th><th><span class="vh">Cancel</span></th></tr></thead><tbody id="ra-orows"></tbody></table></div><p class="ra-note" id="ra-onote"></p>';
    if (!store.market) loadMarket();
    const find = () => (store.orders || []).find((o) => String(o.order) === pick) || null;
    const draw = () => {
      const list = store.orders, rows = body.querySelector('#ra-orows'), lead = isLeader();
      if (!list) { rows.innerHTML = '<tr><td colspan="5" class="dim">Loading your orders…</td></tr>'; return; }
      if (pick && !find()) pick = null;
      const f = keepFocus(body, 'cancel');
      rows.innerHTML = list.length ? list.map((o) => `<tr><th scope="row"><span class="${o.side === 'buy' ? 'up' : 'down'}">${cap(o.side)}</span> ${fmt(o.quantity)} ${esc(o.material)}${o.treasury ? ' <span class="dim">treasury</span>' : ''}</th>
        <td class="num">${fmt(o.price)}</td><td class="num dim">${o.side === 'buy' ? `${fmt(o.held ?? waitHold(o.quantity, o.price))} gold` : `${fmt(o.quantity)} ${esc(o.material)}`}</td><td class="dim">${esc(dayTime(o.placed_at))}</td>
        <td><button type="button" class="rg-btn ghost mini" data-cancel="${o.order}" aria-pressed="${String(o.order) === pick}"${!o.treasury || lead ? '' : ' disabled title="Treasury orders: the leader only"'} aria-label="Cancel your ${o.side} of ${fmt(o.quantity)} ${esc(o.material)}">Cancel</button></td></tr>`).join('')
        : `<tr><td colspan="5" class="dim">No open orders${lead ? ', for you or the treasury' : ''}.</td></tr>`;
      if (f) body.querySelector(`[data-cancel="${CSS.escape(f)}"]`)?.focus();
      body.querySelector('#ra-onote').textContent = `Pick an order, then cancel it: what it holds comes back. An order stands ${lockMin()} minutes before you can cancel it.`;
    };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-cancel]'); if (b) { pick = b.dataset.cancel; draw(); ctx.refresh(); } });
    return {
      check() {
        if (!store.orders) return LOADING_M;
        const o = find();
        if (!o) return { ok: false, why: [store.orders.length ? 'pick an order to cancel' : 'you have no open orders'], go: 'Cancel order' };
        const life = store.rules?.params?.order_min_life_ms ?? 0, until = life ? o.placed_at + life : 0;
        const why = [o.treasury && !isLeader() ? 'treasury orders: the leader only' : '', until > Date.now() ? `an order stands ${lockMin()} minutes: cancel from ${dayTime(until)}` : ''].filter(Boolean);
        return { ok: !why.length, why, text: `Cancel ${o.treasury ? 'the treasury\'s' : 'your'} ${o.side} of ${fmt(o.quantity)} ${o.material} at ${fmt(o.price)}, placed ${when(o.placed_at)}; ${o.side === 'buy' ? 'the held gold' : 'the goods'} come${o.side === 'buy' ? 's' : ''} back.`, go: 'Cancel order' };
      },
      async run(btn) { const o = await act.cancelOrder(pick, { button: btn }).then(after(loadMarket)); if (o) pick = null; return o; },
      update(c) { if (!c || c.has('market') || c.has('state')) draw(); },
    };
  },
};

// ---------- the Hall of Deeds ----------
const recordText = (c) => { const r = c.record || {}; return c.kind === 'general'
  ? `${fmt(r.wins || 0)} won, ${fmt(r.losses || 0)} lost · ${fmt(r.land_taken || 0)} acres taken · ${fmt(r.renown_earned || 0)} renown${r.transfers ? ` · sold ${r.transfers}× (top ${fmt(r.transfer_fee_highest)})` : ''}`
  : `${fmt(r.books_supervised || 0)} books supervised · ${fmt(r.ticks_served || 0)} ticks served`; };
const traitsOf = (c) => (c.kind === 'general' ? G.traitsText(c.traits) : (c.attributes || []).join(', ') || 'no attributes');

const hall = {
  id: 'hall', group: 'market', name: 'Hall of Deeds', wiki: 'hall-of-deeds.html', keys: 'hall deeds bid offer auction buy general academic character delist',
  what: 'Generals and academics for sale: bid on an auction, make an offer, or delist one of yours.',
  badge: () => (store.hall ? `${fmt(store.hall.listings.length)} listed` : ''),
  stay: true,
  mount(body, ctx) {
    let kind = 'all', pick = ctx.args.listing != null ? String(ctx.args.listing) : null;
    body.innerHTML = `<div class="ra-seg" role="group" aria-label="Show"><button type="button" class="rg-btn ghost mini" data-kind="all">All</button><button type="button" class="rg-btn ghost mini" data-kind="general">Generals</button><button type="button" class="rg-btn ghost mini" data-kind="academic">Academics</button></div>
      <div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Character</th><th class="num">Price</th><th>Owner</th><th><span class="vh">Pick</span></th></tr></thead><tbody id="ra-hrows"></tbody></table></div>
      <div id="ra-hpick"></div>
      <div class="ra-line" id="ra-hpl"><label for="ra-hp" id="ra-hpll">Price</label><span><input id="ra-hp" type="number" min="1" inputmode="numeric"> <span class="dim">gold</span></span></div>
      <p class="ra-note" id="ra-hrules"></p>`;
    const $ = (id) => body.querySelector(`#ra-${id}`);
    if (!store.hall) loadHall();
    const listing = () => store.hall?.listings.find((l) => String(l.listing) === pick) || null;
    const own = (l) => l?.character?.house?.house === store.house.id;
    const drawPick = () => {
      const l = listing(), c = l?.character || {}, a = l?.auction;
      $('hpl').hidden = !l || own(l);
      if (!l) { $('hpick').innerHTML = '<p class="ra-note">Pick a listing.</p>'; return; }
      $('hpll').textContent = a ? 'Your bid' : 'Your offer';
      if (!$('hp').value) $('hp').value = String(a ? a.next_bid : 1);
      $('hp').min = String(a ? a.next_bid : 1);
      $('hpick').innerHTML = `<p><b>${esc(c.name || '?')}</b> <span class="dim">${esc(cap(c.kind || ''))}${c.settling_until > Date.now() ? ' · settling' : ''}</span> · ${a ? (a.best != null ? `top bid ${fmt(a.best)}` : `reserve ${fmt(a.reserve)}`) + `, ends ${esc(when(a.ends_at))}` : 'open to offers'}</p>
        <p class="ra-note">${esc(traitsOf(c))}. ${esc(recordText(c))}.</p>
        <p class="ra-note">Owner: ${c.house ? `<button type="button" class="rg-btn ghost mini" data-state="${c.house.realm}:${c.house.state}">${esc(where(c.house))}</button>` : 'unknown'}</p>`;
    };
    const draw = () => {
      body.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
      const h = store.hall, rows = $('hrows');
      if (!h) { rows.innerHTML = '<tr><td colspan="4" class="dim">Loading the Hall of Deeds…</td></tr>'; drawPick(); return; }
      if (pick && !listing()) pick = null;
      $('hrules').textContent = `A bid or offer holds its gold at once (plus ${h.out_of_realm_bp / 100}% if the seller is in another realm; that premium is lost on a sale) and gives it back if you're outbid, declined or it lapses. On a sale ${h.fee_bp / 100}% of the price goes to the seller's state. Nothing changes hands while either state is at war.`;
      const list = h.listings.filter((l) => kind === 'all' || l.character?.kind === kind), f = keepFocus(body, 'lpick');
      rows.innerHTML = list.length ? list.map((l) => {
        const c = l.character || {}, a = l.auction;
        return `<tr><th scope="row">${esc(c.name || '?')} <span class="dim">${esc(c.kind || '')}</span></th>
          <td class="num">${a ? fmt(a.best ?? a.reserve) : '<span class="dim">offers</span>'}</td><td class="dim">${own(l) ? 'you' : esc(c.house?.name || '?')}</td>
          <td><button type="button" class="rg-btn ghost mini" data-lpick="${l.listing}" aria-pressed="${String(l.listing) === pick}" aria-label="Pick ${esc(c.name || '')}">${own(l) ? 'Delist' : a ? 'Bid' : 'Offer'}</button></td></tr>`;
      }).join('') : `<tr><td colspan="4" class="dim">${h.listings.length ? 'None of that kind listed.' : 'Nobody is on the market.'}</td></tr>`;
      if (f) body.querySelector(`[data-lpick="${CSS.escape(f)}"]`)?.focus();
      drawPick();
    };
    draw();
    ctx.on(body, 'click', (ev) => {
      const k = ev.target.closest('[data-kind]'); if (k) { kind = k.dataset.kind; draw(); return; }
      const p = ev.target.closest('[data-lpick]'); if (p) { if (p.dataset.lpick !== pick) $('hp').value = ''; pick = p.dataset.lpick; draw(); ctx.refresh(); return; }
      const st = ev.target.closest('[data-state]'); if (st) ctx.openState(st.dataset.state);
    });
    return {
      check() {
        if (!store.hall) return LOADING_H;
        const l = listing();
        if (!l) return { ok: false, why: ['pick a listing'], go: 'Bid' };
        const c = l.character || {}, a = l.auction;
        if (own(l)) {
          const why = a && a.best != null ? ['an auction with a bid runs to its end'] : [];
          return { ok: !why.length, why, text: `Take ${c.name} off the market.`, go: 'Delist' };
        }
        const price = num($('hp').value), d = deposit(price, c.house), min = a ? a.next_bid : 1, room = roomFor(c.kind);
        const why = [room, !price ? 'choose a price' : '', price && price < min ? `at least ${fmt(min)}` : '', d.held > store.house.gold ? `it holds ${fmt(d.held)} gold; you have ${fmt(store.house.gold)}` : ''].filter(Boolean);
        const text = `${a ? 'Bid' : 'Offer'} ${fmt(price)} gold for ${c.name}. It holds ${fmt(d.held)}${d.premium ? ` (${fmt(d.premium)} of it out-of-realm)` : ''} until you're ${a ? 'outbid' : 'declined'} or it lapses.`;
        return { ok: !why.length, why, text, go: `${a ? 'Bid' : 'Offer'} ${fmt(price)}`, confirm: a ? `Confirm: bid ${fmt(price)}` : '' };
      },
      async run(btn) {
        const l = listing(), c = l.character;
        let o;
        if (own(l)) o = await act.delist(l.listing, { button: btn });
        else if (l.auction) o = await act.bid(l.listing, num($('hp').value), { button: btn });
        else o = await act.makeOffer(act.charRef(c.kind, c.id), num($('hp').value), { button: btn });
        after(loadHall)(o);
        if (o) $('hp').value = '';
        return o;
      },
      update(c) { if (!c || c.has('hall') || c.has('house')) draw(); },
    };
  },
};

/** Your characters, each with why it can't be listed now (or ''). */
function mine() {
  const h = store.house;
  const cool = (x) => (G.cooldownUntil(x) ? `changed hands too recently; free ${when(G.cooldownUntil(x))}` : '');
  return [...h.generals.map((g) => ({ kind: 'general', id: g.id, name: g.name, x: g, why: G.listingOf('general', g.id) ? 'already listed' : g.away ? 'away with an army' : h.defender === g.id ? 'your main general' : cool(g) })),
    ...(h.science?.academics || []).map((a) => ({ kind: 'academic', id: a.id, name: a.name, x: a, why: G.listingOf('academic', a.id) ? 'already listed' : cool(a) }))];
}

const hallList = {
  id: 'hall-list', group: 'market', name: 'Sell a character', wiki: 'hall-of-deeds.html', keys: 'hall list sell auction general academic character',
  what: 'Put one of your generals or academics on the Hall of Deeds: open to offers, or an auction.',
  badge: () => (store.hall ? `${fmt(store.hall.listings.filter((l) => l.character?.house?.house === store.house?.id).length)} yours listed` : ''),
  mount(body, ctx) {
    const p = store.rules.params;
    let how = ctx.args.auction ? 'auction' : 'offers';
    body.innerHTML = `<div class="ra-line"><label for="ra-lw">Who</label><select id="ra-lw"></select></div>
      <div class="ra-line"><span id="ra-lhl">How</span><span class="ra-seg" role="group" aria-labelledby="ra-lhl"><button type="button" class="rg-btn ghost mini" data-how="offers">Open to offers</button><button type="button" class="rg-btn ghost mini" data-how="auction">Auction</button></span></div>
      <div class="ra-line"><label for="ra-lr">Reserve</label><span><input id="ra-lr" type="number" min="1" value="10000" inputmode="numeric"> <span class="dim">gold</span></span></div>
      <div class="ra-line"><label for="ra-lt">Runs</label><span><input id="ra-lt" type="number" min="${p.auction_min_ticks}" max="${p.auction_max_ticks}" value="${p.auction_min_ticks}" inputmode="numeric"> <span class="dim">ticks (${p.auction_min_ticks}–${p.auction_max_ticks})</span></span></div>
      <p class="ra-note" id="ra-lnote"></p>
      <p class="ra-note">To delist one of yours, pick it in the <button type="button" class="rg-btn ghost mini" data-open-hall>Hall of Deeds</button>.</p>`;
    const $ = (id) => body.querySelector(`#ra-${id}`);
    if (!store.hall) loadHall();
    const chosen = () => mine().find((x) => `${x.kind}:${x.id}` === $('lw').value);
    const draw = () => {
      body.querySelectorAll('[data-how]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.how === how)));
      $('lr').disabled = how !== 'auction'; $('lt').disabled = how !== 'auction';
      const sel = $('lw');
      if (document.activeElement !== sel) {
        const list = mine(), v = sel.value || (ctx.args.character ? `${ctx.args.character.kind}:${ctx.args.character.id}` : '');
        sel.innerHTML = list.length ? list.map((c) => `<option value="${c.kind}:${c.id}"${c.why ? ' disabled' : ''}>${esc(c.name)} · ${c.kind}${c.why ? ` (${esc(c.why)})` : ''}</option>`).join('') : '<option value="">no characters</option>';
        if ([...sel.options].some((o) => o.value === v && !o.disabled)) sel.value = v;
        else { const f = [...sel.options].find((o) => !o.disabled); if (f) sel.value = f.value; }
      }
      const c = chosen(), fee = store.hall?.fee_bp ?? p.trade_fee_bp;
      $('lnote').textContent = `${c ? `${c.name}: ${traitsOf({ kind: c.kind, ...c.x })}. ` : ''}${how === 'auction' ? `Bids start at the reserve and rise by at least ${p.bid_step_bp / 100}%; once bid on, it runs to its end.` : `Anyone may offer gold; you accept or decline. Offers lapse after ${p.offer_ticks} ticks.`} On a sale ${fee / 100}% goes to your state's treasury. Listing makes its profile and record public.`;
    };
    draw();
    ctx.on(body, 'click', (ev) => {
      const b = ev.target.closest('[data-how]'); if (b) { how = b.dataset.how; draw(); ctx.refresh(); return; }
      if (ev.target.closest('[data-open-hall]')) ctx.open('hall');
    });
    ctx.on($('lw'), 'change', draw);
    return {
      check() {
        const c = chosen(), auc = how === 'auction', r = num($('lr').value), t = num($('lt').value);
        const why = [!c ? 'you have no character free to list' : c.why,
          auc && !r ? 'choose a reserve' : '', auc && (t < p.auction_min_ticks || t > p.auction_max_ticks) ? `an auction runs ${p.auction_min_ticks}–${p.auction_max_ticks} ticks` : ''].filter(Boolean);
        return { ok: !why.length, why, text: c ? (auc ? `Auction ${c.name}: bids from ${fmt(r)} gold, ending ${fmt(t)} ticks from now.` : `List ${c.name}, open to offers.`) : '', go: auc ? 'Auction' : 'List' };
      },
      run(btn) {
        const [k, id] = $('lw').value.split(':');
        return act.listCharacter(act.charRef(k, id), how === 'auction' ? { reserve: num($('lr').value), ticks: num($('lt').value) } : {}, { button: btn }).then(after(loadHall));
      },
      update(c) { if (!c || c.has('hall') || c.has('house')) draw(); },
    };
  },
};

const hallOffers = {
  id: 'hall-offers', group: 'market', name: 'Hall offers', wiki: 'hall-of-deeds.html', keys: 'hall offers accept decline withdraw character',
  what: 'Offers for your characters (accept or decline) and those you made (withdraw).',
  badge: () => (store.offers?.received.length ? `${fmt(store.offers.received.length)} for you` : ''),
  stay: true,
  mount(body, ctx) {
    let pick = null;   // { verb: 'accept'|'decline'|'withdraw', offer }
    body.innerHTML = '<h3 class="ra-sub">For your characters</h3><div class="ra-scroll" id="ra-orecv"></div><h3 class="ra-sub">You made</h3><div class="ra-scroll" id="ra-omade"></div>';
    if (!store.offers) loadHall();
    const all = () => [...(store.offers?.received || []).map((x) => ({ ...x, recv: true })), ...(store.offers?.made || [])];
    const find = () => (pick ? all().find((x) => String(x.offer) === pick.offer) : null);
    const draw = () => {
      const o = store.offers;
      if (pick && !find()) pick = null;
      const f = document.activeElement && body.contains(document.activeElement) ? document.activeElement.id : null;
      const on = (verb, x) => String(pick?.verb === verb && pick.offer === String(x.offer));
      const table = (rows, recv) => (rows.length ? `<table class="ra-tbl"><thead><tr><th>Character</th><th>${recv ? 'From' : 'Owner'}</th><th class="num">Price</th><th>Lapses</th><th><span class="vh">Answer</span></th></tr></thead><tbody>
        ${rows.map((x) => `<tr><th scope="row">${esc(x.character?.name || '?')}</th><td>${esc(recv ? where(x.buyer) : where(x.character?.house))}</td><td class="num">${fmt(x.price)}${recv ? '' : ` <span class="dim">(holds ${fmt(x.held)})</span>`}</td><td class="dim">${esc(dayTime(x.expires_at))}</td>
          <td>${recv ? `<button type="button" class="rg-btn ghost mini" id="ra-oa-${x.offer}" data-verb="accept" data-offer="${x.offer}" aria-pressed="${on('accept', x)}" aria-label="Accept ${fmt(x.price)} for ${esc(x.character?.name || '')}">Accept</button><button type="button" class="rg-btn ghost mini" id="ra-od-${x.offer}" data-verb="decline" data-offer="${x.offer}" aria-pressed="${on('decline', x)}" aria-label="Decline the offer for ${esc(x.character?.name || '')}">Decline</button>`
            : `<button type="button" class="rg-btn ghost mini" id="ra-ow-${x.offer}" data-verb="withdraw" data-offer="${x.offer}" aria-pressed="${on('withdraw', x)}" aria-label="Withdraw your offer for ${esc(x.character?.name || '')}">Withdraw</button>`}</td></tr>`).join('')}</tbody></table>` : '<p class="ra-note">None.</p>');
      body.querySelector('#ra-orecv').innerHTML = o ? table(o.received, true) : '<p class="ra-note">Loading…</p>';
      body.querySelector('#ra-omade').innerHTML = o ? table(o.made, false) : '<p class="ra-note">Loading…</p>';
      if (f) body.querySelector(`#${CSS.escape(f)}`)?.focus();
    };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-verb]'); if (b) { pick = { verb: b.dataset.verb, offer: b.dataset.offer }; draw(); ctx.refresh(); } });
    return {
      check() {
        if (!store.offers) return LOADING_H;
        const x = find();
        if (!x) return { ok: false, why: [all().length ? 'pick an offer to answer' : 'no offers either way'], go: 'Answer' };
        const name = x.character?.name || 'the character';
        if (pick.verb === 'accept') return { ok: true, why: [], text: `Sell ${name} to ${where(x.buyer)} for ${fmt(x.price)} gold.`, go: 'Accept', confirm: `Confirm: sell for ${fmt(x.price)}` };
        if (pick.verb === 'decline') return { ok: true, why: [], text: `Decline ${where(x.buyer)}'s offer of ${fmt(x.price)} for ${name}; their gold goes back to them.`, go: 'Decline' };
        return { ok: true, why: [], text: `Withdraw your offer of ${fmt(x.price)} for ${name}; the ${fmt(x.held)} gold it holds comes back.`, go: 'Withdraw' };
      },
      async run(btn) {
        const o = await (pick.verb === 'accept' ? act.acceptOffer(pick.offer, { button: btn }) : act.dropOffer(pick.offer, { button: btn }));
        after(loadHall)(o);
        if (o) pick = null;
        return o;
      },
      update(c) { if (!c || c.has('hall')) draw(); },
    };
  },
};

const reassure = {
  id: 'reassure', group: 'market', name: 'Reassure', wiki: 'hall-of-deeds.html', keys: 'reassure wavering courted general academic auction',
  what: 'Steady a general or academic another house courts, before it goes to auction.',
  badge: () => { const n = (store.house?.wavering || []).length; return n ? `${fmt(n)} wavering` : ''; },
  mount(body, ctx) {
    let pick = ctx.args.character ? `${ctx.args.character.kind}:${ctx.args.character.id}` : null;
    body.innerHTML = '<div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Character</th><th class="num">Auction in</th><th class="num">Gold</th><th><span class="vh">Pick</span></th></tr></thead><tbody id="ra-wrows"></tbody></table></div><p class="ra-note">A courted character wavers; left wavering, it goes to auction.</p>';
    const list = () => store.house.wavering || [];
    const key = (w) => `${w.character.kind}:${w.character.id}`;
    const find = () => list().find((w) => key(w) === pick) || null;
    const draw = () => {
      if (pick && !find()) pick = null;
      if (!pick && list().length === 1) pick = key(list()[0]);
      const f = keepFocus(body, 'wpick');
      body.querySelector('#ra-wrows').innerHTML = list().length ? list().map((w) => {
        const left = Math.max(0, w.until_tick - store.tick);
        return `<tr><th scope="row">${esc(G.charName(w.character))} <span class="dim">${esc(w.character.kind)}</span></th><td class="num">${fmt(left)} tick${left === 1 ? '' : 's'}</td>
          <td class="num${store.house.gold < w.reassure_gold ? ' short' : ''}">${fmt(w.reassure_gold)}</td>
          <td><button type="button" class="rg-btn ghost mini" data-wpick="${key(w)}" aria-pressed="${key(w) === pick}" aria-label="Pick ${esc(G.charName(w.character))}">Pick</button></td></tr>`;
      }).join('') : '<tr><td colspan="4" class="dim">Nobody is wavering.</td></tr>';
      if (f) body.querySelector(`[data-wpick="${CSS.escape(f)}"]`)?.focus();
    };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-wpick]'); if (b) { pick = b.dataset.wpick; draw(); ctx.refresh(); } });
    return {
      check() {
        const w = find();
        if (!w) return { ok: false, why: [list().length ? 'pick a character' : 'nobody is wavering'], go: 'Reassure' };
        const why = store.house.gold < w.reassure_gold ? [`needs ${fmt(w.reassure_gold)} gold; you have ${fmt(store.house.gold)}`] : [];
        return { ok: !why.length, why, text: `Reassure ${G.charName(w.character)} for ${fmt(w.reassure_gold)} gold; it stays with you.`, go: `Reassure, ${fmt(w.reassure_gold)} gold` };
      },
      run: (btn) => act.reassure(act.charRef(find().character.kind, find().character.id), { button: btn }),
      update(c) { if (!c || c.has('house')) draw(); },
    };
  },
};

export default [marketOrder, myOrders, hall, hallList, hallOffers, reassure];
