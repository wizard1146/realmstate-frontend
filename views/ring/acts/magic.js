// Magic: cast a rite (self, or a divination or hex on the target), where shrines stop gathering adepts, releasing
// adepts, what's in force on you, and the state's vigil. The sums are core/rites.js's.
import { store, loadState, refreshMe } from '../../../core/store.js';
import * as act from '../../../core/actions.js';
import { rites, riteById, riteKind, riteFor, ap, riteDoes, riteCost, riteOn, riteShort, lengthText, needsText, unfriendlyExtra, inForce, resilienceText, vengeanceList, stName } from '../../../core/rites.js';
import { isLeader, leaderWhy } from '../../../core/truths.js';
import { fmt, esc, addr } from '../../../core/words.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const KINDS = [['self', 'Self rites'], ['divination', 'Divinations'], ['hex', 'Hexes']];
const KEY = 'realmstate.ring.rite';
const mat = () => store.rules.params.rite_material;

/** A number field with MAX. */
const field = (id, label, max, ph = '0') => `<span class="ra-in"><input id="${id}" type="number" min="0" inputmode="numeric" placeholder="${ph}" aria-label="${esc(label)}"><button type="button" class="rg-btn ghost mini" ${max} aria-label="Most you can: ${esc(label)}">MAX</button></span>`;

const cast = {
  id: 'cast', group: 'magic', name: 'Cast a rite', wiki: 'rites.html', target: true,
  keys: 'rite spell magic aether self divination hex scry omens roads ward veil curse',
  what: 'Work a rite: on your own house, or a divination or hex on the target.',
  badge: () => `${fmt(store.house?.aether || 0)} aether`,
  mount(body, ctx) {
    const h = () => store.house;
    let pick = ctx.args.rite;
    if (!riteById(pick)) { try { pick = localStorage.getItem(KEY); } catch { /* storage off */ } }
    if (!riteById(pick)) pick = rites()[0]?.id;
    body.innerHTML = rites().length ? `<div class="ra-line"><label for="ra-ri">Rite</label><select id="ra-ri">${KINDS.map(([k, label]) => [label, rites().filter((r) => riteKind(r) === k)]).filter(([, l]) => l.length)
      .map(([label, l]) => `<optgroup label="${esc(label)}">${l.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <p class="ra-note" id="ra-rido"></p><p class="ra-note" id="ra-rion"></p><p class="ra-note" id="ra-rime"></p>`
      : '<p class="ra-note">This server sends no rites.</p>';
    const sel = body.querySelector('#ra-ri'), $ = (id) => body.querySelector(`#ra-ri${id}`);
    if (sel && pick) sel.value = pick;
    const draw = () => {
      const r = sel && riteById(sel.value);
      if (!r || !h()) return;
      const k = riteKind(r), t = store.target, m = mat();
      const chance = k === 'self' ? 'Always works if you have the aether.' : `Odds: your adepts an acre against theirs, ×${pct(r.chance_bp)}, less their ward${k === 'hex' ? ' and Spell Resilience, plus your vengeance on their state' : ''}${r.war_bonus_bp ? `; +${pct(r.war_bonus_bp)} at war` : ''}.`;
      $('do').textContent = `${cap(riteDoes(r))}. Costs ${riteCost(r)}${r.ticks ? `; lasts ${lengthText(r)}` : ''}. ${chance}${r.needs ? ` ${cap(needsText(r))}${unfriendlyExtra(r)}.` : ''}${k === 'hex' && r.resilience_bp ? ` Landing it hardens them +${pct(r.resilience_bp)} resilience.` : ''}`;
      // The target, and what your state's relations allow there.
      const on = $('on');
      on.hidden = k === 'self';
      if (k !== 'self') {
        if (!t) on.textContent = 'On: no target yet. Choose a house on the ring.';
        else {
          const s = { realm: t.realm, state: t.state }, o = riteOn(r, s), c = riteFor(r);
          on.textContent = `On ${t.name} (${addr(t)}): ${o.known ? (o.war ? 'at war with your state' : `your state feels ${o.feel} toward ${stName(s)}`) : 'relations not loaded yet'}${o.cost !== c.aether || o.approx ? `; costs ${o.approx ? '≈' : ''}${fmt(o.cost)} aether there` : ''}${k === 'hex' && o.venge ? `; your vengeance lifts the odds by ${pct(o.venge)}` : ''}.`;
        }
      }
      $('me').textContent = `You have ${fmt(h().aether || 0)} aether${h().aether_capacity != null ? ` of ${fmt(h().aether_capacity)}` : ''}, ${fmt(h().adepts || 0)} adepts and ${fmt(h().materials[m] || 0)} ${m}.`;
    };
    draw();
    if (sel) ctx.on(sel, 'change', () => { try { localStorage.setItem(KEY, sel.value); } catch { /* storage off */ } draw(); });
    return {
      check() {
        const r = sel && riteById(sel.value);
        if (!r) return { ok: false, why: ['this server sends no rites'], go: 'Cast' };
        const k = riteKind(r), t = store.target, me = h(), c = riteFor(r), m = mat(), why = [];
        let cost = c.aether, approx = !c.exact;
        if (k !== 'self') {
          if (!t) why.push(`${k === 'hex' ? 'a hex' : 'a divination'} needs a target: choose a house on the ring`);
          else {
            const o = riteOn(r, { realm: t.realm, state: t.state });
            cost = o.cost; approx = o.approx;
            if (t.id === me.id) why.push('that\'s your own house');
            else if (o.blocked) why.push(o.blocked);
            if (t.protected) why.push('the target is under protection');
          }
        }
        if (k === 'self') { const s = riteShort(r); if (s) why.push(s); }
        else {
          // On a state your own only dislikes, the aether can differ (riteOn); resin doesn't.
          if (me.aether < cost) why.push(`needs ${approx ? '≈' : ''}${fmt(cost)} aether, you have ${fmt(me.aether)}`);
          if (c.incense && (me.materials[m] || 0) < c.incense) why.push(`needs ${ap(c)}${fmt(c.incense)} ${m}, you have ${fmt(me.materials[m] || 0)}`);
        }
        const price = `${approx ? '≈' : ''}${fmt(cost)} aether${c.incense ? ` and ${ap(c)}${fmt(c.incense)} ${m}` : ''}`;
        const text = k === 'self' ? `Cast ${r.name} on your own house for ${price}.` : t ? `Cast ${r.name} on ${t.name} (${addr(t)}) for ${price}.` : '';
        return { ok: !why.length, why, text, go: `Cast ${r.name}` };
      },
      run(btn) {
        const r = riteById(sel.value);
        return act.cast(r.id, riteKind(r) === 'self' ? null : store.target, { button: btn });
      },
      update() { draw(); },
    };
  },
};

const adeptCap = {
  id: 'adept-cap', group: 'magic', name: 'Adept limit', wiki: 'rites.html#adepts', keys: 'adepts shrines cap limit gather',
  what: 'Set where your shrines stop gathering adepts, in adepts an acre; empty for no limit.',
  badge: () => { const c = store.house?.adept_cap_tenths; return c == null ? 'no limit' : `${(c / 10).toFixed(1)} an acre`; },
  mount(body, ctx) {
    const h = () => store.house;
    body.innerHTML = `<p class="ra-note">Shrines draw adepts from your peasants each tick, up to what they can hold. Set a limit and they stop there.</p>
      <div class="ra-line"><label for="ra-acap">Stop at (an acre)</label><span class="ra-in"><input id="ra-acap" type="number" min="0" step="0.1" inputmode="decimal" placeholder="no limit"><button type="button" class="rg-btn ghost mini" data-none aria-label="No limit: clear the field">None</button></span></div>
      <p class="ra-note" id="ra-acapn"></p>`;
    const inp = body.querySelector('#ra-acap');
    const now = () => h().adept_cap_tenths;
    if (now() != null) inp.value = (now() / 10).toFixed(1);
    if (ctx.args.perAcre != null) inp.value = String(ctx.args.perAcre);
    ctx.on(body.querySelector('[data-none]'), 'click', () => { inp.value = ''; inp.focus(); ctx.refresh(); });
    const note = () => {
      const c = now(), me = h();
      body.querySelector('#ra-acapn').textContent = `You have ${fmt(me.adepts || 0)} adepts, ${((me.adepts || 0) / Math.max(1, me.land)).toFixed(2)} an acre. `
        + (c == null ? 'No limit now: your shrines gather up to what they can hold.' : `Your shrines stop at ${(c / 10).toFixed(1)} an acre now (${fmt(Math.floor((c * me.land) / 10))} adepts at your land).`);
    };
    note();
    const want = () => (inp.value.trim() === '' ? null : Math.round(Number(inp.value) * 10));
    return {
      check() {
        const w = want(), why = [];
        if (w != null && (!Number.isFinite(w) || w < 0)) why.push('type a number of adepts an acre, 0 or more, or leave it empty for no limit');
        else if (w === (now() ?? null)) why.push(w == null ? 'there is no limit already' : 'that is the limit already');
        const text = w == null ? 'Your shrines gather adepts with no limit.' : Number.isFinite(w) && w >= 0 ? `Your shrines stop at ${(w / 10).toFixed(1)} adepts an acre (${fmt(Math.floor((w * h().land) / 10))} at your land now).` : '';
        return { ok: !why.length, why, text, go: w == null ? 'Remove the limit' : 'Set the limit' };
      },
      run: (btn) => act.setAdeptCap(inp.value.trim() === '' ? null : inp.value, { button: btn }),
      update() { note(); },
    };
  },
};

const releaseAdepts = {
  id: 'release-adepts', group: 'magic', name: 'Release adepts', wiki: 'rites.html#adepts', keys: 'adepts release peasants',
  what: 'Send adepts back to the fields as peasants; the limit comes down so they aren\'t gathered back.',
  badge: () => `${fmt(store.house?.adepts || 0)} adepts`,
  mount(body, ctx) {
    const h = () => store.house;
    body.innerHTML = `<div class="ra-line"><label for="ra-rel">Adepts</label>${field('ra-rel', 'Adepts to release', 'data-max')}</div><p class="ra-note" id="ra-reln"></p>`;
    const inp = body.querySelector('#ra-rel');
    if (ctx.args.n) inp.value = String(ctx.args.n);
    ctx.on(body.querySelector('[data-max]'), 'click', () => { inp.value = h().adepts ? String(h().adepts) : ''; if (!h().adepts) ctx.say?.('You have no adepts.', 'bad'); ctx.refresh(); });
    const note = () => { body.querySelector('#ra-reln').textContent = `You have ${fmt(h().adepts || 0)} adepts and ${fmt(h().peasants || 0)} peasants.`; };
    note();
    return {
      check() {
        const n = n0(inp.value), have = h().adepts || 0;
        if (!n) return { ok: false, why: [have ? 'choose how many adepts' : 'you have no adepts'], go: 'Release' };
        const why = n > have ? [`you have ${fmt(have)} adepts`] : [];
        return { ok: !why.length, why, text: `Release ${fmt(n)} adepts to the fields as peasants. Your shrines' limit comes down to match.`, go: `Release ${fmt(n)}`, confirm: `Confirm: release ${fmt(n)}` };
      },
      async run(btn) { const ok = await act.releaseAdepts(n0(inp.value), { button: btn }); if (ok) inp.value = ''; return ok; },
      update() { note(); },
    };
  },
};

const inForceAct = {
  id: 'in-force', group: 'magic', name: 'On you', wiki: 'rites.html', stay: true, keys: 'rites in force hexes resilience vengeance defences',
  what: 'Rites and hexes in force on your house, your Spell Resilience and your vengeance.',
  badge: () => { const n = store.house ? inForce().length : 0; return n ? `${n} in force` : ''; },
  mount(body, ctx) {
    const P = store.rules.params;
    const draw = () => {
      const h = store.house, list = inForce(), v = vengeanceList();
      body.innerHTML = `<h3 class="ra-sub">In force on you</h3>${list.length ? `<table class="ra-tbl"><thead><tr><th>Rite</th><th class="num">Until tick</th><th class="num">Left</th></tr></thead><tbody>${list.map(([n, until, left]) => `<tr><th scope="row">${esc(n)}</th><td class="num">${fmt(until)}</td><td class="num">${fmt(left)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="ra-note">No rites or hexes in force on your house.</p>'}
        ${!('resilience_bp' in h) ? '<p class="ra-note">This server sends no Spell Resilience or vengeance.</p>' : `<h3 class="ra-sub">Spell Resilience <span class="dim">${esc(resilienceText())}</span></h3>
        <p class="ra-note">Each hex that lands on you adds its resilience; it cuts the odds of every hex on you by that much, and fades each tick.</p>
        <h3 class="ra-sub">Vengeance</h3>${v.length ? `<table class="ra-tbl"><tbody>${v.map(([s, bp]) => `<tr><th scope="row"><button type="button" class="rg-btn ghost mini" data-state="${stName(s)}" aria-label="Show state ${stName(s)}">State ${stName(s)}</button></th><td class="num">+${pct(bp)} hex odds</td></tr>`).join('')}</tbody></table>` : '<p class="ra-note">None: no state has tried a hex on you lately.</p>'}
        <p class="ra-note">Every hex a state tries on you, landed or not, adds half its resilience to your vengeance on that state (up to ${pct(P.vengeance_max_bp || 0)}). Your hexes on its houses gain that much; casting one spends half.</p>`}`;
    };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-state]'); if (b) ctx.openState(b.dataset.state); });
    return {
      check: () => ({ ok: true, why: [], text: `${fmt(inForce().length)} in force on you.`, go: 'Refresh' }),
      async run() { await refreshMe(); return true; },
      update(c) { if (!c || c.has('house') || c.has('rules') || c.has('tick')) draw(); },
    };
  },
};

const vigil = {
  id: 'vigil', group: 'magic', name: 'Vigil', wiki: 'rites.html#vigils', stay: true, keys: 'vigil state rite give open aether incense resin',
  what: 'Your state\'s vigil: the leader opens one; every house gives aether and resin until it is in force.',
  badge: () => { const v = store.state?.vigil; return v ? (v.until_tick ? `${v.name} in force` : `${v.name} gathering`) : 'none open'; },
  mount(body, ctx) {
    const P = store.rules.params, h = () => store.house;
    if (!store.state) loadState();
    let mode = ctx.args.mode || (store.state?.vigil && !store.state.vigil.until_tick ? 'give' : isLeader() ? 'open' : 'give'), choice = ctx.args.vigil || null;
    body.innerHTML = `<div class="ra-seg" role="group" aria-label="Vigil"><button type="button" class="rg-btn ghost mini" data-mode="give">Give to it</button><button type="button" class="rg-btn ghost mini" data-mode="open">Open one</button></div>
      <div id="ra-vgnow"></div>
      <div data-part="give"><div class="ra-line"><label for="ra-vga">Aether</label>${field('ra-vga', 'Aether to give', 'data-vmax="aether"')}</div>
        <div class="ra-line"><label for="ra-vgi" id="ra-vgil"></label>${field('ra-vgi', 'Resin to give', 'data-vmax="incense"')}</div>
        <p class="ra-note">Anything beyond what it still needs you keep.</p></div>
      <div data-part="open"><p class="ra-note" id="ra-vgow"></p><div class="ra-grid" id="ra-vgl"></div></div>`;
    const $ = (id) => body.querySelector(`#ra-vg${id}`);
    const left = (v, k) => Math.max(0, v[k][1] - v[k][0]);
    const showMode = () => {
      body.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      body.querySelectorAll('[data-part]').forEach((p) => { p.hidden = p.dataset.part !== mode; });
    };
    const openWhy = () => { const v = store.state?.vigil; return !isLeader() ? leaderWhy() : v && v.until_tick ? 'your state already keeps a vigil' : ''; };
    const draw = () => {
      const s = store.state, m = mat(), v = s?.vigil, me = h();
      $('il').textContent = cap(m);
      body.querySelector('#ra-vgi').setAttribute('aria-label', `${cap(m)} to give`);
      $('now').innerHTML = !s ? '<p class="ra-note">Loading your state…</p>' : v
        ? `<table class="ra-tbl"><thead><tr><th>${esc(v.name)} <span class="dim">${v.until_tick ? `in force to tick ${fmt(v.until_tick)}` : 'gathering'}</span></th><th class="num">Given</th><th class="num">Needs</th><th class="num">You hold</th></tr></thead>
          <tbody><tr><th scope="row">Aether</th><td class="num">${fmt(v.aether[0])}</td><td class="num">${fmt(v.aether[1])}</td><td class="num">${fmt(me.aether || 0)}</td></tr>
          <tr><th scope="row">${esc(cap(m))}</th><td class="num">${fmt(v.incense[0])}</td><td class="num">${fmt(v.incense[1])}</td><td class="num">${fmt(me.materials[m] || 0)}</td></tr></tbody></table>`
        : `<p class="ra-note">No vigil open. ${isLeader() ? 'Open one.' : 'Your leader opens one; then every house may give.'}</p>`;
      const ow = openWhy();
      $('ow').textContent = ow ? `${cap(ow)}.` : v ? `Opening one replaces the ${v.name} being gathered.` : 'Choose a vigil to open for your state.';
      const focus = body.contains(document.activeElement) && document.activeElement.dataset?.vigil;
      $('l').innerHTML = (P.vigils || []).map((x) => `<div class="ra-card"><b>${esc(x.name)}</b> <span class="dim">${fmt(x.ticks)} ticks</span>
        <p>${esc((x.mods || []).map((mo) => `${mo.bp > 0 ? '+' : '−'}${pct(Math.abs(mo.bp))} ${mo.stat.replace(/_/g, ' ')}`).join(', '))}</p>
        <p class="dim">Needs ${fmt(x.aether)} aether and ${fmt(x.incense)} ${esc(m)}.</p>
        <button type="button" class="rg-btn ghost mini" data-vigil="${esc(x.id)}" aria-pressed="${x.id === choice}" aria-label="Choose ${esc(x.name)}">Choose</button></div>`).join('') || '<p class="ra-note">No vigils this age.</p>';
      if (focus) $('l').querySelector(`[data-vigil="${CSS.escape(focus)}"]`)?.focus();
    };
    showMode(); draw();
    ctx.on(body, 'click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const s = store.state, v = s?.vigil, me = h();
      if (b.dataset.mode) { mode = b.dataset.mode; showMode(); }
      else if (b.dataset.vigil) { choice = b.dataset.vigil; body.querySelectorAll('[data-vigil]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.vigil === choice))); }
      else if (b.dataset.vmax === 'aether') $('a').value = v ? String(Math.min(me.aether || 0, left(v, 'aether'))) : '';
      else if (b.dataset.vmax === 'incense') $('i').value = v ? String(Math.min(me.materials[mat()] || 0, left(v, 'incense'))) : '';
      else return;
      ctx.refresh();
    });
    return {
      check() {
        const s = store.state, v = s?.vigil, me = h(), m = mat();
        if (!s) return { ok: false, why: ['your state is still loading'], go: mode === 'open' ? 'Open the vigil' : 'Give' };
        if (mode === 'open') {
          const x = (P.vigils || []).find((y) => y.id === choice), why = [openWhy(), !x ? 'choose a vigil' : ''].filter(Boolean);
          return { ok: !why.length, why, text: x ? `Open ${x.name} for your state: it needs ${fmt(x.aether)} aether and ${fmt(x.incense)} ${m}${v && !v.until_tick ? `, and replaces the ${v.name} being gathered` : ''}.` : '', go: x ? `Open ${x.name}` : 'Open the vigil', confirm: v && !v.until_tick && x ? `Confirm: replace ${v.name}` : '' };
        }
        const a = n0($('a').value), i = n0($('i').value), gathering = v && !v.until_tick;
        const why = [!gathering ? (v ? 'the vigil is already in force' : 'no vigil is open') : '', gathering && !a && !i ? `give some aether or ${m}` : '',
          a > (me.aether || 0) ? `you hold ${fmt(me.aether || 0)} aether` : '', i > (me.materials[m] || 0) ? `you hold ${fmt(me.materials[m] || 0)} ${m}` : ''].filter(Boolean);
        return { ok: !why.length, why, text: gathering ? `Give ${fmt(Math.min(a, left(v, 'aether')))} aether and ${fmt(Math.min(i, left(v, 'incense')))} ${m} to ${v.name}.` : '', go: 'Give' };
      },
      async run(btn) {
        if (mode === 'open') return act.openVigil(choice, { button: btn });
        const ok = await act.giveToVigil(n0($('a').value), n0($('i').value), { button: btn });
        if (ok) { $('a').value = ''; $('i').value = ''; }
        return ok;
      },
      update(c) { if (!c || c.has('state') || c.has('house') || c.has('rules')) draw(); },
    };
  },
};

export default [cast, adeptCap, releaseAdepts, inForceAct, vigil];
