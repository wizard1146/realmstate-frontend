// The War Ring's Your house tab: your house at a glance, live (holdings, forces, shadows and magic), your target and
// what to do to it, what's under way and what's in force on you, and quick buttons. Every order opens in the
// action window over the ring (modal.js); nothing here sends one itself. core/ only.
import { store, setTarget, say, raceOf, isProtected } from '../../core/store.js';
import * as pend from '../../core/pending.js';
import { fmt, esc, addr, THIEF } from '../../core/words.js';
import { inForce } from '../../core/rites.js';
import { actById } from './acts/index.js';
import { blockOf } from './modal.js';

const pct = (bp) => `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
/** The quick buttons: [action id, label]. Ones this build hasn't got are left out. */
const QUICK = [['explore', 'Explore'], ['build', 'Build'], ['train', 'Train'], ['attack', 'Attack'], ['operation', 'Thieves'], ['cast', 'Rite'], ['market-order', 'Market'], ['chat', 'Chat']];

export function mountConsole(host, on, { openState, open, bar }) {
  host.innerHTML = `<div class="rc">
    <section class="rc-sec rc-tsec" aria-labelledby="rc-h-t"><h3 id="rc-h-t">Your target</h3><div id="rc-tgt" aria-live="polite"></div></section>
    <section class="rc-sec" aria-labelledby="rc-h-q"><h3 id="rc-h-q">Act <button type="button" class="rg-link rc-cmd" data-bar title="Every action, by name (/)">All actions <kbd>/</kbd></button></h3><div class="rc-quick" id="rc-quick"></div></section>
    <section class="rc-sec" aria-labelledby="rc-h-g"><h3 id="rc-h-g">At a glance</h3><dl class="rc-glance" id="rc-glance"></dl></section>
    <section class="rc-sec" aria-labelledby="rc-h-u"><h3 id="rc-h-u">Under way</h3><ul class="rc-uw" id="rc-uw"></ul></section>
    <section class="rc-sec" aria-labelledby="rc-h-f"><h3 id="rc-h-f">In force on you</h3><ul class="rc-uw" id="rc-force"></ul></section>
  </div>`;
  const $ = (id) => host.querySelector(`#rc-${id}`);

  function target() {
    const t = store.target, why = blockOf(t);
    $('tgt').innerHTML = t ? `<p class="nm"><b>${esc(t.name)}</b> <span class="dim">${addr(t)}</span> · <button type="button" class="rg-link" data-open="${t.realm}:${t.state}">their state</button>
        <button type="button" class="rg-x" data-untarget aria-label="Clear the target" title="Clear the target">×</button></p>
      <p class="s">${fmt(t.land)} acres · ${fmt(t.might)} might${why ? ` · <span class="short">${esc(why)}</span>` : ''}</p>
      <p class="rg-acts">${[['attack', 'Attack', ''], ['operation', 'Thieves', 'ghost'], ['cast', 'Rite', 'ghost']].filter(([id]) => actById(id)).map(([id, l, c]) => `<button type="button" class="rg-btn ${c}" data-open-act="${id}">${l} ›</button>`).join('')}</p>`
      : '<p class="dim">No target. Pick a house from a state\'s <b>Houses</b> on the ring, or type <kbd>/</kbd> and its address.</p>';
  }
  function quick() {
    $('quick').innerHTML = QUICK.filter(([id]) => actById(id)).map(([id, label]) => `<button type="button" class="rc-qb" data-open-act="${id}">${label}</button>`).join('');
  }
  function glance() {
    const h = store.house, race = raceOf(h.race), away = pend.list(['army']).reduce((a, x) => a + x.count, 0);
    const mats = Object.entries(h.materials || {}).filter(([, q]) => q).map(([m, q]) => `${fmt(q)} ${esc(m)}`).join(', ');
    const rows = [
      ['Land', `${fmt(h.land)}`, `${fmt(h.barren)} barren${h.incoming_land ? ` · +${fmt(h.incoming_land)} coming` : ''}`],
      ['Gold', fmt(h.gold), ''], ['Food', fmt(h.food), ''], ['Peasants', fmt(h.peasants), ''],
      ['Soldiers', fmt(h.units[0]), 'at home'], ['Army away', fmt(away), away ? 'coming home' : 'none out'],
      ['Thieves', fmt(h.units[THIEF]), `nerve ${pct(h.nerve_bp || 0)}`], ['Aether', fmt(h.aether || 0), `${fmt(h.adepts || 0)} adepts`],
      ['Might', fmt(h.might), ''], ['Renown', fmt(h.renown), ''],
    ];
    $('glance').innerHTML = rows.map(([k, v, n]) => `<div><dt>${k}</dt><dd>${v}${n ? `<span class="n">${n}</span>` : ''}</dd></div>`).join('')
      + (mats ? `<div class="wide"><dt>Materials</dt><dd class="m">${mats}</dd></div>` : '')
      + (isProtected(h) ? `<div class="wide prot"><dt>Protection</dt><dd class="m">until tick ${fmt(h.protected_until)}: no one can attack you, nor you them</dd></div>` : '')
      + `<div class="wide"><dt>Your house</dt><dd class="m">${esc(race?.name || h.race)} · ${addr(h)}</dd></div>`;
  }
  function underway() {
    const list = pend.list();
    $('uw').innerHTML = list.length ? list.slice(0, 10).map((x) => `<li><span class="k">${esc(pend.KIND_LABEL[x.kind] || x.kind)}</span><span class="w">${esc(pend.what(x))}</span><span class="t">${esc(pend.spanText(x))}</span></li>`).join('')
      + (list.length > 10 ? `<li class="dim">and ${fmt(list.length - 10)} more</li>` : '') : '<li class="dim">Nothing under way.</li>';
    const f = inForce();
    $('force').innerHTML = f.length ? f.map(([n, until, left]) => `<li><span class="k">RITE</span><span class="w">${esc(n)}</span><span class="t">${fmt(left)} tick${left === 1 ? '' : 's'}</span></li>`).join('') : '<li class="dim">Nothing in force on you.</li>';
  }

  on(host, 'click', (ev) => {
    const a = ev.target.closest('[data-open-act]');
    if (a) { open(a.dataset.openAct); return; }
    if (ev.target.closest('[data-bar]')) { bar(); return; }
    if (ev.target.closest('[data-untarget]')) { setTarget(null); say('Target cleared.'); return; }
    const o = ev.target.closest('[data-open]');
    if (o) openState(o.dataset.open);
  });

  function draw() { if (!store.house) return; target(); quick(); glance(); underway(); }
  draw();
  return {
    update(c) { if (!c || ['house', 'target', 'rules', 'tick'].some((k) => c.has(k))) draw(); },
    destroy() { host.replaceChildren(); },
  };
}
