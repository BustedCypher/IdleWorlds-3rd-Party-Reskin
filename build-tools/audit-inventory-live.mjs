import { chromium } from 'playwright';
import path from 'node:path';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => p.url().startsWith('https://idleworlds.com'));
if (!page) throw new Error('IdleWorlds page not found');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
const inv = page.locator('[data-iw-inventory-root="1"]').first();
console.log('inventory roots', await page.locator('[data-iw-inventory-root="1"]').count());
console.log('rows', await page.locator('.fs-inv-row').count());
console.log('action kinds', await page.locator('[data-fs-action-kind]').evaluateAll(nodes => nodes.map(n => [n.textContent.trim(), n.dataset.fsActionKind])));
if (await inv.count()) {
  await inv.scrollIntoViewIfNeeded();
  const out = path.resolve('build-tools/fixtures/inventory-live-forged.png');
  await inv.screenshot({ path: out });
  console.log('wrote', out);
}
await browser.close();