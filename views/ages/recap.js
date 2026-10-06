// The recap: an age replayed. States race by land (or might, or war points) over the snapshots
// the server took evenly through the age; wars are marked on the timeline and listed; the ten
// largest houses of the moment show underneath. Plain DOM: rows keep their elements and only move
// (transform), so it stays smooth on a phone. With reduced motion it never plays by itself and
// steps whole snapshots without sliding.
import { store } from '../../core/store.js';
import { esc, fmt, fullTime } from '../../core/words.js';

/** px per bar row: on a phone the name sits over its bar (see ages.css), so rows are taller. */
const rowH = () => (matchMedia('(max-width: 719px)').matches ? 36 : 26);
const SHOW = 12;          // bars shown
const METRICS = { land: [2, 'LAND', 'acres'], might: [3, 'MIGHT', 'might'], war: [4, 'WAR POINTS', 'war points'] };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** A state's hue, the same all age (and every age): spread round the wheel by the golden angle, so neighbouring states differ. */
export const stateHue = (r, s) => Math.round((((r - 1) * 16 + (s - 1)) * 137.508) % 360);
const k = (r, s) => `${r}:${s}`;

/** Names from a recap: state "Name", realm "Name", house {name, realm, state}. */
export function namer(rc) {
  const n = rc?.names || {};
  return {
    state: (r, s) => n.states?.[k(r, s)] || `State ${k(r, s)}`,
    realm: (r) => n.realms?.[r - 1] || `Realm ${r}`,
    house: (id) => n.houses?.[String(id)] || null,
  };
}

const END = { withdrawal: 'withdrawal', peace: 'peace', age_end: 'the age\'s end' };

/**
 * Mounts the recap into `el`. Returns { show(rc, { live, mine }), stop() }: show draws a recap
 * (from GET /age/recap or /ages/n/recap); `live` keeps the place when the same age is shown again
 * with more snapshots; `mine` is {realm, state, house} to highlight (the current age only).
 */
export function mountRecap(el) {
  el.innerHTML = `
    <div class="rc-ctl">
      <button type="button" class="btn primary" id="rc-play" aria-pressed="false">PLAY</button>
      <label>SPEED <select id="rc-speed"><option value="2">½×</option><option value="5" selected>1×</option><option value="10">2×</option><option value="25">5×</option></select></label>
      <label>BY <select id="rc-metric">${Object.entries(METRICS).map(([v, [, l]]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <span class="rc-when" id="rc-when"></span>
    </div>
    <div class="rc-scrub">
      <div class="rc-marks" id="rc-marks" aria-hidden="true"></div>
      <input type="range" id="rc-pos" min="0" max="0" step="1" value="0" aria-label="Moment in the age (arrow keys step one snapshot; Home and End jump)">
      <div class="rc-ends dim small" aria-hidden="true"><span id="rc-t0"></span><span id="rc-t1"></span></div>
    </div>
    <ol class="rc-race" id="rc-race" aria-label="States by land"></ol>
    <p class="dim small rc-legend" id="rc-legend"></p>
    <div class="dgrid rc-below">
      <section><h3 class="sub">LARGEST HOUSES <span class="dim" id="rc-h-at"></span></h3><div class="scrollx"><table class="tbl" id="rc-houses"></table></div></section>
      <section><h3 class="sub">WARS <span class="dim" id="rc-w-n"></span></h3><ol class="rc-wars" id="rc-wars"></ol></section>
    </div>`;
  const $ = (id) => el.querySelector(`#rc-${id}`);
  let rc = null, nm = null, mine = null;
  let frames = [], maps = [];
  let pos = 0, playing = false, raf = 0, last = 0;
  let shownFrame = -1;
  const rows = new Map(); // "r:s" -> li

  // ---------- drawing ----------
  const metric = () => METRICS[$('metric').value] || METRICS.land;
  const lastTick = () => (frames.length ? frames[frames.length - 1].tick : 1) || 1;
  function at(p) {
    // Values at a (fractional) position: between two snapshots, slide (unless reduced motion).
    const i = Math.min(frames.length - 1, Math.max(0, Math.floor(p)));
    const f = reduced() ? 0 : Math.min(1, Math.max(0, p - i));
    const a = maps[i], b = maps[Math.min(frames.length - 1, i + 1)];
    const col = metric()[0];
    const out = [];
    for (const [key, row] of a) {
      const v0 = row[col], v1 = b.get(key)?.[col] ?? v0;
      out.push([key, row[0], row[1], v0 + (v1 - v0) * f]);
    }
    for (const [key, row] of b) if (!a.has(key) && f > 0) out.push([key, row[0], row[1], row[col] * f]);
    return out.sort((x, y) => y[3] - x[3] || x[1] - y[1] || x[2] - y[2]);
  }
  function rowEl(key, r, s) {
    let li = rows.get(key);
    if (li) return li;
    li = document.createElement('li');
    li.className = 'rc-row';
    li.style.setProperty('--h', stateHue(r, s));
    const self = mine && mine.realm === r && mine.state === s;
    if (self) li.classList.add('self');
    li.innerHTML = `<span class="rc-n num"></span><span class="rc-lab" title="${esc(nm.state(r, s))} (${key}) · ${esc(nm.realm(r))}">${self ? '<span class="rc-me" aria-label="your state">◆</span> ' : ''}${esc(nm.state(r, s))} <span class="dim">${key}</span></span><span class="rc-track"><span class="rc-bar"></span></span><span class="rc-v num"></span>`;
    $('race').append(li);
    rows.set(key, li);
    return li;
  }
  function draw() {
    if (!frames.length) return;
    const list = at(pos);
    const top = list.slice(0, SHOW);
    const max = Math.max(1, top[0]?.[3] || 0);
    const row = rowH();
    const on = new Set();
    top.forEach(([key, r, s, v], i) => {
      const li = rowEl(key, r, s);
      on.add(key);
      li.hidden = false;
      li.style.transform = `translateY(${i * row}px)`;
      li.querySelector('.rc-n').textContent = String(i + 1);
      li.querySelector('.rc-bar').style.transform = `scaleX(${Math.max(0, v / max)})`;
      li.querySelector('.rc-v').textContent = fmt(Math.round(v));
      li.setAttribute('aria-setsize', String(top.length));
      li.setAttribute('aria-posinset', String(i + 1));
      li.style.order = String(i); // reading order follows rank
    });
    for (const [key, li] of rows) if (!on.has(key)) li.hidden = true;
    $('race').style.height = `${Math.max(1, top.length) * row}px`;
    const fi = Math.min(frames.length - 1, Math.max(0, reduced() ? Math.floor(pos) : Math.round(pos)));
    if (fi !== shownFrame) frameChanged(fi);
  }
  /** Things that change by whole snapshot: the time line, the houses, the wars under way. */
  function frameChanged(fi) {
    shownFrame = fi;
    const f = frames[fi];
    const [, label, unit] = metric();
    const when = `T ${fmt(f.tick)}${rc.age_ticks ? `/${fmt(rc.age_ticks)}` : ''} · ${fullTime(f.at)}`;
    $('when').textContent = when;
    $('pos').value = String(fi);
    $('pos').setAttribute('aria-valuetext', `Tick ${f.tick}, ${fullTime(f.at)} (snapshot ${fi + 1} of ${frames.length})`);
    $('race').setAttribute('aria-label', `States by ${label.toLowerCase()} at tick ${f.tick} (top ${SHOW}, ${unit})`);
    $('h-at').textContent = `at T ${fmt(f.tick)}`;
    const hs = f.houses || [];
    $('houses').innerHTML = '<tr><th class="num">#</th><th>HOUSE</th><th>STATE</th><th class="num">LAND</th></tr>'
      + (hs.length ? hs.map(([id, land], i) => {
        const h = nm.house(id);
        const self = mine?.house != null && mine.house === id;
        return `<tr class="${self ? 'self' : ''}"><td class="num dim">${i + 1}</td><td class="name">${esc(h?.name || `House ${id}`)}</td><td class="dim">${h ? `<span class="vc-sn">${esc(nm.state(h.realm, h.state))} </span>${h.realm}:${h.state}` : ''}</td><td class="num">${fmt(land)}</td></tr>`;
      }).join('') : '<tr><td colspan="4" class="dim">No houses in this snapshot.</td></tr>');
    el.querySelectorAll('#rc-wars li').forEach((li) => {
      const s = Number(li.dataset.s), e = li.dataset.e === '' ? Infinity : Number(li.dataset.e);
      li.classList.toggle('on', s <= f.tick && f.tick < e);
    });
    const under = el.querySelectorAll('#rc-wars li.on').length;
    $('w-n').textContent = `${fmt((rc.wars || []).length)} in all${under ? ` · ${under} under way at T ${fmt(f.tick)}` : ''}`;
  }

  function drawStatic() {
    const lt = lastTick();
    $('pos').max = String(Math.max(0, frames.length - 1));
    $('pos').disabled = frames.length < 2;
    $('play').disabled = frames.length < 2;
    $('t0').textContent = frames.length ? `T ${fmt(frames[0].tick)}` : '';
    $('t1').textContent = frames.length ? `T ${fmt(lt)}${rc.ended ? ' · end' : ' · now'}` : '';
    const wars = (rc.wars || []).slice().sort((a, b) => a.started_tick - b.started_tick);
    const side = (x) => `${esc(nm.state(x.realm, x.state))} <span class="dim">${x.realm}:${x.state}</span>`;
    // Marks on the timeline: a war starting (up) and ending (down), at its tick.
    const pct = (t) => `${Math.min(100, Math.max(0, (100 * t) / lt)).toFixed(2)}%`;
    $('marks').innerHTML = wars.map((w) => `<i class="rc-m s" style="left:${pct(w.started_tick)}" title="War starts T${w.started_tick}"></i>`
      + (w.ended_tick != null ? `<i class="rc-m e" style="left:${pct(w.ended_tick)}"></i>` : '')).join('');
    $('wars').innerHTML = wars.length ? wars.map((w) => {
      const won = w.winner ? `${esc(nm.state(w.winner.realm, w.winner.state))} won` : w.ended_tick != null ? 'no winner' : '';
      return `<li data-s="${w.started_tick}" data-e="${w.ended_tick ?? ''}">`
        + `<button type="button" class="btn mini" data-seek="${w.started_tick}" aria-label="Go to tick ${w.started_tick}, when this war started">T${fmt(w.started_tick)}</button> `
        + `<span>${side(w.a)} <b class="rc-vs">vs</b> ${side(w.b)}${w.kind ? ` <span class="dim">· ${esc(String(w.kind).replace(/_/g, ' '))}</span>` : ''}`
        + `<br><span class="dim small">${w.ended_tick != null ? `ended T${fmt(w.ended_tick)}${w.end ? ` by ${esc(END[w.end] || w.end)}` : ''}${won ? ` · ${won}` : ''}` : 'still under way'}</span></span>`
        + (w.ended_tick != null ? ` <button type="button" class="btn mini" data-seek="${w.ended_tick}" aria-label="Go to tick ${w.ended_tick}, when this war ended">END</button>` : '')
        + '</li>';
    }).join('') : '<li class="dim">No wars this age.</li>';
    $('legend').textContent = frames.length ? 'Each state keeps its colour all age. An address is realm:state; hover a name for its realm.' : '';
  }

  // ---------- playback ----------
  function setPlaying(on) {
    playing = on && frames.length > 1;
    $('play').setAttribute('aria-pressed', String(playing));
    $('play').textContent = playing ? 'PAUSE' : 'PLAY';
    el.classList.toggle('playing', playing);
    cancelAnimationFrame(raf);
    if (!playing) { pos = reduced() ? Math.floor(pos) : pos; draw(); return; }
    if (pos >= frames.length - 1) pos = 0;
    last = performance.now();
    raf = requestAnimationFrame(step);
  }
  function step(now) {
    if (!playing || !el.isConnected) return;
    const fps = Number($('speed').value) || 5;
    pos += ((now - last) / 1000) * fps;
    last = now;
    if (pos >= frames.length - 1) { pos = frames.length - 1; draw(); setPlaying(false); return; }
    draw();
    raf = requestAnimationFrame(step);
  }
  function seekTick(t) {
    // The last snapshot at or before tick t.
    let i = 0;
    while (i + 1 < frames.length && frames[i + 1].tick <= t) i++;
    setPlaying(false);
    pos = i;
    draw();
  }

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'rc-play') setPlaying(!playing);
    else if (b.dataset.seek) { seekTick(Number(b.dataset.seek)); $('pos').focus(); }
  });
  $('pos').addEventListener('input', () => { setPlaying(false); pos = Number($('pos').value); draw(); });
  $('metric').addEventListener('change', () => { shownFrame = -1; draw(); });
  // Space on the timeline plays and pauses (it otherwise does nothing there).
  $('pos').addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'k') { ev.preventDefault(); setPlaying(!playing); } });

  return {
    show(data, { live = false, me = null } = {}) {
      const same = live && rc && rc.age === data.age;
      const wasEnd = !same || pos >= frames.length - 1;
      rc = data; nm = namer(data); mine = me;
      frames = data.frames || [];
      maps = frames.map((f) => new Map(f.states.map((x) => [k(x[0], x[1]), x])));
      if (!same) { rows.clear(); $('race').replaceChildren(); }
      $('race').querySelector('.rc-none')?.remove();
      shownFrame = -1;
      el.classList.toggle('empty', !frames.length);
      drawStatic();
      if (!frames.length) {
        setPlaying(false);
        $('when').textContent = '';
        $('race').style.height = 'auto';
        $('race').innerHTML = `<li class="dim rc-none">No snapshots yet: ${data.ticks ? 'the first is taken a little into the age' : 'they start when the age does'}.</li>`;
        $('houses').innerHTML = '';
        $('h-at').textContent = '';
        return;
      }
      if (same) { if (wasEnd && !playing) pos = frames.length - 1; draw(); return; }
      // A new recap: play it from the start, unless the viewer asked for less motion.
      if (reduced()) { pos = frames.length - 1; draw(); setPlaying(false); } else { pos = 0; draw(); setPlaying(true); }
    },
    stop() { setPlaying(false); },
  };
}
