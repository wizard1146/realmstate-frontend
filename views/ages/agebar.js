// The age bar: one line under the War Room's bar (or over the gate) saying where the age stands.
// Before the start: a countdown, and that only founding is open. While it runs: its name, the tick
// and the time left. Once it has ended: the winner, the results, and the next age's countdown if
// staff have planned it. Its buttons open the ages window (views/ages/ages.js).
import { store, subscribe, nextTickAt, tickMs, loadAge } from '../../core/store.js';
import { esc, fmt, fullTime } from '../../core/words.js';
import { ageName, hasAges, started, span, roughSpan, recap } from '../../core/ages.js';
import { namer } from './recap.js';

/** The state's name as the server gave it in a result row, or its address. */
const stateLabel = (w) => (w ? `${w.name ? `${w.name} ` : ''}${w.realm}:${w.state}` : '');

/** Mounts the bar into `el`; open(tab) opens the ages window. Returns { update }. */
export function mountAgeBar(el, open) {
  let key = '';
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ages]');
    if (b) open(b.dataset.ages);
  });

  function html(a) {
    const name = `<b>${esc(ageName(a).toUpperCase())}</b>`;
    const btn = (tab, label, title) => `<button type="button" class="btn mini" data-ages="${tab}" title="${esc(title)}">${label}</button>`;
    const recapBtn = btn('recap', 'RECAP', 'Watch the age so far: states by land over time, and its wars');
    if (!started(a)) {
      return `<span class="ab-k pre">BEFORE THE START</span><span class="ab-cell">${name}</span>`
        + `<span class="ab-cell">STARTS IN <b class="num" data-cd="${a.started_at}"></b></span>`
        + '<span class="ab-cell ab-note">Only founding is open: found your house now; orders open at the start.</span>'
        + `<span class="ab-btns">${btn('now', 'AGE', 'The age: when it starts, how long it runs')}</span>`;
    }
    if (a.ended) {
      const w = a.result?.winner;
      const n = a.next;
      return `<span class="ab-k end">ENDED</span><span class="ab-cell">${name} has ended</span>`
        + (w ? `<span class="ab-cell">WINNER <b data-winner></b></span>` : '')
        + (n ? `<span class="ab-cell">NEXT: <b>${esc(n.name || `Age ${n.age}`)}</b> ${n.start_at > Date.now() ? `IN <b class="num" data-cd="${n.start_at}"></b>` : 'opening soon'}</span>`
          : '<span class="ab-cell ab-note">The next age isn\'t planned yet.</span>')
        + `<span class="ab-btns">${btn('results', 'RESULTS', 'The victory window: winner and leaderboards')}${hasAges() ? recapBtn : ''}</span>`;
    }
    // A server without names calls the age "Age N": the label already says that.
    const named = a.name && a.name !== `Age ${a.age}`;
    return `<span class="ab-k">AGE ${fmt(a.age)}</span>${named ? `<span class="ab-cell">${name}</span>` : ''}`
      + `<span class="ab-cell">TICK <b class="num" data-tick></b><span class="dim">/${fmt(a.age_ticks)}</span></span>`
      + '<span class="ab-cell"><b class="num" data-left></b> <span class="dim">LEFT</span></span>'
      + `<span class="ab-btns">${hasAges() ? recapBtn : ''}${btn('now', 'AGE', 'The age: when it started, how long it runs')}</span>`;
  }

  /** The numbers that move every second. */
  function tick() {
    const a = store.age;
    el.querySelectorAll('[data-cd]').forEach((b) => {
      const at = Number(b.dataset.cd);
      b.textContent = span(at - Date.now());
      b.title = `At ${fullTime(at)}`;
    });
    const t = el.querySelector('[data-tick]');
    if (t) t.textContent = fmt(store.tick);
    const l = el.querySelector('[data-left]');
    if (l && a) {
      // Time left: the ticks to go at the age's tick length, from the next tick (≈: a pause stretches it).
      const left = Math.max(0, a.age_ticks - store.tick);
      const nx = nextTickAt();
      const end = left > 0 ? (nx || Date.now()) + (left - 1) * tickMs() : Date.now();
      l.textContent = left > 0 ? `≈${roughSpan(end - Date.now())}` : 'LAST TICK';
      l.title = left > 0 ? `${fmt(left)} ticks to go; about ${fullTime(end)}` : '';
    }
  }

  function update() {
    const a = store.age;
    el.hidden = !a;
    if (!a) return;
    const k = JSON.stringify([started(a), a.age, a.name, a.ended, a.next, a.started_at, a.age_ticks, !!a.result?.winner, hasAges()]);
    if (k !== key) {
      key = k;
      el.dataset.phase = !started(a) ? 'pre' : a.ended ? 'ended' : 'running';
      el.innerHTML = html(a);
      const w = el.querySelector('[data-winner]');
      if (w) {
        const win = a.result.winner;
        // The result's state rows carry names; an older server's don't, so ask the recap then.
        const row = (a.result.states || []).find((x) => x.state?.realm === win.realm && x.state?.state === win.state);
        w.textContent = stateLabel(row?.name ? { ...win, name: row.name } : win);
        if (!row?.name && hasAges()) recap(a.age).then((rc) => { if (rc && w.isConnected) w.textContent = stateLabel({ ...win, name: namer(rc).state(win.realm, win.state) }); }).catch(() => {});
      }
    }
    tick();
  }

  subscribe((c) => {
    if (c.has('age') || c.has('timemode')) update();
    else if (c.has('clock')) {
      // The start passing changes the line itself (a countdown turns into the running age).
      if (store.age && el.dataset.phase === 'pre' && started(store.age)) { update(); setTimeout(loadAge, 1500); } else tick();
    }
  });
  update();
  return { update };
}
