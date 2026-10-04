// SCI detail, second half: academics (recruit, records) and the state's Colloquium (projects,
// tiers, knowledge and decay; contribute; the leader picks the project).
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { fillMax } from './orders.js';
import * as S from './science.js';
import { STATS, pctBp } from './does.js';
import { heirButton, wireHeirButtons, slotLine } from './heirs.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
// What each attribute does, from its effects in /rules ([stat, bp]).
const ATTR = new Proxy({}, {
  get: (_, id) => {
    const a = (store.rules?.attributes || []).find((x) => x.attribute === id);
    return a?.effects?.length ? a.effects.map(([stat, bp]) => `${pctBp(bp)} ${(STATS[stat] || [stat])[0]}`).join(', ') : '';
  },
});
const attrName = (id) => store.rules.attributes?.find((a) => a.attribute === id)?.name || id;
const catOpts = () => S.CATS.map((k) => `<option value="${k}">${k}</option>`).join('');

/** The ACADEMICS tab's sections. */
export function academicsBuild() {
  const attrs = store.rules.attributes || [];
  return `<section class="wide"><h3 class="sub">ACADEMICS <span class="dim" id="d-ac-line"></span></h3><div id="d-ac-waver"></div><div id="d-ac-list"></div>
      <form id="d-ac-form" class="dform">
        <label for="d-ac-name">Recruit</label><input id="d-ac-name" class="w-name" maxlength="40" placeholder="name" autocomplete="off">
        <label for="d-ac-cat">Books from</label><select id="d-ac-cat">${catOpts()}</select>
        <span class="lbl">Attributes</span><fieldset class="ac-attrs" id="d-ac-attrs"><legend class="vh">Attributes</legend>${attrs.map((a) => `<label class="check"><input type="checkbox" value="${esc(a.attribute)}"> ${esc(a.name)} <span class="dim small">${esc(ATTR[a.attribute] || '')}</span></label>`).join('')}</fieldset>
        <span></span><button class="btn primary">RECRUIT</button>
        <p class="span small" id="d-ac-q"></p>
      </form>
    </section>`;
}
/** The COLLOQUIUM tab's section. */
export function colloqBuild() {
  return `<section class="wide"><h3 class="sub">COLLOQUIUM <span class="dim" id="d-co-line"></span></h3><div id="d-co-list"></div>
      <form id="d-co-form" class="dform">
        <label for="d-co-n">Give</label><span class="field"><input id="d-co-n" type="number" min="1" value="1000" inputmode="numeric" class="w5"><button type="button" class="btn mini" data-max aria-label="All books of that category">MAX</button> <select id="d-co-cat" aria-label="Category">${catOpts()}</select></span>
        <span></span><button class="btn primary">CONTRIBUTE</button>
        <p class="span small dim" id="d-co-q"></p>
      </form>
    </section>`;
}

export function colloqWire(b, on) {
  const $ = (id) => b.querySelector(`#d-${id}`);
  const chosen = () => [...b.querySelectorAll('#d-ac-attrs input:checked')].map((x) => x.value);
  on($('ac-form'), 'input', () => colloqUpdate(b));
  on($('ac-form'), 'submit', (ev) => {
    ev.preventDefault();
    act.recruitAcademic($('ac-name').value.trim(), $('ac-cat').value, chosen(), { button: ev.submitter }).then((o) => { if (o) $('ac-name').value = ''; });
  });
  on($('co-form'), 'input', () => colloqUpdate(b));
  on($('co-form'), 'click', (ev) => { if (ev.target.closest('[data-max]')) fillMax($('co-n'), S.sci().books[S.CATS.indexOf($('co-cat').value)], `no ${$('co-cat').value} books`); });
  on($('co-form'), 'submit', (ev) => { ev.preventDefault(); act.contribute($('co-cat').value, num($('co-n').value), { button: ev.submitter }); });
  wireHeirButtons($('ac-list'), on);
  on(b, 'click', (ev) => { const x = ev.target.closest('[data-research]'); if (x) act.setResearch(x.dataset.research, { button: x }); });
}

export function colloqUpdate(b) {
  const $ = (id) => b.querySelector(`#d-${id}`);
  const s = S.sci(), P = store.rules.params, h = store.house;
  if (!s || !$('ac-line')) return;
  const unis = h.buildings[P.academic_building] || 0;
  const canPick = s.books_invested >= P.academic_pick_books;
  $('ac-line').textContent = `${fmt(s.academics.length)} of ${fmt(s.academic_cap)} kept (one per ${fmt(P.academic_universities)} ${P.academic_building}; you own ${fmt(unis)}) · ${s.attribute_slots} attribute slot${s.attribute_slots === 1 ? '' : 's'}`;
  const was = $('ac-list').contains(document.activeElement) ? document.activeElement.id : null;
  $('ac-list').innerHTML = s.academics.length
    ? `<div class="scrollx"><table class="tbl wide-tbl"><tr><th>NAME</th><th>ATTRIBUTES</th><th class="num">TICKS</th><th class="num"><abbr title="Books your scientists wrote while it served">SUPERVISED</abbr></th><th class="num">INVESTED</th><th class="num">TO COLLOQUIUM</th><th></th></tr>${s.academics.map((a) => {
      const r = a.record || {};
      return `<tr><td class="name">${esc(a.name)}</td><td>${esc(a.attributes.map((t) => `${attrName(t)}${ATTR[t] ? ` (${ATTR[t]})` : ''}`).join(', ') || 'none')}</td><td class="num">${fmt(r.ticks_served || 0)}</td><td class="num">${fmt(r.books_supervised || 0)}</td><td class="num">${fmt(r.books_invested || 0)}</td><td class="num">${fmt(r.colloquium_books || 0)}</td><td>${heirButton('academic', a.id, a.name, 'd-ac')}</td></tr>`;
    }).join('')}</table></div><p class="dim small">Heirs: ${esc(slotLine())}. The order of generals and academics together is set in MIL › GENERALS (Shift+Alt+3).</p>`
    : `<p class="dim small">No academics. ${s.academic_cap ? 'Recruit one below.' : `You need ${fmt(P.academic_universities)} ${P.academic_building} for the first.`}</p>`;
  if (was) b.querySelector(`#${CSS.escape(was)}`)?.focus();
  const boxes = [...b.querySelectorAll('#d-ac-attrs input')];
  const picked = boxes.filter((x) => x.checked).length;
  boxes.forEach((x) => { x.disabled = !canPick || (!x.checked && picked >= s.attribute_slots); });
  const cat = S.CATS.indexOf($('ac-cat').value);
  const slots = canPick ? picked : s.attribute_slots;
  const why = s.academics.length >= s.academic_cap ? `no room: one academic per ${fmt(P.academic_universities)} ${P.academic_building}`
    : s.books[cat] < P.academic_books ? `needs ${fmt(P.academic_books)} ${$('ac-cat').value} books; you have ${fmt(s.books[cat])}` : '';
  $('ac-q').className = `span small${why ? ' short' : ' dim'}`;
  $('ac-q').textContent = `Costs ${fmt(P.academic_books)} ${$('ac-cat').value} books + ${fmt(P.academic_material_cost)} ${P.academic_material} per attribute (${fmt(slots * P.academic_material_cost)} for ${slots}). `
    + `${canPick ? `Choose up to ${s.attribute_slots}.` : `Attributes are drawn at random until ${fmt(P.academic_pick_books)} books are invested (you have ${fmt(s.books_invested)}).`}`
    + `${why ? ` Can't: ${why}.` : ''}`;

  const c = store.colloquium;
  if (!c) { $('co-list').innerHTML = '<p class="dim">Loading the Colloquium…</p>'; return; }
  const act0 = c.projects.find((p) => p.project === c.active);
  $('co-line').textContent = `${act0 ? `researching ${act0.name}` : 'no project chosen'}${c.i_lead ? ' · you lead: choose the project' : ' · the state leader chooses the project'}`;
  $('co-list').innerHTML = `<div class="scrollx"><table class="tbl wide-tbl"><tr><th>PROJECT</th><th>DOES</th><th class="num">TIER</th><th class="num">KNOWLEDGE</th><th class="num">NEXT TIER</th><th class="num"><abbr title="Knowledge lost next tick">DECAY</abbr></th><th class="num"><abbr title="Ticks without a contribution">IDLE</abbr></th><th class="num">GIVERS</th><th></th></tr>${c.projects.map((p) => {
    const next = p.tiers[p.tier];
    return `<tr class="${p.project === c.active ? 'self' : ''}${p.open ? '' : ' zero'}"><td class="name">${esc(p.name)}${p.project === c.active ? ' <span class="dim">· active</span>' : ''}</td><td class="dim small wrap">${esc(p.description)}${p.open ? '' : ` <span class="short">needs a ${esc(p.requires_material)} realm</span>`}</td>`
      + `<td class="num">${p.tier}/${p.tiers.length}</td><td class="num">${fmt(p.knowledge)}</td><td class="num dim">${next ? fmt(next) : 'all'}</td><td class="num${p.decay_bp_next_tick ? ' down' : ' zero'}">${(p.decay_bp_next_tick / 100).toFixed(2)}%</td><td class="num">${fmt(p.idle_ticks)}</td><td class="num">${fmt(p.contributors.length)}</td>`
      + `<td>${c.i_lead && p.open && p.project !== c.active ? `<button type="button" class="btn mini" data-research="${esc(p.project)}" aria-label="Research ${esc(p.name)}">SET</button>` : ''}</td></tr>`;
  }).join('')}</table></div>`;
  const n = num($('co-n').value), ci = S.CATS.indexOf($('co-cat').value);
  const cwhy = !act0 ? 'no project chosen yet' : n > s.books[ci] ? `you have ${fmt(s.books[ci])} ${$('co-cat').value} books` : '';
  $('co-q').className = `span small${cwhy ? ' short' : ' dim'}`;
  $('co-q').textContent = `${cwhy ? `Can't: ${cwhy}. ` : ''}Any category counts. +${fmt(P.renown_per_thousand_books)} renown per 1,000 books given${n >= 1000 ? ` (≈ +${fmt(Math.floor(n / 1000) * P.renown_per_thousand_books)} for these)` : ''}. Knowledge fades each tick, faster the longer nobody gives.`;
}
