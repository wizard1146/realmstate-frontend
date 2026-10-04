// Intrigue (thieves' operations, your state's intel reports) and rites (self rites, divinations,
// hexes) for the war room: compact forms for the ACT pane's tabs and full views for its detail.
// Operations and rites come from /rules params; results go to the message line, the news (as a
// local line) and, for intel, your state's reports.
import { store, say, setTarget, loadReports, reportsOn } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr, where, when, fullTime, names, intelRows, reportKind, REPORT_LABEL, THIEF, empty } from '../../core/words.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

// ---------- operations ----------
export const OP_GROUPS = [
  ['Intel', ['survey', 'muster', 'ledgers', 'archives', 'couriers', 'dossier']],
  ['Theft', ['steal_gold', 'steal_food', 'steal_material', 'steal_horses', 'steal_books', 'kidnap']],
  ['Sabotage', ['undermine', 'set_fires', 'cut_throats', 'foul_forges', 'poison_wells', 'silence_adepts']],
  ['Subversion', ['propaganda', 'forge_orders', 'unsettle_general', 'court_general', 'court_scholar', 'stir_unrest']],
];
const groupOf = (o) => (OP_GROUPS.find(([, l]) => l.includes(o.effect)) || ['Other'])[0];
const ops = () => store.rules.params.operations;
export const opById = (id) => ops().find((o) => o.id === id);

/** What an operation needs besides thieves: { key, label, options: [[value, text]] } or null. */
export function opExtra(o) {
  if (!o) return null;
  if (o.effect === 'steal_material') {
    const mats = Object.keys(store.house?.materials || {});
    return { key: 'material', label: 'Material', options: mats.map((m) => [m, m]) };
  }
  if (o.effect === 'steal_books') return { key: 'category', label: 'Books', options: [['economy', 'economy books'], ['military', 'military books'], ['arcane', 'arcane books']] };
  if (o.effect === 'set_fires') return { key: 'building', label: 'Building', options: store.rules.buildings.map((b) => [b.building, b.name]) };
  return null;
}

/** What an operation does, in a phrase. */
export function opDoes(o) {
  const cap = (what) => `${pct(o.amount_bp)} of their ${what}, at most ${fmt(o.cap_per_100_thieves)} per 100 thieves`;
  switch (o.effect) {
    case 'survey': return 'report: their land, barren acres and buildings';
    case 'muster': return 'report: their troops home and away, training, medics, generals, armies coming home';
    case 'ledgers': return 'report: their gold, food, materials and market orders';
    case 'archives': return 'report: their books, scientists and academics';
    case 'couriers': return 'report: their news from the last day';
    case 'dossier': return 'report: everything, a full dossier';
    case 'steal_gold': return `steals ${cap('gold')}`;
    case 'steal_food': return `steals ${cap('food')}`;
    case 'steal_material': return `steals ${cap('stock of one material')}`;
    case 'steal_horses': return `steals ${cap('horses')}`;
    case 'steal_books': return `steals ${cap('books of one kind')}`;
    case 'propaganda': return `${cap('soldiers')}: they defect to you`;
    case 'kidnap': return `carries off ${cap('peasants')} to your house`;
    case 'undermine': return `delays their construction ${o.delay_ticks} ticks`;
    case 'set_fires': return `burns ${pct(o.amount_bp)} of one building type, at most ${fmt(o.cap_per_100_thieves)} per 100 thieves`;
    case 'cut_throats': return `kills ${pct(o.amount_bp)} of their troops at home, at most ${fmt(o.cap_per_100_thieves)} per 100 thieves`;
    case 'foul_forges': return `delays their training ${o.delay_ticks} ticks`;
    case 'poison_wells': return `stops their peasant growth for ${o.delay_ticks} ticks`;
    case 'silence_adepts': return `kills ${pct(o.amount_bp)} of their adepts`;
    case 'forge_orders': return 'cancels their open market orders';
    case 'unsettle_general': return `their main general fights ${pct(o.amount_bp)} weaker for ${o.delay_ticks} ticks`;
    case 'court_general': return 'their best general wavers; left wavering, it goes to auction';
    case 'court_scholar': return 'their best academic wavers; left wavering, it goes to auction';
    case 'stir_unrest': return `their state's tax brings in half for ${o.delay_ticks} ticks`;
    default: return o.effect.replace(/_/g, ' ');
  }
}

/** Nerve an operation costs: on success, and if the thieves are caught (half as much again). */
export function opNerve(o, framed = false) {
  const P = store.rules.params;
  const base = o.nerve_bp + (framed ? Math.floor(o.nerve_bp * (P.false_flag_nerve_bp || 0) / 10000) : 0);
  return { ok: base, caught: base + Math.floor(base * (P.nerve_fail_extra_bp || 0) / 10000) };
}

/** One line about an operation: cost, chance and what it does. */
export function opLine(o, framed = false) {
  const n = opNerve(o, framed);
  const mat = o.cost_material ? `; spends 1 ${o.cost_material} per ${fmt(o.thieves_per_material)} thieves` : '';
  const war = o.war_bonus_bp ? `; +${pct(o.war_bonus_bp)} at war` : '';
  return `${o.name}: ${opDoes(o)}. Costs ${pct(n.ok)} nerve (${pct(n.caught)} if caught)${framed ? ', with the false flag' : ''}${mat}. Chance ×${pct(o.chance_bp)} of your spy chance, less their vigilance; adds ${pct(o.vigilance_bp)} vigilance on them${war}.`;
}

const opOptions = (sel) => OP_GROUPS.map(([g, effects]) => {
  const list = ops().filter((o) => effects.includes(o.effect));
  return list.length ? `<optgroup label="${g}">${list.map((o) => `<option value="${esc(o.id)}"${o.id === sel ? ' selected' : ''}>${esc(o.name)} · ${pct(o.nerve_bp)}</option>`).join('')}</optgroup>` : '';
}).join('') + ops().filter((o) => groupOf(o) === 'Other').map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');

/** "6:2" -> [6, 2]; '' -> null; anything else throws. */
function parseFrame(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const m = /^(\d+)\s*:\s*(\d+)$/.exec(t);
  if (!m) throw new Error('Write the state to frame as realm:state, for example 6:2, or leave it empty.');
  return [Number(m[1]), Number(m[2])];
}

/** The target typed in a field: your chosen house if the text is its address, else the text. */
function typedTarget(input) {
  const typed = input.value.trim();
  return store.target && typed === addr(store.target) ? store.target : typed;
}

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
  const t = typedTarget(f.target);
  if (!t) { say('Choose a target: an address like 2:1:1, or TGT from RANK.', 'bad'); return null; }
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
const SELF = ['modifiers', 'veil', 'mirror_ward'];
const DIVINE = ['scry', 'omens', 'roads'];
const rites = () => store.rules.params.rites || [];
export const riteById = (id) => rites().find((r) => r.id === id);
/** 'self', 'divination' or 'hex'. */
export const riteKind = (r) => (SELF.includes(r.effect.type) ? 'self' : DIVINE.includes(r.effect.type) ? 'divination' : 'hex');
const KIND_LABEL = { self: 'Self rites (always work if you have the aether)', divination: 'Divinations (intel on a house, shared with your state)', hex: 'Hexes (burn resin; harm a house)' };
const mods = (r) => (r.mods || []).map((m) => `${m.bp > 0 ? '+' : '−'}${pct(Math.abs(m.bp))} ${m.stat.replace(/_/g, ' ')}`).join(', ');
/** What a rite does, in a phrase. */
export function riteDoes(r) {
  const e = r.effect;
  const dur = r.ticks ? ` for ${r.ticks} ticks` : '';
  switch (e.type) {
    case 'modifiers': return `${mods(r)}${dur}`;
    case 'veil': return `your attacks show only "a veiled army"${dur}`;
    case 'mirror_ward': return `${pct(e.bp)} of hexes on you turn back on their caster${dur}`;
    case 'scry': return 'see their land, peasants, gold, food and troops';
    case 'omens': return 'see the rites and hexes in force on them';
    case 'roads': return 'see their armies on the road and whose land they carry';
    case 'rot': return `rots ${pct(e.bp)} of their food a tick${dur}`;
    case 'storm': return `wrecks ${pct(e.bp)} of every building (less their ward)`;
    case 'blight': return `cuts ${pct(e.bp)} of their material allotment${dur}`;
    case 'unravel': return 'ends one of the rites on them';
    case 'curse': return `${mods(r)}${dur}`;
    default: return e.type;
  }
}
export const riteCost = (r) => `${fmt(r.aether)} aether${r.incense ? ` + ${fmt(r.incense)} ${store.rules.params.rite_material}` : ''}`;
/** One line about a rite: kind, cost, chance, effect. */
export function riteLine(r) {
  const k = riteKind(r);
  const chance = k === 'self' ? 'always works if you have the aether' : `chance: adepts per acre, yours against theirs, ×${pct(r.chance_bp)}, less their ward`;
  const war = r.war_bonus_bp ? `; stronger at war (+${pct(r.war_bonus_bp)})` : '';
  return `${r.name} (${k}): ${riteDoes(r)}. Costs ${riteCost(r)}; ${chance}${war}.`;
}
/** Can you afford it now? '' or why not. */
export function riteShort(r) {
  const h = store.house;
  if (h.aether < r.aether) return `needs ${fmt(r.aether)} aether, you have ${fmt(h.aether)}`;
  const mat = store.rules.params.rite_material;
  if (r.incense && (h.materials[mat] || 0) < r.incense) return `needs ${fmt(r.incense)} ${mat}, you have ${fmt(h.materials[mat] || 0)}`;
  return '';
}
const riteOptions = (sel) => ['self', 'divination', 'hex'].map((k) => {
  const list = rites().filter((r) => riteKind(r) === k);
  return `<optgroup label="${esc(KIND_LABEL[k])}">${list.map((r) => `<option value="${esc(r.id)}"${r.id === sel ? ' selected' : ''}>${esc(r.name)} · ${esc(riteCost(r))}</option>`).join('')}</optgroup>`;
}).join('');

/** Your aether, adepts and resin, in a line. */
export function aetherLine() {
  const h = store.house;
  const mat = store.rules.params.rite_material;
  return `AETHER ${fmt(h.aether)} · ADEPTS ${fmt(h.adepts)} · ${mat.toUpperCase()} ${fmt(h.materials[mat] || 0)}`;
}
/** Rites and hexes in force on you: [[name, until_tick, ticks_left]]. */
export const inForce = () => (store.house.rites || []).map(([n, until]) => [n, until, Math.max(0, until - store.tick)]);
const inForceHTML = () => {
  const list = inForce();
  return list.length
    ? `<ul class="force">${list.map(([n, until, left]) => `<li><span class="name">${esc(n)}</span> <span class="num dim">to T${until} · ${left} tick${left === 1 ? '' : 's'} left</span></li>`).join('')}</ul>`
    : '<p class="dim small">No rites in force on your house.</p>';
};

async function sendCast(f, button) {
  const r = riteById(f.rite.value);
  if (!r) return null;
  if (riteKind(r) === 'self') return act.cast(r.id, null, { button });
  const t = typedTarget(f.target);
  if (!t) { say(`${r.name} needs a target: an address like 2:1:1, or TGT from RANK.`, 'bad'); return null; }
  return act.cast(r.id, t, { button });
}

// ---------- reports ----------
const spyName = (id) => {
  if (store.house && id === store.house.id) return 'you';
  const m = store.state?.members.find((x) => x.id === id);
  return m ? m.name : `house ${id}`;
};
/** One report as a card: header (kind, house, when, by whom) and its rows. */
export function reportCard(item, i, { open = true } = {}) {
  const r = item.report || {};
  const k = reportKind(r);
  const rows = intelRows(r);
  return `<article class="rep" id="d-rep-${i}" data-kind="${esc(k)}">
    <h4 class="rep-h"><span class="rk">${esc(REPORT_LABEL[k] || k.toUpperCase())}</span> <span class="rt">${esc(r.house ? where(r.house) : '?')}</span> <time class="dim" title="${esc(fullTime(item.at))}">${esc(when(item.at))}</time> <span class="dim">by ${esc(spyName(item.spy))}</span></h4>
    ${open ? `<table class="tbl kv">${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="${typeof b === 'number' ? 'num' : 'txt'}">${esc(typeof b === 'number' ? fmt(b) : b)}</td></tr>`).join('')}</table>` : ''}
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
        <label for="r-o-target" title="Target house, as realm:state:seat">TGT</label> <input id="r-o-target" placeholder="r:s:seat" class="w8" autocomplete="off">
        <label class="vh" for="r-o-op">Operation</label><select id="r-o-op">${opOptions('survey')}</select>
        <label for="r-o-n" title="Thieves to send">×</label><input id="r-o-n" type="number" min="1" value="20" class="w5"><button type="button" class="btn mini max" data-max="thieves" aria-label="Send every thief at home">MAX</button>
        <span class="field" id="r-o-xw" hidden><select id="r-o-x"></select></span>
        <label for="r-o-frame" title="False flag: blame this state (realm:state). Costs more nerve.">FLAG</label> <input id="r-o-frame" placeholder="r:s" class="w5" autocomplete="off">
      </span>
      <span class="cost num" id="r-o-cost"></span>
      <button class="btn danger">EXEC</button>
    </form>
    <p class="small" id="r-o-nerve"></p>
    <p class="dim small" id="r-o-info"></p>
    <h3 class="sub">REPORTS <span class="dim" id="r-o-rcount"></span><button type="button" class="btn mini rep-all" data-open="intrigue">ALL · DETAIL</button></h3>
    <ul class="replist" id="r-o-reps"></ul>`;
  secRites.innerHTML = `
    <form id="r-f-rite" class="ticket rite" novalidate>
      <span class="verb">RITE</span>
      <span class="args">
        <label class="vh" for="r-r-rite">Rite</label><select id="r-r-rite">${riteOptions('war_hymns')}</select>
        <label for="r-r-target" title="Target house for divinations and hexes, as realm:state:seat">TGT</label> <input id="r-r-target" placeholder="r:s:seat" class="w8" autocomplete="off">
      </span>
      <span class="cost num" id="r-r-cost"></span>
      <button class="btn primary">CAST</button>
    </form>
    <p class="small" id="r-r-hold"></p>
    <p class="dim small" id="r-r-info"></p>
    <h3 class="sub">IN FORCE ON YOU</h3>
    <div id="r-r-force"></div>
    <p class="dim small">Divinations land in REPORTS (INTRIGUE tab). Shift+Alt+1 opens the full list of rites.</p>`;
  const $ = (id) => document.getElementById(id);
  const fo = { target: $('r-o-target'), op: $('r-o-op'), thieves: $('r-o-n'), extra: $('r-o-x'), frame: $('r-o-frame') };
  const fr = { rite: $('r-r-rite'), target: $('r-r-target') };

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
    $('r-o-info').textContent = opLine(o, framed);
    $('r-o-nerve').textContent = nerveLine();
  }
  function reps() {
    const list = store.reports.slice(0, 5);
    $('r-o-rcount').textContent = store.reports.length ? `${fmt(store.reports.length)} from your state` : '';
    $('r-o-reps').innerHTML = list.length
      ? list.map((x, i) => { const r = x.report || {}; const k = reportKind(r); return `<li><button type="button" class="rep-btn" data-rep="${i}" title="Open this report in detail"><time>${esc(when(x.at))}</time> <span class="rk">${esc(REPORT_LABEL[k] || k)}</span> <span class="rt">${esc(r.house ? `${r.house.name} ${addr(r.house)}` : '?')}</span></button></li>`; }).join('')
      : `<li class="dim small">${esc(store.reportsLoaded ? empty.reports : 'loading reports…')}</li>`;
  }
  function riteForm() {
    const r = riteById(fr.rite.value);
    if (!r) return;
    const self = riteKind(r) === 'self';
    fr.target.disabled = self;
    fr.target.placeholder = self ? 'self' : 'r:s:seat';
    const cost = $('r-r-cost');
    const why = riteShort(r);
    cost.textContent = riteCost(r).replace(' aether', 'ae');
    cost.classList.toggle('short', !!why);
    cost.title = why || `Costs ${riteCost(r)}`;
    $('r-r-info').textContent = riteLine(r);
    $('r-r-hold').textContent = aetherLine();
    $('r-r-force').innerHTML = inForceHTML();
  }
  function targets() {
    const t = store.target;
    for (const inp of [fo.target, fr.target]) if (t && document.activeElement !== inp && !inp.disabled) inp.value = addr(t);
  }

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
      if (!c || c.has('house') || c.has('tick')) { opForm(); riteForm(); }
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
          <span class="field"><input id="d-o-target" placeholder="r:s:seat" autocomplete="off"><button type="button" class="btn mini" data-pick>PICK FROM RANK</button></span>
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
  if (store.target) f.target.value = addr(store.target);
  form(); filterOptions(); reps();

  return {
    update(c) {
      if (!c || c.has('house')) form();
      if (!c || c.has('reports') || c.has('timemode')) { filterOptions(); reps(); }
      if (c && c.has('target')) { if (store.target && document.activeElement !== f.target) f.target.value = addr(store.target); filterOptions(); }
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
export function detailRites(sec, on, ctx) {
  sec.innerHTML = `
    <div class="dgrid">
      <section>
        <h3 class="sub">CAST <span class="dim">self rites, divinations and hexes</span></h3>
        <form id="d-f-rite" class="dform" novalidate>
          <label for="d-r-rite">Rite</label>
          <select id="d-r-rite">${riteOptions('war_hymns')}</select>
          <label for="d-r-target" title="Target house for divinations and hexes">Target</label>
          <span class="field"><input id="d-r-target" placeholder="r:s:seat" autocomplete="off"><button type="button" class="btn mini" data-pick>PICK FROM RANK</button></span>
          <span class="quote num span" id="d-r-q"></span>
          <p class="small span" id="d-r-hold"></p>
          <p class="dim small span" id="d-r-info"></p>
          <span class="btns span"><button class="btn primary">CAST</button></span>
        </form>
        <h3 class="sub gap">IN FORCE ON YOU</h3>
        <div id="d-r-force"></div>
        <p class="dim small">Shrines draw adepts and gather aether each tick; Watchstones give ward against hexes and divinations. Divinations land in INTRIGUE's reports.</p>
      </section>
      <section>
        <h3 class="sub">RITES <span class="dim">cost, length and what each does</span></h3>
        <div class="scrollx"><table class="tbl optbl">
          <tr><th>RITE</th><th class="num">AETHER</th><th class="num">${esc(store.rules.params.rite_material.toUpperCase())}</th><th class="num">TICKS</th><th class="num">CHANCE ×</th><th>DOES</th><th></th></tr>
          ${['self', 'divination', 'hex'].map((k) => `<tr class="grp"><td colspan="7">${esc(KIND_LABEL[k].toUpperCase())}</td></tr>` + rites().filter((r) => riteKind(r) === k).map((r) => `<tr data-rite-row="${esc(r.id)}"><td class="name">${esc(r.name)}</td><td class="num">${fmt(r.aether)}</td><td class="num${r.incense ? '' : ' zero'}">${fmt(r.incense)}</td><td class="num${r.ticks ? '' : ' zero'}">${r.ticks || '·'}</td><td class="num dim">${k === 'self' ? 'sure' : pct(r.chance_bp)}</td><td class="wrap small">${esc(riteDoes(r))}</td><td><button type="button" class="btn mini" data-use-rite="${esc(r.id)}" aria-label="Use ${esc(r.name)}">USE</button></td></tr>`).join('')).join('')}
        </table></div>
      </section>
    </div>`;
  const $ = (id) => sec.querySelector(`#${id}`);
  const f = { rite: $('d-r-rite'), target: $('d-r-target') };
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
    $('d-r-hold').textContent = aetherLine();
    $('d-r-info').textContent = riteLine(r);
    $('d-r-force').innerHTML = inForceHTML();
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
  if (store.target) f.target.value = addr(store.target);
  form();
  return {
    update(c) {
      if (!c || c.has('house') || c.has('tick')) form();
      if (c && c.has('target') && store.target && document.activeElement !== f.target && !f.target.disabled) f.target.value = addr(store.target);
    },
    focus: () => f.rite.focus(),
  };
}

/** Sets the target from a house and says so. */
export function pick(h) {
  setTarget(h);
  say(`Target set to ${h.name} (${addr(h)}).`);
}
