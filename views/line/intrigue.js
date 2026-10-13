// Straightline's Intrigue: your thieves at a glance; every operation as a card, grouped (Intel, Theft, Sabotage,
// Subversion), chosen by a click; the sheet on the right sends it (target, thieves, any choice it needs, a false
// flag); your state's spy reports below, filtered by kind or by your target. Logic: core/intrigue.js, actions.
import { pinnedShares } from '../../core/intelprefs.js';
import { store, say, setTarget, reportsOn, loadReports, loadStateMembers } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr, when, fullTime, intelRows, reportKind, REPORT_LABEL, THIEF } from '../../core/words.js';
import { buildingGroups } from '../../core/land.js';
import { OP_GROUPS, groupOf, ops, opById, opExtra, opDoes, opNerve, parseFrame } from '../../core/intrigue.js';
import { throneGlyph } from './throne.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const KINDS = { survey: 'Survey', muster: 'Muster', ledgers: 'Ledgers', archives: 'Archives', couriers: 'Couriers', dossier: 'Dossier', scrying: 'Scrying', omens: 'Omens', roads: 'Roads' };
const KEY = 'realmstate.line.intrigue.op';
/** A survey on its card: their land, then each chosen building's share of it (Configuration, Intrigue). */
const surveyRows = (r) => [['Land', fmt(r.land || 0)], ...pinnedShares(r).map(([name, pc, n]) => [name, pc == null ? '–' : `${pc.toFixed(1)}%`, n ? fmt(n) : 'none'])];

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
        <h3 class="sub">Target</h3>
        <form id="li-tf" class="atk-find" novalidate>
          <label class="vh" for="li-addr">Target house, by address</label>
          <input id="li-addr" placeholder="r:s:seat" inputmode="text" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">
          <button class="btn">Look up</button>
        </form>
        <div class="atk-card" id="li-card" aria-live="polite"><p class="dim">No target yet: type an address.</p></div>
        <h3 class="sub">Operation</h3>
        <div class="in-chosen" id="li-chosen" aria-live="polite"></div>
        <div class="lform atk-grid">
          <label for="li-n">Thieves</label><span class="field"><input id="li-n" type="number" min="1" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" id="li-max" aria-label="Every thief at home">MAX</button></span>
          <label for="li-x" id="li-xl" hidden></label><select id="li-x" hidden></select>
          <label for="li-flag">False flag</label><input id="li-flag" placeholder="r:s (optional)" inputmode="text" autocapitalize="off" autocorrect="off" autocomplete="off" aria-describedby="li-flagn">
          <p class="atk-note" id="li-flagn">Blame another state: more nerve, and if caught, they and you both turn hostile.</p>
        </div>
        <p class="doing" id="li-doing" aria-live="polite" hidden></p>
        <div class="atk-go"><button type="button" class="btn primary" id="li-go">Send thieves</button></div>
      </aside>
    </div>
    <section class="in-reps"><div class="wd-shead"><h3 class="sub">Reports <span class="dim">your state's intel, newest first; every house of the state shares it</span></h3>
      <label class="vh" for="li-rf">Show</label><select id="li-rf"></select></div>
      <div class="in-replist" id="li-reps"></div>
      <nav class="in-pager" id="li-pager" aria-label="Report pages"></nav></section>
    <dialog class="ldlg in-rdlg" id="li-rdlg" aria-labelledby="li-rdlg-h">
      <header><h2 id="li-rdlg-h"></h2><button type="button" class="x" data-close aria-label="Close (Esc)">×</button></header>
      <div class="body" id="li-rdlg-b"></div></dialog>
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
  // One group at a time: ‹ INTEL › with a dot for each group under the name (the lit one is showing), then its cards. The arrows cycle;
  // a dot jumps. Opens on the group last looked at, else the chosen operation's.
  const groupsOf = () => { const list = ops(); return [...OP_GROUPS.map(([g, effects]) => [g, list.filter((o) => effects.includes(o.effect))]), ['Other', list.filter((o) => groupOf(o) === 'Other')]].filter(([, l]) => l.length); };
  let gi = Math.max(0, groupsOf().findIndex(([, l]) => l.some((o) => o.id === pick)));
  try { const v = localStorage.getItem(`${KEY}.group`); if (v != null && Number(v) >= 0 && Number(v) < groupsOf().length) gi = Number(v); } catch { /* storage off */ }
  function cards(focus) {
    const groups = groupsOf(), [g, l] = groups[gi], n = groups.length;
    $('ops').innerHTML = `<section class="in-car" aria-roledescription="carousel" aria-label="Operations">
      <div class="in-carh"><button type="button" class="btn in-arrow" data-step="-1" aria-label="Previous group: ${esc(groups[(gi + n - 1) % n][0])}">‹</button>
        <div class="in-gwrap"><h3 class="in-gname" aria-live="polite">${esc(g)}</h3>
          <div class="in-dots" role="group" aria-label="Groups">${groups.map(([name], i) => `<button type="button" class="in-dot${i === gi ? ' on' : ''}" data-group="${i}" aria-label="${esc(name)}" aria-current="${i === gi}" title="${esc(name)}"></button>`).join('')}</div></div>
        <button type="button" class="btn in-arrow" data-step="1" aria-label="Next group: ${esc(groups[(gi + 1) % n][0])}">›</button></div>
      <div class="in-cards" role="group" aria-label="${esc(g)}, ${gi + 1} of ${n}">${l.map((o) => {
        const nv = opNerve(o);
        return `<button type="button" class="in-op${o.id === pick ? ' on' : ''}" data-op="${esc(o.id)}" aria-pressed="${o.id === pick}">
          <span class="in-name">${esc(o.name)}</span><span class="in-does">${esc(opDoes(o))}</span>
          <span class="in-figs"><span><b>${pct(nv.ok)}</b> nerve</span><span><b>${pct(o.chance_bp)}</b> odds</span><span><b>+${pct(o.vigilance_bp)}</b> vigil</span></span></button>`;
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
  on($('ops'), 'click', (ev) => {
    const st = ev.target.closest('[data-step]'), dt = ev.target.closest('[data-group]');
    if (st) showGroup(gi + Number(st.dataset.step), `[data-step="${st.dataset.step}"]`);
    if (dt) showGroup(Number(dt.dataset.group), `[data-group="${dt.dataset.group}"]`);
  });
  // Left and right arrow keys on the header or dots cycle too.
  on($('ops'), 'keydown', (ev) => {
    if (!ev.target.closest('.in-carh') || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    ev.preventDefault();
    showGroup(gi + (ev.key === 'ArrowRight' ? 1 : -1), ev.target.closest('.in-dots') ? `[data-group="${(gi + (ev.key === 'ArrowRight' ? 1 : -1) + groupsOf().length) % groupsOf().length}"]` : `[data-step="${ev.key === 'ArrowRight' ? 1 : -1}"]`);
  });
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
    if (/^\d+[:\s.,]+\d+[:\s.,]+\d+$/.test(v) && (!target || v.replace(/[\s.,]+/g, ':') !== addr(target))) typing = setTimeout(() => lookUp(v), 450);
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
    // A page at a time; a new filter starts at page one.
    const pages = Math.max(1, Math.ceil(list.length / PER));
    if (f.value !== lastF) { page = 0; lastF = f.value; }
    page = Math.min(page, pages - 1);
    shown = list.slice(page * PER, page * PER + PER);
    pager(pages, list.length);
    $('reps').innerHTML = list.length ? shown.map((x, i) => {
      const r = x.report || {}, k = reportKind(r);
      return `<article class="in-rep" tabindex="0" role="button" data-rep="${i}" aria-haspopup="dialog" aria-label="${esc(KINDS[k] || k)} of ${esc(r.house?.name || 'a house')}, ${esc(when(x.at))}: open the full report"><header><span class="in-rk">${esc(KINDS[k] || REPORT_LABEL[k] || k)}</span>
          ${r.house ? `<a href="#state" data-open-state="${r.house.realm}:${r.house.state}">${esc(r.house.name)}</a> <span class="dim">${addr(r.house)}</span>` : ''}
          <time class="dim" title="${esc(fullTime(x.at))}">${esc(when(x.at))}</time><span class="dim">by ${esc(spy(x.spy))}</span></header>
        <table class="tbl${k === 'survey' ? ' in-rsum' : ''}"><tbody>${k === 'survey'
          ? surveyRows(r).map(([a, b, c]) => `<tr><th scope="row">${esc(a)}</th>${c ? `<td class="num dim">${esc(c)}</td>` : '<td></td>'}<td class="num">${esc(b)}</td></tr>`).join('')
          : intelRows(r).map(([a, b]) => `<tr><th scope="row">${esc(a)}</th><td class="${typeof b === 'number' ? 'num' : ''}">${esc(typeof b === 'number' ? fmt(b) : b)}</td></tr>`).join('')}</tbody></table></article>`;
    }).join('') : '<p class="dim">No reports here yet. Intel operations (Survey, Muster, Ledgers, Archives, Couriers, a Full Dossier) add them.</p>';
    raceStates();
  }
  /** Troops read by the target's race (its unit names): read the states of reports that don't say it, then redraw once. */
  const asked = new Set();
  const known = (h) => [...store.world.values()].some(({ members }) => members.some((m) => m.id === h.house));
  function raceStates() {
    const want = [...new Set(shown.map((x) => x.report?.house).filter((h) => h && !known(h)).map((h) => `${h.realm}:${h.state}`))].filter((k) => !asked.has(k));
    if (!want.length) return;
    want.forEach((k) => asked.add(k));
    Promise.all(want.map((k) => loadStateMembers(...k.split(':').map(Number)).catch(() => null))).then(reps);
  }
  on($('rf'), 'change', reps);
  // ---------- pages of reports: ‹ 1 2 3 … › ----------
  const PER = 8;
  let page = 0, lastF = null;
  function pager(pages, total) {
    const el = $('pager');
    if (pages < 2) { el.innerHTML = ''; return; }
    // Every page when there are few; else the first, the last, and two either side of this one.
    const want = [...Array(pages).keys()].filter((i) => pages <= 9 || i === 0 || i === pages - 1 || Math.abs(i - page) <= 2);
    let prev = -1, nums = '';
    for (const i of want) { if (i - prev > 1) nums += '<span class="gap" aria-hidden="true">…</span>'; nums += `<button type="button" class="btn mini${i === page ? ' on' : ''}" data-pg="${i}"${i === page ? ' aria-current="page"' : ''} aria-label="Page ${i + 1}">${i + 1}</button>`; prev = i; }
    el.innerHTML = `<button type="button" class="btn mini" data-pg="${page - 1}"${page ? '' : ' disabled'} aria-label="Previous page">‹</button>${nums}<button type="button" class="btn mini" data-pg="${page + 1}"${page < pages - 1 ? '' : ' disabled'} aria-label="Next page">›</button>
      <span class="dim small">${fmt(page * PER + 1)}–${fmt(Math.min(total, page * PER + PER))} of ${fmt(total)}</span>`;
  }
  on($('pager'), 'click', async (ev) => {
    // data-pg, not data-page: the page itself carries data-page (its name).
    const b = ev.target.closest('#li-pager [data-pg]'), to = Number(b?.dataset.pg);
    if (!b || b.disabled || !Number.isInteger(to)) return;
    page = to;
    await reps();
    $('pager').querySelector(`[data-pg="${page}"].on, [aria-current="page"]`)?.focus();
    host.querySelector('.in-reps')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  // ---------- a report in full. A survey (or a dossier) reads like a small Build page: their land at a glance, then
  // every building of the age in its group, with how many they have, the share of their land, how many are being
  // built, and the change since an earlier report of the kind (chosen from a list). Other kinds: their figures. ----------
  const spy = (id) => (store.house && id === store.house.id ? 'you' : store.state?.members.find((m) => m.id === id)?.name || `house ${id}`);
  let shown = [], opener = null, cur = null, past = [], cmpAt = null;
  const rows = (r) => intelRows(r).map(([a, b]) => `<tr><th scope="row">${esc(a)}</th><td class="${typeof b === 'number' ? 'num' : ''}">${esc(typeof b === 'number' ? fmt(b) : b)}</td></tr>`).join('');
  const delta = (d) => (d == null ? '' : `<span class="${d > 0 ? 'up' : d < 0 ? 'down' : 'dim'}">${d > 0 ? '+' : d < 0 ? '−' : ''}${d ? fmt(Math.abs(d)) : '–'}</span>`);
  function body() {
    const x = cur, r = x.report || {}, h = r.house, cmp = past.find((y) => y.at === cmpAt) || null;
    const was = cmp?.report || null, hasB = !!r.buildings;
    const meta = `<p class="in-rmeta">${h ? `<a href="#state" data-open-state="${h.realm}:${h.state}">${addr(h)}</a> · ` : ''}${esc(fullTime(x.at))} · by ${esc(spy(x.spy))}</p>`;
    const pick = past.length ? `<label class="in-rcmpl">Compare with <select id="li-rcmp"><option value="">nothing</option>${past.map((y) => `<option value="${y.at}"${y === cmp ? ' selected' : ''}>${esc(fullTime(y.at))}</option>`).join('')}</select></label>` : '';
    let main;
    if (hasB) {
      const land = r.land || 0, built = Object.values(r.buildings).reduce((a, n) => a + n, 0), doing = Object.values(r.constructing || {}).reduce((a, n) => a + n, 0);
      const card = (k, v, d, note = '') => `<div><dt>${k}</dt><dd>${v}</dd><dd class="rank"><span>${was ? delta(d) : note}</span></dd></div>`;
      const wasBuilt = was ? Object.values(was.buildings || {}).reduce((a, n) => a + n, 0) : 0;
      main = `<dl class="st-glance in-rglance">${card('Land', fmt(land), was && land - (was.land || 0), 'acres')}${card('Built', fmt(built), was && built - wasBuilt, land ? `${(100 * built / land).toFixed(0)}% of land` : '')}${card('Being built', fmt(doing), was && doing - Object.values(was.constructing || {}).reduce((a, n) => a + n, 0), 'buildings')}${card('Barren', fmt(r.barren || 0), was && (r.barren || 0) - (was.barren || 0), 'acres')}</dl>
        <div class="in-rgroups">${buildingGroups().map(([g, ds]) => `<section class="lb-grp"><h3 class="sub">${esc(g)}</h3><table class="tbl in-rb"><colgroup><col class="c-name"><col class="c-n"><col class="c-pct"><col class="c-b">${was ? '<col class="c-d">' : ''}</colgroup>
          <thead><tr><th>Building</th><th class="num">Have</th><th class="num">% land</th><th class="num">Building</th>${was ? '<th class="num">Change</th>' : ''}</tr></thead><tbody>
          ${ds.map((d) => { const n = r.buildings[d.building] || 0, c = (r.constructing || {})[d.building] || 0;
            return `<tr class="${n || c ? '' : 'none'}"><th scope="row">${esc(d.name)}</th><td class="num">${n ? fmt(n) : '–'}</td><td class="num">${n && land ? `${(100 * n / land).toFixed(1)}%` : ''}</td><td class="num">${c ? fmt(c) : ''}</td>${was ? `<td class="num">${delta(n - ((was.buildings || {})[d.building] || 0))}</td>` : ''}</tr>`; }).join('')}
          </tbody></table></section>`).join('')}</div>`;
      if (reportKind(r) === 'dossier') main += `<h3 class="sub">The rest of the dossier</h3><table class="tbl in-rfull"><tbody>${intelRows(r).filter(([k]) => !['Buildings', 'Barren'].includes(k)).map(([a, b]) => `<tr><th scope="row">${esc(a)}</th><td class="${typeof b === 'number' ? 'num' : ''}">${esc(typeof b === 'number' ? fmt(b) : b)}</td></tr>`).join('')}</tbody></table>`;
    } else main = `<table class="tbl in-rfull"><tbody>${rows(r)}</tbody></table>`;
    $('rdlg-b').innerHTML = `<div class="in-rtop">${meta}${pick}</div>${main}
      ${h ? `<div class="atk-btns"><button type="button" class="btn" id="li-rtgt">Make target</button><a class="btn danger" href="#attack" id="li-ratk">Attack…</a></div>` : ''}`;
  }
  async function openReport(x, from) {
    opener = from; cur = x; past = []; cmpAt = null;
    const r = x.report || {}, k = reportKind(r), h = r.house;
    $('rdlg-h').innerHTML = `<span class="in-rk">${esc(KINDS[k] || REPORT_LABEL[k] || k)}</span> ${esc(h?.name || 'A house')}`;
    body();
    if (!$('rdlg').open) $('rdlg').showModal();
    if (!h) return;
    // Earlier reports of the kind on this house (your state's); the latest one before this is compared by default.
    let all = [];
    try { all = await reportsOn(h.house ?? h.id); } catch { all = []; }
    if (cur !== x) return;
    past = (all || []).filter((y) => reportKind(y.report || {}) === k && y.at < x.at).sort((a, b) => b.at - a.at).slice(0, 20);
    cmpAt = past[0]?.at ?? null;
    body();
  }
  on($('rdlg'), 'change', (ev) => { if (ev.target.id === 'li-rcmp') { cmpAt = ev.target.value ? Number(ev.target.value) : null; body(); $('rdlg-b').querySelector('#li-rcmp')?.focus(); } });
  on($('reps'), 'click', (ev) => { if (ev.target.closest('a')) return; const c = ev.target.closest('[data-rep]'); if (c) openReport(shown[Number(c.dataset.rep)], c); });
  on($('reps'), 'keydown', (ev) => { const c = ev.target.closest('[data-rep]'); if (c && (ev.key === 'Enter' || ev.key === ' ') && ev.target === c) { ev.preventDefault(); openReport(shown[Number(c.dataset.rep)], c); } });
  on($('rdlg'), 'click', (ev) => {
    if (ev.target === $('rdlg') || ev.target.closest('[data-close]')) { $('rdlg').close(); return; }
    const h = shownHouse();
    if (ev.target.closest('#li-rtgt') && h) { lookUp(addr(h)); $('rdlg').close(); }
    if (ev.target.closest('#li-ratk') && h) { act.resolveAddress(addr(h)).then((t) => setTarget(t)).catch(() => {}); }
    if (ev.target.closest('[data-open-state]')) $('rdlg').close();
  });
  const shownHouse = () => { const t = $('rdlg-b').querySelector('[data-open-state]'); if (!t) return null; const m = /^(\d+):(\d+):(\d+)$/.exec(t.textContent); return m ? { realm: +m[1], state: +m[2], seat: +m[3] } : null; };
  on($('rdlg'), 'close', () => { if (opener?.isConnected) opener.focus(); });

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
