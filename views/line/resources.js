// Straightline's Resources: what you hold and how it moves, in two columns of grouped tables (as Throne).
// The figures are the War Room's (views/room/trend.js: the change over the last tick, the mean of the last 12,
// each row's history); a row opens the same graph as the Holdings panel.
import { store } from '../../core/store.js';
import { fmt, esc } from '../../core/words.js';
import * as trend from '../room/trend.js';
import { mountGraph } from '../room/graph.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** The groups: [title, column, [[key, label, held now (null: the latest level from the reports)]]]. */
function groups(h) {
  return [
    ['Treasury', 1, [['gold', 'Gold', h.gold], ['food', 'Food', h.food], ['books', 'Books', null], ['renown', 'Renown', h.renown]]],
    ['People', 1, [['peasants', 'Peasants', h.peasants], ['soldiers', 'Soldiers', h.units[0]], ['troops', 'Troops at home, all units', sum(h.units)]]],
    ['Land', 1, [['land', 'Land', h.land], ['incoming_land', 'Land coming in', h.incoming_land]]],
    ['Materials', 2, Object.keys(h.materials).map((m) => [m, cap(m), h.materials[m]])],
    ['Stables and stores', 2, [['horses', 'Horses', h.horses], ['chariots', 'Chariots', h.chariots], ['aether', 'Aether', h.aether || 0], ['adepts', 'Adepts', h.adepts || 0]]],
  ];
}

export function mountResources(host, on) {
  host.innerHTML = `<div class="throne res2"><div class="col" data-col="1"></div><div class="col" data-col="2"></div></div>
    <p class="dim small note" id="l-res-note"></p>`;
  const graph = mountGraph(host);
  const cols = { 1: host.querySelector('[data-col="1"]'), 2: host.querySelector('[data-col="2"]') };

  function render() {
    const h = store.house;
    if (!h) return;
    const out = { 1: '', 2: '' };
    for (const [title, col, rows] of groups(h)) {
      out[col] += `<section><h3 class="sub">${esc(title)}</h3><table class="tbl kv res">
        <tr><th>Item</th><th class="num">Held</th><th class="num" title="Change over the last tick">Last tick</th><th class="num" title="Mean change over the last 12 ticks">Avg 12</th></tr>
        ${rows.map(([k, label, held]) => {
          const v = held ?? trend.latestLevel(k);
          const d = trend.lastDelta(k), a = trend.avgDelta(k);
          const hist = trend.series(k).length > 1;
          return `<tr${hist ? ` data-graph="${esc(k)}" tabindex="0" title="Select for its graph"` : ''}><th scope="row">${esc(label)}${hist ? ' <span class="dim" aria-hidden="true">↗</span>' : ''}</th>
            <td class="num">${v == null ? '<span class="dim">·</span>' : fmt(v)}</td>
            <td class="num ${trend.tone(d)}">${trend.signed(d)}</td><td class="num ${trend.tone(a)}">${trend.signed(a)}</td></tr>`;
        }).join('')}</table></section>`;
    }
    cols[1].innerHTML = out[1];
    cols[2].innerHTML = out[2];
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
