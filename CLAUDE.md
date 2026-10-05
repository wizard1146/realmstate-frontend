# Realmstate Lab

The prototype repository for the front end's five views (Straightline, War Room, War Ring, Atlas, Map). Read
`PLAN.md` first: what each view is for, the shared skeleton, the order of work, and how work goes back to the
front end. `README.md` still describes the front end this began as.

Identity: **wizard1146** (`yellowhat1146@gmail.com`). Local git config is set. No GitHub remote yet.
The `frontend` remote is `../realmstate-frontend`, fetch only: the lab never pushes there. Take its newer work with
`git fetch frontend && git merge frontend/main`.

Build on the War Room's panels (`views/room/`) rather than forking them; adapt their look through `.room-scope`.

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
