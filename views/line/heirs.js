// Straightline's Heirs: the generals and academics your house carries into the next age, in priority order. Drag a
// row to reorder (or ↑ ↓, or Alt+arrow on a focused row); a rule shows where your slots end; below, everyone not yet
// marked, to add. Logic: core/heirs.js, core/generals.js.
import { store } from '../../core/store.js';
import { fmt, esc } from '../../core/words.js';
import * as G from '../../core/generals.js';
import { heirAt, toggleHeir, moveHeir, sendMarks } from '../../core/heirs.js';

/** A character's line: general or academic, its traits or attributes, a fact from its record. */
function who(m) {
  const h = store.house;
  if (m.kind === 'general') {
    const g = h.generals.find((x) => x.id === m.id);
    if (!g) return { name: `general ${m.id}`, note: '' };
    return { name: g.name, note: `${(g.traits || []).map(G.traitName).join(', ') || 'no traits'} · led ${fmt(g.record?.attacks_led || 0)}, won ${fmt(g.record?.wins || 0)}` };
  }
  const a = h.science?.academics.find((x) => x.id === m.id);
  if (!a) return { name: `academic ${m.id}`, note: '' };
  const attr = (id) => store.rules.attributes?.find((x) => x.attribute === id)?.name || id;
  return { name: a.name, note: `${a.attributes.map(attr).join(', ') || 'no attributes'} · supervised ${fmt(a.record?.books_supervised || 0)} books` };
}

export function mountHeirs(host, on) {
  const P = store.rules.params;
  host.innerHTML = `<div class="lpart lheirs">
    <dl class="st-glance hr-glance" id="lh-glance"></dl>
    <p class="what">When the age ends, your house keeps its heirs: the first in this list, as many as you have slots. Drag a row to change the order, or use ↑ ↓ (Alt+arrow on a row). Generals and academics share one list.</p>
    <ol class="hr-list" id="lh-list" aria-label="Your heirs, first kept first"></ol>
    <section class="hr-rest"><h3 class="sub">Not marked</h3><div id="lh-rest"></div></section>
  </div>`;
  const $ = (id) => host.querySelector(`#lh-${id}`);

  function glance() {
    const hs = G.heirSlots(), n = G.liveMarks().length;
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    $('glance').innerHTML = card('Heirs marked', fmt(n), `of ${fmt(store.house.generals.length + (store.house.science?.academics.length || 0))} characters`)
      + card('Heir slots', fmt(hs.now), hs.next != null ? `another at ${fmt(hs.next)} renown` : 'all your renown allows')
      + card('If your state wins', fmt(hs.ifWon), `+${fmt(P.heir_winner_slots || 0)} for winning the age`)
      + card('Renown', fmt(store.house.renown), 'earns heir slots');
  }
  function list() {
    const marks = G.liveMarks(), hs = G.heirSlots(), focus = host.contains(document.activeElement) && document.activeElement.id;
    $('list').innerHTML = marks.length ? marks.map((m, i) => {
      const w = who(m), over = i >= hs.now;
      return `${i === hs.now ? `<li class="hr-cut" aria-hidden="true"><span>Your slots end here${hs.ifWon > hs.now ? `; ${fmt(hs.ifWon - hs.now)} more if your state wins` : ''}</span></li>` : ''}
        <li class="hr-row${over ? ' over' : ''}" draggable="true" data-i="${i}" id="lh-row-${m.kind}-${m.id}" tabindex="0" aria-label="${i + 1}. ${esc(w.name)}, ${m.kind}${over ? ', beyond your slots' : ''}. Alt+arrow to move.">
          <span class="hr-grip" aria-hidden="true">⋮⋮</span><span class="hr-n">${i + 1}</span>
          <span class="hr-who"><b>${esc(w.name)}</b> <span class="hr-kind">${m.kind}</span><span class="dim">${esc(w.note)}</span></span>
          <span class="hr-b"><button type="button" class="btn mini" id="lh-up-${i}" data-move="${i}:-1" aria-label="Move ${esc(w.name)} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn mini" id="lh-dn-${i}" data-move="${i}:1" aria-label="Move ${esc(w.name)} down"${i < marks.length - 1 ? '' : ' disabled'}>↓</button><button type="button" class="btn mini" data-drop="${i}" aria-label="Unmark ${esc(w.name)}">Remove</button></span></li>`;
    }).join('') : '<li class="dim hr-empty">No heirs marked yet. Add generals or academics below.</li>';
    if (focus) host.querySelector(`#${CSS.escape(focus)}`)?.focus();
    // Everyone not marked yet.
    const h = store.house, rest = [...h.generals.map((g) => ({ kind: 'general', id: g.id })), ...(h.science?.academics || []).map((a) => ({ kind: 'academic', id: a.id }))].filter((m) => heirAt(m.kind, m.id) < 0);
    // The server takes at most as many as you'd keep if your state won the age.
    const full = marks.length >= hs.ifWon;
    $('rest').innerHTML = rest.length ? `${full ? `<p class="hr-full">You can mark at most ${fmt(hs.ifWon)} (your slots if your state wins the age)${hs.next != null ? `; another slot comes at ${fmt(hs.next)} renown` : ''}. Remove one to add another.</p>` : ''}
      <ul class="hr-others">${rest.map((m) => { const w = who(m); return `<li><span class="hr-who"><b>${esc(w.name)}</b> <span class="hr-kind">${m.kind}</span><span class="dim">${esc(w.note)}</span></span><button type="button" class="btn mini" data-add="${m.kind}:${m.id}" aria-label="Mark ${esc(w.name)} as heir"${full ? ' disabled' : ''}>Add</button></li>`; }).join('')}</ul>`
      : '<p class="dim">Everyone you have is marked.</p>';
  }

  // Buttons: move, remove, add.
  on(host, 'click', (ev) => {
    const mv = ev.target.closest('[data-move]'), dr = ev.target.closest('[data-drop]'), ad = ev.target.closest('[data-add]');
    if (mv) { const [i, d] = mv.dataset.move.split(':').map(Number); moveHeir(i, i + d, mv); }
    if (dr) { const list = G.liveMarks(); list.splice(Number(dr.dataset.drop), 1); sendMarks(list, dr); }
    if (ad) { const [k, id] = ad.dataset.add.split(':'); toggleHeir(k, id, ad); }
  });
  // Alt+arrow on a focused row moves it.
  on($('list'), 'keydown', (ev) => {
    const row = ev.target.closest('.hr-row');
    if (!row || !ev.altKey || !['ArrowUp', 'ArrowDown'].includes(ev.key)) return;
    ev.preventDefault();
    const i = Number(row.dataset.i);
    moveHeir(i, i + (ev.key === 'ArrowUp' ? -1 : 1), null);
  });
  // Drag a row onto another: it takes that place.
  let dragFrom = -1;
  on($('list'), 'dragstart', (ev) => { const row = ev.target.closest('.hr-row'); if (!row) return; dragFrom = Number(row.dataset.i); row.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(dragFrom)); });
  on($('list'), 'dragend', () => { dragFrom = -1; host.querySelectorAll('.hr-row').forEach((r) => r.classList.remove('dragging', 'drop-above', 'drop-below')); });
  on($('list'), 'dragover', (ev) => {
    const row = ev.target.closest('.hr-row');
    if (dragFrom < 0 || !row) return;
    ev.preventDefault();
    const below = ev.offsetY > row.offsetHeight / 2 || ev.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    host.querySelectorAll('.hr-row').forEach((r) => r.classList.remove('drop-above', 'drop-below'));
    row.classList.add(below ? 'drop-below' : 'drop-above');
  });
  on($('list'), 'drop', (ev) => {
    const row = ev.target.closest('.hr-row');
    if (dragFrom < 0 || !row) return;
    ev.preventDefault();
    let to = Number(row.dataset.i) + (row.classList.contains('drop-below') ? 1 : 0);
    if (to > dragFrom) to -= 1;
    const from = dragFrom;
    dragFrom = -1;
    moveHeir(from, to, null);
  });

  function draw() { if (!store.house) return; glance(); list(); }
  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('heirs') || c.has('rules')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
