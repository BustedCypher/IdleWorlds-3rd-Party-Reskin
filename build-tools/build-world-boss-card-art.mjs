/** Resize approved PNG masters to the live card WebPs; no repainting or cropping. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'assets/world-bosses/cards-v1');
const sources = {
  'ancient-treant': 'ancient-treant-v4/ancient-treant-master.png',
  'abyssal-behemoth': 'abyssal-behemoth-v1/abyssal-behemoth-master.png',
  'world-eater': 'world-eater-v1/world-eater-master.png',
};
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [key, source] of Object.entries(sources)) {
    const data = await readFile(resolve(root, 'assets/world-bosses', source));
    const webp = await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1600; canvas.height = Math.round(canvas.width * image.height / image.width);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/webp', .86).split(',')[1];
    }, `data:image/png;base64,${data.toString('base64')}`);
    const bytes = Buffer.from(webp, 'base64');
    await writeFile(resolve(out, `${key}.webp`), bytes);
    console.log(`${key}.webp: ${bytes.length} bytes`);
  }
} finally { await browser.close(); }
