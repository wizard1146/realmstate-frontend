// Land: explore, build (several buildings in one go), raze. The sums are core/prices.js and core/land.js's.
import { store } from '../../../core/store.js';
import * as act from '../../../core/actions.js';
import * as price from '../../../core/prices.js';
import { buildingGroups, buildTotals, buildRowProblem, buildMaxRow, razeEach, razeMax, razeProblem, exploreWhy, matText } from '../../../core/land.js';
import { fmt, esc } from '../../../core/words.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pctOf = (n, of) => (of ? `${((100 * n) / of).toFixed(1)}%` : '–');

/** A number field with MAX: [label, input id, button attr]. */
const field = (id, label, max) => `<span class="ra-in"><input id="${id}" type="number" min="0" inputmode="numeric" placeholder="0" aria-label="${esc(label)}"><button type="button" class="rg-btn ghost mini" ${max} aria-label="Most you can: ${esc(label)}">MAX</button></span>`;

const explore = {
  id: 'explore', group: 'land', name: 'Explore', wiki: 'exploring.html', keys: 'land acres settle claim',
  what: 'Claim new land with gold and soldiers; it arrives as barren acres.',
  badge: () => `${fmt(price.explorable() ?? 0)} explorable`,
  mount(body, ctx) {
    const h = () => store.house;
    body.innerHTML = `<div class="ra-line"><label for="ra-xn">Acres</label>${field('ra-xn', 'Acres to explore', 'data-max')}</div>
      <p class="ra-note" id="ra-xnote"></p>`;
    const inp = body.querySelector('#ra-xn');
    if (ctx.args.n) inp.value = String(ctx.args.n);
    ctx.on(body.querySelector('[data-max]'), 'click', () => { inp.value = String(price.exploreMax()); ctx.refresh(); });
    const note = () => { body.querySelector('#ra-xnote').textContent = `${fmt(price.explorable() ?? 0)} acres explorable now (more each tick). Each acre costs ${fmt(price.exploreCost(1))} gold and needs soldiers to settle it; you have ${fmt(h().gold)} gold and ${fmt(h().units[0])} soldiers at home.`; };
    note();
    return {
      check() {
        const n = n0(inp.value), p = price.exploreProblem(n);
        if (!n) return { ok: false, why: [price.exploreMax() ? 'choose how many acres' : exploreWhy()], go: 'Explore' };
        return { ok: !p, why: p ? [p] : [], text: `Explore ${fmt(n)} acres for ${fmt(price.exploreCost(n))} gold and ${fmt(price.exploreSoldiers(n))} soldiers, who go to settle it.`, go: `Explore ${fmt(n)}` };
      },
      run: (btn) => act.explore(n0(inp.value), { button: btn }),
      update() { note(); },
    };
  },
};

const build = {
  id: 'build', group: 'land', name: 'Build', wiki: 'construction.html', keys: 'buildings construct barren homes farms banks',
  what: 'Put up buildings on barren land: several kinds in one go.',
  badge: () => `${fmt(store.house.barren)} barren`,
  mount(body, ctx) {
    const h = () => store.house;
    body.innerHTML = `<p class="ra-note" id="ra-bsum"></p>
      <div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Building</th><th class="num">Own</th><th class="num">Share</th><th class="num">Build</th></tr></thead>
      ${buildingGroups().map(([g, list]) => `<tbody><tr class="grp"><th colspan="4">${esc(g)}</th></tr>${list.map((b) => `<tr><th scope="row">${esc(b.name)}${price.buildingPrice(b.building)?.max_count ? ` <span class="dim">(max ${price.buildingPrice(b.building).max_count})</span>` : ''}</th>
        <td class="num" data-own="${b.building}"></td><td class="num" data-share="${b.building}"></td>
        <td class="num">${field(`ra-b-${b.building}`, `${b.name} to build`, `data-bmax="${b.building}"`).replace('<input ', `<input data-b="${b.building}" `)}</td></tr>`).join('')}</tbody>`).join('')}</table></div>`;
    const rows = () => [...body.querySelectorAll('[data-b]')].map((i) => ({ id: i.dataset.b, n: n0(i.value) })).filter((r) => r.n);
    if (ctx.args.building) { const i = body.querySelector(`[data-b="${ctx.args.building}"]`); if (i) { i.value = String(ctx.args.n || ''); setTimeout(() => i.focus(), 0); } }
    ctx.on(body, 'click', (ev) => {
      const b = ev.target.closest('[data-bmax]');
      if (!b) return;
      const id = b.dataset.bmax, others = rows().filter((r) => r.id !== id), m = buildMaxRow(id, others);
      body.querySelector(`[data-b="${id}"]`).value = m.n ? String(m.n) : '';
      if (!m.n) ctx.say?.(m.why);
      ctx.refresh();
    });
    const draw = () => {
      for (const b of store.rules.buildings) {
        const own = (h().buildings[b.building] || 0), cons = (h().constructing[b.building] || 0);
        const o = body.querySelector(`[data-own="${b.building}"]`), s = body.querySelector(`[data-share="${b.building}"]`);
        if (o) o.innerHTML = `${fmt(own)}${cons ? ` <span class="dim">+${fmt(cons)}</span>` : ''}`;
        if (s) s.textContent = pctOf(own, h().land);
      }
      const t = buildTotals(rows());
      body.querySelector('#ra-bsum').innerHTML = `<b>${fmt(h().barren)}</b> barren acres of ${fmt(h().land)}; ${fmt(h().gold)} gold. ${t.barren ? `Left after this: ${fmt(t.left.barren)} acres, ${fmt(t.left.gold)} gold.` : 'Type how many of each.'}`;
    };
    draw();
    ctx.on(body, 'input', draw);
    return {
      check() {
        const r = rows();
        if (!r.length) return { ok: false, why: ['choose what to build'], go: 'Build' };
        const t = buildTotals(r), why = r.map((x) => buildRowProblem(x.id, x.n)).filter(Boolean);
        if (t.left.barren < 0) why.push(`needs ${fmt(t.barren)} barren acres; you have ${fmt(h().barren)}`);
        if (t.left.gold < 0) why.push(`needs ${fmt(t.gold)} gold; you have ${fmt(h().gold)}`);
        for (const [m, q] of Object.entries(t.materials)) if (q > (h().materials[m] || 0)) why.push(`needs ${fmt(q)} ${m}; you have ${fmt(h().materials[m] || 0)}`);
        const mats = matText(t.materials);
        return { ok: !why.length, why, text: `Build ${r.map((x) => `${fmt(x.n)} ${store.rules.buildings.find((b) => b.building === x.id)?.name || x.id}`).join(', ')} for ${fmt(t.gold)} gold${mats ? ` and ${mats}` : ''}.`, go: `Build ${fmt(t.barren)}` };
      },
      async run(btn) {
        const r = rows();
        if (r.length === 1) return act.build(r[0].id, r[0].n, { button: btn });
        const out = await act.buildMany(r.map((x) => ({ building: x.id, count: x.n })), { button: btn });
        return out.some((x) => x.ok);
      },
      update() { draw(); },
    };
  },
};

const raze = {
  id: 'raze', group: 'land', name: 'Raze', wiki: 'construction.html', keys: 'demolish destroy buildings',
  what: 'Tear down finished buildings to free their land.',
  badge: () => `${fmt(razeEach())} gold each`,
  mount(body, ctx) {
    const h = () => store.house;
    const list = () => store.rules.buildings.filter((b) => (h().buildings[b.building] || 0) > 0);
    body.innerHTML = `<p class="ra-note" id="ra-rnote"></p><div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Building</th><th class="num">Own</th><th class="num">Raze</th></tr></thead><tbody id="ra-rrows"></tbody></table></div>`;
    const draw = () => {
      const keep = new Map([...body.querySelectorAll('[data-r]')].map((i) => [i.dataset.r, i.value]));
      body.querySelector('#ra-rnote').textContent = `Razing costs ${fmt(razeEach())} gold a building (it grows with your land). Buildings still going up can't be razed.`;
      const l = list();
      body.querySelector('#ra-rrows').innerHTML = l.length ? l.map((b) => `<tr><th scope="row">${esc(b.name)}</th><td class="num">${fmt(h().buildings[b.building])}</td>
        <td class="num">${field(`ra-r-${b.building}`, `${b.name} to raze`, `data-rmax="${b.building}"`).replace('<input ', `<input data-r="${b.building}" value="${esc(keep.get(b.building) || '')}" `)}</td></tr>`).join('')
        : '<tr><td colspan="3" class="dim">Nothing built yet.</td></tr>';
    };
    draw();
    const rows = () => [...body.querySelectorAll('[data-r]')].map((i) => ({ id: i.dataset.r, n: n0(i.value) })).filter((r) => r.n);
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-rmax]'); if (b) { body.querySelector(`[data-r="${b.dataset.rmax}"]`).value = String(razeMax(b.dataset.rmax)); ctx.refresh(); } });
    return {
      check() {
        const r = rows();
        if (!r.length) return { ok: false, why: ['choose what to raze'], go: 'Raze' };
        const gold = r.reduce((a, x) => a + x.n, 0) * razeEach(), why = r.map((x) => razeProblem(x.id, x.n)).filter((x, i, a) => x && a.indexOf(x) === i);
        if (gold > h().gold) why.push(`needs ${fmt(gold)} gold; you have ${fmt(h().gold)}`);
        const n = r.reduce((a, x) => a + x.n, 0);
        return { ok: !why.length, why, text: `Raze ${r.map((x) => `${fmt(x.n)} ${store.rules.buildings.find((b) => b.building === x.id)?.name || x.id}`).join(', ')} for ${fmt(gold)} gold. The land turns barren.`, go: `Raze ${fmt(n)}`, confirm: `Confirm: raze ${fmt(n)}` };
      },
      async run(btn) {
        let ok = false;
        for (const x of rows()) ok = (await act.raze(x.id, x.n, { button: btn })) || ok;
        return ok;
      },
      update() { draw(); },
    };
  },
};

export default [explore, build, raze];
