// The world views' shell (War Ring, Atlas): to be built out of views/map/map.js (see PLAN.md, steps 3-5).
// For now a placeholder, so the view switch can reach every view.
import { switchHTML } from '../../core/viewswitch.js';

const NAMES = { ring: 'War Ring', atlas: 'Atlas' };

export function mount(root, lens) {
  root.innerHTML = `<div class="world"><header class="world-top"><span class="brand">${NAMES[lens]}</span>${switchHTML(lens)}</header>
    <p class="world-soon">${NAMES[lens]} comes next: the world shell from the Map, with this canvas in the middle.</p></div>`;
  return { unmount() { root.replaceChildren(); } };
}
