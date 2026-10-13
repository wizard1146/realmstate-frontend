// The War Ring's drawing: 13 realms around a circle, each state a segment reaching out by its size, and lines across
// for wars, ceasefires and your state's feelings. Pure SVG markup from plain data; ring.js owns events and the panel.

export const W = 1000, C = W / 2;          // a square viewBox, centred
export const R1 = 268;                     // where segments start (and lines across end)
const REACH = 118;                         // the longest segment's reach past R1
const STUB = 7;                            // an empty state's stub
const REALM_GAP = 0.05, STATE_GAP = 0.009; // radians between realms, and between states
const LABEL_R = R1 + REACH + 44;           // realm names sit here

/** A point at angle a (0 = top, clockwise) and radius r. */
export const pt = (a, r) => [C + r * Math.sin(a), C - r * Math.cos(a)];
const f = (n) => n.toFixed(1);

/** Each state's angles: { key -> { a0, a1, mid } }, and each realm's { r -> { a0, a1, mid } }. */
export function layout(realms, perRealm) {
  const per = (2 * Math.PI) / realms, seg = {}, realm = {};
  for (let r = 1; r <= realms; r++) {
    const a0 = (r - 1) * per + REALM_GAP / 2, a1 = r * per - REALM_GAP / 2, sp = (a1 - a0) / perRealm;
    realm[r] = { a0, a1, mid: (a0 + a1) / 2 };
    for (let s = 1; s <= perRealm; s++) {
      const b0 = a0 + (s - 1) * sp + STATE_GAP / 2, b1 = a0 + s * sp - STATE_GAP / 2;
      seg[`${r}:${s}`] = { a0: b0, a1: b1, mid: (b0 + b1) / 2 };
    }
  }
  return { seg, realm };
}

/** How far a state reaches: in proportion to the largest (past a stub, so the smallest still shows); a stub if empty. */
export const reach = (v, max) => (v > 0 && max > 0 ? STUB + 6 + (v / max) * (REACH - STUB - 6) : STUB);

/** One segment: an annular sector from R1 out to R1 + len. */
export function sector(a0, a1, len, r0 = R1) {
  const r = r0 + len, [x0, y0] = pt(a0, r0), [x1, y1] = pt(a1, r0), [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r);
  return `M${f(x0)},${f(y0)} A${r0},${r0} 0 0 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${f(r)},${f(r)} 0 0 0 ${f(x3)},${f(y3)} Z`;
}
/** A thin arc (a realm's underline). */
export function arc(a0, a1, r) {
  const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
  return `M${f(x0)},${f(y0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(x1)},${f(y1)}`;
}
/** A line across between two angles: it bows toward the centre, more the farther apart they are
 *  (neighbours get a shallow arc near the rim, opposite states a curve through the middle). */
export function chord(a, b, r = R1 - 6) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const mid = a + d / 2, k = 0.62 * (1 - Math.abs(d) / Math.PI);
  const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r), [qx, qy] = pt(mid, r * k);
  return `M${f(x0)},${f(y0)} Q${f(qx)},${f(qy)} ${f(x1)},${f(y1)}`;
}
/** Where a realm's name goes, and how it's anchored so it reads level and clear of the ring. */
export function labelAt(mid) {
  const [x, y] = pt(mid, LABEL_R), s = Math.sin(mid);
  return { x, y, anchor: Math.abs(s) < 0.28 ? 'middle' : s > 0 ? 'start' : 'end' };
}
