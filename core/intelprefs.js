// Which buildings a survey shows at a glance (as a share of the house's land), chosen in Straightline's Configuration
// (Intrigue tab), kept in this browser. Straightline's report cards and the War Room's report list both use it.
import { store } from './store.js';

export const PINS = 'realmstate.line.intrigue.op.pins';
export const pins = () => { try { const v = JSON.parse(localStorage.getItem(PINS)); if (Array.isArray(v)) return v; } catch { /* storage off */ } return ['forts', 'watch_towers']; };
export const setPins = (v) => { try { localStorage.setItem(PINS, JSON.stringify(v)); } catch { /* storage off */ } };
/** A survey's chosen buildings: [[name, share of land (0–100, or null without land), count]]. */
export function pinnedShares(r) {
  const land = r.land || 0, bn = (id) => store.rules.buildings.find((b) => b.building === id)?.name || id;
  return pins().map((id) => { const n = r.buildings?.[id] || 0; return [bn(id), land ? (100 * n) / land : null, n]; });
}
