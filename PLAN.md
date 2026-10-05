# Realmstate Lab: five views, one skeleton

This repository is where the front end's alternative views are built and reshaped before they go back into
`../realmstate-frontend`. It began as a clone of the front end (full history, plus the `map` branch), so finished
work returns as an ordinary git merge, not copied files.

## The five views

| View | For | Shape |
|---|---|---|
| **Straightline** | beginners; the default for a new account | Utopia's original layout: a menu of pages down the side, one page at a time, one column |
| **War Room** | veterans | every pane on one dense screen (unchanged; the skeleton the others borrow from) |
| **War Ring** | politics | the 13 realms around a circle, states as segments, wars, ceasefires and hostility as lines across |
| **Atlas** | the size of things | realms, then states, then houses, each sized by land (a treemap) |
| **Map** | place | the hex world, heavily reworked (or cut back) |

Range (houses by size relative to yours, with the gains bands and travel time) is not a view of its own: it
becomes a lens inside Atlas or War Ring once the attack-range rule exists in the game.

## The skeleton: War Room parts, new UI around them

- **Panels.** The War Room's detail views (`views/room/detail.js`: orders, holdings, military, science, news, chat,
  state, ranks) are self-contained builders. Every view shows them as they are: Straightline as its pages,
  the world views as "in full" panels. Their look adapts through `.room-scope` and room.css's variables (see the
  Map's slate-and-brass block in `views/map/map.css`), not by forking their code.
- **One world shell** for War Ring, Atlas and Map: the HUD, the house / target / news / chat / state / ranks sheets,
  the dock, the panels in full. Only the picture in the middle differs, a *canvas* module with
  `mount(svg, ctx)`, `update(changes)`, `destroy()`. Clicking a house anywhere opens the same target sheet.
- **One world data layer** (`core/world.js`): every occupied state's houses, the standings, wars, ceasefires and
  relations, loaded once and refreshed each tick, read by every canvas. If ~90 requests a tick is too many, the
  fix is a server endpoint for every public house (an API addition in `../realmstate`, not a guess here).
- **One view switch** (`core/viewswitch.js`): all five, remembered per browser; V cycles.

## Order of work

1. View switch with the five views; Straightline as the default here.
2. Straightline: a side menu of pages, each page one War Room panel (or one tab of one), single column.
3. World shell out of `views/map/map.js`; the hex map becomes its first canvas.
4. War Ring canvas from the mock-up: real wars, ceasefires, hostility; click a state for its sheet.
5. Atlas canvas from the mock-up; Range as its lens when the attack-range rule lands.
6. Map: cut back hard (no blur, no looping animation, fewer marks), or drop it.

## Before a view ships

- Web fonts picked in a look lab (Straightline's defaults are Cinzel and Alegreya Sans) load from Google Fonts
  while we choose; the chosen faces get self-hosted (as the War Room's are) so a shipped page makes no outside requests.

## Going back to the front end

- The lab never pushes to the front end (its `frontend` remote has push disabled). To take the front end's
  newer work: `git fetch frontend && git merge frontend/main`.
- A view is ready when it's signed off by WY; then, in the front end: `git fetch ../realmstate-lab main`
  and merge (or a branch made from the lab's commits for that view), and the switch shows it to players.
- Until then, nothing here is merged anywhere.
