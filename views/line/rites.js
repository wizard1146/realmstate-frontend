// Straightline's Rites: your aether, adepts and resin at a glance; three tabs. Cast: every rite as a card, one group
// at a time (self rites, divinations, hexes) as on Intrigue, chosen by a click; the sheet casts it (a target for divinations and hexes, what
// your state's relations allow there, what it costs). On you: rites in force on your house, your Spell Resilience and
// your vengeance. Auto-cast: self rites your house casts by itself, kept up or every so many ticks, above an aether
// buffer. Adepts: where your shrines stop gathering, and releasing some. Logic: core/rites.js, actions.
import { store, setTarget } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr } from '../../core/words.js';
import { rites, riteById, riteKind, riteFor, ap, lengthText, needsText, unfriendlyExtra, riteDoes, riteCost, riteOn, riteShort, inForce, resilienceText, vengeanceList, stName } from '../../core/rites.js';

const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const GROUPS = [['self', 'Self rites', 'always work if you have the aether'], ['divination', 'Divinations', 'intel on a house, shared with your state'], ['hex', 'Hexes', 'burn resin; harm a house']];
const TABS = [['cast', 'Cast'], ['on', 'On you'], ['auto', 'Auto-cast'], ['adepts', 'Adepts']];
const KEY = 'realmstate.line.rites';

export function mountRites(host, on) {
  const P = store.rules.params, mat = P.rite_material;
  let tab = 'cast', pick = rites()[0]?.id;
  try { const s = JSON.parse(localStorage.getItem(KEY)) || {}; if (TABS.some(([t]) => t === s.tab)) tab = s.tab; if (riteById(s.pick)) pick = s.pick; } catch { /* storage off */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ tab, pick })); } catch { /* storage off */ } };
  host.innerHTML = `<div class="lpart lbuild lint lrite">
    <dl class="st-glance in-glance" id="lr-glance"></dl>
    <div class="ltabs" role="tablist" aria-label="Rites">${TABS.map(([t, label]) =>
      `<button type="button" role="tab" id="lr-tab-${t}" aria-controls="lr-${t}" data-tab="${t}">${label}</button>`).join('')}</div>

    <div role="tabpanel" id="lr-cast" aria-labelledby="lr-tab-cast" data-panel="cast">
      <div class="atk-layout">
        <div class="atk-main"><div id="lr-rites"></div></div>
        <aside class="atk-sheet" aria-label="The rite">
          <h3 class="sub">Rite</h3>
          <div class="in-chosen" id="lr-chosen" aria-live="polite"></div>
          <div id="lr-tw">
            <h3 class="sub">On</h3>
            <form id="lr-tf" class="atk-find" novalidate>
              <label class="vh" for="lr-addr">Target house, by address</label>
              <input id="lr-addr" placeholder="r:s:seat" inputmode="text" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">
              <button class="btn">Look up</button>
            </form>
            <div class="atk-card" id="lr-card" aria-live="polite"></div>
          </div>
          <p class="doing" id="lr-doing" aria-live="polite" hidden></p>
          <div class="atk-go"><button type="button" class="btn primary" id="lr-go">Cast</button></div>
        </aside>
      </div>
    </div>

    <div role="tabpanel" id="lr-on" aria-labelledby="lr-tab-on" data-panel="on">
      <section><h3 class="sub">In force on you</h3><div id="lr-force"></div></section>
      <section><h3 class="sub">Your defences</h3><div class="rt-def" id="lr-def"></div></section>
    </div>

    <div role="tabpanel" id="lr-auto" aria-labelledby="lr-tab-auto" data-panel="auto">
      <p class="what">Your house can cast its self rites by itself, even while you're away. Each tick, right after rites run out, every auto-cast that is due casts, in the order you turned them on. Keep one up and it never lapses; or cast it every so many ticks to spend less. A buffer keeps aether back for hexes and divinations. If one can't cast, your news says why, once.</p>
      <div class="rt-auto" id="lr-autos"></div>
    </div>

    <div role="tabpanel" id="lr-adepts" aria-labelledby="lr-tab-adepts" data-panel="adepts">
      <section class="mil-card"><h3 class="sub">Where your shrines stop</h3>
        <p class="what">Shrines draw adepts from your peasants each tick, up to what they can hold. Set a limit, in adepts an acre, and they stop there; leave it empty for no limit.</p>
        <form id="lr-cf" class="lform" novalidate>
          <label for="lr-cap">Stop at</label><span class="field"><input id="lr-cap" type="number" min="0" step="0.1" inputmode="decimal" placeholder="no limit"> an acre</span>
          <button class="btn primary" id="lr-capgo">Set limit</button>
        </form>
        <p class="mil-now" id="lr-capn"></p></section>
      <section class="mil-card"><h3 class="sub">Release adepts</h3>
        <p class="what">Released adepts go back to the fields as peasants; the limit comes down so they aren't gathered back.</p>
        <form id="lr-rf" class="lform" novalidate>
          <label for="lr-rel">How many</label><span class="field"><input id="lr-rel" type="number" min="1" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" id="lr-relmax" aria-label="All your adepts">MAX</button></span>
          <button class="btn" id="lr-relgo">Release</button>
        </form></section>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#lr-${id}`);
  let target = store.target || null;

  // ---------- tabs ----------
  const bar = host.querySelector('.ltabs');
  function showTab(t, focus = false) {
    tab = t; save();
    host.querySelectorAll('[role=tab]').forEach((b) => { const sel = b.dataset.tab === t; b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; });
    host.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (focus) $(`tab-${t}`).focus({ preventScroll: true });
  }
  on(bar, 'click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  on(bar, 'keydown', (ev) => {
    const i = TABS.findIndex(([t]) => t === tab), n = TABS.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    showTab(TABS[j][0], true);
  });

  // ---------- at a glance ----------
  function glance() {
    const h = store.house;
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    const lasting = rites().find((r) => r.ticks && riteKind(r) === 'self'), c = lasting && riteFor(lasting);
    $('glance').innerHTML = card('Aether', fmt(h.aether || 0), h.aether_capacity != null ? `of ${fmt(h.aether_capacity)}` : '')
      + card('Adepts', fmt(h.adepts || 0), `${((h.adepts || 0) / Math.max(1, h.land)).toFixed(2)} an acre`)
      + card(mat[0].toUpperCase() + mat.slice(1), fmt(h.materials[mat] || 0), 'hexes burn it')
      + card('Lasting rites', c && c.exact ? `${Math.round((c.ticks * 100) / lasting.ticks)}%` : '–', 'of full length, by your shrines');
  }

  // ---------- rites as cards ----------
  // One group at a time, as on Intrigue: ‹ NAME › with a dot for each group under it, then its cards. The arrows cycle;
  // a dot jumps. Opens on the group last looked at, else the chosen rite's.
  const groupsOf = () => GROUPS.map(([k, label, note]) => [label, note, rites().filter((r) => riteKind(r) === k)]).filter(([, , l]) => l.length);
  let gi = Math.max(0, groupsOf().findIndex(([, , l]) => l.some((r) => r.id === pick)));
  try { const v = localStorage.getItem(`${KEY}.group`); if (v != null && Number(v) >= 0 && Number(v) < groupsOf().length) gi = Number(v); } catch { /* storage off */ }
  function cards(focus) {
    const groups = groupsOf(), n = groups.length;
    if (!n) { $('rites').innerHTML = '<p class="dim">This server sends no rites.</p>'; return; }
    gi = Math.min(gi, n - 1);
    const [label, note, list] = groups[gi];
    const live = inForce();
    $('rites').innerHTML = `<section class="in-car" aria-roledescription="carousel" aria-label="Rites">
      <div class="in-carh"><button type="button" class="btn in-arrow" data-step="-1" aria-label="Previous group: ${esc(groups[(gi + n - 1) % n][0])}">‹</button>
        <div class="in-gwrap"><h3 class="in-gname" aria-live="polite">${esc(label)}</h3>
          <div class="in-dots" role="group" aria-label="Groups">${groups.map(([name], i) => `<button type="button" class="in-dot${i === gi ? ' on' : ''}" data-group="${i}" aria-label="${esc(name)}" aria-current="${i === gi}" title="${esc(name)}"></button>`).join('')}</div></div>
        <button type="button" class="btn in-arrow" data-step="1" aria-label="Next group: ${esc(groups[(gi + 1) % n][0])}">›</button></div>
      <p class="in-gnote dim small">${esc(note)}</p>
      <div class="in-cards" role="group" aria-label="${esc(label)}, ${gi + 1} of ${n}">${list.map((r) => {
        const c = riteFor(r), short = riteShort(r), k = riteKind(r);
        // A self rite already working on you: green, with the ticks it has left.
        const left = k === 'self' ? Math.max(0, ...live.filter(([nm]) => nm === r.name).map(([, , t]) => t)) : 0;
        return `<button type="button" class="in-op${r.id === pick ? ' on' : ''}${short ? ' cant' : ''}${left ? ' live' : ''}" data-rite="${esc(r.id)}" aria-pressed="${r.id === pick}">
          <span class="in-name">${esc(r.name)}${left ? ` <span class="rt-live"><span aria-hidden="true">✓</span> In force (${fmt(left)} tick${left === 1 ? '' : 's'})</span>` : ''}</span><span class="in-does">${esc(riteDoes(r))}</span>
          <span class="in-figs"><span><b>${ap(c)}${fmt(c.aether)}</b> aether</span>${c.incense ? `<span><b>${fmt(c.incense)}</b> ${esc(mat)}</span>` : ''}${k === 'self' ? '' : `<span><b>${pct(r.chance_bp)}</b> odds</span>`}${r.needs ? `<span class="need">${r.needs === 'war' ? 'war only' : `${esc(r.needs)} or war`}</span>` : ''}</span></button>`;
      }).join('')}</div>
      </section>`;
    if (focus) host.querySelector(focus)?.focus();
  }
  function showGroup(i, focus) {
    const n = groupsOf().length;
    gi = ((i % n) + n) % n;
    try { localStorage.setItem(`${KEY}.group`, String(gi)); } catch { /* storage off */ }
    cards(focus);
  }
  on($('rites'), 'click', (ev) => {
    const st = ev.target.closest('[data-step]'), dt = ev.target.closest('[data-group]');
    if (st) showGroup(gi + Number(st.dataset.step), `[data-step="${st.dataset.step}"]`);
    if (dt) showGroup(Number(dt.dataset.group), `[data-group="${dt.dataset.group}"]`);
  });
  // Left and right arrow keys on the header or dots cycle too.
  on($('rites'), 'keydown', (ev) => {
    if (!ev.target.closest('.in-carh') || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    ev.preventDefault();
    const d = ev.key === 'ArrowRight' ? 1 : -1, n = groupsOf().length;
    showGroup(gi + d, ev.target.closest('.in-dots') ? `[data-group="${(gi + d + n) % n}"]` : `[data-step="${d}"]`);
  });
  on($('rites'), 'click', (ev) => {
    const b = ev.target.closest('[data-rite]');
    if (!b) return;
    pick = b.dataset.rite; save();
    host.querySelectorAll('[data-rite]').forEach((x) => { const sel = x.dataset.rite === pick; x.classList.toggle('on', sel); x.setAttribute('aria-pressed', String(sel)); });
    sheet();
  });

  // ---------- the sheet ----------
  function sheet() {
    const r = riteById(pick), h = store.house;
    if (!r) return;
    const k = riteKind(r), c = riteFor(r), self = k === 'self';
    const chance = self ? 'Always works if you have the aether.' : `Odds: your adepts an acre against theirs, ×${pct(r.chance_bp)}, less their ward${k === 'hex' ? ' and Spell Resilience, plus your vengeance on their state' : ''}.`;
    $('chosen').innerHTML = `<p class="in-cname">${esc(r.name)}</p><p class="in-cdoes">${esc(riteDoes(r))}</p>
      <p class="dim small">Costs ${esc(riteCost(r))}${r.ticks ? `; lasts ${esc(lengthText(r))}` : ''}. ${esc(chance)}${r.needs ? ` ${esc(needsText(r)[0].toUpperCase() + needsText(r).slice(1))}${esc(unfriendlyExtra(r))}.` : ''}${k === 'hex' && r.resilience_bp ? ` Landing it hardens them +${pct(r.resilience_bp)} resilience.` : ''}</p>`;
    $('tw').hidden = self;
    // The target, and what your state's relations allow there.
    let why = [], cost = c.aether;
    if (!self) {
      if (!target) { $('card').innerHTML = '<p class="dim">No target yet: type an address.</p>'; why.push('choose a target'); }
      else {
        const s = { realm: target.realm, state: target.state }, o = riteOn(r, s);
        cost = o.cost;
        $('card').innerHTML = `<p class="atk-name">${esc(target.name)} <a href="#state" data-open-state="${target.realm}:${target.state}" class="addr">${addr(target)}</a></p>
          <p class="dim small">${o.known ? (o.war ? 'At war with your state' : `Your state feels ${esc(o.feel)} toward ${stName(s)}`) : 'Relations not loaded yet'}${o.cost !== c.aether || o.approx ? `; costs ${o.approx ? '≈' : ''}${fmt(o.cost)} aether there` : ''}${k === 'hex' && o.venge ? `; your vengeance lifts the odds by ${pct(o.venge)}` : ''}.</p>`;
        if (o.blocked) why.push(o.blocked);
        if (target.protected) why.push('the target is under protection');
      }
    }
    if (h.aether < cost) why.push(`it needs ${ap(c)}${fmt(cost)} aether; you have ${fmt(h.aether)}`);
    if (c.incense && (h.materials[mat] || 0) < c.incense) why.push(`it needs ${fmt(c.incense)} ${mat}; you have ${fmt(h.materials[mat] || 0)}`);
    const doing = $('doing');
    doing.hidden = false;
    doing.textContent = why.length ? `Can't yet: ${why.join('; ')}.` : self ? `Cast ${r.name} on your own house for ${fmt(cost)} aether.` : `Cast ${r.name} on ${target.name} (${addr(target)}) for ${fmt(cost)} aether.`;
    doing.classList.toggle('short', why.length > 0);
    $('go').disabled = why.length > 0;
  }
  async function lookUp(text) {
    try { target = await act.resolveAddress(text); setTarget(target); $('addr').value = addr(target); } catch (e) { $('card').innerHTML = `<p class="short">${esc(e.message)}</p>`; return; }
    sheet();
  }
  on($('tf'), 'submit', (ev) => { ev.preventDefault(); lookUp($('addr').value); });
  let typing = 0;
  on($('addr'), 'input', () => {
    clearTimeout(typing);
    const v = $('addr').value.trim();
    if (/^\d+[:\s.,]+\d+[:\s.,]+\d+$/.test(v) && (!target || v.replace(/[\s.,]+/g, ':') !== addr(target))) typing = setTimeout(() => lookUp(v), 450);
  });
  on($('go'), 'click', async () => {
    const r = riteById(pick);
    await act.cast(r.id, riteKind(r) === 'self' ? null : target, { button: $('go') });
    sheet();
  });

  // ---------- on you ----------
  function onYou() {
    const list = inForce();
    $('force').innerHTML = list.length ? `<div class="rt-force">${list.map(([n, until, left]) => `<div class="rt-fcard"><span class="in-name">${esc(n)}</span><span class="dim">until tick ${fmt(until)} · ${fmt(left)} tick${left === 1 ? '' : 's'} left</span></div>`).join('')}</div>`
      : '<p class="dim">No rites or hexes in force on your house.</p>';
    const h = store.house, v = vengeanceList();
    if (!('resilience_bp' in h)) { $('def').innerHTML = '<p class="dim">This server sends no Spell Resilience or vengeance.</p>'; return; }
    $('def').innerHTML = `<div class="rt-dcard"><p class="in-name">Spell Resilience <b>${esc(resilienceText())}</b></p>
        <p class="dim small">Each hex that lands on you adds its resilience; it cuts the odds of every hex on you by that much, and fades each tick.</p></div>
      <div class="rt-dcard"><p class="in-name">Vengeance</p>${v.length ? `<ul class="rt-veng">${v.map(([s, bp]) => `<li><a href="#state" data-open-state="${stName(s)}">State ${esc(stName(s))}</a> <b>+${pct(bp)}</b> hex odds</li>`).join('')}</ul>` : '<p class="dim">None: no state has tried a hex on you lately.</p>'}
        <p class="dim small">Every hex a state tries on you, landed or not, adds half its resilience to your vengeance on that state (up to ${pct(P.vengeance_max_bp || 0)}). Your hexes on its houses gain that much; casting one spends half.</p></div>`;
  }

  // ---------- auto-cast ----------
  // One card per self rite: on or off, how often (kept up, or every N ticks), the aether to keep; what that comes to.
  const autoOf = (id) => (store.house.autocasts || []).find((a) => a.rite === id);
  function autoForm(r) {
    const a = autoOf(r.id), c = riteFor(r), every = a ? a.every_ticks : 0;
    const order = a ? (store.house.autocasts || []).indexOf(a) + 1 : 0;
    const state = !a ? '<span class="dim">Off</span>'
      : a.held ? `<span class="short">Held: ${esc(a.held)}</span>`
      : `<span class="up">On${(store.house.autocasts || []).length > 1 ? ` (casts ${ord(order)})` : ''}</span>${a.last_tick != null ? ` <span class="dim">· last cast tick ${fmt(a.last_tick)}</span>` : ''}`;
    return `<section class="mil-card" data-auto="${esc(r.id)}"><h3 class="sub">${esc(r.name)}</h3>
      <p class="what">${esc(riteDoes(r))}. Costs ${esc(riteCost(r))}.</p>
      <p class="mil-now">${state}</p>
      <form class="lform" novalidate>
        <label for="lr-ae-${esc(r.id)}">How often</label>
        <span class="field"><select id="lr-ae-${esc(r.id)}" data-k="mode"><option value="up"${every ? '' : ' selected'}>Keep it up</option><option value="every"${every ? ' selected' : ''}>Every N ticks</option></select>
          <input type="number" min="1" step="1" inputmode="numeric" data-k="every" aria-label="Every how many ticks" value="${every || c.ticks || 1}"${every ? '' : ' hidden'}></span>
        <label for="lr-ak-${esc(r.id)}">Keep at least</label>
        <span class="field"><input id="lr-ak-${esc(r.id)}" type="number" min="0" step="1" inputmode="numeric" data-k="keep" placeholder="0" value="${a && a.keep_aether ? a.keep_aether : ''}"> aether</span>
        <span class="acts"><button class="btn primary" data-k="save">${a ? 'Update' : 'Turn on'}</button>${a ? '<button type="button" class="btn" data-k="off">Turn off</button>' : ''}</span>
      </form>
      <p class="dim small" data-k="sum"></p></section>`;
  }
  const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
  // What the form's choice comes to: the share of the time it's in force and the aether it spends a tick.
  function autoSum(card) {
    const r = riteById(card.dataset.auto), c = riteFor(r), f = (k) => card.querySelector(`[data-k="${k}"]`);
    const up = f('mode').value === 'up', n = Math.max(1, Math.round(Number(f('every').value) || 1));
    f('every').hidden = up;
    const period = up ? Math.max(1, c.ticks) : n, share = Math.min(1, c.ticks / period);
    f('sum').textContent = `In force ${Math.round(share * 100)}% of the time, for about ${fmt(Math.round(c.aether / period))} aether a tick at your land now.`
      + (!up && n < c.ticks ? ` It lasts ${c.ticks} ticks, so casting every ${n} renews it early and wastes aether.` : '');
  }
  function autos() {
    const list = rites().filter((r) => riteKind(r) === 'self');
    // Don't redraw under someone typing.
    if ($('autos').contains(document.activeElement) && document.activeElement.matches('input, select')) return;
    $('autos').innerHTML = list.length ? list.map(autoForm).join('') : '<p class="dim">This age has no self rites.</p>';
    $('autos').querySelectorAll('[data-auto]').forEach(autoSum);
  }
  on($('autos'), 'input', (ev) => { const card = ev.target.closest('[data-auto]'); if (card) autoSum(card); });
  on($('autos'), 'change', (ev) => { const card = ev.target.closest('[data-auto]'); if (card) autoSum(card); });
  on($('autos'), 'submit', async (ev) => {
    ev.preventDefault();
    const card = ev.target.closest('[data-auto]'), f = (k) => card.querySelector(`[data-k="${k}"]`);
    const every = f('mode').value === 'up' ? 0 : f('every').value;
    document.activeElement?.blur();
    await act.setAutocast(card.dataset.auto, every, f('keep').value, { button: f('save') });
  });
  on($('autos'), 'click', async (ev) => {
    const b = ev.target.closest('[data-k="off"]');
    if (!b) return;
    document.activeElement?.blur();
    await act.clearAutocast(b.closest('[data-auto]').dataset.auto, { button: b });
  });

  // ---------- adepts ----------
  function adepts() {
    const h = store.house, cap = h.adept_cap_tenths;
    if (document.activeElement !== $('cap')) $('cap').value = cap == null ? '' : (cap / 10).toFixed(1);
    $('capn').textContent = `You have ${fmt(h.adepts)} adepts, ${(h.adepts / Math.max(1, h.land)).toFixed(2)} an acre. `
      + (cap == null ? 'No limit: your shrines gather up to what they can hold.' : `Your shrines stop at ${(cap / 10).toFixed(1)} an acre (${fmt(Math.floor((cap * h.land) / 10))} adepts at your land now).`);
    $('rel').max = String(h.adepts);
    $('relgo').disabled = $('relmax').disabled = !h.adepts;
  }
  on($('cf'), 'submit', async (ev) => { ev.preventDefault(); await act.setAdeptCap($('cap').value === '' ? null : $('cap').value, { button: $('capgo') }); adepts(); });
  on($('relmax'), 'click', () => { $('rel').value = String(store.house.adepts || ''); $('rel').focus(); });
  on($('rf'), 'submit', async (ev) => { ev.preventDefault(); if (await act.releaseAdepts($('rel').value, { button: $('relgo') })) $('rel').value = ''; adepts(); });

  function draw() { if (!store.house) return; glance(); cards(); sheet(); onYou(); autos(); adepts(); }
  if (target) $('addr').value = addr(target);
  showTab(tab);
  draw();
  return {
    update(c) {
      if (!c || c.has('house') || c.has('rules') || c.has('relations')) draw();
      if (c?.has('target') && store.target && store.target.id !== target?.id) { target = { ...store.target }; $('addr').value = addr(target); sheet(); }
    },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
