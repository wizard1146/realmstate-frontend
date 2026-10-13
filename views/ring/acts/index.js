// The War Ring's actions: every command the game takes, each a form shown in the action window over the ring
// (views/ring/modal.js). The ring imports core/ only; each group's file draws its own compact markup.
//
// An action is a plain object:
//   id        unique, kebab-case ('explore', 'attack', 'set-tax')
//   group     a GROUPS id
//   name      short title ('Explore')
//   what      one line: what it does ('Claim new land; it arrives barren in 12 ticks')
//   wiki      a wiki page (with #anchor if useful), or ''
//   keys      extra search words for the command bar ('land acres settle')
//   target    true if it acts on store.target (the window shows the target, the ring previews the march)
//   badge()   optional: a few words for the group's list ('137 explorable', 'leader only'), or ''
//   mount(body, ctx) -> {
//     check()    -> { ok, why: [reasons it can't go yet], text: what it will do (plain words), go: button label,
//                     confirm: 'Confirm: …' for orders that can't be undone (a second press sends) or '' }
//     run(btn)   -> Promise: truthy when the order went (the window then closes, unless the action sets stay: true)
//     update(c)  optional: the store changed (c: Map of keys); redraw what depends on it (keep what's being typed)
//     destroy()  optional
//   }
//   stay      optional: keep the window open after a successful run (lists you act on several times)
//
// ctx, given to mount:
//   on(el, type, fn)  add a listener that ends when the window closes (always use it, never addEventListener)
//   refresh()         re-run check() now (the window also does so on every input/change inside body)
//   open(id, args)    open another action; args reach its mount as ctx.args
//   args              what the opener passed ({} if nothing)
//   preview(p)        light the ring behind: { states: ['r:s', …], march: ['r:s', 'r:s'] } or null
//   openState(key)    close the window and open a state on the ring
//   say(text, tone)   a line in the window's footer (tone 'bad' or ''), e.g. why MAX found nothing
//
// Markup: use the shared classes in ring.css (.ra-*): .ra-line (label + field), .ra-tbl (a table), .ra-in (number
// input + MAX), .ra-note (a muted line), .ra-grid (cards), .ra-seg (a segmented choice). Inputs: type=number,
// inputmode=numeric, with a <label>. Every control works by keyboard. Numbers come from core/ (never recomputed
// from base rules); a figure the page can only estimate is marked ≈.
import land from './land.js';
import military from './military.js';
import shadows from './shadows.js';
import magic from './magic.js';
import learning from './learning.js';
import statecraft from './statecraft.js';
import market from './market.js';
import house from './house.js';

/** The dock's groups: [id, label, glyph, what]. */
export const GROUPS = [
  ['land', 'Land', '▦', 'explore, build, raze'],
  ['military', 'Military', '⚔', 'train, attack, generals, upgrades'],
  ['shadows', 'Shadows', '◐', 'thieves\' operations, reports'],
  ['magic', 'Magic', '✶', 'rites, adepts, vigils'],
  ['learning', 'Learning', '✎', 'science, academics, Colloquium, quests'],
  ['state', 'State & war', '⚑', 'votes, tax, aid, war and peace, works, wonders'],
  ['market', 'Market & Hall', '⚖', 'materials, the Hall of Deeds'],
  ['house', 'Your house', '◈', 'heirs, protection, chat'],
];
export const ACTS = [...land, ...military, ...shadows, ...magic, ...learning, ...statecraft, ...market, ...house];
export const actById = (id) => ACTS.find((a) => a.id === id) || null;
export const actsOf = (g) => ACTS.filter((a) => a.group === g);
