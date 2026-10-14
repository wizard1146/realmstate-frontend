// Straightline's Attack: who, how, and with what. The target (an address, or chosen from the rankings) with its public
// facts; the kind of attack and the general leading it; the army in one table (troops, then medics, mounts and
// mercenaries); one order with a confirm step; armies coming home. The maths are core/attack.js's.
import { store, raceOf, raceName, unitPoints, setTarget, reportsOn } from '../../core/store.js';
import { tickList } from './underway.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr, when, MERC } from '../../core/words.js';
import { attackSlots, attackHint, buildingChoice, buildingOptions, attackQuote, extraMax, mercRatio, offenseParts } from '../../core/attack.js';
import { generalOptions, generalLine } from '../../core/generals.js';
import { trainByTick } from '../../core/military.js';
import { throneGlyph } from './throne.js';
import { mountAdvisor } from './advisor.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const REPORT_NAMES = { muster: 'Muster Roll', dossier: 'Full Dossier', scrying: 'Scrying' };
const listText = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function mountAttack(host, on) {
  const P = store.rules.params, race = raceOf(store.house.race);
  const merc = race.units[MERC] || { name: P.mercenary_name || 'Mercenaries', off: P.mercenary_off || 0 };
  host.innerHTML = `<div class="lpart lbuild latk${throneGlyph() ? ' glyph' : ''}">
    <div class="atk-layout">
      <div class="atk-main">
        <h3 class="sub">Army</h3>
        <table class="tbl lb-tbl atk-tbl fit">
          <thead><tr><th data-fx="last">Send</th><th class="num" data-pri="4" title="Attack points each">Off</th><th class="num">At home</th><th class="num">Count</th><th></th><th class="num" data-pri="3">Offense</th></tr></thead>
          <tbody id="la-troops">${attackSlots(race).map((i) => `<tr data-slot="${i}"><th scope="row">${esc(race.units[i].name)}</th><td class="num pt">${unitPoints(race, i)[0]}</td><td class="num" data-home></td>
            <td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-u="${i}" aria-label="${esc(race.units[i].name)} to send"></td>
            <td class="acts"><button type="button" class="btn mini" data-umax="${i}" aria-label="Every ${esc(race.units[i].name)} at home">MAX</button><button type="button" class="x" data-ux="${i}" aria-label="Clear ${esc(race.units[i].name)}">×</button></td><td class="num sum" data-sum></td></tr>`).join('')}</tbody>
          <tbody class="extras" id="la-extras">
            <tr class="grp"><th colspan="6" scope="rowgroup">With the army</th></tr>
            ${[['medics', 'Medics', '', 'Save some of your dead'], ['horses', 'Horses', P.horse_offense, 'One mount per troop'], ['chariots', 'Chariots', P.chariot_offense, 'One mount per troop'],
        ['mercs', merc.name, merc.off, `Hired for this attack: ${fmt(P.mercenary_gold)} gold each, one per ${mercRatio()} of your troops; survivors leave after`],
        ...(race.race?.mercenary_upgrades ? [['upmercs', `${merc.name}, upgraded`, '', `Of those hired, fight ${P.upgrade_bonus_bp / 100}% stronger, for ${P.upgrade_material}`]] : [])]
        .map(([k, label, off, tip]) => `<tr data-x="${k}"><th scope="row" title="${esc(tip)}">${esc(label)}</th><td class="num pt">${off === '' ? '' : `+${off}`}</td><td class="num" data-xhome></td>
              <td class="num"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-xn="${k}" aria-label="${esc(label)} to send"></td>
              <td class="acts"><button type="button" class="btn mini" data-xmax="${k}" aria-label="Most ${esc(label)}">MAX</button><button type="button" class="x" data-xx="${k}" aria-label="Clear ${esc(label)}">×</button></td><td class="num sum" data-xsum></td></tr>`).join('')}
            ${race.race?.double_strike ? `<tr><th scope="row" colspan="6"><label class="atk-check"><input type="checkbox" id="la-double"> Keep a second strike <span class="dim">(at war, led by a general with ${race.race.double_strike.general_traits}+ traits)</span></label></th></tr>` : ''}
          </tbody>
        </table>
        <p class="note">Offense here is your troops' points before bonuses (buildings, science, the general); the battle uses the full figures. Thieves stay home.</p>
      </div>

      <!-- The battle sheet: who, how, the score and the order; it stays in view while you fill the army. -->
      <aside class="atk-sheet" aria-label="The attack">
        <h3 class="sub">Against</h3>
        <form id="la-tf" class="atk-find" novalidate>
          <label class="vh" for="la-addr">Target house, by address</label>
          <input id="la-addr" placeholder="r:s:seat" inputmode="text" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">
          <button class="btn">Look up</button>
          <button type="button" class="btn" id="la-pick" aria-haspopup="dialog">Rankings…</button>
        </form>
        <div class="atk-card" id="la-card" aria-live="polite"><p class="dim">No target yet: type an address, or choose one.</p></div>
        <div class="atk-intel" id="la-intel" hidden></div>
        <h3 class="sub">How</h3>
        <div class="lform atk-grid">
          <label for="la-kind">Attack</label><select id="la-kind">${P.attacks.map((k) => `<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('')}</select>
          <p class="atk-note" id="la-hint"></p>
          <label for="la-bld" id="la-bldl" hidden>Land from</label><select id="la-bld" hidden>${buildingOptions()}</select>
          <label for="la-gen">General</label><select id="la-gen"></select>
          <p class="atk-note" id="la-genl"></p>
        </div>
        <h3 class="sub">Attack score</h3>
        <div id="la-score"></div>
        <p class="doing" id="la-doing" aria-live="polite" hidden></p>
        <div class="atk-go"><button type="button" class="btn" id="la-all">All at home</button><button type="button" class="btn" id="la-clear">Clear</button><button type="button" class="btn danger" id="la-go">Attack…</button></div>
      </aside>
    </div>

    <h3 class="sub">Armies coming home <span class="dim">the next 24 ticks</span></h3>
    <div id="la-uw"></div>

    <dialog class="ldlg atk-confirm" id="la-confirm" aria-labelledby="la-confirm-h">
      <header><h2 id="la-confirm-h">Send the army?</h2><button type="button" class="x" data-close aria-label="Cancel (Esc)">×</button></header>
      <div class="body"><p id="la-ask"></p><dl class="atk-facts" id="la-ask-facts"></dl>
        <div class="atk-btns"><button type="button" class="btn" id="la-no">Cancel</button><button type="button" class="btn danger" id="la-yes">Yes, attack</button></div></div></dialog>

    <dialog class="ldlg atk-pickdlg" id="la-dpick" aria-labelledby="la-dpick-h">
      <header><h2 id="la-dpick-h">Choose a target</h2><button type="button" class="x" data-close aria-label="Close (Esc)">×</button></header>
      <div class="body"><label class="vh" for="la-filter">Filter by name or address</label><input id="la-filter" placeholder="Filter by name or address" autocomplete="off">
        <table class="tbl atk-picks fit"><thead><tr><th data-fx="last">House</th><th data-pri="2">Address</th><th data-pri="5">Race</th><th class="num">Land</th><th class="num" data-pri="3">vs yours</th><th class="num" data-pri="4">Might</th></tr></thead><tbody id="la-picks"></tbody></table>
        <p class="note">The largest houses by land. Select a row, or press Enter on it.</p></div></dialog>
  </div>`;
  const $ = (id) => host.querySelector(`#la-${id}`);
  let target = store.target || null;

  // ---------- the target ----------
  function card() {
    const t = target, h = store.house;
    if (!t) { $('card').innerHTML = '<p class="dim">No target yet: type an address, or choose one.</p>'; return; }
    const pct = h.land ? (100 * t.land) / h.land : 0, k = P.attacks.find((x) => x.id === $('kind').value);
    const mine = t.realm === h.realm && t.state === h.state;
    const warn = [t.protected ? 'under protection: it can\'t be attacked yet' : '', t.id === h.id ? 'that\'s your own house' : '',
      k && !k.own_state && mine ? `${k.name} is for other states` : '', k?.own_state && !mine ? `${k.name} is for your own state` : '',
      k?.range_min_bp && pct < k.range_min_bp / 100 ? `${k.name} needs a target of at least ${k.range_min_bp / 100}% of your land` : ''].filter(Boolean);
    $('card').innerHTML = `<p class="atk-name">${esc(t.name)} <a href="#state" data-open-state="${t.realm}:${t.state}" class="addr">${addr(t)}</a></p>
      <dl class="atk-facts"><div><dt>Race</dt><dd>${esc(raceName(t.race))}</dd></div><div><dt>Land</dt><dd>${fmt(t.land)} <span class="dim">(${pct.toFixed(0)}% of yours)</span></dd></div><div><dt>Might</dt><dd>${fmt(t.might)}</dd></div></dl>
      ${warn.length ? `<p class="short">${esc(warn.join('; '))}.</p>` : ''}`;
  }
  async function lookUp(text) {
    try { target = await act.resolveAddress(text); setTarget(target); $('addr').value = addr(target); } catch (e) { $('card').innerHTML = `<p class="short">${esc(e.message)}</p>`; return; }
    card(); order(); intel();
  }
  on($('tf'), 'submit', (ev) => { ev.preventDefault(); lookUp($('addr').value); });
  // A complete address (realm:state:seat) looks itself up after a short pause.
  let typing = 0;
  on($('addr'), 'input', () => {
    clearTimeout(typing);
    const v = $('addr').value.trim();
    if (/^\d+[:\s.,]+\d+[:\s.,]+\d+$/.test(v) && (!target || v.replace(/[\s.,]+/g, ':') !== addr(target))) typing = setTimeout(() => lookUp(v), 450);
  });

  // What your state's spies last saw of the target's troops: the newest report that counted them.
  let intelSeq = 0;
  async function intel() {
    const box = $('intel'), t = target, seq = ++intelSeq;
    if (!t) { box.hidden = true; return; }
    let list = [];
    try { list = await reportsOn(t.id); } catch { list = []; }
    if (seq !== intelSeq) return;
    const x = (list || []).filter((r) => r.report?.units).sort((a, b) => b.at - a.at)[0];
    box.hidden = false;
    if (!x) { box.innerHTML = '<p class="dim">No report on their troops yet. Consider sending your <a href="#intrigue">spies</a> to gain more tactical information.</p>'; return; }
    const r = x.report, tr = raceOf(t.race), home = r.units || {}, away = r.away || {};
    // Their defence before bonuses: each kind's count × that race's base points (upgraded units counted at base).
    const def = tr ? (home.soldiers || 0) * tr.units[0].def + (home.offense || 0) * tr.units[1].def + (home.defense || 0) * tr.units[2].def + (home.elites || 0) * tr.units[3].def : null;
    const rows = [['Soldiers', 'soldiers', 0], ['Offense', 'offense', 1], ['Defense', 'defense', 2], ['Elites', 'elites', 3]];
    box.innerHTML = `<p class="atk-intel-h">Their troops <span class="dim">· ${esc(when(x.at))}${r.kind ? `, ${esc(REPORT_NAMES[r.kind] || r.kind)}` : ''}</span></p>
      <table class="tbl"><thead><tr><th>Kind</th><th class="num">Home</th><th class="num">Away</th></tr></thead><tbody>${rows.map(([label, k, slot]) =>
        `<tr><th scope="row">${label}${tr ? ` <span class="dim">(${esc(tr.units[slot].name)})</span>` : ''}</th><td class="num">${fmt(home[k] || 0)}</td><td class="num">${fmt(away[k] || 0)}</td></tr>`).join('')}</tbody></table>
      ${def != null ? `<p class="note">≈ ${fmt(def)} defence at home, before their bonuses; you'd bring ${fmt(order().q.off)} offense before yours.</p>` : ''}`;
  }
  // Choose from the rankings: a window with every ranked house, filtered as you type.
  function picks() {
    const f = $('filter').value.trim().toLowerCase(), h = store.house;
    const list = (store.rankings || []).filter((x) => x.id !== h.id && (!f || x.name.toLowerCase().includes(f) || addr(x).startsWith(f)));
    $('picks').innerHTML = list.map((x) => `<tr tabindex="0" data-pick="${x.id}"${x.protected ? ' class="prot"' : ''}><th scope="row">${esc(x.name)}${x.protected ? ' <span class="dim">(protected)</span>' : ''}</th><td>${addr(x)}</td><td>${esc(raceName(x.race))}</td>
      <td class="num">${fmt(x.land)}</td><td class="num">${h.land ? ((100 * x.land) / h.land).toFixed(0) : '–'}%</td><td class="num">${fmt(x.might)}</td></tr>`).join('') || '<tr><td colspan="6" class="dim">No houses match.</td></tr>';
  }
  const dpick = $('dpick');
  on($('pick'), 'click', () => { picks(); dpick.showModal(); $('filter').focus(); });
  on(dpick, 'click', (ev) => { if (ev.target === dpick || ev.target.closest('[data-close]')) dpick.close(); });
  on(dpick, 'close', () => $('pick')?.focus());
  on($('filter'), 'input', picks);
  const choose = (row) => { const x = (store.rankings || []).find((r) => String(r.id) === row.dataset.pick); if (x) { target = { ...x }; setTarget(target); $('addr').value = addr(target); dpick.close(); card(); order(); } };
  on($('picks'), 'click', (ev) => { const r = ev.target.closest('tr[data-pick]'); if (r) choose(r); });
  on($('picks'), 'keydown', (ev) => { const r = ev.target.closest('tr[data-pick]'); if (r && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); choose(r); } });

  // ---------- how ----------
  function how() {
    $('hint').textContent = attackHint($('kind').value);
    $('bld').hidden = $('bldl').hidden = !buildingChoice($('kind').value);
    if (document.activeElement !== $('gen')) { const v = $('gen').value; $('gen').innerHTML = generalOptions(v); }
    $('genl').textContent = generalLine($('gen').value);
  }
  on($('kind'), 'change', () => { how(); card(); order(); });
  on($('gen'), 'change', () => { how(); order(); });

  // ---------- the army ----------
  const units = () => { const u = Array(10).fill(0); host.querySelectorAll('input[data-u]').forEach((i) => { u[Number(i.dataset.u)] = n0(i.value); }); return u; };
  const extras = () => { const x = {}; for (const k of ['medics', 'horses', 'chariots', 'mercs', 'upmercs']) x[k] = n0(host.querySelector(`[data-xn="${k}"]`)?.value); x.double = !!$('double')?.checked; return x; };
  function order() {
    const h = store.house, u = units(), x = extras(), q = attackQuote(race, u, x);
    for (const tr of host.querySelectorAll('#la-troops tr')) {
      const i = Number(tr.dataset.slot), n = u[i];
      tr.querySelector('[data-home]').textContent = fmt(h.units[i]);
      tr.querySelector('[data-sum]').textContent = n ? fmt(n * unitPoints(race, i)[0]) : '';
      tr.classList.toggle('on', n > 0);
      tr.querySelector('input').classList.toggle('over', n > h.units[i]);
    }
    const homeOf = { medics: h.medics, horses: h.horses, chariots: h.chariots, mercs: null, upmercs: null };
    for (const tr of host.querySelectorAll('#la-extras tr[data-x]')) {
      const k = tr.dataset.x, n = x[k];
      tr.querySelector('[data-xhome]').textContent = homeOf[k] == null ? (k === 'mercs' ? `up to ${fmt(q.mercMax)}` : '') : fmt(homeOf[k]);
      tr.querySelector('[data-xsum]').textContent = !n ? '' : k === 'mercs' ? `${fmt(q.mercGold)} gold` : k === 'horses' ? fmt(n * P.horse_offense) : k === 'chariots' ? fmt(n * P.chariot_offense) : '';
      tr.classList.toggle('on', n > 0);
    }
    const over = race.units.map((un, i) => (u[i] > h.units[i] ? `you have ${fmt(h.units[i])} ${un.name} at home` : '')).filter(Boolean);
    const problems = [...over, ...q.problems, ...(target ? [] : ['choose a target'])];
    const sent = attackSlots(race).filter((i) => u[i]).map((i) => `${fmt(u[i])} ${race.units[i].name}`);
    const doing = $('doing');
    doing.hidden = !q.own;
    doing.textContent = q.own ? `You will send ${listText(sent)}${x.mercs ? ` with ${fmt(x.mercs)} hired ${merc.name}` : ''}: ${fmt(q.off)} offense${x.horses + x.chariots ? `, ${fmt(x.horses + x.chariots)} of ${fmt(q.riders)} mounted` : ''}${target ? `, against ${target.name} (${addr(target)})` : ''}.${problems.length ? ` Can't: ${problems.join('; ')}.` : ''}` : '';
    doing.classList.toggle('short', problems.length > 0);
    $('go').disabled = !q.own || problems.length > 0;
    score(u, x);
    return { u, x, q };
  }
  on(host.querySelector('.atk-tbl'), 'input', () => { ask(false); order(); });
  on(host.querySelector('.atk-tbl'), 'click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const h = store.house;
    if (b.dataset.umax) { const i = host.querySelector(`[data-u="${b.dataset.umax}"]`); i.value = h.units[Number(b.dataset.umax)] ? String(h.units[Number(b.dataset.umax)]) : ''; i.focus(); }
    if (b.dataset.ux) host.querySelector(`[data-u="${b.dataset.ux}"]`).value = '';
    if (b.dataset.xmax) { const { x, q } = order(); const [n] = extraMax(b.dataset.xmax, q, x); const i = host.querySelector(`[data-xn="${b.dataset.xmax}"]`); i.value = n ? String(n) : ''; i.focus(); }
    if (b.dataset.xx) host.querySelector(`[data-xn="${b.dataset.xx}"]`).value = '';
    ask(false); order();
  });
  on($('all'), 'click', () => { const h = store.house; host.querySelectorAll('input[data-u]').forEach((i) => { const n = h.units[Number(i.dataset.u)]; i.value = n ? String(n) : ''; }); ask(false); order(); });
  on($('clear'), 'click', () => { host.querySelectorAll('.atk-tbl input[type=number]').forEach((i) => { i.value = ''; }); if ($('double')) $('double').checked = false; ask(false); order(); });

  // ---------- the attack score: the offense, part by part ----------
  const pct = (bp) => `${bp >= 0 ? '+' : '−'}${(Math.abs(bp) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
  function score(u, x) {
    const mu = [...u]; mu[MERC] = x.mercs;
    const s = offenseParts(race, mu, x, $('gen').value, target?.race, $('kind').value);
    if (!s) { $('score').innerHTML = '<p class="dim">This game server doesn\'t send your bonuses yet.</p>'; return; }
    if (!s.plain && !s.elite && !s.mounts) { $('score').innerHTML = '<p class="dim">Choose troops to send.</p>'; return; }
    const why = (h, g, b) => [h && `your house ${pct(h)}`, g && `the general ${pct(g)}`, b && `this battle ${pct(b)}`].filter(Boolean).join(', ') || 'none';
    const row = (k, v, note = '', cls = '') => `<tr class="${cls}"><th scope="row">${k}${note ? `<small>${note}</small>` : ''}</th><td class="num">${v}</td></tr>`;
    $('score').innerHTML = `<table class="tbl atk-score"><tbody>
      ${row('Troops', fmt(s.plain), 'their attack points, mercenaries included')}
 ${s.elite ? row('Elites', fmt(s.elite)) + (s.eliteBp ? row(`Elite bonus ${pct(s.eliteBp)}`, fmt(s.eliteAfter), why(s.parts.eliteHouse, s.parts.eliteGeneral, s.parts.eliteBattle), 'calc') : '') : ''}
      ${s.mounts ? row('Mounts', fmt(s.mounts), 'horses, chariots and upgraded mercenaries') : ''}
      ${row('Before bonuses', fmt(s.sub), '', 'sum')}
      ${row(`Offense bonus ${pct(s.offBp)}`, `${s.total - s.sub >= 0 ? '+' : '−'}${fmt(Math.abs(s.total - s.sub))}`, why(s.parts.house, s.parts.general, s.parts.battle), 'calc')}
      ${row('Attack score', fmt(s.total), target ? '' : 'a target may add bonuses against its race', 'total')}
    </tbody></table>`;
  }

  // ---------- send, after a confirm ----------
  const dlg = $('confirm');
  function ask(open) {
    if (!open) { if (dlg.open) dlg.close(); return; }
    const kind = P.attacks.find((k) => k.id === $('kind').value), { u, x, q } = order();
    const g = (store.house.generals || []).find((y) => String(y.id) === $('gen').value);
    $('ask').textContent = `${kind?.name || 'Attack'} ${target.name} (${addr(target)})?`;
    $('ask-facts').innerHTML = [['Army', listText(attackSlots(race).filter((i) => u[i]).map((i) => `${fmt(u[i])} ${race.units[i].name}`))],
      ...(x.mercs ? [['Hired', `${fmt(x.mercs)} ${merc.name} for ${fmt(q.mercGold)} gold`]] : []),
      ...(x.medics || x.horses || x.chariots ? [['With them', listText([x.medics && `${fmt(x.medics)} medics`, x.horses && `${fmt(x.horses)} horses`, x.chariots && `${fmt(x.chariots)} chariots`].filter(Boolean))]] : []),
      ['Offense', `${fmt(q.off)} before bonuses`], ['Led by', g ? g.name : 'no general'], ['Takes', kind?.takes || '']]
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    dlg.showModal();
    $('no').focus();
  }
  on($('go'), 'click', () => { if (!$('go').disabled) ask(true); });
  on($('no'), 'click', () => ask(false));
  on(dlg, 'click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close(); });
  on(dlg, 'close', () => $('go')?.focus());   // the page may be gone (a window closes as you leave)
  on($('yes'), 'click', async () => {
    const { u, x } = order();
    dlg.close();
    u[MERC] = x.mercs;
    const out = await act.attack({ target, kind: $('kind').value, units: u, general: $('gen').value, medics: x.medics, horses: x.horses, chariots: x.chariots,
      upgradedMercenaries: x.upmercs, doubleStrike: x.double, building: buildingChoice($('kind').value) ? $('bld').value || null : null }, { button: $('go') });
    if (out) host.querySelectorAll('.atk-tbl input[type=number]').forEach((i) => { i.value = ''; });
    order();
  });

  // ---------- armies coming home ----------
  let shownTicks = '';
  function timeline() {
    const b = trainByTick(24), row = b.rows.find((r) => r.id === 'army') || { ticks: Array(24).fill(0), later: 0 }, key = JSON.stringify([row, store.tick]);
    if (key === shownTicks) return;
    shownTicks = key;
    const head = b.ends.map((t, k) => `<th scope="col" class="num" title="Tick ${fmt(store.tick + k + 1)}, ${esc(when(t))}">+${k + 1}</th>`).join('') + (row.later ? '<th scope="col" class="num">later</th>' : '');
    const cells = row.ticks.map((v) => `<td class="num${v ? ' on' : ''}">${v ? fmt(v) : ''}</td>`).join('') + (row.later ? `<td class="num on">${fmt(row.later)}</td>` : '');
    $('uw').innerHTML = `<div class="scrollx"><table class="tbl ticks nocards"><thead><tr><th scope="col">Ticks from now</th>${head}</tr></thead><tbody><tr><th scope="row">Troops</th>${cells}</tr></tbody></table></div>`
      + tickList([{ name: 'troops home', ticks: row.ticks, later: row.later }], b.ends, 'No armies out.');
  }

  const advisor = mountAdvisor(host.querySelector('.latk'), 'attack');
  if (target) { $('addr').value = addr(target); card(); intel(); }
  how(); order(); timeline();
  return {
    update(c) {
      if (!c || c.has('house') || c.has('rules')) { how(); card(); order(); timeline(); advisor.update(); }
      if (c?.has('reports')) intel();
      if (c?.has('target') && store.target && store.target.id !== target?.id) { target = { ...store.target }; $('addr').value = addr(target); card(); order(); intel(); }
    },
    tick() { timeline(); },
    destroy() { host.replaceChildren(); },
  };
}
