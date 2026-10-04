// The wiki: its address, and finding the page for a topic ("soldiers", "rites", "war recovery").
// Searches the wiki's own search index (public, CORS-open), scored like the wiki's search box,
// plus a few game words players use that the wiki doesn't (soldiers, spells, thieves...).

export const WIKI = 'https://wizard1146.github.io/realmstate-wiki/';

/** Player words -> the wiki page that answers them. Checked before the index. */
const ALIASES = {
  soldier: 'military.html', troop: 'military.html', army: 'military.html', unit: 'military.html', train: 'military.html', elite: 'military.html',
  attack: 'attacks.html', raid: 'attacks.html', conquest: 'attacks.html',
  spell: 'rites.html', magic: 'rites.html', mage: 'rites.html', adept: 'rites.html', hex: 'rite-list.html', aether: 'rites.html',
  thief: 'operations.html', thieves: 'operations.html', spy: 'spying.html', intel: 'spying.html', nerve: 'spying.html',
  gold: 'economy.html', income: 'economy.html', peasant: 'economy.html', food: 'economy.html', tax: 'leadership.html',
  land: 'exploring.html', explore: 'exploring.html', acre: 'exploring.html',
  build: 'construction.html', building: 'buildings.html',
  tick: 'how-time-works.html', time: 'how-time-works.html',
  protection: 'getting-started.html#Protection', start: 'getting-started.html', new: 'getting-started.html',
  might: 'end-of-age.html', score: 'end-of-age.html', heir: 'end-of-age.html',
  recovery: 'war.html#Recovery', 'war recovery': 'war.html#Recovery', peace: 'war.html#PeaceDividend', 'peace dividend': 'war.html#PeaceDividend', dividend: 'war.html#PeaceDividend', ceasefire: 'war.html#Ceasefires',
  market: 'trade.html', trade: 'trade.html', book: 'science.html', scientist: 'science.html',
  leader: 'leadership.html', vote: 'leadership.html', chat: 'leadership.html#Chat',
  api: 'api.html', glossary: 'glossary.html', all: 'all-pages.html', pages: 'all-pages.html',
};

const FILLER = new Set(['how', 'do', 'does', 'what', 'whats', 'is', 'are', 'the', 'a', 'an', 'to', 'i', 'my', 'of', 'in', 'on', 'for', 'work', 'works', 'why', 'when', 'can', 'about', 'with']);

let index = null;

/** Loads the wiki's search index (once). Call early so a lookup can open a tab without waiting. */
export function preload() {
  index ||= fetch(WIKI + 'search-index.json').then((r) => (r.ok ? r.json() : [])).catch(() => { index = null; return []; });
  return index;
}

const singular = (w) => (w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('es') && w.length > 4 ? w.slice(0, -2) : w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w);

function rank(docs, q) {
  const words = q.split(/\s+/);
  const hits = [];
  for (const d of docs) {
    const title = d.t.toLowerCase();
    const text = d.x.toLowerCase();
    const has = (w) => title.includes(w) || text.includes(w) || title.includes(singular(w)) || text.includes(singular(w));
    if (!words.every(has)) continue;
    let score = 0;
    for (const w of words) {
      for (const v of new Set([w, singular(w)])) {
        score += title === v ? 100 : title.startsWith(v) ? 40 : title.includes(v) ? 20 : 0;
        score += text.includes(v) ? 1 : 0;
      }
    }
    if (title === q) score += 200;
    else if (words.length > 1) score += (title.includes(q) ? 60 : 0) + (text.includes(q) ? 10 : 0); // the whole phrase
    hits.push({ title: d.t, url: WIKI + d.u, score: d.s === 'Retired' ? score - 50 : score });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/**
 * The page for a topic: { url, title, also: [titles] }. No topic: the wiki's home page.
 * Nothing matches: the All Pages list, with `missed` set.
 */
export async function find(topic) {
  const typed = (topic || '').trim().toLowerCase().replace(/[?!.,]/g, '');
  // Questions read as topics: "how do ticks work" -> "ticks".
  const q = typed.split(/\s+/).filter((w) => !FILLER.has(w)).join(' ') || typed;
  if (!q) return { url: WIKI, title: 'the wiki', also: [] };
  const alias = ALIASES[q] || ALIASES[singular(q)];
  const docs = await preload();
  if (alias) {
    const page = docs.find((d) => d.u === alias.split('#')[0]);
    return { url: WIKI + alias, title: page ? page.t : alias, also: [] };
  }
  const hits = rank(docs, q);
  if (!hits.length) return { url: WIKI + 'all-pages.html', title: 'All Pages', also: [], missed: true };
  return { ...hits[0], also: hits.slice(1, 4).map((h) => h.title) };
}

/**
 * Opens a topic in a new tab. The tab opens at once (inside the click or Enter, so browsers allow
 * it) and is pointed at the page when the lookup finishes.
 */
export async function open(topic) {
  const tab = window.open('about:blank', '_blank');
  const hit = await find(topic);
  if (tab) {
    tab.opener = null;
    tab.location.href = hit.url;
  }
  return { ...hit, blocked: !tab };
}
