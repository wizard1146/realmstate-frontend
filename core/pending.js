// Work under way (house.pending from /me): land arriving, construction, training, medics and
// armies coming home. Plain data and words; views draw the bars.
import { store } from './store.js';
import { fmt, names, dayTime } from './words.js';

/** The kinds, in the order views list them. */
export const KINDS = ['explore', 'build', 'train', 'medics', 'army'];
export const KIND_LABEL = { explore: 'LAND', build: 'BUILD', train: 'TRAIN', medics: 'MEDICS', army: 'ARMY' };

/**
 * Your pending work of the given kinds, soonest first. A training order finishes on a bell, in
 * several batches; they are merged back into one job: count is the whole order, first_at the
 * first batch, done_at the last, peak_at when the biggest batch lands.
 */
export function list(kinds = KINDS) {
  const p = (store.house?.pending || []).filter((x) => kinds.includes(x.kind));
  const out = [];
  const trains = new Map();
  for (const x of p) {
    if (x.kind !== 'train') { out.push(x); continue; }
    const k = `${x.slot}:${x.started_at}:${x.direct ? 1 : 0}`;
    let g = trains.get(k);
    if (!g) {
      g = { ...x, count: 0, first_at: x.done_at, done_at: x.done_at, peak: 0, peak_at: x.done_at, batches: 0 };
      trains.set(k, g);
      out.push(g);
    }
    g.count += x.count;
    g.batches++;
    g.first_at = Math.min(g.first_at, x.done_at);
    g.done_at = Math.max(g.done_at, x.done_at);
    if (x.count > g.peak) { g.peak = x.count; g.peak_at = x.done_at; }
  }
  return out.sort((a, b) => (a.first_at ?? a.done_at) - (b.first_at ?? b.done_at));
}

/** When a job is done, in words: "14:05", or for a spread training order "12:00–16:00". */
export function spanText(x) {
  if (x.kind === 'train' && x.batches > 1 && x.first_at !== x.done_at) return `${dayTime(x.first_at)}–${dayTime(x.done_at)}`;
  return dayTime(x.done_at);
}
/** A training order's spread in a sentence: "ready 12:00–16:00, most at 14:00". */
export function spreadText(x) {
  if (x.kind !== 'train' || !(x.batches > 1)) return `done ${dayTime(x.done_at)}`;
  return `ready ${dayTime(x.first_at)}–${dayTime(x.done_at)}, most at ${dayTime(x.peak_at)}`;
}

/** Nominal length of a job, for old jobs the server has no start time for (before modifiers). */
function nominal(x) {
  const p = store.rules?.params;
  if (!p) return 0;
  const t = store.age?.tick_ms || p.tick_ms;
  if (x.kind === 'explore') return p.explore_ticks * t;
  if (x.kind === 'build') return p.construction_ticks * t;
  if (x.kind === 'train') return p.train_ticks * t;
  return 0;
}

/**
 * { from, to, frac, left, approx }: frac is 0..1 done (null when the start is unknown);
 * approx is true when the start was guessed from the nominal length.
 */
export function progress(x, now = Date.now()) {
  let from = x.started_at;
  let approx = false;
  if (from == null) {
    const n = nominal(x);
    if (n) { from = x.done_at - n; approx = true; }
  }
  const left = Math.max(0, x.done_at - now);
  const frac = from == null || x.done_at <= from ? null : Math.min(1, Math.max(0, (now - from) / (x.done_at - from)));
  return { from, to: x.done_at, frac, left, approx };
}

/** Time left as "0:42", "12:05", "3h 05m" or "2d 4h". */
export function leftText(ms) {
  const s = Math.ceil(ms / 1000);
  if (s <= 0) return 'due';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Finish time: "14:05" today, otherwise "Tue 14:05" (UTC or local, as the page is set). */
export const finishText = (ms) => dayTime(ms);

const bname = (id) => names.buildings[id] || id;

/** What a job is, in a few words: "+40 acres", "10 Farms", "100 Raiders", "500 troops +40 acres". */
export function what(x) {
  switch (x.kind) {
    case 'explore': return `+${fmt(x.count)} acres`;
    case 'build': return `${fmt(x.count)} ${bname(x.what)}`;
    case 'train': return `${fmt(x.count)} ${x.what || names.units[x.slot] || 'troops'}${x.direct ? ' (direct)' : ''}`;
    case 'medics': return `${fmt(x.count)} medics`;
    case 'army': return `${fmt(x.count)} troops${x.land ? ` +${fmt(x.land)} acres` : ''}`;
    default: return `${fmt(x.count)} ${x.kind}`;
  }
}

/** What an army brings home, as a list of short phrases. */
export function carries(x) {
  if (x.kind !== 'army') return [];
  const out = [];
  (x.units || []).forEach((n, i) => { if (n) out.push(`${fmt(n)} ${names.units[i] || `slot ${i + 1}`}`); });
  if (x.medics) out.push(`${fmt(x.medics)} medics`);
  if (x.horses) out.push(`${fmt(x.horses)} horses`);
  if (x.chariots) out.push(`${fmt(x.chariots)} chariots`);
  if (x.general != null) {
    const g = (store.house?.generals || []).find((y) => y.id === x.general);
    out.push(`general ${g ? g.name : `#${x.general}`}`);
  }
  if (x.land) out.push(`${fmt(x.land)} acres`);
  const l = x.loot;
  if (l) {
    if (l.gold) out.push(`${fmt(l.gold)} gold`);
    if (l.food) out.push(`${fmt(l.food)} food`);
    const mats = (l.materials || []).reduce((a, b) => a + b, 0);
    if (mats) out.push(`${fmt(mats)} materials`);
    const books = (l.books || []).reduce((a, b) => a + b, 0);
    if (books) out.push(`${fmt(books)} books`);
  }
  return out;
}

/** Totals per kind (and per building or unit inside it): [{ kind, count, parts: [[what, count]] }]. */
export function totals(items) {
  const by = new Map();
  for (const x of items) {
    if (!by.has(x.kind)) by.set(x.kind, { kind: x.kind, count: 0, parts: new Map() });
    const t = by.get(x.kind);
    t.count += x.count;
    const k = x.kind === 'build' ? bname(x.what) : x.kind === 'train' ? (x.what || names.units[x.slot]) : '';
    if (k) t.parts.set(k, (t.parts.get(k) || 0) + x.count);
  }
  return KINDS.filter((k) => by.has(k)).map((k) => ({ ...by.get(k), parts: [...by.get(k).parts] }));
}

/** One kind's total in words: "LAND +40 acres", "BUILD 30 (20 Farms, 10 Homes)". */
export function totalText(t) {
  const unit = { explore: ' acres', medics: ' medics', army: ' troops' }[t.kind] || '';
  const parts = t.parts.length > 1 || (t.parts.length === 1 && t.kind !== 'build' && t.kind !== 'train')
    ? ` (${t.parts.map(([k, n]) => `${fmt(n)} ${k}`).join(', ')})`
    : t.parts.length === 1 ? ` ${t.parts[0][0]}` : '';
  return `${t.kind === 'explore' ? '+' : ''}${fmt(t.count)}${unit}${parts}`;
}
