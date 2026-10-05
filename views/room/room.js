// War room view: every pane on one dense screen. Moss, bone and iron; monospace; no motion.
// Reads the shared store and calls shared actions; owns only its DOM.
import { store, subscribe, say, setTarget, raceOf, isProtected, nextTickAt, showTicks, setClock, isUtc, slotUsed, unitPoints } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { API } from '../../core/api.js';
import { renderRace, wireRace } from './racebox.js';
import { mountDevLab } from './devlab.js';
import { fmt, esc, addr, UNIT_ORDER, isUpgrade, when, newsLine, empty, SOLDIER, fullTime, zoneLabel, tickLine } from '../../core/words.js';
import { mountFontLab, clear as clearFonts, rowHover } from './fontlab.js';
import { mountPaletteLab, clear as clearPalette, clearGlyphs } from './palettelab.js';
import * as wiki from '../../core/wiki.js';
import * as commands from '../../core/commands.js';
import * as price from '../../core/prices.js';
import * as uw from './underway.js';
import { mountDetail, PANES as DETAIL_PANES, newsFeed } from './detail.js';
import { battleCard, isBattle } from './battle.js';
import { paneHTML as sciPane, SCI_TAB } from './science.js';
import { tabButtons, panelAttrs, wireTabs } from './tabs.js';
import { MIL_TAB, fillPicker, generalLine } from './generals.js';
import { generalsPaneHTML, hallPaneHTML } from './genpane.js';
import { exploreQuote, buildQuote, trainQuote, trainNote, trainOptions, showQuote, attackHint, fillMax, exploreWhy, trainWhy, actTab, setActTab, ACT_TABS, ACT_LABELS, toAttacks, newTarget, attackSlots } from './orders.js';
import { mountChat, setChannel, CH_LABEL } from './chatbox.js';
import { mountPane as mountIntrigue } from './intrigue.js';
import { draftHTML, wireDraft } from './draft.js';
import * as ax from './atkextra.js';
import * as mk from './milacts.js';
import * as mkt from './market.js';
import { STATE_TAB, leadPaneHTML, vigilPaneHTML, warPaneHTML } from './statedetail.js';
import { noticeHTML, wireReassure } from './waver.js';

const PANES = ['act', 'res', 'mil', 'news', 'chat', 'roster', 'rank', 'sci'];
const PANE_KEY = 'realmstate.room.pane';

const TEMPLATE = (view) => `
<div class="room">
<header class="bar">
  <span class="brand"><span class="dim">HEGEMONEY:&nbsp;</span>REALMSTATE</span>
  <span class="cell"><b id="r-name"></b> <span class="dim" id="r-addr"></span></span>
  <span class="cell dim" id="r-ident"></span>
  <span class="cell" id="r-prot"></span>
  <span class="cell">T <b class="num" id="r-tick">----</b><span class="dim">/<span id="r-of">----</span></span></span>
  <span class="cell">NEXT <b class="num" id="r-next">--:--</b></span>
  <span class="cell"><span id="r-live-dot" class="dot" aria-hidden="true"></span><span id="r-live">OFF</span></span>
  <span class="spacer"></span>
  <a class="cell wikilink" href="${wiki.WIKI}" target="_blank" rel="noopener" title="Open the wiki in a new tab (or type /wiki topic)">WIKI&nbsp;&#8599;</a>
  <span class="cell sw"><button class="btn ghost mini" id="r-fonts" aria-expanded="false" aria-controls="r-fontlab" title="Font lab (F)">Aa</button><button class="btn ghost mini" id="r-palette" aria-expanded="false" aria-controls="r-palettelab" title="Palette lab (P)"><span class="pal-ico" aria-hidden="true"></span><span class="vh">Palette</span></button></span>
  <span class="cell dim" id="r-email"></span>
  <button class="btn ghost" id="r-logout">LOGOUT</button>
</header>

<dl class="strip" aria-label="House at a glance">
  <div><dt>LAND</dt><dd class="num" id="r-s-land">-</dd></div>
  <div><dt>PEASANTS</dt><dd class="num split" id="r-s-pop"><span id="r-s-peasants">-</span><span class="sep" aria-hidden="true">|</span><span class="pct" id="r-s-poppct"></span></dd></div>
  <div class="sold"><dt>SOLDIERS</dt><dd class="num" id="r-s-soldiers">-</dd></div>
  <div><dt>GOLD</dt><dd class="num" id="r-s-gold">-</dd></div>
  <div><dt>FOOD</dt><dd class="num" id="r-s-food">-</dd></div>
  <div><dt>TROOPS</dt><dd class="num" id="r-s-troops">-</dd></div>
  <div><dt>MIGHT</dt><dd class="num" id="r-s-might">-</dd></div>
  <div><dt>RENOWN</dt><dd class="num" id="r-s-renown">-</dd></div>
</dl>
<p class="waver-line" id="r-waver" hidden></p>

<nav class="tabs" id="r-tabs" aria-label="Panes">
  <button data-pane="act" aria-pressed="true">1 ACT</button>
  <button data-pane="res" aria-pressed="false">2 RES</button>
  <button data-pane="mil" aria-pressed="false">3 MIL</button>
  <button data-pane="news" aria-pressed="false">4 NEWS</button>
  <button data-pane="chat" aria-pressed="false">5 CHAT</button>
  <button data-pane="roster" aria-pressed="false">6 STATE</button>
  <button data-pane="rank" aria-pressed="false">7 RANK</button>
  <button data-pane="sci" aria-pressed="false">8 SCI</button>
</nav>

<main class="grid" id="r-grid">
  <section class="pane" id="r-p-act" data-pane="act" aria-labelledby="r-h-act" tabindex="-1">
    <h2 class="pane-h" id="r-h-act"><span class="key">1</span>ACT
      <span class="seg" role="tablist" aria-label="ACT sections" id="r-act-tabs">${ACT_TABS.map((t) => `<button type="button" role="tab" data-acttab="${t}" id="r-acttab-${t}" aria-controls="r-actsec-${t}">${ACT_LABELS[t]}</button>`).join('')}</span><button type="button" class="xp" data-expand="act" title="Open ACT in detail (Shift+Alt+1, or Enter on the pane)" aria-label="Open ACT detail view"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5"/></svg></button></h2>
    <div class="pane-b">
     <div id="r-actsec-orders" role="tabpanel" aria-labelledby="r-acttab-orders" data-actsec="orders">
      <form id="r-f-explore" class="ticket">
        <span class="verb">EXPLORE</span>
        <span class="args"><label class="vh" for="r-x-acres">Acres</label><input id="r-x-acres" name="acres" type="number" min="1" max="1000" value="10" class="w5"><button type="button" class="btn mini max" data-max="explore" aria-label="Most acres you can explore">MAX</button> <span class="dim">acres</span></span>
        <span class="cost num" id="r-x-cost"></span>
        <button class="btn primary">EXEC</button>
        <span class="tnote short small" id="r-x-why" hidden></span>
      </form>
      <form id="r-f-build" class="ticket">
        <span class="verb">BUILD</span>
        <span class="args"><label class="vh" for="r-b-bld">Building</label><select id="r-b-bld" name="building"></select> <span class="dim">×</span> <label class="vh" for="r-b-n">Count</label><input id="r-b-n" name="count" type="number" min="1" value="10" class="w5"><button type="button" class="btn mini max" data-max="build" aria-label="Most of this building you can build">MAX</button></span>
        <span class="cost num" id="r-b-cost"></span>
        <button class="btn primary">EXEC</button>
      </form>
      <form id="r-f-train" class="ticket">
        <span class="verb">TRAIN</span>
        <span class="args"><label class="vh" for="r-t-unit">Unit</label><select id="r-t-unit" name="unit"></select> <span class="dim">×</span> <label class="vh" for="r-t-n">Count</label><input id="r-t-n" name="count" type="number" min="1" value="100" class="w5"><button type="button" class="btn mini max" data-max="train" aria-label="Most of this unit you can train">MAX</button>
          <label class="vh" for="r-t-src">Train from</label><select id="r-t-src" name="source" title="Soldiers (cheaper, faster) or straight from peasants (direct)"><option value="soldiers">from SOLDIERS</option><option value="direct">DIRECT (peasants)</option></select></span>
        <span class="cost num" id="r-t-cost"></span>
        <button class="btn primary">EXEC</button>
        <p class="dim small tnote" id="r-t-note"></p>
      </form>
      <p class="dim small" id="r-price-note"></p>
      <div class="land" id="r-landbar" aria-hidden="true"></div>
      <p class="dim small" id="r-land-line"></p>
     </div>
     <div id="r-actsec-attacks" role="tabpanel" aria-labelledby="r-acttab-attacks" data-actsec="attacks" hidden>
      <form id="r-f-attack" class="ticket attack">
        <span class="verb">ATTACK</span>
        <span class="args">
          <label for="r-a-target" title="Target house, as realm:state:seat">TGT</label> <input id="r-a-target" name="target" placeholder="r:s:seat" pattern="\\s*\\d+\\s*:\\s*\\d+\\s*:\\s*\\d+\\s*" required class="w8" autocomplete="off">
          <label for="r-a-kind">KIND</label> <select id="r-a-kind" name="kind"></select>
          <label for="r-a-gen" title="A general at home to lead the army (optional)">GEN</label> <select id="r-a-gen" name="general" aria-describedby="r-a-gen-line"></select>
        </span>
        <span class="troops" id="r-a-troops"></span>
        <span class="troops extra" id="r-a-extra"></span>
        <span class="cost num" id="r-a-cost"></span>
        <button class="btn danger">EXEC</button>
      </form>
      <p class="dim small" id="r-a-gen-line"></p>
      <p class="dim small" id="r-a-hint"></p>
     </div>
     <div id="r-actsec-intrigue" role="tabpanel" aria-labelledby="r-acttab-intrigue" data-actsec="intrigue" hidden></div>
     <div id="r-actsec-rites" role="tabpanel" aria-labelledby="r-acttab-rites" data-actsec="rites" hidden></div>
    </div>
  </section>

  <section class="pane" id="r-p-res" data-pane="res" aria-labelledby="r-h-res" tabindex="-1">
    <h2 class="pane-h" id="r-h-res"><span class="key">2</span>RES
      <span class="seg" role="tablist" aria-label="RES sections" id="r-res-tabs">${tabButtons(mkt.RES_TAB, 'r-res')}</span><button type="button" class="xp" data-expand="res" title="Open RES in detail (Shift+Alt+2, or Enter on the pane)" aria-label="Open RES detail view"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5"/></svg></button></h2>
    <div class="pane-b">
     <div ${panelAttrs(mkt.RES_TAB, 'r-res', 'holdings')}>
      <h3 class="sub first">STOCK</h3>
      <table class="tbl" id="r-res"></table>
     </div>
     <div ${panelAttrs(mkt.RES_TAB, 'r-res', 'buildings')}>
      <h3 class="sub first">UNDER WAY</h3>
      <div class="uw-box" id="r-uw-res"></div>
      <h3 class="sub">BUILDINGS <span class="dim" id="r-eff"></span></h3>
      <table class="tbl" id="r-bld"></table>
     </div>
     <div ${panelAttrs(mkt.RES_TAB, 'r-res', 'market')}>${mkt.paneHTML()}</div>
    </div>
  </section>

  <section class="pane" id="r-p-mil" data-pane="mil" aria-labelledby="r-h-mil" tabindex="-1">
    <h2 class="pane-h" id="r-h-mil"><span class="key">3</span>MIL
      <span class="seg" role="tablist" aria-label="MIL sections" id="r-mil-tabs">${tabButtons(MIL_TAB, 'r-mil')}</span><button type="button" class="xp" data-expand="mil" title="Open MIL in detail (Shift+Alt+3, or Enter on the pane)" aria-label="Open MIL detail view"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5"/></svg></button></h2>
    <div class="pane-b">
     <div ${panelAttrs(MIL_TAB, 'r-mil', 'forces')}>
      <h3 class="sub first">UNDER WAY</h3>
      <div class="uw-box" id="r-uw-mil"></div>
      <div id="r-draft">${draftHTML('r-dr')}</div>
      <div id="r-make">${mk.paneHTML()}</div>
      <h3 class="sub">UNITS</h3>
      <table class="tbl" id="r-mil"></table>
      <table class="tbl" id="r-mil-extra"></table>
      <div class="race-box" id="r-race"></div>
     </div>
     <div ${panelAttrs(MIL_TAB, 'r-mil', 'generals')}></div>
     <div ${panelAttrs(MIL_TAB, 'r-mil', 'hall')}></div>
    </div>
  </section>

  <section class="pane" id="r-p-news" data-pane="news" aria-labelledby="r-h-news" tabindex="-1">
    <h2 class="pane-h" id="r-h-news"><span class="key">4</span>NEWS <span class="dim">wire</span>
      <span class="seg" role="group" aria-label="News options"><button type="button" id="r-n-tz" title="Times in UTC or your local time (also /time utc|local)"></button><button type="button" id="r-n-ticks" aria-pressed="false" title="Show what each tick changed (also /ticks)">TICKS</button></span><button type="button" class="xp" data-expand="news" title="Open NEWS in detail (Shift+Alt+4, or Enter on the pane)" aria-label="Open NEWS detail view"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5"/></svg></button></h2>
    <div class="pane-b"><ol class="tape" id="r-news"></ol></div>
  </section>

  <section class="pane" id="r-p-chat" data-pane="chat" aria-labelledby="r-h-chat" tabindex="-1">
    <h2 class="pane-h" id="r-h-chat"><span class="key">5</span>CHAT <span class="dim" id="r-chat-where">world · realm · state</span><button type="button" class="xp" data-expand="chat" title="Open CHAT in detail (Shift+Alt+5, or Enter on the pane)" aria-label="Open CHAT detail view"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5"/></svg></button></h2>
    <div class="pane-b chat-b" id="r-cbox"></div>
  </section>

  <section class="pane" id="r-p-roster" data-pane="roster" aria-labelledby="r-h-roster" tabindex="-1">
    <h2 class="pane-h" id="r-h-roster"><span class="key">6</span>STATE
      <span class="seg" role="tablist" aria-label="STATE sections" id="r-st-tabs">${tabButtons(STATE_TAB, 'r-st')}</span><button type="button" class="xp" data-expand="roster" title="Open STATE in detail (Shift+Alt+6, or Enter on the pane)" aria-label="Open STATE detail view"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5"/></svg></button></h2>
    <div class="pane-b">
      <div ${panelAttrs(STATE_TAB, 'r-st', 'members')}>
        <p class="small" id="r-roster-line"></p>
        <table class="tbl rows fixed" id="r-roster"></table>
      </div>
      <div ${panelAttrs(STATE_TAB, 'r-st', 'leadership')}></div>
      <div ${panelAttrs(STATE_TAB, 'r-st', 'vigils')}></div>
      <div ${panelAttrs(STATE_TAB, 'r-st', 'war')}></div>
    </div>
  </section>

  <section class="pane" id="r-p-rank" data-pane="rank" aria-labelledby="r-h-rank" tabindex="-1">
    <h2 class="pane-h" id="r-h-rank"><span class="key">7</span>RANK
      <span class="seg" role="group" aria-label="Ranking">
        <button id="r-rk-houses" aria-pressed="true">HOUSES</button><button id="r-rk-states" aria-pressed="false">STATES</button>
      </span><button type="button" class="xp" data-expand="rank" title="Open RANK in detail (Shift+Alt+7, or Enter on the pane)" aria-label="Open RANK detail view"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5"/></svg></button>
    </h2>
    <div class="pane-b"><table class="tbl rows fixed" id="r-rank"></table></div>
  </section>

  <section class="pane" id="r-p-sci" data-pane="sci" aria-labelledby="r-h-sci" tabindex="-1">
    <h2 class="pane-h" id="r-h-sci"><span class="key">8</span>SCI
      <span class="seg" role="tablist" aria-label="SCI sections" id="r-sci-tabs">${tabButtons(SCI_TAB, 'r-sci')}</span><button type="button" class="xp" data-expand="sci" title="Open SCI in detail (Shift+Alt+8, or Enter on the pane)" aria-label="Open SCI detail view"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5"/></svg></button></h2>
    <div class="pane-b"><div ${panelAttrs(SCI_TAB, 'r-sci', 'science')}></div><div ${panelAttrs(SCI_TAB, 'r-sci', 'academics')}></div><div ${panelAttrs(SCI_TAB, 'r-sci', 'colloquium')}></div></div>
  </section>
</main>
</div>`;

export function mount(root) {
  root.innerHTML = TEMPLATE('room');
  const $ = (id) => root.querySelector(`#r-${id}`);
  const ac = new AbortController();
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { signal: ac.signal, ...opts });
  const P = store.rules.params;
  const prev = new Map(); // element id -> last number shown
  let race = null;
  let rankMode = 'houses';
  const flips = new Set();
  const draft = wireDraft($('draft'), on, 'r-dr');
  const make = mk.wirePane($('make'), on, say);
  wireReassure(root, on);
  const market = mkt.wirePane($('res-sec-market'), on);
  wireTabs($('res-tabs'), $('p-res'), on, mkt.RES_TAB, () => market.update());

  /** Set a number; if it changed since last shown, flip its colour for a moment (no animation). */
  function setNum(id, value, text) {
    const el = $(id);
    const old = prev.get(id);
    el.textContent = text ?? fmt(value);
    if (old !== undefined && old !== value) {
      el.classList.remove('up', 'down');
      el.classList.add(value > old ? 'up' : 'down');
      clearTimeout(el._flip);
      el._flip = setTimeout(() => el.classList.remove('up', 'down'), 2000);
      flips.add(el);
    }
    prev.set(id, value);
  }

  // ---------- setup that depends on your race ----------
  function setupRace() {
    const h = store.house;
    if (race && race.identity === h.race) return;
    race = raceOf(h.race) || { units: [] };
    $('b-bld').innerHTML = store.rules.buildings.map((b) => `<option value="${esc(b.building)}">${esc(b.name)}${b.materials.length ? ` +${b.materials.map((m) => `${m.per_building} ${m.material}`).join(',')}` : ''}</option>`).join('');
    $('b-bld').value = 'homes';
    $('t-unit').innerHTML = trainOptions(race);
    $('a-kind').innerHTML = P.attacks.map((k) => `<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('');
    $('a-extra').innerHTML = ax.extrasHTML('r-a', race, true);
    $('a-troops').innerHTML = attackSlots(race).map((slot) => {
      const u = race.units[slot] || { name: `unit ${slot}`, off: 0 };
      return `<span class="troop"><label for="r-a-u${slot}">${esc(u.name)} <small>${u.off}</small></label><span class="field"><input id="r-a-u${slot}" data-slot="${slot}" type="number" min="0" value="0" placeholder="0"><button type="button" class="btn mini max" data-max="troop" aria-label="Send every ${esc(u.name)} at home">MAX</button></span></span>`;
    }).join('');
  }

  // ---------- your house ----------
  function renderHouse() {
    const h = store.house;
    if (!h) return;
    setupRace();
    $('name').textContent = h.name;
    $('addr').textContent = `[${addr(h)}]`;
    $('ident').textContent = `${race.name || h.race} · ${h.personality}`;
    // A connected page isn't told the email: name the game instead.
    const who = store.me ? (store.me.email || `connected to ${API.replace(/^https?:\/\//, '')}`) : '';
    $('email').textContent = who;
    $('logout').title = store.me ? (store.me.email ? `Signed in as ${store.me.email}` : `End this page's connection to ${API}`) : '';
    const prot = isProtected(h);
    const pk = `${prot}:${h.protected_until}`;
    if ($('prot').dataset.k !== pk) {
      $('prot').dataset.k = pk;
      // Out of protection is the normal state, so the bar shows nothing for it.
      $('prot').hidden = !prot;
      $('prot').innerHTML = prot
        ? `<span class="prot-on">PROTECTED</span> <span class="dim">to T${h.protected_until}</span> <button class="btn ghost mini" id="r-leave-prot">LEAVE</button>`
        : '';
      if (prot) on($('leave-prot'), 'click', (ev) => {
        if (!confirm('Leave protection now? Your house can then be attacked. This cannot be undone.')) return;
        act.leaveProtection({ button: ev.currentTarget });
      });
    }

    setNum('s-land', h.land, fmt(h.land) + (h.incoming_land ? `+${fmt(h.incoming_land)}` : ''));
    setNum('s-peasants', h.peasants);
    // Peasants as a share of max population (left out on an older server without the number).
    if (h.max_population > 0) {
      setNum('s-poppct', Math.round(h.peasants * 100 / h.max_population), `${Math.round(h.peasants * 100 / h.max_population)}%`);
      $('s-pop').title = `${fmt(h.peasants)} peasants = ${(h.peasants * 100 / h.max_population).toFixed(1)}% of max population ${fmt(h.max_population)} (everyone now: ${fmt(h.population)}; peasants grow while there's room)`;
    }
    $('s-pop').classList.toggle('nopct', !(h.max_population > 0));
    setNum('s-gold', h.gold);
    setNum('s-food', h.food);
    setNum('s-soldiers', h.units[SOLDIER]);
    $('s-soldiers').title = `${fmt(h.units[SOLDIER])} soldiers at home (1/1 each)${h.away[SOLDIER] ? `, ${fmt(h.away[SOLDIER])} away` : ''}; drafted toward ${(h.draft_bp || 0) / 100}% of your population`;
    const troopsHome = h.units.reduce((a, b) => a + b, 0);
    const troopsAway = h.away.reduce((a, b) => a + b, 0);
    setNum('s-troops', troopsHome);
    $('s-troops').title = `Troops at home, soldiers included: ${fmt(troopsHome)} (${fmt(h.units[SOLDIER])} soldiers); away ${fmt(troopsAway)}; in training ${fmt(h.training)}`;
    setNum('s-might', h.might);
    setNum('s-renown', h.renown);
    const wl = noticeHTML();
    $('waver').hidden = !wl;
    if ($('waver').innerHTML !== wl) $('waver').innerHTML = wl;

    const res = [['Gold', h.gold], ['Food', h.food], ['Peasants', h.peasants], ['Horses', h.horses], ['Chariots', h.chariots],
      ...Object.entries(h.materials).map(([m, n]) => [m[0].toUpperCase() + m.slice(1), n])];
    $('res').innerHTML = '<tr><th>ITEM</th><th class="num">HELD</th></tr>' + res.map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td class="num${v ? '' : ' zero'}">${fmt(v)}</td></tr>`).join('');
    $('eff').textContent = `eff ${Math.round(h.efficiency_bp / 100)}% · ${fmt(h.build_cost)}g base each`;
    const rows = store.rules.buildings.map((b) => [b, h.buildings[b.building] || 0, h.constructing[b.building] || 0]).filter(([, n, c]) => n || c);
    $('bld').innerHTML = '<tr><th>BUILDING</th><th class="num">UP</th><th class="num">+BLD</th></tr>' + rows.map(([b, n, c]) =>
      `<tr><td>${esc(b.name)}</td><td class="num">${fmt(n)}</td><td class="num${c ? '' : ' zero'}">${c ? `+${fmt(c)}` : '·'}</td></tr>`).join('')
      + `<tr><td class="dim">Barren</td><td class="num">${fmt(h.barren)}</td><td></td></tr>`;

    const built = Object.values(h.buildings).reduce((a, b) => a + b, 0);
    const cons = Object.values(h.constructing).reduce((a, b) => a + b, 0);
    const pct = (n) => `${(100 * n / Math.max(1, h.land)).toFixed(2)}%`;
    $('landbar').innerHTML = `<span class="built" style="width:${pct(built)}"></span><span class="cons" style="width:${pct(cons)}"></span>`;
    $('land-line').textContent = `${fmt(built)} built · ${fmt(cons)} building · ${fmt(h.barren)} barren · ${fmt(h.incoming_land)} incoming / ${fmt(h.land)} acres`;

    $('mil').innerHTML = '<tr><th>UNIT</th><th class="num"><abbr title="Offense / defense per unit">O/D</abbr></th><th class="num">HOME</th><th class="num">AWAY</th></tr>'
      + UNIT_ORDER.map((i) => [race.units[i], i]).filter(([u, i]) => u && slotUsed(race, i)).map(([u, i]) => `<tr class="${isUpgrade(i) ? 'upg' : ''}${i === SOLDIER ? ' sold' : ''}"><td class="name">${isUpgrade(i) ? '<span class="sub-mark" aria-hidden="true">↳ </span>' : ''}${esc(u.name)}</td><td class="num dim">${unitPoints(race, i).join('/')}</td><td class="num${h.units[i] ? '' : ' zero'}">${fmt(h.units[i])}</td><td class="num${h.away[i] ? '' : ' zero'}">${fmt(h.away[i])}</td></tr>`).join('');
    const offHome = race.units.reduce((a, u, i) => a + unitPoints(race, i)[0] * h.units[i], 0);
    const defHome = race.units.reduce((a, u, i) => a + u.def * h.units[i], 0);
    draft.update();
    make.update();
    const extra = [['In training', h.training], ['Medics home/away', `${fmt(h.medics)}/${fmt(h.medics_away)}`], ['Horses home/away', `${fmt(h.horses)}/${fmt(h.horses_away)}`],
      ['Chariots home/away', `${fmt(h.chariots)}/${fmt(h.chariots_away)}`], ['Generals', h.generals.length], ['Raw offense home', offHome], ['Raw defense home', defHome], ['Nerve', `${h.nerve_bp / 100}%`]];
    $('mil-extra').innerHTML = '<tr><th>LINE</th><th class="num">VALUE</th></tr>' + extra.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${typeof v === 'number' ? fmt(v) : esc(v)}</td></tr>`).join('');
    renderRace($('race'), 'r-rc', true);

    root.querySelectorAll('#r-a-troops input').forEach((inp) => { const n = h.units[Number(inp.dataset.slot)]; inp.max = n; inp.title = `${fmt(n)} at home`; });
    $('uw-res').innerHTML = uw.html(['explore', 'build'], { limit: 4, more: 'res' });
    $('uw-mil').innerHTML = uw.html(['train', 'medics', 'army'], { limit: 4, more: 'mil' });
    root.querySelectorAll('[data-max]').forEach((b) => { b.disabled = !price.have(); if (!price.have()) b.title = 'Needs a newer game server (exact prices)'; });
    costs();
  }

  /** Exact costs from the server's prices (≈ estimates only if an old server sends none). */
  function costs() {
    if (!store.house || !race) return;
    const xq = exploreQuote($('x-acres').value);
    showQuote($('x-cost'), xq);
    $('x-why').hidden = !xq.why;
    $('x-why').textContent = xq.why ? `Can't: ${xq.why}.` : '';
    showQuote($('b-cost'), buildQuote($('b-bld').value, $('b-n').value));
    const direct = $('t-src').value === 'direct';
    showQuote($('t-cost'), trainQuote($('t-unit').value, $('t-n').value, direct));
    $('t-note').textContent = trainNote(direct, $('t-unit').value);
    $('price-note').textContent = price.have()
      ? 'Costs are exact, after your modifiers; red means you lack something (hover for why). Shift+Alt+1 opens the full order forms, with a grid to build many at once.'
      : '≈ = estimate from base prices, before modifiers. The real cost is in the result line after EXEC.';
    const aq = ax.attackQuote(race, paneUnits(), ax.readExtras($('a-extra')));
    const at = ax.quoteText(aq, ax.readExtras($('a-extra')));
    $('a-cost').textContent = at.text;
    $('a-cost').title = at.title;
    $('a-cost').classList.toggle('short', aq.problems.length > 0);
    const hint = attackHint($('a-kind').value);
    if (hint) $('a-hint').textContent = `${hint} Fill TGT from the RANK pane.`;
  }

  /** The pane's attack troops by slot (10 slots; mercenaries come from the extras). */
  function paneUnits() {
    const u = Array(10).fill(0);
    root.querySelectorAll('#r-a-troops input').forEach((inp) => { u[Number(inp.dataset.slot)] = Number(inp.value) || 0; });
    return u;
  }

  // ---------- tick ----------
  function renderTick() {
    $('tick').textContent = String(store.tick).padStart(4, '0');
    $('of').textContent = store.age ? String(store.age.age_ticks) : '----';
    const nx = nextTickAt();
    if (!nx) { $('next').textContent = '--:--'; return; }
    const left = Math.max(0, nx - Date.now());
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    $('next').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    $('next').title = `Next tick at ${new Date(nx).toLocaleTimeString()}`;
  }
  function renderLive() {
    const on2 = store.live === 'on';
    $('live-dot').className = `dot ${on2 ? 'on' : 'off'}`;
    $('live').textContent = on2 ? 'LIVE' : store.live === 'connecting' ? 'LINK…' : 'OFF';
  }

  // ---------- news (and, if shown, tick reports) ----------
  function newsLi(x, fresh) {
    const li = document.createElement('li');
    const t = document.createElement('time');
    t.textContent = x.at ? when(x.at) : '';
    if (x.at) t.title = fullTime(x.at);
    const s2 = document.createElement('span');
    if (x.tick) {
      li.className = 'tk';
      s2.textContent = tickLine(x.tick);
    } else if (isBattle(x.n)) {
      li.className = `battle${fresh ? ' fresh' : ''}`;
      s2.innerHTML = battleCard(x.n, false);
    } else {
      const [text, tone] = newsLine(x.n);
      s2.textContent = text;
      if (tone === 'bad') s2.className = 'bad';
      if (fresh) li.className = 'fresh';
    }
    li.append(t, s2);
    return li;
  }
  function emptyLi(text) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; return li; }
  function renderNews(details) {
    const ol = $('news');
    const added = new Set(details.filter((d) => d.added).map((d) => d.added));
    const feed = newsFeed(100);
    ol.replaceChildren(...feed.map((x) => newsLi(x, x.n && added.has(x.n))));
    if (!feed.length) ol.replaceChildren(emptyLi(store.newsLoaded ? empty.news : 'loading news…'));
    $('n-tz').textContent = zoneLabel().toUpperCase();
    $('n-tz').setAttribute('aria-label', `Times in ${zoneLabel()}; switch to ${isUtc() ? 'local time' : 'UTC'}`);
    $('n-ticks').setAttribute('aria-pressed', String(!!store.showTicks));
    $('n-ticks').title = `${store.showTicks ? 'Hide' : 'Show'} what each tick changed (${store.ticks.length} kept; also /ticks)`;
  }

  // ---------- science ----------
  function renderSci() { if (store.house && store.rules) { const t = SCI_TAB.get(); $(`sci-sec-${t}`).innerHTML = sciPane(t); } }
  const sciTabs = wireTabs($('sci-tabs'), $('p-sci'), on, SCI_TAB, renderSci);
  function renderGen() {
    if (!store.house || !store.rules) return;
    const t = MIL_TAB.get();
    if (t === 'generals') $('mil-sec-generals').innerHTML = generalsPaneHTML();
    else if (t === 'hall') $('mil-sec-hall').innerHTML = hallPaneHTML();
    fillPicker($('a-gen'));
    $('a-gen-line').textContent = generalLine($('a-gen').value);
  }
  wireTabs($('mil-tabs'), $('p-mil'), on, MIL_TAB, renderGen);
  wireRace($('race'), on, 'r-rc');
  on($('p-mil'), 'click', (ev) => { const b = ev.target.closest('[data-defend]'); if (b) act.setDefender(b.dataset.defend, { button: b }); });

  // ---------- state roster ----------
  const COLS_ROSTER = '<colgroup><col class="c-n"><col><col class="c-num"><col class="c-num c-might"><col class="c-rn"><col class="c-flag"></colgroup>';
  function renderRoster() {
    const st = store.state, h = store.house;
    if (!st || !h) return;
    $('roster-line').textContent = `${st.name ? `${st.name} · ` : ''}${st.realm}:${st.state} · ${st.members.length} houses · leader ${st.leader ? `${st.leader.name} (${addr(st.leader)})` : 'none'} · ${st.majority} votes for majority · treasury ${fmt(st.treasury.gold)}g · tax ${st.tax.rate_bp / 100}% · ${(st.share_bp / 100).toFixed(2)}% of realm output`;
    $('roster').innerHTML = `${COLS_ROSTER}<tr><th class="num"><abbr title="Seat in your state">S</abbr></th><th>HOUSE</th><th class="num">LAND</th><th class="num c-might">MIGHT</th><th class="num"><abbr title="Renown">RN</abbr></th><th></th></tr>`
      + (st.members.length ? st.members.map((m) => `<tr class="${m.id === h.id ? 'self' : ''}"><td class="num dim">${m.seat}</td><td class="name" title="${esc(m.name)} · ${esc(m.race)}">${esc(m.name)}</td><td class="num">${fmt(m.land)}</td><td class="num c-might">${fmt(m.might)}</td><td class="num">${fmt(m.renown)}</td><td>${m.protected ? '<span class="flag p" title="Under protection">P</span>' : ''}</td></tr>`).join('')
        : `<tr><td colspan="6" class="dim">${esc(empty.members)}</td></tr>`);
    renderStateTabs();
  }
  /** The STATE pane's other tabs: only the one showing is drawn. */
  function renderStateTabs() {
    const t = STATE_TAB.get();
    const html = t === 'leadership' ? leadPaneHTML : t === 'vigils' ? vigilPaneHTML : t === 'war' ? warPaneHTML : null;
    if (html) $(`st-sec-${t}`).innerHTML = html();
  }
  wireTabs($('st-tabs'), $('p-roster'), on, STATE_TAB, renderStateTabs);

  // ---------- rankings ----------
  const COLS_RANK = '<colgroup><col class="c-n"><col class="c-addr"><col><col class="c-num"><col class="c-num c-might"><col class="c-tgt"></colgroup>';
  function renderRank() {
    const h = store.house;
    if (!h) return;
    if (rankMode === 'states') {
      const a = store.age;
      if (!a) return;
      const rows = a.ended && a.result ? a.result.states : a.standings;
      $('rank').innerHTML = '<colgroup><col class="c-n"><col class="c-addr"><col><col><col class="c-might"><col class="c-n"></colgroup>'
        + '<tr><th class="num">#</th><th>STATE</th><th class="num">SCORE</th><th class="num">LAND</th><th class="num c-might">MIGHT</th><th class="num"><abbr title="Houses in the state">HSE</abbr></th></tr>'
        + (rows.length ? rows.map((x, i) => `<tr class="${x.state.realm === h.realm && x.state.state === h.state ? 'self' : ''}"><td class="num dim">${i + 1}</td><td class="num">${x.state.realm}:${x.state.state}</td><td class="num">${(x.score / 100).toFixed(1)}</td><td class="num">${fmt(x.land)}</td><td class="num c-might">${fmt(x.might)}</td><td class="num">${x.houses}</td></tr>`).join('')
          : `<tr><td colspan="6" class="dim">${esc(empty.standings)}</td></tr>`);
      return;
    }
    const list = store.rankings;
    const sameState = (x) => x.realm === h.realm && x.state === h.state;
    const tgt = store.target ? store.target.id : null;
    $('rank').innerHTML = `${COLS_RANK}<tr><th class="num">#</th><th>ADDR</th><th>HOUSE</th><th class="num">LAND</th><th class="num c-might">MIGHT</th><th></th></tr>`
      + (list.length ? list.map((x, i) => `<tr class="${x.id === h.id ? 'self' : ''}${x.id === tgt ? ' tgt' : ''}"><td class="num dim">${i + 1}</td><td class="num">${addr(x)}</td><td class="name" title="${esc(x.name)}${x.protected ? ' (protected)' : ''}">${esc(x.name)}</td><td class="num">${fmt(x.land)}</td><td class="num c-might">${fmt(x.might)}</td><td>${sameState(x) ? '' : `<button class="btn mini" data-tgt="${x.id}" title="Make ${esc(x.name)} your attack target" aria-label="Target ${esc(x.name)}" aria-pressed="${x.id === tgt}">TGT</button>`}</td></tr>`).join('')
        : `<tr><td colspan="6" class="dim">${esc(store.rankingsLoaded ? empty.rankings : 'loading rankings…')}</td></tr>`);
  }
  function setRank(mode) {
    rankMode = mode;
    $('rk-houses').setAttribute('aria-pressed', mode === 'houses');
    $('rk-states').setAttribute('aria-pressed', mode === 'states');
    renderRank();
  }

  // ---------- the shared target ----------
  function renderTarget() {
    const t = store.target;
    if (newTarget()) { toAttacks(); actTabs(); }
    const input = $('a-target');
    if (document.activeElement !== input) input.value = t ? addr(t) : input.value;
    renderRank();
  }

  // ---------- panes: phone tabs + Alt+1..7 ----------
  function showPane(name, focus) {
    root.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === name));
    root.querySelectorAll('#r-tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.pane === name));
    try { localStorage.setItem(PANE_KEY, name); } catch { /* storage off */ }
    if (focus) $(`p-${name}`).focus();
  }

  // ---------- wiring ----------
  // With exact prices, the quote replaces the estimate; the outcome's own cost is the cross-check.
  const quote = (fn) => (price.have() ? { estimate: null, quote: fn() } : {});
  on($('f-explore'), 'submit', (ev) => {
    ev.preventDefault();
    const n = $('x-acres').value;
    act.explore(n, { button: ev.submitter, ...quote(() => price.exploreCost(n)) });
  });
  on($('f-build'), 'submit', (ev) => {
    ev.preventDefault();
    const b = $('b-bld').value, n = $('b-n').value;
    act.build(b, n, { button: ev.submitter, ...quote(() => price.buildCost(b, n).gold) });
  });
  on($('f-train'), 'submit', (ev) => {
    ev.preventDefault();
    const u = $('t-unit').value, n = $('t-n').value, d = $('t-src').value === 'direct';
    act.train(u, n, { button: ev.submitter, direct: d, ...quote(() => price.trainCost(u, n, d)) });
  });
  // MAX: fill a count with the most you can order now.
  on($('p-act'), 'click', (ev) => {
    const b = ev.target.closest('[data-max]');
    if (!b || !store.house || !price.have()) return;
    const kind = b.dataset.max;
    if (kind === 'explore') fillMax($('x-acres'), price.exploreMax(), exploreWhy());
    else if (kind === 'train') { const d = $('t-src').value === 'direct'; fillMax($('t-n'), price.trainMax($('t-unit').value, d), trainWhy($('t-unit').value, d)); }
    else if (kind === 'build') {
      const id = $('b-bld').value;
      const why = store.house.barren <= 0 ? 'no barren land' : price.buildRoom(id) <= 0 ? 'you already have as many as a house may own' : 'not enough gold or materials';
      fillMax($('b-n'), price.buildMax(id, price.buildBudget()), why);
    } else if (kind === 'troop') {
      const inp = b.closest('.troop').querySelector('input');
      fillMax(inp, store.house.units[Number(inp.dataset.slot)], 'none at home');
    } else if (kind.startsWith('x-')) {
      const k = kind.slice(2);
      const x = ax.readExtras($('a-extra'));
      x[k] = 0;
      const [n, why] = ax.extraMax(k, ax.attackQuote(race, paneUnits(), x), x);
      fillMax($(`a-${k}`), n, why);
    }
  });
  on($('f-attack'), 'submit', async (ev) => {
    ev.preventDefault();
    const units = paneUnits();
    const x = ax.readExtras($('a-extra'));
    units[8] = x.mercs;
    const typed = $('a-target').value.trim();
    const t = store.target && typed === addr(store.target) ? store.target : typed;
    const out = await act.attack({ target: t, kind: $('a-kind').value, units, general: $('a-gen').value, medics: x.medics, horses: x.horses, chariots: x.chariots, upgradedMercenaries: x.upmercs, doubleStrike: x.double }, { button: ev.submitter });
    if (out) root.querySelectorAll('#r-a-troops input, #r-a-extra input').forEach((inp) => { if (inp.type === 'checkbox') inp.checked = false; else inp.value = 0; });
    costs();
  });
  for (const id of ['x-acres', 'b-bld', 'b-n', 't-unit', 't-n', 't-src', 'a-kind']) on($(id), 'input', costs);
  on($('a-troops'), 'input', costs);
  on($('a-extra'), 'input', costs);
  on($('a-gen'), 'input', () => { $('a-gen-line').textContent = generalLine($('a-gen').value); });
  on($('logout'), 'click', () => act.signOut());
  mountFontLab(root, on, { blocked: () => detail.isOpen() });
  mountPaletteLab(root, on, { blocked: () => detail.isOpen() });
  // Dev mode (a dev server only): a DEV button and panel, and /dev in chat.
  let unmountDev = () => {};
  mountDevLab(root, on).then((fn) => { unmountDev = fn; });
  const detail = mountDetail(root, on);
  const unregDetail = commands.register('detail', {
    args: '[pane]',
    help: 'open a pane in detail: act, res, mil, news, chat, state, rank, sci (also Shift+Alt+1–8, or Enter on a pane)',
    run: (rest) => {
      const w = (rest || 'act').trim().toLowerCase();
      const name = w === 'state' ? 'roster' : w === 'science' ? 'sci' : w;
      if (!DETAIL_PANES.includes(name)) { say(`No pane "${rest}". Try act, res, mil, news, chat, state, rank or sci.`, 'bad'); return; }
      if (name === 'act') { toAttacks(); actTabs(); detail.open('act', { tab: actTab() }); return; }
      detail.open(name);
    },
  });

  // Commands are typed in chat ("/wiki soldiers"); the war room adds /fonts and /palette.
  const unregisterHover = commands.register('hover', { args: '[on|off]', help: 'turn the row hover highlight on or off', run: (arg) => {
    const on = arg ? !/^(off|no|0|false)$/i.test(arg) : document.documentElement.dataset.rowHover === 'off';
    rowHover(on);
    const box = root.querySelector('#r-fontlab [data-k="hover"]'); if (box) box.checked = on;
    say(`Row hover highlight ${on ? 'on' : 'off'}.`, 'good');
  } });
  const unregister = commands.register('fonts', { help: 'open or close the font lab (also F)', run: () => root.querySelector('#r-fonts').click() });
  const unregPalette = commands.register('palette', { help: 'open or close the palette lab (also P)', run: () => root.querySelector('#r-palette').click() });
  on(document, 'keydown', (ev) => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey || detail.isOpen()) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    ev.preventDefault();
    showPane('chat');
    chat.input.value = '/';
    chat.focus();
  });

  // ---------- chat: world, realm and state in one box ----------
  const chat = mountChat($('cbox'), on, { p: 'r-c' });
  const unregChannels = ['world', 'realm', 'state'].map((ch) => commands.register(ch, {
    args: '[text]',
    help: `switch chat to the ${ch} channel, or send text there`,
    run: async (rest) => {
      setChannel(ch);
      if (rest && rest.trim()) await act.sendChat(rest, ch);
      else say(`Chat on the ${CH_LABEL[ch]} channel.`, 'good');
    },
  }));

  // ---------- ACT tabs: ORDERS, INTRIGUE, RITES ----------
  const intrigue = mountIntrigue($('actsec-intrigue'), $('actsec-rites'), on, {
    openDetail: (tab, report) => detail.open('act', { tab, report }),
  });
  function actTabs(focusTab) {
    const t = actTab();
    root.querySelectorAll('#r-act-tabs [data-acttab]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.acttab === t)); b.tabIndex = b.dataset.acttab === t ? 0 : -1; });
    root.querySelectorAll('#r-p-act [data-actsec]').forEach((x) => { x.hidden = x.dataset.actsec !== t; });
    if (focusTab) root.querySelector(`#r-act-tabs [data-acttab="${t}"]`).focus();
  }
  on($('act-tabs'), 'click', (ev) => { const b = ev.target.closest('[data-acttab]'); if (b) { setActTab(b.dataset.acttab); actTabs(); } });
  on($('act-tabs'), 'keydown', (ev) => {
    const i = ACT_TABS.indexOf(actTab());
    const n = ACT_TABS.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    setActTab(ACT_TABS[j]);
    actTabs(true);
  });
  const unregActs = [['intrigue', 'thieves\' operations and your state\'s reports'], ['rites', 'cast rites, divinations and hexes']].map(([t, what]) => commands.register(t, {
    help: `open ACT in detail on ${t.toUpperCase()}: ${what}`,
    run: () => { setActTab(t); actTabs(); detail.open('act', { tab: t }); },
  }));

  const unregGen = [['generals', 'generals', 'raise, command, list and keep generals'], ['heirs', 'generals', 'mark heirs and recall kept ones'], ['hall', 'hall', 'the Hall of Deeds: bid, offer, list']].map(([cmd, t, what]) => commands.register(cmd, {
    help: `open MIL in detail on ${MIL_TAB.labels[t]}: ${what}`,
    run: () => { MIL_TAB.set(t); showPane('mil'); detail.open('mil'); },
  }));

  // New views, by command: /buildings, /market, /members, /leadership, /vigils, /war, /workshop.
  const unregNew = [
    ['buildings', 'open RES in detail on BUILDINGS: land, construction, buildings and razing', () => { mkt.RES_TAB.set('buildings'); showPane('res'); detail.open('res'); }],
    ['market', 'open RES in detail on MARKET: books, orders, buy and sell', () => { mkt.RES_TAB.set('market'); showPane('res'); detail.open('res'); }],
    ...STATE_TAB.list.map((t) => [t, `open STATE in detail on ${STATE_TAB.labels[t]}`, () => { STATE_TAB.set(t); showPane('roster'); detail.open('roster'); }]),
    ['workshop', 'open MIL in detail on FORCES: medics, upgrades, chariots, refining', () => { MIL_TAB.set('forces'); showPane('mil'); detail.open('mil'); requestAnimationFrame(() => document.querySelector('#d-mk-t input')?.focus()); }],
  ].map(([cmd, help, run]) => commands.register(cmd, { help, run }));

  // ---------- news options ----------
  on($('n-tz'), 'click', () => setClock(!isUtc()));
  on($('n-ticks'), 'click', () => showTicks(!store.showTicks));

  on($('rank'), 'click', (ev) => {
    const b = ev.target.closest('[data-tgt]');
    if (!b) return;
    const h = store.rankings.find((x) => x.id === Number(b.dataset.tgt));
    if (!h) return;
    setTarget(h);
    $('a-target').value = addr(h);
    showPane('act');
    const t = toAttacks();
    actTabs();
    const f = t === 'intrigue' ? $('o-target') : t === 'rites' && !$('r-target').disabled ? $('r-target') : $('a-target');
    f.value = addr(h);
    f.focus();
    say(`Target set to ${h.name} (${addr(h)}). ${t === 'intrigue' ? 'Choose an operation and thieves' : t === 'rites' ? 'Choose a rite' : 'Choose a kind and troops'}, then EXEC.`);
  });
  on($('rk-houses'), 'click', () => setRank('houses'));
  on($('rk-states'), 'click', () => setRank('states'));
  on($('tabs'), 'click', (ev) => { const b = ev.target.closest('button'); if (b) showPane(b.dataset.pane); });
  // Alt+1–8: go to a pane (or, with a detail view open, switch it). Shift+Alt+1–8: open its detail.
  on(document, 'keydown', (ev) => {
    if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const i = Number(ev.code.replace('Digit', '')) - 1;
    if (!(i >= 0 && i < PANES.length)) return;
    ev.preventDefault();
    if (ev.shiftKey || detail.isOpen()) { showPane(PANES[i]); detail.open(PANES[i]); } else showPane(PANES[i], true);
  });
  // Enter on a focused pane (Alt+1–8 focuses one) opens its detail; so do the header buttons.
  on($('grid'), 'keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.altKey || ev.ctrlKey || ev.metaKey || !ev.target.classList.contains('pane')) return;
    ev.preventDefault();
    detail.open(ev.target.dataset.pane);
  });
  on($('grid'), 'click', (ev) => {
    const b = ev.target.closest('[data-expand]');
    if (b) detail.open(b.dataset.expand);
  });

  // ---------- store -> screen ----------
  const unsub = subscribe((c) => {
    market.update(c);
    if (c.has('house') || c.has('me')) renderHouse();
    else if (c.has('market')) make.update();
    if (c.has('age') || c.has('clock')) renderTick();
    if (c.has('clock')) { uw.tick($('grid')); detail.tick(); }
    detail.update(c);
    if (c.has('live')) renderLive();
    if (c.has('news')) renderNews(c.get('news'));
    if (c.has('timemode')) renderHouse();
    chat.update(c);
    intrigue.update(c);
    if (c.has('ticks') || c.has('timemode')) renderNews([]);
    if (c.has('state')) renderRoster();
    if (c.has('state') || c.has('wars') || c.has('relations')) renderStateTabs();
    if (c.has('rankings') || (c.has('age') && rankMode === 'states')) renderRank();
    if (c.has('target')) renderTarget();
    if (c.has('house') || c.has('colloquium') || c.has('ticks')) renderSci();
    if (c.has('house') || c.has('hall') || c.has('colloquium') || c.has('age')) renderGen();
  });

  // ---------- first paint ----------
  let start = 'act';
  try { start = localStorage.getItem(PANE_KEY) || 'act'; } catch { /* storage off */ }
  showPane(PANES.includes(start) ? start : 'act');
  if (newTarget()) toAttacks();
  actTabs();
  renderHouse(); renderTick(); renderLive(); renderNews([]); renderRoster(); renderRank(); renderSci(); renderGen();
  if (store.target) $('a-target').value = addr(store.target);
  costs();

  return {
    unmount() {
      ac.abort();
      unsub();
      flips.forEach((el) => clearTimeout(el._flip));
      clearFonts();
      clearPalette();
      clearGlyphs();
      unregister();
      unmountDev();
      unregPalette();
      unregisterHover();
      unregDetail();
      unregChannels.forEach((f) => f());
      unregActs.forEach((f) => f());
      unregGen.forEach((f) => f());
      unregNew.forEach((f) => f());
      root.replaceChildren();
    },
  };
}
