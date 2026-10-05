// The view switch: which views exist, the remembered choice, and the control both views show.
// Clicks on [data-switch-view] and the V key are handled once, by the shell (app.js).

export const VIEWS = [
  { id: 'room', label: 'War room' },
  { id: 'map', label: 'Map' },
];
const KEY = 'realmstate.view';

/** The remembered view for this browser; the War Room if none or storage is off. */
export function savedView() {
  try { const v = localStorage.getItem(KEY); return VIEWS.some((x) => x.id === v) ? v : 'room'; } catch { return 'room'; }
}
export function saveView(v) {
  try { localStorage.setItem(KEY, v); } catch { /* storage off: the choice lasts this page only */ }
}
export const otherView = (v) => (v === 'map' ? 'room' : 'map');

/** The control's markup. `current` is the active view's id. */
export function switchHTML(current) {
  return `<div class="vswitch" role="group" aria-label="View (press V to switch)">${VIEWS.map((v) =>
    `<button type="button" data-switch-view="${v.id}" aria-pressed="${v.id === current}">${v.label}</button>`).join('')}<kbd title="Press V to switch views" aria-hidden="true">V</kbd></div>`;
}
