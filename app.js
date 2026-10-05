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
import { VIEWS, savedView, saveView, otherView } from './core/viewswitch.js';

const $ = (id) => document.getElementById(id);
const root = $('view');

const loaders = {
  room: () => import('./views/room/room.js'),
  map: () => import('./views/map/map.js'),
};
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
  const mod = await loaders[viewName]();
  if (seq !== mountSeq || !store.house) return; // signed out, or switched again, meanwhile
  unmountView();
  mounted = { name: viewName, inst: mod.mount(root) };
}

/** Switch views without a reload; focus lands on the new view's switch. */
async function setView(name, { focus = false } = {}) {
  if (!loaders[name] || name === viewName) return;
  viewName = name;
  saveView(name);
  applyViewName();
  await mountView();
  if (focus) root.querySelector(`[data-switch-view="${name}"]`)?.focus();
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-switch-view]');
  if (b) setView(b.dataset.switchView, { focus: true });
});
// V switches views, unless typing or a dialog is open.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'v' && ev.key !== 'V') return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector('dialog[open]')) return;
  const t = ev.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  ev.preventDefault();
  setView(otherView(viewName), { focus: true });
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

// ---------- wiring ----------
subscribe((c) => {
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

(function boot() {
  start().catch((e) => {
    say(`Can't reach the game: ${e.message.replace(/\.?$/, '.')} Trying again in 5 seconds.`, 'bad');
    setTimeout(boot, 5000);
  });
})();
