// Generals in the War Room: the shared maths are core/generals.js's (re-exported here, so the panes' imports stand);
// the MIL pane's tab state is the War Room's own.
import { tabState } from './tabs.js';

export * from '../../core/generals.js';
export const MIL_TAB = tabState('realmstate.room.mil', ['forces', 'generals', 'hall'], { forces: 'FORCES', generals: 'GENERALS', hall: 'HALL OF DEEDS' });
