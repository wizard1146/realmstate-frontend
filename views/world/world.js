// Atlas: a placeholder until its canvas is built (PLAN.md, step 5), so the view switch can reach every view.
// The War Ring has its own view (views/ring).
import { switchHTML } from '../../core/viewswitch.js';

const NAMES = { ring: 'War Ring', atlas: 'Atlas' };

export function mount(root, lens) {
  root.innerHTML = `<div class="world"><header class="world-top"><span class="brand">${NAMES[lens]}</span>${switchHTML(lens)}</header>
    <p class="world-soon">${NAMES[lens]} comes next: the world shell from the Map, with this canvas in the middle.</p></div>`;
  return { unmount() { root.replaceChildren(); } };
}
