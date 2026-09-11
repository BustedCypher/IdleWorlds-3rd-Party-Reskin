import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { chromium } from 'playwright';
import { THEME_NAMES } from '../src/modules/zoneThemes.js';
import { SkillsArtService } from '../src/modules/SkillsArtService.js';

const root = resolve(import.meta.dirname, '..');
const buttonRoot = 'assets/skills-ui/buttons/exact-v3';
const expectedKinds = [
  'action-idle', 'action-hover', 'action-clicked',
  'action-secondary-idle', 'action-secondary-hover', 'action-secondary-clicked',
  'chevron-prev-idle', 'chevron-prev-hover', 'chevron-prev-clicked',
  'chevron-next-idle', 'chevron-next-hover', 'chevron-next-clicked',
];

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const host = dom.window.document.documentElement;

for (const theme of THEME_NAMES) {
  SkillsArtService.applyThemeVariables(host, theme);
  for (const kind of expectedKinds) {
    const variable = `--iw-${kind}`;
    const rel = `assets/skills-ui/buttons/revised-v5/${theme}.png`;
    assert.equal(host.style.getPropertyValue(variable), `url("${rel}")`,
      `${theme} must map ${variable} to its exact-state asset`);
    await access(resolve(root, rel));
  }
}

SkillsArtService.clearThemeVariables(host);
for (const kind of expectedKinds) {
  assert.equal(host.style.getPropertyValue(`--iw-${kind}`), '', `clear must remove --iw-${kind}`);
}

const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
assert.ok(manifest.web_accessible_resources.some(entry =>
  entry.resources?.includes('assets/skills-ui/buttons/exact-v3/*/*.png')),
'nested source-preview button assets must be web-accessible');

const css = await readFile(resolve(root, 'src/styles/skillpanel.css'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 240 } });
try {
  const imageMetrics = async paths => {
    const sources = await Promise.all(paths.map(async path =>
      `data:image/png;base64,${(await readFile(resolve(root, path))).toString('base64')}`));
    return page.evaluate(async urls => {
      const pixels = await Promise.all(urls.map(url => new Promise((resolveImage, reject) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          resolveImage({ width: canvas.width, height: canvas.height,
            data: [...context.getImageData(0, 0, canvas.width, canvas.height).data] });
        };
        image.onerror = reject;
        image.src = url;
      })));
      const idle = pixels[0];
      let left = idle.width, top = idle.height, right = 0, bottom = 0, opaque = 0;
      const deltas = [0, 0];
      let alphaMismatch = false;
      for (let i = 0; i < idle.data.length; i += 4) {
        const alpha = idle.data[i + 3];
        if (pixels[1].data[i + 3] !== alpha || pixels[2].data[i + 3] !== alpha) alphaMismatch = true;
        if (!alpha) continue;
        const pixel = i / 4;
        const x = pixel % idle.width;
        const y = Math.floor(pixel / idle.width);
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        opaque++;
        for (let state = 1; state < 3; state++) {
          for (let channel = 0; channel < 3; channel++) {
            deltas[state - 1] += Math.abs(pixels[state].data[i + channel] - idle.data[i + channel]);
          }
        }
      }
      return { width: idle.width, height: idle.height, bounds: { left, top, right, bottom },
        alphaMismatch, deltas: deltas.map(total => total / Math.max(1, opaque * 3)) };
    }, sources);
  };

  for (const theme of THEME_NAMES.filter(t => !['celestial','glacial','infernal','forged-metal'].includes(t))) {
    for (const prefix of ['action', 'action-secondary']) {
      const base = `${buttonRoot}/${theme}/${prefix}`;
      const metrics = await imageMetrics([`${base}-idle.png`, `${base}-hover.png`, `${base}-clicked.png`]);
      assert.deepEqual([metrics.width, metrics.height], [264, 75], `${theme} ${prefix} canvas must be 264x75`);
      assert.equal(metrics.alphaMismatch, false, `${theme} ${prefix} states must be pixel-registered`);
      const artWidth = metrics.bounds.right - metrics.bounds.left;
      const artHeight = metrics.bounds.bottom - metrics.bounds.top;
      const centerX = (metrics.bounds.left + metrics.bounds.right) / 2;
      const centerY = (metrics.bounds.top + metrics.bounds.bottom) / 2;
      assert.ok(artWidth >= 250 && artHeight >= 70 &&
        Math.abs(centerX - 132) <= 2 && Math.abs(centerY - 37.5) <= 2,
      `${theme} ${prefix} artwork must fill and center its canvas; got ${JSON.stringify(metrics.bounds)}`);
      assert.ok(metrics.deltas[0] >= 18, `${theme} ${prefix} hover effect must be clearly visible`);
      assert.ok(metrics.deltas[1] >= 18, `${theme} ${prefix} clicked effect must be clearly visible`);
    }
  }

  await page.setContent(`<!doctype html><html data-iw-zone-theme="celestial"
    style="--iw-action-idle:url(idle.png);--iw-action-hover:url(hover.png);--iw-action-clicked:url(clicked.png);
           --iw-action-secondary-idle:url(secondary-idle.png);--iw-action-secondary-hover:url(secondary-hover.png);--iw-action-secondary-clicked:url(secondary-clicked.png);
           --iw-chevron-prev-idle:url(prev-idle.png);--iw-chevron-prev-hover:url(prev-hover.png);--iw-chevron-prev-clicked:url(prev-clicked.png);
           --iw-chevron-next-idle:url(next-idle.png);--iw-chevron-next-hover:url(next-hover.png);--iw-chevron-next-clicked:url(next-clicked.png)">
    <style>${css}</style>
    <div class="compact-panel fs-skill-panel" data-iw-skills-ui-ready="1" data-iw-skill-layout="three-zone">
      <button id="action" data-iw-skill-role="action-button">Mine</button>
      <button id="prev" data-iw-skill-role="nav-button" data-iw-nav-direction="prev">‹</button>
      <button id="next" data-iw-skill-role="nav-button" data-iw-nav-direction="next">›</button>
    </div>
    <div class="compact-panel fs-quest-panel" data-iw-skills-ui-ready="1">
      <button id="turn-in" data-iw-quest-role="turn-in">Turn In</button>
      <button id="skip" data-iw-quest-role="skip">Skip</button>
    </div>`);

  const art = id => page.locator(id).evaluate(el => getComputedStyle(el).getPropertyValue('--fs-button-art').trim());
  const image = id => page.locator(id).evaluate(el => getComputedStyle(el).backgroundImage);
  const geometry = id => page.locator(id).evaluate(el => {
    const style = getComputedStyle(el);
    return { width: style.width, height: style.height, transform: style.transform, filter: style.filter };
  });
  const actionIdleGeometry = await geometry('#action');
  assert.equal(await art('#action'), 'url(idle.png)');
  assert.match(await image('#action'), /idle\.png/);
  await page.locator('#action').hover();
  assert.equal(await art('#action'), 'url(hover.png)');
  assert.match(await image('#action'), /hover\.png/);
  assert.deepEqual(await geometry('#action'), actionIdleGeometry, 'action hover must not move or resize');
  await page.mouse.down();
  assert.equal(await art('#action'), 'url(clicked.png)');
  assert.match(await image('#action'), /clicked\.png/);
  assert.deepEqual(await geometry('#action'), actionIdleGeometry, 'action click must not move or resize');
  await page.mouse.up();

  const nextIdleGeometry = await geometry('#next');
  assert.equal(await art('#next'), 'url(next-idle.png)');
  assert.match(await image('#next'), /next-idle\.png/);
  await page.locator('#next').hover();
  assert.equal(await art('#next'), 'url(next-hover.png)');
  assert.match(await image('#next'), /next-hover\.png/);
  assert.deepEqual(await geometry('#next'), nextIdleGeometry, 'chevron hover must not move or resize');
  await page.mouse.down();
  assert.equal(await art('#next'), 'url(next-clicked.png)');
  assert.match(await image('#next'), /next-clicked\.png/);
  assert.deepEqual(await geometry('#next'), nextIdleGeometry, 'chevron click must not move or resize');
  await page.mouse.up();

  const prevIdleGeometry = await geometry('#prev');
  assert.equal(await art('#prev'), 'url(prev-idle.png)');
  await page.locator('#prev').hover();
  assert.equal(await art('#prev'), 'url(prev-hover.png)');
  assert.deepEqual(await geometry('#prev'), prevIdleGeometry, 'previous chevron hover must preserve rendering');
  await page.mouse.down();
  assert.equal(await art('#prev'), 'url(prev-clicked.png)');
  assert.deepEqual(await geometry('#prev'), prevIdleGeometry, 'previous chevron click must preserve rendering');
  await page.mouse.up();

  const turnInIdleGeometry = await geometry('#turn-in');
  assert.equal(await art('#turn-in'), 'url(idle.png)');
  await page.locator('#turn-in').hover();
  assert.equal(await art('#turn-in'), 'url(hover.png)');
  assert.deepEqual(await geometry('#turn-in'), turnInIdleGeometry, 'quest action hover must preserve rendering');
  await page.mouse.down();
  assert.equal(await art('#turn-in'), 'url(clicked.png)');
  assert.deepEqual(await geometry('#turn-in'), turnInIdleGeometry, 'quest action click must preserve rendering');
  await page.mouse.up();

  const skipIdleGeometry = await geometry('#skip');
  assert.equal(await art('#skip'), 'url(secondary-idle.png)');
  await page.locator('#skip').hover();
  assert.equal(await art('#skip'), 'url(secondary-hover.png)');
  assert.deepEqual(await geometry('#skip'), skipIdleGeometry, 'secondary action hover must preserve rendering');
  await page.mouse.down();
  assert.equal(await art('#skip'), 'url(secondary-clicked.png)');
  assert.deepEqual(await geometry('#skip'), skipIdleGeometry, 'secondary action click must preserve rendering');
  await page.mouse.up();
} finally {
  await browser.close();
}

console.log('PASS themed button artwork: all themes, asset exposure, hover and clicked switching');
