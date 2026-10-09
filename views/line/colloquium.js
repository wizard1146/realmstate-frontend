// Straightline's Colloquium: your state's shared research. The project being researched at a glance; every project as
// a card (what it does, its tier and the way to the next, decay, givers; locked if your realm can't have it; Research
// for the leader); and a Give sheet (books from a category, Max, the renown it earns). Data: /colloquium; actions.
import { store, loadColloquium } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { CATS, sci } from '../../core/science.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function mountColloquium(host, on) {
  const P = store.rules.params;
  host.innerHTML = `<div class="lpart lcol">
    <dl class="st-glance co-glance" id="lc-glance"></dl>
    <div class="atk-layout">
      <div class="atk-main"><h3 class="sub">Projects <span class="dim">knowledge fades each tick, faster the longer nobody gives</span></h3><div class="ac-cards" id="lc-list"></div></div>
      <aside class="atk-sheet" aria-label="Give books">
        <h3 class="sub">Give books</h3>
        <p class="what">Any category counts toward the project. You earn ${fmt(P.renown_per_thousand_books)} renown for every 1,000 books given.</p>
        <form id="lc-form" class="lform atk-grid" novalidate>
          <label for="lc-cat">From</label><select id="lc-cat">${CATS.map((k) => `<option value="${k}">${cap(k)}</option>`).join('')}</select>
          <label for="lc-n">Books</label><span class="field"><input id="lc-n" type="number" min="1" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" id="lc-max" aria-label="All books of that category">MAX</button></span>
        </form>
        <p class="doing" id="lc-doing" aria-live="polite"></p>
        <div class="atk-go"><button type="button" class="btn primary" id="lc-go">Give</button></div>
      </aside>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#lc-${id}`);
  if (!store.colloquium) loadColloquium();

  function draw() {
    const c = store.colloquium, s = sci();
    if (!c || !s) { $('list').innerHTML = '<p class="dim">Loading the Colloquium…</p>'; return; }
    const active = c.projects.find((p) => p.project === c.active);
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    $('glance').innerHTML = card('Researching', active ? esc(active.name) : 'Nothing yet', active ? `tier ${active.tier} of ${active.tiers.length}` : '')
      + card('Chosen by', c.i_lead ? 'You' : 'Your leader', c.i_lead ? 'you lead your state' : esc(store.state?.leader?.name || 'none yet'))
      + card('Your books', fmt(s.books.reduce((a, b) => a + b, 0)), 'all categories')
      + card('Renown', `+${fmt(P.renown_per_thousand_books)}`, 'per 1,000 books given');
    const focus = host.contains(document.activeElement) && document.activeElement.id;
    $('list').innerHTML = c.projects.map((p) => {
      const next = p.tiers[p.tier], prev = p.tier ? p.tiers[p.tier - 1] : 0, on2 = p.project === c.active;
      const prog = next ? Math.min(100, (100 * Math.max(0, p.knowledge - prev)) / Math.max(1, next - prev)) : 100;
      return `<article class="ac-card co-card${on2 ? ' on' : ''}${p.open ? '' : ' locked'}"><header><h4>${esc(p.name)}</h4>${on2 ? '<span class="gn-badge">Researching</span>' : ''}</header>
        <p class="co-does">${esc(p.description)}</p>
        ${p.open ? `<p class="co-tier">Tier <b>${p.tier}</b> of ${p.tiers.length} · ${fmt(p.knowledge)} knowledge${next ? `, next tier at ${fmt(next)}` : ', all tiers'}</p>
          <div class="sc-bar"><i style="width:${prog.toFixed(1)}%"></i></div>
          <p class="co-meta"><span class="${p.decay_bp_next_tick ? 'down' : ''}">${(p.decay_bp_next_tick / 100).toFixed(2)}% fades next tick</span> · idle ${fmt(p.idle_ticks)} ticks · ${fmt(p.contributors.length)} giver${p.contributors.length === 1 ? '' : 's'}</p>
          ${c.i_lead && !on2 ? `<div class="gn-acts"><button type="button" class="btn mini" id="lc-set-${esc(p.project)}" data-research="${esc(p.project)}">Research this</button></div>` : ''}`
        : `<p class="co-lock">Needs a ${esc(p.requires_material)} realm.</p>`}</article>`;
    }).join('');
    if (focus) host.querySelector(`#${CSS.escape(focus)}`)?.focus();
    sheet();
  }
  function sheet() {
    const c = store.colloquium, s = sci();
    if (!c || !s) return;
    const k = $('cat').value, have = s.books[CATS.indexOf(k)], n = n0($('n').value);
    const why = [!c.active ? 'no project is being researched yet' : '', !n ? 'say how many books' : '', n > have ? `you have ${fmt(have)} ${k} books` : ''].filter(Boolean);
    $('doing').textContent = why.length ? `Can't yet: ${why.join('; ')}.` : `Give ${fmt(n)} ${k} books to ${c.projects.find((p) => p.project === c.active)?.name}, for about +${fmt(Math.floor(n / 1000) * P.renown_per_thousand_books)} renown.`;
    $('doing').classList.toggle('short', why.length > 0);
    $('go').disabled = why.length > 0;
  }
  on($('list'), 'click', (ev) => { const b = ev.target.closest('[data-research]'); if (b) act.setResearch(b.dataset.research, { button: b }); });
  on(host.querySelector('.atk-sheet'), 'input', sheet);
  on(host.querySelector('.atk-sheet'), 'change', sheet);
  on($('form'), 'submit', (ev) => ev.preventDefault());
  on($('max'), 'click', () => { $('n').value = String(sci().books[CATS.indexOf($('cat').value)] || ''); sheet(); $('n').focus(); });
  on($('go'), 'click', async () => { if (await act.contribute($('cat').value, n0($('n').value), { button: $('go') })) $('n').value = ''; sheet(); });

  draw();
  return {
    update(c) { if (!c || c.has('colloquium') || c.has('house') || c.has('state')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
