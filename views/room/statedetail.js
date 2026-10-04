// The STATE detail: MEMBERS, LEADERSHIP (votes, treasury, tax, grants), VIGILS and WAR.
// Leader-only controls stay visible but disabled, with the reason beside them; the server's own
// refusal (e.g. why war can't be declared) goes to the message line.
import { store, say, loadWars, loadRelations, loadState } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr, empty } from '../../core/words.js';
import { tabState, tabButtons, panelAttrs, wireTabs } from './tabs.js';
import { isLeader, leaderId } from './market.js';

export const STATE_TAB = tabState('realmstate.room.state', ['members', 'leadership', 'vigils', 'war'], { members: 'MEMBERS', leadership: 'LEADERSHIP', vigils: 'VIGILS', war: 'WAR' });
const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const st = (s) => `${s.realm}:${s.state}`;
const same = (a, b) => a && b && a.realm === b.realm && a.state === b.state;
const td = (v) => `<td class="num${v ? '' : ' zero'}">${typeof v === 'number' ? fmt(v) : esc(v)}</td>`;
const table = (head, rows, cls = '') => `<div class="scrollx"><table class="tbl ${cls}"><tr>${head}</tr>${rows}</table></div>`;
const kv = (rows) => table('<th>LINE</th><th class="num">VALUE</th>', rows.map(([k, v]) => `<tr><td>${esc(k)}</td>${typeof v === 'number' ? `<td class="num">${fmt(v)}</td>` : `<td class="txt">${esc(v)}</td>`}</tr>`).join(''));

/** '' if you lead, else why the control is off. */
const leaderWhy = () => (isLeader() ? '' : store.state?.leader ? `leader only (${store.state.leader.name} leads)` : 'leader only: your state has no leader yet; vote for one');

/** The materials the treasury and houses hold, as <option>s, with gold first. */
const matOptions = () => `<option value="">gold</option>${Object.keys(store.house?.materials || {}).map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}`;
/** "Normal 12.0", etc. */
const feel = (f) => `${cap(f.relation)} ${(f.points / 100).toFixed(1)}`;

// ---------- the WAR line in the STATE pane ----------
/** A short line on war: your war, ceasefires, the hottest relation, recovery and dividend. */
export function warLineHTML() {
  const rel = store.relations, s = store.state, w = store.wars;
  if (!s || !w) return '';
  const me = { realm: s.realm, state: s.state };
  const war = (w.wars || []).find((x) => same(x.a, me) || same(x.b, me));
  const cfs = (w.ceasefires || []).filter((c) => same(c.a, me) || same(c.b, me));
  const parts = [];
  if (war) {
    const foe = same(war.a, me) ? war.b : war.a;
    parts.push(`<span class="war">AT WAR</span> with ${st(foe)} since T${war.started_tick}${war.peace_offered.length ? ` · peace offered by ${war.peace_offered.map(st).join(', ')}` : ''}`);
  } else parts.push('<span class="dim">no war</span>');
  if (cfs.length) parts.push(`ceasefire with ${cfs.map((c) => `${st(same(c.a, me) ? c.b : c.a)} to T${c.until_tick}`).join(', ')}`);
  const hot = (rel?.relations || []).slice().sort((a, b) => b.they_feel.points - a.they_feel.points)[0];
  if (hot) parts.push(`${st(hot.state)} feels ${feel(hot.they_feel)} to us`);
  if (s.recovery) parts.push(`recovery ${pct(s.recovery.share_bp)} to T${s.recovery.until_tick}`);
  if (s.peace_dividend) parts.push(`peace dividend ${s.peace_dividend.active ? 'active' : `from T${s.peace_dividend.from_tick}`}`);
  parts.push(`${(w.wars || []).length} war${(w.wars || []).length === 1 ? '' : 's'} in the world`);
  return parts.join(' · ');
}

// ---------- the STATE pane's other tabs (short; the detail holds the controls) ----------
const line = (k, v) => `<tr><td class="dim">${esc(k)}</td><td class="txt">${v}</td></tr>`;
/** LEADERSHIP in the pane: name, leader, votes, treasury, tax. */
export function leadPaneHTML() {
  const s = store.state;
  if (!s) return '';
  const byId = new Map(s.members.map((m) => [m.id, m]));
  const votes = (s.votes?.for || []).map((v) => `${esc(byId.get(v.house)?.name || `house ${v.house}`)} ${v.votes}`).join(', ') || 'none';
  const wait = s.rename_from_tick > store.tick ? ` · rename from T${s.rename_from_tick}` : '';
  return `<table class="tbl kv">${line('Name', `${esc(s.name || `${s.realm}:${s.state}`)}<span class="dim">${wait}</span>`)}${line('Leader', s.leader ? `${esc(s.leader.name)} (${addr(s.leader)})${isLeader() ? ' <span class="dim">you</span>' : ''}` : 'none')}`
    + `${line('Votes', `${votes} · ${s.votes?.against || 0} against · ${s.majority} for a majority`)}${line('Treasury', `${fmt(s.treasury.gold)}g${Object.entries(s.treasury.materials || {}).filter(([, n]) => n).map(([m, n]) => ` · ${fmt(n)} ${esc(m)}`).join('')}`)}`
    + `${line('Tax', `${pct(s.tax.rate_bp)} <span class="dim">(${pct(s.tax.min_bp)}–${pct(s.tax.max_bp)})</span>`)}${line('Share', `${pct(s.share_bp)} of realm output`)}</table>`;
}
/** VIGILS in the pane: the state's vigil, or none. */
export function vigilPaneHTML() {
  const s = store.state, P = store.rules?.params;
  if (!s || !P) return '';
  const v = s.vigil;
  if (!v) return `<p class="small dim">No vigil open. ${isLeader() ? 'Open one in the detail view.' : 'Your leader opens one; then every house can give.'}</p>`;
  return `<table class="tbl kv">${line('Vigil', esc(v.name))}${line('State', v.until_tick ? `in force to T${v.until_tick}` : 'gathering')}${line('Aether', `${fmt(v.aether[0])} / ${fmt(v.aether[1])}`)}${line(cap(P.rite_material), `${fmt(v.incense[0])} / ${fmt(v.incense[1])}`)}</table>`;
}
/** WAR in the pane: the war line and the warmest relations. */
export function warPaneHTML() {
  const R = store.relations, T = R?.thresholds;
  const rows = (R?.relations || []).slice().sort((a, b) => b.they_feel.points - a.they_feel.points).slice(0, 5);
  return `<p class="small warline">${warLineHTML()}</p>` + (rows.length && T ? `<table class="tbl rows">${rows.map((r) => `<tr><td class="num">${st(r.state)}</td><td class="small">they ${esc(feel(r.they_feel))}</td><td class="small">we ${esc(feel(r.we_feel))}</td></tr>`).join('')}</table>` : '');
}

// ---------- MEMBERS ----------
function membersHTML() {
  const s = store.state, h = store.house;
  const votes = new Map((s.votes?.for || []).map((v) => [v.house, v.votes]));
  const L = isLeader();
  return table('<th class="num">SEAT</th><th>HOUSE</th><th>RACE</th><th class="num">LAND</th><th class="num">MIGHT</th><th class="num">RENOWN</th><th class="num">VOTES</th><th>FLAGS</th><th></th>',
    s.members.length ? s.members.map((m) => `<tr class="${m.id === h.id ? 'self' : ''}"><td class="num dim">${m.seat}</td><td class="name">${esc(m.name)}</td><td>${esc(m.race)}</td>${td(m.land)}${td(m.might)}${td(m.renown)}${td(votes.get(m.id) || 0)}`
      + `<td>${leaderId() === m.id ? '<span class="flag l" title="Leader">LEAD</span> ' : ''}${m.protected ? '<span class="flag p" title="Under protection">P</span>' : ''}${m.id === h.id ? ' <span class="dim">you</span>' : ''}</td>`
      + `<td><button type="button" class="btn mini" data-vote-for="${m.id}" aria-label="Vote for ${esc(m.name)} to lead">VOTE</button><button type="button" class="btn mini" data-grant-to="${m.id}"${L ? '' : ` disabled title="${esc(leaderWhy())}"`} aria-label="Grant to ${esc(m.name)}">GRANT</button></td></tr>`).join('')
      : `<tr><td colspan="9" class="dim">${esc(empty.members)}</td></tr>`, 'wide-tbl');
}

// ---------- LEADERSHIP ----------
function leadershipHTML() {
  return `<div class="dgrid">
    <section><h3 class="sub">NAME <span class="dim" id="d-st-nmwhy"></span></h3>
      <form id="d-st-nm" class="dform" novalidate>
        <label for="d-st-nn">Name</label><input id="d-st-nn" maxlength="40" autocomplete="off">
        <span class="btns span"><button class="btn primary">RENAME</button></span>
        <p class="dim small span">The leader can rename the state once every ${fmt(store.rules.params.state_rename_ticks ?? 24)} ticks. 1–40 characters; no two states share a name.</p>
      </form></section>
    <section><h3 class="sub">LEADER AND VOTES</h3><div id="d-st-lead"></div>
      <form id="d-st-vote" class="dform" novalidate>
        <label for="d-st-v">Your vote</label><select id="d-st-v"></select>
        <span class="btns span"><button class="btn primary">VOTE</button></span>
        <p class="dim small span">A standing vote: it counts every tick until you change it. A majority of the state's houses makes a leader; enough votes against removes one.</p>
      </form></section>
    <section><h3 class="sub">TREASURY</h3><div id="d-st-treas"></div>
      <form id="d-st-don" class="dform" novalidate>
        <label for="d-st-dm">Donate</label><select id="d-st-dm">${matOptions()}</select>
        <label for="d-st-dn">Amount</label><span class="field"><input id="d-st-dn" type="number" min="1" value="1000" inputmode="numeric"><button type="button" class="btn mini" data-max="donate" aria-label="Give everything of this you hold">MAX</button></span>
        <p class="small span" id="d-st-dq"></p>
        <span class="btns span"><button class="btn primary">DONATE</button></span>
      </form></section>
    <section><h3 class="sub">TAX <span class="dim" id="d-st-taxwhy"></span></h3>
      <form id="d-st-tax" class="dform" novalidate>
        <label for="d-st-tx">Rate %</label><span class="field"><input id="d-st-tx" type="number" step="0.01" min="0" inputmode="decimal"><small class="dim" id="d-st-txr"></small></span>
        <span class="btns span"><button class="btn primary">SET TAX</button></span>
        <p class="dim small span">The tax is taken from each house's income into the treasury, from the next tick.</p>
      </form></section>
    <section><h3 class="sub">GRANT <span class="dim" id="d-st-grwhy"></span></h3>
      <form id="d-st-gr" class="dform" novalidate>
        <label for="d-st-gt">To</label><select id="d-st-gt"></select>
        <label for="d-st-gm">What</label><select id="d-st-gm">${matOptions()}</select>
        <label for="d-st-gn">Amount</label><span class="field"><input id="d-st-gn" type="number" min="1" value="1000" inputmode="numeric"><button type="button" class="btn mini" data-max="grant" aria-label="Grant everything of this the treasury holds">MAX</button></span>
        <p class="small span" id="d-st-gq"></p>
        <span class="btns span"><button class="btn primary">GRANT</button></span>
      </form></section>
  </div>`;
}

// ---------- VIGILS ----------
function vigilsHTML() {
  const P = store.rules.params;
  return `<div class="dgrid">
    <section><h3 class="sub">YOUR STATE'S VIGIL</h3><div id="d-st-vg"></div>
      <form id="d-st-give" class="dform" novalidate>
        <label for="d-st-ga">Aether</label><span class="field"><input id="d-st-ga" type="number" min="0" value="0" inputmode="numeric"><button type="button" class="btn mini" data-max="aether" aria-label="Most aether the vigil can use">MAX</button></span>
        <label for="d-st-gi">${esc(cap(P.rite_material))}</label><span class="field"><input id="d-st-gi" type="number" min="0" value="0" inputmode="numeric"><button type="button" class="btn mini" data-max="incense" aria-label="Most ${esc(P.rite_material)} the vigil can use">MAX</button></span>
        <p class="small span" id="d-st-gvq"></p>
        <span class="btns span"><button class="btn primary">GIVE</button></span>
      </form></section>
    <section><h3 class="sub">OPEN A VIGIL <span class="dim" id="d-st-ovwhy"></span></h3>
      ${table('<th>VIGIL</th><th class="num">AETHER</th><th class="num">' + esc(P.rite_material.toUpperCase()) + '</th><th class="num">TICKS</th><th>DOES</th><th></th>',
        (P.vigils || []).map((v) => `<tr><td class="name">${esc(v.name)}</td><td class="num">${fmt(v.aether)}</td><td class="num">${fmt(v.incense)}</td><td class="num">${fmt(v.ticks)}</td><td class="small wrap">${esc((v.mods || []).map((m) => `${m.bp > 0 ? '+' : '−'}${pct(Math.abs(m.bp))} ${m.stat.replace(/_/g, ' ')}`).join(', '))}</td><td><button type="button" class="btn mini" data-open-vigil="${esc(v.id)}" aria-label="Open the ${esc(v.name)}">OPEN</button></td></tr>`).join(''))}
      <p class="dim small">The leader opens a vigil (replacing one still being funded); every house can give aether and ${esc(P.rite_material)}. Once both are full it is in force for the whole state.</p></section>
  </div>`;
}

// ---------- WAR ----------
function warHTML() {
  return `<div class="dgrid">
    <section><h3 class="sub">YOUR STATE</h3><div id="d-st-war"></div>
      <p class="btns"><button type="button" class="btn" id="d-st-peace">OFFER PEACE</button><button type="button" class="btn danger" id="d-st-withdraw">WITHDRAW</button> <span class="why" id="d-st-warwhy"></span></p></section>
    <section><h3 class="sub">ACT ON A STATE <span class="dim" id="d-st-actwhy"></span></h3>
      <form id="d-st-wf" class="dform" novalidate>
        <label for="d-st-ws">State</label><span class="field"><input id="d-st-ws" placeholder="r:s" autocomplete="off" class="w5"><small class="dim">or pick a row below</small></span>
        <label for="d-st-wt">Ceasefire</label><span class="field"><input id="d-st-wt" type="number" min="1" inputmode="numeric" class="w5"><small class="dim" id="d-st-wtr"></small></span>
        <span class="btns span"><button type="button" class="btn danger" id="d-st-declare">DECLARE WAR</button><button type="button" class="btn" id="d-st-cf">PROPOSE CEASEFIRE</button><button type="button" class="btn" id="d-st-break">BREAK CEASEFIRE</button></span>
        <p class="small span" id="d-st-hint"></p>
      </form></section>
    <section class="wide"><h3 class="sub">RELATIONS <span class="dim">how each state feels about yours, and yours about it (only the two states see these)</span></h3><div id="d-st-rel"></div></section>
    <section class="wide"><h3 class="sub">WARS AND CEASEFIRES <span class="dim">across the world</span> <button type="button" class="btn mini" id="d-st-wreload">RELOAD</button></h3><div id="d-st-wars"></div></section>
  </div>`;
}

/** Why your state can't declare on `rel` (a /relations row), as far as the page can tell; '' if it might. */
function declareWhy(rel) {
  const R = store.relations, P = store.rules.params, w = store.wars;
  if (!R || !rel) return '';
  if (R.war) return 'your state is already at war';
  if ((w?.wars || []).some((x) => same(x.a, rel.state) || same(x.b, rel.state))) return 'that state is already at war';
  if ((w?.ceasefires || []).some((c) => (same(c.a, rel.state) || same(c.b, rel.state)) && (same(c.a, R.state) || same(c.b, R.state)))) return 'you have a ceasefire with them';
  const [lo, hi] = R.war_range_bp;
  if (rel.land_ratio_bp < lo || rel.land_ratio_bp > hi) return `their land is ${pct(rel.land_ratio_bp)} of yours; war needs ${pct(lo)}–${pct(hi)}`;
  const T = R.thresholds, us = rel.we_feel.points, them = rel.they_feel.points;
  if (us >= T.declare_either && them >= T.declare_either) return '';
  if (them < T.hostile || us < T.unfriendly) return 'needs them Hostile toward you and you at least Unfriendly toward them';
  if (us >= T.hostile && us > them) return 'you are both Hostile and yours is higher: the declaration is theirs';
  return P.war_unique_attackers > 1 ? `also needs ${P.war_unique_attackers} different attackers across the pair (the server checks)` : '';
}
const meter = (f, T) => {
  const w = Math.min(100, (100 * f.points) / Math.max(1, T.auto_war));
  const mk = (p) => `<b style="left:${Math.min(100, (100 * p) / T.auto_war)}%"></b>`;
  return `<span class="meter" title="${esc(feel(f))} of ${(T.auto_war / 100).toFixed(0)} (unfriendly ${T.unfriendly / 100}, hostile ${T.hostile / 100}, either may declare ${T.declare_either / 100}, war starts itself at ${T.auto_war / 100})"><i style="width:${w}%"></i>${mk(T.unfriendly)}${mk(T.hostile)}${mk(T.declare_either)}</span> ${esc(feel(f))}`;
};

export function stateDetail(b, on) {
  b.innerHTML = `<div class="acttabs seg2" role="tablist" aria-label="STATE sections" id="d-st-tabs">${tabButtons(STATE_TAB, 'd-st')}<span class="dim small">houses · votes, treasury, tax and grants · vigils · war and relations</span></div>
    <div ${panelAttrs(STATE_TAB, 'd-st', 'members')}><p class="small" id="d-st-mline"></p><div id="d-st-members"></div></div>
    <div ${panelAttrs(STATE_TAB, 'd-st', 'leadership')}>${leadershipHTML()}</div>
    <div ${panelAttrs(STATE_TAB, 'd-st', 'vigils')}>${vigilsHTML()}</div>
    <div ${panelAttrs(STATE_TAB, 'd-st', 'war')}>${warHTML()}</div>`;
  const $ = (id) => b.querySelector(`#d-st-${id}`);
  const tabs = wireTabs($('tabs'), b, on, STATE_TAB);
  const dirty = new Set();
  on(b, 'input', (ev) => { if (ev.target.id) dirty.add(ev.target.id); render(); });

  function render() {
    const s = store.state, h = store.house, P = store.rules.params;
    if (!s || !h) return;
    const L = isLeader();
    const byId = new Map(s.members.map((m) => [m.id, m]));
    const nm = (id) => { const m = byId.get(id); return m ? `${m.name} (${addr(m)})` : `house ${id}`; };
    // members
    $('mline').textContent = `${s.name ? `${s.name} · ` : ''}State ${s.realm}:${s.state}${s.realm_name ? ` in ${s.realm_name}` : ''} · ${s.members.length} houses · leader ${s.leader ? `${s.leader.name} (${addr(s.leader)})` : 'none'} · ${s.majority} votes make a majority${L ? ' · you lead' : ''}`;
    $('members').innerHTML = membersHTML();
    // leadership
    const mv = s.my_vote || {};
    $('lead').innerHTML = kv([['Leader', s.leader ? `${s.leader.name} (${addr(s.leader)})` : 'none'], ['Votes for a majority', s.majority],
      ...(s.votes?.for || []).map((v) => [`For ${nm(v.house)}`, v.votes]), ['Against any leader', s.votes?.against || 0],
      ['Your vote', mv.type === 'for' ? `for ${nm(mv.house)}` : mv.type === 'against' ? 'against any leader' : 'abstaining']]);
    if (!dirty.has('d-st-v')) {
      $('v').innerHTML = '<option value="abstain">Abstain</option><option value="against">Against any leader</option>' + s.members.map((m) => `<option value="for:${m.id}">For ${esc(m.name)} (${addr(m)})${m.id === h.id ? ' (you)' : ''}</option>`).join('');
      $('v').value = mv.type === 'for' ? `for:${mv.house}` : mv.type || 'abstain';
    }
    $('treas').innerHTML = kv([['Gold', s.treasury.gold], ...Object.entries(s.treasury.materials).filter(([, n]) => n).map(([m, n]) => [cap(m), n]), ['Tax', `${pct(s.tax.rate_bp)} (band ${pct(s.tax.min_bp)}–${pct(s.tax.max_bp)})`], ['Share of realm output', pct(s.share_bp)]]);
    const dm = $('dm').value, dn = num($('dn').value);
    const dHave = dm ? h.materials[dm] || 0 : h.gold;
    $('dq').textContent = `You hold ${fmt(dHave)} ${dm || 'gold'}${dn > dHave ? ' · not that much' : ''}`;
    $('dq').classList.toggle('short', dn > dHave);
    // name
    const wait = s.rename_from_tick > store.tick ? s.rename_from_tick : 0;
    $('nmwhy').textContent = !L ? leaderWhy() : wait ? `next rename at T${wait} (${wait - store.tick} ticks)` : '';
    if (!dirty.has('d-st-nn')) $('nn').value = s.name || '';
    b.querySelectorAll('#d-st-nm input, #d-st-nm button').forEach((x) => { x.disabled = !L || !!wait; x.title = !L ? leaderWhy() : wait ? `next rename at T${wait}` : ''; });
    // tax
    $('taxwhy').textContent = L ? `now ${pct(s.tax.rate_bp)}` : `now ${pct(s.tax.rate_bp)} · ${leaderWhy()}`;
    if (!dirty.has('d-st-tx')) $('tx').value = String(s.tax.rate_bp / 100);
    $('tx').min = String(s.tax.min_bp / 100); $('tx').max = String(s.tax.max_bp / 100);
    $('txr').textContent = `${pct(s.tax.min_bp)}–${pct(s.tax.max_bp)}`;
    // grant
    $('grwhy').textContent = L ? 'from the treasury to a house of the state' : leaderWhy();
    if (!dirty.has('d-st-gt')) { const v = $('gt').value; $('gt').innerHTML = s.members.map((m) => `<option value="${m.id}">${esc(m.name)} (${addr(m)})</option>`).join(''); if (v) $('gt').value = v; }
    const gm = $('gm').value, gn = num($('gn').value);
    const gHave = gm ? s.treasury.materials[gm] || 0 : s.treasury.gold;
    $('gq').textContent = `The treasury holds ${fmt(gHave)} ${gm || 'gold'}${gn > gHave ? ' · not that much' : ''}`;
    $('gq').classList.toggle('short', gn > gHave);
    for (const id of ['tax', 'gr']) b.querySelectorAll(`#d-st-${id} input, #d-st-${id} select, #d-st-${id} button`).forEach((x) => { x.disabled = !L; x.title = L ? '' : leaderWhy(); });
    // vigils
    const v = s.vigil;
    $('vg').innerHTML = v
      ? kv([['Vigil', v.name], ['State', v.until_tick ? `in force to T${v.until_tick}` : 'gathering'], ['Aether', `${fmt(v.aether[0])} / ${fmt(v.aether[1])}`], [cap(P.rite_material), `${fmt(v.incense[0])} / ${fmt(v.incense[1])}`],
        ['You hold', `${fmt(h.aether)} aether, ${fmt(h.materials[P.rite_material] || 0)} ${P.rite_material}`]])
      : `<p class="dim">No vigil open. ${L ? 'Open one on the right.' : 'Your leader opens one; then every house can give.'}</p>`;
    const gathering = v && !v.until_tick;
    b.querySelectorAll('#d-st-give input, #d-st-give button').forEach((x) => { x.disabled = !gathering; x.title = gathering ? '' : v ? 'the vigil is already in force' : 'no vigil open'; });
    const ga = num($('ga').value), gi = num($('gi').value);
    $('gvq').textContent = gathering ? `Gives ${fmt(Math.min(ga, v.aether[1] - v.aether[0]))} aether and ${fmt(Math.min(gi, v.incense[1] - v.incense[0]))} ${P.rite_material} (anything beyond the need is kept)${ga > h.aether ? ' · not that much aether' : ''}${gi > (h.materials[P.rite_material] || 0) ? ` · not that much ${P.rite_material}` : ''}` : '';
    $('gvq').classList.toggle('short', gathering && (ga > h.aether || gi > (h.materials[P.rite_material] || 0)));
    const busy = v && v.until_tick;
    $('ovwhy').textContent = !L ? leaderWhy() : busy ? 'your state already keeps a vigil' : v ? `replaces the ${v.name} being gathered` : '';
    b.querySelectorAll('[data-open-vigil]').forEach((x) => { x.disabled = !L || !!busy; x.title = !L ? leaderWhy() : busy ? 'already in force' : ''; });
    renderWar();
  }

  function renderWar() {
    const s = store.state, R = store.relations, w = store.wars, P = store.rules.params;
    if (!s) return;
    const L = isLeader();
    const me = { realm: s.realm, state: s.state };
    const war = R?.war || (w?.wars || []).find((x) => same(x.a, me) || same(x.b, me));
    const foe = war ? (same(war.a, me) ? war.b : war.a) : null;
    const may = war ? war.started_tick + P.war_min_ticks : 0;
    $('war').innerHTML = kv([
      ['War', war ? `with ${st(foe)} (${war.kind === 'general' ? 'between realms' : 'within the realm'}) since T${war.started_tick}` : 'none'],
      ...(war ? [['Peace offered by', war.peace_offered.length ? war.peace_offered.map(st).join(', ') : 'nobody'], ['Earliest end', `T${may}${store.tick < may ? ` (${may - store.tick} ticks)` : ''}`]] : []),
      ['Ceasefires', (w?.ceasefires || []).filter((c) => same(c.a, me) || same(c.b, me)).map((c) => `${st(same(c.a, me) ? c.b : c.a)} to T${c.until_tick}${c.after_war ? ' (after a war: unbreakable)' : ''}`).join('; ') || 'none'],
      ['War recovery', s.recovery ? `${pct(s.recovery.share_bp)} until T${s.recovery.until_tick}` : 'none'],
      ['Peace dividend', s.peace_dividend ? (s.peace_dividend.active ? `active since T${s.peace_dividend.from_tick}` : `from T${s.peace_dividend.from_tick} (now T${store.tick})`) : 'none'],
      ['War points', (w?.points || []).find((x) => same(x.state, me))?.points || 0],
    ]);
    const peaceMine = war && war.peace_offered.some((x) => same(x, me));
    $('peace').textContent = peaceMine ? 'TAKE BACK PEACE OFFER' : 'OFFER PEACE';
    $('peace').disabled = !L || !war;
    $('withdraw').disabled = !L || !war;
    $('warwhy').textContent = !L ? leaderWhy() : !war ? 'not at war' : store.tick < may ? `war ends no sooner than T${may}; the server says if it's too early` : '';
    $('actwhy').textContent = L ? '' : leaderWhy();
    ['declare', 'cf', 'break'].forEach((k) => { $(k).disabled = !L; $(k).title = L ? '' : leaderWhy(); });
    $('wt').min = String(P.ceasefire_min_ticks); $('wt').max = String(P.ceasefire_max_ticks);
    if (!$('wt').value) $('wt').value = String(P.ceasefire_min_ticks);
    $('wtr').textContent = `ticks, ${P.ceasefire_min_ticks}–${P.ceasefire_max_ticks}`;
    // relations
    const T = R?.thresholds;
    const rows = (R?.relations || []).slice().sort((a, b2) => b2.they_feel.points - a.they_feel.points);
    $('rel').innerHTML = !R ? '<p class="dim">Loading relations…</p>' : table('<th class="num">STATE</th><th>THEY FEEL</th><th>WE FEEL</th><th class="num"><abbr title="Their land as a share of yours">LAND</abbr></th><th>CEASEFIRE ASKED</th><th>DECLARE?</th><th></th>',
      rows.length ? rows.map((r) => { const why = declareWhy(r); return `<tr><td class="num">${st(r.state)}</td><td>${meter(r.they_feel, T)}</td><td>${meter(r.we_feel, T)}</td><td class="num${r.land_ratio_bp < R.war_range_bp[0] || r.land_ratio_bp > R.war_range_bp[1] ? ' dim' : ''}">${pct(r.land_ratio_bp)}</td>`
        + `<td class="small">${r.ceasefire_proposed_to_us ? `they ask ${r.ceasefire_proposed_to_us} ticks` : ''}${r.ceasefire_we_proposed ? `${r.ceasefire_proposed_to_us ? '; ' : ''}we asked ${r.ceasefire_we_proposed}` : ''}</td>`
        + `<td class="small ${why ? 'dim' : 'up'}">${esc(why || 'possible')}</td><td><button type="button" class="btn mini" data-pick-state="${st(r.state)}"${r.ceasefire_proposed_to_us ? ` data-ticks="${r.ceasefire_proposed_to_us}"` : ''} aria-label="Act on state ${st(r.state)}">PICK</button></td></tr>`; }).join('')
        : `<tr><td colspan="7" class="dim">No feelings either way yet. Attacks and caught operations between two states raise their meters (war range ${pct(R.war_range_bp[0])}–${pct(R.war_range_bp[1])} of your land).</td></tr>`, 'wide-tbl');
    hint();
    // world wars
    const list = w?.wars || [];
    $('wars').innerHTML = table('<th>WAR</th><th>KIND</th><th class="num">SINCE</th><th>PEACE OFFERED</th>',
      list.length ? list.map((x) => `<tr class="${same(x.a, me) || same(x.b, me) ? 'self' : ''}"><td>${st(x.a)} declared on ${st(x.b)}</td><td>${x.kind === 'general' ? 'between realms' : 'within a realm'}</td><td class="num">T${x.started_tick}</td><td>${x.peace_offered.map(st).join(', ') || '·'}</td></tr>`).join('') : '<tr><td colspan="4" class="dim">No wars right now.</td></tr>')
      + table('<th>CEASEFIRE</th><th class="num">FROM</th><th class="num">TO</th><th></th>', (w?.ceasefires || []).length ? w.ceasefires.map((c) => `<tr class="${same(c.a, me) || same(c.b, me) ? 'self' : ''}"><td>${st(c.a)} and ${st(c.b)}</td><td class="num">T${c.started_tick}</td><td class="num">T${c.until_tick}</td><td class="small dim">${c.after_war ? 'after a war' : ''}</td></tr>`).join('') : '<tr><td colspan="4" class="dim">No ceasefires.</td></tr>')
      + ((w?.history || []).length ? table('<th>ENDED</th><th>BETWEEN</th><th>HOW</th>', w.history.slice(0, 10).map((x) => `<tr><td class="num">T${x.ended_tick}</td><td>${st(x.a)} – ${st(x.b)}</td><td>${x.end === 'peace' ? 'peace' : `${x.winner ? st(x.winner) : '?'} won by withdrawal`}</td></tr>`).join('')) : '');
  }
  /** The typed state: { realm, state } or null. */
  function target() {
    const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec($('ws').value || '');
    return m ? { realm: Number(m[1]), state: Number(m[2]) } : null;
  }
  function hint() {
    const t = target(), R = store.relations;
    if (!t) { $('hint').textContent = 'Type a state as realm:state, or PICK one from RELATIONS.'; $('hint').className = 'small span dim'; return; }
    const rel = (R?.relations || []).find((r) => same(r.state, t));
    const why = rel ? declareWhy(rel) : 'no hostility either way yet: war needs them Hostile toward you';
    $('hint').textContent = `${st(t)}: ${rel ? `they feel ${feel(rel.they_feel)}, we feel ${feel(rel.we_feel)}, land ${pct(rel.land_ratio_bp)} of ours. ` : ''}War: ${why || 'looks possible'}.`;
    $('hint').className = `small span ${why ? 'dim' : 'up'}`;
  }

  // ---------- wiring ----------
  const need = (fn) => { const t = target(); if (!t) { say('Type the state as realm:state, for example 2:1.', 'bad'); $('ws').focus(); return; } fn(t); };
  on(b, 'click', (ev) => {
    const x = ev.target.closest('button');
    if (!x || x.disabled) return;
    if (x.dataset.voteFor) act.vote({ type: 'for', house: Number(x.dataset.voteFor) }, { button: x });
    else if (x.dataset.grantTo) { STATE_TAB.set('leadership'); tabs.sync(); $('gt').value = x.dataset.grantTo; dirty.add('d-st-gt'); render(); $('gn').focus(); }
    else if (x.dataset.openVigil) act.openVigil(x.dataset.openVigil, { button: x });
    else if (x.dataset.pickState) { $('ws').value = x.dataset.pickState; if (x.dataset.ticks) $('wt').value = x.dataset.ticks; hint(); $('ws').focus(); }
    else if (x.dataset.max === 'donate') { const m = $('dm').value; $('dn').value = String(m ? store.house.materials[m] || 0 : store.house.gold); render(); }
    else if (x.dataset.max === 'grant') { const m = $('gm').value; $('gn').value = String(m ? store.state.treasury.materials[m] || 0 : store.state.treasury.gold); render(); }
    else if (x.dataset.max === 'aether' || x.dataset.max === 'incense') {
      const v = store.state.vigil, h = store.house, mat = store.rules.params.rite_material;
      if (!v) return;
      if (x.dataset.max === 'aether') $('ga').value = String(Math.min(h.aether, v.aether[1] - v.aether[0]));
      else $('gi').value = String(Math.min(h.materials[mat] || 0, v.incense[1] - v.incense[0]));
      render();
    } else if (x.id === 'd-st-peace') act.offerPeace({ button: x });
    else if (x.id === 'd-st-withdraw') { if (confirm('Withdraw from the war? Your state concedes it: the other side wins.')) act.withdraw({ button: x }); }
    else if (x.id === 'd-st-declare') need((t) => { if (confirm(`Declare war on state ${st(t)}?`)) act.declareWar(t.realm, t.state, { button: x }); });
    else if (x.id === 'd-st-cf') need((t) => act.proposeCeasefire(t.realm, t.state, num($('wt').value), { button: x }));
    else if (x.id === 'd-st-break') need((t) => { if (confirm(`Break the ceasefire with ${st(t)}?`)) act.breakCeasefire(t.realm, t.state, { button: x }); });
    else if (x.id === 'd-st-wreload') { loadWars(); loadRelations(); loadState(); }
  });
  on($('vote'), 'submit', (ev) => {
    ev.preventDefault();
    const v = $('v').value;
    dirty.delete('d-st-v');
    act.vote(v.startsWith('for:') ? { type: 'for', house: Number(v.slice(4)) } : { type: v }, { button: ev.submitter });
  });
  on($('don'), 'submit', async (ev) => { ev.preventDefault(); if (await act.donate($('dm').value || null, num($('dn').value), { button: ev.submitter })) render(); });
  on($('nm'), 'submit', (ev) => {
    ev.preventDefault();
    const n = $('nn').value.trim().replace(/\s+/g, ' ');
    if (!n || n.length > 40) { say('A state name is 1–40 characters.', 'bad'); return; }
    dirty.delete('d-st-nn');
    act.renameState(n, { button: ev.submitter });
  });
  on($('tax'), 'submit', (ev) => {
    ev.preventDefault();
    const v = Number($('tx').value);
    if (!Number.isFinite(v)) { say('Type a tax rate in percent.', 'bad'); return; }
    dirty.delete('d-st-tx');
    act.setTax(Math.round(v * 100), { button: ev.submitter });
  });
  on($('gr'), 'submit', (ev) => { ev.preventDefault(); act.grant($('gt').value, $('gm').value || null, num($('gn').value), { button: ev.submitter }); });
  on($('give'), 'submit', async (ev) => {
    ev.preventDefault();
    const a = num($('ga').value), i = num($('gi').value);
    if (!a && !i) { say('Give some aether or incense.', 'bad'); return; }
    if (await act.giveToVigil(a, i, { button: ev.submitter })) { $('ga').value = '0'; $('gi').value = '0'; }
  });
  on($('wf'), 'submit', (ev) => ev.preventDefault());
  render();
  return {
    update(c) { if (!c || ['state', 'house', 'wars', 'relations', 'age'].some((k) => c.has(k))) render(); },
    focus: () => $('tabs').querySelector('[aria-selected=true]')?.focus(),
  };
}
