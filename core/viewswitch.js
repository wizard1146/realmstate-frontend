// The view switch: which views exist, the remembered choice, and the control every view shows.
// Changes on [data-switch-select] and the V key are handled once, by the shell (app.js).

export const VIEWS = [
  { id: 'line', label: 'Straightline' },   // Utopia's original layout; the beginner's default
  { id: 'room', label: 'War Room' },       // every pane on one screen; for veterans
  { id: 'ring', label: 'War Ring' },
  { id: 'atlas', label: 'Atlas' },
  { id: 'map', label: 'Map' },
];
export const DEFAULT_VIEW = 'line';
const KEY = 'realmstate.view';

/** The remembered view for this browser; Straightline if none or storage is off. */
export function savedView() {
  try { const v = localStorage.getItem(KEY); return VIEWS.some((x) => x.id === v) ? v : DEFAULT_VIEW; } catch { return DEFAULT_VIEW; }
}
export function saveView(v) {
  try { localStorage.setItem(KEY, v); } catch { /* storage off: the choice lasts this page only */ }
}
/** The view after `v`, for the V key (Shift+V goes back). */
export function nextView(v, back = false) {
  const i = VIEWS.findIndex((x) => x.id === v);
  return VIEWS[(i + (back ? VIEWS.length - 1 : 1)) % VIEWS.length].id;
}

/** The control's markup: a labelled menu of the views. `current` is the active view's id. */
export function switchHTML(current) {
  return `<label class="vswitch"><span class="vswitch-l">View</span><select data-switch-select aria-label="View (V for the next one)">${VIEWS.map((v) =>
    `<option value="${v.id}"${v.id === current ? ' selected' : ''}>${v.label}</option>`).join('')}</select><kbd title="V: next view, Shift+V: previous" aria-hidden="true">V</kbd></label>`;
}
