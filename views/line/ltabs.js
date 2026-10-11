// Straightline's tabs: a row of [role=tab] buttons over [data-panel] sections, the ARIA tabs pattern (←/→, Home,
// End), remembered in this browser. Markup: tabsHTML(); wiring: wireTabs(). The page keeps your scroll place.

/** The tab row. tabs: [[id, label]]; prefix: the page's id prefix (ids `${prefix}-tab-${id}`, panels `${prefix}-panel-${id}`). */
export const tabsHTML = (tabs, prefix, label) => `<div class="ltabs" role="tablist" aria-label="${label}">${tabs.map(([t, l]) =>
  `<button type="button" role="tab" id="${prefix}-tab-${t}" aria-controls="${prefix}-panel-${t}" data-tab="${t}">${l}</button>`).join('')}</div>`;
/** A panel's attributes. */
export const panelAttrs = (prefix, t) => `role="tabpanel" id="${prefix}-panel-${t}" aria-labelledby="${prefix}-tab-${t}" data-panel="${t}"`;

/** Wires the tabs inside host; opens the remembered (or first) one. onShow(id) runs after each switch. Returns { show, current }. */
export function wireTabs(host, on, { tabs, key, onShow = () => {} }) {
  let tab = tabs[0][0];
  try { const v = localStorage.getItem(key); if (tabs.some(([t]) => t === v)) tab = v; } catch { /* storage off */ }
  const bar = host.querySelector('[role=tablist]');
  function show(t, focus = false) {
    tab = t;
    try { localStorage.setItem(key, t); } catch { /* storage off */ }
    const main = host.closest('.line-main'), y = main?.scrollTop;
    bar.querySelectorAll('[role=tab]').forEach((b) => { const sel = b.dataset.tab === t; b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; });
    host.querySelectorAll(':scope [data-panel]').forEach((p) => { if (p.closest('[role=tabpanel]') === p) p.hidden = p.dataset.panel !== t; });
    if (main && y != null) main.scrollTop = y;
    if (focus) bar.querySelector(`[data-tab="${t}"]`)?.focus({ preventScroll: true });
    onShow(t);
  }
  on(bar, 'click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
  on(bar, 'keydown', (ev) => {
    const i = tabs.findIndex(([t]) => t === tab), n = tabs.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    show(tabs[j][0], true);
  });
  show(tab);
  return { show, current: () => tab };
}
