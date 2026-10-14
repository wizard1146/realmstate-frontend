// Straightline's Rankings: houses (a top 100) and states (the age's standings), as tabs. At a glance: your place,
// your state's place, who leads. Houses: the top 100 by land, might or renown, of every race or one (/rankings?by=
// &race=); sorted by any of the three from its heading, # keeping each house's place in that top 100; find by name
// or address, your state's marked; Attack or Spy picks
// one as your target and opens that page (shown on the row under the pointer, or with focus). States: by name, score
// and what makes it; each opens on the State page. Each house shows its state's and realm's names (core/world.js).
// Both tables keep one line a row: at narrow widths their least-needed columns go first, the name last (fit.js).
// The column headings stay in view as the table scrolls (line.css).
import { store, setTarget, raceName } from '../../core/store.js';
import { api } from '../../core/api.js';
import { fmt, esc, addr, empty } from '../../core/words.js';
import { tabsHTML, panelAttrs, wireTabs } from './ltabs.js';
import { world, loadWorld, stateName, realmName } from '../../core/world.js';

const TABS = [['houses', 'Houses'], ['states', 'States']];
const BY = [['land', 'Land'], ['might', 'Might'], ['renown', 'Renown']];
const KEY = 'realmstate.line.ranks.houses';

export function mountRanks(host, on) {
  host.innerHTML = `<div class="lpart lranks">
    <dl class="st-glance rk-glance" id="lk-glance"></dl>
    ${tabsHTML(TABS, 'lk', 'Rankings')}
    <section ${panelAttrs('lk', 'houses')}>
      <div class="rk-tools">
        <span class="lbl" id="lk-byl">Top 100 by</span><span class="rk-by" role="radiogroup" aria-labelledby="lk-byl">${BY.map(([k, l]) =>
          `<label><input type="radio" name="lk-by" value="${k}"> ${l}</label>`).join('')}</span>
        <label for="lk-race">Race</label><select id="lk-race"><option value="">All races</option>${(store.rules?.races || []).filter((r) => r?.identity).map((r) =>
          `<option value="${esc(r.identity)}">${esc(r.name)}</option>`).join('')}</select>
        <label for="lk-find">Find</label><input id="lk-find" type="search" placeholder="a name or an address" autocomplete="off">
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
      + card('Leading state', st[0] ? esc(st[0].name || `${st[0].state.realm}:${st[0].state.state}`) : '–', st[0] ? `${st[0].state.realm}:${st[0].state.state} · score ${(st[0].score / 100).toFixed(1)}` : '');
  }
  // ---------- which top 100, and its order ----------
  // by: the top 100 asked for; race: '' for every race; sort: the column it's shown in order of (most first, or
  // least first when asked again). Kept in this browser.
  let pick = { by: 'land', race: '', sort: 'land', dir: -1 };
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && BY.some(([k]) => k === v.by)) pick = { ...pick, ...v }; } catch { /* storage off */ }
  if (pick.race && !(store.rules?.races || []).some((r) => r?.identity === pick.race)) pick.race = '';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pick)); } catch { /* storage off */ } };
  // The live list (land, every race) is the store's; any other is read here, again at most every 30 seconds.
  let other = { key: '', list: [], at: 0, byLandOnly: false };
  const keyOf = () => `${pick.by}|${pick.race}`;
  const plain = () => pick.by === 'land' && !pick.race;
  async function loadOther(force = false) {
    if (plain()) return;
    const k = keyOf();
    if (!force && other.key === k && Date.now() - other.at < 30000) return;
    try {
      const list = await api(`/rankings?by=${pick.by}${pick.race ? `&race=${encodeURIComponent(pick.race)}` : ''}`);
      if (k !== keyOf()) return;
      // An older server ignores ?by and sends the land order: say so rather than call it the top by might.
      const byLandOnly = pick.by !== 'land' && list.some((x, i) => i && x[pick.by] > list[i - 1][pick.by]);
      other = { key: k, list, at: Date.now(), byLandOnly };
    } catch (e) { other = { key: k, list: [], at: Date.now(), error: e.message }; }
    houses();
  }
  const current = () => (plain() ? store.rankings : other.key === keyOf() ? other.list : null);
  function controls() {
    host.querySelectorAll('input[name="lk-by"]').forEach((i) => { i.checked = i.value === pick.by; });
    $('race').value = pick.race;
  }
  on(host, 'change', (ev) => {
    if (ev.target.name === 'lk-by') { pick.by = ev.target.value; pick.sort = pick.by; pick.dir = -1; }
    else if (ev.target.id === 'lk-race') pick.race = ev.target.value;
    else return;
    save(); houses(); loadOther();
  });
  // A heading: sort by it (most first); again: least first.
  on($('houses'), 'click', (ev) => {
    const b = ev.target.closest('[data-sort]');
    if (!b) return;
    const k = b.dataset.sort;
    pick.dir = pick.sort === k ? -pick.dir : -1;
    pick.sort = k; save(); houses();
    $('houses').querySelector(`[data-sort="${k}"]`)?.focus();
  });

  function houses() {
    const h = store.house, q = $('find').value.trim().toLowerCase(), tgt = store.target?.id, list = current();
    const ours = (x) => x.realm === h.realm && x.state === h.state;
    if (!list) { $('houses').innerHTML = '<p class="dim">Loading the rankings…</p>'; $('hn').textContent = ''; return; }
    const rows = list.map((x, i) => ({ x, i })).filter(({ x }) => !q || x.name.toLowerCase().includes(q) || addr(x).startsWith(q.replace(/\s+/g, ':')))
      .sort((a, b) => (pick.sort === pick.by && pick.dir < 0 ? a.i - b.i : pick.dir * (a.x[pick.sort] - b.x[pick.sort]) || a.i - b.i));
    const whose = pick.race ? `${raceName(pick.race)} ` : '';
    $('hn').textContent = other.byLandOnly && !plain() ? 'This game server ranks by land only: shown by land.'
      : q ? `${fmt(rows.length)} found` : `the top ${fmt(list.length)} ${whose}by ${pick.by}`;
    // The column it's sorted by, and the one the top 100 is by, never go for room; with one race, Race goes first.
    const keep = (k, pri) => (k === pick.sort || k === pick.by ? 0 : pri);
    const head = (k, l, pri) => `<th class="num"${keep(k, pri) ? ` data-pri="${pri}"` : ''} aria-sort="${pick.sort === k ? (pick.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button type="button" class="rk-sort${pick.sort === k ? ' on' : ''}" data-sort="${k}" title="Sort by ${l.toLowerCase()}">${l}<span aria-hidden="true">${pick.sort === k ? (pick.dir < 0 ? ' ▾' : ' ▴') : ''}</span></button></th>`;
    $('houses').innerHTML = list.length ? `<table class="tbl rk-tbl rk-houses fit"><thead><tr><th class="num" title="Place in the top 100 by ${pick.by}">#</th><th>House</th><th data-pri="3">Address</th><th data-pri="2">State</th><th data-pri="4">Realm</th><th data-pri="${pick.race ? 9 : 6}">Race</th>${head('land', 'Land')}${head('might', 'Might', 5)}${head('renown', 'Renown', 7)}<th data-pri="3"><span class="vh">Target</span></th></tr></thead><tbody>
      ${rows.map(({ x, i }) => `<tr class="${x.id === h.id ? 'self' : ours(x) ? 'ours' : ''}${x.id === tgt ? ' tgt' : ''}"><td class="num dim">${i + 1}</td>
        <th scope="row" class="fx-last" title="${esc(x.name)}">${esc(x.name)}${x.protected ? ' <span class="rk-flag" title="Under protection: it can\'t be attacked yet">protected</span>' : ''}</th>
        <td><a class="rk-addr" href="#state" data-open-state="${x.realm}:${x.state}" aria-label="State ${x.realm}:${x.state}, house ${addr(x)}">${addr(x)}</a></td>
        <td class="fx-clip" title="${esc(stateName(x.realm, x.state))}"><a href="#state" data-open-state="${x.realm}:${x.state}">${esc(stateName(x.realm, x.state))}</a></td><td class="fx-clip" title="${esc(realmName(x.realm))}">${esc(realmName(x.realm))}</td><td>${esc(raceName(x.race))}</td>
        <td class="num">${fmt(x.land)}</td><td class="num">${fmt(x.might)}</td><td class="num">${fmt(x.renown)}</td>
        <td class="acts">${ours(x) ? '' : `<button type="button" class="btn mini" data-go="attack" data-h="${x.id}" aria-label="Attack ${esc(x.name)}">Attack</button><button type="button" class="btn mini" data-go="intrigue" data-h="${x.id}" aria-label="Send spies to ${esc(x.name)}">Spy</button>`}</td></tr>`).join('')}
      </tbody></table>${rows.length ? '' : '<p class="dim">No house by that name or address in the rankings.</p>'}`
      : `<p class="dim">${esc(other.error && !plain() ? other.error : pick.race ? `No ${raceName(pick.race)} houses this age.` : store.rankingsLoaded ? empty.rankings : 'Loading the rankings…')}</p>`;
  }
  function states() {
    const h = store.house, a = store.age, st = standings();
    $('score').textContent = a ? `A state's score: ${a.scoring.land_bp / 100}% for its share of the world's land, ${a.scoring.might_bp / 100}% for its share of might, plus its war points.${a.ended ? ' The age has ended: the final standings.' : ''}` : '';
    $('states').innerHTML = st.length ? `<table class="tbl rk-tbl rk-states fit"><thead><tr><th class="num">#</th><th>State</th><th data-pri="4">Address</th><th data-pri="3">Realm</th><th class="num">Score</th><th class="num" data-pri="2">Land</th><th class="num" data-pri="5">Might</th><th class="num" data-pri="7">Renown</th><th class="num" data-pri="4">War points</th><th class="num" data-pri="6">Houses</th></tr></thead><tbody>
      ${st.map((x, i) => `<tr class="${x.state.realm === h.realm && x.state.state === h.state ? 'self' : ''}"><td class="num dim">${i + 1}</td>
        <th scope="row" class="fx-last" title="${esc(x.name || stateName(x.state.realm, x.state.state))}"><a href="#state" data-open-state="${x.state.realm}:${x.state.state}">${esc(x.name || stateName(x.state.realm, x.state.state))}</a></th>
        <td class="rk-addr">${x.state.realm}:${x.state.state}</td><td class="fx-clip" title="${esc(realmName(x.state.realm))}">${esc(realmName(x.state.realm))}</td><td class="num"><b>${(x.score / 100).toFixed(1)}</b></td>
        <td class="num">${fmt(x.land)}</td><td class="num">${fmt(x.might)}</td><td class="num">${fmt(x.renown ?? 0)}</td><td class="num">${fmt(x.war_points ?? 0)}</td><td class="num">${fmt(x.houses)}</td></tr>`).join('')}
      </tbody></table>` : `<p class="dim">${esc(empty.standings)}</p>`;
  }
  // Attack or Spy: that house becomes your target, and its page opens.
  on($('houses'), 'click', (ev) => {
    const b = ev.target.closest('[data-go]');
    if (!b) return;
    const x = (current() || []).find((r) => r.id === Number(b.dataset.h));
    if (!x) return;
    setTarget(x);
    location.hash = `#${b.dataset.go}`;
  });
  on($('find'), 'input', houses);

  function draw() { if (!store.house) return; glance(); houses(); states(); }
  // State and realm names: the world's, read once (they rarely change); the tables redraw when they come.
  if (!world.realms.size) loadWorld();
  controls();
  draw();
  loadOther();
  return {
    update(c) {
      if (!c || c.has('rankings') || c.has('age') || c.has('target') || c.has('house') || c.has('worldmap')) draw();
      if (c?.has('rankings')) loadOther();   // the ticks move the other lists too (at most every 30 s)
    },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
