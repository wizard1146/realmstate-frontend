// Dev panel: on a server in dev mode, or for staff (a role) on a live game; GET /dev says which and
// what this account `can` do, and only those controls show. Jump time ahead, pause and resume,
// grant anything to any house, protect, start a war or make peace, play as or inspect a house.
// On a live game every action needs a note (why), which the server audits and passes to the house.
// The same as chat commands: /dev ticks 24, /dev grant gold 5000, ... Addresses are
// realm:state:seat; an empty one means your own house.
import { store, say, resync } from '../../core/store.js';
import { api } from '../../core/api.js';
import { resolveAddress } from '../../core/actions.js';
import * as commands from '../../core/commands.js';
import { fmt, esc } from '../../core/words.js';

const BOOKS = ['economy', 'military', 'arcane'];
/** The staff note for a live game (the panel's note field), or undefined in dev mode. */
let noteOf = () => undefined;

/** What can be granted: [value, label]. */
function goods() {
  const units = (store.rules?.races.find((r) => r.identity === store.house?.race)?.units || []).map((u, k) => [`units:${k}`, `units: ${u.name}`]);
  const mats = Object.keys(store.house?.materials || {}).map((m) => [`material:${m}`, `material: ${m}`]);
  return [['gold', 'gold'], ['food', 'food'], ['peasants', 'peasants'], ['horses', 'horses'], ['land', 'land (barren)'], ['renown', 'renown'], ['aether', 'aether'],
    ...mats, ...units, ...BOOKS.map((b) => [`books:${b}`, `books: ${b}`])];
}

/** The house at an address, or yours when it's empty. */
async function houseAt(text) {
  if (!String(text || '').trim()) return store.house;
  return resolveAddress(text);
}
/** "2:1" -> [2, 1]. */
function stateAt(text) {
  const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(text || '');
  if (!m) throw new Error('Write a state as realm:state, for example 2:1.');
  return [Number(m[1]), Number(m[2])];
}

async function act(fn, done) {
  try {
    const out = await fn();
    say(typeof done === 'function' ? done(out) : done, 'good');
    resync();
    return out;
  } catch (e) {
    say(`Dev: ${e.message}`, 'bad');
    return null;
  }
}

const dev = {
  status: () => api('/dev'),
  advance: (ticks) => act(() => api('/dev/advance', { ticks: Number(ticks) }), (o) => `Jumped ${fmt(Number(ticks))} tick${Number(ticks) === 1 ? '' : 's'} ahead; now tick ${fmt(o.tick)}.`),
  pause: () => act(() => api('/dev/pause', { note: noteOf() }), 'Paused: no ticks or timers until you resume.'),
  resume: () => act(() => api('/dev/resume', { note: noteOf() }), 'Resumed, as if no time had passed.'),
  grant: async (what, amount, at) => {
    const h = await houseAt(at).catch((e) => { say(e.message, 'bad'); return null; });
    if (!h) return null;
    return act(() => api('/dev/command', { type: 'grant', house: h.id, what, amount: Math.trunc(Number(amount)), note: noteOf() }), (o) => `${o.amount >= 0 ? 'Granted' : 'Took'} ${fmt(Math.abs(o.amount))} ${what} ${o.amount >= 0 ? 'to' : 'from'} ${h.name}.`);
  },
  protect: async (ticks, at) => {
    const h = await houseAt(at).catch((e) => { say(e.message, 'bad'); return null; });
    if (!h) return null;
    return act(() => api('/dev/command', { type: 'protect', house: h.id, ticks: Math.trunc(Number(ticks)), note: noteOf() }), (o) => (o.until_tick ? `${h.name} is protected until tick ${o.until_tick}.` : `${h.name} is no longer protected.`));
  },
  war: (a, b) => act(() => api('/dev/command', { type: 'war', a: stateAt(a), b: stateAt(b), note: noteOf() }), `War between ${a} and ${b}.`),
  peace: (s) => act(() => api('/dev/command', { type: 'peace', state: stateAt(s), note: noteOf() }), `Peace for ${s}.`),
  playAs: async (at) => {
    const h = await houseAt(at).catch((e) => { say(e.message, 'bad'); return null; });
    if (!h) return null;
    return act(() => api('/dev/play-as', { house: h.id }), `Now playing as ${h.name}. (Sign in again to go back.)`);
  },
  inspect: async (at) => {
    const h = await houseAt(at).catch((e) => { say(e.message, 'bad'); return null; });
    if (!h) return null;
    try { return await api(`/dev/houses/${h.id}`); } catch (e) { say(`Dev: ${e.message}`, 'bad'); return null; }
  },
};

/**
 * Adds the DEV button and panel when the server is in dev mode (and the /dev chat command).
 * Returns a cleanup function.
 */
export async function mountDevLab(root, on) {
  let st;
  try { st = await dev.status(); } catch { return () => {}; }
  if (!st.enabled) return () => {};
  noteOf = () => undefined;
  const slot = root.querySelector('#r-fonts')?.closest('.cell');
  const btn = document.createElement('button');
  btn.className = 'btn ghost mini';
  btn.id = 'r-dev';
  btn.textContent = 'DEV';
  btn.title = 'Dev mode: time, grants, wars, play as (D)';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'r-devlab');
  slot?.prepend(btn);
  const panel = document.createElement('section');
  panel.id = 'r-devlab';
  panel.className = 'fontlab devlab';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Dev mode');
  panel.innerHTML = `
    <header><b>${st.mode === 'live' ? `STAFF · ${esc(String(st.role || '').toUpperCase())}` : 'DEV MODE'}</b> <span class="dim" id="r-dv-st"></span><button class="btn mini" data-close aria-label="Close dev panel">×</button></header>
    ${st.mode === 'live' ? '<p class="row"><span class="lab">NOTE</span><input id="r-dv-note" placeholder="why (required; the player sees it)" style="flex:1" aria-label="Why: a note for the audit log and the player"></p>' : ''}
    <p class="row" data-can="pause"><span class="lab">TIME</span> ${[1, 10, 24, 100].map((n) => `<button class="btn mini" data-adv="${n}">+${n}</button>`).join('')} <button class="btn mini" id="r-dv-pause"></button></p>
    <form class="dv-form" id="r-dv-grant" data-can="act"><span class="lab">GRANT</span>
      <select id="r-dv-what" aria-label="What to grant"></select>
      <input id="r-dv-amt" type="number" value="10000" class="w5" aria-label="Amount (negative takes)">
      <input id="r-dv-at" placeholder="r:s:h (you)" class="w5" aria-label="House address (empty: yours)">
      <button class="btn mini primary">GRANT</button></form>
    <form class="dv-form" id="r-dv-prot" data-can="act"><span class="lab">PROTECT</span>
      <input id="r-dv-pt" type="number" value="24" min="0" class="w4" aria-label="Ticks (0 ends it)"> ticks
      <input id="r-dv-pat" placeholder="r:s:h (you)" class="w5" aria-label="House address">
      <button class="btn mini">SET</button></form>
    <form class="dv-form" id="r-dv-war" data-can="act"><span class="lab">WAR</span>
      <input id="r-dv-wa" placeholder="r:s" class="w4" aria-label="First state"> vs <input id="r-dv-wb" placeholder="r:s" class="w4" aria-label="Second state">
      <button class="btn mini danger" data-war>START</button> <button type="button" class="btn mini" data-peace>PEACE (first)</button></form>
    <form class="dv-form" id="r-dv-as" data-can="inspect"><span class="lab">HOUSE</span>
      <input id="r-dv-as-at" placeholder="r:s:h" class="w5" aria-label="House address">
      <button class="btn mini" data-play data-can="play_as">PLAY AS</button> <button type="button" class="btn mini" data-inspect>INSPECT</button>
      <button type="button" class="btn mini" data-mute data-can="chat">MUTE 60m</button> <button type="button" class="btn mini" data-unmute data-can="chat">UNMUTE</button></form>
    <p class="row" data-can="audit"><span class="lab">AUDIT</span><button type="button" class="btn mini" data-audit>SHOW LATEST</button></p>
    <pre class="dv-out" id="r-dv-out" hidden></pre>
    <p class="dim small">Chat: /dev ticks 24 · /dev pause · /dev resume · /dev grant gold 5000 [r:s:h] · /dev protect 24 [r:s:h] · /dev war 1:1 2:1 · /dev peace 1:1 · /dev as r:s:h · /dev inspect r:s:h</p>`;
  root.querySelector('.room').append(panel);
  const $ = (id) => panel.querySelector(`#r-dv-${id}`);
  // Only what this account may do (everything in dev mode).
  const can = new Set(st.can || []);
  panel.querySelectorAll('[data-can]').forEach((el) => { el.hidden = !can.has(el.dataset.can); });
  panel.querySelectorAll('[data-adv]').forEach((b) => { b.hidden = !can.has('advance'); });
  if (st.mode === 'live') noteOf = () => $('note')?.value.trim() || undefined;

  async function refresh() {
    try { st = await dev.status(); } catch { return; }
    $('st').textContent = `tick ${fmt(st.tick)} · ${st.paused ? 'PAUSED' : 'running'}`;
    $('pause').textContent = st.paused ? 'RESUME' : 'PAUSE';
    panel.querySelectorAll('[data-adv]').forEach((b) => { b.disabled = st.paused; b.title = st.paused ? 'resume first' : ''; });
  }
  function fillGoods() {
    const v = $('what').value;
    $('what').innerHTML = goods().map(([k, label]) => `<option value="${esc(k)}">${esc(label)}</option>`).join('');
    if (v) $('what').value = v;
  }
  const open = (yes = panel.hidden) => {
    panel.hidden = !yes;
    btn.setAttribute('aria-expanded', String(yes));
    if (yes) { fillGoods(); refresh(); }
  };
  on(btn, 'click', () => open());
  on(panel, 'click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.matches('[data-close]')) return open(false);
    if (b.dataset.adv) { b.disabled = true; await dev.advance(b.dataset.adv); return refresh(); }
    if (b.id === 'r-dv-pause') { await (st.paused ? dev.resume() : dev.pause()); return refresh(); }
    if (b.matches('[data-peace]')) { ev.preventDefault(); return dev.peace($('wa').value); }
    if (b.matches('[data-mute]') || b.matches('[data-unmute]')) {
      ev.preventDefault();
      const h = await houseAt($('as-at').value).catch((e) => { say(e.message, 'bad'); return null; });
      if (h) act(() => api('/dev/chat/mute', { house: h.id, minutes: b.matches('[data-mute]') ? 60 : 0, note: noteOf() }), b.matches('[data-mute]') ? `${h.name} is kept out of chat for an hour.` : `${h.name} may chat again.`);
      return;
    }
    if (b.matches('[data-audit]')) {
      try {
        const log = await api('/dev/audit?limit=30');
        $('out').hidden = false;
        $('out').textContent = log.map((e) => `${new Date(e.at).toISOString().slice(0, 16)} ${e.email || e.account} (${e.role}) ${e.action} ${e.target}${e.note ? ` — ${e.note}` : ''}`).join('\n') || 'No staff actions yet.';
      } catch (e) { say(`Staff: ${e.message}`, 'bad'); }
      return;
    }
    if (b.matches('[data-inspect]')) {
      ev.preventDefault();
      const h = await dev.inspect($('as-at').value);
      $('out').hidden = !h;
      if (h) $('out').textContent = JSON.stringify(h, null, 1);
    }
  });
  on($('grant'), 'submit', (ev) => { ev.preventDefault(); dev.grant($('what').value, $('amt').value, $('at').value); });
  on($('prot'), 'submit', (ev) => { ev.preventDefault(); dev.protect($('pt').value, $('pat').value); });
  on($('war'), 'submit', (ev) => { ev.preventDefault(); dev.war($('wa').value, $('wb').value); });
  on($('as'), 'submit', (ev) => { ev.preventDefault(); dev.playAs($('as-at').value).then((o) => { if (o) location.reload(); }); });
  on(document, 'keydown', (ev) => {
    if (ev.key !== 'd' && ev.key !== 'D') return;
    const t = ev.target;
    if (ev.ctrlKey || ev.metaKey || ev.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
    if (document.querySelector('dialog[open]')) return;
    ev.preventDefault();
    open();
  });

  const unregister = commands.register('dev', {
    args: 'ticks N | pause | resume | grant WHAT N [r:s:h] | protect N [r:s:h] | war r:s r:s | peace r:s | as r:s:h | inspect r:s:h',
    help: 'dev mode: jump time, grant, protect, war and peace, play as or inspect a house',
    run: async (rest) => {
      const [op, ...a] = String(rest || '').trim().split(/\s+/);
      if (op === 'ticks') return dev.advance(a[0] || 1);
      if (op === 'pause') return dev.pause();
      if (op === 'resume') return dev.resume();
      if (op === 'grant') return dev.grant(a[0], a[1], a[2]);
      if (op === 'protect') return dev.protect(a[0], a[1]);
      if (op === 'war') return dev.war(a[0], a[1]);
      if (op === 'peace') return dev.peace(a[0]);
      if (op === 'as') return dev.playAs(a[0]).then((o) => { if (o) location.reload(); });
      if (op === 'inspect') {
        const h = await dev.inspect(a[0]);
        if (h) { open(true); $('out').hidden = false; $('out').textContent = JSON.stringify(h, null, 1); }
        return h;
      }
      say('Dev: /dev ticks N | pause | resume | grant WHAT N [r:s:h] | protect N [r:s:h] | war r:s r:s | peace r:s | as r:s:h | inspect r:s:h', 'bad');
      return null;
    },
  });
  return () => { unregister(); btn.remove(); panel.remove(); };
}
