// Straightline's Throne: your house at a glance, in two columns as in Utopia. Left: who you are, land and people,
// the treasury. Right: the army, home and away for every unit, and its strength in offense and defense points.
// Read straight from the store (/me); the resources-over-time table is the Resources page (the Holdings panel).
import { store, raceOf, raceName, persName, isProtected, unitPoints, slotUsed } from '../../core/store.js';
import { fmt, esc, addr, UNIT_ORDER } from '../../core/words.js';
import * as pend from '../../core/pending.js';

const rows = (pairs) => pairs.map(([k, v, cls = '']) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${esc(k)}</th><td class="num">${typeof v === 'number' ? fmt(v) : v}</td></tr>`).join('');
const block = (title, body) => `<section><h3 class="sub">${esc(title)}</h3><table class="tbl kv">${body}</table></section>`;

export function mountThrone(host) {
  host.innerHTML = '<div class="throne"><div class="col" data-col="1"></div><div class="col" data-col="2"></div></div>';
  const left = host.querySelector('[data-col="1"]');
  const right = host.querySelector('[data-col="2"]');

  function render() {
    const h = store.house;
    const race = raceOf(h?.race);
    if (!h || !race) return;
    const built = Object.values(h.buildings || {}).reduce((a, n) => a + n, 0);
    const building = Object.values(h.constructing || {}).reduce((a, n) => a + n, 0);
    const books = (h.science?.books || []).reduce((a, n) => a + n, 0);
    const mats = Object.entries(h.materials || {}).filter(([, q]) => q > 0);
    left.innerHTML = block('Your house', rows([
      ['House', esc(h.name)], ['Address', addr(h)], ['Race', esc(raceName(h.race))], ['Personality', esc(persName(h.personality))],
      ['Protection', isProtected(h) ? `until tick ${fmt(h.protected_until)}` : 'none'], ['Renown', h.renown],
    ])) + block('Land and people', rows([
      ['Land', `${fmt(h.land)} acres${h.incoming_land ? ` <span class="dim">(+${fmt(h.incoming_land)} coming)</span>` : ''}`],
      ['Built', built], ['Being built', building], ['Barren', h.barren],
      ['Peasants', h.peasants], ['Population', `${fmt(h.population)} / ${fmt(h.max_population)}`],
      ['Building efficiency', `${h.efficiency_bp / 100}%`], ['Draft rate', `${h.draft_bp / 100}%`],
    ])) + block('Treasury', rows([
      ['Gold', h.gold], ['Food', h.food], ['Books', books],
      ...mats.map(([m, q]) => [m[0].toUpperCase() + m.slice(1), q]),
      ...(h.aether ? [['Aether', h.aether]] : []),
    ]));

    // The army: every unit you hold or could train, home and away; then the strength it adds up to.
    const training = new Map();
    for (const x of pend.list(['train'])) training.set(x.slot, (training.get(x.slot) || 0) + x.count);
    const slots = UNIT_ORDER.filter((i) => slotUsed(race, i) && (i <= 4 || h.units[i] || h.away[i] || training.get(i)));
    const pts = (i) => unitPoints(race, i);
    const offHome = race.units.reduce((a, _, i) => a + pts(i)[0] * h.units[i], 0);
    const offAway = race.units.reduce((a, _, i) => a + pts(i)[0] * h.away[i], 0);
    const defHome = race.units.reduce((a, _, i) => a + pts(i)[1] * h.units[i], 0);
    const troopsHome = h.units.reduce((a, n) => a + n, 0);
    const troopsAway = h.away.reduce((a, n) => a + n, 0);
    right.innerHTML = `<section><h3 class="sub">Military</h3><table class="tbl army">
      <tr><th>Unit</th><th class="num">Off / Def</th><th class="num">Home</th><th class="num">Away</th><th class="num">Training</th></tr>
      ${slots.map((i) => `<tr class="${i >= 5 && i !== 8 ? 'plus' : ''}"><td>${esc(race.units[i].name)}</td><td class="num dim">${pts(i)[0]} / ${pts(i)[1]}</td>
        <td class="num">${fmt(h.units[i])}</td><td class="num">${fmt(h.away[i])}</td><td class="num">${training.get(i) ? fmt(training.get(i)) : '<span class="dim">·</span>'}</td></tr>`).join('')}
      <tr class="sum"><td>All troops</td><td></td><td class="num">${fmt(troopsHome)}</td><td class="num">${fmt(troopsAway)}</td><td class="num">${fmt(h.training || 0)}</td></tr>
      </table></section>`
      + block('Strength', rows([
        ['Offense points, home', offHome], ['Offense points, away', offAway], ['Offense points, all', offHome + offAway],
        ['Defense points, home', defHome], ['Might', h.might], ['Nerve', `${h.nerve_bp / 100}%`],
      ]))
      + '<p class="dim small note">Points are your troops’ offense and defense before modifiers (horses, generals, science, buildings).</p>'
      + block('Support', rows([
        ['Medics home / away', `${fmt(h.medics)} / ${fmt(h.medics_away)}`], ['Horses home / away', `${fmt(h.horses)} / ${fmt(h.horses_away)}`],
        ['Chariots home / away', `${fmt(h.chariots)} / ${fmt(h.chariots_away)}`], ['Generals', h.generals.length],
      ]));
  }
  render();
  return {
    update(c) { if (!c || c.has('house') || c.has('rules')) render(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
