// "Under way": work in progress as rows with progress bars, for the war room's panes and detail
// views. Rows are drawn when /me changes; tick() moves the bars and countdowns every second
// without redrawing, so nothing jumps.
import * as pend from '../../core/pending.js';
import { esc, fmt, zoneLabel } from '../../core/words.js';

const pct = (f) => (f == null ? 0 : Math.round(f * 1000) / 10);

function row(x, full) {
  const p = pend.progress(x);
  const carries = full ? pend.carries(x) : [];
  const title = `${pend.KIND_LABEL[x.kind]} ${pend.what(x)}: ${pend.spreadText(x)} (${zoneLabel()})`
    + (p.approx ? ' (start time not recorded; bar assumes the usual length)' : '')
    + (!full && x.kind === 'army' ? ` · brings ${pend.carries(x).join(', ')}` : '');
  const unknown = p.frac == null;
  return `<li class="uw-row${unknown ? ' unknown' : ''}" data-from="${p.from ?? ''}" data-to="${x.done_at}" title="${esc(title)}">
    <span class="uw-k">${pend.KIND_LABEL[x.kind]}</span>
    <span class="uw-what">${esc(pend.what(x))}</span>
    <span class="uw-time num"><span class="uw-left">${pend.leftText(p.left)}</span> <span class="uw-at dim">${full ? esc(pend.spreadText(x)) : esc(pend.spanText(x))}</span></span>
    <span class="uw-bar" role="progressbar" aria-label="${esc(pend.what(x))}" aria-valuemin="0" aria-valuemax="100"${unknown ? '' : ` aria-valuenow="${pct(p.frac)}"`} aria-valuetext="${unknown ? '' : `${Math.floor(pct(p.frac))}%, `}${pend.leftText(p.left)} left"><i style="width:${pct(p.frac)}%"></i></span>
    ${full ? `<span class="uw-pct num dim">${unknown ? '' : `${Math.floor(pct(p.frac))}%`}</span>` : ''}
    ${carries.length ? `<span class="uw-carry">brings ${esc(carries.join(' · '))}</span>` : ''}
  </li>`;
}

/**
 * HTML for the jobs of some kinds. Compact: at most `limit` rows, then a "+n more" button that
 * opens the detail view `more` (the caller wires [data-expand]). Full: every row, totals first.
 */
export function html(kinds, { full = false, limit = 4, more = '' } = {}) {
  const items = pend.list(kinds);
  if (!items.length) return `<p class="uw-none dim">Nothing under way.${kinds.includes('explore') ? ' Explore and build from ACT.' : ' Train from ACT; armies show here on the way home.'}</p>`;
  // Totals per kind: always in full; in a pane only where a kind has several rows.
  const tot = pend.totals(items).filter((t) => full || items.filter((x) => x.kind === t.kind).length > 1);
  const totals = !tot.length ? '' : `<p class="uw-tot">${tot.map((t) => `<span><b>${pend.KIND_LABEL[t.kind]}</b> ${esc(pend.totalText(t))}</span>`).join('')}</p>`;
  const shown = full ? items : items.slice(0, limit);
  const rest = items.length - shown.length;
  return `${totals}<ol class="uw${full ? ' full' : ''}">${shown.map((x) => row(x, full)).join('')}</ol>`
    + (rest > 0 ? `<button type="button" class="btn mini uw-more" data-expand="${esc(more)}">+${fmt(rest)} more · detail</button>` : '');
}

/** Moves every bar and countdown under `root` to now. */
export function tick(root) {
  const now = Date.now();
  root.querySelectorAll('.uw-row[data-to]').forEach((li) => {
    const to = Number(li.dataset.to);
    const from = li.dataset.from === '' ? null : Number(li.dataset.from);
    const left = Math.max(0, to - now);
    const leftText = pend.leftText(left);
    li.querySelector('.uw-left').textContent = leftText;
    li.classList.toggle('due', left === 0);
    const bar = li.querySelector('.uw-bar');
    if (from == null || to <= from) { bar.setAttribute('aria-valuetext', `${leftText} left`); return; }
    const f = Math.min(1, Math.max(0, (now - from) / (to - from)));
    bar.firstElementChild.style.width = `${pct(f)}%`;
    bar.setAttribute('aria-valuenow', String(pct(f)));
    bar.setAttribute('aria-valuetext', `${Math.floor(pct(f))}%, ${leftText} left`);
    const pc = li.querySelector('.uw-pct');
    if (pc) pc.textContent = `${Math.floor(pct(f))}%`;
  });
}
