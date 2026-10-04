// Talking to the game server. Every request, auth call and the /live socket URL is built from API.
//
// API is the base path of the game's HTTP API. Today the API sits at the root of the same origin
// (the proxy forwards it), so it is ''. If the engine moves under a prefix, change it here only,
// e.g. '/api' or 'https://game.example.com/api'.
export const API = '';

export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

/** Full URL for an API path such as '/me'. */
export const url = (path) => `${API}${path}`;

/** The /live WebSocket URL, derived from API (absolute or same-origin). */
export function liveUrl() {
  const base = new URL(url('/live'), location.href);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return base.href;
}

/** GET when body is undefined, otherwise POST it as JSON. Throws ApiError with the server's message. */
export async function api(path, body) {
  let res;
  try {
    res = await fetch(url(path), body === undefined ? { credentials: 'include' } : {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the game server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `${res.status} ${res.statusText}`, res.status);
  return data;
}

export const command = (cmd) => api('/commands', cmd);
export const auth = {
  devLogin: (email) => api('/auth/dev', { email }),
  logout: () => api('/auth/logout', {}),
};
