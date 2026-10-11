#!/usr/bin/env node
// Local static server. Also lets the page save data/*.json (PUT). No dependencies.
// Usage: node serve.mjs [port]   → http://localhost:8642
import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8642);
const WRITABLE = new Set(['/data/items.json', '/data/constraints.json', '/data/container.json']);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.includes('..')) return res.writeHead(400).end();
  const file = join(root, path === '/' ? 'index.html' : path);
  try {
    if (req.method === 'PUT') {
      if (!WRITABLE.has(path)) return res.writeHead(403).end('not writable');
      let body = '';
      for await (const chunk of req) body += chunk;
      JSON.parse(body); // refuse to write broken JSON
      await writeFile(file, body.endsWith('\n') ? body : body + '\n');
      return res.writeHead(204).end();
    }
    if ((await stat(file)).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(e instanceof SyntaxError ? 400 : 404).end(String(e.message));
  }
}).listen(port, '127.0.0.1', () => console.log(`pickepackevoll → http://localhost:${port}`));
