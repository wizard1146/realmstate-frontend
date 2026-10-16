// Straightline's Targets: every house your state hexed, attacked or spied on lately, and any still under a hex your
// state landed, most recent first. Each row: the house; your state's hexes on it with the ticks they have left, and the
// hexes you watch that are missing (a click opens Rites on that hex and house); the last hex and attack; the server's
// rough defence from your state's newest muster or dossier; the newest intel of each kind (a click shows it); and
// Attack, Spy and Cast, which make it your target and open that page. Above: the hexes you watch, kept in your account.
// Logic: core/targets.js.
import { store, setTarget } from '../../core/store.js';
import { fmt, esc, addr, when, intelRows, REPORT_LABEL, names } from '../../core/words.js';
import { targets, watch, hexes, loadTargets, loadWatch, saveWatch, hexState, lastHexText, castOn } from '../../core/targets.js';

/** A target's hex chips: those in force (ticks left), then the watched ones missing, as buttons. */
export function chipsHTML(row) {
  const { on, missing } = hexState(row);
  return [
    ...on.map((x) => `<span class="tg-chip${x.warn ? ' warn' : ''}" title="${esc(x.name)} by ${esc(x.by.name)}, until tick ${fmt(x.until)}">${esc(x.name)} <b>${fmt(x.left)}t</b></span>`),
    ...missing.map((x) => `<button type="button" class="tg-chip miss" data-cast="${esc(x.id)}" data-id="${row.house.id}" title="Not on them: cast ${esc(x.name)}">${esc(x.name)} missing</button>`),
  ].join(' ');
}

export function mountTargets(host, on) {
  host.innerHTML = `<div class="lpart ltargets">
    <p class="what" id="lt-what"></p>
    <details class="mil-card tg-watch" id="lt-watch">
      <summary>Hexes you watch <span class="dim" id="lt-wsum"></span></summary>
      <p class="what">On each target, a hex you watch shows the ticks it has left, or that it's missing. Kept in your account, so it follows you to any browser.</p>
      <form id="lt-wf" novalidate>
        <fieldset class="tg-hexes"><legend class="vh">Hexes</legend><div id="lt-hexes"></div></fieldset>
        <div class="lform"><label for="lt-warn">Warn at</label><span class="field"><input id="lt-warn" type="number" min="0" step="1" inputmode="numeric"> ticks left</span>
          <span class="acts"><button class="btn primary" id="lt-wsave">Save</button></span></div>
      </form>
    </details>
    <div id="lt-list"></div>
    <dialog class="tg-dlg" id="lt-dlg" aria-labelledby="lt-dlg-h"><h3 class="sub" id="lt-dlg-h"></h3><div id="lt-dlg-b"></div>
      <form method="dialog"><button class="btn">Close</button></form></dialog>
  </div>`;
  const $ = (id) => host.querySelector(`#lt-${id}`);

  function drawWatch() {
    if (watch.missing) { $('watch').hidden = true; return; }
    const names = watch.hexes.map((id) => hexes().find((r) => r.id === id)?.name).filter(Boolean);
    $('wsum').textContent = names.length ? `(${names.join(', ')})` : '(none yet)';
    if (host.querySelector('#lt-wf').contains(document.activeElement)) return;   // not under someone choosing
    $('hexes').innerHTML = hexes().map((r) => `<label><input type="checkbox" value="${esc(r.id)}"${watch.hexes.includes(r.id) ? ' checked' : ''}> ${esc(r.name)}</label>`).join('');
    $('warn').value = String(watch.warn_ticks);
  }

  function draw() {
    if (!targets.loaded) { $('list').innerHTML = '<p class="dim">Reading your state\'s targets…</p>'; return; }
    if (targets.missing) { $('what').textContent = ''; $('list').innerHTML = '<p class="dim">This server doesn\'t list your state\'s targets yet.</p>'; return; }
    $('what').textContent = `Houses your state hexed, attacked or spied on in the last ${fmt(targets.window)} ticks, and any still under a hex of yours. Only what your state did or learned.`;
    const list = targets.list || [];
    if (!list.length) { $('list').innerHTML = '<p class="dim">None lately. Hex, attack or spy on a house and it shows here.</p>'; return; }
    $('list').innerHTML = `<div class="scrollx"><table class="tbl tg-tbl"><thead><tr>
        <th>House</th><th>Hexes of yours</th><th>Lately</th><th class="num">Defence</th><th>Intel</th><th><span class="vh">Act</span></th></tr></thead><tbody>
      ${list.map((r) => {
        const h = r.house, d = r.defense_estimate, a = r.last_attack;
        const lately = [lastHexText(r.last_hex), a ? `${names.attacks[a.kind] || a.kind || 'Attack'} by ${a.by.name}, ${when(a.at)}: ${a.success ? `won${a.land ? `, ${fmt(a.land)} acres` : ''}` : 'lost'}` : ''].filter(Boolean);
        return `<tr>
          <td><span class="tg-name">${esc(h.name)}</span> <span class="addr">${addr(h)}</span><br><span class="dim small">${fmt(h.land)} acres${h.protected ? ' · protected' : ''}</span></td>
          <td class="tg-hx">${chipsHTML(r) || '<span class="dim">none</span>'}</td>
          <td class="small">${lately.map(esc).join('<br>') || '<span class="dim">–</span>'}</td>
          <td class="num">${d ? `<span title="Their troops at home at their race's base defence, plus land, from your state's ${esc(d.from)} of ${esc(when(d.at))}; before every modifier">≈${fmt(d.value)}</span><br><span class="dim small">${esc(d.from)}</span>` : '<span class="dim">no muster</span>'}</td>
          <td>${Object.entries(r.intel || {}).map(([k, i]) => `<button type="button" class="tg-chip" data-intel="${h.id}" data-kind="${esc(k)}" title="${esc(when(i.at))}, by ${esc(i.by.name)}">${esc((REPORT_LABEL[k] || k).toLowerCase())}</button>`).join(' ') || '<span class="dim">–</span>'}</td>
          <td class="tg-acts"><button type="button" class="btn mini danger" data-go="attack" data-id="${h.id}">Attack…</button> <button type="button" class="btn mini" data-go="intrigue" data-id="${h.id}">Spy…</button> <button type="button" class="btn mini" data-go="rites" data-id="${h.id}">Cast…</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  const rowOf = (id) => (targets.list || []).find((r) => String(r.house.id) === String(id));
  on(host, 'click', (ev) => {
    const go = ev.target.closest('[data-go]'), cast = ev.target.closest('[data-cast]'), intel = ev.target.closest('[data-intel]');
    if (go) { setTarget(rowOf(go.dataset.id).house); if (go.dataset.go === 'rites') castOn(); location.hash = `#${go.dataset.go}`; }
    if (cast) { setTarget(rowOf(cast.dataset.id).house); castOn(cast.dataset.cast); location.hash = '#rites'; }
    if (intel) {
      const r = rowOf(intel.dataset.intel), i = r.intel[intel.dataset.kind];
      $('dlg-h').textContent = `${REPORT_LABEL[intel.dataset.kind] || intel.dataset.kind}: ${r.house.name} (${addr(r.house)})`;
      $('dlg-b').innerHTML = `<p class="dim small">${esc(when(i.at))}, by ${esc(i.by.name)}</p><table class="tbl"><tbody>${intelRows(i.report).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="${typeof v === 'number' ? 'num' : ''}">${esc(typeof v === 'number' ? fmt(v) : v)}</td></tr>`).join('')}</tbody></table>`;
      $('dlg').showModal();
    }
  });
  on($('wf'), 'submit', async (ev) => {
    ev.preventDefault();
    const list = [...$('hexes').querySelectorAll('input:checked')].map((i) => i.value);
    document.activeElement?.blur();
    $('wsave').disabled = true;
    try { await saveWatch(list, $('warn').value); } catch (e) { $('wsum').textContent = e.message; } finally { $('wsave').disabled = false; }
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
