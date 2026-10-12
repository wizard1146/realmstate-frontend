// Straightline's "under way": a plain table of the jobs of some kinds (land arriving, construction), soonest first,
// from core/pending.js. tick() moves the "ready in" column each second without redrawing.
import * as pend from '../../core/pending.js';
import { esc } from '../../core/words.js';

/** The table, or a line saying nothing is under way (`none`). */
export function underwayHTML(kinds, none) {
  const items = pend.list(kinds);
  if (!items.length) return `<p class="dim">${esc(none)}</p>`;
  return `<table class="tbl uwl"><thead><tr><th>What</th><th class="num">Ready in</th><th>Finishes</th></tr></thead><tbody>${items.map((x) =>
    `<tr><td>${esc(pend.what(x))}</td><td class="num" data-to="${x.done_at}">${pend.leftText(pend.progress(x).left)}</td><td class="dim">${esc(pend.spreadText(x))}</td></tr>`).join('')}</tbody></table>`;
}

/** Moves every "ready in" cell under `root` to now. */
export function tickUnderway(root) {
  const now = Date.now();
  root.querySelectorAll('.uwl [data-to]').forEach((td) => { td.textContent = pend.leftText(Math.max(0, Number(td.dataset.to) - now)); });
}
