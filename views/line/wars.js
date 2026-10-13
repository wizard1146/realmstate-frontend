// Straightline's Wars: every war in the world. A line of totals; the wars being fought (who, between realms or within
// one, since when, the earliest they may end, each side's war points, peace offered); ceasefires; and the wars that
// have ended this age (how, and who won). Your state's are marked. All public: /wars, and /realms/:n for names.
import { store } from '../../core/store.js';
import { api } from '../../core/api.js';
import { fmt, esc } from '../../core/words.js';
import { warSeries, warView } from './warview.js';

const key = (s) => `${s.realm}:${s.state}`;
const same = (a, b) => a && b && a.realm === b.realm && a.state === b.state;
const ENDS = { peace: 'Peace', withdraw: 'Withdrawal', withdrawal: 'Withdrawal', surrender: 'Surrender', timeout: 'Ran out', age: 'Age ended' };

export function mountWars(host, on) {
  const P = store.rules?.params || {}, REALMS = P.realms || 13;
  host.innerHTML = `<div class="lpart lwars">
    <dl class="st-glance wr-glance" id="wr-glance"></dl>
    <section><h3 class="sub">At war <span class="dim" id="wr-now-n"></span></h3><div id="wr-now"></div></section>
    <section><h3 class="sub">Ceasefires <span class="dim">no attacks between them until the tick shown</span></h3><div id="wr-cf"></div></section>
    <section><h3 class="sub">Ended this age</h3><div id="wr-done"></div></section>
    <dialog class="ldlg wr-dlg" id="wr-dlg" aria-labelledby="wr-dlg-h">
      <header><h2 id="wr-dlg-h"></h2><button type="button" class="x" data-close aria-label="Close (Esc)">×</button></header>
      <div class="body" id="wr-dlg-b"></div></dialog>
  </div>`;
  const $ = (id) => host.querySelector(`#wr-${id}`);
  const names = new Map();   // "r:s" -> state name
  const land = new Map();    // "r:s" -> the state's land now (its houses' land, from /realms ranks)
  let w = null;

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
      ${wars.map((x, i) => {
        const yours = same(x.a, me) || same(x.b, me), pa = pointsOf(x.a), pb = pointsOf(x.b);
        const ahead = (p, q) => (p > q ? ' class="num lead"' : ' class="num"');
        return `<tr class="${[yours ? 'self' : '', i % 2 ? 'alt' : ''].filter(Boolean).join(' ')}"><td>${who(x.a)}</td><td${ahead(pa, pb)}>${fmt(pa)}</td><td class="vs">vs</td><td>${who(x.b)}</td><td${ahead(pb, pa)}>${fmt(pb)}</td>${showLand ? balance(x) : ''}
          <td>${kind(x.kind)}</td><td>${ago(x.started_tick)}</td><td>${x.may_end_at_tick > now ? `tick ${fmt(x.may_end_at_tick)}` : '<span class="dim">now</span>'}</td>
          <td>${(x.peace_offered || []).length ? x.peace_offered.map((s) => esc(names.get(key(s)) || key(s))).join(', ') : '<span class="dim">–</span>'}</td>
          <td>${trackBtn('war', x)}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="dim">No wars at present.</p>';
    // Ceasefires: soonest to lapse first.
    const cfs = [...(w.ceasefires || [])].sort((x, y) => x.until_tick - y.until_tick);
    $('cf').innerHTML = cfs.length ? `<div class="scrollx"><table class="tbl wr-tbl"><thead><tr><th>Between</th><th class="vs"></th><th></th><th>From</th><th>Until</th><th></th></tr></thead><tbody>
      ${cfs.map((x, i) => `<tr class="${[same(x.a, me) || same(x.b, me) ? 'self' : '', i % 2 ? 'alt' : ''].filter(Boolean).join(' ')}"><td>${who(x.a)}</td><td class="vs">and</td><td>${who(x.b)}</td>
        <td>tick ${fmt(x.started_tick)}</td><td>tick ${fmt(x.until_tick)} <span class="dim">(${fmt(Math.max(0, x.until_tick - now))} to go)</span></td><td>${x.after_war ? '<span class="dim" title="Made at the end of a war: it can\'t be broken">after a war</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="dim">No ceasefires at present.</p>';
    // Ended: newest first.
    const done = [...(w.history || [])].sort((x, y) => y.ended_tick - x.ended_tick);
    $('done').innerHTML = done.length ? `<div class="scrollx"><table class="tbl wr-tbl"><thead><tr><th>Side</th><th class="vs"></th><th>Side</th><th>Kind</th><th>Fought</th><th>Ended by</th><th>Winner</th><th></th></tr></thead><tbody>
      ${done.map((x, i) => `<tr class="${[same(x.a, me) || same(x.b, me) ? 'self' : '', i % 2 ? 'alt' : ''].filter(Boolean).join(' ')}"><td>${who(x.a)}</td><td class="vs">vs</td><td>${who(x.b)}</td><td>${kind(x.kind)}</td>
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
  }
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
  draw();
  load();
  return {
    // Wars change with the ticks: read them again at most every 30 seconds.
    update(c) { if ((c?.has('wars') || c?.has('rankings')) && Date.now() - last > 30000) load(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
