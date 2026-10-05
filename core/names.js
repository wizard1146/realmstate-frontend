// Name suggestions from the server (GET /names): a field starts with one, ↻ gives another. A
// suggestion the player hasn't edited is replaced when the race changes; their own typing never is.
// A server without name lists (404) leaves the field empty and the button idle.
import { api } from './api.js';

const queues = new Map(); // "kind:race" -> names not yet shown

/** The next suggested name for `kind` (house, general, academic); race only for houses. */
export async function nextName(kind, race = '') {
  const key = `${kind}:${race}`;
  let q = queues.get(key);
  if (!q || !q.length) {
    const qs = new URLSearchParams({ kind, count: '10' });
    if (kind === 'house') qs.set('race', race);
    try { q = (await api(`/names?${qs}`)).names || []; } catch { q = []; }
    queues.set(key, q);
  }
  return q.shift() || '';
}

/**
 * Suggests names into `input`; `button` (if any) asks for another. raceOf() gives the race for
 * house names. Returns { refresh } to call when the race changes or the field is shown again.
 */
export function nameRoll(input, button, kind, raceOf = () => '') {
  const fill = async (force) => {
    const ours = input.dataset.suggested && input.value === input.dataset.suggested;
    if (!force && input.value && !ours) return; // the player's own name stays
    const name = await nextName(kind, raceOf());
    if (!name) return;
    input.value = name;
    input.dataset.suggested = name;
  };
  button?.addEventListener('click', () => { fill(true); input.focus(); });
  fill(false);
  return { refresh: () => fill(false) };
}
