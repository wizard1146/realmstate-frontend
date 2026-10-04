// Wavering characters: a general or academic courted by another house wavers until a tick, then
// goes to auction unless you reassure it (gold; /me house.wavering gives the exact cost).
// Shown as a notice line under the strip, and at the top of MIL GENERALS and SCI ACADEMICS.
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';

/** Your wavering characters, optionally of one kind ('general' | 'academic'). */
export const wavering = (kind) => (store.house?.wavering || []).filter((w) => !kind || w.character?.kind === kind);
const key = (w) => `${w.character.kind}:${w.character.id}`;
const left = (w) => Math.max(0, w.until_tick - store.tick);

/** One button per wavering character. */
const btn = (w) => {
  const short = store.house.gold < w.reassure_gold;
  return `<button type="button" class="btn mini primary" data-reassure="${esc(key(w))}"${short ? ` aria-disabled="true" title="Costs ${fmt(w.reassure_gold)} gold; you have ${fmt(store.house.gold)}"` : ` title="Reassure ${esc(w.name)} for ${fmt(w.reassure_gold)} gold"`}>REASSURE ${fmt(w.reassure_gold)}g</button>`;
};

/** A block for a tab (generals or academics), or '' if none waver. */
export function waverHTML(kind) {
  const list = wavering(kind);
  if (!list.length) return '';
  return `<div class="waver" role="group" aria-label="Wavering ${kind}s"><p class="waver-h">WAVERING <span class="dim">courted by another house; goes to auction when the time runs out</span></p>`
    + list.map((w) => `<p class="waver-row"><b>${esc(w.name)}</b> <span class="num">${left(w)} tick${left(w) === 1 ? '' : 's'} left</span> <span class="dim">(to T${w.until_tick})</span> ${btn(w)}</p>`).join('') + '</div>';
}

/** The notice line's content, or '' if nobody wavers. */
export function noticeHTML() {
  const list = wavering();
  if (!list.length) return '';
  return `<span class="waver-tag">WAVERING</span> ${list.map((w) => `<span>${esc(w.name)} <span class="dim">(${w.character.kind}, ${left(w)} ticks)</span> ${btn(w)}</span>`).join(' ')}`;
}

/** Click handling for every REASSURE button inside `scope`. */
export function wireReassure(scope, on) {
  on(scope, 'click', async (ev) => {
    const b = ev.target.closest('[data-reassure]');
    if (!b) return;
    const [kind, id] = b.dataset.reassure.split(':');
    const w = wavering().find((x) => x.character.kind === kind && String(x.character.id) === id);
    if (!w) { say('That character is no longer wavering.', 'bad'); return; }
    if (store.house.gold < w.reassure_gold) { say(`Reassuring ${w.name} costs ${fmt(w.reassure_gold)} gold; you have ${fmt(store.house.gold)}.`, 'bad'); return; }
    await act.reassure({ kind, id: Number(id) }, { button: b });
  });
}
