// Science: books, scientists, sciences, academics and the state's Colloquium. This module holds the
// shared maths and the compact SCI pane; scidetail.js draws the detail view.
// Exact figures come from /me house.science, /rules and /colloquium. Previews of a new investment use
// the engine's formula (bonus = per_root × isqrt(invested) / 100, then science efficiency); the
// efficiency is read back from your current bonuses, so a preview is exact once any science has books.
import { store } from '../../core/store.js';
import { fmt, esc } from '../../core/words.js';
import { lastDelta } from './trend.js';
import { tabState } from './tabs.js';
import { waverHTML } from './waver.js';
import { truthsPaneHTML } from './truthsui.js';


export { CATS, CAT_SHORT, sci, defs, statLabel, statLong, isqrt, rawBp, efficiency, bonusAt, rowOf, catOf, effText, ranks, rankName } from '../../core/science.js';
import { CATS, CAT_SHORT, sci, defs, effText, rankName } from '../../core/science.js';

// ---------- the compact pane: SCIENCE, ACADEMICS, COLLOQUIUM tabs ----------
export const SCI_TAB = tabState('realmstate.room.sci', ['science', 'academics', 'colloquium', 'truths'], { science: 'SCIENCE', academics: 'ACADEMICS', colloquium: 'COLLOQUIUM', truths: 'TRUTHS' });
const attrName = (id) => store.rules.attributes?.find((a) => a.attribute === id)?.name || id;

export function paneHTML(tab = SCI_TAB.get()) {
  const s = sci();
  if (!s) return '<p class="dim">No science data from the server.</p>';
  if (tab === 'academics') return paneAcademics(s);
  if (tab === 'colloquium') return paneColloquium(s);
  if (tab === 'truths') return truthsPaneHTML();
  const per = lastDelta('books');
  const on = s.sciences.map((r) => [defs().find((d) => d.science === r.science), r]).filter(([d, r]) => d && r.invested);
  return `<table class="tbl"><tr><th>CAT</th><th class="num">BOOKS</th><th class="num">SCI</th><th>RANK</th><th class="num">/TICK</th></tr>${CATS.map((k, i) =>
    `<tr><td>${CAT_SHORT[k]}${s.focus === k ? ' <span class="dim small">focus</span>' : ''}</td><td class="num">${fmt(s.books[i])}</td><td class="num">${fmt(s.scientists[i])}</td><td class="small">${s.ranks?.[i] ? rankName(s.ranks[i].rank) : '·'}</td><td class="num">${s.ranks?.[i] ? `+${fmt(s.ranks[i].books_next_tick)}` : '·'}</td></tr>`).join('')}</table>
    <p class="small sci-line">${per != null ? `<span class="num ${per > 0 ? 'up' : ''}">+${fmt(per)}</span> books last tick · ` : ''}paper ${fmt(s.paper_budget)}/tick · ${fmt(s.books_invested)} invested</p>
    <p class="small sci-line">${on.length ? on.map(([d, r]) => `${esc(d.name)} ${esc(effText(d.effects.map((e, j) => ({ stat: e.stat, bp: r.bonus_bp[j] || 0 }))))}`).join(' · ') : '<span class="dim">No sciences yet: invest books from the detail view.</span>'}</p>`;
}
function paneAcademics(s) {
  const P = store.rules.params;
  const rows = s.academics.map((a) => `<tr><td class="name">${esc(a.name)}</td><td class="small">${esc(a.attributes.map(attrName).join(', ') || 'none')}</td><td class="num">${fmt(a.record?.books_supervised || 0)}</td></tr>`).join('');
  return `${waverHTML('academic')}<table class="tbl"><tr><th>ACADEMIC</th><th>ATTRIBUTES</th><th class="num"><abbr title="Books your scientists wrote while it served">SUPERV.</abbr></th></tr>${rows || `<tr><td colspan="3" class="dim">${s.academic_cap ? 'None yet: recruit one in the detail view.' : `None: one per ${fmt(P.academic_universities)} ${esc(P.academic_building)}.`}</td></tr>`}</table>
    <p class="small sci-line dim">${fmt(s.academics.length)} of ${fmt(s.academic_cap)} kept · ${s.attribute_slots} attribute slot${s.attribute_slots === 1 ? '' : 's'} · ${fmt(P.academic_books)} books + ${fmt(P.academic_material_cost)} ${esc(P.academic_material)} per attribute</p>`;
}
function paneColloquium() {
  const c = store.colloquium;
  if (!c) return '<p class="dim">Loading the Colloquium…</p>';
  const rows = c.projects.filter((p) => p.open).map((p) => `<tr class="${p.project === c.active ? 'self' : ''}"><td class="name">${esc(p.name)}${p.project === c.active ? ' <span class="dim small">active</span>' : ''}</td><td class="num">${p.tier}/${p.tiers.length}</td><td class="num">${fmt(p.knowledge)}</td><td class="num${p.decay_bp_next_tick ? ' down' : ' zero'}">${(p.decay_bp_next_tick / 100).toFixed(2)}%</td></tr>`).join('');
  return `<table class="tbl"><tr><th>PROJECT</th><th class="num">TIER</th><th class="num">KNOWL.</th><th class="num"><abbr title="Knowledge lost next tick">DECAY</abbr></th></tr>${rows}</table>
    <p class="small sci-line dim">${c.active ? '' : 'No project chosen. '}${c.i_lead ? 'You lead: choose the project in the detail view.' : 'The state leader chooses the project.'} Give books there for renown.</p>`;
}
