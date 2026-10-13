// The War Ring's action window: every executable action opens here, over the ring (blurred behind, the move it
// previews lit on it). Three faces: a group's actions as cards (the dock), one action's form (acts/*.js), and the
// command bar (/): type an action, a state ("4 7"), a house ("4 7 2") or an order with its numbers ("explore 20",
// "build farms 30", "attack 4:7:2"). Back goes one step; Esc closes; focus returns where it came from.
import { store, setTarget, say } from '../../core/store.js';
import * as act from '../../core/actions.js';
import { esc, addr } from '../../core/words.js';
import { WIKI } from '../../core/wiki.js';
import { GROUPS, ACTS, actById, actsOf } from './acts/index.js';

const groupOf = (id) => GROUPS.find(([g]) => g === id) || [id, id, '·', ''];
const norm = (s) => String(s || '').toLowerCase();

/**
 * A button that asks twice: the first press arms it ("Confirm: ..."), a second within 5 s goes. Returns true on the
 * confirming press.
 */
export function twice(btn, confirmText) {
  if (btn.dataset.armed) { clearTimeout(Number(btn.dataset.armed)); disarm(btn); return true; }
  btn.dataset.label = btn.textContent;
  btn.textContent = confirmText;
  btn.classList.add('armed');
  btn.dataset.armed = String(setTimeout(() => disarm(btn), 5000));
  return false;
}
function disarm(btn) { if (!btn.dataset.armed) return; clearTimeout(Number(btn.dataset.armed)); delete btn.dataset.armed; btn.textContent = btn.dataset.label; btn.classList.remove('armed'); }

/** Why you can't act on a house, as far as the page can tell ('' if nothing stands out). */
export function blockOf(t) {
  const h = store.house;
  if (!t || !h) return '';
  if (t.id === h.id) return 'that is you';
  if (t.realm === h.realm && t.state === h.state) return 'a house of your own state';
  if (t.protected) return 'under protection';
  return '';
}

/**
 * The window. host: where the <dialog> goes; ring: { preview(p), openState(key), stateName(r, s) }.
 * Returns { open(id, args), group(g), bar(text), update(c), close(), get isOpen() }.
 */
export function makeModal(host, ring) {
  host.insertAdjacentHTML('beforeend', `<dialog class="ra" id="ra" aria-labelledby="ra-h">
    <header class="ra-head">
      <button type="button" class="ra-back" id="ra-back" aria-label="Back" title="Back (Alt+←)" hidden>‹</button>
      <div class="ra-titles"><p class="ra-kick" id="ra-kick"></p><h2 id="ra-h" tabindex="-1"></h2></div>
      <span class="ra-wikis" id="ra-wiki"></span>
      <button type="button" class="ra-x" data-close aria-label="Close (Esc)" title="Close (Esc)">×</button>
    </header>
    <div class="ra-tgt" id="ra-tgt" hidden></div>
    <div class="ra-body" id="ra-body"></div>
    <footer class="ra-foot" id="ra-foot" hidden>
      <p class="ra-msg" id="ra-msg" aria-live="polite"></p>
      <div class="ra-btns"><button type="button" class="rg-btn ghost" data-close>Cancel</button><button type="button" class="rg-btn" id="ra-go"></button></div>
    </footer>
  </dialog>`);
  const dlg = host.querySelector('#ra'), $ = (id) => dlg.querySelector(`#ra-${id}`);
  let stack = [], cur = null, ac = null, inst = null, opener = null, sayText = null;

  // ---------- open / close ----------
  function show() {
    if (!dlg.open) { opener = document.activeElement; dlg.showModal(); }
  }
  function close() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => {
    teardown(); stack = []; cur = null; ring.preview(null);
    if (opener?.isConnected) opener.focus();
  });
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg || ev.target.closest('[data-close]')) close();
  });
  $('back').addEventListener('click', back);
  dlg.addEventListener('keydown', (ev) => { if (ev.altKey && ev.key === 'ArrowLeft' && stack.length > 1) { ev.preventDefault(); back(); } });
  function back() {
    if (stack.length < 2) return;
    stack.pop();
    const v = stack.pop();
    go(v);
  }
  function teardown() { ac?.abort(); ac = null; try { inst?.destroy?.(); } catch (e) { console.error(e); } inst = null; sayText = null; }
  function go(v) {
    teardown();
    stack.push(v);
    cur = v;
    $('back').hidden = stack.length < 2;
    $('msg').textContent = ''; $('msg').className = 'ra-msg';
    ring.preview(null);
    if (v.mode === 'group') drawGroup(v.g);
    else if (v.mode === 'bar') drawBar(v.text || '', !!v.targetOnly);
    else drawAct(v.id, v.args || {});
    show();
  }

  // ---------- a group: its actions as cards ----------
  function drawGroup(g) {
    const [, label, glyph, what] = groupOf(g);
    dlg.dataset.mode = 'group';
    $('kick').textContent = 'Act';
    $('h').innerHTML = `<span class="ra-glyph" aria-hidden="true">${glyph}</span> ${esc(label)}`;
    $('wiki').innerHTML = '';
    $('tgt').hidden = true; $('foot').hidden = true;
    const list = actsOf(g);
    $('body').innerHTML = `<p class="ra-note">${esc(what[0].toUpperCase() + what.slice(1))}.</p>
      <div class="ra-grid ra-acts">${list.map((a) => { let b = ''; try { b = a.badge?.() || ''; } catch { /* data not in yet */ }
        return `<button type="button" class="ra-card" data-act="${esc(a.id)}"><span class="n">${esc(a.name)}${a.target ? ' <span class="ra-tg" title="Acts on your target">◎</span>' : ''}</span><span class="w">${esc(a.what)}</span>${b ? `<span class="b">${esc(b)}</span>` : ''}</button>`; }).join('')
        || '<p class="dim">Nothing here yet.</p>'}</div>`;
    ac = new AbortController();
    $('body').addEventListener('click', (ev) => { const c = ev.target.closest('[data-act]'); if (c) go({ mode: 'act', id: c.dataset.act, args: {} }); }, { signal: ac.signal });
    requestAnimationFrame(() => $('body').querySelector('[data-act]')?.focus());
  }

  // ---------- one action ----------
  function drawAct(id, args) {
    const a = actById(id);
    if (!a) { say(`No action "${id}".`, 'bad'); return; }
    const [, glabel] = groupOf(a.group);
    dlg.dataset.mode = 'act';
    $('kick').innerHTML = `<button type="button" class="ra-kl" data-group="${esc(a.group)}">${esc(glabel)}</button>`;
    $('h').textContent = a.name;
    $('wiki').innerHTML = a.wiki ? `<a class="rg-wiki" href="${WIKI}${esc(a.wiki)}" target="_blank" rel="noopener">How it works<span aria-hidden="true"> ↗</span><span class="vh"> (wiki, new tab)</span></a>` : '';
    $('foot').hidden = false;
    tgtStrip(a);
    ac = new AbortController();
    const on = (el, type, fn, o = {}) => el.addEventListener(type, fn, { signal: ac.signal, ...o });
    const ctx = {
      on, args, refresh,
      open: (id2, args2 = {}) => go({ mode: 'act', id: id2, args: args2 }),
      preview: (p) => ring.preview(p),
      openState: (k) => { close(); ring.openState(k); },
      say: (text, tone = '') => { sayText = text; $('msg').textContent = text; $('msg').className = `ra-msg ${tone}`; },
    };
    $('body').innerHTML = '';
    try { inst = a.mount($('body'), ctx); } catch (e) { console.error(e); $('body').innerHTML = `<p class="short">This form couldn't open: ${esc(e.message)}</p>`; inst = null; }
    on($('body'), 'input', refresh);
    on($('body'), 'change', refresh);
    on($('kick'), 'click', (ev) => { const b = ev.target.closest('[data-group]'); if (b) go({ mode: 'group', g: b.dataset.group }); });
    if (a.target) ring.preview(marchTo(store.target));
    refresh();
    requestAnimationFrame(() => ($('body').querySelector('input:not([type=hidden]), select, textarea, button') || $('h')).focus());
  }
  /** For actions on the target: who, and a field to change it. */
  function tgtStrip(a) {
    const el = $('tgt');
    el.hidden = !a.target;
    if (!a.target) return;
    const t = store.target, why = blockOf(t);
    el.innerHTML = `<span class="l">Target</span>${t ? `<b>${esc(t.name)}</b> <span class="dim">${addr(t)} · ${esc(ring.stateName(t.realm, t.state))}</span>${why ? ` <span class="short">${esc(why)}</span>` : ''}` : '<span class="dim">none yet</span>'}
      <form class="ra-tf" novalidate><label for="ra-taddr" class="vh">Target house, by address</label><input id="ra-taddr" placeholder="r:s:seat" inputmode="numeric" autocomplete="off" spellcheck="false" value="${t ? addr(t) : ''}"><button class="rg-btn ghost mini">Set</button></form>`;
    el.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { const h = await act.resolveAddress(el.querySelector('input').value.trim()); setTarget(h); } catch (e) { ctxSay(e.message, 'bad'); }
    });
  }
  const ctxSay = (text, tone) => { $('msg').textContent = text; $('msg').className = `ra-msg ${tone}`; };
  const marchTo = (t) => { const h = store.house; return t && h ? { states: [`${h.realm}:${h.state}`, `${t.realm}:${t.state}`], march: [`${h.realm}:${h.state}`, `${t.realm}:${t.state}`] } : null; };
  /** Re-reads the form: what it will do, or why not; the button. */
  function refresh() {
    if (!inst || cur?.mode !== 'act') return;
    let r;
    try { r = inst.check() || {}; } catch (e) { console.error(e); r = { ok: false, why: [e.message] }; }
    const go2 = $('go'), why = (r.why || []).filter(Boolean);
    if (!go2.dataset.armed) go2.textContent = r.go || 'Go';
    go2.disabled = !r.ok;
    go2.classList.toggle('danger', !!r.confirm);
    if (!r.ok && go2.dataset.armed) disarm(go2);
    if (sayText) return;
    $('msg').className = `ra-msg ${why.length ? 'bad' : ''}`;
    $('msg').textContent = why.length ? `Can't yet: ${why.join('; ')}.` : r.text || '';
    go2.dataset.confirm = r.confirm || '';
  }
  $('go').addEventListener('click', async () => {
    const go2 = $('go'), a = cur?.mode === 'act' && actById(cur.id);
    if (!a || !inst || go2.disabled) return;
    if (go2.dataset.confirm && !twice(go2, go2.dataset.confirm)) return;
    sayText = null;
    let out;
    try { out = await inst.run(go2); } catch (e) { console.error(e); ctxSay(e.message, 'bad'); return; }
    if (out && !a.stay) close();
    else if (out) refresh();
    else if (store.msg.tone === 'bad') ctxSay(store.msg.text, 'bad');
  });

  // ---------- the command bar ----------
  /** What a typed line can mean: [{ kind, label, sub, run }]. */
  function results(text, targetOnly = false) {
    const q = norm(text).trim(), out = [];
    const nums = q.match(/^(\d+)[\s:]+(\d+)(?:[\s:]+(\d+))?$/);
    if (nums) {
      const [, r, s, seat] = nums;
      if (seat) out.push({ label: `Target house ${r}:${s}:${seat}`, sub: 'then choose what to do to it', run: () => targetThen(`${r}:${s}:${seat}`) });
      out.push({ label: `Open state ${r}:${s}`, sub: ring.stateName(+r, +s), run: () => { close(); ring.openState(`${r}:${s}`); } });
    }
    const [word, ...rest] = q.split(/\s+/), tail = rest.join(' ');
    for (const a of ACTS) {
      if (targetOnly && !q && !a.target) continue;
      const hay = norm(`${a.name} ${a.keys || ''} ${a.what} ${groupOf(a.group)[1]}`);
      const name = norm(a.name);
      let score = 0;
      if (!q) score = 1;
      else if (name === q) score = 100;
      else if (name.startsWith(q)) score = 60;
      else if (word && (name.startsWith(word) || norm(a.keys).split(/\s+/).includes(word))) score = 40;
      else if (q.split(/\s+/).every((w) => hay.includes(w))) score = 20;
      if (!score) continue;
      out.push({ score, label: a.name, sub: `${groupOf(a.group)[1]} · ${a.what}`, run: () => go({ mode: 'act', id: a.id, args: argsFor(a, tail || (word && !name.startsWith(word) ? '' : '')) }) });
    }
    return out.sort((x, y) => (y.score || 200) - (x.score || 200)).slice(0, 12);
  }
  /** "20", "farms 30", "4:7:2": numbers and names after an action's word, as its args. */
  function argsFor(a, tail) {
    const args = {}, t = tail.trim();
    if (!t) return args;
    const n = t.match(/(\d+)\s*$/), addrM = t.match(/(\d+)[\s:]+(\d+)[\s:]+(\d+)/);
    if (addrM && a.target) { targetThen(`${addrM[1]}:${addrM[2]}:${addrM[3]}`, a.id); return args; }
    if (n) args.n = Number(n[1]);
    const word = t.replace(/\d+/g, '').trim();
    if (word) {
      const b = (store.rules.buildings || []).find((x) => norm(x.name).startsWith(word) || norm(x.building).startsWith(word));
      if (b) args.building = b.building;
      args.text = word;
    }
    return args;
  }
  async function targetThen(text, id = null) {
    try {
      const h = await act.resolveAddress(text);
      setTarget(h);
      go(id ? { mode: 'act', id, args: {} } : { mode: 'bar', text: '', targetOnly: true });
    } catch (e) { ctxSay(e.message, 'bad'); }
  }
  function drawBar(text, targetOnly = false) {
    dlg.dataset.mode = 'bar';
    $('kick').textContent = 'Command';
    $('h').textContent = targetOnly && store.target ? `What to do to ${store.target.name}?` : 'What now?';
    $('wiki').innerHTML = '';
    $('tgt').hidden = true; $('foot').hidden = true;
    $('body').innerHTML = `<div class="ra-bar"><label for="ra-q" class="vh">Type an action, a state or a house</label>
      <input id="ra-q" role="combobox" aria-expanded="true" aria-controls="ra-res" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="build farms 20 · attack 4:7:2 · 4 7 · explore max" value="${esc(text)}">
      <ul id="ra-res" class="ra-res" role="listbox" aria-label="Matches"></ul>
      <p class="ra-note">↑ ↓ choose · Enter opens · a number after an action fills it in (“explore 20”).</p></div>`;
    ac = new AbortController();
    const inp = $('body').querySelector('#ra-q'), ul = $('body').querySelector('#ra-res');
    let list = [], sel = 0;
    const paint = () => {
      ul.innerHTML = list.length ? list.map((r, i) => `<li role="option" id="ra-o${i}" aria-selected="${i === sel}" data-i="${i}"><span class="n">${esc(r.label)}</span><span class="w">${esc(r.sub || '')}</span></li>`).join('') : '<li class="dim" role="option" aria-disabled="true">Nothing matches.</li>';
      inp.setAttribute('aria-activedescendant', list.length ? `ra-o${sel}` : '');
      ul.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    };
    const find = () => {
      const t = inp.value;
      list = results(t, targetOnly);
      // "explore max": MAX right away.
      if (/\bmax\b/i.test(t)) list.forEach((r) => { const run = r.run; r.run = () => { run(); requestAnimationFrame(() => dlg.querySelector('#ra-body [data-max], #ra-body [aria-label^="Most you can"]')?.click()); }; });
      sel = 0; paint();
    };
    inp.addEventListener('input', find, { signal: ac.signal });
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(list.length - 1, sel + 1); paint(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); list[sel]?.run(); }
    }, { signal: ac.signal });
    ul.addEventListener('click', (ev) => { const li = ev.target.closest('[data-i]'); if (li) list[Number(li.dataset.i)]?.run(); }, { signal: ac.signal });
    find();
    requestAnimationFrame(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); });
  }

  return {
    open: (id, args = {}) => { stack = []; go({ mode: 'act', id, args }); },
    group: (g) => { stack = []; go({ mode: 'group', g }); },
    bar: (text = '') => { stack = []; go({ mode: 'bar', text }); },
    close,
    update(c) {
      if (!dlg.open || !cur) return;
      if (cur.mode === 'act') {
        if (c.has('target')) { const a = actById(cur.id); if (a?.target) { tgtStrip(a); ring.preview(marchTo(store.target)); } }
        try { inst?.update?.(c); } catch (e) { console.error(e); }
        refresh();
        if (c.has('msg') && store.msg.tone === 'bad' && store.msg.text) ctxSay(store.msg.text, 'bad');
      } else if (cur.mode === 'group' && (c.has('house') || c.has('state'))) {
        const f = document.activeElement?.dataset?.act;
        drawGroup(cur.g);
        if (f) dlg.querySelector(`[data-act="${CSS.escape(f)}"]`)?.focus();
      }
    },
    get isOpen() { return dlg.open; },
  };
}

