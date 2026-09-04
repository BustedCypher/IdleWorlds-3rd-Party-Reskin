/**
 * import-zone-headers.mjs
 *
 * Imports the real per-zone header paintings into the skin:
 *
 *   <source>/NN-<slug>.png  →  assets/header/zones/zone_<NN>.webp          (desktop, wide strip)
 *   <source>/NN-<slug>.png  →  assets/header/zones/zone_<NN>_mobile.webp   (--mobile, portrait crop)
 *
 * Source art lives in the sibling sprites repo:
 *   ../idleWorlds-game-sprites-BC/assets/zone-headers/environment-focused   (desktop)
 *   ../idleWorlds-game-sprites-BC/assets/zone-headers/mobile                (--mobile)
 * (override the dir with the first positional arg). Each file is cover-fit to
 * the target canvas and re-encoded as webp so the extension does not ship
 * multi-MB PNGs. The leading NN in the filename is the zone number; anything
 * without one is skipped, and a `NN-slug-vN.png` iteration is only used when it
 * is the ONLY file for that zone (the un-suffixed name wins otherwise).
 *
 * `header.css` paints zone_<N>.webp on the header plate normally and
 * zone_<N>_mobile.webp inside its `@media (max-width: 768px)` block, both via
 * the `--iw-header-surface` / `--iw-header-surface-mobile` vars
 * HeaderRenderer.applyZoneSurface() sets. `make-zone-surfaces.mjs` only fills
 * zones with no real desktop file.
 *
 * Usage:  node build-tools/import-zone-headers.mjs [sourceDir]
 *         node build-tools/import-zone-headers.mjs --mobile
 *         npm run import:zone-headers   /   npm run import:zone-headers:mobile
 */

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'header', 'zones');

const MOBILE = process.argv.includes('--mobile');
const posArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const SRC_DIR = posArgs[0]
  ? path.resolve(posArgs[0])
  : path.resolve(ROOT, '..', 'idleWorlds-game-sprites-BC', 'assets', 'zone-headers',
      MOBILE ? 'mobile' : 'environment-focused');
const OUT_SUFFIX = MOBILE ? '_mobile' : '';

// Desktop: a wide 4:1 strip for the full-width header bar. Mobile: the source's
// own 7:8 portrait, kept as-is — `header.css`'s @media block paints it
// `background-size: cover` into the stacked phone header, and both briefs keep
// a crop-safe central band.
const [TW, TH] = MOBILE ? [768, 880] : [1792, 440];
// Mobile art sits behind translucent stacked UI and is never the focal surface,
// so it can take a heavier compression than the desktop strip.
const QUALITY = MOBILE ? 0.74 : 0.80;

// One entry per zone. A `NN-slug-vN.png` iteration is only kept when it is the
// only file for its zone; the plain `NN-slug.png` always wins (mobile zone 11
// ships v2..v5 alongside the approved un-suffixed file).
const byZone = new Map();
for (const name of await readdir(SRC_DIR)) {
  const m = /^0*(\d{1,3})[-_ ]/.exec(name);
  if (!m || !/\.(png|jpe?g|webp)$/i.test(name)) continue;
  const n = Number(m[1]);
  const versioned = /-v\d+\.[a-z]+$/i.test(name);
  const cur = byZone.get(n);
  if (!cur || (cur.versioned && !versioned)) byZone.set(n, { n, name, versioned });
}
const entries = [...byZone.values()].sort((a, b) => a.n - b.n);

if (!entries.length) {
  console.error(`No "NN-*.png" files in ${SRC_DIR}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir(OUT_DIR, { recursive: true });

let total = 0;
for (const { n, name } of entries) {
  const srcBytes = await readFile(path.join(SRC_DIR, name));
  const ext = path.extname(name).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const uri = `data:${mime};base64,${srcBytes.toString('base64')}`;

  const b64 = await page.evaluate(async ({ uri, TW, TH, quality }) => {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = TW;
    canvas.height = TH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const scale = Math.max(TW / img.naturalWidth, TH / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (TW - dw) / 2, (TH - dh) / 2, dw, dh);
    return canvas.toDataURL('image/webp', quality).split(',')[1];
  }, { uri, TW, TH, quality: QUALITY });

  const outBytes = Buffer.from(b64, 'base64');
  total += outBytes.length;
  const outName = `zone_${n}${OUT_SUFFIX}.webp`;
  await writeFile(path.join(OUT_DIR, outName), outBytes);
  console.log(`${outName}  ←  ${name}  (${(srcBytes.length / 1048576).toFixed(1)} MB → ${(outBytes.length / 1024).toFixed(0)} KB)`);
}

await browser.close();
console.log(
  `\nImported ${entries.length} ${MOBILE ? 'mobile ' : ''}zone headers to ${path.relative(ROOT, OUT_DIR)}/ ` +
  `(${TW}x${TH}, ${(total / 1048576).toFixed(1)} MB total, avg ${(total / entries.length / 1024).toFixed(0)} KB)`
);
