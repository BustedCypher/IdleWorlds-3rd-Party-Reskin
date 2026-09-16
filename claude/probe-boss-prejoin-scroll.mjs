/* Probe: does the skin move window scroll when a boss card's Prejoin text flips? */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fileUrl = rel => pathToFileURL(resolve(ROOT, rel)).href;
const SHEETS = ['base.css', 'header.css', 'inventory.css', 'skillpanel.css', 'tooltip-engine.css', 'overlay.css', 'ui-system.css'];
const css = [];
for (const n of SHEETS) css.push((await readFile(resolve(ROOT, 'src/styles', n), 'utf8')).replaceAll("url('../assets/", `url('${fileUrl('assets')}/`));
const compiled = await build({ stdin: { contents: "export * from './src/modules/WorldBossPanels.js';", resolveDir: ROOT }, bundle: true, write: false, format: 'iife', globalName: 'BossPanels', loader: { '.css': 'text' } });
const card = (name) => `<div class="compact-panel" data-iw-boss="card">
  <div><div><p>🌍 ${name}</p><p>Solo</p><p>Buff on kill: +4 XP/task for 1h</p></div><button class="px-3 py-1">Prejoin</button></div>
  <div class="h-1.5 rounded-full"><div style="width: 40%"></div></div>
  <button class="underline decoration-dotted">World boss participation</button>
  <div class="fighter-details"><p>Top Fighters</p></div>
  <div><p>Respawns 3m left</p></div></div>`;
const fixture = `<div style="height:1500px">spacer</div><div class="panel"><div><h2>World Bosses</h2></div>${card('Ancient Treant')}${card('Abyssal Behemoth')}${card('World Eater')}</div><div style="height:${process.env.TAIL ?? 1500}px">spacer</div>`;
const browser = await chromium.launch();
for (const mode of (process.argv[2] || 'text,remount').split(',')) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(`<style>${css.join('\n')}</style><style>body{margin:0;background:#000}</style>${fixture}`);
  await page.addScriptTag({ content: 'window.chrome={runtime:{id:"test"},storage:{local:{get:async()=>({}),set:async()=>{}}}};' });
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  await page.evaluate((mode) => {
    const root = document.querySelector('.panel');
    const decorate = () => window.BossPanels.decorateWorldBossPanel({ root, heading: root.querySelector('h2') });
    decorate();
    window.__log = [];
    addEventListener('scroll', () => window.__log.push(['scroll', scrollY]));
    root.addEventListener('mousedown', e => window.__log.push(['mousedown', scrollY]), true);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-iw-boss-role="action"]');
      if (!b) return;
      window.__log.push(['click', scrollY, document.activeElement?.tagName]);
      if (mode === 'text') b.textContent = /Prejoined/.test(b.textContent) ? 'Prejoin' : '⏳ Prejoined';
      if (mode === 'remount') { const c = b.closest('.compact-panel'); const n = c.cloneNode(false); n.innerHTML = c.innerHTML; n.querySelectorAll('[data-iw-boss-owned]').forEach(x => x.remove()); c.replaceWith(n); }
      requestAnimationFrame(() => { window.__log.push(['raf-before-decorate', scrollY, document.documentElement.scrollHeight]); decorate(); window.__log.push(['after-decorate', scrollY]); });
    });
  }, mode);
  const cards = page.locator('[data-iw-boss-role="action"]');
  for (let i = 0; i < 3; i++) {
    await page.evaluate((process_bottom) => { scrollTo(0, process_bottom ? 1e6 : 1300); }, !!process.env.BOTTOM);
    await page.waitForTimeout(100);
    const box = await cards.nth(i).boundingBox();
    const before = await page.evaluate(() => scrollY);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const l = window.__log; window.__log = []; return { after: scrollY, log: l }; });
    console.log(mode, 'card', i, 'before', before, 'after', r.after, JSON.stringify(r.log));
  }
  await page.close();
}
await browser.close();
