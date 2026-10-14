// Phones: a table too wide for the screen becomes a stack of cards, one per row: its first cell as the card's
// title, the rest as small "label value" pairs. The labels are the table's own column headings, copied onto
// each cell (data-label); only tables that don't fit get the "cards" class, so narrow ones stay tables. Works on
// any panel the page shows, as it redraws (a MutationObserver), with no change to the War Room's code. A table marked
// fit is never cards: it keeps one line a row and hides its least-needed columns instead (fit.js).
import { fit } from './fit.js';
const phone = () => matchMedia('(max-width: 760px)').matches;

/** Copies each column's heading onto its cells; marks rows that are one spanning cell (group headings). */
function label(t) {
  const rows = [...t.rows];
  const head = rows.find((r) => r.cells.length > 1 && [...r.cells].every((c) => c.tagName === 'TH'));
  if (!head) return false;
  const names = [];
  for (const c of head.cells) for (let k = 0; k < (c.colSpan || 1); k++) names.push(c.textContent.trim());
  head.classList.add('card-head');
  for (const r of rows) {
    if (r === head) continue;
    if (r.cells.length === 1 && r.cells[0].colSpan > 1) { r.classList.add('card-group'); continue; }
    // A row that leads with a number (a seat, a rank) is titled by its next cell instead.
    r.classList.toggle('lead-num', r.cells.length > 2 && /^\s*#?\d+\s*$/.test(r.cells[0].textContent));
    let col = 0;
    for (const c of r.cells) {
      const n = names[col];
      if (n && n !== c.textContent.trim()) c.dataset.label = n; else delete c.dataset.label;
      col += c.colSpan || 1;
    }
  }
  return true;
}

/** Lays out every table under `host`: cards where a table is too wide for a phone, a table otherwise. A table marked
 * nocards (a timeline, where the columns are the point) scrolls sideways instead. "Too wide" is measured as the
 * browser would lay the table out by itself (text wrapping, but names, numbers and inputs whole): a table with fixed
 * column widths never overflows, it squeezes its rows instead, so its own width says nothing.
 *
 * It measures a hidden copy, never the table on the page: taking a long card stack back to a table, even for a
 * moment, shortens the page, and the browser pulls a reader scrolled further down back up the page. A table only
 * changes when its answer does. */
export function cardify(host) {
  for (const t of host.querySelectorAll('table.tbl.fit')) fit(t);
  for (const t of host.querySelectorAll('table.tbl:not(.nocards, .fit)')) {
    if (!phone() || !label(t)) { t.classList.remove('cards'); continue; }
    const box = t.parentElement.closest('.scrollx') || t.parentElement;
    // The room it has: its box, but never more than the page (a table's fixed columns can stretch its own box wider).
    const room = Math.min(box.clientWidth, t.closest('.line-page')?.clientWidth || document.documentElement.clientWidth);
    const copy = t.cloneNode(true);
    copy.classList.remove('cards');
    copy.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    copy.removeAttribute('id');
    copy.setAttribute('aria-hidden', 'true');
    Object.assign(copy.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', left: '0', top: '0',
      width: `${room}px`, minWidth: '0', tableLayout: 'auto' });
    box.append(copy);
    const wide = copy.offsetWidth > room + 1;
    copy.remove();
    if (t.classList.contains('cards') !== wide) t.classList.toggle('cards', wide);
  }
}

/** Keeps `hosts` cardified as their panels redraw and the window changes size. Returns a stop function. */
export function watchCards(hosts, on) {
  let queued = false;
  const mo = new MutationObserver(() => soon());
  // Its own changes (the measuring copy, labels) are not redraws: drop their records so they don't start it again.
  const run = () => { queued = false; hosts.forEach(cardify); mo.takeRecords(); };
  function soon() { if (!queued) { queued = true; requestAnimationFrame(run); } }
  for (const h of hosts) mo.observe(h, { childList: true, subtree: true });
  on(window, 'resize', soon);
  soon();
  return () => mo.disconnect();
}
