// Your house: heirs (which characters you keep into the next age, in order), recalling an heir from an earlier age,
// leaving protection early, the Halls of the Dead's revive, and chat on the state, realm and world channels.
// Behaviour and wording follow Straightline's Heirs, World Wonders and chat box; the logic is core's (heirs.js,
// generals.js, actions.js, store.js).
import { store, loadHeirs, loadChat, markRead, isProtected, CHANNELS } from '../../../core/store.js';
import * as act from '../../../core/actions.js';
import * as G from '../../../core/generals.js';
import { same, sendMarks } from '../../../core/heirs.js';
import { fmt, esc, hhmm, fullTime, empty } from '../../../core/words.js';

const P = () => store.rules.params;

// ---------- heirs ----------
/** A character's line: name, and its traits or attributes. */
function who(m) {
  const h = store.house;
  if (m.kind === 'general') {
    const g = h.generals.find((x) => x.id === m.id);
    return g ? { name: g.name, note: (g.traits || []).map(G.traitName).join(', ') || 'no traits' } : { name: `general ${m.id}`, note: '' };
  }
  const a = h.science?.academics.find((x) => x.id === m.id);
  const attr = (id) => store.rules.attributes?.find((x) => x.attribute === id)?.name || id;
  return a ? { name: a.name, note: a.attributes.map(attr).join(', ') || 'no attributes' } : { name: `academic ${m.id}`, note: '' };
}
const sig = (list) => list.map((m) => `${m.kind}:${m.id}`).join(',');

const heirs = {
  id: 'heirs', group: 'house', name: 'Heirs', wiki: 'end-of-age.html#Heirs', keys: 'heir keep next age generals academics order mark', stay: true,
  what: 'Mark the generals and academics you keep into the next age, first kept first.',
  badge: () => (store.house ? `${fmt(G.liveMarks().length)} marked · ${fmt(G.heirSlots().now)} slots` : ''),
  mount(body, ctx) {
    body.innerHTML = `<p class="ra-note" id="ra-hs"></p>
      <div class="ra-scroll"><table class="ra-tbl"><thead><tr><th class="num">#</th><th>Heir</th><th>Kept</th><th><span class="dim">Order</span></th></tr></thead><tbody id="ra-hl"></tbody></table>
      <h3 class="ra-sub">Not marked</h3><table class="ra-tbl"><tbody id="ra-hr"></tbody></table></div>`;
    let draft = G.liveMarks(), dirty = false;
    const have = (m) => (m.kind === 'general' ? store.house.generals.some((g) => g.id === m.id) : store.house.science?.academics.some((a) => a.id === m.id));
    const draw = (focus) => {
      const s = G.heirSlots();
      body.querySelector('#ra-hs').textContent = `${fmt(draft.length)} marked. ${fmt(s.now)} slot${s.now === 1 ? '' : 's'} from renown now${s.next != null ? ` (another at ${fmt(s.next)} renown; you have ${fmt(store.house.renown)})` : ''}, ${fmt(s.ifWon)} if your state wins the age. When the age ends you keep the first ones, as many as your slots allow then.`;
      body.querySelector('#ra-hl').innerHTML = draft.length ? draft.map((m, i) => {
        const w = who(m);
        return `<tr><td class="num">${i + 1}</td><th scope="row">${esc(w.name)} <span class="dim">${m.kind} · ${esc(w.note)}</span></th>
          <td>${i < s.now ? 'yes' : i < s.ifWon ? '<span class="dim">if your state wins</span>' : '<span class="short">no slot</span>'}</td>
          <td><button type="button" class="rg-btn ghost mini" id="ra-h-up-${i}" data-mv="${i}:-1" aria-label="Move ${esc(w.name)} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="rg-btn ghost mini" id="ra-h-dn-${i}" data-mv="${i}:1" aria-label="Move ${esc(w.name)} down"${i < draft.length - 1 ? '' : ' disabled'}>↓</button><button type="button" class="rg-btn ghost mini" id="ra-h-x-${i}" data-drop="${i}" aria-label="Unmark ${esc(w.name)}">×</button></td></tr>`;
      }).join('') : '<tr><td colspan="4" class="dim">No heirs marked yet. Add generals or academics below.</td></tr>';
      const h = store.house, full = draft.length >= s.ifWon;
      const rest = [...h.generals.map((g) => ({ kind: 'general', id: g.id })), ...(h.science?.academics || []).map((a) => ({ kind: 'academic', id: a.id }))].filter((m) => !draft.some((d) => same(d, m)));
      body.querySelector('#ra-hr').innerHTML = rest.length ? rest.map((m) => {
        const w = who(m);
        return `<tr><th scope="row">${esc(w.name)} <span class="dim">${m.kind} · ${esc(w.note)}</span></th><td><button type="button" class="rg-btn ghost mini" id="ra-h-add-${m.kind}-${m.id}" data-add="${m.kind}:${m.id}" aria-label="Mark ${esc(w.name)} as heir"${full ? ' disabled' : ''}>Add</button></td></tr>`;
      }).join('') + (full ? `<tr><td colspan="2" class="dim">You can mark at most ${fmt(s.ifWon)} (your slots if your state wins). Remove one to add another.</td></tr>` : '')
        : '<tr><td class="dim">Everyone you have is marked.</td></tr>';
      // Focus follows what was pressed (the moved heir's arrow, or the nearest control).
      for (const id of focus || []) { const el = body.querySelector(`#${id}`); if (el && !el.disabled) { el.focus(); break; } }
    };
    draw();
    ctx.on(body, 'click', (ev) => {
      const mv = ev.target.closest('[data-mv]'), dr = ev.target.closest('[data-drop]'), ad = ev.target.closest('[data-add]');
      if (mv) {
        const [i, d] = mv.dataset.mv.split(':').map(Number), j = i + d;
        if (j < 0 || j >= draft.length) return;
        const [m] = draft.splice(i, 1); draft.splice(j, 0, m);
        dirty = true; draw([`ra-h-${d < 0 ? 'up' : 'dn'}-${j}`, `ra-h-${d < 0 ? 'dn' : 'up'}-${j}`]);
      } else if (dr) {
        const i = Number(dr.dataset.drop);
        draft.splice(i, 1);
        dirty = true; draw([`ra-h-x-${Math.min(i, draft.length - 1)}`]);
      } else if (ad) {
        const [kind, id] = ad.dataset.add.split(':');
        draft.push({ kind, id: Number(id) });
        dirty = true; draw([`ra-h-x-${draft.length - 1}`]);
      } else return;
      ctx.refresh();
    });
    return {
      check() {
        const live = G.liveMarks(), s = G.heirSlots();
        if (sig(draft) === sig(live)) return { ok: false, why: ['change the list first: add, remove or move an heir'], go: 'Save heirs' };
        const why = draft.length > s.ifWon ? [`you can mark at most ${fmt(s.ifWon)}`] : [];
        return { ok: !why.length, why, text: draft.length ? `Keep, in this order: ${draft.map((m) => who(m).name).join(', ')}.` : 'Clear your heirs: keep no one into the next age.', go: 'Save heirs' };
      },
      async run(btn) { const out = await sendMarks(draft.map((m) => ({ kind: m.kind, id: m.id })), btn); if (out) { dirty = false; draw(); } return out; },
      update(c) {
        if (!c || c.has('house') || c.has('heirs') || c.has('rules')) {
          draft = dirty ? draft.filter(have) : G.liveMarks();
          const f = body.contains(document.activeElement) ? document.activeElement.id : '';
          draw(f ? [f] : []);
        }
      },
    };
  },
};

const recallHeir = {
  id: 'recall-heir', group: 'house', name: 'Recall an heir', wiki: 'end-of-age.html#Recall', keys: 'heir recall kept earlier age bring back character', stay: true,
  what: 'Bring a general or academic kept from an earlier age into this house.',
  badge: () => { const n = (store.heirs || []).filter((k) => !k.recalled_into_age).length; return store.heirs ? (n ? `${fmt(n)} waiting` : 'none waiting') : ''; },
  mount(body, ctx) {
    if (!store.heirs) loadHeirs();
    body.innerHTML = `<div class="ra-scroll"><table class="ra-tbl"><thead><tr><th>Heir</th><th class="num">From age</th><th><span class="dim">Choose</span></th></tr></thead><tbody id="ra-rk"></tbody></table></div>
      <p class="ra-note">Heirs belong to your account: each comes back once, into the house you recall it to.</p>`;
    let chosen = ctx.args.uid ? String(ctx.args.uid) : null;
    const kept = () => store.heirs || [];
    const draw = () => {
      const f = body.contains(document.activeElement) ? document.activeElement.id : '';
      body.querySelector('#ra-rk').innerHTML = !store.heirs ? '<tr><td colspan="3" class="dim">Loading…</td></tr>' : kept().length ? kept().map((k, i) => `<tr><th scope="row">${esc(k.name)} <span class="dim">${esc(k.kind)}</span></th><td class="num">${fmt(k.kept_from_age)}</td>
        <td>${k.recalled_into_age ? `<span class="dim">recalled into age ${fmt(k.recalled_into_age)}</span>` : `<button type="button" class="rg-btn ghost mini" id="ra-rk-${i}" data-uid="${esc(k.uid)}" aria-pressed="${chosen === String(k.uid)}" aria-label="Choose ${esc(k.name)}">Choose</button>`}</td></tr>`).join('')
        : '<tr><td colspan="3" class="dim">No heirs from earlier ages on this account.</td></tr>';
      if (f) body.querySelector(`#${f}`)?.focus();
    };
    draw();
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-uid]'); if (b) { chosen = b.dataset.uid; draw(); ctx.refresh(); } });
    return {
      check() {
        const k = kept().find((x) => String(x.uid) === chosen);
        if (!k) return { ok: false, why: [store.heirs ? 'choose an heir to recall' : 'loading your heirs…'], go: 'Recall' };
        if (k.recalled_into_age) return { ok: false, why: [`${k.name} was recalled into age ${fmt(k.recalled_into_age)}`], go: 'Recall' };
        return { ok: true, why: [], text: `Recall ${k.name} (${k.kind}, kept from age ${fmt(k.kept_from_age)}) into your house.`, go: `Recall ${k.name}` };
      },
      async run(btn) { const out = await act.recallHeir(chosen, { button: btn }); if (out) chosen = null; return out; },
      update(c) { if (!c || c.has('heirs')) draw(); },
    };
  },
};

// ---------- protection and revive ----------
const leaveProtection = {
  id: 'leave-protection', group: 'house', name: 'Leave protection', wiki: 'getting-started.html', keys: 'protection protected leave early attack',
  what: 'End your protection now: you can attack, and be attacked. It can\'t be undone.',
  badge: () => (store.house && isProtected(store.house) ? `${fmt(store.house.protected_until - store.house.ticks_now)} ticks left` : 'not protected'),
  mount(body) {
    body.innerHTML = '<p class="ra-note" id="ra-pn"></p>';
    const draw = () => {
      const h = store.house;
      body.querySelector('#ra-pn').textContent = isProtected(h) ? `Protected until tick ${fmt(h.protected_until)} (${fmt(h.protected_until - h.ticks_now)} ticks left). No one can attack you; you can't attack.` : 'Your house is not under protection: it can attack and be attacked.';
    };
    draw();
    return {
      check() {
        if (!isProtected(store.house)) return { ok: false, why: ['your house is not under protection'], go: 'Leave protection' };
        return { ok: true, why: [], text: 'Leave protection now. Your house can then be attacked, and protection never comes back.', go: 'Leave protection', confirm: 'Confirm: leave for good' };
      },
      run: (btn) => act.leaveProtection({ button: btn }),
      update() { draw(); },
    };
  },
};

const halls = () => (P().wonders || []).find((x) => x.revive_ticks > 0) || null;
const revive = {
  id: 'revive', group: 'house', name: 'Revive your army', wiki: 'truths.html', keys: 'revive halls of the dead wonder army restore',
  what: 'The Halls of the Dead: restore your army to what it was a few ticks ago. Once a season.',
  badge: () => { const hl = halls(), o = hl && (store.house?.wonders || []).find((x) => x.id === hl.id); return !hl ? 'not this age' : o && o.house === store.house?.id ? (o.revived ? 'used this season' : 'ready') : 'owner only'; },
  mount(body) {
    body.innerHTML = '<p class="ra-note" id="ra-rv"></p>';
    const state = () => {
      const h = store.house, hl = halls(), owned = hl && (h.wonders || []).find((x) => x.id === hl.id);
      return { h, hl, owned, own: !!(owned && owned.house === h.id) };
    };
    const draw = () => {
      const { h, hl, owned, own } = state();
      body.querySelector('#ra-rv').textContent = !hl ? 'No wonder revives an army this age.' : !own ? `Only the house that owns the ${hl.name} may revive its army.${owned ? ` It stands for ${owned.house_name}.` : ' It isn\'t built yet.'}`
        : owned.revived ? 'Used this season.' : `Restore your army to what it was ${fmt(hl.revive_ticks)} ticks ago, for ${fmt(hl.revive_renown)} renown (you have ${fmt(h.renown)}). Once a season.`;
    };
    draw();
    return {
      check() {
        const { h, hl, owned, own } = state();
        const why = [!hl ? 'no wonder revives an army this age' : !own ? `only the house that owns the ${hl.name}` : owned.revived ? 'used this season' : h.renown < hl.revive_renown ? `needs ${fmt(hl.revive_renown)} renown; you have ${fmt(h.renown)}` : ''].filter(Boolean);
        return { ok: !why.length, why, text: hl && own ? `Your army is restored to what it was ${fmt(hl.revive_ticks)} ticks ago, for ${fmt(hl.revive_renown)} renown. Once a season.` : '', go: 'Revive', confirm: 'Confirm: revive now' };
      },
      run: (btn) => act.revive({ button: btn }),
      update() { draw(); },
    };
  },
};

// ---------- chat ----------
const LABEL = { world: 'World', realm: 'Realm', state: 'State' };
const unread = (c) => store.unread[c] || 0;

const chat = {
  id: 'chat', group: 'house', name: 'Chat', wiki: 'chat.html', keys: 'chat talk message say world realm state channel', stay: true,
  what: 'Read and write on your state\'s, your realm\'s and the world\'s channels.',
  badge: () => { const n = CHANNELS.reduce((a, c) => a + unread(c), 0); return n ? `${fmt(n)} unread` : ''; },
  mount(body, ctx) {
    let ch = CHANNELS.includes(ctx.args.channel) ? ctx.args.channel : 'state';
    body.innerHTML = `<div class="ra-seg" role="group" aria-label="Channel">${CHANNELS.map((c) => `<button type="button" class="rg-btn ghost mini" data-ch="${c}" aria-pressed="${c === ch}">${LABEL[c]}<span data-n="${c}"></span></button>`).join('')}</div>
      <div class="ra-scroll" id="ra-cbox" tabindex="0" aria-label="Messages"><ul class="ra-list" id="ra-cl" aria-live="polite"></ul></div>
      <div class="ra-line"><label for="ra-ci" id="ra-clbl"></label><input id="ra-ci" maxlength="1000" autocomplete="off"></div>`;
    const box = body.querySelector('#ra-cbox'), list = body.querySelector('#ra-cl'), inp = body.querySelector('#ra-ci');
    if (CHANNELS.some((c) => !store.chatsLoaded[c])) loadChat(CHANNELS.filter((c) => !store.chatsLoaded[c]));
    const seen = () => { if (!document.hidden) markRead(ch); };
    const counts = () => CHANNELS.forEach((c) => { body.querySelector(`[data-n="${c}"]`).textContent = unread(c) && c !== ch ? ` (${unread(c) > 99 ? '99+' : unread(c)})` : ''; });
    const emptyText = () => {
      const h = store.house;
      if (!store.chatsLoaded[ch]) return 'Loading messages…';
      return ch === 'world' ? empty.channel.world : ch === 'realm' ? empty.channel.realm(h ? h.realm : '') : empty.channel.state(h ? `${h.realm}:${h.state}` : '');
    };
    // The newest at the bottom; stays there unless you've scrolled up to read.
    const render = (force) => {
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      const msgs = store.chats[ch].slice(-200);
      list.innerHTML = msgs.length ? msgs.map((m) => {
        const from = ch !== 'state' && m.from ? ` <span class="dim">${esc(m.from)}</span>` : '', me = store.house && m.house === store.house.id;
        return `<li><time class="dim" title="${esc(fullTime(m.at))}">${esc(hhmm(m.at))}</time> <b>${esc(m.name)}</b>${me ? ' <span class="dim">(you)</span>' : ''}${from}: ${esc(m.text)}</li>`;
      }).join('') : `<li class="dim">${esc(emptyText())}</li>`;
      if (force || atBottom) box.scrollTop = box.scrollHeight;
    };
    const chrome = () => {
      body.querySelectorAll('[data-ch]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ch === ch)));
      body.querySelector('#ra-clbl').textContent = `To ${LABEL[ch]}`;
      inp.placeholder = `Say to ${LABEL[ch]}… or /help`;
      box.setAttribute('aria-label', `${LABEL[ch]} messages`);
      counts();
    };
    const pickCh = (c) => { store.drafts[ch] = inp.value; ch = c; inp.value = store.drafts[ch] || ''; chrome(); render(true); seen(); ctx.refresh(); };
    chrome(); inp.value = store.drafts[ch] || ''; render(true); seen();
    setTimeout(() => inp.focus(), 0);
    ctx.on(body, 'click', (ev) => { const b = ev.target.closest('[data-ch]'); if (b && b.dataset.ch !== ch) pickCh(b.dataset.ch); });
    ctx.on(inp, 'input', () => { store.drafts[ch] = inp.value; });
    let sending = false;
    async function send() {
      if (sending || !inp.value.trim()) return false;
      sending = true;
      try {
        const ok = await act.sendChat(inp.value, ch);
        if (ok) { inp.value = store.drafts[ch] || ''; render(true); }
        return ok;
      } finally { sending = false; inp.focus(); ctx.refresh(); }
    }
    // Enter sends from the field (the window's button does the same).
    ctx.on(inp, 'keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); send(); } });
    ctx.on(document, 'visibilitychange', seen);
    return {
      check() {
        const t = inp.value.trim();
        if (!t) return { ok: false, why: ['type a message'], go: 'Send' };
        return { ok: true, why: [], text: t.startsWith('/') && !t.startsWith('//') ? `Run the command ${t.split(/\s/)[0]}.` : `Send to the ${LABEL[ch]} channel${ch === 'world' ? ': every house in every realm reads it' : ch === 'realm' ? ': every house in your realm reads it' : ': the houses of your state read it'}.`, go: 'Send' };
      },
      run: () => send(),
      update(c) {
        if (c.has('chat')) { const d = c.get('chat'); if (!d.length || d.some((x) => !x.channel || x.channel === ch)) render(false); seen(); }
        if (c.has('chat') || c.has('unread')) counts();
        if (c.has('timemode')) render(false);
      },
    };
  },
};

export default [heirs, recallHeir, leaveProtection, revive, chat];
