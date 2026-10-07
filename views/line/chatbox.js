// Straightline's chat box: a floating window over the page (Bitmex-style), not a page of its own. A Chat button
// (bottom right; C) opens it, and flashes while it's closed and new messages are waiting. Drag it by its title bar (or its grip with the arrow keys), resize it from the corner;
// where it sits and its size are remembered. Channels are tabs (World, Realm, State), or with Mix on, tickboxes:
// the ticked channels in one list, each line marked with its channel, and a "to" picker for sending.
// It stays open as you move between pages; only × (or Esc inside it, or C) closes it. Unread messages show on each
// channel as a count in brackets, and the channel flashes.
// Messages, unread counts, drafts and sending (slash commands too) are core's (store.js, actions.js).
import { store, markRead, CHANNELS } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as commands from '../../core/commands.js';
import { esc, hhmm, fullTime, empty } from '../../core/words.js';

const KEY = 'realmstate.line.chat';
const LABEL = { world: 'World', realm: 'Realm', state: 'State' };
const TAG = { world: 'W', realm: 'R', state: 'S' };
const MIN_W = 300, MIN_H = 260, GAP = 8;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

export function mountChatbox(root, on) {
  const saved = read();
  const st = {
    open: !!saved.open, mix: !!saved.mix,
    tab: CHANNELS.includes(saved.tab) ? saved.tab : 'state',
    picked: Array.isArray(saved.picked) && saved.picked.length ? saved.picked.filter((c) => CHANNELS.includes(c)) : [...CHANNELS],
    to: CHANNELS.includes(saved.to) ? saved.to : 'state',
    box: saved.box || null,   // { x, y, w, h } once moved or resized
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage off */ } };

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lchat-btn';
  btn.title = 'Chat (C)';
  btn.setAttribute('aria-controls', 'lchat');
  btn.innerHTML = '<span>Chat</span><b class="n"></b><span class="vh unread"></span>';

  const win = document.createElement('section');
  win.className = 'lchat';
  win.id = 'lchat';
  win.setAttribute('aria-label', 'Chat');
  win.innerHTML = `
    <header class="lc-bar">
      <button type="button" class="lc-grip" aria-label="Move the chat box (arrow keys)" title="Drag to move">⠿</button>
      <b class="lc-title">Chat</b>
      <span class="lc-tools">
        <button type="button" class="lc-tool" data-mix aria-pressed="false" title="Mix: several channels in one list">Mix</button>
        <button type="button" class="lc-tool" data-reset title="Back to its usual place and size">Reset</button>
        <button type="button" class="lc-tool" data-close aria-label="Close chat" title="Close (Esc)">×</button>
      </span>
    </header>
    <div class="lc-tabs" role="tablist" aria-label="Chat channel">${CHANNELS.map((c) =>
      `<button type="button" role="tab" id="lc-tab-${c}" data-ch="${c}" aria-controls="lc-list">${LABEL[c]}<span class="n"></span><span class="vh unread"></span></button>`).join('')}</div>
    <fieldset class="lc-picks" hidden><legend class="vh">Channels to show</legend>${CHANNELS.map((c) =>
      `<label class="ch-${c}"><input type="checkbox" value="${c}"><span class="dot" aria-hidden="true"></span>${LABEL[c]}<span class="n"></span><span class="vh unread"></span></label>`).join('')}</fieldset>
    <ol class="lc-list" id="lc-list" tabindex="0" aria-live="polite"></ol>
    <form class="lc-form" novalidate>
      <label class="vh" for="lc-to">Send to</label>
      <select id="lc-to" hidden>${CHANNELS.map((c) => `<option value="${c}">${LABEL[c]}</option>`).join('')}</select>
      <label class="vh" for="lc-in" id="lc-lbl">Message</label>
      <input id="lc-in" maxlength="1000" autocomplete="off">
      <button class="btn primary lc-send">Send</button>
    </form>`;
  root.append(btn, win);
  const $ = (s) => win.querySelector(s);
  const list = $('.lc-list'), input = $('#lc-in'), to = $('#lc-to');

  /** The channels the list shows, and the one a message goes to. */
  const shown = () => (st.mix ? st.picked : [st.tab]);
  const target = () => (st.mix ? st.to : st.tab);

  // ---------- where the box sits ----------
  function place() {
    if (!st.box) { win.style.left = win.style.top = win.style.right = win.style.bottom = ''; win.style.width = win.style.height = ''; return; }
    const w = Math.min(Math.max(st.box.w, MIN_W), innerWidth - GAP * 2), h = Math.min(Math.max(st.box.h, MIN_H), innerHeight - GAP * 2);
    const x = Math.min(Math.max(st.box.x, GAP), innerWidth - w - GAP), y = Math.min(Math.max(st.box.y, GAP), innerHeight - h - GAP);
    Object.assign(win.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto', width: `${w}px`, height: `${h}px` });
  }
  const here = () => { const r = win.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  on($('.lc-bar'), 'pointerdown', (ev) => {
    if (ev.button !== 0 || ev.target.closest('.lc-tool')) return;
    ev.preventDefault();
    const start = here(), x0 = ev.clientX, y0 = ev.clientY, bar = $('.lc-bar');
    bar.setPointerCapture(ev.pointerId);
    const move = (e) => { st.box = { ...start, x: start.x + e.clientX - x0, y: start.y + e.clientY - y0 }; place(); };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', () => { bar.removeEventListener('pointermove', move); save(); }, { once: true });
  });
  on($('.lc-grip'), 'keydown', (ev) => {
    const d = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    const b = st.box || here();
    st.box = { ...b, x: b.x + d[0], y: b.y + d[1] };
    place(); save();
  });
  // Resizing is the browser's own (the corner): when a press on the box ends with it a different size, keep that.
  on(win, 'pointerdown', (ev) => {
    if (ev.target.closest('.lc-bar')) return;
    const before = here();
    win.addEventListener('pointerup', () => { const b = here(); if (Math.abs(b.w - before.w) > 1 || Math.abs(b.h - before.h) > 1) { st.box = b; save(); } }, { once: true });
  });
  on(window, 'resize', () => { if (st.open && st.box) place(); });

  // ---------- open, close, pin, mix ----------
  function show(open, { focus = true } = {}) {
    st.open = open;
    win.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    save();
    if (open) { place(); render(true); seen(); if (focus) input.focus(); }
    counts();
  }
  function chrome() {
    $('[data-mix]').setAttribute('aria-pressed', String(st.mix));
    $('.lc-tabs').hidden = st.mix;
    $('.lc-picks').hidden = !st.mix;
    to.hidden = !st.mix;
    to.value = st.to;
    win.querySelectorAll('[role=tab]').forEach((b) => { const on2 = b.dataset.ch === st.tab; b.setAttribute('aria-selected', String(on2)); b.tabIndex = on2 ? 0 : -1; });
    win.querySelectorAll('.lc-picks input').forEach((i) => { i.checked = st.picked.includes(i.value); });
    list.setAttribute('aria-labelledby', st.mix ? '' : `lc-tab-${st.tab}`);
    $('#lc-lbl').textContent = `Message to ${LABEL[target()]}`;
    input.placeholder = `Say to ${LABEL[target()]}… or /help`;
    counts();
  }
  /** Unread counts: on the tabs or tickboxes, and the total on the Chat button. */
  function counts() {
    const n = (c) => store.unread[c] || 0;
    const fill = (el, c) => {
      el.querySelector('.n').textContent = n(c) ? ` (${n(c) > 99 ? '99+' : n(c)})` : '';
      el.querySelector('.unread').textContent = n(c) ? `, ${n(c)} unread` : '';
      el.classList.toggle('has-unread', n(c) > 0);
    };
    CHANNELS.forEach((c) => { fill(win.querySelector(`[role=tab][data-ch="${c}"]`), c); fill(win.querySelector(`.lc-picks .ch-${c}`), c); });
    const all = CHANNELS.reduce((a, c) => a + n(c), 0);
    btn.querySelector('.n').textContent = all ? (all > 99 ? '99+' : all) : '';
    btn.querySelector('.unread').textContent = all ? `, ${all} unread` : '';
    btn.classList.toggle('has-unread', all > 0);
    btn.classList.toggle('flash', all > 0 && !st.open);
  }
  on(btn, 'click', () => show(!st.open));
  on($('[data-close]'), 'click', () => { show(false); btn.focus(); });
  on($('[data-reset]'), 'click', () => { st.box = null; save(); place(); render(true); });
  on($('[data-mix]'), 'click', () => { st.mix = !st.mix; if (st.mix && !st.picked.includes(st.to)) st.to = st.tab; save(); chrome(); render(true); syncInput(); seen(); });
  on(win, 'keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); show(false); btn.focus(); } });
  on(document, 'keydown', (ev) => {
    const t = ev.target;
    if (ev.ctrlKey || ev.metaKey || ev.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
    if (ev.key === 'c' || ev.key === 'C') { ev.preventDefault(); if (st.open && !win.contains(t)) input.focus(); else show(!st.open); }
  });

  // ---------- channels ----------
  function pickTab(c, focus) { st.tab = c; save(); chrome(); render(true); syncInput(); seen(); if (focus) win.querySelector(`[role=tab][data-ch="${c}"]`).focus(); }
  on($('.lc-tabs'), 'click', (ev) => { const b = ev.target.closest('[data-ch]'); if (b) pickTab(b.dataset.ch); });
  on($('.lc-tabs'), 'keydown', (ev) => {
    const i = CHANNELS.indexOf(st.tab), n = CHANNELS.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    pickTab(CHANNELS[j], true);
  });
  on($('.lc-picks'), 'change', () => {
    const picked = [...win.querySelectorAll('.lc-picks input:checked')].map((i) => i.value);
    st.picked = picked.length ? picked : [st.to];   // never none: the last one stays ticked
    if (!st.picked.includes(st.to)) st.to = st.picked[0];
    save(); chrome(); render(true); syncInput(); seen();
  });
  on(to, 'change', () => { st.to = to.value; save(); chrome(); syncInput(); });

  // ---------- the list ----------
  function li(m, c) {
    const mine = store.house && m.house === store.house.id;
    const from = c !== 'state' && m.from ? ` <span class="from">${esc(m.from)}</span>` : '';
    const tag = st.mix ? `<span class="tag ch-${c}" title="${LABEL[c]}">${TAG[c]}</span>` : '';
    return `<li class="${mine ? 'me' : ''}">${tag}<time title="${esc(fullTime(m.at))}">${esc(hhmm(m.at))}</time> <span class="who">${esc(m.name)}${from}:</span> ${esc(m.text)}</li>`;
  }
  function emptyText() {
    const h = store.house, c = shown()[0];
    if (shown().some((x) => !store.chatsLoaded[x])) return 'Loading messages…';
    if (st.mix) return 'No messages in these channels yet.';
    return c === 'world' ? empty.channel.world : c === 'realm' ? empty.channel.realm(h ? h.realm : '') : empty.channel.state(h ? `${h.realm}:${h.state}` : '');
  }
  function render(force) {
    if (!st.open) return;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const msgs = shown().flatMap((c) => store.chats[c].map((m) => [m, c])).sort((a, b) => (a[0].at || 0) - (b[0].at || 0)).slice(-200);
    list.innerHTML = msgs.length ? msgs.map(([m, c]) => li(m, c)).join('') : `<li class="empty">${esc(emptyText())}</li>`;
    if (force || atBottom) list.scrollTop = list.scrollHeight;
  }
  /** The box is open and the page visible: what it shows counts as read. */
  function seen() { if (st.open && !document.hidden) shown().forEach(markRead); }
  on(document, 'visibilitychange', seen);

  // ---------- sending ----------
  function syncInput() { if (document.activeElement !== input) input.value = store.drafts[target()] || ''; }
  on(input, 'input', () => { store.drafts[target()] = input.value; });
  on(input, 'focus', () => commands.warm(), { once: true });
  on($('.lc-form'), 'submit', async (ev) => {
    ev.preventDefault();
    if (!input.value.trim()) return;
    const b = $('.lc-send');
    b.disabled = true;
    if (await act.sendChat(input.value, target())) { input.value = store.drafts[target()] || ''; render(true); }
    b.disabled = false;
    input.focus();
  });

  win.hidden = !st.open;
  btn.setAttribute('aria-expanded', String(st.open));
  chrome();
  if (st.open) { place(); render(true); syncInput(); seen(); }

  return {
    open() { show(true); },
    update(c) {
      if (c.has('chat')) { const ch = c.get('chat'); if (!ch.length || ch.some((d) => !d.channel || shown().includes(d.channel))) render(false); seen(); }
      if (c.has('chat') || c.has('unread')) counts();
      if (c.has('timemode')) render(false);
    },
    destroy() { btn.remove(); win.remove(); },
  };
}
