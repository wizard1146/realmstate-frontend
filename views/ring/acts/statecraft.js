// State & war: your vote, the treasury (donate; the leader's tax and grants), the state's name, aid to a statemate,
// diplomacy (declare war, ceasefires, peace, withdraw), the realm's work and World Wonders. Behaviour and wording follow
// Straightline's Leadership, State, War, Realm Work and World Wonders pages; the reasons are core's (truths.js,
// relations.js) and every figure is the server's (/state, /relations, /wars, /me, /aid/quote).
import { store, loadState, loadRelations, loadWars } from '../../../core/store.js';
import * as act from '../../../core/actions.js';
import { api } from '../../../core/api.js';
import { fmt, esc, addr } from '../../../core/words.js';
import { isLeader, leaderWhy, wonderDoes } from '../../../core/truths.js';
import { treasuryNote } from '../../../core/market.js';
import { pct, st, same, feel, declareWhy } from '../../../core/relations.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const P = () => store.rules.params;
const S = () => store.state;
const need = () => { if (!store.state) loadState(); };
const loading = (go) => ({ ok: false, why: ['loading your state…'], go });
const leadBadge = () => (isLeader() ? '' : 'leader only');

/** A number field with MAX (as land.js). */
const field = (id, label, max) => `<span class="ra-in"><input id="${id}" type="number" min="0" inputmode="numeric" placeholder="0" aria-label="${esc(label)}"><button type="button" class="rg-btn ghost mini" ${max} aria-label="Most you can: ${esc(label)}">MAX</button></span>`;
/** Fills a select from [[value, label]], keeping the choice; only when the options changed. */
function fill(sel, opts) {
  const sig = opts.map(([v, l]) => `${v}=${l}`).join('|');
  if (sel.dataset.sig === sig) return;
  const was = sel.value;
  sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  sel.dataset.sig = sig;
  if (was && opts.some(([v]) => String(v) === was)) sel.value = was;
}
const pick = (sel, v) => { if (v != null && [...sel.options].some((o) => o.value === String(v))) sel.value = String(v); };
const matOpts = (keys) => [['', 'Gold'], ...keys.map((m) => [m, cap(m)])];
const memberName = (id) => S()?.members?.find((m) => m.id === Number(id))?.name || `house ${id}`;

// ---------- leadership ----------
const vote = {
  id: 'vote', group: 'state', name: 'Vote for a leader', wiki: 'leadership.html#Voting', keys: 'leader elect against abstain ballot',
  what: 'Your standing vote: for a house of your state, against any leader, or abstain.',
  badge: () => (S() ? (S().leader ? `${S().leader.name} leads` : 'no leader') : ''),
  mount(body, ctx) {
    need();
    body.innerHTML = `<div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>House</th><th class="num">Votes</th></tr></thead><tbody id="ra-vt"></tbody></table></div>
      <p class="ra-note" id="ra-vnote"></p>
      <div class="ra-line"><label for="ra-vv">Your vote</label><select id="ra-vv"></select></div>`;
    const sel = body.querySelector('#ra-vv');
    const preset = ctx.args.house != null ? `for:${ctx.args.house}` : ctx.args.vote || '';
    const cur = () => { const mv = S()?.my_vote || {}; return mv.type === 'for' ? `for:${mv.house}` : mv.type || 'abstain'; };
    let set = false;
    const draw = () => {
      const s = S(), h = store.house;
      if (!s) { body.querySelector('#ra-vt').innerHTML = '<tr><td colspan="2" class="dim">Loading your state…</td></tr>'; return; }
      const lead = s.leader ? (s.leader.house ?? s.leader.id) : null;
      body.querySelector('#ra-vt').innerHTML = [...(s.votes?.for || []).map((v) => `<tr><th scope="row">${esc(memberName(v.house))}${v.house === lead ? ' <span class="dim">(leads)</span>' : ''}</th><td class="num">${fmt(v.votes)}</td></tr>`),
        `<tr><th scope="row">Against any leader</th><td class="num">${fmt(s.votes?.against || 0)}</td></tr>`].join('');
      body.querySelector('#ra-vnote').textContent = `${fmt(s.majority)} votes make a majority. A standing vote counts every tick until you change it; enough votes against removes a leader.`;
      fill(sel, [['abstain', 'Abstain'], ['against', 'Against any leader'], ...s.members.map((m) => [`for:${m.id}`, `For ${m.name}${m.id === h.id ? ' (you)' : ''}`])]);
      if (!set) { sel.value = cur(); pick(sel, preset); set = true; }
    };
    draw();
    return {
      check() {
        const s = S();
        if (!s) return loading('Vote');
        const v = sel.value, name = v.startsWith('for:') ? memberName(v.slice(4)) : '';
        const text = v === 'against' ? 'Vote against any leader.' : v === 'abstain' ? 'Abstain: your vote counts for no one.' : `Vote for ${name} to lead the state.`;
        return { ok: v !== cur(), why: v === cur() ? ['that is your vote already'] : [], text, go: v === 'against' ? 'Vote against' : v === 'abstain' ? 'Abstain' : `Vote for ${name}` };
      },
      run(btn) { const v = sel.value; return act.vote(v.startsWith('for:') ? { type: 'for', house: Number(v.slice(4)) } : { type: v }, { button: btn }); },
      update() { draw(); },
    };
  },
};

const donate = {
  id: 'donate', group: 'state', name: 'Donate', wiki: 'leadership.html#Powers', keys: 'treasury give gold materials',
  what: 'Give gold or a material to your state\'s treasury.',
  badge: () => (S() ? `treasury ${fmt(S().treasury.gold)} gold` : ''),
  mount(body, ctx) {
    need();
    body.innerHTML = `<div class="ra-line"><label for="ra-dm">What</label><select id="ra-dm"></select></div>
      <div class="ra-line"><label for="ra-dn">Amount</label>${field('ra-dn', 'Amount to donate', 'data-max')}</div>
      <p class="ra-note" id="ra-dnote"></p>`;
    const sel = body.querySelector('#ra-dm'), inp = body.querySelector('#ra-dn');
    const have = () => (sel.value ? store.house.materials?.[sel.value] || 0 : store.house.gold);
    const draw = () => {
      fill(sel, matOpts(Object.keys(store.house.materials || {})));
      const s = S();
      body.querySelector('#ra-dnote').textContent = `You hold ${fmt(have())} ${sel.value || 'gold'}.${s ? ` The treasury holds ${fmt(s.treasury.gold)} gold.` : ''}`;
    };
    draw();
    pick(sel, ctx.args.material); draw();
    if (ctx.args.n) inp.value = String(ctx.args.n);
    ctx.on(sel, 'change', draw);
    ctx.on(body.querySelector('[data-max]'), 'click', () => { inp.value = String(have()); ctx.refresh(); });
    return {
      check() {
        const n = n0(inp.value), what = sel.value || 'gold';
        if (!n) return { ok: false, why: ['choose how much to give'], go: 'Donate' };
        const why = n > have() ? [`you hold ${fmt(have())} ${what}`] : [];
        return { ok: !why.length, why, text: `Give ${fmt(n)} ${what} to your state's treasury.`, go: `Donate ${fmt(n)}` };
      },
      run: (btn) => act.donate(sel.value || null, n0(inp.value), { button: btn }),
      update() { draw(); },
    };
  },
};

const setTax = {
  id: 'set-tax', group: 'state', name: 'Set the tax', wiki: 'leadership.html#Tax', keys: 'tax rate treasury income leader',
  what: 'Leader: the share of each house\'s income taken into the treasury.',
  badge: () => (S() ? `${pct(S().tax.rate_bp)}${isLeader() ? '' : ' · leader only'}` : leadBadge()),
  mount(body, ctx) {
    need();
    body.innerHTML = `<div class="ra-line"><label for="ra-tx">Rate (%)</label><input id="ra-tx" type="number" step="0.01" min="0" inputmode="decimal"></div>
      <p class="ra-note" id="ra-txnote"></p>`;
    const inp = body.querySelector('#ra-tx');
    let set = false;
    const draw = () => {
      const s = S();
      if (!s) return;
      inp.min = String(s.tax.min_bp / 100); inp.max = String(s.tax.max_bp / 100);
      if (!set) { inp.value = String(ctx.args.rate ?? s.tax.rate_bp / 100); set = true; }
      body.querySelector('#ra-txnote').textContent = `Now ${pct(s.tax.rate_bp)}; allowed ${pct(s.tax.min_bp)}–${pct(s.tax.max_bp)}. Taken from each house's income into the treasury, from the next tick.`;
    };
    draw();
    return {
      check() {
        const s = S();
        if (!s) return loading('Set the tax');
        const v = Number(inp.value), bp = Math.round(v * 100), why = [leaderWhy()];
        if (inp.value === '' || !Number.isFinite(v)) why.push('type a tax rate in percent');
        else if (bp < s.tax.min_bp || bp > s.tax.max_bp) why.push(`the tax runs ${pct(s.tax.min_bp)}–${pct(s.tax.max_bp)}`);
        else if (bp === s.tax.rate_bp) why.push('that is the rate now');
        const w = why.filter(Boolean);
        return { ok: !w.length, why: w, text: inp.value !== '' && Number.isFinite(v) ? `Set the tax to ${pct(bp)} (now ${pct(s.tax.rate_bp)}).` : '', go: 'Set the tax' };
      },
      run: (btn) => act.setTax(Math.round(Number(inp.value) * 100), { button: btn }),
      update() { draw(); },
    };
  },
};

const renameState = {
  id: 'rename-state', group: 'state', name: 'Rename the state', wiki: 'leadership.html#Names', keys: 'name state title leader',
  what: 'Leader: give the state a new name (once in a while).',
  badge: leadBadge,
  mount(body, ctx) {
    need();
    body.innerHTML = `<div class="ra-line"><label for="ra-nn">Name</label><input id="ra-nn" maxlength="40" autocomplete="off"></div>
      <p class="ra-note">The leader renames the state once every ${fmt(P().state_rename_ticks ?? 24)} ticks: 1–40 characters, and no two states share a name.</p>`;
    const inp = body.querySelector('#ra-nn');
    let set = false;
    const draw = () => { if (S() && !set) { inp.value = ctx.args.name || S().name || ''; set = true; } };
    draw();
    const name = () => inp.value.trim().replace(/\s+/g, ' ');
    return {
      check() {
        const s = S();
        if (!s) return loading('Rename');
        const n = name(), wait = s.rename_from_tick > store.tick ? s.rename_from_tick : 0;
        const why = [leaderWhy(), wait ? `next rename at tick ${fmt(wait)} (in ${fmt(wait - store.tick)})` : '',
          !n ? 'type a name' : n.length > 40 ? 'a state name is 1–40 characters' : n === s.name ? 'that is its name now' : ''].filter(Boolean);
        return { ok: !why.length, why, text: n ? `Rename ${s.name || 'the state'} to “${n}”.` : '', go: 'Rename' };
      },
      run: (btn) => act.renameState(name(), { button: btn }),
      update() { draw(); },
    };
  },
};

// ---------- aid and grants ----------
const aidOn = () => P().aid_ticks > 0;
const aidGoods = () => { const h = store.house; return ['gold', 'food', 'soldiers', 'horses', 'aether', ...(h.explorable ? ['explorable'] : []), ...Object.keys(h.materials || {}).map((m) => `material:${m}`)]; };
const goodName = (g) => g.replace('material:', '').replace('explorable', 'explorable acres');
function holding(what) {
  const h = store.house;
  if (what.startsWith('material:')) return h.materials?.[what.slice(9)] || 0;
  return { gold: h.gold, food: h.food, soldiers: h.units[0], horses: h.horses, aether: h.aether, explorable: h.explorable?.acres ?? 0 }[what] ?? 0;
}

const sendAid = {
  id: 'send-aid', group: 'state', name: 'Send aid', wiki: 'aid.html', keys: 'aid give help statemate gold food soldiers',
  what: 'Send gold, food, troops or goods to a house of your state; it arrives a few ticks later.',
  badge: () => (aidOn() ? '' : 'not this age'),
  mount(body, ctx) {
    need();
    body.innerHTML = `<div class="ra-line"><label for="ra-at">To</label><select id="ra-at"></select></div>
      <div class="ra-line"><label for="ra-aw">What</label><select id="ra-aw"></select></div>
      <div class="ra-line"><label for="ra-an">Amount</label>${field('ra-an', 'Amount to send', 'data-max')}</div>
      <p class="ra-note" id="ra-aq" aria-live="polite"></p><p class="ra-note" id="ra-abal"></p>
      <p class="ra-note">Aid arrives a few ticks later and some is lost on the way. A house that has received more than it gave pays a tax on what it receives; giving builds credit, and both fade with time.</p>`;
    const to = body.querySelector('#ra-at'), what = body.querySelector('#ra-aw'), inp = body.querySelector('#ra-an');
    const others = () => (S()?.members || []).filter((m) => m.id !== store.house.id);
    const draw = () => {
      fill(to, others().map((m) => [m.id, `${m.name} (${addr(m)})`]));
      fill(what, aidGoods().map((g) => [g, cap(goodName(g))]));
      const bal = store.house.aid_balance || 0;
      body.querySelector('#ra-abal').textContent = bal > 0 ? `You have given ${fmt(bal)} more than you received.` : bal < 0 ? `You have received ${fmt(-bal)} more than you gave.` : '';
    };
    draw();
    pick(to, ctx.args.to); pick(what, ctx.args.what);
    if (ctx.args.n) inp.value = String(ctx.args.n);
    // What it would arrive as: the server works out the loss and the receiver's tax.
    let q = { key: '', text: '', bad: false }, seq = 0, timer = 0;
    const keyNow = () => `${to.value}|${what.value}|${n0(inp.value)}`;
    const showQ = () => { const p = body.querySelector('#ra-aq'); p.textContent = q.key === keyNow() ? q.text : ''; p.classList.toggle('short', !!q.bad); };
    async function quote() {
      const key = keyNow(), n = n0(inp.value), my = ++seq;
      if (!to.value || !n || n > holding(what.value) || !aidOn()) { q = { key, text: '' }; showQ(); return; }
      try {
        const r = await api(`/aid/quote?to=${to.value}&what=${encodeURIComponent(what.value)}&amount=${n}`);
        if (my === seq) q = { key, text: `${fmt(r.arriving)} arrive after ${r.ticks} ticks (${pct(r.loss_bp)} lost on the way${r.tax_bp ? `, ${pct(r.tax_bp)} tax: they have received more than they gave` : ''}).` };
      } catch (e) { if (my === seq) q = { key, text: e.message, bad: true }; }
      if (my === seq) { showQ(); ctx.refresh(); }
    }
    const later = () => { clearTimeout(timer); showQ(); timer = setTimeout(quote, 200); };
    ctx.on(body, 'input', later);
    ctx.on(body, 'change', later);
    ctx.on(body.querySelector('[data-max]'), 'click', () => { inp.value = String(holding(what.value)); later(); ctx.refresh(); });
    if (n0(inp.value)) quote();
    return {
      check() {
        if (!aidOn()) return { ok: false, why: ['there is no aid this age'], go: 'Send' };
        if (!S()) return loading('Send');
        if (!others().length) return { ok: false, why: ['no other houses in your state yet'], go: 'Send' };
        const n = n0(inp.value), g = goodName(what.value), have = holding(what.value);
        if (!n) return { ok: false, why: ['choose how much to send'], go: 'Send' };
        const why = n > have ? [`you have ${fmt(have)} ${g}`] : q.bad && q.key === keyNow() ? [q.text] : [];
        return { ok: !why.length, why, text: `Send ${fmt(n)} ${g} to ${memberName(to.value)}.${!q.bad && q.key === keyNow() && q.text ? ` ${q.text}` : ''}`, go: `Send ${fmt(n)}` };
      },
      run: (btn) => act.sendAid(to.value, what.value, n0(inp.value), { button: btn }),
      update() { draw(); },
      destroy() { clearTimeout(timer); seq++; },
    };
  },
};

const grant = {
  id: 'grant', group: 'state', name: 'Grant', wiki: 'leadership.html#Powers', keys: 'treasury give house leader gold materials',
  what: 'Leader: give treasury gold or materials to a house of the state.',
  badge: leadBadge,
  mount(body, ctx) {
    need();
    body.innerHTML = `<div class="ra-line"><label for="ra-gt">To</label><select id="ra-gt"></select></div>
      <div class="ra-line"><label for="ra-gm">What</label><select id="ra-gm"></select></div>
      <div class="ra-line"><label for="ra-gn">Amount</label>${field('ra-gn', 'Amount to grant', 'data-max')}</div>
      <p class="ra-note" id="ra-gnote"></p><div id="ra-gtn"></div>`;
    const to = body.querySelector('#ra-gt'), mat = body.querySelector('#ra-gm'), inp = body.querySelector('#ra-gn');
    const have = () => { const t = S()?.treasury; return !t ? 0 : mat.value ? t.materials?.[mat.value] || 0 : t.gold; };
    let set = false;
    const draw = () => {
      const s = S();
      if (!s) return;
      fill(to, s.members.map((m) => [m.id, `${m.name} (${addr(m)})`]));
      fill(mat, matOpts([...new Set([...Object.keys(s.treasury.materials || {}), ...Object.keys(store.house.materials || {})])]));
      if (!set) { pick(to, ctx.args.to); set = true; }
      const mats = Object.entries(s.treasury.materials || {}).filter(([, n]) => n);
      body.querySelector('#ra-gnote').textContent = `The treasury holds ${fmt(s.treasury.gold)} gold${mats.length ? `, ${mats.map(([m, n]) => `${fmt(n)} ${m}`).join(', ')}` : ''}.`;
      body.querySelector('#ra-gtn').innerHTML = treasuryNote().replace('class="small dim"', 'class="ra-note"');
    };
    draw();
    ctx.on(body.querySelector('[data-max]'), 'click', () => { inp.value = String(have()); ctx.refresh(); });
    return {
      check() {
        if (!S()) return loading('Grant');
        const n = n0(inp.value), w = mat.value || 'gold';
        const why = [leaderWhy(), !n ? 'choose how much to grant' : n > have() ? `the treasury holds ${fmt(have())} ${w}` : ''].filter(Boolean);
        return { ok: !why.length, why, text: n ? `Grant ${fmt(n)} ${w} from the treasury to ${memberName(to.value)}.` : '', go: n ? `Grant ${fmt(n)}` : 'Grant' };
      },
      run: (btn) => act.grant(to.value, mat.value || null, n0(inp.value), { button: btn }),
      update() { draw(); },
    };
  },
};

// ---------- diplomacy: acts on a state ('r:s', from ctx.args.state or typed) ----------
const mine = () => (S() ? { realm: S().realm, state: S().state } : store.house ? { realm: store.house.realm, state: store.house.state } : null);
const relOf = (t) => (t && (store.relations?.relations || []).find((r) => same(r.state, t))) || null;
const cfWith = (t) => { const me = mine(); return (t && me && (store.wars?.ceasefires || []).find((c) => (same(c.a, t) || same(c.b, t)) && (same(c.a, me) || same(c.b, me)))) || null; };
const myWar = () => { const me = mine(); return store.relations?.war || (me && (store.wars?.wars || []).find((x) => same(x.a, me) || same(x.b, me))) || null; };
const foeOf = (w) => (same(w.a, mine()) ? w.b : w.a);
const atWarWith = (t) => { const w = myWar(); return !!(w && t && (same(w.a, t) || same(w.b, t))); };
const needDip = () => { need(); if (!store.relations) loadRelations(); if (!store.wars) loadWars(); };

/** The state box every diplomacy action starts with; lights both states on the ring. */
function stateBox(body, ctx, extra = '') {
  body.innerHTML = `<div class="ra-line"><label for="ra-ds">State</label><input id="ra-ds" placeholder="r:s" autocomplete="off" spellcheck="false" aria-describedby="ra-dnote"></div>
    ${extra}<p class="ra-note" id="ra-dnote" aria-live="polite"></p>`;
  const inp = body.querySelector('#ra-ds');
  if (ctx.args.state) inp.value = String(ctx.args.state);
  const get = () => { const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(inp.value || ''); return m ? { realm: Number(m[1]), state: Number(m[2]) } : null; };
  /** Why the typed state can't be acted on at all, or ''. */
  const bad = () => {
    const t = get(), p = P();
    if (!t) return 'type a state as realm:state (a space types the colon)';
    if (t.realm < 1 || t.realm > p.realms || t.state < 1 || t.state > p.states_per_realm) return `there are ${p.realms} realms of ${p.states_per_realm} states`;
    return same(t, mine()) ? 'that is your own state' : '';
  };
  let lit = '';
  const note = () => {
    const t = get(), me = mine(), k = t && me && !bad() ? st(t) : '';
    if (k !== lit) { lit = k; ctx.preview(k ? { states: [st(me), k], march: [st(me), k] } : null); }
    const rel = relOf(t), cf = cfWith(t), p = body.querySelector('#ra-dnote');
    p.textContent = !k ? 'Choose a state on the ring, or type it here.' : `State ${k}: ${rel ? `they feel ${feel(rel.they_feel)}, you feel ${feel(rel.we_feel)}; their land is ${pct(rel.land_ratio_bp)} of yours.` : 'no feelings either way yet.'}${atWarWith(t) ? ' You are at war with them.' : ''}${cf ? ` Ceasefire to tick ${fmt(cf.until_tick)}${cf.after_war ? ' (after a war: it can\'t be broken)' : ''}.` : ''}${rel?.ceasefire_proposed_to_us ? ` They ask a ${fmt(rel.ceasefire_proposed_to_us)}-tick ceasefire.` : ''}${rel?.ceasefire_we_proposed ? ` You asked ${fmt(rel.ceasefire_we_proposed)} ticks.` : ''}`;
  };
  ctx.on(inp, 'input', note);
  note();
  return { inp, get, bad, note };
}
/** A diplomacy action on a state: spec gives why(t, more), text(t, more), run(t, btn, more), and optionally
 *  extra() (more fields), wire(body, ctx, box) -> more, label(t), confirm(t). */
function onState(spec) {
  const { why: whyOf, text, run, extra, wire, label, confirm, go, ...rest } = spec;
  return {
    group: 'state', badge: leadBadge, ...rest,
    mount(body, ctx) {
      needDip();
      const box = stateBox(body, ctx, extra ? extra() : '');
      const more = wire ? wire(body, ctx, box) : {};
      return {
        check() {
          if (!S() || !store.relations) return loading(go);
          const t = box.get(), b = box.bad(), why = [leaderWhy(), b, ...(b ? [] : whyOf(t, more))].filter(Boolean);
          return { ok: !why.length, why, text: b ? '' : text(t, more), go: label && !b ? label(t) : go, confirm: confirm && !b ? confirm(t) : '' };
        },
        run: (btn) => run(box.get(), btn, more),
        update() { box.note(); more.update?.(); },
        destroy() { ctx.preview(null); },
      };
    },
  };
}

const declareWar = onState({
  id: 'declare-war', name: 'Declare war', wiki: 'war.html#Declaring', keys: 'war attack enemy state leader hostile', go: 'Declare war',
  what: 'Leader: your state goes to war with another state.',
  why(t) {
    if (atWarWith(t)) return ['you are at war with them'];
    const rel = relOf(t);
    if (!rel) return ['no hostility either way yet: war needs them Hostile toward you'];
    const w = declareWhy(rel);
    return w && !/server checks/.test(w) ? [w] : [];
  },
  text: (t) => { const w = declareWhy(relOf(t)); return `Declare war on state ${st(t)}: every house of both states is at war until one side withdraws or both make peace; a war lasts at least ${fmt(P().war_min_ticks)} ticks.${w ? ` Note: ${w}.` : ''}`; },
  confirm: (t) => `Confirm: war on ${st(t)}`,
  run: (t, btn) => act.declareWar(t.realm, t.state, { button: btn }),
});

const ceasefire = onState({
  id: 'ceasefire', name: 'Ceasefire', wiki: 'war.html#Ceasefires', keys: 'ceasefire truce propose accept peace leader', go: 'Propose a ceasefire',
  what: 'Leader: propose a ceasefire to a state, or accept the one it proposed.',
  extra: () => `<div class="ra-line"><label for="ra-dt">Ticks</label><input id="ra-dt" type="number" inputmode="numeric" min="${P().ceasefire_min_ticks}" max="${P().ceasefire_max_ticks}" value="${P().ceasefire_min_ticks}"></div>
    <p class="ra-note">A ceasefire lasts ${fmt(P().ceasefire_min_ticks)}–${fmt(P().ceasefire_max_ticks)} ticks; it starts once both states propose it.</p>`,
  wire(body, ctx, box) {
    const ticks = body.querySelector('#ra-dt');
    if (ctx.args.ticks) ticks.value = String(ctx.args.ticks);
    let asked = null;
    // Their proposal's length, once, when the state is chosen: accepting means proposing the same.
    const sync = () => { const a = relOf(box.get())?.ceasefire_proposed_to_us || null; if (a && a !== asked) ticks.value = String(a); asked = a; };
    ctx.on(box.inp, 'input', sync);
    sync();
    return { ticks: () => n0(ticks.value), update: sync };
  },
  why(t, m) {
    const p = P(), cf = cfWith(t), n = m.ticks();
    if (atWarWith(t)) return ['you are at war with them: offer peace instead'];
    if (cf) return [`you have a ceasefire with them to tick ${fmt(cf.until_tick)}`];
    return n < p.ceasefire_min_ticks || n > p.ceasefire_max_ticks ? [`a ceasefire lasts ${fmt(p.ceasefire_min_ticks)}–${fmt(p.ceasefire_max_ticks)} ticks`] : [];
  },
  label: (t) => (relOf(t)?.ceasefire_proposed_to_us ? 'Accept their ceasefire' : 'Propose a ceasefire'),
  text: (t, m) => (relOf(t)?.ceasefire_proposed_to_us === m.ticks() ? `Accept state ${st(t)}'s ${fmt(m.ticks())}-tick ceasefire: neither state may declare war on the other while it lasts.` : `Propose a ${fmt(m.ticks())}-tick ceasefire to state ${st(t)}; it starts if they propose it too.`),
  run: (t, btn, m) => act.proposeCeasefire(t.realm, t.state, m.ticks(), { button: btn }),
});

const breakCeasefire = onState({
  id: 'break-ceasefire', name: 'Break a ceasefire', wiki: 'war.html#Ceasefires', keys: 'ceasefire break truce leader', go: 'Break it',
  what: 'Leader: end a ceasefire early. Both states turn against you.',
  why(t) { const cf = cfWith(t); return !cf ? ['you have no ceasefire with them'] : cf.after_war ? ['a ceasefire after a war can\'t be broken'] : []; },
  text: (t) => `Break the ceasefire with state ${st(t)}. Breaking a ceasefire turns both states against you.`,
  confirm: () => 'Confirm: break it',
  run: (t, btn) => act.breakCeasefire(t.realm, t.state, { button: btn }),
});

/** Your war's two actions: offer peace, withdraw. spec.say(war, ours) -> { text, go, confirm }. */
function warAct(spec) {
  const { say, run, ...rest } = spec;
  return {
    group: 'state', ...rest,
    badge: () => (myWar() ? leadBadge() : 'at peace'),
    mount(body, ctx) {
      needDip();
      body.innerHTML = '<p class="ra-note" id="ra-wnote"></p>';
      let lit = '';
      const draw = () => {
        const w = myWar(), me = mine(), p = body.querySelector('#ra-wnote');
        const k = w && me ? st(foeOf(w)) : '';
        if (k !== lit) { lit = k; ctx.preview(k ? { states: [st(me), k], march: [st(me), k] } : null); }
        if (!w) { p.textContent = 'Your state is at peace.'; return; }
        const may = w.may_end_at_tick ?? w.started_tick + P().war_min_ticks, offers = w.peace_offered || [];
        p.textContent = `At war with state ${k} since tick ${fmt(w.started_tick)}. ${offers.length ? `Peace offered by ${offers.map(st).join(' and ')}.` : 'Nobody has offered peace.'} It can end no sooner than tick ${fmt(may)}${store.tick < may ? ` (in ${fmt(may - store.tick)} ticks)` : ''}.`;
      };
      draw();
      return {
        check() {
          if (!S() || !store.relations) return loading(spec.name);
          const w = myWar();
          if (!w) return { ok: false, why: ['your state is at peace'], go: spec.name };
          const may = w.may_end_at_tick ?? w.started_tick + P().war_min_ticks;
          const why = [leaderWhy(), store.tick < may ? `it can end no sooner than tick ${fmt(may)}` : ''].filter(Boolean);
          const ours = (w.peace_offered || []).some((x) => same(x, mine()));
          return { ok: !why.length, why, confirm: '', ...say(w, ours) };
        },
        run: (btn) => run(btn),
        update() { draw(); },
        destroy() { ctx.preview(null); },
      };
    },
  };
}
const offerPeace = warAct({
  id: 'offer-peace', name: 'Offer peace', wiki: 'war.html#Ending', keys: 'peace end war treaty leader',
  what: 'Leader: offer to end your war; it ends when both sides offer.',
  say: (w, ours) => (ours ? { text: `Take back your peace offer to state ${st(foeOf(w))}.`, go: 'Take back the offer' }
    : { text: `Offer peace to state ${st(foeOf(w))}; the war ends when both sides have offered.`, go: 'Offer peace' }),
  run: (btn) => act.offerPeace({ button: btn }),
});
const withdraw = warAct({
  id: 'withdraw', name: 'Withdraw', wiki: 'war.html#Ending', keys: 'surrender concede withdraw war leader',
  what: 'Leader: concede your war; the other side wins it.',
  say: (w) => ({ text: `Your state concedes the war with state ${st(foeOf(w))}: the other side wins it.`, go: 'Withdraw', confirm: 'Confirm: concede the war' }),
  run: (btn) => act.withdraw({ button: btn }),
});

// ---------- the realm's work ----------
const work = () => store.house?.realm_work || null;
function workText(w) {
  if (!w) return 'Your realm has no work this age.';
  const yes = (w.yes || []).map((s) => `${s.realm}:${s.state}`).join(', ');
  return `${w.name}: +${pct(w.output_bp)} ${w.material} for every state of the realm, for the rest of the season. `
    + (w.done ? 'Done.' : w.passed ? `Funding: ${fmt(w.gold)} of ${fmt(w.gold_needed)} gold, ${fmt(w.material_given)} of ${fmt(w.material_needed)} ${w.material}.`
      : w.proposed ? `Voting: ${fmt(w.votes_yes)} of ${fmt(w.votes_needed)} states' votes${yes ? ` (yes: ${yes})` : ''}.` : 'Not proposed yet.');
}
const workBadge = () => { const w = work(); return !w ? 'none this age' : w.done ? 'done' : w.passed ? 'funding' : w.proposed ? 'voting' : 'not proposed'; };

const proposeWork = {
  id: 'propose-work', group: 'state', name: 'Propose the realm\'s work', wiki: 'realm-works.html', keys: 'realm work propose specialised materials production leader',
  what: 'Leader: put your realm\'s work to the vote of the realm\'s leaders; your state votes yes.',
  badge: workBadge,
  mount(body) {
    need();
    body.innerHTML = '<p class="ra-note" id="ra-wk"></p>';
    const draw = () => { body.querySelector('#ra-wk').textContent = workText(work()); };
    draw();
    return {
      check() {
        const w = work(), why = [!w ? 'your realm has no work this age' : w.proposed ? 'it is proposed already' : '', leaderWhy()].filter(Boolean);
        return { ok: !why.length, why, text: w ? `Propose the ${w.name}; your state votes yes.` : '', go: 'Propose it' };
      },
      run: (btn) => act.proposeWork({ button: btn }),
      update() { draw(); },
    };
  },
};

const voteWork = {
  id: 'vote-work', group: 'state', name: 'Vote on the realm\'s work', wiki: 'realm-works.html', keys: 'realm work vote yes no leader',
  what: 'Leader: your state\'s vote on the realm\'s proposed work.',
  badge: workBadge,
  mount(body, ctx) {
    need();
    body.innerHTML = `<p class="ra-note" id="ra-wk"></p>
      <div class="ra-seg" role="group" aria-label="Your state's vote"><button type="button" class="rg-btn ghost mini" data-yes="1" aria-pressed="false">Yes</button><button type="button" class="rg-btn ghost mini" data-yes="0" aria-pressed="false">No</button></div>`;
    let yes = ctx.args.yes == null ? null : !!ctx.args.yes;
    const seg = () => body.querySelectorAll('[data-yes]').forEach((b) => b.setAttribute('aria-pressed', String(yes != null && (b.dataset.yes === '1') === yes)));
    const draw = () => { body.querySelector('#ra-wk').textContent = workText(work()); seg(); };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-yes]'); if (b) { yes = b.dataset.yes === '1'; seg(); ctx.refresh(); } });
    return {
      check() {
        const w = work(), why = [!w ? 'your realm has no work this age' : !w.proposed ? 'it isn\'t proposed yet' : w.passed ? 'it has passed its vote' : '', leaderWhy(), yes == null ? 'choose yes or no' : ''].filter(Boolean);
        return { ok: !why.length, why, text: w && yes != null ? `Your state votes ${yes ? 'yes' : 'no'} on the ${w.name}.` : '', go: yes == null ? 'Vote' : yes ? 'Vote yes' : 'Vote no' };
      },
      run: (btn) => act.voteWork(yes, { button: btn }),
      update() { draw(); },
    };
  },
};

const fundWork = {
  id: 'fund-work', group: 'state', name: 'Fund the realm\'s work', wiki: 'realm-works.html', keys: 'realm work fund give gold material',
  what: 'Give gold and the realm\'s material to its work once it has passed its vote.',
  badge: workBadge,
  mount(body, ctx) {
    need();
    body.innerHTML = `<p class="ra-note" id="ra-wk"></p>
      <div class="ra-line"><label for="ra-wg">Gold</label>${field('ra-wg', 'Gold to give', 'data-wmax="g"')}</div>
      <div class="ra-line"><label for="ra-wm" id="ra-wml">Material</label>${field('ra-wm', 'Material to give', 'data-wmax="m"')}</div>
      <p class="ra-note">Any house of the realm may give; a gift is capped at what's still needed.</p>`;
    const g = body.querySelector('#ra-wg'), m = body.querySelector('#ra-wm');
    const draw = () => {
      const w = work();
      body.querySelector('#ra-wk').textContent = workText(w);
      if (w) { body.querySelector('#ra-wml').textContent = cap(w.material); m.setAttribute('aria-label', `${cap(w.material)} to give`); }
    };
    draw();
    ctx.on(body, 'click', (ev) => {
      const b = ev.target.closest('[data-wmax]'), w = work(), h = store.house;
      if (!b) return;
      if (!w || !w.passed || w.done) { ctx.say?.('The work can be funded once it passes its vote.'); return; }
      if (b.dataset.wmax === 'g') g.value = String(Math.max(0, Math.min(h.gold, w.gold_needed - w.gold)));
      else m.value = String(Math.max(0, Math.min(h.materials?.[w.material] || 0, w.material_needed - w.material_given)));
      ctx.refresh();
    });
    return {
      check() {
        const w = work(), h = store.house, gv = n0(g.value), mv = n0(m.value), have = w ? h.materials?.[w.material] || 0 : 0;
        const why = [!w ? 'your realm has no work this age' : w.done ? 'it\'s done' : !w.passed ? 'it can be funded once it passes its vote' : '',
          w && w.passed && !w.done && !gv && !mv ? 'give some gold or material' : '', gv > h.gold ? `you have ${fmt(h.gold)} gold` : '', w && mv > have ? `you have ${fmt(have)} ${w.material}` : ''].filter(Boolean);
        const parts = [gv && `${fmt(gv)} gold`, mv && w && `${fmt(mv)} ${w.material}`].filter(Boolean).join(' and ');
        return { ok: !why.length, why, text: w && parts ? `Give ${parts} to the ${w.name}. Still needed: ${fmt(w.gold_needed - w.gold)} gold and ${fmt(w.material_needed - w.material_given)} ${w.material}.` : '', go: 'Give' };
      },
      run: (btn) => act.fundWork(n0(g.value), n0(m.value), { button: btn }),
      update() { draw(); },
    };
  },
};

// ---------- World Wonders ----------
const houseName = (id) => (id === store.house?.id ? 'you' : memberName(id));
const openWorks = () => (store.house?.wonder_works || []).filter((x) => !x.done_tick);
const costText = (x, and = '+') => `${fmt(x.gold)} gold${Object.entries(x.materials || {}).map(([m, q]) => ` ${and} ${fmt(q)} ${m}`).join('')}`;

const startWonder = {
  id: 'start-wonder', group: 'state', name: 'Start a wonder', wiki: 'truths.html', keys: 'wonder world build start plan truth',
  what: 'Start a World Wonder whose plan your house knows; your state funds it.',
  badge: () => { const k = new Set((store.house?.truths || []).map((t) => t.id)); const n = (P().wonders || []).filter((w) => k.has(w.truth)).length; return n ? `${fmt(n)} plan${n === 1 ? '' : 's'} known` : 'no plans known'; },
  mount(body, ctx) {
    body.innerHTML = `<p class="ra-note">One of each in the world. A house that knows a wonder's plan (its Truth) starts it; every house of its state may fund it.</p>
      <div class="ra-scroll"><div class="ra-grid" id="ra-wo"></div></div>`;
    let chosen = ctx.args.wonder || null;
    const whyOf = (x) => {
      const h = store.house, s = (h.wonders || []).find((y) => y.id === x.id), plan = (h.truths || []).some((t) => t.id === x.truth);
      return s ? `it stands already (${s.house_name}, ${s.state.realm}:${s.state.state})` : !plan ? 'needs its plan (its Truth)' : (h.wonder_works || []).some((y) => y.builder === h.id) ? 'your house is already building one' : '';
    };
    const draw = () => {
      const focus = body.contains(document.activeElement) ? document.activeElement.dataset.w : null;
      body.querySelector('#ra-wo').innerHTML = (P().wonders || []).map((x) => {
        const why = whyOf(x);
        return `<div class="ra-card"><b>${esc(x.name)}</b>${why ? ` <span class="dim">· ${esc(why)}</span>` : ''}
          <p>${esc(cap(wonderDoes(x)))}.</p><p class="dim">${esc(costText(x))} · ${fmt(x.ticks)} ticks to raise</p>
          <button type="button" class="rg-btn ghost mini" data-w="${esc(x.id)}" aria-pressed="${chosen === x.id}" aria-label="Choose ${esc(x.name)}">Choose</button></div>`;
      }).join('') || '<p class="dim">No wonders this age.</p>';
      if (focus) body.querySelector(`[data-w="${CSS.escape(focus)}"]`)?.focus();
    };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-w]'); if (b) { chosen = b.dataset.w; draw(); ctx.refresh(); } });
    return {
      check() {
        const x = (P().wonders || []).find((y) => y.id === chosen);
        if (!x) return { ok: false, why: ['choose a wonder'], go: 'Start it' };
        const why = whyOf(x);
        return { ok: !why, why: why ? [why] : [], text: `Start the ${x.name}: it needs ${costText(x, 'and')} from your state, then ${fmt(x.ticks)} ticks to raise.`, go: `Start the ${x.name}` };
      },
      run: (btn) => act.startWonder(chosen, { button: btn }),
      update() { draw(); },
    };
  },
};

const fundWonder = {
  id: 'fund-wonder', group: 'state', name: 'Fund a wonder', wiki: 'truths.html', keys: 'wonder fund give gold material build',
  what: 'Give gold or materials to a wonder your state is building.',
  badge: () => { const n = openWorks().length; return n ? `${fmt(n)} being funded` : 'none to fund'; },
  mount(body, ctx) {
    body.innerHTML = `<div class="ra-line"><label for="ra-ob">Build</label><select id="ra-ob"></select></div>
      <div class="ra-line"><label for="ra-og">Gold</label>${field('ra-og', 'Gold to give', 'data-omax="g"')}</div>
      <div class="ra-line"><label for="ra-om">Material</label><select id="ra-om"></select></div>
      <div class="ra-line"><label for="ra-on">Amount</label>${field('ra-on', 'Material to give', 'data-omax="n"')}</div>
      <p class="ra-note" id="ra-onote"></p>`;
    const b = body.querySelector('#ra-ob'), g = body.querySelector('#ra-og'), m = body.querySelector('#ra-om'), n = body.querySelector('#ra-on');
    const cur = () => openWorks().find((x) => String(x.builder) === b.value) || null;
    const draw = () => {
      fill(b, openWorks().map((x) => [x.builder, `${x.name} (${houseName(x.builder)})`]));
      const w = cur();
      fill(m, [['', 'None'], ...(w ? w.materials.map((x) => [x.material, cap(x.material)]) : [])]);
      body.querySelector('#ra-onote').textContent = w ? `Still needed: ${fmt(w.gold_needed - w.gold)} gold${w.materials.map((x) => `, ${fmt(x.needed - x.given)} ${x.material}`).join('')}. You hold ${fmt(store.house.gold)} gold.` : 'Your state has no build to fund. A house that knows a wonder\'s plan starts one.';
    };
    draw();
    pick(b, ctx.args.builder); draw();
    ctx.on(b, 'change', draw);
    ctx.on(body, 'click', (ev) => {
      const x = ev.target.closest('[data-omax]'), w = cur(), h = store.house;
      if (!x || !w) return;
      if (x.dataset.omax === 'g') g.value = String(Math.max(0, Math.min(h.gold, w.gold_needed - w.gold)));
      else { const r = w.materials.find((y) => y.material === m.value); if (r) n.value = String(Math.max(0, Math.min(h.materials?.[r.material] || 0, r.needed - r.given))); else ctx.say?.('Choose a material first.'); }
      ctx.refresh();
    });
    return {
      check() {
        const w = cur(), h = store.house, gv = n0(g.value), mm = m.value, nv = mm ? n0(n.value) : 0, have = h.materials?.[mm] || 0;
        const why = [!w ? 'your state has no build to fund' : '', w && !gv && !nv ? 'give some gold, or a material and an amount' : '', gv > h.gold ? `you have ${fmt(h.gold)} gold` : '', mm && nv > have ? `you have ${fmt(have)} ${mm}` : ''].filter(Boolean);
        const parts = [gv && `${fmt(gv)} gold`, nv && `${fmt(nv)} ${mm}`].filter(Boolean).join(' and ');
        return { ok: !why.length, why, text: w && parts ? `Give ${parts} to the ${w.name}.` : '', go: 'Give' };
      },
      run: (btn) => act.fundWonder(b.value, n0(g.value), m.value || null, m.value ? n0(n.value) : 0, { button: btn }),
      update() { draw(); },
    };
  },
};

export default [vote, donate, setTax, renameState, sendAid, grant, declareWar, ceasefire, breakCeasefire, offerPeace, withdraw, proposeWork, voteWork, fundWork, startWonder, fundWonder];
