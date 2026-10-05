// Phones: a table too wide for the screen becomes a stack of cards, one per row: its first cell as the card's
// title, the rest as small "label value" pairs. The labels are the table's own column headings, copied onto
// each cell (data-label); only tables that don't fit get the "cards" class, so narrow ones stay tables. Works on
// any panel the page shows, as it redraws (a MutationObserver), with no change to the War Room's code.
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

/** Lays out every table under `host`: cards where a table is too wide for a phone, a table otherwise. */
export function cardify(host) {
  for (const t of host.querySelectorAll('table.tbl')) {
    t.classList.remove('cards');
    if (!phone() || !label(t)) continue;
    const box = t.parentElement.closest('.scrollx') || t.parentElement;
    if (t.scrollWidth > box.clientWidth + 1) t.classList.add('cards');
  }
}

/** Keeps `hosts` cardified as their panels redraw and the window changes size. Returns a stop function. */
export function watchCards(hosts, on) {
  let queued = false;
  const run = () => { queued = false; hosts.forEach(cardify); };
  const soon = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
  const mo = new MutationObserver(soon);
  for (const h of hosts) mo.observe(h, { childList: true, subtree: true });
  on(window, 'resize', soon);
  soon();
  return () => mo.disconnect();
}
