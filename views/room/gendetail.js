// MIL detail › GENERALS: every general with its traits (spelled out), record and whereabouts; the
// main-general switch; LIST (opens the Hall tab with it chosen) and HEIR; the raise form with its
// exact cost; and the heirs list.
import { nameRoll } from '../../core/names.js';
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, when } from '../../core/words.js';
import { pctBp } from './does.js';
import * as G from './generals.js';
import { heirsHTML, heirsWire, heirsUpdate, heirButton, wireHeirButtons } from './heirs.js';
import { waverHTML } from './waver.js';


const has = (c, ...k) => !c || k.some((x) => c.has(x));

export function generalsDetail(b, on) {
  const p = store.rules.params;
  b.innerHTML = `<div class="dgrid">
    <section class="wide"><h3 class="sub">GENERALS <span class="dim" id="d-gn-line"></span></h3><div id="d-gn-waver"></div><div id="d-gn-list"></div>
      <p class="dim small">The main general (DEF) commands the home defense; one sent with an army stops commanding it. A general that just changed house is settling in for ${fmt(p.settling_ticks)} ticks (${pctBp(p.settling_penalty_bp)} offense and defense). A failed attack kills its general ${fmt(p.general_death_bp / 100)}% of the time.</p></section>
    <section class="wide"><h3 class="sub">RAISE A GENERAL <span class="dim">retire ${fmt(p.general_elites)} elites, pay ${fmt(p.general_cost)} ${esc(p.general_material)} per trait</span></h3>
      <form id="d-gn-form" class="dform">
        <label for="d-gn-name">Name</label><span class="field"><input id="d-gn-name" class="w-name" maxlength="40" placeholder="name" autocomplete="off" required><button type="button" class="btn mini" id="d-gn-roll" title="Suggest another name" aria-label="Suggest another name">&#8635;</button></span>
        <span class="lbl" id="d-gn-tl">Traits</span><fieldset class="ac-attrs" id="d-gn-traits" aria-labelledby="d-gn-tl"><legend class="vh">Traits</legend>${G.traits().map((t) => `<label class="check"><input type="checkbox" value="${esc(t.trait)}"> ${esc(t.name)} <span class="dim small">${esc(G.traitDoes(t.trait))}</span></label>`).join('')}</fieldset>
        <span></span><button class="btn primary">RAISE</button>
        <p class="span small" id="d-gn-q" aria-live="polite"></p>
      </form>
    </section>
    ${heirsHTML()}
  </div>`;
  const $ = (id) => b.querySelector(`#d-gn-${id}`);
  const boxes = () => [...b.querySelectorAll('#d-gn-traits input')];
  const genName = nameRoll($('name'), $('roll'), 'general');

  function quote() {
    const pick = G.mayPick(), slots = G.traitSlots();
    const chosen = boxes().filter((x) => x.checked);
    boxes().forEach((x) => { x.disabled = !pick || (!x.checked && chosen.length >= slots.total); });
    const n = pick && chosen.length ? chosen.length : slots.total;
    const q = G.recruitQuote(n);
    const cost = `${fmt(q.elites)} elites + ${q.exact ? '' : '≈'}${fmt(q.amount)} ${q.material}`;
    const traitsPart = pick
      ? (chosen.length ? `${chosen.length} chosen trait${chosen.length === 1 ? '' : 's'}` : `no traits ticked, so ${slots.total} drawn at random`)
      : `${slots.total} random trait${slots.total === 1 ? '' : 's'} (choosing needs ${fmt(p.general_pick_renown)} renown; you have ${fmt(store.house.renown)})`;
    $('q').className = `span small${q.why ? ' short' : ''}`;
    $('q').textContent = `Costs ${cost} for ${traitsPart}. You hold ${fmt(store.house.units[3])} elites at home and ${fmt(q.held)} ${q.material}. `
      + `Trait slots: ${slots.total} (${slots.parts.join(', ')})${slots.next != null ? `; another at ${fmt(slots.next)} renown` : ''}.`
      + `${q.exact ? '' : ` ≈: ${q.touched.name} lowers the cost by an amount the server doesn't send; the result line shows the real one.`}${q.why ? ` Can't: ${q.why}.` : ''}`;
  }

  function list() {
    const h = store.house;
    $('waver').innerHTML = waverHTML('general');
    $('line').textContent = `${fmt(h.generals.length)} of ${fmt(p.general_max)} · main general: ${h.generals.find((g) => g.id === h.defender)?.name || 'none'}`;
    if (!h.generals.length) {
      $('list').innerHTML = `<p class="dim">No generals. Raise one below by retiring ${fmt(p.general_elites)} elites and paying ${esc(p.general_material)}; elites in training sometimes produce one from the ranks; the Hall of Deeds trades them.</p>`;
      return;
    }
    const focus = b.contains(document.activeElement) && document.activeElement.id;
    $('list').innerHTML = `<div class="scrollx"><table class="tbl wide-tbl"><tr><th>NAME</th><th>WHERE</th><th></th><th>TRAITS AND WHAT THEY DO</th><th class="num">LED</th><th class="num">W/L</th><th class="num">LAND</th><th class="num">RENOWN</th><th class="num"><abbr title="Defenses held / fought as main general">HELD</abbr></th><th class="num"><abbr title="Times it changed hands">SOLD</abbr></th></tr>${h.generals.map((g) => {
      const r = g.record || {}, s = G.settlingUntil(g), l = G.listingOf('general', g.id);
      const isDef = h.defender === g.id;
      const where = g.away ? 'away with an army' : l ? 'on the market' : isDef ? 'home · main general' : 'home';
      const btns = [
        isDef ? `<button type="button" class="btn mini" id="d-gn-def-${g.id}" data-undefend aria-label="Stop ${esc(g.name)} commanding the defense">UNSET DEF</button>`
          : `<button type="button" class="btn mini" id="d-gn-def-${g.id}" data-defend="${g.id}" aria-label="Make ${esc(g.name)} main general"${g.away || l ? ' disabled' : ''}>DEF</button>`,
        `<button type="button" class="btn mini" id="d-gn-sell-${g.id}" data-sell="${g.id}" aria-label="${l ? 'See the listing of' : 'List'} ${esc(g.name)} in the Hall of Deeds"${!l && (g.away || isDef || G.cooldownUntil(g)) ? ` disabled title="${g.away ? 'Away with an army' : isDef ? 'The main general can\'t be sold; name another first' : `Changed hands too recently; free ${esc(when(G.cooldownUntil(g)))}`}"` : ''}>${l ? 'LISTED' : 'LIST'}</button>`,
        heirButton('general', g.id, g.name, 'd-gn'),
      ].join('');
      return `<tr class="${isDef ? 'self' : ''}"><td class="name">${isDef ? '<span class="flag l" title="Main general">DEF</span> ' : ''}${esc(g.name)}<br><span class="dim small">${esc(r.uid || '')}${r.raised_age ? ` · raised age ${r.raised_age}` : ''}</span></td>`
        + `<td class="small">${where}${s ? `<br><span class="short">settling in until ${esc(when(s))}</span>` : ''}</td><td class="nowrap">${btns}</td>`
        + `<td class="small wrap">${(g.traits || []).map((t) => `<b>${esc(G.traitName(t))}</b> <span class="dim">${esc(G.traitDoes(t))}</span>`).join('<br>') || '<span class="dim">none</span>'}</td>`
        + `<td class="num">${fmt(r.attacks_led || 0)}</td><td class="num">${fmt(r.wins || 0)}/${fmt(r.losses || 0)}</td><td class="num">${fmt(r.land_taken || 0)}</td><td class="num">${fmt(r.renown_earned || 0)}</td>`
        + `<td class="num">${fmt(r.defenses_held || 0)}/${fmt(r.defenses || 0)}</td><td class="num${r.transfers ? '' : ' zero'}" title="${r.transfers ? `Highest ${fmt(r.transfer_fee_highest)}, average ${fmt(r.transfer_fee_average)}` : ''}">${fmt(r.transfers || 0)}</td></tr>`;
    }).join('')}</table></div>`;
    if (focus) b.querySelector(`#${CSS.escape(focus)}`)?.focus();
  }

  on($('form'), 'input', quote);
  on($('form'), 'submit', async (ev) => {
    ev.preventDefault();
    const traits = G.mayPick() ? boxes().filter((x) => x.checked).map((x) => x.value) : [];
    const out = await act.recruitGeneral($('name').value, traits, { button: ev.submitter });
    if (out) { $('name').value = ''; boxes().forEach((x) => { x.checked = false; }); quote(); genName.refresh(); }
  });
  on(b, 'click', (ev) => {
    const d = ev.target.closest('[data-defend]');
    if (d) return act.setDefender(d.dataset.defend, { button: d });
    const u = ev.target.closest('[data-undefend]');
    if (u) return act.setDefender(null, { button: u });
    const s = ev.target.closest('[data-sell]');
    if (s) { G.sellPick.set({ kind: 'general', id: Number(s.dataset.sell) }); G.MIL_TAB.set('hall'); }
  });
  wireHeirButtons(b, on);
  heirsWire(b, on);

  function update(c) {
    if (!store.house) return;
    if (has(c, 'house', 'hall', 'heirs', 'age')) list();
    if (has(c, 'house', 'colloquium')) quote();
    if (has(c, 'house', 'heirs')) heirsUpdate(b);
  }
  return { update };
}
