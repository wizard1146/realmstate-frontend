// Detail views: one large modal over the war room per pane, where the detail lives (the panes
// stay dense). A <dialog> opened with showModal(): focus stays inside, Esc closes, focus goes
// back where it was. Shift+Alt+1–8 opens one; Alt+1–8 switches while open.
import { store, raceOf, showTicks, say, slotUsed } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as price from '../../core/prices.js';
import * as pend from '../../core/pending.js';
import { fmt, esc, addr, when, newsLine, empty, UNIT_ORDER, isUpgrade, TRAINABLE, SOLDIER, fullTime, zoneLabel, tickLine } from '../../core/words.js';
import { mountChat } from './chatbox.js';
import { draftHTML, wireDraft, armed } from './draft.js';
import * as uw from './underway.js';
import { actDetail, pickTarget } from './orders.js';
import { doesCell } from './does.js';
import * as trend from './trend.js';
import { mountGraph } from './graph.js';
import { battleCard, isBattle } from './battle.js';
import { sciDetail } from './scidetail.js';
import { tabButtons, panelAttrs, wireTabs } from './tabs.js';
import { MIL_TAB } from './generals.js';
import { generalsDetail } from './gendetail.js';
import { hallDetail } from './hall.js';
import * as mk from './milacts.js';
import { razeHTML, wireRaze } from './raze.js';
import * as mkt from './market.js';
import { stateDetail } from './statedetail.js';

export const PANES = ['act', 'res', 'mil', 'news', 'chat', 'roster', 'rank', 'sci'];
const META = {
  act: ['ACT', 'orders in full'], res: ['RES', 'holdings in full'], mil: ['MIL', 'forces, generals, Hall of Deeds'],
  news: ['NEWS', 'full wire'], chat: ['CHAT', 'world, realm and state channels'], roster: ['STATE', 'members, leadership, treasury'], rank: ['RANK', 'houses and states'], sci: ['SCI', 'books, sciences, academics, Colloquium'],
};
const has = (c, ...k) => !c || k.some((x) => c.has(x));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const pctOf = (n, of) => `${(100 * n / Math.max(1, of)).toFixed(1)}%`;
const td = (v, cls = '') => `<td class="num${cls}${v ? '' : ' zero'}">${typeof v === 'number' ? fmt(v) : esc(v)}</td>`;
const table = (head, rows, cls = '') => `<div class="scrollx"><table class="tbl ${cls}"><tr>${head}</tr>${rows}</table></div>`;

// ---------- RES ----------
/** The DOES cell: what the building does now and with 1% more land (or, on an old server, its description). */
function doesTd(d) {
  const x = doesCell(d.building);
  return x ? `<td class="does small" title="${esc(x.title)}">${x.html}</td>` : `<td class="dim small wrap">${esc(d.description)}</td>`;
}
const res = {
  build(b, on, ctx) {
    const go = (row) => ctx.graph.open(row.dataset.graph, row.cells[0].textContent, row);
    on(b, 'click', (ev) => { const r = ev.target.closest('tr[data-graph]'); if (r) go(r); });
    on(b, 'keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('tr[data-graph]')) { ev.preventDefault(); go(ev.target); } });
    b.innerHTML = `<div class="acttabs seg2" role="tablist" aria-label="RES sections" id="d-res-tabs">${tabButtons(mkt.RES_TAB, 'd-res')}<span class="dim small">land, stock and buildings · buy and sell materials</span></div>
    <div ${panelAttrs(mkt.RES_TAB, 'd-res', 'holdings')}><div class="dgrid">
      <section class="wide"><h3 class="sub">UNDER WAY <span class="dim">land and construction</span></h3><div id="d-uw"></div></section>
      <section><h3 class="sub">LAND</h3><div class="land big" id="d-landbar" aria-hidden="true"></div><div id="d-land"></div></section>
      <section><h3 class="sub">RESOURCES</h3><div id="d-res"></div></section>
      <section class="wide"><h3 class="sub">BUILDINGS <span class="dim" id="d-eff"></span></h3><div id="d-bld"></div></section>
      <section><h3 class="sub">RAZE <span class="dim">tear buildings down to barren land</span></h3><div id="d-rz-box">${razeHTML()}</div></section>
    </div></div>
    <div ${panelAttrs(mkt.RES_TAB, 'd-res', 'market')}>${mkt.detailHTML()}</div>`;
    res.market = mkt.wireDetail(b.querySelector('#d-res-sec-market'), on);
    wireTabs(b.querySelector('#d-res-tabs'), b, on, mkt.RES_TAB, () => res.market.update());
    res.raze = wireRaze(b.querySelector('#d-rz-box'), b, on);
  },
  /** Holdings with the change over the last tick (/HR) and the mean of the last 12; a row opens its graph. */
  resources(b, h) {
    const box = b.querySelector('#d-res');
    const focused = box.contains(document.activeElement) ? document.activeElement.dataset.graph : null;
    const n = store.ticks.length;
    const rows = trend.resourceRows(h).map(([k, label, held]) => {
      const v = held ?? trend.latestLevel(k) ?? 0;
      const d = trend.lastDelta(k), a = trend.avgDelta(k);
      return `<tr class="graphable" tabindex="0" data-graph="${esc(k)}" aria-haspopup="dialog" title="Graph ${esc(label)} over the last ${n} ticks (Enter)"><td>${esc(label)}</td>${td(v)}`
        + `<td class="num ${trend.tone(d)}">${trend.signed(d)}</td><td class="num ${trend.tone(a)}">${trend.signed(a)}</td></tr>`;
    });
    const plain = [['Chariots', h.chariots], ['Aether', h.aether], ['Adepts', h.adepts]].map(([k, v]) => `<tr><td>${esc(k)}</td>${td(v)}<td></td><td></td></tr>`);
    box.innerHTML = table('<th>ITEM</th><th class="num">HELD</th><th class="num"><abbr title="Change over the last tick (one tick is an hour of game time)">/HR</abbr></th><th class="num"><abbr title="Mean change a tick over the last 12 ticks">AVG 12</abbr></th>', rows.join('') + plain.join(''))
      + `<p class="dim small">${n ? `From ${n} tick report${n === 1 ? '' : 's'}. Select a row for its graph.` : 'No tick reports yet: changes and graphs fill in as ticks pass.'}</p>`;
    if (focused) box.querySelector(`[data-graph="${CSS.escape(focused)}"]`)?.focus();
  },
  focus(b) { b.querySelector('#d-res-tabs [aria-selected=true]')?.focus(); },
  update(b, c) {
    res.market?.update(c);
    if (has(c, 'ticks') && !has(c, 'house') && store.house) res.resources(b, store.house);
    if (!has(c, 'house')) return;
    const h = store.house;
    b.querySelector('#d-uw').innerHTML = uw.html(['explore', 'build'], { full: true });
    const built = Object.values(h.buildings).reduce((a, x) => a + x, 0);
    const cons = Object.values(h.constructing).reduce((a, x) => a + x, 0);
    const byArmy = pend.list(['army']).reduce((a, x) => a + (x.land || 0), 0);
    b.querySelector('#d-landbar').innerHTML = `<span class="built" style="width:${pctOf(built, h.land)}"></span><span class="cons" style="width:${pctOf(cons, h.land)}"></span>`;
    b.querySelector('#d-land').innerHTML = table('<th>LAND</th><th class="num">ACRES</th><th class="num">% LAND</th>',
      [['Built', built], ['Under construction', cons], ['Barren', h.barren]].map(([k, v]) => `<tr><td>${k}</td>${td(v)}<td class="num dim">${pctOf(v, h.land)}</td></tr>`).join('')
      + `<tr class="sum"><td>Held</td>${td(h.land)}<td class="num dim">100%</td></tr>`
      + `<tr><td>Incoming, explored</td>${td(Math.max(0, h.incoming_land - byArmy))}<td></td></tr>`
      + `<tr><td>Incoming, with armies</td>${td(byArmy)}<td></td></tr>`
      + `<tr class="sum"><td>Held + incoming</td>${td(h.land + h.incoming_land)}<td></td></tr>`);
    res.resources(b, h);
    b.querySelector('#d-eff').textContent = `efficiency ${Math.round(h.efficiency_bp / 100)}% · base ${fmt(h.build_cost)} gold each`;
    const rows = store.rules.buildings.map((d) => {
      const n = h.buildings[d.building] || 0, k = h.constructing[d.building] || 0;
      const p = price.buildingPrice(d.building);
      const mats = p ? Object.entries(p.materials).map(([m, q]) => `${fmt(q)} ${m}`).join(', ') : d.materials.map((m) => `${m.per_building} ${m.material}`).join(', ');
      return `<tr><td class="name" title="${esc(d.description)}">${esc(d.name)}</td>${td(n)}${td(k ? `+${fmt(k)}` : 0)}<td class="num${n + k ? '' : ' zero'}">${pctOf(n + k, h.land)}</td>`
        + `<td class="num dim">${d.max_count ? fmt(d.max_count) : '·'}</td><td class="num dim">${p ? fmt(p.gold) : `≈${fmt(h.build_cost + d.extra_gold)}`}</td><td class="dim">${esc(mats) || '·'}</td>${doesTd(d)}<td>${n ? `<button type="button" class="btn mini" data-raze="${esc(d.building)}" aria-label="Raze ${esc(d.name)}">RAZE</button>` : ''}</td></tr>`;
    }).join('');
    b.querySelector('#d-bld').innerHTML = table('<th>BUILDING</th><th class="num">OWNED</th><th class="num">+BLD</th><th class="num">% LAND</th><th class="num">CAP</th><th class="num">GOLD EA</th><th>MATERIALS EA</th><th>DOES</th><th></th>', rows, 'wide-tbl');
    res.raze?.update();
  },
};

// ---------- MIL ----------
const mil = {
  build(b, on) {
    b.innerHTML = `<div class="acttabs seg2" role="tablist" aria-label="MIL sections" id="d-mil-tabs">${tabButtons(MIL_TAB, 'd-mil')}<span class="dim small">troops and draft · raise, command and keep generals · trade characters</span></div>
    <div ${panelAttrs(MIL_TAB, 'd-mil', 'forces')}><div class="dgrid">
      <section class="wide"><h3 class="sub">UNDER WAY <span class="dim">training, medics, armies coming home</span></h3><div id="d-uw"></div></section>
      <section class="wide"><h3 class="sub">UNITS <span class="dim">soldiers are drafted from peasants; train turns them into units</span></h3><div id="d-units"></div></section>
      <section><h3 class="sub">DRAFT <span class="dim">the share of your population kept under arms</span></h3><div id="d-draft"></div></section>
      <section><h3 class="sub">FORCES</h3><div id="d-forces"></div></section>
      <section class="wide"><h3 class="sub">WORKSHOP <span class="dim">train medics, upgrade troops, build chariots, refine materials</span></h3><div id="d-mk-box">${mk.detailHTML()}</div></section>
    </div></div>
    <div ${panelAttrs(MIL_TAB, 'd-mil', 'generals')}></div>
    <div ${panelAttrs(MIL_TAB, 'd-mil', 'hall')}></div>`;
    b.querySelector('#d-draft').innerHTML = draftHTML('d-dr', true);
    mil.draft = wireDraft(b.querySelector('#d-draft'), on, 'd-dr', true);
    mil.make = mk.wireDetail(b.querySelector('#d-mk-box'), on, say);
    mil.gen = generalsDetail(b.querySelector('#d-mil-sec-generals'), on);
    mil.hall = hallDetail(b.querySelector('#d-mil-sec-hall'), on);
    wireTabs(b.querySelector('#d-mil-tabs'), b, on, MIL_TAB);
  },
  focus(b) { b.querySelector('#d-mil-tabs [aria-selected=true]')?.focus(); },
  update(b, c) {
    mil.gen?.update(c);
    mil.hall?.update(c);
    if (has(c, 'market') && !has(c, 'house')) mil.make?.update();
    if (!has(c, 'house')) return;
    mil.make?.update();
    const h = store.house;
    const race = raceOf(h.race) || { units: [] };
    b.querySelector('#d-uw').innerHTML = uw.html(['train', 'medics', 'army'], { full: true });
    mil.draft?.update();
    const training = Array(10).fill(0);
    pend.list(['train']).forEach((x) => { training[x.slot] += x.count; });
    const awayArmies = Array(10).fill(0);
    pend.list(['army']).forEach((x) => (x.units || []).forEach((n, i) => { awayArmies[i] += n; }));
    const each = (i) => (price.have() ? `${fmt(price.trainCost(i, 1))} / ${fmt(price.trainCost(i, 1, true))}` : `≈${fmt(race.units[i].gold)}`);
    b.querySelector('#d-units').innerHTML = table('<th class="num">#</th><th>UNIT</th><th class="num">OFF</th><th class="num">DEF</th><th class="num">HOME</th><th class="num">AWAY</th><th class="num">TRAINING</th><th class="num">TOTAL</th><th class="num">OFF HOME</th><th class="num">DEF HOME</th><th class="num"><abbr title="Gold each: from soldiers / direct from peasants">GOLD EA S / D</abbr></th>',
      UNIT_ORDER.map((i) => [race.units[i], i]).filter(([u, i]) => u && slotUsed(race, i)).map(([u, i]) => `<tr class="${isUpgrade(i) ? 'upg' : ''}${i === SOLDIER ? ' sold' : ''}"><td class="num dim">${i}</td><td class="name">${isUpgrade(i) ? '<span class="sub-mark" aria-hidden="true">↳ </span>' : ''}${esc(u.name)}</td><td class="num dim">${u.off}</td><td class="num dim">${u.def}</td>${td(h.units[i])}${td(h.away[i])}${td(training[i])}${td(h.units[i] + h.away[i] + training[i])}${td(u.off * h.units[i])}${td(u.def * h.units[i])}<td class="num dim">${TRAINABLE.includes(i) ? each(i) : i === SOLDIER ? 'drafted' : 'upgrade'}</td></tr>`).join(''), 'wide-tbl');
    const offHome = race.units.reduce((a, u, i) => a + u.off * h.units[i], 0);
    const defHome = race.units.reduce((a, u, i) => a + u.def * h.units[i], 0);
    const offAll = race.units.reduce((a, u, i) => a + u.off * (h.units[i] + h.away[i]), 0);
    const medTrain = pend.list(['medics']).reduce((a, x) => a + x.count, 0);
    const a = armed(h);
    const lines = [['Soldiers home', h.units[SOLDIER]], ['Other troops home', h.units.reduce((s2, x, i) => s2 + (i === SOLDIER ? 0 : x), 0)], ['Troops away', h.away.reduce((s2, x) => s2 + x, 0)], ['In training', h.training],
      ['Under arms / population', `${fmt(a.armed)} / ${fmt(h.population)} (${a.pct.toFixed(1)}%)`],
      ['Medics home / away / training', `${fmt(h.medics)} / ${fmt(h.medics_away)} / ${fmt(medTrain)}`], ['Horses home / away', `${fmt(h.horses)} / ${fmt(h.horses_away)}`],
      ['Chariots home / away', `${fmt(h.chariots)} / ${fmt(h.chariots_away)}`], ['Generals', h.generals.length],
      ['Raw offense home', offHome], ['Raw offense incl. away', offAll], ['Raw defense home', defHome], ['Nerve', `${h.nerve_bp / 100}%`], ['Vigilance', `${(h.vigilance_bp || 0) / 100}%`], ['Might', h.might]];
    b.querySelector('#d-forces').innerHTML = table('<th>LINE</th><th class="num">VALUE</th>', lines.map(([k, v]) => `<tr><td>${esc(k)}</td>${td(v)}</tr>`).join(''));
  },
};

// ---------- NEWS ----------
/** News items and, if shown, tick reports, newest first: [{ at, n } | { at, tick }]. */
export function newsFeed(limit = 200) {
  const items = store.news.map((n) => ({ at: n.at || 0, n }));
  if (store.showTicks) for (const r of store.ticks) items.push({ at: r.at || 0, tick: r });
  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}
const news = {
  build(b, on) {
    b.innerHTML = `<div class="dtools"><label for="d-nf">Show</label> <select id="d-nf"></select>
      <label class="check"><input type="checkbox" id="d-nt"> Tick reports</label>
      <span class="dim" id="d-ncount"></span> <span class="dim" id="d-nzone"></span></div><ol class="tape roomy" id="d-news"></ol>`;
    on(b.querySelector('#d-nf'), 'input', () => news.update(b, null, true));
    on(b.querySelector('#d-nt'), 'change', (ev) => showTicks(ev.target.checked));
  },
  update(b, c, listOnly) {
    if (!has(c, 'news', 'ticks', 'timemode')) return;
    const sel = b.querySelector('#d-nf');
    b.querySelector('#d-nt').checked = !!store.showTicks;
    if (!listOnly) {
      const kinds = new Map();
      store.news.forEach((n) => kinds.set(n.type, (kinds.get(n.type) || 0) + 1));
      const v = sel.value || 'all';
      sel.innerHTML = `<option value="all">All news (${store.news.length})</option><option value="bad">Bad news only</option><option value="good">Good news only</option>`
        + (store.showTicks ? `<option value="ticks">Tick reports only (${store.ticks.length})</option>` : '')
        + [...kinds].sort().map(([k, n]) => `<option value="t:${esc(k)}">${esc(cap(k.replace(/_/g, ' ')))} (${n})</option>`).join('');
      sel.value = [...sel.options].some((o) => o.value === v) ? v : 'all';
    }
    const f = sel.value;
    const list = newsFeed(400).filter((x) => (x.tick ? f === 'all' || f === 'ticks'
      : f === 'all' || (f === 'bad' ? newsLine(x.n)[1] === 'bad' : f === 'good' ? newsLine(x.n)[1] === 'good' : `t:${x.n.type}` === f)));
    b.querySelector('#d-ncount').textContent = `${fmt(list.length)} shown`;
    b.querySelector('#d-nzone').textContent = `· times in ${zoneLabel()} (/time)`;
    b.querySelector('#d-news').innerHTML = list.length
      ? list.map((x) => {
        const time = `<time title="${x.at ? esc(fullTime(x.at)) : ''}">${x.at ? esc(when(x.at)) : ''}</time>`;
        if (x.tick) return `<li class="tk">${time}<span>${esc(tickLine(x.tick))}</span></li>`;
        if (isBattle(x.n)) return `<li class="battle">${time}${battleCard(x.n, true)}</li>`;
        const [t, tone] = newsLine(x.n);
        return `<li>${time}<span class="${tone === 'bad' ? 'bad' : ''}">${esc(t)}</span></li>`;
      }).join('')
      : `<li class="empty">${esc(store.news.length ? 'Nothing of that kind.' : empty.news)}</li>`;
  },
};

// ---------- CHAT ----------
const chat = {
  build(b, on) {
    b.innerHTML = '<div class="chat-d" id="d-cbox"></div>';
    chat.box = mountChat(b.querySelector('#d-cbox'), on, { p: 'd-c', roomy: true });
  },
  update(b, c) { chat.box?.update(c); },
  focus: () => chat.box?.focus(),
};

// ---------- STATE ----------
let stateInst = null;
const roster = {
  build(b, on) { stateInst = stateDetail(b, on); },
  update(b, c) { stateInst?.update(c); },
  focus: () => stateInst?.focus(),
};

// ---------- RANK ----------
const rank = {
  build(b, on, ctx) {
    b.innerHTML = `<div class="dgrid">
      <section class="wide"><h3 class="sub">HOUSES <span class="dim">top 100 by land</span></h3><div id="d-rh"></div></section>
      <section class="wide"><h3 class="sub">STATES <span class="dim" id="d-rs-n"></span></h3><div id="d-rs"></div></section>
    </div>`;
    on(b, 'click', (ev) => {
      const t = ev.target.closest('[data-tgt]');
      if (!t) return;
      const x = store.rankings.find((r) => r.id === Number(t.dataset.tgt));
      if (!x) return;
      pickTarget(x);
      ctx.goto('act');
      ctx.dialog.querySelector('#d-a-target')?.focus();
    });
  },
  update(b, c) {
    if (!has(c, 'rankings', 'target', 'age', 'house')) return;
    const h = store.house;
    const tgt = store.target?.id;
    const same = (x) => x.realm === h.realm && x.state === h.state;
    b.querySelector('#d-rh').innerHTML = table('<th class="num">#</th><th class="num">ADDR</th><th>HOUSE</th><th>RACE</th><th class="num">LAND</th><th class="num">MIGHT</th><th class="num">RENOWN</th><th>FLAGS</th><th></th>',
      store.rankings.length ? store.rankings.map((x, i) => `<tr class="${x.id === h.id ? 'self' : ''}${x.id === tgt ? ' tgt' : ''}"><td class="num dim">${i + 1}</td><td class="num">${addr(x)}</td><td class="name">${esc(x.name)}</td><td>${esc(x.race)}</td>${td(x.land)}${td(x.might)}${td(x.renown)}`
        + `<td>${x.protected ? '<span class="flag p" title="Under protection">P</span>' : ''}</td><td>${same(x) ? '' : `<button class="btn mini" data-tgt="${x.id}" aria-pressed="${x.id === tgt}" aria-label="Target ${esc(x.name)}">TGT</button>`}</td></tr>`).join('')
        : `<tr><td colspan="9" class="dim">${esc(store.rankingsLoaded ? empty.rankings : 'loading rankings…')}</td></tr>`, 'wide-tbl');
    const a = store.age;
    const rows = a ? (a.ended && a.result ? a.result.states : a.standings) : [];
    b.querySelector('#d-rs-n').textContent = a ? `score = ${a.scoring.land_bp / 100}% land share + ${a.scoring.might_bp / 100}% might share + war points` : '';
    b.querySelector('#d-rs').innerHTML = table('<th class="num">#</th><th class="num">STATE</th><th class="num">SCORE</th><th class="num">LAND</th><th class="num">MIGHT</th><th class="num">RENOWN</th><th class="num">WAR PTS</th><th class="num">HOUSES</th>',
      rows.length ? rows.map((x, i) => `<tr class="${x.state.realm === h.realm && x.state.state === h.state ? 'self' : ''}"><td class="num dim">${i + 1}</td><td class="num">${x.state.realm}:${x.state.state}</td><td class="num">${(x.score / 100).toFixed(1)}</td>${td(x.land)}${td(x.might)}${td(x.renown ?? 0)}${td(x.war_points ?? 0)}${td(x.houses)}</tr>`).join('')
        : `<tr><td colspan="8" class="dim">${esc(empty.standings)}</td></tr>`, 'wide-tbl');
  },
};

/**
 * Mounts the detail dialog into the war room. `on` registers listeners for unmount; `syncDraft`
 * copies the chat draft into the compact pane. Returns { open(pane), close(), isOpen(), update(changes), tick() }.
 */
export function mountDetail(root, on) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.id = 'r-dlg';
  dlg.setAttribute('aria-labelledby', 'r-dlg-title');
  dlg.innerHTML = `
    <header class="dlg-h">
      <h2 id="r-dlg-title"><span class="key"></span><span class="t"></span> <span class="dim"></span></h2>
      <nav class="dlg-tabs" aria-label="Detail views (Alt+1–8)">${PANES.map((p, i) => `<button type="button" data-goto="${p}" aria-pressed="false" title="Alt+${i + 1}">${i + 1} ${META[p][0]}</button>`).join('')}</nav>
      <button type="button" class="btn ghost mini" data-close aria-label="Close detail view (Esc)">ESC&nbsp;×</button>
    </header>
    <p class="dlg-msg status" id="r-dlg-msg" role="status" aria-live="polite"></p>
    <div class="dlg-b" id="r-dlg-b" tabindex="-1"></div>`;
  root.querySelector('.room').append(dlg);
  const body = dlg.querySelector('#r-dlg-b');
  let cur = null;
  let paneAc = null;
  let returnTo = null;
  let actInst = null;
  let sciInst = null;
  let actOpts = {};
  const graph = mountGraph(dlg);
  const ctx = { goto: (p) => show(p, true), dialog: dlg, graph };
  const impl = {
    res, mil, news, chat, roster, rank,
    sci: {
      build(b, pon) { sciInst = sciDetail(b, pon); },
      update(b, c) { if (!c || c.has('house') || c.has('colloquium') || c.has('ticks') || c.has('rules') || c.has('heirs')) sciInst?.update(); },
    },
    act: {
      build(b, pon) { actInst = actDetail(b, pon, { goto: ctx.goto, ...actOpts }); actOpts = {}; },
      update(b, c) { actInst?.update(c); },
      focus() { actInst?.focus(); },
    },
  };

  function show(name, focus) {
    graph.close();
    cur = name;
    paneAc?.abort();
    paneAc = new AbortController();
    const pon = (t, type, fn, o = {}) => t.addEventListener(type, fn, { signal: paneAc.signal, ...o });
    const [t, sub] = META[name];
    dlg.querySelector('.key').textContent = String(PANES.indexOf(name) + 1);
    dlg.querySelector('h2 .t').textContent = t;
    dlg.querySelector('h2 .dim').textContent = sub;
    dlg.querySelectorAll('[data-goto]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.goto === name)));
    dlg.dataset.pane = name;
    body.replaceChildren();
    body.scrollTop = 0;
    actInst = null;
    impl[name].build(body, pon, ctx);
    impl[name].update(body, null);
    const m = dlg.querySelector('#r-dlg-msg');
    m.textContent = store.msg.text;
    m.className = `dlg-msg status ${store.msg.tone || ''}`;
    if (focus) (impl[name].focus ? impl[name].focus(body) : body.focus());
  }
  /** Opens a pane's detail. opts (ACT only): { tab: 'orders'|'intrigue'|'rites', report: index }. */
  function open(name, opts = {}) {
    actOpts = name === 'act' ? opts : {};
    if (!dlg.open) {
      // Back to where you were; if nothing had focus, to the pane itself.
      const a = document.activeElement;
      returnTo = a && a !== document.body ? a : root.querySelector(`#r-p-${name}`);
      dlg.showModal();
    }
    show(name, true);
  }
  function close() { if (dlg.open) dlg.close(); }

  on(dlg, 'close', () => {
    paneAc?.abort();
    cur = null;
    actInst = null;
    body.replaceChildren();
    const back = returnTo && returnTo.isConnected ? returnTo : null;
    returnTo = null;
    back?.focus();
  });
  on(dlg, 'click', (ev) => {
    if (ev.target === dlg) return close(); // the backdrop
    if (ev.target.closest('[data-close]')) return close();
    const g = ev.target.closest('[data-goto]');
    if (g) show(g.dataset.goto, true);
    const x = ev.target.closest('[data-expand]');
    if (x && x.dataset.expand) show(x.dataset.expand, true);
  });

  return {
    open,
    close,
    isOpen: () => dlg.open,
    current: () => cur,
    update(c) {
      if (!cur || !store.house) return;
      // The page's message line is behind the modal (and inert), so the dialog keeps its own.
      if (!c || c.has('msg')) { const m = dlg.querySelector('#r-dlg-msg'); m.textContent = store.msg.text; m.className = `dlg-msg status ${store.msg.tone || ''}`; }
      impl[cur].update(body, c);
      if (!c || c.has('ticks')) graph.update();
    },
    tick() { if (cur) uw.tick(body); },
  };
}
