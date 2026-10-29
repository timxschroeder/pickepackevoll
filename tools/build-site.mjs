#!/usr/bin/env node
// Builds the static copy of the page for GitHub Pages into dist/ (or the folder given as argument).
// Differences to `npm start`: three.js is copied next to the page with relative paths (Pages serves from a
// sub-path such as /pickepackevoll/staging/), the page is marked noindex, and there is no server, so saving
// items in the page does not work there (the page is a read-only copy).
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.argv[2] ?? 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const THREE_FILES = [
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/renderers/CSS2DRenderer.js',
];
for (const f of THREE_FILES) {
  const to = join(out, 'vendor/three', f);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(root, 'node_modules/three', f), to);
}

for (const f of ['style.css']) cpSync(join(root, f), join(out, f));
cpSync(join(root, 'src'), join(out, 'src'), { recursive: true });
mkdirSync(join(out, 'data'));
for (const f of readdirSync(join(root, 'data')).filter((f) => f.endsWith('.json'))) cpSync(join(root, 'data', f), join(out, 'data', f));

let html = readFileSync(join(root, 'index.html'), 'utf8');
const before = html;
html = html
  .replace('"/node_modules/three/build/three.module.js"', '"./vendor/three/build/three.module.js"')
  .replace('"/node_modules/three/examples/jsm/"', '"./vendor/three/examples/jsm/"')
  .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex, nofollow">');
if (html === before || html.includes('/node_modules/')) {
  console.error('build-site: could not rewrite the import map in index.html');
  process.exit(1);
}
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, '.nojekyll'), '');
console.log(`site built in ${out}`);
