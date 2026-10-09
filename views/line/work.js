// Straightline's Realm Work: your realm's Specialised Materials Production. Where it stands (proposed, voted, funded,
// done) as steps; the work as a card (what it gives, the states' votes, funding bars; Propose and the votes for your
// state's leader); and a Fund sheet (gold and the realm's material, Max, what's still needed). Data: /me realm_work.
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { isLeader, leaderWhy } from '../../core/truths.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const bar = (have, need) => `<div class="sc-bar"><i style="width:${need ? Math.min(100, (100 * have) / need).toFixed(1) : 100}%"></i></div>`;

export function mountWork(host, on) {
  host.innerHTML = `<div class="lpart lwork">
    <ol class="wk-steps" id="lw-steps" aria-label="Where the work stands"></ol>
    <div class="atk-layout">
      <div class="atk-main"><div id="lw-card"></div></div>
      <aside class="atk-sheet" aria-label="Fund the work">
        <h3 class="sub">Fund it</h3>
        <p class="what">Any house of the realm may give, once the work has passed its vote; a gift is capped at what's still needed.</p>
        <form id="lw-form" class="lform atk-grid" novalidate>
          <label for="lw-g">Gold</label><span class="field"><input id="lw-g" type="number" min="0" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" data-wmax="g" aria-label="As much gold as is needed">MAX</button></span>
          <label for="lw-m" id="lw-ml">Material</label><span class="field"><input id="lw-m" type="number" min="0" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" data-wmax="m" aria-label="As much as is needed">MAX</button></span>
        </form>
        <p class="doing" id="lw-doing" aria-live="polite"></p>
        <div class="atk-go"><button type="button" class="btn primary" id="lw-go">Give</button></div>
      </aside>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#lw-${id}`);
  const work = () => store.house?.realm_work || null;

  function draw() {
    const w = work(), L = isLeader();
    if (!w) { $('steps').innerHTML = ''; $('card').innerHTML = '<p class="dim">Your realm has no work this age.</p>'; sheet(); return; }
    const stage = w.done ? 3 : w.passed ? 2 : w.proposed ? 1 : 0;
    $('steps').innerHTML = ['Proposed', 'Voted', 'Funded', 'Done'].map((t, i) => `<li class="${i < stage ? 'done' : i === stage ? 'now' : ''}"><span>${i + 1}</span>${t}</li>`).join('');
    const focus = host.contains(document.activeElement) && document.activeElement.id;
    $('card').innerHTML = `<article class="ac-card wk-card"><header><h4>${esc(w.name)}</h4><span class="gn-badge">${w.done ? 'Done' : w.passed ? 'Funding' : w.proposed ? 'Voting' : 'Not proposed'}</span></header>
      <p class="co-does">+${pct(w.output_bp)} ${esc(w.material)} for every state of the realm, for the rest of the season.</p>
      ${w.proposed ? `<p class="wk-votes"><b>${fmt(w.votes_yes)}</b> of ${fmt(w.votes_needed)} states' votes${(w.yes || []).length ? ` · yes: ${w.yes.map((s) => `<a href="#state" data-open-state="${s.realm}:${s.state}">${s.realm}:${s.state}</a>`).join(', ')}` : ''}</p>${bar(w.votes_yes, w.votes_needed)}` : ''}
      ${w.passed ? `<p class="wk-fund">Gold <b>${fmt(w.gold)}</b> of ${fmt(w.gold_needed)}</p>${bar(w.gold, w.gold_needed)}<p class="wk-fund">${esc(cap(w.material))} <b>${fmt(w.material_given)}</b> of ${fmt(w.material_needed)}</p>${bar(w.material_given, w.material_needed)}` : ''}
      ${!w.done && !w.passed ? `<div class="gn-acts">${!w.proposed ? `<button type="button" class="btn primary" id="lw-propose"${L ? '' : ' disabled'}>Propose it</button>` : `<button type="button" class="btn" id="lw-yes"${L ? '' : ' disabled'}>Vote yes</button><button type="button" class="btn" id="lw-no"${L ? '' : ' disabled'}>Vote no</button>`}</div>
        <p class="dim small">${L ? (w.proposed ? 'You lead: your vote is your state\'s.' : 'Propose it; your state votes yes.') : `Proposing and voting are for ${esc(leaderWhy())}.`}</p>` : ''}</article>`;
    if (focus) host.querySelector(`#${CSS.escape(focus)}`)?.focus();
    sheet();
  }
  function sheet() {
    const w = work(), h = store.house, funding = !!(w && w.passed && !w.done);
    host.querySelectorAll('#lw-form input, #lw-form button').forEach((e) => { e.disabled = !funding; });
    if (w) $('ml').textContent = cap(w.material);
    const g = n0($('g').value), m = n0($('m').value), have = w ? h.materials?.[w.material] || 0 : 0;
    const why = [!w ? 'your realm has no work' : !funding ? (w.done ? 'it\'s done' : 'it can be funded once it passes its vote') : '', funding && !g && !m ? 'give some gold or material' : '', g > h.gold ? `you have ${fmt(h.gold)} gold` : '', w && m > have ? `you have ${fmt(have)} ${w.material}` : ''].filter(Boolean);
    $('doing').textContent = funding ? `Still needed: ${fmt(w.gold_needed - w.gold)} gold and ${fmt(w.material_needed - w.material_given)} ${w.material}.${why.length ? ` Can't yet: ${why.join('; ')}.` : ''}` : why.length ? `${cap(why[0])}.` : '';
    $('doing').classList.toggle('short', funding && why.length > 0);
    $('go').disabled = why.length > 0;
  }
  on($('card'), 'click', (ev) => {
    const b = ev.target.closest('button');
    if (b?.id === 'lw-propose') act.proposeWork({ button: b });
    if (b?.id === 'lw-yes') act.voteWork(true, { button: b });
    if (b?.id === 'lw-no') act.voteWork(false, { button: b });
  });
  on(host.querySelector('.atk-sheet'), 'input', sheet);
  on($('form'), 'submit', (ev) => ev.preventDefault());
  on($('form'), 'click', (ev) => {
    const b = ev.target.closest('[data-wmax]'), w = work(), h = store.house;
    if (!b || !w) return;
    if (b.dataset.wmax === 'g') $('g').value = String(Math.min(h.gold, w.gold_needed - w.gold));
    else $('m').value = String(Math.min(h.materials?.[w.material] || 0, w.material_needed - w.material_given));
    sheet();
  });
  on($('go'), 'click', async () => {
    const g = n0($('g').value), m = n0($('m').value);
    if (!g && !m) { say('Give some gold or material.', 'bad'); return; }
    if (await act.fundWork(g, m, { button: $('go') })) { $('g').value = ''; $('m').value = ''; }
    sheet();
  });

  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('state')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
