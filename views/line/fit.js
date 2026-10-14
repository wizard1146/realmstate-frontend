// Straightline's fitting tables: one line a row at any width. A table marked `fit` names each column's priority on
// its heading (data-pri: 1 never hides, higher hides sooner; none is 1), and while the table is wider than its box the
// lowest-priority column still showing goes (the rightmost of equals first). One column may be the table's flexible
// one (.fx-flex on its cells): it takes the room the others leave, down to its min-width, and ends in "…" past that,
// its full text in a title. A name column (.fx-last) is the opposite: always whole, until every column that can go
// has gone and the table still doesn't fit; only then does it end in "…" too. Other long text may be capped
// (.fx-clip, a fixed most). line.css keeps the cells on one line. cards.js runs it as pages redraw and the window
// changes size; a fit table never becomes cards. Each table and its box are also watched, so a table fits itself
// again when it changes size without a redraw: its tab opening (no width to measure while hidden), or the view's
// stylesheet arriving after the first fit (until then nothing keeps a cell to one line).

/** Each column's priority, from the heading row. */
const prisOf = (t) => [...(t.tHead?.rows[0]?.cells || [])].map((c) => Number(c.dataset.pri) || 1);

const watched = new WeakSet();
const ro = new ResizeObserver((list) => {
  const ts = new Set();
  for (const e of list) {
    // A table or box taken off the page (a page redraws its tables often): stop watching it, so it can go.
    if (!e.target.isConnected) { ro.unobserve(e.target); watched.delete(e.target); continue; }
    (e.target.matches('table.fit') ? [e.target] : e.target.querySelectorAll(':scope > table.fit')).forEach((t) => ts.add(t));
  }
  ts.forEach(fit);
});
const watch = (el) => { if (!watched.has(el)) { watched.add(el); ro.observe(el); } };

/** Hides `t`'s lowest-priority columns until it fits its box. */
export function fit(t) {
  if (!t.isConnected) return;   // redrawn away since it was queued
  watch(t); watch(t.parentElement);
  if (!t.parentElement.clientWidth) return;   // not shown: the box's watcher fits it when it is
  const pris = prisOf(t);
  if (!pris.length) return;
  const rows = [...t.rows].filter((r) => r.cells.length === pris.length);   // a spanning group row has no columns
  const show = (i, on) => rows.forEach((r) => r.cells[i].classList.toggle('fx-off', !on));
  pris.forEach((_, i) => show(i, true));
  t.classList.remove('fx-squeeze');
  const room = t.parentElement.clientWidth;
  // The order they go in: highest priority number first, and the rightmost of equals.
  const order = pris.map((p, i) => [p, i]).filter(([p]) => p > 1).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  for (const [, i] of order) {
    if (t.offsetWidth <= room + 1) break;
    show(i, false);
  }
  if (t.offsetWidth > room + 1) t.classList.add('fx-squeeze');   // still too wide: the name gives way at last
  const off = order.filter(([, i]) => rows[0]?.cells[i].classList.contains('fx-off')).length;
  t.title = off ? `${off} column${off === 1 ? '' : 's'} hidden for room: a wider window shows ${off === 1 ? 'it' : 'them'}` : '';
}
