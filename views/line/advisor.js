// Straightline's advisors: a band at the top of a page where one of your court speaks. Advice reacts to the house
// (barren land, acres to claim) and links to where to act; flavour is a line of the court's voice. Configuration
// chooses: off, flavour only, advice first, or mostly flavour (advice now and then). The choice of line is made once
// per visit to a page, so the band doesn't change while you read it; its numbers stay current.
import { store } from '../../core/store.js';
import { fmt, esc } from '../../core/words.js';
import { api } from '../../core/api.js';

export const ADVISOR_KEY = 'realmstate.line.advisor';
/** [mode, label] in Configuration's order; 'advice' is the default. */
export const ADVISOR_MODES = [
  ['off', 'Off: no advisors'],
  ['flavour', 'Flavour only: a word from your court, never advice'],
  ['advice', 'Advice first: advice when there is something to act on, flavour otherwise'],
  ['mixed', 'Mostly flavour: advice now and then'],
];
export const advisorMode = () => { try { const m = localStorage.getItem(ADVISOR_KEY); return ADVISOR_MODES.some(([k]) => k === m) ? m : 'advice'; } catch { return 'advice'; } };
const MIXED_ADVICE = 0.25;   // in "mostly flavour", the share of visits that give advice (when there is any)

// The court's names: race-specific, from the server's name lists (GET /names?kind=general follows your house's
// race), asked for once per house and role and kept in this browser, so your Steward stays the same person.
const NAMES_KEY = 'realmstate.line.court';
const readNames = () => { try { return JSON.parse(localStorage.getItem(NAMES_KEY)) || {}; } catch { return {}; } };
const asked = new Map();
/** The house's name for a role (Steward, ...), or null until the server has suggested one. */
function courtName(house, role, then) {
  const k = `${house.id}:${house.name}:${role}`, all = readNames();
  if (all[k]) return all[k];
  if (!asked.has(k)) {
    asked.set(k, api('/names?kind=general&count=10').then((r) => {
      const list = r?.names || [];
      // A plain first-and-family name suits a steward better than a general's epithet ("Pell the Steadfast").
      const name = list.find((n) => n.split(' ').length === 2 && !/^the$/i.test(n.split(' ')[1])) || list[0];
      if (!name) return;
      const now = readNames(); now[k] = name;
      try { localStorage.setItem(NAMES_KEY, JSON.stringify(now)); } catch { /* storage off: a new name next visit */ }
      then();
    }).catch(() => {}));
  }
  return null;
}

/**
 * Each page's advisor: who speaks, advice (a list of (house) => HTML or null, in order of importance), and flavour.
 * Advice text is HTML: numbers via fmt, links to pages by #id.
 */
const COURT = {
  land: {
    role: 'Steward',
    advice: [
      (h) => (h.barren >= Math.max(5, h.land * 0.05) ? `My liege, ${fmt(h.barren)} acres lie barren. Land that bears nothing serves no one: <a href="#build">raise buildings upon it</a>.` : null),
      (h) => (h.incoming_land > 0 ? `${fmt(h.incoming_land)} acres are on their way to us, my liege. They will want building when they come.` : null),
      (h) => (h.explorable?.acres >= 10 ? `The explorers stand ready, my liege: ${fmt(h.explorable.acres)} acres await claiming beyond our borders.` : null),
    ],
    flavour: [
      'My liege, a strong House must show that it can hold the most precious of assets: land.',
      'Gold is spent and soldiers fall, my liege, but land endures.',
      'Every acre we claim is an acre our rivals cannot.',
      "The surveyors' maps grow wider each season, my liege. Let them grow wider still.",
      'A House without land is a name without a home.',
      'The old lords measured their worth in acres, my liege. The custom has not changed.',
    ],
  },
};

/**
 * Mounts the band at the start of `host` for `page` (nothing if the page has no advisor or advisors are off).
 * Returns { update() } to refresh its numbers.
 */
export function mountAdvisor(host, page) {
  const court = COURT[page], mode = advisorMode();
  if (!court || mode === 'off') return { update() {} };
  const el = document.createElement('aside');
  el.className = 'adv-band';
  el.setAttribute('aria-label', `A word from your ${court.role}`);
  host.prepend(el);
  // Decided once per visit: whether this visit may give advice, and which flavour line to fall back on.
  const mayAdvise = mode === 'advice' || (mode === 'mixed' && Math.random() < MIXED_ADVICE);
  const flavour = court.flavour[Math.floor(Math.random() * court.flavour.length)];
  function update() {
    const h = store.house;
    if (!h) return;
    const advice = mayAdvise ? court.advice.map((f) => f(h)).find(Boolean) : null;
    el.classList.toggle('advice', !!advice);
    const name = courtName(h, court.role, update);
    // Signed with the advisor's name; "your Steward" only until the server has suggested one.
    el.innerHTML = `“${advice || esc(flavour)}”<span class="who"> — ${name ? esc(name) : `your ${esc(court.role)}`}</span>`;
  }
  update();
  return { update };
}
