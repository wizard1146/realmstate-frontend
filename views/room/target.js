// The War Room's one target. A TARGET bar under the strip sets it (type realm:state:seat; a space types the colon;
// T jumps there) and says what you know of that house: its size, whether you can hit it, your state's latest intel on
// it. ATTACKS, INTRIGUE and RITES all act on it: their pane forms show it as a chip, and the detail views (where the
// bar is behind the window) carry the same field. Every field and chip shows store.target; any of them sets it.
import { store, say, setTarget } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr, when, reportKind, REPORT_LABEL } from '../../core/words.js';
import { same, st } from '../../core/relations.js';

/** A target field: an address input that sets the shared target (Enter, or leaving it), and a line naming it. */
export const targetFieldHTML = (id, label = 'TGT') => `<span class="tgt-field"><label for="${id}" title="The target house, as realm:state:seat: one target for attacks, operations and rites">${label}</label>
  <input id="${id}" class="w8" data-tgt-input placeholder="r:s:seat" autocomplete="off" spellcheck="false"><span class="tgt-name dim small" data-tgt-name></span></span>`;
/** A chip in a pane form: who the form acts on (a rite form marks it data-self for a rite on your own house). */
export const targetChipHTML = (id) => `<button type="button" class="tchip" id="${id}" data-tchip title="The target (change it in the TARGET bar, or press T)"></button>`;

/** Why you can't attack the target, as far as the page can tell ('' if nothing stands out). */
export function attackBlock(t = store.target) {
  const h = store.house;
  if (!t || !h) return '';
  if (t.id === h.id) return 'that is you';
  if (t.realm === h.realm && t.state === h.state) return 'a house of your own state';
  if (t.protected) return 'under protection';
  return '';
}
/** At war, under ceasefire, or neither, with the target's state. */
function standing(t) {
  const s = store.state, w = store.wars;
  if (!s || !w || !t) return '';
  const me = { realm: s.realm, state: s.state }, them = { realm: t.realm, state: t.state };
  if ((w.wars || []).some((x) => (same(x.a, me) && same(x.b, them)) || (same(x.b, me) && same(x.a, them)))) return '<span class="tg-war">AT WAR</span>';
  const cf = (w.ceasefires || []).find((c) => (same(c.a, me) && same(c.b, them)) || (same(c.b, me) && same(c.a, them)));
  if (cf) return `<span class="dim">ceasefire to T${fmt(cf.until_tick)}</span>`;
  return '';
}
/** Your state's latest report of each kind on the target: [kind, index in store.reports, at]. */
function intelOn(t) {
  const seen = new Map();
  (store.reports || []).forEach((x, i) => {
    const r = x.report || {}, id = r.house?.house ?? r.house?.id;
    if (id !== t.id) return;
    const k = reportKind(r);
    if (!seen.has(k)) seen.set(k, [k, i, x.at]);
  });
  return [...seen.values()];
}
/** The bar's line about the target. */
function info(t) {
  if (!t) return '<span class="dim">No target. Type an address (a space types the colon), or TGT a house in RANK. Press T to come back here.</span>';
  const row = (store.rankings || []).find((x) => x.id === t.id) || t, block = attackBlock(t);
  const facts = [row.race && esc(row.race), row.land != null && `LAND <b class="num">${fmt(row.land)}</b>`, row.might != null && `MIGHT <b class="num">${fmt(row.might)}</b>`,
    t.protected && '<span class="tg-prot">PROTECTED</span>', standing(t), block && block !== 'under protection' && `<span class="short">${esc(block)}</span>`].filter(Boolean);
  const intel = intelOn(t);
  return `<b>${esc(t.name)}</b> <span class="dim">${addr(t)} · state ${st(t)}</span> ${facts.length ? `· ${facts.join(' · ')}` : ''}
    <span class="tg-intel">${intel.length ? `INTEL ${intel.map(([k, i, at]) => `<button type="button" class="btn mini" data-tg-rep="${i}" title="Open this report">${esc(REPORT_LABEL[k] || k)} ${esc(when(at))}</button>`).join('')}` : '<span class="dim">no intel on them yet: send thieves (INTEL)</span>'}</span>`;
}

/** Fills every target field, chip and the bar inside `root` from store.target (fields being typed in are left alone). */
export function renderTarget(root) {
  const t = store.target;
  root.querySelectorAll('[data-tgt-input]').forEach((i) => { if (document.activeElement !== i) i.value = t ? addr(t) : ''; });
  root.querySelectorAll('[data-tgt-name]').forEach((n) => { n.textContent = t ? t.name : ''; });
  root.querySelectorAll('[data-tchip]').forEach((c) => {
    const self = c.dataset.self === 'true';
    c.textContent = self ? '→ YOU (self rite)' : t ? `→ ${t.name} ${addr(t)}` : '→ NO TARGET · T';
    c.classList.toggle('none', !self && !t);
    c.disabled = self;
  });
  const bar = root.querySelector('#r-tg-info');
  if (bar) bar.innerHTML = info(t);
}

/** Wires every target field and chip under `root` (the bar, and any detail view mounted later), and the T key.
 *  openReport(index): opens a report from the bar's INTEL. */
export function installTarget(root, on, { openReport = () => {}, blocked = () => false } = {}) {
  let busy = null;
  async function set(input) {
    const text = input.value.trim();
    if (!text) return;
    if (store.target && text === addr(store.target)) return;
    if (busy === text) return;
    busy = text;
    try {
      const h = await act.resolveAddress(text);
      setTarget(h);
      say(`Target: ${h.name} (${addr(h)}).`, 'good');
    } catch (e) { say(e.message, 'bad'); }
    busy = null;
  }
  on(root, 'change', (ev) => { if (ev.target.matches?.('[data-tgt-input]')) set(ev.target); });
  on(root, 'keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.matches?.('[data-tgt-input]')) { ev.preventDefault(); set(ev.target); }
  });
  on(root, 'click', (ev) => {
    const c = ev.target.closest('[data-tchip]');
    if (c) { const bar = root.querySelector('#r-tg'); bar?.focus(); bar?.select(); return; }
    const rep = ev.target.closest('[data-tg-rep]');
    if (rep) openReport(Number(rep.dataset.tgRep));
    if (ev.target.closest('#r-tg-clear')) { setTarget(null); renderTarget(root); root.querySelector('#r-tg')?.focus(); }
  });
  // T: to the bar (not while typing, or with a window open).
  on(document, 'keydown', (ev) => {
    if (ev.key.toLowerCase() !== 't' || ev.ctrlKey || ev.metaKey || ev.altKey || blocked()) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const bar = root.querySelector('#r-tg');
    if (!bar) return;
    ev.preventDefault();
    bar.focus(); bar.select();
  });
}
