// Straightline's Realm Work: your realm's Specialised Materials Production, as four numbered steps, each a fold-out
// (proposed, voted, funded, done). The step the work is at opens by default; the others show one line until opened, and
// what the player opens or closes stays so through updates. Step 3 holds the Fund sheet (gold and the realm's
// material, Max, what's still needed). Data: /me realm_work.
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { isLeader, leaderWhy } from '../../core/truths.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const bar = (have, need) => `<div class="sc-bar"><i style="width:${need ? Math.min(100, (100 * have) / need).toFixed(1) : 100}%"></i></div>`;
const STEPS = ['Proposed', 'Voted', 'Funded', 'Done'];

export function mountWork(host, on) {
  host.innerHTML = `<div class="lpart lwork">
    <p class="co-does wk-what" id="lw-what"></p>
    <ol class="wk-steps" id="lw-steps" aria-label="Where the work stands">
      ${STEPS.map((t, i) => `<li><details class="wk-step" data-step="${i}">
        <summary><span class="wk-n" aria-hidden="true">${i + 1}</span><span class="wk-t">${t}</span><span class="wk-s" data-s="${i}"></span></summary>
        <div class="wk-body" data-b="${i}"></div>
        ${i === 2 ? `<div class="wk-fundsheet">
          <form id="lw-form" class="lform atk-grid" novalidate>
            <label for="lw-g">Gold</label><span class="field"><input id="lw-g" type="number" min="0" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" data-wmax="g" aria-label="As much gold as is needed">MAX</button></span>
            <label for="lw-m" id="lw-ml">Material</label><span class="field"><input id="lw-m" type="number" min="0" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" data-wmax="m" aria-label="As much as is needed">MAX</button></span>
          </form>
          <p class="doing" id="lw-doing" aria-live="polite"></p>
          <div class="atk-go"><button type="button" class="btn primary" id="lw-go">Give</button></div>
        </div>` : ''}
      </details></li>`).join('')}
    </ol>
  </div>`;
  const $ = (id) => host.querySelector(`#lw-${id}`);
  const work = () => store.house?.realm_work || null;
  const steps = [...host.querySelectorAll('.wk-step')];
  // The player's own choices: a step they opened or closed stays that way; the rest follow the work.
  const chosen = new Map();
  let lastStage = -1;
  steps.forEach((d, i) => d.addEventListener('toggle', () => { if (d.dataset.auto !== '1') chosen.set(i, d.open); d.dataset.auto = ''; }));
  const setOpen = (d, open) => { if (d.open !== open) { d.dataset.auto = '1'; d.open = open; } };

  function draw() {
    const w = work(), L = isLeader();
    if (!w) {
      $('what').textContent = 'Your realm has no work this age.';
      steps.forEach((d) => { d.closest('li').hidden = true; });
      sheet();
      return;
    }
    steps.forEach((d) => { d.closest('li').hidden = false; });
    const stage = w.done ? 3 : w.passed ? 2 : w.proposed ? 1 : 0;
    // A new stage: let it open, and forget earlier choices so the page follows the work again.
    if (stage !== lastStage) { chosen.clear(); lastStage = stage; }
    $('what').innerHTML = `<b>${esc(w.name)}</b>: +${pct(w.output_bp)} ${esc(w.material)} for every state of the realm, for the rest of the season.`;
    const of = (have, all) => `${fmt(have)} of ${fmt(all)}`;
    const share = (have, all) => Math.min(100, Math.floor((100 * have) / Math.max(1, all)));
    const status = [
      w.proposed ? 'done' : 'not yet',
      w.passed ? `passed, ${of(w.votes_yes, w.votes_needed)} states` : w.proposed ? `${of(w.votes_yes, w.votes_needed)} states' votes` : 'after it is proposed',
      w.done ? 'done' : w.passed ? `gold ${share(w.gold, w.gold_needed)}%, ${esc(w.material)} ${share(w.material_given, w.material_needed)}%` : 'after the vote',
      w.done ? `+${pct(w.output_bp)} ${esc(w.material)}` : 'once funded',
    ];
    const propose = !w.proposed
      ? `<div class="gn-acts"><button type="button" class="btn primary" id="lw-propose"${L ? '' : ' disabled'}>Propose it</button></div><p class="dim small">${L ? 'Propose it; your state votes yes.' : `Proposing is for ${esc(leaderWhy())}.`}</p>`
      : '';
    const body = [
      `<p>${w.proposed ? 'The work has been proposed to the realm\'s state leaders.' : 'Any state leader of the realm may propose the work. Then the realm\'s leaders vote on it.'}</p>${propose}`,
      w.proposed
        ? `<p class="wk-votes"><b>${fmt(w.votes_yes)}</b> of ${fmt(w.votes_needed)} states' votes${(w.yes || []).length ? ` · yes: ${w.yes.map((s) => `<a href="#state" data-open-state="${s.realm}:${s.state}">${s.realm}:${s.state}</a>`).join(', ')}` : ''}</p>${bar(w.votes_yes, w.votes_needed)}${!w.passed ? `<div class="gn-acts"><button type="button" class="btn" id="lw-yes"${L ? '' : ' disabled'}>Vote yes</button><button type="button" class="btn" id="lw-no"${L ? '' : ' disabled'}>Vote no</button></div><p class="dim small">${L ? 'You lead: your vote is your state\'s.' : `Voting is for ${esc(leaderWhy())}.`}</p>` : ''}`
        : '<p class="dim">Once it is proposed, the realm\'s state leaders vote. It passes with enough states.</p>',
      w.passed
        ? `<p class="wk-fund">Gold <b>${fmt(w.gold)}</b> of ${fmt(w.gold_needed)}</p>${bar(w.gold, w.gold_needed)}<p class="wk-fund">${esc(cap(w.material))} <b>${fmt(w.material_given)}</b> of ${fmt(w.material_needed)}</p>${bar(w.material_given, w.material_needed)}${w.done ? '' : '<p class="what">Any house of the realm may give; a gift is capped at what\'s still needed.</p>'}`
        : '<p class="dim">Once it passes its vote, any house of the realm may give gold and the realm\'s material.</p>',
      w.done ? `<p>Done: every state of the realm makes ${pct(w.output_bp)} more ${esc(w.material)} for the rest of the season.</p>` : `<p class="dim">When it's fully funded, every state of the realm makes ${pct(w.output_bp)} more ${esc(w.material)}.</p>`,
    ];
    const focus = host.contains(document.activeElement) && document.activeElement.id;
    steps.forEach((d, i) => {
      d.classList.toggle('done', i < stage || (i === 3 && w.done));
      d.classList.toggle('now', i === stage && !(i === 3 && w.done));
      host.querySelector(`[data-s="${i}"]`).innerHTML = status[i];
      const b = host.querySelector(`[data-b="${i}"]`);
      if (b.dataset.html !== body[i]) { b.innerHTML = body[i]; b.dataset.html = body[i]; }
      setOpen(d, chosen.has(i) ? chosen.get(i) : i === stage);
    });
    host.querySelector('.wk-fundsheet').hidden = !(w.passed && !w.done);
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
  on($('steps'), 'click', (ev) => {
    const b = ev.target.closest('button');
    if (b?.id === 'lw-propose') act.proposeWork({ button: b });
    if (b?.id === 'lw-yes') act.voteWork(true, { button: b });
    if (b?.id === 'lw-no') act.voteWork(false, { button: b });
  });
  on(host.querySelector('.wk-fundsheet'), 'input', sheet);
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
