// Realmstate's War Room: the shell. Starts the shared core, shows sign-in / found-a-house, and
// mounts the War Room (views/room) once you hold a house.
import { store, subscribe, start, say, playable } from './core/store.js';
import * as live from './core/live.js';
import * as actions from './core/actions.js';
import { connected, configProblem, startConnect, finishConnect, API } from './core/api.js';
import { esc } from './core/words.js';
import { WIKI } from './core/wiki.js';

const $ = (id) => document.getElementById(id);
const root = $('view');

let mounted = null;   // the War Room instance on screen
let mountSeq = 0;

function unmountView() {
  if (!mounted) return;
  try { mounted.unmount(); } catch (e) { console.error(e); }
  mounted = null;
  root.replaceChildren();
}

async function mountView() {
  const seq = ++mountSeq;
  if (!store.house) { unmountView(); return; }
  if (mounted) return;
  const mod = await import('./views/room/room.js');
  if (seq !== mountSeq || !store.house) return; // signed out meanwhile
  mounted = mod.mount(root);
}

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
$('c-race').addEventListener('change', raceLink);

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
window.realmstate = { store, live };

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
