// The MIL pane's GENERALS and HALL OF DEEDS tabs (compact). The detail view (gendetail.js,
// hall.js) holds the forms; the pane shows the state of things and a quick main-general switch.
import { store } from '../../core/store.js';
import { fmt, esc, when } from '../../core/words.js';
import * as G from './generals.js';
import { waverHTML } from './waver.js';

const where = (g, h) => (g.away ? 'away' : G.listingOf('general', g.id) ? 'market' : h.defender === g.id ? 'defending' : 'home');

export function generalsPaneHTML() {
  const h = store.house, p = store.rules.params;
  if (!h) return '';
  const q = G.recruitQuote(G.traitSlots().total);
  const hs = G.heirSlots();
  const rows = h.generals.map((g) => {
    const s = G.settlingUntil(g);
    const r = g.record || {};
    return `<tr class="${h.defender === g.id ? 'self' : ''}"><td class="name">${h.defender === g.id ? '<span class="flag l" title="Main general: commands the home defense">DEF</span> ' : ''}${esc(g.name)}</td>`
      + `<td class="small" title="${esc(G.traitsText(g.traits))}">${esc((g.traits || []).map(G.traitName).join(', ') || '·')}</td>`
      + `<td class="num" title="Wins / losses leading attacks">${fmt(r.wins || 0)}/${fmt(r.losses || 0)}</td>`
      + `<td class="small">${where(g, h)}${s ? ' <span class="dim">settling</span>' : ''}</td>`
      + `<td>${h.defender === g.id || g.away || G.listingOf('general', g.id) ? '' : `<button type="button" class="btn mini" data-defend="${g.id}" aria-label="Make ${esc(g.name)} main general">DEF</button>`}</td></tr>`;
  }).join('');
  return `${waverHTML('general')}<table class="tbl"><tr><th>GENERAL</th><th>TRAITS</th><th class="num">W/L</th><th>WHERE</th><th></th></tr>${rows || '<tr><td colspan="5" class="dim">No generals yet.</td></tr>'}</table>
    <p class="small sci-line dim">${fmt(h.generals.length)} of ${fmt(p.general_max)} · next costs ${fmt(q.elites)} elites + ${q.exact ? '' : '≈'}${fmt(q.amount)} ${esc(q.material)} (${G.mayPick() ? 'traits chosen' : 'random traits'})${q.why ? ` · <span class="short">${esc(q.why)}</span>` : ''}</p>
    <p class="small sci-line dim">Heirs: ${hs.now} slot${hs.now === 1 ? '' : 's'} now, ${hs.ifWon} if your state wins · Shift+Alt+3 to raise, trade and mark heirs.</p>`;
}

export function hallPaneHTML() {
  const hall = store.hall, h = store.house;
  if (!hall || !h) return '<p class="dim">Loading the Hall of Deeds…</p>';
  const mine = (l) => l.character?.house?.house === h.id;
  const rows = hall.listings.slice(0, 12).map((l) => {
    const c = l.character || {}, a = l.auction;
    return `<tr class="${mine(l) ? 'self' : ''}"><td class="name">${esc(c.name || '?')} <span class="dim small">${c.kind === 'academic' ? 'acad.' : 'gen.'}</span></td><td class="small">${esc((c.traits || c.attributes || []).join(', ') || '·')}</td>`
      + `<td class="num">${a ? fmt(a.best ?? a.reserve) : '<span class="dim">offers</span>'}</td><td class="small dim">${a ? esc(when(a.ends_at)) : ''}</td></tr>`;
  }).join('');
  const rec = store.offers?.received?.length || 0, made = store.offers?.made?.length || 0;
  return `<table class="tbl"><tr><th>CHARACTER</th><th>TRAITS</th><th class="num"><abbr title="Top bid, or the reserve">PRICE</abbr></th><th>ENDS</th></tr>${rows || '<tr><td colspan="4" class="dim">Nobody is on the market.</td></tr>'}</table>
    <p class="small sci-line dim">${fmt(hall.listings.length)} listed · offers: ${rec ? `<b class="up">${fmt(rec)} for yours</b>` : '0 for yours'}, ${fmt(made)} made · fee ${hall.fee_bp / 100}% to the seller's state · out-of-realm buyers pay +${hall.out_of_realm_bp / 100}%</p>`;
}

