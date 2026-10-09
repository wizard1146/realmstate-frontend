// Straightline's Configuration: how the game looks and reads for you, kept in this browser. The look (theme,
// ornaments, fonts) is looklab's, the same settings as the header's palette and Aa panels; times in UTC or your
// own zone are core's (store.js).
import { setClock, isUtc } from '../../core/store.js';
import { esc } from '../../core/words.js';
import { THEMES, HEADS, BODIES, look, setLook, FONT_DEFAULTS } from './looklab.js';
import { UPGRADES_KEY, upgradeRows, GLYPH_KEY, throneGlyph } from './throne.js';
import { ADVISOR_KEY, ADVISOR_MODES, advisorMode } from './advisor.js';
import { LAND_ICONS, LAND_ICON_KEY, landIcon, iconUrl } from './land.js';

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
    <section><h3 class="sub">Advisors</h3>
      <fieldset class="cf-clock"><legend class="vh">Advisors</legend>${ADVISOR_MODES.map(([k, label]) =>
        `<label><input type="radio" name="cf-adv" value="${k}"> ${esc(label)}</label>`).join('')}</fieldset></section>
    <section><h3 class="sub">Land</h3>
      <fieldset class="cf-icons"><legend>The houses in the land bar</legend>${LAND_ICONS.map(([k, name]) =>
        `<label class="cf-icon"><input type="radio" name="cf-icon" value="${k}"><i style="--house:${iconUrl(k)}" aria-hidden="true"></i> ${esc(name)}</label>`).join('')}</fieldset></section>
    <section><h3 class="sub">Throne</h3>
      <label class="cf-check"><input type="checkbox" id="cf-glyph"> A faint image in the background: a throne on Throne, wheat on Resources, a compass on Land &amp; Exploration, planks on Build, a sledgehammer on Raze, a fort on State, a shield on Military</label>
      <p class="dim small cf-credit">Throne image by Amethyst prime, from <a href="https://www.flaticon.com/free-icon/throne_10623266" target="_blank" rel="noopener">Flaticon</a>. Compass by meaicon, from <a href="https://www.flaticon.com/free-icon/compass_18513259" target="_blank" rel="noopener">Flaticon</a>. Wood planks by Vectorsclub, from <a href="https://www.flaticon.com/free-icon/wood-planks_18333413" target="_blank" rel="noopener">Flaticon</a>. Sledgehammer by andinur, from <a href="https://www.flaticon.com/free-icon/sledgehammer_8591563" target="_blank" rel="noopener">Flaticon</a>. Bauxite ("Gold") by Magnific, from <a href="https://www.flaticon.com/free-icon/gold_9921041" target="_blank" rel="noopener">Flaticon</a>. Limestone ("Nature") by FACH, from <a href="https://www.flaticon.com/free-icon/nature_18891485" target="_blank" rel="noopener">Flaticon</a>. Amber ("Dried insect in amber") by Smashicons, from <a href="https://www.flaticon.com/free-icon/dried-insect-in-amber_1674503" target="_blank" rel="noopener">Flaticon</a>. Pine ("Pines") by KP Arts, from <a href="https://www.flaticon.com/free-icon/pines_6960250" target="_blank" rel="noopener">Flaticon</a>. Sulfur ("Sulphur") by Magnific, from <a href="https://www.flaticon.com/free-icon/sulphur_1999794" target="_blank" rel="noopener">Flaticon</a>. Paper ("Stationery stacked papers") by Magnific, from <a href="https://www.flaticon.com/free-icon/stationery-stacked-papers_29343" target="_blank" rel="noopener">Flaticon</a>. Hill fort and templar shield by Delapouite, from <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>, CC BY 3.0. Wheat by Lorc, from <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>.</p>
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
    host.querySelectorAll('input[name="cf-icon"]').forEach((i) => { i.checked = i.value === landIcon(); });
    host.querySelectorAll('input[name="cf-adv"]').forEach((i) => { i.checked = i.value === advisorMode(); });
    $('glyph').checked = throneGlyph();
    host.querySelectorAll('input[name="cf-clock"]').forEach((i) => { i.checked = (i.value === 'utc') === isUtc(); });
  }
  on(host, 'change', (ev) => {
    const t = ev.target;
    if (t.name === 'cf-theme') setLook({ theme: t.value });
    else if (t.id === 'cf-orn') setLook({ ornaments: t.checked });
    else if (t.name === 'cf-clock') setClock(t.value === 'utc');
    else if (t.name === 'cf-icon') { try { localStorage.setItem(LAND_ICON_KEY, t.value); } catch { /* storage off */ } }
    else if (t.name === 'cf-adv') { try { localStorage.setItem(ADVISOR_KEY, t.value); } catch { /* storage off */ } }
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
