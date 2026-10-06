// The ages window: a modal over the page (the War Room or the gate), like the detail views.
// AGE: where this age stands and when the next starts. RECAP: an age replayed. RESULTS: the
// victory window. STAFF: the age controls, for staff only. RECAP and RESULTS show any age: the
// current one, or an earlier one by number. Opened from the age bar, or /age, /recap, /results.
import { store, subscribe, nextTickAt, tickMs } from '../../core/store.js';
import { esc, fmt, fullTime } from '../../core/words.js';
import * as commands from '../../core/commands.js';
import * as ages from '../../core/ages.js';
import { tabState, tabButtons, panelAttrs, wireTabs } from '../room/tabs.js';
import { mountRecap, namer } from './recap.js';
import { renderVictory, renderStandings } from './victory.js';
import { mountStaff } from './staff.js';

const LABELS = { now: 'AGE', recap: 'RECAP', results: 'RESULTS', staff: 'STAFF' };
const SUB = { now: 'where the age stands', recap: 'the age replayed', results: 'the victor and the leaderboards', staff: 'end the age, plan and open the next' };
const tabsFor = (list) => tabState(`realmstate.ages.tab.${list.join('-')}`, list, LABELS);

/** Mounts the window (once, for the page). Returns { open(tab, age) }. */
export function mountAges() {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg ages-dlg';
  dlg.id = 'ag-dlg';
  dlg.setAttribute('aria-labelledby', 'ag-title');
  dlg.innerHTML = `
    <header class="dlg-h">
      <h2 id="ag-title"><span class="key">AGES</span><span class="t" id="ag-t"></span> <span class="dim" id="ag-sub"></span></h2>
      <label class="ag-pick" id="ag-pick-l"><span>SHOW</span> <select id="ag-age" aria-label="Which age to show"></select></label>
      <button type="button" class="btn ghost mini" data-close aria-label="Close the ages window (Esc)">ESC&nbsp;×</button>
    </header>
    <p class="dlg-msg status" id="ag-msg" role="status" aria-live="polite"></p>
    <div class="dlg-b" id="ag-b" tabindex="-1"></div>`;
  document.body.append(dlg);
  const body = dlg.querySelector('#ag-b');
  const pick = dlg.querySelector('#ag-age');
  let ac = null, st = null, recap = null, staff = null, access, returnTo = null;
  let shownAge = null;    // the age RECAP and RESULTS show
  let recapAge = null;    // the age the recap on screen is of
  let seq = 0;

  const cur = () => store.age?.age ?? null;
  // Your house to mark: this age's from /me; an ended age's from your own record (/me/ages).
  let records = [];
  const mine = (n) => {
    if (n === cur()) return store.house ? { realm: store.house.realm, state: store.house.state, house: store.house.id } : null;
    const r = records.find((x) => x.age === n);
    return r ? { realm: r.state.realm, state: r.state.state, house: r.house.house } : null;
  };
  const loadMine = async () => { records = await ages.myAges(); };
  // Keys typed in the window stay in it (the War Room's own shortcuts are behind the modal).
  dlg.addEventListener('keydown', (ev) => ev.stopPropagation());

  function fillPick() {
    const n = cur() || 1;
    const now = `<option value="${n}">${esc(ages.ageName(store.age))} · now</option>`;
    const fill = (opts) => { pick.innerHTML = opts.join(''); pick.value = String(shownAge ?? n); };
    // Every number down to 1 until the server says which ages it recorded (an older one never does).
    const all = [now];
    for (let i = n - 1; i >= 1; i--) all.push(`<option value="${i}">Age ${i}</option>`);
    fill(all);
    ages.recorded().then((list) => {
      if (!list || cur() !== n) return;
      const past = list.filter((a) => a.age !== n).reverse()
        .map((a) => `<option value="${a.age}">${esc(a.name || `Age ${a.age}`)}${a.winner_name ? ` · ${esc(a.winner_name)} won` : ''}</option>`);
      fill([now, ...past]);
    }).catch(() => {});
  }
  function header() {
    const t = st.get();
    dlg.querySelector('#ag-t').textContent = LABELS[t];
    dlg.querySelector('#ag-sub').textContent = SUB[t];
    // The age picker only means something for RECAP and RESULTS (and only with the ages API).
    dlg.querySelector('#ag-pick-l').hidden = !(t === 'recap' || t === 'results') || !ages.hasAges();
  }

  // ---------- AGE: where the current age stands ----------
  function nowHTML() {
    const a = store.age;
    if (!a) return '<p class="dim">Reading the age…</p>';
    const pre = !ages.started(a);
    const left = Math.max(0, a.age_ticks - store.tick);
    const end = left > 0 ? (nextTickAt() || Date.now()) + (left - 1) * tickMs() : null;
    const n = a.next;
    const phase = pre ? 'BEFORE THE START' : a.ended ? 'ENDED' : 'UNDER WAY';
    const big = pre ? `Starts in <b class="num" data-cd="${a.started_at}"></b>`
      : a.ended ? 'The age has ended.'
        : `Tick <b class="num">${fmt(store.tick)}</b> of ${fmt(a.age_ticks)} · <b class="num">≈${esc(ages.roughSpan((end || Date.now()) - Date.now()))}</b> left`;
    const sc = a.scoring;
    return `<div class="ag-now">
      <p class="ag-phase ${pre ? 'pre' : a.ended ? 'end' : ''}">${phase}</p>
      <h3 class="ag-name">${esc(ages.ageName(a))}</h3>
      <p class="ag-big">${big}</p>
      ${pre ? '<p class="ag-note">Only founding is open: found your house and choose its state now. Every other order opens when the age starts.</p>' : ''}
      <dl class="sf-sum">
        <dt>AGE</dt><dd>${fmt(a.age)}</dd>
        ${a.started_at ? `<dt>${pre ? 'STARTS' : 'STARTED'}</dt><dd>${esc(fullTime(a.started_at))}</dd>` : ''}
        <dt>LENGTH</dt><dd>${fmt(a.age_ticks)} ticks, one every ${esc(ages.roughSpan(a.tick_ms || tickMs()))}</dd>
        ${!pre && !a.ended && end ? `<dt>ENDS ABOUT</dt><dd>${esc(fullTime(end))} <span class="dim">(≈: a pause moves it)</span></dd>` : ''}
        ${a.ended && a.result?.ended_at ? `<dt>ENDED</dt><dd>${esc(fullTime(a.result.ended_at))}${a.result.ended_tick != null ? ` · tick ${fmt(a.result.ended_tick)}` : ''}</dd>` : ''}
        ${sc ? `<dt>SCORING</dt><dd>land ${fmt(sc.land_bp / 100)} and might ${fmt(sc.might_bp / 100)} points against the leading state, plus ${fmt(sc.per_war_point / 100)} a war point</dd>` : ''}
      </dl>
      ${a.ended || n ? `<h3 class="sub">NEXT AGE</h3>${n ? `<p><b>${esc(n.name || `Age ${n.age}`)}</b> <span class="dim">(age ${fmt(n.age)})</span> · ${n.start_at > Date.now() ? `starts in <b class="num" data-cd="${n.start_at}"></b> · ${esc(fullTime(n.start_at))}` : `opening soon (start ${esc(fullTime(n.start_at))})`}</p>` : '<p class="dim">Not planned yet. Staff announce it here once it is.</p>'}` : ''}
      <div id="ag-mine"></div>
      <p class="ag-go">${ages.hasAges() ? '<button type="button" class="btn" data-go="recap">WATCH THE RECAP</button>' : ''}${a.ended ? ' <button type="button" class="btn primary" data-go="results">SEE THE RESULTS</button>' : ages.hasAges() || a.standings ? ' <button type="button" class="btn" data-go="results">STANDINGS</button>' : ''}</p>
    </div>`;
  }
  /** Your past ages: where your house finished in each. */
  function mineHTML() {
    if (!records.length) return '';
    const of = (rank, n) => (rank ? `#${fmt(rank)}<span class="dim"> of ${fmt(n)}</span>` : '·');
    return `<h3 class="sub">YOUR PAST AGES</h3><ul class="ag-past">${records.map((r) => `<li>
      <p><b>${esc(r.name || `Age ${r.age}`)}</b>: ${esc(r.house.name)} of ${esc(r.state.name || `${r.state.realm}:${r.state.state}`)}${r.won ? ' <span class="ag-won">WON THE AGE</span>' : ''}</p>
      <dl class="sf-sum">
        <dt>STATE</dt><dd>${of(r.state_rank, r.states)}${r.state_score != null ? ` · score ${(r.state_score / 100).toFixed(1)}` : ''}</dd>
        <dt>LAND</dt><dd>${of(r.land_rank, r.houses)} · ${fmt(r.land)} acres</dd>
        <dt>MIGHT</dt><dd>${of(r.might_rank, r.houses)} · ${fmt(r.might)}</dd>
        <dt>RENOWN</dt><dd>${of(r.renown_rank, r.houses)} · ${fmt(r.renown)}</dd>
        ${r.heirs?.length ? `<dt>HEIRS</dt><dd>${r.heirs.map((h) => esc(h.name)).join(', ')}</dd>` : ''}
      </dl>
      <p class="ag-go"><button type="button" class="btn mini" data-past="${r.age}" data-go="results">RESULTS</button> <button type="button" class="btn mini" data-past="${r.age}" data-go="recap">RECAP</button></p>
    </li>`).join('')}</ul>`;
  }
  function tickClocks() {
    dlg.querySelectorAll('[data-cd]').forEach((b) => { b.textContent = ages.span(Number(b.dataset.cd) - Date.now()); });
  }

  // ---------- RECAP ----------
  async function showRecap(live) {
    const n = shownAge ?? cur();
    const box = body.querySelector('#ag-sec-recap');
    const my = ++seq;
    if (!recap) { box.innerHTML = '<div class="rc"></div><p class="dim rc-msg" hidden></p>'; recap = mountRecap(box.querySelector('.rc')); }
    const msg = box.querySelector('.rc-msg');
    let rc = null, err = null;
    try { [rc] = await Promise.all([ages.recap(n), loadMine()]); } catch (e) { err = e; }
    if (my !== seq || !dlg.open) return;
    box.querySelector('.rc').hidden = !rc;
    msg.hidden = !!rc;
    if (!rc) { recap.stop(); msg.textContent = err ? `Couldn't read the recap: ${err.message}` : n === cur() ? 'This server keeps no recap of the age.' : `Age ${n} isn't recorded on this server.`; return; }
    recap.show(rc, { live: live && recapAge === n, me: mine(n) });
    recapAge = n;
  }

  // ---------- RESULTS ----------
  async function showResults() {
    const n = shownAge ?? cur();
    const box = body.querySelector('#ag-sec-results');
    const my = ++seq;
    box.innerHTML = '<p class="dim">Reading the results…</p>';
    let r = null, rc = null;
    try { [r] = await Promise.all([ages.result(n), loadMine()]); } catch (e) { if (my === seq) box.innerHTML = `<p class="bad">Couldn't read the results: ${esc(e.message)}</p>`; return; }
    // State names come with the age's recap (and with an archived result).
    if (!r?.names && ages.hasAges()) rc = await ages.recap(n).catch(() => null);
    if (my !== seq || !dlg.open) return;
    const nm = namer(r?.names ? r : rc);
    if (r) {
      const vac = ac;
      renderVictory(box, r, nm, mine(n), (t, type, fn) => t.addEventListener(type, fn, { signal: vac.signal }));
    } else if (n === cur()) renderStandings(box, store.age, nm, mine(n));
    else box.innerHTML = `<p class="dim">Age ${n} isn't recorded on this server.</p>`;
  }

  // ---------- showing ----------
  function draw(t) {
    header();
    if (t !== 'recap') recap?.stop();
    if (t === 'now') {
      body.querySelector('#ag-sec-now').innerHTML = nowHTML();
      tickClocks();
      loadMine().then(() => { const el = body.querySelector('#ag-mine'); if (el && st.get() === 'now') el.innerHTML = mineHTML(); });
    }
    else if (t === 'recap') showRecap(false);
    else if (t === 'results') showResults();
    else if (t === 'staff' && !staff) staff = mountStaff(body.querySelector('#ag-sec-staff'), access, (x, type, fn) => x.addEventListener(type, fn, { signal: ac.signal }));
  }

  async function open(tab, age) {
    access = ages.hasAges() ? await ages.staffAccess() : null;
    const isStaff = !!access && (access.can || []).some((c) => c === 'plan_age' || c === 'end_age');
    const list = ages.hasAges() ? ['now', 'recap', 'results', ...(isStaff ? ['staff'] : [])] : ['now', 'results'];
    st = tabsFor(list);
    if (tab && list.includes(tab)) st.set(tab);
    if (age != null) shownAge = Number(age);
    if (shownAge == null || shownAge > (cur() || 1)) shownAge = cur();
    ac?.abort();
    ac = new AbortController();
    recap = null; staff = null; recapAge = null;
    const on = (x, type, fn, o = {}) => x.addEventListener(type, fn, { signal: ac.signal, ...o });
    body.innerHTML = `<div class="acttabs seg2" role="tablist" aria-label="Age views" id="ag-tabs">${tabButtons(st, 'ag')}</div>`
      + list.map((t) => `<div ${panelAttrs(st, 'ag', t)}></div>`).join('');
    wireTabs(body.querySelector('#ag-tabs'), body, on, st, draw);
    fillPick();
    syncMsg();
    if (!dlg.open) {
      const a = document.activeElement;
      returnTo = a && a !== document.body ? a : null;
      dlg.showModal();
    }
    draw(st.get());
    body.querySelector('#ag-tabs [aria-selected=true]')?.focus();
  }
  function syncMsg() {
    const m = dlg.querySelector('#ag-msg');
    m.textContent = store.msg.text;
    m.className = `dlg-msg status ${store.msg.tone || ''}`;
  }

  pick.addEventListener('change', () => { shownAge = Number(pick.value); draw(st.get()); });
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg || ev.target.closest('[data-close]')) { dlg.close(); return; }
    const g = ev.target.closest('[data-go]');
    // A past age's buttons show that age.
    if (g?.dataset.past) { shownAge = Number(g.dataset.past); fillPick(); }
    if (g) { st.set(g.dataset.go); body.querySelector(`#ag-tab-${g.dataset.go}`)?.focus(); }
  });
  dlg.addEventListener('close', () => {
    // The event comes a moment after closing: if the window was opened again meanwhile, keep it.
    if (dlg.open) return;
    recap?.stop();
    ac?.abort(); ac = null; recap = null; staff = null;
    body.replaceChildren();
    const back = returnTo?.isConnected ? returnTo : null;
    returnTo = null;
    back?.focus();
  });

  let recapTimer = 0;
  subscribe((c) => {
    if (!dlg.open) return;
    if (c.has('msg')) syncMsg();
    if (c.has('age:changed')) { shownAge = cur(); open('now'); return; }
    const t = st.get();
    if (c.has('age')) { fillPick(); if (t === 'now') draw('now'); if (t === 'staff') staff?.sync(); }
    else if (c.has('clock')) tickClocks();
    // The current age's recap grows as it runs: read it again now and then (keeping the place).
    if (c.has('tick') && t === 'recap' && (shownAge ?? cur()) === cur()) { clearTimeout(recapTimer); recapTimer = setTimeout(() => showRecap(true), 1500); }
    if (c.has('age') && t === 'results' && (shownAge ?? cur()) === cur() && store.age?.ended) showResults();
  });

  // /age, /recap [n], /results [n]
  commands.register('age', { help: 'where the age stands and when the next starts', run: () => open('now') });
  commands.register('recap', { args: '[age]', help: 'replay the age (or an earlier one): states by land over time, and wars', run: (a) => open('recap', a && Number(a) > 0 ? Number(a) : cur()) });
  commands.register('results', { args: '[age]', help: 'the victor and leaderboards of an ended age', run: (a) => open('results', a && Number(a) > 0 ? Number(a) : cur()) });
  return { open };
}
