// Straightline's Science: books and scientists at a glance; each category (economy, military, arcane) as a card with
// its rank and the way to the next; paper and moving scientists in one place; then every science in its category's
// table, each with its own Invest (a count, Max, the bonus now and after). The curve every science follows, with
// your sciences on it (and where a typed count would take one), opens from ⓘ on the efficiency card; on a page wide
// enough it stands beside everything instead, in a tall panel. Logic: core/science.js, actions.
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { CATS, sci, defs, efficiency, bonusAt, rowOf, catOf, effText, ranks, rankName, shareAt, halfBooks, hasCurve } from '../../core/science.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
/** A tidy step for about `n` gridlines over a span: 1, 2 or 5 times a power of ten. */
const niceStep = (span, n) => { const raw = span / n || 1, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw); };
/** An axis label: 2.6M, 45k, 900. */
const short = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : fmt(v));

export function mountScience(host, on) {
  host.innerHTML = `<div class="lpart lsci"><div class="sc-main">
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
    <div id="ls2-list"></div></div>
    <aside class="sc-side" id="ls2-side" aria-label="The science curve">
      <section class="sc-graph" id="ls2-curve" aria-labelledby="ls2-ch"><h3 class="sub" id="ls2-ch">The curve</h3>
        <p class="what" id="ls2-cwhat"></p><div class="sc-chart" id="ls2-chart"></div><p class="sc-read" id="ls2-read" aria-live="polite"></p></section></aside>
    <dialog class="ldlg sc-dlg" id="ls2-dlg" aria-labelledby="ls2-dlgh">
      <header><h2 id="ls2-dlgh">The curve</h2><button type="button" class="x" data-close aria-label="Close (Esc)">×</button></header>
      <div class="body" id="ls2-dlgb"></div></dialog>
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
      + card('Science efficiency', eff.exact ? `${(eff.mult * 100).toFixed(1)}%` : '–', eff.exact ? 'libraries and academics' : 'known once a science has books').replace('</div>',
        hasCurve() ? '<dd class="sc-infod"><button type="button" class="sc-info" data-curve aria-haspopup="dialog">ⓘ The curve</button></dd></div>' : '</div>');
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
        <table class="tbl lb-tbl sc-tbl fit">
        <thead><tr><th data-fx="last">Science</th><th data-pri="6" data-fx="flex">What it does</th><th class="num" data-pri="3">Invested</th><th data-pri="4" data-fx="clip">Bonus now</th><th class="num">Books</th><th></th><th data-pri="5" data-fx="clip">After</th><th></th></tr></thead><tbody>
        ${ds.map((d, j) => {
          const r = rowOf(d.science) || { invested: 0, bonus_bp: [] };
          const now = d.effects.map((e, x) => ({ stat: e.stat, bp: r.bonus_bp[x] || 0 }));
          return `<tr data-row="${esc(d.science)}" title="${esc(d.name)}: ${esc(d.description)}"${j % 2 ? ' class="alt"' : ''}><th scope="row">${esc(d.name)}</th><td class="does" title="${esc(d.description)}">${esc(d.description)}</td>
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
    curve();
  }

  // ---------- the curve ----------
  // Every science's bonus is its limit × the same share of the way along, so one curve serves them all: the share
  // against books invested, at your science efficiency. Your sciences sit on it as dots; a typed count adds a hollow
  // dot where it would take that science. Hover a dot, or focus the chart and use ← →, to read it.
  let pts = [], geo = null, idx = -1;
  function curve() {
    const box = $('chart');
    if (!hasCurve()) { $('curve').hidden = true; return; }
    $('curve').hidden = false;
    const s = sci(), eff = efficiency(), half = halfBooks(eff.mult);
    pts = [];
    for (const d of defs()) {
      const r = rowOf(d.science), inv = r?.invested || 0, n = n0(host.querySelector(`input[data-sci="${CSS.escape(d.science)}"]`)?.value);
      if (inv) pts.push({ d, inv, now: true });
      if (n && n <= s.books[catOf(d)]) pts.push({ d, inv: inv + n, now: false, n });
    }
    pts.sort((a, b) => a.inv - b.inv || a.now - b.now);
    $('cwhat').textContent = `Every science follows this curve: its bonus is its limit times how far along it is. Books bring less the more a science has; at your efficiency${eff.exact ? '' : ' (≈)'}, a science gives half its limit at ${fmt(Math.round(half))} books.`;
    const W = Math.max(280, Math.min(1100, Math.round(box.clientWidth || 720))), H = box.closest('.sc-side') ? Math.round(W * 1.3) : W > 720 ? 270 : 220, L = 46, R = 14, T = 12, B = 30;
    const top = Math.max(half, ...pts.map((p) => p.inv * 1.25)), xs = niceStep(top, W > 520 ? 6 : 3), xmax = Math.ceil(top / xs) * xs;
    const x = (v) => L + (v / xmax) * (W - L - R), y = (f) => T + (1 - f) * (H - T - B);
    const g = [];
    for (let f = 0; f <= 1.0001; f += 0.25) g.push(`<line class="g-grid" x1="${L}" x2="${W - R}" y1="${y(f)}" y2="${y(f)}"/><text class="g-lab" x="${L - 6}" y="${y(f) + 4}" text-anchor="end">${f * 100}%</text>`);
    for (let v = xs; v <= xmax; v += xs) g.push(`<line class="g-tickm" x1="${x(v)}" x2="${x(v)}" y1="${H - B}" y2="${H - B + 4}"/><text class="g-lab" x="${x(v)}" y="${H - B + 16}" text-anchor="middle">${short(v)}</text>`);
    // Samples bunch near zero, where the curve is steepest.
    const line = Array.from({ length: 97 }, (_, i) => { const v = xmax * (i / 96) ** 2; return `${i ? 'L' : 'M'}${x(v).toFixed(1)},${y(shareAt(v, eff.mult)).toFixed(1)}`; }).join('');
    const halfMark = half <= xmax ? `<line class="sc-half" x1="${x(half)}" x2="${x(half)}" y1="${y(0.5)}" y2="${H - B}"/><text class="g-lab" x="${x(half) + 4}" y="${y(0.5) - 5}">half</text>` : '';
    const dots = pts.map((p, i) => `<circle class="sc-dot${p.now ? '' : ' after'}" data-i="${i}" cx="${x(p.inv).toFixed(1)}" cy="${y(shareAt(p.inv, eff.mult)).toFixed(1)}" r="5"/>`).join('');
    const hadFocus = box.contains(document.activeElement);
    box.innerHTML = `<svg class="g-svg sc-svg" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="The science curve: share of a science's limit by books invested.${pts.length ? ' Use the left and right arrow keys to read each of your sciences.' : ''}">
      ${g.join('')}<line class="g-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><path class="g-line" d="${line}"/>${halfMark}${dots}
      <circle class="sc-ring" r="9" visibility="hidden"/></svg>`;
    geo = { x, y, mult: eff.mult, W };
    if (hadFocus) box.querySelector('svg').focus();
    if (idx >= pts.length) idx = -1;
    if (idx >= 0) point(idx); else read();
  }
  function read() {
    const now = pts.filter((p) => p.now);
    if (!now.length) { $('read').textContent = `No books invested yet: your sciences appear on the curve once they have some. ${pts.length ? 'Hollow dots: where your typed counts would take them.' : 'Type a count below to see where it would land.'}`; return; }
    const far = now.reduce((a, b) => (b.inv > a.inv ? b : a));
    $('read').textContent = `${now.length} of your sciences on the curve (dots); furthest along, ${far.d.name} at ${Math.round(shareAt(far.inv, geo.mult) * 100)}% of its limit. Hollow dots: where a typed count would take one.`;
  }
  function point(i) {
    const svg = $('chart').querySelector('svg');
    if (!svg || !pts.length) return;
    idx = Math.max(0, Math.min(pts.length - 1, i));
    const p = pts[idx], f = shareAt(p.inv, geo.mult), ring = svg.querySelector('.sc-ring');
    ring.setAttribute('cx', geo.x(p.inv)); ring.setAttribute('cy', geo.y(f)); ring.setAttribute('visibility', 'visible');
    $('read').textContent = `${p.d.name}${p.now ? '' : `, after ${fmt(p.n)} more`}: ${fmt(p.inv)} books, ${effText(bonusAt(p.d, p.inv))} (${(f * 100).toFixed(1)}% of its limit).`;
  }
  on($('chart'), 'mousemove', (ev) => {
    const svg = ev.target.closest('svg');
    if (!svg || !geo || !pts.length) return;
    const r = svg.getBoundingClientRect(), sx = ((ev.clientX - r.left) / r.width) * geo.W, sy = ((ev.clientY - r.top) / r.width) * geo.W;   // the chart keeps its aspect: one scale for both
    let best = -1, bd = 24 * 24;
    pts.forEach((p, i) => { const dx = geo.x(p.inv) - sx, dy = geo.y(shareAt(p.inv, geo.mult)) - sy, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; } });
    if (best >= 0) point(best);
  });
  on($('chart'), 'mouseleave', () => { if (document.activeElement?.closest('#ls2-chart')) return; idx = -1; $('chart').querySelector('.sc-ring')?.setAttribute('visibility', 'hidden'); if (geo) read(); });
  on($('chart'), 'keydown', (ev) => {
    const m = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[ev.key];
    if (m === undefined || !pts.length) return;
    ev.preventDefault();
    point(idx < 0 ? (m < 0 ? pts.length - 1 : 0) : m === -Infinity ? 0 : m === Infinity ? pts.length - 1 : idx + m);
  });
  let sized = 0;
  on(window, 'resize', () => { clearTimeout(sized); sized = setTimeout(() => { if (host.querySelector('.lsci')) curve(); }, 150); });

  // ---------- where the curve stands: beside the page when it's wide enough, else in a window from ⓘ ----------
  const WIDE = 1500;   // the room around the page (px) from which the panel fits beside the tables (line.css widens the page)
  const lsci = host.querySelector('.lsci'), dlg = $('dlg');
  let opener = null;
  function placeCurve() {
    if (!$('curve')) return;   // no science data: the page is a note
    const wide = lsci.parentElement.clientWidth >= WIDE;
    lsci.classList.toggle('wide', wide);
    if (wide && dlg.open) dlg.close();
    const home = wide ? $('side') : $('dlgb');
    if ($('curve').parentElement !== home) { home.append($('curve')); curve(); }
  }
  const sizes = new ResizeObserver(() => placeCurve());
  sizes.observe(lsci.parentElement);
  on(host, 'click', (ev) => {
    const b = ev.target.closest('[data-curve]');
    if (!b) return;
    opener = b;
    dlg.showModal();
    curve();
  });
  on(dlg, 'click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close(); });
  on(dlg, 'close', () => { if (opener?.isConnected) opener.focus(); else host.querySelector('[data-curve]')?.focus(); });
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
    destroy() { sizes.disconnect(); host.replaceChildren(); },
  };
}
