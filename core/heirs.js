// Heirs: the generals and academics a house keeps into the next age, in order of preference. One ordered list for
// both kinds; every change (mark, unmark, move) sends mark_heirs at once. The marks are core/generals.js's
// (house.heirs, else what this browser last sent).
import { store, notify } from './store.js';
import * as act from './actions.js';
import { liveMarks, saveMarks } from './generals.js';

export const same = (a, b) => a.kind === b.kind && a.id === b.id;
/** Where a character stands in the list (0 first), or -1. */
export const heirAt = (kind, id) => liveMarks().findIndex((m) => same(m, { kind, id: Number(id) }));

/** Sends a new list; the page's copy follows at once (a /me read lags the change). */
export async function sendMarks(list, button) {
  const out = await act.markHeirs(list.map((m) => act.charRef(m.kind, m.id)), { button });
  if (out) {
    saveMarks(list);
    if (Array.isArray(store.house.heirs)) store.house.heirs = list.map((m) => ({ kind: m.kind, id: m.id }));
    notify('heirs');
  }
  return out;
}
/** Marks (at the end) or unmarks one character. */
export function toggleHeir(kind, id, button) {
  const list = liveMarks(), k = list.findIndex((m) => same(m, { kind, id: Number(id) }));
  if (k >= 0) list.splice(k, 1); else list.push({ kind, id: Number(id) });
  return sendMarks(list, button);
}
/** Moves the heir at `from` to `to` (both list indexes). */
export function moveHeir(from, to, button) {
  const list = liveMarks();
  if (from === to || from < 0 || from >= list.length) return null;
  const [m] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, m);
  return sendMarks(list, button);
}
