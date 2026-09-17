import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const src = await readFile('tests/quest-command-width.test.mjs', 'utf8');
const bundle = await readFile(process.argv[2] || 'dist/content.bundle.js', 'utf8');
const block = src.slice(src.indexOf('const card = (id, turnIn)'), src.indexOf("const PAGE_URL"));
const PAGE = new Function('bundle', block + '; return PAGE;')(bundle);
const b = await chromium.launch();
for (const width of [390, 800, 1280]) {
  const p = await b.newPage({ viewport: { width, height: 844 } });
  await p.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== 'http://iw.test') return route.abort();
    if (u.pathname === '/q.html') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
    try { return route.fulfill({ body: await readFile(resolve(u.pathname.replace(/^\/+/, ''))) }); } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await p.goto('http://iw.test/q.html'); await p.waitForTimeout(4000);
  const r = await p.evaluate(async () => {
    let reconciles = 0; const recs = new Map();
    document.addEventListener('iw:skill-panel', () => reconciles++);
    const mo = new MutationObserver(list => { for (const m of list) {
      const key = `${m.type}:${m.attributeName || ''} @ ${m.target.nodeType === 1 ? (m.target.id || m.target.tagName.toLowerCase() + '.' + String(m.target.className).slice(0, 30) + ' ' + [...m.target.attributes].filter(a => a.name.startsWith('data-iw-quest')).map(a => a.name + '=' + a.value).join(',')) : m.target.nodeName}`;
      const e = recs.get(key) || { n: 0, sample: [] }; e.n++;
      if (e.sample.length < 3 && m.type === 'attributes') e.sample.push(`${String(m.oldValue).slice(-60)} -> ${String(m.target.getAttribute(m.attributeName)).slice(-60)}`);
      recs.set(key, e); } });
    mo.observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true });
    await new Promise(r => setTimeout(r, 1000)); mo.disconnect();
    return { reconciles, recs: [...recs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6) };
  });
  console.log(`\n@${width}px over 1s after settling: ${r.reconciles} iw:skill-panel events`);
  for (const [k, v] of r.recs) console.log(`  x${v.n} ${k}\n     ${v.sample.join(' | ')}`);
  await p.close();
}
await b.close();
