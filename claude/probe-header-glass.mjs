import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'], ignoreDefaultArgs: ['--headless=old'] });
const p = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await p.goto(pathToFileURL('build-tools/fixtures/fixture.html').href, { waitUntil: 'load' });
await p.waitForTimeout(500);
const r = await p.evaluate(() => {
  const cs = (sel, pseudo) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, pseudo) : null; };
  return {
    frameBg: cs('[data-iw-header="identity-region"]', '::before')?.backgroundColor,
    tileBg: cs('[data-iw-header="status-card"]')?.backgroundColor,
    utilBg: cs('[data-iw-header="utility-button"]')?.backgroundColor,
    brand: cs('[data-iw-header="brand"]')?.color,
    meta: cs('[data-iw-header="profile-meta"]')?.color,
    online: cs('[data-iw-header="profile-online"]')?.color,
    util: cs('[data-iw-header="utility-button"]')?.color,
    tiles: [...document.querySelectorAll('[data-iw-header="status-card"]')].map(t => getComputedStyle(t).color),
    nameBtn: (() => { const b = cs('[data-iw-header="profile-name"] button'); return b && { color: b.color, fill: b.webkitTextFillColor, bg: b.backgroundImage.slice(0, 60) }; })(),
  };
});
console.log(JSON.stringify(r, null, 1));
await p.locator('[data-iw-header="root"]').screenshot({ path: 'build-tools/fixtures/header-glass.png' });
await browser.close();
