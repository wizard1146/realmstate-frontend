// Straightline's State: any state, yours first. ‹ › and the lists move between states (World's rows open one too).
// The state's banner and standing, then its houses. Two windows open over the page: the
// state's statistics (spread, distribution, races) and Send aid. The page's heading is the state's own name (line.js).
// Leadership (votes in detail, treasury, tax, grants) is its own page.
import { store, raceName } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { api } from '../../core/api.js';
import { fmt, esc, addr } from '../../core/words.js';
import { throneGlyph } from './throne.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const leaderOf = (s) => (s?.leader ? (s.leader.house ?? s.leader.id) : null);

let viewing = null;   // { realm, state } another state being looked at; null for your own. Kept while you move about.
/** Opens the State page on a state (World's rows); with no state, on your own. */
export function openState(realm, state) { viewing = realm && state ? { realm, state } : null; }
/** The page heading for the state being looked at: its name, grand, and "State n of <realm>" (line.js). */
let titleOf = null;
export function stateTitle() { return titleOf?.() ?? null; }

// ---------- statistics ----------
const median = (xs) => { const a = [...xs].sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** The sample standard deviation (null for fewer than two). */
const sd = (xs) => { if (xs.length < 2) return null; const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
/** A round bin width near 15% of the median: 1, 2, 2.5 or 5 times a power of ten. */
function binWidth(xs) {
  const t = Math.max(1, median(xs) * 0.15), p = 10 ** Math.floor(Math.log10(t));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((w) => w >= t) || 10 * p;
}
const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(n % 1e6 ? 2 : 0)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(n % 1e3 ? 2 : 0)}k` : fmt(n));
/** Houses per bin, as a small SVG bar chart; at most 10 bins, the last ("≥") collecting the largest. */
function histogram(xs, label) {
  if (!xs.length) return '';
  const w = binWidth(xs), lo = Math.floor(Math.min(...xs) / w) * w;
  let n = Math.floor((Math.max(...xs) - lo) / w) + 1;
  const open = n > 10; if (open) n = 10;
  const bins = Array(n).fill(0);
  for (const x of xs) bins[Math.min(n - 1, Math.floor((x - lo) / w))]++;
  const top = Math.max(...bins), W = 320, H = 110, slot = W / Math.max(n, 4), bw = Math.min(34, slot * 0.7), x0 = (W - slot * n) / 2;
  const grid = Array.from({ length: top + 1 }, (_, k) => k).filter((k) => top <= 5 || k % Math.ceil(top / 5) === 0)
    .map((k) => { const y = H - (k / top) * H; return `<line x1="0" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="grid"/><text x="-6" y="${(y + 3).toFixed(1)}" class="ay">${k}</text>`; }).join('');
  const bars = bins.map((c, k) => {
    const h = (c / top) * H, cx = x0 + slot * k + slot / 2, name = open && k === n - 1 ? `≥ ${short(lo + k * w)}` : `${short(lo + k * w)}–${short(lo + (k + 1) * w)}`;
    return `<g><title>${esc(name)}: ${c} house${c === 1 ? '' : 's'}</title>${c ? `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>` : ''}`
      + `<text x="${cx.toFixed(1)}" y="${H + 14}" class="ax${n > 5 ? ' tilt' : ''}">${esc(name)}</text></g>`;
  }).join('');
  return `<figure class="st-hist"><figcaption>${esc(label)}</figcaption><svg viewBox="-20 -6 ${W + 26} ${H + (n > 5 ? 44 : 22)}" role="img" aria-label="${esc(label)}: houses per bin">
    ${grid}${bars}</svg></figure>`;
}
/** Muted, clearly different colours for the races' slices, in order of size. */
const RACE_COLOURS = ['#c9a25a', '#6f93b8', '#b8696a', '#7fa57a', '#9a7bb0', '#d08a4e', '#5aa5a0', '#b07a95', '#8c8c6a', '#6a7fa5', '#c48a8a', '#8aa86a', '#a58a6a', '#7a8ab0', '#b0a05a'];
/** A pie of the races, with its table. Colours step round the wheel. */
function races(members) {
  const counts = new Map();
  for (const m of members) counts.set(m.race, (counts.get(m.race) || 0) + 1);
  const rows = [...counts].sort((a, b) => b[1] - a[1] || raceName(a[0]).localeCompare(raceName(b[0])));
  const n = members.length, col = (k) => RACE_COLOURS[k % RACE_COLOURS.length];
  let a = -Math.PI / 2;
  const slices = rows.map(([r, c], k) => {
    const da = (c / n) * 2 * Math.PI, x0 = 50 + 48 * Math.cos(a), y0 = 50 + 48 * Math.sin(a);
    a += da;
    const x1 = 50 + 48 * Math.cos(a), y1 = 50 + 48 * Math.sin(a);
    const d = c === n ? '<circle cx="50" cy="50" r="48"' : `<path d="M50 50 L${x0.toFixed(2)} ${y0.toFixed(2)} A48 48 0 ${da > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z"`;
    return `${d} fill="${col(k)}"><title>${esc(raceName(r))}: ${c}</title>${c === n ? '</circle>' : '</path>'}`;
  }).join('');
  return `<div class="st-races"><svg viewBox="0 0 100 100" class="pie" role="img" aria-label="Races of the state's houses">${slices}<circle cx="50" cy="50" r="29" class="hole"/>
      <text x="50" y="49" class="n">${n}</text><text x="50" y="61" class="u">house${n === 1 ? '' : 's'}</text></svg>
    <table class="tbl"><thead><tr><th>Race</th><th class="num">Houses</th><th class="num">Share</th></tr></thead><tbody>${rows.map(([r, c], k) =>
      `<tr><th scope="row"><i class="sw" style="background:${col(k)}"></i>${esc(raceName(r))}</th><td class="num">${c}</td><td class="num">${((c / n) * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div>`;
}
function statsHTML(members) {
  if (!members.length) return '<p class="dim">No houses yet.</p>';
  const might = members.map((m) => m.might), land = members.map((m) => m.land), per = members.map((m) => (m.land ? m.might / m.land : 0));
  const row = (k, xs) => { const s = sd(xs); return `<tr><th scope="row">${k}</th><td class="num">${fmt(Math.round(median(xs)))}</td><td class="num">${fmt(Math.round(mean(xs)))}</td><td class="num">${s == null ? '–' : fmt(Math.round(s))}</td></tr>`; };
  return `<section><h3 class="sub">Per house</h3><table class="tbl st-spread"><thead><tr><th><span class="vh">Figure</span></th><th class="num">Median</th><th class="num">Mean</th><th class="num" title="Sample standard deviation">SD</th></tr></thead><tbody>
      ${row('Might', might)}${row('Land (acres)', land)}${row('Might per acre', per)}</tbody></table>
    <p class="note">Across ${members.length} house${members.length === 1 ? '' : 's'}; SD is the sample standard deviation.</p></section>
    <section><h3 class="sub">Distribution</h3>
    <div class="st-hists">${histogram(might, 'Might per house')}${histogram(land, 'Acres per house')}</div>
    <p class="note">Houses per bin. A bin is about 15% of the state's median house; a last “≥” bin collects the largest.</p></section>
    <section><h3 class="sub">Races</h3>${races(members)}</section>`;
}

export function mountState(host, on) {
  host.innerHTML = `<div class="lpart lstate${throneGlyph() ? ' glyph' : ''}">
    <nav class="st-nav" aria-label="Other states">
      <button type="button" class="btn" data-step="-1" aria-label="Previous state">‹</button>
      <label class="vh" for="ls-realm">Realm</label><select id="ls-realm"></select>
      <label class="vh" for="ls-state">State</label><select id="ls-state"></select>
      <button type="button" class="btn" data-step="1" aria-label="Next state">›</button>
      <form id="ls-goto" class="st-goto" novalidate><label class="vh" for="ls-addr">Go to a state by its address, realm:state</label>
        <input id="ls-addr" placeholder="1:3" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="ls-addr-why"><button class="btn">Go</button>
        <span class="short small" id="ls-addr-why" aria-live="polite"></span></form>
      <button type="button" class="btn" id="ls-home">Your state</button>
    </nav>
    <!-- The state's banner and picture: placeholders until states can choose them. -->
    <div class="st-arms">
      <figure class="st-banner" aria-label="State banner (not yet chosen)"><svg viewBox="0 0 100 140" aria-hidden="true">
        <path d="M8 6 H92 V128 L50 106 L8 128 Z" /></svg><figcaption>State banner</figcaption></figure>
      <figure class="st-picture" aria-label="State picture (not yet chosen)"><div class="frame"><span>State picture</span></div></figure>
    </div>
    <dl class="st-glance" id="ls-glance"></dl>
    <section><div class="st-head"><h3 class="sub">Houses</h3><span class="st-btns">
        <button type="button" class="btn" id="ls-open-stats" aria-haspopup="dialog">Statistics</button>
        <button type="button" class="btn" id="ls-open-aid" aria-haspopup="dialog">Send aid</button></span></div>
      <div class="scrollx"><table class="tbl st-tbl"><thead><tr><th class="num">Seat</th><th>House</th><th>Race</th><th class="num">Land</th><th class="num">Might</th>
        <th class="num">Renown</th><th class="num" data-votes>Votes</th><th><span class="vh">Marks</span></th><th><span class="vh">Actions</span></th></tr></thead><tbody id="ls-rows"></tbody></table></div>
      <p class="dim small" id="ls-votes"></p></section>

    <dialog class="ldlg st-stats" id="ls-dstats" aria-labelledby="ls-dstats-h">
      <header><h2 id="ls-dstats-h">Statistics <span id="ls-dstats-of"></span></h2><button type="button" class="x" data-close aria-label="Close (Esc)">×</button></header>
      <div class="body" id="ls-stats"></div></dialog>

    <dialog class="ldlg st-aid" id="ls-daid" aria-labelledby="ls-daid-h">
      <header><h2 id="ls-daid-h">Send aid</h2><button type="button" class="x" data-close aria-label="Close (Esc)">×</button></header>
      <div class="body">
        <form id="ls-aid" class="lform" novalidate>
          <label for="ls-at">To</label><select id="ls-at"></select>
          <label for="ls-aw">What</label><select id="ls-aw"></select>
          <label for="ls-an">Amount</label><span class="field"><input id="ls-an" type="number" min="1" step="1" inputmode="numeric" placeholder="0"><button type="button" class="btn mini" id="ls-amax" aria-label="Send all you have of this">MAX</button></span>
          <span class="go"><button class="btn primary" id="ls-ago">Send</button></span>
        </form>
        <p class="doing" id="ls-aq" aria-live="polite" hidden></p>
        <p class="note" id="ls-abal"></p>
        <p class="note">Aid arrives a few ticks later and some is lost on the way. A house that has received more than it gave pays a tax on what it receives; giving builds credit, and both fade with time.</p>
      </div></dialog>
  </div>`;
  const $ = (id) => host.querySelector(`#ls-${id}`);

  // ---------- the two windows: Esc and the × close them; a click on the backdrop too; focus returns ----------
  const opener = new Map();
  function openDlg(d, from) { opener.set(d, from); d.showModal(); }
  for (const d of host.querySelectorAll('dialog')) {
    on(d, 'click', (ev) => { if (ev.target === d || ev.target.closest('[data-close]')) d.close(); });
    on(d, 'close', () => { if (opener.get(d)?.isConnected) opener.get(d).focus(); });
  }
  on($('open-stats'), 'click', (ev) => openDlg($('dstats'), ev.currentTarget));
  on($('open-aid'), 'click', (ev) => { openDlg($('daid'), ev.currentTarget); $('at').focus(); });

  /** How much of `what` you hold. */
  function holding(what) {
    const h = store.house;
    if (what.startsWith('material:')) return h.materials[what.slice(9)] || 0;
    return { gold: h.gold, food: h.food, soldiers: h.units[0], horses: h.horses, aether: h.aether, explorable: h.explorable?.acres ?? 0 }[what] ?? 0;
  }

  // ---------- which state: yours (from /state, with votes) or another (public: /realms/:n and /states/:r/:s) ----------
  const P0 = store.rules?.params || {}, REALMS = P0.realms || 13, PER = P0.states_per_realm || 7;
  const realmInfo = new Map();   // realm -> /realms/:n, as loaded
  let other = null;              // another state's view: { realm, state, name, realm_name, members, leader, ranks }
  const mine = () => !viewing || (store.house && viewing.realm === store.house.realm && viewing.state === store.house.state);
  const at = () => (mine() ? { realm: store.house?.realm, state: store.house?.state } : viewing);
  const view = () => (mine() ? store.state : other);
  titleOf = () => {
    const s = view(), a = at();
    if (!a?.realm) return null;
    const rn = s?.realm_name || realmInfo.get(a.realm)?.name || `Realm ${a.realm}`;
    return `<span class="h-state">${esc(s?.name || `State ${a.realm}:${a.state}`)}</span> <span class="h-of">State ${a.state} of <a href="#world" data-realm="${a.realm}">${esc(rn)}</a></span>`;
  };
  const retitle = () => { const t = document.getElementById('l-title'), html = titleOf(); if (t && html) t.innerHTML = html; };
  async function realmOf(r) {
    if (!realmInfo.has(r)) realmInfo.set(r, await api(`/realms/${r}`));
    return realmInfo.get(r);
  }
  function lists() {
    const a = at(), info = realmInfo.get(a.realm);
    $('realm').innerHTML = Array.from({ length: REALMS }, (_, k) => k + 1).map((n) =>
      `<option value="${n}"${n === a.realm ? ' selected' : ''}>Realm ${n}${realmInfo.get(n) ? ` · ${esc(realmInfo.get(n).name)}` : ''}${n === store.house?.realm ? ' (yours)' : ''}</option>`).join('');
    $('state').innerHTML = Array.from({ length: PER }, (_, k) => k + 1).map((n) => {
      const st = info?.states.find((x) => x.state === n);
      return `<option value="${n}"${n === a.state ? ' selected' : ''}>State ${n}${st?.name ? ` · ${esc(st.name)}` : ''}${a.realm === store.house?.realm && n === store.house?.state ? ' (yours)' : ''}</option>`;
    }).join('');
    $('home').disabled = mine();
  }
  let loadSeq = 0;
  async function go(realm, state) {
    viewing = { realm, state };
    other = null;
    const seq = ++loadSeq;
    lists(); draw(); retitle();
    try {
      const info = await realmOf(realm);
      if (seq !== loadSeq) return;
      lists(); retitle();
      if (mine()) { draw(); return; }
      const members = await api(`/states/${realm}/${state}`);
      if (seq !== loadSeq) return;
      const st = info.states.find((x) => x.state === state) || {};
      other = { realm, state, name: st.name, realm_name: info.name, members, leader: st.leader, ranks: st.ranks };
      draw(); retitle();
    } catch (e) { if (seq === loadSeq) { $('rows').innerHTML = `<tr><td colspan="9" class="short">${esc(e.message)}</td></tr>`; } }
  }
  on(host.querySelector('.st-nav'), 'click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'ls-home') { go(store.house.realm, store.house.state); return; }
    // Step through every state in order, realm by realm, round the world.
    const a = at(), n = ((a.realm - 1) * PER + (a.state - 1) + Number(b.dataset.step) + REALMS * PER) % (REALMS * PER);
    go(Math.floor(n / PER) + 1, (n % PER) + 1);
  });
  on($('realm'), 'change', () => go(Number($('realm').value), 1));
  // An address typed in: realm:state (a house's realm:state:seat goes to its state).
  on($('goto'), 'submit', (ev) => {
    ev.preventDefault();
    const m = $('addr').value.trim().match(/^(\d+)\s*[:.\/ ]\s*(\d+)(?:\s*[:.\/ ]\s*\d+)?$/), why = $('addr-why');
    const r = m && Number(m[1]), st = m && Number(m[2]);
    if (!m) { why.textContent = 'Write it as realm:state, like 1:3.'; return; }
    if (r < 1 || r > REALMS || st < 1 || st > PER) { why.textContent = `There are ${REALMS} realms of ${PER} states.`; return; }
    why.textContent = ''; $('addr').value = '';
    go(r, st);
  });
  on($('addr'), 'input', () => { $('addr-why').textContent = ''; });
  on($('state'), 'change', () => go(at().realm, Number($('state').value)));

  let shownStats = '';
  function draw() {
    const s = view(), h = store.house, P = store.rules?.params, yours = mine();
    host.querySelector('.lstate').classList.toggle('theirs', !yours);
    if (!s || !h) { if (!yours) { $('glance').innerHTML = ''; $('rows').innerHTML = '<tr><td colspan="9" class="dim">Loading…</td></tr>'; } return; }
    const lead = leaderOf(s), votes = new Map((s.votes?.for || []).map((v) => [v.house, v.votes]));
    const mv = s.my_vote || {};
    // Standing: the state's totals, and its place among all states (the server ranks them; an old one doesn't).
    const sum = (k) => s.members.reduce((a, m) => a + (m[k] || 0), 0);
    const card = (k, label) => {
      const r = s.ranks?.[k];
      return `<div><dt>${label}</dt><dd>${fmt(r ? r.total : sum(k))}</dd>${r ? `<dd class="rank" title="${esc(label)}: ${r.rank} of ${r.of} states">#${fmt(r.rank)} <span>of ${fmt(r.of)}</span></dd>` : ''}</div>`;
    };
    $('glance').innerHTML = card('land', 'Land') + card('might', 'Might') + card('renown', 'Renown');
    // Every seat in order; a seat no house holds is an open row.
    const seats = Math.max(P?.houses_per_state || 0, ...s.members.map((m) => m.seat));
    const bySeat = new Map(s.members.map((m) => [m.seat, m]));
    $('rows').innerHTML = Array.from({ length: seats }, (_, k) => bySeat.get(k + 1) || { seat: k + 1, open: true }).map((m, k) => {
      if (m.open) return `<tr class="open${k % 2 ? ' alt' : ''}"><td class="num dim">${m.seat}</td><th scope="row">Open seat</th><td colspan="${yours ? 7 : 6}"></td></tr>`;
      const me = m.id === h.id, marks = [lead === m.id ? '<span class="mark lead">Leader</span>' : '', m.protected ? '<span class="mark prot" title="Under protection">Protected</span>' : '', me ? '<span class="mark you">You</span>' : ''].join('');
      return `<tr class="${[me ? 'self' : '', k % 2 ? 'alt' : ''].join(' ').trim()}"><td class="num dim">${m.seat}</td><th scope="row">${esc(m.name)}</th><td>${esc(raceName(m.race))}</td>`
        + `<td class="num">${fmt(m.land)}</td><td class="num">${fmt(m.might)}</td><td class="num">${fmt(m.renown)}</td>${yours ? `<td class="num">${fmt(votes.get(m.id) || 0)}</td>` : ''}<td class="marks">${marks}</td>`
        + (yours ? `<td class="acts"><button type="button" class="btn mini" data-vote-for="${m.id}"${mv.type === 'for' && mv.house === m.id ? ' disabled title="Your vote already"' : ''} aria-label="Vote for ${esc(m.name)} to lead">Vote</button>`
        + `${me ? '' : `<button type="button" class="btn mini" data-aid-to="${m.id}" aria-label="Send aid to ${esc(m.name)}">Aid</button>`}</td></tr>` : '<td></td></tr>');
    }).join('');
    host.querySelector('[data-votes]').hidden = !yours;
    $('votes').textContent = yours && s.votes?.against ? `${fmt(s.votes.against)} vote${s.votes.against === 1 ? '' : 's'} against any leader.` : '';
    // Statistics: redrawn only when the houses' figures change.
    const key = JSON.stringify(s.members.map((m) => [m.id, m.land, m.might, m.race]));
    if (key !== shownStats) { shownStats = key; $('stats').innerHTML = statsHTML(s.members); }
    $('dstats-of').textContent = s.name ? `· ${s.name}` : '';
    // Aid: who to, what, and your balance; the row's Aid and the Send aid button only where the age has aid.
    const aidOn = yours && !!(P?.aid_ticks > 0), others = s.members.filter((m) => m.id !== h.id);
    $('open-aid').hidden = !aidOn;
    host.querySelectorAll('[data-aid-to]').forEach((b) => { b.hidden = !aidOn; });
    if (!aidOn) return;
    const v = $('at').value;
    $('at').innerHTML = others.length ? others.map((m) => `<option value="${m.id}">${esc(m.name)} (${addr(m)})</option>`).join('') : '<option value="">No other houses yet</option>';
    if (v && others.some((m) => String(m.id) === v)) $('at').value = v;
    if (!$('aw').options.length) {
      const goods = ['gold', 'food', 'soldiers', 'horses', 'aether', ...(h.explorable ? ['explorable'] : []), ...Object.keys(h.materials || {}).map((m) => `material:${m}`)];
      $('aw').innerHTML = goods.map((g) => `<option value="${esc(g)}">${esc(g.replace('material:', '').replace('explorable', 'explorable acres'))}</option>`).join('');
    }
    const bal = h.aid_balance || 0;
    $('abal').textContent = bal > 0 ? `You have given ${fmt(bal)} more than you received.` : bal < 0 ? `You have received ${fmt(-bal)} more than you gave.` : '';
    $('abal').hidden = !bal;
    $('ago').disabled = !others.length;
  }

  let quoteSeq = 0;
  /** What the aid would arrive as (the server works out the receiver's tax). */
  async function quote() {
    const to = $('at').value, what = $('aw').value, n = num($('an').value), q = $('aq'), seq = ++quoteSeq;
    const show = (t, bad = false) => { q.hidden = !t; q.textContent = t; q.classList.toggle('short', bad); };
    if (!to || !n) return show('');
    if (n > holding(what)) return show(`You have ${fmt(holding(what))} ${what.replace('material:', '')}.`, true);
    try {
      const r = await api(`/aid/quote?to=${to}&what=${encodeURIComponent(what)}&amount=${n}`);
      if (seq === quoteSeq) show(`${fmt(r.arriving)} arrive after ${r.ticks} ticks (${r.loss_bp / 100}% lost on the way${r.tax_bp ? `, ${r.tax_bp / 100}% tax: they have received more than they gave` : ''}).`);
    } catch (e) { if (seq === quoteSeq) show(e.message, true); }
  }

  on($('rows'), 'click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.voteFor) act.vote({ type: 'for', house: Number(b.dataset.voteFor) }, { button: b });
    if (b.dataset.aidTo) { $('at').value = b.dataset.aidTo; openDlg($('daid'), b); quote(); $('an').focus(); }
  });
  on($('aid'), 'input', quote);
  on($('aid'), 'change', quote);
  on($('amax'), 'click', () => { $('an').value = String(holding($('aw').value)); quote(); $('an').focus(); });
  on($('aid'), 'submit', async (ev) => {
    ev.preventDefault();
    const n = num($('an').value);
    if (!$('at').value || !n) return;
    if (await act.sendAid($('at').value, $('aw').value, n, { button: $('ago') })) { $('an').value = ''; quote(); }
  });

  if (mine()) { lists(); draw(); realmOf(at().realm).then(() => { lists(); retitle(); }).catch(() => {}); } else go(viewing.realm, viewing.state);
  return {
    update(c) { if (!c || c.has('state') || c.has('house') || c.has('rules')) { draw(); if (mine()) retitle(); } },
    tick() {},
    destroy() { titleOf = null; host.replaceChildren(); },
  };
}
