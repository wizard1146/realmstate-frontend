// Straightline's Land: how much land you hold and where it is (left), exploring for more (right), and below, land on
// its way over the next 24 ticks, as Utopia shows it. Sums and reasons from core/land.js, exact prices from
// core/prices.js, the order through core/actions.js.
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as price from '../../core/prices.js';
import { fmt, esc, dayTime, SOLDIER } from '../../core/words.js';
import { landSplit, landByTick, exploreWhy, ticks, dur } from '../../core/land.js';
import { mountAdvisor } from './advisor.js';
import { WIKI } from '../../core/wiki.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** The land bar's house, chosen in Configuration: [id, name, SVG path (20×20, even-odd)]. Longhouse by default. */
export const LAND_ICONS = [
  ['longhouse', 'Longhouse', 'M10 3 19.5 10.5h-2v8h-15v-8h-2zM8.5 18.5v-4.5h3v4.5zM4 12h2.5v2.5H4zM13.5 12H16v2.5h-2.5z'],
  ['house', 'Simple house', 'M10 1.5 19 9.2h-2.4V18.5H3.4V9.2H1zM8.2 18.5v-5.2h3.6v5.2z'],
  ['keep', 'Keep', 'M3 1.5h2.6v2h2.1v-2h4.6v2h2.1v-2H17v5h-1.3v12H4.3v-12H3zM8.4 18.5v-4a1.6 1.6 0 0 1 3.2 0v4zM9 8h2v3H9z'],
];
export const LAND_ICON_KEY = 'realmstate.line.land.icon';
export const landIcon = () => { try { const v = localStorage.getItem(LAND_ICON_KEY); return LAND_ICONS.some(([k]) => k === v) ? v : 'longhouse'; } catch { return 'longhouse'; } };
/** An icon as a CSS url() for a mask, quotes escaped for a style attribute. */
export const iconUrl = (id) => `url(&quot;data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path fill-rule='evenodd' d='${(LAND_ICONS.find(([k]) => k === id) || LAND_ICONS[0])[2]}'/></svg>`)}&quot;)`;
const pct = (n, of) => `${(100 * n / Math.max(1, of)).toFixed(1)}%`;
const TICKS = 24;

export function mountLand(host, on) {
  host.innerHTML = `<div class="lpart lland">
    <section class="ll-left"><h3 class="sub">Your land</h3>
      <div class="landbar" id="ll-bar" aria-hidden="true" style="--house:${iconUrl(landIcon())}" title="Each house is a tenth of your land: filled where built, lighter where being built"></div>
      <table class="tbl kv" id="ll-land"></table></section>
    <section class="ll-right"><h3 class="sub">Explore <a class="wiki" href="${WIKI}exploring.html" target="_blank" rel="noopener" title="How exploring works (wiki, new tab)">&#8599;<span class="vh">How exploring works: opens the wiki in a new tab</span></a></h3>
      <p class="what" id="ll-what"></p>
      <form id="ll-x" class="lform" novalidate>
        <label for="ll-n">Acres</label>
        <span class="field"><input id="ll-n" type="number" min="1" step="1" inputmode="numeric" value="10" placeholder="0"><button type="button" class="btn mini" id="ll-max" aria-label="Most acres you can explore now">MAX</button></span>
        <button class="btn primary" id="ll-go">Explore</button>
      </form>
      <p class="doing" id="ll-doing" aria-live="polite"></p>
      <p class="dim small" id="ll-info"></p></section>
    <section class="ll-wide"><h3 class="sub">Land on its way <span class="dim">the next ${TICKS} ticks; +1 arrives before the next tick</span></h3><div id="ll-uw"></div></section>
  </div>`;
  const $ = (id) => host.querySelector(`#ll-${id}`);
  const advisor = mountAdvisor(host.querySelector('.lland'), 'land');

  function land() {
    const h = store.house, s = landSplit(h);
    // Ten houses, a tenth of your land each, filled left to right: built, then being built (lighter), then barren.
    const b = s.built / Math.max(1, s.held) * 10, c = (s.built + s.building) / Math.max(1, s.held) * 10;
    const fill = (k) => `${Math.round(Math.min(1, Math.max(0, k)) * 100)}%`;
    $('bar').innerHTML = Array.from({ length: 10 }, (_, i) => `<i style="--b:${fill(b - i)};--c:${fill(c - i)}"></i>`).join('');
    const row = (k, v, cls = '', share = true) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${k}</th><td class="num">${fmt(v)}</td><td class="num dim">${share ? pct(v, s.held) : ''}</td></tr>`;
    $('land').innerHTML = row('Built', s.built) + row('Being built', s.building) + row('Barren (free to build on)', s.barren)
      + row('Held', s.held, 'sum') + row('Coming, explored', s.explored, '', false) + row('Coming, with your armies', s.withArmies, '', false)
      + row('Held and coming', s.held + s.incoming, 'sum', false)
      + (h.explorable
        ? `<tr class="gap"><th scope="row">Explorable</th><td class="num">${fmt(h.explorable.acres)}</td><td class="num dim">of ${fmt(h.explorable.cap)}</td></tr>`
        : '<tr class="gap"><th scope="row">Explorable</th><td class="num">no limit</td><td></td></tr>');
    coming();
  }

  /** Land on its way: one column a tick (+1 to +24), a row for explored land and one for land with your armies. */
  let comingKey = '';
  function coming() {
    const h = store.house, b = landByTick(TICKS, h);
    const key = JSON.stringify([b, store.tick]);
    if (key === comingKey) return;
    comingKey = key;
    const any = (a) => a.some((v) => v);
    // Nothing on its way: the same table, its cells empty (the Explored row stays, so the grid keeps its shape).
    const late = b.later.explored || b.later.armies;
    const cells = (a, extra) => a.map((v) => `<td class="num${v ? ' on' : ''}">${v ? fmt(v) : ''}</td>`).join('') + (late ? `<td class="num${extra ? ' on' : ''}">${extra ? fmt(extra) : ''}</td>` : '');
    const head = b.ends.map((t, k) => `<th scope="col" class="num" title="Tick ${fmt(store.tick + k + 1)}, ${esc(dayTime(t))}">+${k + 1}</th>`).join('') + (late ? '<th scope="col" class="num">later</th>' : '');
    const tot = b.explored.map((v, k) => v + b.armies[k]);
    $('uw').innerHTML = `<div class="scrollx"><table class="tbl ticks nocards"><thead><tr><th scope="col">Ticks from now</th>${head}</tr></thead><tbody>
      <tr><th scope="row">Explored</th>${cells(b.explored, b.later.explored)}</tr>
      ${any(b.armies) || b.later.armies ? `<tr><th scope="row">With armies</th>${cells(b.armies, b.later.armies)}</tr><tr class="sum"><th scope="row">All</th>${cells(tot, b.later.explored + b.later.armies)}</tr>` : ''}
      </tbody></table></div>`;
  }

  /** The order as a sentence, and whether it can go. */
  function explore() {
    const h = store.house, P = store.rules.params, n = n0($('n').value);
    const exact = price.have();
    $('max').disabled = !exact;
    $('what').textContent = `Exploring claims new land for your house. You pay gold now, and soldiers go out to settle it (they don't come back). `
      + `The land arrives as barren acres in ${ticks(P.explore_ticks)} (≈${dur(P.explore_ticks)}), ready to build on.`;
    let line, why = '';
    if (!n) line = 'Enter how many acres to explore.';
    else if (exact) {
      const g = price.exploreCost(n), s = price.exploreSoldiers(n);
      why = price.exploreProblem(n, h) || '';
      line = `You will explore ${fmt(n)} acre${n === 1 ? '' : 's'} for ${fmt(g)} gold${s ? ` and ${fmt(s)} soldiers` : ''}. Land then: ${fmt(h.land + h.incoming_land + n)} acres, counting what's already coming.`;
    } else line = `You will explore ${fmt(n)} acres for about ≈${fmt(act.estimate.explore(n))} gold (an estimate before your modifiers).`;
    $('doing').textContent = why ? `${line} Can't yet: ${why}.` : line;
    $('doing').classList.toggle('short', !!why);
    $('go').disabled = !n || !!why;
    const per = exact ? (h.prices.explore.soldiers_milli_per_acre || 0) / 1000 : 0;
    $('info').textContent = exact
      ? `Each acre: ${fmt(price.exploreCost(1))} gold and ${fmt(per)} soldiers (${fmt(h.units[SOLDIER])} at home). Most you can explore now: ${fmt(price.exploreMax())} acres; ${fmt(price.exploreLimit())} per order.`
        + (h.explorable ? ` Explorable acres: ${fmt(h.explorable.acres)} of ${fmt(h.explorable.cap)}, +${(h.explorable.per_tick_milli / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} a tick (fewer as you grow).` : '')
      : '';
  }

  on($('x'), 'input', explore);
  on($('max'), 'click', () => {
    const n = price.exploreMax();
    $('n').value = String(n);
    explore();
    if (!n) $('doing').textContent = `MAX is 0: ${exploreWhy()}.`;
    $('n').focus();
  });
  on($('x'), 'submit', async (ev) => {
    ev.preventDefault();
    const n = n0($('n').value);
    if (!n) return;
    // Sent: empty the box, so the old count isn't checked against what's left (MAX would turn red at once).
    if (await act.explore(n, { button: $('go'), estimate: null, quote: price.have() ? price.exploreCost(n) : null })) $('n').value = '';
    explore();
  });

  land(); explore();
  return {
    update(c) { if (!c || c.has('house') || c.has('rules')) { land(); explore(); advisor.update(); } },
    tick() { coming(); },
    destroy() { host.replaceChildren(); },
  };
}
