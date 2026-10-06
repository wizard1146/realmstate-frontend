// Staff: the age controls (GET /dev → can has plan_age and/or end_age). Plan the next age (its
// age file, number, name, start and any parameter overrides; the server compiles it and answers
// with a summary or every problem), drop the plan, end the age, and open the next one, after which
// the server starts again as the new world. Ending and opening can't be undone: each asks for the
// age number typed out, never a browser dialog. On a live game every action needs a note.
import { store, say, loadAge } from '../../core/store.js';
import { esc, fmt, fullTime } from '../../core/words.js';
import * as ages from '../../core/ages.js';

const utc = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const pad = (n) => String(n).padStart(2, '0');
/** ms -> the value of a datetime-local input, in the viewer's own zone. */
function localInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const localText = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
/** A length of time from ms: "1h", "90s", "3d 4h". */
function dur(ms) {
  if (ms % 3600000 === 0) return `${fmt(ms / 3600000)}h`;
  if (ms % 60000 === 0) return `${fmt(ms / 60000)}m`;
  return `${fmt(ms / 1000)}s`;
}
/** A typed override value as JSON: a number, true/false, JSON, else the text. */
function parseValue(t) {
  const s = String(t).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true' || s === 'false') return s === 'true';
  try { return JSON.parse(s); } catch { return s; }
}
/** The server's problems as a list (one string, lines, or an array). */
function problems(e) {
  if (Array.isArray(e?.data?.errors)) return e.data.errors.map((s) => String(s).trim()).filter(Boolean);
  const x = e?.data?.error ?? e?.message ?? String(e);
  const list = Array.isArray(x) ? x : String(x).split(/\n+|;\s+(?=[a-z_]+[: ])/i);
  return list.map((s) => String(s).trim()).filter(Boolean);
}

/** The compiled plan, as the server summarised it. */
function summaryHTML(c) {
  if (!c) return '';
  if (c.error) return `<div class="sf-bad" role="alert"><b>THE PLAN NO LONGER COMPILES</b><ul>${problems({ data: c }).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  const ov = Object.entries(c.params || {});
  return `<dl class="sf-sum">
    <dt>AGE</dt><dd>${fmt(c.age)}${c.name ? ` · ${esc(c.name)}` : ''}</dd>
    <dt>AGE FILE</dt><dd>${esc(c.ruleset)}${c.ruleset_hash ? ` <span class="dim small" title="${esc(c.ruleset_hash)}">#${esc(String(c.ruleset_hash).slice(0, 10))}</span>` : ''}</dd>
    <dt>STARTS</dt><dd>${esc(localText(c.start_at))} <span class="dim">your time</span><br><span class="dim">${esc(utc(c.start_at))}</span></dd>
    <dt>LENGTH</dt><dd>${fmt(c.age_ticks)} ticks of ${esc(dur(c.tick_ms))}</dd>
    ${c.ends_about ? `<dt>ENDS ABOUT</dt><dd>${esc(localText(c.ends_about))} <span class="dim">· ${esc(utc(c.ends_about))}</span></dd>` : ''}
    <dt>OVERRIDES</dt><dd>${ov.length ? ov.map(([k, v]) => `<code>${esc(k)} = ${esc(JSON.stringify(v))}</code>`).join(' ') : '<span class="dim">none</span>'}</dd>
  </dl>`;
}

/**
 * Mounts the staff age controls into `el`. access is GET /dev. `on` registers listeners.
 * Returns { refresh() }.
 */
export function mountStaff(el, access, on) {
  const can = new Set(access.can || []);
  const live = access.mode === 'live';
  let st = null;      // GET /dev/age
  let busy = false;

  const scalarParams = () => Object.entries(store.rules?.params || {}).filter(([, v]) => v === null || ['number', 'string', 'boolean'].includes(typeof v)).map(([k]) => k).sort();
  const note = () => el.querySelector('#sf-note')?.value.trim() || undefined;
  function needNote() {
    if (!live || note()) return false;
    say('Staff: write a note first (why); the audit log keeps it.', 'bad');
    el.querySelector('#sf-note')?.focus();
    return true;
  }

  function overrideRow(name = '', value = '') {
    const opts = scalarParams().map((k) => `<option value="${esc(k)}"${k === name ? ' selected' : ''}>${esc(k)}</option>`).join('');
    return `<div class="sf-ov"><select aria-label="Parameter to override"><option value="">(parameter)</option>${opts}</select>`
      + `<input aria-label="Value" value="${esc(value)}" placeholder="value"><button type="button" class="btn mini" data-ovdel aria-label="Remove this override">×</button></div>`;
  }

  function render() {
    const a = st;
    const running = a.started_at ? Date.now() >= a.started_at : true;
    const phase = a.ended ? 'ENDED' : running ? 'RUNNING' : 'NOT YET STARTED';
    const planOk = a.plan && a.plan_check && !a.plan_check.error;
    const p = a.plan;
    const startDefault = p?.start_at || Math.ceil((Date.now() + 86400000) / 3600000) * 3600000;
    el.innerHTML = `
      <p class="sf-who dim small">${live ? `Staff · ${esc(String(access.role || '').toUpperCase())} · live game: every action needs a note and is audited.` : 'Dev mode: anyone signed in may do this here.'}</p>
      <section class="sf-box"><h3 class="sub">THIS AGE</h3>
        <p><b>${esc(ages.ageName(a))}</b> · <span class="sf-phase ${a.ended ? 'end' : ''}">${phase}</span> · tick ${fmt(a.ticks)} of ${fmt(a.age_ticks)}${a.started_at ? ` · ${running ? 'started' : 'starts'} ${esc(fullTime(a.started_at))}` : ''}</p>
      </section>
      <p class="sf-note-row"><label for="sf-note">NOTE${live ? ' <span class="dim">(required)</span>' : ' <span class="dim">(optional here)</span>'}</label><input id="sf-note" autocomplete="off" placeholder="why: kept in the audit log"></p>
      ${can.has('plan_age') ? `
      <section class="sf-box"><h3 class="sub">NEXT AGE <span class="dim">${p ? 'planned' : 'not planned'}</span></h3>
        ${p ? `${summaryHTML(a.plan_check)}<p><button type="button" class="btn mini" id="sf-drop">DROP PLAN</button></p>` : '<p class="dim">No plan yet: the age after this one waits for one.</p>'}
        <form id="sf-plan" class="sf-form" novalidate>
          <label for="sf-rs">AGE FILE</label><select id="sf-rs" required>${(a.rulesets || []).map((r) => `<option${r === (p?.ruleset || a.rulesets.at(-1)) ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
          <label for="sf-num">NUMBER</label><input id="sf-num" type="number" min="${a.next_number}" value="${p?.number ?? a.next_number}" class="w5" inputmode="numeric">
          <label for="sf-name">NAME</label><input id="sf-name" maxlength="60" value="${esc(p?.name || '')}" placeholder="e.g. The Age of Iron" autocomplete="off">
          <label for="sf-start">STARTS</label><span class="sf-start"><input id="sf-start" type="datetime-local" required value="${localInput(startDefault)}" aria-describedby="sf-start-utc"><span class="dim small" id="sf-start-utc"></span></span>
          <span class="sf-lab">OVERRIDES</span><div id="sf-ovs" class="sf-ovs">${Object.entries(p?.params || {}).map(([k, v]) => overrideRow(k, typeof v === 'string' ? v : JSON.stringify(v))).join('')}<button type="button" class="btn mini" id="sf-ovadd">+ OVERRIDE</button><span class="dim small">Parameters from the rules (e.g. age_ticks, tick_ms); the age file's own values stand unless overridden.</span></div>
          <div class="sf-go"><button class="btn primary" id="sf-save">${p ? 'CHECK AND REPLACE PLAN' : 'CHECK AND SAVE PLAN'}</button></div>
          <div id="sf-out" class="sf-out" aria-live="polite"></div>
        </form>
      </section>` : ''}
      ${can.has('end_age') ? `
      <section class="sf-box danger"><h3 class="sub">END THIS AGE <span class="dim">can't be undone</span></h3>
        ${a.ended ? '<p class="dim">This age has ended.</p>' : `<p>Ends ${esc(ages.ageName(a))} now, as if its last tick had come: wars are settled, states scored, heirs kept. Players can no longer act.</p>
        <p class="sf-confirm"><label for="sf-end-c">Type <b>${a.age}</b> to confirm</label><input id="sf-end-c" inputmode="numeric" autocomplete="off" class="w5"><button type="button" class="btn danger" id="sf-end" disabled>END AGE ${a.age}</button></p>`}
      </section>
      <section class="sf-box danger"><h3 class="sub">OPEN THE NEXT AGE <span class="dim">archives this world; the server starts again</span></h3>
        ${!a.ended ? '<p class="dim">Possible once this age has ended.</p>' : !p ? '<p class="dim">Plan the next age first.</p>' : !planOk ? '<p class="dim">The plan has problems: fix it first.</p>' : `<p>Opens ${esc(a.plan_check.name || `Age ${a.plan_check.age}`)}: this world is archived and the server starts again as the new one. Players can found houses until its start.</p>`}
        <p class="sf-confirm"><label for="sf-open-c">Type <b>${p?.number ?? a.next_number}</b> to confirm</label><input id="sf-open-c" inputmode="numeric" autocomplete="off" class="w5"${a.ended && planOk ? '' : ' disabled'}><button type="button" class="btn danger" id="sf-open" disabled>OPEN AGE ${p?.number ?? a.next_number}</button></p>
        <div id="sf-wait" class="sf-wait" role="status" aria-live="polite"></div>
      </section>` : ''}`;
    showUtc();
  }
  function showUtc() {
    const i = el.querySelector('#sf-start');
    if (!i) return;
    const ms = i.value ? new Date(i.value).getTime() : NaN;
    el.querySelector('#sf-start-utc').textContent = Number.isFinite(ms) ? `= ${utc(ms)}${ms < Date.now() ? ' · in the past' : ''}` : 'pick a date and time';
  }

  async function refresh() {
    try { st = await ages.staffAge(); } catch (e) { el.innerHTML = `<p class="bad">Couldn't read the age controls: ${esc(e.message)}</p>`; return; }
    if (!st) { el.innerHTML = '<p class="dim">This server has no age controls.</p>'; return; }
    if (!busy) render();
  }

  on(el, 'input', (ev) => {
    if (ev.target.id === 'sf-start') showUtc();
    if (ev.target.id === 'sf-end-c') el.querySelector('#sf-end').disabled = ev.target.value.trim() !== String(st.age);
    if (ev.target.id === 'sf-open-c') el.querySelector('#sf-open').disabled = ev.target.value.trim() !== String(st.plan?.number ?? st.next_number);
  });
  on(el, 'submit', async (ev) => {
    if (ev.target.id !== 'sf-plan') return;
    ev.preventDefault();
    const out = el.querySelector('#sf-out');
    const startMs = new Date(el.querySelector('#sf-start').value).getTime();
    const params = {};
    const bad = [];
    el.querySelectorAll('.sf-ov').forEach((row) => {
      const k = row.querySelector('select').value, v = row.querySelector('input').value;
      if (!k && !v.trim()) return;
      if (!k) bad.push('Choose a parameter for each override (or remove the row).');
      else if (!v.trim()) bad.push(`Give ${k} a value.`);
      else params[k] = parseValue(v);
    });
    if (!Number.isFinite(startMs)) bad.push('Choose when the age starts.');
    if (bad.length) { out.innerHTML = `<div class="sf-bad" role="alert"><ul>${bad.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>`; return; }
    if (needNote()) return;
    const num = Number(el.querySelector('#sf-num').value);
    const body = { ruleset: el.querySelector('#sf-rs').value, name: el.querySelector('#sf-name').value.trim(), start_at: startMs, params, note: note() };
    if (num) body.number = num;
    const b = el.querySelector('#sf-save');
    b.disabled = true;
    out.innerHTML = '<p class="dim">Compiling the age…</p>';
    try {
      const c = await ages.planAge(body);
      say(`Planned ${c.name || `Age ${c.age}`}: starts ${utc(c.start_at)}.`, 'good');
      await refresh();
      loadAge();
      const o2 = el.querySelector('#sf-out');
      if (o2) o2.innerHTML = '<p class="good">Saved. The summary above is what the server compiled.</p>';
    } catch (e) {
      out.innerHTML = `<div class="sf-bad" role="alert"><b>NOT PLANNED</b> <span class="dim">the server found:</span><ul>${problems(e).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
      b.disabled = false;
    }
  });
  on(el, 'click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'sf-ovadd') { b.insertAdjacentHTML('beforebegin', overrideRow()); b.previousElementSibling.querySelector('select').focus(); return; }
    if (b.matches('[data-ovdel]')) { const row = b.closest('.sf-ov'); const next = row.nextElementSibling; row.remove(); next?.querySelector?.('select, button')?.focus() ?? el.querySelector('#sf-ovadd').focus(); return; }
    if (b.id === 'sf-drop') {
      if (needNote()) return;
      b.disabled = true;
      try { await ages.dropPlan(note()); say('The plan for the next age is dropped.', 'good'); } catch (e) { say(`Staff: ${e.message}`, 'bad'); }
      await refresh();
      loadAge();
      return;
    }
    if (b.id === 'sf-end') {
      if (needNote()) return;
      b.disabled = true;
      try {
        await ages.endAge(note());
        say(`${ages.ageName(st)} has ended.`, 'good');
      } catch (e) { say(`Staff: ${e.message}`, 'bad'); }
      // Reads are published views, a moment behind the command.
      await new Promise((r) => setTimeout(r, 500));
      await refresh();
      loadAge();
      return;
    }
    if (b.id === 'sf-open') {
      if (needNote()) return;
      b.disabled = true;
      const wait = el.querySelector('#sf-wait');
      const old = st.age;
      let r;
      try { r = await ages.openAge(note()); } catch (e) { say(`Staff: ${e.message}`, 'bad'); wait.textContent = problems(e).join(' '); b.disabled = false; return; }
      busy = true;
      const name = r.next?.name || `Age ${r.next?.age ?? ''}`.trim();
      const msg = r.restarting
        ? `This world is archived. The server is starting again as ${name}…`
        : `This world is archived. Start the server again to open ${name}; this page will notice.`;
      wait.textContent = msg;
      say(msg, 'good');
      const ok = await ages.waitForNewAge(old, { onWait: (s) => { wait.textContent = `${msg} (${s}s)`; } });
      busy = false;
      if (!ok) { wait.textContent = `${name} hasn't answered yet. This page keeps checking the age every half minute; reload when the server is back.`; return; }
      await refresh();
    }
  });

  refresh();
  return {
    refresh,
    /** The age ended (or a new one began) behind the form's back: read the controls again. */
    sync() { if (st && store.age && !busy && (store.age.ended !== st.ended || store.age.age !== st.age)) refresh(); },
  };
}
