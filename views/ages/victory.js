// The victory window: an ended age's result. The winning state, the states by score (with land,
// might, war points and renown), the houses by land, might and renown (top ten, then more), and
// the characters kept into the next age (names only). Your house and state are marked when the
// age shown is the current one. All of it public: GET /age `result` or GET /ages/n.
import { esc, fmt, fullTime } from '../../core/words.js';
import { tabState, tabButtons, panelAttrs, wireTabs } from '../room/tabs.js';
import { ageName } from '../../core/ages.js';

const BOARD = tabState('realmstate.ages.board', ['land', 'might', 'renown'], { land: 'BY LAND', might: 'BY MIGHT', renown: 'BY RENOWN' });
const PAGE = 10, MORE = 25;
const sameState = (a, b) => a && b && a.realm === b.realm && a.state === b.state;

/**
 * Draws result `r` into `el`. `nm` names states and realms (from the age's recap, if any);
 * `mine` is {realm, state, house} to mark, or null. `on` registers listeners for the view.
 */
export function renderVictory(el, r, nm, mine, on) {
  const stName = (s) => nm?.state(s.realm, s.state) || `State ${s.realm}:${s.state}`;
  const st = (s) => `${esc(stName(s))} <span class="dim">${s.realm}:${s.state}</span>`;
  const win = r.winner;
  const wrow = win && r.states?.find((x) => sameState(x.state, win));
  const shown = { land: PAGE, might: PAGE, renown: PAGE };
  const lists = { land: r.by_land || [], might: r.by_might || [], renown: r.by_renown || [] };

  el.innerHTML = `
    <div class="vc-win${win && sameState(win, mine) ? ' self' : ''}">
      <span class="vc-k">${win ? 'VICTOR' : 'NO VICTOR'}</span>
      <span class="vc-name">${win ? st(win) : 'No state won this age.'}</span>
      <span class="dim small">${esc(ageName(r))}${r.ended_tick != null ? ` · ended at tick ${fmt(r.ended_tick)}` : ''}${r.ended_at ? ` · ${esc(fullTime(r.ended_at))}` : ''}${wrow ? ` · score ${(wrow.score / 100).toFixed(1)}` : ''}</span>
    </div>
    <div class="dgrid">
      <section class="wide"><h3 class="sub">STATES <span class="dim">by score: land and might against the leader, plus war points</span></h3>
        <div class="scrollx"><table class="tbl vc-states">
          <tr><th class="num">#</th><th>STATE</th><th class="num">SCORE</th><th class="num">LAND</th><th class="num">MIGHT</th><th class="num"><abbr title="War points">WAR</abbr></th><th class="num"><abbr title="Renown">REN</abbr></th><th class="num"><abbr title="Houses in the state">HSE</abbr></th></tr>
          ${(r.states || []).map((x, i) => `<tr class="${sameState(x.state, mine) ? 'self' : ''}${sameState(x.state, win) ? ' win' : ''}"><td class="num dim">${i + 1}</td><td class="name">${st(x.state)}</td><td class="num"><b>${(x.score / 100).toFixed(1)}</b></td><td class="num">${fmt(x.land)}</td><td class="num">${fmt(x.might)}</td><td class="num">${fmt(x.war_points)}</td><td class="num">${fmt(x.renown)}</td><td class="num">${fmt(x.houses)}</td></tr>`).join('')
            || '<tr><td colspan="8" class="dim">No states scored.</td></tr>'}
        </table></div>
      </section>
      <section><h3 class="sub">HOUSES</h3>
        <div class="acttabs seg2" role="tablist" aria-label="House leaderboards" id="vc-tabs">${tabButtons(BOARD, 'vc')}</div>
        ${BOARD.list.map((t) => `<div ${panelAttrs(BOARD, 'vc', t)}><div class="scrollx"><table class="tbl" data-board="${t}"></table></div><p class="vc-more"></p></div>`).join('')}
      </section>
      <section><h3 class="sub">HEIRS KEPT <span class="dim">characters carried into the next age</span></h3>
        ${(r.heirs || []).length ? `<ul class="vc-heirs">${r.heirs.map((h) => `<li>${esc(h.name)}${h.kind ? ` <span class="dim">${esc(h.kind)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="dim">No characters were kept.</p>'}
      </section>
    </div>`;

  function board(t) {
    const box = el.querySelector(`#vc-sec-${t}`);
    const list = lists[t];
    const n = Math.min(shown[t], list.length);
    box.querySelector('table').innerHTML = `<tr><th class="num">#</th><th>HOUSE</th><th>STATE</th><th class="num">${t.toUpperCase()}</th></tr>`
      + (list.slice(0, n).map((x, i) => {
        const h = x.house || {};
        const hid = h.house ?? h.id; // a result names a house as {house, name, realm, state, seat}
        const self = mine?.house != null && hid === mine.house;
        return `<tr class="${self ? 'self' : ''}"><td class="num dim">${i + 1}</td><td class="name">${self ? '<span aria-label="your house">◆</span> ' : ''}${esc(h.name || `House ${hid}`)}</td><td class="dim">${h.realm ? `<span class="vc-sn">${esc(stName(h))} </span>${h.realm}:${h.state}` : ''}</td><td class="num">${fmt(x[t])}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="dim">No houses.</td></tr>');
    const more = box.querySelector('.vc-more');
    more.innerHTML = n < list.length
      ? `<button type="button" class="btn mini" data-more="${t}">SHOW ${Math.min(MORE, list.length - n)} MORE</button> <span class="dim small">${fmt(n)} of ${fmt(list.length)}</span>`
      : list.length > PAGE ? `<span class="dim small">All ${fmt(list.length)} shown.</span>` : '';
  }
  BOARD.list.forEach(board);
  wireTabs(el.querySelector('#vc-tabs'), el, on, BOARD);
  on(el, 'click', (ev) => {
    const b = ev.target.closest('[data-more]');
    if (!b) return;
    const t = b.dataset.more;
    shown[t] += MORE;
    board(t);
    // Keep the keyboard in place: the button again (or, once all are shown, the tab).
    (el.querySelector(`#vc-sec-${t} [data-more]`) || el.querySelector(`#vc-tab-${t}`))?.focus();
  });
}

/** Before the age ends: the standings so far (public), so the tab isn't empty. */
export function renderStandings(el, a, nm, mine) {
  const stName = (s) => nm?.state(s.realm, s.state) || `State ${s.realm}:${s.state}`;
  const rows = a?.standings || [];
  el.innerHTML = `<p class="vc-wait">The age hasn't ended: the victor and the leaderboards appear here when it does.</p>
    <h3 class="sub">STANDINGS SO FAR <span class="dim">by score</span></h3>
    <div class="scrollx"><table class="tbl vc-states"><tr><th class="num">#</th><th>STATE</th><th class="num">SCORE</th><th class="num">LAND</th><th class="num">MIGHT</th><th class="num"><abbr title="War points">WAR</abbr></th><th class="num"><abbr title="Houses in the state">HSE</abbr></th></tr>
    ${rows.map((x, i) => `<tr class="${sameState(x.state, mine) ? 'self' : ''}"><td class="num dim">${i + 1}</td><td class="name">${esc(stName(x.state))} <span class="dim">${x.state.realm}:${x.state.state}</span></td><td class="num">${(x.score / 100).toFixed(1)}</td><td class="num">${fmt(x.land)}</td><td class="num">${fmt(x.might)}</td><td class="num">${x.war_points != null ? fmt(x.war_points) : '·'}</td><td class="num">${fmt(x.houses)}</td></tr>`).join('')
      || '<tr><td colspan="7" class="dim">No standings yet.</td></tr>'}</table></div>`;
}
