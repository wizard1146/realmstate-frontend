// Remembered tabs for a pane and its detail view (SCI, MIL), the same way ACT does it: the pane
// header and the detail share one choice per browser; ←/→ (and Home/End) move between tabs.
const states = new Map();

/** A tab choice remembered in localStorage under `key`. */
export function tabState(key, list, labels) {
  if (states.has(key)) return states.get(key);
  let now = null;
  const watchers = new Set();
  const st = {
    /** Runs fn(t) whenever the choice changes (from the pane or the detail). Returns an unwatch. */
    watch(fn) { watchers.add(fn); return () => watchers.delete(fn); },
    key, list, labels,
    get() {
      if (!now) { try { now = localStorage.getItem(key); } catch { /* storage off */ } }
      if (!list.includes(now)) now = list[0];
      return now;
    },
    set(t) {
      if (!list.includes(t)) return;
      if (now === t) return;
      now = t;
      try { localStorage.setItem(key, t); } catch { /* storage off */ }
      watchers.forEach((fn) => fn(t));
    },
  };
  states.set(key, st);
  return st;
}

/** The tab buttons (role=tab). `p` prefixes ids: panels are `${p}-sec-${t}`. */
export const tabButtons = (st, p) => st.list.map((t) => `<button type="button" role="tab" data-tab="${t}" id="${p}-tab-${t}" aria-controls="${p}-sec-${t}">${st.labels[t]}</button>`).join('');
/** A panel's attributes: `<div ${panelAttrs(st, p, t)}>`. */
export const panelAttrs = (st, p, t) => `id="${p}-sec-${t}" role="tabpanel" aria-labelledby="${p}-tab-${t}" data-tabsec="${t}"${st.get() === t ? '' : ' hidden'}`;

/**
 * Wires a tablist `bar` whose panels live in `scope`. `on` registers listeners; onChange(t) runs
 * after a switch. Returns { sync(focus) } to redraw after the choice changed elsewhere.
 */
export function wireTabs(bar, scope, on, st, onChange) {
  function sync(focus) {
    const t = st.get();
    bar.querySelectorAll('[data-tab]').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.tab === t)); b.tabIndex = b.dataset.tab === t ? 0 : -1; });
    scope.querySelectorAll(':scope [data-tabsec]').forEach((x) => { if (x.closest('[role=tablist]') !== bar) x.hidden = x.dataset.tabsec !== t; });
    if (focus) bar.querySelector(`[data-tab="${t}"]`)?.focus();
  }
  // A change reaches every wired bar (this one too) through the watcher.
  const go = (t, focus) => { st.set(t); if (focus) sync(true); };
  const unwatch = st.watch(() => { if (bar.isConnected) { sync(); onChange?.(st.get()); } else unwatch(); });
  on(bar, 'click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
  on(bar, 'keydown', (ev) => {
    const n = st.list.length, i = st.list.indexOf(st.get());
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    go(st.list[j], true);
  });
  sync();
  return { sync, go };
}
