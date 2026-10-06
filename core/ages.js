// Ages: one run of the game, one world from start to end. What the age screens read: the age's
// recap (snapshots over time, its wars), an ended age's result, and the staff controls for ending
// an age and opening the next. Everything here is public except the staff calls (/dev/age).
// An older server lacks these endpoints: each read answers null (404) and the screens leave out
// what they can't show.
import { api } from './api.js';
import { store, loadAge } from './store.js';

/** The age's name, or "Age N" when the server sends none (an older server). */
export const ageName = (a) => a?.name || (a?.age ? `Age ${a.age}` : 'This age');
/** Whether the server sends the age API (start time, recap, results by number). */
export const hasAges = () => !!store.age && store.age.started_at !== undefined;
/** Whether the age has started (an older server always has). */
export const started = (a = store.age) => !a || a.started === true || (a.started_at ? Date.now() >= a.started_at : a.started !== false);

const missing = (e) => e && (e.status === 404 || e.status === 405 || e.status === 501);

// ---------- reads (cached: an ended age never changes; the current one is read again on demand) ----------
const cache = new Map();
async function cached(key, path, keep) {
  if (keep && cache.has(key)) return cache.get(key);
  try {
    const v = await api(path);
    if (keep) cache.set(key, v);
    return v;
  } catch (e) {
    if (missing(e)) { if (keep) cache.set(key, null); return null; }
    throw e;
  }
}
/** The recap of age n (an ended age), or of the current age so far (n = current or null). Null if missing. */
export function recap(n) {
  const cur = store.age?.age;
  if (n == null || n === cur) return cached('recap:now', '/age/recap', false);
  return cached(`recap:${n}`, `/ages/${Number(n)}/recap`, true);
}
/** Every recorded (ended) age, oldest first: [{age, name, started_at, ended_at, winner, winner_name}]; null on an older server. */
export function recorded() {
  return cached(`recorded:${store.age?.age}`, '/ages', true);
}
/**
 * An age's result. For the current age it is /age's `result` (once ended), with the age's number
 * and name; for an earlier one, /ages/n. Null if the age hasn't ended or isn't recorded here.
 */
export async function result(n) {
  const a = store.age;
  if (a && (n == null || n === a.age)) return a.ended && a.result ? { age: a.age, name: a.name, ...a.result } : null;
  return cached(`result:${n}`, `/ages/${Number(n)}`, true);
}

// ---------- staff (dev mode, or an admin/owner on a live game) ----------
/** GET /dev: { enabled, mode, role, can }, or null when there is no staff access. */
export async function staffAccess() {
  if (!store.me) return null;
  try { const st = await api('/dev'); return st && st.enabled ? st : null; } catch { return null; }
}
/** GET /dev/age, or null when the server has no age controls (404) or refuses. */
export async function staffAge() {
  try { return await api('/dev/age'); } catch (e) { if (missing(e) || e.status === 401 || e.status === 403) return null; throw e; }
}
export const planAge = (body) => api('/dev/age/plan', body);
export const dropPlan = (note) => api('/dev/age/plan', { note }, 'DELETE');
export const endAge = (note) => api('/dev/age/end', { note });
export const openAge = (note) => api('/dev/age/open', { note });

/**
 * After opening the next age the server starts again. Polls /age until its number changes (the
 * store then reads everything again). onWait(seconds) reports progress; resolves true when the
 * new age answers, false after `limit` ms.
 */
export async function waitForNewAge(old, { onWait, limit = 180000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    await new Promise((r) => setTimeout(r, 1500));
    onWait?.(Math.round((Date.now() - t0) / 1000));
    let a = null;
    try { a = await api('/age'); } catch { continue; } // still restarting
    if (a && a.age !== old) { await loadAge(); return true; }
  }
  return false;
}

// ---------- time ----------
/** "2d 03:04:05", "03:04:05" or "4:05" until (or since) ms. */
export function span(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  if (d) return `${d}d ${p(h)}:${p(m)}:${p(s)}`;
  if (h) return `${h}:${p(m)}:${p(s)}`;
  return `${m}:${p(s)}`;
}
/** "12d 4h", "3h 20m" or "45m": a rough length of time. */
export function roughSpan(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m >= 2880) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}
