// Shadows: a thieves' operation on the target, and your state's spy reports. The sums are core/intrigue.js's.
import { store, loadReports, reportsOn } from '../../../core/store.js';
import * as act from '../../../core/actions.js';
import { OP_GROUPS, groupOf, ops, opById, opExtra, opLine, opNerve, parseFrame } from '../../../core/intrigue.js';
import { fmt, esc, addr, when, fullTime, intelRows, reportKind, REPORT_LABEL, THIEF } from '../../../core/words.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const sameSt = (a, b) => !!a && !!b && a.realm === b.realm && a.state === b.state;
const KINDS = { survey: 'Survey', muster: 'Muster', ledgers: 'Ledgers', archives: 'Archives', couriers: 'Couriers', dossier: 'Dossier', scrying: 'Scrying', omens: 'Omens', roads: 'Roads' };
const kindName = (k) => KINDS[k] || REPORT_LABEL[k] || k;
const KEY = 'realmstate.ring.op';

const operation = {
  id: 'operation', group: 'shadows', name: 'Operation', wiki: 'intrigue.html', target: true,
  keys: 'thieves spy steal sabotage subversion survey muster ledgers archives couriers dossier intel false flag frame',
  what: 'Send thieves against the target: intel, theft, sabotage or subversion.',
  badge: () => `${fmt(store.house?.units[THIEF] || 0)} thieves · ${pct(store.house?.nerve_bp || 0)} nerve`,
  mount(body, ctx) {
    const h = () => store.house, P = store.rules.params;
    const groups = () => [...OP_GROUPS.map(([g, effects]) => [g, ops().filter((o) => effects.includes(o.effect))]), ['Other', ops().filter((o) => groupOf(o) === 'Other')]].filter(([, l]) => l.length);
    let pick = ctx.args.op;
    if (!opById(pick)) { try { pick = localStorage.getItem(KEY); } catch { /* storage off */ } }
    if (!opById(pick)) pick = ops()[0]?.id;
    body.innerHTML = `<div class="ra-line"><label for="ra-op">Operation</label><select id="ra-op">${groups().map(([g, l]) => `<optgroup label="${esc(g)}">${l.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <p class="ra-note" id="ra-opline"></p>
      <div class="ra-line"><label for="ra-opn">Thieves</label><span class="ra-in"><input id="ra-opn" type="number" min="1" inputmode="numeric" placeholder="0"><button type="button" class="rg-btn ghost mini" data-max aria-label="Most you can: every thief at home">MAX</button></span></div>
      <div class="ra-line" id="ra-opxl" hidden><label for="ra-opx" id="ra-opxn"></label><select id="ra-opx"></select></div>
      <div class="ra-line"><label for="ra-opf">False flag</label><input id="ra-opf" placeholder="r:s (optional)" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="ra-opfn"></div>
      <p class="ra-note" id="ra-opfn">Blame a third state: more nerve, and if caught, they and you both turn hostile.</p>
      <p class="ra-note" id="ra-opme"></p>`;
    const $ = (id) => body.querySelector(`#ra-op${id}`);
    const sel = body.querySelector('#ra-op');
    if (pick) sel.value = pick;
    if (ctx.args.n) $('n').value = String(ctx.args.n);
    const frameOf = () => { try { return { frame: parseFrame($('f').value), why: '' }; } catch (e) { return { frame: null, why: e.message }; } };
    const draw = () => {
      const o = opById(sel.value);
      if (!o || !h()) return;
      const f = frameOf();
      $('line').textContent = opLine(o, !!f.frame);
      // The extra choice some operations need: a material, a kind of books, a building.
      const ex = opExtra(o), x = $('x');
      $('xl').hidden = !ex;
      if (ex && x.dataset.k !== o.effect) {
        x.innerHTML = ex.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
        x.dataset.k = o.effect;
        if (ex.key === 'building' && ex.options.some(([v]) => v === 'homes')) x.value = 'homes';
      }
      if (ex) $('xn').textContent = ex.label;
      $('me').textContent = `You have ${fmt(h().units[THIEF])} thieves at home and ${pct(h().nerve_bp)} nerve (+${pct(P.nerve_regen_bp || 0)} a tick). Vigilance on you: ${pct(h().vigilance_bp || 0)}.`;
    };
    draw();
    ctx.on(sel, 'change', () => { try { localStorage.setItem(KEY, sel.value); } catch { /* storage off */ } draw(); });
    ctx.on($('f'), 'input', draw);
    ctx.on(body.querySelector('[data-max]'), 'click', () => {
      const n = h().units[THIEF] || 0;
      $('n').value = n ? String(n) : '';
      if (!n) ctx.say?.('You have no thieves at home.', 'bad');
      ctx.refresh();
    });
    return {
      check() {
        const o = opById(sel.value), t = store.target, me = h(), n = n0($('n').value), f = frameOf();
        if (!o) return { ok: false, why: ['this age has no operations'], go: 'Send thieves' };
        const nv = opNerve(o, !!f.frame), have = me.units[THIEF] || 0, why = [];
        if (!t) why.push('choose a target on the ring');
        else if (t.id === me.id) why.push('that\'s your own house');
        else if (sameSt(t, me)) why.push('that house is in your own state');
        if (t?.protected) why.push('the target is under protection');
        if (!n) why.push(have ? 'send at least one thief' : 'you have no thieves at home');
        else if (n > have) why.push(`you have ${fmt(have)} thieves at home`);
        if (me.nerve_bp < nv.ok) why.push(`your nerve is ${pct(me.nerve_bp)}; it costs ${pct(nv.ok)}`);
        const fs = f.frame && { realm: f.frame[0], state: f.frame[1] };
        if (f.why) why.push(f.why);
        else if (fs && (sameSt(fs, me) || sameSt(fs, t))) why.push('a false flag must blame a third state');
        // Some operations carry a material: 1 for every so many thieves (rounded up, as the server counts it).
        let mat = '';
        if (o.cost_material && n) {
          const need = Math.ceil(n / (o.thieves_per_material || 1)), got = me.materials[o.cost_material] || 0;
          mat = `, carrying ${fmt(need)} ${o.cost_material}`;
          if (need > got) why.push(`needs ${fmt(need)} ${o.cost_material}; you have ${fmt(got)}`);
        }
        const ex = opExtra(o);
        if (ex && !$('x').value) why.push(`choose a ${ex.label.toLowerCase()}`);
        const text = t ? `Send ${fmt(n)} thieves to ${o.name.toLowerCase()} on ${t.name} (${addr(t)})${fs ? `, blaming ${f.frame.join(':')}` : ''}${mat}. Costs ${pct(nv.ok)} nerve (${pct(nv.caught)} if caught).` : '';
        return { ok: !why.length, why, text, go: n ? `Send ${fmt(n)} thieves` : 'Send thieves' };
      },
      async run(btn) {
        const o = opById(sel.value), ex = opExtra(o), extra = { frame: frameOf().frame };
        if (ex) extra[ex.key] = $('x').value;
        const out = await act.operation(store.target, o.id, n0($('n').value), { button: btn }, extra);
        if (out) loadReports();
        return out;
      },
      update() { draw(); },
    };
  },
};

const reports = {
  id: 'reports', group: 'shadows', name: 'Spy reports', wiki: 'intrigue.html', stay: true,
  keys: 'intel reports survey muster ledgers archives couriers dossier scrying omens roads',
  what: 'Your state\'s intel, newest first; every house of the state shares it.',
  badge: () => `${fmt((store.reports || []).length)} reports`,
  mount(body, ctx) {
    const PER = 25;
    let limit = PER, open = null, openAt = 0, shown = [], onTarget = null, onTargetId = null;
    if (!store.reportsLoaded) loadReports();
    body.innerHTML = `<div class="ra-line"><label for="ra-rpf">Show</label><select id="ra-rpf"></select></div><div id="ra-rpbody"></div>`;
    const f = body.querySelector('#ra-rpf'), out = body.querySelector('#ra-rpbody');
    const spy = (id) => (store.house && id === store.house.id ? 'you' : store.state?.members.find((m) => m.id === id)?.name || `house ${id}`);
    const cell = (b) => `<td class="${typeof b === 'number' ? 'num' : ''}">${esc(typeof b === 'number' ? fmt(b) : b)}</td>`;
    const options = () => {
      const v = f.value || 'all', all = store.reports || [], kinds = new Map(), t = store.target;
      for (const x of all) { const k = reportKind(x.report || {}); kinds.set(k, (kinds.get(k) || 0) + 1); }
      f.innerHTML = `<option value="all">All reports (${fmt(all.length)})</option>${t && t.id !== store.house?.id ? `<option value="tgt">On ${esc(t.name)}</option>` : ''}${[...kinds].map(([k, n]) => `<option value="k:${esc(k)}">${esc(kindName(k))} (${fmt(n)})</option>`).join('')}`;
      f.value = [...f.options].some((o) => o.value === v) ? v : 'all';
    };
    const list = () => {
      const all = store.reports || [];
      if (f.value === 'tgt') return onTarget || [];
      if (f.value.startsWith('k:')) return all.filter((x) => reportKind(x.report || {}) === f.value.slice(2));
      return all;
    };
    // The list (kind, house, age; each kind a button that opens it), or one report's rows with a way back.
    const draw = (focus) => {
      if (open) {
        const r = open.report || {}, hs = r.house, k = reportKind(r);
        out.innerHTML = `<p class="ra-note"><button type="button" class="rg-btn ghost mini" data-back>‹ All reports</button></p>
          <h3 class="ra-sub">${esc(kindName(k))}: ${esc(hs?.name || 'a house')}${hs ? ` <span class="dim">${addr(hs)}</span>` : ''}</h3>
          <p class="ra-note">${esc(fullTime(open.at))} · by ${esc(spy(open.spy))}${hs ? ` <button type="button" class="rg-btn ghost mini" data-state="${hs.realm}:${hs.state}">Show the state</button>` : ''}</p>
          <div class="ra-scroll"><table class="ra-tbl"><tbody>${intelRows(r).map(([a, b]) => `<tr><th scope="row">${esc(a)}</th>${cell(b)}</tr>`).join('')}</tbody></table></div>`;
        if (focus) out.querySelector('[data-back]')?.focus();
        return;
      }
      const l = list();
      shown = l.slice(0, limit);
      out.innerHTML = l.length ? `<div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Kind</th><th>House</th><th>When</th></tr></thead><tbody>${shown.map((x, i) => {
        const r = x.report || {}, k = reportKind(r), hs = r.house;
        return `<tr><td><button type="button" class="rg-btn ghost mini" data-rep="${i}" aria-label="Open the ${esc(kindName(k))} of ${esc(hs?.name || 'a house')}, ${esc(when(x.at))}">${esc(kindName(k))}</button></td>
          <td>${hs ? `${esc(hs.name)} <span class="dim">${addr(hs)}</span>` : '<span class="dim">–</span>'}</td><td title="${esc(fullTime(x.at))}">${esc(when(x.at))}</td></tr>`;
      }).join('')}</tbody></table></div>${l.length > shown.length ? `<p class="ra-note">${fmt(shown.length)} of ${fmt(l.length)} <button type="button" class="rg-btn ghost mini" data-more>Show more</button></p>` : ''}`
        : `<p class="ra-note">${f.value === 'tgt' && !onTarget ? 'Loading…' : 'No reports here yet. Intel operations (Survey, Muster, Ledgers, Archives, Couriers, a Full Dossier) and divinations add them.'}</p>`;
      if (typeof focus === 'string') out.querySelector(focus)?.focus();
    };
    // "On your target" reads that house's reports fresh.
    const pickFilter = async () => {
      limit = PER;
      if (f.value === 'tgt' && store.target && onTargetId !== store.target.id) {
        onTarget = null; onTargetId = store.target.id;
        draw();
        try { onTarget = await reportsOn(onTargetId); } catch { onTarget = []; }
      }
      draw();
    };
    options(); draw();
    ctx.on(f, 'change', () => { open = null; pickFilter(); });
    ctx.on(out, 'click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.rep != null) { openAt = Number(b.dataset.rep); open = shown[openAt]; draw(true); }
      else if (b.hasAttribute('data-back')) { open = null; draw(`[data-rep="${openAt}"]`); }
      else if (b.hasAttribute('data-more')) { limit += PER; draw(`[data-rep="${limit - PER}"]`); }
      else if (b.dataset.state) ctx.openState(b.dataset.state);
    });
    return {
      check() {
        const n = (store.reports || []).length;
        return { ok: true, why: [], text: n ? `${fmt(n)} reports from your state. Open one to read it.` : 'No reports yet.', go: 'Refresh' };
      },
      async run() { onTargetId = null; await loadReports(); if (f.value === 'tgt') await pickFilter(); return true; },
      update(c) {
        if (c?.has('target')) onTargetId = null;
        if (!c || c.has('reports') || c.has('target') || c.has('state')) {
          options();
          if (f.value === 'tgt' && onTargetId == null) pickFilter(); else if (!open) draw();
        }
      },
    };
  },
};

export default [operation, reports];
