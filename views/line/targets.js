// Straightline's Targets: every house your state hexed, attacked or spied on lately, and any still under a hex your
// state landed. Two views, switched at the top and remembered: Matrix, one row a house (a column for each hex you
// watch: its ticks left as a bar, or Cast where it's missing; your other hexes; the rough defence; how old each kind of
// intel is; the last move; Attack, Spy, Cast), a row opening to its hexes on a short timeline and what happened lately;
// and Timeline, a lane a house across the window and the next 12 ticks (hexes as bars, attacks, intel and resisted hexes
// as marks). Above: counts of what needs you, and the hexes you watch (kept in your account). Logic: core/targets.js.
import { store, setTarget } from '../../core/store.js';
import { fmt, esc, addr, when, intelRows, REPORT_LABEL, names } from '../../core/words.js';
import { riteById, riteFor } from '../../core/rites.js';
import { targets, watch, hexes, loadTargets, loadWatch, saveWatch, hexState, castOn, INTEL_KINDS, ageOf, freshness, summary, byNeed } from '../../core/targets.js';

const KEY = 'realmstate.line.targets';
const AHEAD = 12;   // the timeline's ticks after now
const SHORT = { survey: 'Survey', muster: 'Muster', dossier: 'Dossier', ledgers: 'Ledgers', archives: 'Archives', couriers: 'Couriers', scrying: 'Scrying', omens: 'Omens', roads: 'Roads' };

/** A target's hex chips: those in force (ticks left), then the watched ones missing, as buttons. Rites uses them too. */
export function chipsHTML(row) {
  const { on, missing } = hexState(row);
  return [
    ...on.map((x) => `<span class="tg-chip${x.warn ? ' warn' : ''}" title="${esc(x.name)} by ${esc(x.by.name)}, until tick ${fmt(x.until)}">${esc(x.name)} <b>${fmt(x.left)}t</b></span>`),
    ...missing.map((x) => `<button type="button" class="tg-chip miss" data-cast="${esc(x.id)}" data-id="${row.house.id}" title="Not on them: cast ${esc(x.name)}">${esc(x.name)} missing</button>`),
  ].join(' ');
}

/** One event on a target, in words (HTML). */
export function eventText(e) {
  const by = esc(e.by?.name || 'someone');
  if (e.kind === 'hex') return `<b>${by}</b> cast ${esc(e.rite)}: ${!e.success ? '<span class="bad">resisted</span>' : e.reflected ? '<span class="bad">turned back</span>' : `<span class="good">landed</span>${e.until_tick ? `, until t${fmt(e.until_tick)}` : ''}`}`;
  if (e.kind === 'attack') return `<b>${by}</b> ${esc((names.attacks[e.attack] || e.attack || 'attacked').toLowerCase())}: ${e.success ? `<span class="good">won</span>${e.land ? `, ${fmt(e.land)} acres` : ''}` : '<span class="bad">lost</span>'}`;
  return `<b>${by}</b> read ${esc((SHORT[e.report] || e.report || 'a report').toLowerCase())}`;
}

export function mountTargets(host, on) {
  let view = 'matrix', open = null, editing = false;
  try { const s = JSON.parse(localStorage.getItem(KEY)) || {}; if (['matrix', 'timeline'].includes(s.view)) view = s.view; } catch { /* storage off */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ view })); } catch { /* storage off */ } };
  host.innerHTML = `<div class="lpart ltargets">
    <div class="tg-head">
      <p class="what" id="lt-what"></p>
      <div class="tg-ctl">
        <div class="tg-segs" role="group" aria-label="View"><button type="button" data-tgview="matrix">Matrix</button><button type="button" data-tgview="timeline">Timeline</button></div>
        <button type="button" class="btn" id="lt-wbtn" aria-expanded="false" aria-controls="lt-watch">Hexes I watch…</button>
      </div>
    </div>
    <section class="mil-card tg-watch" id="lt-watch" hidden>
      <p class="what">On each target, a hex you watch shows the ticks it has left, or that it's missing. Kept in your account, so it follows you to any browser.</p>
      <form id="lt-wf" novalidate>
        <fieldset class="tg-hexes"><legend class="vh">Hexes</legend><div id="lt-hexes"></div></fieldset>
        <div class="lform"><label for="lt-warn">Warn at</label><span class="field"><input id="lt-warn" type="number" min="0" step="1" inputmode="numeric"> ticks left</span>
          <span class="acts"><button class="btn primary" id="lt-wsave">Save</button></span></div>
      </form>
    </section>
    <dl class="st-glance tg-sum" id="lt-sum"></dl>
    <div id="lt-list"></div>
    <dialog class="tg-dlg" id="lt-dlg" aria-labelledby="lt-dlg-h"><h3 class="sub" id="lt-dlg-h"></h3><div id="lt-dlg-b"></div>
      <form method="dialog"><button class="btn">Close</button></form></dialog>
  </div>`;
  const $ = (id) => host.querySelector(`#lt-${id}`);

  // ---------- the hexes you watch ----------
  function drawWatch() {
    if (watch.missing) { $('wbtn').hidden = true; $('watch').hidden = true; return; }
    const n = watch.hexes.length;
    $('wbtn').textContent = n ? `Hexes I watch (${n})…` : 'Hexes I watch…';
    $('watch').hidden = !editing;
    $('wbtn').setAttribute('aria-expanded', String(editing));
    if ($('wf').contains(document.activeElement)) return;   // not under someone choosing
    $('hexes').innerHTML = hexes().map((r) => `<label><input type="checkbox" value="${esc(r.id)}"${watch.hexes.includes(r.id) ? ' checked' : ''}> ${esc(r.name)}</label>`).join('');
    $('warn').value = String(watch.warn_ticks);
  }

  // ---------- pieces ----------
  const full = (id) => { const r = riteById(id); return Math.max(1, (r && riteFor(r).ticks) || r?.ticks || 1); };
  const pill = (row, k, mark) => {
    const i = row.intel?.[k], age = i ? ageOf(i.tick) : null;
    return i ? `<button type="button" class="tg-age ${freshness(age)}" data-intel="${row.house.id}" data-kind="${esc(k)}" title="${esc(SHORT[k] || k)}, ${age == null ? esc(when(i.at)) : `${fmt(age)} tick${age === 1 ? '' : 's'} ago`}, by ${esc(i.by.name)}">${esc(mark)} ${age == null ? '✓' : `${fmt(age)}t`}</button>`
      : `<span class="tg-age none" title="No ${esc((SHORT[k] || k).toLowerCase())} in the window">${esc(mark)} –</span>`;
  };
  const intelCell = (row) => [...INTEL_KINDS.map(([k, m]) => pill(row, k, m)),
    ...Object.keys(row.intel || {}).filter((k) => !INTEL_KINDS.some(([x]) => x === k)).map((k) => pill(row, k, (SHORT[k] || k).slice(0, 3)))].join(' ');
  const acts = (h) => `<button type="button" class="btn mini danger" data-go="attack" data-id="${h.id}">Attack</button> <button type="button" class="btn mini" data-go="intrigue" data-id="${h.id}">Spy</button> <button type="button" class="btn mini" data-go="rites" data-id="${h.id}">Cast</button>`;
  const defence = (d) => (d ? `<span title="Their troops at home at their race's base defence, plus land, from your state's ${esc(d.from)}; before every modifier">≈${fmt(d.value)}</span>${d.tick != null ? ` <span class="tg-age ${freshness(ageOf(d.tick))}">${fmt(ageOf(d.tick))}t</span>` : ''}` : '<span class="dim small">no muster</span>');
  /** What a target needs, in a few words (the timeline's right-hand column). */
  function need(row) {
    const h = hexState(row), w = h.on.find((x) => x.warn);
    if (w) return `<span class="bad">${esc(w.name)} ${w.left <= 1 ? 'ends next tick' : `ends in ${fmt(w.left)}`}</span>`;
    if (h.missing.length) return `<span class="dim">${esc(h.missing.map((x) => x.name).join(', '))} missing</span>`;
    const ages = Object.values(row.intel || {}).map((i) => ageOf(i.tick)).filter((a) => a != null);
    return ages.length ? `<span class="dim">intel ${fmt(Math.min(...ages))} ticks old</span>` : '<span class="dim">no intel in the window</span>';
  }

  // ---------- matrix ----------
  /** A row's detail: its hexes on a short timeline (9 ticks back to 11 ahead), and what happened lately. */
  function detail(row, cols) {
    const t0 = store.tick - 9, span = 20, pos = (t) => Math.max(0, Math.min(100, ((t - t0) * 100) / span));
    const h = hexState(row), cast = (id) => (row.hexes_in_force || []).find((x) => x.rite_id === id)?.cast_tick ?? store.tick;
    const now = `<span class="tg-now" style="left:${pos(store.tick)}%"></span>`;
    const bars = [
      ...h.on.map((x) => `<div class="tg-hxr"><b>${esc(x.name)}</b><div class="tg-tl"><span class="tg-b${x.warn ? ' warn' : ''}" style="left:${pos(cast(x.id))}%;width:${Math.max(4, pos(x.until) - pos(cast(x.id)))}%">by ${esc(x.by.name)} · ${fmt(x.left)}t</span>${now}</div></div>`),
      ...h.missing.map((x) => `<div class="tg-hxr"><b>${esc(x.name)}</b><div class="tg-tl"><button type="button" class="tg-mb" data-cast="${esc(x.id)}" data-id="${row.house.id}">not on them: cast ${esc(x.name)}</button>${now}</div></div>`),
    ];
    // The same thing in the same tick, several times (a hex tried until it landed): one line, ×n.
    const log = [];
    for (const e of row.events || []) {
      const text = eventText(e), last = log[log.length - 1];
      if (last && last.tick === e.tick && last.text === text) last.n++;
      else if (log.length < 8) log.push({ tick: e.tick, text, n: 1 });
    }
    return `<tr class="tg-det"><td colspan="${cols}"><div class="tg-detin">
      <div><h4 class="sub">Hexes on them</h4>${bars.length ? `<div class="tg-ax"><span></span><div><span>t${fmt(t0)}</span><span class="now">now t${fmt(store.tick)}</span><span>t${fmt(t0 + span)}</span></div></div>${bars.join('')}` : '<p class="dim small">None of yours, and you watch no hexes.</p>'}</div>
      <div><h4 class="sub">Lately</h4>${log.length ? `<ul class="tg-log">${log.map((e) => `<li><span class="t">t${fmt(e.tick)}</span><span>${e.text}${e.n > 1 ? ` <span class="dim">×${e.n}</span>` : ''}</span></li>`).join('')}</ul>` : '<p class="dim small">Nothing in the window.</p>'}</div>
    </div></td></tr>`;
  }
  function matrix(list) {
    const w = watch.hexes.filter((id) => riteById(id));
    const cols = 7 + (w.length ? w.length + 1 : 1);
    const head = `<tr><th>House</th><th class="num">Land</th>${w.length ? w.map((id) => `<th>${esc(riteById(id).name)}</th>`).join('') + '<th>Other hexes</th>' : '<th>Your hexes</th>'}<th class="num">Defence</th><th>Intel age</th><th>Last move</th><th><span class="vh">Act</span></th></tr>`;
    const rows = list.map((row) => {
      const h = row.house, st = hexState(row), isOpen = open === h.id, last = (row.events || [])[0];
      const cells = w.length ? w.map((id) => {
        const x = st.on.find((o) => o.id === id);
        return `<td>${x ? `<span class="tg-bar${x.warn ? ' warn' : ''}" title="${esc(x.name)} by ${esc(x.by.name)}, until tick ${fmt(x.until)}"><i style="width:${Math.min(100, (100 * x.left) / full(id))}%"></i><span>${fmt(x.left)}t</span></span>`
          : `<button type="button" class="tg-miss" data-cast="${esc(id)}" data-id="${h.id}" aria-label="Cast ${esc(riteById(id).name)} on ${esc(h.name)}">Cast</button>`}</td>`;
      }).join('') + `<td>${st.on.filter((x) => !w.includes(x.id)).map((x) => `<span class="tg-chip">${esc(x.name)} <b>${fmt(x.left)}t</b></span>`).join(' ') || '<span class="dim">–</span>'}</td>`
        : `<td>${chipsHTML(row) || '<span class="dim">–</span>'}</td>`;
      return `<tr class="${isOpen ? 'open' : ''}">
        <td><button type="button" class="tg-name" data-open="${h.id}" aria-expanded="${isOpen}"><span class="caret" aria-hidden="true">${isOpen ? '▾' : '▸'}</span><span><b>${esc(h.name)}</b> <span class="addr">${addr(h)}</span>${h.protected ? ' <span class="dim small">protected</span>' : ''}</span></button></td>
        <td class="num">${fmt(h.land)}</td>${cells}
        <td class="num">${defence(row.defense_estimate)}</td>
        <td class="tg-ages">${intelCell(row)}</td>
        <td class="small tg-last">${last ? `t${fmt(last.tick)} · ${eventText(last)}` : '<span class="dim">–</span>'}</td>
        <td class="tg-acts">${acts(h)}</td></tr>${isOpen ? detail(row, cols) : ''}`;
    }).join('');
    return `${w.length ? '' : '<p class="dim small tg-hint">Choose <button type="button" class="tg-link" data-watch>hexes to watch</button> and each gets its own column: its ticks left, or Cast where it\'s missing.</p>'}
      <div class="scrollx"><table class="tbl tg-tbl"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      <p class="dim small">Open a house for its hexes and what happened lately. Intel age: S survey, M muster, D dossier, L ledgers; green within 3 ticks, gold within 11, grey older. Click an age to read it.</p>`;
  }

  // ---------- timeline ----------
  function timeline(list) {
    const t0 = targets.since, t1 = store.tick + AHEAD, span = Math.max(1, t1 - t0);
    const pos = (t) => ((Math.max(t0, Math.min(t1, t)) - t0) * 100) / span;
    const ticksAt = [0, 0.25, 0.5, 1].map((f) => Math.round(t0 + f * span));
    const axis = `<div class="tg-lg"><span></span><div class="tg-axis">${ticksAt.map((t) => `<span style="left:${pos(t)}%">t${fmt(t)}</span>`).join('')}<span class="now" style="left:${pos(store.tick)}%">now t${fmt(store.tick)}</span></div><span></span></div>`;
    const lanes = list.map((row) => {
      const h = row.house, st = hexState(row);
      // Hexes in force run to their end; landed lasting ones that ended in the window show faded.
      const live = (row.hexes_in_force || []).filter((x) => x.until_tick > store.tick);
      const ended = (row.events || []).filter((e) => e.kind === 'hex' && e.success && !e.reflected && e.until_tick && e.until_tick <= store.tick);
      const bar = (from, until, name, cls) => `<div class="tg-hx"><span class="tg-hb ${cls}" style="left:${pos(from)}%;width:${Math.max(1, pos(until) - pos(from))}%" title="${esc(name)}, t${fmt(from)} to t${fmt(until)}">${esc(name)}</span></div>`;
      const bars = [...live.map((x) => bar(x.cast_tick ?? store.tick, x.until_tick, x.rite, st.on.find((o) => o.id === x.rite_id)?.warn ? 'warn' : '')),
        ...ended.map((e) => bar(e.tick, e.until_tick, e.rite, 'past'))].join('');
      // One mark per kind of thing per tick (its words list each, ×n for repeats); kinds in one tick sit side by side.
      const groups = new Map();
      for (const e of (row.events || []).filter((x) => !(x.kind === 'hex' && x.success && !x.reflected && x.until_tick))) {
        const [cls, letter] = e.kind === 'attack' ? [e.success ? 'att-w' : 'att-l', 'A'] : e.kind === 'intel' ? ['spy', 'S'] : [e.success && !e.reflected ? 'hexl' : 'res', 'H'];
        const key = `${e.tick}:${cls}`, text = eventText(e).replace(/<[^>]+>/g, '');
        if (!groups.has(key)) groups.set(key, { tick: e.tick, cls, letter, texts: new Map() });
        const g = groups.get(key);
        g.texts.set(text, (g.texts.get(text) || 0) + 1);
      }
      const nth = new Map();
      const marks = [...groups.values()].map((g) => {
        const i = nth.get(g.tick) || 0;
        nth.set(g.tick, i + 1);
        const words = `t${g.tick}: ${[...g.texts].map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join('; ')}`;
        return `<span class="tg-mk ${g.cls}" style="left:calc(${pos(g.tick)}% - ${i * 20}px)" tabindex="0" role="img" aria-label="${esc(words)}" title="${esc(words)}">${g.letter}</span>`;
      }).join('');
      return `<div class="tg-lg tg-lane">
        <div><b>${esc(h.name)}</b> <span class="addr">${addr(h)}</span><br><span class="dim small">${fmt(h.land)} acres${row.defense_estimate ? ` · ≈${fmt(row.defense_estimate.value)} def` : ''}</span></div>
        <div class="tg-track" style="--now:${pos(store.tick)}%">${bars || '<div class="tg-hx"></div>'}<div class="tg-ev">${marks}</div><span class="tg-nowl"></span></div>
        <div class="tg-need"><span class="small">${need(row)}</span><button type="button" class="btn mini" data-go="rites" data-id="${h.id}">Cast…</button></div></div>`;
    }).join('');
    return `<div class="tg-legend"><span><span class="sw ok"></span>hex in force</span><span><span class="sw warn"></span>a watched hex ending soon</span><span><span class="sw past"></span>ended</span>
        <span><span class="tg-mk att-w">A</span>attack won</span><span><span class="tg-mk att-l">A</span>lost</span><span><span class="tg-mk spy">S</span>intel</span><span><span class="tg-mk hexl">H</span>hex landed</span><span><span class="tg-mk res">H</span>resisted</span></div>
      <div class="scrollx"><div class="tg-tlwrap">${axis}${lanes}</div></div>
      <p class="dim small">The last ${fmt(targets.window)} ticks left of the gold line, the next ${AHEAD} right of it. Hover or focus a mark for who did it and what came of it.</p>`;
  }

  // ---------- the page ----------
  function draw() {
    host.querySelectorAll('[data-tgview]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tgview === view)));
    if (!targets.loaded) { $('list').innerHTML = '<p class="dim">Reading your state\'s targets…</p>'; return; }
    if (targets.missing) { $('what').textContent = ''; $('sum').hidden = true; $('list').innerHTML = '<p class="dim">This server doesn\'t list your state\'s targets yet.</p>'; return; }
    $('what').textContent = `Houses your state hexed, attacked or spied on in the last ${fmt(targets.window)} ticks, and any still under a hex of yours. Only what your state did or learned.`;
    const list = byNeed(targets.list || []), s = summary(list);
    const card = (v, label, bad) => `<div class="${bad && v ? 'bad' : ''}"><dt>${label}</dt><dd>${fmt(v)}</dd></div>`;
    $('sum').hidden = !list.length;
    $('sum').innerHTML = card(s.count, 'Targets') + card(s.ending, `Watched hexes ending (${fmt(watch.warn_ticks)}t or less)`, true) + card(s.missing, 'Watched hexes missing', true) + card(s.stale, 'Intel 12+ ticks old');
    if (!list.length) { $('list').innerHTML = '<p class="dim">None lately. Hex, attack or spy on a house and it shows here.</p>'; return; }
    $('list').innerHTML = view === 'timeline' ? timeline(list) : matrix(list);
  }

  const rowOf = (id) => (targets.list || []).find((r) => String(r.house.id) === String(id));
  on(host, 'click', (ev) => {
    const v = ev.target.closest('[data-tgview]'), go = ev.target.closest('[data-go]'), cast = ev.target.closest('[data-cast]'), intel = ev.target.closest('[data-intel]'), op = ev.target.closest('[data-open]');
    if (v) { view = v.dataset.tgview; save(); draw(); return; }
    if (ev.target.closest('#lt-wbtn, [data-watch]')) { editing = ev.target.closest('[data-watch]') ? true : !editing; drawWatch(); if (editing) $('hexes').querySelector('input')?.focus(); return; }
    if (op) { const id = Number(op.dataset.open); open = open === id ? null : id; draw(); host.querySelector(`[data-open="${id}"]`)?.focus(); return; }
    if (go) { setTarget(rowOf(go.dataset.id).house); if (go.dataset.go === 'rites') castOn(); location.hash = `#${go.dataset.go}`; }
    if (cast) { setTarget(rowOf(cast.dataset.id).house); castOn(cast.dataset.cast); location.hash = '#rites'; }
    if (intel) {
      const r = rowOf(intel.dataset.intel), i = r.intel[intel.dataset.kind];
      $('dlg-h').textContent = `${REPORT_LABEL[intel.dataset.kind] || intel.dataset.kind}: ${r.house.name} (${addr(r.house)})`;
      $('dlg-b').innerHTML = `<p class="dim small">${i.tick != null ? `Tick ${fmt(i.tick)}, ` : ''}${esc(when(i.at))}, by ${esc(i.by.name)}</p><table class="tbl"><tbody>${intelRows(i.report).map(([k, val]) => `<tr><th scope="row">${esc(k)}</th><td class="${typeof val === 'number' ? 'num' : ''}">${esc(typeof val === 'number' ? fmt(val) : val)}</td></tr>`).join('')}</tbody></table>`;
      $('dlg').showModal();
    }
  });
  on($('wf'), 'submit', async (ev) => {
    ev.preventDefault();
    const list = [...$('hexes').querySelectorAll('input:checked')].map((i) => i.value);
    document.activeElement?.blur();
    $('wsave').disabled = true;
    try { await saveWatch(list, $('warn').value); editing = false; drawWatch(); } catch (e) { $('what').textContent = e.message; } finally { $('wsave').disabled = false; }
  });

  let reading = 0;
  const reload = () => { clearTimeout(reading); reading = setTimeout(() => loadTargets().catch(() => {}), 300); };
  if (!watch.loaded) loadWatch().catch(() => {});
  loadTargets().catch(() => {});
  drawWatch(); draw();
  return {
    update(c) {
      if (!c) { draw(); return; }
      if (c.has('watch') || c.has('rules')) { drawWatch(); draw(); }
      if (c.has('targets')) draw();
      // Ticks count hexes down (the next read brings what changed); your own hexes and attacks bring a read at once.
      if (c.has('tick')) { draw(); reload(); }
      if (c.has('news') && c.get('news').some((d) => ['hex_cast', 'attack_report'].includes(d?.added?.type))) reload();
      if (c.has('reports')) reload();
    },
    tick() {},
    destroy() { clearTimeout(reading); host.replaceChildren(); },
  };
}
