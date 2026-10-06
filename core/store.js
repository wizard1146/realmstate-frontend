// The store: what the server told us, plus a little shared UI state.
// Views read `store` and re-render when subscribe() calls them with the keys that changed.
// All fetching lives here (and in actions.js); views never call fetch.
import { api } from './api.js';
import { names, newsLine, setClockUtc, clock, setMyHouse } from './words.js';

export const store = {
  rules: null,
  me: undefined,       // /me: undefined = not asked yet, null = signed out
  house: null,         // me.house: your house in full
  age: null,           // /age
  tick: 0,             // current tick number
  nextAt: null,        // ms timestamp of the next tick (from /age next_tick_at, or tick message at + tick_ms)
  news: [],            // /news, newest first, plus live items
  newsLoaded: false,
  chats: { world: [], realm: [], state: [] }, // /chat/:channel, oldest first, plus live items
  chatsLoaded: { world: false, realm: false, state: false },
  unread: { world: 0, realm: 0, state: 0 },   // messages from others not yet seen, per channel (the war room clears them)
  drafts: { world: '', realm: '', state: '' }, // typed but unsent, per channel, kept across view switches
  ticks: [],           // /ticks: what each recent tick changed for your house, newest first
  reports: [],         // /reports: your state's intel reports, newest first ({at, spy, report})
  reportsLoaded: false,
  state: null,         // /state: your state, its members and leader
  rankings: [],        // /rankings: top houses by land (public facts)
  rankingsLoaded: false,
  wars: null,          // /wars
  realms: [],          // realm number -> its material (from /realms/:r)
  world: new Map(),    // 'r:s' -> { members, at }: every house of a state, from /states/:r/:s
  visibleStates: new Set(), // states a view has on screen; refreshed on each tick, the rest dropped
  live: 'off',         // the /live socket: off | connecting | on
  msg: { text: '', tone: '' },
  target: null,        // the house you have chosen to act on (public facts)
  colloquium: null,    // /colloquium: your state's shared research
  hall: null,          // /hall: the Hall of Deeds (characters on the market)
  offers: null,        // /offers: { made, received }
  heirs: null,         // /heirs: characters kept from earlier ages
  market: null,        // /market: each material's book and last clearing
  orders: null,        // /orders: your open orders and your state's treasury orders
  relations: null,     // /relations: hostility meters between your state and others
};
export const CHANNELS = ['world', 'realm', 'state'];

// ---------- subscribe / notify ----------
const subs = new Set();
let changes = null;
/** fn(changes: Map<key, details[]>) runs once per batch of changes. Returns an unsubscribe function. */
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function notify(key, detail) {
  if (!changes) { changes = new Map(); queueMicrotask(flush); }
  if (!changes.has(key)) changes.set(key, []);
  if (detail !== undefined) changes.get(key).push(detail);
}
function flush() {
  const c = changes; changes = null;
  for (const fn of [...subs]) { try { fn(c); } catch (e) { console.error(e); } }
}

// ---------- the message line ----------
let sayTimer = 0;
/** Show a line in the role="status" message line. tone: '' | 'good' | 'bad'. Non-errors fade after a while. */
export function say(text, tone = '') {
  store.msg = { text: text || '', tone };
  notify('msg');
  clearTimeout(sayTimer);
  if (text && tone !== 'bad') sayTimer = setTimeout(() => { store.msg = { text: '', tone: '' }; notify('msg'); }, 12000);
}
const complain = (e) => { if (e && e.status !== 401) say(e.message, 'bad'); };

// ---------- rules and lookups ----------
export async function loadRules() {
  const r = await api('/rules');
  store.rules = r;
  names.buildings = Object.fromEntries(r.buildings.map((b) => [b.building, b.name]));
  names.attacks = Object.fromEntries(r.params.attacks.map((k) => [k.id, k.name]));
  names.ops = Object.fromEntries(r.params.operations.map((o) => [o.id, o.name]));
  names.rites = Object.fromEntries((r.params.rites || []).map((o) => [o.id, o.name]));
  names.riteFx = Object.fromEntries((r.params.rites || []).map((o) => [o.id, o.effect]));
  names.traits = Object.fromEntries((r.traits || []).map((t) => [t.trait, t.name]));
  names.mats = { upgrade: r.params.upgrade_material, medic: r.params.medic_material, chariot: r.params.chariot_material };
  notify('rules');
}
export const params = () => store.rules.params;
export const playable = (list) => list.filter((d) => !d.unused && d.identity);
export const raceOf = (id) => store.rules?.races.find((r) => r.identity === id);
export const raceName = (id) => raceOf(id)?.name || id;
/**
 * Whether a race uses a unit slot: elite++ (9) only with the elite_plus_plus flag, or if the house
 * holds some anyway. An old server sends no flags: every slot shows.
 */
/** Unit slot i's [offense, defense] as your house fights now (race bonuses, mirroring), else the race's. */
export const unitPoints = (race, i) => store.house?.unit_points?.[i] || [race?.units?.[i]?.off || 0, race?.units?.[i]?.def || 0];
/** Unit slots your race can train: elites only if it may. */
export const trainableSlots = (race, all) => all.filter((i) => !(race?.race?.no_elite_training && i === 3));
export const slotUsed = (race, i) => i !== 9 || !Array.isArray(race?.flags) || race.flags.includes('elite_plus_plus') || !!(store.house?.units?.[9] || store.house?.away?.[9]);
export const persName = (id) => store.rules?.personalities.find((r) => r.identity === id)?.name || id;
/** Your race's unit list (8 slots: soldiers, offense, defense, elite, thieves, then the upgraded three). */
export const unitNames = () => raceOf(store.house?.race)?.units || [];
export const isProtected = (h) => h.protected_until > h.ticks_now;

// ---------- you ----------
export async function refreshMe() {
  let me;
  try { me = await api('/me'); } catch (e) {
    if (e.status === 401 || e.status === 403) me = null;
    else { say(e.message, 'bad'); return; } // can't reach the server: keep what we have
  }
  const prevId = store.house ? store.house.id : null;
  store.me = me;
  store.house = (me && me.house) || null;
  setMyHouse(store.house ? store.house.id : null);
  if (store.house) {
    names.units = unitNames().map((u) => u.name);
    if (store.house.ticks_now > store.tick) { store.tick = store.house.ticks_now; notify('age'); }
  }
  notify('me'); notify('house');
  scheduleDue();
  const id = store.house ? store.house.id : null;
  if (id !== prevId) {
    if (id === null) clearPrivate(); else loadAll();
    notify('house:changed');
  }
}
// When the soonest job under way (house.pending) is due, read /me again so it shows as done.
// The live socket also sends news (land arrived, troops trained) that triggers a refresh.
let dueTimer = 0;
function scheduleDue() {
  clearTimeout(dueTimer);
  const p = store.house?.pending;
  if (!p || !p.length) return;
  const next = Math.min(...p.map((x) => x.done_at));
  const wait = next - Date.now();
  // Past due but still listed: the server hasn't caught up yet; look again in a few seconds.
  dueTimer = setTimeout(refreshMe, wait > 0 ? Math.min(wait + 700, 2 ** 31 - 1) : 3000);
}
let meSoonTimer = 0;
/** Re-read /me shortly: reads are published views, refreshed about every quarter second. */
export function refreshMeSoon(ms = 400) { clearTimeout(meSoonTimer); meSoonTimer = setTimeout(refreshMe, ms); }

export function clearPrivate() {
  Object.assign(store, {
    news: [], newsLoaded: false, chats: { world: [], realm: [], state: [] }, chatsLoaded: { world: false, realm: false, state: false },
    unread: { world: 0, realm: 0, state: 0 }, drafts: { world: '', realm: '', state: '' }, ticks: [], reports: [], reportsLoaded: false, state: null, target: null, colloquium: null, hall: null, offers: null, heirs: null, market: null, orders: null, relations: null,
  });
  for (const k of ['news', 'chat', 'state', 'target', 'ticks', 'reports']) notify(k);
}

export function loadAll() {
  return Promise.allSettled([loadAge(), loadNews(), loadChat(), loadState(), loadRankings(), loadWars(), loadTicks(), loadReports(), loadColloquium(), loadHall(), loadMarket(), loadRelations()]);
}

// ---------- time ----------
export const tickMs = () => store.age?.tick_ms || store.rules?.params.tick_ms || 3600000;
/** When the next tick is due. If a tick message was missed, step forward rather than show zero. */
export function nextTickAt() {
  if (!store.nextAt) return null;
  while (store.nextAt < Date.now() - 5000) store.nextAt += tickMs();
  return store.nextAt;
}
/** "m:ss" (or "1h 5m") to the next tick, or '' if unknown. */
export function countdown() {
  const nx = nextTickAt();
  if (!nx) return '';
  const left = Math.max(0, nx - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return left > 3600000 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
}

export async function loadAge() {
  try {
    const a = await api('/age');
    const was = store.age?.age;
    store.age = a;
    // A new age (the server started again as the next one): read everything again.
    if (was !== undefined && a.age !== was) { newAge(); return; }
    store.tick = Math.max(store.tick, a.ticks);
    if (a.next_tick_at) store.nextAt = a.next_tick_at;
    notify('age');
  } catch (e) { complain(e); }
}
/** The world changed under us (a new age opened): new rules, a new world, no house yet. */
async function newAge() {
  store.tick = store.age.ticks;
  store.nextAt = store.age.next_tick_at || null;
  notify('age'); notify('age:changed');
  try { await loadRules(); } catch (e) { complain(e); }
  await refreshMe();
  say(`${store.age.name || `Age ${store.age.age}`} is open.`, 'good');
}

// ---------- news and chat ----------
export async function loadNews() {
  try {
    const fresh = await api('/news');
    // Lines this page added for your own operations and rites (the server sends no news for them).
    const local = store.news.filter((n) => n.local);
    store.news = local.length ? [...fresh, ...local].sort((a, b) => (b.at || 0) - (a.at || 0)) : fresh;
    store.newsLoaded = true;
    notify('news', { reset: true });
  } catch (e) { complain(e); }
}
/** Every channel's chat (world, realm, state), or one. */
export async function loadChat(channels = CHANNELS) {
  await Promise.all([].concat(channels).map(async (ch) => {
    try {
      store.chats[ch] = await api(`/chat/${ch}`);
      store.chatsLoaded[ch] = true;
      notify('chat', { reset: true, channel: ch });
    } catch (e) { complain(e); }
  }));
}
export async function loadTicks() {
  try { store.ticks = await api('/ticks'); notify('ticks', { reset: true }); } catch (e) { complain(e); }
}
/** Your state's intel reports (newest first); with a target id, also merges that house's. */
export async function loadReports() {
  try { store.reports = await api('/reports'); store.reportsLoaded = true; notify('reports'); } catch (e) { complain(e); }
}
/** One house's reports, read fresh (not kept in the store). */
export const reportsOn = (id) => api(`/reports?target=${Number(id)}`);
export function addNews(n) {
  store.news.unshift(n);
  if (store.news.length > 200) store.news.length = 200;
  notify('news', { added: n });
  // Your own attack's report card: the attack command's outcome already filled the message line.
  if (n.type === 'research_chosen' || n.type === 'project_tier') loadColloquium();
  if (n.type === 'order_filled') loadMarket();
  // Reads lag the live news by about ¼ s: read wars and relations a little later.
  if (/^(war_|peace_|ceasefire_|blockade_)/.test(n.type)) setTimeout(() => { loadWars(); loadRelations(); loadState(); }, 400);
  if (/^(vigil_|leader_|tax_|granted)/.test(n.type)) loadState();
  if (n.type === 'attacked' || n.type === 'spies_caught' || n.type === 'hex_suffered' || n.type === 'rite_resisted') setTimeout(loadRelations, 400);
  if (n.type !== 'attack_report') { const [text, tone] = newsLine(n); say(text, tone === 'bad' ? 'bad' : 'good'); }
  refreshMeSoon(300);
}
/** A news line made on this page (your own operation or rite); kept until the page reloads. */
export function addLocalNews(n) {
  store.news.unshift({ ...n, local: true, at: n.at || Date.now() });
  if (store.news.length > 200) store.news.length = 200;
  notify('news', { added: store.news[0] });
}
export function addChat(m) {
  const ch = CHANNELS.includes(m.channel) ? m.channel : 'state';
  const list = store.chats[ch];
  if (list.some((x) => x.id === m.id)) return;
  list.push(m);
  if (list.length > 400) list.splice(0, list.length - 400);
  if (!(store.house && m.house === store.house.id)) store.unread[ch]++;
  notify('chat', { added: m, channel: ch });
}
/** Mark a channel read. */
export function markRead(ch) {
  if (!store.unread[ch]) return;
  store.unread[ch] = 0;
  notify('unread');
}

// ---------- settings shared by every view ----------
/** Clock times in UTC (true) or local time (false); remembered per browser. */
export function setClock(utc) {
  setClockUtc(utc);
  notify('timemode');
}
export const isUtc = () => clock.utc;
const TICKS_KEY = 'realmstate.news.ticks';
/** Whether the news shows tick reports (off unless turned on; remembered per browser). */
export function showTicks(on) {
  if (on !== undefined) {
    try { localStorage.setItem(TICKS_KEY, on ? 'on' : 'off'); } catch { /* storage off */ }
    store.showTicks = !!on;
    notify('ticks', { toggled: true });
  }
  return store.showTicks;
}
store.showTicks = (() => { try { return localStorage.getItem(TICKS_KEY) === 'on'; } catch { return false; } })();

// ---------- your state, the world ----------
const key = (r, s) => `${r}:${s}`;
export async function loadState() {
  try {
    const st = await api('/state');
    store.state = st;
    store.world.set(key(st.realm, st.state), { members: st.members, at: Date.now() });
    notify('state'); notify('world');
  } catch (e) { complain(e); }
}
export async function loadRankings() {
  try { store.rankings = await api('/rankings'); store.rankingsLoaded = true; notify('rankings'); notify('world'); } catch (e) { complain(e); }
}
/** Your state's Colloquium: { active, i_lead, my_books, projects }. */
export async function loadColloquium() {
  try { store.colloquium = await api('/colloquium'); notify('colloquium'); } catch (e) { complain(e); }
}
/** The Hall of Deeds and your offers (both change hands on commands and ticks). */
export async function loadHall() {
  try {
    const [hall, offers] = await Promise.all([api('/hall'), api('/offers')]);
    store.hall = hall; store.offers = offers; notify('hall');
  } catch (e) { complain(e); }
}
/** Characters kept from earlier ages (account-wide). */
export async function loadHeirs() {
  try { store.heirs = await api('/heirs'); notify('heirs'); } catch (e) { complain(e); }
}
/** The market books (public) and your orders. */
export async function loadMarket() {
  try {
    const [m, o] = await Promise.all([api('/market'), api('/orders')]);
    store.market = m; store.orders = o; notify('market');
  } catch (e) { complain(e); }
}
/** Hostility between your state and others (both ways), and your state's war. */
export async function loadRelations() {
  try { store.relations = await api('/relations'); notify('relations'); } catch (e) { complain(e); }
}
export async function loadWars() {
  try { store.wars = await api('/wars'); notify('wars'); } catch (e) { complain(e); }
}
export async function loadRealms() {
  const n = store.rules.params.realms;
  const mats = await Promise.all(Array.from({ length: n }, (_, i) => api(`/realms/${i + 1}`).then((x) => x.material).catch(() => null)));
  store.realms = [null, ...mats];
  notify('realms');
}

const inflight = new Map();
/** Every house in one state (/states/:r/:s), cached for maxAge ms. Returns the members. */
export function loadStateMembers(r, s, { maxAge = 60000 } = {}) {
  const k = key(r, s);
  const have = store.world.get(k);
  if (have && Date.now() - have.at < maxAge) return Promise.resolve(have.members);
  if (inflight.has(k)) return inflight.get(k);
  const p = api(`/states/${r}/${s}`).then((members) => {
    store.world.set(k, { members, at: Date.now() });
    notify('world');
    return members;
  }).finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/**
 * The houses we know about, for lookups. Two sources, made explicit:
 *  - every house of each state in store.world (loaded when your state or a state on screen is read);
 *  - the /rankings list (top houses by land) for states not loaded.
 * A loaded state replaces its ranking entries, so a house that left or fell out is not shown stale.
 */
export function knownHouses() {
  const out = new Map();
  for (const h of store.rankings) if (!store.world.has(key(h.realm, h.state))) out.set(h.id, h);
  for (const { members } of store.world.values()) for (const h of members) out.set(h.id, h);
  const me = store.house;
  if (me && out.has(me.id)) {
    out.set(me.id, { ...out.get(me.id), land: me.land, might: me.might, renown: me.renown, protected: isProtected(me) });
  }
  return out;
}
export const findHouse = (id) => knownHouses().get(id) || null;

// ---------- the shared target ----------
/** Choose (or clear, with null) the house to act on. Kept when switching views. */
export function setTarget(h) {
  store.target = h ? { ...h } : null;
  notify('target');
}

// ---------- ticks and live events ----------
export function onTick(number, at, report) {
  store.tick = number;
  if (report && !store.ticks.some((r) => r.tick === report.tick)) {
    store.ticks.unshift(report);
    if (store.ticks.length > 48) store.ticks.length = 48;
    notify('ticks', { added: report });
  }
  store.nextAt = at + tickMs();
  notify('age'); notify('tick', number);
  refreshMe(); loadAge(); loadRankings(); loadWars(); loadState(); loadColloquium(); loadHall(); loadMarket(); loadRelations();
  // Drop cached states no view is showing; re-read the ones on screen.
  for (const k of [...store.world.keys()]) if (!store.visibleStates.has(k)) store.world.delete(k);
  for (const k of store.visibleStates) { const [r, s] = k.split(':').map(Number); loadStateMembers(r, s, { maxAge: 0 }).catch(() => {}); }
  notify('world');
}
export function resync() { refreshMe(); loadAll(); }
export function setLive(v) { if (store.live !== v) { store.live = v; notify('live'); } }

// ---------- start ----------
let started = false;
export async function start() {
  if (started) return;
  started = true;
  try { await loadRules(); } catch (e) { started = false; throw e; } // let the caller retry
  loadRealms().catch(() => {});
  await refreshMe();
  loadAge();
  setInterval(() => notify('clock'), 1000);
  // Without a house nothing else reads the age: keep its countdown and a new age in view.
  setInterval(() => { if (!store.house) loadAge(); }, 30000);
  setInterval(() => { if (store.house) refreshMe(); }, 20000);
  // Without the live socket, nothing tells us about ticks: poll instead.
  setInterval(() => { if (store.house && store.live !== 'on') { loadAge(); loadState(); loadRankings(); loadWars(); } }, 60000);
}
