// Order forms for the war room: exact quotes, MAX values and the full ACT detail view (explore,
// a construction grid that builds many at once, train, attack). Prices come from core/prices.js;
// if the server sends none (an old build), quotes fall back to ≈ estimates and MAX is off.
import { fillPicker, generalLine } from './generals.js';
import { store, say, setTarget, raceOf, slotUsed, unitPoints, trainableSlots } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as price from '../../core/prices.js';
import { fmt, esc, addr, names, when, UNIT_ORDER, TRAINABLE, THIEF, SOLDIER } from '../../core/words.js';
import { detailIntrigue, detailRites } from './intrigue.js';
import * as ax from './atkextra.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const matText = (mats) => Object.entries(mats).map(([m, q]) => `${fmt(q)} ${m}`).join(', ');

// ---------- quotes: { text, short, title } ----------
export function exploreQuote(n) {
  const h = store.house;
  if (!price.have()) return { text: `≈${fmt(act.estimate.explore(n))}g`, short: false, title: 'Estimate from base prices, before modifiers' };
  const g = price.exploreCost(n);
  const s = price.exploreSoldiers(n);
  const why = price.exploreProblem(n, h);
  return { text: `${fmt(g)}g${s ? ` +${fmt(s)}sol` : ''}`, short: !!why, why, title: why ? `Can't: ${why}` : `Exact cost: ${fmt(g)} gold and ${fmt(s)} soldiers (spent settling the land); ${fmt(h.units[SOLDIER])} soldiers at home` };
}
export function trainQuote(slot, n, direct = false) {
  const h = store.house;
  if (!price.have()) return { text: `≈${fmt(act.estimate.train(slot, n, direct))}g`, short: false, title: 'Estimate from base prices, before modifiers' };
  const g = price.trainCost(slot, n, direct);
  const pool = price.trainPool(direct);
  const why = g > h.gold ? `You have ${fmt(h.gold)} gold`
    : num(n) > pool ? (direct ? `Each recruit takes a peasant; you have ${fmt(pool)}` : `Each trainee takes a soldier; you have ${fmt(pool)} (draft more, or recruit direct)`)
      : num(n) > price.trainLimit() ? `At most ${fmt(price.trainLimit())} per order` : '';
  return { text: `${fmt(g)}g`, short: !!why, title: why || `Exact cost: ${fmt(g)} gold and ${fmt(num(n))} ${direct ? 'peasants' : 'soldiers'}` };
}
/** The trade-off between training from soldiers and recruiting straight from peasants, in a sentence. */
export function trainNote(direct, slot) {
  const P = store.rules.params;
  const h = store.house;
  const upg = Number(slot) !== THIEF ? `, ${P.train_plus_bp / 100}% come out upgraded` : '';
  return direct
    ? `Direct from peasants (${fmt(h.peasants)}): +${P.direct_cost_bp / 100}% gold, +${P.direct_time_bp / 100}% time, ${P.direct_fail_bp / 100}% fail back to peasants, ${P.direct_death_bp / 100}% die, never upgraded.`
    : `From soldiers (${fmt(h.units[SOLDIER])} at home): base price and time, ${P.train_fail_bp / 100}% fail back to soldiers, ${P.train_death_bp / 100}% die${upg}.`;
}
/** Train options: the four trainable units (soldiers are drafted, never trained). */
export const trainOptions = (race, withGold = true) => trainableSlots(race, TRAINABLE).map((i) => {
  const u = race.units[i] || { name: `slot ${i}`, off: 0, def: 0, gold: 0 };
  return `<option value="${i}">${esc(u.name)} ${unitPoints(race, i).join('/')}${withGold ? ` · ${fmt(u.gold)}g` : ''}</option>`;
}).join('');
/** Slots that can attack (offense above 0, thieves never), in reading order. */
export const attackSlots = (race) => UNIT_ORDER.filter((i) => i !== THIEF && (race.units[i]?.off || 0) > 0 && slotUsed(race, i));

export function buildQuote(id, n) {
  if (!price.have()) return { text: `≈${fmt(act.estimate.build(id, n))}g`, short: false, title: 'Estimate from base prices, before modifiers' };
  const c = price.buildCost(id, n);
  const why = price.buildProblem(id, n, price.buildBudget());
  const m = matText(c.materials);
  return { text: `${fmt(c.gold)}g${m ? ` +${m}` : ''}`, short: !!why, title: why ? `Can't: ${why}` : `Exact cost: ${fmt(c.gold)} gold${m ? `, ${m}` : ''}; ${fmt(num(n))} barren acres` };
}
/** Puts a quote into an element. */
export function showQuote(el, q) {
  el.textContent = q.text;
  el.title = q.title;
  el.classList.toggle('short', q.short);
}

/** What an attack kind needs, in a sentence. */
export function attackHint(kindId) {
  const k = store.rules.params.attacks.find((x) => x.id === kindId);
  if (!k) return '';
  const need = [k.own_state ? 'own state only' : 'other states only'];
  if (k.range_min_bp) need.push(`target ≥ ${k.range_min_bp / 100}% of your land`);
  if (k.requires_trait) need.push(`a ${names.traits[k.requires_trait] || k.requires_trait} general leading`);
  if (k.requires_building) need.push(`a finished ${names.buildings[k.requires_building] || k.requires_building}`);
  if (k.cost_material) need.push(`1 ${k.cost_material} per ${k.troops_per_material} troops`);
  if (k.war_only) need.push('war only');
  return `${k.name}: takes ${k.takes}; ${need.join('; ')}.`;
}

/** A MAX button's effect on an input: fill it, or say why nothing fits. */
export function fillMax(input, n, why) {
  if (n == null) return;
  input.value = String(n);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (!n) say(`MAX is 0: ${why}.`, 'bad');
}
export const exploreWhy = () => (!price.have() ? '' : store.house.units[SOLDIER] < price.exploreSoldiers(1) ? `no soldiers to settle land (${fmt(price.exploreSoldiers(1))} per acre, ${fmt(store.house.units[SOLDIER])} at home): draft more in MIL` : store.house.gold < price.exploreCost(1) ? 'not enough gold for one acre' : 'nothing fits');
export const trainWhy = (slot, direct = false) => (!price.trainPool(direct) ? (direct ? 'no peasants to recruit' : 'no soldiers at home: draft more (MIL), or recruit direct') : store.house.gold < price.trainCost(slot, 1, direct) ? 'not enough gold for one' : 'nothing fits');

// ---------- the ACT tabs (ORDERS, INTRIGUE, RITES), shared by the pane and its detail ----------
const ACT_KEY = 'realmstate.room.act';
export const ACT_TABS = ['orders', 'attacks', 'intrigue', 'rites'];
export const ACT_LABELS = { orders: 'ORDERS', attacks: 'ATTACKS', intrigue: 'INTRIGUE', rites: 'RITES' };
let actTabNow = null;
export function actTab() {
  if (!actTabNow) { try { actTabNow = localStorage.getItem(ACT_KEY); } catch { /* storage off */ } }
  if (!ACT_TABS.includes(actTabNow)) actTabNow = 'orders';
  return actTabNow;
}
export function setActTab(t) {
  if (!ACT_TABS.includes(t)) return;
  actTabNow = t;
  try { localStorage.setItem(ACT_KEY, t); } catch { /* storage off */ }
}
/** A target was chosen (rank, map): show the attack form, unless intrigue or rites is open (they target too). */
export function toAttacks() { if (actTab() === 'orders') setActTab('attacks'); return actTab(); }
let seenTarget = null;
/** True once per new target. */
export function newTarget() { const id = store.target?.id ?? null; const fresh = id != null && id !== seenTarget; seenTarget = id; return fresh; }

// ---------- the ACT detail view ----------
const ticks = (t) => `${t} tick${t === 1 ? '' : 's'}`;
const dur = (t) => {
  const ms = t * (store.age?.tick_ms || store.rules.params.tick_ms);
  const m = Math.round(ms / 60000);
  return m < 120 ? `${m} min` : `${Math.round(m / 6) / 10} h`;
};

/**
 * Draws the full order forms into `body`. `on` registers listeners (removed when the view
 * changes). `goto(pane)` switches the detail view. Returns { update(changes) }.
 */
export function actDetail(body, on, { goto, tab, report }) {
  const P = store.rules.params;
  const race = raceOf(store.house.race) || { units: [] };
  const blds = store.rules.buildings;
  const slotsA = attackSlots(race).map((i) => [race.units[i], i]);
  if (tab) setActTab(tab);

  body.innerHTML = `
  <div class="acttabs seg2" role="tablist" aria-label="ACT sections">${ACT_TABS.map((t) => `<button type="button" role="tab" data-acttab="${t}" id="d-acttab-${t}" aria-controls="d-actsec-${t}">${ACT_LABELS[t]}</button>`).join('')}<span class="dim small">build, explore, train · attack a house · thieves' operations and reports · rites and hexes</span></div>
  <div id="d-actsec-orders" role="tabpanel" aria-labelledby="d-acttab-orders" data-actsec="orders">
  <div class="dgrid act">
    <section class="bsec">
      <h3 class="sub">BUILD <span class="dim">many at once: fill counts, then EXEC sends one order per row</span></h3>
      <form id="d-bg" class="bgrid" aria-label="Construction grid" novalidate>
        <div class="bg-row bg-head" aria-hidden="true"><span>BUILDING</span><span class="num">OWN</span><span class="num">+BLD</span><span class="num">EACH</span><span class="num">COUNT</span><span></span><span class="num">ROW COST</span><span>NOTE</span></div>
        ${blds.map((b) => `<div class="bg-row" data-b="${esc(b.building)}">
          <span class="bg-name" title="${esc(b.description)}">${esc(b.name)}</span>
          <span class="num bg-own"></span><span class="num bg-bld"></span>
          <span class="num bg-each dim"></span>
          <input class="bg-n" type="number" min="0" step="1" inputmode="numeric" placeholder="0" aria-label="${esc(b.name)} to build">
          <button type="button" class="btn mini" data-max aria-label="Most ${esc(b.name)} you can build with what the other rows leave">MAX</button>
          <span class="num bg-cost"></span>
          <span class="bg-note"></span>
        </div>`).join('')}
        <div class="bg-foot">
          <p class="bg-tot" id="d-bg-tot" aria-live="polite"></p>
          <span class="btns"><button type="button" class="btn" id="d-bg-clear">CLEAR</button><button class="btn primary" id="d-bg-exec">EXEC</button></span>
        </div>
      </form>
    </section>

    <section>
      <h3 class="sub">EXPLORE <span class="dim">land arrives in ${ticks(P.explore_ticks)} (≈${dur(P.explore_ticks)})</span></h3>
      <form id="d-f-explore" class="dform">
        <label for="d-x-n">Acres</label>
        <span class="field"><input id="d-x-n" type="number" min="1" value="10" inputmode="numeric"><button type="button" class="btn mini" data-max="explore" aria-label="Most acres you can explore">MAX</button></span>
        <span class="quote num" id="d-x-q"></span>
        <button class="btn primary">EXEC</button>
        <p class="dim small span" id="d-x-info"></p>
      </form>
    </section>

    <section>
      <h3 class="sub">TRAIN <span class="dim">about ${ticks(P.train_ticks)} (≈${dur(P.train_ticks)}), finishing on a bell ±${P.train_spread_ticks} ticks; soldiers are drafted (MIL), not trained</span></h3>
      <form id="d-f-train" class="dform">
        <label for="d-t-unit">Unit</label>
        <select id="d-t-unit">${trainOptions(race, false)}</select>
        <span class="lbl" id="d-t-srcl">From</span>
        <span class="srcpick" role="radiogroup" aria-labelledby="d-t-srcl">
          <label><input type="radio" name="d-t-src" value="soldiers" checked> Soldiers</label>
          <label><input type="radio" name="d-t-src" value="direct"> Direct from peasants</label>
        </span>
        <label for="d-t-n">Count</label>
        <span class="field"><input id="d-t-n" type="number" min="1" value="100" inputmode="numeric"><button type="button" class="btn mini" data-max="train" aria-label="Most of this unit you can train">MAX</button></span>
        <span class="quote num" id="d-t-q"></span>
        <button class="btn primary">EXEC</button>
        <p class="dim small span" id="d-t-info"></p>
      </form>
    </section>

  </div>
  </div>
  <div id="d-actsec-attacks" role="tabpanel" aria-labelledby="d-acttab-attacks" data-actsec="attacks">
  <div class="dgrid atk">
    <section class="asec">
      <h3 class="sub">ATTACK</h3>
      <form id="d-f-attack" class="dform attack">
        <label for="d-a-target" title="Target house, as realm:state:seat">Target</label>
        <span class="field"><input id="d-a-target" placeholder="r:s:seat" required autocomplete="off" pattern="\\s*\\d+\\s*:\\s*\\d+\\s*:\\s*\\d+\\s*"><button type="button" class="btn mini" id="d-a-pick">PICK FROM RANK</button></span>
        <label for="d-a-kind">Kind</label>
        <select id="d-a-kind">${P.attacks.map((k) => `<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('')}</select>
        <label for="d-a-gen">General</label>
        <select id="d-a-gen" aria-describedby="d-a-genl"></select>
        <p class="dim small span" id="d-a-genl"></p>
        <div class="troops span" id="d-a-troops">${slotsA.map(([u, i]) => `<span class="troop"><label for="d-a-u${i}">${esc(u.name)} <small>${u.off} off</small></label>
          <span class="field"><input id="d-a-u${i}" data-slot="${i}" type="number" min="0" value="0" inputmode="numeric"><button type="button" class="btn mini" data-max="troop" aria-label="Send every ${esc(u.name)} at home">MAX</button></span>
          <small class="home num" data-home="${i}"></small></span>`).join('')}</div>
        <p class="dim small span">With the army: medics save some of the dead; one mount per troop sent; ${esc(P.mercenary_name || 'mercenaries')} are hired for this attack only (${fmt(P.mercenary_gold)} gold each, one per ${P.mercenary_ratio} of your own troops) and survivors leave after the battle.</p>
        <div class="troops span" id="d-a-extra">${ax.extrasHTML('d-a', race)}</div>
        <span class="quote num span" id="d-a-q"></span>
        <span class="btns span"><button type="button" class="btn" id="d-a-all">ALL HOME</button><button type="button" class="btn" id="d-a-none">NONE</button><button class="btn danger">EXEC</button></span>
        <p class="dim small span" id="d-a-hint"></p>
      </form>
    </section>
  </div>
  </div>
  <div id="d-actsec-intrigue" role="tabpanel" aria-labelledby="d-acttab-intrigue" data-actsec="intrigue"></div>
  <div id="d-actsec-rites" role="tabpanel" aria-labelledby="d-acttab-rites" data-actsec="rites"></div>`;

  const $ = (id) => body.querySelector(`#${id}`);
  const rows = [...body.querySelectorAll('.bg-row[data-b]')];
  const rowN = (r) => num(r.querySelector('.bg-n').value);

  // ---------- the construction grid ----------
  /** Totals of the grid's rows, optionally leaving one row out. */
  function sums(except) {
    const t = { gold: 0, barren: 0, materials: {} };
    for (const r of rows) {
      if (r === except) continue;
      const n = rowN(r);
      if (!n) continue;
      const c = price.buildCost(r.dataset.b, n);
      t.gold += c.gold;
      t.barren += n;
      for (const [m, q] of Object.entries(c.materials)) t.materials[m] = (t.materials[m] || 0) + q;
    }
    return t;
  }
  function left(except) {
    const h = store.house;
    const t = sums(except);
    const mats = {};
    for (const [m, q] of Object.entries(h.materials)) mats[m] = q - (t.materials[m] || 0);
    return { gold: h.gold - t.gold, barren: h.barren - t.barren, materials: mats };
  }
  function grid() {
    const h = store.house;
    const ok = price.have();
    for (const r of rows) {
      const id = r.dataset.b;
      const bp = price.buildingPrice(id);
      r.querySelector('[data-max]').disabled = !ok;
      r.querySelector('.bg-own').textContent = fmt(h.buildings[id] || 0);
      const c = h.constructing[id] || 0;
      r.querySelector('.bg-bld').textContent = c ? `+${fmt(c)}` : '·';
      r.querySelector('.bg-bld').classList.toggle('zero', !c);
      r.querySelector('.bg-own').classList.toggle('zero', !h.buildings[id]);
      const each = bp ? `${fmt(bp.gold)}g${Object.keys(bp.materials).length ? ` +${matText(bp.materials)}` : ''}` : '';
      r.querySelector('.bg-each').textContent = each;
      r.querySelector('.bg-each').title = bp && bp.max_count ? `A house may own ${bp.max_count}` : '';
      const n = rowN(r);
      const cost = r.querySelector('.bg-cost');
      const note = r.querySelector('.bg-note');
      r.classList.toggle('on', n > 0);
      if (!n) { cost.textContent = ''; if (!note.dataset.result) note.textContent = bp && bp.max_count ? `max ${bp.max_count}` : ''; note.className = 'bg-note dim'; continue; }
      const cc = price.buildCost(id, n);
      const m = matText(cc.materials);
      cost.textContent = `${fmt(cc.gold)}g${m ? ` +${m}` : ''}`;
      let why = '';
      if (n > price.buildLimit()) why = `at most ${fmt(price.buildLimit())} per order`;
      else if (n > price.buildRoom(id)) why = `may own ${bp.max_count} at most`;
      if (!note.dataset.result || why) { note.textContent = why; note.className = `bg-note${why ? ' short' : ''}`; delete note.dataset.result; }
    }
    const t = sums();
    const have = h;
    const part = (label, used, held) => `<span class="${used > held ? 'short' : ''}">${label} <b class="num">${fmt(used)}</b><span class="dim">/${fmt(held)}</span></span>`;
    const parts = [part('ACRES', t.barren, have.barren), part('GOLD', t.gold, have.gold)];
    for (const [m, q] of Object.entries(t.materials)) parts.push(part(m.toUpperCase(), q, have.materials[m] || 0));
    $('d-bg-tot').innerHTML = `<span class="dim">TOTAL</span> ${parts.join(' ')}`;
    const anyRow = rows.some((r) => rowN(r) > 0);
    const bad = t.barren > have.barren || t.gold > have.gold || Object.entries(t.materials).some(([m, q]) => q > (have.materials[m] || 0))
      || rows.some((r) => rowN(r) > 0 && (rowN(r) > price.buildLimit() || rowN(r) > price.buildRoom(r.dataset.b)));
    $('d-bg-exec').disabled = !anyRow || (ok && bad);
    $('d-bg-exec').title = !anyRow ? 'Fill in a count first' : bad ? 'Over what you have: lower a row' : `Send ${rows.filter((r) => rowN(r) > 0).length} build orders`;
  }
  on($('d-bg'), 'input', (ev) => {
    const note = ev.target.closest('.bg-row')?.querySelector('.bg-note');
    if (note) delete note.dataset.result;
    grid();
  });
  on($('d-bg'), 'click', (ev) => {
    const b = ev.target.closest('[data-max]');
    if (!b) return;
    const r = b.closest('.bg-row');
    const budget = left(r);
    const n = price.buildMax(r.dataset.b, budget);
    const inp = r.querySelector('.bg-n');
    const why = budget.barren <= 0 ? 'no barren land left after the other rows' : price.buildRoom(r.dataset.b) <= 0 ? 'you already have as many as a house may own'
      : price.buildingPrice(r.dataset.b).gold > budget.gold ? 'not enough gold left after the other rows' : 'not enough materials';
    fillMax(inp, n, why);
    inp.focus();
  });
  on($('d-bg-clear'), 'click', () => {
    rows.forEach((r) => { r.querySelector('.bg-n').value = ''; const nt = r.querySelector('.bg-note'); delete nt.dataset.result; });
    grid();
  });
  on($('d-bg'), 'submit', async (ev) => {
    ev.preventDefault();
    const send = rows.filter((r) => rowN(r) > 0).map((r) => ({ building: r.dataset.b, count: rowN(r), row: r }));
    if (!send.length) { say('Fill in a count on at least one row.', 'bad'); return; }
    const results = await act.buildMany(send.map(({ building, count }) => ({ building, count })), { button: $('d-bg-exec') });
    results.forEach((res, i) => {
      const r = send[i].row;
      const note = r.querySelector('.bg-note');
      note.dataset.result = '1';
      if (res.ok) {
        r.querySelector('.bg-n').value = '';
        note.textContent = `ok: ${fmt(res.out.gold)}g, ready ${when(res.out.ready_at)}`;
        note.className = 'bg-note good';
      } else {
        note.textContent = res.error;
        note.className = 'bg-note short';
      }
    });
    grid();
  });

  // ---------- explore ----------
  function explore() {
    const n = $('d-x-n').value;
    const q = exploreQuote(n);
    showQuote($('d-x-q'), q);
    const h = store.house;
    const per = (price.have() ? store.house.prices.explore.soldiers_milli_per_acre || 0 : 0) / 1000;
    $('d-x-info').textContent = price.have()
      ? `${q.why ? `Can't: ${q.why}. ` : ''}Each acre costs ${fmt(price.exploreCost(1))} gold and ${fmt(per)} soldiers, spent settling it. You can explore up to ${fmt(price.exploreMax())} acres now (${fmt(h.gold)} gold, ${fmt(h.units[SOLDIER])} soldiers at home; ${fmt(price.exploreLimit())} per order). Land now ${fmt(h.land)}, ${fmt(h.incoming_land)} on the way.`
      : '';
    $('d-x-info').classList.toggle('short', !!q.why);
  }
  on($('d-f-explore'), 'input', explore);
  on($('d-f-explore'), 'click', (ev) => { if (ev.target.closest('[data-max]')) fillMax($('d-x-n'), price.have() ? price.exploreMax() : null, exploreWhy()); });
  on($('d-f-explore'), 'submit', (ev) => {
    ev.preventDefault();
    const n = $('d-x-n').value;
    act.explore(n, { button: ev.submitter, estimate: null, quote: price.have() ? price.exploreCost(n) : null });
  });

  // ---------- train ----------
  const direct = () => body.querySelector('input[name="d-t-src"]:checked')?.value === 'direct';
  function train() {
    const slot = $('d-t-unit').value;
    showQuote($('d-t-q'), trainQuote(slot, $('d-t-n').value, direct()));
    const h = store.house;
    const u = race.units[Number(slot)] || {};
    $('d-t-info').textContent = (price.have()
      ? `${u.name}: ${fmt(price.trainCost(slot, 1, direct()))} gold each. Up to ${fmt(price.trainMax(slot, direct()))} now (${fmt(price.trainPool(direct()))} ${direct() ? 'peasants' : 'soldiers'}, ${fmt(h.gold)} gold). `
      : '') + trainNote(direct(), slot);
  }
  on($('d-f-train'), 'input', train);
  on($('d-f-train'), 'click', (ev) => { if (ev.target.closest('[data-max]')) fillMax($('d-t-n'), price.have() ? price.trainMax($('d-t-unit').value, direct()) : null, price.have() ? trainWhy($('d-t-unit').value, direct()) : ''); });
  on($('d-f-train'), 'submit', (ev) => {
    ev.preventDefault();
    const slot = $('d-t-unit').value, n = $('d-t-n').value, d = direct();
    act.train(slot, n, { button: ev.submitter, direct: d, estimate: null, quote: price.have() ? price.trainCost(slot, n, d) : null });
  });

  // ---------- attack ----------
  const troopInputs = () => [...body.querySelectorAll('#d-a-troops input')];
  const detailUnits = () => { const u = Array(10).fill(0); troopInputs().forEach((inp) => { u[Number(inp.dataset.slot)] = num(inp.value); }); return u; };
  function attack() {
    const h = store.house;
    let over = false;
    for (const inp of troopInputs()) {
      const slot = Number(inp.dataset.slot);
      const c = num(inp.value);
      inp.max = h.units[slot];
      if (c > h.units[slot]) over = true;
      body.querySelector(`[data-home="${slot}"]`).textContent = `${fmt(h.units[slot])} home`;
    }
    const x = ax.readExtras($('d-a-extra'));
    const q = ax.attackQuote(race, detailUnits(), x);
    const home = { medics: `${fmt(h.medics)} home`, horses: `${fmt(h.horses)} home`, chariots: `${fmt(h.chariots)} home`, mercs: `max ${fmt(q.mercMax)} · ${fmt(P.mercenary_gold)}g ea` };
    body.querySelectorAll('[data-xhome]').forEach((el) => { el.textContent = home[el.dataset.xhome]; });
    const probs = [...(over ? ['more troops than you have at home'] : []), ...q.problems];
    const qt = ax.quoteText(q, x);
    $('d-a-q').textContent = `${qt.text}${probs.length ? ` · ${probs.join('; ')}` : ''}`;
    $('d-a-q').title = qt.title;
    $('d-a-q').classList.toggle('short', probs.length > 0);
    $('d-a-hint').textContent = attackHint($('d-a-kind').value);
    fillPicker($('d-a-gen'));
    $('d-a-genl').textContent = generalLine($('d-a-gen').value);
  }
  on($('d-f-attack'), 'input', attack);
  on($('d-f-attack'), 'click', (ev) => {
    if (ev.target.closest('[data-max="troop"]')) {
      const inp = ev.target.closest('.troop').querySelector('input');
      fillMax(inp, store.house.units[Number(inp.dataset.slot)], 'none at home');
    } else if (ev.target.closest('[data-max^="x-"]')) {
      const k = ev.target.closest('[data-max]').dataset.max.slice(2);
      const x = ax.readExtras($('d-a-extra'));
      x[k] = 0;
      const [n, why] = ax.extraMax(k, ax.attackQuote(race, detailUnits(), x), x);
      fillMax($(`d-a-${k}`), n, why);
    } else if (ev.target.closest('#d-a-all')) {
      troopInputs().forEach((inp) => { inp.value = String(store.house.units[Number(inp.dataset.slot)]); });
      attack();
    } else if (ev.target.closest('#d-a-none')) {
      troopInputs().forEach((inp) => { if (inp.type === 'checkbox') inp.checked = false; else inp.value = '0'; });
      body.querySelectorAll('#d-a-extra input').forEach((inp) => { if (inp.type === 'checkbox') inp.checked = false; else inp.value = '0'; });
      attack();
    } else if (ev.target.closest('#d-a-pick')) goto('rank');
  });
  on($('d-f-attack'), 'submit', async (ev) => {
    ev.preventDefault();
    const units = detailUnits();
    const x = ax.readExtras($('d-a-extra'));
    units[8] = x.mercs;
    const typed = $('d-a-target').value.trim();
    const t = store.target && typed === addr(store.target) ? store.target : typed;
    const out = await act.attack({ target: t, kind: $('d-a-kind').value, units, general: $('d-a-gen').value, medics: x.medics, horses: x.horses, chariots: x.chariots, upgradedMercenaries: x.upmercs, doubleStrike: x.double }, { button: ev.submitter });
    if (out) body.querySelectorAll('#d-a-troops input, #d-a-extra input').forEach((inp) => { if (inp.type === 'checkbox') inp.checked = false; else inp.value = '0'; });
    attack();
  });
  if (store.target) $('d-a-target').value = addr(store.target);

  // ---------- the tabs: ORDERS, INTRIGUE, RITES ----------
  const intr = detailIntrigue(body.querySelector('#d-actsec-intrigue'), on, { goto });
  const rit = detailRites(body.querySelector('#d-actsec-rites'), on, { goto });
  function tabs(focusTab) {
    const t = actTab();
    body.querySelectorAll('[data-acttab]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.acttab === t)); b.tabIndex = b.dataset.acttab === t ? 0 : -1; });
    body.querySelectorAll('[data-actsec]').forEach((s2) => { s2.hidden = s2.dataset.actsec !== t; });
    if (focusTab) body.querySelector(`[data-acttab="${t}"]`).focus();
  }
  on(body.querySelector('.acttabs'), 'click', (ev) => { const b = ev.target.closest('[data-acttab]'); if (b) { setActTab(b.dataset.acttab); tabs(); } });
  on(body.querySelector('.acttabs'), 'keydown', (ev) => {
    const i = ACT_TABS.indexOf(actTab());
    const n = ACT_TABS.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    setActTab(ACT_TABS[j]);
    tabs(true);
  });
  tabs();

  function update(c) {
    const all = !c;
    body.querySelectorAll('[data-max="explore"], [data-max="train"]').forEach((x) => { x.disabled = !price.have(); });
    if (all || c.has('house') || c.has('hall')) { grid(); explore(); train(); attack(); }
    if (c && c.has('target') && store.target && document.activeElement !== $('d-a-target')) $('d-a-target').value = addr(store.target);
    intr.update(c);
    rit.update(c);
  }
  if (report != null) requestAnimationFrame(() => intr.show(report));
  return {
    update,
    focus: () => {
      const t = actTab();
      if (report != null) return;
      if (t === 'intrigue') intr.focus(); else if (t === 'rites') rit.focus(); else if (t === 'attacks') $('d-a-target').focus(); else rows[0]?.querySelector('.bg-n').focus();
    },
  };
}

/** Sets the target from a house and says so (used by the RANK detail's TGT buttons). */
export function pickTarget(h) {
  toAttacks();
  setTarget(h);
  say(`Target set to ${h.name} (${addr(h)}). Choose a kind and troops, then EXEC.`);
}
