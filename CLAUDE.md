# Realmstate Lab

The prototype repository for the front end's five views (Straightline, War Room, War Ring, Atlas, Map). Read
`PLAN.md` first: what each view is for, the shared skeleton, the order of work, and how work goes back to the
front end. `README.md` still describes the front end this began as.

Identity: **wizard1146** (`yellowhat1146@gmail.com`), SSH host alias `github-wizard1146`. Local git config is set.
Remote `origin`: `git@github-wizard1146:wizard1146/realmstate-lab.git` (branch `main`).
The `frontend` remote is `../realmstate-frontend`, fetch only: the lab never pushes there. Take its newer work with
`git fetch frontend && git merge frontend/main`.

**Running it:** one way only. WY double-clicks **Realmstate Lab** in `Projects/dev` (built from
`dev/launch.applescript`; rebuild with the osacompile line at its top). It runs `dev/serve.mjs` on
http://localhost:3400/, which starts the local game from `~/realmstate-review` if none answers on 3300, then opens
the page. From a terminal it's `npm run dev`. Don't start servers on other ports.

Share logic, not panes. Game logic (sums, limits, reasons, words) lives in `core/` and every view uses it; each
view draws its own markup. Straightline is the newbie default and is being moved off the War Room's panels page by
page: a converted page imports nothing from `views/room/` (Land and Build are done: `core/land.js`, `core/does.js`).
Pages not yet converted still run War Room panes through `paneRunner`; don't add new ones that way.

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
