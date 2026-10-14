// Straightline's Profile: your account (its number; the game keeps your email from connected sites like this one), and the house you hold this age. From /me (store.me, store.house).
import { store, raceName, persName, isProtected } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { fmt, esc, addr } from '../../core/words.js';

const rows = (pairs) => pairs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join('');

export function mountProfile(host, on) {
  host.innerHTML = `<div class="lpart lprofile">
    <section><h3 class="sub">Account</h3><table class="tbl kv" id="pf-acct"></table><p class="dim small" id="pf-why"></p>
      <button type="button" class="btn" id="pf-out">Sign out</button></section>
    <section><h3 class="sub">Your house this age</h3><table class="tbl kv" id="pf-house"></table></section>
  </div>`;
  const $ = (id) => host.querySelector(`#pf-${id}`);
  function draw() {
    const me = store.me || {}, h = store.house;
    // The game tells a connected site (this one) your account number, never your email: /me's email is null here.
    $('acct').innerHTML = rows([
      ['Signed in with', me.email ? esc(me.email) : 'Google'],
      ['Account number', esc(me.account ?? '–')],
    ]);
    $('why').textContent = me.email ? '' : 'This site isn\'t told your email. Only the game keeps it.';
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
