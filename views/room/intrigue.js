// Intrigue (thieves' operations, your state's intel reports) and rites (self rites, divinations,
// hexes) for the war room: compact forms for the ACT pane's tabs and full views for its detail.
// Operations and rites come from /rules params; results go to the message line, the news (as a
// local line) and, for intel, your state's reports.
import { pinnedShares } from '../../core/intelprefs.js';
import { buildingGroups } from '../../core/land.js';
import { targetChipHTML, renderTarget as showTarget } from './target.js';
import { store, say, setTarget, loadReports, reportsOn } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr, where, when, fullTime, names, intelRows, reportKind, REPORT_LABEL, THIEF, empty } from '../../core/words.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

// ---------- rites (the logic is core/rites.js's) ----------
import { rites, riteById, riteKind, KIND_LABEL, riteFor, ap, lengthText, needsText, unfriendlyExtra, riteDoes, riteCost, riteLine, riteOn, riteShort, inForce, resilienceText, vengeanceList, vengeanceOn, sameSt, stName } from '../../core/rites.js';

// ---------- operations (the logic is core/intrigue.js's) ----------
import { OP_GROUPS, groupOf, ops, opById, opExtra, opDoes, opNerve, opLine, parseFrame } from '../../core/intrigue.js';

const opOptions = (sel) => OP_GROUPS.map(([g, effects]) => {
  const list = ops().filter((o) => effects.includes(o.effect));
  return list.length ? `<optgroup label="${g}">${list.map((o) => `<option value="${esc(o.id)}"${o.id === sel ? ' selected' : ''}>${esc(o.name)} · ${pct(o.nerve_bp)}</option>`).join('')}</optgroup>` : '';
}).join('') + ops().filter((o) => groupOf(o) === 'Other').map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');

const NO_TARGET = 'Set a target first: type its address in the TARGET bar (T), or TGT a house in RANK.';

/** Your nerve and thieves, in a line. */
export function nerveLine() {
  const h = store.house;
  return `NERVE ${pct(h.nerve_bp)} (+${pct(store.rules.params.nerve_regen_bp)} a tick) · ${fmt(h.units[THIEF])} ${names.units[THIEF] || 'thieves'} home · vigilance on you ${pct(h.vigilance_bp || 0)}`;
}

/** Sends the operation in a form. f: { target, op, thieves, extra, frame } inputs. */
async function sendOp(f, button) {
  const o = opById(f.op.value);
  if (!o) return null;
  let frame = null;
  try { frame = parseFrame(f.frame.value); } catch (e) { say(e.message, 'bad'); return null; }
  const ex = opExtra(o);
  const extra = { frame };
  if (ex) {
    if (!f.extra.value) { say(`Choose the ${ex.label.toLowerCase()} for ${o.name}.`, 'bad'); return null; }
    extra[ex.key] = f.extra.value;
  }
  if (!num(f.thieves.value)) { say('Send at least one thief.', 'bad'); return null; }
  const t = store.target;
  if (!t) { say(NO_TARGET, 'bad'); return null; }
  return act.operation(t, o.id, num(f.thieves.value), { button }, extra);
}

/** Fills the extra field for an operation (or hides it). */
function syncExtra(o, sel, wrap) {
  const ex = opExtra(o);
  wrap.hidden = !ex;
  if (!ex) { sel.innerHTML = ''; return; }
  if (sel.dataset.k !== `${o.effect}`) {
    sel.innerHTML = ex.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
    sel.dataset.k = o.effect;
    if (ex.key === 'building') sel.value = 'homes';
  }
  sel.setAttribute('aria-label', ex.label);
}

// ---------- rites ----------
/** A line about the target for a rite: relations, its cost there, your vengeance. */
function targetNote(r) {
  if (riteKind(r) === 'self') return { text: '', bad: false };
  const s = store.target ? { realm: store.target.realm, state: store.target.state } : null;
  if (!s) return { text: '', bad: false };
  const o = riteOn(r, s);
  if (o.blocked) return { text: `Not now: ${o.blocked}.`, bad: true };
  const parts = [`On ${stName(s)}: ${o.known ? (o.war ? 'at war' : `your state feels ${o.feel}`) : 'relations not loaded yet'}`];
  if (o.cost !== riteFor(r).aether || o.approx) parts.push(`costs ${o.approx ? '≈' : ''}${fmt(o.cost)} aether there`);
  if (riteKind(r) === 'hex' && o.venge) parts.push(`your vengeance on ${stName(s)} lifts the chance by ${pct(o.venge)} (casting spends half)`);
  const short = o.cost > store.house.aether ? ` You have ${fmt(store.house.aether)} aether.` : '';
  return { text: `${parts.join('; ')}.${short}`, bad: !!short };
}

const optText = (r) => `${r.name} · ${riteCost(r)}${r.needs ? ` · needs ${r.needs}` : ''}`;
const riteOptions = (sel) => ['self', 'divination', 'hex'].map((k) => {
  const list = rites().filter((r) => riteKind(r) === k);
  return `<optgroup label="${esc(KIND_LABEL[k])}">${list.map((r) => `<option value="${esc(r.id)}"${r.id === sel ? ' selected' : ''}>${esc(optText(r))}</option>`).join('')}</optgroup>`;
}).join('');
/** Costs grow with land: keep the options' prices current. */
function refreshOptions(sel) {
  for (const o of sel.options) { const r = riteById(o.value); if (r && o.textContent !== optText(r)) o.textContent = optText(r); }
}

/** Your aether, adepts and resin, in a line. */
export function aetherLine() {
  const h = store.house;
  const mat = store.rules.params.rite_material;
  return `AETHER ${fmt(h.aether)} · ADEPTS ${fmt(h.adepts)} · ${mat.toUpperCase()} ${fmt(h.materials[mat] || 0)}`;
}
const inForceHTML = () => {
  const list = inForce();
  return list.length
    ? `<ul class="force">${list.map(([n, until, left]) => `<li><span class="name">${esc(n)}</span> <span class="num dim">to T${until} · ${left} tick${left === 1 ? '' : 's'} left</span></li>`).join('')}</ul>`
    : '<p class="dim small">No rites in force on your house.</p>';
};

// Spell Resilience (yours only: another house's is hidden) and Countercast Vengeance, from /me.
const has = (k) => store.house && k in store.house;
/** The compact line for the ACT pane. */
function magicLine() {
  if (!has('resilience_bp')) return '';
  const v = vengeanceList();
  return `RESILIENCE ${resilienceText()} · VENGEANCE ${v.length ? v.map(([s, bp]) => `${stName(s)} +${pct(bp)}`).join(', ') : 'none'}`;
}
/** The detail's table: resilience, vengeance per state, and lasting rites' length. */
function magicHTML() {
  const P = store.rules.params, h = store.house;
  if (!has('resilience_bp')) return '<p class="dim small">This server sends no Spell Resilience or vengeance.</p>';
  const res = h.resilience_bp || 0;
  const clear = res && P.resilience_decay_bp ? ` Gone in about ${Math.ceil(res / P.resilience_decay_bp)} ticks if no hex lands.` : '';
  const v = vengeanceList();
  const vfade = P.vengeance_decay_bp ? `fades ${pct(P.vengeance_decay_bp)} a tick` : '';
  const lasting = rites().find((r) => r.ticks && riteKind(r) === 'self');
  const c = lasting && riteFor(lasting);
  // Both lengths come from the server, so the share of full length is exact (rounded).
  const share = c && c.exact ? `${fmt(Math.round(c.ticks * 100 / lasting.ticks))}%` : '';
  const shrines = typeof h.shrine_share_bp === 'number' ? `your shrines cover ${pct(h.shrine_share_bp)} of your land; ` : '';
  return `<table class="tbl kv magic">
    <tr><td>Spell Resilience</td><td class="txt"><b class="num">${pct(res)}</b> <span class="dim">of ${pct(P.resilience_max_bp || 0)} max</span><br><span class="dim small">Each hex that lands on you adds its resilience; it cuts the chance of every hex on you by that much and fades ${pct(P.resilience_decay_bp || 0)} a tick.${clear}</span></td></tr>
    <tr><td>Vengeance</td><td class="txt">${v.length ? `<ul class="force">${v.map(([s, bp]) => `<li><span class="name">state ${esc(stName(s))}</span> <span class="num">+${pct(bp)} hex chance</span></li>`).join('')}</ul>` : '<span class="dim">none</span>'}<span class="dim small">Every hex a state tries on you, landed or not, adds half its resilience to your vengeance on that state (max ${pct(P.vengeance_max_bp || 0)}). Your hexes on its houses gain that much chance; casting one spends half; it ${vfade}.</span></td></tr>
    ${share ? `<tr><td>Lasting rites</td><td class="txt">run <b class="num">${share}</b> of full length for you now (${esc(lasting.name)}: ${fmt(c.ticks)} of ${fmt(lasting.ticks)} ticks) <span class="dim small">(${shrines}full at shrines on ${pct(P.rite_full_share_bp || 0)} of your land, ${pct(P.rite_min_duration_bp || 0)} with none)</span></td></tr>` : ''}
  </table>`;
}

async function sendCast(f, button) {
  const r = riteById(f.rite.value);
  if (!r) return null;
  if (riteKind(r) === 'self') return act.cast(r.id, null, { button });
  const t = store.target;
  if (!t) { say(`${r.name} needs a target. ${NO_TARGET}`, 'bad'); return null; }
  return act.cast(r.id, t, { button });
}

// ---------- reports ----------
const spyName = (id) => {
  if (store.house && id === store.house.id) return 'you';
  const m = store.state?.members.find((x) => x.id === id);
  return m ? m.name : `house ${id}`;
};
/** One report as a card: header (kind, house, when, by whom) and its rows. */
/** A survey's (or dossier's) buildings by group: count, share of land, being built, and the change since the
 *  state's previous report of the same kind on that house. */
function buildingsTable(item) {
  const r = item.report || {}, k = reportKind(r), land = r.land || 0, id = r.house?.house ?? r.house?.id;
  const prev = (store.reports || []).find((y) => y !== item && y.at < item.at && reportKind(y.report || {}) === k && (y.report?.house?.house ?? y.report?.house?.id) === id)?.report || null;
  const d = (n) => (n > 0 ? `<span class="up">+${fmt(n)}</span>` : n < 0 ? `<span class="down">−${fmt(-n)}</span>` : '<span class="dim">·</span>');
  return `<table class="tbl rep-b"><tr><th>BUILDING</th><th class="num">HAVE</th><th class="num">% LAND</th><th class="num">BUILDING</th>${prev ? '<th class="num" title="Since your state\'s previous report of this kind on them">Δ</th>' : ''}</tr>`
    + buildingGroups().map(([g, ds]) => `<tr class="grp"><td colspan="${prev ? 5 : 4}">${esc(g.toUpperCase())}</td></tr>` + ds.map((b) => {
      const n = r.buildings[b.building] || 0, c = (r.constructing || {})[b.building] || 0;
      return `<tr class="${n || c ? '' : 'zero'}"><td>${esc(b.name)}</td><td class="num">${n ? fmt(n) : '·'}</td><td class="num">${n && land ? `${(100 * n / land).toFixed(1)}%` : ''}</td><td class="num">${c ? fmt(c) : ''}</td>${prev ? `<td class="num">${d(n - ((prev.buildings || {})[b.building] || 0))}</td>` : ''}</tr>`;
    }).join('')).join('') + '</table>';
}
export function reportCard(item, i, { open = true } = {}) {
  const r = item.report || {};
  const k = reportKind(r);
  // With buildings (a survey, a dossier): the other figures, then the buildings as a table of their own.
  const rows = r.buildings ? intelRows(r).filter(([a]) => !['Buildings', 'Being built'].includes(a)) : intelRows(r);
  return `<article class="rep" id="d-rep-${i}" data-kind="${esc(k)}">
    <h4 class="rep-h"><span class="rk">${esc(REPORT_LABEL[k] || k.toUpperCase())}</span> <span class="rt">${esc(r.house ? where(r.house) : '?')}</span> <time class="dim" title="${esc(fullTime(item.at))}">${esc(when(item.at))}</time> <span class="dim">by ${esc(spyName(item.spy))}</span></h4>
    ${open ? `<table class="tbl kv">${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="${typeof b === 'number' ? 'num' : 'txt'}">${esc(typeof b === 'number' ? fmt(b) : b)}</td></tr>`).join('')}</table>${r.buildings ? buildingsTable(item) : ''}` : ''}
  </article>`;
}

// ---------- the ACT pane: compact INTRIGUE and RITES ----------
/**
 * Draws the compact forms into the ACT pane's INTRIGUE and RITES sections. ctx.openDetail(tab,
 * reportIndex?) opens the ACT detail on that tab. Returns { update(changes) }.
 */
export function mountPane(secOps, secRites, on, ctx) {
  secOps.innerHTML = `
    <form id="r-f-op" class="ticket op" novalidate>
      <span class="verb">OP</span>
      <span class="args">
        ${targetChipHTML('r-o-tchip')}
        <label class="vh" for="r-o-op">Operation</label><select id="r-o-op">${opOptions('survey')}</select>
        <label for="r-o-n" title="Thieves to send">×</label><input id="r-o-n" type="number" min="1" value="20" class="w5"><button type="button" class="btn mini max" data-max="thieves" aria-label="Send every thief at home">MAX</button>
        <span class="field" id="r-o-xw" hidden><select id="r-o-x"></select></span>
        <label for="r-o-frame" title="False flag: blame this state (realm:state). Costs more nerve.">FLAG</label> <input id="r-o-frame" placeholder="r:s" class="w5" autocomplete="off">
      </span>
      <span class="cost num" id="r-o-cost"></span>
      <button class="btn danger">EXEC</button>
    </form>
    <p class="short small" id="r-o-why" aria-live="polite" hidden></p>
    <p class="small" id="r-o-nerve"></p>
    <p class="dim small" id="r-o-info"></p>
    <h3 class="sub">REPORTS <span class="dim" id="r-o-rcount"></span><button type="button" class="btn mini rep-all" data-open="intrigue">ALL · DETAIL</button></h3>
    <ul class="replist" id="r-o-reps"></ul>`;
  secRites.innerHTML = `
    <form id="r-f-rite" class="ticket rite" novalidate>
      <span class="verb">RITE</span>
      <span class="args">
        <label class="vh" for="r-r-rite">Rite</label><select id="r-r-rite">${riteOptions('war_hymns')}</select>
        ${targetChipHTML('r-r-tchip')}
      </span>
      <span class="cost num" id="r-r-cost"></span>
      <button class="btn primary">CAST</button>
    </form>
    <p class="short small" id="r-r-why" aria-live="polite" hidden></p>
    <p class="small" id="r-r-tgt" role="status" hidden></p>
    <p class="small" id="r-r-hold"></p>
    <p class="dim small" id="r-r-info"></p>
    <h3 class="sub">IN FORCE ON YOU</h3>
    <div id="r-r-force"></div>
    <p class="small" id="r-r-magic"></p>
    <p class="dim small">Divinations land in REPORTS (INTEL tab). Shift+Alt+1 opens the full list of rites.</p>`;
  const $ = (id) => document.getElementById(id);
  const fo = { op: $('r-o-op'), thieves: $('r-o-n'), extra: $('r-o-x'), frame: $('r-o-frame') };
  const fr = { rite: $('r-r-rite') };

  function opForm() {
    const o = opById(fo.op.value);
    if (!o) return;
    syncExtra(o, fo.extra, $('r-o-xw'));
    const framed = !!fo.frame.value.trim();
    const n = opNerve(o, framed);
    const h = store.house;
    const cost = $('r-o-cost');
    cost.textContent = `${pct(n.ok)} nerve`;
    const why = n.ok > h.nerve_bp ? `You have ${pct(h.nerve_bp)} nerve` : num(fo.thieves.value) > h.units[THIEF] ? `You have ${fmt(h.units[THIEF])} thieves at home` : '';
    cost.classList.toggle('short', !!why);
    cost.title = why || `Costs ${pct(n.ok)} nerve, ${pct(n.caught)} if caught`;
    const whys = [!store.target ? 'no target yet (set one in the TARGET bar, or press T)' : '', why && why.replace(/^You have/, 'you have')].filter(Boolean);
    $('r-o-why').hidden = !whys.length;
    $('r-o-why').textContent = whys.length ? `Can't: ${whys.join('; ')}.` : '';
    $('r-o-info').textContent = opLine(o, framed);
    $('r-o-nerve').textContent = nerveLine();
  }
  function reps() {
    const list = store.reports.slice(0, 5);
    $('r-o-rcount').textContent = store.reports.length ? `${fmt(store.reports.length)} from your state` : '';
    $('r-o-reps').innerHTML = list.length
      ? list.map((x, i) => { const r = x.report || {}; const k = reportKind(r);
        // A survey shows the buildings chosen in Straightline's Configuration (Intrigue), as shares of their land.
        const glance = k === 'survey' ? ` <span class="dim">${esc(pinnedShares(r).map(([n, pc]) => `${n} ${pc == null ? '–' : `${pc.toFixed(1)}%`}`).join(' · '))}</span>` : '';
        return `<li><button type="button" class="rep-btn" data-rep="${i}" title="Open this report in detail"><time>${esc(when(x.at))}</time> <span class="rk">${esc(REPORT_LABEL[k] || k)}</span> <span class="rt">${esc(r.house ? `${r.house.name} ${addr(r.house)}` : '?')}</span>${glance}</button></li>`; }).join('')
      : `<li class="dim small">${esc(store.reportsLoaded ? empty.reports : 'loading reports…')}</li>`;
  }
  function riteForm() {
    const r = riteById(fr.rite.value);
    if (!r) return;
    const self = riteKind(r) === 'self';
    $('r-r-tchip').dataset.self = String(self);
    showTarget(secRites);
    const cost = $('r-r-cost');
    const why = riteShort(r);
    cost.textContent = riteCost(r).replace(' aether', 'ae');
    cost.classList.toggle('short', !!why);
    cost.title = why || `Costs ${riteCost(r)} for your house now (grows with land)`;
    const rwhys = [!self && !store.target ? 'no target yet (set one in the TARGET bar, or press T)' : '', why].filter(Boolean);
    $('r-r-why').hidden = !rwhys.length;
    $('r-r-why').textContent = rwhys.length ? `Can't: ${rwhys.join('; ')}.` : '';
    refreshOptions(fr.rite);
    showNote($('r-r-tgt'), targetNote(r));
    $('r-r-info').textContent = riteLine(r);
    $('r-r-hold').textContent = aetherLine();
    $('r-r-force').innerHTML = inForceHTML();
    $('r-r-magic').textContent = magicLine();
  }
  const targets = () => { showTarget(secOps); showTarget(secRites); };

  on(secOps, 'input', opForm);
  on(secOps, 'click', (ev) => {
    if (ev.target.closest('[data-max="thieves"]')) {
      fo.thieves.value = String(store.house.units[THIEF]);
      if (!store.house.units[THIEF]) say('MAX is 0: no thieves at home. Train some (TRAIN, thieves) first.', 'bad');
      opForm();
    }
    const b = ev.target.closest('[data-rep]');
    if (b) ctx.openDetail('intrigue', Number(b.dataset.rep));
    if (ev.target.closest('[data-open]')) ctx.openDetail('intrigue');
  });
  on($('r-f-op'), 'submit', async (ev) => { ev.preventDefault(); await sendOp(fo, ev.submitter); opForm(); });
  on(secRites, 'input', riteForm);
  on($('r-f-rite'), 'submit', async (ev) => { ev.preventDefault(); await sendCast(fr, ev.submitter); riteForm(); });

  opForm(); riteForm(); reps(); targets();
  return {
    update(c) {
      if (!c || c.has('house') || c.has('tick')) { opForm(); riteForm(); } else if (c.has('relations') || c.has('target')) { riteForm(); opForm(); }
      if (!c || c.has('reports') || c.has('timemode') || c.has('state')) reps();
      if (!c || c.has('target')) targets();
    },
  };
}

// ---------- the ACT detail: INTRIGUE ----------
/** Full intrigue view: the operation form, every operation, and the state's reports. */
export function detailIntrigue(sec, on, ctx) {
  sec.innerHTML = `
    <div class="dgrid">
      <section>
        <h3 class="sub">OPERATION <span class="dim">send thieves against a house</span></h3>
        <form id="d-f-op" class="dform" novalidate>
          <label for="d-o-target" title="Target house, as realm:state:seat">Target</label>
          <span class="field"><input id="d-o-target" data-tgt-input placeholder="r:s:seat" autocomplete="off"><button type="button" class="btn mini" data-pick>PICK FROM RANK</button><small class="dim" data-tgt-name></small></span>
          <label for="d-o-op">Operation</label>
          <select id="d-o-op">${opOptions('survey')}</select>
          <label for="d-o-n">Thieves</label>
          <span class="field"><input id="d-o-n" type="number" min="1" value="20" inputmode="numeric"><button type="button" class="btn mini" data-max="thieves" aria-label="Send every thief at home">MAX</button><small class="dim num" id="d-o-home"></small></span>
          <label for="d-o-x" id="d-o-xl" hidden>Choose</label>
          <span class="field" id="d-o-xw" hidden><select id="d-o-x"></select></span>
          <label for="d-o-frame" title="False flag: blame this state instead of yours">False flag</label>
          <span class="field"><input id="d-o-frame" placeholder="r:s (optional)" autocomplete="off"><small class="dim">blame a state; more nerve, double the hostility if caught</small></span>
          <span class="quote num span" id="d-o-q"></span>
          <p class="small span" id="d-o-nerve"></p>
          <p class="dim small span" id="d-o-info"></p>
          <span class="btns span"><button class="btn danger">EXEC</button></span>
        </form>
      </section>
      <section>
        <h3 class="sub">OPERATIONS <span class="dim">nerve cost, chance against your spy chance, what each does</span></h3>
        <div class="scrollx"><table class="tbl optbl">
          <tr><th>OPERATION</th><th class="num">NERVE</th><th class="num">CHANCE ×</th><th class="num">VIGIL +</th><th>DOES</th><th></th></tr>
          ${OP_GROUPS.map(([g, effects]) => `<tr class="grp"><td colspan="6">${g.toUpperCase()}</td></tr>` + ops().filter((o) => effects.includes(o.effect)).map((o) => `<tr data-op-row="${esc(o.id)}"><td class="name">${esc(o.name)}</td><td class="num">${pct(o.nerve_bp)}</td><td class="num">${pct(o.chance_bp)}</td><td class="num dim">${pct(o.vigilance_bp)}</td><td class="wrap small">${esc(opDoes(o))}${o.cost_material ? `; 1 ${esc(o.cost_material)} per ${o.thieves_per_material} thieves` : ''}</td><td><button type="button" class="btn mini" data-use="${esc(o.id)}" aria-label="Use ${esc(o.name)}">USE</button></td></tr>`).join('')).join('')}
        </table></div>
      </section>
      <section class="wide">
        <h3 class="sub">REPORTS <span class="dim">your state's intel, newest first; shared by every house of the state</span></h3>
        <div class="dtools"><label for="d-rf">Show</label> <select id="d-rf"></select> <button type="button" class="btn mini" id="d-r-reload">RELOAD</button> <span class="dim" id="d-rcount"></span></div>
        <div id="d-reps" class="reps"></div>
      </section>
    </div>`;
  const $ = (id) => sec.querySelector(`#${id}`);
  const f = { target: $('d-o-target'), op: $('d-o-op'), thieves: $('d-o-n'), extra: $('d-o-x'), frame: $('d-o-frame') };
  let onTarget = null; // fresh reports on one house (from /reports?target=)

  function form() {
    const o = opById(f.op.value);
    if (!o) return;
    const h = store.house;
    syncExtra(o, f.extra, $('d-o-xw'));
    $('d-o-xl').hidden = $('d-o-xw').hidden;
    const ex = opExtra(o);
    if (ex) $('d-o-xl').textContent = ex.label;
    const framed = !!f.frame.value.trim();
    const n = opNerve(o, framed);
    const why = n.ok > h.nerve_bp ? `not enough nerve (you have ${pct(h.nerve_bp)})` : num(f.thieves.value) > h.units[THIEF] ? `more thieves than you have at home (${fmt(h.units[THIEF])})` : '';
    $('d-o-q').textContent = `Costs ${pct(n.ok)} nerve (${pct(n.caught)} if caught)${why ? ` · ${why}` : ''}`;
    $('d-o-q').classList.toggle('short', !!why);
    $('d-o-home').textContent = `${fmt(h.units[THIEF])} home`;
    $('d-o-nerve').textContent = nerveLine();
    $('d-o-info').textContent = opLine(o, framed);
    sec.querySelectorAll('[data-op-row]').forEach((tr) => tr.classList.toggle('tgt', tr.dataset.opRow === o.id));
  }
  function filterOptions() {
    const sel = $('d-rf');
    const v = sel.value || 'all';
    const kinds = new Map();
    store.reports.forEach((x) => { const k = reportKind(x.report || {}); kinds.set(k, (kinds.get(k) || 0) + 1); });
    const houses = new Map();
    store.reports.forEach((x) => { const hh = x.report?.house; if (hh) houses.set(hh.house, hh); });
    sel.innerHTML = `<option value="all">All reports (${store.reports.length})</option>`
      + (store.target ? `<option value="tgt">On your target, ${esc(store.target.name)} (fresh)</option>` : '')
      + [...kinds].map(([k, n]) => `<option value="k:${esc(k)}">${esc(REPORT_LABEL[k] || k)} (${n})</option>`).join('')
      + [...houses.values()].map((hh) => `<option value="h:${hh.house}">On ${esc(hh.name)} (${addr(hh)})</option>`).join('');
    sel.value = [...sel.options].some((o) => o.value === v) ? v : 'all';
  }
  async function reps() {
    const v = $('d-rf').value || 'all';
    let list = store.reports.map((x, i) => [x, i]);
    if (v === 'tgt' && store.target) {
      try { onTarget = await reportsOn(store.target.id); } catch (e) { say(e.message, 'bad'); onTarget = []; }
      list = onTarget.map((x, i) => [x, `t${i}`]);
    } else if (v.startsWith('k:')) list = list.filter(([x]) => reportKind(x.report || {}) === v.slice(2));
    else if (v.startsWith('h:')) list = list.filter(([x]) => x.report?.house?.house === Number(v.slice(2)));
    $('d-rcount').textContent = `${fmt(list.length)} shown`;
    $('d-reps').innerHTML = list.length ? list.map(([x, i]) => reportCard(x, i)).join('') : `<p class="dim">${esc(store.reports.length ? 'No reports of that kind.' : (store.reportsLoaded ? empty.reports : 'loading reports…'))}</p>`;
  }

  on($('d-f-op'), 'input', form);
  on($('d-f-op'), 'click', (ev) => {
    if (ev.target.closest('[data-max="thieves"]')) {
      f.thieves.value = String(store.house.units[THIEF]);
      if (!store.house.units[THIEF]) say('MAX is 0: no thieves at home. Train some first.', 'bad');
      form();
    }
    if (ev.target.closest('[data-pick]')) ctx.goto('rank');
  });
  on(sec, 'click', (ev) => {
    const u = ev.target.closest('[data-use]');
    if (!u) return;
    f.op.value = u.dataset.use;
    form();
    f.thieves.focus();
  });
  on($('d-f-op'), 'submit', async (ev) => { ev.preventDefault(); await sendOp(f, ev.submitter); form(); });
  on($('d-rf'), 'input', reps);
  on($('d-r-reload'), 'click', async () => { await loadReports(); });
  showTarget(sec);
  form(); filterOptions(); reps();

  return {
    update(c) {
      if (!c || c.has('house')) form();
      if (!c || c.has('reports') || c.has('timemode')) { filterOptions(); reps(); }
      if (c && c.has('target')) { showTarget(sec); filterOptions(); }
    },
    focus: () => f.target.focus(),
    /** Scrolls to a report (index in store.reports) and focuses it. */
    show(i) {
      const el = sec.querySelector(`#d-rep-${i}`);
      if (!el) return;
      el.tabIndex = -1;
      el.scrollIntoView({ block: 'start' });
      el.focus();
      el.classList.add('hl');
    },
  };
}

// ---------- the ACT detail: RITES ----------
/** Every rite with what it costs your house now, how long it runs for you, and what it needs. */
function riteTable() {
  const mat = store.rules.params.rite_material;
  return `<table class="tbl optbl rites">
    <tr><th>RITE</th><th class="num"><abbr title="Aether your house pays now (grows with land)">AETHER</abbr></th><th class="num"><abbr title="${esc(cap1(mat))} your house burns now">${esc(mat.toUpperCase())}</abbr></th><th class="num"><abbr title="How long it runs for you now (by shrine share)">TICKS</abbr></th><th class="num">CHANCE ×</th><th>DOES</th><th></th></tr>
    ${['self', 'divination', 'hex'].map((k) => `<tr class="grp"><td colspan="7">${esc(KIND_LABEL[k].toUpperCase())}</td></tr>` + rites().filter((r) => riteKind(r) === k).map((r) => {
      const c = riteFor(r);
      const listed = c.exact && (c.aether !== r.aether || c.incense !== (r.incense || 0)) ? ` title="Listed: ${fmt(r.aether)} aether${r.incense ? `, ${fmt(r.incense)} ${esc(mat)}` : ''} at ${fmt(store.rules.params.rite_cost_land || 400)} acres"` : '';
      const ticks = r.ticks ? `${ap(c)}${c.ticks}${c.ticks < r.ticks ? `<span class="dim">/${r.ticks}</span>` : ''}` : '·';
      const needs = r.needs ? `. <span class="needs">Needs ${esc(r.needs === 'war' ? 'war' : `${r.needs} or war`)}${esc(unfriendlyExtra(r))}.</span>` : '';
      return `<tr data-rite-row="${esc(r.id)}"><td class="name">${esc(r.name)}</td><td class="num"${listed}>${ap(c)}${fmt(c.aether)}</td><td class="num${c.incense ? '' : ' zero'}">${c.incense ? `${ap(c)}${fmt(c.incense)}` : '0'}</td><td class="num${r.ticks ? '' : ' zero'}">${ticks}</td><td class="num dim">${k === 'self' ? 'sure' : pct(r.chance_bp)}</td><td class="wrap small">${esc(riteDoes(r, { table: true }))}${needs}</td><td><button type="button" class="btn mini" data-use-rite="${esc(r.id)}" aria-label="Use ${esc(r.name)}">USE</button></td></tr>`;
    }).join('')).join('')}
  </table>`;
}
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
/** Shows a target note (or hides it when empty). */
function showNote(el, n) {
  el.hidden = !n.text;
  el.textContent = n.text;
  el.classList.toggle('short', n.bad);
}

// ---------- the ACT detail: RITES ----------
export function detailRites(sec, on, ctx) {
  sec.innerHTML = `
    <div class="dgrid">
      <section>
        <h3 class="sub">CAST <span class="dim">self rites, divinations and hexes</span></h3>
        <form id="d-f-rite" class="dform" novalidate>
          <label for="d-r-rite">Rite</label>
          <select id="d-r-rite">${riteOptions('war_hymns')}</select>
          <label for="d-r-target" title="Target house for divinations and hexes">Target</label>
          <span class="field"><input id="d-r-target" data-tgt-input placeholder="r:s:seat" autocomplete="off"><button type="button" class="btn mini" data-pick>PICK FROM RANK</button><small class="dim" data-tgt-name></small></span>
          <span class="quote num span" id="d-r-q"></span>
          <p class="small span" id="d-r-tgt" role="status" hidden></p>
          <p class="small span" id="d-r-hold"></p>
          <p class="dim small span" id="d-r-info"></p>
          <span class="btns span"><button class="btn primary">CAST</button></span>
        </form>
        <h3 class="sub gap">IN FORCE ON YOU</h3>
        <div id="d-r-force"></div>
        <h3 class="sub gap">ADEPTS <span class="dim">drawn from your peasants by your shrines</span></h3>
        <form id="d-r-adepts" class="dform" novalidate>
          <label for="d-r-cap">Stop at</label>
          <span class="field"><input id="d-r-cap" type="number" min="0" max="100" step="0.1" inputmode="decimal" placeholder="no limit" aria-describedby="d-r-capl"> <span class="dim">an acre</span></span>
          <button type="button" class="btn" data-cap>SET</button>
          <label for="d-r-rel">Release</label>
          <span class="field"><input id="d-r-rel" type="number" min="1" step="1" inputmode="numeric" placeholder="0"> <span class="dim">adepts</span></span>
          <button type="button" class="btn" data-rel>RELEASE</button>
          <p class="dim small span" id="d-r-capl"></p>
        </form>
        <h3 class="sub gap">RESILIENCE AND VENGEANCE <span class="dim">yours only</span></h3>
        <div id="d-r-magic"></div>
        <p class="dim small">Shrines draw adepts and gather aether each tick; Watchstones give ward against hexes and divinations. Divinations land in INTRIGUE's reports.</p>
      </section>
      <section>
        <h3 class="sub">RITES <span class="dim">cost, length and what each does</span></h3>
        <div class="scrollx" id="d-r-list"></div>
        <p class="dim small">Aether and ${esc(store.rules.params.rite_material)} are what your house pays now: rites cost more as your land grows. Ticks are how long a lasting rite runs for you, by your shrine share.</p>
      </section>
    </div>`;
  const $ = (id) => sec.querySelector(`#${id}`);
  const f = { rite: $('d-r-rite'), target: $('d-r-target') };
  let lastMagic = '', lastList = '';
  function form() {
    const r = riteById(f.rite.value);
    if (!r) return;
    const self = riteKind(r) === 'self';
    f.target.disabled = self;
    f.target.placeholder = self ? 'not needed: works on you' : 'r:s:seat';
    sec.querySelector('[data-pick]').disabled = self;
    const why = riteShort(r);
    $('d-r-q').textContent = `Costs ${riteCost(r)}${why ? ` · ${why}` : ''}`;
    $('d-r-q').classList.toggle('short', !!why);
    refreshOptions(f.rite);
    showNote($('d-r-tgt'), targetNote(r));
    $('d-r-hold').textContent = aetherLine();
    $('d-r-info').textContent = riteLine(r);
    $('d-r-force').innerHTML = inForceHTML();
    const mh = magicHTML();
    if (mh !== lastMagic) $('d-r-magic').innerHTML = lastMagic = mh;
    const lh = riteTable();
    if (lh !== lastList) $('d-r-list').innerHTML = lastList = lh;
    sec.querySelectorAll('[data-rite-row]').forEach((tr) => tr.classList.toggle('tgt', tr.dataset.riteRow === r.id));
  }
  on($('d-f-rite'), 'input', form);
  on($('d-f-rite'), 'click', (ev) => { if (ev.target.closest('[data-pick]')) ctx.goto('rank'); });
  on(sec, 'click', (ev) => {
    const u = ev.target.closest('[data-use-rite]');
    if (!u) return;
    f.rite.value = u.dataset.useRite;
    form();
    (f.target.disabled ? f.rite : f.target).focus();
  });
  on($('d-f-rite'), 'submit', async (ev) => { ev.preventDefault(); await sendCast(f, ev.submitter); form(); });
  showTarget(sec);
  form();
  // Adepts: the limit where shrines stop gathering (adepts an acre, one decimal place), and release.
  function adepts() {
    const h = store.house;
    const cap = h.adept_cap_tenths;
    if (document.activeElement !== $('d-r-cap')) $('d-r-cap').value = cap == null ? '' : (cap / 10).toFixed(1);
    $('d-r-rel').max = h.adepts;
    $('d-r-rel').disabled = sec.querySelector('[data-rel]').disabled = !h.adepts;
    sec.querySelector('[data-rel]').title = h.adepts ? '' : 'You have no adepts to release';
    $('d-r-capl').textContent = `You have ${fmt(h.adepts)} adepts, ${(h.adepts / Math.max(1, h.land)).toFixed(2)} an acre. `
      + (cap == null ? 'No limit: your shrines gather up to what they can hold.' : `Your shrines stop gathering at ${(cap / 10).toFixed(1)} an acre (${fmt(Math.floor(cap * h.land / 10))} adepts at your land now).`)
      + ' Released adepts go back to the fields as peasants; the limit comes down so they aren\'t gathered back. Leave the box empty for no limit.';
  }
  on($('d-r-adepts'), 'click', async (ev) => {
    if (ev.target.closest('[data-cap]')) { await act.setAdeptCap($('d-r-cap').value === '' ? null : $('d-r-cap').value, { button: ev.target.closest('button') }); adepts(); }
    if (ev.target.closest('[data-rel]')) { if (await act.releaseAdepts($('d-r-rel').value, { button: ev.target.closest('button') })) $('d-r-rel').value = ''; adepts(); }
  });
  on($('d-r-adepts'), 'submit', (ev) => ev.preventDefault());
  adepts();
  return {
    update(c) {
      if (!c || c.has('house')) adepts();
      if (c && c.has('target')) showTarget(sec);
      if (!c || c.has('house') || c.has('tick') || c.has('relations') || c.has('target')) form();
    },
    focus: () => f.rite.focus(),
  };
}

/** Sets the target from a house and says so. */
