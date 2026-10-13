// Writes index.html's preload block: every module the shell imports (as <link rel="modulepreload">), and for each
// view (app.js VIEW_FILES) the further modules and the stylesheet it needs, which the block's script asks for when
// that view is the remembered one. Without it the browser finds modules one import level at a time.
//   node dev/preload.mjs          rewrite the block
//   node dev/preload.mjs --check  exit 1 if it is out of date (npm run check runs this)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const START = '<!-- preload: written by dev/preload.mjs; npm run check fails if it is out of date -->';
const END = '<!-- /preload -->';

/** Files a module imports statically, itself included, as paths from the root. */
function graph(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(join(root, file), 'utf8');
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^;'"]*?(?:from\s*)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
    graph(normalize(join(dirname(file), m[1])), seen);
  }
  return seen;
}

export function block() {
  const app = readFileSync(join(root, 'app.js'), 'utf8');
  const table = app.match(/const VIEW_FILES = \{([^}]*)\}/);
  if (!table) throw new Error('app.js has no VIEW_FILES table');
  const shell = graph('app.js');
  const views = {};
  for (const [, name, file] of table[1].matchAll(/(\w+): '([^']+)'/g)) {
    views[name] = { css: file.replace(/\.js$/, '.css'), js: [...graph(file)].filter((f) => !shell.has(f)) };
  }
  const links = [...shell].map((f) => `<link rel="modulepreload" href="${f}">`).join('\n');
  return `${START}
${links}
<script>
  // The remembered view's modules and stylesheet, asked for now rather than once app.js has loaded.
  (() => {
    const views = ${JSON.stringify(views)};
    const v = views[document.documentElement.dataset.view];
    if (!v) return;
    for (const href of v.js) { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = href; document.head.append(l); }
    if (document.querySelector('link[href="' + v.css + '"]')) return;   // room.css: always loaded
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = v.css; document.head.append(css);
  })();
</script>
${END}`;
}

const page = join(root, 'index.html');
const html = readFileSync(page, 'utf8');
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < a) throw new Error(`index.html has no preload block (${START} … ${END})`);
const next = html.slice(0, a) + block() + html.slice(b + END.length);
if (process.argv.includes('--check')) {
  if (next !== html) { console.log(`index.html's preload block is out of date: run node ${relative(process.cwd(), fileURLToPath(import.meta.url))}`); process.exit(1); }
  console.log('preload block up to date');
} else if (next !== html) { writeFileSync(page, next); console.log('index.html preload block rewritten'); }
else console.log('preload block already up to date');
