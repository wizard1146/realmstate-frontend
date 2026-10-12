// Which game this page plays.
//
//   ''                       the page's own address: the dev server (dev/serve.mjs) forwards the API.
//   'https://game.example'   another address: connect mode. The player allows this page on the
//                            game's own site and the page acts with the token it gets back.
//
// Served from this computer (the dev server), it is ''. From play.realmstate.net, the live game at
// realmstate.net. Anywhere else (a copy on GitHub Pages), a game server on the player's own computer.
// ?game=<address> overrides it for a browser tab, e.g. a Cloudflare tunnel's address; an empty
// ?game= goes back.
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const LIVE = { 'play.realmstate.net': 'https://realmstate.net' };
export const GAME = local ? '' : LIVE[location.hostname] || 'http://localhost:3300';
