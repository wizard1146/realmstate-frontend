// The world as a hex map in inline SVG. Deterministic: every realm, state and seat has a fixed place.
//
// A state is a hexagon. A realm is a "flower" of seven: state 1 in the middle, 2-7 around it.
// The 13 realms tile the plane as flowers: realm 1 in the centre, 2-7 around it, 8-13 outside.
// Inside a state hex, 15 seats: seat 1 at the centre, 2-7 on an inner ring, 8-15 on an outer ring.
//
// House names: your house and the selected house are always labelled. Other names show only when
// zoomed in close, and only where they fit without covering another name or mark (greedy placement,
// biggest houses first, trying below / above / right / left). Any house shows its name on hover or
// keyboard focus.

const NS = 'http://www.w3.org/2000/svg';
export const S = 60; // hex circumradius, in map units
const R3 = Math.sqrt(3);
const LABEL_PX = 11.5; // house name size on screen, px
const NEAR = 2.2;      // screen px per map unit at which other houses' names may show
const MID = 1.3;       // ... at which empty seats and state numbers show

const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const FLOWER = [[2, 1], [-1, 3], [-3, 2], [-2, -1], [1, -3], [3, -2]];
const REALM_AT = [[0, 0], ...FLOWER, ...FLOWER.map((v, i) => { const w = FLOWER[(i + 1) % 6]; return [v[0] + w[0], v[1] + w[1]]; })];
const STATE_AT = [[0, 0], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];

const px = (q, r) => [S * R3 * (q + r / 2), S * 1.5 * r];

export function statePos(realm, state) {
  const [fq, fr] = REALM_AT[realm - 1] || [0, 0];
  const [sq, sr] = STATE_AT[state - 1] || [0, 0];
  return { q: fq + sq, r: fr + sr, xy: px(fq + sq, fr + sr) };
}

export function seatPos(realm, state, seat) {
  const [cx, cy] = statePos(realm, state).xy;
  if (seat <= 1) return [cx, cy];
  if (seat <= 7) { const a = (-90 + (seat - 2) * 60) * Math.PI / 180; return [cx + 0.36 * S * Math.cos(a), cy + 0.36 * S * Math.sin(a)]; }
  const a = (-90 + 22.5 + (seat - 8) * 45) * Math.PI / 180;
  return [cx + 0.70 * S * Math.cos(a), cy + 0.70 * S * Math.sin(a)];
}

/** Mark radius by land: 400 acres (a new house) is about 6.4 units. */
export const markR = (land) => Math.max(3.5, Math.min(11, 3.2 * Math.sqrt(Math.max(land, 1) / 100)));

const hexPoints = ([cx, cy], s = S) => Array.from({ length: 6 }, (_, k) => {
  const a = (60 * k - 30) * Math.PI / 180; return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`;
}).join(' ');

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// Text width in screen px, measured with the same font the labels use.
const ctx2d = document.createElement('canvas').getContext('2d');
let labelFont = 'system-ui, sans-serif';
function textWidth(text, weight) {
  ctx2d.font = `${weight} ${LABEL_PX}px ${labelFont}`;
  return ctx2d.measureText(text).width;
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export class WorldMap {
  /**
   * svg: the <svg> element. onHouse(h) when a house is chosen; onState(r, s) when a state is clicked;
   * onView(stateKeys, scale) when the view settles, with the 'r:s' keys of the states on screen.
   */
  constructor(svg, { realms, states, seats, onHouse, onState, onView }) {
    this.svg = svg; this.realms = realms; this.states = states; this.seats = seats;
    this.onHouse = onHouse; this.onState = onState; this.onView = onView;
    this.houses = new Map(); // id -> public house
    this.me = null;          // {id, realm, state}
    this.selected = null;
    this.k = 1;              // map units per screen px
    labelFont = getComputedStyle(svg).fontFamily || labelFont;
    this.build();
    this.view = this.extent();
    this.setView(this.view, false);
    this.bindPanZoom();
  }

  extent() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let r = 1; r <= this.realms; r++) for (let s = 1; s <= this.states; s++) {
      const [x, y] = statePos(r, s).xy;
      x0 = Math.min(x0, x - S); x1 = Math.max(x1, x + S); y0 = Math.min(y0, y - S); y1 = Math.max(y1, y + S);
    }
    const pad = 20;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }

  build() {
    const svg = this.svg;
    svg.replaceChildren();
    const defs = el('defs', {}, svg);
    const pat = el('pattern', { id: 'hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 8, class: 'hatch-line' }, pat);

    this.gStates = el('g', { class: 'states' }, svg);
    this.gBorders = el('g', { class: 'borders' }, svg);
    this.gWars = el('g', { class: 'wars' }, svg);
    this.gSeats = el('g', { class: 'seats' }, svg);
    this.gPulse = el('g', { class: 'pulses' }, svg);
    this.gHouses = el('g', { class: 'houses' }, svg);
    this.gLabels = el('g', { class: 'labels' }, svg);
    this.gNames = el('g', { class: 'names' }, svg);
    this.gHover = el('g', { class: 'hover-name' }, svg);
    this.hoverText = el('text', { class: 'house-label hover', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, this.gHover);
    this.hoverText.style.display = 'none';

    const owner = new Map(); // "q,r" -> realm
    this.stateEls = new Map();
    for (let r = 1; r <= this.realms; r++) for (let s = 1; s <= this.states; s++) {
      const p = statePos(r, s);
      owner.set(`${p.q},${p.r}`, r);
      const hex = el('polygon', { points: hexPoints(p.xy, S - 1), class: `state realm-tone-${r % 3}`, 'data-r': r, 'data-s': s }, this.gStates);
      hex.addEventListener('click', () => this.onState && this.onState(r, s));
      this.stateEls.set(`${r}:${s}`, hex);
      el('text', { x: p.xy[0], y: p.xy[1] + S * 0.93 - 6, class: 'state-label' }, this.gLabels).textContent = `${r}:${s}`;
      for (let k = 1; k <= this.seats; k++) {
        const [x, y] = seatPos(r, s, k);
        el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.6, class: 'seat' }, this.gSeats);
      }
    }
    const edges = (realm) => {
      let d = '';
      for (let s = 1; s <= this.states; s++) {
        const p = statePos(realm, s); const [cx, cy] = p.xy;
        for (const [dq, dr] of DIRS) {
          if (owner.get(`${p.q + dq},${p.r + dr}`) === realm) continue;
          const [nx, ny] = px(p.q + dq, p.r + dr);
          const mx = (cx + nx) / 2, my = (cy + ny) / 2, ux = (nx - cx) / (R3 * S), uy = (ny - cy) / (R3 * S);
          d += `M${(mx - uy * S / 2).toFixed(1)},${(my + ux * S / 2).toFixed(1)}L${(mx + uy * S / 2).toFixed(1)},${(my - ux * S / 2).toFixed(1)}`;
        }
      }
      return d;
    };
    let all = '';
    for (let r = 1; r <= this.realms; r++) all += edges(r);
    el('path', { d: all, class: 'realm-border' }, this.gBorders);
    this.myBorder = el('path', { d: '', class: 'realm-border mine' }, this.gBorders);
    this.myBorderD = edges;
    this.realmLabels = [];
    for (let r = 1; r <= this.realms; r++) {
      const [x, y] = statePos(r, 1).xy;
      const t = el('text', { x, y: y - S * 1.62, class: 'realm-label' }, this.gLabels);
      t.textContent = `Realm ${r}`;
      this.realmLabels[r] = t;
    }
  }

  setRealmMaterials(materials) {
    materials.forEach((m, r) => { if (m && this.realmLabels[r]) this.realmLabels[r].textContent = `Realm ${r} · ${m}`; });
  }

  setMe(me) {
    this.me = me;
    this.stateEls.forEach((e) => e.classList.remove('mine'));
    if (!me) { this.myBorder.setAttribute('d', ''); this.drawHouses(); return; }
    this.stateEls.get(`${me.realm}:${me.state}`)?.classList.add('mine');
    this.myBorder.setAttribute('d', this.myBorderD(me.realm));
    this.drawHouses();
  }

  /** Replace the houses shown. The caller passes everything it knows, so nothing stale lingers. */
  setHouses(list) {
    this.houses = new Map(list.map((h) => [h.id, h]));
    this.drawHouses();
  }

  drawHouses() {
    const g = this.gHouses;
    g.replaceChildren();
    this.houseEls = new Map();
    const sorted = [...this.houses.values()].sort((a, b) => a.id - b.id);
    for (const h of sorted) {
      const [x, y] = seatPos(h.realm, h.state, h.seat);
      const mine = this.me && h.id === this.me.id;
      const statemate = this.me && !mine && h.realm === this.me.realm && h.state === this.me.state;
      const a = el('g', {
        class: `house${mine ? ' mine' : ''}${statemate ? ' mate' : ''}${h.protected ? ' protected' : ''}${this.selected === h.id ? ' selected' : ''}`,
        transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`, tabindex: 0, role: 'button',
        'aria-label': `${h.name}, ${h.realm}:${h.state}:${h.seat}, ${h.land} acres${mine ? ' (your house)' : ''}${h.protected ? ', protected' : ''}`,
        'data-id': h.id,
      }, g);
      const rad = markR(h.land);
      if (mine) el('circle', { r: rad + 3.5, class: 'halo' }, a);
      if (h.protected) el('circle', { r: rad + 2.2, class: 'shield' }, a);
      el('circle', { r: rad, class: 'mark' }, a);
      el('circle', { r: rad + 6, class: 'hit' }, a);
      const go = () => this.onHouse && this.onHouse(h);
      a.addEventListener('click', (ev) => { ev.stopPropagation(); go(); });
      a.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
      a.addEventListener('pointerenter', () => this.hover(h));
      a.addEventListener('pointerleave', () => this.hover(null));
      a.addEventListener('focus', () => this.hover(h));
      a.addEventListener('blur', () => this.hover(null));
      this.houseEls.set(h.id, a);
    }
    this.placeLabels();
  }

  /** Name boxes (map units) around a mark, in order of preference: below, above, right, left. */
  labelSpots(h, weight) {
    const [x, y] = seatPos(h.realm, h.state, h.seat);
    const k = this.k;
    const w = (textWidth(h.name, weight) + 6) * k, ht = LABEL_PX * 1.3 * k, gap = 1.5 * k;
    const r = markR(h.land) + (this.me && h.id === this.me.id ? 3.5 : 1.5);
    return [[x, y + r + gap + ht / 2], [x, y - r - gap - ht / 2], [x + r + gap + w / 2, y], [x - r - gap - w / 2, y]]
      .map(([cx, cy]) => ({ cx, cy, x0: cx - w / 2, x1: cx + w / 2, y0: cy - ht / 2, y1: cy + ht / 2 }));
  }

  placeLabels() {
    const g = this.gNames;
    g.replaceChildren();
    this.labelled = new Set();
    const near = 1 / this.k > NEAR;
    const marks = [...this.houses.values()].map((h) => {
      const [x, y] = seatPos(h.realm, h.state, h.seat); const r = markR(h.land) + (this.me && h.id === this.me.id ? 3.5 : 0) + 0.5;
      return { id: h.id, x0: x - r, x1: x + r, y0: y - r, y1: y + r };
    });
    const isMine = (h) => this.me && h.id === this.me.id;
    const rank = (h) => (isMine(h) ? 2 : 0) + (h.id === this.selected ? 1 : 0);
    const order = [...this.houses.values()].sort((a, b) => rank(b) - rank(a) || b.land - a.land || a.id - b.id);
    const placed = [];
    for (const h of order) {
      const forced = rank(h) > 0;
      if (!forced && !near) continue;
      const weight = isMine(h) ? 700 : 500;
      const spots = this.labelSpots(h, weight);
      let spot = spots.find((b) => !placed.some((p) => overlaps(p, b)) && !marks.some((m) => m.id !== h.id && overlaps(m, b)));
      if (!spot && forced) spot = spots.find((b) => !placed.some((p) => overlaps(p, b))) || spots[0];
      if (!spot) continue;
      placed.push(spot);
      this.labelled.add(h.id);
      const t = el('text', { x: spot.cx.toFixed(1), y: spot.cy.toFixed(1), class: `house-label${isMine(h) ? ' mine' : ''}${h.id === this.selected ? ' selected' : ''}`, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      t.textContent = h.name;
    }
    if (this.hovered) this.hover(this.hovered);
  }

  /** Show one house's name on top while it is hovered or focused (if it has no label already). */
  hover(h) {
    this.hovered = h;
    const t = this.hoverText;
    if (!h || (this.labelled && this.labelled.has(h.id))) { t.style.display = 'none'; return; }
    const spot = this.labelSpots(h, 600)[0];
    t.setAttribute('x', spot.cx.toFixed(1)); t.setAttribute('y', spot.cy.toFixed(1));
    t.textContent = h.name;
    t.style.display = '';
  }

  select(id) {
    this.selected = id;
    if (!this.houseEls) return;
    this.houseEls.forEach((e, k) => e.classList.toggle('selected', k === id));
    this.placeLabels();
  }

  setWars(w) {
    const g = this.gWars;
    g.replaceChildren();
    this.stateEls.forEach((e) => e.classList.remove('at-war'));
    const line = (a, b, cls) => {
      const [x1, y1] = statePos(a.realm, a.state).xy, [x2, y2] = statePos(b.realm, b.state).xy;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
      el('path', { d: `M${x1},${y1} Q${mx - dy * 0.18},${my + dx * 0.18} ${x2},${y2}`, class: cls }, g);
    };
    for (const war of (w && w.wars) || []) {
      line(war.a, war.b, 'war-line');
      for (const s of [war.a, war.b]) {
        this.stateEls.get(`${s.realm}:${s.state}`)?.classList.add('at-war');
        el('polygon', { points: hexPoints(statePos(s.realm, s.state).xy, S - 3), class: 'war-hatch' }, g);
      }
    }
    for (const c of (w && w.ceasefires) || []) if (c.a && c.b) line(c.a, c.b, 'ceasefire-line');
  }

  // ---- view: pan and zoom by viewBox ----
  setView(v, animate = true) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    cancelAnimationFrame(this.anim);
    const apply = (b) => {
      this.view = b;
      this.svg.setAttribute('viewBox', `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}`);
      const scale = Math.min((this.svg.clientWidth || 1) / b.w, (this.svg.clientHeight || 1) / b.h); // screen px per map unit
      this.k = 1 / scale;
      this.svg.style.setProperty('--k', this.k.toFixed(4));
      this.svg.classList.toggle('z-near', scale > NEAR);
      this.svg.classList.toggle('z-mid', scale > MID);
    };
    if (!animate || reduce) { apply(v); this.settle(); return; }
    const from = { ...this.view }, t0 = performance.now(), dur = 420;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
      apply({ x: from.x + (v.x - from.x) * e, y: from.y + (v.y - from.y) * e, w: from.w + (v.w - from.w) * e, h: from.h + (v.h - from.h) * e });
      if (k < 1) this.anim = requestAnimationFrame(step); else this.settle();
    };
    this.anim = requestAnimationFrame(step);
  }

  /** After the view stops moving: re-place names, and tell the owner which states are on screen. */
  settle() {
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.placeLabels();
      if (this.onView) this.onView(this.visibleStates(), 1 / this.k);
    }, 180);
  }

  /** 'r:s' keys of states whose hex is at least partly on screen. */
  visibleStates() {
    const W = this.svg.clientWidth || 1, H = this.svg.clientHeight || 1, v = this.view;
    const s = Math.max(v.w / W, v.h / H); // preserveAspectRatio meet: the screen shows a bit more
    const vw = W * s, vh = H * s, x0 = v.x - (vw - v.w) / 2, y0 = v.y - (vh - v.h) / 2;
    const out = [];
    for (let r = 1; r <= this.realms; r++) for (let st = 1; st <= this.states; st++) {
      const [x, y] = statePos(r, st).xy;
      if (x + S > x0 && x - S < x0 + vw && y + S > y0 && y - S < y0 + vh) out.push(`${r}:${st}`);
    }
    return out;
  }

  /** Frame a box of map units around (cx, cy) of the given half-size, fitting the screen's aspect. */
  frame(cx, cy, half, animate = true) {
    const W = this.svg.clientWidth || 1, H = this.svg.clientHeight || 1, asp = W / H;
    let w = half * 2, h = half * 2;
    if (asp > 1) w = h * asp; else h = w / asp;
    this.setView({ x: cx - w / 2, y: cy - h / 2, w, h }, animate);
  }
  showWorld(animate = true) { const e = this.extent(); this.frame(e.x + e.w / 2, e.y + e.h / 2, Math.max(e.w, e.h) * 0.54, animate); }
  showRealm(r, animate = true) { const [x, y] = statePos(r, 1).xy; this.frame(x, y, S * 3.1, animate); }
  showState(r, s, animate = true) { const [x, y] = statePos(r, s).xy; this.frame(x, y, this.near(), animate); }
  showHouse(h, animate = true) { const [x, y] = seatPos(h.realm, h.state, h.seat); this.frame(x, y, this.near(), animate); }
  /** Half-size of a "close" view: one state fills a phone; on a wide screen its neighbours show too. */
  near() { return Math.min(this.svg.clientWidth, this.svg.clientHeight) < 600 ? S * 1.15 : S * 2.6; }

  zoomBy(f, cx, cy) {
    const v = this.view;
    if (cx === undefined) { cx = v.x + v.w / 2; cy = v.y + v.h / 2; }
    const e = this.extent();
    const w = Math.min(Math.max(v.w * f, S * 1.2), e.w * 2.2), k = w / v.w;
    this.setView({ x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w: v.w * k, h: v.h * k }, false);
  }

  toMap(clientX, clientY) {
    const b = this.svg.getBoundingClientRect(), v = this.view;
    const s = Math.max(v.w / b.width, v.h / b.height);
    const ox = (b.width * s - v.w) / 2, oy = (b.height * s - v.h) / 2;
    return [v.x - ox + (clientX - b.left) * s, v.y - oy + (clientY - b.top) * s];
  }

  bindPanZoom() {
    const svg = this.svg;
    const pts = new Map();
    let last = null, moved = 0;
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const [x, y] = this.toMap(ev.clientX, ev.clientY);
      this.zoomBy(Math.exp(ev.deltaY * 0.0015), x, y);
    }, { passive: false });
    svg.addEventListener('pointerdown', (ev) => { pts.set(ev.pointerId, [ev.clientX, ev.clientY]); moved = 0; last = null; });
    svg.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return;
      const prev = pts.get(ev.pointerId);
      pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pts.size === 1) {
        const dx = ev.clientX - prev[0], dy = ev.clientY - prev[1];
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved < 4) return;
        if (!svg.hasPointerCapture(ev.pointerId)) svg.setPointerCapture(ev.pointerId);
        svg.classList.add('panning');
        const b = svg.getBoundingClientRect(), s = Math.max(this.view.w / b.width, this.view.h / b.height);
        this.setView({ ...this.view, x: this.view.x - dx * s, y: this.view.y - dy * s }, false);
      } else if (pts.size === 2) {
        const [a, b2] = [...pts.values()];
        const dist = Math.hypot(a[0] - b2[0], a[1] - b2[1]);
        if (last) { const [x, y] = this.toMap((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2); this.zoomBy(last / dist, x, y); }
        last = dist; moved = 99;
      }
    });
    const end = (ev) => {
      pts.delete(ev.pointerId); last = null;
      svg.classList.remove('panning');
      if (moved > 4) { // a drag, not a click: swallow the click that follows
        const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
        svg.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => svg.removeEventListener('click', stop, { capture: true }), 0);
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  /** The tick pulse: a ring breathes out from your house. */
  pulse() {
    const h = this.me && this.houses.get(this.me.id);
    if (!h) return;
    const [x, y] = seatPos(h.realm, h.state, h.seat);
    const ring = el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: markR(h.land) + 4, class: 'pulse-ring' }, this.gPulse);
    setTimeout(() => ring.remove(), 2600);
    this.svg.classList.remove('tick'); void this.svg.getBoundingClientRect(); this.svg.classList.add('tick');
  }

  destroy() { cancelAnimationFrame(this.anim); clearTimeout(this.settleTimer); }
}
