# Realmstate: War Room

The official player front end for [Realmstate](https://github.com/wizard1146/realmstate), a
tick-based strategy game of realms, states and houses. Every pane on one dense screen: actions,
resources, military, news, chat, your state, the rankings and science.

It talks to the game only through the public HTTP API and the `/live` WebSocket, documented in the
wiki's [API for Tools](https://wizard1146.github.io/realmstate-wiki/api.html). Anything it does, your
own front end can do too.

## Run it

You need a game server and Node 20 or newer (only for the dev server; the page itself is plain files).

```sh
# In the game repo: a local world that allows sign-in by email alone.
REALM_DEV_LOGIN=1 cargo run --release -p realm-server      # game on 127.0.0.1:3300

# Here:
npm run dev        # or: node dev/serve.mjs                  then open http://localhost:3400/
```

`dev/serve.mjs` serves this folder and forwards everything else (the API, `/auth/*`, `/live`) to the
game, so the page and the API share one address. `PORT` and `GAME` change where it listens and
which game it talks to.

`npm run check` syntax-checks every file.

## Layout

| Path | What |
|---|---|
| `index.html`, `app.js`, `shell.css` | The page: sign-in, founding a house, then the War Room |
| `core/` | The store, the API and `/live` clients, commands, exact prices, wording |
| `views/room/` | The War Room: panes, detail views, the font and palette labs |
| `dev/` | The dev server and the check script |

No build step and no dependencies: the browser loads the ES modules as they are.
