// Straightline's Rites: your aether, adepts and resin at a glance; three tabs. Cast: every rite as a card, grouped
// (self rites, divinations, hexes), chosen by a click; the sheet casts it (a target for divinations and hexes, what
// your state's relations allow there, what it costs). On you: rites in force on your house, your Spell Resilience and
// your vengeance. Adepts: where your shrines stop gathering, and releasing some. Logic: core/rites.js, actions.
import { store, setTarget } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr } from '../../core/words.js';
import { rites, riteById, riteKind, riteFor, ap, lengthText, needsText, unfriendlyExtra, riteDoes, riteCost, riteOn, riteShort, inForce, resilienceText, vengeanceList, stName } from '../../core/rites.js';

const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const GROUPS = [['self', 'Self rites', 'always work if you have the aether'], ['divination', 'Divinations', 'intel on a house, shared with your state'], ['hex', 'Hexes', 'burn resin; harm a house']];
const TABS = [['cast', 'Cast'], ['on', 'On you'], ['adepts', 'Adepts']];
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
              <input id="lr-addr" placeholder="r:s:seat" inputmode="numeric" autocomplete="off" spellcheck="false">
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
  function cards() {
    $('rites').innerHTML = GROUPS.map(([k, label, note]) => {
      const list = rites().filter((r) => riteKind(r) === k);
      return list.length ? `<section class="in-grp"><h3 class="sub">${label} <span class="dim">${note}</span></h3><div class="in-cards" role="group" aria-label="${label}">${list.map((r) => {
        const c = riteFor(r), short = riteShort(r);
        return `<button type="button" class="in-op${r.id === pick ? ' on' : ''}${short ? ' cant' : ''}" data-rite="${esc(r.id)}" aria-pressed="${r.id === pick}">
          <span class="in-name">${esc(r.name)}</span><span class="in-does">${esc(riteDoes(r))}</span>
          <span class="in-figs"><span><b>${ap(c)}${fmt(c.aether)}</b> aether</span>${c.incense ? `<span><b>${fmt(c.incense)}</b> ${esc(mat)}</span>` : ''}${k === 'self' ? '' : `<span><b>${pct(r.chance_bp)}</b> odds</span>`}${r.needs ? `<span class="need">${r.needs === 'war' ? 'war only' : `${esc(r.needs)} or war`}</span>` : ''}</span></button>`;
      }).join('')}</div></section>` : '';
    }).join('');
  }
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
    if (/^\d+:\d+:\d+$/.test(v) && (!target || v !== addr(target))) typing = setTimeout(() => lookUp(v), 450);
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

  function draw() { if (!store.house) return; glance(); cards(); sheet(); onYou(); adepts(); }
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
