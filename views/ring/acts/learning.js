// Learning: invest books, move scientists, focus and paper, the Colloquium (research, give), recruit an academic,
// answer your quest, transmute. The sums are core/science.js and core/truths.js's; wording follows Straightline's
// Science, Academics, Colloquium and Truths pages.
import { store, loadColloquium } from '../../../core/store.js';
import * as act from '../../../core/actions.js';
import { fmt, esc, askText } from '../../../core/words.js';
import { nextName } from '../../../core/names.js';
import { STATS, pctBp } from '../../../core/does.js';
import { CATS, sci, defs, efficiency, bonusAt, rowOf, catOf, effText, rankName } from '../../../core/science.js';
import { leaderWhy, canPay, transmuteRate } from '../../../core/truths.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const P = () => store.rules.params;
const inTicks = (t) => (t > store.tick ? `in ${fmt(t - store.tick)} ticks` : 'now');
const NOSCI = { ok: false, why: ['no science data from the server'], go: '–' };

/** A number field with MAX: [input id, label, button attr]. */
const field = (id, label, max) => `<span class="ra-in"><input id="${id}" type="number" min="0" inputmode="numeric" placeholder="0" aria-label="${esc(label)}"><button type="button" class="rg-btn ghost mini" ${max} aria-label="Most you can: ${esc(label)}">MAX</button></span>`;
const catSelect = (id, sel = '') => `<select id="${id}">${CATS.map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${cap(k)}</option>`).join('')}</select>`;
const booksLine = (s) => `Books: ${CATS.map((k, i) => `${fmt(s.books[i])} ${k}`).join(', ')}.`;

const invest = {
  id: 'invest', group: 'learning', name: 'Invest books', wiki: 'science.html', keys: 'science research books bonus',
  what: 'Spend books of a science\'s category on it; the bonus takes effect at once.',
  badge: () => (sci() ? `${fmt(sci().books.reduce((a, b) => a + b, 0))} books` : ''),
  mount(body, ctx) {
    body.innerHTML = `<div class="ra-line"><label for="ra-isci">Science</label><select id="ra-isci">${CATS.map((k) => {
      const l = defs().filter((d) => d.category === k);
      return l.length ? `<optgroup label="${cap(k)}">${l.map((d) => `<option value="${esc(d.science)}">${esc(d.name)}</option>`).join('')}</optgroup>` : '';
    }).join('')}</select></div>
      <div class="ra-line"><label for="ra-in">Books</label>${field('ra-in', 'Books to invest', 'data-max')}</div>
      <p class="ra-note" id="ra-inote"></p>`;
    const sel = body.querySelector('#ra-isci'), inp = body.querySelector('#ra-in');
    if (ctx.args.science) sel.value = ctx.args.science;
    if (ctx.args.n) inp.value = String(ctx.args.n);
    const d = () => defs().find((x) => x.science === sel.value);
    const have = () => (sci() && d() ? sci().books[catOf(d())] : 0);
    ctx.on(body.querySelector('[data-max]'), 'click', () => { inp.value = String(have() || ''); if (!have()) ctx.say?.(`You have no ${d()?.category} books.`); ctx.refresh(); });
    const note = () => {
      const s = sci(), x = d();
      if (!s || !x) { body.querySelector('#ra-inote').textContent = ''; return; }
      const r = rowOf(x.science) || { invested: 0, bonus_bp: [] };
      const now = x.effects.map((e, j) => ({ stat: e.stat, bp: r.bonus_bp[j] || 0 }));
      body.querySelector('#ra-inote').textContent = `${x.description} Invested ${fmt(r.invested)}; now ${effText(now)}. ${booksLine(s)}`;
    };
    note();
    ctx.on(sel, 'change', note);
    return {
      check() {
        const s = sci(), x = d(), n = n0(inp.value);
        if (!s || !x) return NOSCI;
        if (!n) return { ok: false, why: ['choose how many books'], go: 'Invest' };
        if (n > have()) return { ok: false, why: [`you have ${fmt(have())} ${x.category} books`], go: 'Invest' };
        const r = rowOf(x.science) || { invested: 0 }, eff = efficiency();
        return { ok: true, why: [], text: `Invest ${fmt(n)} ${x.category} books in ${x.name}: ${effText(bonusAt(x, r.invested + n, eff))}${eff.exact ? '' : ' (≈)'} after.`, go: `Invest ${fmt(n)}` };
      },
      async run(btn) { const o = await act.invest(sel.value, n0(inp.value), { button: btn }); if (o) inp.value = ''; return o; },
      update() { note(); },
    };
  },
};

const assign = {
  id: 'assign-scientists', group: 'learning', name: 'Move scientists', wiki: 'science.html', keys: 'scientists assign category economy military arcane',
  what: 'Move scientists between economy, military and arcane; their experience stays behind.',
  badge: () => (sci() ? `${fmt(sci().scientists.reduce((a, b) => a + b, 0))} scientists` : ''),
  mount(body, ctx) {
    body.innerHTML = `<div class="ra-line"><label for="ra-sf">From</label>${catSelect('ra-sf', ctx.args.from || 'economy')}</div>
      <div class="ra-line"><label for="ra-st">To</label>${catSelect('ra-st', ctx.args.to || 'military')}</div>
      <div class="ra-line"><label for="ra-sn">Scientists</label>${field('ra-sn', 'Scientists to move', 'data-max')}</div>
      <p class="ra-note" id="ra-snote"></p>`;
    const $ = (id) => body.querySelector(`#ra-${id}`);
    const have = () => sci()?.scientists[CATS.indexOf($('sf').value)] || 0;
    ctx.on(body.querySelector('[data-max]'), 'click', () => { $('sn').value = String(have() || ''); ctx.refresh(); });
    const note = () => {
      const s = sci();
      $('snote').textContent = s ? `Scientists: ${CATS.map((k, i) => `${fmt(s.scientists[i])} ${k}${s.ranks?.[i] ? ` (${rankName(s.ranks[i].rank)})` : ''}`).join(', ')}. Moved scientists leave their experience behind: the new category's rank may drop.` : '';
    };
    note();
    return {
      check() {
        if (!sci()) return NOSCI;
        const f = $('sf').value, t = $('st').value, n = n0($('sn').value);
        const why = [f === t ? 'choose two different categories' : '', !n ? 'choose how many' : '', n > have() ? `you have ${fmt(have())} ${f} scientists` : ''].filter(Boolean);
        return { ok: !why.length, why, text: `Move ${fmt(n)} scientists from ${f} to ${t}. Their experience stays behind.`, go: `Move ${fmt(n)}`, confirm: `Confirm: move ${fmt(n)}` };
      },
      async run(btn) { const o = await act.assignScientists($('sf').value, $('st').value, n0($('sn').value), { button: btn }); if (o) $('sn').value = ''; return o; },
      update() { note(); },
    };
  },
};

const setSci = {
  id: 'set-science', group: 'learning', name: 'Focus & paper', wiki: 'science.html', keys: 'focus paper budget scientists science',
  what: 'Where new scientists go, and the paper spent each tick on writing.',
  badge: () => (sci() ? `focus ${sci().focus}` : ''),
  mount(body, ctx) {
    const s0 = sci();
    let focus = ctx.args.focus || s0?.focus || 'economy', paperTouched = false;
    body.innerHTML = `<div class="ra-line"><span id="ra-ffl">Focus</span><span class="ra-seg" role="group" aria-labelledby="ra-ffl">${CATS.map((k) => `<button type="button" class="rg-btn ghost mini" data-focus="${k}">${cap(k)}</button>`).join('')}</span></div>
      <div class="ra-line"><label for="ra-pp">Paper a tick</label><input id="ra-pp" type="number" min="0" inputmode="numeric" value="${s0?.paper_budget ?? 0}"></div>
      <p class="ra-note" id="ra-fnote"></p>`;
    const pp = body.querySelector('#ra-pp');
    const draw = () => {
      const s = sci();
      body.querySelectorAll('[data-focus]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.focus === focus)));
      if (s && !paperTouched && document.activeElement !== pp) pp.value = String(s.paper_budget);
      const p = P();
      body.querySelector('#ra-fnote').textContent = s ? `New scientists join ${s.focus} now. Paper: each adds ${p.books_per_paper} books, up to +${p.paper_cap_bp / 100}%; you hold ${fmt(store.house.materials[p.paper_material] || 0)} ${p.paper_material} and spend ${fmt(s.paper_budget)} a tick now.` : '';
    };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-focus]'); if (b) { focus = b.dataset.focus; draw(); ctx.refresh(); } });
    ctx.on(pp, 'input', () => { paperTouched = true; });
    const changes = () => {
      const s = sci();
      return { focus: focus !== s.focus ? focus : '', paper: pp.value !== '' && n0(pp.value) !== s.paper_budget ? n0(pp.value) : '' };
    };
    return {
      check() {
        if (!sci()) return NOSCI;
        const c = changes();
        if (!c.focus && c.paper === '') return { ok: false, why: ['change the focus or the paper'], go: 'Save' };
        return { ok: true, why: [], text: [c.focus && `New scientists go to ${c.focus}.`, c.paper !== '' && `Spend ${fmt(c.paper)} ${P().paper_material} a tick on writing.`].filter(Boolean).join(' '), go: 'Save' };
      },
      async run(btn) { const o = await act.setScience(changes(), { button: btn }); if (o) paperTouched = false; return o; },
      update() { draw(); },
    };
  },
};

const research = {
  id: 'research', group: 'learning', name: 'Colloquium research', wiki: 'colloquium.html', keys: 'colloquium project research leader state',
  what: 'Leader only: choose the project your state\'s Colloquium researches.',
  badge: () => { const c = store.colloquium; if (!c) return ''; const a = c.projects.find((p) => p.project === c.active); return c.i_lead ? (a ? `on ${a.name}` : 'nothing chosen') : 'leader only'; },
  mount(body, ctx) {
    let pick = ctx.args.project || null;
    body.innerHTML = '<p class="ra-note" id="ra-rnote"></p><div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Project</th><th class="num">Tier</th><th class="num">Knowledge</th><th><span class="vh">Pick</span></th></tr></thead><tbody id="ra-rrows"></tbody></table></div><p class="ra-note" id="ra-rdoes"></p>';
    if (!store.colloquium) loadColloquium();
    const draw = () => {
      const c = store.colloquium, rows = body.querySelector('#ra-rrows');
      if (!c) { rows.innerHTML = '<tr><td colspan="4" class="dim">Loading the Colloquium…</td></tr>'; return; }
      const a = c.projects.find((p) => p.project === c.active);
      body.querySelector('#ra-rnote').textContent = `Researching: ${a ? `${a.name}, tier ${a.tier} of ${a.tiers.length}` : 'nothing yet'}. Chosen by ${c.i_lead ? 'you (you lead your state)' : `your leader (${store.state?.leader?.name || 'none yet'})`}. Knowledge fades each tick, faster the longer nobody gives.`;
      const focus = body.contains(document.activeElement) && document.activeElement.dataset.pick;
      rows.innerHTML = c.projects.map((p) => {
        const on = p.project === c.active;
        return `<tr><th scope="row">${esc(p.name)}${on ? ' <span class="dim">(now)</span>' : ''}</th>
          <td class="num">${p.open ? `${p.tier}/${p.tiers.length}` : '–'}</td><td class="num">${p.open ? fmt(p.knowledge) : `<span class="short">needs a ${esc(p.requires_material)} realm</span>`}</td>
          <td>${p.open && !on ? `<button type="button" class="rg-btn ghost mini" data-pick="${esc(p.project)}" aria-pressed="${p.project === pick}" aria-label="Pick ${esc(p.name)}">Pick</button>` : ''}</td></tr>`;
      }).join('');
      if (focus) body.querySelector(`[data-pick="${CSS.escape(focus)}"]`)?.focus();
      const pp = c.projects.find((p) => p.project === pick);
      body.querySelector('#ra-rdoes').textContent = pp ? `${pp.name}: ${pp.description}` : '';
    };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-pick]'); if (b) { pick = b.dataset.pick; draw(); ctx.refresh(); } });
    return {
      check() {
        const c = store.colloquium;
        if (!c) return { ok: false, why: ['loading the Colloquium'], go: 'Research' };
        const why = [c.i_lead ? '' : (leaderWhy() || 'only the state\'s leader'), !pick ? 'pick a project' : ''].filter(Boolean);
        const pp = c.projects.find((p) => p.project === pick);
        return { ok: !why.length, why, text: pp ? `Your state's Colloquium researches ${pp.name}.` : '', go: 'Research this' };
      },
      run: (btn) => act.setResearch(pick, { button: btn }),
      update(c) { if (!c || c.has('colloquium') || c.has('state')) draw(); },
    };
  },
};

const contribute = {
  id: 'contribute', group: 'learning', name: 'Give to the Colloquium', wiki: 'colloquium.html', keys: 'colloquium contribute books renown donate',
  what: 'Give books to your state\'s Colloquium project; any category counts, and you earn renown.',
  badge: () => { const c = store.colloquium; return c ? (c.projects.find((p) => p.project === c.active)?.name || 'no project') : ''; },
  mount(body, ctx) {
    body.innerHTML = `<div class="ra-line"><label for="ra-cc">From</label>${catSelect('ra-cc', ctx.args.category || 'economy')}</div>
      <div class="ra-line"><label for="ra-cn">Books</label>${field('ra-cn', 'Books to give', 'data-max')}</div>
      <p class="ra-note" id="ra-cnote"></p>`;
    const $ = (id) => body.querySelector(`#ra-${id}`);
    if (!store.colloquium) loadColloquium();
    const have = () => sci()?.books[CATS.indexOf($('cc').value)] || 0;
    ctx.on(body.querySelector('[data-max]'), 'click', () => { $('cn').value = String(have() || ''); ctx.refresh(); });
    const active = () => { const c = store.colloquium; return c?.projects.find((p) => p.project === c.active) || null; };
    const note = () => {
      const s = sci(), a = active();
      $('cnote').textContent = `${a ? `Researching ${a.name}, tier ${a.tier} of ${a.tiers.length}.` : store.colloquium ? 'No project is being researched yet.' : 'Loading the Colloquium…'} You earn ${fmt(P().renown_per_thousand_books)} renown for every 1,000 books given.${s ? ` ${booksLine(s)}` : ''}`;
    };
    note();
    return {
      check() {
        if (!sci()) return NOSCI;
        const k = $('cc').value, n = n0($('cn').value), a = active();
        const why = [!a ? 'no project is being researched yet' : '', !n ? 'say how many books' : '', n > have() ? `you have ${fmt(have())} ${k} books` : ''].filter(Boolean);
        return { ok: !why.length, why, text: a ? `Give ${fmt(n)} ${k} books to ${a.name}, for about +${fmt(Math.floor(n / 1000) * P().renown_per_thousand_books)} renown.` : '', go: `Give ${fmt(n)}` };
      },
      async run(btn) { const o = await act.contribute($('cc').value, n0($('cn').value), { button: btn }); if (o) $('cn').value = ''; return o; },
      update() { note(); },
    };
  },
};

const attrs = () => store.rules.attributes || [];
const attrDoes = (a) => (a.effects || []).map(([stat, bp]) => `${pctBp(bp)} ${(STATS[stat] || [String(stat).replace(/_/g, ' ')])[0]}`).join(', ');

const recruit = {
  id: 'recruit-academic', group: 'learning', name: 'Recruit an academic', wiki: 'academics.html', keys: 'academic scholar recruit attributes university',
  what: 'Recruit a named academic with books of one category (choose attributes once you may).',
  badge: () => (sci() ? `${fmt(sci().academics.length)} of ${fmt(sci().academic_cap)}` : ''),
  mount(body, ctx) {
    body.innerHTML = `<div class="ra-line"><label for="ra-an">Name</label><span class="ra-in"><input id="ra-an" maxlength="40" autocomplete="off"><button type="button" class="rg-btn ghost mini" id="ra-aroll" aria-label="Suggest another name" title="Suggest another name">&#8635;</button></span></div>
      <div class="ra-line"><label for="ra-ac">Books from</label>${catSelect('ra-ac', ctx.args.category || 'economy')}</div>
      <fieldset><legend class="ra-note" id="ra-al">Attributes</legend><ul class="ra-list" id="ra-aattr">${attrs().map((a) => `<li><label><input type="checkbox" value="${esc(a.attribute)}"> <b>${esc(a.name)}</b> <span class="dim">${esc(attrDoes(a))}</span></label></li>`).join('')}</ul></fieldset>
      <p class="ra-note" id="ra-anote"></p>`;
    const $ = (id) => body.querySelector(`#ra-${id}`);
    let suggested = '';
    const roll = async (force) => {
      if (!force && $('an').value && $('an').value !== suggested) return;   // the player's own name stays
      const n = await nextName('academic');
      if (n && (force || !$('an').value || $('an').value === suggested)) { $('an').value = n; suggested = n; ctx.refresh(); }
    };
    roll(false);
    ctx.on($('aroll'), 'click', () => { roll(true); $('an').focus(); });
    const boxes = () => [...body.querySelectorAll('#ra-aattr input')];
    const draw = () => {
      const s = sci(), p = P();
      if (!s) return;
      const canPick = s.books_invested >= p.academic_pick_books, picked = boxes().filter((b) => b.checked).length;
      boxes().forEach((b) => { if (!canPick) b.checked = false; b.disabled = !canPick || (!b.checked && picked >= s.attribute_slots); });
      $('al').textContent = canPick ? `Attributes: choose up to ${s.attribute_slots}` : `Attributes: drawn at random (choose from ${fmt(p.academic_pick_books)} books invested)`;
      const k = $('ac').value, slots = canPick ? picked : s.attribute_slots;
      $('anote').textContent = `${fmt(s.academics.length)} of ${fmt(s.academic_cap)} academics (one per ${fmt(p.academic_universities)} ${p.academic_building}). Costs ${fmt(p.academic_books)} ${k} books + ${fmt(p.academic_material_cost)} ${p.academic_material} an attribute (${fmt(slots * p.academic_material_cost)} for ${slots}).`;
    };
    draw();
    ctx.on(body, 'change', draw);
    return {
      check() {
        const s = sci(), p = P();
        if (!s) return NOSCI;
        const canPick = s.books_invested >= p.academic_pick_books, chosen = boxes().filter((b) => b.checked);
        const k = $('ac').value, i = CATS.indexOf(k), slots = canPick ? chosen.length : s.attribute_slots, mat = store.house.materials[p.academic_material] || 0;
        const why = [s.academics.length >= s.academic_cap ? `no room: one academic per ${fmt(p.academic_universities)} ${p.academic_building}` : '',
          s.books[i] < p.academic_books ? `needs ${fmt(p.academic_books)} ${k} books; you have ${fmt(s.books[i])}` : '',
          mat < slots * p.academic_material_cost ? `needs ${fmt(slots * p.academic_material_cost)} ${p.academic_material}; you have ${fmt(mat)}` : '',
          !$('an').value.trim() ? 'give it a name' : ''].filter(Boolean);
        const names = chosen.map((b) => attrs().find((a) => a.attribute === b.value)?.name || b.value);
        return { ok: !why.length, why, text: `Recruit ${$('an').value.trim()} for ${fmt(p.academic_books)} ${k} books and ${fmt(slots * p.academic_material_cost)} ${p.academic_material}${names.length ? `, with ${names.join(', ')}` : canPick ? ', with no attributes' : ', attributes drawn at random'}.`, go: 'Recruit' };
      },
      async run(btn) {
        const chosen = boxes().filter((b) => b.checked).map((b) => b.value);
        const o = await act.recruitAcademic($('an').value.trim(), $('ac').value, chosen, { button: btn });
        if (o) { $('an').value = ''; suggested = ''; boxes().forEach((b) => { b.checked = false; }); roll(false); }
        return o;
      },
      update() { draw(); },
    };
  },
};

const quest = {
  id: 'answer-quest', group: 'learning', name: 'Your quest', wiki: 'truths.html', keys: 'quest truth ask commit decline seeker',
  what: 'Answer your quest\'s ask: commit and pay it, or decline and end the quest.',
  badge: () => { const q = store.house?.quest; return !q ? 'no quest' : q.ask ? 'an ask awaits' : `episode ${q.episode} of ${q.of}`; },
  mount(body, ctx) {
    let choice = ctx.args.commit === false ? 'decline' : 'commit';
    body.innerHTML = `<div id="ra-qinfo"></div>
      <div class="ra-line"><span id="ra-qal">Answer</span><span class="ra-seg" role="group" aria-labelledby="ra-qal"><button type="button" class="rg-btn ghost mini" data-q="commit">Commit and pay</button><button type="button" class="rg-btn ghost mini" data-q="decline">Decline</button></span></div>`;
    const draw = () => {
      const q = store.house.quest;
      body.querySelectorAll('[data-q]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.q === choice)); b.disabled = !q; });
      if (!q) { body.querySelector('#ra-qinfo').innerHTML = '<p class="ra-note">No quest. A character, or your scientists, may be invited to seek a Truth; the invitation comes to your news.</p>'; return; }
      const [ok, short] = canPay(q.ask);
      body.querySelector('#ra-qinfo').innerHTML = `<p><b>${esc(cap(q.seeker || 'Your seeker'))}</b> · episode ${q.episode} of ${q.of}</p>
        ${q.ask ? `<p><b>Asks:</b> ${esc(askText(q.ask))}</p><p class="${ok ? 'dim' : 'short'}">${ok ? 'You can pay this.' : `Short: ${esc(short)}.`} Answer by tick ${fmt(q.answer_by_tick)} (${inTicks(q.answer_by_tick)}), or it lapses.</p>`
          : `<p class="ra-note">The next ask comes at tick ${fmt(q.next_ask_tick)} (${inTicks(q.next_ask_tick)}).</p>`}
        <p class="ra-note">The quest ends by tick ${fmt(q.deadline_tick)}. Each paid episode, the trail may go cold or the seeker may die; after the last, the quest may find nothing.</p>`;
    };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-q]'); if (b) { choice = b.dataset.q; draw(); ctx.refresh(); } });
    return {
      check() {
        const q = store.house.quest;
        if (!q) return { ok: false, why: ['you have no quest'], go: 'Answer' };
        if (choice === 'decline') return { ok: true, why: [], text: 'Decline: the quest ends, your seeker turns back, and the Truth it sought stays hidden from you.', go: 'Decline', confirm: 'Confirm: decline' };
        const [ok, short] = canPay(q.ask);
        const why = [!q.ask ? `no ask yet: the next comes ${inTicks(q.next_ask_tick)}` : '', q.ask && !ok ? `short: ${short}` : ''].filter(Boolean);
        return { ok: !why.length, why, text: q.ask ? `Pay ${askText(q.ask)} and go on to the next episode.` : '', go: 'Commit and pay' };
      },
      run: (btn) => act.answerQuest(choice === 'commit', { button: btn }),
      update() { draw(); },
    };
  },
};

const transmute = {
  id: 'transmute', group: 'learning', name: 'Transmute', wiki: 'truths.html', keys: 'transmute transmutation materials aether convert',
  what: 'Turn one material into another with aether (the Transmutation Rite, or a subscriber\'s lesser rite).',
  badge: () => { if (!store.house) return ''; const x = transmuteRate(); return x.rate ? `${x.rate} to 1` : x.age ? 'needs the Rite' : 'not this age'; },
  mount(body, ctx) {
    const mats = Object.keys(store.house.materials || {});
    const from0 = ctx.args.from || mats[0], to0 = ctx.args.to || mats.find((m) => m !== from0);
    const opts = (sel) => mats.map((m) => `<option value="${esc(m)}"${m === sel ? ' selected' : ''}>${esc(cap(m))}</option>`).join('');
    body.innerHTML = `<div class="ra-line"><label for="ra-xf">From</label><select id="ra-xf">${opts(from0)}</select></div>
      <div class="ra-line"><label for="ra-xt">Into</label><select id="ra-xt">${opts(to0)}</select></div>
      <div class="ra-line"><label for="ra-xn">Make</label>${field('ra-xn', 'Units to make', 'data-max')}</div>
      <p class="ra-note" id="ra-xnote"></p>`;
    const $ = (id) => body.querySelector(`#ra-${id}`);
    const most = () => {
      const h = store.house, x = transmuteRate();
      if (!x.rate) return 0;
      return Math.max(0, Math.min(Math.floor((h.materials[$('xf').value] || 0) / x.rate), x.aether ? Math.floor(h.aether / x.aether) : Infinity, x.max));
    };
    ctx.on(body.querySelector('[data-max]'), 'click', () => { const m = most(); $('xn').value = m ? String(m) : ''; if (!m) ctx.say?.('Max is 0: not enough to transmute.'); ctx.refresh(); });
    const note = () => {
      const x = transmuteRate(), h = store.house;
      $('xnote').textContent = (x.rate ? `${x.rate} of one material makes 1 of another, plus ${fmt(x.aether)} aether each; at most ${fmt(x.max)} a cast.${x.lesser ? ' (The lesser rite: a subscriber\'s.)' : ''}` : x.age ? 'Needs the Transmutation Rite, a Truth, or a subscription.' : 'Not this age.')
        + ` You hold ${fmt(h.materials[$('xf').value] || 0)} ${$('xf').value} and ${fmt(h.aether)} aether.`;
    };
    note();
    ctx.on($('xf'), 'change', note);
    return {
      check() {
        const h = store.house, x = transmuteRate(), n = n0($('xn').value), from = $('xf').value, to = $('xt').value, need = n * x.rate, aether = n * x.aether;
        const why = [!x.rate ? 'you can\'t transmute yet' : '', !n ? 'say how many to make' : '', from === to ? 'choose two different materials' : '',
          need > (h.materials?.[from] || 0) ? `it takes ${fmt(need)} ${from}; you have ${fmt(h.materials?.[from] || 0)}` : '',
          aether > h.aether ? `it takes ${fmt(aether)} aether; you have ${fmt(h.aether)}` : '', n > x.max ? `at most ${fmt(x.max)} a cast` : ''].filter(Boolean);
        return { ok: !why.length, why, text: `Turn ${fmt(need)} ${from} and ${fmt(aether)} aether into ${fmt(n)} ${to}.`, go: `Transmute ${fmt(n)}` };
      },
      async run(btn) { const o = await act.transmute($('xf').value, $('xt').value, n0($('xn').value), { button: btn }); if (o) $('xn').value = ''; return o; },
      update() { note(); },
    };
  },
};

export default [invest, assign, setSci, research, contribute, recruit, quest, transmute];
