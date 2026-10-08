// Straightline: Utopia's original layout, and the beginner's default. A menu of pages down the side, one page
// at a time, one column. Every page is a War Room panel (or one tab of one), run by the War Room's own pane
// runner inside .room-scope, so it stays in step with the War Room; line.css gives it its own calm look.
import { store, subscribe, countdown, raceName, persName, isProtected } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr } from '../../core/words.js';
import { switchHTML } from '../../core/viewswitch.js';
import { paneRunner } from '../room/detail.js';
import { RES_TAB } from '../room/market.js';
import { MIL_TAB } from '../room/generals.js';
import { STATE_TAB } from '../room/statedetail.js';
import { SCI_TAB } from '../room/science.js';
import { mountLook, clear as clearLook } from './looklab.js';
import { mountThrone } from './throne.js';
import { mountMilitary } from './military.js';
import { mountAttack } from './attack.js';
import { mountResources } from './resources.js';
import { mountLand } from './land.js';
import { mountBuild } from './build.js';
import { mountChatbox } from './chatbox.js';
import { mountConfig } from './config.js';
import { mountProfile } from './profile.js';
import { mountWorld, homeRealm, showRealm } from './world.js';
import { mountState, openState, stateTitle } from './state.js';
import { watchCards } from './cards.js';
import { newsLine } from '../../core/words.js';

// Straightline's own page parts (not War Room panels): mount(host, on) -> { update(c), tick(), destroy() }.
const PARTS = { throne: mountThrone, military: mountMilitary, attack: mountAttack, resources: mountResources, land: mountLand, build: mountBuild, config: mountConfig, profile: mountProfile, world: mountWorld, state: mountState };

const KEY = 'realmstate.line.page';

/**
 * The menu: [group, [[page id, label, pane, tab, what it's for, extra]]]. Tabs pick a section inside a pane.
 * extra.part: a Straightline part instead of a pane (Throne); extra.top: a part drawn above the pane (Military's Train);
 * extra.chat: not a page, it opens the chat box.
 */
const MENU = [
  ['Your house', [
    ['throne', 'Throne', null, null, 'your house at a glance', { part: 'throne' }],
    ['resources', 'Resources', null, null, 'what you hold, and how it moved each tick', { part: 'resources' }],
    ['land', 'Land & Exploration', null, null, 'what land you hold, and explore for more', { part: 'land' }],
    ['build', 'Build & Raze', null, null, 'put up buildings on barren land, or raze them', { part: 'build' }],
  ]],
  ['Military', [
    ['military', 'Military', null, null, 'train troops; draft and release; medics, upgrades, chariots', { part: 'military' }],
    ['attack', 'Attack', null, null, 'send an army against another house', { part: 'attack' }],
    ['generals', 'Generals', 'mil', ['mil', 'generals'], 'raise and command generals'],
    ['hall', 'Hall of Deeds', 'mil', ['mil', 'hall'], 'trade generals and academics'],
  ]],
  ['Shadows & Magic', [
    ['intrigue', 'Intrigue', 'act', ['act', 'intrigue'], 'thieves’ operations and reports'],
    ['rites', 'Rites', 'act', ['act', 'rites'], 'rites and hexes'],
  ]],
  ['Learning', [
    ['science', 'Science', 'sci', ['sci', 'science'], 'books and sciences'],
    ['academics', 'Academics', 'sci', ['sci', 'academics'], 'your scholars and their attributes'],
    ['colloquium', 'Colloquium', 'sci', ['sci', 'colloquium'], 'your state’s shared research'],
    ['truths', 'Truths & Quests', 'sci', ['sci', 'truths'], 'your quest, the Truths you know, transmutation'],
  ]],
  ['State Matters', [
    ['state', 'State', null, null, 'the houses of your state', { part: 'state' }],
    ['leadership', 'Leadership', 'roster', ['state', 'leadership'], 'votes, treasury, tax'],
    ['world', 'World', null, null, 'the realms, and the states in each', { part: 'world' }],
    ['war', 'War', 'roster', ['state', 'war'], 'wars and relations'],
    ['work', 'Realm Work', 'roster', ['state', 'work'], 'your realm’s Specialised Materials Production'],
    ['wonders', 'World Wonders', 'roster', ['state', 'wonders'], 'start, fund and use wonders'],
    ['market', 'Market', 'res', ['res', 'market'], 'buy and sell materials'],
  ]],
  ['The world', [
    ['news', 'News', 'news', null, 'what happened to your house'],
    ['ranks', 'Rankings', 'rank', null, 'houses and states'],
  ]],
];
/** Pinned to the bottom of the menu. */
const FOOT = [
  ['profile', 'Profile', null, null, 'your account, and your house this age', { part: 'profile' }],
  ['config', 'Configuration', null, null, 'how the game looks and reads for you, in this browser', { part: 'config' }],
];
const PAGES = [...MENU.flatMap(([, items]) => items), ...FOOT].filter((p) => !p[5]?.chat);
/** Old page ids (bookmarks, a remembered page) and where they went. */
const MOVED = { buildings: 'build', orders: 'build' };
const page = (id) => PAGES.find((p) => p[0] === (MOVED[id] || id)) || PAGES[0];

const TEMPLATE = (view) => `
<div class="line">
<header class="line-top">
  <button type="button" class="burger" id="l-burger" aria-expanded="false" aria-controls="l-side" aria-label="Menu"><span aria-hidden="true"></span></button>
  <span class="brand"><span class="banner">Hegemoney:&nbsp;</span>Realmstate</span>
  <span class="who"><b id="l-name"></b> <span id="l-addr" class="dim"></span> <span id="l-ident" class="dim"></span></span>
  <span class="tick">Tick <b id="l-tick">–</b> · next <b id="l-next">–</b></span>
  <span class="end">${switchHTML(view)}
    <button type="button" id="l-fonts" class="btn" aria-expanded="false" aria-controls="l-fontpanel" title="Fonts (F)">Aa</button>
    <button type="button" id="l-theme" class="btn" aria-expanded="false" aria-controls="l-themepanel" title="Theme (P)"><span class="ico-pal" aria-hidden="true"></span><span class="vh">Theme</span></button>
    <button type="button" id="l-out" class="btn">Sign out</button></span>
</header>
<dl class="line-res" id="l-res" aria-label="Your house at a glance"></dl>
<div class="line-body">
  <div class="line-side" id="l-side">
    <div class="side-brand" aria-hidden="true"><span class="banner">Hegemoney:</span> REALMSTATE</div>
    <nav class="line-menu" id="l-menu" aria-label="Pages">
      ${MENU.map(([g, items]) => `<h2>${esc(g)}</h2><ul>${items.map(([id, label, , , what, extra]) =>
        `<li><a href="#${id}" ${extra?.chat ? 'data-chat aria-controls="lchat"' : `data-page="${id}"`} title="${esc(what)}">${esc(label)}</a></li>`).join('')}</ul>`).join('')}
      <ul><li><a href="#" class="out" data-out>Sign out</a></li></ul>
    </nav>
    <nav class="line-foot" aria-label="You">
      <ul>${FOOT.map(([id, label, , , what]) => `<li><a href="#${id}" data-page="${id}" title="${esc(what)}">${esc(label)}</a></li>`).join('')}</ul>
    </nav>
    <span class="l-sword" id="l-sword" aria-hidden="true"></span>
    <span class="l-shield" id="l-shield" aria-hidden="true"></span>
  </div>
  <main class="line-main room-scope" id="l-main" tabindex="-1">
    <div class="room">
      <header class="line-page-h"><h1 id="l-title"></h1><p class="line-what" id="l-what"></p></header>
      <div class="line-page line-pre detail-host" id="l-pre" hidden></div>
      <div class="line-page detail-host" id="l-page" tabindex="-1"></div>
    </div>
  </main>
</div>
<div class="line-scrim" id="l-scrim" hidden></div>
<div class="toasts" id="l-toasts" role="status" aria-live="polite" aria-label="New news"></div>
</div>`;

export function mount(root) {
  root.innerHTML = TEMPLATE('line');
  const $ = (id) => root.querySelector(`#l-${id}`);
  const ac = new AbortController();
  const on = (t, type, fn, o = {}) => t.addEventListener(type, fn, { signal: ac.signal, ...o });
  const panes = paneRunner($('page'), $('main'), { onShow: (name) => { const pg = PAGES.find((p) => p[2] === name); if (pg && page(current)[2] !== name) select(pg[0], { draw: false }); } });
  // A part's buttons can ask for a pane ("+3 more · detail"): go to that pane's first page.
  on(root, 'click', (ev) => { const x = ev.target.closest('.line-main [data-expand]'); if (x && x.dataset.expand) { const pg = PAGES.find((p) => p[2] === x.dataset.expand); if (pg) select(pg[0]); } });
  let current = null;
  let part = null;   // the page's Straightline part, if any
  let top = null;    // a part drawn above the page's pane, if any

  /** Opens a page: picks the pane's tab first, so the pane draws on that section. */
  function select(id, { draw = true, focus = false } = {}) {
    const [pid, label, pane, tab, what, extra = {}] = page(id);
    current = pid;
    try { localStorage.setItem(KEY, pid); } catch { /* storage off */ }
    if (location.hash.slice(1) !== pid) history.replaceState(null, '', `#${pid}`);
    root.querySelectorAll('.line-side [data-page]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.page === pid));
    // Keep the current row in view inside the menu (scrollIntoView would scroll the page too).
    requestAnimationFrame(() => {
      const a = menu.querySelector('[aria-current]');
      if (a && (a.offsetTop < menu.scrollTop || a.offsetTop + a.offsetHeight > menu.scrollTop + menu.clientHeight)) menu.scrollTop = a.offsetTop - menu.clientHeight / 2;
      place();
    });
    $('title').textContent = label;
    $('what').textContent = what;
    heading();
    $('main').dataset.page = pid;   // line.css styles some pages' headings by name (Throne's is centred, on its own)
    if (!draw) return;
    let opts = {};
    if (tab) {
      const [kind, t] = tab;
      if (kind === 'res') RES_TAB.set(t);
      else if (kind === 'mil') MIL_TAB.set(t);
      else if (kind === 'state') STATE_TAB.set(t);
      else if (kind === 'sci') SCI_TAB.set(t);
      else if (kind === 'act') opts = { tab: t };
    }
    // Parts first come down; then the part above (if any), and the page's own part or pane.
    top?.destroy(); top = null;
    part?.destroy(); part = null;
    $('pre').hidden = !extra.top;
    if (extra.top) top = PARTS[extra.top]($('pre'), on);
    if (extra.part) { panes.clear(); part = PARTS[extra.part]($('page'), on); }
    else panes.show(pane, { focus: false, ...opts });
    if (focus) $('page').focus({ preventScroll: true });
    $('main').scrollTop = 0;
  }

  /** Throne's heading: "Throne", and under it your house, of your state and realm (those muted). */
  function heading() {
    const h = store.house;
    if (!h || !['throne', 'state'].includes(current)) return;
    const st = store.state && store.state.realm === h.realm && store.state.state === h.state ? store.state : null;
    // State's heading is the state's own name, grand; under it its address and realm (the realm opens World).
    if (current === 'state') {
      // The state being looked at (yours, or another: state.js knows which).
      $('title').innerHTML = stateTitle() || `<span class="h-state">${esc(st?.name || `State ${h.realm}:${h.state}`)}</span> <span class="h-of">State ${h.state} of <a href="#world" data-home-realm>${esc(st?.realm_name || `Realm ${h.realm}`)}</a></span>`;
      return;
    }
    $('title').innerHTML = `<span class="h-page">Throne</span> <span class="h-house">${esc(h.name)} <span class="h-of">of ${esc(st?.name || `State ${h.realm}:${h.state}`)}, ${esc(st?.realm_name || `Realm ${h.realm}`)}</span></span>`;
  }

  function renderTop() {
    const h = store.house;
    if (!h) return;
    $('name').textContent = h.name;
    $('addr').textContent = addr(h);
    $('ident').textContent = `· ${raceName(h.race)}, ${persName(h.personality)}`;
    const items = [['Land', h.land + (h.incoming_land ? ` (+${fmt(h.incoming_land)})` : '')], ['Peasants', h.peasants], ['Gold', h.gold], ['Food', h.food],
      ['Soldiers', h.units[0]], ['Might', h.might], ['Renown', h.renown]];
    // Protection, while it lasts: a marker at the end of the line (it used to be a box on every page).
    const prot = isProtected(h)
      ? `<div class="prot" title="Protected until tick ${fmt(h.protected_until)}: no one can attack you, and you can't attack. Build up while it lasts."><dt>Protected</dt><dd>${fmt(h.protected_until - h.ticks_now)} ticks left</dd></div>` : '';
    $('res').innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${typeof v === 'number' ? fmt(v) : esc(v)}</dd></div>`).join('') + prot;
  }
  function renderTick() {
    $('tick').textContent = store.age ? `${fmt(store.tick)} / ${fmt(store.age.age_ticks)}` : fmt(store.tick);
    $('next').textContent = countdown() || '–';
  }

  // Throne's realm link opens World on your own realm.
  // A state's realm link opens World on that realm; World's state links open that state; Throne's opens yours.
  on($('main'), 'click', (ev) => {
    if (ev.target.closest('[data-home-realm]')) homeRealm();
    const r = ev.target.closest('[data-realm]');
    if (r) showRealm(Number(r.dataset.realm));
    const s = ev.target.closest('[data-open-state]');
    if (s) { const [a, b] = s.dataset.openState.split(':').map(Number); openState(a, b); }
    if (ev.target.closest('[data-home-state]')) openState();
  });
  // The menu's State opens your own state.
  on(root.querySelector('.line-side'), 'click', (ev) => { if (ev.target.closest('[data-page="state"]')) openState(); });
  on(root.querySelector('.line-side'), 'click', (ev) => {
    if (ev.target.closest('[data-chat]')) { ev.preventDefault(); chat.open(); return; }
    const a = ev.target.closest('[data-page]');
    if (!a) return;
    ev.preventDefault();
    select(a.dataset.page, { focus: true });
  });
  const known = (id) => !!id && (PAGES.some((p) => p[0] === id) || id in MOVED);
  on(window, 'hashchange', () => {
    const id = location.hash.slice(1);
    if (id === 'chat') { history.replaceState(null, '', `#${current}`); chat.open(); return; }
    if (!known(id)) return;
    if (page(id)[0] !== current) select(id);
    else if (id !== current) history.replaceState(null, '', `#${current}`);   // an old id for the page you're on
  });
  on($('out'), 'click', () => act.signOut());
  on(root.querySelector('[data-out]'), 'click', (ev) => { ev.preventDefault(); act.signOut(); });
  mountLook(root, on);

  // News as it arrives: a small card bottom right, with a link to the News page (not while you're on it).
  const MAX_TOASTS = 3, TOAST_MS = 10000;
  let lastMsg = store.msg.text;
  /** A card in the stack: news (with its link to the News page) or a message from an order (store.msg). */
  function toast(n) { const [text, tone] = newsLine(n); card(text, tone, { news: true }); }
  function card(text, tone, { news = false, ms = TOAST_MS } = {}) {
    const el = document.createElement('div');
    el.className = `toast ${tone || ''}${news ? '' : ' msg'}`;
    el.innerHTML = `<p>${esc(text)}</p>${news ? '<a href="#news" data-page="news">Open News →</a>' : ''}<button type="button" class="x" aria-label="Dismiss">×</button>`;
    const box = $('toasts');
    box.prepend(el);
    while (box.children.length > MAX_TOASTS) box.lastElementChild.remove();
    let left = ms, last = Date.now(), timer = null;
    const go = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    const run = () => { last = Date.now(); timer = setTimeout(go, left); };
    el.addEventListener('mouseenter', () => { clearTimeout(timer); left -= Date.now() - last; });
    el.addEventListener('mouseleave', run);
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('.x')) return go();
      if (ev.target.closest('[data-page]')) { ev.preventDefault(); go(); select('news', { focus: true }); }
    });
    run();
  }

  // The menu scrolls as the wiki's does: a sword is the handle (left edge; drag it, or scroll the menu as usual), and the
  // current page's broken shield sits on the menu's right border, level with its row (at the top or bottom edge
  // once the row has scrolled away). Both are tinted to the theme.
  const menu = $('menu'), sword = $('sword'), shield = $('shield'), side = root.querySelector('.line-side');
  const PAD = 8;
  function placeSword() {
    const room = menu.scrollHeight - menu.clientHeight;
    sword.hidden = room <= 1;
    if (sword.hidden) return;
    const track = menu.clientHeight - sword.offsetHeight - PAD * 2;
    sword.style.top = `${menu.offsetTop + PAD + (menu.scrollTop / room) * track}px`;
  }
  function placeShield() {
    const a = menu.querySelector('a[aria-current]');
    shield.hidden = !a;
    if (!a) return;
    const r = a.getBoundingClientRect(), n = menu.getBoundingClientRect(), half = shield.offsetHeight / 2;
    const mid = Math.min(Math.max(r.top + r.height / 2, n.top + half), n.bottom - half);
    shield.style.top = `${mid - side.getBoundingClientRect().top}px`;
  }
  const place = () => { placeSword(); placeShield(); };

  // Phones: the menu is a drawer behind the ☰ button. Picking a page, the scrim or Esc closes it.
  const burger = $('burger'), scrim = $('scrim');
  const phone = () => matchMedia('(max-width: 760px)').matches;
  function drawer(open) {
    side.classList.toggle('open', open);
    scrim.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('line-drawer', open);
    if (open) requestAnimationFrame(() => { place(); (menu.querySelector('[aria-current]') || menu.querySelector('a'))?.focus(); });
  }
  on(burger, 'click', () => drawer(!side.classList.contains('open')));
  on(scrim, 'click', () => { drawer(false); burger.focus(); });
  on(document, 'keydown', (ev) => { if (ev.key === 'Escape' && side.classList.contains('open')) { drawer(false); burger.focus(); } });
  on(side, 'click', (ev) => { if (phone() && ev.target.closest('a')) drawer(false); });   // any link in the drawer, the pinned Profile and Configuration too
  on(window, 'resize', () => { if (!phone() && side.classList.contains('open')) drawer(false); });
  on(menu, 'scroll', place, { passive: true });
  on(window, 'resize', place);
  on(sword, 'pointerdown', (ev) => {
    ev.preventDefault();
    sword.setPointerCapture(ev.pointerId);
    const y0 = ev.clientY, s0 = menu.scrollTop;
    const per = (menu.scrollHeight - menu.clientHeight) / Math.max(1, menu.clientHeight - sword.offsetHeight - PAD * 2);
    const move = (e) => { menu.scrollTop = s0 + (e.clientY - y0) * per; };
    sword.addEventListener('pointermove', move);
    sword.addEventListener('pointerup', () => sword.removeEventListener('pointermove', move), { once: true });
  });
  document.fonts?.ready.then(place);

  const stopCards = watchCards([$('page'), $('pre')], on);
  const chat = mountChatbox(root.querySelector('.line'), on);


  const unsub = subscribe((c) => {
    if (c.has('news') && current !== 'news') for (const d of c.get('news')) if (d.added) toast(d.added);
    // Messages from orders ("Built 10 Homes", errors) come as cards too: Straightline has no message line
    // (it moved the page each time it changed). Errors stay until dismissed or replaced; the rest go after 5 s.
    if (c.has('msg') && store.msg.text && store.msg.text !== lastMsg) card(store.msg.text, store.msg.tone, { ms: store.msg.tone === 'bad' ? 30000 : 5000 });
    if (c.has('msg')) lastMsg = store.msg.text;
    if (c.has('house') || c.has('me') || c.has('rules')) renderTop();
    if (c.has('house') || c.has('state')) heading();
    if (c.has('age') || c.has('clock')) renderTick();
    if (c.has('clock')) { panes.tick(); part?.tick(); top?.tick(); }
    if (part) part.update(c); else panes.update(c);
    chat.update(c);
    top?.update(c);
  });

  renderTop(); renderTick();
  let start = location.hash.slice(1);
  if (!known(start)) { try { start = localStorage.getItem(KEY) || 'throne'; } catch { start = 'throne'; } }
  select(start);

  return {
    unmount() {
      ac.abort();
      unsub();
      panes.clear();
      part?.destroy(); top?.destroy();
      chat.destroy();
      clearLook();
      document.documentElement.classList.remove('line-drawer');
      stopCards();
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      root.replaceChildren();
    },
  };
}
