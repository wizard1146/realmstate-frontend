// Straightline's Throne: your house at a glance, in small tables that flow into one, two or three columns as the
// page widens (line.css). Your house; the core figures; your people; your land; what you hold. Protection, while
// it lasts, is a line at the foot of the page. Read straight from the store (/me, /state); nothing is worked out
// here that the server sends.
import { store, raceOf, raceName, persName, isProtected, slotUsed, unitPoints } from '../../core/store.js';
import { fmt, esc, UNIT_ORDER, THIEF, SOLDIER, MERC, baseOf, isUpgrade } from '../../core/words.js';
import { landSplit } from '../../core/land.js';
import * as pend from '../../core/pending.js';
import { WIKI } from '../../core/wiki.js';

/** Configuration's "upgraded units on their own rows" (off: each folds into its base unit, marked *). */
export const UPGRADES_KEY = 'realmstate.line.throne.upgrades';
/** Configuration's faint throne picture behind the page (on unless turned off). */
export const GLYPH_KEY = 'realmstate.line.throne.glyph';
export const throneGlyph = () => { try { return JSON.parse(localStorage.getItem(GLYPH_KEY)) !== false; } catch { return true; } };
export const upgradeRows = () => { try { return JSON.parse(localStorage.getItem(UPGRADES_KEY)) === true; } catch { return false; } };
/** A count with room after it for the * that marks upgraded units folded in, so columns stay put either way. */
const counted = (n, upgraded = 0) => `${fmt(n)}<span class="ast"${upgraded ? ` title="includes ${fmt(upgraded)} upgraded"` : ''}>${upgraded ? '*' : ''}</span>`;
/** A link to a wiki page, in a new tab. */
const wikiLink = (page, text) => `<a href="${WIKI}${encodeURI(page)}" target="_blank" rel="noopener" title="Open in the wiki (new tab)">${esc(text)}<span class="ext" aria-hidden="true">&#8599;</span><span class="vh"> (opens the wiki in a new tab)</span></a>`;
const pct = (n, of) => `${Math.round(100 * n / Math.max(1, of))}%`;
/** A ratio to two places: 0.85, 1.2, 0. */
const per = (n, of) => (of ? (n / of).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0');
/** Cells that line up from row to row: values in fixed columns, split by a bar ("607 acres | #104 of 150"). */
const cols = (...vs) => `<span class="cols c${vs.length}">${vs.map((v) => `<span>${typeof v === 'number' ? fmt(v) : v}</span>`).join('<span class="pipe" aria-hidden="true">|</span>')}</span>`;
/** A table: rows of [label, value, class]. Values that are numbers are formatted; strings are HTML. */
const table = (title, rows, note = '') => `<section class="tcard"><h3 class="sub">${esc(title)}</h3><table class="tbl kv">${rows.map(([k, v, cls = '']) =>
  `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${cls === 'colhead' ? k : esc(k)}</th><td class="num">${typeof v === 'number' ? fmt(v) : v}</td></tr>`).join('')}</table>${note}</section>`;

/** On a narrow page the unit columns show one figure at a time: 0 count, 1 offense, 2 defense (line.css hides the rest). */
const METRICS = ['Count', 'Offense', 'Defense'];
let metric = 0;

export function mountThrone(host, on) {
  host.innerHTML = `<div class="throne${throneGlyph() ? ' glyph' : ''}"><div class="tgrid"></div><p class="tprot" hidden></p></div>`;
  const grid = host.querySelector('.tgrid'), prot = host.querySelector('.tprot');

  function render() {
    const h = store.house, race = raceOf(h?.race);
    if (!h || !race) return;
    const st = store.state && store.state.realm === h.realm && store.state.state === h.state ? store.state : null;

    // Your house: who you are and where.
    const house = table('Your house', [
      ['House', esc(h.name)],
      ['State', `<a href="#state">${st?.name ? esc(st.name) : `State ${h.realm}:${h.state}`}</a>`],
      ['Realm', `<a href="#world" data-home-realm>${st?.realm_name ? esc(st.realm_name) : `Realm ${h.realm}`}</a>`],
      // Race and personality open their wiki pages in a new tab (this page stays put).
      ['Race', wikiLink(`race-${h.race}.html`, raceName(h.race))],
      ['Personality', wikiLink(`personality-${h.personality}.html`, persName(h.personality))],
    ]);

    // Standing: each figure, and where it puts you among every house this age (from /me's ranks).
    const r = store.me?.ranks;
    const place = (n) => (r ? `<a href="#ranks" title="Open Rankings">#${fmt(n)} of ${fmt(r.houses)}</a>` : '–');
    const core = table('Standing', [
      ['Land', cols(`${fmt(h.land)} acres`, place(r?.land_rank))],
      ['Might', cols(h.might, place(r?.might_rank))],
      ['Renown', cols(h.renown, place(r?.renown_rank))],
    ]);

    // People: everyone in the house, the troops unit by unit (home, away and training together).
    const training = new Map();
    for (const x of pend.list(['train'])) training.set(x.slot, (training.get(x.slot) || 0) + x.count);
    const all = (i) => (h.units[i] || 0) + (h.away[i] || 0) + (training.get(i) || 0);
    const troops = UNIT_ORDER.filter((i) => i !== THIEF && slotUsed(race, i));
    const military = troops.reduce((a, i) => a + all(i), 0) + all(MERC);
    const thieves = all(THIEF);
    const underArms = military + thieves;
    // Each unit: how many, and the offense and defense they bring (points before modifiers). Upgraded units get rows
    // of their own, or (the default) fold into their base unit, the count marked *.
    const pts = (i) => unitPoints(race, i);
    const used = [...troops, ...(all(MERC) ? [MERC] : [])];
    const groups = upgradeRows()
      ? used.filter((i) => i === SOLDIER || all(i) || i <= 4 || i === MERC).map((i) => [i, [i]])
      : used.filter((i) => !isUpgrade(i)).map((b) => [b, used.filter((i) => i === b || (isUpgrade(i) && baseOf(i) === b))]);
    const sum = (slots, f) => slots.reduce((a, i) => a + f(i), 0);
    const off = sum(used, (i) => all(i) * pts(i)[0]), def = sum(used, (i) => all(i) * pts(i)[1]);
    const medics = (h.medics || 0) + (h.medics_away || 0), adepts = h.adepts || 0;
    const people = table('People', [
      ['Population', `${fmt(h.population)} of ${fmt(h.max_population)} <span class="dim">(${pct(h.population, h.max_population)})</span>`],
      ['Peasants', `${fmt(h.peasants)} <span class="dim">(${pct(h.peasants, h.population)})</span>`],
      ['', `<span class="mswitch"><button type="button" data-metric="-1" aria-label="Show ${METRICS[(metric + 2) % 3].toLowerCase()}">‹</button><span aria-live="polite">${METRICS[metric]}</span><button type="button" data-metric="1" aria-label="Show ${METRICS[(metric + 1) % 3].toLowerCase()}">›</button></span>`
        + cols(`<abbr title="How many">Count</abbr><span class="ast"></span>`, '<abbr title="Offense points, before modifiers">Off</abbr>', '<abbr title="Defense points, before modifiers">Def</abbr>'), 'colhead'],
      ['Military', cols(counted(military), off, def), 'total'],
      ...groups.map(([b, slots]) => [race.units[b]?.name || `Slot ${b}`,
        cols(counted(sum(slots, all), sum(slots.filter((i) => i !== b), all)), sum(slots, (i) => all(i) * pts(i)[0]), sum(slots, (i) => all(i) * pts(i)[1])), 'unit']),
      ['Thieves', `${fmt(thieves)} <span class="dim">(<abbr title="thieves per acre">${per(thieves, h.land)} tpa</abbr>)</span>`],
      ['Medics', `${fmt(medics)} <span class="dim">(<abbr title="medics per troop">${per(medics, military)} mpt</abbr>)</span>`],
      ['Adepts', `${fmt(adepts)} <span class="dim">(<abbr title="adepts per acre">${per(adepts, h.land)} apa</abbr>)</span>`],
      ['Under arms', `${fmt(underArms)} <span class="dim">(${pct(underArms, h.population)} · draft rate ${h.draft_bp / 100}%)</span>`, 'sum'],
      ['Not peasants', `${fmt(h.population - h.peasants)} <span class="dim">(${pct(h.population - h.peasants, h.population)})</span>`, 'sum'],
    ]);

    const s = landSplit(h);
    const infra = table('Land', [
      ['Land', s.held], ['Built', s.built], ['Being built', s.building], ['Arriving', s.incoming], ['Barren', s.barren],
      ['Explorable', h.explorable ? `${fmt(h.explorable.acres)} <span class="dim">of ${fmt(h.explorable.cap)}</span>` : 'no limit'],
      ['Building efficiency', `${(h.efficiency_bp / 100).toFixed(1)}%`],
      ['Jobs', h.jobs ?? '–'],
      ['Employment', h.employment_bp == null ? '–' : `${h.employment_bp / 100}%`],
    ]);

    const books = (h.science?.books || []).reduce((a, n) => a + n, 0);
    const res = table('Resources', [['Gold', h.gold], ['Food', h.food], ['Books', books], ['Horses', h.horses || 0], ['Chariots', h.chariots || 0]]);
    // Every material, held or not.
    const mats = table('Materials', Object.entries(h.materials || {}).map(([m, q]) => [m[0].toUpperCase() + m.slice(1), q]));
    const spirit = table('Spirit', [['Nerve', `${h.nerve_bp / 100}%`], ['Aether', h.aether || 0]]);

    grid.innerHTML = house + core + people + infra + res + mats + spirit;
    grid.dataset.metric = metric;
    prot.hidden = !isProtected(h);
    if (isProtected(h)) prot.textContent = `Under Protection (ticks remaining: ${fmt(h.protected_until - h.ticks_now)})`;
  }
  // Narrow page: ‹ › step through count, offense and defense.
  on?.(grid, 'click', (ev) => {
    const b = ev.target.closest('[data-metric]');
    if (!b) return;
    metric = (metric + Number(b.dataset.metric) + 3) % 3;
    render();
    grid.querySelector(`[data-metric="${b.dataset.metric}"]`)?.focus();
  });
  render();
  return {
    update(c) { if (!c || c.has('house') || c.has('me') || c.has('rules') || c.has('state')) render(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
