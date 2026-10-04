// Heirs: the generals and academics a house keeps into the next age, in order of preference.
// One ordered list for both kinds; every change (mark, unmark, move) sends mark_heirs at once.
// The server takes the list but doesn't send it back, so this browser remembers what it sent.
import { store, loadHeirs, notify } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import * as G from './generals.js';

const same = (a, b) => a.kind === b.kind && a.id === b.id;
export const isMarked = (kind, id) => G.liveMarks().some((m) => same(m, { kind, id }));

/** Sends a new list; remembers it if the server took it. */
export async function sendMarks(list, button) {
  const out = await act.markHeirs(list.map((m) => act.charRef(m.kind, m.id)), { button });
  if (out) { G.saveMarks(list); notify('heirs'); }
  // The button was disabled while the command ran (so it lost focus); find it again after the redraw.
  const id = button?.id;
  if (id && !pendingFocus) setTimeout(() => document.getElementById(id)?.focus());
  return out;
}
/** Marks (at the end) or unmarks one character. */
export function toggle(kind, id, button) {
  const list = G.liveMarks();
  const k = list.findIndex((m) => same(m, { kind, id }));
  if (k >= 0) list.splice(k, 1); else list.push({ kind, id: Number(id) });
  return sendMarks(list, button);
}
/** A HEIR / UNHEIR button for a table row. */
export const heirButton = (kind, id, name, p = '') => {
  const on = isMarked(kind, id);
  return `<button type="button" class="btn mini"${p ? ` id="${p}-heir-${kind}-${id}"` : ''} data-heir="${kind}:${id}" aria-pressed="${on}" aria-label="${on ? 'Unmark' : 'Mark'} ${esc(name)} as an heir">${on ? `HEIR ${G.liveMarks().findIndex((m) => same(m, { kind, id: Number(id) })) + 1}` : 'HEIR'}</button>`;
};
/** Clicks on [data-heir] buttons inside `box`. */
export function wireHeirButtons(box, on) {
  on(box, 'click', (ev) => {
    const b = ev.target.closest('[data-heir]');
    if (!b) return;
    const [kind, id] = b.dataset.heir.split(':');
    toggle(kind, Number(id), b);
  });
}
export function slotLine() {
  const s = G.heirSlots(), n = G.liveMarks().length;
  return `${fmt(n)} marked · ${s.now} slot${s.now === 1 ? '' : 's'} from renown now${s.next != null ? ` (next at ${fmt(s.next)} renown; you have ${fmt(store.house.renown)})` : ''}, ${s.ifWon} if your state wins the age`;
}

// ---------- the HEIRS section (MIL › GENERALS) ----------
export const heirsHTML = () => `<section class="wide"><h3 class="sub">HEIRS <span class="dim" id="d-hr-line"></span></h3>
  <div id="d-hr-list"></div>
  <p class="dim small">When the age ends you keep the first ones on this list, as many as your slots allow then. You may mark up to the if-you-win count. Marks are sent to the server at once; it doesn't show them back, so this list is what this browser last sent.</p>
  <h3 class="sub">KEPT FROM EARLIER AGES</h3><div id="d-hr-kept"></div></section>`;

export function heirsWire(b, on) {
  on(b, 'click', async (ev) => {
    const mv = ev.target.closest('[data-hmove]');
    if (mv) {
      const list = G.liveMarks();
      const i = Number(mv.dataset.i), j = i + Number(mv.dataset.hmove);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      // Focus follows the moved character (its same arrow, or the other one at the end of the list).
      pendingFocus = [`d-hr-mv${mv.dataset.hmove}-${j}`, `d-hr-mv${-Number(mv.dataset.hmove)}-${j}`];
      await sendMarks(list, mv);
      return;
    }
    const rc = ev.target.closest('[data-recall]');
    if (rc) act.recallHeir(rc.dataset.recall, { button: rc });
    const clr = ev.target.closest('#d-hr-clear');
    if (clr) sendMarks([], clr);
  });
  loadHeirs();
}

let pendingFocus = null;
export function heirsUpdate(b) {
  const line = b.querySelector('#d-hr-line');
  if (!line || !store.house) return;
  line.textContent = slotLine();
  const was = b.querySelector('#d-hr-list')?.contains(document.activeElement) ? document.activeElement.id : null;
  const list = G.liveMarks(), s = G.heirSlots();
  const what = (m) => (m.kind === 'general' ? 'general' : 'academic');
  b.querySelector('#d-hr-list').innerHTML = list.length
    ? `<div class="scrollx"><table class="tbl"><tr><th class="num">#</th><th>CHARACTER</th><th>KIND</th><th>KEPT</th><th></th></tr>${list.map((m, i) => `<tr><td class="num">${i + 1}</td><td class="name">${esc(G.charName(m))}</td><td class="dim">${what(m)}</td>`
      + `<td class="small">${i < s.now ? 'yes' : i < s.ifWon ? '<span class="dim">only if your state wins</span>' : '<span class="short">no slot</span>'}</td>`
      + `<td class="nowrap"><button type="button" class="btn mini" data-hmove="-1" data-i="${i}" id="d-hr-mv-1-${i}" aria-label="Move ${esc(G.charName(m))} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn mini" data-hmove="1" data-i="${i}" id="d-hr-mv1-${i}" aria-label="Move ${esc(G.charName(m))} down"${i < list.length - 1 ? '' : ' disabled'}>↓</button>${heirButton(m.kind, m.id, G.charName(m), 'd-hr')}</td></tr>`).join('')}</table></div>
      <p><button type="button" class="btn" id="d-hr-clear">CLEAR ALL</button></p>`
    : '<p class="dim small">None marked. Use HEIR on a general above, or on an academic in SCI › ACADEMICS.</p>';
  const box = b.querySelector('#d-hr-list');
  if (was && !pendingFocus) box.querySelector(`#${CSS.escape(was)}`)?.focus();
  if (pendingFocus) {
    const el = pendingFocus.map((id) => box.querySelector(`#${id}`)).find((x) => x && !x.disabled);
    if (el) { el.focus(); pendingFocus = null; }
  }
  const kept = store.heirs;
  b.querySelector('#d-hr-kept').innerHTML = !kept ? '<p class="dim small">Loading…</p>' : kept.length
    ? `<div class="scrollx"><table class="tbl"><tr><th>NAME</th><th>KIND</th><th class="num">KEPT FROM AGE</th><th></th></tr>${kept.map((k) => `<tr><td class="name">${esc(k.name)}</td><td class="dim">${esc(k.kind)}</td><td class="num">${fmt(k.kept_from_age)}</td>`
      + `<td>${k.recalled_into_age ? `<span class="dim small">recalled into age ${fmt(k.recalled_into_age)}</span>` : `<button type="button" class="btn mini" data-recall="${esc(k.uid)}" aria-label="Recall ${esc(k.name)} into this house">RECALL</button>`}</td></tr>`).join('')}</table></div>`
    : '<p class="dim small">No heirs from earlier ages on this account.</p>';
}
