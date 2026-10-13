// Military: train, release, the draft rate, medics, upgrades, chariots, refining, generals, attack and the race
// mechanics (mirror, second strike, retaking land). Behaviour follows Straightline's Military, Attack and Generals
// pages; the sums are core's (prices, military, attack, generals).
import { store, raceOf, raceName, unitPoints, trainableSlots, slotUsed, isProtected, knownHouses } from '../../../core/store.js';
import * as act from '../../../core/actions.js';
import * as price from '../../../core/prices.js';
import { fmt, esc, addr, TRAINABLE, SOLDIER, MERC, ELITE_PP } from '../../../core/words.js';
import { trainNote } from '../../../core/train.js';
import { armed, jobs } from '../../../core/military.js';
import { attackSlots, attackHint, attackQuote, readExtras, extraMax, quoteText, buildingChoice, buildingOptions, offenseParts, mercRatio } from '../../../core/attack.js';
import * as G from '../../../core/generals.js';
import { nextName } from '../../../core/names.js';
import { same } from '../../../core/relations.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const P = () => store.rules.params;
const H = () => store.house;
const race = () => raceOf(store.house?.race) || { units: [] };
const listText = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const pctBp = (bp) => `${bp >= 0 ? '+' : '−'}${(Math.abs(bp) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const unitName = (i) => race().units[i]?.name || (i === SOLDIER ? 'Soldiers' : `unit ${i}`);
/** The races with a mechanic in their rules, by name ('Drow'), for "only … can" lines. */
const racesWith = (test) => listText((store.rules?.races || []).filter((r) => r?.identity && test(r)).map((r) => r.name)) || 'some races';
const who = (id) => { const h = knownHouses().get(id); return h ? `${h.name} (${addr(h)})` : `house ${id}`; };

/** A number field with MAX (as land.js): id, label, the MAX button's attribute, extra input attributes. */
const field = (id, label, max, attrs = '') => `<span class="ra-in"><input id="${id}" type="number" min="0" inputmode="numeric" placeholder="0" aria-label="${esc(label)}" ${attrs}><button type="button" class="rg-btn ghost mini" ${max} aria-label="Most you can: ${esc(label)}">MAX</button></span>`;

// ---------- train ----------
const train = {
  id: 'train', group: 'military', name: 'Train', wiki: 'military.html#Training', keys: 'units troops recruit offense defense elites thieves soldiers peasants direct',
  what: 'Turn soldiers into trained troops, or recruit straight from peasants at a price.',
  badge: () => `${fmt(H().units[SOLDIER])} soldiers`,
  mount(body, ctx) {
    let direct = !!ctx.args.direct;
    const r = race(), slots = trainableSlots(r, TRAINABLE).filter((i) => r.units[i] && slotUsed(r, i));
    const ap = () => (price.have() ? '' : '≈');
    const cost = (slot, n) => (price.have() ? price.trainCost(slot, n, direct) : act.estimate.train(slot, n, direct));
    body.innerHTML = `<div class="ra-seg" role="group" aria-label="Train from">
        <button type="button" class="rg-btn ghost mini" data-src="soldiers">From soldiers</button><button type="button" class="rg-btn ghost mini" data-src="direct">From peasants</button></div>
      <div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Unit</th><th class="num" title="Attack / defence points each">Off/Def</th><th class="num">Home</th><th class="num">Train</th><th class="num">Gold</th></tr></thead>
      <tbody>${slots.map((i) => `<tr><th scope="row">${esc(r.units[i].name)}</th><td class="num dim">${unitPoints(r, i).join('/')}</td><td class="num" data-home="${i}"></td>
        <td class="num">${field(`ra-t-${i}`, `${r.units[i].name} to train`, `data-tmax="${i}"`, `data-t="${i}"`)}</td><td class="num" data-tcost="${i}"></td></tr>`).join('')}</tbody></table></div>
      <p class="ra-note" id="ra-tnote"></p>`;
    const rows = () => [...body.querySelectorAll('[data-t]')].map((i) => ({ slot: Number(i.dataset.t), n: n0(i.value) })).filter((x) => x.n);
    if (ctx.args.slot != null) { const i = body.querySelector(`[data-t="${ctx.args.slot}"]`); if (i) { i.value = ctx.args.n ? String(ctx.args.n) : ''; setTimeout(() => i.focus(), 0); } }
    /** Most of one unit that fits the gold and people the other rows leave. */
    const most = (slot) => {
      let gold = H().gold, people = price.trainPool(direct);
      for (const o of rows()) if (o.slot !== slot) { gold -= cost(o.slot, o.n); people -= o.n; }
      return price.largest(Math.max(0, Math.min(price.trainLimit(), people)), (n) => cost(slot, n) <= gold);
    };
    const draw = () => {
      const h = H();
      body.querySelectorAll('[data-src]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.src === 'direct') === direct)));
      for (const i of slots) {
        body.querySelector(`[data-home="${i}"]`).textContent = fmt(h.units[i]);
        const n = n0(body.querySelector(`[data-t="${i}"]`).value);
        body.querySelector(`[data-tcost="${i}"]`).textContent = n ? `${ap()}${fmt(cost(i, n))}` : `${ap()}${fmt(cost(i, 1))} ea`;
      }
      body.querySelector('#ra-tnote').textContent = `${trainNote(direct, rows()[0]?.slot ?? 1)} You hold ${fmt(h.gold)} gold.`;
    };
    draw();
    ctx.on(body, 'input', draw);
    ctx.on(body, 'click', (ev) => {
      const s = ev.target.closest('[data-src]'), m = ev.target.closest('[data-tmax]');
      if (s) { direct = s.dataset.src === 'direct'; draw(); ctx.refresh(); }
      if (m) {
        const slot = Number(m.dataset.tmax), n = most(slot);
        body.querySelector(`[data-t="${slot}"]`).value = n ? String(n) : '';
        if (!n) ctx.say?.(H().gold < cost(slot, 1) ? 'Not enough gold for one.' : `No ${direct ? 'peasants' : 'soldiers'} left for this row.`, 'bad');
        draw(); ctx.refresh();
      }
    });
    return {
      check() {
        const o = rows(), h = H(), from = direct ? 'peasants' : 'soldiers';
        if (!o.length) return { ok: false, why: ['choose how many to train'], go: 'Train' };
        const gold = o.reduce((a, x) => a + cost(x.slot, x.n), 0), people = o.reduce((a, x) => a + x.n, 0), pool = price.trainPool(direct), why = [];
        for (const x of o) if (x.n > price.trainLimit()) why.push(`at most ${fmt(price.trainLimit())} ${unitName(x.slot)} per order`);
        if (people > pool) why.push(`needs ${fmt(people)} ${from}; you have ${fmt(pool)}`);
        if (gold > h.gold) why.push(`needs ${ap()}${fmt(gold)} gold; you have ${fmt(h.gold)}`);
        return { ok: !why.length, why, text: `Train ${listText(o.map((x) => `${fmt(x.n)} ${unitName(x.slot)}`))} from ${fmt(people)} ${from}, for ${ap()}${fmt(gold)} gold.`, go: `Train ${fmt(people)}` };
      },
      async run(btn) {
        let ok = false;
        for (const x of rows()) if (await act.train(x.slot, x.n, { direct, button: btn })) { ok = true; const i = body.querySelector(`[data-t="${x.slot}"]`); if (i) i.value = ''; }
        return ok;
      },
      update() { draw(); },
    };
  },
};

// ---------- release ----------
const release = {
  id: 'release', group: 'military', name: 'Release', wiki: 'military.html#Release', keys: 'disband dismiss troops peasants soldiers send home',
  what: 'Send troops at home back: soldiers to the fields, trained troops to soldiers.',
  badge: () => '',
  mount(body, ctx) {
    body.innerHTML = `<div class="ra-line"><label for="ra-ru">Troops</label><select id="ra-ru"></select></div>
      <div class="ra-line"><label for="ra-rn">How many</label>${field('ra-rn', 'Troops to release', 'data-max')}</div>
      <p class="ra-note">Soldiers become peasants; trained troops become soldiers again (their training isn't refunded).</p>`;
    const sel = body.querySelector('#ra-ru'), inp = body.querySelector('#ra-rn');
    const draw = () => {
      const h = H(), slots = h.units.map((n, k) => [k, n]).filter(([k, n]) => k !== MERC && (n > 0 || k === SOLDIER));
      const sig = slots.map(([k, n]) => `${k}:${n}`).join(',');
      if (sel.dataset.sig === sig) return;
      const v = sel.value || (ctx.args.slot != null ? String(ctx.args.slot) : '');
      sel.innerHTML = slots.map(([k, n]) => `<option value="${k}">${esc(unitName(k))} (${fmt(n)} home) → ${k === SOLDIER ? 'peasants' : 'soldiers'}</option>`).join('');
      if (v && slots.some(([k]) => String(k) === v)) sel.value = v;
      sel.dataset.sig = sig;
    };
    draw();
    ctx.on(body.querySelector('[data-max]'), 'click', () => { inp.value = String(H().units[Number(sel.value)] || 0); ctx.refresh(); });
    return {
      check() {
        const k = Number(sel.value), n = n0(inp.value), have = H().units[k] || 0;
        if (!n) return { ok: false, why: ['choose how many to release'], go: 'Release' };
        const why = n > have ? [`you have ${fmt(have)} ${unitName(k)} at home`] : [];
        const after = k === SOLDIER ? ' If that leaves fewer under arms than your draft rate, the rate comes down to match, so they aren\'t drafted back.' : ' Their training is lost.';
        return { ok: !why.length, why, text: `Release ${fmt(n)} ${unitName(k)} to ${k === SOLDIER ? 'peasants' : 'soldiers'}.${after}`, go: `Release ${fmt(n)}`, confirm: `Confirm: release ${fmt(n)}` };
      },
      async run(btn) {
        const k = Number(sel.value), out = await act.release(k, n0(inp.value), { button: btn });
        if (out && k === SOLDIER && out.draft_bp != null) store.house.draft_bp = out.draft_bp;
        return out;
      },
      update() { draw(); },
    };
  },
};

// ---------- draft rate ----------
const draft = {
  id: 'set-draft', group: 'military', name: 'Draft rate', wiki: 'military.html#Draft', keys: 'draft conscript rate soldiers under arms',
  what: 'The share of your people kept under arms; peasants are drafted toward it each tick.',
  badge: () => `${(H().draft_bp ?? P().draft_default_bp) / 100}%`,
  mount(body, ctx) {
    const max = P().draft_max_bp / 100;
    body.innerHTML = `<div class="ra-line"><label for="ra-dr">Draft rate</label><span class="ra-in"><input id="ra-dr" type="number" min="0" max="${max}" step="0.5" inputmode="decimal"> %</span></div>
      <p class="ra-note" id="ra-dnote"></p>`;
    const inp = body.querySelector('#ra-dr'), rate = () => (H().draft_bp ?? P().draft_default_bp) / 100;
    inp.value = String(ctx.args.rate ?? rate());
    const note = () => {
      const h = H(), a = armed(h), r = rate(), speed = (P().draft_speed_bp || 100) / 100, gap = Math.max(0, Math.floor((r / 100) * h.population) - a.armed);
      body.querySelector('#ra-dnote').textContent = `${a.pct.toFixed(1)}% under arms now (${fmt(a.armed)} of ${fmt(h.population)} people); the rate is ${r}%, at most ${max}%. `
        + (gap ? `${fmt(gap)} short: up to ${speed}% of your peasants are drafted each tick.` : 'At or above it: nobody is drafted.') + ' Drafted peasants stop working and paying tax.';
    };
    note();
    return {
      check() {
        const v = Number(inp.value);
        if (inp.value === '' || !Number.isFinite(v) || v < 0 || v > max) return { ok: false, why: [`a draft rate is 0–${max}%`], go: 'Set rate' };
        if (Math.round(v * 100) === Math.round(rate() * 100)) return { ok: false, why: [`the rate is ${rate()}% already`], go: 'Set rate' };
        return { ok: true, why: [], text: `Keep ${v}% of your people under arms (now ${rate()}%).`, go: `Set ${v}%` };
      },
      async run(btn) {
        const out = await act.setDraft(Math.round(Number(inp.value) * 100), { button: btn });
        if (out && out.rate_bp != null) store.house.draft_bp = out.rate_bp;
        return out;
      },
      update() { note(); },
    };
  },
};

// ---------- the workshop: medics, upgrades, chariots, refining (core/military.js jobs) ----------
/** An action over a set of workshop jobs: a table with a count per job, one order for the lot. */
function workshop({ id, name, what, wiki, keys, badge, pick, empty, extra = () => '' }) {
  return {
    id, group: 'military', name, what, wiki, keys, badge,
    mount(body, ctx) {
      body.innerHTML = `<div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Make</th><th class="num">Count</th><th class="num">Cost</th></tr></thead><tbody id="ra-jrows"></tbody></table></div><p class="ra-note" id="ra-jnote"></p>`;
      const tb = body.querySelector('#ra-jrows');
      let shown = '';
      const byId = () => new Map(pick().map((j) => [j.id, j]));
      const rows = () => [...body.querySelectorAll('[data-j]')].map((i) => ({ id: i.dataset.j, n: n0(i.value) })).filter((x) => x.n);
      const draw = () => {
        const list = pick(), key = list.map((j) => j.id + j.each).join('|') + extra();
        if (key !== shown) {
          const keep = new Map([...body.querySelectorAll('[data-j]')].map((i) => [i.dataset.j, i.value]));
          if (!shown && ctx.args.job) keep.set(ctx.args.job, String(ctx.args.n || ''));
          shown = key;
          tb.innerHTML = (list.map((j, k) => `<tr><th scope="row">${esc(j.label)}<br><span class="dim">${esc(j.each)}</span></th>
            <td class="num">${field(`ra-j-${k}`, `${j.label}: how many`, `data-jmax="${esc(j.id)}"`, `data-j="${esc(j.id)}" value="${esc(keep.get(j.id) || '')}"`)}</td><td class="num" data-q="${esc(j.id)}"></td></tr>`).join('')
            || `<tr><td colspan="3" class="dim">${esc(empty)}</td></tr>`) + extra();
        }
        const m = byId();
        for (const i of body.querySelectorAll('[data-j]')) {
          const j = m.get(i.dataset.j), n = n0(i.value), q = n && j ? j.quote(n) : null, cell = tb.querySelector(`[data-q="${CSS.escape(i.dataset.j)}"]`);
          cell.textContent = q ? q.text : '';
          cell.title = q?.title || '';
          cell.classList.toggle('short', !!q?.short);
        }
        const h = H(), p = P(), mats = [p.medic_material, p.upgrade_material, p.chariot_material].filter((x, i, a) => x && a.indexOf(x) === i);
        body.querySelector('#ra-jnote').textContent = `You hold ${fmt(h.gold)} gold, ${fmt(h.horses)} horses, ${fmt(h.peasants)} peasants; ${mats.map((x) => `${fmt(h.materials[x] || 0)} ${x}`).join(', ')}.`;
      };
      draw();
      ctx.on(body, 'input', draw);
      ctx.on(body, 'click', (ev) => {
        const b = ev.target.closest('[data-jmax]');
        if (!b) return;
        const j = byId().get(b.dataset.jmax), [n, why] = j ? j.max() : [0, ''];
        body.querySelector(`[data-j="${CSS.escape(b.dataset.jmax)}"]`).value = n ? String(n) : '';
        if (!n && why) ctx.say?.(`None: ${why}.`, 'bad');
        draw(); ctx.refresh();
      });
      return {
        check() {
          const r = rows(), m = byId();
          if (!r.length) return { ok: false, why: [pick().length ? 'choose how many' : empty], go: name };
          const qs = r.map((x) => [x, m.get(x.id), m.get(x.id)?.quote(x.n)]);
          const why = qs.map(([x, j, q]) => (!j ? `${x.id} isn't offered now` : q.why ? `${j.label}: ${q.why}` : '')).filter(Boolean);
          const n = r.reduce((a, x) => a + x.n, 0);
          return { ok: !why.length, why, text: `${name}: ${qs.filter(([, j]) => j).map(([x, j, q]) => `${fmt(x.n)} × ${j.label} (${q.text})`).join('; ')}.`, go: `${name} ${fmt(n)}` };
        },
        async run(btn) {
          let ok = false;
          const m = byId();
          for (const x of rows()) if (m.get(x.id) && await m.get(x.id).send(x.n, { button: btn })) { ok = true; const i = body.querySelector(`[data-j="${CSS.escape(x.id)}"]`); if (i) i.value = ''; }
          return ok;
        },
        update() { draw(); },
      };
    },
  };
}

const medics = workshop({
  id: 'train-medics', name: 'Medics', wiki: 'military.html#Medics', keys: 'medics heal save dead doctors',
  what: 'Train medics from peasants; sent with an army, they save some of its dead.',
  badge: () => `${fmt(H().medics)} medics`,
  pick: () => jobs().filter((j) => j.id === 'medics'), empty: 'medics aren\'t offered',
});
// Elite+ → elite++ is listed for every race; core/military.js offers it only to races that upgrade twice.
const twiceRow = () => {
  if (jobs().some((j) => j.id === 'upgrade:7')) return '';
  const r = race(), from = r.units[7]?.name || 'Elite+', to = r.units[ELITE_PP]?.name || 'Elite++';
  return `<tr><th scope="row" class="dim">${esc(from)} → ${esc(to)}</th><td colspan="2" class="dim">only races that upgrade twice (${esc(racesWith((x) => Array.isArray(x.flags) && x.flags.includes('elite_plus_plus')))})</td></tr>`;
};
const upgrade = workshop({
  id: 'upgrade', name: 'Upgrade', wiki: 'military.html#Upgrades', keys: 'upgrade improve stronger elite plus',
  what: 'Make troops at home stronger, for the upgrade material.',
  badge: () => `${fmt(H().materials[P().upgrade_material] || 0)} ${P().upgrade_material}`,
  pick: () => jobs().filter((j) => j.group === 'UPGRADE'), empty: 'nothing to upgrade', extra: twiceRow,
});
const chariots = workshop({
  id: 'build-chariots', name: 'Chariots', wiki: 'military.html#Mounts', keys: 'chariots mounts horses',
  what: 'Build chariots from horses, material and gold; one rides with each troop sent.',
  badge: () => `${fmt(H().chariots)} chariots`,
  pick: () => jobs().filter((j) => j.id === 'chariots'), empty: 'chariots aren\'t offered',
});
const refine = workshop({
  id: 'refine', name: 'Refine', wiki: 'materials.html', keys: 'refine recipe materials craft make',
  what: 'Run the age\'s refining recipes: materials in, a finer material out, at once.',
  badge: () => '',
  pick: () => jobs().filter((j) => j.group === 'REFINE'), empty: 'this age has no recipes',
});

// ---------- generals ----------
const recruit = {
  id: 'recruit-general', group: 'military', name: 'Raise a general', wiki: 'generals.html#Raising', keys: 'general recruit raise traits commander',
  what: 'Retire elites to raise a named general with traits.',
  badge: () => `${fmt(H().generals.length)} of ${fmt(P().general_max)}`,
  mount(body, ctx) {
    body.innerHTML = `<div class="ra-line"><label for="ra-gn">Name</label><span class="ra-in"><input id="ra-gn" maxlength="40" autocomplete="off"><button type="button" class="rg-btn ghost mini" id="ra-groll" aria-label="Suggest another name" title="Suggest another name">&#8635;</button></span></div>
      <h3 class="ra-sub" id="ra-gtl">Traits</h3>
      <ul class="ra-list" aria-labelledby="ra-gtl">${G.traits().map((t) => `<li><label><input type="checkbox" value="${esc(t.trait)}"> <b>${esc(t.name)}</b> <span class="dim">${esc(G.traitDoes(t.trait))}</span></label></li>`).join('')}</ul>
      <p class="ra-note" id="ra-gnote"></p>`;
    const name = body.querySelector('#ra-gn'), boxes = () => [...body.querySelectorAll('.ra-list input')];
    const roll = async (force) => { if (!force && name.value) return; const v = await nextName('general'); if (v && (force || !name.value)) { name.value = v; ctx.refresh(); } };
    roll(false);
    ctx.on(body.querySelector('#ra-groll'), 'click', () => { roll(true); name.focus(); });
    const count = () => { const c = boxes().filter((b) => b.checked).length; return G.mayPick() && c ? c : G.traitSlots().total; };
    const draw = () => {
      const pick = G.mayPick(), slots = G.traitSlots(), chosen = boxes().filter((b) => b.checked).length;
      boxes().forEach((b) => { b.disabled = !pick || (!b.checked && chosen >= slots.total); });
      body.querySelector('#ra-gtl').textContent = pick ? `Traits: up to ${slots.total} (none ticked: drawn at random)` : `Traits: ${slots.total} drawn at random`;
      const q = G.recruitQuote(count());
      body.querySelector('#ra-gnote').textContent = `${pick ? '' : `Choosing traits needs ${fmt(P().general_pick_renown)} renown; you have ${fmt(H().renown)}. `}You hold ${fmt(H().units[3])} elites at home and ${fmt(q.held)} ${q.material}.`;
    };
    draw();
    ctx.on(body, 'change', draw);
    return {
      check() {
        const n = count(), q = G.recruitQuote(n), why = [q.why, !name.value.trim() ? 'give it a name' : ''].filter(Boolean);
        return { ok: !why.length, why, text: `Raise ${name.value.trim() || 'a general'} with ${n} trait${n === 1 ? '' : 's'}: retires ${fmt(q.elites)} elites and costs ${q.exact ? '' : '≈'}${fmt(q.amount)} ${q.material}.`, go: 'Raise', confirm: `Confirm: retire ${fmt(q.elites)} elites` };
      },
      run: (btn) => act.recruitGeneral(name.value, G.mayPick() ? boxes().filter((b) => b.checked).map((b) => b.value) : [], { button: btn }),
      update() { draw(); },
    };
  },
};

const defender = {
  id: 'set-defender', group: 'military', name: 'Main general', wiki: 'generals.html#Battle', keys: 'defender defence defense general command main',
  what: 'Put a general at home in command of your home defence.',
  badge: () => H().generals.find((g) => g.id === H().defender)?.name || 'none',
  mount(body, ctx) {
    body.innerHTML = `<div class="ra-line"><label for="ra-dg">General</label><select id="ra-dg"></select></div><p class="ra-note" id="ra-dgnote"></p>`;
    const sel = body.querySelector('#ra-dg');
    let first = true;
    const draw = () => {
      const h = H(), cur = h.generals.find((g) => g.id === h.defender);
      if (document.activeElement !== sel) {
        const v = first ? String(ctx.args.general ?? h.defender ?? '') : sel.value;
        first = false;
        sel.innerHTML = '<option value="">none</option>' + h.generals.map((g) => { const why = G.cantLead(g); return `<option value="${g.id}"${why ? ' disabled' : ''}>${esc(g.name)} · ${esc((g.traits || []).map(G.traitName).join('/') || 'no traits')}${why ? ` (${why})` : g.id === h.defender ? ' (main now)' : ''}</option>`; }).join('');
        sel.value = [...sel.options].some((o) => o.value === v && !o.disabled) ? v : '';
      }
      body.querySelector('#ra-dgnote').textContent = `Now: ${cur ? `${cur.name} (${G.traitsText(cur.traits)})` : 'no main general'}. One sent with an army stops commanding the defence.`;
    };
    draw();
    return {
      check() {
        const h = H(), id = sel.value === '' ? null : Number(sel.value), g = h.generals.find((x) => x.id === id);
        if (!h.generals.length) return { ok: false, why: ['you have no generals (Raise a general)'], go: 'Set' };
        if (id === (h.defender ?? null)) return { ok: false, why: [g ? `${g.name} is main general already` : 'you have no main general already'], go: 'Set' };
        const why = g && G.cantLead(g) ? [`${g.name} is ${G.cantLead(g)}`] : [];
        return { ok: !why.length, why, text: g ? `${g.name} commands your home defence.` : 'Stand the main general down: no general commands your defence.', go: g ? 'Make main' : 'Stand down' };
      },
      run: (btn) => act.setDefender(sel.value === '' ? null : sel.value, { button: btn }),
      update() { draw(); },
    };
  },
};

// ---------- attack ----------
/** Whether your state is at war with the target's: true, false, or null when the wars aren't loaded. */
function atWarWith(t) {
  const w = store.wars?.wars;
  if (!Array.isArray(w)) return null;
  const me = { realm: H().realm, state: H().state }, them = { realm: t.realm, state: t.state };
  return w.some((x) => (same(x.a, me) && same(x.b, them)) || (same(x.b, me) && same(x.a, them)));
}

const attack = {
  id: 'attack', group: 'military', name: 'Attack', wiki: 'attacks.html', keys: 'attack war army invade raid assault send troops mercenaries',
  target: true,
  what: 'Send an army against the target: troops, a general, mounts, medics and hired mercenaries.',
  badge: () => (isProtected(H()) ? 'under protection' : store.target ? `vs ${store.target.name}` : 'choose a target'),
  mount(body, ctx) {
    const p = P(), r = race(), rr = r.race || {}, slots = attackSlots(r);
    const merc = r.units[MERC] || { name: p.mercenary_name || 'Mercenaries' };
    const ds = rr.double_strike;
    const xrow = (k, label, tip) => `<tr><th scope="row" title="${esc(tip)}">${esc(label)}</th><td class="num" data-xhome="${k}"></td><td class="num">${field(`ra-x-${k}`, `${label} to send`, `data-xmax="${k}"`, `data-x="${k}"`)}</td></tr>`;
    body.innerHTML = `<div class="ra-line"><label for="ra-ak">Attack</label><select id="ra-ak">${p.attacks.map((k) => `<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('')}</select></div>
      <p class="ra-note" id="ra-ahint"></p>
      <div class="ra-line" id="ra-abl" hidden><label for="ra-ab">Land from</label><select id="ra-ab">${buildingOptions()}</select></div>
      <div class="ra-line"><label for="ra-ag">General</label><select id="ra-ag"></select></div>
      <p class="ra-note" id="ra-agl"></p>
      <div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Send</th><th class="num">Home</th><th class="num">Count</th></tr></thead>
        <tbody>${slots.map((i) => `<tr><th scope="row">${esc(r.units[i].name)} <span class="dim" title="Attack points each">${unitPoints(r, i)[0]}</span></th><td class="num" data-uhome="${i}"></td><td class="num">${field(`ra-u-${i}`, `${r.units[i].name} to send`, `data-umax="${i}"`, `data-u="${i}"`)}</td></tr>`).join('')}</tbody>
        <tbody><tr class="grp"><th colspan="3">With the army</th></tr>
          ${xrow('medics', 'Medics', 'Save some of your dead')}${xrow('horses', 'Horses', `+${p.horse_offense} each; one mount per troop`)}${xrow('chariots', 'Chariots', `+${p.chariot_offense} each; one mount per troop`)}
          ${xrow('mercs', merc.name, `Hired for this attack, one per ${mercRatio()} of your troops; survivors leave after`)}
          ${rr.mercenary_upgrades ? xrow('upmercs', `${merc.name}, upgraded`, `Of those hired, fight ${p.upgrade_bonus_bp / 100}% stronger, for ${p.upgrade_material}`) : ''}</tbody></table></div>
      <p class="ra-note"><label><input type="checkbox" data-x="double"${ds ? '' : ' disabled'}> Keep a second strike</label>
        <span class="dim">${ds ? `(at war, led by a general with ${ds.general_traits}+ traits: strike again within ${ds.window_ticks} ticks at ${ds.strength_bp / 100}% offense)` : `(only ${esc(racesWith((x) => x.race?.double_strike))})`}</span></p>
      <div class="ra-seg"><button type="button" class="rg-btn ghost mini" id="ra-aall">All at home</button><button type="button" class="rg-btn ghost mini" id="ra-aclr">Clear</button></div>
      <p class="ra-note" id="ra-ascore"></p>`;
    const $ = (id) => body.querySelector(`#ra-${id}`);
    if (ctx.args.kind && p.attacks.some((k) => k.id === ctx.args.kind)) $('ak').value = ctx.args.kind;
    const kind = () => p.attacks.find((k) => k.id === $('ak').value);
    const units = () => { const u = Array(10).fill(0); body.querySelectorAll('[data-u]').forEach((i) => { u[Number(i.dataset.u)] = n0(i.value); }); return u; };
    const gen = () => (H().generals || []).find((g) => String(g.id) === $('ag').value) || null;
    const preview = () => { const t = store.target; ctx.preview?.(t ? { states: [`${t.realm}:${t.state}`], march: [`${H().realm}:${H().state}`, `${t.realm}:${t.state}`] } : null); };
    let firstGen = true;
    const how = () => {
      $('ahint').textContent = attackHint($('ak').value);
      $('abl').hidden = !buildingChoice($('ak').value);
      if (document.activeElement !== $('ag')) { const v = firstGen ? String(ctx.args.general ?? '') : $('ag').value; firstGen = false; $('ag').innerHTML = G.generalOptions(v); }
      $('agl').textContent = G.generalLine($('ag').value);
    };
    const draw = () => {
      const h = H(), u = units(), x = readExtras(body), q = attackQuote(r, u, x);
      for (const i of slots) body.querySelector(`[data-uhome="${i}"]`).textContent = fmt(h.units[i]);
      const home = { medics: fmt(h.medics), horses: fmt(h.horses), chariots: fmt(h.chariots), mercs: `≤${fmt(q.mercMax)}`, upmercs: '' };
      body.querySelectorAll('[data-xhome]').forEach((c) => { c.textContent = home[c.dataset.xhome]; });
      const mu = [...u]; mu[MERC] = x.mercs;
      const s = offenseParts(r, mu, x, $('ag').value, store.target?.race, $('ak').value);
      $('ascore').textContent = !q.own ? 'Choose troops to send.' : s
        ? `Attack score ${fmt(s.total)}: troops ${fmt(s.plain)}${s.elite ? `, elites ${fmt(s.eliteAfter)}` : ''}${s.mounts ? `, mounts ${fmt(s.mounts)}` : ''}, offense bonus ${pctBp(s.offBp)}.${store.target ? '' : ' A target may add bonuses against its race.'}`
        : `${quoteText(q, x).text} (before bonuses; this server doesn't send them).`;
    };
    how(); draw(); preview();
    ctx.on($('ak'), 'change', () => { how(); draw(); });
    ctx.on($('ag'), 'change', () => { how(); draw(); });
    ctx.on(body, 'input', draw);
    ctx.on(body, 'click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const h = H();
      if (b.dataset.umax) { const n = h.units[Number(b.dataset.umax)]; body.querySelector(`[data-u="${b.dataset.umax}"]`).value = n ? String(n) : ''; if (!n) ctx.say?.(`No ${unitName(Number(b.dataset.umax))} at home.`, 'bad'); }
      if (b.dataset.xmax) {
        const x = readExtras(body), q = attackQuote(r, units(), x), [n, why] = extraMax(b.dataset.xmax, q, x);
        body.querySelector(`[data-x="${b.dataset.xmax}"]`).value = n ? String(n) : '';
        if (!n && why) ctx.say?.(`None: ${why}.`, 'bad');
      }
      if (b.id === 'ra-aall') body.querySelectorAll('[data-u]').forEach((i) => { const n = h.units[Number(i.dataset.u)]; i.value = n ? String(n) : ''; });
      if (b.id === 'ra-aclr') { body.querySelectorAll('input[type=number]').forEach((i) => { i.value = ''; }); body.querySelector('[data-x="double"]').checked = false; }
      draw(); ctx.refresh();
    });
    return {
      check() {
        const h = H(), t = store.target, k = kind(), u = units(), x = readExtras(body), q = attackQuote(r, u, x), g = gen(), why = [];
        if (!t) why.push('choose a target on the ring');
        if (isProtected(h)) why.push('you are under protection: leave it first to attack');
        if (t) {
          const mine = t.realm === h.realm && t.state === h.state, pct = h.land ? (100 * t.land) / h.land : 0;
          if (t.id === h.id) why.push('that\'s your own house');
          else {
            if (t.protected) why.push(`${t.name} is under protection`);
            if (k && !k.own_state && mine) why.push(`${k.name} is for other states; ${t.name} is in yours`);
            if (k?.own_state && !mine) why.push(`${k.name} is only for houses in your own state`);
            if (k?.range_min_bp && pct < k.range_min_bp / 100) why.push(`${k.name} needs a target at least ${k.range_min_bp / 100}% of your land; they're ${pct.toFixed(0)}%`);
            if (k?.war_only && atWarWith(t) === false) why.push(`${k.name} is only against the state you're at war with`);
          }
        }
        if (k?.requires_trait && !(g?.traits || []).includes(k.requires_trait)) why.push(`${k.name} needs a general with the ${G.traitName(k.requires_trait)} trait leading`);
        if (k?.requires_building && !(h.buildings[k.requires_building] > 0)) why.push(`${k.name} needs a finished ${store.rules.buildings.find((b) => b.building === k.requires_building)?.name || k.requires_building}`);
        if (k?.cost_material && q.own) {
          // The kind's own rule (rules.params.attacks): 1 material per troops_per_material troops sent, rounded up.
          const need = Math.ceil((q.own + x.mercs) / Math.max(1, k.troops_per_material)), have = h.materials[k.cost_material] || 0;
          if (need > have) why.push(`${k.name} carries 1 ${k.cost_material} for every ${k.troops_per_material} troops: ${fmt(need)} needed, you have ${fmt(have)}`);
        }
        if (g?.spent_until > store.tick) why.push(`${g.name} is spent until tick ${fmt(g.spent_until)}`);
        if (x.double) {
          if (!ds) why.push('your race can\'t keep a second strike');
          else {
            if (!g || (g.traits || []).length < ds.general_traits) why.push(`a second strike needs a general with ${ds.general_traits}+ traits leading`);
            if (t && atWarWith(t) === false) why.push('a second strike needs your state at war with theirs');
          }
        }
        for (const i of slots) if (u[i] > h.units[i]) why.push(`you have ${fmt(h.units[i])} ${unitName(i)} at home`);
        why.push(...q.problems);
        if (!q.own) why.unshift('choose troops to send');
        const sent = slots.filter((i) => u[i]).map((i) => `${fmt(u[i])} ${unitName(i)}`);
        const along = [x.mercs && `${fmt(x.mercs)} hired ${merc.name} (${fmt(q.mercGold)} gold)`, x.upmercs && `${fmt(x.upmercs)} of them upgraded`, x.medics && `${fmt(x.medics)} medics`, x.horses && `${fmt(x.horses)} horses`, x.chariots && `${fmt(x.chariots)} chariots`].filter(Boolean);
        const text = q.own ? `${k?.name || 'Attack'}${t ? ` ${t.name} (${addr(t)})` : ''} with ${listText(sent)}${along.length ? `, and ${listText(along)}` : ''}${g ? `, led by ${g.name}` : ''}${x.double ? ', keeping a second strike' : ''}: ${fmt(q.off)} offense before bonuses. Takes ${k?.takes || 'land'}.` : '';
        return { ok: !why.length, why, text, go: k?.name || 'Attack', confirm: t ? `Confirm: ${k?.name || 'attack'} ${t.name}` : 'Confirm: attack' };
      },
      run(btn) {
        const u = units(), x = readExtras(body);
        u[MERC] = x.mercs;
        return act.attack({ target: store.target, kind: $('ak').value, units: u, general: $('ag').value, medics: x.medics, horses: x.horses, chariots: x.chariots,
          upgradedMercenaries: x.upmercs, doubleStrike: x.double, building: buildingChoice($('ak').value) ? $('ab').value || null : null }, { button: btn });
      },
      update(c) {
        if (!c || c.has('house') || c.has('rules') || c.has('hall')) how();
        if (!c || c.has('target')) preview();
        draw();
      },
      destroy() { ctx.preview?.(null); },
    };
  },
};

// ---------- race mechanics ----------
const mirror = {
  id: 'mirror', group: 'military', name: 'Mirror', wiki: 'race-echolalian.html', keys: 'mirror echolalian copy unit stats race',
  what: 'Fight with the unit stats of a house that attacked you lately, or your own.',
  badge: () => { const m = H().mirror; return m ? (m.race ? `as ${raceName(m.race)}` : 'own stats') : `${racesWith((x) => x.race?.mirror)} only`; },
  mount(body) {
    body.innerHTML = `<div class="ra-line"><label for="ra-mo">Fight as</label><select id="ra-mo"></select></div><p class="ra-note" id="ra-mnote"></p>`;
    const sel = body.querySelector('#ra-mo');
    const draw = () => {
      const m = H().mirror;
      if (document.activeElement !== sel) {
        const v = sel.value;
        sel.innerHTML = `<option value="">your own (${esc(race().name || '')})</option>` + (m?.attackers || []).map((id) => { const k = knownHouses().get(id); return `<option value="${id}">${esc(who(id))}${k?.race ? ` · ${esc(raceName(k.race))}` : ''}</option>`; }).join('');
        if ([...sel.options].some((o) => o.value === v)) sel.value = v;
      }
      sel.disabled = !m;
      body.querySelector('#ra-mnote').textContent = !m ? `Only ${racesWith((x) => x.race?.mirror)} mirror another race's unit stats.`
        : `Now fighting with ${m.race ? `the ${raceName(m.race)}'s unit stats` : 'your own unit stats'}.${m.next_tick > store.tick ? ` Next change at tick ${fmt(m.next_tick)}.` : ''}${(m.attackers || []).length ? '' : ' No attackers yet to mirror.'}`;
    };
    draw();
    return {
      check() {
        const m = H().mirror;
        if (!m) return { ok: false, why: [race().race?.mirror ? 'this server doesn\'t send your mirror yet' : `only ${racesWith((x) => x.race?.mirror)} can mirror`], go: 'Mirror' };
        if (m.next_tick > store.tick) return { ok: false, why: [`you can change it again at tick ${fmt(m.next_tick)}`], go: 'Mirror' };
        const of = sel.value === '' ? null : Number(sel.value), k = of != null ? knownHouses().get(of) : null;
        if ((of == null && !m.race) || (k?.race && k.race === m.race)) return { ok: false, why: ['you fight with those stats already'], go: 'Mirror' };
        return { ok: true, why: [], text: `${of == null ? 'Fight with your own unit stats again.' : `Fight with the unit stats of ${who(of)}${k?.race ? `, the ${raceName(k.race)}` : ''}.`} You can change it again a day later.`, go: 'Mirror' };
      },
      run: (btn) => act.mirror(sel.value, { button: btn }),
      update() { draw(); },
    };
  },
};

const secondStrike = {
  id: 'second-strike', group: 'military', name: 'Second strike', wiki: 'race-drow.html', keys: 'second strike double drow specialists',
  what: 'Strike again with the army you kept ready: part of its offense, killing specialists only.',
  badge: () => { const s = H().second_strike; return s ? (s.until_tick >= store.tick ? 'ready' : 'lapsed') : `${racesWith((x) => x.race?.double_strike)} only`; },
  mount(body) {
    const note = () => {
      const s = H().second_strike;
      body.innerHTML = `<p class="ra-note">${s ? `Ready against ${esc(who(s.target))} until tick ${fmt(s.until_tick)}${s.until_tick >= store.tick ? ` (${fmt(s.until_tick - store.tick)} ticks left)` : ' (lapsed)'}. It takes no land; your general is then spent for a while.`
        : race().race?.double_strike ? 'No second strike kept: send an attack with "Keep a second strike" ticked.' : `Only ${esc(racesWith((x) => x.race?.double_strike))} keep a second strike.`}</p>`;
    };
    note();
    return {
      check() {
        const s = H().second_strike;
        if (!s) return { ok: false, why: [race().race?.double_strike ? 'no second strike kept (tick "Keep a second strike" on an attack)' : `only ${racesWith((x) => x.race?.double_strike)} keep a second strike`], go: 'Strike' };
        if (s.until_tick < store.tick) return { ok: false, why: ['the second strike has lapsed'], go: 'Strike' };
        return { ok: true, why: [], text: `Strike ${who(s.target)} again.`, go: 'Strike', confirm: 'Confirm: strike again' };
      },
      run: (btn) => act.secondStrike({ button: btn }),
      update() { note(); },
    };
  },
};

const retake = {
  id: 'retake-land', group: 'military', name: 'Retake land', wiki: 'race-mycellian.html', keys: 'retake roots mycellian land back reclaim',
  what: 'Take back acres an attacker\'s army is still carrying home, for elites.',
  badge: () => { const n = (H().retakable || []).length; return race().race?.roots ? (n ? `${n} to take back` : 'nothing carried') : `${racesWith((x) => x.race?.roots)} only`; },
  mount(body, ctx) {
    body.innerHTML = `<div class="ra-line"><label for="ra-lf">From</label><select id="ra-lf"></select></div>
      <div class="ra-line"><label for="ra-ln">Acres</label>${field('ra-ln', 'Acres to take back', 'data-max')}</div><p class="ra-note" id="ra-lnote"></p>`;
    const sel = body.querySelector('#ra-lf'), inp = body.querySelector('#ra-ln');
    const per = () => race().race?.roots?.elites_per_acre || 0;
    const row = () => (H().retakable || []).find((x) => String(x.from) === sel.value) || null;
    const draw = () => {
      const list = H().retakable || [];
      if (document.activeElement !== sel) {
        const v = sel.value;
        sel.innerHTML = list.map((x) => `<option value="${x.from}">${esc(who(x.from))}: ${fmt(x.land)} acres, up to ${fmt(x.most)}</option>`).join('') || '<option value="">no army carries your land</option>';
        if ([...sel.options].some((o) => o.value === v)) sel.value = v;
      }
      body.querySelector('#ra-lnote').textContent = race().race?.roots ? `${fmt(per())} elites an acre; you have ${fmt(H().units[3])} elites at home.` : `Only ${racesWith((x) => x.race?.roots)} can take land back.`;
    };
    draw();
    ctx.on(body.querySelector('[data-max]'), 'click', () => { const x = row(); inp.value = x?.most ? String(x.most) : ''; if (!x?.most) ctx.say?.('Nothing to take back.', 'bad'); ctx.refresh(); });
    return {
      check() {
        if (!race().race?.roots) return { ok: false, why: [`only ${racesWith((x) => x.race?.roots)} can take land back`], go: 'Take back' };
        const x = row(), n = n0(inp.value);
        if (!x) return { ok: false, why: ['no army is carrying your land home'], go: 'Take back' };
        if (!n) return { ok: false, why: ['choose how many acres'], go: 'Take back' };
        const why = n > x.most ? [`at most ${fmt(x.most)} acres from this army`] : [];
        return { ok: !why.length, why, text: `Take back ${fmt(n)} acres from ${who(x.from)}'s army for ${fmt(n * per())} elites.`, go: `Take back ${fmt(n)}`, confirm: `Confirm: spend ${fmt(n * per())} elites` };
      },
      run: (btn) => act.retakeLand(sel.value, n0(inp.value), { button: btn }),
      update() { draw(); },
    };
  },
};

export default [train, release, draft, medics, upgrade, chariots, refine, recruit, defender, attack, mirror, secondStrike, retake];
