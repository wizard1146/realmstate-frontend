// Which game this page plays.
//
//   ''                       the page's own address: the dev server (dev/serve.mjs) forwards the API.
//   'https://game.example'   another address: connect mode. The player allows this page on the
//                            game's own site and the page acts with the token it gets back.
//
// Served from this computer (the dev server), it is ''. Anywhere else (GitHub Pages), it is a game
// server on the player's own computer. ?game=<address> overrides it for a browser tab, e.g. a
// Cloudflare tunnel's address; an empty ?game= goes back.
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const GAME = local ? '' : 'http://localhost:3300';
