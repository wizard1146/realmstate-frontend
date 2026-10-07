// Straightline's Profile: who you are signed in as, and the house you hold this age. From /me (store.me, store.house).
import { store, raceName, persName, isProtected } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr } from '../../core/words.js';

const rows = (pairs) => pairs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join('');

export function mountProfile(host, on) {
  host.innerHTML = `<div class="lpart lprofile">
    <section><h3 class="sub">Account</h3><table class="tbl kv" id="pf-acct"></table>
      <button type="button" class="btn" id="pf-out">Sign out</button></section>
    <section><h3 class="sub">Your house this age</h3><table class="tbl kv" id="pf-house"></table></section>
  </div>`;
  const $ = (id) => host.querySelector(`#pf-${id}`);
  function draw() {
    const me = store.me || {}, h = store.house;
    $('acct').innerHTML = rows([['Signed in as', esc(me.email || '–')], ['Account number', esc(me.account ?? '–')]]);
    $('house').innerHTML = h ? rows([
      ['House', esc(h.name)], ['Address', esc(addr(h))], ['Race', esc(raceName(h.race))], ['Personality', esc(persName(h.personality))],
      ['Land', `${fmt(h.land)} acres`], ['Renown', fmt(h.renown)],
      ['Protection', isProtected(h) ? `until tick ${fmt(h.protected_until)}` : 'none'],
    ]) : rows([['House', 'none this age']]);
  }
  on($('out'), 'click', () => act.signOut());
  draw();
  return {
    update(c) { if (!c || c.has('house') || c.has('me')) draw(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
