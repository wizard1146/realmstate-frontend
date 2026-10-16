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
  since: 0,        // the tick the window starts at
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
    Object.assign(targets, { list: t.targets, window: t.window_ticks, since: t.since_tick ?? Math.max(0, t.tick - t.window_ticks), loaded: true, missing: false });
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

// ---------- ages and summaries ----------
/** Intel kinds shown as an age on every target, in order, with a one-letter mark. Other kinds show when present. */
export const INTEL_KINDS = [['survey', 'S'], ['muster', 'M'], ['dossier', 'D'], ['ledgers', 'L']];
/** Ticks since something on tick `t` (null when there's no tick: an old server). */
export const ageOf = (t) => (Number.isFinite(t) ? Math.max(0, store.tick - t) : null);
/** How fresh an age is: fresh (0–3 ticks), older (4–11) or stale (12+). */
export const freshness = (age) => (age == null ? 'none' : age <= 3 ? 'fresh' : age <= 11 ? 'older' : 'stale');
/** The newest intel on a target, any kind: its age in ticks, or null. */
export function newestIntelAge(row) {
  const ages = Object.values(row.intel || {}).map((i) => ageOf(i.tick)).filter((a) => a != null);
  return ages.length ? Math.min(...ages) : null;
}
/** Counts over the targets: how many, watched hexes ending soon and missing, houses whose newest intel is stale. */
export function summary(list = targets.list || []) {
  let ending = 0, missing = 0, stale = 0;
  for (const r of list) {
    const h = hexState(r);
    ending += h.on.filter((x) => x.warn).length;
    missing += h.missing.length;
    const age = newestIntelAge(r);
    if (age != null && age >= 12) stale++;
  }
  return { count: list.length, ending, missing, stale };
}
/** Sorted so what needs you comes first: a watched hex about to end, then most missing, then the most recent. */
export function byNeed(list = targets.list || []) {
  const score = (r) => { const h = hexState(r); return [h.on.some((x) => x.warn) ? 0 : 1, -h.missing.length]; };
  return list.map((r, i) => [score(r), i, r]).sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1] || a[1] - b[1]).map((x) => x[2]);
}
/** One hex on one target: {left, warn} in force, {missing: true} if not, for rite `id`. */
export function hexOn(row, id) {
  const x = hexState(row).on.find((h) => h.id === id);
  return x ? { left: x.left, warn: x.left <= watch.warn_ticks, by: x.by } : { missing: true };
}
