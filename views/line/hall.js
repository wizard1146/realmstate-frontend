// Straightline's Hall of Deeds: generals and academics for sale. At a glance; then tabs. Market: every listing as a
// card (traits, record, the sale, its owner) with your bid or offer and what it holds from you, or Delist for yours.
// Sell: list one of yours (open to offers, or an auction). Offers: those for your characters (accept or decline) and
// those you made (withdraw). Logic: core/hall.js, core/generals.js; actions.
import { store, loadHall } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, when, addr } from '../../core/words.js';
import * as G from '../../core/generals.js';
import { deposit, roomFor } from '../../core/hall.js';
import { tabsHTML, panelAttrs, wireTabs } from './ltabs.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const where = (x) => (x ? `${x.name} (${addr(x)})` : 'someone');
const TABS = [['market', 'Market'], ['sell', 'Sell'], ['offers', 'Offers']];

export function mountHall(host, on) {
  const p = store.rules.params;
  let kind = 'all';
  host.innerHTML = `<div class="lpart lhall">
    <dl class="st-glance" id="lh-glance"></dl>
    ${tabsHTML(TABS, 'lh', 'Hall of Deeds')}
    <section ${panelAttrs('lh', 'market')}>
      <div class="hl-tools" role="group" aria-label="Show"><button type="button" class="btn mini" data-kind="all">All</button><button type="button" class="btn mini" data-kind="general">Generals</button><button type="button" class="btn mini" data-kind="academic">Academics</button>
        <span class="dim small" id="lh-n"></span></div>
      <div class="ac-cards" id="lh-list"></div>
      <p class="dim small hl-rules" id="lh-rules"></p>
    </section>
    <section ${panelAttrs('lh', 'sell')}>
      <div class="atk-layout"><div class="atk-main"><h3 class="sub">Your characters</h3><div class="ac-cards" id="lh-mine"></div></div>
      <aside class="atk-sheet" aria-label="List a character"><h3 class="sub">List one</h3>
        <form id="lh-form" class="lform atk-grid" novalidate>
          <label for="lh-who">Who</label><select id="lh-who"></select>
          <span class="lbl" id="lh-howl">How</span><span class="hl-how" role="radiogroup" aria-labelledby="lh-howl">
            <label><input type="radio" name="lh-how" value="offers" checked> Open to offers</label>
            <label><input type="radio" name="lh-how" value="auction"> Auction</label></span>
          <label for="lh-res">Reserve</label><span class="field"><input id="lh-res" type="number" min="1" value="10000" inputmode="numeric"> <span class="dim small">gold</span></span>
          <label for="lh-ticks">Runs</label><span class="field"><input id="lh-ticks" type="number" min="${p.auction_min_ticks}" max="${p.auction_max_ticks}" value="${p.auction_min_ticks}" inputmode="numeric"> <span class="dim small">ticks (${p.auction_min_ticks}–${p.auction_max_ticks})</span></span>
        </form>
        <p class="doing" id="lh-q" aria-live="polite"></p>
        <div class="atk-go"><button type="button" class="btn primary" id="lh-go">List</button></div>
      </aside></div>
    </section>
    <section ${panelAttrs('lh', 'offers')}>
      <h3 class="sub">For your characters</h3><div id="lh-recv"></div>
      <h3 class="sub">You made</h3><div id="lh-made"></div>
    </section>
  </div>`;
  const $ = (id) => host.querySelector(`#lh-${id}`);
  const tabs = wireTabs(host, on, { tabs: TABS, key: 'realmstate.line.hall' });
  const how = () => host.querySelector('input[name="lh-how"]:checked').value;

  /** Your characters, each with why it can't be listed now (or ''). */
  function mine() {
    const h = store.house;
    const cool = (x) => (G.cooldownUntil(x) ? `changed hands too recently; free ${when(G.cooldownUntil(x))}` : '');
    return [...h.generals.map((g) => ({ kind: 'general', id: g.id, name: g.name, x: g, why: G.listingOf('general', g.id) ? 'already listed' : g.away ? 'away with an army' : h.defender === g.id ? 'your main general' : cool(g) })),
      ...(h.science?.academics || []).map((a) => ({ kind: 'academic', id: a.id, name: a.name, x: a, why: G.listingOf('academic', a.id) ? 'already listed' : cool(a) }))];
  }
  const recordText = (c) => { const r = c.record || {}; return c.kind === 'general'
    ? `${fmt(r.wins || 0)} won, ${fmt(r.losses || 0)} lost · ${fmt(r.land_taken || 0)} acres taken · ${fmt(r.renown_earned || 0)} renown${r.transfers ? ` · sold ${r.transfers}× (top ${fmt(r.transfer_fee_highest)})` : ''}`
    : `${fmt(r.books_supervised || 0)} books supervised · ${fmt(r.ticks_served || 0)} ticks served`; };
  const traitsOf = (c) => (c.traits || c.attributes || []).map((t) => (c.kind === 'general' ? `${G.traitName(t)}${G.traitDoes(t) ? ` (${G.traitDoes(t)})` : ''}` : t)).join(', ');

  function glance() {
    const hall = store.hall, o = store.offers, h = store.house;
    const card = (k, v, note) => `<div><dt>${k}</dt><dd>${v}</dd><dd class="rank"><span>${note}</span></dd></div>`;
    const yours = (hall?.listings || []).filter((l) => l.character?.house?.house === h.id).length;
    $('glance').innerHTML = card('On the market', hall ? fmt(hall.listings.length) : '…', 'generals and academics')
      + card('Yours listed', fmt(yours), yours ? 'see Market' : 'list one under Sell')
      + card('Offers for you', o ? fmt(o.received.length) : '…', o?.received.length ? 'answer under Offers' : 'none waiting')
      + card('Your gold', fmt(h.gold), 'a bid holds its gold at once');
    $('tab-offers') && ($('tab-offers').textContent = o?.received.length ? `Offers (${o.received.length})` : 'Offers');
  }
  function market() {
    const hall = store.hall, h = store.house;
    host.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    if (!hall) { $('list').innerHTML = '<p class="dim">Loading the Hall of Deeds…</p>'; return; }
    $('rules').textContent = `A bid or offer holds its gold at once (plus ${hall.out_of_realm_bp / 100}% if the seller is in another realm; that premium is lost on a sale) and gives it back if you're outbid, declined or it lapses. On a sale ${hall.fee_bp / 100}% of the price goes to the seller's state. Nothing changes hands while either state is at war; a character can change hands once in ${p.trade_cooldown_ticks} ticks, then settles in for ${p.settling_ticks}.`;
    const list = hall.listings.filter((l) => kind === 'all' || l.character?.kind === kind);
    $('n').textContent = `${fmt(list.length)} listed`;
    const focus = host.contains(document.activeElement) ? document.activeElement.id : null;
    const vals = new Map([...$('list').querySelectorAll('input')].map((x) => [x.id, x.value]));
    $('list').innerHTML = list.length ? list.map((l) => {
      const c = l.character || {}, a = l.auction, own = c.house?.house === h.id;
      const price = a ? (a.best != null ? `<b>${fmt(a.best)}</b> top bid` : `<b>${fmt(a.reserve)}</b> reserve`) : 'open to offers';
      let move;
      if (own) move = `<div class="gn-acts"><button type="button" class="btn mini" id="lh-del-${l.listing}" data-delist="${l.listing}"${a && a.best != null ? ' disabled title="An auction with a bid runs to its end"' : ''}>Delist</button><span class="dim small">Yours.</span></div>`;
      else {
        const room = roomFor(c.kind), min = a ? a.next_bid : 1, id = `lh-p-${l.listing}`, v = num(vals.get(id) ?? min) || min, d = deposit(v, c.house);
        move = `<form class="hl-move" data-${a ? 'bid' : 'offer'}="${l.listing}" data-char="${c.kind}:${c.id}" novalidate><label class="vh" for="${id}">${a ? 'Bid' : 'Offer'} on ${esc(c.name)}</label>
          <input id="${id}" type="number" min="${min}" value="${v}" inputmode="numeric"><button class="btn mini primary"${room ? ` disabled title="${esc(room)}"` : ''}>${a ? 'Bid' : 'Offer'}</button>
          <span class="small ${d.held > h.gold || room ? 'short' : 'dim'}" data-held>${room ? esc(cap(room)) : `Holds ${fmt(d.held)}${d.premium ? ` (${fmt(d.premium)} of it out-of-realm)` : ''}${a ? ` · at least ${fmt(min)}` : ''}`}</span></form>`;
      }
      return `<article class="ac-card hl-card${own ? ' own' : ''}"><header><h4>${esc(c.name || '?')}</h4><span class="gn-badge">${esc(cap(c.kind || ''))}${c.settling_until > Date.now() ? ' · settling' : ''}</span></header>
        <p class="hl-price">${price}${a ? ` · ends ${esc(when(a.ends_at))}` : ''}</p>
        <p class="small">${esc(traitsOf(c) || 'No traits')}</p>
        <p class="dim small">${esc(recordText(c))}</p>
        <p class="dim small">Owner: ${c.house ? `<a href="#state" data-open-state="${c.house.realm}:${c.house.state}">${esc(where(c.house))}</a>` : 'unknown'}</p>
        ${move}</article>`;
    }).join('') : `<p class="dim">${hall.listings.length ? 'None of that kind listed.' : 'Nobody is on the market. List one of yours under Sell: its profile and record become public.'}</p>`;
    if (focus) host.querySelector(`#${CSS.escape(focus)}`)?.focus();
  }
  function sell() {
    const list = mine(), sel = $('who'), picked = G.sellPick.take();
    if (picked) tabs.show('sell');
    const v = picked ? `${picked.kind}:${picked.id}` : sel.value;
    $('mine').innerHTML = list.length ? list.map((c) => `<article class="ac-card"><header><h4>${esc(c.name)}</h4><span class="gn-badge">${cap(c.kind)}</span></header>
      <p class="small">${esc(c.kind === 'general' ? G.traitsText(c.x.traits) : (c.x.attributes || []).join(', ') || 'no attributes')}</p>
      <p class="${c.why ? 'short' : 'dim'} small">${c.why ? `Can't list: ${esc(c.why)}.` : 'Free to list.'}</p>
      ${c.why ? '' : `<div class="gn-acts"><button type="button" class="btn mini" data-pick="${c.kind}:${c.id}">List this one</button></div>`}</article>`).join('')
      : '<p class="dim">You have no generals or academics.</p>';
    if (document.activeElement !== sel) {
      sel.innerHTML = list.length ? list.map((c) => `<option value="${c.kind}:${c.id}"${c.why ? ' disabled' : ''}>${esc(c.name)} · ${c.kind}${c.why ? ` (${c.why})` : ''}</option>`).join('') : '<option value="">no characters</option>';
      if ([...sel.options].some((o) => o.value === v && !o.disabled)) sel.value = v;
      else { const f = [...sel.options].find((o) => !o.disabled); if (f) sel.value = f.value; }
    }
    if (picked) sel.focus();
    quote();
  }
  function quote() {
    const auc = how() === 'auction', c = mine().find((x) => `${x.kind}:${x.id}` === $('who').value);
    $('res').disabled = !auc; $('ticks').disabled = !auc;
    const why = !c ? 'you have no character free to list' : c.why, fee = store.hall?.fee_bp ?? p.trade_fee_bp;
    $('q').textContent = `${why ? `Can't: ${why}. ` : ''}${auc ? `Bids start at ${fmt(num($('res').value))} gold and rise by at least ${p.bid_step_bp / 100}%; it ends ${fmt(num($('ticks').value))} ticks from now, and once bid on it runs to its end.` : `Anyone may offer gold; you accept or decline. Offers lapse after ${p.offer_ticks} ticks.`} On a sale ${fee / 100}% goes to your state's treasury. Listing makes its profile and record public.`;
    $('q').classList.toggle('short', !!why);
    $('go').disabled = !!why;
  }
  function offers() {
    const o = store.offers;
    const table = (rows, recv) => (rows.length ? `<table class="tbl hl-tbl fit"><thead><tr><th data-fx="last">Character</th><th data-pri="3" data-fx="clip">${recv ? 'From' : 'Owner'}</th><th class="num">Price</th>${recv ? '' : '<th class="num" data-pri="4">Held</th>'}<th data-pri="5">Lapses</th><th><span class="vh">Answer</span></th></tr></thead><tbody>
      ${rows.map((x) => `<tr><th scope="row">${esc(x.character?.name || '?')}</th><td>${esc(recv ? where(x.buyer) : where(x.character?.house))}</td><td class="num">${fmt(x.price)}</td>${recv ? '' : `<td class="num dim">${fmt(x.held)}</td>`}<td class="dim">${esc(when(x.expires_at))}</td>
        <td class="acts">${recv ? `<button type="button" class="btn mini primary" id="lh-acc-${x.offer}" data-accept="${x.offer}" aria-label="Accept ${fmt(x.price)} for ${esc(x.character?.name || '')}">Accept</button><button type="button" class="btn mini" id="lh-dec-${x.offer}" data-drop="${x.offer}" aria-label="Decline the offer for ${esc(x.character?.name || '')}">Decline</button>`
          : `<button type="button" class="btn mini" id="lh-wd-${x.offer}" data-drop="${x.offer}" aria-label="Withdraw your offer for ${esc(x.character?.name || '')}">Withdraw</button>`}</td></tr>`).join('')}</tbody></table>` : '<p class="dim">None.</p>');
    const was = host.contains(document.activeElement) ? document.activeElement.id : null;
    $('recv').innerHTML = o ? table(o.received, true) : '<p class="dim">Loading…</p>';
    $('made').innerHTML = o ? table(o.made, false) : '<p class="dim">Loading…</p>';
    if (was) host.querySelector(`#${CSS.escape(was)}`)?.focus();
  }

  // After your own order, read the Hall again once the server has published it, not at the next tick.
  const after = async (pr) => { if (await pr) act.afterPublish(loadHall); };
  on(host, 'click', (ev) => {
    const k = ev.target.closest('[data-kind]'); if (k) { kind = k.dataset.kind; market(); return; }
    const pk = ev.target.closest('[data-pick]'); if (pk) { $('who').value = pk.dataset.pick; quote(); $('who').focus(); return; }
    const d = ev.target.closest('[data-delist]'); if (d) return after(act.delist(d.dataset.delist, { button: d }));
    const a = ev.target.closest('[data-accept]'); if (a) return after(act.acceptOffer(a.dataset.accept, { button: a }));
    const x = ev.target.closest('[data-drop]'); if (x) return after(act.dropOffer(x.dataset.drop, { button: x }));
  });
  on($('list'), 'input', (ev) => {
    const f = ev.target.closest('form.hl-move');
    if (!f) return;
    const l = store.hall.listings.find((x) => String(x.listing) === (f.dataset.bid || f.dataset.offer)), d = deposit(num(ev.target.value), l?.character?.house);
    const s = f.querySelector('[data-held]');
    s.textContent = `Holds ${fmt(d.held)}${d.premium ? ` (${fmt(d.premium)} of it out-of-realm)` : ''}${f.dataset.bid ? ` · at least ${fmt(l.auction.next_bid)}` : ''}`;
    s.className = `small ${d.held > store.house.gold ? 'short' : 'dim'}`;
  });
  on($('list'), 'submit', (ev) => {
    const f = ev.target.closest('form.hl-move');
    if (!f) return;
    ev.preventDefault();
    const price = num(f.querySelector('input').value);
    if (f.dataset.bid) after(act.bid(f.dataset.bid, price, { button: ev.submitter }));
    else { const [k, id] = f.dataset.char.split(':'); after(act.makeOffer(act.charRef(k, id), price, { button: ev.submitter })); }
  });
  on($('form'), 'input', quote);
  on($('form'), 'change', quote);
  on($('form'), 'submit', (ev) => ev.preventDefault());
  on($('go'), 'click', () => {
    const [k, id] = $('who').value.split(':');
    if (!k) return;
    after(act.listCharacter(act.charRef(k, id), how() === 'auction' ? { reserve: num($('res').value), ticks: num($('ticks').value) } : {}, { button: $('go') }));
  });

  function draw() { if (!store.house) return; glance(); market(); sell(); offers(); }
  draw();
  return {
    update(c) { if (!c || c.has('hall') || c.has('house') || c.has('rules')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
