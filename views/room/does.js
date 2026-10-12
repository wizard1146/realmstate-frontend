// The War Room's DOES cell: what a building does now and with 1% more land, from core/does.js.
import { store } from '../../core/store.js';
import { fmt, esc } from '../../core/words.js';
import { does } from '../../core/does.js';

export { STATS, pctBp } from '../../core/does.js';

/** The DOES cell for a building id: now (bright) and +1% land (dim). Returns { html, title } or null. */
export function doesCell(id, h = store.house) {
  const x = does(id, h);
  if (!x) return null;
  const join = (p) => p.map((y) => y.short).join(' · ');
  const html = `<span class="does-now">${x.now.length ? esc(join(x.now)) : '<span class="zero">nothing yet</span>'}</span>`
    + `<span class="does-more">+1% land (+${fmt(x.extra)}): ${esc(join(x.more) || 'no change')}</span>`;
  const title = `Now: ${x.now.map((y) => y.long).join('; ') || 'nothing (none built)'}\nWith 1% more land in it (${fmt(x.total)} in all): ${x.more.map((y) => y.long).join('; ') || 'no change'}`;
  return { html, title };
}
