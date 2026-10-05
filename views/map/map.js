// Map view: the world as a hex map, with your house's panels sliding over it. Slate and brass.
// Reads the shared store and calls shared actions; owns only its DOM, the SVG map and its panels.
import {
  store, subscribe, say, setTarget, knownHouses, loadStateMembers, raceName, persName, unitNames,
  isProtected, countdown, findHouse, raceOf, trainableSlots,
} from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr, when, newsLine, intelRows, names, empty, TRAINABLE } from '../../core/words.js';
import { switchHTML } from '../../core/viewswitch.js';
import { WorldMap } from './worldmap.js';
import * as commands from '../../core/commands.js';
// War Room parts the map shows as they are, inside a .room-scope element (room.css styles them there):
// the three-channel chat box, and the War Room's detail view of every pane.
import { mountChat } from '../room/chatbox.js';
import { mountDetail, PANES } from '../room/detail.js';
import * as uw from '../room/underway.js';
import { attackSlots } from '../room/orders.js';
import * as price from '../../core/prices.js';

const INTEL = ['survey', 'muster', 'ledgers', 'archives', 'couriers', 'dossier'];
const MAX_LOADED_STATES = 21; // load every house of the states on screen when this many or fewer show
const SHEETS = ['house', 'target', 'news', 'chat', 'state', 'ranks'];
// The War Room's panes, opened in full over the map: [pane, label, glyph].
const FULL = [['act', 'Orders', '⚑'], ['res', 'Holdings', '⛁'], ['mil', 'Military', '⚔'], ['sci', 'Science', '✦'],
  ['news', 'News', '≡'], ['chat', 'Chat', '❝'], ['roster', 'State', '◇'], ['rank', 'Ranks', '▤']];

const TEMPLATE = (view) => `
<div class="mapview">
<svg id="m-map" class="map" role="group" aria-label="Map of the world: thirteen realms of seven states. Houses are marks sized by land." preserveAspectRatio="xMidYMid meet"></svg>

<header class="hud" id="m-hud">
  <div class="crest">
    <span class="brand"><span class="banner">Hegemoney:&nbsp;</span>Realmstate</span>
    <span class="who" id="m-who"></span>
  </div>
  <div class="tick">
    <span class="sc">Tick</span> <b id="m-tick" class="num">–</b>
    <span class="sep">·</span> <span class="sc">Next</span> <b id="m-next" class="num">–</b>
  </div>
  <dl class="stats" id="m-stats">
    <div><dt>Land</dt><dd data-k="land">–</dd></div>
    <div><dt>Peasants</dt><dd data-k="peasants">–</dd></div>
    <div><dt>Gold</dt><dd data-k="gold">–</dd></div>
    <div><dt>Food</dt><dd data-k="food">–</dd></div>
    <div><dt>Troops</dt><dd data-k="troops">–</dd></div>
    <div><dt>Might</dt><dd data-k="might">–</dd></div>
    <div><dt>Renown</dt><dd data-k="renown">–</dd></div>
  </dl>
  <div class="hud-end">
    ${switchHTML(view)}
    <span id="m-email" class="email"></span>
    <button id="m-logout" class="ghost small hud-out">Sign out</button>
  </div>
</header>

<div class="mapctl" role="toolbar" aria-label="Map view">
  <button id="m-zin" aria-label="Zoom in" title="Zoom in">+</button>
  <button id="m-zout" aria-label="Zoom out" title="Zoom out">−</button>
  <button id="m-zworld" class="word" title="Show the whole world">World</button>
  <button id="m-zrealm" class="word" title="Show your realm">Realm</button>
  <button id="m-zstate" class="word" title="Show your state">State</button>
</div>

<form id="m-goto" class="goto" autocomplete="off">
  <label for="m-goto-addr" class="sc">Find</label>
  <input id="m-goto-addr" name="addr" placeholder="realm:state:seat" inputmode="numeric" pattern="\\d+(:\\d+){0,2}" title="An address such as 1, 1:1 or 1:1:3">
  <button class="small">Go</button>
</form>

<nav class="dock" aria-label="Panels">
  <button data-sheet="house" aria-controls="m-sheet-house" aria-expanded="false"><span class="glyph" aria-hidden="true">◈</span>House</button>
  <button data-sheet="news" aria-controls="m-sheet-news" aria-expanded="false"><span class="glyph" aria-hidden="true">≡</span>News<span class="badge" id="m-badge-news" hidden></span></button>
  <button data-sheet="chat" aria-controls="m-sheet-chat" aria-expanded="false"><span class="glyph" aria-hidden="true">❝</span>Chat<span class="badge" id="m-badge-chat" hidden></span></button>
  <button data-sheet="state" aria-controls="m-sheet-state" aria-expanded="false"><span class="glyph" aria-hidden="true">◇</span>State</button>
  <button data-sheet="ranks" aria-controls="m-sheet-ranks" aria-expanded="false"><span class="glyph" aria-hidden="true">▤</span>Ranks</button>
</nav>
<nav class="dock dock-full" aria-label="War Room panels, in full">
  <span class="sc dock-label">In full</span>
  ${FULL.map(([p, label, g]) => `<button data-detail="${p}" title="Open the War Room's ${label} panel in full (Shift+Alt+${PANES.indexOf(p) + 1})"><span class="glyph" aria-hidden="true">${g}</span>${label}</button>`).join('')}
</nav>

<aside class="legend">
  <span aria-hidden="true"><i class="lg-mine"></i>your house</span>
  <span aria-hidden="true"><i class="lg-mate"></i>statemate</span>
  <span aria-hidden="true"><i class="lg-prot"></i>protected</span>
  <span aria-hidden="true"><i class="lg-war"></i>war</span>
  <p class="cover" id="m-cover"></p>
</aside>

<section class="sheet left" id="m-sheet-house" hidden aria-labelledby="m-h-house">
  <header class="sheet-head">
    <div><h2 id="m-h-house" class="sc">Your house</h2><p class="sub" id="m-house-sub"></p><p class="fulls"><button class="full" data-detail="res" title="Open Holdings in full">Holdings ↗</button><button class="full" data-detail="act" title="Open Orders in full">Orders ↗</button><button class="full" data-detail="mil" title="Open Military in full">Military ↗</button></p></div>
    <button class="close" data-close aria-label="Close house panel">×</button>
  </header>
  <div class="sheet-body">
    <div class="protect" id="m-protect"></div>
    <h3 class="sc">Under way</h3>
    <div class="room-scope uw-host"><div class="room"><div class="uw-box" id="m-uw"></div></div></div>
    <table class="facts" id="m-house-facts"></table>
    <h3 class="sc">Troops</h3>
    <table class="facts" id="m-house-troops"></table>

    <h3 class="sc">Orders</h3>
    <form id="m-f-explore" class="order">
      <label for="m-x-acres">Explore</label>
      <input id="m-x-acres" name="acres" type="number" min="1" max="1000" value="10" class="num">
      <span class="unit">acres</span>
      <button>Explore</button>
      <p class="hint" id="m-x-hint"></p>
    </form>
    <form id="m-f-build" class="order">
      <label for="m-b-kind">Build</label>
      <input id="m-b-count" name="count" type="number" min="1" value="10" class="num" aria-label="How many buildings">
      <select id="m-b-kind" name="building"></select>
      <button>Build</button>
      <p class="hint" id="m-b-hint"></p>
    </form>
    <form id="m-f-train" class="order">
      <label for="m-t-unit">Train</label>
      <input id="m-t-count" name="count" type="number" min="1" value="50" class="num" aria-label="How many to train">
      <select id="m-t-unit" name="unit"></select>
      <button>Train</button>
      <p class="hint" id="m-t-hint"></p>
    </form>
    <p class="hint">To attack or gather intel, choose a house on the map. More orders (many buildings at once, upgrades, rites) are in <button class="link" data-detail="act">Orders in full</button>.</p>
    <p class="row end"><button id="m-logout-2" class="ghost small">Sign out</button></p>
  </div>
</section>

<section class="sheet right" id="m-sheet-target" hidden aria-labelledby="m-h-target">
  <header class="sheet-head">
    <div><h2 id="m-h-target" class="sc">House</h2><p class="sub" id="m-target-sub"></p><p class="fulls"><button class="full" data-detail="act" data-tab="attacks" title="Open Attack in full">Attack ↗</button><button class="full" data-detail="act" data-tab="intrigue" title="Open Intrigue in full">Intrigue ↗</button></p></div>
    <button class="close" data-close aria-label="Close house facts">×</button>
  </header>
  <div class="sheet-body">
    <table class="facts" id="m-target-facts"></table>
    <div id="m-target-actions">
      <h3 class="sc">Attack</h3>
      <form id="m-f-attack" class="stack">
        <div class="row">
          <label for="m-a-target" class="sc">Target</label>
          <input id="m-a-target" name="target" required placeholder="realm:state:seat" pattern="\\s*\\d+\\s*:\\s*\\d+\\s*:\\s*\\d+\\s*" class="num addr" autocomplete="off">
        </div>
        <label for="m-a-kind" class="sc">Kind</label>
        <select id="m-a-kind" name="kind"></select>
        <p class="hint" id="m-a-kind-hint"></p>
        <fieldset class="send">
          <legend class="sc">Send</legend>
          <div id="m-a-units"></div>
        </fieldset>
        <button class="primary danger">Send the army</button>
      </form>
      <h3 class="sc">Intel</h3>
      <form id="m-f-intel" class="stack">
        <div class="row">
          <select id="m-i-op" name="op" aria-label="Operation"></select>
          <input id="m-i-thieves" name="thieves" type="number" min="1" value="10" class="num" aria-label="Thieves to send">
          <button>Send thieves</button>
        </div>
        <p class="hint" id="m-i-hint"></p>
      </form>
      <table class="facts report" id="m-intel" hidden></table>
    </div>
    <p class="hint" id="m-target-self" hidden>This is your house. Its orders are in the House panel.</p>
  </div>
</section>

<section class="sheet right" id="m-sheet-news" hidden aria-labelledby="m-h-news">
  <header class="sheet-head"><div><h2 id="m-h-news" class="sc">News</h2><p class="fulls"><button class="full" data-detail="news" title="Open All news in full">All news ↗</button></p></div><button class="close" data-close aria-label="Close news">×</button></header>
  <div class="sheet-body"><ol class="feed" id="m-news"></ol></div>
</section>

<section class="sheet right" id="m-sheet-chat" hidden aria-labelledby="m-h-chat">
  <header class="sheet-head"><div><h2 id="m-h-chat" class="sc">Chat</h2><p class="sub" id="m-chat-sub"></p></div><button class="close" data-close aria-label="Close chat">×</button></header>
  <div class="sheet-body chat-body room-scope"><div class="room"><div id="m-cbox"></div></div></div>
</section>

<section class="sheet right" id="m-sheet-state" hidden aria-labelledby="m-h-state">
  <header class="sheet-head"><div><h2 id="m-h-state" class="sc">Your state</h2><p class="sub" id="m-state-sub"></p><p class="fulls"><button class="full" data-detail="roster" title="Open Leadership, war, treasury in full">Leadership, war, treasury ↗</button></p></div><button class="close" data-close aria-label="Close state">×</button></header>
  <div class="sheet-body">
    <table class="list" id="m-members"><thead><tr><th class="r">Seat</th><th>House</th><th class="r">Land</th><th class="r">Might</th></tr></thead><tbody></tbody></table>
    <h3 class="sc">Wars</h3>
    <p id="m-wars-line" class="hint"></p>
  </div>
</section>

<section class="sheet right" id="m-sheet-ranks" hidden aria-labelledby="m-h-ranks">
  <header class="sheet-head"><div><h2 id="m-h-ranks" class="sc">Rankings</h2><p class="sub">Houses by land</p><p class="fulls"><button class="full" data-detail="rank" title="Open All rankings in full">All rankings ↗</button></p></div><button class="close" data-close aria-label="Close rankings">×</button></header>
  <div class="sheet-body">
    <table class="list" id="m-ranks"><thead><tr><th class="r">#</th><th>House</th><th class="r">Land</th><th class="r">Might</th><th class="r">Renown</th></tr></thead><tbody></tbody></table>
    <h3 class="sc">States</h3>
    <table class="list" id="m-standings"><thead><tr><th class="r">#</th><th>State</th><th class="r">Houses</th><th class="r">Land</th><th class="r">Score</th></tr></thead><tbody></tbody></table>
  </div>
</section>
<div class="room-scope" id="m-roomhost"><div class="room"></div></div>
</div>`;

export function mount(root) {
  root.innerHTML = TEMPLATE('map');
  const $ = (id) => root.querySelector(`#m-${id}`);
  const ac = new AbortController();
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { signal: ac.signal, ...opts });
  const narrow = () => matchMedia('(max-width: 760px)').matches;
  const P = store.rules.params;
  const unread = { news: 0 };
  let mapHouses = new Map();
  let cover = { loaded: 0 };

  // ---------- sheets ----------
  const sheet = (n) => $(`sheet-${n}`);
  const isOpen = (n) => sheet(n).classList.contains('open');
  const sideOf = (n) => (n === 'house' ? 'left' : 'right');
  function openSheet(name, { focus = true } = {}) {
    for (const other of SHEETS) {
      if (other === name) continue;
      if (matchMedia('(max-width: 1100px)').matches || sideOf(other) === sideOf(name)) closeSheet(other, true);
    }
    const el = sheet(name);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('open'));
    root.querySelectorAll(`[data-sheet="${name}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
    if (name === 'news') { unread.news = 0; badges(); }
    if (name === 'chat') requestAnimationFrame(() => chat.update());
    if (name === 'news') setTimeout(() => root.querySelectorAll('#m-news li.fresh').forEach((li) => li.classList.remove('fresh')), 3000);
    root.classList.toggle('sheet-open', narrow());
    if (focus) { const h = el.querySelector('h2'); h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  function closeSheet(name, quick) {
    const el = sheet(name);
    if (el.hidden) return;
    el.classList.remove('open');
    root.querySelectorAll(`[data-sheet="${name}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
    const done = () => { if (!el.classList.contains('open')) el.hidden = true; };
    if (quick || matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 260);
    if (name === 'target' && !quick) { setTarget(null); }
    setTimeout(() => root.classList.toggle('sheet-open', narrow() && SHEETS.some(isOpen)), 0);
  }
  function badges() {
    const n = { news: unread.news, chat: Object.values(store.unread || {}).reduce((a, b) => a + b, 0) };
    for (const k of ['news', 'chat']) {
      const b = $(`badge-${k}`);
      b.hidden = !n[k];
      b.textContent = n[k] > 9 ? '9+' : String(n[k]);
    }
  }

  // ---------- the map ----------
  const map = new WorldMap($('map'), {
    realms: P.realms, states: P.states_per_realm, seats: P.houses_per_state,
    onHouse: (h) => showTarget(h),
    onState: (r, s) => focusState(r, s),
    onView: (keys) => loadVisible(keys),
  });

  /** Load every house of the states on screen, when zoomed in to a realm or closer. */
  function loadVisible(keys) {
    const occupied = store.age ? new Set(store.age.standings.filter((x) => x.houses > 0).map((x) => `${x.state.realm}:${x.state.state}`)) : null;
    const near = keys.length <= MAX_LOADED_STATES;
    const want = near ? keys.filter((k) => !occupied || occupied.has(k)) : [];
    store.visibleStates = new Set(want);
    cover = { near, loaded: want.length };
    renderCover();
    for (const k of want) { const [r, s] = k.split(':').map(Number); loadStateMembers(r, s).catch(() => {}); }
  }
  function renderCover() {
    $('cover').textContent = cover.near
      ? `Marks: every house in the ${cover.loaded} occupied state${cover.loaded === 1 ? '' : 's'} on screen, plus the top houses by land elsewhere.`
      : 'Marks: the top houses by land, plus your state. Zoom in to a realm to see every house there.';
  }
  function drawHouses() {
    mapHouses = knownHouses();
    map.setHouses([...mapHouses.values()]);
  }
  function focusState(r, s) { map.showState(r, s); }

  // ---------- HUD and your house ----------
  function hudStats(h) {
    const troops = h.units.reduce((a, b) => a + b, 0) + h.away.reduce((a, b) => a + b, 0);
    const vals = { land: h.land, peasants: h.peasants, gold: h.gold, food: h.food, troops, might: h.might, renown: h.renown };
    root.querySelectorAll('#m-stats dd').forEach((dd) => {
      const txt = fmt(vals[dd.dataset.k]);
      if (dd.textContent !== txt && dd.textContent !== '–') { dd.classList.remove('flash'); void dd.offsetWidth; dd.classList.add('flash'); }
      dd.textContent = txt;
    });
  }

  function renderHouse() {
    const h = store.house;
    if (!h) return;
    $('who').innerHTML = `${esc(h.name)}<span class="addr">${addr(h)}</span>`;
    $('email').textContent = store.me ? store.me.email : '';
    $('logout').title = store.me ? `Signed in as ${store.me.email}` : '';
    hudStats(h);
    $('house-sub').textContent = `${addr(h)} · ${raceName(h.race)}, ${persName(h.personality)}`;
    $('h-house').textContent = h.name;

    const prot = isProtected(h);
    const p = $('protect');
    const pk = `${prot}:${h.protected_until}:${h.ticks_now}`;
    if (p.dataset.k !== pk) {
      p.dataset.k = pk;
      p.className = `protect${prot ? ' on' : ''}`;
      p.innerHTML = prot
        ? `<span><b>Protected</b> until tick ${h.protected_until} (${h.protected_until - h.ticks_now} ticks left). No one can attack you; you can't attack.</span><button id="m-leave-prot" class="small">Leave protection</button>`
        : '<span><b>Unprotected.</b> Your house can attack and be attacked.</span>';
      if (prot) {
        const b = $('leave-prot');
        b.onclick = () => {
          if (b.dataset.armed) { act.leaveProtection({ button: b }); return; }
          b.dataset.armed = '1'; b.textContent = 'Confirm: leave for good';
          b.classList.add('danger');
          setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Leave protection'; b.classList.remove('danger'); } }, 5000);
        };
      }
    }

    const rows = [
      ['Land', `${fmt(h.land)} acres${h.incoming_land ? ` (+${fmt(h.incoming_land)} coming)` : ''}`],
      ['Barren', fmt(h.barren)], ['Peasants', fmt(h.peasants)], ['Gold', fmt(h.gold)], ['Food', fmt(h.food)],
      ['Might', fmt(h.might)], ['Renown', fmt(h.renown)], ['Efficiency', `${Math.round(h.efficiency_bp / 100)}%`],
    ];
    const mats = Object.entries(h.materials).filter(([, n]) => n > 0);
    if (mats.length) rows.push(['Materials', mats.map(([m, n]) => `${fmt(n)} ${m}`).join(', ')]);
    const building = Object.entries(h.constructing || {}).filter(([, n]) => n > 0);
    if (building.length) rows.push(['Being built', building.map(([b, n]) => `${fmt(n)} ${names.buildings[b] || b}`).join(', ')]);
    $('house-facts').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('');

    const un = unitNames();
    const trows = un.map((u, i) => [u.name, h.units[i], h.away[i]]).filter(([, a, b], i) => i < 4 || a || b);
    $('house-troops').innerHTML = '<tr><td></td><td><span class="sc">home · away</span></td></tr>'
      + trows.map(([n, a, b]) => `<tr><td>${esc(n)}</td><td>${fmt(a)} · ${fmt(b)}</td></tr>`).join('')
      + (h.training ? `<tr><td>In training</td><td>${fmt(h.training)}</td></tr>` : '');

    const tu = $('t-unit');
    if (tu.dataset.race !== h.race) {
      // Unit slots you can train (1 offense, 2 defense, 3 elite, 4 thief; not elites for a race that can't), by slot.
      const role = { 1: 'offense', 2: 'defense', 3: 'elite', 4: 'thief' };
      const each = (i) => (price.have() ? price.trainCost(i, 1) : un[i].gold);
      tu.innerHTML = trainableSlots(raceOf(h.race), TRAINABLE).map((i) =>
        `<option value="${i}">${esc(un[i].name)} (${role[i]}, ${price.have() ? '' : '≈'}${fmt(each(i))} gold)</option>`).join('');
      tu.dataset.race = h.race;
    }
    hints();
    if (store.target) renderTarget();
  }
  function hints() {
    const h = store.house;
    if (!h) return;
    // Exact prices (after your modifiers) when the server sends them; estimates (≈) from an older one.
    const exact = price.have();
    const gold = (n, est) => (exact ? `${fmt(n)} gold` : `${act.approx(est)} gold (estimate)`);
    const why = (problem) => (problem ? ` Can't yet: ${problem}.` : '');
    const acres = Number($('x-acres').value) || 0;
    $('x-hint').textContent = `${gold(exact ? price.exploreCost(acres) : 0, act.estimate.explore(acres))}`
      + (exact && price.exploreSoldiers(acres) ? ` and ${fmt(price.exploreSoldiers(acres))} soldiers` : '')
      + `. Arrives in ${P.explore_ticks} ticks.` + (exact ? why(price.exploreProblem(acres, h)) : '');
    const b = store.rules.buildings.find((x) => x.building === $('b-kind').value);
    if (b) {
      const n = Number($('b-count').value) || 0;
      const c = exact ? price.buildCost(b.building, n) : null;
      const mats = exact ? Object.entries(c.materials).map(([m, q]) => `${fmt(q)} ${m}`)
        : b.materials.map((m) => `${fmt(m.per_building * n)} ${m.material}`);
      $('b-hint').textContent = `${b.description} ${gold(c?.gold ?? 0, act.estimate.build(b.building, n))}${mats.length ? ` plus ${mats.join(', ')}` : ''}. `
        + `${fmt(h.barren)} barren acres free; ready in ${P.construction_ticks} ticks.`
        + (exact ? why(price.buildProblem(b.building, n, price.buildBudget(h))) : '');
    }
    const slot = Number($('t-unit').value);
    const u = unitNames()[slot];
    if (u) {
      const n = Number($('t-count').value) || 0;
      $('t-hint').textContent = `${u.off} offense, ${u.def} defense each. ${gold(exact ? price.trainCost(slot, n) : 0, act.estimate.train(slot, n))}; ready in ${P.train_ticks} ticks.`
        + (exact && n > price.trainMax(slot) ? ` Can't yet: at most ${fmt(price.trainMax(slot))} now (soldiers and gold).` : '');
    }
  }

  function renderTick() {
    $('tick').textContent = `${fmt(store.tick)}${store.age ? ` / ${fmt(store.age.age_ticks)}` : ''}`;
    const c = countdown();
    $('next').textContent = c || '—';
  }

  // ---------- rankings, standings, state ----------
  const houseCell = (h) => `<button class="linkish" data-house="${h.id}">${esc(h.name)}</button><span class="addr-s">${addr(h)}</span>`;
  on(root, 'click', (ev) => {
    const b = ev.target.closest('[data-house]');
    if (b) {
      const h = findHouse(Number(b.dataset.house)) || store.rankings.find((x) => x.id === Number(b.dataset.house));
      if (h) { map.showHouse(h); showTarget(h); }
      return;
    }
    const s = ev.target.closest('[data-state]');
    if (s) { const [r, st] = s.dataset.state.split(':').map(Number); focusState(r, st); }
  });
  function renderRanks() {
    const list = store.rankings;
    $('ranks').tBodies[0].innerHTML = list.length
      ? list.map((h, i) => `<tr class="${store.house && h.id === store.house.id ? 'mine' : ''}"><td class="r">${i + 1}</td><td>${houseCell(h)}</td><td class="r">${fmt(h.land)}</td><td class="r">${fmt(h.might)}</td><td class="r">${fmt(h.renown)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">${esc(store.rankingsLoaded ? empty.rankings : 'Loading rankings…')}</td></tr>`;
  }
  function renderStandings() {
    if (!store.age) return;
    const mine = (x) => store.house && x.state.realm === store.house.realm && x.state.state === store.house.state;
    const rows = store.age.standings.slice(0, 20);
    $('standings').tBodies[0].innerHTML = rows.length
      ? rows.map((x, i) => `<tr class="${mine(x) ? 'mine' : ''}"><td class="r">${i + 1}</td><td><button class="linkish" data-state="${x.state.realm}:${x.state.state}">${x.state.realm}:${x.state.state}</button></td><td class="r">${x.houses}</td><td class="r">${fmt(x.land)}</td><td class="r">${(x.score / 100).toFixed(1)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">${esc(empty.standings)}</td></tr>`;
  }
  function renderWars() {
    const w = store.wars;
    map.setWars(w);
    if (!w || !store.house) return;
    const at = (x) => `${x.realm}:${x.state}`;
    const ours = w.wars.find((x) => [x.a, x.b].some((s) => s.realm === store.house.realm && s.state === store.house.state));
    $('wars-line').textContent = ours
      ? `At war: ${at(ours.a)} against ${at(ours.b)} since tick ${ours.started_tick}. The war is drawn on the map as a dashed line and hatching.`
      : `Your state is at peace. ${w.wars.length ? `${w.wars.length} war${w.wars.length > 1 ? 's' : ''} elsewhere, drawn as dashed lines.` : 'No wars anywhere yet.'}`;
  }
  function renderState() {
    const st = store.state, h = store.house;
    if (!st || !h) return;
    $('members').tBodies[0].innerHTML = st.members.length
      ? st.members.map((m) => `<tr class="${m.id === h.id ? 'mine' : ''}"><td class="r">${m.seat}</td><td>${houseCell(m)}${st.leader && st.leader.house === m.id ? ' <span class="sc addr-s">leader</span>' : ''}${m.protected ? ' <span class="addr-s" title="Protected">◌</span>' : ''}</td><td class="r">${fmt(m.land)}</td><td class="r">${fmt(m.might)}</td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">${esc(empty.members)}</td></tr>`;
    $('h-state').textContent = `State ${h.realm}:${h.state}`;
    $('state-sub').textContent = `${st.members.length} houses · ${st.leader ? `led by ${st.leader.name}` : 'no leader yet'} · ${(st.share_bp / 100).toFixed(1)}% of the realm's output`;
    $('chat-sub').textContent = `State ${h.realm}:${h.state} · ${st.members.length} houses`;
  }

  // ---------- another house: facts and actions ----------
  function showTarget(h) {
    setTarget(h);
    openSheet('target', { focus: false });
  }
  function renderTarget() {
    const h = store.target;
    map.select(h ? h.id : null);
    if (!h) { closeSheet('target', true); return; }
    $('h-target').textContent = h.name;
    $('target-sub').textContent = `${addr(h)} · ${raceName(h.race)}`;
    const me = store.house;
    const mine = me && h.id === me.id;
    const rows = [['Address', addr(h)], ['Race', raceName(h.race)], ['Land', `${fmt(h.land)} acres`], ['Might', fmt(h.might)], ['Renown', fmt(h.renown)], ['Protection', h.protected ? 'protected' : 'none']];
    if (me && !mine) {
      rows.push(['Size vs yours', `${Math.round((h.land / me.land) * 100)}%`]);
      if (h.realm === me.realm && h.state === me.state) rows.push(['Relation', 'statemate']);
    }
    $('target-facts').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('');
    $('target-actions').hidden = !me || mine;
    $('target-self').hidden = !mine;
    if (!me || mine) return;
    if (document.activeElement !== $('a-target')) $('a-target').value = addr(h);
    const un = unitNames();
    const box = $('a-units');
    const prev = Object.fromEntries([...box.querySelectorAll('input')].map((i) => [i.dataset.slot, i.value]));
    // Every unit with offense except thieves (soldiers, offense, elite and their upgrades), as the War Room's attack form.
    box.innerHTML = attackSlots(raceOf(me.race)).map((i) => `
      <div class="unit-row">
        <label for="m-a-u${i}">${esc(un[i]?.name || `slot ${i + 1}`)} <span class="have">${fmt(me.units[i])} home</span></label>
        <input id="m-a-u${i}" data-slot="${i}" type="number" min="0" max="${me.units[i]}" value="${prev[i] ?? 0}" class="num">
        <button type="button" class="small" data-all="${i}">All</button>
      </div>`).join('');
    box.querySelectorAll('[data-all]').forEach((b) => { b.onclick = () => { $(`a-u${b.dataset.all}`).value = me.units[Number(b.dataset.all)]; }; });
    kindHint();
  }
  function kindHint() {
    const k = P.attacks.find((x) => x.id === $('a-kind').value);
    if (!k) return;
    const bits = [{ land: 'Takes land', reclaim: 'Takes back land an army is carrying home from you', buildings: 'Burns buildings', resources: 'Carries off gold, food and materials', people: 'Kills peasants and thieves', blockade: "Chokes the target state's material output", destroy: 'Destroys land (for clearing idle houses)' }[k.takes] || `Takes ${k.takes}`];
    if (k.own_state) bits.push('only inside your own state'); else if (k.range_min_bp) bits.push(`target at least ${k.range_min_bp / 100}% your size`);
    if (k.requires_building) bits.push(`needs ${names.buildings[k.requires_building] || k.requires_building}`);
    if (k.requires_trait) bits.push(`a ${k.requires_trait[0].toUpperCase() + k.requires_trait.slice(1)} general leading`);
    if (k.requires_science) bits.push(`${k.requires_science} science ${k.requires_science_bp / 100}%+`);
    if (k.cost_material) bits.push(`1 ${k.cost_material} per ${k.troops_per_material} troops`);
    if (k.war_only) bits.push('only at war');
    if (k.renown) bits.push('earns renown');
    $('a-kind-hint').textContent = `${bits.join('; ')}.`;
  }

  // ---------- under way (the War Room's list, in map colours) ----------
  function renderUw() { $('uw').innerHTML = uw.html(['explore', 'build', 'train', 'medics', 'army'], { limit: 5, more: 'res' }); uw.tick($('uw')); }

  // ---------- news and chat ----------
  const newsItem = (n, fresh) => { const [text, tone] = newsLine(n); return `<li class="${tone}${fresh ? ' fresh' : ''}"><time>${esc(when(n.at))}</time>${esc(text)}</li>`; };
  function renderNews(details) {
    const list = $('news');
    const added = details.filter((d) => d.added).map((d) => d.added);
    if (added.length && !details.some((d) => d.reset) && list.querySelector('li:not(.empty)')) {
      for (const n of added.reverse()) list.insertAdjacentHTML('afterbegin', newsItem(n, true));
      if (!isOpen('news')) { unread.news += added.length; badges(); }
      return;
    }
    list.innerHTML = store.news.slice(0, 80).map((n) => newsItem(n, added.includes(n))).join('')
      || `<li class="empty">${esc(store.newsLoaded ? empty.news : 'Loading news…')}</li>`;
    if (added.length && !isOpen('news')) { unread.news += added.length; badges(); }
  }

  // ---------- forms ----------
  const P_ATT = P.attacks;
  $('b-kind').innerHTML = store.rules.buildings.map((b) => `<option value="${b.building}">${esc(b.name)}</option>`).join('');
  $('b-kind').value = 'homes';
  $('a-kind').innerHTML = P_ATT.map((k) => `<option value="${k.id}">${esc(k.name)}</option>`).join('');
  $('i-op').innerHTML = P.operations.filter((o) => INTEL.includes(o.effect)).map((o) => `<option value="${o.id}">${esc(o.name)} (${o.nerve_bp / 100}% nerve)</option>`).join('');
  const opHint = () => {
    const o = P.operations.find((x) => x.id === $('i-op').value);
    $('i-hint').textContent = o ? `Costs ${o.nerve_bp / 100}% nerve. The report is shared with your state.${store.house ? ` Your nerve: ${store.house.nerve_bp / 100}%.` : ''}` : '';
  };
  opHint();

  on($('f-explore'), 'submit', (ev) => { ev.preventDefault(); act.explore($('x-acres').value, { button: ev.submitter }); });
  on($('f-build'), 'submit', (ev) => { ev.preventDefault(); act.build($('b-kind').value, $('b-count').value, { button: ev.submitter }); });
  on($('f-train'), 'submit', (ev) => { ev.preventDefault(); act.train($('t-unit').value, $('t-count').value, { button: ev.submitter }); });
  for (const id of ['x-acres', 'b-kind', 'b-count', 't-unit', 't-count']) on($(id), 'input', hints);
  on($('a-kind'), 'change', kindHint);
  on($('i-op'), 'change', opHint);

  on($('f-attack'), 'submit', async (ev) => {
    ev.preventDefault();
    const units = [];
    $('a-units').querySelectorAll('input').forEach((i) => { units[Number(i.dataset.slot)] = Number(i.value) || 0; });
    const typed = $('a-target').value.trim();
    const t = store.target && typed === addr(store.target) ? store.target : typed;
    const out = await act.attack({ target: t, kind: $('a-kind').value, units }, { button: ev.submitter });
    if (out) $('a-units').querySelectorAll('input').forEach((i) => { i.value = 0; });
  });
  on($('f-intel'), 'submit', async (ev) => {
    ev.preventDefault();
    if (!store.target) return;
    const out = await act.operation(store.target, $('i-op').value, $('i-thieves').value, { button: ev.submitter });
    const r = out && out.intel;
    $('intel').hidden = !r;
    if (r) $('intel').innerHTML = intelRows(r).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(fmt(v))}</td></tr>`).join('');
  });

  // Chat: the War Room's chat box (world, realm and state channels).
  const chat = mountChat($('cbox'), on, { p: 'm-c', roomy: true });
  // The War Room's detail views, opened from the "In full" dock.
  const detail = mountDetail($('roomhost'), on);
  root.querySelectorAll('[data-detail]').forEach((b) => on(b, 'click', () => detail.open(b.dataset.detail, b.dataset.tab ? { tab: b.dataset.tab } : {})));
  // Keys, as in the War Room where they overlap: H N C S R toggle the map's sheets; / opens chat with a command.
  const SHEET_KEYS = { h: 'house', n: 'news', c: 'chat', s: 'state', r: 'ranks' };
  on(document, 'keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || detail.isOpen()) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (ev.key === '/') { ev.preventDefault(); openSheet('chat', { focus: false }); chat.input.value = '/'; chat.focus(); return; }
    const name = SHEET_KEYS[ev.key.toLowerCase()];
    if (!name || ev.shiftKey) return;
    ev.preventDefault();
    if (isOpen(name)) closeSheet(name); else openSheet(name);
  });
  on(document, 'keydown', (ev) => {
    // Shift+Alt+1-8 opens a pane in full, as in the War Room (ev.code: Alt changes the typed character).
    if (!ev.shiftKey || !ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const n = /^Digit([1-8])$/.exec(ev.code);
    if (n) { ev.preventDefault(); detail.open(PANES[Number(n[1]) - 1]); }
  });

  on($('logout'), 'click', () => act.signOut());
  on($('logout-2'), 'click', () => act.signOut());

  root.querySelectorAll('[data-sheet]').forEach((b) => on(b, 'click', () => { const n = b.dataset.sheet; if (isOpen(n)) closeSheet(n); else openSheet(n); }));
  root.querySelectorAll('[data-close]').forEach((b) => on(b, 'click', () => {
    const n = b.closest('.sheet').id.replace('m-sheet-', '');
    closeSheet(n);
    root.querySelector(`[data-sheet="${n}"]`)?.focus();
  }));
  on(document, 'keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (detail.isOpen()) return;   // the detail view's dialog handles its own Escape
    const open = ['target', 'news', 'chat', 'state', 'ranks', 'house'].find(isOpen);
    if (open) { closeSheet(open); root.querySelector(`[data-sheet="${open}"]`)?.focus(); }
  });

  on($('zin'), 'click', () => map.zoomBy(0.66));
  on($('zout'), 'click', () => map.zoomBy(1.5));
  on($('zworld'), 'click', () => map.showWorld());
  on($('zrealm'), 'click', () => store.house && map.showRealm(store.house.realm));
  on($('zstate'), 'click', () => store.house && focusState(store.house.realm, store.house.state));
  on($('goto'), 'submit', async (ev) => {
    ev.preventDefault();
    const text = $('goto-addr').value.trim();
    const parts = text.split(':').filter(Boolean).map(Number);
    if (!parts.length || parts.some((n) => !Number.isInteger(n) || n < 1) || parts[0] > P.realms || (parts[1] || 1) > P.states_per_realm) {
      say(`Addresses run from 1:1:1 to ${P.realms}:${P.states_per_realm}:${P.houses_per_state}.`, 'bad'); return;
    }
    if (parts.length === 1) map.showRealm(parts[0]);
    else if (parts.length === 2) focusState(parts[0], parts[1]);
    else {
      try { const h = await act.resolveAddress(text); map.showHouse(h); showTarget(h); } catch (e) { focusState(parts[0], parts[1]); say(e.message, 'bad'); }
    }
  });

  // Keep floating panels clear of the HUD.
  const hud = $('hud');
  const place = () => {
    const b = hud.getBoundingClientRect().bottom + 8;
    document.documentElement.style.setProperty('--status-top', `${b}px`);
    document.documentElement.style.setProperty('--sheet-top', `${b + 36}px`);
  };
  const ro = new ResizeObserver(place);
  ro.observe(hud);
  place();
  on(window, 'resize', () => root.classList.toggle('sheet-open', narrow() && SHEETS.some(isOpen)));

  // ---------- store -> screen ----------
  const unsub = subscribe((c) => {
    if (c.has('house') || c.has('me')) {
      if (store.house) map.setMe({ id: store.house.id, realm: store.house.realm, state: store.house.state });
      renderHouse();
    }
    if (c.has('house') || c.has('world') || c.has('rankings') || c.has('state')) drawHouses();
    if (c.has('age') || c.has('clock')) renderTick();
    if (c.has('age')) renderStandings();
    if (c.has('tick')) map.pulse();
    if (c.has('rankings')) renderRanks();
    if (c.has('state')) renderState();
    if (c.has('wars')) renderWars();
    if (c.has('realms')) map.setRealmMaterials(store.realms);
    if (c.has('news')) renderNews(c.get('news'));
    chat.update(c);
    if (c.has('chat') || c.has('unread')) badges();
    if (c.has('clock')) { detail.tick(); uw.tick($('uw')); }
    if (c.has('house')) renderUw();
    detail.update(c);
    if (c.has('target')) renderTarget();
  });

  // ---------- first paint ----------
  const h = store.house;
  map.setMe({ id: h.id, realm: h.realm, state: h.state });
  map.setRealmMaterials(store.realms);
  renderHouse(); drawHouses(); renderTick(); renderStandings(); renderRanks(); renderState(); renderWars();
  renderNews([]); chat.update(); badges(); renderCover(); renderUw();
  on($('uw'), 'click', (ev) => { const b = ev.target.closest('[data-expand]'); if (b) detail.open(b.dataset.expand); });
  if (store.target) {
    map.showHouse(store.target, false);
    renderTarget();
    openSheet('target', { focus: false });
  } else {
    map.showState(h.realm, h.state, false);
    if (!narrow()) openSheet('house', { focus: false });
  }

  return {
    unmount() {
      ac.abort();
      unsub();
      ro.disconnect();
      map.destroy();
      store.visibleStates = new Set();
      root.classList.remove('sheet-open');
      document.documentElement.style.removeProperty('--status-top');
      document.documentElement.style.removeProperty('--sheet-top');
      root.replaceChildren();
    },
  };
}
