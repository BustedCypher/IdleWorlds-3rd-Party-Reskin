import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { THEME_NAMES } from '../src/modules/zoneThemes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
let failures = 0;

try {
  const page = await browser.newPage();
  for (const theme of THEME_NAMES) {
    const file = resolve(ROOT, `assets/skills-ui/separator_flourish_${theme}.webp`);
    await page.goto(pathToFileURL(file).href);
    const result = await page.evaluate(() => {
      const image = document.querySelector('img');
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const rgbaAt = (x, y) => {
        const offset = (y * canvas.width + x) * 4;
        return pixels.subarray(offset, offset + 4);
      };
      const samePixel = (a, b) =>
        a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

      let horizontalMismatch = false;
      let transparent = 0;
      let painted = 0;
      let x0 = canvas.width;
      let y0 = canvas.height;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const pixel = rgbaAt(x, y);
          if (pixel[3] === 0) transparent += 1;
          if (pixel[3] > 32) {
            painted += 1;
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
          if (!horizontalMismatch && !samePixel(pixel, rgbaAt(canvas.width - 1 - x, y))) {
            horizontalMismatch = true;
          }
        }
      }

      let borderAlpha = 0;
      for (let x = 0; x < canvas.width; x += 1) {
        borderAlpha = Math.max(borderAlpha, rgbaAt(x, 0)[3], rgbaAt(x, canvas.height - 1)[3]);
      }
      for (let y = 0; y < canvas.height; y += 1) {
        borderAlpha = Math.max(borderAlpha, rgbaAt(0, y)[3], rgbaAt(canvas.width - 1, y)[3]);
      }

      return {
        width: canvas.width,
        height: canvas.height,
        borderAlpha,
        transparentFraction: transparent / (canvas.width * canvas.height),
        paintedFraction: painted / (canvas.width * canvas.height),
        horizontalMismatch,
        margins: [x0, y0, canvas.width - 1 - x1, canvas.height - 1 - y1],
      };
    });

    const checks = [
      ['high-resolution 1752x584 sheet', result.width === 1752 && result.height === 584],
      ['genuine transparent background and painted ornament',
        result.transparentFraction > .35 && result.paintedFraction > .05],
      ['transparent outer border', result.borderAlpha === 0],
      ['complete ornament has safe clearance on every edge', result.margins.every(value => value >= 8)],
      ['exact bilateral symmetry', !result.horizontalMismatch],
    ];
    for (const [label, ok] of checks) {
      const detail = label.includes('clearance') && !ok ? ` — margins ${result.margins.join(', ')}` : '';
      console.log(`${ok ? 'ok  ' : 'FAIL'}  ${theme}: ${label}${detail}`);
      if (!ok) failures += 1;
    }
  }
} finally {
  await browser.close();
}

console.log(failures ? `\nFAIL — ${failures} separator integrity problem(s)` : '\nPASS');
process.exit(failures ? 1 : 0);
