// Straightline's Science: books and scientists at a glance; each category (economy, military, arcane) as a card with
// its rank and the way to the next; paper and moving scientists in one place; then every science in its category's
// table, each with its own Invest (a count, Max, the bonus now and after). Logic: core/science.js, actions.
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { CATS, sci, defs, efficiency, bonusAt, rowOf, catOf, effText, ranks, rankName } from '../../core/science.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function mountScience(host, on) {
  host.innerHTML = `<div class="lpart lsci">
    <dl class="st-glance sc-glance" id="ls2-glance"></dl>
    <div class="sc-cats" id="ls2-cats"></div>
    <div class="sc-tools">
      <form id="ls2-paper" class="sc-tool" novalidate><h3 class="sub">Paper</h3>
        <p class="what" id="ls2-paperw"></p>
        <span class="field"><input id="ls2-pn" type="number" min="0" step="1" inputmode="numeric" aria-label="Paper a tick"> a tick</span>
        <button class="btn primary" id="ls2-pgo">Save</button></form>
      <form id="ls2-move" class="sc-tool" novalidate><h3 class="sub">Move scientists</h3>
        <p class="what">Moved scientists leave their experience behind: the new category's rank may drop.</p>
        <span class="field"><input id="ls2-mn" type="number" min="1" step="1" inputmode="numeric" placeholder="0" aria-label="Scientists to move"><button type="button" class="btn mini" id="ls2-mmax" aria-label="All scientists of that category">MAX</button></span>
        <label class="vh" for="ls2-from">From</label><select id="ls2-from">${CATS.map((k) => `<option value="${k}">${cap(k)}</option>`).join('')}</select>
        <span aria-hidden="true">→</span>
        <label class="vh" for="ls2-to">To</label><select id="ls2-to">${CATS.map((k, i) => `<option value="${k}"${i === 1 ? ' selected' : ''}>${cap(k)}</option>`).join('')}</select>
        <button class="btn" id="ls2-mgo">Move</button></form>
    </div>
    <p class="note" id="ls2-ladder"></p>
    <div id="ls2-list"></div>
  </div>`;
  const $ = (id) => host.querySelector(`#ls2-${id}`);
  const P = store.rules.params;

  // ---------- at a glance ----------
  function glance(s) {
    const total = (a) => a.reduce((x, y) => x + y, 0), eff = efficiency();
    const next = (s.ranks || []).reduce((a, r) => a + (r?.books_next_tick || 0), 0);
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    $('glance').innerHTML = card('Books', fmt(total(s.books)), `+${fmt(next)} next tick`) + card('Scientists', fmt(total(s.scientists)), `new ones join ${s.focus}`)
      + card('Invested', fmt(s.books_invested), 'books in sciences')
      + card('Science efficiency', eff.exact ? `${(eff.mult * 100).toFixed(1)}%` : '–', eff.exact ? 'libraries and academics' : 'known once a science has books');
  }

  // ---------- the categories ----------
  function cats(s) {
    $('cats').innerHTML = CATS.map((k, i) => {
      const r = s.ranks?.[i], focus = s.focus === k;
      const toNext = r && r.next_rank_at != null ? Math.min(100, (100 * r.experience_each) / r.next_rank_at) : 100;
      const invested = defs().filter((d) => d.category === k).reduce((a, d) => a + (rowOf(d.science)?.invested || 0), 0);
      return `<section class="sc-cat${focus ? ' focus' : ''}"><header><h3>${cap(k)}</h3>${focus ? '<span class="sc-focus">Focus</span>' : `<button type="button" class="btn mini" data-focus="${k}" aria-label="Make ${k} the focus">Make focus</button>`}</header>
        <dl class="sc-figs"><div><dt>Books</dt><dd>${fmt(s.books[i])}</dd></div><div><dt>Scientists</dt><dd>${fmt(s.scientists[i])}</dd></div><div><dt>Next tick</dt><dd>${r ? `+${fmt(r.books_next_tick)}` : '–'}</dd></div><div><dt>Invested</dt><dd>${fmt(invested)}</dd></div></dl>
        ${r ? `<p class="sc-rank"><b>${esc(cap(rankName(r.rank)))}</b> · ${fmt(r.books_each)} books a scientist a tick</p>
          <div class="sc-bar" role="img" aria-label="${r.next_rank_at != null ? `${Math.round(toNext)}% of the way to the next rank` : 'top rank'}"><i style="width:${toNext.toFixed(1)}%"></i></div>
          <p class="sc-next">${r.next_rank_at != null ? `${fmt(r.experience_each)} of ${fmt(r.next_rank_at)} written each, to ${esc(rankName(r.rank + 1))}` : 'Top rank'}</p>` : ''}</section>`;
    }).join('');
  }
  on($('cats'), 'click', (ev) => { const b = ev.target.closest('[data-focus]'); if (b) act.setScience({ focus: b.dataset.focus }, { button: b }); });

  // ---------- paper and moving scientists ----------
  function tools(s) {
    if (document.activeElement !== $('pn')) $('pn').value = s.paper_budget;
    $('paperw').textContent = `Paper spent each tick on writing: each adds ${P.books_per_paper} books, up to +${P.paper_cap_bp / 100}%. You hold ${fmt(store.house.materials[P.paper_material] || 0)} ${P.paper_material}.`;
    $('ladder').textContent = `Ranks: ${ranks().map((r, i) => `${rankName(i)} ${fmt(r.books)} books a tick (from ${fmt(r.from)} written each)`).join(' · ')}.`;
  }
  on($('paper'), 'submit', (ev) => { ev.preventDefault(); act.setScience({ paper: $('pn').value }, { button: $('pgo') }); });
  on($('mmax'), 'click', () => { $('mn').value = String(sci().scientists[CATS.indexOf($('from').value)] || ''); $('mn').focus(); });
  on($('move'), 'submit', (ev) => { ev.preventDefault(); act.assignScientists($('from').value, $('to').value, n0($('mn').value), { button: $('mgo') }).then((o) => { if (o) $('mn').value = ''; }); });

  // ---------- every science, by category, each with its own Invest ----------
  let shown = '';
  function list(s) {
    const key = JSON.stringify([s.books, s.sciences.map((r) => [r.science, r.invested, r.bonus_bp])]);
    if (key === shown) return;
    const keep = Object.fromEntries([...host.querySelectorAll('input[data-sci]')].map((i) => [i.dataset.sci, i.value]));
    shown = key;
    $('list').innerHTML = CATS.map((k, i) => {
      const ds = defs().filter((d) => d.category === k);
      if (!ds.length) return '';
      return `<section class="sc-grp"><h3 class="sub">${cap(k)} <span class="dim">${fmt(s.books[i])} books to invest</span></h3>
        <table class="tbl lb-tbl sc-tbl"><colgroup><col class="c-name"><col class="c-does"><col class="c-inv"><col class="c-now"><col class="c-n"><col class="c-max"><col class="c-after"><col class="c-go"></colgroup>
        <thead><tr><th>Science</th><th>What it does</th><th class="num">Invested</th><th>Bonus now</th><th class="num">Books</th><th></th><th>After</th><th></th></tr></thead><tbody>
        ${ds.map((d, j) => {
          const r = rowOf(d.science) || { invested: 0, bonus_bp: [] };
          const now = d.effects.map((e, x) => ({ stat: e.stat, bp: r.bonus_bp[x] || 0 }));
          return `<tr data-row="${esc(d.science)}"${j % 2 ? ' class="alt"' : ''}><th scope="row">${esc(d.name)}</th><td class="does">${esc(d.description)}</td>
            <td class="num${r.invested ? '' : ' dim'}">${fmt(r.invested)}</td><td class="${r.invested ? '' : 'dim'}">${esc(effText(now))}</td>
            <td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-sci="${esc(d.science)}" value="${esc(keep[d.science] || '')}" aria-label="Books to invest in ${esc(d.name)}"></td>
            <td class="acts"><button type="button" class="btn mini" data-smax="${esc(d.science)}" aria-label="All your ${k} books">MAX</button></td>
            <td class="after" data-after="${esc(d.science)}"></td>
            <td><button type="button" class="btn" data-invest="${esc(d.science)}" disabled>Invest</button></td></tr>`;
        }).join('')}</tbody></table></section>`;
    }).join('');
    after();
  }
  /** Each row with a count: the bonus it would give, or why it can't. */
  function after() {
    const s = sci(), eff = efficiency();
    for (const i of host.querySelectorAll('input[data-sci]')) {
      const d = defs().find((x) => x.science === i.dataset.sci), r = rowOf(d.science) || { invested: 0 }, n = n0(i.value), have = s.books[catOf(d)];
      const cell = host.querySelector(`[data-after="${CSS.escape(d.science)}"]`), go = host.querySelector(`[data-invest="${CSS.escape(d.science)}"]`);
      const why = n > have ? `you have ${fmt(have)} ${d.category} books` : '';
      cell.textContent = !n ? '' : why ? `Can't: ${why}` : `${effText(bonusAt(d, r.invested + n, eff))}${eff.exact ? '' : ' (≈)'}`;
      cell.classList.toggle('short', !!why);
      i.closest('tr').classList.toggle('on', n > 0);
      go.disabled = !n || !!why;
    }
  }
  on($('list'), 'input', after);
  on($('list'), 'click', async (ev) => {
    const mx = ev.target.closest('[data-smax]'), go = ev.target.closest('[data-invest]');
    const inp = (id) => host.querySelector(`input[data-sci="${CSS.escape(id)}"]`);
    if (mx) { const d = defs().find((x) => x.science === mx.dataset.smax); inp(d.science).value = String(sci().books[catOf(d)] || ''); after(); inp(d.science).focus(); }
    if (go) { const id = go.dataset.invest; if (await act.invest(id, n0(inp(id).value), { button: go })) { inp(id).value = ''; after(); } }
  });

  function draw() { const s = sci(), root = host.querySelector('.lsci'); if (!root) return; if (!s) { root.innerHTML = '<p class="dim">No science data from the server.</p>'; return; } glance(s); cats(s); tools(s); list(s); }
  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('rules')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
