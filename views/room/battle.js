// Attack report cards for the news: your own attacks (`attack_report`, won or lost) and attacks
// on you (`attacked`). Compact in the NEWS pane, in full in its detail view.
import { fmt, esc, addr, names, when, dayTime, spoilParts, UNIT_ORDER } from '../../core/words.js';

/** The enemy's losses by slot meaning (their race is hidden). */
const ROLES = ['soldiers', 'offense', 'defense', 'elites', 'thieves', 'offense+', 'defense+', 'elites+', 'mercenaries', 'elites++'];
export const isBattle = (n) => n && (n.type === 'attack_report' || n.type === 'attacked');
const total = (a) => (a || []).reduce((x, y) => x + y, 0);
/** "12 Footmen, 3 Knights" in reading order, or 'none'. */
function losses(arr, ours) {
  const p = [...UNIT_ORDER, 8].filter((i) => arr?.[i]).map((i) => `${fmt(arr[i])} ${ours ? names.units[i] || ROLES[i] : ROLES[i]}`);
  return p.join(', ') || 'none';
}
/** "23 soldiers", or "40: 23 soldiers, 17 defense" when more than one kind fell. */
function lossCell(arr, ours) {
  const n = total(arr);
  if (!n) return '<span class="num">0</span>';
  const kinds = (arr || []).filter(Boolean).length;
  return kinds > 1 ? `<span class="num">${fmt(n)}</span>: ${esc(losses(arr, ours))}` : esc(losses(arr, ours));
}
const pct = (bp) => `${+(bp / 100).toFixed(1)}%`;

/** The verdict word and tone: WIN / REPULSED for our attacks, LOST / HELD for attacks on us. */
export function verdict(n) {
  if (n.type === 'attack_report') return n.success ? ['WIN', 'good'] : ['REPULSED', 'bad'];
  return n.success ? ['LOST', 'bad'] : ['HELD', 'good'];
}

/** The card's HTML. full: every line (detail view); otherwise a two-line summary (pane). */
export function battleCard(n, full) {
  const mine = n.type === 'attack_report';
  const [word, tone] = verdict(n);
  const kind = names.attacks[n.kind] || n.kind || 'Attack';
  const other = mine ? n.target : n.by;
  const who = other ? `${esc(other.name)} <span class="num dim">${esc(addr(other))}</span>` : '<span class="dim">a veiled army</span>';
  const head = `<span class="bc-verdict bc-${tone}">${word}</span> <span class="bc-kind">${esc(kind)}</span> ${mine ? '→' : '← from'} ${who}`;
  const land = mine ? n.land : n.land_lost;
  const sp = spoilParts(n.spoils);
  const ourLoss = total(n.troops_lost), theirLoss = total(n.enemy_lost);
  const notes = [];
  if (mine && n.protection_bp < 10000) notes.push(`hit often lately: ${pct(n.protection_bp)} of usual gains`);
  if (mine && n.size_bp < 10000) notes.push(`smaller house: ${pct(n.size_bp)} of usual gains`);
  if (!full) {
    const bits = [];
    if (land) bits.push(`${mine ? '+' : '−'}${fmt(land)} acres`);
    if (sp.length) bits.push(`${mine ? 'took' : 'lost'} ${sp.join(', ')}`);
    bits.push(`we lost ${fmt(ourLoss)}`);
    if (mine) bits.push(`they lost ${fmt(theirLoss)}`);
    if (mine && n.returns_at) bits.push(`home ${dayTime(n.returns_at)}`);
    if (notes.length) bits.push(notes.join('; '));
    return `<div class="bcard bc-${tone}" data-battle="${n.at || ''}"><div class="bc-h">${head}</div><div class="bc-s">${esc(bits.join(' · '))}</div></div>`;
  }
  const rows = [];
  const row = (k, v, cls = '') => rows.push(`<div><dt>${esc(k)}</dt><dd class="${cls}">${v}</dd></div>`);
  if (mine) row('Offense sent', `<span class="num">${fmt(n.offense)}</span>`);
  row(mine ? 'Land taken' : 'Land lost', `<span class="num">${fmt(land || 0)}</span> acres`, land ? (mine ? 'up' : 'down') : 'zero');
  row(mine ? 'Spoils' : 'Taken from us', esc(sp.join(', ') || 'none'), sp.length ? '' : 'zero');
  row('Our losses', lossCell(n.troops_lost, true), ourLoss ? 'down' : 'zero');
  if (mine) row('Their losses', lossCell(n.enemy_lost, false), theirLoss ? 'up' : 'zero');
  if (mine) row('Saved by medics', `<span class="num">${fmt(n.saved || 0)}</span>`, n.saved ? 'up' : 'zero');
  if (mine) row('Renown', `<span class="num">${n.renown ? `+${fmt(n.renown)}` : '0'}</span>`, n.renown ? 'up' : 'zero');
  if (mine) row('General', n.general_killed ? 'fell in battle' : 'unharmed', n.general_killed ? 'down' : 'zero');
  if (mine && n.returns_at) row('Army home', `${esc(when(n.returns_at))}${n.returns_at > Date.now() ? '' : ' <span class="dim">(home)</span>'}`);
  if (notes.length) row('Gains cut', esc(notes.join('; ')), 'note');
  return `<div class="bcard full bc-${tone}" data-battle="${n.at || ''}"><div class="bc-h">${head}</div><dl class="bc-dl">${rows.join('')}</dl></div>`;
}
