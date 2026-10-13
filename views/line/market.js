// Straightline's Market: buy and sell materials. At a glance (your gold, open orders, what spoils next tick, your
// fee); every material as a card (held, best bid and ask, last trade, where it's made), picking one shows its book
// (each level trades at once); your open orders; and the order sheet (buy or sell, Max, price, for the treasury if
// you lead; what it holds, what fills now, or why it can't). Logic: core/market.js; actions.
import { store, say, loadMarket } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, when, dayTime } from '../../core/words.js';
import { MAT_ICONS, matMark } from './world.js';
import { num, MAX_Q, cap, book, best, feeBp, lockMin, crossBp, waitHold, buyHold, buyMax, crossWhere, fillNow, holder, hitSize, spoils, isLeader } from '../../core/market.js';

const KEY = 'realmstate.line.market';

export function mountMarket(host, on) {
  let mat = null, priceTouched = false;
  try { mat = localStorage.getItem(KEY); } catch { /* storage off */ }
  host.innerHTML = `<div class="lpart lmkt">
    <dl class="st-glance" id="lm-glance"></dl>
    <div class="atk-layout">
      <div class="atk-main">
        <h3 class="sub">Materials <span class="dim">pick one to see its book and order it</span></h3><div class="mk-cards" id="lm-mats" role="list"></div>
        <h3 class="sub" id="lm-bookh">The book</h3><div id="lm-book"></div>
        <h3 class="sub">Your open orders <span class="dim" id="lm-ordn"></span></h3><div id="lm-orders"></div>
      </div>
      <aside class="atk-sheet" aria-label="Place an order">
        <h3 class="sub">Place an order</h3>
        <form id="lm-form" class="lform atk-grid" novalidate>
          <span class="lbl" id="lm-sidel">Side</span><span class="mk-side" role="radiogroup" aria-labelledby="lm-sidel"><label><input type="radio" name="lm-side" value="buy" checked> Buy</label><label><input type="radio" name="lm-side" value="sell"> Sell</label></span>
          <label for="lm-m">Material</label><select id="lm-m"></select>
          <label for="lm-q">Quantity</label><span class="field"><input id="lm-q" type="number" min="1" value="100" inputmode="numeric"><button type="button" class="btn mini" id="lm-max" aria-label="The most you can order">MAX</button></span>
          <label for="lm-p">Price</label><span class="field"><input id="lm-p" type="number" min="1" value="10" inputmode="numeric"> <span class="dim small">gold each</span></span>
          <span class="lbl">For</span><label class="mk-tr"><input type="checkbox" id="lm-tr"> the state treasury <span class="dim small" id="lm-trwhy"></span></label>
        </form>
        <p class="doing" id="lm-doing" aria-live="polite"></p>
        <p class="dim small" id="lm-have"></p>
        <div class="atk-go"><button type="button" class="btn primary" id="lm-go">Place order</button></div>
        <p class="dim small mk-rules" id="lm-rules"></p>
      </aside>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#lm-${id}`);
  const side = () => host.querySelector('input[name="lm-side"]:checked').value;
  const treasury = () => $('tr').checked;
  const pick = (m) => { mat = m; try { localStorage.setItem(KEY, m); } catch { /* storage off */ } };

  function glance() {
    const h = store.house, orders = store.orders || [], sp = Object.entries(spoils());
    const card = (k, v, note) => `<div><dt>${k}</dt><dd>${v}</dd><dd class="rank"><span>${note}</span></dd></div>`;
    $('glance').innerHTML = card('Your gold', fmt(h.gold), 'to buy with')
      + card('Open orders', fmt(orders.length), orders.length ? `${fmt(orders.filter((o) => o.side === 'buy').length)} buying, ${fmt(orders.filter((o) => o.side === 'sell').length)} selling` : 'none waiting')
      + card('Spoils next tick', sp.length ? fmt(sp.reduce((a, [, n]) => a + n, 0)) : 'Nothing', sp.length ? sp.map(([m, n]) => `${fmt(n)} ${m}`).join(', ') : `${fmt(h.spoilage?.free || 0)} of each keeps free`)
      + card('Your market fee', `${feeBp(false) / 100}%`, 'on what fills at once');
  }
  function mats() {
    const h = store.house, sp = spoils();
    $('mats').innerHTML = store.market.map((m) => {
      const bd = m.bids[0], ak = m.asks[0], held = h.materials[m.material] || 0;
      return `<button type="button" role="listitem" class="mk-card${m.material === mat ? ' on' : ''}${MAT_ICONS.has(m.material) ? ' marked' : ''}" data-mat="${esc(m.material)}" aria-pressed="${m.material === mat}"${matMark(m.material)}>
        <span class="mk-name">${esc(m.name || cap(m.material))}</span>
        <span class="mk-held">${fmt(held)} held${sp[m.material] ? ` <span class="short">−${fmt(sp[m.material])} next tick</span>` : ''}</span>
        <span class="mk-px"><span>Bid <b>${bd ? fmt(bd.price) : '–'}</b></span><span>Ask <b>${ak ? fmt(ak.price) : '–'}</b></span><span>Last <b>${m.last.volume ? fmt(m.last.price) : '–'}</b></span></span>
        <span class="mk-where dim">${m.realms.length ? `made in realm${m.realms.length === 1 ? '' : 's'} ${m.realms.join(', ')}${m.realms.includes(h.realm) ? ' (yours)' : ''}` : 'refined'}</span></button>`;
    }).join('');
  }
  /** The chosen material's book: bids and asks, each level trading at once from its button. */
  function bookOf() {
    const m = book(mat);
    if (!m) { $('book').innerHTML = '<p class="dim">Pick a material above.</p>'; return; }
    const o = m.output_now?.[0];
    $('bookh').innerHTML = `The book: ${esc(m.name || cap(m.material))} <span class="dim">${m.last.volume ? `last ${fmt(m.last.price)} × ${fmt(m.last.volume)} at tick ${fmt(m.last.tick)}` : 'no trades yet'}${o ? ` · ${fmt(o.per_tick)} made a tick now (season ${o.season_bp / 100}%)` : ''}</span>`;
    const lvl = (rows, s) => (rows.length ? rows.map((r) => {
      const { q, why } = hitSize(s, mat, r.price, r.quantity), verb = s === 'buy' ? 'Buy' : 'Sell';
      const tip = q ? `${verb} ${fmt(q)} ${mat} at ${fmt(r.price)} now: it fills at once, at this price or better, and pays the ${feeBp(false) / 100}% market fee` : `Can't: ${why}`;
      return `<tr><td class="num">${fmt(r.price)}</td><td class="num">${fmt(r.quantity)}</td><td class="acts"><button type="button" class="btn mini" data-hit="${s}" data-price="${r.price}" data-qty="${r.quantity}"${q ? '' : ' disabled'} title="${esc(tip)}" aria-label="${esc(tip)}">${q ? `${verb} ${fmt(q)}` : verb}</button></td></tr>`;
    }).join('') : '<tr><td colspan="3" class="dim">None waiting.</td></tr>');
    $('book').innerHTML = `<p class="dim small">${esc(m.description)}</p><div class="mk-book">
      <table class="tbl"><caption>Buyers waiting (bids): sell into them</caption><thead><tr><th class="num">Price</th><th class="num">Quantity</th><th></th></tr></thead><tbody>${lvl(m.bids, 'sell')}</tbody></table>
      <table class="tbl"><caption>Sellers waiting (asks): buy from them</caption><thead><tr><th class="num">Price</th><th class="num">Quantity</th><th></th></tr></thead><tbody>${lvl(m.asks, 'buy')}</tbody></table></div>`;
  }
  function orders() {
    const list = store.orders || [], lead = isLeader(), life = store.rules?.params?.order_min_life_ms ?? 0;
    $('ordn').textContent = list.length ? `${fmt(list.length)}${lead ? ', yours and the treasury\'s' : ''}` : '';
    $('orders').innerHTML = list.length ? `<table class="tbl mk-orders"><thead><tr><th>Side</th><th>Material</th><th class="num">Quantity</th><th class="num">Price</th><th class="num">Holding</th><th>For</th><th>Placed</th><th><span class="vh">Cancel</span></th></tr></thead><tbody>
      ${list.map((o) => {
        const can = !o.treasury || lead, lockUntil = life ? o.placed_at + life : 0, locked = lockUntil > Date.now();
        return `<tr><td class="${o.side === 'buy' ? 'up' : 'down'}">${cap(o.side)}</td><td>${esc(cap(o.material))}</td><td class="num">${fmt(o.quantity)}</td><td class="num">${fmt(o.price)}</td>
          <td class="num dim">${o.side === 'buy' ? `${fmt(o.held ?? waitHold(o.quantity, o.price))} gold` : `${fmt(o.quantity)} ${esc(o.material)}`}</td><td>${o.treasury ? 'Treasury' : 'You'}</td><td class="dim">${esc(when(o.placed_at))}</td>
          <td class="acts"><button type="button" class="btn mini" data-cancel="${o.order}"${can ? '' : ' disabled title="Treasury orders: the leader only"'}${can && locked ? ` title="An order stands ${lockMin()} minutes: cancel from ${esc(dayTime(lockUntil))}"` : ''} aria-label="Cancel your ${o.side} of ${fmt(o.quantity)} ${esc(o.material)}">Cancel</button></td></tr>`;
      }).join('')}</tbody></table>` : `<p class="dim">No open orders${isLeader() ? ', for you or the treasury' : ''}.</p>`;
  }
  /** A starting price: the other side's best, else the last trade (until you type one). */
  function suggest() {
    if (priceTouched) return;
    const b = book($('m').value), other = best(b, side() === 'buy' ? 'sell' : 'buy'), v = other?.price || b?.last?.price || 0;
    if (v) $('p').value = String(v);
  }
  function sheet() {
    if (!store.market) return;
    const sel = $('m'), list = store.market.map((m) => m.material);
    if (sel.options.length !== list.length) sel.innerHTML = list.map((m) => `<option value="${esc(m)}">${esc(cap(m))}</option>`).join('');
    if (mat && sel.value !== mat) sel.value = mat;
    if (!mat) pick(sel.value);
    const lead = isLeader();
    $('tr').disabled = !lead; if (!lead) $('tr').checked = false;
    $('trwhy').textContent = lead ? '(you lead your state)' : '(the leader only)';
    const m = sel.value, s = side(), tr = treasury(), q = num($('q').value), pr = num($('p').value), hd = holder(tr);
    const need = s === 'buy' ? buyHold(q, pr, tr) : q, have = s === 'buy' ? hd.gold : hd.mat(m);
    const crosses = (o) => (s === 'buy' ? o.price <= pr : o.price >= pr);
    const mine = (store.orders || []).find((o) => o.material === m && o.side !== s && (tr ? o.treasury || lead : !o.treasury || lead) && crosses(o));
    const why = [!q ? 'choose a quantity' : '', !pr ? 'choose a price' : '', q > MAX_Q ? `at most ${fmt(MAX_Q)}` : '',
      mine ? `it would fill your own ${mine.side} at ${fmt(mine.price)}; ${s === 'buy' ? 'buy below' : 'sell above'} it (no trading with yourself)` : '',
      q && pr && need > have ? `${hd.who === 'you' ? 'you have' : 'the treasury has'} ${fmt(have)} ${s === 'buy' ? 'gold' : m}` : ''].filter(Boolean);
    const { k, value, fee, cross } = fillNow(m, s, q, pr, tr), rest = q - k;
    $('doing').textContent = why.length ? `Can't yet: ${why.join('; ')}.`
      : `${cap(s)} ${fmt(q)} ${m} at up to ${fmt(pr)} gold each. It holds ${s === 'buy' ? `${fmt(need)} gold` : `${fmt(q)} ${m}`}. `
        + (k ? `About ${fmt(k)} fill${k === 1 ? 's' : ''} at once, ${s === 'buy' ? `for ${fmt(value + fee)} gold with the fee${cross ? ` (and up to ${fmt(cross)} cross-realm)` : ''}` : `for ${fmt(value - fee)} gold after the fee`}${rest ? `; ${fmt(rest)} wait in the book` : ''}.` : `None fills at once; it waits in the book, and pays no fee when it fills.`);
    $('doing').classList.toggle('short', why.length > 0);
    $('go').disabled = why.length > 0;
    const xw = crossWhere(m), xb = crossBp();
    $('have').textContent = `${tr ? 'The treasury has' : 'You have'} ${fmt(hd.gold)} gold and ${fmt(hd.mat(m))} ${m}.${s === 'buy' && xb ? ` Bought from another realm, it costs up to ${xb / 100}% more${xw.home ? '' : ` (${m} isn't made in yours)`}.` : ''}`;
    $('rules').textContent = `An order fills at once against waiting orders that meet your price, best price first, each at the waiting order's price; the rest waits. What fills at once pays the market fee (${feeBp(tr) / 100}%); a waiting order pays none. An order stands ${lockMin()} minutes before you can cancel it.`;
  }

  on($('mats'), 'click', (ev) => {
    const b = ev.target.closest('[data-mat]');
    if (!b) return;
    pick(b.dataset.mat); $('m').value = mat; priceTouched = false; suggest();
    mats(); bookOf(); sheet();
    host.querySelector(`[data-mat="${CSS.escape(mat)}"]`)?.focus();
  });
  on($('book'), 'click', (ev) => {
    const b = ev.target.closest('[data-hit]');
    if (!b) return;
    const s = b.dataset.hit, price = Number(b.dataset.price), { q, why } = hitSize(s, mat, price, Number(b.dataset.qty));
    if (!q) say(`Can't: ${why}.`, 'bad');
    else act.order({ side: s, material: mat, quantity: q, price }, { button: b }).then((o) => { if (o) act.afterPublish(loadMarket); });
  });
  on($('orders'), 'click', (ev) => {
    const b = ev.target.closest('[data-cancel]');
    if (b) act.cancelOrder(b.dataset.cancel, { button: b }).then((o) => { if (o) act.afterPublish(loadMarket); });
  });
  on($('form'), 'input', (ev) => {
    if (ev.target === $('p')) priceTouched = true;
    if (ev.target === $('m')) { pick($('m').value); priceTouched = false; mats(); bookOf(); }
    if (ev.target === $('m') || ev.target.name === 'lm-side') suggest();
    sheet();
  });
  on($('form'), 'change', sheet);
  on($('form'), 'submit', (ev) => ev.preventDefault());
  on($('max'), 'click', () => {
    const m = $('m').value, hd = holder(treasury()), pr = num($('p').value);
    const n = side() === 'buy' ? buyMax(hd.gold, pr, treasury()) : hd.mat(m);
    $('q').value = String(Math.min(MAX_Q, n));
    if (!n) say(`Max is 0: ${side() === 'buy' ? (pr ? 'not enough gold at that price' : 'choose a price first') : `no ${m} to sell`}.`, 'bad');
    sheet();
  });
  on($('go'), 'click', async () => {
    const out = await act.order({ side: side(), material: $('m').value, quantity: num($('q').value), price: num($('p').value), treasury: treasury() }, { button: $('go') });
    if (out) { priceTouched = false; act.afterPublish(loadMarket); }
    sheet();
  });

  function draw() {
    if (!store.house) return;
    if (!store.market) { $('mats').innerHTML = '<p class="dim">Loading the market…</p>'; return; }
    if (!mat || !book(mat)) pick(store.market[0]?.material);
    glance(); mats(); bookOf(); orders(); suggest(); sheet();
  }
  if (!store.market) loadMarket();
  draw();
  return {
    update(c) { if (!c || c.has('market') || c.has('house') || c.has('state')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
