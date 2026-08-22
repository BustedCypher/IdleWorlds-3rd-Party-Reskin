import { build } from 'esbuild';
import { access, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(ROOT, 'assets');
const OUTFILE = path.join(DIST, 'content.bundle.js');
const allowMissingAssets = process.argv.includes('--allow-missing-assets');

const REQUIRED_ASSETS = [
  'gear_icons_atlas.png',
  'gear_icons_manifest.json',
  'item_icons_atlas.png',
  'item_icons_index.csv',
  'fonts/cinzel-variable.woff2',
  'fonts/barlow-400.woff2',
  'fonts/barlow-500.woff2',
  'fonts/barlow-600.woff2',
  'fonts/barlow-700.woff2',
  'fonts/crimson-text-italic.woff2',
];

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}
const missing = [];
for (const rel of REQUIRED_ASSETS) {
  if (!(await exists(path.join(ASSETS, rel)))) missing.push(rel);
}

if (missing.length) {
  const level = allowMissingAssets ? 'WARNING' : 'ERROR';
  console.error(`\n${level} - missing bundled assets:`);
  for (const rel of missing) console.error(`         assets/${rel}`);
  console.error('\n         Fix:  npm run vendor');
  console.error('         Without these, icons and typefaces fall back.\n');
  if (!allowMissingAssets) process.exit(1);
}

await mkdir(DIST, { recursive: true });

const result = await build({
  entryPoints: [path.join(ROOT, 'src', 'content.js')],
  outfile: OUTFILE,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome109'],
  loader: { '.css': 'text' },
  charset: 'utf8',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  metafile: true,
});
const output = await stat(OUTFILE);
const sourceInputs = Object.keys(result.metafile.inputs)
  .filter(file => /\.(?:js|css)$/i.test(file)).length;
console.log(`Built ${OUTFILE} (${output.size.toLocaleString()} bytes, ${sourceInputs} source modules)`);

const staleBase = path.join(DIST, 'base.css');
if (await exists(staleBase)) {
  await rm(staleBase);
  console.log(`Removed stale ${staleBase}`);
}
