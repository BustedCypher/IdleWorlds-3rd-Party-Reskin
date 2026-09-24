#!/usr/bin/env node
/**
 * export-theme-css.mjs
 *
 * Writes the fantasy theme's CSS exactly as the extension injects it: the same
 * seven stylesheets, in the same order, with the same per-file transform
 * (comment strip + esbuild whitespace minify, target chrome109) and the same
 * concatenation, so the game can ship it unchanged.
 *
 * The only change from the extension is the asset URL. The extension rewrites
 * `url(../assets/<path>)` to `chrome-extension://…/assets/<path>` at injection
 * time (src/modules/StyleInjector.js). This tool applies the SAME regex and
 * points it at `--asset-base` instead, which is wherever the game will serve
 * the repository's `assets/` folder from.
 *
 * Self-check: before rewriting URLs, every per-file transform is compared with
 * the string the committed `dist/content.bundle.js` actually embeds. A mismatch
 * fails the run, because it means this export and the shipped extension have
 * drifted (usually: `src/styles` edited without `npm run build`).
 *
 * Usage (from the repository root):
 *   node handoff/native-render-migration/tools/export-theme-css.mjs
 *   node handoff/native-render-migration/tools/export-theme-css.mjs --asset-base=/static/fantasy/
 *   node handoff/native-render-migration/tools/export-theme-css.mjs --out=some/dir --no-verify
 *   node handoff/native-render-migration/tools/export-theme-css.mjs --bundle=path/to/content.bundle.js
 */
import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [k, ...v] = arg.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const ASSET_BASE = String(args['asset-base'] ?? '/fantasy-skin/').replace(/\/?$/, '/');
const OUT = path.resolve(ROOT, String(args.out ?? 'handoff/native-render-migration/generated/theme-css'));
const VERIFY = !args['no-verify'];
const BUNDLE = path.resolve(ROOT, String(args.bundle ?? 'dist/content.bundle.js'));

/**
 * Injection order and composition. Mirrors src/content.js
 * `injectPresentationStyles()` and UIFoundation `injectUIFoundationStyles()`.
 * Each id is the extension's `<style data-iw-style="<id>">`.
 */
const SHEETS = [
  { id: 'base', files: ['base.css'] },
  { id: 'tooltip-engine', files: ['tooltip-engine.css'] },
  { id: 'inventory', files: ['inventory.css'] },
  { id: 'skillpanel', files: ['skillpanel.css', 'skillcard-v2.css', 'skillcard-v2-runtime-safe.css', 'card-button-atlas.css', 'card-buttons.css'] },
  { id: 'header', files: ['header.css'] },
  { id: 'overlay', files: ['overlay.css'] },
  { id: 'ui-system', files: ['ui-system.css', 'compact-buttons.css', 'village-scene.css', 'collapsible.css'] },
];

/** The bundle variable esbuild's text loader gives each file. */
const bundleVar = file => `${file.replace(/\.css$/, '').replace(/[^a-z0-9]+/gi, '_')}_default`;

/** Verbatim copy of build-tools/build.mjs stripCssComments(). */
function stripCssComments(css) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < css.length) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += css[i + 1] ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; i += 1; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
}

/** Same transform build-tools/build.mjs applies in its text-loader plugin. */
async function transformFile(file) {
  const source = await readFile(path.join(ROOT, 'src', 'styles', file), 'utf8');
  const normalized = stripCssComments(source.replace(/\r\n?/g, '\n'));
  const { code } = await transform(normalized, {
    loader: 'css', minifyWhitespace: true, charset: 'utf8', target: ['chrome109'],
  });
  return code;
}

/** Same regex as src/modules/StyleInjector.js rewriteAssetUrls(). */
const ASSET_URL = /url\(\s*(['"]?)\.\.\/assets\/([^)'"\s]+)\1\s*\)/g;

async function bundleStrings() {
  const text = await readFile(BUNDLE, 'utf8');
  const found = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*var ([a-z0-9_]+_default) = (['"`].*);$/.exec(line);
    if (!m) continue;
    // The committed bundle is our own build output; evaluating one string
    // literal from it is the exact way to read what it embeds.
    found.set(m[1], Function(`"use strict"; return (${m[2]});`)());
  }
  return found;
}

const sha256 = value => createHash('sha256').update(value).digest('hex');

const embedded = VERIFY ? await bundleStrings() : null;
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const manifest = {
  generatedBy: 'handoff/native-render-migration/tools/export-theme-css.mjs',
  assetBase: ASSET_BASE,
  note: 'Link these files in this order, AFTER every stylesheet the game itself ships. Do not edit, reorder, merge differently or re-minify them.',
  sheets: [],
  assets: [],
};
const assets = new Set();
let problems = 0;

for (const [index, sheet] of SHEETS.entries()) {
  const parts = [];
  for (const file of sheet.files) {
    const code = await transformFile(file);
    if (embedded) {
      const shipped = embedded.get(bundleVar(file));
      if (shipped === undefined) {
        console.error(`MISSING in dist/content.bundle.js: ${bundleVar(file)} (${file})`);
        problems += 1;
      } else if (shipped !== code) {
        console.error(`DRIFT: src/styles/${file} no longer matches the committed bundle. Run \`npm run build\` first.`);
        problems += 1;
      }
    }
    parts.push(code);
  }
  // Runtime concatenation: content.js joins the skillpanel group, and
  // UIFoundation the ui-system group, with a single '\n'.
  const css = parts.join('\n').replace(ASSET_URL, (_m, _q, rel) => {
    assets.add(`assets/${rel}`);
    return `url("${ASSET_BASE}assets/${rel}")`;
  });
  const name = `${String(index + 1).padStart(2, '0')}-${sheet.id}.css`;
  await writeFile(path.join(OUT, name), css, 'utf8');
  manifest.sheets.push({
    order: index + 1,
    file: name,
    extensionStyleId: sheet.id,
    sources: sheet.files.map(f => `src/styles/${f}`),
    bytes: Buffer.byteLength(css),
    sha256: sha256(css),
  });
}

// Every asset the CSS references must exist in the repository's assets/.
const allAssets = new Set();
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else allAssets.add(path.relative(ROOT, full).split(path.sep).join('/'));
  }
}
await walk(path.join(ROOT, 'assets'));
for (const asset of [...assets].sort()) {
  const present = allAssets.has(asset);
  if (!present) { console.error(`MISSING ASSET referenced by CSS: ${asset}`); problems += 1; }
  manifest.assets.push({ path: asset, present });
}

await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Wrote ${manifest.sheets.length} stylesheets and manifest.json to ${path.relative(ROOT, OUT)}`);
for (const s of manifest.sheets) console.log(`  ${s.file.padEnd(22)} ${String(s.bytes).padStart(8)} bytes  ${s.sources.join(' + ')}`);
console.log(`  ${manifest.assets.length} distinct assets referenced from CSS (asset base "${ASSET_BASE}")`);
if (VERIFY) console.log(problems ? '' : '  verified: every file matches the string dist/content.bundle.js embeds');
if (problems) {
  console.error(`\n${problems} problem(s). The export is NOT a faithful copy of the shipped theme.`);
  process.exit(1);
}
