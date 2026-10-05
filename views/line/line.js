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
import { mountTrain } from './train.js';
import { mountResources } from './resources.js';
import { newsLine } from '../../core/words.js';

// Straightline's own page parts (not War Room panels): mount(host, on) -> { update(c), tick(), destroy() }.
const PARTS = { throne: mountThrone, train: mountTrain, resources: mountResources };

const KEY = 'realmstate.line.page';

/**
 * The menu: [group, [[page id, label, pane, tab, what it's for, extra]]]. Tabs pick a section inside a pane.
 * extra.show: only the pane's sections matching this ('train'); extra.hide: its sections to leave out;
 * extra.part: a Straightline part instead of a pane (Throne); extra.top: a part drawn above the pane (Military's Train).
 */
const MENU = [
  ['Your house', [
    ['throne', 'Throne', null, null, 'your house at a glance', { part: 'throne' }],
    ['resources', 'Resources', null, null, 'what you hold, and how it moved each tick', { part: 'resources' }],
    ['buildings', 'Buildings', 'res', ['res', 'buildings'], 'land, construction, what each building does'],
    ['orders', 'Explore & build', 'act', ['act', 'orders'], 'explore land and build', { hide: 'train' }],
    ['science', 'Science', 'sci', ['sci', 'science'], 'books and sciences'],
    ['academics', 'Academics', 'sci', ['sci', 'academics'], 'your scholars and their attributes'],
    ['colloquium', 'Colloquium', 'sci', ['sci', 'colloquium'], 'your state’s shared research'],
  ]],
  ['Military', [
    ['military', 'Military', 'mil', ['mil', 'forces'], 'train troops; troops, draft, medics, upgrades', { top: 'train' }],
    ['attack', 'Attack', 'act', ['act', 'attacks'], 'send an army'],
    ['generals', 'Generals', 'mil', ['mil', 'generals'], 'raise and command generals'],
    ['hall', 'Hall of Deeds', 'mil', ['mil', 'hall'], 'trade generals and academics'],
  ]],
  ['Shadows', [
    ['intrigue', 'Intrigue', 'act', ['act', 'intrigue'], 'thieves’ operations and reports'],
    ['rites', 'Rites', 'act', ['act', 'rites'], 'rites and hexes'],
  ]],
  ['Your state', [
    ['state', 'State', 'roster', ['state', 'members'], 'the houses of your state'],
    ['leadership', 'Leadership', 'roster', ['state', 'leadership'], 'votes, treasury, tax'],
    ['war', 'War', 'roster', ['state', 'war'], 'wars and relations'],
    ['market', 'Market', 'res', ['res', 'market'], 'buy and sell materials'],
  ]],
  ['The world', [
    ['news', 'News', 'news', null, 'what happened to your house'],
    ['chat', 'Chat', 'chat', null, 'world, realm and state'],
    ['ranks', 'Rankings', 'rank', null, 'houses and states'],
  ]],
];
const PAGES = MENU.flatMap(([, items]) => items);
const page = (id) => PAGES.find((p) => p[0] === id) || PAGES[0];

const TEMPLATE = (view) => `
<div class="line">
<header class="line-top">
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
  <nav class="line-menu" aria-label="Pages">
    ${MENU.map(([g, items]) => `<h2>${esc(g)}</h2><ul>${items.map(([id, label, , , what]) =>
      `<li><a href="#${id}" data-page="${id}" title="${esc(what)}">${esc(label)}</a></li>`).join('')}</ul>`).join('')}
  </nav>
  <main class="line-main room-scope" id="l-main" tabindex="-1">
    <div class="room">
      <header class="line-page-h"><h1 id="l-title"></h1><div class="orn-rule" aria-hidden="true"></div></header>
      <p class="line-protect" id="l-protect" hidden></p>
      <div class="line-page line-pre detail-host" id="l-pre" hidden></div>
      <div class="line-page detail-host" id="l-page" tabindex="-1"></div>
    </div>
  </main>
</div>
<div class="toasts" id="l-toasts" role="status" aria-live="polite" aria-label="New news"></div>
</div>`;

export function mount(root) {
  root.innerHTML = TEMPLATE('line');
  const $ = (id) => root.querySelector(`#l-${id}`);
  const ac = new AbortController();
  const on = (t, type, fn, o = {}) => t.addEventListener(type, fn, { signal: ac.signal, ...o });
  const panes = paneRunner($('page'), $('main'), { onShow: (name) => { if (page(current)[2] !== name) select(PAGES.find((p) => p[2] === name)[0], { draw: false }); } });
  // A part's buttons can ask for a pane ("+3 more · detail"): go to that pane's first page.
  on(root, 'click', (ev) => { const x = ev.target.closest('.line-main [data-expand]'); if (x && x.dataset.expand) { const pg = PAGES.find((p) => p[2] === x.dataset.expand); if (pg) select(pg[0]); } });
  let current = null;
  let part = null;   // the page's Straightline part, if any
  let top = null;    // a part drawn above the page's pane, if any

  /** Opens a page: picks the pane's tab first, so the pane draws on that section. */
  function select(id, { draw = true, focus = false } = {}) {
    const [pid, label, pane, tab, , extra = {}] = page(id);
    current = pid;
    try { localStorage.setItem(KEY, pid); } catch { /* storage off */ }
    if (location.hash.slice(1) !== pid) history.replaceState(null, '', `#${pid}`);
    root.querySelectorAll('[data-page]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.page === pid));
    $('title').textContent = label;
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
    // Sections: only some of a pane (data-show), or all but some (data-hide); line.css does the hiding.
    $('page').dataset.show = extra.show || '';
    $('page').dataset.hide = extra.hide || '';
    if (extra.part) { panes.clear(); part = PARTS[extra.part]($('page'), on); }
    else panes.show(pane, { focus: false, ...opts });
    if (focus) $('page').focus({ preventScroll: true });
    $('main').scrollTop = 0;
  }

  function renderTop() {
    const h = store.house;
    if (!h) return;
    $('name').textContent = h.name;
    $('addr').textContent = addr(h);
    $('ident').textContent = `· ${raceName(h.race)}, ${persName(h.personality)}`;
    const items = [['Land', h.land + (h.incoming_land ? ` (+${fmt(h.incoming_land)})` : '')], ['Peasants', h.peasants], ['Gold', h.gold], ['Food', h.food],
      ['Soldiers', h.units[0]], ['Might', h.might], ['Renown', h.renown]];
    $('res').innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${typeof v === 'number' ? fmt(v) : esc(v)}</dd></div>`).join('');
    const prot = isProtected(h);
    $('protect').hidden = !prot;
    if (prot) $('protect').innerHTML = `<b>Protected</b> until tick ${fmt(h.protected_until)}: no one can attack you, and you can't attack. Build up while it lasts.`;
  }
  function renderTick() {
    $('tick').textContent = store.age ? `${fmt(store.tick)} / ${fmt(store.age.age_ticks)}` : fmt(store.tick);
    $('next').textContent = countdown() || '–';
  }

  on(root.querySelector('.line-menu'), 'click', (ev) => {
    const a = ev.target.closest('[data-page]');
    if (!a) return;
    ev.preventDefault();
    select(a.dataset.page, { focus: true });
  });
  on(window, 'hashchange', () => { const id = location.hash.slice(1); if (id && id !== current && PAGES.some((p) => p[0] === id)) select(id); });
  on($('out'), 'click', () => act.signOut());
  mountLook(root, on);

  // News as it arrives: a small card bottom right, with a link to the News page (not while you're on it).
  const MAX_TOASTS = 3, TOAST_MS = 10000;
  function toast(n) {
    const [text, tone] = newsLine(n);
    const el = document.createElement('div');
    el.className = `toast ${tone || ''}`;
    el.innerHTML = `<p>${esc(text)}</p><a href="#news" data-page="news">Open News →</a><button type="button" class="x" aria-label="Dismiss">×</button>`;
    const box = $('toasts');
    box.prepend(el);
    while (box.children.length > MAX_TOASTS) box.lastElementChild.remove();
    let left = TOAST_MS, last = Date.now(), timer = null;
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

  const unsub = subscribe((c) => {
    if (c.has('news') && current !== 'news') for (const d of c.get('news')) if (d.added) toast(d.added);
    if (c.has('house') || c.has('me') || c.has('rules')) renderTop();
    if (c.has('age') || c.has('clock')) renderTick();
    if (c.has('clock')) { panes.tick(); part?.tick(); top?.tick(); }
    if (part) part.update(c); else panes.update(c);
    top?.update(c);
  });

  renderTop(); renderTick();
  let start = location.hash.slice(1);
  if (!PAGES.some((p) => p[0] === start)) { try { start = localStorage.getItem(KEY) || 'throne'; } catch { start = 'throne'; } }
  select(start);

  return {
    unmount() {
      ac.abort();
      unsub();
      panes.clear();
      part?.destroy(); top?.destroy();
      clearLook();
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      root.replaceChildren();
    },
  };
}
