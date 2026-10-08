// The workshop's two War Room faces: the MIL pane's compact ticket and the MIL detail's table. The jobs themselves
// (medics, upgrades, chariots, refining, with their exact costs) are core/military.js's, shared with Straightline.
import { store } from '../../core/store.js';
import { jobs, jobById, recipes } from '../../core/military.js';
import { fmt, esc } from '../../core/words.js';

export { jobs, jobById };
const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const stock = (m) => store.house.materials[m] || 0;

// ---------- the MIL pane: one compact ticket ----------
export function paneHTML() {
  return `<form id="r-f-make" class="ticket make" novalidate>
    <span class="verb">MAKE</span>
    <span class="args"><label class="vh" for="r-mk-job">What to make</label><select id="r-mk-job"></select> <span class="dim">×</span> <label class="vh" for="r-mk-n">Count</label><input id="r-mk-n" type="number" min="1" value="10" class="w5"><button type="button" class="btn mini max" data-mkmax aria-label="Most you can make">MAX</button></span>
    <span class="cost num" id="r-mk-cost"></span>
    <button class="btn primary">EXEC</button>
  </form>`;
}
/** Wires the pane ticket inside `box`. Returns { update() }. */
export function wirePane(box, on, say) {
  const $ = (id) => box.querySelector(`#r-mk-${id}`);
  let key = '';
  function update() {
    if (!store.house) return;
    const list = jobs();
    const k = list.map((j) => j.id).join();
    if (k !== key) {
      const v = $('job').value;
      const groups = [...new Set(list.map((j) => j.group))];
      $('job').innerHTML = groups.map((g) => `<optgroup label="${g}">${list.filter((j) => j.group === g).map((j) => `<option value="${esc(j.id)}">${esc(j.label)}</option>`).join('')}</optgroup>`).join('');
      if (v && list.some((j) => j.id === v)) $('job').value = v;
      key = k;
    }
    const j = jobById($('job').value);
    if (!j) return;
    const q = j.quote(num($('n').value));
    const c = $('cost');
    c.textContent = q.text;
    c.title = `${j.label}: ${j.each} each. ${q.title}`;
    c.classList.toggle('short', q.short);
    box.querySelector('[data-mkmax]').disabled = !!j.noMax;
  }
  on(box, 'input', update);
  on(box, 'click', (ev) => {
    if (!ev.target.closest('[data-mkmax]')) return;
    const [n, why] = jobById($('job').value).max();
    if (n == null) return;
    $('n').value = String(n);
    if (!n) say(`MAX is 0: ${why}.`, 'bad');
    update();
  });
  on(box.querySelector('#r-f-make'), 'submit', async (ev) => {
    ev.preventDefault();
    const j = jobById($('job').value);
    const n = num($('n').value);
    if (!n) { say('Choose a count of at least 1.', 'bad'); return; }
    await j.send(n, { button: ev.submitter });
    update();
  });
  update();
  return { update };
}

// ---------- the MIL detail: the workshop table ----------
export function detailHTML() {
  return `<form id="d-mk" class="mk" novalidate aria-label="Workshop"><div class="scrollx"><table class="tbl mk-tbl" id="d-mk-t"></table></div></form>
    <p class="dim small" id="d-mk-note"></p>`;
}
export function wireDetail(box, on, say) {
  const t = box.querySelector('#d-mk-t');
  const counts = new Map();
  let key = '';
  function draw() {
    const list = jobs();
    key = list.map((j) => j.id).join();
    let g = '';
    t.innerHTML = '<tr><th>MAKE</th><th>EACH</th><th class="num">COUNT</th><th class="num">COST</th><th></th></tr>' + list.map((j) => {
      const head = j.group !== g ? `<tr class="grp"><td colspan="5">${(g = j.group)}</td></tr>` : '';
      const id = `d-mk-${j.id.replace(/[^a-z0-9]/gi, '-')}`;
      return `${head}<tr data-job="${esc(j.id)}"><td class="name"><label for="${id}">${esc(j.label)}</label>${j.note ? ` <small class="dim">${esc(j.note)}</small>` : ''}</td><td class="small dim">${esc(j.each)}</td>`
        + `<td class="num"><span class="field"><input id="${id}" type="number" min="0" step="1" inputmode="numeric" placeholder="0" class="w5" value="${counts.get(j.id) || ''}"><button type="button" class="btn mini" data-mkmax${j.noMax ? ' disabled title="The server does not send recipes, so MAX is unknown"' : ''} aria-label="Most ${esc(j.label)} you can make">MAX</button></span></td>`
        + `<td class="num mk-q"></td><td><button type="button" class="btn mini primary" data-mkgo aria-label="Make ${esc(j.label)}">EXEC</button></td></tr>`;
    }).join('');
    quotes();
  }
  function quotes() {
    for (const tr of t.querySelectorAll('tr[data-job]')) {
      const j = jobById(tr.dataset.job);
      if (!j) continue;
      const n = num(tr.querySelector('input').value);
      const q = tr.querySelector('.mk-q');
      if (!n) { q.textContent = ''; q.classList.remove('short'); continue; }
      const x = j.quote(n);
      q.textContent = x.text;
      q.title = x.title;
      q.classList.toggle('short', x.short);
    }
    const P = store.rules.params, h = store.house;
    box.querySelector('#d-mk-note').textContent = `You hold ${fmt(h.gold)} gold, ${fmt(h.horses)} horses, ${fmt(h.peasants)} peasants; ${[P.medic_material, P.upgrade_material, P.chariot_material].filter((m, i, a) => a.indexOf(m) === i).map((m) => `${fmt(stock(m))} ${m}`).join(', ')}. ≈ = before a modifier the server doesn't send; the result line has the real cost.${recipes() ? '' : ' Refining recipes aren\'t sent by the server, so their inputs and MAX are unknown here.'}`;
  }
  on(t, 'input', (ev) => { const tr = ev.target.closest('tr[data-job]'); if (tr) counts.set(tr.dataset.job, ev.target.value); quotes(); });
  on(t, 'click', async (ev) => {
    const tr = ev.target.closest('tr[data-job]');
    if (!tr) return;
    const j = jobById(tr.dataset.job);
    const inp = tr.querySelector('input');
    if (ev.target.closest('[data-mkmax]')) {
      const [n, why] = j.max();
      if (n == null) return;
      inp.value = String(n);
      counts.set(j.id, inp.value);
      if (!n) say(`MAX is 0: ${why}.`, 'bad');
      quotes();
      inp.focus();
    } else if (ev.target.closest('[data-mkgo]')) {
      const n = num(inp.value);
      if (!n) { say(`Choose how many ${j.label} first.`, 'bad'); inp.focus(); return; }
      const out = await j.send(n, { button: ev.target.closest('[data-mkgo]') });
      if (out) { inp.value = ''; counts.delete(j.id); }
      quotes();
    }
  });
  // Enter in a count runs that row.
  on(box.querySelector('#d-mk'), 'submit', (ev) => ev.preventDefault());
  on(t, 'keydown', (ev) => {
    if (ev.key !== 'Enter' || !ev.target.matches('input')) return;
    ev.preventDefault();
    ev.target.closest('tr[data-job]')?.querySelector('[data-mkgo]').click();
  });
  draw();
  return { update() { if (jobs().map((j) => j.id).join() !== key) draw(); else quotes(); } };
}
