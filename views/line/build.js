// Straightline's Build: two tabs, Build and Raze, each saying in plain words what it does and, as you fill it in,
// exactly what the order will do. Build is every building in one table (what it does, owned, being built, price),
// a count for each and one Build button for the lot; Raze tears finished buildings down. Sums, limits and reasons
// from core/land.js and core/does.js, exact prices from core/prices.js, orders through core/actions.js.
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as price from '../../core/prices.js';
import { fmt, esc, when } from '../../core/words.js';
import { matText, buildTotals, buildRowProblem, buildMaxRow, razeEach, razeable, razeMax, razeProblem } from '../../core/land.js';
import { does } from '../../core/does.js';
import { underwayHTML, tickUnderway } from './underway.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const TABS = [['build', 'Build'], ['raze', 'Raze']];
const KEY = 'realmstate.line.build';
const bname = (id) => store.rules.buildings.find((b) => b.building === id)?.name || id;
/** "10 Farms, 5 Homes and 2 Towers" */
const listText = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function mountBuild(host, on) {
  let tab = 'build';
  try { if (localStorage.getItem(KEY) === 'raze') tab = 'raze'; } catch { /* storage off */ }
  host.innerHTML = `<div class="lpart lbuild">
    <p class="lead" id="lb-lead"></p>
    <div class="ltabs" role="tablist" aria-label="Build or raze">${TABS.map(([t, label]) =>
      `<button type="button" role="tab" id="lb-tab-${t}" aria-controls="lb-${t}" data-tab="${t}">${label}</button>`).join('')}</div>

    <div role="tabpanel" id="lb-build" aria-labelledby="lb-tab-build" data-panel="build">
      <p class="what">Building turns barren acres into buildings. You pay the gold and materials now; each building
        starts working once it's finished. Fill in a count on as many rows as you like, then Build sends them all.
        A row's <b>+1% land</b> line is what one more percent of your land in that building would add.</p>
      <form id="lb-form" novalidate>
        <div class="scrollx"><table class="tbl lb-tbl"><thead><tr><th>Building</th><th>What it does</th><th class="num">Owned</th><th class="num">Being built</th>
          <th class="num">Price each</th><th class="num">Count</th><th></th><th class="num">Cost</th></tr></thead><tbody id="lb-rows"></tbody></table></div>
        <p class="doing" id="lb-doing" aria-live="polite"></p>
        <p class="done" id="lb-done" aria-live="polite" hidden></p>
        <div class="lfoot"><button type="button" class="btn" id="lb-clear">Clear</button><button class="btn primary" id="lb-go">Build</button></div>
      </form>
      <h3 class="sub">Being built</h3><div id="lb-uw"></div>
    </div>

    <div role="tabpanel" id="lb-raze" aria-labelledby="lb-tab-raze" data-panel="raze">
      <p class="what">Razing tears finished buildings down. The land turns barren at once, so you can build something
        else there. It costs gold for each building, and the buildings are gone for good: nothing is refunded.
        Buildings still under construction can't be razed.</p>
      <form id="lb-rz" class="lform" novalidate>
        <label for="lb-rz-b">Building</label><select id="lb-rz-b"></select>
        <label for="lb-rz-n">Count</label>
        <span class="field"><input id="lb-rz-n" type="number" min="1" step="1" inputmode="numeric" value="1"><button type="button" class="btn mini" id="lb-rz-max" aria-label="Most of this building you can raze">MAX</button></span>
        <button class="btn danger" id="lb-rz-go">Raze…</button>
      </form>
      <p class="doing" id="lb-rz-doing" aria-live="polite"></p>
      <div class="confirm" id="lb-rz-confirm" hidden role="group" aria-labelledby="lb-rz-ask">
        <p id="lb-rz-ask"></p>
        <button type="button" class="btn danger" id="lb-rz-yes">Yes, raze them</button> <button type="button" class="btn" id="lb-rz-no">Cancel</button>
      </div>
      <p class="dim small" id="lb-rz-info"></p>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#lb-${id}`);
  const tbody = $('rows');

  // ---------- tabs (the ARIA tabs pattern: ←/→, Home, End) ----------
  function showTab(t, focus = false) {
    tab = t;
    try { localStorage.setItem(KEY, t); } catch { /* storage off */ }
    host.querySelectorAll('[role=tab]').forEach((b) => { const on2 = b.dataset.tab === t; b.setAttribute('aria-selected', String(on2)); b.tabIndex = on2 ? 0 : -1; });
    host.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (focus) $(`tab-${t}`).focus();
  }
  const bar = host.querySelector('[role=tablist]');
  on(bar, 'click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  on(bar, 'keydown', (ev) => {
    const i = TABS.findIndex(([t]) => t === tab), n = TABS.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    showTab(TABS[j][0], true);
  });

  // ---------- build ----------
  const inputs = () => [...tbody.querySelectorAll('input[data-b]')];
  const rowsOf = (except) => inputs().filter((i) => i.dataset.b !== except).map((i) => ({ id: i.dataset.b, n: n0(i.value) }));

  function lead() {
    const h = store.house;
    $('lead').innerHTML = `You have <b>${fmt(h.barren)}</b> barren acre${h.barren === 1 ? '' : 's'} to build on, of ${fmt(h.land)}.`
      + (h.barren ? '' : ' Explore for more on the <a href="#land">Land</a> page, or raze buildings you don\'t need.');
  }
  /** The rows, once (the buildings come from /rules); fillRows() keeps their figures current without touching the inputs. */
  function makeRows() {
    tbody.innerHTML = store.rules.buildings.map((d) => {
      const id = esc(d.building);
      return `<tr data-row="${id}"><th scope="row">${esc(d.name)}<span class="dim small" data-cap></span></th>
        <td class="does small" title="${esc(d.description)}" data-does></td>
        <td class="num" data-own></td><td class="num" data-bld></td><td class="num" data-each></td>
        <td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-b="${id}" aria-label="${esc(d.name)} to build"></td>
        <td><button type="button" class="btn mini" data-max="${id}" aria-label="Most ${esc(d.name)} you can build with what the other rows leave">MAX</button></td>
        <td class="num cost" data-cost="${id}"></td></tr>`;
    }).join('');
  }
  function fillRows() {
    const h = store.house, exact = price.have();
    for (const d of store.rules.buildings) {
      const id = d.building, tr = tbody.querySelector(`tr[data-row="${CSS.escape(id)}"]`);
      if (!tr) continue;
      const p = price.buildingPrice(id), x = does(id, h), k = h.constructing[id] || 0;
      tr.querySelector('[data-cap]').textContent = p?.max_count ? ` (up to ${fmt(p.max_count)})` : '';
      tr.querySelector('[data-does]').innerHTML = x ? `${esc(x.now.map((y) => y.short).join(' · ') || 'nothing yet')}<span class="more">+1% land: ${esc(x.more.map((y) => y.short).join(' · ') || 'no change')}</span>` : esc(d.description);
      tr.querySelector('[data-own]').textContent = fmt(h.buildings[id] || 0);
      tr.querySelector('[data-bld]').innerHTML = k ? fmt(k) : '<span class="dim">·</span>';
      tr.querySelector('[data-each]').textContent = p ? `${fmt(p.gold)} gold${Object.keys(p.materials).length ? ` + ${matText(p.materials)}` : ''}` : `≈${fmt(act.estimate.build(id, 1))} gold`;
      tr.querySelector('[data-max]').disabled = !exact;
    }
    totals();
  }
  /** Each row's cost and problem, then the whole order as a sentence. */
  function totals() {
    const h = store.house, exact = price.have();
    const rows = rowsOf().filter((r) => r.n);
    let rowWhy = '';
    for (const i of inputs()) {
      const n = n0(i.value), id = i.dataset.b, cell = tbody.querySelector(`[data-cost="${CSS.escape(id)}"]`);
      const why = buildRowProblem(id, n);
      if (why && !rowWhy) rowWhy = `${bname(id)}: ${why}`;
      const c = n && exact ? price.buildCost(id, n) : null;
      cell.textContent = !n ? '' : c ? `${fmt(c.gold)} gold${Object.keys(c.materials).length ? ` + ${matText(c.materials)}` : ''}` : `≈${fmt(act.estimate.build(id, n))} gold`;
      cell.classList.toggle('short', !!why);
      i.closest('tr').classList.toggle('on', n > 0);
    }
    const doing = $('doing');
    $('go').disabled = !rows.length;
    if (!rows.length) { doing.textContent = 'Fill in a count on any row to see what the order will do.'; doing.classList.remove('short'); return; }
    const what = listText(rows.map((r) => `${fmt(r.n)} ${bname(r.id)}`));
    if (!exact) { doing.textContent = `You will build ${what}: about ≈${fmt(rows.reduce((a, r) => a + act.estimate.build(r.id, r.n), 0))} gold before your modifiers.`; doing.classList.remove('short'); return; }
    const t = buildTotals(rows, h);
    const pay = [`${fmt(t.gold)} of your ${fmt(h.gold)} gold`, ...Object.entries(t.materials).map(([m, q]) => `${fmt(q)} of your ${fmt(h.materials[m] || 0)} ${m}`)];
    const short = [t.barren > h.barren && 'barren land', t.gold > h.gold && 'gold', ...Object.entries(t.materials).filter(([m, q]) => q > (h.materials[m] || 0)).map(([m]) => m)].filter(Boolean);
    const why = short.length ? `not enough ${listText(short)}` : rowWhy;
    doing.textContent = `You will build ${what} on ${fmt(t.barren)} of your ${fmt(h.barren)} barren acres, paying ${listText(pay)}.`
      + (why ? ` Can't yet: ${why}.` : ` ${fmt(h.barren - t.barren)} barren acres will be left.`);
    doing.classList.toggle('short', !!why);
    $('go').disabled = !!why;
  }
  on(tbody, 'input', () => { $('done').hidden = true; totals(); });
  on(tbody, 'click', (ev) => {
    const b = ev.target.closest('[data-max]');
    if (!b) return;
    const id = b.dataset.max, inp = tbody.querySelector(`input[data-b="${CSS.escape(id)}"]`);
    const { n, why } = buildMaxRow(id, rowsOf(id));
    inp.value = String(n);
    totals();
    if (!n) { $('doing').textContent = `MAX for ${bname(id)} is 0: ${why}.`; $('doing').classList.add('short'); }
    inp.focus();
  });
  on($('clear'), 'click', () => { inputs().forEach((i) => { i.value = ''; }); totals(); });
  on($('form'), 'submit', async (ev) => {
    ev.preventDefault();
    const rows = rowsOf().filter((r) => r.n);
    if (!rows.length) return;
    const results = await act.buildMany(rows.map((r) => ({ building: r.id, count: r.n })), { button: $('go') });
    const done = [];
    for (const r of results) {
      if (!r.ok) continue;
      const i = tbody.querySelector(`input[data-b="${CSS.escape(r.building)}"]`);
      if (i) i.value = '';
      done.push(`${fmt(r.out.count)} ${bname(r.building)} ready ${when(r.out.ready_at)}`);
    }
    totals();
    $('done').hidden = !done.length;
    if (done.length) $('done').textContent = `Ordered: ${listText(done)}.`;
  });

  // ---------- raze ----------
  function razeList() {
    const h = store.house, list = razeable(h), sel = $('rz-b'), v = sel.value;
    const k = list.map((b) => `${b.building}:${h.buildings[b.building]}`).join();
    if (sel.dataset.k === k) return;
    sel.innerHTML = list.length ? list.map((b) => `<option value="${esc(b.building)}">${esc(b.name)} (${fmt(h.buildings[b.building])} owned)</option>`).join('') : '<option value="">nothing built yet</option>';
    sel.dataset.k = k;
    if (list.some((b) => b.building === v)) sel.value = v;
  }
  function raze() {
    const h = store.house, P = store.rules.params, id = $('rz-b').value, n = n0($('rz-n').value);
    const each = razeEach(h), have = h.buildings[id] || 0, why = id && n ? razeProblem(id, n, h) : '';
    const doing = $('rz-doing');
    $('rz-go').disabled = !id || !n || !!why;
    $('rz-max').disabled = !id;
    if (!id) doing.textContent = 'You have no finished buildings to raze.';
    else if (!n) doing.textContent = 'Enter how many to raze.';
    else doing.textContent = `You will raze ${fmt(n)} ${bname(id)} for ${fmt(n * each)} gold (${fmt(each)} each). ${fmt(n)} acre${n === 1 ? '' : 's'} turn barren at once; you'll have ${fmt(Math.max(0, have - n))} ${bname(id)} left.`
      + (why ? ` Can't: ${why}.` : '');
    doing.classList.toggle('short', !!why);
    $('rz-info').textContent = `Razing costs ${fmt(each)} gold a building now: ${fmt(P.raze_cost_base)} plus ${P.raze_cost_per_land_milli / 1000} for each of your ${fmt(h.land)} acres.`;
  }
  const ask = (open) => {
    $('rz-confirm').hidden = !open;
    if (open) { $('rz-ask').textContent = `Raze ${fmt(n0($('rz-n').value))} ${bname($('rz-b').value)} for ${fmt(n0($('rz-n').value) * razeEach())} gold? They're gone for good.`; $('rz-yes').focus(); }
  };
  on($('rz'), 'input', () => { ask(false); raze(); });
  on($('rz-max'), 'click', () => { $('rz-n').value = String(razeMax($('rz-b').value)); ask(false); raze(); $('rz-n').focus(); });
  on($('rz'), 'submit', (ev) => { ev.preventDefault(); if (!$('rz-go').disabled) ask(true); });
  on($('rz-no'), 'click', () => { ask(false); $('rz-go').focus(); });
  on($('rz-confirm'), 'keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); ask(false); $('rz-go').focus(); } });
  on($('rz-yes'), 'click', async () => {
    const id = $('rz-b').value, n = n0($('rz-n').value);
    ask(false);
    await act.raze(id, n, { button: $('rz-go') });
    $('rz-go').focus();
  });

  function draw() {
    lead(); fillRows(); razeList(); raze();
    $('uw').innerHTML = underwayHTML(['build'], 'Nothing being built.');
  }
  showTab(tab);
  makeRows();
  draw();
  return {
    update(c) { if (c?.has('rules')) makeRows(); if (!c || c.has('house') || c.has('rules')) draw(); },
    tick() { tickUnderway(host); },
    destroy() { host.replaceChildren(); },
  };
}
