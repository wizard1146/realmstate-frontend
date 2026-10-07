// Straightline's Resources: what you hold and how it moves, in grouped tables flowing into columns as Throne's do.
// The figures are the War Room's (views/room/trend.js: the change over the last tick, the mean of the last 12,
// each row's history); a row opens the same graph as the Holdings panel.
import { store } from '../../core/store.js';
import { fmt, esc } from '../../core/words.js';
import { WIKI } from '../../core/wiki.js';
import * as trend from '../room/trend.js';
import { mountGraph } from '../room/graph.js';

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
  host.innerHTML = `<div class="throne res2"><div class="tgrid"></div><p class="dim small note" id="l-res-note"></p></div>`;
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
  const go = (row) => graph.open(row.dataset.graph, row.querySelector('th').firstChild.textContent.trim(), row);
  on(host, 'click', (ev) => { const r = ev.target.closest('tr[data-graph]'); if (r) go(r); });
  on(host, 'keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('tr[data-graph]')) { ev.preventDefault(); go(ev.target); } });
  render();
  return {
    update(c) { if (!c || c.has('house') || c.has('ticks')) { render(); graph.update(); } },
    tick() {},
    destroy() { graph.close(); host.replaceChildren(); },
  };
}
