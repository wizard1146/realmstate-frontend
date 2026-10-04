// Which game this page plays.
//
//   ''                       the page's own address: the dev server (dev/serve.mjs) forwards the API.
//   'https://game.example'   another address: connect mode. The player allows this page on the
//                            game's own site and the page acts with the token it gets back.
//
// For testing, ?game=<address> overrides it for this browser tab (an empty ?game= goes back).
export const GAME = '';
