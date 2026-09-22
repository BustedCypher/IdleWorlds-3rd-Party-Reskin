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
    const file = resolve(ROOT, `assets/skills-ui/panel_corners_${theme}.webp`);
    await page.goto(pathToFileURL(file).href);
    const result = await page.evaluate(() => {
      const image = document.querySelector('img');
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = image.naturalWidth;
      fullCanvas.height = image.naturalHeight;
      const fullContext = fullCanvas.getContext('2d', { willReadFrequently: true });
      fullContext.drawImage(image, 0, 0);
      const fullPixels = fullContext.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
      const rgbaAt = (x, y) => {
        const offset = (y * image.naturalWidth + x) * 4;
        return fullPixels.subarray(offset, offset + 4);
      };
      const samePixel = (a, b) =>
        a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
      let horizontalMismatch = false;
      let verticalMismatch = false;
      let transparent = 0;
      let painted = 0;
      for (let y = 0; y < image.naturalHeight; y += 1) {
        for (let x = 0; x < image.naturalWidth; x += 1) {
          const pixel = rgbaAt(x, y);
          if (pixel[3] === 0) transparent += 1;
          if (pixel[3] > 32) painted += 1;
          if (!horizontalMismatch && !samePixel(pixel, rgbaAt(image.naturalWidth - 1 - x, y))) {
            horizontalMismatch = true;
          }
          if (!verticalMismatch && !samePixel(pixel, rgbaAt(x, image.naturalHeight - 1 - y))) {
            verticalMismatch = true;
          }
        }
      }
      let borderAlpha = 0;
      for (let x = 0; x < image.naturalWidth; x += 1) {
        borderAlpha = Math.max(borderAlpha, rgbaAt(x, 0)[3], rgbaAt(x, image.naturalHeight - 1)[3]);
      }
      for (let y = 0; y < image.naturalHeight; y += 1) {
        borderAlpha = Math.max(borderAlpha, rgbaAt(0, y)[3], rgbaAt(image.naturalWidth - 1, y)[3]);
      }

      const width = Math.floor(image.naturalWidth / 2);
      const height = Math.floor(image.naturalHeight / 2);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const solid = (x, y) => pixels[(y * width + x) * 4 + 3] > 32;
      let longest = 0;
      let row = -1;
      // A damaged corner ends in a long, ruler-straight horizontal cut inside
      // the quadrant. Natural scroll tips may have tiny horizontal runs, but
      // not a flat termination longer than ten old logical pixels.
      for (let y = Math.floor(height * .35); y < height - 1; y += 1) {
        let run = 0;
        for (let x = 0; x < width; x += 1) {
          if (solid(x, y) && !solid(x, y + 1)) {
            run += 1;
            if (run > longest) { longest = run; row = y; }
          } else {
            run = 0;
          }
        }
      }
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        borderAlpha,
        transparentFraction: transparent / (image.naturalWidth * image.naturalHeight),
        paintedFraction: painted / (image.naturalWidth * image.naturalHeight),
        horizontalMismatch,
        verticalMismatch,
        longestLogical: longest / (image.naturalWidth / 352),
        rowLogical: row / (image.naturalHeight / 380),
      };
    });
    const checks = [
      ['high-resolution 1408x1520 sheet', result.width === 1408 && result.height === 1520],
      ['genuine transparent background and painted ornament', result.transparentFraction > .35 && result.paintedFraction > .05],
      ['transparent outer safety margin', result.borderAlpha === 0],
      ['exact bilateral and vertical symmetry', !result.horizontalMismatch && !result.verticalMismatch],
      ['no cut-off inner corner edge', result.longestLogical <= 10],
    ];
    for (const [label, ok] of checks) {
      const detail = label === 'no cut-off inner corner edge' && !ok
        ? ` — flat run ${result.longestLogical.toFixed(1)}px at y=${result.rowLogical.toFixed(1)}`
        : '';
      console.log(`${ok ? 'ok  ' : 'FAIL'}  ${theme}: ${label}${detail}`);
      if (!ok) failures += 1;
    }
  }
} finally {
  await browser.close();
}

console.log(failures ? `\nFAIL — ${failures} damaged corner sheet(s)` : '\nPASS');
process.exit(failures ? 1 : 0);
