// Straightline's Generals: your generals at a glance; each as a card (where it is, settling in, traits and what they
// do, its record; main general, heir and the Hall of Deeds; Reassure while another house courts it); and a Raise sheet
// (a name, traits as chips once your renown lets you choose, the exact cost). Heirs are ordered on the Heirs page.
// Logic: core/generals.js, core/heirs.js, actions.
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, when } from '../../core/words.js';
import { nameRoll } from '../../core/names.js';
import { pctBp } from '../../core/does.js';
import * as G from '../../core/generals.js';
import { heirAt, toggleHeir } from '../../core/heirs.js';


export function mountGenerals(host, on) {
  const P = store.rules.params;
  host.innerHTML = `<div class="lpart lgen">
    <dl class="st-glance gn-glance" id="lg-glance"></dl>
    <div class="atk-layout">
      <div class="atk-main">
        <h3 class="sub">Your generals</h3><div class="ac-cards" id="lg-list"></div>
        <p class="note">The main general commands your home defence; one sent with an army stops commanding it. A general that just changed house settles in for ${fmt(P.settling_ticks)} ticks (${pctBp(P.settling_penalty_bp)} offense and defence). A failed attack kills its general ${fmt(P.general_death_bp / 100)}% of the time.</p>
        <p class="note">Your heirs, generals and academics together, are ordered on the <a href="#heirs">Heirs</a> page.</p>
      </div>
      <aside class="atk-sheet" aria-label="Raise a general">
        <h3 class="sub">Raise a general</h3>
        <form id="lg-form" class="lform atk-grid" novalidate>
          <label for="lg-name">Name</label><span class="field"><input id="lg-name" maxlength="40" autocomplete="off"><button type="button" class="btn mini" id="lg-roll" aria-label="Suggest another name" title="Suggest another name">&#8635;</button></span>
        </form>
        <fieldset class="ac-chips" id="lg-traits"><legend id="lg-tl">Traits</legend>${G.traits().map((t) => `<label class="ac-chip"><input type="checkbox" value="${esc(t.trait)}"><span><b>${esc(t.name)}</b><span class="dim">${esc(G.traitDoes(t.trait))}</span></span></label>`).join('')}</fieldset>
        <p class="doing" id="lg-doing" aria-live="polite"></p>
        <div class="atk-go"><button type="button" class="btn primary" id="lg-go">Raise</button></div>
      </aside>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#lg-${id}`);
  const named = nameRoll($('name'), $('roll'), 'general');

  // ---------- at a glance ----------
  function glance() {
    const h = store.house, slots = G.traitSlots(), hs = G.heirSlots();
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    $('glance').innerHTML = card('Generals', `${fmt(h.generals.length)} <span class="of">of ${fmt(P.general_max)}</span>`)
      + card('Main general', esc(h.generals.find((g) => g.id === h.defender)?.name || 'None'), 'commands your defence')
      + card('Trait slots', fmt(slots.total), slots.next != null ? `another at ${fmt(slots.next)} renown` : esc(slots.parts.join(', ')))
      + card('Heir slots', fmt(hs.now), `${fmt(hs.ifWon)} if your state wins the age`);
  }

  // ---------- the generals ----------
  function cards() {
    const h = store.house, waver = new Map((h.wavering || []).filter((w) => w.character?.kind === 'general').map((w) => [w.character.id, w]));
    if (!h.generals.length) { $('list').innerHTML = `<p class="dim">No generals. Raise one on the right by retiring ${fmt(P.general_elites)} elites; elites in training sometimes produce one from the ranks; the Hall of Deeds trades them.</p>`; return; }
    const focus = host.contains(document.activeElement) && document.activeElement.id;
    $('list').innerHTML = h.generals.map((g) => {
      const r = g.record || {}, s = G.settlingUntil(g), l = G.listingOf('general', g.id), isDef = h.defender === g.id, w = waver.get(g.id);
      const where = g.away ? 'Away with an army' : l ? 'On the market' : 'At home';
      const heir = heirAt('general', g.id), cool = G.cooldownUntil(g);
      const sellWhy = g.away ? 'away with an army' : isDef ? 'the main general can\'t be sold; name another first' : cool ? `changed hands too recently; free ${when(cool)}` : '';
      return `<article class="ac-card gn-card${isDef ? ' def' : ''}${w ? ' waver' : ''}"><header><h4>${esc(g.name)}</h4>${isDef ? '<span class="gn-badge">Main general</span>' : ''}</header>
        <p class="gn-where">${where}${r.raised_age ? ` · raised in age ${r.raised_age}` : ''}${s ? ` · <span class="short">settling in until ${esc(when(s))}</span>` : ''}</p>
        <ul class="ac-attrs">${(g.traits || []).length ? g.traits.map((t) => `<li><b>${esc(G.traitName(t))}</b> <span class="dim">${esc(G.traitDoes(t))}</span></li>`).join('') : '<li class="dim">No traits</li>'}</ul>
        <dl class="ac-rec gn-rec"><div><dt>Led</dt><dd>${fmt(r.attacks_led || 0)}</dd></div><div><dt>Won / lost</dt><dd>${fmt(r.wins || 0)} / ${fmt(r.losses || 0)}</dd></div><div><dt>Land taken</dt><dd>${fmt(r.land_taken || 0)}</dd></div>
          <div><dt>Renown</dt><dd>${fmt(r.renown_earned || 0)}</dd></div><div><dt>Defences held</dt><dd>${fmt(r.defenses_held || 0)} / ${fmt(r.defenses || 0)}</dd></div><div><dt>Changed hands</dt><dd>${fmt(r.transfers || 0)}</dd></div></dl>
        <div class="gn-acts">
          ${isDef ? `<button type="button" class="btn mini" id="lg-def-${g.id}" data-undefend>Stand down as main</button>` : `<button type="button" class="btn mini" id="lg-def-${g.id}" data-defend="${g.id}"${g.away || l ? ' disabled' : ''}>Make main general</button>`}
          <button type="button" class="btn mini" id="lg-heir-${g.id}" data-heir="${g.id}" aria-pressed="${heir >= 0}">${heir >= 0 ? `Heir ${heir + 1} · unmark` : 'Mark as heir'}</button>
          <button type="button" class="btn mini" id="lg-sell-${g.id}" data-sell="${g.id}"${!l && sellWhy ? ` disabled title="${esc(sellWhy)}"` : ''}>${l ? 'Listed in the Hall' : 'List in the Hall'}</button>
        </div>
        ${w ? `<p class="ac-waver">Courted by another house: it goes to auction in ${fmt(Math.max(0, w.until_tick - store.tick))} ticks unless you reassure it. <button type="button" class="btn mini primary" data-reassure="${g.id}"${h.gold < w.reassure_gold ? ' disabled' : ''}>Reassure, ${fmt(w.reassure_gold)} gold</button></p>` : ''}</article>`;
    }).join('');
    if (focus) host.querySelector(`#${CSS.escape(focus)}`)?.focus();
  }
  on($('list'), 'click', (ev) => {
    const d = ev.target.closest('[data-defend]'), u = ev.target.closest('[data-undefend]'), hb = ev.target.closest('[data-heir]'), sb = ev.target.closest('[data-sell]'), rb = ev.target.closest('[data-reassure]');
    if (d) act.setDefender(d.dataset.defend, { button: d });
    if (u) act.setDefender(null, { button: u });
    if (hb) toggleHeir('general', hb.dataset.heir, hb);
    if (sb) { G.sellPick.set({ kind: 'general', id: Number(sb.dataset.sell) }); location.hash = '#hall'; }
    if (rb) act.reassure({ kind: 'general', id: Number(rb.dataset.reassure) }, { button: rb });
  });

  // ---------- raise ----------
  function sheet() {
    const pick = G.mayPick(), slots = G.traitSlots();
    const boxes = [...host.querySelectorAll('#lg-traits input')], chosen = boxes.filter((b) => b.checked);
    boxes.forEach((b) => { b.disabled = !pick || (!b.checked && chosen.length >= slots.total); b.closest('.ac-chip').classList.toggle('on', b.checked); });
    $('tl').textContent = pick ? `Traits: choose up to ${slots.total} (none ticked: drawn at random)` : `Traits: ${slots.total} drawn at random (choosing needs ${fmt(P.general_pick_renown)} renown; you have ${fmt(store.house.renown)})`;
    const n = pick && chosen.length ? chosen.length : slots.total, q = G.recruitQuote(n);
    const why = [q.why, !$('name').value.trim() ? 'give it a name' : ''].filter(Boolean);
    $('doing').textContent = `Retires ${fmt(q.elites)} elites and costs ${q.exact ? '' : '≈'}${fmt(q.amount)} ${q.material} for ${n} trait${n === 1 ? '' : 's'}. You hold ${fmt(store.house.units[3])} elites at home and ${fmt(q.held)} ${q.material}.${why.length ? ` Can't yet: ${why.join('; ')}.` : ''}`;
    $('doing').classList.toggle('short', why.length > 0);
    $('go').disabled = why.length > 0;
  }
  on(host.querySelector('.atk-sheet'), 'input', sheet);
  on(host.querySelector('.atk-sheet'), 'change', sheet);
  on($('form'), 'submit', (ev) => ev.preventDefault());
  on($('go'), 'click', async () => {
    const traits = G.mayPick() ? [...host.querySelectorAll('#lg-traits input:checked')].map((x) => x.value) : [];
    const out = await act.recruitGeneral($('name').value, traits, { button: $('go') });
    if (out) { $('name').value = ''; host.querySelectorAll('#lg-traits input').forEach((x) => { x.checked = false; }); named?.refresh(); }
    sheet();
  });

  function draw() { if (!store.house) return; glance(); cards(); sheet(); }
  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('rules') || c.has('hall') || c.has('heirs') || c.has('colloquium')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
