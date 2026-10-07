// Straightline's Land: how much land you hold and where it is (left), exploring for more (right), and below, land on
// its way over the next 24 ticks, as Utopia shows it. Sums and reasons from core/land.js, exact prices from
// core/prices.js, the order through core/actions.js.
import { store } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as price from '../../core/prices.js';
import { fmt, esc, dayTime, SOLDIER } from '../../core/words.js';
import { landSplit, landByTick, exploreWhy, ticks, dur } from '../../core/land.js';

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const pct = (n, of) => `${(100 * n / Math.max(1, of)).toFixed(1)}%`;
const TICKS = 24;

export function mountLand(host, on) {
  host.innerHTML = `<div class="lpart lland">
    <section class="ll-left"><h3 class="sub">Your land</h3>
      <div class="landbar" id="ll-bar" aria-hidden="true"></div>
      <table class="tbl kv" id="ll-land"></table></section>
    <section class="ll-right"><h3 class="sub">Explore</h3>
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

  function land() {
    const h = store.house, s = landSplit(h);
    $('bar').innerHTML = `<span class="built" style="width:${pct(s.built, s.held)}"></span><span class="cons" style="width:${pct(s.building, s.held)}"></span>`;
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
    if (!any(b.explored) && !any(b.armies) && !b.later.explored && !b.later.armies) { $('uw').innerHTML = '<p class="dim">No land on its way.</p>'; return; }
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
    update(c) { if (!c || c.has('house') || c.has('rules')) { land(); explore(); } },
    tick() { coming(); },
    destroy() { host.replaceChildren(); },
  };
}
