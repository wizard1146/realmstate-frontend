// Straightline's "under way": a plain table of the jobs of some kinds (land arriving, construction), soonest first,
// from core/pending.js. tick() moves the "ready in" column each second without redrawing.
import * as pend from '../../core/pending.js';
import { esc, fmt, when } from '../../core/words.js';

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

/**
 * A timeline (a row a series, a column a tick) as a phone reads it: a line for each tick when something finishes,
 * "+3  Tue 14:05  120 Corsair, 40 Brineguard", then anything later. `series` is [{ name, ticks: [24 counts], later }];
 * `ends[k]` is when tick +k+1 falls. Shown instead of the table on narrow screens (line.css), so nothing squeezes.
 */
export function tickList(series, ends, none = 'Nothing under way.', at = when) {
  const lines = ends.map((t, k) => {
    const items = series.filter((s) => s.ticks[k]).map((s) => `${fmt(s.ticks[k])} ${esc(s.name)}`);
    return items.length ? `<li><b>+${k + 1}</b><span class="t">${esc(at(t))}</span><span class="w">${items.join(', ')}</span></li>` : '';
  }).join('');
  const later = series.filter((s) => s.later).map((s) => `${fmt(s.later)} ${esc(s.name)}`);
  const tail = later.length ? `<li><b>later</b><span class="t"></span><span class="w">${later.join(', ')}</span></li>` : '';
  return `<ul class="uw-phone">${lines + tail || `<li class="none">${esc(none)}</li>`}</ul>`;
}
