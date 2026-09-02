import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const pages = browser.contexts()[0].pages();
const page = pages.find(p => p.url().startsWith('https://idleworlds.com')) || pages[0];
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
console.log('url', page.url());
console.log('roles', await page.locator('[data-iw-header]').count());
const info = await page.locator('[data-iw-header="root"]').evaluate(el => ({
  frame: getComputedStyle(el).getPropertyValue('--iw-header-frame'),
  bg: getComputedStyle(el).backgroundImage,
  rect: el.getBoundingClientRect().toJSON(),
})).catch(error => ({ error: error.message }));
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: 'build-tools/fixtures/header-option1-assets-live.png', fullPage: false });
await browser.close();
