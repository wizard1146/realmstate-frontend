// Your race's own mechanics, where they need you: a second strike to make (Drow), land to take
// back (Mycellians), whose unit stats to fight with (Echolalians), afflictions on you (Biohazard),
// war momentum (Daemons) and activity (Freehomes). Only what your race has shows. The MIL pane
// shows it compactly; the MIL detail in full. Times are ticks, as the server sends them.
import { store, raceOf, knownHouses } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr } from '../../core/words.js';

const pctBp = (bp) => `${bp > 0 ? '+' : ''}${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
/** "Name (r:s:h)" for a house id, if we know it. */
function who(id) {
  const h = knownHouses().get(id);
  return h ? `${h.name} (${addr(h)})` : `house ${id}`;
}
const raceName = (id) => store.rules?.races.find((r) => r.identity === id)?.name || id;

/** The box's markup for house h (empty when nothing applies). p: id prefix. */
function html(h, p, compact) {
  const race = raceOf(h.race);
  const rr = race?.race || {};
  const tick = store.tick;
  const rows = [];
  if (h.second_strike) {
    const left = h.second_strike.until_tick - tick;
    rows.push(`<p class="race-row"><b class="war">SECOND STRIKE</b> ready against ${esc(who(h.second_strike.target))}, until T${h.second_strike.until_tick} (${left >= 0 ? `${left} tick${left === 1 ? '' : 's'} left` : 'lapsed'}) `
      + `<button type="button" class="btn mini primary" data-race="strike">STRIKE</button></p>`);
  }
  for (const r of h.retakable || []) {
    const per = rr.roots?.elites_per_acre || 0;
    rows.push(`<p class="race-row"><b>ROOTS</b> ${esc(who(r.from))} carries ${fmt(r.land)} of your acres home; take back up to ${fmt(r.most)} (${fmt(per)} elites an acre) `
      + `<label class="vh" for="${p}-rt-${r.from}">Acres</label><input id="${p}-rt-${r.from}" type="number" min="1" max="${r.most}" value="${r.most}" class="w4" ${r.most ? '' : 'disabled'}> `
      + `<button type="button" class="btn mini" data-race="retake" data-from="${r.from}" ${r.most ? '' : 'disabled'}>TAKE BACK</button></p>`);
  }
  if (h.mirror) {
    const m = h.mirror;
    const wait = m.next_tick > tick ? m.next_tick : 0;
    const opts = `<option value="">your own (${esc(race?.name || '')})</option>` + (m.attackers || []).map((id) => {
      const k = knownHouses().get(id);
      return `<option value="${id}">${esc(who(id))}${k?.race ? ` · ${esc(raceName(k.race))}` : ''}</option>`;
    }).join('');
    rows.push(`<p class="race-row"><b>MIRROR</b> fighting with ${m.race ? `the ${esc(raceName(m.race))}'s unit stats` : 'your own unit stats'}`
      + (compact ? '' : ` · <label for="${p}-mir">choose</label> <select id="${p}-mir" ${wait ? 'disabled' : ''}>${opts}</select> <button type="button" class="btn mini" data-race="mirror" ${wait ? `disabled title="next change at T${wait}"` : ''}>SET</button>`)
      + (wait ? ` <span class="dim">next change T${wait}</span>` : '')
      + ((m.attackers || []).length ? '' : ' <span class="dim">(no attackers yet to mirror)</span>') + '</p>');
  }
  for (const a of h.afflictions || []) {
    rows.push(`<p class="race-row"><b class="short">${esc(a.name.toUpperCase())}</b> until T${a.until_tick}: ${esc(a.mods.map(([s, bp]) => `${pctBp(bp)} ${s.replace(/_/g, ' ')}`).join(', '))}</p>`);
  }
  if (h.momentum_bp != null) {
    const m = rr.momentum;
    rows.push(`<p class="race-row"><b>MOMENTUM</b> ${pctBp(h.momentum_bp)} offense${m ? ` <span class="dim">(at war: ${pctBp(m.gain_bp)} every ${m.every_ticks} ticks to ${pctBp(m.max_bp)}; ${pctBp(-m.drop_bp)} per ${m.drop_every_ticks} ticks hit)</span>` : ''}</p>`);
  }
  if (h.active != null) {
    const a = rr.activity;
    rows.push(`<p class="race-row"><b>${h.active ? 'ACTIVE' : 'IDLE'}</b> ${h.active ? `training ${a ? a.training_ticks : ''} ticks faster` : `explore, take land or build on ${a ? a.build_bp / 100 : ''}% of your land to train faster`}${a ? ` <span class="dim">(within ${a.window_ticks} ticks)</span>` : ''}</p>`);
  }
  return rows.join('');
}

/** Draws the box into `box`; hides `section` (if given) when nothing applies. */
export function renderRace(box, p, compact = false, section = null) {
  const h = store.house;
  if (!box || !h) return;
  const out = html(h, p, compact);
  box.innerHTML = out;
  if (section) section.hidden = !out;
}

/** Wires the box's buttons (click delegation on `scope`). */
export function wireRace(scope, on, p) {
  on(scope, 'click', (ev) => {
    const b = ev.target.closest('[data-race]');
    if (!b || b.disabled) return;
    if (b.dataset.race === 'strike') act.secondStrike({ button: b });
    else if (b.dataset.race === 'retake') {
      const n = Math.floor(Number(scope.querySelector(`#${p}-rt-${b.dataset.from}`)?.value) || 0);
      act.retakeLand(b.dataset.from, n, { button: b });
    } else if (b.dataset.race === 'mirror') act.mirror(scope.querySelector(`#${p}-mir`)?.value, { button: b });
  });
}
