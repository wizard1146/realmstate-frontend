// The /live WebSocket: news, chat, ticks and resync, fed into the store.
// Owned by the shell, not by a view, so switching views never drops it.
import { liveUrl } from './api.js';
import { store, onTick, addNews, addChat, resync, setLive } from './store.js';

let ws = null;
let tries = 0;
let timer = 0;
let dropped = false;
/** How many times the socket has opened this page load (for checking that view switches don't reconnect). */
export let opens = 0;

export function connect() {
  if (ws || !store.house) return;
  setLive('connecting');
  const sock = new WebSocket(liveUrl());
  ws = sock;
  sock.onopen = () => {
    tries = 0; opens++;
    setLive('on');
    if (dropped) { dropped = false; resync(); } // we may have missed things while away
  };
  sock.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'tick') onTick(m.number, m.at, m.report);
    else if (m.type === 'news') addNews(m.news);
    else if (m.type === 'chat') addChat(m.message);
    else if (m.type === 'resync') resync();
  };
  sock.onerror = () => sock.close();
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null; dropped = true;
    setLive('off');
    if (!store.house) return;
    const wait = Math.min(30000, 1000 * 2 ** tries++); // 1s, 2s, 4s ... 30s
    clearTimeout(timer);
    timer = setTimeout(connect, wait);
  };
}

export function close() {
  clearTimeout(timer);
  const sock = ws;
  ws = null; tries = 0; dropped = false;
  if (sock) { sock.onclose = null; sock.close(); }
  setLive('off');
}

export const isOpen = () => !!ws && ws.readyState === WebSocket.OPEN;
