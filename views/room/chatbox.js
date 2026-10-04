// The war room's chat box: three channels (world, realm, state) as tabs over one list and one
// send box. Used by the CHAT pane and its detail view; both follow the same active channel and
// per-channel drafts (in the store), so switching in one switches the other.
import { store, notify, markRead, setClock, isUtc, CHANNELS } from '../../core/store.js';
import * as act from '../../core/actions.js';
import * as commands from '../../core/commands.js';
import { esc, hhmm, when, fullTime, zoneLabel, empty, fmt } from '../../core/words.js';

const KEY = 'realmstate.room.channel';
export const CH_LABEL = { world: 'WORLD', realm: 'REALM', state: 'STATE' };
const CH_WHO = { world: 'every house in every realm', realm: 'every house in your realm', state: 'the houses of your state' };

/** The active channel (remembered per browser; state by default). */
export function channel() {
  if (!store.chatChannel) {
    let v = 'state';
    try { v = localStorage.getItem(KEY) || 'state'; } catch { /* storage off */ }
    store.chatChannel = CHANNELS.includes(v) ? v : 'state';
  }
  return store.chatChannel;
}
export function setChannel(ch) {
  if (!CHANNELS.includes(ch) || ch === channel()) return;
  store.chatChannel = ch;
  try { localStorage.setItem(KEY, ch); } catch { /* storage off */ }
  notify('channel');
}

const where = (ch) => {
  const h = store.house;
  if (!h) return '';
  return ch === 'world' ? 'all realms' : ch === 'realm' ? `realm ${h.realm}` : `state ${h.realm}:${h.state}`;
};
const emptyText = (ch) => {
  const h = store.house;
  if (!store.chatsLoaded[ch]) return 'loading messages…';
  return ch === 'world' ? empty.channel.world : ch === 'realm' ? empty.channel.realm(h ? h.realm : '') : empty.channel.state(h ? `${h.realm}:${h.state}` : '');
};

/**
 * Builds a chat box into `box`. p: an id prefix ('r-c' for the pane, 'd-c' for the detail).
 * roomy: the detail view's wider rows (day and time). Returns { update(changes), focus() }.
 */
export function mountChat(box, on, { p, roomy = false }) {
  box.classList.add('cbox');
  box.innerHTML = `
    <div class="ch-bar">
      <div class="ch-tabs" role="tablist" aria-label="Chat channel">${CHANNELS.map((ch) => `
        <button type="button" role="tab" class="ch-tab" id="${p}-tab-${ch}" data-ch="${ch}" aria-controls="${p}-list">
          <span class="ch-name">${CH_LABEL[ch]}</span><span class="ch-n num" aria-hidden="true"></span><span class="vh ch-unread"></span>
        </button>`).join('')}
      </div>
      <button type="button" class="tz" id="${p}-tz" title="Times shown in UTC or your local time (also /time utc|local)"></button>
    </div>
    <p class="ch-where small" id="${p}-where"></p>
    <ol class="tape chat${roomy ? ' roomy' : ''}" id="${p}-list" role="tabpanel" tabindex="0"></ol>
    <form class="chat-f" id="${p}-f">
      <label class="vh" for="${p}-in" id="${p}-lbl">Message</label>
      <input id="${p}-in" maxlength="1000" autocomplete="off" required>
      <button class="btn ch-send">SEND</button>
    </form>`;
  const $ = (id) => box.querySelector(`#${p}-${id}`);
  const list = $('list');
  const input = $('in');
  let shown = null; // channel the list shows

  function li(m, ch) {
    const mine = store.house && m.house === store.house.id;
    const from = ch !== 'state' && m.from ? ` <span class="from">${esc(m.from)}</span>` : '';
    return `<li class="${mine ? 'me' : ''}"><time title="${esc(fullTime(m.at))}">${esc(roomy ? when(m.at) : hhmm(m.at))}</time><span><span class="who">${esc(m.name)}${from}: </span>${esc(m.text)}</span></li>`;
  }

  function tabs() {
    const cur = channel();
    box.dataset.channel = cur;
    box.querySelectorAll('.ch-tab').forEach((b) => {
      const ch = b.dataset.ch;
      const on2 = ch === cur;
      b.setAttribute('aria-selected', String(on2));
      b.tabIndex = on2 ? 0 : -1;
      const n = store.unread[ch] || 0;
      b.querySelector('.ch-n').textContent = n ? (n > 99 ? '99+' : String(n)) : '';
      b.querySelector('.ch-unread').textContent = n ? `, ${n} unread` : '';
      b.classList.toggle('has-unread', n > 0);
    });
    list.setAttribute('aria-labelledby', `${p}-tab-${cur}`);
    $('tz').textContent = zoneLabel().toUpperCase();
    $('tz').setAttribute('aria-label', `Times in ${zoneLabel()}; switch to ${isUtc() ? 'local time' : 'UTC'}`);
    const msgs = store.chats[cur];
    $('where').innerHTML = `<span class="ch-label">${CH_LABEL[cur]}</span> ${esc(where(cur))} <span class="dim">· read by ${CH_WHO[cur]} · ${fmt(msgs.length)} message${msgs.length === 1 ? '' : 's'} · times ${zoneLabel()}</span>`;
    $('lbl').textContent = `Message to the ${cur} channel (${where(cur)})`;
    input.placeholder = `say to ${CH_LABEL[cur]}… or /help`;
  }

  function render(force) {
    const cur = channel();
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const msgs = store.chats[cur];
    list.innerHTML = msgs.length ? msgs.slice(-200).map((m) => li(m, cur)).join('') : `<li class="empty">${esc(emptyText(cur))}</li>`;
    if (force || atBottom || shown !== cur) list.scrollTop = list.scrollHeight;
    shown = cur;
  }

  /** The box is on screen: the active channel counts as read. */
  function seen() {
    if (box.offsetParent !== null && !document.hidden) markRead(channel());
  }

  function syncInput() {
    if (document.activeElement !== input) input.value = store.drafts[channel()] || '';
  }

  // Tabs: click, or arrow keys along the tab list (roving focus).
  on(box.querySelector('.ch-tabs'), 'click', (ev) => {
    const b = ev.target.closest('[data-ch]');
    if (b) { setChannel(b.dataset.ch); }
  });
  on(box.querySelector('.ch-tabs'), 'keydown', (ev) => {
    const i = CHANNELS.indexOf(channel());
    let j = -1;
    if (ev.key === 'ArrowRight') j = (i + 1) % 3;
    else if (ev.key === 'ArrowLeft') j = (i + 2) % 3;
    else if (ev.key === 'Home') j = 0;
    else if (ev.key === 'End') j = 2;
    if (j < 0) return;
    ev.preventDefault();
    setChannel(CHANNELS[j]);
    box.querySelector(`[data-ch="${CHANNELS[j]}"]`).focus();
  });
  on($('tz'), 'click', () => setClock(!isUtc()));
  on(input, 'input', () => { store.drafts[channel()] = input.value; notify('draft'); });
  on(input, 'focus', () => commands.warm(), { once: true });
  on($('f'), 'submit', async (ev) => {
    ev.preventDefault();
    const b = ev.submitter; if (b) b.disabled = true;
    const ch = channel();
    if (await act.sendChat(input.value, ch)) {
      // A command (like /world) may have switched the channel: show that channel's draft.
      input.value = store.drafts[channel()] || '';
      notify('draft');
      render(true);
    }
    if (b) b.disabled = false;
    input.focus();
  });

  tabs(); render(true); syncInput();

  return {
    update(c) {
      const all = !c;
      if (all || c.has('channel')) { tabs(); render(true); syncInput(); seen(); tabs(); return; }
      if (c.has('chat')) {
        const cur = channel();
        if (c.get('chat').length === 0 || c.get('chat').some((d) => !d.channel || d.channel === cur)) render(false);
        seen();
      }
      if (c.has('chat') || c.has('unread') || c.has('timemode') || c.has('house') || c.has('clock')) tabs();
      if (c.has('timemode')) render(false);
      if (c.has('draft')) syncInput();
    },
    focus: () => input.focus(),
    input,
  };
}
