// Syntax-checks every JavaScript file (node --check), and that index.html's preload block is current. No dependencies.
//   node dev/check.mjs
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(name)) files.push(p);
  }
})(root);
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.log(`FAIL ${relative(root, f)}\n${r.stderr}`); }
}
console.log(bad ? `${bad} of ${files.length} files failed` : `all ${files.length} files OK`);
// index.html's module preload list must match the imports (dev/preload.mjs).
const pre = spawnSync(process.execPath, [join(root, 'dev/preload.mjs'), '--check'], { encoding: 'utf8' });
process.stdout.write(pre.stdout + pre.stderr);
process.exit(bad || pre.status ? 1 : 0);
