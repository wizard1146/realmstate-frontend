// Development server: serves the War Room and forwards everything else to a game server.
//
//   node dev/serve.mjs            then open http://localhost:3400/
//
//   PORT  listen port (default 3400)
//   GAME  game server (default http://127.0.0.1:3300), started with REALM_DEV_LOGIN=1
//
// Any file in this folder is served (not dev/ or hidden files); every other path (the API, /auth/*,
// the /live WebSocket) goes to the game, so the page is same-origin with the API and the session
// cookie just works. To try connect mode instead, open /?game=http://localhost:3300: the page then
// talks to the game directly, from another address, with a token.

import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 3400);
const game = new URL(process.env.GAME || 'http://127.0.0.1:3300');
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

server.listen(port, '127.0.0.1', () => console.log(`War Room on http://localhost:${port}/ -> game ${game.href}`));
