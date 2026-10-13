// The world, for the world views (War Ring, later Atlas): every realm's name and material, and each of its states'
// name, houses, leader, share and ranks (/realms/:n, public). Loaded on demand, and again each tick while a view
// wants it. Each load keeps the one before, so a view can show what changed since the last tick.
import { store, notify } from './store.js';
import { api } from './api.js';

export const world = {
  realms: new Map(),   // realm number -> /realms/:n
  prev: new Map(),     // 'r:s' -> { land, might, renown, houses } at the load before this one
  at: 0,               // when the last load finished (ms)
  tick: -1,            // the tick it was loaded at
};

let users = 0, seq = 0, unsub = null;
const key = (r, s) => `${r}:${s}`;

/** Every state, flattened: { realm, state, key, name, realm_name, material, houses, leader, share_bp, ranks }. */
export function states() {
  const out = [];
  for (const [r, x] of world.realms) for (const s of x.states || []) out.push({ ...s, realm: r, key: key(r, s.state), realm_name: x.name, material: x.material });
  return out;
}
export const stateOf = (r, s) => states().find((x) => x.realm === r && x.state === s) || null;
/** A state's name, or "State r:s" when it has none yet. */
export const stateName = (r, s) => world.realms.get(r)?.states?.find((x) => x.state === s)?.name || `State ${r}:${s}`;
export const realmName = (r) => world.realms.get(r)?.name || `Realm ${r}`;
/** A state's total for land, might or renown now. */
export const total = (s, k) => s?.ranks?.[k]?.total || 0;

export async function loadWorld() {
  const n = store.rules?.params?.realms || 13, mine = ++seq;
  const got = await Promise.allSettled(Array.from({ length: n }, (_, i) => api(`/realms/${i + 1}`)));
  if (mine !== seq) return;
  // What each state held before this load, for "this tick" changes.
  const before = new Map(states().map((s) => [s.key, { land: total(s, 'land'), might: total(s, 'might'), renown: total(s, 'renown'), houses: s.houses }]));
  got.forEach((g, i) => { if (g.status === 'fulfilled') world.realms.set(i + 1, g.value); });
  if (before.size && world.tick !== store.tick) world.prev = before;
  world.at = Date.now(); world.tick = store.tick;
  notify('worldmap');
}

/** A view wants the world: loads it now and on every tick until the returned function is called. */
export function useWorld(subscribe) {
  users++;
  // Reads lag the tick message by about ¼ s (as with wars in store.js): read a little after it.
  if (!unsub) unsub = subscribe((c) => { if (c.has('tick') || c.has('realms')) setTimeout(loadWorld, 600); });
  loadWorld();
  return () => { if (--users === 0 && unsub) { unsub(); unsub = null; } };
}
