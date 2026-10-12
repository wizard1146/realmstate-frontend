# Realmstate War Room

The official player front end for Realmstate: five views (Straightline, the newcomer's default; War Room;
War Ring; Atlas; Map) over the game's public API. Read `README.md` first; `PLAN.md` says what each view is for.
It began in the lab (`../realmstate-lab`) and took over this repository on 2026-10-12.

Identity: **wizard1146** (`yellowhat1146@gmail.com`), SSH host alias `github-wizard1146`.
Remote: `git@github-wizard1146:wizard1146/realmstate-frontend.git` (branch `main`). Local git config is set.

**Running it:** `npm run dev` runs `dev/serve.mjs` on http://localhost:3400/, which starts the local game from
`~/realmstate-review` if none answers on 3300. Don't start servers on other ports.

Share logic, not panes. Game logic (sums, limits, reasons, words) lives in `core/` and every view uses it; each
view draws its own markup. Straightline is being moved off the War Room's panels page by page: a converted page
imports nothing from `views/room/`. Pages not yet converted still run War Room panes through `paneRunner`; don't
add new ones that way.

The game (engine, server, rules) is `../realmstate`; the wiki is `../realmstate-wiki`. Naming follows
the game: realms > states > houses, addresses `realm:state:house`. Never "kingdoms" or "provinces".

## Rules
- Plain ES modules, HTML and CSS. No build step, no framework, no runtime dependencies.
- Use only the public API (as the wiki's API for Tools page documents it), and keep both sign-in
  modes working: same address (cookie, through dev/serve.mjs) and connect mode (token, `?game=`). If the page needs
  something the API doesn't send, add it to the server, not a guess here.
- Read numbers the server derives (prices after modifiers, trait slots, flags) from the API; never
  recompute them from base rules. An estimate is marked ≈ and only for an old server.
- Hidden information stays hidden: show only what the API returns for the viewer.
- Every pane and control must work by keyboard; keep the existing ARIA patterns (`views/room/tabs.js`).
- `npm run check` must pass. Check changes in a real browser against a running game.
