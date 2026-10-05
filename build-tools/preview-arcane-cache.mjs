import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { cacheFixture } from './arcane-cache-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const mime = { '.js':'text/javascript', '.json':'application/json', '.csv':'text/csv',
  '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(cacheFixture()); return; }
  if (url.pathname === '/items.json') { res.writeHead(200, {'Content-Type':'application/json'}); res.end('[]'); return; }
  const file = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + sep) || !/^\/(?:assets|dist)\//.test(url.pathname)) { res.writeHead(404); res.end(); return; }
  try { const body = await readFile(file); res.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream'}); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
server.listen(64421, '127.0.0.1', () => console.log('Arcane Cache preview: http://localhost:64421/'));
