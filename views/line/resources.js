// Straightline's Resources: what you hold and how it moves, in grouped tables flowing into columns as Throne's do.
// The figures are the War Room's (views/room/trend.js: the change over the last tick, the mean of the last 12,
// each row's history); a row opens the same graph as the Holdings panel.
import { store } from '../../core/store.js';
import { fmt, esc } from '../../core/words.js';
import { WIKI } from '../../core/wiki.js';
import { throneGlyph } from './throne.js';
import { jobs } from '../../core/military.js';
import * as trend from '../../core/trend.js';
import { mountGraph } from './graph.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
/** The mark on a row with a graph: a small line chart, drawn in the text colour (line.css fades it). */
const CHART = '<svg class="chart" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 1.5v13h13" fill="none" stroke="currentColor" stroke-width="1.4"/><polyline points="4,11 7,7 9.5,9 13.5,3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** The groups, in reading order: [title, [[key, label, held now (null: the latest level from the reports)]]]. */
function groups(h) {
  return [
    ['Treasury', [['gold', 'Gold', h.gold], ['food', 'Food', h.food], ['books', 'Books', null], ['renown', 'Renown', h.renown]]],
    ['Land', [['land', 'Land', h.land], ['incoming_land', 'Land coming in', h.incoming_land]]],
    ['People', [['peasants', 'Peasants', h.peasants], ['soldiers', 'Soldiers', h.units[0]], ['troops', 'Troops at home, all units', sum(h.units)]]],
    ['Materials', Object.keys(h.materials).map((m) => [m, cap(m), h.materials[m]])],
    ['Stables and stores', [['horses', 'Horses', h.horses], ['chariots', 'Chariots', h.chariots], ['aether', 'Aether', h.aether || 0], ['adepts', 'Adepts', h.adepts || 0]]],
  ];
}

export function mountResources(host, on) {
  // Throne's layout (line.css): the page's full width, tables flowing into up to three columns, each kept whole.
  host.innerHTML = `<div class="throne res2${throneGlyph() ? ' glyph' : ''}"><div class="tgrid"></div><p class="dim small note" id="l-res-note"></p>
    <section class="res-refine" id="l-ref" hidden><h3 class="sub">Refine <span class="dim">turn raw materials into refined ones, at once</span></h3>
      <table class="tbl"><thead><tr><th>Make</th><th>Recipe</th><th class="num">Times</th><th></th><th>Uses and makes</th><th></th></tr></thead><tbody id="l-ref-rows"></tbody></table></section></div>`;
  const graph = mountGraph(host);
  const grid = host.querySelector('.tgrid');

  function render() {
    const h = store.house;
    if (!h) return;
    let out = '';
    for (const [title, rows] of groups(h)) {
      // Materials links to the wiki's materials page (new tab): not everyone remembers what each is for.
      const wiki = title === 'Materials' ? ` <a class="wiki" href="${WIKI}materials.html" target="_blank" rel="noopener" title="What each material is for (wiki, new tab)">&#8599;<span class="vh">What each material is for: opens the wiki in a new tab</span></a>` : '';
      out += `<section class="tcard"><h3 class="sub">${esc(title)}${wiki}</h3><table class="tbl kv res">
        <tr><th>Item</th><th class="num">Held</th><th class="num" title="Change over the last tick">Last tick</th><th class="num" title="Mean change over the last 12 ticks">Avg 12</th></tr>
        ${rows.map(([k, label, held]) => {
          const v = held ?? trend.latestLevel(k);
          const d = trend.lastDelta(k), a = trend.avgDelta(k);
          const hist = trend.series(k).length > 1;
          return `<tr${hist ? ` data-graph="${esc(k)}" tabindex="0" title="Select for its graph"` : ''}><th scope="row">${esc(label)}${hist ? CHART : ''}</th>
            <td class="num">${v == null ? '<span class="dim">·</span>' : fmt(v)}</td>
            <td class="num ${trend.tone(d)}">${trend.signed(d)}</td><td class="num ${trend.tone(a)}">${trend.signed(a)}</td></tr>`;
        }).join('')}</table></section>`;
    }
    grid.innerHTML = out;
    host.querySelector('#l-res-note').textContent = store.ticks.length
      ? `From the last ${fmt(store.ticks.length)} tick reports. Select a row for its graph.` : 'Changes appear after the first tick.';
  }
  // ---------- refining (moved here from Military): one row per recipe ----------
  const refs = () => jobs().filter((j) => j.group === 'REFINE');
  const rows = host.querySelector('#l-ref-rows'), n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
  let shownRefs = '';
  function refine() {
    const list = refs(), key = list.map((j) => j.id + j.each).join('|');
    host.querySelector('#l-ref').hidden = !list.length;
    if (key !== shownRefs) {
      shownRefs = key;
      rows.innerHTML = list.map((j) => `<tr><th scope="row">${esc(j.label)}</th><td class="dim">${esc(j.each)}</td>
        <td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-job="${esc(j.id)}" aria-label="${esc(j.label)}: how many times"></td>
        <td><button type="button" class="btn mini" data-jmax="${esc(j.id)}"${j.noMax ? ' disabled' : ''} aria-label="Most ${esc(j.label)} you can make">MAX</button></td>
        <td class="cost" data-q="${esc(j.id)}"></td><td><button type="button" class="btn" data-make="${esc(j.id)}" disabled>Refine</button></td></tr>`).join('');
    }
    const byId = new Map(list.map((j) => [j.id, j]));
    for (const i of rows.querySelectorAll('input[data-job]')) {
      const j = byId.get(i.dataset.job), n = n0(i.value), q = n ? j.quote(n) : null, cell = rows.querySelector(`[data-q="${CSS.escape(j.id)}"]`);
      cell.textContent = q ? (q.why ? `Can't: ${q.why}` : q.text) : '';
      cell.title = q?.title || '';
      cell.classList.toggle('short', !!q?.short);
      rows.querySelector(`[data-make="${CSS.escape(j.id)}"]`).disabled = !n || !!q?.short;
    }
  }
  on(rows, 'input', refine);
  on(rows, 'click', async (ev) => {
    const mx = ev.target.closest('[data-jmax]'), mk = ev.target.closest('[data-make]');
    const job = (id) => refs().find((j) => j.id === id), inp = (id) => rows.querySelector(`input[data-job="${CSS.escape(id)}"]`);
    if (mx) { const [n] = job(mx.dataset.jmax).max(); inp(mx.dataset.jmax).value = n ? String(n) : ''; refine(); inp(mx.dataset.jmax).focus(); }
    if (mk) { const id = mk.dataset.make, n = n0(inp(id).value); if (n && await job(id).send(n, { button: mk })) inp(id).value = ''; refine(); }
  });

  const go = (row) => graph.open(row.dataset.graph, row.querySelector('th').firstChild.textContent.trim(), row);
  on(host, 'click', (ev) => { const r = ev.target.closest('tr[data-graph]'); if (r) go(r); });
  on(host, 'keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('tr[data-graph]')) { ev.preventDefault(); go(ev.target); } });
  render(); refine();
  return {
    update(c) { if (!c || c.has('house') || c.has('ticks')) { render(); refine(); graph.update(); } },
    tick() {},
    destroy() { graph.close(); host.replaceChildren(); },
  };
}
