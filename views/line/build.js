// Straightline's Build: two tabs, Build and Raze, each saying in plain words what it does and, as you fill it in,
// exactly what the order will do. Build is every building in one table (what it does, owned, being built, price),
// a count for each and one Build button for the lot; Raze tears finished buildings down. Sums, limits and reasons
// from core/land.js and core/does.js, exact prices from core/prices.js, orders through core/actions.js.
import { store } from '../../core/store.js';
import { tickList } from './underway.js';
import * as act from '../../core/actions.js';
import * as price from '../../core/prices.js';
import { fmt, esc, when } from '../../core/words.js';
import { matText, buildTotals, buildRowProblem, buildMaxRow, razeEach, razeable, razeMax, razeProblem, buildByTick, buildingGroups as groupsOf } from '../../core/land.js';
import { does } from '../../core/does.js';
import { mountAdvisor } from './advisor.js';
import { WIKI } from '../../core/wiki.js';
import { throneGlyph } from './throne.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const TABS = [['build', 'Build'], ['raze', 'Raze']];
const KEY = 'realmstate.line.build';
const bname = (id) => store.rules.buildings.find((b) => b.building === id)?.name || id;
/** "10 Farms, 5 Homes and 2 Towers" */
/** A building's name, linking to its entry on the wiki's Buildings page (new tab). */
const wikiName = (d) => `<a class="bwiki" href="${WIKI}buildings.html#${encodeURIComponent(d.building)}" target="_blank" rel="noopener" title="${esc(d.name)} on the wiki (new tab)">${esc(d.name)}<span class="ext" aria-hidden="true">&#8599;</span><span class="vh"> (opens the wiki in a new tab)</span></a>`;
const listText = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function mountBuild(host, on) {
  let tab = 'build';
  try { if (localStorage.getItem(KEY) === 'raze') tab = 'raze'; } catch { /* storage off */ }
  host.innerHTML = `<div class="lpart lbuild${throneGlyph() ? ' glyph' : ''}">
    <p class="lead" id="lb-lead"></p>
    <div class="ltabs" role="tablist" aria-label="Build or raze">${TABS.map(([t, label]) =>
      `<button type="button" role="tab" id="lb-tab-${t}" aria-controls="lb-${t}" data-tab="${t}">${label}</button>`).join('')}</div>

    <div role="tabpanel" id="lb-build" aria-labelledby="lb-tab-build" data-panel="build">
      <!-- The order: what it will do, and Clear / Build, under the tabs; it stays in view (sticky) while you scroll the list. -->
      <div class="lb-bar">
        <p class="doing" id="lb-doing" aria-live="polite" hidden></p>
        <p class="done" id="lb-done" aria-live="polite" hidden></p>
        <span class="lb-btns"><button type="button" class="btn" id="lb-clear">Clear</button><button type="submit" form="lb-form" class="btn primary" id="lb-go">Build</button></span>
      </div>
      <form id="lb-form" novalidate>
        <div class="lb-groups" id="lb-rows"></div>
      </form>
      <h3 class="sub">Being built <span class="dim">the next 24 ticks; +1 finishes before the next tick</span></h3><div id="lb-uw"></div>
    </div>

    <div role="tabpanel" id="lb-raze" aria-labelledby="lb-tab-raze" data-panel="raze">
      <!-- The raze order: what it will do, then a confirm step before anything is torn down. -->
      <div class="lb-bar rz">
        <p class="doing" id="lb-rz-doing" aria-live="polite" hidden></p>
        <div class="confirm" id="lb-rz-confirm" hidden role="group" aria-labelledby="lb-rz-ask">
          <span id="lb-rz-ask"></span>
          <button type="button" class="btn danger" id="lb-rz-yes">Yes, raze them</button> <button type="button" class="btn" id="lb-rz-no">Cancel</button>
        </div>
        <span class="lb-btns"><button type="button" class="btn" id="lb-rz-clear">Clear</button><button type="button" class="btn danger" id="lb-rz-go">Raze…</button></span>
      </div>
      <p class="what">Razing tears buildings down; you can then build something new in its stead. Buildings under construction cannot be razed.</p>
      <div class="lb-groups" id="lb-rz-rows"></div>
      <p class="dim small" id="lb-rz-info"></p>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#lb-${id}`);
  const advisor = mountAdvisor(host.querySelector('.lbuild'), 'build');
  const tbody = $('rows');

  // ---------- tabs (the ARIA tabs pattern: ←/→, Home, End) ----------
  function showTab(t, focus = false) {
    tab = t;
    try { localStorage.setItem(KEY, t); } catch { /* storage off */ }
    host.querySelectorAll('[role=tab]').forEach((b) => { const on2 = b.dataset.tab === t; b.setAttribute('aria-selected', String(on2)); b.tabIndex = on2 ? 0 : -1; });
    // Switching tabs keeps your place on the page (no jump back to the top).
    const main = host.closest('.line-main'), y = main?.scrollTop;
    host.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    host.querySelector('.lbuild').dataset.tab = t;   // line.css tints the page red while razing
    if (main && y != null) main.scrollTop = y;
    if (focus) $(`tab-${t}`).focus({ preventScroll: true });
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
    // The price most buildings share, said once; rows show only what a building needs beyond it.
    const golds = Object.values(h.prices?.build?.buildings || {}).map((b) => b.gold);
    const base = golds.length ? Math.min(...golds) : null;
    $('lead').innerHTML = `You have <b>${fmt(h.barren)}</b> barren acre${h.barren === 1 ? '' : 's'} to build on, of ${fmt(h.land)}.`
      + (base != null ? ` Each building costs <b>${fmt(base)} gold</b>; a few also need additional materials.` : '')
      + (h.barren ? '' : ' Explore for more on the <a href="#land">Land</a> page, or raze buildings you don\'t need.');
  }
  /** The rows, once (the buildings come from /rules); fillRows() keeps their figures current without touching the inputs. */
  function makeRows() {
    // Grouped by purpose: a small table each, flowing into two columns where there's room (line.css).
    const groups = groupsOf();
    tbody.innerHTML = groups.map(([g, ds]) => `<section class="lb-grp"><h3 class="sub">${esc(g)}</h3><table class="tbl lb-tbl">
      <colgroup><col class="c-name"><col class="c-does"><col class="c-own"><col class="c-pct"><col class="c-n"><col class="c-max"><col class="c-cost"></colgroup>
      <thead><tr><th>Building</th><th title="What it gives you now; point at a building's name for what the next 1% of your land in it would add">Benefits</th><th class="num">Owned</th><th class="num" title="Its share of your acres">Share</th><th class="num">Count</th><th></th><th class="num">Cost</th></tr></thead><tbody>` + ds.map((d, k) => {
      const id = esc(d.building);
      return `<tr data-row="${id}"${k % 2 ? ' class="alt"' : ''}><th scope="row">${wikiName(d)}<span class="dim small" data-cap></span></th>
        <td class="does small" title="${esc(d.description)}" data-does></td>
        <td class="num" data-own></td><td class="num pct" data-pct></td>
        <td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-b="${id}" aria-label="${esc(d.name)} to build"></td>
        <td class="acts"><button type="button" class="btn mini" data-max="${id}" aria-label="Most ${esc(d.name)} you can build with what the other rows leave">MAX</button><button type="button" class="x" data-x="${id}" aria-label="Clear ${esc(d.name)}" title="Clear this row">×</button></td>
        <td class="num cost" data-cost="${id}"></td></tr>`;
    }).join('') + '</tbody></table></section>').join('');
  }
  function fillRows() {
    const h = store.house, exact = price.have();
    for (const d of store.rules.buildings) {
      const id = d.building, tr = tbody.querySelector(`tr[data-row="${CSS.escape(id)}"]`);
      if (!tr) continue;
      const p = price.buildingPrice(id), x = does(id, h), k = h.constructing[id] || 0;
      tr.querySelector('[data-cap]').textContent = p?.max_count ? ` (Max ${fmt(p.max_count)})` : '';
      // What it needs beyond the shared price (said once above): extra gold, and materials.
      const golds = Object.values(h.prices?.build?.buildings || {}).map((b) => b.gold), base = golds.length ? Math.min(...golds) : 0;
      const needs = p ? [p.gold > base ? `+${fmt(p.gold - base)} gold` : '', matText(p.materials)].filter(Boolean).join(', ') : `≈${fmt(act.estimate.build(id, 1))} gold each`;
      // What it gives now (nothing yet: a muted dash); pointing at the name swaps in what the next 1% of land would add.
      const now = x ? x.now.map((y) => y.short).join(' · ') : '';
      const next = x ? x.more.map((y) => y.short).join(' · ') : '';
      const cell = tr.querySelector('[data-does]');
      // Both in one place (stacked), so the row is as tall as the longer and doesn't move when they swap.
      cell.innerHTML = (x ? `<span class="bn"><span class="bn-now">${now ? esc(now) : '<span class="nil" aria-label="nothing yet">–</span>'}</span>`
        + `<span class="bn-next" aria-hidden="true"><b>Next 1%${x.extra ? ` (+${fmt(x.extra)})` : ''}:</b> ${esc(next || 'no change')}</span></span>` : esc(d.description))
        + (needs ? `<span class="needs">needs ${esc(needs)}</span>` : '');
      // Its share of your acres.
      tr.querySelector('[data-pct]').textContent = h.land ? `${(((h.buildings[id] || 0) * 100) / h.land).toFixed(1)}%` : '';
      cell.title = `${x ? `+1% land: ${x.more.map((y) => y.short).join(' · ') || 'no change'}\n\n` : ''}${d.description}`;
      // Owned, and (+n) while n more are being built.
      tr.querySelector('[data-own]').innerHTML = `${fmt(h.buildings[id] || 0)}${k ? ` <span class="bld" title="${fmt(k)} being built">+${fmt(k)}</span>` : ''}`;
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
    doing.hidden = !rows.length;   // nothing entered: no sentence, just the buttons
    if (!rows.length) { doing.textContent = ''; doing.classList.remove('short'); return; }
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
    const x = ev.target.closest('[data-x]');
    if (x) { const i = tbody.querySelector(`input[data-b="${CSS.escape(x.dataset.x)}"]`); i.value = ''; $('done').hidden = true; totals(); i.focus(); return; }
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

  // ---------- raze: the same groups, smaller (no bonuses): owned, a count to raze, Max, and the gold it costs ----------
  const rz = $('rz-rows');
  function makeRazeRows() {
    rz.innerHTML = groupsOf().map(([g, ds]) => `<section class="lb-grp"><h3 class="sub">${esc(g)}</h3><table class="tbl lb-tbl rz-tbl">
      <colgroup><col class="c-name"><col class="c-own"><col class="c-n"><col class="c-max"><col class="c-cost"></colgroup>
      <thead><tr><th>Building</th><th class="num">Owned</th><th class="num">Raze</th><th></th><th class="num">Cost</th></tr></thead><tbody>`
      + ds.map((d, k) => `<tr data-rz="${esc(d.building)}"${k % 2 ? ' class="alt"' : ''}><th scope="row">${wikiName(d)}</th><td class="num" data-own></td>
        <td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-r="${esc(d.building)}" aria-label="${esc(d.name)} to raze"></td>
        <td class="acts"><button type="button" class="btn mini" data-rzmax="${esc(d.building)}" aria-label="All the ${esc(d.name)} you can raze with the gold the other rows leave">MAX</button><button type="button" class="x" data-x="${esc(d.building)}" aria-label="Clear ${esc(d.name)}" title="Clear this row">×</button></td>
        <td class="num cost" data-rzcost="${esc(d.building)}"></td></tr>`).join('') + '</tbody></table></section>').join('');
  }
  const rzInputs = () => [...rz.querySelectorAll('input[data-r]')];
  const rzOrder = () => rzInputs().map((i) => ({ id: i.dataset.r, n: n0(i.value) })).filter((r) => r.n);
  /** Owned per row (a row with none can't be razed), each row's cost, then the whole order as a sentence. */
  function raze() {
    const h = store.house, P = store.rules.params, each = razeEach(h);
    for (const i of rzInputs()) {
      const id = i.dataset.r, own = h.buildings[id] || 0, n = n0(i.value), tr = i.closest('tr');
      tr.querySelector('[data-own]').textContent = fmt(own);
      i.disabled = !own; tr.querySelector('[data-rzmax]').disabled = !own; tr.classList.toggle('none', !own);
      if (!own && i.value) i.value = '';
      const cell = rz.querySelector(`[data-rzcost="${CSS.escape(id)}"]`);
      cell.textContent = n ? `${fmt(n * each)} gold` : '';
      cell.classList.toggle('short', n > own);
      tr.classList.toggle('on', n > 0);
    }
    const order = rzOrder(), doing = $('rz-doing');
    const acres = order.reduce((a, r) => a + r.n, 0), gold = acres * each;
    const over = order.find((r) => r.n > (h.buildings[r.id] || 0));
    const why = over ? `you have ${fmt(h.buildings[over.id] || 0)} ${bname(over.id)}` : gold > h.gold ? `that needs ${fmt(gold)} gold; you have ${fmt(h.gold)}` : '';
    doing.hidden = !order.length;
    doing.textContent = order.length ? `You will raze ${listText(order.map((r) => `${fmt(r.n)} ${bname(r.id)}`))} for ${fmt(gold)} gold (${fmt(each)} each). ${fmt(acres)} acre${acres === 1 ? '' : 's'} turn barren at once.${why ? ` Can't: ${why}.` : ''}` : '';
    doing.classList.toggle('short', !!why);
    $('rz-go').disabled = !order.length || !!why;
    $('rz-info').textContent = `Razing costs ${fmt(each)} gold a building: ${fmt(P.raze_cost_base)} plus ${P.raze_cost_per_land_milli / 1000} for each of your ${fmt(h.land)} acres.`;
  }
  const ask = (open) => {
    $('rz-confirm').hidden = !open;
    $('rz-doing').classList.toggle('vh', open);
    if (open) {
      const order = rzOrder(), n = order.reduce((a, r) => a + r.n, 0);
      $('rz-ask').textContent = `Raze ${listText(order.map((r) => `${fmt(r.n)} ${bname(r.id)}`))} for ${fmt(n * razeEach())} gold? They're gone for good.`;
      $('rz-yes').focus();
    }
  };
  on(rz, 'input', () => { ask(false); raze(); });
  on(rz, 'click', (ev) => {
    const x = ev.target.closest('[data-x]');
    if (x) { const i = rz.querySelector(`input[data-r="${CSS.escape(x.dataset.x)}"]`); i.value = ''; ask(false); raze(); i.focus(); return; }
    const b = ev.target.closest('[data-rzmax]');
    if (!b) return;
    // All you own of it, as far as the gold the other rows leave will go.
    const id = b.dataset.rzmax, h = store.house, each = Math.max(1, razeEach(h));
    const others = rzOrder().filter((r) => r.id !== id).reduce((a, r) => a + r.n, 0);
    const n = Math.max(0, Math.min(h.buildings[id] || 0, Math.floor(h.gold / each) - others));
    const inp = rz.querySelector(`input[data-r="${CSS.escape(id)}"]`);
    inp.value = n ? String(n) : '';
    ask(false); raze(); inp.focus();
  });
  on($('rz-clear'), 'click', () => { rzInputs().forEach((i) => { i.value = ''; }); ask(false); raze(); });
  on($('rz-go'), 'click', () => { if (!$('rz-go').disabled) ask(true); });
  on($('rz-no'), 'click', () => { ask(false); $('rz-go').focus(); });
  on($('rz-confirm'), 'keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); ask(false); $('rz-go').focus(); } });
  on($('rz-yes'), 'click', async () => {
    const order = rzOrder();
    ask(false);
    for (const r of order) {
      if (await act.raze(r.id, r.n, { button: $('rz-go') })) { const i = rz.querySelector(`input[data-r="${CSS.escape(r.id)}"]`); if (i) i.value = ''; }
    }
    raze();
    $('rz-go').focus();
  });

  /** Being built: a row per building, a column per tick (+1 to +24, then later), each count where it finishes. */
  let shownTicks = '';
  function timeline() {
    const b = buildByTick(24), key = JSON.stringify([b.rows, store.tick]);
    if (key === shownTicks) return;
    shownTicks = key;
    const late = b.rows.some((r) => r.later);
    const head = b.ends.map((t, k) => `<th scope="col" class="num" title="Tick ${fmt(store.tick + k + 1)}, ${esc(when(t))}">+${k + 1}</th>`).join('') + (late ? '<th scope="col" class="num">later</th>' : '');
    const cells = (r) => r.ticks.map((v) => `<td class="num${v ? ' on' : ''}">${v ? fmt(v) : ''}</td>`).join('') + (late ? `<td class="num${r.later ? ' on' : ''}">${r.later ? fmt(r.later) : ''}</td>` : '');
    // Nothing under way: one empty row, so the grid keeps its shape.
    const rows = b.rows.length ? b.rows.map((r) => `<tr><th scope="row">${esc(bname(r.id))}</th>${cells(r)}</tr>`).join('')
      : `<tr><th scope="row"><span class="vh">Nothing being built</span></th>${cells({ ticks: Array(24).fill(0), later: 0 })}</tr>`;
    $('uw').innerHTML = `<div class="scrollx"><table class="tbl ticks nocards"><thead><tr><th scope="col">Ticks from now</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
      + tickList(b.rows.map((r) => ({ name: bname(r.id), ticks: r.ticks, later: r.later })), b.ends, 'Nothing being built.');
  }
  function draw() {
    lead(); fillRows(); raze();
    timeline();
  }
  showTab(tab);
  makeRows();
  makeRazeRows();
  draw();
  return {
    update(c) { if (c?.has('rules')) { makeRows(); makeRazeRows(); } if (!c || c.has('house') || c.has('rules')) { draw(); advisor.update(); } },
    tick() { timeline(); },
    destroy() { host.replaceChildren(); },
  };
}
