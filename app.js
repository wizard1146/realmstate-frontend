// Realmstate's War Room: the shell. Starts the shared core, shows sign-in / found-a-house, and
// mounts a view once you hold a house: the War Room (views/room), or the Map (views/map). Switching
// swaps only the view: the store and the live socket stay.
import { store, subscribe, start, say, playable } from './core/store.js';
import * as live from './core/live.js';
import * as actions from './core/actions.js';
import { connected, configProblem, startConnect, finishConnect, API } from './core/api.js';
import { esc } from './core/words.js';
import { WIKI } from './core/wiki.js';
import { nameRoll } from './core/names.js';
import { VIEWS, savedView, saveView, nextView } from './core/viewswitch.js';
import { installAddressSpace } from './core/addr.js';
import { mountAgeBar } from './views/ages/agebar.js';
import { mountAges } from './views/ages/ages.js';

const $ = (id) => document.getElementById(id);
const root = $('view');

// Each view's entry module. Its stylesheet sits beside it with the same name (views/line/line.css) and loads
// with it; index.html starts the remembered view's early, with every module it imports (dev/preload.mjs).
const VIEW_FILES = {
  line: 'views/line/line.js',
  room: 'views/room/room.js',
  ring: 'views/ring/ring.js',
  atlas: 'views/world/world.js',
  map: 'views/map/map.js',
};
/** Load a stylesheet once; resolves when it applies (or fails: an unstyled view beats none). */
function stylesheet(href) {
  let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.getAttribute('href') === href);
  if (link?.sheet) return Promise.resolve();
  if (!link) { link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link); }
  return new Promise((done) => { link.addEventListener('load', done, { once: true }); link.addEventListener('error', done, { once: true }); });
}
async function loadView(name) {
  const file = VIEW_FILES[name];
  const [mod] = await Promise.all([import(`./${file}`), stylesheet(file.replace(/\.js$/, '.css'))]);
  return name === 'atlas' ? { mount: (root) => mod.mount(root, 'atlas') } : mod;
}
let viewName = savedView();
let mounted = null;   // { name, inst } of the view on screen
let mountSeq = 0;

function applyViewName() {
  document.documentElement.dataset.view = viewName;
  document.title = `Realmstate · ${VIEWS.find((v) => v.id === viewName).label}`;
}

function unmountView() {
  if (!mounted) return;
  try { mounted.inst.unmount(); } catch (e) { console.error(e); }
  mounted = null;
  root.replaceChildren();
}

async function mountView() {
  const seq = ++mountSeq;
  if (!store.house) { unmountView(); return; }
  if (mounted && mounted.name === viewName) return;
  const mod = await loadView(viewName);
  if (seq !== mountSeq || !store.house) return; // signed out, or switched again, meanwhile
  unmountView();
  mounted = { name: viewName, inst: mod.mount(root) };
}

/** Switch views without a reload; focus lands on the new view's switch. */
async function setView(name, { focus = false } = {}) {
  if (!VIEW_FILES[name] || name === viewName) return;
  viewName = name;
  saveView(name);
  applyViewName();
  await mountView();
  if (focus) root.querySelector('[data-switch-select]')?.focus();
}
document.addEventListener('change', (ev) => {
  if (ev.target.matches?.('[data-switch-select]')) setView(ev.target.value, { focus: true });
});
// V: the next view (Shift+V: the previous one), unless typing or a dialog is open.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'v' && ev.key !== 'V') return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector('dialog[open]')) return;
  const t = ev.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  ev.preventDefault();
  setView(nextView(viewName, ev.shiftKey), { focus: true });
});

// ---------- the message line ----------
function renderStatus() {
  const s = $('status');
  s.textContent = store.msg.text;
  s.className = `status ${store.msg.tone || ''}`;
}

// ---------- the gate: sign in, found a house ----------
function renderGate() {
  const signedIn = !!store.me;
  const house = !!store.house;
  $('gate').hidden = house || store.me === undefined;
  $('login').hidden = signedIn || connected;
  $('connect').hidden = signedIn || !connected;
  $('connect-game').textContent = API;
  $('create').hidden = !signedIn || house;
  if (signedIn && !house && store.rules && !$('c-race').options.length) {
    const opts = (list) => playable(list).map((d) => `<option value="${esc(d.identity)}">${esc(d.name)}</option>`).join('');
    $('c-race').innerHTML = opts(store.rules.races);
    $('c-pers').innerHTML = opts(store.rules.personalities);
    raceLink();
    houseName ||= nameRoll($('c-name'), $('c-name-roll'), 'house', () => $('c-race').value);
  }
  if (!house && store.me !== undefined) {
    const f = signedIn ? $('c-name') : connected ? $('connect').querySelector('button') : $('login-email');
    if (!$('gate').contains(document.activeElement)) f.focus();
  }
}

$('login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const b = ev.submitter; if (b) b.disabled = true;
  await actions.signIn($('login-email').value);
  if (b) b.disabled = false;
});
$('connect').addEventListener('submit', (ev) => { ev.preventDefault(); startConnect(); });
$('create').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  await actions.createHouse({
    name: f.name.value, race: f.race.value, personality: f.personality.value,
    realm: f.realm.value, state: f.state.value,
  }, { button: ev.submitter });
});
$('create-out').addEventListener('click', () => actions.signOut());
// The chosen race's wiki page: its units, bonuses and special rules.
function raceLink() { $('c-race-wiki').href = `${WIKI}race-${encodeURIComponent($('c-race').value)}.html`; }
// A suggested house name in the race's own style (a new one when the race changes).
let houseName = null;
$('c-race').addEventListener('change', () => { raceLink(); houseName?.refresh(); });

// ---------- the age: a bar on every screen, and the ages window ----------
const agesWindow = mountAges();
mountAgeBar($('agebar'), (tab) => agesWindow.open(tab));

// ---------- wiring ----------
installAddressSpace();   // in any address box, a space types ":"

subscribe((c) => {
  // A new age: new rules, so the founding form's races and personalities are read again.
  if (c.has('age:changed')) { $('c-race').replaceChildren(); $('c-pers').replaceChildren(); renderGate(); }
  if (c.has('msg')) renderStatus();
  if (c.has('me') || c.has('house') || c.has('rules')) renderGate();
  if (c.has('house:changed')) {
    if (store.house) live.connect(); else live.close();
    mountView();
  }
});

// For checking in a browser console (and the headless test): the store and socket.
window.realmstate = { store, live, setView: (v) => setView(v) };
applyViewName();

// Back from the game's site with its answer to connecting?
const answer = finishConnect();
if (answer?.error) say(answer.error, 'bad');
else if (answer?.ok) say('Connected. This page now plays for you.', 'good');
if (configProblem) say(configProblem, 'bad');

// ---------- can't reach the game: a card that counts down to the next try (sooner with Try now) ----------
let tries = 0, retryAt = 0, retryTimer = 0, countTimer = 0;
function offline(e) {
  tries += 1;
  const wait = Math.min(30, 5 * 2 ** Math.min(tries - 1, 3)) * 1000;   // 5, 10, 20, then every 30 seconds
  retryAt = Date.now() + wait;
  $('offline').hidden = false;
  $('off-detail').textContent = `${API ? `${API} · ` : ''}${e.message}${tries > 1 ? ` · ${tries} tries so far` : ''}`;
  const count = () => { const s = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)); $('off-next').textContent = s ? `Trying again in ${s} second${s === 1 ? '' : 's'}…` : 'Trying again…'; };
  count();
  clearInterval(countTimer); countTimer = setInterval(count, 1000);
  clearTimeout(retryTimer); retryTimer = setTimeout(boot, wait);
}
function boot() {
  clearTimeout(retryTimer); clearInterval(countTimer);
  $('off-next').textContent = 'Trying again…';
  start().then(() => { $('offline').hidden = true; }).catch(offline);
}
$('off-try').addEventListener('click', boot);
boot();
