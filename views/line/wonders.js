// Straightline's World Wonders: every wonder as a card (what it does, its cost and time, standing, plan known or not;
// Start for a house that knows its plan); your state's builds with funding bars; a Fund sheet; and the Halls of the
// Dead's Revive, behind a confirm window. Data: /me (wonders, wonder_works, truths), /rules wonders; actions.
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { wonderDoes } from '../../core/truths.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const bar = (have, need) => `<div class="sc-bar"><i style="width:${need ? Math.min(100, (100 * have) / need).toFixed(1) : 100}%"></i></div>`;
const houseName = (id) => (id === store.house?.id ? 'you' : store.state?.members?.find((m) => m.id === id)?.name || `house ${id}`);

export function mountWonders(host, on) {
  const P = store.rules.params;
  host.innerHTML = `<div class="lpart lwon">
    <div class="atk-layout">
      <div class="atk-main">
        <h3 class="sub">Wonders <span class="dim">one of each in the world; a house that knows its plan starts it, its state funds it</span></h3><div class="ac-cards" id="lo-list"></div>
        <h3 class="sub">Your state's builds</h3><div class="ac-cards" id="lo-builds"></div>
        <section class="wo-halls" id="lo-halls"></section>
      </div>
      <aside class="atk-sheet" aria-label="Fund a build">
        <h3 class="sub">Fund a build</h3>
        <form id="lo-form" class="lform atk-grid" novalidate>
          <label for="lo-b">Build</label><select id="lo-b"></select>
          <label for="lo-g">Gold</label><span class="field"><input id="lo-g" type="number" min="0" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" data-omax="g" aria-label="As much gold as is needed">MAX</button></span>
          <label for="lo-m">Material</label><select id="lo-m"></select>
          <label for="lo-n">Amount</label><span class="field"><input id="lo-n" type="number" min="0" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" data-omax="n" aria-label="As much as is needed">MAX</button></span>
        </form>
        <p class="doing" id="lo-doing" aria-live="polite"></p>
        <div class="atk-go"><button type="button" class="btn primary" id="lo-go">Give</button></div>
      </aside>
    </div>
    <dialog class="ldlg tq-dlg" id="lo-dlg" aria-labelledby="lo-dlg-h">
      <header><h2 id="lo-dlg-h">Revive your army?</h2><button type="button" class="x" data-close aria-label="Cancel (Esc)">×</button></header>
      <div class="body"><p id="lo-dlgp"></p><div class="atk-btns"><button type="button" class="btn" data-close>Not now</button><button type="button" class="btn danger" id="lo-dyes">Revive</button></div></div></dialog>
  </div>`;
  const $ = (id) => host.querySelector(`#lo-${id}`);
  const halls = () => (P.wonders || []).find((x) => x.revive_ticks > 0);

  function draw() {
    const h = store.house;
    if (!h) return;
    const standing = new Map((h.wonders || []).map((x) => [x.id, x])), knows = new Set((h.truths || []).map((t) => t.id));
    const mine = (h.wonder_works || []).find((x) => x.builder === h.id), focus = host.contains(document.activeElement) && document.activeElement.id;
    $('list').innerHTML = (P.wonders || []).map((x) => {
      const s = standing.get(x.id), plan = knows.has(x.truth);
      const why = s ? '' : !plan ? 'needs its plan (its Truth)' : mine ? 'your house is already building one' : '';
      return `<article class="ac-card wo-card${s ? ' standing' : plan ? ' known' : ''}"><header><h4>${esc(x.name)}</h4><span class="gn-badge">${s ? 'Standing' : plan ? 'Plan known' : 'Plan not known'}</span></header>
        <p class="co-does">${esc(cap(wonderDoes(x)))}.</p>
        <p class="wo-cost">${fmt(x.gold)} gold${Object.entries(x.materials || {}).map(([m, q]) => ` + ${fmt(q)} ${esc(m)}`).join('')} · ${fmt(x.ticks)} ticks to raise</p>
        ${s ? `<p class="dim small">Built by ${esc(s.house_name)} (<a href="#state" data-open-state="${s.state.realm}:${s.state.state}">${s.state.realm}:${s.state.state}</a>), tick ${fmt(s.tick)}.</p>`
          : `<div class="gn-acts"><button type="button" class="btn mini" id="lo-start-${esc(x.id)}" data-start="${esc(x.id)}"${why ? ` disabled title="${esc(why)}"` : ''}>Start it</button>${why ? `<span class="dim small">${esc(cap(why))}.</span>` : ''}</div>`}</article>`;
    }).join('') || '<p class="dim">No wonders this age.</p>';
    const works = h.wonder_works || [];
    $('builds').innerHTML = works.length ? works.map((x) => `<article class="ac-card"><header><h4>${esc(x.name)}</h4><span class="gn-badge">${x.done_tick ? `Finishes tick ${fmt(x.done_tick)}` : 'Funding'}</span></header>
      <p class="dim small">Started by ${esc(houseName(x.builder))}.</p>
      <p class="wk-fund">Gold <b>${fmt(x.gold)}</b> of ${fmt(x.gold_needed)}</p>${bar(x.gold, x.gold_needed)}
      ${x.materials.map((m) => `<p class="wk-fund">${esc(cap(m.material))} <b>${fmt(m.given)}</b> of ${fmt(m.needed)}</p>${bar(m.given, m.needed)}`).join('')}</article>`).join('')
      : '<p class="dim">None. A house that knows a wonder\'s plan starts one; then every house of the state may fund it.</p>';
    // The Halls of the Dead: only its owner revives.
    const hl = halls(), owned = hl && standing.get(hl.id), own = owned && owned.house === h.id;
    $('halls').innerHTML = hl ? `<h3 class="sub">${esc(hl.name)}</h3><p class="dim">${own ? (owned.revived ? 'Used this season.' : `Restore your army to what it was ${fmt(hl.revive_ticks)} ticks ago, for ${fmt(hl.revive_renown)} renown (you have ${fmt(h.renown)}). Once a season.`) : `Only the house that owns the ${esc(hl.name)} may revive its army.`}</p>
      ${own ? `<div class="gn-acts"><button type="button" class="btn danger" id="lo-revive"${owned.revived || h.renown < hl.revive_renown ? ' disabled' : ''}>Revive…</button></div>` : ''}` : '';
    if (focus) host.querySelector(`#${CSS.escape(focus)}`)?.focus();
    sheet();
  }
  function sheet() {
    const h = store.house, open = (h.wonder_works || []).filter((x) => !x.done_tick);
    const sig = open.map((x) => `${x.builder}:${x.id}`).join(',');
    if ($('b').dataset.sig !== sig) { const v = $('b').value; $('b').innerHTML = open.map((x) => `<option value="${x.builder}">${esc(x.name)} (${esc(houseName(x.builder))})</option>`).join(''); if (v) $('b').value = v; $('b').dataset.sig = sig; }
    const pick = open.find((x) => String(x.builder) === $('b').value) || open[0];
    const msig = pick ? pick.materials.map((m) => m.material).join(',') : '';
    if ($('m').dataset.sig !== msig) { $('m').innerHTML = `<option value="">none</option>${pick ? pick.materials.map((m) => `<option value="${esc(m.material)}">${esc(cap(m.material))}</option>`).join('') : ''}`; $('m').dataset.sig = msig; }
    host.querySelectorAll('#lo-form input, #lo-form select, #lo-form button').forEach((e) => { e.disabled = !pick; });
    const g = n0($('g').value), mm = $('m').value, n = n0($('n').value), have = h.materials?.[mm] || 0;
    const why = [!pick ? 'your state has no build to fund' : '', pick && !g && !(mm && n) ? 'give some gold, or a material and an amount' : '', g > h.gold ? `you have ${fmt(h.gold)} gold` : '', mm && n > have ? `you have ${fmt(have)} ${mm}` : ''].filter(Boolean);
    $('doing').textContent = pick ? `Still needed: ${fmt(pick.gold_needed - pick.gold)} gold${pick.materials.map((m) => `, ${fmt(m.needed - m.given)} ${m.material}`).join('')}.${why.length ? ` Can't yet: ${why.join('; ')}.` : ''}` : 'Your state has no build to fund.';
    $('doing').classList.toggle('short', !!pick && why.length > 0);
    $('go').disabled = why.length > 0;
  }
  on($('list'), 'click', (ev) => { const b = ev.target.closest('[data-start]'); if (b && !b.disabled) act.startWonder(b.dataset.start, { button: b }); });
  on($('halls'), 'click', (ev) => { if (ev.target.closest('#lo-revive')) { const hl = halls(); $('dlgp').textContent = `Your army is restored to what it was ${hl.revive_ticks} ticks ago, for ${fmt(hl.revive_renown)} renown. Once a season.`; $('dlg').showModal(); } });
  on($('dlg'), 'click', (ev) => { if (ev.target === $('dlg') || ev.target.closest('[data-close]')) $('dlg').close(); });
  on($('dyes'), 'click', async () => { $('dlg').close(); await act.revive({ button: $('dyes') }); });
  on(host.querySelector('.atk-sheet'), 'input', sheet);
  on(host.querySelector('.atk-sheet'), 'change', sheet);
  on($('form'), 'submit', (ev) => ev.preventDefault());
  on($('form'), 'click', (ev) => {
    const b = ev.target.closest('[data-omax]'), h = store.house, open = (h.wonder_works || []).filter((x) => !x.done_tick), pick = open.find((x) => String(x.builder) === $('b').value) || open[0];
    if (!b || !pick) return;
    if (b.dataset.omax === 'g') $('g').value = String(Math.min(h.gold, pick.gold_needed - pick.gold));
    else { const m = pick.materials.find((x) => x.material === $('m').value); if (m) $('n').value = String(Math.min(h.materials?.[m.material] || 0, m.needed - m.given)); }
    sheet();
  });
  on($('go'), 'click', async () => {
    const g = n0($('g').value), m = $('m').value, n = n0($('n').value);
    if (!g && !(m && n)) { say('Give some gold, or name a material and an amount.', 'bad'); return; }
    if (await act.fundWonder($('b').value, g, m || null, m ? n : 0, { button: $('go') })) { $('g').value = ''; $('n').value = ''; }
    sheet();
  });

  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('state') || c.has('rules')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
