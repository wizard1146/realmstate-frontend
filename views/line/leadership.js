// Straightline's Leadership: who leads your state and how it's run. At a glance (leader, your vote, treasury, tax);
// then tabs. Votes: each house's votes as bars, your standing vote, the state's name (the leader renames it).
// Treasury: what it holds, Donate (anyone), and the leader's Tax and Grant. Vigil: the state's vigil being gathered
// or in force, Give (anyone), and the vigils the leader may open. Leader-only controls stay visible with the reason.
import { store, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr } from '../../core/words.js';
import { isLeader, leaderWhy } from '../../core/truths.js';
import { treasuryNote } from '../../core/market.js';
import { pct } from '../../core/relations.js';
import { tabsHTML, panelAttrs, wireTabs } from './ltabs.js';

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const bar = (have, need) => `<div class="sc-bar"><i style="width:${need ? Math.min(100, (100 * have) / need).toFixed(1) : 0}%"></i></div>`;
const TABS = [['votes', 'Votes'], ['treasury', 'Treasury'], ['vigil', 'Vigil']];

export function mountLeadership(host, on) {
  const P = store.rules.params, mat = P.rite_material;
  const matOptions = () => `<option value="">Gold</option>${Object.keys(store.house?.materials || {}).map((m) => `<option value="${esc(m)}">${esc(cap(m))}</option>`).join('')}`;
  host.innerHTML = `<div class="lpart llead">
    <dl class="st-glance" id="ll-glance"></dl>
    ${tabsHTML(TABS, 'll', 'Leadership')}
    <section ${panelAttrs('ll', 'votes')}>
      <div class="ld-grid">
        <article class="ac-card"><header><h4>The votes</h4><span class="gn-badge" id="ll-maj"></span></header><div id="ll-tally"></div>
          <p class="dim small">A standing vote: it counts every tick until you change it. A majority of the state's houses makes a leader; enough votes against removes one.</p></article>
        <article class="ac-card"><header><h4>Your vote</h4></header>
          <form id="ll-vote" class="lform atk-grid" novalidate><label for="ll-v">Vote</label><select id="ll-v"></select></form>
          <div class="gn-acts"><button type="button" class="btn primary" id="ll-vgo">Cast your vote</button></div></article>
        <article class="ac-card"><header><h4>The state's name</h4><span class="dim small" id="ll-nmwhy"></span></header>
          <form id="ll-nm" class="lform atk-grid" novalidate><label for="ll-nn">Name</label><input id="ll-nn" maxlength="40" autocomplete="off"></form>
          <div class="gn-acts"><button type="button" class="btn" id="ll-nmgo">Rename</button></div>
          <p class="dim small">The leader renames the state once every ${fmt(P.state_rename_ticks ?? 24)} ticks: 1–40 characters, and no two states share a name.</p></article>
      </div>
    </section>
    <section ${panelAttrs('ll', 'treasury')}>
      <div class="ld-grid">
        <article class="ac-card"><header><h4>The treasury</h4></header><div id="ll-treas"></div></article>
        <article class="ac-card"><header><h4>Donate</h4><span class="dim small">any house</span></header>
          <form id="ll-don" class="lform atk-grid" novalidate>
            <label for="ll-dm">What</label><select id="ll-dm">${matOptions()}</select>
            <label for="ll-dn">Amount</label><span class="field"><input id="ll-dn" type="number" min="1" placeholder="0" inputmode="numeric"><button type="button" class="btn mini" data-max="donate" aria-label="Give all you hold of it">MAX</button></span></form>
          <p class="doing" id="ll-dq" aria-live="polite"></p>
          <div class="gn-acts"><button type="button" class="btn primary" id="ll-dgo">Donate</button></div></article>
        <article class="ac-card"><header><h4>Tax</h4><span class="dim small" id="ll-taxwhy"></span></header>
          <form id="ll-tax" class="lform atk-grid" novalidate><label for="ll-tx">Rate</label><span class="field"><input id="ll-tx" type="number" step="0.01" min="0" inputmode="decimal"> <span class="dim small" id="ll-txr"></span></span></form>
          <div class="gn-acts"><button type="button" class="btn" id="ll-txgo">Set the tax</button></div>
          <p class="dim small">Taken from each house's income into the treasury, from the next tick.</p></article>
        <article class="ac-card"><header><h4>Grant</h4><span class="dim small" id="ll-grwhy"></span></header>
          <form id="ll-gr" class="lform atk-grid" novalidate>
            <label for="ll-gt">To</label><select id="ll-gt"></select>
            <label for="ll-gm">What</label><select id="ll-gm">${matOptions()}</select>
            <label for="ll-gn">Amount</label><span class="field"><input id="ll-gn" type="number" min="1" placeholder="0" inputmode="numeric"><button type="button" class="btn mini" data-max="grant" aria-label="All the treasury holds of it">MAX</button></span></form>
          <p class="doing" id="ll-gq" aria-live="polite"></p>
          <div class="gn-acts"><button type="button" class="btn" id="ll-grgo">Grant</button></div></article>
      </div>
    </section>
    <section ${panelAttrs('ll', 'vigil')}>
      <div class="atk-layout"><div class="atk-main">
        <h3 class="sub">Your state's vigil</h3><div id="ll-vg"></div>
        <h3 class="sub">Open a vigil <span class="dim" id="ll-ovwhy"></span></h3><div class="ac-cards" id="ll-vigils"></div>
        <p class="dim small">The leader opens a vigil (it replaces one still being gathered); every house may give aether and ${esc(mat)}. Once both are full it is in force for the whole state.</p>
      </div>
      <aside class="atk-sheet" aria-label="Give to the vigil"><h3 class="sub">Give to it</h3>
        <form id="ll-give" class="lform atk-grid" novalidate>
          <label for="ll-ga">Aether</label><span class="field"><input id="ll-ga" type="number" min="0" placeholder="0" inputmode="numeric"><button type="button" class="btn mini" data-max="aether" aria-label="As much aether as it still needs">MAX</button></span>
          <label for="ll-gi">${esc(cap(mat))}</label><span class="field"><input id="ll-gi" type="number" min="0" placeholder="0" inputmode="numeric"><button type="button" class="btn mini" data-max="incense" aria-label="As much ${esc(mat)} as it still needs">MAX</button></span></form>
        <p class="doing" id="ll-gvq" aria-live="polite"></p>
        <div class="atk-go"><button type="button" class="btn primary" id="ll-gvgo">Give</button></div></aside></div>
    </section>
  </div>`;
  const $ = (id) => host.querySelector(`#ll-${id}`);
  wireTabs(host, on, { tabs: TABS, key: 'realmstate.line.lead' });
  const dirty = new Set();
  on(host, 'input', (ev) => { if (ev.target.id) dirty.add(ev.target.id); draw(); });
  on(host, 'change', (ev) => { if (ev.target.id) dirty.add(ev.target.id); draw(); });
  host.querySelectorAll('form').forEach((f) => on(f, 'submit', (ev) => ev.preventDefault()));
  const lock = (sel, why) => host.querySelectorAll(sel).forEach((x) => { x.disabled = !!why; x.title = why || ''; });

  function glance(s) {
    const mv = s.my_vote || {}, byId = new Map(s.members.map((m) => [m.id, m]));
    const card = (k, v, note) => `<div><dt>${k}</dt><dd>${v}</dd><dd class="rank"><span>${note}</span></dd></div>`;
    $('glance').innerHTML = card('Leader', s.leader ? esc(s.leader.name) : 'None', s.leader ? (isLeader() ? 'that is you' : addr(s.leader)) : `${fmt(s.majority)} votes make one`)
      + card('Your vote', mv.type === 'for' ? esc(byId.get(mv.house)?.name || 'a house') : mv.type === 'against' ? 'Against' : 'Abstaining', mv.type === 'against' ? 'any leader' : 'it stands until you change it')
      + card('Treasury', fmt(s.treasury.gold), 'gold')
      + card('Tax', pct(s.tax.rate_bp), `allowed ${pct(s.tax.min_bp)}–${pct(s.tax.max_bp)}`);
  }
  function votes(s) {
    const h = store.house, L = isLeader(), byId = new Map(s.members.map((m) => [m.id, m]));
    $('maj').textContent = `${fmt(s.majority)} make a majority`;
    const rows = [...(s.votes?.for || []).map((v) => [byId.get(v.house)?.name || `house ${v.house}`, v.votes, v.house === (s.leader?.house ?? s.leader?.id)]), ['Against any leader', s.votes?.against || 0, false]];
    $('tally').innerHTML = rows.map(([name, n, lead]) => `<div class="ld-row"><span>${esc(name)}${lead ? ' <span class="gn-badge">Leads</span>' : ''}</span><b>${fmt(n)}</b></div>${bar(n, s.majority)}`).join('');
    const mv = s.my_vote || {};
    if (!dirty.has('ll-v')) {
      $('v').innerHTML = '<option value="abstain">Abstain</option><option value="against">Against any leader</option>' + s.members.map((m) => `<option value="for:${m.id}">For ${esc(m.name)}${m.id === h.id ? ' (you)' : ''}</option>`).join('');
      $('v').value = mv.type === 'for' ? `for:${mv.house}` : mv.type || 'abstain';
    }
    const wait = s.rename_from_tick > store.tick ? s.rename_from_tick : 0;
    const nwhy = !L ? leaderWhy() : wait ? `next rename at tick ${fmt(wait)} (in ${fmt(wait - store.tick)})` : '';
    $('nmwhy').textContent = nwhy ? cap(nwhy) : '';
    if (!dirty.has('ll-nn')) $('nn').value = s.name || '';
    lock('#ll-nn, #ll-nmgo', nwhy);
  }
  function treasury(s) {
    const h = store.house, L = isLeader(), why = L ? '' : leaderWhy();
    const mats = Object.entries(s.treasury.materials || {}).filter(([, n]) => n);
    $('treas').innerHTML = `<p class="ld-big"><b>${fmt(s.treasury.gold)}</b> gold</p>${mats.length ? `<p class="small">${mats.map(([m, n]) => `${fmt(n)} ${esc(m)}`).join(' · ')}</p>` : '<p class="dim small">No materials.</p>'}
      <p class="dim small">Your state's share of the realm's output: ${pct(s.share_bp)}.</p>${treasuryNote()}`;
    const dm = $('dm').value, dn = num($('dn').value), dHave = dm ? h.materials[dm] || 0 : h.gold;
    $('dq').textContent = !dn ? `You hold ${fmt(dHave)} ${dm || 'gold'}.` : dn > dHave ? `Can't yet: you hold ${fmt(dHave)} ${dm || 'gold'}.` : `Give ${fmt(dn)} ${dm || 'gold'} to the treasury.`;
    $('dq').classList.toggle('short', dn > dHave);
    $('dgo').disabled = !dn || dn > dHave;
    $('taxwhy').textContent = why ? cap(why) : `now ${pct(s.tax.rate_bp)}`;
    if (!dirty.has('ll-tx')) $('tx').value = String(s.tax.rate_bp / 100);
    $('tx').min = String(s.tax.min_bp / 100); $('tx').max = String(s.tax.max_bp / 100);
    $('txr').textContent = `% (${pct(s.tax.min_bp)}–${pct(s.tax.max_bp)})`;
    lock('#ll-tx, #ll-txgo', why);
    $('grwhy').textContent = why ? cap(why) : 'from the treasury';
    if (!dirty.has('ll-gt')) { const v = $('gt').value; $('gt').innerHTML = s.members.map((m) => `<option value="${m.id}">${esc(m.name)} (${addr(m)})</option>`).join(''); if (v) $('gt').value = v; }
    const gm = $('gm').value, gn = num($('gn').value), gHave = gm ? s.treasury.materials[gm] || 0 : s.treasury.gold;
    $('gq').textContent = `The treasury holds ${fmt(gHave)} ${gm || 'gold'}.${gn > gHave ? ' Not that much.' : ''}`;
    $('gq').classList.toggle('short', gn > gHave);
    lock('#ll-gr select, #ll-gr input, #ll-gr button, #ll-grgo', why);
  }
  function vigil(s) {
    const h = store.house, L = isLeader(), v = s.vigil;
    $('vg').innerHTML = v ? `<article class="ac-card"><header><h4>${esc(v.name)}</h4><span class="gn-badge">${v.until_tick ? `In force to tick ${fmt(v.until_tick)}` : 'Gathering'}</span></header>
      <p class="wk-fund">Aether <b>${fmt(v.aether[0])}</b> of ${fmt(v.aether[1])}</p>${bar(v.aether[0], v.aether[1])}
      <p class="wk-fund">${esc(cap(mat))} <b>${fmt(v.incense[0])}</b> of ${fmt(v.incense[1])}</p>${bar(v.incense[0], v.incense[1])}
      <p class="dim small">You hold ${fmt(h.aether)} aether and ${fmt(h.materials[mat] || 0)} ${esc(mat)}.</p></article>`
      : `<p class="dim">No vigil open. ${L ? 'Open one below.' : 'Your leader opens one; then every house may give.'}</p>`;
    const busy = v && v.until_tick, owhy = !L ? leaderWhy() : busy ? 'your state already keeps a vigil' : '';
    $('ovwhy').textContent = owhy ? cap(owhy) : v ? `opening one replaces the ${v.name} being gathered` : '';
    const focus = host.contains(document.activeElement) && document.activeElement.id;
    $('vigils').innerHTML = (P.vigils || []).map((x) => `<article class="ac-card"><header><h4>${esc(x.name)}</h4><span class="gn-badge">${fmt(x.ticks)} ticks</span></header>
      <p class="co-does">${esc((x.mods || []).map((m) => `${m.bp > 0 ? '+' : '−'}${pct(Math.abs(m.bp))} ${m.stat.replace(/_/g, ' ')}`).join(', '))}</p>
      <p class="dim small">Needs ${fmt(x.aether)} aether and ${fmt(x.incense)} ${esc(mat)}.</p>
      <div class="gn-acts"><button type="button" class="btn mini" id="ll-open-${esc(x.id)}" data-open-vigil="${esc(x.id)}"${owhy ? ` disabled title="${esc(owhy)}"` : ''}>Open it</button></div></article>`).join('') || '<p class="dim">No vigils this age.</p>';
    if (focus) host.querySelector(`#${CSS.escape(focus)}`)?.focus();
    const gathering = v && !v.until_tick, ga = num($('ga').value), gi = num($('gi').value);
    lock('#ll-give input, #ll-give button', gathering ? '' : v ? 'the vigil is already in force' : 'no vigil open');
    const why = [!gathering ? (v ? 'the vigil is already in force' : 'no vigil is open') : '', gathering && !ga && !gi ? `give some aether or ${mat}` : '', ga > h.aether ? `you hold ${fmt(h.aether)} aether` : '', gi > (h.materials[mat] || 0) ? `you hold ${fmt(h.materials[mat] || 0)} ${mat}` : ''].filter(Boolean);
    $('gvq').textContent = why.length ? `Can't yet: ${why.join('; ')}.` : `Give ${fmt(Math.min(ga, v.aether[1] - v.aether[0]))} aether and ${fmt(Math.min(gi, v.incense[1] - v.incense[0]))} ${mat}; anything beyond what it needs you keep.`;
    $('gvq').classList.toggle('short', why.length > 0);
    $('gvgo').disabled = why.length > 0;
  }

  on(host, 'click', async (ev) => {
    const x = ev.target.closest('button');
    if (!x || x.disabled) return;
    const s = store.state, h = store.house;
    if (x.id === 'll-vgo') { const v = $('v').value; dirty.delete('ll-v'); act.vote(v.startsWith('for:') ? { type: 'for', house: Number(v.slice(4)) } : { type: v }, { button: x }); }
    else if (x.id === 'll-nmgo') {
      const n = $('nn').value.trim().replace(/\s+/g, ' ');
      if (!n || n.length > 40) { say('A state name is 1–40 characters.', 'bad'); return; }
      dirty.delete('ll-nn'); act.renameState(n, { button: x });
    } else if (x.id === 'll-dgo') { if (await act.donate($('dm').value || null, num($('dn').value), { button: x })) { $('dn').value = ''; draw(); } }
    else if (x.id === 'll-txgo') {
      const v = Number($('tx').value);
      if (!Number.isFinite(v)) { say('Type a tax rate in percent.', 'bad'); return; }
      dirty.delete('ll-tx'); act.setTax(Math.round(v * 100), { button: x });
    } else if (x.id === 'll-grgo') act.grant($('gt').value, $('gm').value || null, num($('gn').value), { button: x });
    else if (x.id === 'll-gvgo') { if (await act.giveToVigil(num($('ga').value), num($('gi').value), { button: x })) { $('ga').value = ''; $('gi').value = ''; draw(); } }
    else if (x.dataset.openVigil) act.openVigil(x.dataset.openVigil, { button: x });
    else if (x.dataset.max === 'donate') { const m = $('dm').value; $('dn').value = String(m ? h.materials[m] || 0 : h.gold); draw(); }
    else if (x.dataset.max === 'grant') { const m = $('gm').value; $('gn').value = String(m ? s.treasury.materials[m] || 0 : s.treasury.gold); draw(); }
    else if (x.dataset.max === 'aether' && s.vigil) { $('ga').value = String(Math.min(h.aether, s.vigil.aether[1] - s.vigil.aether[0])); draw(); }
    else if (x.dataset.max === 'incense' && s.vigil) { $('gi').value = String(Math.min(h.materials[mat] || 0, s.vigil.incense[1] - s.vigil.incense[0])); draw(); }
  });

  function draw() {
    const s = store.state;
    if (!store.house) return;
    if (!s) { $('glance').innerHTML = '<p class="dim">Loading your state…</p>'; return; }
    glance(s); votes(s); treasury(s); vigil(s);
  }
  draw();
  return {
    update(c) { if (!c || c.has('state') || c.has('house') || c.has('age')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
