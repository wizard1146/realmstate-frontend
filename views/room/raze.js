// Razing buildings (RES detail): tear finished buildings down, leaving barren land. The engine
// charges raze_cost_base + raze_cost_per_land_milli × land / 1000 gold a building (integer
// division), so the quote is exact.
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
/** Gold to raze one building now. */
export const razeEach = (h = store.house) => {
  const P = store.rules.params;
  return P.raze_cost_base + Math.floor((P.raze_cost_per_land_milli * h.land) / 1000);
};

export function razeHTML() {
  return `<form id="d-rz" class="dform" novalidate>
    <label for="d-rz-b">Building</label><select id="d-rz-b"></select>
    <label for="d-rz-n">Count</label>
    <span class="field"><input id="d-rz-n" type="number" min="1" value="1" inputmode="numeric"><button type="button" class="btn mini" data-rzmax aria-label="Most of this building you can raze">MAX</button></span>
    <span class="quote num span" id="d-rz-q"></span>
    <span class="btns span"><button class="btn danger">RAZE</button></span>
    <p class="dim small span" id="d-rz-info"></p>
  </form>`;
}

/** Wires the form inside `box`; RAZE buttons with data-raze="<building>" anywhere in `scope` pick a row. */
export function wireRaze(box, scope, on) {
  const $ = (id) => box.querySelector(`#d-rz-${id}`);
  function owned() { const h = store.house; return store.rules.buildings.filter((b) => (h.buildings[b.building] || 0) > 0); }
  function update() {
    const h = store.house;
    const list = owned();
    const v = $('b').value;
    const k = list.map((b) => `${b.building}:${h.buildings[b.building]}`).join();
    if ($('b').dataset.k !== k) {
      $('b').innerHTML = list.length ? list.map((b) => `<option value="${esc(b.building)}">${esc(b.name)} (${fmt(h.buildings[b.building])})</option>`).join('') : '<option value="">nothing built</option>';
      $('b').dataset.k = k;
      if (list.some((b) => b.building === v)) $('b').value = v;
    }
    const id = $('b').value;
    const have = h.buildings[id] || 0;
    const n = num($('n').value);
    const each = razeEach(h);
    const gold = n * each;
    const why = !id ? 'nothing built' : n > have ? `you have ${fmt(have)} of those` : gold > h.gold ? `needs ${fmt(gold)} gold; you have ${fmt(h.gold)}` : '';
    $('q').textContent = `${fmt(gold)} gold${why ? ` · ${why}` : ''}`;
    $('q').classList.toggle('short', !!why);
    $('info').textContent = `Exact: ${fmt(each)} gold a building now (${fmt(store.rules.params.raze_cost_base)} + ${store.rules.params.raze_cost_per_land_milli / 1000} × ${fmt(h.land)} acres). The land turns barren at once; buildings under construction can't be razed.`;
  }
  on(box, 'input', update);
  on(box, 'click', (ev) => {
    if (!ev.target.closest('[data-rzmax]')) return;
    const h = store.house;
    const have = h.buildings[$('b').value] || 0;
    const n = Math.min(have, Math.floor(h.gold / Math.max(1, razeEach(h))));
    $('n').value = String(n);
    if (!n) say(`MAX is 0: ${have ? 'not enough gold' : 'none built'}.`, 'bad');
    update();
  });
  on(scope, 'click', (ev) => {
    const b = ev.target.closest('[data-raze]');
    if (!b) return;
    $('b').value = b.dataset.raze;
    update();
    $('n').focus();
    $('n').select();
  });
  on(box.querySelector('#d-rz'), 'submit', async (ev) => {
    ev.preventDefault();
    const id = $('b').value, n = num($('n').value);
    if (!id || !n) { say('Choose a building and a count.', 'bad'); return; }
    const name = store.rules.buildings.find((b) => b.building === id)?.name || id;
    if (!confirm(`Raze ${n} ${name} for ${fmt(n * razeEach())} gold? The buildings are gone for good; the land turns barren.`)) return;
    await act.raze(id, n, { button: ev.submitter });
    update();
  });
  update();
  return { update };
}
