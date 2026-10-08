// Straightline's World: the whole map at a glance. A line of totals; then two tabs. Realms: every realm as a card
// (its material, houses, land and might, its leading state), and the chosen realm's states in full (ranks, leader,
// wars). States: every state that holds a house, ranked by land, might or renown. All public: /realms/:n (with each
// state's ranks), /wars.
import { store } from '../../core/store.js';
import { api } from '../../core/api.js';
import { fmt, esc } from '../../core/words.js';

let shown = null;   // the realm last looked at, kept while the page is open again
/** The next time World opens, it opens on your own realm (the Throne's realm link). */
export function homeRealm() { shown = null; }
/** The next time World opens, it opens on this realm (a state's realm link). */
export function showRealm(n) { shown = n || null; }

const TABS = [['realms', 'Realms'], ['states', 'States']];
const KEY = 'realmstate.line.world.tab';
const SORTS = [['land', 'Land'], ['might', 'Might'], ['renown', 'Renown']];
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export function mountWorld(host, on) {
  const P = store.rules?.params || {}, REALMS = P.realms || 13, SEATS = P.houses_per_state || 15;
  const mine = store.house?.realm || 1, myState = store.house?.state;
  let realm = shown || mine, tab = 'realms', sort = 'land';
  try { const t = localStorage.getItem(KEY); if (TABS.some(([k]) => k === t)) tab = t; } catch { /* storage off */ }
  host.innerHTML = `<div class="lpart lworld">
    <dl class="st-glance wd-glance" id="wd-glance"></dl>
    <div class="ltabs" role="tablist" aria-label="World">${TABS.map(([t, label]) =>
      `<button type="button" role="tab" id="wd-tab-${t}" aria-controls="wd-${t}" data-tab="${t}">${label}</button>`).join('')}</div>
    <div role="tabpanel" id="wd-realms" aria-labelledby="wd-tab-realms" data-panel="realms">
      <div class="wd-cards" id="wd-cards" role="list" aria-label="Realms"></div>
      <section class="wd-realm" id="wd-realm" aria-live="polite"></section>
    </div>
    <div role="tabpanel" id="wd-states" aria-labelledby="wd-tab-states" data-panel="states">
      <p class="what">Every state that holds a house, ranked. Sort by land, might or renown.</p>
      <div class="scrollx"><table class="tbl wd-rank"><thead><tr><th class="num">#</th><th>State</th><th>Realm</th><th class="num">Houses</th>
        ${SORTS.map(([k, label]) => `<th class="num" data-sorth="${k}"><button type="button" class="wd-sort" data-sort="${k}">${label}</button></th>`).join('')}</tr></thead><tbody id="wd-rows"></tbody></table></div>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#wd-${id}`);
  const realms = new Map();   // realm number -> /realms/:n
  let wars = null;

  // ---------- tabs ----------
  const bar = host.querySelector('.ltabs');
  function showTab(t, focus = false) {
    tab = t;
    try { localStorage.setItem(KEY, t); } catch { /* storage off */ }
    host.querySelectorAll('[role=tab]').forEach((b) => { const sel = b.dataset.tab === t; b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; });
    host.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (focus) $(`tab-${t}`).focus({ preventScroll: true });
  }
  on(bar, 'click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  on(bar, 'keydown', (ev) => {
    const i = TABS.findIndex(([t]) => t === tab), n = TABS.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    showTab(TABS[j][0], true);
  });

  // ---------- data ----------
  const statesOf = (r) => (realms.get(r)?.states || []).map((s) => ({ ...s, realm: r, realm_name: realms.get(r).name }));
  const allStates = () => [...realms.keys()].flatMap(statesOf);
  const total = (r, k) => statesOf(r).reduce((a, s) => a + (s.ranks?.[k]?.total || 0), 0);
  /** The war a state is in now: the other side's address, or null. */
  function warOf(r, st) {
    for (const w of wars?.wars || []) {
      const [a, b] = [w.a, w.b];
      if (a.realm === r && a.state === st) return b;
      if (b.realm === r && b.state === st) return a;
    }
    return null;
  }
  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    const got = await Promise.allSettled([...Array.from({ length: REALMS }, (_, k) => api(`/realms/${k + 1}`)), api('/wars')]);
    if (seq !== loadSeq) return;
    got.slice(0, REALMS).forEach((g, k) => { if (g.status === 'fulfilled') realms.set(k + 1, g.value); });
    if (got[REALMS].status === 'fulfilled') wars = got[REALMS].value;
    draw();
  }

  // ---------- drawing ----------
  function glance() {
    const st = allStates().filter((s) => s.houses), houses = st.reduce((a, s) => a + s.houses, 0);
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    $('glance').innerHTML = card('Realms', fmt(REALMS), `${fmt(P.states_per_realm || 7)} states each`) + card('States with houses', fmt(st.length), `of ${fmt(REALMS * (P.states_per_realm || 7))}`)
      + card('Houses', fmt(houses), `up to ${fmt(SEATS)} a state`) + card('Wars', fmt((wars?.wars || []).length), wars?.ceasefires?.length ? `${fmt(wars.ceasefires.length)} ceasefires` : 'none at present');
  }
  function cards() {
    $('cards').innerHTML = Array.from({ length: REALMS }, (_, k) => k + 1).map((n) => {
      const r = realms.get(n), sts = statesOf(n).filter((s) => s.houses), houses = sts.reduce((a, s) => a + s.houses, 0);
      const lead = [...sts].sort((a, b) => (a.ranks?.land?.rank ?? 1e9) - (b.ranks?.land?.rank ?? 1e9))[0];
      const cls = ['wd-card', n === realm ? 'on' : '', n === mine ? 'yours' : '', houses ? '' : 'empty'].filter(Boolean).join(' ');
      return `<button type="button" role="listitem" class="${cls}" data-realm="${n}" aria-pressed="${n === realm}">
        <span class="wd-n">Realm ${n}${n === mine ? ' · yours' : ''}</span><span class="wd-name">${esc(r?.name || '…')}</span>
        <span class="wd-mat">${esc(cap(r?.material))}</span>
        <span class="wd-figs">${houses ? `${fmt(houses)} house${houses === 1 ? '' : 's'} · ${fmt(total(n, 'land'))} acres` : 'No houses yet'}</span>
        ${lead ? `<span class="wd-lead">Leading: ${esc(lead.name)}</span>` : ''}</button>`;
    }).join('');
  }
  function realmPanel() {
    const r = realms.get(realm);
    if (!r) { $('realm').innerHTML = '<p class="dim">Loading…</p>'; return; }
    const houses = statesOf(realm).reduce((a, s) => a + s.houses, 0);
    const rank = (s, k) => (s.ranks ? `${fmt(s.ranks[k].total)} <span class="wd-rk" title="${s.ranks[k].rank} of ${s.ranks[k].of} states">#${s.ranks[k].rank}</span>` : '<span class="dim">–</span>');
    $('realm').innerHTML = `<div class="wd-rhead">
        <button type="button" class="btn" data-step="-1" aria-label="Previous realm">‹</button>
        <h3>${esc(r.name)} <span class="dim">Realm ${realm} · ${esc(cap(r.material))} · ${fmt(houses)} house${houses === 1 ? '' : 's'} · ${fmt(total(realm, 'land'))} acres · ${fmt(total(realm, 'might'))} might</span></h3>
        <button type="button" class="btn" data-step="1" aria-label="Next realm">›</button>
        ${realm !== mine ? '<button type="button" class="btn" data-home>Your realm</button>' : ''}</div>
      <div class="scrollx"><table class="tbl wd-tbl"><thead><tr><th class="num">State</th><th>Name</th><th class="num">Houses</th><th class="num">Land</th><th class="num">Might</th><th class="num">Renown</th><th>Leader</th>
        <th class="num"><abbr title="Its share of the realm's ${esc(r.material)}">${esc(cap(r.material))}</abbr></th><th>At war</th></tr></thead><tbody>
      ${statesOf(realm).map((s, k) => {
        const yours = realm === mine && s.state === myState, foe = warOf(realm, s.state);
        return `<tr class="${[yours ? 'self' : '', s.houses ? '' : 'empty', k % 2 ? 'alt' : ''].filter(Boolean).join(' ')}"><td class="num dim">${realm}:${s.state}</td>
          <th scope="row"><a href="#state" data-open-state="${realm}:${s.state}">${esc(s.name)}</a>${yours ? ' <span class="dim">(yours)</span>' : ''}</th>
          <td class="num">${fmt(s.houses)}<span class="dim">/${SEATS}</span></td><td class="num">${rank(s, 'land')}</td><td class="num">${rank(s, 'might')}</td><td class="num">${rank(s, 'renown')}</td>
          <td>${s.leader ? esc(s.leader.name) : '<span class="dim">–</span>'}</td><td class="num">${(s.share_bp / 100).toFixed(1)}%</td>
          <td>${foe ? `<a href="#state" data-open-state="${foe.realm}:${foe.state}" class="wd-war">with ${foe.realm}:${foe.state}</a>` : '<span class="dim">–</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="note">Ranks (#) are among every state that holds a house. A state's name opens its page.</p>`;
  }
  function ranking() {
    const list = allStates().filter((s) => s.houses && s.ranks).sort((a, b) => a.ranks[sort].rank - b.ranks[sort].rank || a.realm - b.realm || a.state - b.state);
    host.querySelectorAll('[data-sorth]').forEach((th) => { th.setAttribute('aria-sort', th.dataset.sorth === sort ? 'descending' : 'none'); });
    $('rows').innerHTML = list.map((s, k) => {
      const yours = s.realm === mine && s.state === myState;
      return `<tr class="${[yours ? 'self' : '', k % 2 ? 'alt' : ''].filter(Boolean).join(' ')}"><td class="num">${s.ranks[sort].rank}</td>
        <th scope="row"><a href="#state" data-open-state="${s.realm}:${s.state}">${esc(s.name)}</a> <span class="dim">${s.realm}:${s.state}</span>${yours ? ' <span class="dim">(yours)</span>' : ''}</th>
        <td><a href="#world" data-pick-realm="${s.realm}">${esc(s.realm_name)}</a></td><td class="num">${fmt(s.houses)}</td>
        ${SORTS.map(([k]) => `<td class="num${k === sort ? ' on' : ''}">${fmt(s.ranks[k].total)}</td>`).join('')}</tr>`;
    }).join('') || '<tr><td colspan="7" class="dim">Loading…</td></tr>';
  }
  function draw() { glance(); cards(); realmPanel(); ranking(); }

  function pick(n) { realm = shown = ((n - 1 + REALMS) % REALMS) + 1; cards(); realmPanel(); }
  on($('cards'), 'click', (ev) => { const b = ev.target.closest('[data-realm]'); if (b) pick(Number(b.dataset.realm)); });
  on($('realm'), 'click', (ev) => {
    const b = ev.target.closest('button');
    if (b?.dataset.step) pick(realm + Number(b.dataset.step));
    if (b && 'home' in b.dataset) pick(mine);
  });
  on($('states'), 'click', (ev) => {
    const s = ev.target.closest('[data-sort]');
    if (s) { sort = s.dataset.sort; ranking(); }
    const r = ev.target.closest('[data-pick-realm]');
    if (r) { ev.preventDefault(); pick(Number(r.dataset.pickRealm)); showTab('realms'); $('realm').scrollIntoView({ block: 'start' }); }
  });

  showTab(tab);
  draw();
  load();
  let last = Date.now();
  return {
    // Rankings change every tick; read the realms again at most every 30 seconds.
    update(c) { if (c?.has('rankings') && Date.now() - last > 30000) { last = Date.now(); load(); } },
    tick() {},
    destroy() { host.replaceChildren(); },
    /** Opens a realm (the Throne's realm link opens yours). */
    open(n) { pick(n); },
  };
}
