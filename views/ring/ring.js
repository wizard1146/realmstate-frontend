// The War Ring: the world's politics at a glance. The 13 realms sit around a circle; each state is a segment reaching
// out by its land (or might, or renown); lines across show wars (red), ceasefires (dashed violet) and how your state
// and others feel about each other (amber; only your state's, as the game keeps the rest between the two states).
// Hovering or focusing a state lights its lines and names it in the centre; clicking opens it in the panel beside the
// ring, which otherwise shows the world: wars, ceasefires, war points and a live feed. Houses and a war's history
// open in a window. Everything is public (/realms, /wars) except your own state's /relations.
// Live: each tick off the socket reloads the world; new wars and ceasefires are announced, and states that grew or
// shrank flash once.
// Acting: every command the game takes opens in the action window over the ring (modal.js, acts/*.js), from the
// dock under the ring (by group), the command bar (/: type an action, a state, a house, an order with its numbers),
// or wherever its context is (a state's panel: war and peace; your target: attack, thieves, rites). While a window
// is open the ring behind previews the move (a march from your state to theirs). Your house tab (H) is the live
// status board. The ring can be resized (drag the divider; collapse the panel) and zoomed and panned.
// The ring imports core/ only.
import { store, subscribe, setTarget, say, loadStateMembers, loadWars, loadRelations, countdown, raceName, persName, isProtected, findHouse } from '../../core/store.js';
import { declareWhy } from '../../core/relations.js';
import { isLeader, leaderWhy } from '../../core/truths.js';
import * as act from '../../core/actions.js';
import { api } from '../../core/api.js';
import { fmt, esc, addr } from '../../core/words.js';
import { WIKI } from '../../core/wiki.js';
import { switchHTML } from '../../core/viewswitch.js';
import { world, useWorld, states, stateOf, stateName, realmName, total } from '../../core/world.js';
import { W, C, R1, pt, layout, reach, sector, arc, chord, labelAt } from './geometry.js';
import { mountConsole } from './console.js';
import { makeModal, blockOf } from './modal.js';
import { GROUPS, actById } from './acts/index.js';

const KEY = 'realmstate.ring';
const SIZES = [['land', 'Land'], ['might', 'Might'], ['renown', 'Renown']];
const SHOWS = [['wars', 'Wars'], ['cease', 'Ceasefires'], ['feel', 'Our feelings']];
const MATS = new Set(['bauxite', 'limestone', 'amber', 'pine', 'sulfur', 'paper']);
const UNIT = { land: 'acres', might: 'might', renown: 'renown' };
const wiki = (page, label) => `<a class="rg-wiki" href="${WIKI}${page}" target="_blank" rel="noopener">${label}<span aria-hidden="true"> ↗</span><span class="vh"> (wiki, new tab)</span></a>`;
const key = (s) => `${s.realm}:${s.state}`;
const same = (a, b) => !!a && !!b && a.realm === b.realm && a.state === b.state;
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');
/** The resource line: [label, value of the house, the quick order it opens in the House tab (x explore, b build, t train)]. */
const RES = [['Land', (h) => fmt(h.land) + (h.incoming_land ? ` <span class="dim">+${fmt(h.incoming_land)}</span>` : ''), 'x'], ['Peasants', (h) => fmt(h.peasants), 'b'],
  ['Gold', (h) => fmt(h.gold), 'b'], ['Food', (h) => fmt(h.food), 'b'], ['Soldiers', (h) => fmt(h.units[0]), 't'], ['Might', (h) => fmt(h.might), 't'], ['Renown', (h) => fmt(h.renown), '']];
const PTABS = [['ring', 'Ring'], ['house', 'Your house']];
const KIND = (k) => (k === 'general' ? 'Between realms' : 'Intra-realm');

// The live feed outlives the view (switching away and back keeps it), until the page reloads.
const feed = [];
let seenWars = null, seenCease = null, summedTick = -1;

export function mount(root) {
  fonts();
  const P = store.rules.params, REALMS = P.realms, PER = P.states_per_realm, SEATS = P.houses_per_state;
  const geo = layout(REALMS, PER);
  let size = 'land', shows = new Set(['wars', 'cease', 'feel']);
  try { const s = JSON.parse(localStorage.getItem(KEY)) || {}; if (SIZES.some(([k]) => k === s.size)) size = s.size; if (Array.isArray(s.shows)) shows = new Set(s.shows.filter((x) => SHOWS.some(([k]) => k === x))); } catch { /* storage off */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ size, shows: [...shows] })); } catch { /* storage off */ } };
  let panel = { kind: 'world' }, hot = null, roving = null, flashedTick = world.tick;
  const mine = () => (store.house ? { realm: store.house.realm, state: store.house.state } : null);

  root.innerHTML = `<div class="ring">
  <header class="rg-hud">
    <span class="rg-brand"><span class="rg-ban">Hegemoney:</span> Realmstate <span class="rg-view">War Ring</span></span>
    <span class="rg-who" id="rg-who"></span>
    <span class="rg-tick"><span class="sc">Tick</span> <b id="rg-tick" class="num">–</b> <span class="sep">·</span> <span class="sc">next</span> <b id="rg-next" class="num">–</b></span>
    <span class="rg-live" id="rg-live" role="status" aria-live="polite"><i aria-hidden="true"></i><span id="rg-live-t">Off</span></span>
    <span class="rg-end"><button type="button" class="rg-btn" id="rg-house" aria-controls="rg-p-house" title="Your house: your target, orders, what's under way (H)">Your house <kbd>H</kbd></button>${switchHTML('ring')}<button type="button" class="rg-btn ghost" id="rg-out">Sign out</button></span>
  </header>
  <dl class="rg-res" id="rg-res" aria-label="Your house at a glance (each opens its page)"></dl>
  <main class="rg-main">
    <section class="rg-stage" aria-labelledby="rg-h">
      <h1 class="vh" id="rg-h">War Ring</h1>
      <div class="rg-tools" role="toolbar" aria-label="Ring controls">
        <span class="rg-grp"><span class="rg-gl" id="rg-size-l">Size by</span><span class="rg-seg" role="radiogroup" aria-labelledby="rg-size-l">${SIZES.map(([k, label]) =>
          `<button type="button" role="radio" data-size="${k}">${label}</button>`).join('')}</span></span>
        <span class="rg-grp"><span class="rg-gl" id="rg-show-l">Show</span><span class="rg-seg" role="group" aria-labelledby="rg-show-l">${SHOWS.map(([k, label]) =>
          `<button type="button" data-show="${k}"><i class="sw sw-${k}" aria-hidden="true"></i>${label}</button>`).join('')}</span></span>
        <span class="rg-grp rg-zoom" role="group" aria-label="Zoom the ring"><button type="button" class="rg-zb" data-zoom="-1" aria-label="Zoom out" title="Zoom out (−)">−</button><span class="rg-zv" id="rg-zv" aria-live="polite">100%</span><button type="button" class="rg-zb" data-zoom="1" aria-label="Zoom in" title="Zoom in (+)">+</button><button type="button" class="rg-zb wide" data-zoom="0" title="The whole ring (0)">Fit</button></span>
        <form class="rg-find" id="rg-find" novalidate><label for="rg-faddr" class="rg-gl">Find</label>
          <input id="rg-faddr" placeholder="r:s" inputmode="numeric" autocomplete="off" spellcheck="false" title="A state's address, such as 4:2 (a space types the colon). F jumps here.">
          <button class="rg-btn">Go</button></form>
      </div>
      <div class="rg-canvas"><svg id="rg-svg" viewBox="-70 -10 ${W + 140} ${W + 20}" role="group" aria-label="The ring: ${REALMS} realms of ${PER} states. Arrow keys move between states; Enter opens one."></svg></div>
      <nav class="rg-dock" aria-label="Act">${GROUPS.map(([g, label, glyph, what], i) => `<button type="button" data-dock="${g}" title="${esc(label)}: ${esc(what)} (Alt+${i + 1})"><span class="g" aria-hidden="true">${glyph}</span><span class="l">${esc(label)}</span></button>`).join('')}
        <button type="button" class="cmd" data-dock-bar title="Every action, a state or a house, by name (/)"><span class="g" aria-hidden="true">⌕</span><span class="l">Command</span><kbd>/</kbd></button></nav>
      <p class="rg-foot"><span class="rg-legend" aria-hidden="true"><span><i class="lg lg-mine"></i>your state</span><span><i class="lg lg-war"></i>at war</span><span><i class="lg lg-cease"></i>ceasefire</span><span><i class="lg lg-feel"></i>feelings</span><span><i class="lg lg-empty"></i>no houses</span></span>
        <span class="rg-keys"><kbd>←</kbd><kbd>→</kbd> states · <kbd>↑</kbd><kbd>↓</kbd> realms · <kbd>Enter</kbd> open · <kbd>Esc</kbd> back · <kbd>F</kbd> find · <kbd>H</kbd> your house · <kbd>/</kbd> command · <kbd>+</kbd><kbd>−</kbd> zoom</span></p>
    </section>
    <div class="rg-split" id="rg-split" role="separator" aria-orientation="vertical" aria-controls="rg-aside" aria-label="Divider between the ring and the panel (arrow keys resize; Enter hides or shows the panel)" tabindex="0" title="Drag to resize · double-click to reset · Enter hides the panel"><span aria-hidden="true"></span></div>
    <aside class="rg-panel" id="rg-aside" aria-label="Details">
      <div class="rg-ptabs" role="tablist" aria-label="Panel">${PTABS.map(([k, label]) => `<button type="button" role="tab" id="rg-pt-${k}" aria-controls="rg-p-${k}" data-ptab="${k}">${label}</button>`).join('')}<button type="button" class="rg-hide" id="rg-hide" aria-label="Hide the panel: the ring fills the window" title="Hide the panel (the ring fills the window)">⟩</button></div>
      <div role="tabpanel" id="rg-p-ring" aria-labelledby="rg-pt-ring"><div id="rg-panel" class="rg-panel" aria-live="polite"></div></div>
      <div role="tabpanel" id="rg-p-house" aria-labelledby="rg-pt-house" hidden></div>
    </aside>
    <button type="button" class="rg-showp" id="rg-showp" aria-label="Show the panel" title="Show the panel" hidden>⟨ Panel</button>
  </main>
  <dialog class="rg-dlg" id="rg-dlg" aria-labelledby="rg-dlg-h"><header><h2 id="rg-dlg-h"></h2><button type="button" class="x" data-close aria-label="Close (Esc)">×</button></header><div class="body" id="rg-dlg-b"></div></dialog>
</div>`;
  const $ = (id) => root.querySelector(`#rg-${id}`);
  const svg = $('svg'), pane = $('panel'), dlg = $('dlg');
  const ac = new AbortController();
  const on = (t, type, fn, o = {}) => t.addEventListener(type, fn, { signal: ac.signal, ...o });

  // ---------- reading the world ----------
  const wars = () => store.wars?.wars || [];
  const cfs = () => store.wars?.ceasefires || [];
  const warOf = (s) => wars().find((w) => same(w.a, s) || same(w.b, s)) || null;
  const cfOf = (s) => cfs().filter((c) => same(c.a, s) || same(c.b, s));
  const other = (x, s) => (same(x.a, s) ? x.b : x.a);
  const pointsOf = (s) => (store.wars?.points || []).find((p) => same(p.state, s))?.points || 0;
  /** Your state's relation with s (both ways), or null. */
  const relOf = (s) => (store.relations?.relations || []).find((r) => same(r.state, s)) || null;
  const delta = (s, k) => { const p = world.prev.get(key(s)); return p ? total(s, k) - p[k] : 0; };
  const sName = (s) => esc(stateName(s.realm, s.state));
  const stLink = (s) => `<button type="button" class="rg-link" data-open="${key(s)}">${sName(s)}</button> <span class="dim">${key(s)}</span>${same(s, mine()) ? ' <span class="rg-you">yours</span>' : ''}`;

  // ---------- the HUD ----------
  function hud() {
    const h = store.house;
    $('who').innerHTML = h ? `<b>${esc(h.name)}</b> <span class="dim">${addr(h)}</span>` : '';
    $('tick').textContent = fmt(store.tick);
    $('next').textContent = countdown() || '–';
    const live = store.live;
    $('live').dataset.live = live;
    $('live-t').textContent = live === 'on' ? 'Live' : live === 'connecting' ? 'Connecting' : 'Off: every minute';
    if (h) $('res').innerHTML = RES.map(([k, v, pg]) => `<div><dt>${k}</dt><dd>${pg ? `<button type="button" class="rg-rv" data-order="${pg}" title="${pg === 'x' ? 'Explore' : pg === 'b' ? 'Build' : 'Train'}, in Your house">${v(h)}</button>` : v(h)}</dd></div>`).join('')
      + (isProtected(h) ? `<div class="prot" title="Protected until tick ${fmt(h.protected_until)}: no one can attack you, and you can't attack."><dt>Protected</dt><dd>${fmt(h.protected_until - h.ticks_now)} ticks left</dd></div>` : '')
      + `<div class="rg-ident"><dd>${esc(raceName(h.race))}, ${esc(persName(h.personality))}</dd></div>`;
    $('live').title = live === 'on' ? 'Live: the ring redraws on every tick' : 'Not live: the ring reads the world every minute';
  }

  // ---------- the ring ----------
  function draw() {
    const all = states(), byKey = new Map(all.map((s) => [s.key, s])), me = mine();
    const max = Math.max(1, ...all.map((s) => total(s, size)));
    const relMax = Math.max(P.hostile_points || 1, ...(store.relations?.relations || []).map((r) => Math.max(r.they_feel.points, r.we_feel.points)));
    const flash = world.tick !== flashedTick && world.prev.size > 0;
    flashedTick = world.tick;
    const out = [];
    // Under each realm, a thin arc in its material's colour.
    out.push('<g class="rg-under" aria-hidden="true">');
    for (let r = 1; r <= REALMS; r++) {
      const g = geo.realm[r], m = world.realms.get(r)?.material || '';
      out.push(`<path class="rg-ul" data-mat="${esc(m)}" d="${arc(g.a0, g.a1, R1 - 12)}"/>`);
    }
    out.push('</g>');
    // The centre's disc goes under the lines (they cross it faintly); its words go on top, at the end.
    out.push(`<circle r="${R1 - 20}" cx="${C}" cy="${C}" class="rg-disc" aria-hidden="true"/>`);
    // Lines across: feelings first (beneath), then ceasefires, then wars on top.
    out.push('<g class="rg-lines" aria-hidden="true">');
    const line = (a, b, cls, data, w = '') => {
      const ga = geo.seg[key(a)], gb = geo.seg[key(b)];
      if (!ga || !gb) return;
      const d = chord(ga.mid, gb.mid);
      out.push(`<g class="ln ${cls}" data-a="${key(a)}" data-b="${key(b)}" ${data}><path class="hit" d="${d}"/><path class="vis" d="${d}"${w ? ` style="stroke-width:${w}"` : ''}/></g>`);
    };
    if (shows.has('feel') && me) for (const r of store.relations?.relations || []) {
      const pts = Math.max(r.they_feel.points, r.we_feel.points), worst = [r.they_feel.relation, r.we_feel.relation].includes('hostile') ? 'hostile' : [r.they_feel.relation, r.we_feel.relation].includes('unfriendly') ? 'unfriendly' : 'normal';
      if (pts > 0) line(me, r.state, `feel ${worst}`, `data-open-b="${key(r.state)}"`, (1 + 3.5 * Math.min(1, pts / relMax)).toFixed(1));
    }
    if (shows.has('cease')) for (const c of cfs()) line(c.a, c.b, 'cease', `data-open-b="${key(c.b)}"`);
    if (shows.has('wars')) for (const w of wars()) line(w.a, w.b, 'war', `data-war="${w.id}"`);
    out.push('</g>');
    // The states.
    const reachOf = {};
    out.push(`<g class="rg-segs">`);
    const caps = [];
    for (let r = 1; r <= REALMS; r++) for (let s = 1; s <= PER; s++) {
      const k = `${r}:${s}`, g = geo.seg[k], x = byKey.get(k) || { realm: r, state: s, houses: 0 }, v = total(x, size);
      const war = warOf(x), cf = cfOf(x).length, isMe = same(x, me);
      const d = flash ? delta(x, 'land') : 0;
      const cls = ['seg', isMe && 'me', !x.houses && 'empty', panel.kind === 'state' && panel.key === k && 'sel', d > 0 && 'up', d < 0 && 'down'].filter(Boolean).join(' ');
      const label = `${stateName(r, s)}, state ${k} of ${realmName(r)}. ${x.houses ? `${fmt(x.houses)} house${x.houses === 1 ? '' : 's'}, ${fmt(v)} ${UNIT[size]}` : 'No houses'}${war ? `. At war with ${stateName(other(war, x).realm, other(war, x).state)}` : ''}${cf ? '. Under ceasefire' : ''}${isMe ? '. Your state' : ''}.`;
      const len = reach(v, max);
      reachOf[k] = len;
      out.push(`<path class="${cls}" data-k="${k}" d="${sector(g.a0, g.a1, len)}" role="button" tabindex="${k === roving ? 0 : -1}" aria-label="${esc(label)}"/>`);
      // At war, or under ceasefire: a cap at the segment's tip (the lines across say with whom).
      if (war || cf) caps.push(`<path class="cap ${war ? 'war' : 'cease'}" data-cap="${k}" d="${sector(g.a0, g.a1, 6, R1 + len + 2)}"/>`);
    }
    out.push(`</g><g class="rg-caps" aria-hidden="true">${caps.join('')}`);
    // Your target: a ringed dot past its state's tip.
    const tg = store.target, tk = tg && `${tg.realm}:${tg.state}`;
    if (tk && geo.seg[tk]) { const [x, y] = pt(geo.seg[tk].mid, R1 + reachOf[tk] + 20); out.push(`<g class="tmark" data-cap="${tk}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" class="dot"/><title>Your target: ${esc(tg.name)} (${addr(tg)})</title></g>`); }
    out.push('</g>');
    // The realms' names.
    out.push('<g class="rg-labels">');
    for (let r = 1; r <= REALMS; r++) {
      const l = labelAt(geo.realm[r].mid), m = world.realms.get(r)?.material || '';
      out.push(`<text class="rg-rl" data-realm="${r}" x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}"><tspan class="n">${esc(realmName(r))}</tspan><tspan class="m" x="${l.x.toFixed(1)}" dy="1.25em">Realm ${r}${m ? ` · ${esc(m)}` : ''}</tspan></text>`);
    }
    out.push('</g>');
    // The centre: what's under the pointer or focus, else the world in two lines.
    out.push(`<g class="rg-core" aria-hidden="true"><circle r="${R1 * 0.42}" cx="${C}" cy="${C}" class="rg-veil"/>
      <text x="${C}" y="${C - 36}" text-anchor="middle" class="c1" id="rg-c1"></text><text x="${C}" y="${C + 2}" text-anchor="middle" class="c2" id="rg-c2"></text>
      <text x="${C}" y="${C + 34}" text-anchor="middle" class="c3" id="rg-c3"></text><text x="${C}" y="${C + 60}" text-anchor="middle" class="c3" id="rg-c4"></text></g>`);
    if (flash && !matchMedia('(prefers-reduced-motion: reduce)').matches) out.push(`<circle class="rg-ripple" cx="${C}" cy="${C}" r="${R1 - 20}" aria-hidden="true"/>`);
    const focused = document.activeElement?.closest?.('#rg-svg [data-k]')?.dataset.k;
    svg.innerHTML = out.join('');
    if (!roving || !svg.querySelector(`[data-k="${roving}"]`)) { roving = me ? key(me) : '1:1'; svg.querySelector(`[data-k="${roving}"]`)?.setAttribute('tabindex', '0'); }
    if (focused) svg.querySelector(`[data-k="${focused}"]`)?.focus({ preventScroll: true });
    if (hot && hot !== panel.key) light(hot); else rest();
    paintMarch();
  }

  /** With nothing under the pointer or focus, the ring lights what the panel shows: its state, its war, its realm. */
  function rest() {
    if (panel.kind === 'state') return light(panel.key);
    const l = panel.kind === 'war' && svg.querySelector(`.ln[data-war="${panel.id}"]`);
    if (l) return lightLine(l);
    light(null);
    if (panel.kind === 'realm') {
      svg.classList.add('lit');
      svg.querySelectorAll(`.seg[data-k^="${panel.realm}:"], .cap[data-cap^="${panel.realm}:"]`).forEach((e) => e.classList.add('hot'));
    }
  }
  /** Lights a state (its segment and its lines; the rest fade) and names it in the centre. null: the world. */
  function light(k) {
    hot = k;
    svg.classList.toggle('lit', !!k);
    svg.querySelectorAll('.hot').forEach((e) => e.classList.remove('hot'));
    const c = (id, t) => { const e = svg.querySelector(`#rg-${id}`); if (e) e.textContent = t; };
    if (!k) {
      const n = wars().length, m = cfs().length, occ = states().filter((s) => s.houses).length;
      c('c1', 'THE WORLD'); c('c2', `${n} war${n === 1 ? '' : 's'} · ${m} ceasefire${m === 1 ? '' : 's'}`);
      c('c3', `${occ} of ${REALMS * PER} states hold houses`); c('c4', `tick ${fmt(store.tick)}`);
      return;
    }
    svg.querySelectorAll(`[data-k="${k}"], [data-cap="${k}"]`).forEach((e) => e.classList.add('hot'));
    // Its lines, and the states at their other ends.
    svg.querySelectorAll(`.ln[data-a="${k}"], .ln[data-b="${k}"]`).forEach((e) => {
      e.classList.add('hot');
      const o = e.dataset.a === k ? e.dataset.b : e.dataset.a;
      svg.querySelectorAll(`[data-k="${o}"], [data-cap="${o}"]`).forEach((x) => x.classList.add('hot'));
    });
    const [r, s] = k.split(':').map(Number), x = stateOf(r, s) || { realm: r, state: s, houses: 0 }, war = warOf(x), rel = relOf(x), d = delta(x, size);
    c('c1', `${realmName(r).toUpperCase()} · ${k}`);
    c('c2', stateName(r, s));
    c('c3', x.houses ? `${fmt(total(x, size))} ${UNIT[size]}${d ? ` (${signed(d)} this tick)` : ''} · ${fmt(x.houses)} house${x.houses === 1 ? '' : 's'}` : 'no houses yet');
    c('c4', same(x, mine()) ? 'your state' : war ? `at war with ${stateName(other(war, x).realm, other(war, x).state)}` : cfOf(x).length ? 'under ceasefire' : rel ? `they feel ${rel.they_feel.relation} · we feel ${rel.we_feel.relation}` : '');
  }

  // ---------- the panel ----------
  function back() { return '<button type="button" class="rg-back" data-panel-world>‹ The world</button>'; }
  function facts(rows) { return `<dl class="rg-facts">${rows.filter(Boolean).map(([k, v, n]) => `<div><dt>${k}</dt><dd>${v}${n ? `<span class="n">${n}</span>` : ''}</dd></div>`).join('')}</dl>`; }
  const rank = (x, k) => (x.ranks?.[k] ? `#${x.ranks[k].rank} of ${x.ranks[k].of}` : '');

  function worldPanel() {
    const occ = states().filter((s) => s.houses), houses = occ.reduce((a, s) => a + s.houses, 0), pts = (store.wars?.points || []).filter((p) => p.points > 0).slice(0, 5);
    const age = store.age;
    return `<p class="rg-kick">${age ? `${esc(age.name || `Age ${fmt(age.age)}`)} · ` : ''}tick ${fmt(store.tick)}</p><h2>The world</h2>
      ${facts([['Wars', fmt(wars().length)], ['Ceasefires', fmt(cfs().length)], ['States with houses', fmt(occ.length), `of ${fmt(REALMS * PER)}`], ['Houses', fmt(houses)]])}
      <section><h3>At war ${wiki('war.html#AtWar', 'how wars work')}</h3>${wars().length ? `<ul class="rg-list">${wars().map((w) => `<li><button type="button" class="rg-row war" data-war="${w.id}">
        <span class="t">${sName(w.a)} <span class="vs">vs</span> ${sName(w.b)}</span><span class="s">${KIND(w.kind)} · since tick ${fmt(w.started_tick)}${same(w.a, mine()) || same(w.b, mine()) ? ' · <b class="rg-you">yours</b>' : ''}</span></button></li>`).join('')}</ul>`
        : '<p class="dim">No wars at present. Wars come from hostility between states, which grows with every attack and operation.</p>'}</section>
      ${cfs().length ? `<section><h3>Ceasefires ${wiki('war.html#Ceasefires', 'ceasefires')}</h3><ul class="rg-list">${cfs().map((c) => `<li><div class="rg-row cease"><span class="t">${stLink(c.a)} <span class="vs">and</span> ${stLink(c.b)}</span>
        <span class="s">until tick ${fmt(c.until_tick)} (${fmt(Math.max(0, c.until_tick - store.tick))} to go)${c.after_war ? ' · after a war, unbreakable' : ''}</span></div></li>`).join('')}</ul></section>` : ''}
      ${pts.length ? `<section><h3>War points ${wiki('end-of-age.html', 'they score')}</h3><ol class="rg-pts">${pts.map((p) => `<li>${stLink(p.state)}<b class="num">${fmt(p.points)}</b></li>`).join('')}</ol></section>` : ''}
      <section><h3>Live <span class="dim">${store.live === 'on' ? 'from the game, as it happens' : 'read every minute'}</span></h3>${feed.length ? `<ol class="rg-feed">${feed.slice(0, 10).map((e) => `<li class="${e.tone}"><span class="at">T${fmt(e.tick)}</span><span>${e.html}</span></li>`).join('')}</ol>` : '<p class="dim">Nothing yet. New wars, ceasefires and each tick\'s biggest movers appear here.</p>'}</section>
      <p class="rg-more">Read more: ${wiki('war.html', 'War')} · ${wiki('war.html#Relations', 'Relations')} · ${wiki('world.html', 'The world')} · ${wiki('materials.html', 'Materials')}</p>`;
  }

  function statePanel(k) {
    const [r, s] = k.split(':').map(Number), x = stateOf(r, s) || { realm: r, state: s, houses: 0 }, me = mine(), isMe = same(x, me);
    const war = warOf(x), cf = cfOf(x), rel = relOf(x), m = x.material;
    const tags = [isMe && '<span class="tag me">Your state</span>', war && `<span class="tag war">At war</span>`, cf.length && '<span class="tag cease">Ceasefire</span>', !x.houses && '<span class="tag">No houses</span>'].filter(Boolean).join('');
    const d = (kk) => { const v = delta(x, kk); return v ? `<span class="${v > 0 ? 'up' : 'down'}">${signed(v)} this tick</span>` : ''; };
    let relHtml = '';
    if (!isMe && rel) {
      const [lo, hi] = store.relations.war_range_bp || [0, Infinity], inRange = rel.land_ratio_bp >= lo && rel.land_ratio_bp <= hi;
      relHtml = `<section><h3>Between us ${wiki('war.html#Meter', 'the meter')}</h3>${facts([['They feel', `<span class="rel ${rel.they_feel.relation}">${esc(rel.they_feel.relation)}</span>`, `${(rel.they_feel.points / 100).toFixed(1)} points`], ['We feel', `<span class="rel ${rel.we_feel.relation}">${esc(rel.we_feel.relation)}</span>`, `${(rel.we_feel.points / 100).toFixed(1)} points`]])}
        <p class="rg-note">Their land is <b>${pct(rel.land_ratio_bp)}</b> of ours: ${inRange ? 'within' : 'outside'} the range for war (${pct(lo)}–${pct(hi)}). ${wiki('war.html#Declaring', 'declaring war')}</p>
        ${rel.ceasefire_proposed_to_us ? '<p class="rg-note">They have proposed a ceasefire to us.</p>' : ''}${rel.ceasefire_we_proposed ? '<p class="rg-note">We have proposed a ceasefire to them.</p>' : ''}</section>`;
    } else if (!isMe && me) relHtml = '<p class="rg-note dim">Neither of our states has any feeling about the other. Attacks and operations stir it up.</p>';
    return `${back()}<p class="rg-kick"><button type="button" class="rg-link" data-realm="${r}">${esc(realmName(r))}</button> · state ${k}${m ? ` · ${mat(m)}` : ''}</p>
      <h2>${esc(stateName(r, s))}</h2>${tags ? `<p class="rg-tags">${tags}</p>` : ''}
      ${x.houses ? facts([['Land', fmt(total(x, 'land')), [rank(x, 'land'), d('land')].filter(Boolean).join(' · ')], ['Might', fmt(total(x, 'might')), [rank(x, 'might'), d('might')].filter(Boolean).join(' · ')],
        ['Renown', fmt(total(x, 'renown')), rank(x, 'renown')], ['Houses', `${fmt(x.houses)}<span class="of"> of ${fmt(SEATS)}</span>`, x.leader ? `led by ${esc(x.leader.name)}` : 'no leader']]) : '<p class="dim">No house holds a seat here yet.</p>'}
      ${x.houses ? `<div class="rg-spark" id="rg-spark" data-k="${k}"><p class="dim small">Loading its history…</p></div>` : ''}
      ${war ? `<section><h3>At war</h3><button type="button" class="rg-row war" data-war="${war.id}"><span class="t">with ${sName(other(war, x))} <span class="dim">${key(other(war, x))}</span></span><span class="s">${KIND(war.kind)} · since tick ${fmt(war.started_tick)} · ${fmt(pointsOf(x))} war points</span></button></section>` : ''}
      ${cf.length ? `<section><h3>Ceasefire</h3>${cf.map((c) => `<p class="rg-note">With ${stLink(other(c, x))} until tick ${fmt(c.until_tick)}${c.after_war ? ' (after a war: it can\'t be broken)' : ''}.</p>`).join('')}</section>` : ''}
      ${relHtml}
      ${isMe && war ? peaceBlock(war) : diplomacy(x)}
      <p class="rg-acts">${x.houses ? `<button type="button" class="rg-btn" data-houses="${k}" aria-haspopup="dialog">Houses ›</button>` : ''}<button type="button" class="rg-btn ghost" data-realm="${r}">Realm ›</button></p>
      <p class="rg-more">Read more: ${wiki('leadership.html', 'Leaders & tax')} · ${wiki('war.html#Relations', 'Relations')}</p>`;
  }

  function realmPanel(r) {
    const x = world.realms.get(r), sts = (x?.states || []).map((s) => ({ ...s, realm: r })), occ = sts.filter((s) => s.houses);
    const sum = (kk) => sts.reduce((a, s) => a + total(s, kk), 0);
    return `${back()}<p class="rg-kick">Realm ${r}${x?.material ? ` · ${mat(x.material)}` : ''}</p><h2>${esc(realmName(r))}</h2>
      ${facts([['States with houses', fmt(occ.length), `of ${fmt(PER)}`], ['Houses', fmt(sts.reduce((a, s) => a + s.houses, 0))], ['Land', fmt(sum('land'))], ['Might', fmt(sum('might'))]])}
      ${x?.material ? `<p class="rg-note">Every state here produces ${esc(x.material)}. ${wiki(`materials.html#${esc(x.material)}`, `What ${esc(x.material)} is for`)}</p>` : ''}
      <section><h3>Its states</h3><ul class="rg-list">${sts.map((s) => { const w = warOf(s); return `<li><button type="button" class="rg-row${w ? ' war' : ''}${same(s, mine()) ? ' me' : ''}" data-open="${key(s)}">
        <span class="t">${sName(s)} <span class="dim">${key(s)}</span></span><span class="s">${s.houses ? `${fmt(s.houses)} houses · ${fmt(total(s, 'land'))} acres` : 'no houses'}${w ? ` · at war with ${sName(other(w, s))}` : ''}</span></button></li>`; }).join('')}</ul></section>
      <p class="rg-more">Read more: ${wiki('world.html', 'Realms and states')} · ${wiki('realm-works.html', 'Realm works')}</p>`;
  }

  function warPanel(id) {
    const w = wars().find((x) => String(x.id) === String(id));
    if (!w) return `${back()}<h2>That war is over</h2><p class="dim">It has ended since you opened it. Ended wars are listed on the Wars page.</p>`;
    const A = stateOf(w.a.realm, w.a.state) || w.a, B = stateOf(w.b.realm, w.b.state) || w.b;
    const [a0, b0] = w.land_at_start || [0, 0], a1 = total(A, 'land') || a0, b1 = total(B, 'land') || b0;
    const bar = (a, b, label) => { const t = a + b || 1; return `<div class="rg-bal" role="img" aria-label="${label}: ${fmt(a)} acres against ${fmt(b)}"><span class="a" style="width:${((100 * a) / t).toFixed(1)}%"></span><span class="b"></span></div>`; };
    const since = Math.max(0, store.tick - w.started_tick), canEnd = store.tick >= w.may_end_at_tick;
    return `${back()}<p class="rg-kick">War · ${KIND(w.kind)}</p><h2 class="rg-vs">${sName(w.a)} <span class="vs">vs</span> ${sName(w.b)}</h2>
      ${facts([['Since', `tick ${fmt(w.started_tick)}`, `${fmt(since)} ticks`], ['May end', canEnd ? 'now' : `tick ${fmt(w.may_end_at_tick)}`, canEnd ? 'by peace or surrender' : `${fmt(w.may_end_at_tick - store.tick)} ticks to go`],
        [`${sName(w.a)}`, `${fmt(pointsOf(w.a))} <span class="of">points</span>`], [`${sName(w.b)}`, `${fmt(pointsOf(w.b))} <span class="of">points</span>`]])}
      <section><h3>Land, then and now</h3>
        <div class="rg-balrow"><span class="l">at the start</span>${bar(a0, b0, 'At the start')}<span class="r">${fmt(a0)} · ${fmt(b0)}</span></div>
        <div class="rg-balrow"><span class="l">now</span>${bar(a1, b1, 'Now')}<span class="r">${fmt(a1)} · ${fmt(b1)}</span></div>
        <p class="rg-note">${sName(w.a)} ${signed(a1 - a0)} acres · ${sName(w.b)} ${signed(b1 - b0)} acres since it began.</p></section>
      ${(w.peace_offered || []).length ? `<p class="rg-note">Peace offered by ${w.peace_offered.map((s) => sName(s)).join(' and ')}.</p>` : ''}
      ${peaceBlock(w)}
      <p class="rg-acts"><button type="button" class="rg-btn" data-track="${w.id}" aria-haspopup="dialog">Track it ›</button><button type="button" class="rg-btn ghost" data-open="${key(w.a)}">${sName(w.a)} ›</button><button type="button" class="rg-btn ghost" data-open="${key(w.b)}">${sName(w.b)} ›</button></p>
      <p class="rg-more">Read more: ${wiki('war.html#Ending', 'How wars end')} · ${wiki('war.html#Outcomes', 'What the winner takes')} · ${wiki('war.html#Recovery', 'Recovery')}</p>`;
  }

  /** The target, above the panel: who, and what you can do to them (each opens its form in Your house). */
  function targetCard() {
    const t0 = store.target;
    if (!t0) return '';
    const t = { ...t0, ...(findHouse(t0.id) || {}) }, why = blockOf(t), mineH = isProtected(store.house);
    return `<section class="rg-tgt" aria-label="Your target"><p class="rg-kick">Your target <button type="button" class="rg-x" data-untarget aria-label="Clear the target" title="Clear the target">×</button></p>
      <p class="nm"><b>${esc(t.name)}</b> <span class="dim">${addr(t)}</span> · <button type="button" class="rg-link" data-open="${t.realm}:${t.state}">${esc(stateName(t.realm, t.state))}</button></p>
      <p class="s">${t.race ? `${esc(raceName(t.race))} · ` : ''}${fmt(t.land)} acres · ${fmt(t.might)} might${why ? ` · <span class="short">${esc(why)}</span>` : mineH ? ' · <span class="short">you are under protection</span>' : ''}</p>
      <p class="rg-acts"><button type="button" class="rg-btn" data-act="attack">Attack ›</button><button type="button" class="rg-btn ghost" data-act="operation">Thieves ›</button><button type="button" class="rg-btn ghost" data-act="cast">Rite ›</button></p></section>`;
  }
  function mat(m) {
    return `<span class="rg-mat" data-mat="${esc(m)}">${MATS.has(m) ? `<i style="--ico:url('views/line/assets/materials/${esc(m)}.png')" aria-hidden="true"></i>` : ''}${esc(m)}</span>`;
  }

  function showPanel(p, { focus = false } = {}) {
    const was = panel;
    panel = p;
    // Keep the focused control in the panel focused across a redraw (same data attribute, same value).
    const a = pane.contains(document.activeElement) ? document.activeElement : null;
    const attr = a && [...a.attributes].find((x) => x.name.startsWith('data-'));
    pane.innerHTML = targetCard() + (p.kind === 'state' ? statePanel(p.key) : p.kind === 'realm' ? realmPanel(p.realm) : p.kind === 'war' ? warPanel(p.id) : worldPanel());
    if (attr && !focus) pane.querySelector(`[${attr.name}="${CSS.escape(attr.value)}"]`)?.focus({ preventScroll: true });
    if (focus) { pane.scrollTop = 0; pane.querySelector('h2')?.setAttribute('tabindex', '-1'); pane.querySelector('h2')?.focus({ preventScroll: true }); }
    if (p.kind === 'state') spark(p.key);
    if (was.kind !== p.kind || was.key !== p.key) svg.querySelectorAll('.seg.sel').forEach((e) => e.classList.remove('sel'));
    if (p.kind === 'state') svg.querySelector(`[data-k="${p.key}"]`)?.classList.add('sel');
    hot = null; rest();
  }
  const refreshPanel = () => showPanel(panel);
  function openState(k, focus = true) {
    const [r, s] = k.split(':').map(Number);
    if (!(r >= 1 && r <= REALMS && s >= 1 && s <= PER)) { say(`There is no state ${k}.`, 'bad'); return; }
    roving = k;
    svg.querySelectorAll('.seg[tabindex="0"]').forEach((e) => e.setAttribute('tabindex', '-1'));
    svg.querySelector(`[data-k="${k}"]`)?.setAttribute('tabindex', '0');
    showPanel({ kind: 'state', key: k }, { focus });
  }

  // A state's history: land and might over the age, two small lines (/states/:r/:s/series).
  const series = new Map();
  async function spark(k) {
    let d = series.get(k);
    if (!d || d.tick !== store.tick) {
      const [r, s] = k.split(':');
      try { d = { tick: store.tick, data: await api(`/states/${r}/${s}/series`) }; } catch (e) { d = { tick: store.tick, err: e }; }
      series.set(k, d);
    }
    const host = pane.querySelector(`#rg-spark[data-k="${k}"]`);
    if (!host) return;
    if (d.err) { host.innerHTML = `<p class="dim small">${d.err.status === 404 ? 'The game keeps no history of states yet.' : esc(d.err.message)}</p>`; return; }
    const t = d.data.ticks || [];
    host.innerHTML = t.length > 1 ? ['land', 'might'].map((kk) => mini(kk === 'land' ? 'Land' : 'Might', t, d.data[kk] || [])).join('') : '<p class="dim small">Its history starts next tick.</p>';
  }
  function mini(label, ticks, vs) {
    const Wd = 150, H = 34, ok = vs.filter((v) => v != null);
    if (!ok.length) return '';
    const lo = Math.min(...ok), hi = Math.max(...ok), sp = hi - lo || 1, t0 = ticks[0], t1 = ticks[ticks.length - 1];
    const pts = vs.map((v, i) => (v == null ? '' : `${(((ticks[i] - t0) / Math.max(1, t1 - t0)) * Wd).toFixed(1)},${(H - 3 - ((v - lo) / sp) * (H - 6)).toFixed(1)}`)).filter(Boolean).join(' ');
    return `<figure><figcaption>${label} <span class="dim">ticks ${fmt(t0)}–${fmt(t1)}</span></figcaption><svg viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="none" role="img" aria-label="${label} from ${fmt(vs[0] ?? 0)} to ${fmt(ok[ok.length - 1])}"><polyline points="${pts}"/></svg><span class="v">${fmt(ok[ok.length - 1])}</span></figure>`;
  }

  // ---------- windows: a state's houses, a war's history ----------
  let opener = null;
  function openDialog(title, body, from) {
    opener = from;
    $('dlg-h').innerHTML = title;
    $('dlg-b').innerHTML = body;
    if (!dlg.open) dlg.showModal();
  }
  on(dlg, 'click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close(); });
  on(dlg, 'close', () => { dlgHouses = null; if (opener?.isConnected) opener.focus(); });
  // Target a house from a state's window: every view's attack and thieves aim there.
  let dlgHouses = null;
  on(dlg, 'click', (ev) => {
    const b = ev.target.closest('[data-target]'), h = b && dlgHouses?.find((x) => String(x.id) === b.dataset.target);
    if (!h) return;
    setTarget(h);
    say(`Target: ${h.name} (${addr(h)}). Attacks and thieves in every view now aim there.`, 'good');
    dlg.querySelectorAll('[data-target]').forEach((x) => { const t = x === b; x.setAttribute('aria-pressed', String(t)); x.textContent = t ? 'Targeted' : 'Target'; });
    actBar();
  });
  /** Under a state's houses: what to do to the one targeted there. */
  function actBar() {
    const bar = dlg.querySelector('#rg-dact'), t = store.target;
    if (!bar) return;
    const here = t && dlgHouses?.some((x) => x.id === t.id);
    bar.innerHTML = here ? `<span><b>${esc(t.name)}</b> <span class="dim">${addr(t)}</span>${blockOf(t) ? ` · <span class="short">${esc(blockOf(t))}</span>` : ''}</span>
      <span class="rg-acts"><button type="button" class="rg-btn" data-act="attack">Attack ›</button><button type="button" class="rg-btn ghost" data-act="operation">Thieves ›</button><button type="button" class="rg-btn ghost" data-act="cast">Rite ›</button></span>` : '';
  }
  // Acting on the target, from the panel or a state's window: the House tab opens on that form.
  on(root, 'click', (ev) => {
    const a = ev.target.closest('[data-act]');
    if (a) { if (dlg.open) { opener = null; dlg.close(); } modal.open(a.dataset.act); return; }
    if (ev.target.closest('#rg-panel [data-untarget]')) { setTarget(null); say('Target cleared.'); }
  });
  async function houses(k, from) {
    const [r, s] = k.split(':').map(Number);
    openDialog(`${esc(stateName(r, s))} <span class="dim">${k}</span>`, '<p class="dim">Loading its houses…</p>', from);
    let list;
    try { list = await loadStateMembers(r, s, { maxAge: 0 }); } catch (e) { $('dlg-b').innerHTML = `<p class="short">${esc(e.message)}</p>`; return; }
    if (!dlg.open) return;
    const me = store.house?.id, tg = store.target?.id;
    $('dlg-b').innerHTML = `<p class="dim small">Public facts only. Target a house, then attack it, send thieves or cast on it. ${wiki('visibility.html', 'what others can see')}</p>
      <div class="rg-scroll"><table class="rg-tbl"><thead><tr><th class="num">Seat</th><th>House</th><th>Race</th><th class="num">Land</th><th class="num">Might</th><th class="num">Renown</th><th><span class="vh">Target</span></th></tr></thead><tbody>
      ${list.map((h) => `<tr class="${h.id === me ? 'me' : ''}"><td class="num">${h.seat}</td><td><b>${esc(h.name)}</b>${h.protected ? ' <span class="tag">protected</span>' : ''}${h.id === me ? ' <span class="rg-you">you</span>' : ''}</td><td>${esc(raceName(h.race))}</td>
        <td class="num">${fmt(h.land)}</td><td class="num">${fmt(h.might)}</td><td class="num">${fmt(h.renown)}</td>
        <td>${h.id === me ? '' : `<button type="button" class="rg-btn ghost mini" data-target="${h.id}" aria-pressed="${h.id === tg}">${h.id === tg ? 'Targeted' : 'Target'}</button>`}</td></tr>`).join('')}</tbody></table></div>
      <div class="rg-dact" id="rg-dact" aria-live="polite"></div>`;
    dlgHouses = list;
    actBar();
  }
  async function track(id, from) {
    const w = wars().find((x) => String(x.id) === String(id));
    if (!w) return;
    const an = sName(w.a), bn = sName(w.b);
    openDialog(`${an} <span class="vs">vs</span> ${bn}`, '<p class="dim">Loading the war\'s history…</p>', from);
    let d;
    try { d = await api(`/wars/${id}/series`); } catch (e) { $('dlg-b').innerHTML = `<p class="short">${e.status === 404 ? 'The game keeps no history of this war yet.' : esc(e.message)}</p>`; return; }
    if (!dlg.open) return;
    $('dlg-b').innerHTML = `<p class="rg-note"><b class="a">${an}</b> in ink, <b class="b">${bn}</b> in red; the gold line is where the war began. ${wiki('war.html', 'War')}</p>
      <div class="rg-charts">${[['houses', 'Houses'], ['land', 'Land'], ['might', 'Might'], ['renown', 'Renown']].map(([k, label]) => twin(label, d.ticks || [], d.a_series?.[k] || [], d.b_series?.[k] || [], w.started_tick)).join('')}</div>`;
  }
  function twin(label, ticks, a, b, start) {
    const Wd = 260, H = 84, all = [...a, ...b].filter((v) => v != null);
    if (!ticks.length || !all.length) return '';
    const lo = Math.min(...all), hi = Math.max(...all), sp = hi - lo || 1, t0 = ticks[0], t1 = ticks[ticks.length - 1] || t0 + 1;
    const x = (t) => ((t - t0) / Math.max(1, t1 - t0)) * Wd, y = (v) => H - 4 - ((v - lo) / sp) * (H - 8);
    const pl = (vs, cls) => `<polyline class="${cls}" points="${vs.map((v, i) => (v == null ? '' : `${x(ticks[i]).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')}"/>`;
    const last = (vs) => vs.filter((v) => v != null).slice(-1)[0] ?? 0;
    return `<figure class="rg-chart"><figcaption>${label}<span><b class="a">${fmt(last(a))}</b> · <b class="b">${fmt(last(b))}</b></span></figcaption>
      <svg viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="none" role="img" aria-label="${label}: both sides over ticks ${fmt(t0)} to ${fmt(t1)}">${start >= t0 && start <= t1 ? `<line class="start" x1="${x(start).toFixed(1)}" x2="${x(start).toFixed(1)}" y1="0" y2="${H}"/>` : ''}${pl(a, 'a')}${pl(b, 'b')}</svg>
      <span class="ax"><span>tick ${fmt(t0)}</span><span>tick ${fmt(t1)}</span></span></figure>`;
  }

  // ---------- the live feed: what changed between reads ----------
  function noteWars() {
    if (!store.wars) return;
    const ws = new Map(wars().map((w) => [String(w.id), w])), cs = new Map(cfs().map((c) => [`${key(c.a)}~${key(c.b)}`, c]));
    if (seenWars) {
      for (const [id, w] of ws) if (!seenWars.has(id)) push('bad', `War: ${sName(w.a)} <span class="vs">vs</span> ${sName(w.b)} (${KIND(w.kind).toLowerCase()}).`);
      for (const [id, w] of seenWars) if (!ws.has(id)) { const h = (store.wars.history || []).find((x) => String(x.id) === id); push('', `The war between ${sName(w.a)} and ${sName(w.b)} ended${h?.winner ? `: ${sName(h.winner)} won` : ''}.`); }
      for (const [k, c] of cs) if (!seenCease.has(k)) push('good', `Ceasefire: ${sName(c.a)} and ${sName(c.b)}, to tick ${fmt(c.until_tick)}.`);
      for (const [k, c] of seenCease) if (!cs.has(k)) push('', `The ceasefire between ${sName(c.a)} and ${sName(c.b)} ended.`);
    }
    seenWars = ws; seenCease = cs;
  }
  function noteTick() {
    if (!world.prev.size || summedTick === world.tick) return;
    summedTick = world.tick;
    const moved = states().map((s) => ({ s, d: delta(s, 'land') })).filter((x) => x.d).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
    push('', moved.length ? `Tick ${fmt(world.tick)}: ${moved.map(({ s, d }) => `${sName(s)} <b class="${d > 0 ? 'up' : 'down'}">${signed(d)}</b>`).join(', ')} acres.` : `Tick ${fmt(world.tick)}: no state's land changed.`);
  }
  function push(tone, html) {
    feed.unshift({ tick: store.tick, tone, html });
    if (feed.length > 40) feed.length = 40;
  }


  // ---------- the panel's tabs: the ring (world, state, realm, war) and your house ----------
  let ptab = 'ring';
  function showTab(t, { focus = false } = {}) {
    ptab = t;
    root.querySelectorAll('[data-ptab]').forEach((b) => { const s = b.dataset.ptab === t; b.setAttribute('aria-selected', String(s)); b.tabIndex = s ? 0 : -1; });
    $('p-ring').hidden = t !== 'ring'; $('p-house').hidden = t !== 'house';
    $('house').classList.toggle('on', t === 'house');
    $('aside').scrollTop = 0;
    // On a phone the panel is under the ring: bring it into view.
    if (matchMedia('(max-width: 900px)').matches) $('aside').scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (focus) $(`pt-${t}`).focus();
  }
  on(root.querySelector('.rg-ptabs'), 'click', (ev) => { const b = ev.target.closest('[data-ptab]'); if (b) showTab(b.dataset.ptab); });
  on(root.querySelector('.rg-ptabs'), 'keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    ev.preventDefault(); showTab(ptab === 'ring' ? 'house' : 'ring', { focus: true });
  });
  // The action window, over the ring; while it's open the ring behind previews the move.
  const modal = makeModal(root.querySelector('.ring'), { preview, openState: (k) => { showTab('ring'); openState(k, true); }, stateName });
  const house = mountConsole($('p-house'), on, { openState: (k) => { showTab('ring'); openState(k, true); }, open: (id, args) => modal.open(id, args), bar: () => modal.bar() });
  on($('house'), 'click', () => showTab(ptab === 'house' ? 'ring' : 'house', { focus: true }));
  const ORDER_ACT = { x: 'explore', b: 'build', t: 'train' };
  on($('res'), 'click', (ev) => { const b = ev.target.closest('[data-order]'); if (b && actById(ORDER_ACT[b.dataset.order])) modal.open(ORDER_ACT[b.dataset.order]); });
  on(root.querySelector('.rg-dock'), 'click', (ev) => {
    const b = ev.target.closest('[data-dock]');
    if (b) modal.group(b.dataset.dock);
    else if (ev.target.closest('[data-dock-bar]')) modal.bar();
  });

  // ---------- the march: what an open action would do, drawn on the ring behind the window ----------
  let march = null;
  function preview(p) { march = p; paintMarch(); }
  function paintMarch() {
    svg.querySelector('#rg-march')?.remove();
    svg.classList.toggle('marching', !!march);
    svg.querySelectorAll('.seg.go').forEach((e) => e.classList.remove('go'));
    if (!march) return;
    for (const k of march.states || []) svg.querySelector(`.seg[data-k="${k}"]`)?.classList.add('go');
    const [a, b] = march.march || [];
    if (a && b && geo.seg[a] && geo.seg[b] && a !== b) {
      const d = chord(geo.seg[a].mid, geo.seg[b].mid);
      svg.insertAdjacentHTML('beforeend', `<g id="rg-march" aria-hidden="true"><path class="glow" d="${d}"/><path class="path" d="${d}"/></g>`);
    }
  }

  // ---------- the ring's size: the divider, hiding the panel, zoom and pan ----------
  const SKEY = `${KEY}.layout`, mainEl = root.querySelector('.rg-main');
  let lay = { pw: 380, hidden: false, z: 1, cx: C, cy: C };
  try { lay = { ...lay, ...JSON.parse(localStorage.getItem(SKEY)) }; } catch { /* storage off */ }
  const saveLay = () => { try { localStorage.setItem(SKEY, JSON.stringify(lay)); } catch { /* storage off */ } };
  const PW_MIN = 300, pwMax = () => Math.max(PW_MIN, Math.floor(mainEl.clientWidth * 0.62));
  function layout2() {
    lay.pw = Math.min(Math.max(lay.pw, PW_MIN), pwMax());
    mainEl.style.setProperty('--rg-pw', `${lay.pw}px`);
    mainEl.classList.toggle('nopanel', lay.hidden);
    $('showp').hidden = !lay.hidden;
    const sp = $('split');
    sp.setAttribute('aria-valuenow', String(lay.hidden ? 0 : lay.pw)); sp.setAttribute('aria-valuemin', '0'); sp.setAttribute('aria-valuemax', String(pwMax()));
    sp.setAttribute('aria-valuetext', lay.hidden ? 'panel hidden' : `panel ${lay.pw} pixels wide`);
    zoomTo(lay.z, lay.cx, lay.cy, false);
  }
  function hidePanel(h) { lay.hidden = h; saveLay(); layout2(); (h ? $('showp') : $('hide')).focus(); }
  on($('hide'), 'click', () => hidePanel(true));
  on($('showp'), 'click', () => hidePanel(false));
  on($('split'), 'dblclick', () => { lay.pw = 380; lay.hidden = false; saveLay(); layout2(); });
  on($('split'), 'keydown', (ev) => {
    const step = ev.shiftKey ? 80 : 20;
    if (ev.key === 'ArrowLeft') lay.pw += step; else if (ev.key === 'ArrowRight') lay.pw -= step;
    else if (ev.key === 'Home') lay.pw = pwMax(); else if (ev.key === 'End') lay.pw = PW_MIN;
    else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); hidePanel(!lay.hidden); return; }
    else return;
    ev.preventDefault(); lay.hidden = false; saveLay(); layout2();
  });
  on($('split'), 'pointerdown', (ev) => {
    ev.preventDefault();
    const sp = $('split'); sp.setPointerCapture(ev.pointerId); sp.classList.add('drag');
    const right = mainEl.getBoundingClientRect().right;
    const move = (e) => { lay.hidden = false; lay.pw = right - e.clientX - 4; layout2(); };
    const up = () => { sp.classList.remove('drag'); sp.removeEventListener('pointermove', move); saveLay(); };
    sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up, { once: true });
  });
  on(window, 'resize', layout2);
  // Zoom: 60% to 400%, about a point; the view never drifts off the ring.
  const BW = W + 140, BH = W + 20;
  function zoomTo(z, cx = lay.cx, cy = lay.cy, keep = true) {
    lay.z = Math.min(4, Math.max(0.6, z));
    const w = BW / lay.z, hgt = BH / lay.z, lim = Math.max(0, (W - w) / 2 + 120);
    lay.cx = Math.min(C + lim, Math.max(C - lim, cx)); lay.cy = Math.min(C + lim, Math.max(C - lim, cy));
    if (lay.z <= 1) { lay.cx = C; lay.cy = C; }
    svg.setAttribute('viewBox', `${(lay.cx - w / 2).toFixed(1)} ${(lay.cy - hgt / 2 + 5).toFixed(1)} ${w.toFixed(1)} ${hgt.toFixed(1)}`);
    $('zv').textContent = `${Math.round(lay.z * 100)}%`;
    svg.classList.toggle('zoomed', lay.z > 1);
    if (keep) saveLay();
  }
  const ZOOMS = [0.6, 0.8, 1, 1.25, 1.6, 2, 2.6, 3.3, 4];
  const stepZoom = (d) => { const i = ZOOMS.findIndex((z) => z >= lay.z - 0.01); zoomTo(d ? ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + d))] : 1, d ? lay.cx : C, d ? lay.cy : C); };
  on(root.querySelector('.rg-zoom'), 'click', (ev) => { const b = ev.target.closest('[data-zoom]'); if (b) stepZoom(Number(b.dataset.zoom)); });
  /** A point on the screen, in the ring's coordinates. */
  const toRing = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  on(svg, 'wheel', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey || lay.z > 1)) return;   // a plain scroll still scrolls the page unless zoomed in
    ev.preventDefault();
    const at = toRing(ev.clientX, ev.clientY), z = lay.z * Math.exp(-ev.deltaY * 0.0022);
    // Keep the point under the pointer where it is.
    zoomTo(z, at.x - (at.x - lay.cx) * (lay.z / Math.min(4, Math.max(0.6, z))), at.y - (at.y - lay.cy) * (lay.z / Math.min(4, Math.max(0.6, z))));
  }, { passive: false });
  // Drag to pan when zoomed in (a short press is still a click).
  let pan = null, panned = false;
  on(svg, 'pointerdown', (ev) => { if (lay.z <= 1 || ev.button !== 0) return; pan = { x: ev.clientX, y: ev.clientY, cx: lay.cx, cy: lay.cy, k: BW / lay.z / svg.clientWidth }; panned = false; });
  on(window, 'pointermove', (ev) => {
    if (!pan) return;
    const dx = ev.clientX - pan.x, dy = ev.clientY - pan.y;
    if (!panned && Math.hypot(dx, dy) < 5) return;
    panned = true; svg.classList.add('panning');
    zoomTo(lay.z, pan.cx - dx * pan.k, pan.cy - dy * pan.k);
  });
  on(window, 'pointerup', () => { pan = null; svg.classList.remove('panning'); });
  on(svg, 'click', (ev) => { if (panned) { ev.stopImmediatePropagation(); panned = false; } }, { capture: true });
  /** Zoom to a realm: its seven states fill the view. */
  function zoomRealm(r) { const [x, y] = pt(geo.realm[r].mid, R1 + 70); zoomTo(2.2, x, y); }

  // ---------- diplomacy, on a state's panel and your war's (the leader's to do; the server has the last word) ----------
  /** A state's diplomacy block: what your state can do about it. */
  function diplomacy(x) {
    const me = mine(), R = store.relations;
    if (!me || !R || same(x, me)) return '';
    const L = isLeader(), lw = L ? '' : leaderWhy(), rel = relOf(x), myWar = R.war, atWarWithThem = myWar && (same(myWar.a, x) || same(myWar.b, x));
    const cf = cfs().find((c) => (same(c.a, x) && same(c.b, me)) || (same(c.b, x) && same(c.a, me)));
    const dw = atWarWithThem ? 'you are at war with them' : rel ? declareWhy(rel) : 'no hostility either way yet: war needs them Hostile toward you';
    const btn = (id, label, why, cls = 'ghost') => `<button type="button" class="rg-btn ${cls}" data-dip="${id}" data-k="${key(x)}" aria-haspopup="dialog"${why ? ` title="${esc(why[0].toUpperCase() + why.slice(1))}"` : ''}>${label}</button>`;
    const rows = [];
    if (!atWarWithThem) rows.push(btn('declare', 'Declare war…', lw || dw, 'danger'));
    if (!cf && !atWarWithThem) rows.push(btn('cease', rel?.ceasefire_proposed_to_us ? 'Accept their ceasefire…' : 'Propose a ceasefire…', lw));
    if (cf && !cf.after_war) rows.push(btn('break', 'Break the ceasefire…', lw, 'danger'));
    const note = lw ? `<p class="rg-note dim">${esc(lw[0].toUpperCase() + lw.slice(1))} can do these.</p>` : !atWarWithThem && dw ? `<p class="rg-note dim">War: ${esc(dw)}.</p>` : '';
    return rows.length ? `<section><h3>Our state and theirs ${wiki('war.html#Declaring', 'declaring war')}</h3><p class="rg-acts rg-dip">${rows.join('')}</p>${note}</section>` : '';
  }
  /** Your war's block: offer peace, withdraw. */
  function peaceBlock(w) {
    const me = mine();
    if (!me || !(same(w.a, me) || same(w.b, me))) return '';
    const lw = isLeader() ? '' : leaderWhy(), early = store.tick < w.may_end_at_tick ? `it can end no sooner than tick ${fmt(w.may_end_at_tick)}` : '';
    const ours = (w.peace_offered || []).some((s) => same(s, me)), why = lw || early;
    const b = (id, label, cls = 'ghost') => `<button type="button" class="rg-btn ${cls}" data-dip="${id}" aria-haspopup="dialog"${why ? ` title="${esc(why[0].toUpperCase() + why.slice(1))}"` : ''}>${label}</button>`;
    return `<section><h3>Your war ${wiki('war.html#Ending', 'ending a war')}</h3><p class="rg-acts rg-dip">${b('peace', ours ? 'Take back your peace offer' : 'Offer peace')}${b('withdraw', 'Withdraw…', 'danger')}</p>${why ? `<p class="rg-note dim">${esc(why[0].toUpperCase() + why.slice(1))}.</p>` : ''}</section>`;
  }
  // Each opens its window over the ring, the state filled in (the window says what it will do, and asks twice).
  const DIP = { declare: 'declare-war', cease: 'ceasefire', break: 'break-ceasefire', peace: 'offer-peace', withdraw: 'withdraw' };
  on(pane, 'click', (ev) => {
    const b = ev.target.closest('[data-dip]');
    if (b && actById(DIP[b.dataset.dip])) modal.open(DIP[b.dataset.dip], b.dataset.k ? { state: b.dataset.k } : {});
  });

  // ---------- events ----------
  on(root.querySelector('.rg-tools'), 'click', (ev) => {
    const z = ev.target.closest('[data-size]'), s = ev.target.closest('[data-show]');
    if (z) { size = z.dataset.size; save(); tools(); draw(); }
    if (s) { const k = s.dataset.show; shows.has(k) ? shows.delete(k) : shows.add(k); save(); tools(); draw(); }
  });
  on(root.querySelector('.rg-seg[role=radiogroup]'), 'keydown', (ev) => {
    const i = SIZES.findIndex(([k]) => k === size), n = SIZES.length;
    const j = ['ArrowRight', 'ArrowDown'].includes(ev.key) ? (i + 1) % n : ['ArrowLeft', 'ArrowUp'].includes(ev.key) ? (i + n - 1) % n : -1;
    if (j < 0) return;
    ev.preventDefault(); size = SIZES[j][0]; save(); tools(); draw();
    root.querySelector(`[data-size="${size}"]`).focus();
  });
  function tools() {
    root.querySelectorAll('[data-size]').forEach((b) => { const on2 = b.dataset.size === size; b.setAttribute('aria-checked', String(on2)); b.tabIndex = on2 ? 0 : -1; });
    root.querySelectorAll('[data-show]').forEach((b) => b.setAttribute('aria-pressed', String(shows.has(b.dataset.show))));
  }
  on($('find'), 'submit', (ev) => {
    ev.preventDefault();
    const m = $('faddr').value.trim().match(/^(\d+):(\d+)/);
    if (!m) { say('Type a state as realm:state, such as 4:2.', 'bad'); return; }
    openState(`${+m[1]}:${+m[2]}`, false);
    svg.querySelector(`[data-k="${+m[1]}:${+m[2]}"]`)?.focus();
  });
  on($('out'), 'click', () => act.signOut());

  // The ring: pointer and focus light a state; a click opens it, its realm, or a war.
  on(svg, 'pointerover', (ev) => { const s = ev.target.closest('[data-k]'); if (s) light(s.dataset.k); const l = ev.target.closest('.ln'); if (l && !s) lightLine(l); });
  on(svg, 'pointerleave', () => { const f = svg.contains(document.activeElement) && document.activeElement.dataset.k; if (f) light(f); else { hot = null; rest(); } });
  on(svg, 'focusin', (ev) => { const s = ev.target.closest('[data-k]'); if (s) light(s.dataset.k); });
  on(svg, 'focusout', (ev) => { if (!svg.contains(ev.relatedTarget)) { hot = null; rest(); } });
  on(svg, 'click', (ev) => {
    const s = ev.target.closest('[data-k]'), r = ev.target.closest('[data-realm]'), l = ev.target.closest('.ln');
    if (s) openState(s.dataset.k, false);
    else if (r) { showPanel({ kind: 'realm', realm: Number(r.dataset.realm) }); if (ev.detail === 2) zoomRealm(Number(r.dataset.realm)); }
    else if (l?.dataset.war) showPanel({ kind: 'war', id: l.dataset.war });
    else if (l?.dataset.openB) openState(same(parse(l.dataset.a), mine()) ? l.dataset.b : l.dataset.a, false);
  });
  function lightLine(l) {
    light(null);
    const w = l.dataset.war && wars().find((x) => String(x.id) === l.dataset.war);
    if (w) {
      const c = (id, t) => { const e = svg.querySelector(`#rg-${id}`); if (e) e.textContent = t; };
      c('c1', `WAR · ${KIND(w.kind).toUpperCase()}`); c('c2', stateName(w.a.realm, w.a.state)); c('c3', `vs ${stateName(w.b.realm, w.b.state)}`); c('c4', `since tick ${fmt(w.started_tick)}`);
    }
    svg.classList.add('lit');
    svg.querySelectorAll('.hot').forEach((e) => e.classList.remove('hot'));
    l.classList.add('hot');
    svg.querySelectorAll(`[data-k="${l.dataset.a}"], [data-k="${l.dataset.b}"], [data-cap="${l.dataset.a}"], [data-cap="${l.dataset.b}"]`).forEach((e) => e.classList.add('hot'));
  }
  const parse = (k) => { const [realm, state] = k.split(':').map(Number); return { realm, state }; };
  on(svg, 'keydown', (ev) => {
    const s = ev.target.closest('[data-k]');
    if (!s) return;
    const [r, st] = s.dataset.k.split(':').map(Number);
    let nr = r, ns = st;
    if (ev.key === 'ArrowRight') { ns++; if (ns > PER) { ns = 1; nr = (r % REALMS) + 1; } }
    else if (ev.key === 'ArrowLeft') { ns--; if (ns < 1) { ns = PER; nr = ((r + REALMS - 2) % REALMS) + 1; } }
    else if (ev.key === 'ArrowDown') nr = (r % REALMS) + 1;
    else if (ev.key === 'ArrowUp') nr = ((r + REALMS - 2) % REALMS) + 1;
    else if (ev.key === 'Home' && mine()) { nr = mine().realm; ns = mine().state; }
    else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openState(s.dataset.k, true); return; }
    else return;
    ev.preventDefault();
    const k = `${nr}:${ns}`;
    s.setAttribute('tabindex', '-1');
    const n = svg.querySelector(`[data-k="${k}"]`);
    roving = k;
    n?.setAttribute('tabindex', '0');
    n?.focus();
  });

  // The panel: links between states, realms and wars; the windows.
  on(pane, 'click', (ev) => {
    const t = ev.target.closest('[data-open],[data-realm],[data-war],[data-panel-world],[data-houses],[data-track]');
    if (!t) return;
    if (t.dataset.houses) houses(t.dataset.houses, t);
    else if (t.dataset.track) track(t.dataset.track, t);
    else if (t.dataset.open) openState(t.dataset.open, true);
    else if (t.dataset.realm) showPanel({ kind: 'realm', realm: Number(t.dataset.realm) }, { focus: true });
    else if (t.dataset.war) showPanel({ kind: 'war', id: t.dataset.war }, { focus: true });
    else if (t.hasAttribute('data-panel-world')) { showPanel({ kind: 'world' }, { focus: true }); }
  });
  on(pane, 'pointerover', (ev) => { const t = ev.target.closest('[data-open]'); if (t) light(t.dataset.open); const w = ev.target.closest('[data-war]'); if (w) { const l = svg.querySelector(`.ln[data-war="${w.dataset.war}"]`); if (l) lightLine(l); } });
  on(pane, 'pointerleave', () => { hot = null; rest(); });

  // Esc: back to the world; F: find.
  on(document, 'keydown', (ev) => {
    // Alt+1…8: a group of actions.
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey && /^Digit[1-9]$/.test(ev.code) && !document.querySelector('dialog[open]')) { const g = GROUPS[Number(ev.code.slice(5)) - 1]; if (g) { ev.preventDefault(); modal.group(g[0]); } return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector('dialog[open]')) return;
    const t = ev.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (!typing && (ev.key === 'h' || ev.key === 'H')) { ev.preventDefault(); showTab(ptab === 'house' ? 'ring' : 'house', { focus: true }); }
    else if (!typing && ev.key === '/') { ev.preventDefault(); modal.bar(); }
    else if (!typing && (ev.key === '+' || ev.key === '=')) { ev.preventDefault(); stepZoom(1); }
    else if (!typing && (ev.key === '-' || ev.key === '_')) { ev.preventDefault(); stepZoom(-1); }
    else if (!typing && ev.key === '0') { ev.preventDefault(); stepZoom(0); }
    else if (ev.key === 'Escape' && ptab === 'house' && $('p-house').contains(t)) { showTab('ring', { focus: true }); }
    else if (ev.key === 'Escape' && panel.kind !== 'world') { const k = panel.key; showPanel({ kind: 'world' }); if (k) svg.querySelector(`[data-k="${k}"]`)?.focus(); }
    else if (!typing && (ev.key === 'f' || ev.key === 'F')) { ev.preventDefault(); $('faddr').focus(); $('faddr').select(); }
  });

  // ---------- data in, live ----------
  const unsub = subscribe((c) => {
    if (c.has('clock')) $('next').textContent = countdown() || '–';
    if (c.has('live') || c.has('tick') || c.has('age') || c.has('house')) hud();
    if (c.has('wars')) noteWars();
    if (c.has('worldmap')) noteTick();
    if (['worldmap', 'wars', 'relations', 'state', 'target'].some((k) => c.has(k)) || (c.has('house') && !world.realms.size)) { draw(); refreshPanel(); }
    if (c.has('target')) actBar();
    else if (c.has('live') && panel.kind === 'world') refreshPanel();
    house.update(c);
    modal.update(c);
  });
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const unworld = useWorld(subscribe);
  if (!store.wars) loadWars(); else noteWars();
  if (!store.relations) loadRelations();
  hud(); tools(); draw(); showPanel(panel); showTab('ring'); layout2();

  return {
    unmount() { ac.abort(); unsub(); unworld(); house.destroy(); modal.close(); if (dlg.open) dlg.close(); root.replaceChildren(); },
  };
}

/** The faces the ring is set in (the Straightline defaults), from Google Fonts while they're being chosen. */
function fonts() {
  if (document.getElementById('rg-fonts')) return;
  const l = document.createElement('link');
  l.id = 'rg-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Rosarivo&family=Source+Sans+3:wght@400;600;700&display=swap';
  document.head.append(l);
}
