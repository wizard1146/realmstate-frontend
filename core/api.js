// Talking to the game server. Every request, the /live socket and connecting are built from API.
//
// Two ways to sign in, chosen by where the game is (config.js, or ?game= for this tab):
//  - same address: the game's session cookie, set by signing in on this page (dev sign-in);
//  - another address (connect mode): the player allows this page on the game's own site, which
//    sends back a token; every request carries it as Authorization: Bearer, never a cookie.
import { GAME } from '../config.js';

/** The game's address from ?game= (kept for this tab; an empty ?game= forgets it), or config.js. */
function chosenGame() {
  try {
    const q = new URLSearchParams(location.search).get('game');
    if (q) sessionStorage.setItem('realmstate.game', q);
    else if (q === '') sessionStorage.removeItem('realmstate.game');
    return sessionStorage.getItem('realmstate.game') ?? GAME;
  } catch { return GAME; }
}

let problem = '';
/** The base of the game's API: '' (this address) or an origin such as 'https://game.example'. */
export const API = (() => {
  const g = String(chosenGame() || '').trim().replace(/\/+$/, '');
  if (!g) return '';
  try {
    const u = new URL(g);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    return u.origin === location.origin ? '' : u.origin;
  } catch {
    problem = `The game address "${g}" isn't a web address; check config.js or ?game=.`;
    return '';
  }
})();
/** Why the configured game address can't be used ('' if fine): shown loudly by the page. */
export const configProblem = problem;
/** Connect mode: the game is on another address, so sign-in is a token. */
export const connected = API !== '';

// ---------- the token (connect mode) ----------
const TOKEN_KEY = `realmstate.token.${API}`;
const STATE_KEY = 'realmstate.connect.state';
export const token = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage off: lasts this page only */ mem = t; } },
  clear() { mem = null; try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage off */ } },
};
let mem = null;
const currentToken = () => token.get() ?? mem;

export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

/** Full URL for an API path such as '/me'. */
export const url = (path) => `${API}${path}`;

/**
 * The /live WebSocket URL. In connect mode it carries a one-use ticket (a WebSocket can't send
 * the token), so this asks the server for one first.
 */
export async function liveUrl() {
  const base = new URL(url('/live'), location.href);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  if (connected) base.searchParams.set('ticket', (await api('/live/ticket', {})).ticket);
  return base.href;
}

/**
 * GET when body is undefined, otherwise POST it as JSON (or `method`, e.g. 'DELETE', with the body).
 * Throws ApiError with the server's message (and its status, and `data`: the whole reply).
 */
export async function api(path, body, method) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t = connected ? currentToken() : null;
  if (t) headers.Authorization = `Bearer ${t}`;
  let res;
  try {
    res = await fetch(url(path), {
      method: method || (body === undefined ? 'GET' : 'POST'),
      credentials: connected ? 'omit' : 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the game server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && t) token.clear(); // the connection ended: connect again
  if (!res.ok) { const e = new ApiError(data.error || `${res.status} ${res.statusText}`, res.status); e.data = data; throw e; }
  return data;
}

export const command = (cmd) => api('/commands', cmd);
export const auth = {
  devLogin: (email) => api('/auth/dev', { email }),
  /** Same address: end the session. Connect mode: end this page's connection. */
  async logout() {
    if (!connected) return api('/auth/logout', {});
    try { if (currentToken()) await api('/auth/disconnect', {}); } finally { token.clear(); }
    return { ok: true };
  },
};

// ---------- connecting (connect mode) ----------
/** Sends the player to the game's own site to allow this page. */
export function startConnect() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try { sessionStorage.setItem(STATE_KEY, state); } catch { /* storage off: the answer can't be matched */ }
  const to = new URL(url('/auth/connect'), location.href);
  to.searchParams.set('site', location.origin);
  to.searchParams.set('return_to', location.origin + location.pathname + location.search);
  to.searchParams.set('state', state);
  location.assign(to.href);
}

/**
 * Takes the game's answer from the address (#token=...&state=... or #error=...), once, and
 * clears it from the address bar. Returns null (no answer), { ok: true } or { error }.
 */
export function finishConnect() {
  const h = location.hash.slice(1);
  if (!/(^|&)(token|error)=/.test(h)) return null;
  const p = new URLSearchParams(h);
  history.replaceState(null, '', location.pathname + location.search);
  let want = null;
  try { want = sessionStorage.getItem(STATE_KEY); sessionStorage.removeItem(STATE_KEY); } catch { /* storage off */ }
  if (!want || p.get('state') !== want) return { error: "That answer wasn't for this page; connect again." };
  if (p.get('error')) return { error: p.get('error') === 'denied' ? 'You chose not to connect.' : `The game said: ${p.get('error')}.` };
  token.set(p.get('token'));
  return { ok: true };
}
