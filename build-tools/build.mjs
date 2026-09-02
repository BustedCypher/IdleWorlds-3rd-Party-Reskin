import { build, transform } from 'esbuild';
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
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

/**
 * Strip CSS block comments, quote-aware.
 *
 * The stylesheets are inlined into the bundle verbatim by the text loader, so
 * every explanatory comment in src/styles ships to every player. They are worth
 * keeping in source and worth nothing at runtime. A naive /\/\*[\s\S]*?\*\// would
 * also eat a "/*" that appears inside a quoted string or a url(), so this walks
 * the text and only removes comments found outside string context.
 */
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
  // collapse the blank lines the removals leave behind
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
}

const normalizedCssTextPlugin = {
  name: 'normalized-css-text',
  setup(buildApi) {
    buildApi.onLoad({ filter: /\.css$/ }, async ({ path: cssPath }) => {
      const normalized = stripCssComments((await readFile(cssPath, 'utf8')).replace(/\r\n?/g, '\n'));
      const { code } = await transform(normalized, {
        loader: 'css',
        minifyWhitespace: true,
        charset: 'utf8',
        target: ['chrome109'],
      });
      return { contents: code, loader: 'text' };
    });
  },
};
const result = await build({
  entryPoints: [path.join(ROOT, 'src', 'content.js')],
  outfile: OUTFILE,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome109'],
  plugins: [normalizedCssTextPlugin],
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

// Advisory only. The committed bundle is intentionally un-minified for
// readability, so its size is not gated — but unusual growth should be loud.
const BUNDLE_SOFT_BUDGET = 300_000;
if (output.size >= BUNDLE_SOFT_BUDGET) {
  console.warn(`WARNING - bundle is ${output.size.toLocaleString()} bytes, over the ` +
    `${BUNDLE_SOFT_BUDGET.toLocaleString()}-byte soft budget. Not fatal; review the growth.`);
}

const staleBase = path.join(DIST, 'base.css');
if (await exists(staleBase)) {
  await rm(staleBase);
  console.log(`Removed stale ${staleBase}`);
}
