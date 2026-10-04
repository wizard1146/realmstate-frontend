// The workshop: things you make from gold and materials — medics, unit upgrades, chariots and
// refined materials. One list of jobs drives both the MIL pane's compact ticket and the MIL
// detail's table. Costs follow the engine (military.rs, buildings.rs):
//   medics:   n × medic_gold gold + n × medic_material_cost medic material + n peasants (exact)
//   upgrade:  n × upgrade_cost (upgrade_cost_elite for elites) upgrade material, × your
//             upgrade-cost modifier (exact from prices.upgrade; ≈ on an old server)
//   chariots: n × chariot_horses horses + chariot_material_cost material + chariot_gold gold (exact)
//   refine:   the age's recipes (/rules recipes); the yield × your refining modifier (prices.refine).
import { store, raceOf } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as price from '../../core/prices.js';
import { fmt, esc, ELITE_PP } from '../../core/words.js';

const BATCH = 1000000;
const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const ELITE_SLOTS = [3, 7, ELITE_PP];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const stock = (m) => store.house.materials[m] || 0;

/** The age's refining recipes as [{ id, inputs: {material: qty}, output, quantity }], or null if the server doesn't send them. */
function recipes() {
  const r = store.rules.recipes || store.rules.params.recipes;
  if (!Array.isArray(r)) return null;
  return r.map((x) => ({ id: x.recipe ?? x.id, inputs: Array.isArray(x.inputs) ? Object.fromEntries(x.inputs) : x.inputs || {}, output: x.output, quantity: x.quantity }));
}
/** Materials no realm produces (made by refining), from /market, when the recipes are unknown. */
const derived = () => (store.market || []).filter((m) => !m.output_per_tick && !(m.realms || []).length);

/**
 * Every job: { id, group, label, each, quote(n) -> { text, title, short, exact }, max() -> [n, why], send(n, opts) }.
 */
export function jobs() {
  const P = store.rules.params;
  const h = store.house;
  const race = raceOf(h.race) || { units: [] };
  const out = [];
  // medics
  const mm = P.medic_material;
  out.push({
    id: 'medics', group: 'TRAIN', label: 'Medics',
    each: `${fmt(P.medic_gold)}g + ${fmt(P.medic_material_cost)} ${mm} + 1 peasant`,
    quote(n) {
      const g = n * P.medic_gold, m = n * P.medic_material_cost;
      const why = g > h.gold ? `needs ${fmt(g)} gold; you have ${fmt(h.gold)}` : m > stock(mm) ? `needs ${fmt(m)} ${mm}; you have ${fmt(stock(mm))}` : n > h.peasants ? `needs ${fmt(n)} peasants; you have ${fmt(h.peasants)}` : n > BATCH ? `at most ${fmt(BATCH)} at a time` : '';
      return { text: `${fmt(g)}g +${fmt(m)} ${mm}`, short: !!why, why, exact: true, title: why ? `Can't: ${why}` : `Exact: ${fmt(g)} gold, ${fmt(m)} ${mm} and ${fmt(n)} peasants; ready in about ${P.train_ticks} ticks` };
    },
    max() {
      const n = Math.min(BATCH, Math.floor(h.gold / Math.max(1, P.medic_gold)), P.medic_material_cost ? Math.floor(stock(mm) / P.medic_material_cost) : BATCH, h.peasants);
      return [n, h.gold < P.medic_gold ? 'not enough gold for one' : stock(mm) < P.medic_material_cost ? `no ${mm} (buy some on the MARKET)` : 'no peasants'];
    },
    send: (n, o) => act.trainMedics(n, o),
  });
  // upgrades: offense, defense, elite, and elite+ -> elite++ (races that upgrade twice; the server decides)
  const um = P.upgrade_material;
  const ups = [[1, 5], [2, 6], [3, 7]];
  // Elite+ -> elite++ only for races with the flag (unknown on an old server: offer it, the server decides).
  if (race.units[ELITE_PP] && price.raceHas(h.race, 'elite_plus_plus') !== false) ups.push([7, ELITE_PP]);
  for (const [from, to] of ups) {
    const per = ELITE_SLOTS.includes(from) ? P.upgrade_cost_elite : P.upgrade_cost;
    // Exact when the server sends prices.upgrade; otherwise ≈ before the modifier.
    const exact = price.upgradeCost(from, 1) != null;
    const cost = (n) => (exact ? price.upgradeCost(from, n) : n * per);
    const ap = exact ? '' : '≈';
    const fu = race.units[from] || { name: `slot ${from}` }, tu = race.units[to] || { name: `slot ${to}` };
    out.push({
      id: `upgrade:${from}`, group: 'UPGRADE', label: `${fu.name} → ${tu.name}`,
      note: from === 7 ? 'races that upgrade twice' : '',
      each: `${ap}${fmt(cost(1))} ${um}`,
      quote(n) {
        const m = cost(n);
        const why = n > h.units[from] ? `you have ${fmt(h.units[from])} ${fu.name} at home` : m > stock(um) ? `needs ${ap}${fmt(m)} ${um}; you have ${fmt(stock(um))}` : '';
        return { text: `${ap}${fmt(m)} ${um}`, short: !!why, why, exact, title: why ? `Can't: ${why}` : `${exact ? 'Exact' : `≈ before your upgrade-cost modifier (an old server doesn't send it)`}: ${fmt(m)} ${um}. ${fmt(n)} ${fu.name} train for about ${P.train_ticks} ticks.` };
      },
      max() {
        const n = exact ? price.largest(Math.min(BATCH, h.units[from]), (k) => cost(k) <= stock(um)) : Math.min(BATCH, h.units[from], per ? Math.floor(stock(um) / per) : BATCH);
        return [n, !h.units[from] ? `no ${fu.name} at home` : `no ${um} (buy some on the MARKET)`];
      },
      send: (n, o) => act.upgrade(from, n, o),
    });
  }
  // chariots
  const cm = P.chariot_material;
  out.push({
    id: 'chariots', group: 'BUILD', label: 'Chariots',
    each: `${fmt(P.chariot_horses)} horse + ${fmt(P.chariot_material_cost)} ${cm} + ${fmt(P.chariot_gold)}g`,
    quote(n) {
      const hs = n * P.chariot_horses, m = n * P.chariot_material_cost, g = n * P.chariot_gold;
      const why = hs > h.horses ? `needs ${fmt(hs)} horses at home; you have ${fmt(h.horses)}` : m > stock(cm) ? `needs ${fmt(m)} ${cm}; you have ${fmt(stock(cm))}` : g > h.gold ? `needs ${fmt(g)} gold; you have ${fmt(h.gold)}` : '';
      return { text: `${fmt(g)}g +${fmt(hs)}h +${fmt(m)} ${cm}`, short: !!why, why, exact: true, title: why ? `Can't: ${why}` : `Exact: ${fmt(hs)} horses, ${fmt(m)} ${cm} and ${fmt(g)} gold. Ready at once.` };
    },
    max() {
      const d = (have, per) => (per ? Math.floor(have / per) : BATCH);
      const n = Math.min(BATCH, d(h.horses, P.chariot_horses), d(stock(cm), P.chariot_material_cost), d(h.gold, P.chariot_gold));
      return [n, h.horses < P.chariot_horses ? 'no horses at home (stables breed them)' : stock(cm) < P.chariot_material_cost ? `no ${cm} (refine or buy some)` : 'not enough gold'];
    },
    send: (n, o) => act.buildChariots(n, o),
  });
  // refining
  const rs = recipes();
  if (rs) {
    for (const r of rs) {
      const ins = Object.entries(r.inputs);
      out.push({
        id: `refine:${r.id}`, group: 'REFINE', label: `${cap(r.output)}`,
        each: `${ins.map(([m, q]) => `${fmt(q)} ${m}`).join(' + ')} → ${fmt(r.quantity)}`,
        quote(n) {
          const short = ins.find(([m, q]) => n * q > stock(m));
          const why = short ? `needs ${fmt(n * short[1])} ${short[0]}; you have ${fmt(stock(short[0]))}` : '';
          const made = price.refineYield(r.quantity, n);
          const out = made ?? n * r.quantity;
          return { text: `${ins.map(([m, q]) => `${fmt(n * q)} ${m}`).join(' +')} → ${made == null ? '≈' : ''}${fmt(out)}`, short: !!why, why, exact: true, title: why ? `Can't: ${why}` : `Exact inputs; makes ${fmt(out)} ${r.output}${made == null ? ' before your refining-yield modifier' : ''}. At once.` };
        },
        max() { return [Math.min(BATCH, ...ins.map(([m, q]) => Math.floor(stock(m) / q))), `not enough ${ins.map(([m]) => m).join(' or ')}`]; },
        send: (n, o) => act.refine(r.id, n, o),
      });
    }
  } else {
    for (const m of derived()) {
      out.push({
        id: `refine:${m.material}`, group: 'REFINE', label: m.name || cap(m.material), noMax: true,
        each: m.description || 'recipe not sent',
        quote: () => ({ text: 'inputs ?', short: false, exact: false, title: `The server doesn't send this age's recipes yet, so the inputs aren't known here: ${m.description || ''} The result line says what was made, or what was missing.` }),
        max: () => [null, 'the server does not send recipes'],
        send: (n, o) => act.refine(m.material, n, o),
      });
    }
  }
  return out;
}
export const jobById = (id) => jobs().find((j) => j.id === id);

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
