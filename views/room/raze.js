// Razing buildings (RES detail): tear finished buildings down, leaving barren land. The cost and
// limits are core/land.js's (exact: the engine's own integer formula).
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc } from '../../core/words.js';
import { razeEach, razeable, razeMax, razeProblem } from '../../core/land.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));

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
  function update() {
    const h = store.house;
    const list = razeable(h);
    const v = $('b').value;
    const k = list.map((b) => `${b.building}:${h.buildings[b.building]}`).join();
    if ($('b').dataset.k !== k) {
      $('b').innerHTML = list.length ? list.map((b) => `<option value="${esc(b.building)}">${esc(b.name)} (${fmt(h.buildings[b.building])})</option>`).join('') : '<option value="">nothing built</option>';
      $('b').dataset.k = k;
      if (list.some((b) => b.building === v)) $('b').value = v;
    }
    const id = $('b').value;
    const n = num($('n').value);
    const each = razeEach(h);
    const gold = n * each;
    const why = razeProblem(id, n, h);
    $('q').textContent = `${fmt(gold)} gold${why ? ` · ${why}` : ''}`;
    $('q').classList.toggle('short', !!why);
    $('info').textContent = `Exact: ${fmt(each)} gold a building now (${fmt(store.rules.params.raze_cost_base)} + ${store.rules.params.raze_cost_per_land_milli / 1000} × ${fmt(h.land)} acres). The land turns barren at once; buildings under construction can't be razed.`;
  }
  on(box, 'input', update);
  on(box, 'click', (ev) => {
    if (!ev.target.closest('[data-rzmax]')) return;
    const have = store.house.buildings[$('b').value] || 0;
    const n = razeMax($('b').value);
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
