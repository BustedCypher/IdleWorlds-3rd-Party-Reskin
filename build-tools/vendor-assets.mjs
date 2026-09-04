/**
 * vendor-assets — download the sprite atlases and typefaces into assets/
 *
 *   node vendor-assets.mjs
 *
 * Run this once after cloning, and again whenever ASSET_REVISION below is
 * bumped. The downloaded files are committed with the extension: they are what
 * makes the skin CSP-proof and offline-capable.
 *
 * Why this exists at all — the previous build fetched both atlases from
 * raw.githubusercontent.com at runtime and applied them as
 * `background-image: url(https://…)`. That request is made by the PAGE, so a
 * Content-Security-Policy change on idleworlds.com could blank every icon in
 * the game at once. Same story for the Google Fonts @import. (Audit S1.1/S1.2)
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// 2026-09-04: bumped for the v5.4 Woodcutting & Construction art pack —
// item_icons_atlas.png grows 1280x4864 -> 1280x6144 and item_icons_index.csv
// gains 102 rows (34 timber, 34 Building Parts, 34 buildings). The gear atlas
// and manifest are byte-identical to the previous pin (39bc876), so this still
// carries the shared +4 gear overlay; only the item atlas moved.
const ASSET_REVISION = 'eadbc0fe1eae549184dd740470b69fc76974a411';
const REPO_BASE =
  `https://raw.githubusercontent.com/BustedCypher/idleWorlds-game-sprites-BC/${ASSET_REVISION}/`;

const SPRITES = [
  ['gear_icons_manifest.json', 'assets/gear_icons_manifest.json'],
  ['gear_icons_atlas.png',     'assets/gear_icons_atlas.png'],
  ['item_icons_index.csv',     'assets/item_icons_index.csv'],
  ['item_icons_atlas.png',     'assets/item_icons_atlas.png'],
];

/**
 * Google Fonts serves different formats by User-Agent. Asking as a modern
 * browser gets woff2; the CSS response then contains the real file URLs.
 */
const FONT_CSS =
  'https://fonts.googleapis.com/css2' +
  '?family=Cinzel:wght@600;700' +
  '&family=Barlow:wght@400;500;600;700' +
  '&family=Crimson+Text:ital@1' +
  '&display=swap';

const MODERN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Which @font-face block maps to which local filename, matched on the
// family + weight + style recorded in the CSS Google returns.
const FONT_TARGETS = [
  { family: 'Cinzel',       weight: null,  style: 'normal', out: 'assets/fonts/cinzel-variable.woff2' },
  { family: 'Barlow',       weight: '400', style: 'normal', out: 'assets/fonts/barlow-400.woff2' },
  { family: 'Barlow',       weight: '500', style: 'normal', out: 'assets/fonts/barlow-500.woff2' },
  { family: 'Barlow',       weight: '600', style: 'normal', out: 'assets/fonts/barlow-600.woff2' },
  { family: 'Barlow',       weight: '700', style: 'normal', out: 'assets/fonts/barlow-700.woff2' },
  { family: 'Crimson Text', weight: null,  style: 'italic', out: 'assets/fonts/crimson-text-italic.woff2' },
];

async function download(url, outPath, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`  ✓ ${outPath}  (${kb} KB)`);
  return buf.length;
}

async function vendorSprites() {
  console.log(`\nSprite atlases @ ${ASSET_REVISION.slice(0, 10)}`);
  for (const [remote, local] of SPRITES) {
    await download(REPO_BASE + remote, local);
  }
}

function parseFontFaces(css) {
  const faces = [];
  const blockRe = /@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css))) {
    const body = m[1];
    const family = /font-family:\s*'([^']+)'/.exec(body)?.[1];
    const weight = /font-weight:\s*([^;]+);/.exec(body)?.[1]?.trim();
    const style  = /font-style:\s*([^;]+);/.exec(body)?.[1]?.trim() || 'normal';
    const src    = /url\((https:\/\/[^)]+\.woff2)\)/.exec(body)?.[1];
    if (family && src) faces.push({ family, weight, style, src });
  }
  return faces;
}

async function vendorFonts() {
  console.log('\nTypefaces');
  const res = await fetch(FONT_CSS, { headers: { 'User-Agent': MODERN_UA } });
  if (!res.ok) throw new Error(`Font CSS fetch failed: ${res.status}`);
  const css = await res.text();
  const faces = parseFontFaces(css);

  if (!faces.length) {
    throw new Error('No @font-face blocks found — Google Fonts response format changed?');
  }

  for (const target of FONT_TARGETS) {
    // Google may return many unicode-range subsets per weight; the first match
    // is the latin subset, which is all this skin needs.
    const hit = faces.find(f =>
      f.family === target.family &&
      f.style === target.style &&
      (target.weight === null || f.weight === target.weight || f.weight?.includes(target.weight))
    );
    if (!hit) {
      console.warn(`  ! no match for ${target.family} ${target.weight ?? ''} ${target.style} — skipped`);
      continue;
    }
    await download(hit.src, target.out);
  }
}

/**
 * Verify what actually landed on disk.
 *
 * A download that returns 200 with an HTML error page, or an atlas whose real
 * pixel dimensions disagree with its manifest, produces the exact same silent
 * failure the bundling change was meant to eliminate: every icon resolves to
 * atlas cell 0,0 and nobody finds out until they look at the game.
 */
async function verify() {
  console.log('\nVerification');
  const problems = [];

  // PNG header + IHDR width/height, read without an image library.
  const pngSize = async path => {
    const buf = await readFile(path);
    const isPng = buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!isPng) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  };

  const gearManifest = JSON.parse(await readFile('assets/gear_icons_manifest.json', 'utf8'));
  const gearIcons = gearManifest.icons?.length ?? 0;
  const cell = gearManifest.cell_size ?? 128;
  console.log(`  gear manifest: ${gearIcons} icons, ${gearManifest.columns}x${gearManifest.rows} grid @ ${cell}px`);
  if (!gearIcons) problems.push('gear manifest has no icons');

  const gearPng = await pngSize('assets/gear_icons_atlas.png');
  if (!gearPng) problems.push('gear atlas is not a valid PNG (an error page?)');
  else {
    console.log(`  gear atlas:    ${gearPng.width}x${gearPng.height}px`);
    const expectedW = (gearManifest.columns ?? 10) * cell;
    if (gearPng.width !== expectedW) {
      problems.push(`gear atlas width ${gearPng.width} != manifest columns*cell ${expectedW}`);
    }
    // Every icon must actually fall inside the image.
    const overflow = (gearManifest.icons ?? []).filter(i =>
      Number(i.x) + Number(i.width) > gearPng.width ||
      Number(i.y) + Number(i.height) > gearPng.height);
    if (overflow.length) problems.push(`${overflow.length} gear icons fall outside the atlas bounds`);
  }

  const csv = await readFile('assets/item_icons_index.csv', 'utf8');
  const [headerLine, ...rows] = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = headerLine.split(',').map(h => h.trim());
  // Must match REQUIRED_ITEM_COLUMNS in src/modules/AtlasService.js.
  for (const col of ['item_id', 'name', 'x', 'y', 'width', 'height']) {
    if (!headers.includes(col)) problems.push(`item index missing required column '${col}'`);
  }
  console.log(`  item index:    ${rows.length} rows, columns: ${headers.join(', ')}`);

  const itemPng = await pngSize('assets/item_icons_atlas.png');
  if (!itemPng) problems.push('item atlas is not a valid PNG (an error page?)');
  else console.log(`  item atlas:    ${itemPng.width}x${itemPng.height}px`);

  for (const target of FONT_TARGETS) {
    const buf = await readFile(target.out).catch(() => null);
    if (!buf) { problems.push(`${target.out} missing`); continue; }
    // woff2 files start with the signature 'wOF2'.
    if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') {
      problems.push(`${target.out} is not a woff2 file`);
    }
  }
  console.log(`  fonts:         ${FONT_TARGETS.length} faces`);

  if (problems.length) {
    throw new Error('verification failed:\n  - ' + problems.join('\n  - '));
  }
  console.log('  all checks passed');
}

async function main() {
  console.log('Vendoring extension assets…');
  await vendorSprites();
  await vendorFonts();
  await verify();
  console.log('\nDone. Assets are bundled — no runtime network access needed.');
  console.log('Next: npm run build && npm test\n');
}

main().catch(err => {
  console.error(`\nvendor-assets failed: ${err.message}\n`);
  process.exitCode = 1;
});
