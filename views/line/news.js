// Straightline's News, in two tabs. Your house: what happened to you. At a glance (today's news, bad news, attacks
// both ways); filters by kind (the groups of Configuration's News tab) and by good or bad; tick reports if wanted;
// then the news by day, battles as cards, 50 at a time. Kinds turned off in Configuration stay out. Your state: what
// happened to your statemates (their battles, intrigue, hexes and dragon raids, and the hardships of those who share
// them), each line naming its house, and your own switch for sharing your hardships. Data: store.news, store.ticks,
// store.stateNews (read on opening the tab and each tick).
import { store, showTicks, loadStateNews, loadState } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, newsLine, mateNewsLine, empty, fullTime, hhmm, tickLine } from '../../core/words.js';
import { battleCard, isBattle } from '../../core/battle.js';
import { NEWS_GROUPS, newsHidden, newsOff, newsGroup } from '../../core/newsprefs.js';
import { tabsHTML, panelAttrs, wireTabs } from './ltabs.js';

const KEY = 'realmstate.line.news';
const TABS = [['house', 'Your house'], ['state', 'Your state']];
const STEP = 50;
const DAY = 86400000;
const GROUPS = [...NEWS_GROUPS.map(([g, name]) => [g, name]), ['other', 'Everything else']];
const dayOf = (ms) => new Date(ms).toDateString();
function dayName(ms) {
  const d = dayOf(ms);
  if (d === dayOf(Date.now())) return 'Today';
  if (d === dayOf(Date.now() - DAY)) return 'Yesterday';
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
/** Items ({at, n} or {at, tick}) by day: a heading, then that day's items, newest first. mate(n): the statemate's name
 * when the item is theirs (the State tab), so lines and battle cards speak of them by name. */
function byDay(items, mate = () => null) {
  let html = '', day = '';
  for (const x of items) {
    const d = dayName(x.at);
    if (d !== day) { html += `${day ? '</ol>' : ''}<h3 class="sub nw-day">${esc(d)}</h3><ol class="nw-list">`; day = d; }
    const time = `<time datetime="${new Date(x.at).toISOString()}" title="${esc(fullTime(x.at))}">${esc(hhmm(x.at))}</time>`;
    if (x.tick) html += `<li class="nw-tick">${time}<span>${esc(tickLine(x.tick))}</span></li>`;
    else if (isBattle(x.n)) { const m = mate(x.n); html += `<li class="nw-battle">${time}<div>${m ? `<b class="nw-who">${esc(m)}</b>` : ''}${battleCard(x.n, true, m)}</div></li>`; }
    else { const m = mate(x.n), [t, tn] = m ? mateNewsLine(x.n, m) : newsLine(x.n); html += `<li class="nw-${tn || 'plain'}">${time}<span>${esc(t)}</span></li>`; }
  }
  return html ? `${html}</ol>` : '';
}
const card = (k, v, note) => `<div><dt>${k}</dt><dd>${v}</dd><dd class="rank"><span>${note}</span></dd></div>`;

export function mountNews(host, on) {
  let kind = 'all', tone = 'all', shown = STEP, mateShown = STEP;
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v) ({ kind = 'all', tone = 'all' } = v); } catch { /* storage off */ }
  host.innerHTML = `<div class="lpart lnews">
    ${tabsHTML(TABS, 'ln', 'Whose news')}
    <section ${panelAttrs('ln', 'house')}>
      <dl class="st-glance nw-glance" id="ln-glance"></dl>
      <div class="nw-tools">
        <label for="ln-kind">Kind</label><select id="ln-kind"></select>
        <label for="ln-tone">Show</label><select id="ln-tone"><option value="all">Good and bad</option><option value="bad">Bad only</option><option value="good">Good only</option></select>
        <label class="cf-check"><input type="checkbox" id="ln-ticks"> Tick reports</label>
        <span class="dim small nw-count" id="ln-count" aria-live="polite"></span>
      </div>
      <div id="ln-list"></div>
      <div class="nw-more"><button type="button" class="btn" id="ln-more" hidden>Show ${STEP} more</button></div>
    </section>
    <section ${panelAttrs('ln', 'state')}>
      <dl class="st-glance nw-glance" id="ln-sglance"></dl>
      <div class="nw-tools">
        <label class="cf-check"><input type="checkbox" id="ln-share"> Share my hardships with my state</label>
        <span class="dim small">starving, desertion, a general killed</span>
        <span class="dim small nw-count" id="ln-scount" aria-live="polite"></span>
      </div>
      <p class="dim small nw-note">Your statemates' battles, intrigue, hexes and dragon raids, and the hardships of those who share them. They see yours the same way.</p>
      <div id="ln-slist"></div>
      <div class="nw-more"><button type="button" class="btn" id="ln-smore" hidden>Show ${STEP} more</button></div>
    </section>
  </div>`;
  const $ = (id) => host.querySelector(`#ln-${id}`);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ kind, tone })); } catch { /* storage off */ } };

  function glance(list) {
    const since = Date.now() - DAY, day = list.filter((n) => (n.at || 0) >= since);
    $('glance').innerHTML = card('News', fmt(day.length), 'in the last day')
      + card('Bad news', fmt(day.filter((n) => newsLine(n)[1] === 'bad').length), 'in the last day')
      + card('Attacks on you', fmt(day.filter((n) => n.type === 'attacked').length), `${fmt(day.filter((n) => n.type === 'attacked' && n.success).length)} broke through`)
      + card('Your attacks', fmt(day.filter((n) => n.type === 'attack_report').length), `${fmt(day.filter((n) => n.type === 'attack_report' && n.success).length)} won`);
  }
  function draw() {
    const off = newsOff(), list = store.news.filter((n) => !newsHidden(n, off));
    glance(list);
    // Kinds: only groups that have news (and the one chosen), each with its count.
    const counts = new Map();
    for (const n of list) counts.set(newsGroup(n), (counts.get(newsGroup(n)) || 0) + 1);
    const opts = `<option value="all">All kinds (${fmt(list.length)})</option>${GROUPS.filter(([g]) => counts.has(g) || g === kind).map(([g, name]) => `<option value="${g}">${esc(name)} (${fmt(counts.get(g) || 0)})</option>`).join('')}`;
    if ($('kind').innerHTML !== opts) $('kind').innerHTML = opts;
    $('kind').value = kind; $('tone').value = tone; $('ticks').checked = !!store.showTicks;
    const items = list.filter((n) => (kind === 'all' || newsGroup(n) === kind) && (tone === 'all' || newsLine(n)[1] === tone)).map((n) => ({ at: n.at || 0, n }));
    if (store.showTicks && kind === 'all' && tone === 'all') for (const r of store.ticks) items.push({ at: r.at || 0, tick: r });
    items.sort((a, b) => b.at - a.at);
    const hidden = store.news.length - list.length;
    $('count').innerHTML = `${fmt(Math.min(shown, items.length))} of ${fmt(items.length)} shown${hidden ? ` · ${fmt(hidden)} turned off in <a href="#config">Configuration</a>` : ''}`;
    $('list').innerHTML = items.length ? byDay(items.slice(0, shown)) : `<p class="dim nw-empty">${esc(store.news.length ? 'Nothing of that kind.' : store.newsLoaded ? empty.news : 'Loading news…')}</p>`;
    $('more').hidden = items.length <= shown;
  }
  /** Your state's tab: your statemates' news, each line led by the house it happened to. */
  function drawState() {
    $('share').checked = !!store.house?.share_losses;
    const members = store.state?.members || [], mate = new Map(members.map((m) => [m.id, m]));
    // How many statemates share their hardships: only if the server says (older servers don't).
    const told = members.some((m) => 'share_losses' in m), sharing = members.filter((m) => m.id !== store.house?.id && m.share_losses).length;
    const list = store.stateNews || [], since = Date.now() - DAY, day = list.filter((n) => (n.at || 0) >= since);
    $('sglance').innerHTML = card('News', fmt(day.length), 'in the last day')
      + card('Bad news', fmt(day.filter((n) => mateNewsLine(n, '')[1] === 'bad').length), 'in the last day')
      + card('Attacks on them', fmt(day.filter((n) => n.type === 'attacked').length), `${fmt(day.filter((n) => n.type === 'attacked' && n.success).length)} broke through`)
      + card('Their attacks', fmt(day.filter((n) => n.type === 'attack_report').length), `${fmt(day.filter((n) => n.type === 'attack_report' && n.success).length)} won`);
    $('scount').textContent = store.stateNews ? `${fmt(Math.min(mateShown, list.length))} of ${fmt(list.length)} shown${told ? ` · ${fmt(sharing)} of ${fmt(Math.max(0, members.length - 1))} statemates share hardships` : ''}` : '';
    const who = (n) => mate.get(n.house)?.name || `House ${n.house}`;
    const items = list.map((n) => ({ at: n.at || 0, n }));
    $('slist').innerHTML = items.length ? byDay(items.slice(0, mateShown), who) : `<p class="dim nw-empty">${store.stateNews ? 'Nothing has happened to your statemates yet.' : 'Loading your state\'s news…'}</p>`;
    $('smore').hidden = items.length <= mateShown;
  }
  on($('kind'), 'change', () => { kind = $('kind').value; shown = STEP; save(); draw(); });
  on($('tone'), 'change', () => { tone = $('tone').value; shown = STEP; save(); draw(); });
  on($('ticks'), 'change', () => showTicks($('ticks').checked));
  on($('more'), 'click', () => { shown += STEP; draw(); });
  on($('smore'), 'click', () => { mateShown += STEP; drawState(); });
  on($('share'), 'change', async () => {
    const want = $('share').checked;
    const out = await act.shareLosses(want, { button: $('share') });
    if (!out) $('share').checked = !want;
  });

  const tabs = wireTabs(host, on, { tabs: TABS, key: `${KEY}.tab`, onShow: (t) => { if (t === 'state') { loadStateNews(); if (!store.state) loadState(); drawState(); } } });
  draw();
  return {
    update(c) {
      if (!c || c.has('news') || c.has('ticks') || c.has('timemode')) draw();
      if (!c || c.has('statenews') || c.has('state') || c.has('house')) drawState();
      if (c?.has('tick') && tabs.current() === 'state') loadStateNews();
    },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
