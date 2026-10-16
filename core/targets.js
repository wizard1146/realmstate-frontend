// Your state's recent targets (GET /state/targets): every house your state hexed, attacked or spied on lately, and
// any still under a hex your state landed. And the hexes you watch on them: your account's `hex_watch` setting
// (GET/POST /me/prefs), kept by the server so it follows you to any browser or front end. Each watched hex shows on
// a target as the ticks it has left, or as missing. Views draw their own markup from these.
import { store, notify } from './store.js';
import { api } from './api.js';
import { rites, riteKind, riteById } from './rites.js';

export const targets = {
  list: null,      // the targets, most recent first (null until loaded)
  window: 0,       // the window, in ticks
  loaded: false,
  missing: false,  // the server has no /state/targets yet
};
export const watch = { hexes: [], warn_ticks: 2, loaded: false, missing: false };

/** The hexes this age (rites that are neither self rites nor divinations). */
export const hexes = () => rites().filter((r) => riteKind(r) === 'hex');

/** Loads your state's targets (all, or one house's: then answers its row, or null, and keeps the list as it was). */
export async function loadTargets(id) {
  try {
    const t = await api(`/state/targets${id != null ? `?target=${Number(id)}` : ''}`);
    if (id != null) return t.targets[0] || null;
    Object.assign(targets, { list: t.targets, window: t.window_ticks, loaded: true, missing: false });
  } catch (e) {
    if (e.status !== 404) throw e;
    Object.assign(targets, { list: [], loaded: true, missing: true });
    if (id != null) return null;
  }
  notify('targets');
  return targets.list;
}

/** Loads your watch list (once; an account without one watches nothing). */
export async function loadWatch() {
  try {
    const prefs = await api('/me/prefs');
    const w = prefs.hex_watch || {};
    Object.assign(watch, { hexes: Array.isArray(w.hexes) ? w.hexes : [], warn_ticks: Number.isFinite(w.warn_ticks) ? w.warn_ticks : 2, loaded: true });
  } catch (e) {
    if (e.status !== 404) throw e;
    Object.assign(watch, { loaded: true, missing: true });
  }
  notify('watch');
}

/** Saves your watch list to your account. */
export async function saveWatch(list, warn) {
  const value = { hexes: list.filter((id) => riteById(id)), warn_ticks: Math.max(0, Math.round(Number(warn) || 0)) };
  await api('/me/prefs', { key: 'hex_watch', value });
  Object.assign(watch, value);
  notify('watch');
}

/** Ticks a hex in force has left, counted from the tick now (so it falls between loads). */
export const ticksLeft = (x) => Math.max(0, x.until_tick - store.tick);

/**
 * A target's hexes, for chips: those of your state in force ([{id, name, left, by, until, warn}], warn when it's a
 * watched one about to run out), then each watched hex not in force ([{id, name}]).
 */
export function hexState(row) {
  const on = (row?.hexes_in_force || []).map((x) => ({ id: x.rite_id, name: x.rite, left: ticksLeft(x), by: x.by, until: x.until_tick }))
    .filter((x) => x.left > 0)
    .map((x) => ({ ...x, warn: watch.hexes.includes(x.id) && x.left <= watch.warn_ticks }));
  const missing = watch.hexes.filter((id) => !on.some((x) => x.id === id)).map((id) => ({ id, name: riteById(id)?.name || id }));
  return { on, missing };
}

// A cast asked for from another page (Targets' Cast… or a missing hex): Rites opens on its Cast tab, on that rite.
let asked = null;
/** Asks Rites to open on its Cast tab (on rite `id`, if given) the next time it opens. */
export const castOn = (id) => { asked = { rite: id || null }; };
/** What was asked for, once ({rite} or null). */
export const takeCast = () => { const a = asked; asked = null; return a; };

/** The last hex on a target, in words. */
export function lastHexText(h) {
  if (!h) return '';
  const how = !h.success ? 'resisted' : h.reflected ? 'turned back' : 'landed';
  return `${h.rite} by ${h.by.name}, tick ${h.tick}: ${how}`;
}
