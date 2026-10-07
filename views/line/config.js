// Straightline's Configuration: how the game looks and reads for you, kept in this browser. The look (theme,
// ornaments, fonts) is looklab's, the same settings as the header's palette and Aa panels; times in UTC or your
// own zone are core's (store.js).
import { setClock, isUtc } from '../../core/store.js';
import { esc } from '../../core/words.js';
import { THEMES, HEADS, BODIES, look, setLook, FONT_DEFAULTS } from './looklab.js';
import { UPGRADES_KEY, upgradeRows, GLYPH_KEY, throneGlyph } from './throne.js';

export function mountConfig(host, on) {
  host.innerHTML = `<div class="lpart lconfig">
    <section><h3 class="sub">Theme</h3>
      <fieldset class="cf-themes"><legend class="vh">Theme</legend>${THEMES.map(([id, name, sw]) =>
        `<label class="cf-theme"><input type="radio" name="cf-theme" value="${id}"><span>${esc(name)}</span><span class="chips" aria-hidden="true">${sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span></label>`).join('')}</fieldset>
      <label class="cf-check"><input type="checkbox" id="cf-orn"> Ornaments: framed corners and ruled headings</label></section>
    <section><h3 class="sub">Fonts</h3>
      <div class="cf-grid">
        <label for="cf-head">Headings</label><select id="cf-head">${HEADS.map((f) => `<option>${esc(f.name)}</option>`).join('')}</select>
        <label for="cf-body">Text</label><select id="cf-body">${BODIES.map((f) => `<option>${esc(f.name)}</option>`).join('')}</select>
        <label for="cf-size">Size</label><span><input id="cf-size" type="range" min="13" max="19" step="1"> <output id="cf-size-o"></output></span>
      </div>
      <p class="cf-specimen"><span class="h">The Crown of Valmark</span><br>Gold 1,234,567 · Land 430 acres · Might 80,904</p>
      <button type="button" class="btn" id="cf-reset">Default fonts</button></section>
    <section><h3 class="sub">Throne</h3>
      <label class="cf-check"><input type="checkbox" id="cf-glyph"> A faint throne in the background of the page</label>
      <label class="cf-check"><input type="checkbox" id="cf-upg"> List upgraded units on rows of their own (otherwise each is counted in with its base unit, marked *)</label></section>
    <section><h3 class="sub">Times</h3>
      <fieldset class="cf-clock"><legend class="vh">Show times in</legend>
        <label><input type="radio" name="cf-clock" value="utc"> UTC, the game's own clock</label>
        <label><input type="radio" name="cf-clock" value="local"> Your local time</label></fieldset></section>
    <p class="dim small">These settings are kept in this browser only.</p>
  </div>`;
  const $ = (id) => host.querySelector(`#cf-${id}`);

  function fill() {
    const l = look();
    host.querySelectorAll('input[name="cf-theme"]').forEach((i) => { i.checked = i.value === l.theme; });
    $('orn').checked = l.ornaments;
    $('head').value = l.fonts.head; $('body').value = l.fonts.body; $('size').value = l.fonts.size; $('size-o').textContent = `${l.fonts.size}px`;
    $('upg').checked = upgradeRows();
    $('glyph').checked = throneGlyph();
    host.querySelectorAll('input[name="cf-clock"]').forEach((i) => { i.checked = (i.value === 'utc') === isUtc(); });
  }
  on(host, 'change', (ev) => {
    const t = ev.target;
    if (t.name === 'cf-theme') setLook({ theme: t.value });
    else if (t.id === 'cf-orn') setLook({ ornaments: t.checked });
    else if (t.name === 'cf-clock') setClock(t.value === 'utc');
    else if (t.id === 'cf-glyph') { try { localStorage.setItem(GLYPH_KEY, JSON.stringify(t.checked)); } catch { /* storage off */ } }
    else if (t.id === 'cf-upg') { try { localStorage.setItem(UPGRADES_KEY, JSON.stringify(t.checked)); } catch { /* storage off */ } }
  });
  on(host, 'input', (ev) => {
    const k = { 'cf-head': 'head', 'cf-body': 'body', 'cf-size': 'size' }[ev.target.id];
    if (!k) return;
    const fonts = { ...look().fonts, [k]: k === 'size' ? Number(ev.target.value) : ev.target.value };
    setLook({ fonts });
    $('size-o').textContent = `${fonts.size}px`;
  });
  on($('reset'), 'click', () => { setLook({ fonts: { ...FONT_DEFAULTS } }); fill(); });
  fill();
  return {
    update(c) { if (c?.has('timemode')) fill(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
