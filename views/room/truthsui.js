// Truths and quests (SCI), the realm's work and World Wonders (STATE): the panes' short tabs and
// the detail views' controls. Reads /me (quest, truths, subscriber, realm_work, wonders,
// wonder_works) and /rules (truths, wonders, transmute numbers); never what the API doesn't send.
// A quest's Truth stays unnamed until it's uncovered, so asks are never matched to Truths here.
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, askText } from '../../core/words.js';
import { isLeader } from './market.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const P = () => store.rules?.params || {};
const line = (k, v) => `<tr><td class="dim">${esc(k)}</td><td class="txt">${v}</td></tr>`;
const kv = (rows) => `<table class="tbl kv">${rows.map(([k, v]) => line(k, v)).join('')}</table>`;
const ticksTo = (t) => (t > store.tick ? ` <span class="dim">(in ${t - store.tick} ticks)</span>` : '');
const leaderWhy = () => (isLeader() ? '' : store.state?.leader ? `leader only (${store.state.leader.name} leads)` : 'leader only: your state has no leader yet');
const CATS = ['economy', 'military', 'arcane'];

/** What the house holds against a quest's ask: [enough?, the first shortfall]. */
function canPay(a) {
  const h = store.house;
  if (!a || !h) return [false, ''];
  const books = h.science?.books?.[CATS.indexOf(a.books_category || 'arcane')] ?? 0;
  const short = [
    a.gold > h.gold && `${fmt(a.gold - h.gold)} more gold`,
    a.material && a.amount > (h.materials?.[a.material] || 0) && `${fmt(a.amount - (h.materials?.[a.material] || 0))} more ${a.material}`,
    a.books > books && `${fmt(a.books - books)} more ${a.books_category || 'arcane'} books`,
    a.aether > h.aether && `${fmt(a.aether - h.aether)} more aether`,
  ].filter(Boolean);
  return [!short.length, short.join(', ')];
}

// ---------- SCI: TRUTHS ----------
/** Your quest (the Truth unnamed), or a line saying there is none. */
function questHTML() {
  const q = store.house?.quest;
  return q
    ? kv([['Seeker', esc(cap(q.seeker || 'your seeker'))], ['Episode', `${q.episode} of ${q.of}`],
      q.ask ? ['Asks', `${esc(askText(q.ask))} · answer by T${q.answer_by_tick}${ticksTo(q.answer_by_tick)}`] : ['Next ask', `T${q.next_ask_tick}${ticksTo(q.next_ask_tick)}`],
      ['Deadline', `T${q.deadline_tick}`]])
    : '<p class="small dim">No quest. A character or your scientists may be invited to seek a Truth; the invitation comes to your news.</p>';
}

/** The SCI pane's TRUTHS tab: your quest, the Truths you may use. */
export function truthsPaneHTML() {
  const h = store.house;
  if (!h) return '';
  const quest = questHTML();
  const known = (h.truths || []).map((t) => `${esc(t.name)}${t.ours ? ' <span class="dim">(ours)</span>' : ''}`).join(', ') || '<span class="dim">none yet</span>';
  return `<h3 class="sub first">QUEST</h3>${quest}<h3 class="sub">TRUTHS YOU MAY USE</h3><p class="small">${known}</p>${h.subscriber ? '<p class="small dim">Subscriber: the lesser breakthroughs are yours before they are uncovered.</p>' : ''}`;
}

/** The SCI detail's TRUTHS panel. */
export function truthsDetailHTML() {
  return `<div class="dgrid">
    <section><h3 class="sub">QUEST</h3><div id="d-tr-q"></div>
      <p class="btns"><button type="button" class="btn primary" id="d-tr-commit">COMMIT</button> <button type="button" class="btn" id="d-tr-decline">DECLINE</button></p>
      <p class="small" id="d-tr-why"></p>
      <p class="dim small">Each episode, your seeker asks a cost. Commit to pay it and go on, or decline to end the quest. An ask not answered in time lapses. Each paid episode, the trail may go cold or the seeker may die; after the last, the quest may find nothing.</p></section>
    <section><h3 class="sub">TRANSMUTE <span class="dim" id="d-tr-xrate"></span></h3>
      <form id="d-tr-x" class="dform" novalidate>
        <label for="d-tr-xf">From</label><select id="d-tr-xf"></select>
        <label for="d-tr-xt">To</label><select id="d-tr-xt"></select>
        <label for="d-tr-xn">Make</label><input id="d-tr-xn" type="number" min="1" value="10" inputmode="numeric">
        <p class="small span" id="d-tr-xq"></p>
        <span class="btns span"><button class="btn primary">TRANSMUTE</button></span>
      </form></section>
    <section class="wide"><h3 class="sub">TRUTHS</h3><div id="d-tr-list"></div></section>
  </div>`;
}

export function truthsDetailUpdate(b) {
  const h = store.house, p = P();
  if (!h) return;
  const $ = (id) => b.querySelector(`#d-tr-${id}`);
  if (!$('q')) return;
  const q = h.quest;
  $('q').innerHTML = questHTML();
  const [ok, short] = canPay(q?.ask);
  const asking = !!q?.ask;
  $('commit').disabled = !asking || !ok;
  $('decline').disabled = !q;
  $('why').textContent = !q ? '' : !asking ? `The next ask comes at T${q.next_ask_tick}.` : ok ? 'You can pay this ask.' : `Short: ${short}.`;
  $('why').className = `small${asking && !ok ? ' short' : ''}`;
  // Transmutation: the rate is the full rite's if the house knows it, else the lesser one's (subscribers).
  const tid = p.transmute_truth;
  const knows = (h.truths || []).some((t) => t.id === tid);
  const rate = knows ? p.transmute_in : h.subscriber ? p.transmute_lesser_in : 0;
  $('xrate').textContent = !tid ? '(not this age)' : rate ? `${rate} to 1, +${fmt(p.transmute_aether)} aether each${knows ? '' : ' (lesser rite)'}` : 'needs the Transmutation Rite (or a subscription)';
  const mats = Object.keys(h.materials || {});
  for (const id of ['xf', 'xt']) {
    if ($(id).options.length !== mats.length) { const v = $(id).value; $(id).innerHTML = mats.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join(''); if (v) $(id).value = v; }
  }
  if ($('xt').value === $('xf').value && mats.length > 1) $('xt').value = mats.find((m) => m !== $('xf').value);
  const n = num($('xn').value), from = $('xf').value;
  const need = n * rate, aether = n * (p.transmute_aether || 0);
  $('xq').textContent = rate ? `${fmt(n)} ${$('xt').value} takes ${fmt(need)} ${from} (you hold ${fmt(h.materials?.[from] || 0)}) and ${fmt(aether)} aether (you hold ${fmt(h.aether)}); at most ${fmt(p.transmute_max)} a cast.` : '';
  b.querySelectorAll('#d-tr-x select, #d-tr-x input, #d-tr-x button').forEach((x) => { x.disabled = !rate; });
  // The Truths: names and kinds are public; which one a quest seeks is not.
  const mine = new Map((h.truths || []).map((t) => [t.id, t]));
  $('list').innerHTML = `<div class="scrollx"><table class="tbl"><tr><th>TRUTH</th><th>KIND</th><th>FOR YOU</th></tr>${(p.truths || []).map((t) => {
    const k = mine.get(t.id);
    return `<tr><td class="name">${esc(t.name)}</td><td class="dim">${t.kind === 'wonder' ? 'wonder plan' : 'breakthrough'}</td><td>${k ? (k.ours ? 'yours (your state uncovered it)' : 'yours') : '<span class="dim">not yet</span>'}</td></tr>`;
  }).join('')}</table></div>`;
}

export function truthsDetailWire(b, on) {
  const $ = (id) => b.querySelector(`#d-tr-${id}`);
  on($('commit'), 'click', (ev) => act.answerQuest(true, { button: ev.currentTarget }));
  on($('decline'), 'click', (ev) => { if (confirm('Decline the ask? The quest ends.')) act.answerQuest(false, { button: ev.currentTarget }); });
  on($('x'), 'input', () => truthsDetailUpdate(b));
  on($('x'), 'submit', (ev) => {
    ev.preventDefault();
    if ($('xf').value === $('xt').value) { say('Transmute one material into another.', 'bad'); return; }
    act.transmute($('xf').value, $('xt').value, num($('xn').value), { button: ev.submitter });
  });
}

// ---------- STATE: WORK ----------
const work = () => store.house?.realm_work || null;

/** The STATE pane's WORK tab. */
export function workPaneHTML() {
  const w = work();
  if (!w) return '<p class="small dim">Your realm has no work this age.</p>';
  return kv(workRows(w));
}
function workRows(w) {
  return [['Work', `${esc(w.name)} <span class="dim">(+${pct(w.output_bp)} ${esc(w.material)} for the realm, rest of the season)</span>`],
    ['State', w.done ? 'done' : w.passed ? 'passed: funding' : w.proposed ? 'proposed: voting' : 'not proposed'],
    ...(w.proposed ? [['Votes', `${w.votes_yes} of ${w.votes_needed} states needed${(w.yes || []).length ? ` · yes: ${w.yes.map((s) => `${s.realm}:${s.state}`).join(', ')}` : ''}`]] : []),
    ...(w.passed ? [['Gold', `${fmt(w.gold)} / ${fmt(w.gold_needed)}`], [cap(w.material), `${fmt(w.material_given)} / ${fmt(w.material_needed)}`]] : [])];
}

/** The STATE detail's WORK panel. */
export function workDetailHTML() {
  return `<div class="dgrid"><section><h3 class="sub">YOUR REALM'S WORK</h3><div id="d-wk-kv"></div>
      <p class="btns"><button type="button" class="btn primary" id="d-wk-propose">PROPOSE</button> <button type="button" class="btn" id="d-wk-yes">VOTE YES</button> <button type="button" class="btn" id="d-wk-no">VOTE NO</button></p>
      <p class="small dim" id="d-wk-why"></p></section>
    <section><h3 class="sub">FUND IT</h3>
      <form id="d-wk-fund" class="dform" novalidate>
        <label for="d-wk-g">Gold</label><input id="d-wk-g" type="number" min="0" value="0" inputmode="numeric">
        <label for="d-wk-m" id="d-wk-ml">Material</label><input id="d-wk-m" type="number" min="0" value="0" inputmode="numeric">
        <p class="small span" id="d-wk-q"></p>
        <span class="btns span"><button class="btn primary">GIVE</button></span>
        <p class="dim small span">Any house of the realm may give, once the work has passed its vote; a gift is capped at what is still needed.</p>
      </form></section></div>`;
}

// ---------- STATE: WONDERS ----------
/** A house of your state by name ("you" for yours). */
const houseName = (id) => (id === store.house?.id ? 'you' : store.state?.members?.find((m) => m.id === id)?.name || `house ${id}`);

/** The STATE pane's WONDERS tab: wonders standing in the world, your state's builds. */
export function wondersPaneHTML() {
  const h = store.house;
  if (!h) return '';
  const built = (h.wonders || []).map((w) => `${esc(w.name)} <span class="dim">(${esc(w.house_name)}, ${w.state.realm}:${w.state.state}, T${w.tick})</span>`).join('<br>') || '<span class="dim">none yet</span>';
  const ours = (h.wonder_works || []).map((x) => `${esc(x.name)} <span class="dim">by ${esc(houseName(x.builder))}: ${x.done_tick ? `finishes T${x.done_tick}` : `${fmt(x.gold)}/${fmt(x.gold_needed)} gold`}</span>`).join('<br>') || '<span class="dim">none</span>';
  return `<table class="tbl kv">${line('Standing', built)}${line("Your state's builds", ours)}</table>`;
}

/** The STATE detail's WONDERS panel. */
export function wondersDetailHTML() {
  return `<div class="dgrid"><section class="wide"><h3 class="sub">WONDERS</h3><div id="d-wo-list"></div></section>
    <section><h3 class="sub">YOUR STATE'S BUILDS</h3><div id="d-wo-builds"></div>
      <form id="d-wo-fund" class="dform" novalidate>
        <label for="d-wo-b">Build</label><select id="d-wo-b"></select>
        <label for="d-wo-g">Gold</label><input id="d-wo-g" type="number" min="0" value="0" inputmode="numeric">
        <label for="d-wo-m">Material</label><select id="d-wo-m"></select>
        <label for="d-wo-n">Amount</label><input id="d-wo-n" type="number" min="0" value="0" inputmode="numeric">
        <p class="small span" id="d-wo-q"></p>
        <span class="btns span"><button class="btn primary">GIVE</button></span>
      </form></section>
    <section><h3 class="sub">HALLS OF THE DEAD</h3><p class="small" id="d-wo-rv"></p><p class="btns"><button type="button" class="btn danger" id="d-wo-revive">REVIVE</button></p></section></div>`;
}

/** What a wonder does, in words, from its rules row. */
function wonderDoes(w) {
  const out = (w.mods || []).map((m) => `${m.bp > 0 ? '+' : '−'}${pct(Math.abs(m.bp))} ${m.stat.replace(/_/g, ' ')} for your state`);
  if (w.academic_books_bp) out.push(`academics' books +${pct(w.academic_books_bp)} for your state`);
  if (w.resilience_gain_bp) out.push(`Spell Resilience ${(10000 + w.resilience_gain_bp) / 10000}× as fast, up to ${pct(w.resilience_max_bp)}, for your state`);
  if (w.revive_ticks) out.push(`once a season, the owner revives its army as it was ${w.revive_ticks} ticks earlier (${fmt(w.revive_renown)} renown)`);
  return out.join('; ');
}

export function stateTruthsUpdate(b) {
  const h = store.house, p = P();
  if (!h) return;
  const $ = (id) => b.querySelector(`#d-${id}`);
  // Work.
  const w = work(), L = isLeader();
  if ($('wk-kv')) {
    $('wk-kv').innerHTML = w ? kv(workRows(w)) : '<p class="dim">Your realm has no work this age.</p>';
    const voting = w && w.proposed && !w.passed;
    $('wk-propose').disabled = !w || w.proposed || !L;
    $('wk-yes').disabled = $('wk-no').disabled = !voting || !L;
    $('wk-why').textContent = !w ? '' : !L ? leaderWhy() : w.done ? 'Done for this season.' : w.passed ? 'Passed: every house of the realm may fund it.' : w.proposed ? 'Your vote counts for your state.' : 'Propose it; your state votes yes.';
    const funding = w && w.passed && !w.done;
    b.querySelectorAll('#d-wk-fund input, #d-wk-fund button').forEach((x) => { x.disabled = !funding; });
    if (w) $('wk-ml').textContent = cap(w.material);
    const g = num($('wk-g').value), m = num($('wk-m').value);
    $('wk-q').textContent = funding ? `Still needed: ${fmt(w.gold_needed - w.gold)} gold, ${fmt(w.material_needed - w.material_given)} ${w.material}. You hold ${fmt(h.gold)} gold, ${fmt(h.materials?.[w.material] || 0)} ${w.material}.${g > h.gold || m > (h.materials?.[w.material] || 0) ? ' Not that much.' : ''}` : '';
  }
  // Wonders.
  if (!$('wo-list')) return;
  const standing = new Map((h.wonders || []).map((x) => [x.id, x]));
  const knows = new Set((h.truths || []).map((t) => t.id));
  const myWork = (h.wonder_works || []).find((x) => x.builder === h.id);
  $('wo-list').innerHTML = `<div class="scrollx"><table class="tbl wide-tbl"><tr><th>WONDER</th><th>DOES</th><th class="num">COSTS</th><th class="num">TICKS</th><th>STATUS</th><th></th></tr>${(p.wonders || []).map((x) => {
    const s = standing.get(x.id);
    const plan = knows.has(x.truth);
    const status = s ? `stands: ${esc(s.house_name)} (${s.state.realm}:${s.state.state})` : plan ? 'plan known' : '<span class="dim">plan not known</span>';
    const why = s ? 'already built' : !plan ? 'needs its plan (its Truth)' : myWork ? 'your house is already building a wonder' : '';
    return `<tr><td class="name">${esc(x.name)}</td><td class="small wrap">${esc(wonderDoes(x))}</td><td class="num small">${fmt(x.gold)} gold${Object.entries(x.materials || {}).map(([m, q]) => ` + ${fmt(q)} ${esc(m)}`).join('')}</td><td class="num">${x.ticks}</td><td class="small">${status}</td>`
      + `<td><button type="button" class="btn mini" data-start-wonder="${esc(x.id)}"${why ? ` disabled title="${esc(why)}"` : ''} aria-label="Start the ${esc(x.name)}">START</button></td></tr>`;
  }).join('')}</table></div>`;
  const works = h.wonder_works || [];
  $('wo-builds').innerHTML = works.length
    ? `<table class="tbl">${works.map((x) => `<tr><td class="name">${esc(x.name)}</td><td class="small">${esc(houseName(x.builder))} · ${x.done_tick ? `funded: finishes T${x.done_tick}` : `${fmt(x.gold)}/${fmt(x.gold_needed)} gold${x.materials.map((m) => ` · ${fmt(m.given)}/${fmt(m.needed)} ${esc(m.material)}`).join('')}`}</td></tr>`).join('')}</table>`
    : '<p class="small dim">None. A house that knows a wonder\'s plan starts one; then every house of the state may fund it.</p>';
  const open = works.filter((x) => !x.done_tick);
  const sig = open.map((x) => `${x.builder}:${x.id}`).join(',');
  if ($('wo-b').dataset.sig !== sig) {
    const v = $('wo-b').value;
    $('wo-b').innerHTML = open.map((x) => `<option value="${x.builder}">${esc(x.name)} (${esc(houseName(x.builder))})</option>`).join('');
    if (v) $('wo-b').value = v;
    $('wo-b').dataset.sig = sig;
  }
  const pick = open.find((x) => String(x.builder) === $('wo-b').value) || open[0];
  const msig = pick ? pick.materials.map((m) => m.material).join(',') : '';
  if ($('wo-m').dataset.sig !== msig) { $('wo-m').innerHTML = `<option value="">none</option>${pick ? pick.materials.map((m) => `<option value="${esc(m.material)}">${esc(m.material)}</option>`).join('') : ''}`; $('wo-m').dataset.sig = msig; }
  b.querySelectorAll('#d-wo-fund input, #d-wo-fund select, #d-wo-fund button').forEach((x) => { x.disabled = !pick; });
  const mm = $('wo-m').value;
  const need = pick?.materials.find((m) => m.material === mm);
  $('wo-q').textContent = pick ? `Still needed: ${fmt(pick.gold_needed - pick.gold)} gold${pick.materials.map((m) => `, ${fmt(m.needed - m.given)} ${m.material}`).join('')}. You hold ${fmt(h.gold)} gold${mm ? `, ${fmt(h.materials?.[mm] || 0)} ${mm}` : ''}.${need && num($('wo-n').value) > (h.materials?.[mm] || 0) ? ' Not that much.' : ''}` : '';
  // The Halls of the Dead: only its owner revives.
  const halls = (p.wonders || []).find((x) => x.revive_ticks > 0);
  const owned = halls && standing.get(halls.id);
  const mine = owned && owned.house === h.id;
  $('wo-revive').disabled = !mine || owned.revived || h.renown < halls.revive_renown;
  $('wo-rv').textContent = !halls ? 'Not this age.' : !mine ? `Only the house that owns the ${halls.name} may revive its army.`
    : owned.revived ? 'Used this season.' : `Restore your army to what it was ${halls.revive_ticks} ticks ago, for ${fmt(halls.revive_renown)} renown (you have ${fmt(h.renown)}). Once a season.`;
}

export function stateTruthsWire(b, on) {
  const $ = (id) => b.querySelector(`#d-${id}`);
  on($('wk-propose'), 'click', (ev) => act.proposeWork({ button: ev.currentTarget }));
  on($('wk-yes'), 'click', (ev) => act.voteWork(true, { button: ev.currentTarget }));
  on($('wk-no'), 'click', (ev) => act.voteWork(false, { button: ev.currentTarget }));
  on($('wk-fund'), 'input', () => stateTruthsUpdate(b));
  on($('wk-fund'), 'submit', async (ev) => {
    ev.preventDefault();
    const g = num($('wk-g').value), m = num($('wk-m').value);
    if (!g && !m) { say('Give some gold or material.', 'bad'); return; }
    if (await act.fundWork(g, m, { button: ev.submitter })) { $('wk-g').value = '0'; $('wk-m').value = '0'; }
  });
  on($('wo-list'), 'click', (ev) => {
    const x = ev.target.closest('[data-start-wonder]');
    if (x && !x.disabled) act.startWonder(x.dataset.startWonder, { button: x });
  });
  on($('wo-fund'), 'input', () => stateTruthsUpdate(b));
  on($('wo-fund'), 'submit', async (ev) => {
    ev.preventDefault();
    const g = num($('wo-g').value), m = $('wo-m').value, n = num($('wo-n').value);
    if (!g && !(m && n)) { say('Give some gold, or name a material and an amount.', 'bad'); return; }
    if (await act.fundWonder($('wo-b').value, g, m || null, m ? n : 0, { button: ev.submitter })) { $('wo-g').value = '0'; $('wo-n').value = '0'; }
  });
  on($('wo-revive'), 'click', (ev) => { if (confirm('Use the Halls of the Dead now? Once a season.')) act.revive({ button: ev.currentTarget }); });
}

/** For the ACT attack forms: the building select for kinds that choose one (Flanked Ambush). */
export function buildingChoice(kindId) {
  const k = (P().attacks || []).find((x) => x.id === kindId);
  return !!k?.choose_building;
}
export const buildingOptions = () => `<option value="">any (spread over every building)</option>${(store.rules?.buildings || []).map((b) => `<option value="${esc(b.building)}">${esc(b.name)}</option>`).join('')}`;
