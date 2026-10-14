// Straightline's Military: your army at a glance, then three tabs. Train: every unit in one table (what it does,
// where it is, a count to train), one order for the lot, and what finishes tick by tick. Draft & Release: the share
// of your people kept under arms, and sending troops home. Arms & Aid: medics, upgrades and chariots. Logic is core's
// (prices, actions, military.js); this file only draws.
import { store, raceOf, trainableSlots, unitPoints, slotUsed, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as price from '../../core/prices.js';
import { fmt, esc, when, TRAINABLE, UNIT_ORDER, isUpgrade, SOLDIER, THIEF, MERC } from '../../core/words.js';
import { trainNote } from '../../core/train.js';
import { armed, jobs, trainByTick } from '../../core/military.js';
import { throneGlyph } from './throne.js';
import { mountAdvisor } from './advisor.js';
import { tickList } from './underway.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const TABS = [['train', 'Train'], ['draft', 'Draft & Release'], ['shop', 'Arms & Aid']];
const KEY = 'realmstate.line.military.tab';
const listText = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function mountMilitary(host, on) {
  let tab = 'train', direct = false;
  try { const t = localStorage.getItem(KEY); if (TABS.some(([k]) => k === t)) tab = t; } catch { /* storage off */ }
  host.innerHTML = `<div class="lpart lbuild lmil${throneGlyph() ? ' glyph' : ''}">
    <dl class="st-glance mil-glance" id="lm-glance"></dl>
    <p class="mil-more" id="lm-more"></p>
    <div class="ltabs" role="tablist" aria-label="Military">${TABS.map(([t, label]) =>
      `<button type="button" role="tab" id="lm-tab-${t}" aria-controls="lm-${t}" data-tab="${t}">${label}</button>`).join('')}</div>

    <div role="tabpanel" id="lm-train" aria-labelledby="lm-tab-train" data-panel="train">
      <div class="lb-bar">
        <p class="doing" id="lm-doing" aria-live="polite" hidden></p>
        <span class="mil-from" role="radiogroup" aria-label="Train from">
          <label><input type="radio" name="lm-src" value="soldiers" checked> From soldiers</label>
          <label><input type="radio" name="lm-src" value="direct"> Straight from peasants</label></span>
        <span class="lb-btns"><button type="button" class="btn" id="lm-clear">Clear</button><button type="submit" form="lm-form" class="btn primary" id="lm-go">Train</button></span>
      </div>
      <form id="lm-form" novalidate>
        <table class="tbl lb-tbl mil-tbl fit">
          <thead><tr><th data-fx="last">Unit</th><th class="num pt" data-pri="5" title="Attack points each">Off</th><th class="num pt" data-pri="5" title="Defence points each">Def</th><th class="num">Home</th><th class="num" data-pri="4">Away</th><th class="num" data-pri="3">Training</th><th class="num">Count</th><th></th><th class="num" data-pri="6" data-fx="clip">Each</th><th class="num" data-pri="2" data-fx="clip">Cost</th></tr></thead>
          <tbody id="lm-rows"></tbody></table>
      </form>
      <p class="note" id="lm-note"></p>
      <h3 class="sub">Under way <span class="dim">the next 24 ticks; +1 finishes before the next tick</span></h3>
      <div id="lm-uw"></div>
    </div>

    <div role="tabpanel" id="lm-draft" aria-labelledby="lm-tab-draft" data-panel="draft">
      <section class="mil-card"><h3 class="sub">Draft</h3>
        <p class="what">The share of your people you keep under arms. While you're below it, some peasants become soldiers each tick; at or above it, nobody is drafted. Drafted peasants stop working and paying tax.</p>
        <form id="lm-df" class="lform" novalidate>
          <label for="lm-rate">Draft rate</label><span class="field"><input id="lm-rate" type="number" min="0" step="0.5" inputmode="decimal"> %</span>
          <button class="btn primary" id="lm-dgo">Set rate</button>
        </form>
        <div class="mil-meter" aria-hidden="true"><i class="arm"></i><b class="aim"></b></div>
        <p class="mil-now" id="lm-dnow"></p></section>
      <section class="mil-card"><h3 class="sub">Release</h3>
        <p class="what">Send troops at home back: soldiers return to the fields as peasants; trained troops become soldiers again (their training isn't refunded).</p>
        <form id="lm-rf" class="lform" novalidate>
          <label for="lm-ru">Troops</label><select id="lm-ru"></select>
          <label for="lm-rn">How many</label><span class="field"><input id="lm-rn" type="number" min="1" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" id="lm-rmax" aria-label="All of these at home">MAX</button></span>
          <button class="btn" id="lm-rgo">Release</button>
        </form>
        <p class="mil-now" id="lm-rnow"></p></section>
    </div>

    <div role="tabpanel" id="lm-shop" aria-labelledby="lm-tab-shop" data-panel="shop">
      <p class="what">Medics save troops in battle; upgrades make troops stronger; chariots add to an attack. Each is made at once or after the usual training time.</p>
      <table class="tbl lb-tbl mil-shop fit"><thead><tr><th data-fx="last">Make</th><th data-pri="4" data-fx="flex">Each costs</th><th class="num">Count</th><th></th><th data-pri="3" data-fx="clip">Cost</th><th></th></tr></thead><tbody id="lm-jobs"></tbody></table>
      <p class="note" id="lm-hold"></p>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#lm-${id}`);
  const race = () => raceOf(store.house?.race);

  // ---------- tabs (keeps your place on the page) ----------
  const bar = host.querySelector('.ltabs');
  function showTab(t, focus = false) {
    tab = t;
    try { localStorage.setItem(KEY, t); } catch { /* storage off */ }
    host.querySelectorAll('[role=tab]').forEach((b) => { const sel = b.dataset.tab === t; b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; });
    const main = host.closest('.line-main'), y = main?.scrollTop;
    host.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (main && y != null) main.scrollTop = y;
    if (focus) $(`tab-${t}`).focus({ preventScroll: true });
  }
  on(bar, 'click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  on(bar, 'keydown', (ev) => {
    const i = TABS.findIndex(([t]) => t === tab), n = TABS.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    showTab(TABS[j][0], true);
  });

  // ---------- at a glance ----------
  function glance() {
    const h = store.house, r = race();
    const pts = (i) => unitPoints(r, i);
    const off = h.units.reduce((a, n, i) => a + pts(i)[0] * n, 0), def = h.units.reduce((a, n, i) => a + pts(i)[1] * n, 0);
    const offAway = h.away.reduce((a, n, i) => a + pts(i)[0] * n, 0);
    const a = armed(h), rate = (h.draft_bp ?? store.rules.params.draft_default_bp) / 100, rk = store.me?.ranks;
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank">${note}</dd>` : ''}</div>`;
    $('glance').innerHTML = card('Attack', fmt(off), offAway ? `<span>+${fmt(offAway)} away</span>` : '<span>at home</span>')
      + card('Defence', fmt(def), '<span>at home</span>')
      + card('Under arms', `${a.pct.toFixed(1)}%`, `<span>aim ${rate}%</span>`)
      + card('Might', fmt(h.might), rk?.might_rank ? `#${fmt(rk.might_rank)} <span>of ${fmt(rk.houses)}</span>` : '');
    $('glance').title = 'Attack and defence: your troops\' points, before bonuses from buildings, science and generals.';
    $('more').textContent = `Medics ${fmt(h.medics)}${h.medics_away ? ` (+${fmt(h.medics_away)} away)` : ''} · Horses ${fmt(h.horses)}${h.horses_away ? ` (+${fmt(h.horses_away)} away)` : ''} · Chariots ${fmt(h.chariots)}${h.chariots_away ? ` (+${fmt(h.chariots_away)} away)` : ''} · Generals ${fmt(h.generals.length)}`;
  }

  // ---------- train: one table of every unit ----------
  const inputs = () => [...$('rows').querySelectorAll('input[data-slot]')];
  const order = () => inputs().map((i) => ({ slot: Number(i.dataset.slot), n: n0(i.value) })).filter((o) => o.n);
  let shownUnits = '';
  function units() {
    const h = store.house, r = race();
    const training = Array(10).fill(0);
    for (const x of h.pending || []) if (x.kind === 'train') training[x.slot] += x.count;
    const can = new Set(trainableSlots(r, TRAINABLE));
    const list = UNIT_ORDER.filter((i) => r.units[i] && slotUsed(r, i) && i !== MERC);
    const key = JSON.stringify([list, h.units, h.away, training, direct, price.have() && list.map((i) => can.has(i) && price.trainCost(i, 1, direct))]);
    if (key === shownUnits) return;
    const keep = Object.fromEntries(inputs().map((i) => [i.dataset.slot, i.value]));
    shownUnits = key;
    $('rows').innerHTML = list.map((i, k) => {
      const u = r.units[i], [o, d] = unitPoints(r, i), up = isUpgrade(i);
      // As a card (phones), the name carries its points, "(6/1)", in place of the Off and Def rows; a unit not trained
      // here says where it comes from instead of a row of dashes.
      const from = can.has(i) ? '' : i === SOLDIER ? 'drafted (Draft &amp; Release)' : up ? 'upgraded under Arms &amp; Aid' : '';
      const name = `${up ? '<span class="sub-mark" aria-hidden="true">↳ </span>' : ''}${esc(u.name)}${i === SOLDIER ? ' <span class="dim">(soldiers)</span>' : i === THIEF ? ' <span class="dim">(thieves)</span>' : ''}`
        + `<span class="pts" title="${o} offence, ${d} defence each"> (${o}/${d})</span>${from ? `<span class="from">${from}</span>` : ''}`;
      const each = can.has(i) && price.have() ? fmt(price.trainCost(i, 1, direct)) : '';
      const cnt = can.has(i)
        ? `<td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-slot="${i}" value="${esc(keep[i] || '')}" aria-label="${esc(u.name)} to train"></td>
           <td class="acts"><button type="button" class="btn mini" data-max="${i}" aria-label="Most ${esc(u.name)} with what the other rows leave">MAX</button><button type="button" class="x" data-x="${i}" aria-label="Clear ${esc(u.name)}" title="Clear this row">×</button></td>
           <td class="num each">${each}</td><td class="num cost" data-cost="${i}"></td>`
        : '<td class="num dim na">–</td><td class="na"></td><td class="num dim na">–</td><td class="num dim na">–</td>';   // not trained here (drafted, or upgraded under Arms & Aid)
      return `<tr class="${[up ? 'plus' : '', k % 2 ? 'alt' : ''].join(' ').trim()}"><th scope="row">${name}</th><td class="num pt">${o}</td><td class="num pt">${d}</td>`
        + `<td class="num">${fmt(h.units[i])}</td><td class="num${h.away[i] ? '' : ' dim zero'}">${fmt(h.away[i])}</td><td class="num${training[i] ? '' : ' dim zero'}">${fmt(training[i])}</td>${cnt}</tr>`;
    }).join('');
    totals();
  }
  /** Each row's cost, and the whole order as a sentence. */
  function totals() {
    const h = store.house, r = race();
    let gold = 0, people = 0;
    for (const i of inputs()) {
      const slot = Number(i.dataset.slot), n = n0(i.value), g = n && price.have() ? price.trainCost(slot, n, direct) : 0;
      gold += g; people += n;
      $('rows').querySelector(`[data-cost="${slot}"]`).textContent = n ? `${fmt(g)} gold` : '';
      i.closest('tr').classList.toggle('on', n > 0);
    }
    const o = order(), pool = price.trainPool(direct), who = direct ? 'peasants' : 'soldiers';
    const why = gold > h.gold ? `that needs ${fmt(gold)} gold; you have ${fmt(h.gold)}` : people > pool ? `that needs ${fmt(people)} ${who}; you have ${fmt(pool)}` : '';
    const doing = $('doing');
    doing.hidden = !o.length;
    doing.textContent = o.length ? `You will train ${listText(o.map((x) => `${fmt(x.n)} ${r.units[x.slot].name}`))} from ${fmt(people)} of your ${fmt(pool)} ${who}, paying ${fmt(gold)} of your ${fmt(h.gold)} gold.${why ? ` Can't: ${why}.` : ''}` : '';
    doing.classList.toggle('short', !!why);
    $('go').disabled = !o.length || !!why;
    $('note').textContent = trainNote(direct, 1);
  }
  /** Most of one unit that fits the gold and people the other rows leave. */
  function most(slot) {
    let gold = store.house.gold, people = price.trainPool(direct);
    for (const o of order()) if (o.slot !== slot) { gold -= price.trainCost(o.slot, o.n, direct); people -= o.n; }
    return price.largest(Math.max(0, Math.min(price.trainLimit(), people)), (n) => price.trainCost(slot, n, direct) <= gold);
  }
  on($('rows'), 'input', totals);
  on($('rows'), 'click', (ev) => {
    const x = ev.target.closest('[data-x]'), m = ev.target.closest('[data-max]');
    const inp = (s) => $('rows').querySelector(`input[data-slot="${s}"]`);
    if (x) { inp(x.dataset.x).value = ''; totals(); inp(x.dataset.x).focus(); }
    if (m && price.have()) { const n = most(Number(m.dataset.max)); inp(m.dataset.max).value = n ? String(n) : ''; totals(); inp(m.dataset.max).focus(); }
  });
  on(host, 'change', (ev) => { if (ev.target.name === 'lm-src') { direct = ev.target.value === 'direct'; units(); totals(); } });
  on($('clear'), 'click', () => { inputs().forEach((i) => { i.value = ''; }); totals(); });
  on($('form'), 'submit', async (ev) => {
    ev.preventDefault();
    for (const o of order()) {
      if (await act.train(o.slot, o.n, { direct, button: $('go') })) { const i = $('rows').querySelector(`input[data-slot="${o.slot}"]`); if (i) i.value = ''; }
    }
    totals();
  });

  // ---------- under way: what finishes each tick ----------
  let shownTicks = '';
  function timeline() {
    const b = trainByTick(24), r = race(), key = JSON.stringify([b.rows, store.tick]);
    if (key === shownTicks) return;
    shownTicks = key;
    const late = b.rows.some((x) => x.later);
    const head = b.ends.map((t, k) => `<th scope="col" class="num" title="Tick ${fmt(store.tick + k + 1)}, ${esc(when(t))}">+${k + 1}</th>`).join('') + (late ? '<th scope="col" class="num">later</th>' : '');
    const cells = (x) => x.ticks.map((v) => `<td class="num${v ? ' on' : ''}">${v ? fmt(v) : ''}</td>`).join('') + (late ? `<td class="num${x.later ? ' on' : ''}">${x.later ? fmt(x.later) : ''}</td>` : '');
    const name = (id) => (id === 'medics' ? 'Medics' : id === 'army' ? 'Armies home' : r?.units[id]?.name || `unit ${id}`);
    const rows = b.rows.length ? b.rows.map((x) => `<tr><th scope="row">${esc(name(x.id))}</th>${cells(x)}</tr>`).join('')
      : `<tr><th scope="row"><span class="vh">Nothing under way</span></th>${cells({ ticks: Array(24).fill(0), later: 0 })}</tr>`;
    $('uw').innerHTML = `<div class="scrollx"><table class="tbl ticks nocards"><thead><tr><th scope="col">Ticks from now</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
      + tickList(b.rows.map((x) => ({ name: x.id === 'army' ? 'troops home' : name(x.id), ticks: x.ticks, later: x.later })), b.ends, 'Nothing training or on its way home.');
  }

  // ---------- draft & release ----------
  let rateDirty = false;
  function draft() {
    const h = store.house, P = store.rules.params, max = P.draft_max_bp / 100, rate = (h.draft_bp ?? P.draft_default_bp) / 100, a = armed(h);
    $('rate').max = String(max);
    if (!rateDirty && document.activeElement !== $('rate')) $('rate').value = String(rate);
    const m = host.querySelector('.mil-meter');
    m.querySelector('.arm').style.width = `${Math.min(100, (a.pct / Math.max(1, max)) * 100)}%`;
    m.querySelector('.aim').style.left = `${Math.min(100, (rate / Math.max(1, max)) * 100)}%`;
    const speed = (P.draft_speed_bp || 100) / 100, gap = Math.max(0, Math.floor((rate / 100) * h.population) - a.armed);
    $('dnow').innerHTML = `<b>${a.pct.toFixed(1)}%</b> under arms now (${fmt(a.armed)} of ${fmt(h.population)} people); the rate is <b>${rate}%</b>, at most ${max}%. `
      + (gap ? `${fmt(gap)} short: up to ${speed}% of your peasants (${fmt(Math.floor((h.peasants * speed) / 100))} now) are drafted each tick.` : 'At or above it: nobody is drafted.');
    // Release: troops at home.
    const r = race(), ru = $('ru');
    const slots = h.units.map((n, k) => [k, n]).filter(([k, n]) => k !== MERC && (n > 0 || k === SOLDIER));
    const sig = slots.map(([k, n]) => `${k}:${n}`).join(',');
    if (ru.dataset.sig !== sig) {
      const v = ru.value;
      ru.innerHTML = slots.map(([k, n]) => `<option value="${k}">${esc(r.units[k]?.name || 'Soldiers')} (${fmt(n)} at home) → ${k === SOLDIER ? 'peasants' : 'soldiers'}</option>`).join('');
      if (v && slots.some(([k]) => String(k) === v)) ru.value = v;
      ru.dataset.sig = sig;
    }
    release();
  }
  function release() {
    const h = store.house, k = Number($('ru').value), have = h.units[k] || 0, n = n0($('rn').value);
    $('rnow').textContent = n > have ? `You have ${fmt(have)} at home.` : k === SOLDIER && n ? 'If that leaves fewer under arms than your draft rate, the rate comes down to match, so they aren\'t drafted back.' : '';
    $('rnow').classList.toggle('short', n > have);
  }
  on($('rate'), 'input', () => { rateDirty = true; });
  on($('df'), 'submit', async (ev) => {
    ev.preventDefault();
    const v = Number($('rate').value), max = store.rules.params.draft_max_bp / 100;
    if (!Number.isFinite(v) || v < 0 || v > max) { say(`A draft rate is 0–${max}%.`, 'bad'); return; }
    const out = await act.setDraft(Math.round(v * 100), { button: $('dgo') });
    if (out) { rateDirty = false; store.house.draft_bp = out.rate_bp; }
    draft();
  });
  on($('ru'), 'input', release);
  on($('rn'), 'input', release);
  on($('rmax'), 'click', () => { $('rn').value = String(store.house.units[Number($('ru').value)] || 0); release(); $('rn').focus(); });
  on($('rf'), 'submit', async (ev) => {
    ev.preventDefault();
    const k = Number($('ru').value), n = n0($('rn').value);
    if (!n) { say('Say how many to release.', 'bad'); return; }
    const out = await act.release(k, n, { button: $('rgo') });
    if (out) { $('rn').value = ''; if (k === SOLDIER) { store.house.draft_bp = out.draft_bp; rateDirty = false; } }
    draft();
  });

  // ---------- workshop: medics, upgrades, chariots (refining is on Resources) ----------
  let shownJobs = '';
  function shop() {
    const h = store.house, P = store.rules.params, list = jobs().filter((j) => j.group !== 'REFINE');
    const key = list.map((j) => j.id + j.each).join('|');
    if (key !== shownJobs) {
      const keep = Object.fromEntries([...$('jobs').querySelectorAll('input[data-job]')].map((i) => [i.dataset.job, i.value]));
      shownJobs = key;
      const head = { TRAIN: 'Train', UPGRADE: 'Upgrade', BUILD: 'Build' };
      let last = '';
      $('jobs').innerHTML = list.map((j) => {
        const g = j.group !== last ? `<tr class="grp"><th colspan="6" scope="rowgroup">${esc(head[j.group] || j.group)}</th></tr>` : '';
        last = j.group;
        return `${g}<tr data-row="${esc(j.id)}"><th scope="row">${esc(j.label)}</th><td class="dim">${esc(j.each)}</td>
          <td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-job="${esc(j.id)}" value="${esc(keep[j.id] || '')}" aria-label="${esc(j.label)}: how many"></td>
          <td class="acts"><button type="button" class="btn mini" data-jmax="${esc(j.id)}" aria-label="Most ${esc(j.label)} you can make">MAX</button></td>
          <td class="cost" data-q="${esc(j.id)}"></td><td><button type="button" class="btn" data-make="${esc(j.id)}">Make</button></td></tr>`;
      }).join('');
    }
    quotes();
    $('hold').textContent = `You hold ${fmt(h.gold)} gold, ${fmt(h.horses)} horses and ${fmt(h.peasants)} peasants; ${[P.medic_material, P.upgrade_material, P.chariot_material].filter((m, i, a) => a.indexOf(m) === i).map((m) => `${fmt(h.materials[m] || 0)} ${m}`).join(', ')}.`;
  }
  function quotes() {
    const byId = new Map(jobs().map((j) => [j.id, j]));
    for (const i of $('jobs').querySelectorAll('input[data-job]')) {
      const j = byId.get(i.dataset.job), n = n0(i.value), cell = $('jobs').querySelector(`[data-q="${CSS.escape(i.dataset.job)}"]`);
      const q = n ? j.quote(n) : null;
      cell.textContent = q ? (q.why ? `Can't: ${q.why}` : q.text) : '';
      cell.title = q?.title || '';
      cell.classList.toggle('short', !!q?.short);
      i.closest('tr').classList.toggle('on', n > 0);
      $('jobs').querySelector(`[data-make="${CSS.escape(i.dataset.job)}"]`).disabled = !n || !!q?.short;
    }
  }
  on($('jobs'), 'input', quotes);
  on($('jobs'), 'click', async (ev) => {
    const mx = ev.target.closest('[data-jmax]'), mk = ev.target.closest('[data-make]');
    const job = (id) => jobs().find((j) => j.id === id), inp = (id) => $('jobs').querySelector(`input[data-job="${CSS.escape(id)}"]`);
    if (mx) { const [n, why] = job(mx.dataset.jmax).max(); inp(mx.dataset.jmax).value = n ? String(n) : ''; if (!n && why) say(`None: ${why}.`, 'bad'); quotes(); inp(mx.dataset.jmax).focus(); }
    if (mk) {
      const id = mk.dataset.make, n = n0(inp(id).value);
      if (n && await job(id).send(n, { button: mk })) inp(id).value = '';
      quotes();
    }
  });

  function draw() {
    if (!store.house || !race()) return;
    glance(); units(); totals(); timeline(); draft(); shop();
  }
  const advisor = mountAdvisor(host.querySelector('.lmil'), 'military');
  showTab(tab);
  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('rules') || c.has('me')) { draw(); advisor.update(); } },
    tick() { timeline(); },
    destroy() { host.replaceChildren(); },
  };
}
