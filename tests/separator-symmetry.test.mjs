/**
 * The inventory title ornament must be truly bilateral. The source atlas cell
 * is offset and its left wing is damaged, so a crop or partial blend can look
 * plausible while still producing visibly different silhouettes.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { THEME_NAMES } from '../src/modules/zoneThemes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'assets/inventory/separator_flourish.webp',
  ...THEME_NAMES.map(theme => `assets/skills-ui/separator_flourish_${theme}.webp`),
];

const browser = await chromium.launch();
const page = await browser.newPage();
let failures = 0;

for (const file of files) {
  const bytes = await readFile(resolve(ROOT, file));
  const uri = `data:image/webp;base64,${bytes.toString('base64')}`;
  const result = await page.evaluate(async source => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let difference = 0;
    let compared = 0;
    let left = canvas.width;
    let right = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < Math.floor(canvas.width / 2); x += 1) {
        const mirrorX = canvas.width - 1 - x;
        const a = (y * canvas.width + x) * 4;
        const b = (y * canvas.width + mirrorX) * 4;
        if (Math.max(data[a + 3], data[b + 3]) > 8) {
          for (let channel = 0; channel < 4; channel += 1) {
            difference += Math.abs(data[a + channel] - data[b + channel]);
            compared += 1;
          }
        }
      }
      for (let x = 0; x < canvas.width; x += 1) {
        if (data[(y * canvas.width + x) * 4 + 3] > 8) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    return {
      meanDifference: compared ? difference / compared : Infinity,
      marginDifference: Math.abs(left - (canvas.width - 1 - right)),
    };
  }, uri);

  const ok = result.meanDifference < 5 && result.marginDifference <= 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${basename(file)} is bilaterally symmetrical` +
    `${ok ? '' : ` — mean difference ${result.meanDifference.toFixed(2)}, margin delta ${result.marginDifference}px`}`);
  if (!ok) failures += 1;
}

await browser.close();
console.log(failures === 0 ? '\nPASS' : `\nFAIL — ${failures} asymmetric separator asset(s)`);
process.exit(failures === 0 ? 0 : 1);
