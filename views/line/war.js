// Straightline's War: your state's war and its relations. At a glance (war, ceasefires, war points, recovery or
// peace dividend); your war as a card (Offer peace, Withdraw); every state that feels something either way, with
// both meters and whether war is possible; and a sheet to act on one state (declare war, propose or break a
// ceasefire), the irreversible ones behind a confirm window. The world's wars are on the Wars page. Leader only.
// At war, "The war so far": the battles between the two states (warLedger) and the Wars page's view of the war
// (warview.js), your state first; and on desktop a Side by side tab, the two states' houses with their land and might.
import { store, say, loadWars, loadRelations, loadStateNews } from '../../core/store.js';
import { api } from '../../core/api.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { isLeader, leaderWhy } from '../../core/truths.js';
import { pct, st, same, feel, declareWhy } from '../../core/relations.js';
import { warSeries, warView, swapped, warLedger } from './warview.js';
import { tabsHTML, panelAttrs, wireTabs } from './ltabs.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const TABS = [['now', 'Overview'], ['sides', 'Side by side']];
const phone = () => matchMedia('(max-width: 760px)').matches;
const signed = (n) => `<span class="${n > 0 ? 'up' : n < 0 ? 'down' : 'dim'}">${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}</span>`;

export function mountWar(host, on) {
  const P = store.rules.params;
  host.innerHTML = `<div class="lpart lwar">
    ${tabsHTML(TABS, 'lr', 'War')}
    <div ${panelAttrs('lr', 'now')}>
    <dl class="st-glance" id="lr-glance"></dl>
    <div class="atk-layout">
      <div class="atk-main">
        <h3 class="sub">Your war</h3><div id="lr-war"></div>
      </div>
      <aside class="atk-sheet" aria-label="Act on a state">
        <h3 class="sub">Act on a state</h3>
        <form id="lr-form" class="lform atk-grid" novalidate>
          <label for="lr-ws">State</label><input id="lr-ws" placeholder="r:s" autocomplete="off">
          <label for="lr-wt">Ceasefire</label><span class="field"><input id="lr-wt" type="number" min="${P.ceasefire_min_ticks}" max="${P.ceasefire_max_ticks}" value="${P.ceasefire_min_ticks}" inputmode="numeric"> <span class="dim small">ticks (${P.ceasefire_min_ticks}–${P.ceasefire_max_ticks})</span></span>
        </form>
        <p class="doing" id="lr-hint" aria-live="polite"></p>
        <div class="wr-btns"><button type="button" class="btn" id="lr-cf">Propose a ceasefire</button><button type="button" class="btn" id="lr-break">Break the ceasefire…</button><button type="button" class="btn danger" id="lr-declare">Declare war…</button></div>
        <p class="dim small" id="lr-why"></p>
      </aside>
    </div>
    <section id="lr-sofar" hidden><h3 class="sub">The war so far <span class="dim" id="lr-sofar-n"></span></h3><div id="lr-ledger"></div><div id="lr-view"></div></section>
    <h3 class="sub wr-relh">Relations <span class="dim">how each state feels about yours, and yours about it; only the two states see these</span></h3><div id="lr-rel"></div>
    <p class="dim small">Every war and ceasefire in the world, and each war's track over time, is on the <a href="#wars">Wars</a> page.</p>
    </div>
    <div ${panelAttrs('lr', 'sides')}><div id="lr-sides"></div></div>
    <dialog class="ldlg tq-dlg" id="lr-dlg" aria-labelledby="lr-dlg-h">
      <header><h2 id="lr-dlg-h"></h2><button type="button" class="x" data-close aria-label="Cancel (Esc)">×</button></header>
      <div class="body"><p id="lr-dlgp"></p><div class="atk-btns"><button type="button" class="btn" data-close>Not now</button><button type="button" class="btn danger" id="lr-dyes"></button></div></div></dialog>
  </div>`;
  const $ = (id) => host.querySelector(`#lr-${id}`);
  const me = () => ({ realm: store.state.realm, state: store.state.state });
  const myWar = () => store.relations?.war || (store.wars?.wars || []).find((x) => same(x.a, me()) || same(x.b, me()));
  /** The typed state: { realm, state } or null. */
  const target = () => { const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec($('ws').value || ''); return m ? { realm: Number(m[1]), state: Number(m[2]) } : null; };
  let confirmDo = null, opener = null;

  function glance() {
    const s = store.state, w = store.wars, war = myWar(), cfs = (w?.ceasefires || []).filter((c) => same(c.a, me()) || same(c.b, me()));
    const foe = war ? (same(war.a, me()) ? war.b : war.a) : null;
    const card = (k, v, note) => `<div><dt>${k}</dt><dd>${v}</dd><dd class="rank"><span>${note}</span></dd></div>`;
    $('glance').innerHTML = card('War', war ? `With ${st(foe)}` : 'None', war ? `since tick ${fmt(war.started_tick)}` : 'at peace')
      + card('Ceasefires', fmt(cfs.length), cfs.length ? cfs.map((c) => `${st(same(c.a, me()) ? c.b : c.a)} to tick ${fmt(c.until_tick)}`).join(', ') : 'none')
      + card('War points', fmt((w?.points || []).find((x) => same(x.state, me()))?.points || 0), 'count toward your score')
      + card(s.recovery ? 'Recovering' : 'Peace dividend', s.recovery ? pct(s.recovery.share_bp) : s.peace_dividend ? (s.peace_dividend.active ? 'Active' : 'Coming') : 'None', s.recovery ? `until tick ${fmt(s.recovery.until_tick)}` : s.peace_dividend ? (s.peace_dividend.active ? `since tick ${fmt(s.peace_dividend.from_tick)}` : `from tick ${fmt(s.peace_dividend.from_tick)}`) : 'after a long peace');
  }
  function war() {
    const L = isLeader(), w = myWar();
    if (!w) { $('war').innerHTML = '<p class="dim">Your state is at peace.</p>'; return; }
    const foe = same(w.a, me()) ? w.b : w.a, may = w.started_tick + P.war_min_ticks, ours = w.peace_offered.some((x) => same(x, me()));
    const why = !L ? leaderWhy() : '';
    const focus = host.contains(document.activeElement) && document.activeElement.id;
    $('war').innerHTML = `<article class="ac-card wr-card"><header><h4>At war with <a href="#state" data-open-state="${st(foe)}">State ${st(foe)}</a></h4><span class="gn-badge">${w.kind === 'general' ? 'Between realms' : 'Intra-realm'}</span></header>
      <p>Since tick ${fmt(w.started_tick)}. ${w.peace_offered.length ? `Peace offered by ${w.peace_offered.map(st).join(' and ')}.` : 'Nobody has offered peace.'} It can end no sooner than tick ${fmt(may)}${store.tick < may ? ` (in ${fmt(may - store.tick)} ticks)` : ''}.</p>
      <div class="gn-acts"><button type="button" class="btn" id="lr-peace"${why ? ` disabled title="${esc(why)}"` : ''}>${ours ? 'Take back your peace offer' : 'Offer peace'}</button><button type="button" class="btn danger" id="lr-withdraw"${why ? ` disabled title="${esc(why)}"` : ''}>Withdraw…</button>${why ? `<span class="dim small">${esc(cap(why))}.</span>` : ''}</div></article>`;
    if (focus) host.querySelector(`#${CSS.escape(focus)}`)?.focus();
  }
  const meter = (f, T) => {
    const w = Math.min(100, (100 * f.points) / Math.max(1, T.auto_war)), mk = (p) => `<b style="left:${Math.min(100, (100 * p) / T.auto_war)}%"></b>`;
    return `<span class="wr-meter rel-${esc(f.relation)}" title="${esc(feel(f))} of ${(T.auto_war / 100).toFixed(0)}: unfriendly from ${T.unfriendly / 100}, hostile from ${T.hostile / 100}, either may declare from ${T.declare_either / 100}, war starts by itself at ${T.auto_war / 100}"><i style="width:${w}%"></i>${mk(T.unfriendly)}${mk(T.hostile)}${mk(T.declare_either)}</span><span class="small">${esc(feel(f))}</span>`;
  };
  function relations() {
    const R = store.relations;
    if (!R) { $('rel').innerHTML = '<p class="dim">Loading relations…</p>'; return; }
    const T = R.thresholds, rows = (R.relations || []).slice().sort((a, b) => b.they_feel.points - a.they_feel.points);
    $('rel').innerHTML = rows.length ? `<table class="tbl wr-tbl fit"><thead><tr><th data-fx="last">State</th><th data-pri="2">They feel</th><th data-pri="3">You feel</th><th class="num" data-pri="4">Their land</th><th data-pri="5" data-fx="clip">War <span class="vh">(choose a state to see why)</span></th><th><span class="vh">Choose</span></th></tr></thead><tbody>
      ${rows.map((r) => { const why = declareWhy(r), out = r.land_ratio_bp < R.war_range_bp[0] || r.land_ratio_bp > R.war_range_bp[1];
        return `<tr><th scope="row"><a href="#state" data-open-state="${st(r.state)}">${st(r.state)}</a>${r.ceasefire_proposed_to_us ? `<br><span class="small">they ask a ${fmt(r.ceasefire_proposed_to_us)}-tick ceasefire</span>` : ''}${r.ceasefire_we_proposed ? `<br><span class="dim small">you asked ${fmt(r.ceasefire_we_proposed)}</span>` : ''}</th>
          <td>${meter(r.they_feel, T)}</td><td>${meter(r.we_feel, T)}</td><td class="num${out ? ' dim' : ''}">${pct(r.land_ratio_bp)} <span class="dim small">of yours</span></td>
          <td class="small ${why ? 'dim' : 'up'}" title="${esc(why ? cap(why) : 'Possible: the server has the last word')}">${why ? 'Not yet' : 'Possible'}</td><td class="acts"><button type="button" class="btn mini" data-pick="${st(r.state)}"${r.ceasefire_proposed_to_us ? ` data-ticks="${r.ceasefire_proposed_to_us}"` : ''} aria-label="Act on state ${st(r.state)}">Choose</button></td></tr>`; }).join('')}
      </tbody></table>` : `<p class="dim">No feelings either way yet. Attacks and caught operations between two states raise their meters. War needs the other state's land within ${pct(R.war_range_bp[0])}–${pct(R.war_range_bp[1])} of yours.</p>`;
  }
  function sheet() {
    const L = isLeader(), t = target(), R = store.relations, w = store.wars;
    const rel = t && (R?.relations || []).find((r) => same(r.state, t));
    const cf = t && (w?.ceasefires || []).find((c) => (same(c.a, t) || same(c.b, t)) && (same(c.a, me()) || same(c.b, me())));
    if (!t) { $('hint').textContent = 'Type a state as realm:state (a space types the colon), or Choose one from Relations.'; $('hint').classList.remove('short'); }
    else {
      const why = same(t, me()) ? 'that is your own state' : rel ? declareWhy(rel) : 'no hostility either way yet: war needs them Hostile toward you';
      $('hint').textContent = `State ${st(t)}: ${rel ? `they feel ${feel(rel.they_feel)}, you feel ${feel(rel.we_feel)}; their land is ${pct(rel.land_ratio_bp)} of yours. ` : ''}${cf ? `Ceasefire to tick ${fmt(cf.until_tick)}${cf.after_war ? ' (after a war: it can\'t be broken)' : ''}. ` : ''}War: ${why || 'looks possible (the server has the last word)'}.`;
      $('hint').classList.toggle('short', !!why);
    }
    const lw = L ? '' : leaderWhy();
    $('why').textContent = lw ? `${cap(lw)}.` : '';
    for (const k of ['declare', 'cf', 'break']) { $(k).disabled = !L || !t; $(k).title = lw || (!t ? 'type a state first' : ''); }
    $('break').hidden = !cf;
  }
  function ask(title, text, yes, fn, from) {
    $('dlg-h').textContent = title; $('dlgp').textContent = text; $('dyes').textContent = yes;
    confirmDo = fn; opener = from; $('dlg').showModal();
  }

  on(host, 'click', (ev) => {
    const x = ev.target.closest('button');
    if (!x || x.disabled || x.closest('dialog')) return;
    if (x.dataset.pick) { $('ws').value = x.dataset.pick; if (x.dataset.ticks) $('wt').value = x.dataset.ticks; sheet(); $('ws').focus(); return; }
    const t = target(), w = myWar();
    if (x.id === 'lr-peace') act.offerPeace({ button: x });
    else if (x.id === 'lr-withdraw' && w) ask('Withdraw from the war?', `Your state concedes the war with ${st(same(w.a, me()) ? w.b : w.a)}: the other side wins it.`, 'Withdraw', () => act.withdraw({ button: x }), x);
    else if (!t && ['lr-declare', 'lr-cf', 'lr-break'].includes(x.id)) { say('Type the state as realm:state, for example 2:1.', 'bad'); $('ws').focus(); }
    else if (x.id === 'lr-declare') ask(`Declare war on state ${st(t)}?`, `Every house of both states is at war until one side withdraws or both make peace; a war lasts at least ${fmt(P.war_min_ticks)} ticks.`, 'Declare war', () => act.declareWar(t.realm, t.state, { button: x }), x);
    else if (x.id === 'lr-cf') act.proposeCeasefire(t.realm, t.state, num($('wt').value), { button: x });
    else if (x.id === 'lr-break') ask(`Break the ceasefire with ${st(t)}?`, 'Breaking a ceasefire turns both states against you.', 'Break it', () => act.breakCeasefire(t.realm, t.state, { button: x }), x);
  });
  on($('dlg'), 'click', (ev) => { if (ev.target === $('dlg') || ev.target.closest('[data-close]')) $('dlg').close(); });
  on($('dyes'), 'click', () => { const f = confirmDo; confirmDo = null; $('dlg').close(); f?.(); });
  on($('dlg'), 'close', () => { if (opener?.isConnected) opener.focus(); });
  on($('form'), 'input', sheet);
  on($('form'), 'submit', (ev) => ev.preventDefault());

  // ---------- at war: the battles, the war's track, and the two states side by side ----------
  const foeOf = (w) => (same(w.a, me()) ? w.b : w.a);
  /** The war being fought, from the Wars list (which carries its id). */
  const warRow = () => (store.wars?.wars || []).find((x) => same(x.a, me()) || same(x.b, me()));
  let shown = '', ledger = null;
  async function sofar() {
    const w = warRow();
    $('sofar').hidden = !w;
    if (!w) { shown = ''; return; }
    const foe = foeOf(w), L = ledger = warLedger(me(), foe, w.started_tick), o = L.ours, t = L.theirs;
    $('sofar-n').textContent = `since tick ${fmt(w.started_tick)}, ${fmt(Math.max(0, store.tick - w.started_tick))} ticks`;
    const net = o.land - t.land;
    const line = (k, v, note) => `<div><dt>${k}</dt><dd>${v}</dd><dd class="rank"><span>${note}</span></dd></div>`;
    $('ledger').innerHTML = `<dl class="st-glance wr-ledger">
      ${line('Land from battles', signed(net), `took ${fmt(o.land)}, lost ${fmt(t.land)} acres`)}
      ${line('Your attacks', `${fmt(o.won)} of ${fmt(o.n)}`, `won · they lost ${fmt(o.killed)} troops, you ${fmt(o.lost)}`)}
      ${line('Their attacks', `${fmt(t.won)} of ${fmt(t.n)}`, `won · you lost ${fmt(t.lost)} troops`)}</dl>
      <p class="dim small">Battles between the two states since the war began, from your news and your state's: robot statemates' battles count only from today's update on, and an attacker who veiled itself can't be told apart.</p>`;
    const key = `${w.id}:${store.tick}`;
    if (key === shown) return;
    shown = key;
    const view = $('view');
    if (!view.innerHTML) view.innerHTML = '<p class="dim">Loading the war\'s track…</p>';
    const [d] = await Promise.all([warSeries(w.id, true), loadNames(foe)]);
    if (shown !== key) return;
    const ours = same(d.a ?? w.a, me()) ? d : swapped(d);
    view.innerHTML = `<p class="wr-legend"><b class="a">Your state</b> in ink, <b class="b">${esc(stName(foe))}</b> in red; the shaded part is the war.</p>${warView(ours, w.started_tick, 'Your state', esc(stName(foe)))}`;
    sides(true);
  }
  // Side by side (desktop): each state's houses by land, with what battles in this war won or lost them.
  const names = new Map(), members = new Map();   // "r:s" -> the state's name; its houses (/states/:r/:s)
  const stName = (s) => names.get(st(s)) || `State ${st(s)}`;
  /** The enemy state's name (from its realm's page), once. */
  async function loadNames(foe) {
    if (names.has(st(foe))) return;
    try { const r = await api(`/realms/${foe.realm}`); for (const x of r.states) names.set(`${r.realm}:${x.state}`, x.name); } catch { /* the address will do */ }
  }
  let sidesAt = 0;
  async function sides(fetchNow = false) {
    const w = warRow();
    if (!w) { $('sides').innerHTML = '<p class="dim">Your state is at peace: when it\'s at war, its houses and the enemy\'s are compared here.</p>'; return; }
    const foe = foeOf(w);
    if (fetchNow || !members.size || Date.now() - sidesAt > 60000) {
      sidesAt = Date.now();
      const got = await Promise.allSettled([me(), foe].map((s) => api(`/states/${s.realm}/${s.state}`)));
      got.forEach((g, i) => { if (g.status === 'fulfilled') members.set(st(i ? foe : me()), g.value); });
      await loadNames(foe);
    }
    const by = ledger?.byHouse || new Map();
    const col = (s, cls, title) => {
      const hs = [...(members.get(st(s)) || [])].sort((x, y) => y.land - x.land);
      const tl = hs.reduce((a, h) => a + h.land, 0), tm = hs.reduce((a, h) => a + h.might, 0);
      return `<section class="wr-side ${cls}"><h4>${title} <span class="dim">${st(s)}</span></h4>
        <table class="tbl wr-sidetbl fit"><thead><tr><th data-fx="last">House</th><th class="num">Land</th><th class="num" data-pri="2" title="Acres won or lost in battles between the two states in this war, as far as your news tells">In battle</th><th class="num" data-pri="3">Might</th></tr></thead><tbody>
        ${hs.map((h, i) => `<tr class="${[h.id === store.house?.id ? 'self' : '', i % 2 ? 'alt' : ''].filter(Boolean).join(' ')}"><th scope="row"><a href="#state" data-open-state="${st(s)}">${esc(h.name)}</a>${h.robot ? ' <span class="dim small">robot</span>' : ''}</th>
          <td class="num">${fmt(h.land)}</td><td class="num">${by.has(h.id) ? signed(by.get(h.id)) : '<span class="dim">–</span>'}</td><td class="num">${fmt(h.might)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">${fmt(hs.length)} houses</th><td class="num">${fmt(tl)}</td><td></td><td class="num">${fmt(tm)}</td></tr></tfoot></table></section>`;
    };
    $('sides').innerHTML = `<p class="dim">Each state's houses, largest first. <b>In battle</b>: acres won or lost in battles between the two states since tick ${fmt(w.started_tick)}; how each state's totals moved is on Overview, under The war so far.</p>
      <div class="wr-sides">${col(me(), 'a', 'Your state')}<span class="vs" aria-hidden="true">vs</span>${col(foe, 'b', esc(stName(foe)))}</div>`;
  }

  function draw() {
    if (!store.house) return;
    if (!store.state) { $('glance').innerHTML = '<p class="dim">Loading your state…</p>'; return; }
    glance(); war(); relations(); sheet(); sofar();
    if (tabs.current() === 'sides') sides();
  }
  // Side by side is for desktop: on a phone, Overview.
  const tabs = wireTabs(host, on, { tabs: TABS, key: 'realmstate.line.war.tab', onShow: (t) => { if (t === 'sides') sides(); } });
  if (phone() && tabs.current() === 'sides') tabs.show('now');
  on(window, 'resize', () => { if (phone() && tabs.current() === 'sides') tabs.show('now'); });
  if (!store.stateNews) loadStateNews();
  if (!store.relations) loadRelations();
  if (!store.wars) loadWars();
  draw();
  return {
    update(c) { if (!c || ['state', 'house', 'wars', 'relations', 'age', 'news', 'statenews'].some((k) => c.has(k))) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
