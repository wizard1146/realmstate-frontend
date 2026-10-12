// Straightline's Rankings: houses (the top 100 by land) and states (the age's standings), as tabs. At a glance: your
// place, your state's place, who leads. Houses: find by name or address, your state's marked; Attack or Spy picks
// one as your target and opens that page. States: score and what makes it; each opens on the State page.
import { store, setTarget } from '../../core/store.js';
import { fmt, esc, addr, empty } from '../../core/words.js';
import { tabsHTML, panelAttrs, wireTabs } from './ltabs.js';

const TABS = [['houses', 'Houses'], ['states', 'States']];

export function mountRanks(host, on) {
  host.innerHTML = `<div class="lpart lranks">
    <dl class="st-glance rk-glance" id="lk-glance"></dl>
    ${tabsHTML(TABS, 'lk', 'Rankings')}
    <section ${panelAttrs('lk', 'houses')}>
      <div class="rk-tools"><label for="lk-find">Find</label><input id="lk-find" type="search" placeholder="a name or an address" autocomplete="off">
        <span class="dim small" id="lk-hn"></span></div>
      <div id="lk-houses"></div>
    </section>
    <section ${panelAttrs('lk', 'states')}><p class="dim small" id="lk-score"></p><div id="lk-states"></div></section>
  </div>`;
  const $ = (id) => host.querySelector(`#lk-${id}`);
  wireTabs(host, on, { tabs: TABS, key: 'realmstate.line.ranks' });
  const standings = () => { const a = store.age; return a ? (a.ended && a.result ? a.result.states : a.standings) || [] : []; };

  function glance() {
    const h = store.house, list = store.rankings, st = standings();
    const me = list.findIndex((x) => x.id === h.id), sp = st.findIndex((x) => x.state.realm === h.realm && x.state.state === h.state);
    const card = (k, v, note) => `<div><dt>${k}</dt><dd>${v}</dd><dd class="rank"><span>${note}</span></dd></div>`;
    $('glance').innerHTML = card('Your house', me >= 0 ? `#${me + 1}` : '–', me >= 0 ? `by land, of ${fmt(list.length)} ranked` : `not in the top ${fmt(list.length)}`)
      + card('Your state', sp >= 0 ? `#${sp + 1}` : '–', sp >= 0 ? `of ${fmt(st.length)} states` : 'not ranked yet')
      + card('Largest house', list[0] ? esc(list[0].name) : '–', list[0] ? `${fmt(list[0].land)} acres` : '')
      + card('Leading state', st[0] ? `${st[0].state.realm}:${st[0].state.state}` : '–', st[0] ? `score ${(st[0].score / 100).toFixed(1)}` : '');
  }
  function houses() {
    const h = store.house, q = $('find').value.trim().toLowerCase(), tgt = store.target?.id;
    const ours = (x) => x.realm === h.realm && x.state === h.state;
    const rows = store.rankings.map((x, i) => ({ x, i })).filter(({ x }) => !q || x.name.toLowerCase().includes(q) || addr(x).startsWith(q.replace(/\s+/g, ':')));
    $('hn').textContent = q ? `${fmt(rows.length)} found` : `the top ${fmt(store.rankings.length)} by land`;
    $('houses').innerHTML = store.rankings.length ? `<table class="tbl rk-tbl"><thead><tr><th class="num">#</th><th>House</th><th>Address</th><th>Race</th><th class="num">Land</th><th class="num">Might</th><th class="num">Renown</th><th><span class="vh">Target</span></th></tr></thead><tbody>
      ${rows.map(({ x, i }) => `<tr class="${x.id === h.id ? 'self' : ours(x) ? 'ours' : ''}${x.id === tgt ? ' tgt' : ''}"><td class="num dim">${i + 1}</td>
        <th scope="row">${esc(x.name)}${x.protected ? ' <span class="rk-flag" title="Under protection: it can\'t be attacked yet">protected</span>' : ''}</th>
        <td><a href="#state" data-open-state="${x.realm}:${x.state}">${addr(x)}</a></td><td>${esc(x.race)}</td>
        <td class="num">${fmt(x.land)}</td><td class="num">${fmt(x.might)}</td><td class="num">${fmt(x.renown)}</td>
        <td class="acts">${ours(x) ? '' : `<button type="button" class="btn mini" data-go="attack" data-h="${x.id}" aria-label="Attack ${esc(x.name)}">Attack</button><button type="button" class="btn mini" data-go="intrigue" data-h="${x.id}" aria-label="Send spies to ${esc(x.name)}">Spy</button>`}</td></tr>`).join('')}
      </tbody></table>${rows.length ? '' : '<p class="dim">No house by that name or address in the rankings.</p>'}`
      : `<p class="dim">${esc(store.rankingsLoaded ? empty.rankings : 'Loading the rankings…')}</p>`;
  }
  function states() {
    const h = store.house, a = store.age, st = standings();
    $('score').textContent = a ? `A state's score: ${a.scoring.land_bp / 100}% for its share of the world's land, ${a.scoring.might_bp / 100}% for its share of might, plus its war points.${a.ended ? ' The age has ended: the final standings.' : ''}` : '';
    $('states').innerHTML = st.length ? `<table class="tbl rk-tbl"><thead><tr><th class="num">#</th><th>State</th><th class="num">Score</th><th class="num">Land</th><th class="num">Might</th><th class="num">Renown</th><th class="num">War points</th><th class="num">Houses</th></tr></thead><tbody>
      ${st.map((x, i) => `<tr class="${x.state.realm === h.realm && x.state.state === h.state ? 'self' : ''}"><td class="num dim">${i + 1}</td>
        <th scope="row"><a href="#state" data-open-state="${x.state.realm}:${x.state.state}">State ${x.state.realm}:${x.state.state}</a></th><td class="num"><b>${(x.score / 100).toFixed(1)}</b></td>
        <td class="num">${fmt(x.land)}</td><td class="num">${fmt(x.might)}</td><td class="num">${fmt(x.renown ?? 0)}</td><td class="num">${fmt(x.war_points ?? 0)}</td><td class="num">${fmt(x.houses)}</td></tr>`).join('')}
      </tbody></table>` : `<p class="dim">${esc(empty.standings)}</p>`;
  }
  // Attack or Spy: that house becomes your target, and its page opens.
  on($('houses'), 'click', (ev) => {
    const b = ev.target.closest('[data-go]');
    if (!b) return;
    const x = store.rankings.find((r) => r.id === Number(b.dataset.h));
    if (!x) return;
    setTarget(x);
    location.hash = `#${b.dataset.go}`;
  });
  on($('find'), 'input', houses);

  function draw() { if (!store.house) return; glance(); houses(); states(); }
  draw();
  return {
    update(c) { if (!c || c.has('rankings') || c.has('age') || c.has('target') || c.has('house')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
