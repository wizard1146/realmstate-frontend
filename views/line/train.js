// Straightline's Train: every unit you can train in its own row (no drop-down), a count and MAX for each, one
// Train button for the lot, as in Utopia. Exact prices from core/prices.js; orders through core/actions.js,
// one per row. From soldiers by default, or straight from peasants.
import { store, raceOf, trainableSlots, unitPoints } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as price from '../../core/prices.js';
import * as pend from '../../core/pending.js';
import { fmt, esc, TRAINABLE } from '../../core/words.js';
import { trainNote } from '../room/orders.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));

export function mountTrain(host, on) {
  let direct = false;
  const race = () => raceOf(store.house?.race);
  const slots = () => trainableSlots(race(), TRAINABLE);
  host.innerHTML = `<section class="traingrid"><h3 class="sub">Train <span class="dim">every unit at once: fill counts, then Train</span></h3>
    <form id="l-tg" novalidate>
      <table class="tbl"><thead><tr><th>Unit</th><th class="num">Off / Def</th><th class="num">Gold each</th><th class="num">Home</th><th class="num">Training</th><th class="num">Count</th><th></th><th class="num">Cost</th></tr></thead>
      <tbody></tbody></table>
      <div class="tg-foot">
        <span class="tg-from" role="radiogroup" aria-label="Train from">
          <label><input type="radio" name="l-tg-src" value="soldiers" checked> From soldiers</label>
          <label><input type="radio" name="l-tg-src" value="direct"> Direct from peasants</label>
        </span>
        <span class="tg-tot" aria-live="polite"></span>
        <button type="button" class="btn" data-clear>Clear</button>
        <button class="btn primary">Train</button>
      </div>
      <p class="dim small tg-note"></p>
    </form></section>`;
  const tbody = host.querySelector('tbody');
  const counts = () => [...tbody.querySelectorAll('input[data-slot]')].map((i) => [Number(i.dataset.slot), n0(i.value)]);

  function draw() {
    const h = store.house, r = race();
    if (!h || !r) return;
    const keep = Object.fromEntries(counts());
    const training = new Map();
    for (const x of pend.list(['train'])) training.set(x.slot, (training.get(x.slot) || 0) + x.count);
    tbody.innerHTML = slots().map((i) => `<tr><td>${esc(r.units[i].name)}</td><td class="num dim">${unitPoints(r, i).join(' / ')}</td>
      <td class="num">${price.have() ? fmt(price.trainCost(i, 1, direct)) : `≈${fmt(r.units[i].gold)}`}</td>
      <td class="num">${fmt(h.units[i])}</td><td class="num">${training.get(i) ? fmt(training.get(i)) : '<span class="dim">·</span>'}</td>
      <td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-slot="${i}" value="${keep[i] || ''}" aria-label="${esc(r.units[i].name)} to train"></td>
      <td><button type="button" class="btn mini" data-max="${i}" aria-label="Most ${esc(r.units[i].name)} with what the other rows leave">MAX</button></td>
      <td class="num tg-cost" data-cost="${i}"></td></tr>`).join('');
    totals();
  }
  /** Gold and soldiers (or peasants) the rows ask for, and whether the house has them. */
  function totals() {
    const h = store.house;
    if (!h) return;
    let gold = 0, people = 0;
    for (const [i, n] of counts()) {
      const g = n ? (price.have() ? price.trainCost(i, n, direct) : 0) : 0;
      gold += g; people += n;
      const cell = tbody.querySelector(`[data-cost="${i}"]`);
      if (cell) cell.textContent = n ? `${fmt(g)}g` : '';
    }
    const pool = price.trainPool(direct);
    const short = gold > h.gold || people > pool;
    host.querySelector('.tg-tot').innerHTML = `<b class="${short ? 'down' : ''}">${fmt(gold)}</b> of ${fmt(h.gold)} gold · <b class="${people > pool ? 'down' : ''}">${fmt(people)}</b> of ${fmt(pool)} ${direct ? 'peasants' : 'soldiers'}`;
    host.querySelector('.tg-note').textContent = trainNote(direct, 1);
  }
  /** Most of one unit that fits the gold and people the other rows leave. */
  function max(slot) {
    const h = store.house;
    let gold = h.gold, people = price.trainPool(direct);
    for (const [i, n] of counts()) if (i !== slot && n) { gold -= price.trainCost(i, n, direct); people -= n; }
    return price.largest(Math.max(0, Math.min(price.trainLimit(), people)), (n) => price.trainCost(slot, n, direct) <= gold);
  }

  on(tbody, 'input', totals);
  on(host, 'change', (ev) => { if (ev.target.name === 'l-tg-src') { direct = ev.target.value === 'direct'; draw(); } });
  on(host, 'click', (ev) => {
    const m = ev.target.closest('[data-max]');
    if (m) { const i = Number(m.dataset.max); tbody.querySelector(`input[data-slot="${i}"]`).value = price.have() ? max(i) : ''; totals(); }
    if (ev.target.closest('[data-clear]')) { tbody.querySelectorAll('input').forEach((i) => { i.value = ''; }); totals(); }
  });
  on(host.querySelector('form'), 'submit', async (ev) => {
    ev.preventDefault();
    const b = ev.submitter;
    for (const [i, n] of counts()) {
      if (!n) continue;
      const out = await act.train(i, n, { direct, button: b });
      if (out) tbody.querySelector(`input[data-slot="${i}"]`).value = '';
    }
    totals();
  });
  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('rules')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
