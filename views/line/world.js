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
/** Materials with an icon (views/line/assets/materials/<id>.png; the path is the stylesheet's, line.css, where the mask is drawn). */
const MAT_ICONS = new Set(['bauxite', 'limestone', 'amber', 'pine', 'sulfur', 'paper']);
/** A realm card's watermark: its material, faint, as Throne's throne (line.css draws it as a mask). */
const matMark = (m) => (MAT_ICONS.has(m) ? ` style="--ico:url('assets/materials/${m}.png')"` : '');

export function mountWorld(host, on) {
  const P = store.rules?.params || {}, REALMS = P.realms || 13, SEATS = P.houses_per_state || 15;
  const mine = store.house?.realm || 1, myState = store.house?.state;
  let realm = shown || mine, tab = 'realms', sort = 'land', sview = 'cards';   // States opens as cards unless you chose the list
  try { if (localStorage.getItem(`${KEY}.states`) === 'list') sview = 'list'; } catch { /* storage off */ }
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
      <div class="wd-shead"><p class="what" id="wd-swhat"></p>
        <span class="wd-views" role="group" aria-label="Show states as"><button type="button" class="btn" data-sview="list">List</button><button type="button" class="btn" data-sview="cards">Cards</button></span></div>
      <div class="wd-grid" id="wd-grid" hidden></div>
      <div class="scrollx" id="wd-list"><table class="tbl wd-rank"><thead><tr><th class="num">#</th><th>State</th><th>Realm</th><th class="num">Houses</th>
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
      const cls = ['wd-card', n === realm ? 'on' : '', n === mine ? 'yours' : '', houses ? '' : 'empty'].filter(Boolean).join(' ');
      return `<button type="button" role="listitem" class="${cls}${MAT_ICONS.has(r?.material) ? ' marked' : ''}" data-realm="${n}" aria-pressed="${n === realm}"${matMark(r?.material)}>
        <span class="wd-n">Realm ${n}${n === mine ? ' · yours' : ''}</span><span class="wd-name">${esc(r?.name || '…')}</span>
        ${r?.material ? `<span class="wd-mat" data-mat="${esc(r.material)}">${esc(cap(r.material))}</span>` : ''}
        <span class="wd-figs">${houses ? `${fmt(houses)} house${houses === 1 ? '' : 's'} · ${fmt(total(n, 'land'))} acres` : 'No houses yet'}</span>
</button>`;
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
      <div class="wd-scards" role="list" aria-label="States of ${esc(r.name)}">${statesOf(realm).map((s) => {
        const yours = realm === mine && s.state === myState, foe = warOf(realm, s.state);
        const fig = (k, label) => `<span class="wd-f"><span class="wd-fl">${label}</span>${s.ranks ? `${fmt(s.ranks[k].total)}<span class="wd-rk">#${s.ranks[k].rank}</span>` : '<span class="dim">–</span>'}</span>`;
        return `<a href="#state" role="listitem" data-open-state="${realm}:${s.state}" class="${['wd-scard', yours ? 'yours' : '', s.houses ? '' : 'empty', foe ? 'war' : ''].filter(Boolean).join(' ')}">
          <span class="wd-n">State ${realm}:${s.state}${yours ? ' · yours' : ''}</span><span class="wd-name">${esc(s.name)}</span>
          <span class="wd-hs">${fmt(s.houses)} of ${SEATS} houses${s.leader ? ` · led by ${esc(s.leader.name)}` : ''}</span>
          <span class="wd-figs3">${fig('land', 'Land')}${fig('might', 'Might')}${fig('renown', 'Renown')}</span>
          <span class="wd-foot">${esc(cap(r.material))} ${(s.share_bp / 100).toFixed(1)}%${foe ? ` · <span class="wd-war">at war with ${foe.realm}:${foe.state}</span>` : ''}</span></a>`;
      }).join('')}</div>
      <p class="note">Ranks (#) are among every state that holds a house. Select a state to open its page.</p>`;
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
  /** States as cards: one row a realm, its seven states in order; a state at war names its foe (data-foe). */
  function grid() {
    $('grid').innerHTML = Array.from({ length: REALMS }, (_, k) => k + 1).map((n) => {
      const r = realms.get(n);
      return `<div class="wd-grow" role="list" aria-label="${esc(r?.name || `Realm ${n}`)}"><span class="wd-rlabel">${n}<span>${esc(r?.name || '')}</span></span>${statesOf(n).map((s) => {
        const yours = n === mine && s.state === myState, foe = warOf(n, s.state);
        const fig = (k, label) => `<span class="wd-gf"><span>${label}</span>${s.ranks ? `#${s.ranks[k].rank}` : '–'}</span>`;
        return `<a href="#state" role="listitem" data-open-state="${n}:${s.state}" data-addr="${n}:${s.state}"${foe ? ` data-foe="${foe.realm}:${foe.state}"` : ''}
          class="${['wd-gcard', yours ? 'yours' : '', s.houses ? '' : 'empty', foe ? 'war' : ''].filter(Boolean).join(' ')}" title="${esc(s.name)} (${n}:${s.state})${foe ? `, at war with ${foe.realm}:${foe.state}` : ''}">
          <span class="wd-n">${n}:${s.state}${yours ? ' · yours' : ''}</span><span class="wd-gname">${esc(s.name)}</span>
          <span class="wd-hs">${fmt(s.houses)}/${SEATS} houses</span>
          <span class="wd-gfigs">${fig('land', 'Land')}${fig('might', 'Might')}${fig('renown', 'Ren.')}</span>
          ${foe ? `<span class="wd-gwar">War · ${foe.realm}:${foe.state}</span>` : ''}</a>`;
      }).join('')}</div>`;
    }).join('');
  }
  function views() {
    host.querySelectorAll('[data-sview]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sview === sview)));
    $('grid').hidden = sview !== 'cards'; $('list').hidden = sview !== 'list';
    $('swhat').textContent = sview === 'cards' ? 'Every state, realm by realm; ranks (#) are among every state that holds a house. Point at a state at war to see its foe.' : 'Every state that holds a house, ranked. Sort by land, might or renown.';
  }
  function draw() { glance(); cards(); realmPanel(); ranking(); grid(); views(); }

  function pick(n) { realm = shown = ((n - 1 + REALMS) % REALMS) + 1; cards(); realmPanel(); }
  on($('cards'), 'click', (ev) => { const b = ev.target.closest('[data-realm]'); if (b) pick(Number(b.dataset.realm)); });
  on($('realm'), 'click', (ev) => {
    const b = ev.target.closest('button');
    if (b?.dataset.step) pick(realm + Number(b.dataset.step));
    if (b && 'home' in b.dataset) pick(mine);
  });
  on($('states'), 'click', (ev) => {
    const v = ev.target.closest('[data-sview]');
    if (v) { sview = v.dataset.sview; try { localStorage.setItem(`${KEY}.states`, sview); } catch { /* storage off */ } views(); return; }
    const s = ev.target.closest('[data-sort]');
    if (s) { sort = s.dataset.sort; ranking(); }
    const r = ev.target.closest('[data-pick-realm]');
    if (r) { ev.preventDefault(); pick(Number(r.dataset.pickRealm)); showTab('realms'); $('realm').scrollIntoView({ block: 'start' }); }
  });

  // A state at war, pointed at or focused: it and its foe light up together.
  const lit = (card, on2) => {
    const foe = card?.dataset.foe && $('grid').querySelector(`[data-addr="${card.dataset.foe}"]`);
    card?.classList.toggle('lit', on2); foe?.classList.toggle('lit', on2); foe?.classList.toggle('foe', on2);
  };
  for (const [ev, on2] of [['mouseover', true], ['focusin', true], ['mouseout', false], ['focusout', false]]) {
    on($('grid'), ev, (e) => { const c = e.target.closest('.wd-gcard.war'); if (c && !(e.relatedTarget && c.contains(e.relatedTarget))) lit(c, on2); });
  }

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
