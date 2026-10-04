# Realmstate War Room

The official player front end for Realmstate. Read `README.md` first.

Identity: **wizard1146** (`yellowhat1146@gmail.com`), SSH host alias `github-wizard1146`.
Remote: `git@github-wizard1146:wizard1146/realmstate-frontend.git` (branch `main`). Local git config is set.

The game (engine, server, rules) is `../realmstate`; the wiki is `../realmstate-wiki`. Naming follows
the game: realms > states > houses, addresses `realm:state:house`. Never "kingdoms" or "provinces".

## Rules
- Plain ES modules, HTML and CSS. No build step, no framework, no runtime dependencies.
- Use only the public API (as the wiki's API for Tools page documents it). If the page needs
  something the API doesn't send, add it to the server, not a guess here.
- Read numbers the server derives (prices after modifiers, trait slots, flags) from the API; never
  recompute them from base rules. An estimate is marked ≈ and only for an old server.
- Hidden information stays hidden: show only what the API returns for the viewer.
- Every pane and control must work by keyboard; keep the existing ARIA patterns (`views/room/tabs.js`).
- `npm run check` must pass. Check changes in a real browser against a running game.
