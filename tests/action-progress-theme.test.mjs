import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const css = await Promise.all(['base', 'ui-system'].map(name =>
  readFile(resolve(root, 'src/styles', name + '.css'), 'utf8')));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 220 } });
const page = await context.newPage();

try {
  await page.setContent(`<!doctype html><style>${css.join('\n')}</style>
    <section data-iw-panel="current-action">
      <div data-iw-panel-part="progress"><div style="width:62%"></div></div>
    </section>`);
  const read = () => page.evaluate(() => {
    const track = document.querySelector('[data-iw-panel-part="progress"]');
    const fill = track.firstElementChild;
    const ts = getComputedStyle(track);
    const fs = getComputedStyle(fill);
    return {
      height: parseFloat(ts.height),
      radius: parseFloat(ts.borderRadius),
      segments: getComputedStyle(track, '::before').backgroundImage,
      highlight: getComputedStyle(track, '::after').backgroundImage,
      fill: fs.backgroundImage,
      currentName: getComputedStyle(fill, '::before').animationName,
      currentPlay: getComputedStyle(fill, '::before').animationPlayState,
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  });

  await page.evaluate(() => document.documentElement.dataset.iwZoneTheme = 'glacial');
  const glacial = await read();
  await page.evaluate(() => document.documentElement.dataset.iwZoneTheme = 'infernal');
  const infernal = await read();

  assert.ok(glacial.height >= 16, 'action meter must use the detailed Zone Control rail height');
  assert.ok(glacial.radius <= 3, 'action meter must use the squared Zone Control geometry');
  assert.match(glacial.segments, /repeating-linear-gradient/, 'action meter must show Zone Control segment marks');
  assert.notEqual(glacial.highlight, 'none', 'action meter must retain the Zone Control top highlight');
  assert.notEqual(glacial.fill, infernal.fill, 'action fill color must follow the active zone theme');
  assert.equal(glacial.currentName, 'iw-control-meter-current', 'action fill must use the Zone Control traveling current');
  assert.equal(glacial.currentPlay, 'running');
  assert.equal(glacial.overflow, false, 'the detailed action meter must remain mobile safe');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal((await read()).currentName, 'none', 'reduced motion must stop the action meter current');
  console.log('PASS action progress: Zone Control rail, zone palette, current animation, mobile, reduced motion');
} finally {
  await context.close();
  await browser.close();
}
