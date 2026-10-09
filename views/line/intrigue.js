// Straightline's Intrigue: your thieves at a glance; every operation as a card, grouped (Intel, Theft, Sabotage,
// Subversion), chosen by a click; the sheet on the right sends it (target, thieves, any choice it needs, a false
// flag); your state's spy reports below, filtered by kind or by your target. Logic: core/intrigue.js, actions.
import { store, say, setTarget, reportsOn, loadReports } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr, when, fullTime, intelRows, reportKind, REPORT_LABEL, THIEF } from '../../core/words.js';
import { OP_GROUPS, groupOf, ops, opById, opExtra, opDoes, opNerve, parseFrame } from '../../core/intrigue.js';
import { throneGlyph } from './throne.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const KINDS = { survey: 'Survey', muster: 'Muster', ledgers: 'Ledgers', archives: 'Archives', couriers: 'Couriers', dossier: 'Dossier', scrying: 'Scrying', omens: 'Omens', roads: 'Roads' };
const KEY = 'realmstate.line.intrigue.op';

export function mountIntrigue(host, on) {
  const P = store.rules.params;
  let pick = 'survey';
  try { const v = localStorage.getItem(KEY); if (v && opById(v)) pick = v; } catch { /* storage off */ }
  if (!opById(pick)) pick = ops()[0]?.id;
  host.innerHTML = `<div class="lpart lbuild lint${throneGlyph() ? ' glyph' : ''}">
    <dl class="st-glance in-glance" id="li-glance"></dl>
    <div class="atk-layout">
      <div class="atk-main">
        <p class="what">Choose an operation, then send your thieves from the sheet on the right. Odds are shown against your usual chance on that house; their vigilance lowers it, and every operation raises it.</p>
        <div id="li-ops"></div>
      </div>
      <aside class="atk-sheet" aria-label="The operation">
        <h3 class="sub">Against</h3>
        <form id="li-tf" class="atk-find" novalidate>
          <label class="vh" for="li-addr">Target house, by address</label>
          <input id="li-addr" placeholder="r:s:seat" inputmode="numeric" autocomplete="off" spellcheck="false">
          <button class="btn">Look up</button>
        </form>
        <div class="atk-card" id="li-card" aria-live="polite"><p class="dim">No target yet: type an address.</p></div>
        <h3 class="sub">Operation</h3>
        <div class="in-chosen" id="li-chosen" aria-live="polite"></div>
        <div class="lform atk-grid">
          <label for="li-n">Thieves</label><span class="field"><input id="li-n" type="number" min="1" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" id="li-max" aria-label="Every thief at home">MAX</button></span>
          <label for="li-x" id="li-xl" hidden></label><select id="li-x" hidden></select>
          <label for="li-flag">False flag</label><input id="li-flag" placeholder="r:s (optional)" inputmode="numeric" autocomplete="off" aria-describedby="li-flagn">
          <p class="atk-note" id="li-flagn">Blame another state: more nerve, and if caught, they and you both turn hostile.</p>
        </div>
        <p class="doing" id="li-doing" aria-live="polite" hidden></p>
        <div class="atk-go"><button type="button" class="btn primary" id="li-go">Send thieves</button></div>
      </aside>
    </div>
    <section class="in-reps"><div class="wd-shead"><h3 class="sub">Reports <span class="dim">your state's intel, newest first; every house of the state shares it</span></h3>
      <label class="vh" for="li-rf">Show</label><select id="li-rf"></select></div>
      <div class="in-replist" id="li-reps"></div></section>
  </div>`;
  const $ = (id) => host.querySelector(`#li-${id}`);
  let target = store.target || null;

  // ---------- at a glance ----------
  function glance() {
    const h = store.house;
    const card = (k, v, note = '') => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<dd class="rank"><span>${note}</span></dd>` : ''}</div>`;
    $('glance').innerHTML = card('Thieves at home', fmt(h.units[THIEF]), esc(store.rules.races ? (store.house && (store.rules.races.find((r) => r?.identity === h.race)?.units[THIEF]?.name)) || 'thieves' : 'thieves'))
      + card('Nerve', pct(h.nerve_bp), `+${pct(P.nerve_regen_bp)} a tick`)
      + card('Vigilance on you', pct(h.vigilance_bp || 0), 'their odds against you fall by this')
      + card('Reports', fmt((store.reports || []).length), 'from your state');
  }

  // ---------- operations as cards ----------
  function cards() {
    const list = ops(), groups = [...OP_GROUPS.map(([g, effects]) => [g, list.filter((o) => effects.includes(o.effect))]), ['Other', list.filter((o) => groupOf(o) === 'Other')]].filter(([, l]) => l.length);
    $('ops').innerHTML = groups.map(([g, l]) => `<section class="in-grp"><h3 class="sub">${esc(g)}</h3><div class="in-cards" role="group" aria-label="${esc(g)}">${l.map((o) => {
      const n = opNerve(o);
      return `<button type="button" class="in-op${o.id === pick ? ' on' : ''}" data-op="${esc(o.id)}" aria-pressed="${o.id === pick}">
        <span class="in-name">${esc(o.name)}</span><span class="in-does">${esc(opDoes(o))}</span>
        <span class="in-figs"><span><b>${pct(n.ok)}</b> nerve</span><span><b>${pct(o.chance_bp)}</b> odds</span><span><b>+${pct(o.vigilance_bp)}</b> vigil</span></span></button>`;
    }).join('')}</div></section>`).join('');
  }
  on($('ops'), 'click', (ev) => {
    const b = ev.target.closest('[data-op]');
    if (!b) return;
    pick = b.dataset.op;
    try { localStorage.setItem(KEY, pick); } catch { /* storage off */ }
    host.querySelectorAll('[data-op]').forEach((x) => { const sel = x.dataset.op === pick; x.classList.toggle('on', sel); x.setAttribute('aria-pressed', String(sel)); });
    sheet();
  });

  // ---------- the target ----------
  function card() {
    const t = target;
    if (!t) { $('card').innerHTML = '<p class="dim">No target yet: type an address.</p>'; return; }
    const h = store.house, pctLand = h.land ? (100 * t.land) / h.land : 0;
    $('card').innerHTML = `<p class="atk-name">${esc(t.name)} <a href="#state" data-open-state="${t.realm}:${t.state}" class="addr">${addr(t)}</a></p>
      <dl class="atk-facts"><div><dt>Land</dt><dd>${fmt(t.land)} <span class="dim">(${pctLand.toFixed(0)}% of yours)</span></dd></div><div><dt>Might</dt><dd>${fmt(t.might)}</dd></div></dl>
      ${t.protected ? '<p class="short">Under protection: thieves can\'t touch it yet.</p>' : ''}${t.id === h.id ? '<p class="short">That\'s your own house.</p>' : ''}`;
  }
  async function lookUp(text) {
    try { target = await act.resolveAddress(text); setTarget(target); $('addr').value = addr(target); } catch (e) { $('card').innerHTML = `<p class="short">${esc(e.message)}</p>`; return; }
    card(); sheet(); reps();
  }
  on($('tf'), 'submit', (ev) => { ev.preventDefault(); lookUp($('addr').value); });
  let typing = 0;
  on($('addr'), 'input', () => {
    clearTimeout(typing);
    const v = $('addr').value.trim();
    if (/^\d+:\d+:\d+$/.test(v) && (!target || v !== addr(target))) typing = setTimeout(() => lookUp(v), 450);
  });

  // ---------- the sheet: what it costs and does, and why it can't go ----------
  function sheet() {
    const o = opById(pick), h = store.house;
    if (!o) return;
    let frame = null, frameWhy = '';
    try { frame = parseFrame($('flag').value); } catch (e) { frameWhy = e.message; }
    const n = opNerve(o, !!frame), sent = n0($('n').value), have = h.units[THIEF];
    $('chosen').innerHTML = `<p class="in-cname">${esc(o.name)}</p><p class="in-cdoes">${esc(opDoes(o))}</p>
      <p class="dim small">Costs ${pct(n.ok)} nerve (${pct(n.caught)} if caught)${frame ? ', with the false flag' : ''}${o.cost_material ? `; 1 ${esc(o.cost_material)} per ${fmt(o.thieves_per_material)} thieves` : ''}${o.war_bonus_bp ? `; +${pct(o.war_bonus_bp)} odds at war` : ''}.</p>`;
    // The extra choice some operations need: a material, a kind of books, a building.
    const ex = opExtra(o), x = $('x');
    $('xl').hidden = x.hidden = !ex;
    if (ex && x.dataset.k !== o.effect) { x.innerHTML = ex.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join(''); x.dataset.k = o.effect; if (ex.key === 'building') x.value = 'homes'; }
    if (ex) $('xl').textContent = ex.label;
    const why = [!target ? 'choose a target' : '', target?.protected ? 'the target is under protection' : '', target && target.id === h.id ? 'that\'s your own house' : '',
      !sent ? 'send at least one thief' : '', sent > have ? `you have ${fmt(have)} thieves at home` : '', h.nerve_bp < n.ok ? `your nerve is ${pct(h.nerve_bp)}; it costs ${pct(n.ok)}` : '', frameWhy].filter(Boolean);
    const doing = $('doing');
    doing.hidden = !sent && !target;
    doing.textContent = why.length ? `Can't yet: ${why.join('; ')}.` : `Send ${fmt(sent)} thieves to ${o.name.toLowerCase()} on ${target.name} (${addr(target)})${frame ? `, blaming ${frame.join(':')}` : ''}.`;
    doing.classList.toggle('short', why.length > 0);
    $('go').disabled = why.length > 0;
  }
  on(host.querySelector('.atk-sheet'), 'input', sheet);
  on($('max'), 'click', () => { $('n').value = String(store.house.units[THIEF] || ''); sheet(); $('n').focus(); });
  on($('go'), 'click', async () => {
    const o = opById(pick);
    let frame = null;
    try { frame = parseFrame($('flag').value); } catch (e) { say(e.message, 'bad'); return; }
    const ex = opExtra(o), extra = { frame };
    if (ex) extra[ex.key] = $('x').value;
    const out = await act.operation(target, o.id, n0($('n').value), { button: $('go') }, extra);
    if (out) { loadReports(); }
    sheet();
  });

  // ---------- reports: newest first; all, or by kind, or on your target ----------
  let onTarget = null;
  async function reps() {
    const f = $('rf'), v = f.value || 'all', all = store.reports || [];
    const kinds = new Map();
    for (const x of all) { const k = reportKind(x.report || {}); kinds.set(k, (kinds.get(k) || 0) + 1); }
    f.innerHTML = `<option value="all">All reports (${all.length})</option>${target ? `<option value="tgt">On ${esc(target.name)}</option>` : ''}${[...kinds].map(([k, n]) => `<option value="k:${esc(k)}">${esc(KINDS[k] || k)} (${n})</option>`).join('')}`;
    f.value = [...f.options].some((o) => o.value === v) ? v : 'all';
    let list = all;
    if (f.value === 'tgt' && target) {
      try { onTarget = await reportsOn(target.id); } catch { onTarget = []; }
      list = onTarget;
    } else if (f.value.startsWith('k:')) list = all.filter((x) => reportKind(x.report || {}) === f.value.slice(2));
    const spy = (id) => (store.house && id === store.house.id ? 'you' : store.state?.members.find((m) => m.id === id)?.name || `house ${id}`);
    $('reps').innerHTML = list.length ? list.slice(0, 40).map((x) => {
      const r = x.report || {}, k = reportKind(r);
      return `<article class="in-rep"><header><span class="in-rk">${esc(KINDS[k] || REPORT_LABEL[k] || k)}</span>
          ${r.house ? `<a href="#state" data-open-state="${r.house.realm}:${r.house.state}">${esc(r.house.name)}</a> <span class="dim">${addr(r.house)}</span>` : ''}
          <time class="dim" title="${esc(fullTime(x.at))}">${esc(when(x.at))}</time><span class="dim">by ${esc(spy(x.spy))}</span></header>
        <table class="tbl"><tbody>${intelRows(r).map(([a, b]) => `<tr><th scope="row">${esc(a)}</th><td class="${typeof b === 'number' ? 'num' : ''}">${esc(typeof b === 'number' ? fmt(b) : b)}</td></tr>`).join('')}</tbody></table></article>`;
    }).join('') : '<p class="dim">No reports here yet. Intel operations (Survey, Muster, Ledgers, Archives, Couriers, a Full Dossier) add them.</p>';
  }
  on($('rf'), 'change', reps);

  function draw() { if (!store.house) return; glance(); card(); sheet(); }
  if (target) $('addr').value = addr(target);
  cards(); draw(); reps();
  return {
    update(c) {
      if (!c || c.has('house') || c.has('rules')) draw();
      if (c?.has('reports')) { glance(); reps(); }
      if (c?.has('target') && store.target && store.target.id !== target?.id) { target = { ...store.target }; $('addr').value = addr(target); card(); sheet(); }
    },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
