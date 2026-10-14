// Straightline's Configuration: how the game looks and reads for you, kept in this browser, in tabs (Look, Fonts,
// Reading, Images, News, Chat, Intrigue). The look (theme, ornaments, fonts, the background texture) is looklab's, the same settings as the header's palette and Aa panels; times in UTC or your
// own zone are core's (store.js).
import { setClock, isUtc, notify } from '../../core/store.js';
import { FEED_KEY, feedOn } from '../../core/worldnews.js';
import { esc } from '../../core/words.js';
import { THEMES, HEADS, BODIES, look, setLook, FONT_DEFAULTS, fontOptions, validFontName, tryFont, CUSTOM } from './looklab.js';
import { UPGRADES_KEY, upgradeRows, GLYPH_KEY, throneGlyph } from './throne.js';
import { ADVISOR_KEY, ADVISOR_MODES, advisorMode } from './advisor.js';
import { LAND_ICONS, LAND_ICON_KEY, landIcon, iconUrl } from './land.js';
import { pins, setPins } from '../../core/intelprefs.js';
import { buildingGroups } from '../../core/land.js';
import { NEWS_GROUPS, newsOff, setNewsOff, newsQuiet, setNewsQuiet } from '../../core/newsprefs.js';
import { ALERT_MODES, CHAT_LABEL, alertModes, setAlertMode } from './chatbox.js';

const TABS = [['look', 'Look'], ['fonts', 'Fonts'], ['reading', 'Reading'], ['images', 'Images'], ['news', 'News'], ['chat', 'Chat'], ['intrigue', 'Intrigue']];
/** Tabs since split up, and where their settings went. */
const OLD_TABS = { general: 'look', texture: 'look' };
const KEY = 'realmstate.line.config.tab';
const SURVEY_DEFAULT = ['forts', 'watch_towers'];

export function mountConfig(host, on) {
  let tab = TABS[0][0];
  try { const v = OLD_TABS[localStorage.getItem(KEY)] || localStorage.getItem(KEY); if (TABS.some(([t]) => t === v)) tab = v; } catch { /* storage off */ }
  host.innerHTML = `<div class="lpart lconfig">
    <div class="ltabs" role="tablist" aria-label="Settings">${TABS.map(([t, label]) =>
      `<button type="button" role="tab" id="cf-tab-${t}" aria-controls="cf-${t}" data-tab="${t}">${label}</button>`).join('')}</div>
    <div role="tabpanel" id="cf-look" aria-labelledby="cf-tab-look" data-panel="look">
    <section><h3 class="sub">Theme</h3>
      <fieldset class="cf-themes"><legend class="vh">Theme</legend>${THEMES.map(([id, name, sw]) =>
        `<label class="cf-theme"><input type="radio" name="cf-theme" value="${id}"><span>${esc(name)}</span><span class="chips" aria-hidden="true">${sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span></label>`).join('')}</fieldset>
      <label class="cf-check"><input type="checkbox" id="cf-orn"> Ornaments: framed corners and ruled headings</label></section>
    <section><h3 class="sub">Background texture</h3>
      <p class="dim">Behind the page: a faint ink wash under a fine film grain, as on realmstate.net. Turn it off for a plain, flat background.</p>
      <label class="cf-check"><input type="checkbox" id="cf-tex"> Show the texture</label>
      <div class="cf-texdemo" aria-hidden="true"></div></section>
    <p class="dim small">These settings are kept in this browser only.</p>
    </div>
    <div role="tabpanel" id="cf-fonts" aria-labelledby="cf-tab-fonts" data-panel="fonts">
    <section><h3 class="sub">Fonts</h3>
      <div class="cf-grid">
        <label for="cf-head">Headings</label><select id="cf-head"></select>
        <label for="cf-body">Text</label><select id="cf-body"></select>
        <label for="cf-size">Size</label><span><input id="cf-size" type="range" min="13" max="19" step="1"> <output id="cf-size-o"></output></span>
      </div>
      <p class="cf-specimen"><span class="h">The Crown of Valmark</span><br>Gold 1,234,567 · Land 430 acres · Might 80,904</p>
      <button type="button" class="btn" id="cf-reset">Default fonts</button></section>
    <section><h3 class="sub">Your own font</h3>
      <p class="dim">Any family from <a href="https://fonts.google.com" target="_blank" rel="noopener">Google Fonts</a>, by its name (letters, numbers and spaces, as Google writes it).</p>
      <div class="cf-grid cf-own">
        <label for="cf-own-head">Headings</label><span class="field"><input id="cf-own-head" type="text" maxlength="50" placeholder="e.g. Spectral SC" autocomplete="off" spellcheck="false"><button type="button" class="btn" data-own="head">Use</button></span>
        <label for="cf-own-body">Text</label><span class="field"><input id="cf-own-body" type="text" maxlength="50" placeholder="e.g. Nunito Sans" autocomplete="off" spellcheck="false"><button type="button" class="btn" data-own="body">Use</button></span>
      </div>
      <p class="doing" id="cf-own-msg" aria-live="polite" hidden></p></section>
    <p class="dim small">These settings are kept in this browser only.</p>
    </div>
    <div role="tabpanel" id="cf-reading" aria-labelledby="cf-tab-reading" data-panel="reading">
    <section><h3 class="sub">Advisors</h3>
      <fieldset class="cf-clock"><legend class="vh">Advisors</legend>${ADVISOR_MODES.map(([k, label]) =>
        `<label><input type="radio" name="cf-adv" value="${k}"> ${esc(label)}</label>`).join('')}</fieldset></section>
    <section><h3 class="sub">Times</h3>
      <fieldset class="cf-clock"><legend class="vh">Show times in</legend>
        <label><input type="radio" name="cf-clock" value="utc"> UTC, the game's own clock</label>
        <label><input type="radio" name="cf-clock" value="local"> Your local time</label></fieldset></section>
    <section><h3 class="sub">Units</h3>
      <label class="cf-check"><input type="checkbox" id="cf-upg"> List upgraded units on rows of their own (otherwise each is counted in with its base unit, marked *)</label></section>
    <p class="dim small">These settings are kept in this browser only.</p>
    </div>
    <div role="tabpanel" id="cf-images" aria-labelledby="cf-tab-images" data-panel="images">
    <section><h3 class="sub">Land</h3>
      <fieldset class="cf-icons"><legend>The houses in the land bar</legend>${LAND_ICONS.map(([k, name]) =>
        `<label class="cf-icon"><input type="radio" name="cf-icon" value="${k}"><i style="--house:${iconUrl(k)}" aria-hidden="true"></i> ${esc(name)}</label>`).join('')}</fieldset></section>
    <section><h3 class="sub">Page images</h3>
      <label class="cf-check"><input type="checkbox" id="cf-glyph"> A faint image in the background: a throne on Throne, wheat on Resources, a compass on Land &amp; Exploration, planks on Build, a sledgehammer on Raze, a fort on State, a shield on Military</label>
      <p class="dim small cf-credit">Throne image by Amethyst prime, from <a href="https://www.flaticon.com/free-icon/throne_10623266" target="_blank" rel="noopener">Flaticon</a>. Compass by meaicon, from <a href="https://www.flaticon.com/free-icon/compass_18513259" target="_blank" rel="noopener">Flaticon</a>. Wood planks by Vectorsclub, from <a href="https://www.flaticon.com/free-icon/wood-planks_18333413" target="_blank" rel="noopener">Flaticon</a>. Sledgehammer by andinur, from <a href="https://www.flaticon.com/free-icon/sledgehammer_8591563" target="_blank" rel="noopener">Flaticon</a>. Bauxite ("Gold") by Magnific, from <a href="https://www.flaticon.com/free-icon/gold_9921041" target="_blank" rel="noopener">Flaticon</a>. Limestone ("Nature") by FACH, from <a href="https://www.flaticon.com/free-icon/nature_18891485" target="_blank" rel="noopener">Flaticon</a>. Amber ("Dried insect in amber") by Smashicons, from <a href="https://www.flaticon.com/free-icon/dried-insect-in-amber_1674503" target="_blank" rel="noopener">Flaticon</a>. Pine ("Pines") by KP Arts, from <a href="https://www.flaticon.com/free-icon/pines_6960250" target="_blank" rel="noopener">Flaticon</a>. Sulfur ("Sulphur") by Magnific, from <a href="https://www.flaticon.com/free-icon/sulphur_1999794" target="_blank" rel="noopener">Flaticon</a>. Paper ("Stationery stacked papers") by Magnific, from <a href="https://www.flaticon.com/free-icon/stationery-stacked-papers_29343" target="_blank" rel="noopener">Flaticon</a>. Hill fort, templar shield and wood pile (timber) by Delapouite, from <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>, CC BY 3.0. Wheat, crossed swords (Attack), domino mask (Intrigue) and pentagram rose (Rites) and dripping goo (resin) by Lorc, from <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>. Each game-icons.net icon has had its square background removed.</p></section>
    <p class="dim small">These settings are kept in this browser only.</p>
    </div>
    <div role="tabpanel" id="cf-news" aria-labelledby="cf-tab-news" data-panel="news">
      <section><h3 class="sub">World news strip</h3>
        <p class="dim">A line under your house's figures, running with what the whole world may know: wars and ceasefires, Truths uncovered, dragons, and big market moves.</p>
        <label class="cf-check"><input type="checkbox" id="cf-feed"> Show the world news strip</label></section>
      <section><h3 class="sub">What news you see</h3>
        <p class="dim"><b>News</b>: listed on the News page. <b>Pop-up</b>: also a card at the bottom right and the message line as it arrives (only for kinds in your News). The end of an age and notes from the game's staff always show.</p>
        <table class="tbl cf-news"><thead><tr><th scope="col">Kind</th><th scope="col">News</th><th scope="col">Pop-up</th></tr></thead><tbody>
        ${[...NEWS_GROUPS, ['other', 'Everything else', 'news of kinds not listed here']].map(([g, name, what]) =>
          `<tr data-g="${g}"><th scope="row"><span class="cf-nk"><b id="cf-ng-${g}">${esc(name)}</b><span class="dim small">${esc(what)}</span></span></th>
            <td><input type="checkbox" name="cf-news" value="${g}" aria-labelledby="cf-ng-${g} cf-nh-news"></td>
            <td><input type="checkbox" name="cf-pop" value="${g}" aria-labelledby="cf-ng-${g} cf-nh-pop"></td></tr>`).join('')}</tbody></table>
        <span class="vh" id="cf-nh-news">in News</span><span class="vh" id="cf-nh-pop">as a pop-up</span>
        <div class="cf-pinbtns"><button type="button" class="btn" id="cf-news-all">Show all</button></div></section>
      <p class="dim small">These settings are kept in this browser only.</p>
    </div>
    <div role="tabpanel" id="cf-chat" aria-labelledby="cf-tab-chat" data-panel="chat">
      <section><h3 class="sub">New messages</h3>
        <p class="dim">While a channel isn't on screen, how its new messages show. <b>Count only</b>: a number on the Chat button. <b>Bubble</b>: also the newest message, beside the button, for a few seconds. <b>Feed</b>: also the last few messages, stacked by the button, each fading after half a minute. Click either to open that channel.</p>
        <table class="tbl cf-news cf-chat"><thead><tr><th scope="col">Channel</th>${ALERT_MODES.map(([, l]) => `<th scope="col">${esc(l)}</th>`).join('')}</tr></thead><tbody>
        ${Object.entries(CHAT_LABEL).map(([c, name]) => `<tr><th scope="row" id="cf-ch-${c}">${esc(name)}</th>${ALERT_MODES.map(([k, l]) =>
          `<td><input type="radio" name="cf-chat-${c}" value="${k}" aria-label="${esc(name)}: ${esc(l)}"></td>`).join('')}</tr>`).join('')}</tbody></table></section>
      <p class="dim small">These settings are kept in this browser only.</p>
    </div>
    <div role="tabpanel" id="cf-intrigue" aria-labelledby="cf-tab-intrigue" data-panel="intrigue">
      <section><h3 class="sub">Survey cards</h3>
        <p class="dim">What a survey's card shows on the Intrigue page, after their land: each building's share of it. The full survey opens when you click its card.</p>
        <fieldset class="cf-pins"><legend class="vh">Buildings on survey cards</legend>${buildingGroups().map(([g, ds]) => `<div class="cf-pgrp"><h4>${esc(g)}</h4>${ds.map((d) =>
          `<label><input type="checkbox" name="cf-pin" value="${esc(d.building)}"> ${esc(d.name)}</label>`).join('')}</div>`).join('')}</fieldset>
        <div class="cf-pinbtns"><button type="button" class="btn" id="cf-pin-def">Default (Forts, Watch Towers)</button><button type="button" class="btn" id="cf-pin-none">None</button></div></section>
      <p class="dim small">These settings are kept in this browser only.</p>
    </div>
  </div>`;
  const $ = (id) => host.querySelector(`#cf-${id}`);

  function fill() {
    const l = look();
    host.querySelectorAll('input[name="cf-theme"]').forEach((i) => { i.checked = i.value === l.theme; });
    $('orn').checked = l.ornaments;
    $('tex').checked = l.texture;
    $('feed').checked = feedOn();
    $('head').innerHTML = fontOptions(HEADS, l.fonts.head, 'head'); $('body').innerHTML = fontOptions(BODIES, l.fonts.body, 'body'); $('size').value = l.fonts.size; $('size-o').textContent = `${l.fonts.size}px`;
    $('upg').checked = upgradeRows();
    host.querySelectorAll('input[name="cf-icon"]').forEach((i) => { i.checked = i.value === landIcon(); });
    host.querySelectorAll('input[name="cf-adv"]').forEach((i) => { i.checked = i.value === advisorMode(); });
    $('glyph').checked = throneGlyph();
    host.querySelectorAll('input[name="cf-clock"]').forEach((i) => { i.checked = (i.value === 'utc') === isUtc(); });
    const off = newsOff();
    const quiet = newsQuiet();
    host.querySelectorAll('input[name="cf-news"]').forEach((i) => { i.checked = !off.has(i.value); });
    // A pop-up only for kinds in your News: otherwise it's unticked and can't be changed.
    host.querySelectorAll('input[name="cf-pop"]').forEach((i) => { const listed = !off.has(i.value); i.disabled = !listed; i.checked = listed && !quiet.has(i.value); i.closest('tr').classList.toggle('off', !listed); });
    const am = alertModes();
    host.querySelectorAll('input[name^="cf-chat-"]').forEach((i) => { i.checked = am[i.name.slice(8)] === i.value; });
    const p = pins();
    host.querySelectorAll('input[name="cf-pin"]').forEach((i) => { i.checked = p.includes(i.value); });
  }
  // ---------- tabs (the ARIA tabs pattern: ←/→, Home, End) ----------
  function showTab(t, focus = false) {
    tab = t;
    try { localStorage.setItem(KEY, t); } catch { /* storage off */ }
    host.querySelectorAll('[role=tab]').forEach((b) => { const sel = b.dataset.tab === t; b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; });
    host.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (focus) $(`tab-${t}`).focus({ preventScroll: true });
  }
  const bar = host.querySelector('[role=tablist]');
  on(bar, 'click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  on(bar, 'keydown', (ev) => {
    const i = TABS.findIndex(([t]) => t === tab), n = TABS.length;
    const j = ev.key === 'ArrowRight' ? (i + 1) % n : ev.key === 'ArrowLeft' ? (i + n - 1) % n : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    showTab(TABS[j][0], true);
  });
  // Survey cards: the ticked buildings, in the order of the list.
  const savePins = () => setPins([...host.querySelectorAll('input[name="cf-pin"]:checked')].map((i) => i.value));
  on($('pin-def'), 'click', () => { setPins(SURVEY_DEFAULT); fill(); });
  on($('pin-none'), 'click', () => { setPins([]); fill(); });
  on($('news-all'), 'click', () => { setNewsOff([]); setNewsQuiet([]); fill(); });
  on(host, 'change', (ev) => {
    const t = ev.target;
    if (t.name === 'cf-theme') setLook({ theme: t.value });
    else if (t.id === 'cf-orn') setLook({ ornaments: t.checked });
    else if (t.id === 'cf-tex') setLook({ texture: t.checked });
    else if (t.id === 'cf-feed') { try { localStorage.setItem(FEED_KEY, JSON.stringify(t.checked)); } catch { /* storage off */ } notify('feedpref'); }
    else if (t.name === 'cf-clock') setClock(t.value === 'utc');
    else if (t.name === 'cf-icon') { try { localStorage.setItem(LAND_ICON_KEY, t.value); } catch { /* storage off */ } }
    else if (t.name === 'cf-adv') { try { localStorage.setItem(ADVISOR_KEY, t.value); } catch { /* storage off */ } }
    else if (t.id === 'cf-glyph') { try { localStorage.setItem(GLYPH_KEY, JSON.stringify(t.checked)); } catch { /* storage off */ } }
    else if (t.name === 'cf-pin') savePins();
    else if (t.name?.startsWith('cf-chat-')) setAlertMode(t.name.slice(8), t.value);
    else if (t.name === 'cf-news') { setNewsOff([...host.querySelectorAll('input[name="cf-news"]')].filter((i) => !i.checked).map((i) => i.value)); fill(); }
    else if (t.name === 'cf-pop') setNewsQuiet([...host.querySelectorAll('input[name="cf-pop"]')].filter((i) => !i.disabled && !i.checked).map((i) => i.value).concat([...newsQuiet()].filter((g) => host.querySelector(`input[name="cf-pop"][value="${g}"]`)?.disabled)));
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
  // Your own font: a plain name only (looklab.js), used once Google Fonts has it.
  const ownSay = (text, bad = false) => { const m = $('own-msg'); m.hidden = false; m.textContent = text; m.classList.toggle('short', bad); };
  on(host, 'click', async (ev) => {
    const b = ev.target.closest('[data-own]');
    if (!b) return;
    const k = b.dataset.own, n = $(`own-${k}`).value.trim().replace(/\s+/g, ' ');
    if (!n) { ownSay('Type the name of a Google Fonts family first.', true); return; }
    if (!validFontName(n)) { ownSay('Only letters, numbers and single spaces, 50 at most: a font\'s name as Google Fonts writes it.', true); return; }
    b.disabled = true;
    ownSay(`Looking for ${n} on Google Fonts…`);
    const ok = await tryFont(n);
    b.disabled = false;
    if (!ok) { ownSay(`Google Fonts has no family called ${n}. Check the spelling and capitals.`, true); return; }
    setLook({ fonts: { ...look().fonts, [k]: `${CUSTOM}${n}` } });
    fill();
    ownSay(`${n} is now your ${k === 'head' ? 'heading' : 'text'} font.`);
  });
  fill();
  showTab(tab);
  return {
    update(c) { if (c?.has('timemode')) fill(); },
    tick() {},
    destroy() { host.replaceChildren(); },
  };
}
