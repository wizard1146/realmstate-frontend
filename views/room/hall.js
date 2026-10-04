// MIL detail › HALL OF DEEDS: characters on the market (bid on auctions, offer on the rest), your
// listings and the list form, and offers made and received. Deposits follow the engine: a bid or
// offer holds price + the out-of-realm premium (when the seller is in another realm) at once, and
// gives it back when outbid, declined, withdrawn or lapsed. On a sale the seller's state takes the fee.
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, when, addr } from '../../core/words.js';
import * as G from './generals.js';

const has = (c, ...k) => !c || k.some((x) => c.has(x));
const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const where = (x) => (x ? `${x.name} (${addr(x)})` : '?');

/** What a bid or offer of `price` holds from you, against a seller house ref. */
export function deposit(price, seller) {
  const h = store.house, bp = store.hall?.out_of_realm_bp ?? store.rules.params.out_of_realm_bp;
  const premium = seller && seller.realm !== h.realm ? Math.floor(price * bp / 10000) : 0;
  return { premium, held: price + premium };
}
const roomFor = (kind) => (kind === 'general'
  ? (store.house.generals.length < store.rules.params.general_max ? '' : `you keep the most generals a house may (${store.rules.params.general_max})`)
  : (store.house.science.academics.length < store.house.science.academic_cap ? '' : 'no university room for another academic'));

export function hallDetail(b, on) {
  const p = store.rules.params;
  b.innerHTML = `<div class="dgrid">
    <section class="wide"><h3 class="sub">ON THE MARKET <span class="dim" id="d-hl-line"></span></h3><div id="d-hl-list"></div>
      <p class="dim small" id="d-hl-rules"></p></section>
    <section><h3 class="sub">LIST A CHARACTER</h3>
      <form id="d-hl-form" class="dform">
        <label for="d-hl-who">Character</label><select id="d-hl-who"></select>
        <span class="lbl" id="d-hl-howl">How</span><span class="srcpick" role="radiogroup" aria-labelledby="d-hl-howl">
          <label><input type="radio" name="d-hl-how" value="offers" checked> Open to offers</label>
          <label><input type="radio" name="d-hl-how" value="auction"> Auction</label></span>
        <label for="d-hl-res">Reserve</label><span class="field"><input id="d-hl-res" type="number" min="1" value="10000" inputmode="numeric" class="w5"> <span class="dim small">gold</span></span>
        <label for="d-hl-ticks">Runs</label><span class="field"><input id="d-hl-ticks" type="number" min="${p.auction_min_ticks}" max="${p.auction_max_ticks}" value="${p.auction_min_ticks}" inputmode="numeric" class="w5"> <span class="dim small">ticks (${p.auction_min_ticks}–${p.auction_max_ticks})</span></span>
        <span></span><button class="btn primary">LIST</button>
        <p class="span small" id="d-hl-q" aria-live="polite"></p>
      </form>
    </section>
    <section><h3 class="sub">OFFERS</h3><div id="d-hl-offers"></div></section>
  </div>`;
  const $ = (id) => b.querySelector(`#d-hl-${id}`);
  const how = () => b.querySelector('input[name="d-hl-how"]:checked').value;

  /** Your characters, each with why it can't be listed now (or ''). */
  function mine() {
    const h = store.house;
    const cool = (x) => (G.cooldownUntil(x) ? `changed hands too recently; free ${when(G.cooldownUntil(x))}` : '');
    const gens = h.generals.map((g) => ({ kind: 'general', id: g.id, name: g.name, why: G.listingOf('general', g.id) ? 'already listed' : g.away ? 'away with an army' : h.defender === g.id ? 'main general' : cool(g) }));
    const acs = (h.science?.academics || []).map((a) => ({ kind: 'academic', id: a.id, name: a.name, why: G.listingOf('academic', a.id) ? 'already listed' : cool(a) }));
    return [...gens, ...acs];
  }
  function form() {
    const sel = $('who'), picked = G.sellPick.take();
    const v = picked ? `${picked.kind}:${picked.id}` : sel.value;
    const list = mine();
    if (document.activeElement !== sel) {
      sel.innerHTML = list.length ? list.map((c) => `<option value="${c.kind}:${c.id}"${c.why ? ' disabled' : ''}>${esc(c.name)} · ${c.kind}${c.why ? ` (${c.why})` : ''}</option>`).join('') : '<option value="">no characters</option>';
      if ([...sel.options].some((o) => o.value === v && !o.disabled)) sel.value = v;
    }
    const auc = how() === 'auction';
    $('res').disabled = !auc; $('ticks').disabled = !auc;
    const c = list.find((x) => `${x.kind}:${x.id}` === sel.value);
    const why = !c ? 'you have no characters to list' : c.why;
    const fee = store.hall?.fee_bp ?? p.trade_fee_bp;
    $('q').className = `span small${why ? ' short' : ' dim'}`;
    $('q').textContent = `${why ? `Can't: ${why}. ` : ''}${auc ? `Bids start at ${fmt(num($('res').value))} gold and rise by at least ${p.bid_step_bp / 100}%; it ends ${fmt(num($('ticks').value))} ticks from now. An auction with a bid runs to its end.` : 'Anyone may offer gold; you accept or decline. Offers lapse after ' + p.offer_ticks + ' ticks.'} `
      + `On a sale ${fee / 100}% goes to your state's treasury and you get the rest. Listing makes its profile and full record public.`;
    if (picked) { $('who').focus(); }
  }
  function listings() {
    const hall = store.hall, h = store.house;
    if (!hall) { $('list').innerHTML = '<p class="dim">Loading the Hall of Deeds…</p>'; return; }
    $('line').textContent = `${fmt(hall.listings.length)} listed`;
    $('rules').textContent = `A bid or offer holds its gold at once (plus ${hall.out_of_realm_bp / 100}% when the seller is in another realm; that premium is destroyed on a sale) and returns it if you're outbid, declined or it lapses. On a sale ${hall.fee_bp / 100}% of the price goes to the seller's state. Nothing changes hands while either state is at war; a character can change hands once in ${p.trade_cooldown_ticks} ticks and then settles in for ${p.settling_ticks}.`;
    const focus = b.contains(document.activeElement) ? document.activeElement.id : null;
    const vals = new Map([...b.querySelectorAll('#d-hl-list input')].map((x) => [x.id, x.value]));
    $('list').innerHTML = hall.listings.length ? `<div class="scrollx"><table class="tbl wide-tbl"><tr><th>CHARACTER</th><th class="num">PRICE</th><th>YOUR MOVE</th><th>SALE</th><th>OWNER</th><th>TRAITS</th><th>RECORD</th></tr>${hall.listings.map((l) => {
      const c = l.character || {}, a = l.auction, mineL = c.house?.house === h.id, r = c.record || {};
      const rec = c.kind === 'general' ? `${fmt(r.wins || 0)}/${fmt(r.losses || 0)} W/L · ${fmt(r.land_taken || 0)} acres · ${fmt(r.renown_earned || 0)} renown${r.transfers ? ` · sold ${r.transfers}× (top ${fmt(r.transfer_fee_highest)})` : ''}`
        : `${fmt(r.books_supervised || 0)} books supervised · ${fmt(r.ticks_served || 0)} ticks`;
      const tr = (c.traits || c.attributes || []).map((t) => `${t}${c.kind === 'general' && G.traitDoes(G.traitDef(t)?.trait) ? ` (${G.traitDoes(G.traitDef(t).trait)})` : ''}`).join(', ');
      const price = a ? (a.best != null ? `${fmt(a.best)} <span class="dim small">top bid</span>` : `${fmt(a.reserve)} <span class="dim small">reserve</span>`) : '<span class="dim">offers</span>';
      let move;
      if (mineL) move = `<button type="button" class="btn mini" id="d-hl-del-${l.listing}" data-delist="${l.listing}" ${a && a.best != null ? 'disabled title="An auction with a bid runs to its end"' : ''}>DELIST</button>`;
      else {
        const room = roomFor(c.kind);
        const min = a ? a.next_bid : 1;
        const id = `d-hl-p-${l.listing}`;
        const v = num(vals.get(id) ?? min) || min;
        const d = deposit(v, c.house);
        move = `<form class="inl" data-${a ? 'bid' : 'offer'}="${l.listing}" data-char="${c.kind}:${c.id}"><label class="vh" for="${id}">${a ? 'Bid' : 'Offer'} on ${esc(c.name)}</label><input id="${id}" type="number" min="${min}" value="${v}" inputmode="numeric" class="w5"><button class="btn mini primary"${room ? ` disabled title="${esc(room)}"` : ''}>${a ? 'BID' : 'OFFER'}</button>`
          + `<span class="small ${d.held > h.gold || room ? 'short' : 'dim'}" data-held>${room ? esc(room) : `holds ${fmt(d.held)}${d.premium ? ` (incl. ${fmt(d.premium)} out-of-realm)` : ''}${a ? ` · min ${fmt(min)}` : ''}`}</span></form>`;
      }
      return `<tr class="${mineL ? 'self' : ''}"><td class="name">${esc(c.name || '?')}<br><span class="dim small">${esc(c.kind || '')}${c.settling_until > Date.now() ? ' · settling' : ''}</span></td><td class="num">${price}</td><td>${move}</td>`
        + `<td class="small">${a ? `auction, ends ${esc(when(a.ends_at))}` : 'open to offers'}</td><td class="small">${esc(where(c.house))}</td><td class="small wrap">${esc(tr || '·')}</td><td class="small wrap dim">${esc(rec)}</td></tr>`;
    }).join('')}</table></div>` : '<p class="dim">Nobody is on the market. List one of yours below; its profile and record become public.</p>';
    if (focus) b.querySelector(`#${CSS.escape(focus)}`)?.focus();
  }
  function offers() {
    const o = store.offers;
    if (!o) { $('offers').innerHTML = '<p class="dim">Loading…</p>'; return; }
    const row = (x, recv) => `<tr><td class="name">${esc(x.character?.name || '?')}</td><td class="small">${esc(recv ? where(x.buyer) : where(x.character?.house))}</td><td class="num">${fmt(x.price)}</td>`
      + `<td class="num dim">${recv ? '' : fmt(x.held)}</td><td class="small dim">${esc(when(x.expires_at))}</td><td class="nowrap">${recv ? `<button type="button" class="btn mini primary" id="d-hl-acc-${x.offer}" data-accept="${x.offer}" aria-label="Accept ${fmt(x.price)} for ${esc(x.character?.name || '')}">ACCEPT</button><button type="button" class="btn mini" id="d-hl-dec-${x.offer}" data-drop="${x.offer}" aria-label="Decline">DECLINE</button>` : `<button type="button" class="btn mini" id="d-hl-wd-${x.offer}" data-drop="${x.offer}" aria-label="Withdraw your offer">WITHDRAW</button>`}</td></tr>`;
    const was = $('offers').contains(document.activeElement) ? document.activeElement.id : null;
    const head = '<tr><th>CHARACTER</th><th>HOUSE</th><th class="num">PRICE</th><th class="num">HELD</th><th>LAPSES</th><th></th></tr>';
    $('offers').innerHTML = `<h4 class="small">FOR YOUR CHARACTERS</h4>${o.received.length ? `<div class="scrollx"><table class="tbl">${head}${o.received.map((x) => row(x, true)).join('')}</table></div>` : '<p class="dim small">None.</p>'}`
      + `<h4 class="small">YOU MADE</h4>${o.made.length ? `<div class="scrollx"><table class="tbl">${head}${o.made.map((x) => row(x, false)).join('')}</table></div>` : '<p class="dim small">None.</p>'}`;
    if (was) b.querySelector(`#${CSS.escape(was)}`)?.focus();
  }

  on($('form'), 'input', form);
  on($('form'), 'submit', (ev) => {
    ev.preventDefault();
    const [kind, id] = $('who').value.split(':');
    if (!kind) return;
    const auc = how() === 'auction';
    act.listCharacter(act.charRef(kind, id), auc ? { reserve: num($('res').value), ticks: num($('ticks').value) } : {}, { button: ev.submitter });
  });
  on($('list'), 'input', (ev) => {
    const f = ev.target.closest('form.inl');
    if (!f) return;
    const l = store.hall.listings.find((x) => String(x.listing) === (f.dataset.bid || f.dataset.offer));
    const d = deposit(num(ev.target.value), l?.character?.house);
    const s = f.querySelector('[data-held]');
    s.textContent = `holds ${fmt(d.held)}${d.premium ? ` (incl. ${fmt(d.premium)} out-of-realm)` : ''}${f.dataset.bid ? ` · min ${fmt(l.auction.next_bid)}` : ''}`;
    s.className = `small ${d.held > store.house.gold ? 'short' : 'dim'}`;
  });
  on($('list'), 'submit', (ev) => {
    const f = ev.target.closest('form.inl');
    if (!f) return;
    ev.preventDefault();
    const price = num(f.querySelector('input').value);
    if (f.dataset.bid) act.bid(f.dataset.bid, price, { button: ev.submitter });
    else { const [k, id] = f.dataset.char.split(':'); act.makeOffer(act.charRef(k, id), price, { button: ev.submitter }); }
  });
  on(b, 'click', (ev) => {
    const d = ev.target.closest('[data-delist]'); if (d) return act.delist(d.dataset.delist, { button: d });
    const a = ev.target.closest('[data-accept]'); if (a) return act.acceptOffer(a.dataset.accept, { button: a });
    const x = ev.target.closest('[data-drop]'); if (x) return act.dropOffer(x.dataset.drop, { button: x });
  });
  // A LIST button on the GENERALS tab chose a character: show it here.
  const unwatch = G.MIL_TAB.watch((t) => { if (!b.isConnected) return unwatch(); if (t === 'hall' && G.sellPick.v) setTimeout(form); }); // after the panel shows

  function update(c) {
    if (!store.house) return;
    if (has(c, 'hall', 'house')) { listings(); offers(); }
    if (has(c, 'house', 'hall')) form();
  }
  return { update };
}
