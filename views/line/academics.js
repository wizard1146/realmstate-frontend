// Straightline's Academics: who you keep, at a glance; each academic as a card (attributes and what they do, its
// record, a warning and Reassure while another house courts it); and a Recruit panel (a name, the books it costs,
// attributes chosen as chips once you may choose them). Logic: core/science.js, actions.
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { nameRoll } from '../../core/names.js';
import { STATS, pctBp } from '../../core/does.js';
import { CATS, sci } from '../../core/science.js';
import { heirAt, toggleHeir } from '../../core/heirs.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const attrs = () => store.rules.attributes || [];
const attrName = (id) => attrs().find((a) => a.attribute === id)?.name || id;
/** What an attribute does: "+5% book output, +2% science". */
const attrDoes = (id) => (attrs().find((a) => a.attribute === id)?.effects || []).map(([stat, bp]) => `${pctBp(bp)} ${(STATS[stat] || [String(stat).replace(/_/g, ' ')])[0]}`).join(', ');

export function mountAcademics(host, on) {
  const P = store.rules.params;
  host.innerHTML = `<div class="lpart lacad">
    <dl class="st-glance ac-glance" id="la2-glance"></dl>
    <div class="atk-layout">
      <div class="atk-main"><h3 class="sub">Your academics</h3><div class="ac-cards" id="la2-list"></div>
        <p class="note">Mark academics as heirs to carry them into the next age; order them with your generals on the <a href="#heirs">Heirs</a> page.</p></div>
      <aside class="atk-sheet" aria-label="Recruit an academic">
        <h3 class="sub">Recruit</h3>
        <form id="la2-form" class="lform atk-grid" novalidate>
          <label for="la2-name">Name</label><span class="field"><input id="la2-name" maxlength="40" autocomplete="off"><button type="button" class="btn mini" id="la2-roll" aria-label="Suggest another name" title="Suggest another name">&#8635;</button></span>
          <label for="la2-cat">Books from</label><select id="la2-cat">${CATS.map((k) => `<option value="${k}">${cap(k)}</option>`).join('')}</select>
        </form>
        <fieldset class="ac-chips" id="la2-attrs"><legend id="la2-al">Attributes</legend>${attrs().map((a) => `<label class="ac-chip"><input type="checkbox" value="${esc(a.attribute)}"><span><b>${esc(a.name)}</b><span class="dim">${esc(attrDoes(a.attribute))}</span></span></label>`).join('')}</fieldset>
        <p class="doing" id="la2-doing" aria-live="polite"></p>
        <div class="atk-go"><button type="button" class="btn primary" id="la2-go">Recruit</button></div>
      </aside>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#la2-${id}`);
  const named = nameRoll($('name'), $('roll'), 'academic');

  function glance(s) {
    const unis = store.house.buildings[P.academic_building] || 0, canPick = s.books_invested >= P.academic_pick_books;
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    $('glance').innerHTML = card('Academics', `${fmt(s.academics.length)} <span class="of">of ${fmt(s.academic_cap)}</span>`, `one per ${fmt(P.academic_universities)} ${esc(P.academic_building)}`)
      + card('Attribute slots', fmt(s.attribute_slots), 'each academic carries up to this many')
      // Room is one academic per academic_universities of them, plus the starting academics: the next comes at the next multiple.
      + card(cap(P.academic_building), fmt(unis), `${fmt((Math.floor(unis / P.academic_universities) + 1) * P.academic_universities - unis)} more for another`)
      + card('Choosing attributes', canPick ? 'Yes' : 'Not yet', canPick ? 'pick them when you recruit' : `drawn at random until ${fmt(P.academic_pick_books)} books are invested`);
  }
  function list(s) {
    const focus = host.contains(document.activeElement) && document.activeElement.id;   // kept across the redraw
    const waver = new Map((store.house.wavering || []).filter((w) => w.character?.kind === 'academic').map((w) => [w.character.id, w]));
    $('list').innerHTML = s.academics.length ? s.academics.map((a) => {
      const r = a.record || {}, w = waver.get(a.id), left = w ? Math.max(0, w.until_tick - store.tick) : 0;
      return `<article class="ac-card${w ? ' waver' : ''}"><h4>${esc(a.name)}</h4>
        <ul class="ac-attrs">${a.attributes.length ? a.attributes.map((t) => `<li><b>${esc(attrName(t))}</b> <span class="dim">${esc(attrDoes(t))}</span></li>`).join('') : '<li class="dim">No attributes</li>'}</ul>
        <dl class="ac-rec"><div><dt>Served</dt><dd>${fmt(r.ticks_served || 0)} ticks</dd></div><div><dt>Supervised</dt><dd>${fmt(r.books_supervised || 0)}</dd></div><div><dt>Invested</dt><dd>${fmt(r.books_invested || 0)}</dd></div><div><dt>To the Colloquium</dt><dd>${fmt(r.colloquium_books || 0)}</dd></div></dl>
        <div class="gn-acts"><button type="button" class="btn mini" id="la2-heir-${a.id}" data-heir="${a.id}" aria-pressed="${heirAt('academic', a.id) >= 0}">${heirAt('academic', a.id) >= 0 ? `Heir ${heirAt('academic', a.id) + 1} · unmark` : 'Mark as heir'}</button></div>
        ${w ? `<p class="ac-waver">Courted by another house: it goes to auction in ${fmt(left)} tick${left === 1 ? '' : 's'} unless you reassure it. <button type="button" class="btn mini primary" data-reassure="${a.id}"${store.house.gold < w.reassure_gold ? ' disabled' : ''}>Reassure, ${fmt(w.reassure_gold)} gold</button></p>` : ''}</article>`;
    }).join('') : `<p class="dim">No academics yet. ${s.academic_cap ? 'Recruit one on the right.' : `You need ${fmt(P.academic_universities)} ${esc(P.academic_building)} for the first.`}</p>`;
    if (focus) host.querySelector(`#${CSS.escape(focus)}`)?.focus();
  }
  on($('list'), 'click', (ev) => {
    const b = ev.target.closest('[data-reassure]'), hb = ev.target.closest('[data-heir]');
    if (b) act.reassure({ kind: 'academic', id: Number(b.dataset.reassure) }, { button: b });
    if (hb) toggleHeir('academic', hb.dataset.heir, hb);
  });

  /** The recruit sheet: chips limited to your slots (or off until you may choose), the cost, and why not. */
  function sheet() {
    const s = sci(), canPick = s.books_invested >= P.academic_pick_books;
    const boxes = [...host.querySelectorAll('#la2-attrs input')], picked = boxes.filter((b) => b.checked).length;
    boxes.forEach((b) => { b.disabled = !canPick || (!b.checked && picked >= s.attribute_slots); b.closest('.ac-chip').classList.toggle('on', b.checked); });
    $('al').textContent = canPick ? `Attributes: choose up to ${s.attribute_slots}` : `Attributes: drawn at random (choose from ${fmt(P.academic_pick_books)} books invested)`;
    const k = $('cat').value, i = CATS.indexOf(k), slots = canPick ? picked : s.attribute_slots;
    const why = [s.academics.length >= s.academic_cap ? `no room: one academic per ${fmt(P.academic_universities)} ${P.academic_building}` : '',
      s.books[i] < P.academic_books ? `needs ${fmt(P.academic_books)} ${k} books; you have ${fmt(s.books[i])}` : '',
      (store.house.materials[P.academic_material] || 0) < slots * P.academic_material_cost ? `needs ${fmt(slots * P.academic_material_cost)} ${P.academic_material}; you have ${fmt(store.house.materials[P.academic_material] || 0)}` : '',
      !$('name').value.trim() ? 'give it a name' : ''].filter(Boolean);
    $('doing').textContent = `Costs ${fmt(P.academic_books)} ${k} books + ${fmt(P.academic_material_cost)} ${P.academic_material} an attribute (${fmt(slots * P.academic_material_cost)} for ${slots}).${why.length ? ` Can't yet: ${why.join('; ')}.` : ''}`;
    $('doing').classList.toggle('short', why.length > 0);
    $('go').disabled = why.length > 0;
  }
  on(host.querySelector('.atk-sheet'), 'input', sheet);
  on(host.querySelector('.atk-sheet'), 'change', sheet);
  on($('form'), 'submit', (ev) => ev.preventDefault());
  on($('go'), 'click', async () => {
    const chosen = [...host.querySelectorAll('#la2-attrs input:checked')].map((x) => x.value);
    const out = await act.recruitAcademic($('name').value.trim(), $('cat').value, chosen, { button: $('go') });
    if (out) { $('name').value = ''; named?.refresh(); host.querySelectorAll('#la2-attrs input').forEach((x) => { x.checked = false; }); }
    sheet();
  });

  function draw() { const s = sci(), root = host.querySelector('.lacad'); if (!root) return; if (!s) { root.innerHTML = '<p class="dim">No science data from the server.</p>'; return; } glance(s); list(s); sheet(); }
  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('rules') || c.has('heirs')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
