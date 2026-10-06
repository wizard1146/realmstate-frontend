// The SCI detail view: books and scientists, every science with an invest form and its curve,
// then academics and the Colloquium (colloq.js).
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { fillMax } from './orders.js';
import * as S from './science.js';
import { pctBp } from './does.js';
import { lastDelta } from './trend.js';
import { academicsBuild, colloqBuild, colloqUpdate, colloqWire } from './colloq.js';
import { tabButtons, panelAttrs, wireTabs } from './tabs.js';
import { waverHTML } from './waver.js';
import { truthsDetailHTML, truthsDetailUpdate, truthsDetailWire } from './truthsui.js';


const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const catOpts = (sel) => S.CATS.map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${k}</option>`).join('');

/** A small curve: the main effect's bonus against books invested, marking now and after. */
function curve(d, now, after, eff) {
  const W = 320, H = 92, L = 6, R = 6, T = 8, B = 16;
  const xmax = Math.max(10000, Math.ceil((Math.max(now, after) * 2) / 1000) * 1000);
  const e = d.effects[0];
  const y0 = Math.abs(Math.trunc(S.rawBp(e.per_root_bp, xmax) * eff.mult)) || 1;
  const x = (b) => L + (b / xmax) * (W - L - R);
  const y = (b) => T + (1 - Math.abs(Math.trunc(S.rawBp(e.per_root_bp, b) * eff.mult)) / y0) * (H - T - B);
  const pts = Array.from({ length: 41 }, (_, i) => (xmax * i) / 40).map((b) => `${x(b).toFixed(1)},${y(b).toFixed(1)}`).join(' ');
  const mark = (b, cls) => `<circle class="${cls}" cx="${x(b)}" cy="${y(b)}" r="3.5"/>`;
  return `<svg class="sc-curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.name)}: bonus by books invested, flattening as books grow (square root). Now ${fmt(now)}, after ${fmt(after)}.">
    <line class="g-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
    <polyline class="g-line" points="${pts}"/>${mark(now, 'sc-now')}${after !== now ? mark(after, 'sc-after') : ''}
    <text class="g-lab" x="${L}" y="${H - 3}">0</text><text class="g-lab" x="${W - R}" y="${H - 3}" text-anchor="end">${fmt(xmax)} books</text></svg>`;
}

export function sciDetail(b, on) {
  const s0 = S.sci();
  if (!s0) { b.innerHTML = '<p class="dim">No science data from the server.</p>'; return { update() {} }; }
  const opts = S.CATS.map((k) => `<optgroup label="${k}">${S.defs().filter((d) => d.category === k).map((d) => `<option value="${esc(d.science)}">${esc(d.name)}</option>`).join('')}</optgroup>`).join('');
  const T = S.SCI_TAB;
  b.innerHTML = `<div class="acttabs seg2" role="tablist" aria-label="SCI sections" id="d-sci-tabs">${tabButtons(T, 'd-sci')}<span class="dim small">books, ranks and sciences · academics and heirs · the state's shared research · quests and Truths</span></div>
  <div ${panelAttrs(T, 'd-sci', 'science')}><div class="dgrid">
    <section><h3 class="sub">BOOKS AND SCIENTISTS <span class="dim" id="d-sc-rate"></span></h3><div id="d-sc-cats"></div>
      <form id="d-sc-set" class="dform">
        <label for="d-sc-focus">Focus</label><span class="field"><select id="d-sc-focus">${catOpts(s0.focus)}</select> <span class="dim small">new scientists join it</span></span>
        <label for="d-sc-paper">Paper</label><span class="field"><input id="d-sc-paper" type="number" min="0" inputmode="numeric" class="w5"> <span class="dim small" id="d-sc-paperinfo"></span></span>
        <span></span><button class="btn primary">SAVE</button>
      </form>
      <form id="d-sc-move" class="dform">
        <label for="d-sc-from">Move</label><span class="field"><input id="d-sc-mn" type="number" min="1" value="1" inputmode="numeric" class="w5" aria-label="Scientists to move"><button type="button" class="btn mini" data-max aria-label="All scientists of that category">MAX</button>
          <select id="d-sc-from" aria-label="From">${catOpts('economy')}</select> → <select id="d-sc-to" aria-label="To">${catOpts('military')}</select></span>
        <span></span><button class="btn">MOVE</button>
        <p class="dim small span">Moved scientists leave their experience behind: the new category's rank drops.</p>
      </form>
      <div id="d-sc-ranks"></div>
    </section>
    <section><h3 class="sub">INVEST <span class="dim">books take effect at once</span></h3>
      <form id="d-sc-inv" class="dform">
        <label for="d-sc-sci">Science</label><select id="d-sc-sci">${opts}</select>
        <label for="d-sc-n">Books</label><span class="field"><input id="d-sc-n" type="number" min="1" value="1000" inputmode="numeric"><button type="button" class="btn mini" data-max aria-label="All books of this science's category">MAX</button></span>
        <span></span><button class="btn primary">INVEST</button>
        <p class="span small" id="d-sc-q" aria-live="polite"></p>
        <div class="span" id="d-sc-curve"></div>
      </form>
    </section>
    <section class="wide"><h3 class="sub">SCIENCES <span class="dim" id="d-sc-eff"></span></h3><div id="d-sc-list"></div></section>
  </div></div>
  <div ${panelAttrs(T, 'd-sci', 'academics')}><div class="dgrid">${academicsBuild()}</div></div>
  <div ${panelAttrs(T, 'd-sci', 'colloquium')}><div class="dgrid">${colloqBuild()}</div></div>
  <div ${panelAttrs(T, 'd-sci', 'truths')}>${truthsDetailHTML()}</div>`;
  const $ = (id) => b.querySelector(`#d-sc-${id}`);
  const s = () => S.sci();
  const defOf = () => S.defs().find((d) => d.science === $('sci').value);

  function quote() {
    const d = defOf(), r = S.rowOf(d.science), c = S.catOf(d), n = num($('n').value);
    const eff = S.efficiency();
    const have = s().books[c];
    const now = S.bonusAt(d, r.invested, eff), aft = S.bonusAt(d, r.invested + n, eff);
    const why = !n ? '' : n > have ? `you have ${fmt(have)} ${d.category} books` : '';
    $('q').className = `span small${why ? ' short' : ''}`;
    $('q').textContent = `${d.name}: ${S.effText(now)} → ${S.effText(aft)}${eff.exact ? '' : ' (estimate: nothing invested yet, so library and academic boosts are not known)'}. `
      + (why ? `Can't: ${why}.` : `Leaves ${fmt(have - n)} ${d.category} books.`);
    $('curve').innerHTML = curve(d, r.invested, r.invested + n, eff);
  }
  function update() {
    truthsDetailUpdate(b);
    const wv = b.querySelector('#d-ac-waver');
    if (wv) wv.innerHTML = waverHTML('academic');
    const x = s();
    if (!x) return;
    const per = lastDelta('books');
    $('rate').textContent = per != null ? `+${fmt(per)} books last tick (all categories, practice and paper included)` : '';
    const rk = (i) => x.ranks?.[i];
    $('cats').innerHTML = `<div class="scrollx"><table class="tbl"><tr><th>CATEGORY</th><th class="num">BOOKS</th><th class="num">SCIENTISTS</th><th>RANK</th><th class="num"><abbr title="Books this category writes next tick (rank, book output and paper)">NEXT TICK</abbr></th><th class="num">INVESTED</th><th></th></tr>${S.CATS.map((k, i) => {
      const r = rk(i);
      const rank = r ? `${S.rankName(r.rank)} <span class="dim small">${fmt(r.books_each)}/sci${r.next_rank_at != null ? ` · next at ${fmt(r.next_rank_at)} (${fmt(r.experience_each)})` : ' · top'}</span>` : '<span class="dim">·</span>';
      return `<tr><td>${k}</td><td class="num">${fmt(x.books[i])}</td><td class="num">${fmt(x.scientists[i])}</td><td>${rank}</td><td class="num">${r ? `+${fmt(r.books_next_tick)}` : '·'}</td><td class="num">${fmt(S.defs().filter((d) => d.category === k).reduce((a, d) => a + (S.rowOf(d.science)?.invested || 0), 0))}</td><td class="dim small">${x.focus === k ? 'focus' : ''}</td></tr>`;
    }).join('')}</table></div>`;
    if (document.activeElement !== $('paper')) $('paper').value = x.paper_budget;
    const P = store.rules.params;
    $('paperinfo').textContent = `/tick · ${fmt(store.house.materials[P.paper_material] || 0)} ${P.paper_material} held; each adds ${P.books_per_paper} books, up to +${P.paper_cap_bp / 100}%`;
    $('ranks').innerHTML = `<p class="dim small">Rank ladder (books each scientist writes a tick, by books written per scientist in that category): ${S.ranks().map((r, i) => `${S.rankName(i)} ${fmt(r.books)} from ${fmt(r.from)}`).join(' · ')}. "Next at" is books written per scientist; yours is in brackets.</p>`;
    const eff = S.efficiency();
    $('eff').textContent = eff.exact ? `science efficiency ${(eff.mult * 100).toFixed(1)}% (read back from your bonuses)` : 'science efficiency not known until a science has books; previews assume 100%';
    $('list').innerHTML = `<div class="scrollx"><table class="tbl wide-tbl"><tr><th>SCIENCE</th><th>CAT</th><th>WHAT IT DOES</th><th class="num">INVESTED</th><th>BONUS NOW</th><th><abbr title="What the next 1,000 books add (estimate from the formula)">+1,000 BOOKS</abbr></th><th><abbr title="Bonus with twice the books invested">AT 2×</abbr></th></tr>${S.defs().map((d) => {
      const r = S.rowOf(d.science) || { invested: 0, bonus_bp: [] };
      const nowExact = d.effects.map((e, j) => ({ stat: e.stat, bp: r.bonus_bp[j] || 0 }));
      const est = S.bonusAt(d, r.invested, eff), next = S.bonusAt(d, r.invested + 1000, eff);
      const gain = next.map((g, j) => ({ stat: g.stat, bp: g.bp - est[j].bp }));
      const dbl = S.bonusAt(d, Math.max(r.invested * 2, 1), eff);
      return `<tr class="graphable" tabindex="0" data-sci="${esc(d.science)}" title="Select to invest in ${esc(d.name)}"><td class="name">${esc(d.name)}</td><td class="dim">${S.CAT_SHORT[d.category]}</td><td class="dim small wrap">${esc(d.description)}</td><td class="num${r.invested ? '' : ' zero'}">${fmt(r.invested)}</td>`
        + `<td class="${r.invested ? '' : 'zero'}">${esc(S.effText(nowExact))}</td><td class="up">${esc(S.effText(gain))}</td><td class="dim">${r.invested ? esc(S.effText(dbl)) : '·'}</td></tr>`;
    }).join('')}</table></div>`;
    quote();
    colloqUpdate(b);
  }
  on($('inv'), 'input', quote);
  on($('inv'), 'click', (ev) => { if (ev.target.closest('[data-max]')) fillMax($('n'), s().books[S.catOf(defOf())], `no ${defOf().category} books`); });
  // Invested: the count goes back to 0 (a refused order keeps it, to correct).
  on($('inv'), 'submit', async (ev) => { ev.preventDefault(); if (await act.invest($('sci').value, num($('n').value), { button: ev.submitter })) { $('n').value = 0; quote(); } });
  on($('set'), 'submit', (ev) => { ev.preventDefault(); act.setScience({ focus: $('focus').value, paper: $('paper').value }, { button: ev.submitter }); });
  on($('move'), 'click', (ev) => { if (ev.target.closest('[data-max]')) fillMax($('mn'), s().scientists[S.CATS.indexOf($('from').value)], `no ${$('from').value} scientists`); });
  on($('move'), 'submit', (ev) => { ev.preventDefault(); act.assignScientists($('from').value, $('to').value, num($('mn').value), { button: ev.submitter }); });
  const pick = (row) => { $('sci').value = row.dataset.sci; quote(); $('n').focus(); };
  on(b, 'click', (ev) => { const r = ev.target.closest('tr[data-sci]'); if (r) pick(r); });
  on(b, 'keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('tr[data-sci]')) { ev.preventDefault(); pick(ev.target); } });
  colloqWire(b, on);
  truthsDetailWire(b, on);
  wireTabs(b.querySelector('#d-sci-tabs'), b, on, T);
  update();
  return { update };
}
