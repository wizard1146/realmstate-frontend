// Straightline's Wars: every war in the world. A line of totals, then three tabs, each a page of rows at a time:
// Current, the wars being fought (who, between realms or within one, since when, the earliest they may end, each
// side's war points, peace offered); Past, the wars that have ended this age (how, and who won); Ceasefires. Your
// state's are marked and come first. All public: /wars, and /realms/:n for names.
import { store } from '../../core/store.js';
import { api } from '../../core/api.js';
import { fmt, esc } from '../../core/words.js';
import { warSeries, warView } from './warview.js';
import { tabsHTML, panelAttrs, wireTabs } from './ltabs.js';

const key = (s) => `${s.realm}:${s.state}`;
const same = (a, b) => a && b && a.realm === b.realm && a.state === b.state;
const TABS = [['now', 'Current'], ['done', 'Past'], ['cf', 'Ceasefires']];
const PER = 15;   // rows a page
const ENDS = { peace: 'Peace', withdraw: 'Withdrawal', withdrawal: 'Withdrawal', surrender: 'Surrender', timeout: 'Ran out', age: 'Age ended' };

export function mountWars(host, on) {
  const P = store.rules?.params || {}, REALMS = P.realms || 13;
  host.innerHTML = `<div class="lpart lwars">
    <dl class="st-glance wr-glance" id="wr-glance"></dl>
    ${tabsHTML(TABS, 'wr', 'Wars')}
    <section ${panelAttrs('wr', 'now')}><h3 class="sub">At war <span class="dim" id="wr-now-n"></span></h3><div id="wr-now"></div><nav class="in-pager" id="wr-pg-now" aria-label="Pages of wars being fought"></nav></section>
    <section ${panelAttrs('wr', 'done')}><h3 class="sub">Ended this age <span class="dim">yours first, then the newest</span></h3><div id="wr-done"></div><nav class="in-pager" id="wr-pg-done" aria-label="Pages of wars ended"></nav></section>
    <section ${panelAttrs('wr', 'cf')}><h3 class="sub">Ceasefires <span class="dim">no attacks between them until the tick shown</span></h3><div id="wr-cf"></div><nav class="in-pager" id="wr-pg-cf" aria-label="Pages of ceasefires"></nav></section>
    <dialog class="ldlg wr-dlg" id="wr-dlg" aria-labelledby="wr-dlg-h">
      <header><h2 id="wr-dlg-h"></h2><button type="button" class="x" data-close aria-label="Close (Esc)">×</button></header>
      <div class="body" id="wr-dlg-b"></div></dialog>
  </div>`;
  const $ = (id) => host.querySelector(`#wr-${id}`);
  const names = new Map();   // "r:s" -> state name
  const land = new Map();    // "r:s" -> the state's land now (its houses' land, from /realms ranks)
  let w = null;
  const page = { now: 0, done: 0, cf: 0 };
  /** One page of `list` for tab t (the page kept in range), and its pager drawn. */
  function pageOf(t, list) {
    const pages = Math.max(1, Math.ceil(list.length / PER));
    page[t] = Math.min(page[t], pages - 1);
    const p = page[t], el = $(`pg-${t}`);
    if (pages < 2) el.innerHTML = '';
    else {
      // Every page when there are few; else the first, the last, and two either side of this one.
      const want = [...Array(pages).keys()].filter((i) => pages <= 9 || i === 0 || i === pages - 1 || Math.abs(i - p) <= 2);
      let prev = -1, nums = '';
      for (const i of want) { if (i - prev > 1) nums += '<span class="gap" aria-hidden="true">…</span>'; nums += `<button type="button" class="btn mini${i === p ? ' on' : ''}" data-pg="${i}"${i === p ? ' aria-current="page"' : ''} aria-label="Page ${i + 1}">${i + 1}</button>`; prev = i; }
      el.innerHTML = `<button type="button" class="btn mini" data-pg="${p - 1}"${p ? '' : ' disabled'} aria-label="Previous page">‹</button>${nums}<button type="button" class="btn mini" data-pg="${p + 1}"${p < pages - 1 ? '' : ' disabled'} aria-label="Next page">›</button>
        <span class="dim small">${fmt(p * PER + 1)}–${fmt(Math.min(list.length, p * PER + PER))} of ${fmt(list.length)}</span>`;
    }
    return list.slice(p * PER, p * PER + PER);
  }
  // data-pg, not data-page: the page itself carries data-page (its name).
  on(host, 'click', (ev) => {
    const b = ev.target.closest('.in-pager [data-pg]'), t = b?.closest('.in-pager').id.slice(6), to = Number(b?.dataset.pg);
    if (!b || b.disabled || !Number.isInteger(to)) return;
    page[t] = to;
    draw();
    $(`pg-${t}`).querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    $(`panel-${t}`).scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  const mine = () => (store.house ? { realm: store.house.realm, state: store.house.state } : null);
  const pointsOf = (s) => (w?.points || []).find((p) => same(p.state, s))?.points || 0;
  /** A state, by name and address, opening its State page; yours marked. */
  const who = (s) => `<a href="#state" data-open-state="${key(s)}">${esc(names.get(key(s)) || `State ${key(s)}`)}</a> <span class="dim">${key(s)}</span>${same(s, mine()) ? ' <span class="wr-you">yours</span>' : ''}`;
  const ago = (t) => { const n = Math.max(0, (w?.ticks ?? store.tick) - t); return `tick ${fmt(t)} <span class="dim">(${fmt(n)} ago)</span>`; };
  const kind = (k) => (k === 'general' ? 'Between realms' : 'Intra-realm');

  function draw() {
    if (!w) { $('now').innerHTML = '<p class="dim">Loading…</p>'; return; }
    const me = mine(), now = w.ticks ?? store.tick;
    const myWar = (w.wars || []).find((x) => same(x.a, me) || same(x.b, me));
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    const foe = myWar ? (same(myWar.a, me) ? myWar.b : myWar.a) : null;
    $('glance').innerHTML = card('Wars', fmt((w.wars || []).length), `${fmt((w.wars || []).length * 2)} states fighting`)
      + card('Ceasefires', fmt((w.ceasefires || []).length)) + card('Ended this age', fmt((w.history || []).length))
      + card('Your state', foe ? 'At war' : 'At peace', foe ? `with ${esc(names.get(key(foe)) || key(foe))}` : '');
    // Each tab says how many it holds.
    const count = { now: (w.wars || []).length, done: (w.history || []).length, cf: (w.ceasefires || []).length };
    for (const [t, label] of TABS) $(`tab-${t}`).innerHTML = `${label} <span class="wr-n">${fmt(count[t])}</span>`;
    // Wars being fought: yours first, then the newest.
    const wars = [...(w.wars || [])].sort((x, y) => (same(y.a, me) || same(y.b, me)) - (same(x.a, me) || same(x.b, me)) || y.started_tick - x.started_tick);
    $('now-n').textContent = wars.length ? `${fmt(wars.length)} · yours first, then the newest` : '';
    // The balance of land: each side's land now against what it held when the war began (server: land_at_start).
    const showLand = wars.some((x) => Array.isArray(x.land_at_start)) && land.size;
    const signed = (n) => `<span class="${n > 0 ? 'up' : n < 0 ? 'down' : 'dim'}">${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}</span>`;
    const balance = (x) => {
      if (!Array.isArray(x.land_at_start)) return '<td class="dim">–</td>';
      const [a0, b0] = x.land_at_start, a1 = land.get(key(x.a)) ?? a0, b1 = land.get(key(x.b)) ?? b0;
      const share = (a, b) => (a + b ? (100 * a) / (a + b) : 50);
      return `<td class="wr-bal" title="Land when the war began: ${fmt(a0)} against ${fmt(b0)}; now ${fmt(a1)} against ${fmt(b1)}. Exploring counts too, not only battles.">
        <span class="wr-bar" aria-hidden="true"><i style="width:${share(a1, b1).toFixed(1)}%"></i><b style="left:${share(a0, b0).toFixed(1)}%"></b></span>
        <span class="wr-delta">${signed(a1 - a0)} / ${signed(b1 - b0)}</span></td>`;
    };
    $('now').innerHTML = wars.length ? `<div class="scrollx"><table class="tbl wr-tbl"><thead><tr><th>Side</th><th class="num">Points</th><th class="vs"></th><th>Side</th><th class="num">Points</th>${showLand ? '<th title="Each side\'s land now against when the war began; the gold mark is where it stood">Land since it began</th>' : ''}<th>Kind</th><th>Since</th><th>May end</th><th>Peace offered by</th><th></th></tr></thead><tbody>
      ${pageOf('now', wars).map((x, i) => {
        const yours = same(x.a, me) || same(x.b, me), pa = pointsOf(x.a), pb = pointsOf(x.b);
        const ahead = (p, q) => (p > q ? ' class="num lead"' : ' class="num"');
        return `<tr class="${[yours ? 'self' : '', i % 2 ? 'alt' : ''].filter(Boolean).join(' ')}"><td>${who(x.a)}</td><td${ahead(pa, pb)}>${fmt(pa)}</td><td class="vs">vs</td><td>${who(x.b)}</td><td${ahead(pb, pa)}>${fmt(pb)}</td>${showLand ? balance(x) : ''}
          <td>${kind(x.kind)}</td><td>${ago(x.started_tick)}</td><td>${x.may_end_at_tick > now ? `tick ${fmt(x.may_end_at_tick)}` : '<span class="dim">now</span>'}</td>
          <td>${(x.peace_offered || []).length ? x.peace_offered.map((s) => esc(names.get(key(s)) || key(s))).join(', ') : '<span class="dim">–</span>'}</td>
          <td>${trackBtn('war', x)}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="dim">No wars at present.</p>';
    // Ceasefires: yours first, then the soonest to lapse.
    const yoursFirst = (x, y) => (same(y.a, me) || same(y.b, me)) - (same(x.a, me) || same(x.b, me));
    const cfs = [...(w.ceasefires || [])].sort((x, y) => yoursFirst(x, y) || x.until_tick - y.until_tick);
    $('cf').innerHTML = cfs.length ? `<div class="scrollx"><table class="tbl wr-tbl"><thead><tr><th>Between</th><th class="vs"></th><th></th><th>From</th><th>Until</th><th></th></tr></thead><tbody>
      ${pageOf('cf', cfs).map((x, i) => `<tr class="${[same(x.a, me) || same(x.b, me) ? 'self' : '', i % 2 ? 'alt' : ''].filter(Boolean).join(' ')}"><td>${who(x.a)}</td><td class="vs">and</td><td>${who(x.b)}</td>
        <td>tick ${fmt(x.started_tick)}</td><td>tick ${fmt(x.until_tick)} <span class="dim">(${fmt(Math.max(0, x.until_tick - now))} to go)</span></td><td>${x.after_war ? '<span class="dim" title="Made at the end of a war: it can\'t be broken">after a war</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="dim">No ceasefires at present.</p>';
    // Ended: yours first, then the newest.
    const done = [...(w.history || [])].sort((x, y) => yoursFirst(x, y) || y.ended_tick - x.ended_tick);
    $('done').innerHTML = done.length ? `<div class="scrollx"><table class="tbl wr-tbl"><thead><tr><th>Side</th><th class="vs"></th><th>Side</th><th>Kind</th><th>Fought</th><th>Ended by</th><th>Winner</th><th></th></tr></thead><tbody>
      ${pageOf('done', done).map((x, i) => `<tr class="${[same(x.a, me) || same(x.b, me) ? 'self' : '', i % 2 ? 'alt' : ''].filter(Boolean).join(' ')}"><td>${who(x.a)}</td><td class="vs">vs</td><td>${who(x.b)}</td><td>${kind(x.kind)}</td>
        <td>ticks ${fmt(x.started_tick)}–${fmt(x.ended_tick)} <span class="dim">(${fmt(x.ended_tick - x.started_tick)})</span></td><td>${esc(ENDS[x.end] || x.end || '–')}</td>
        <td>${x.winner ? who(x.winner) : '<span class="dim">none</span>'}</td><td>${trackBtn('ended', x)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="dim">No war has ended yet this age.</p>';
  }

  // ---------- tracking a war (being fought, or ended): its two sides tick by tick, in a window (warview.js) ----------
  const tracks = new Map();   // button key -> { kind, a, b, from, to, id }
    function trackBtn(kindOf, x) {
    const k = `${kindOf === 'war' ? 'w' : 'h'}:${x.id}`, from = x.started_tick;
    const to = kindOf === 'ended' ? x.ended_tick : w?.ticks ?? store.tick;
    tracks.set(k, { kind: kindOf, a: x.a, b: x.b, from, to, id: x.id });
    return `<button type="button" class="btn mini" data-track="${esc(k)}" aria-haspopup="dialog">Track</button>`;
  }
  const dlg = $('dlg');
  let opener = null, showing = '';
  async function openTrack(k, from) {
    const t = tracks.get(k);
    if (!t) return;
    opener = from; showing = k;
    const an = esc(names.get(key(t.a)) || key(t.a)), bn = esc(names.get(key(t.b)) || key(t.b));
    $('dlg-h').innerHTML = `${an} <span class="vs">vs</span> ${bn}`;
    const what = t.kind === 'ended' ? 'A war, ended' : 'At war';
    $('dlg-b').innerHTML = `<p class="wr-legend">${what} · ticks ${fmt(t.from)}–${fmt(t.to)}. <b class="a">${an}</b> in ink, <b class="b">${bn}</b> in red; the shaded part is the war.</p><p class="dim">Loading…</p>`;
    if (!dlg.open) dlg.showModal();
    const d = await warSeries(t.id, t.kind === 'war');
    if (showing !== k || !dlg.open) return;
    $('dlg-b').querySelector('.dim:last-child').outerHTML = warView(d, t.from, an, bn);
    pg = 0;
    fit();
  }

  // ---------- the window on a short screen: pages, ‹ › and a dot each, when it all won't fit ----------
  // Then and now first; then the charts as many to a page as the grid sets side by side (two, or one on a phone).
  let pages = [], pg = 0;
  function fit() {
    const body = $('dlg-b'), wv = body.querySelector('.wv');
    if (!wv) return;
    wv.querySelector('.wv-pager')?.remove();
    wv.classList.remove('paged');
    wv.querySelectorAll('[data-pgd]').forEach((el) => { el.hidden = false; delete el.dataset.pgd; });
    if (body.scrollHeight <= body.clientHeight + 2) { pages = []; return; }
    const strip = wv.querySelector('.wv-strip'), grid = wv.querySelector('.wv-charts'), charts = [...grid.children];
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    pages = [['Then and now', [strip]]];
    for (let i = 0; i < charts.length; i += cols) {
      const set = charts.slice(i, i + cols);
      pages.push([set.map((c) => c.querySelector('.wv-k')?.textContent || '').join(' and '), set]);
    }
    [strip, ...charts].forEach((el) => { el.dataset.pgd = ''; });
    wv.classList.add('paged');
    wv.insertAdjacentHTML('afterbegin', `<div class="in-carh wv-pager"><button type="button" class="btn in-arrow" data-wstep="-1" aria-label="Previous page">‹</button>
      <div class="in-gwrap"><h3 class="in-gname" aria-live="polite"></h3><div class="in-dots" role="group" aria-label="Pages">${pages.map(([name], i) =>
        `<button type="button" class="in-dot" data-wpg="${i}" aria-label="${esc(name)}" title="${esc(name)}"></button>`).join('')}</div></div>
      <button type="button" class="btn in-arrow" data-wstep="1" aria-label="Next page">›</button></div>`);
    show(Math.min(pg, pages.length - 1));
  }
  function show(i) {
    const wv = $('dlg-b').querySelector('.wv.paged');
    if (!wv) return;
    pg = (i + pages.length) % pages.length;
    const on = new Set(pages[pg][1]);
    wv.querySelectorAll('[data-pgd]').forEach((el) => { el.hidden = !on.has(el); });
    wv.querySelector('.wv-charts').hidden = pg === 0;
    wv.querySelector('.in-gname').textContent = `${pages[pg][0]} · ${pg + 1} of ${pages.length}`;
    wv.querySelectorAll('[data-wpg]').forEach((b, k) => { b.classList.toggle('on', k === pg); b.setAttribute('aria-current', String(k === pg)); });
  }
  on(dlg, 'click', (ev) => {
    const st = ev.target.closest('[data-wstep]'), dt = ev.target.closest('[data-wpg]');
    if (st) show(pg + Number(st.dataset.wstep));
    if (dt) show(Number(dt.dataset.wpg));
  });
  // ← → turn the pages anywhere in the window.
  on(dlg, 'keydown', (ev) => {
    if (!pages.length || !['ArrowLeft', 'ArrowRight'].includes(ev.key) || ev.target.closest('input, select, textarea')) return;
    ev.preventDefault();
    show(pg + (ev.key === 'ArrowRight' ? 1 : -1));
  });
  let fitting = 0;
  on(window, 'resize', () => { clearTimeout(fitting); fitting = setTimeout(() => { if (dlg.open) fit(); }, 150); });
  on(host, 'click', (ev) => { const b = ev.target.closest('[data-track]'); if (b) openTrack(b.dataset.track, b); });
  on(dlg, 'click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close(); });
  on(dlg, 'close', () => { showing = ''; if (opener?.isConnected) opener.focus(); else host.querySelector(`[data-track="${CSS.escape(opener?.dataset.track || '')}"]`)?.focus(); });

  let seq = 0, last = 0;
  async function load() {
    const n = ++seq;
    last = Date.now();
    const got = await Promise.allSettled([api('/wars'), ...Array.from({ length: REALMS }, (_, k) => api(`/realms/${k + 1}`))]);
    if (n !== seq) return;
    if (got[0].status === 'fulfilled') w = got[0].value;
    got.slice(1).forEach((g) => { if (g.status === 'fulfilled') for (const s of g.value.states) { names.set(`${g.value.realm}:${s.state}`, s.name); land.set(`${g.value.realm}:${s.state}`, s.ranks?.land?.total ?? 0); } });
    draw();
  }
  wireTabs(host, on, { tabs: TABS, key: 'realmstate.line.wars.tab' });
  draw();
  load();
  return {
    // Wars change with the ticks: read them again at most every 30 seconds.
    update(c) { if ((c?.has('wars') || c?.has('rankings')) && Date.now() - last > 30000) load(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
