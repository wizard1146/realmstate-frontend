// The draft rate control for the war room (MIL pane and its detail): the share of your population
// to keep under arms. Each tick, while you are below it, peasants are drafted as soldiers.
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, SOLDIER } from '../../core/words.js';

const sum = (a) => (a || []).reduce((x, y) => x + y, 0);
/** Everyone under arms (every unit home and away, and in training) and its share of the population. */
export function armed(h) {
  const n = sum(h.units) + sum(h.away) + (h.training || 0);
  return { armed: n, pct: h.population > 0 ? (100 * n) / h.population : 0 };
}

/** The control's markup. p: id prefix; full: the detail view's longer version. */
export function draftHTML(p, full = false) {
  return `<form class="draft${full ? ' full' : ''}" id="${p}-f" novalidate>
    <label for="${p}-in">DRAFT</label>
    <span class="field"><input id="${p}-in" type="number" min="0" step="0.5" inputmode="decimal" class="w5"><span aria-hidden="true">%</span><button class="btn mini primary" id="${p}-go">APPLY</button></span>
    <span class="dr-now small num" id="${p}-now"></span>
    <span class="dr-bar" aria-hidden="true"><i class="arm"></i><b class="aim"></b></span>
  </form>
  <p class="dim small dr-note" id="${p}-note"></p>`;
}

/** Wires a control drawn by draftHTML. Returns { update() }. */
export function wireDraft(box, on, p, full = false) {
  const $ = (id) => box.querySelector(`#${p}-${id}`);
  const input = $('in');
  let dirty = false;
  const P = () => store.rules.params;

  function update() {
    const h = store.house;
    if (!h) return;
    const max = P().draft_max_bp / 100;
    input.max = String(max);
    const rate = (h.draft_bp ?? P().draft_default_bp) / 100;
    if (!dirty && document.activeElement !== input) input.value = String(rate);
    const a = armed(h);
    $('now').textContent = `armed ${a.pct.toFixed(1)}% of pop · aim ${rate}%`;
    $('now').title = `${fmt(a.armed)} under arms (${fmt(h.units[SOLDIER])} soldiers home) of ${fmt(h.population)} people`;
    $('now').classList.toggle('good', a.pct >= rate);
    const bar = box.querySelector('.dr-bar');
    bar.querySelector('.arm').style.width = `${Math.min(100, a.pct / Math.max(1, max) * 100)}%`;
    bar.querySelector('.aim').style.left = `${Math.min(100, rate / Math.max(1, max) * 100)}%`;
    const speed = (P().draft_speed_bp || 100) / 100;
    const gap = Math.max(0, Math.floor((rate / 100) * h.population) - a.armed);
    $('note').textContent = full
      ? `Each tick, while under arms is below the rate, up to ${speed}% of your peasants (${fmt(Math.floor(h.peasants * speed / 100))} now) are drafted as soldiers (1/1 each; train turns them into units). 0–${max}%. ${gap ? `${fmt(gap)} short of the aim.` : 'At or above the aim: no drafting.'} Peasants drafted no longer work or pay tax.`
      : `Up to ${speed}% of peasants a tick become soldiers until ${rate}% are under arms. 0–${max}%.${gap ? ` ${fmt(gap)} short.` : ''}`;
  }
  on(input, 'input', () => { dirty = true; });
  on($('f'), 'submit', async (ev) => {
    ev.preventDefault();
    const v = Number(input.value);
    const max = P().draft_max_bp / 100;
    if (!Number.isFinite(v) || v < 0 || v > max) { say(`A draft rate is 0–${max}%.`, 'bad'); return; }
    const out = await act.setDraft(Math.round(v * 100), { button: ev.submitter });
    if (out) { dirty = false; store.house.draft_bp = out.rate_bp; }
    update();
  });
  update();
  return { update };
}
