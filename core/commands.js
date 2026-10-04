// Slash commands, typed in the chat box: "/wiki soldiers". A line starting with "//" is sent to
// chat as text with one slash ("//shrug" -> "/shrug"). Views can add their own commands.
import { say, setClock, isUtc, showTicks } from './store.js';
import * as wiki from './wiki.js';

const commands = new Map();

/** Adds a command; returns a function that removes it (call it when the view unmounts). */
export function register(name, spec) {
  commands.set(name, spec);
  return () => { if (commands.get(name) === spec) commands.delete(name); };
}

register('wiki', {
  args: '[topic]',
  help: 'open the wiki, or the page for a topic, in a new tab',
  run: async (rest) => {
    const hit = await wiki.open(rest);
    if (hit.blocked) say(`Your browser blocked the new tab. The page is ${hit.url}`, 'bad');
    else if (hit.missed) say(`Nothing in the wiki matches "${rest}"; opened All Pages instead.`);
    else say(`Opened ${hit.title} in the wiki.${hit.also.length ? ` Also: ${hit.also.join(', ')}.` : ''}`, 'good');
  },
});
register('time', {
  args: 'utc|local',
  help: 'show chat, news and other clock times in UTC (the default) or your local time',
  run: (arg) => {
    const a = (arg || '').trim().toLowerCase();
    if (a && !/^(utc|gmt|z|local|here)$/.test(a)) { say('Use /time utc or /time local.', 'bad'); return; }
    const utc = a ? /^(utc|gmt|z)$/.test(a) : !isUtc();
    setClock(utc);
    say(`Times now show in ${utc ? 'UTC' : 'your local time'}.`, 'good');
  },
});
register('ticks', {
  args: '[on|off]',
  help: 'show or hide tick reports in the news',
  run: (arg) => {
    const on = arg ? !/^(off|no|0|false|hide)$/i.test(arg) : !showTicks();
    showTicks(on);
    say(`Tick reports ${on ? 'shown' : 'hidden'} in the news.`, 'good');
  },
});
register('help', {
  help: 'list these commands',
  run: () => say([...commands].map(([k, c]) => `/${k}${c.args ? ' ' + c.args : ''}: ${c.help}`).join(' · ') + ' · //text sends "/text" to chat'),
});

/** Whether a chat line is a command (not "//", which is chat). */
export const isCommand = (line) => /^\/(?!\/)/.test(String(line || '').trim());

/**
 * Runs a command line. Runs synchronously up to the command's first wait, so a command that opens
 * a tab does it inside the keypress, where browsers allow it.
 */
export function run(line) {
  const [word, ...rest] = String(line).trim().slice(1).split(/\s+/);
  const c = commands.get((word || '').toLowerCase());
  if (!c) { say(`No command "/${word}". Type /help for the list.`, 'bad'); return Promise.resolve(false); }
  return Promise.resolve(c.run(rest.join(' '))).then(() => true);
}

/** Starts fetching what commands need (the wiki's index), so the first /wiki opens at once. */
export const warm = () => wiki.preload();
