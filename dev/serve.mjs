// Development server: serves the lab's pages and forwards everything else to a game server.
//
//   npm run dev                   then open http://localhost:3400/
//
// If no game answers on GAME, it starts the local test world first (WORLD/start.sh, robots and all), so this
// one command is all the lab needs. Stopping this server leaves the game running.
//
//   PORT   listen port (default 3400)
//   GAME   game server (default http://127.0.0.1:3300), started with REALM_DEV_LOGIN=1
//   WORLD  the local test world's folder (default ~/realmstate-review); its start.sh runs the game
//
// Any file in this folder is served (not dev/ or hidden files); every other path (the API, /auth/*,
// the /live WebSocket) goes to the game, so the page is same-origin with the API and the session
// cookie just works. To try connect mode instead, open /?game=http://localhost:3300: the page then
// talks to the game directly, from another address, with a token.

import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync, openSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 3400);
const game = new URL(process.env.GAME || 'http://127.0.0.1:3300');
const world = process.env.WORLD || join(homedir(), 'realmstate-review');
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2',
};

async function serveFile(res, path) {
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) return void res.writeHead(403).end();
  try {
    const body = await readFile(file.endsWith('/') ? join(file, 'index.html') : file);
    res.writeHead(200, { 'content-type': types[extname(file) || '.html'] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

/** A file of the page's own: it exists here, outside dev/ and hidden paths. */
function isPageFile(path) {
  if (/(^|\/)\./.test(path) || path.startsWith('/dev/')) return false;
  const file = normalize(join(root, path));
  return file.startsWith(root) && existsSync(file) && statSync(file).isFile();
}

const server = http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/' || path === '/index.html') return serveFile(res, 'index.html');
  if (isPageFile(path)) return serveFile(res, path.slice(1));
  const up = http.request({ host: game.hostname, port: game.port, method: req.method, path: req.url, headers: { ...req.headers, host: game.host } }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => res.writeHead(502, { 'content-type': 'application/json' }).end('{"error":"game server not running"}'));
  req.pipe(up);
});

// WebSocket (/live): splice the raw sockets together after replaying the upgrade request.
server.on('upgrade', (req, socket, head) => {
  const up = net.connect(Number(game.port), game.hostname, () => {
    const headers = Object.entries({ ...req.headers, host: game.host }).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head.length) up.write(head);
    up.pipe(socket).pipe(up);
  });
  const close = () => { up.destroy(); socket.destroy(); };
  up.on('error', close);
  socket.on('error', close);
});

/** Whether the game answers. */
const gameUp = () => fetch(new URL('/world', game)).then((r) => r.ok, () => false);

/** Starts the local test world in the background (as its reset.sh does), and waits until it answers. */
async function startGame() {
  const local = ['127.0.0.1', 'localhost'].includes(game.hostname);
  if (!local || !existsSync(join(world, 'start.sh'))) {
    console.log(`No game at ${game.href}, and no test world to start (${join(world, 'start.sh')} not found). Start the game, then reload.`);
    return;
  }
  console.log(`Starting the game from ${world} ...`);
  const log = openSync(join(world, 'server.log'), 'a');
  const p = spawn('./start.sh', [], { cwd: world, detached: true, stdio: ['ignore', log, log] });
  writeFileSync(join(world, 'server.pid'), String(p.pid));
  p.unref();
  for (let i = 0; i < 40; i++) {
    if (await gameUp()) return void console.log('Game is up.');
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`The game didn't answer; see ${join(world, 'server.log')}.`);
}

if (!(await gameUp())) await startGame();
server.on('error', (e) => {
  console.log(e.code === 'EADDRINUSE' ? `Port ${port} is taken: the lab is probably already running at http://localhost:${port}/` : e.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => console.log(`Lab on http://localhost:${port}/ (game ${game.href})`));
