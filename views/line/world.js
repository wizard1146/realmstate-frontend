// Straightline's World: the realms one at a time, and the states in each (from the public /realms/:n). Opens on your
// own realm; ‹ › or the list move between realms. Kept simple for now.
import { store } from '../../core/store.js';
import { api } from '../../core/api.js';
import { fmt, esc } from '../../core/words.js';

let shown = null;   // the realm last looked at, kept while the page is open again
/** The next time World opens, it opens on your own realm (the Throne's realm link). */
export function homeRealm() { shown = null; }

export function mountWorld(host, on) {
  const realms = store.rules?.params.realms || 13;
  const mine = store.house?.realm || 1;
  let realm = shown || mine;
  host.innerHTML = `<div class="lpart lworld">
    <div class="wd-nav">
      <button type="button" class="btn" data-step="-1" aria-label="Previous realm">‹</button>
      <label class="vh" for="wd-pick">Realm</label><select id="wd-pick"></select>
      <button type="button" class="btn" data-step="1" aria-label="Next realm">›</button>
      <button type="button" class="btn" data-home>Your realm</button>
    </div>
    <div id="wd-body" aria-live="polite"><p class="dim">Loading…</p></div>
  </div>`;
  const $ = (id) => host.querySelector(`#wd-${id}`);
  const names = new Map();   // realm number -> name, filled as realms load

  function pickList() {
    $('pick').innerHTML = Array.from({ length: realms }, (_, k) => k + 1)
      .map((n) => `<option value="${n}"${n === realm ? ' selected' : ''}>Realm ${n}${names.has(n) ? ` · ${esc(names.get(n))}` : ''}${n === mine ? ' (yours)' : ''}</option>`).join('');
  }
  async function show(n) {
    realm = shown = ((n - 1 + realms) % realms) + 1;
    pickList();
    let r;
    try { r = await api(`/realms/${realm}`); } catch (e) { $('body').innerHTML = `<p class="short">${esc(e.message)}</p>`; return; }
    if (r.realm !== realm) return;   // moved on while it loaded
    names.set(realm, r.name);
    pickList();
    const houses = r.states.reduce((a, s) => a + s.houses, 0);
    $('body').innerHTML = `<h3 class="sub">${esc(r.name)} <span class="dim">realm ${realm} · ${esc(r.material)} · ${fmt(houses)} houses</span></h3>
      <table class="tbl"><thead><tr><th class="num">State</th><th>Name</th><th class="num">Houses</th><th>Leader</th><th class="num"><abbr title="Its share of the realm's ${esc(r.material)}">Share</abbr></th></tr></thead><tbody>
      ${r.states.map((s) => {
        const yours = store.house && store.house.realm === realm && store.house.state === s.state;
        return `<tr${yours ? ' class="self"' : ''}><td class="num">${realm}:${s.state}</td><td>${esc(s.name)}${yours ? ' <span class="dim">(yours)</span>' : ''}</td>
          <td class="num">${fmt(s.houses)}</td><td>${s.leader ? esc(s.leader.name) : '<span class="dim">none</span>'}</td><td class="num">${(s.share_bp / 100).toFixed(1)}%</td></tr>`;
      }).join('')}</tbody></table>`;
  }
  on(host, 'click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.step) show(realm + Number(b.dataset.step));
    if ('home' in b.dataset) show(mine);
  });
  on($('pick'), 'change', () => show(Number($('pick').value)));
  show(realm);
  return {
    update() {},
    tick() {},
    destroy() { host.replaceChildren(); },
    /** Opens a realm (the Throne's realm link opens yours). */
    open(n) { show(n); },
  };
}
