import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = resolve(import.meta.dirname, '..');
assert.ok(existsSync(resolve(root, 'src/skins/legacy/index.js')),
  'the existing reskin must have an independent Legacy lifecycle entry');
assert.ok(!existsSync(resolve(root, 'src/modules')) && !existsSync(resolve(root, 'src/styles')),
  'Legacy presentation must live inside its skin, not in global module/style folders');

// A Fantasy/shared import of Legacy would silently inherit its presentation.
for (const entry of ['src/skins/fantasy/index.js', ...readdirSync(resolve(root, 'src/shared'))
  .filter(name => name.endsWith('.js')).map(name => `src/shared/${name}`)]) {
  assert.ok(existsSync(resolve(root, entry)), `skin boundary entry missing: ${entry}`);
  const result = await build({ entryPoints: [resolve(root, entry)], bundle: true,
    write: false, metafile: true, platform: 'browser', loader: { '.css': 'text' } });
  assert.ok(Object.keys(result.metafile.inputs).every(file => !file.replaceAll('\\', '/').includes('/legacy/')),
    `${entry} must not depend on Legacy rules`);
}

for (const name of readdirSync(resolve(root, 'src/skins/legacy/modules'))) {
  if (!name.endsWith('.js')) continue;
  const source = readFileSync(resolve(root, 'src/skins/legacy/modules', name), 'utf8');
  assert.doesNotMatch(source, /from\s+['"][^'"]*fantasy\//, `${name} must not couple Legacy to Fantasy`);
}
console.log('skin boundaries: independent presentation compartments PASS');

// Loading both profile modules must leave Legacy callbacks inert until the
// controller explicitly activates Legacy, even when Fantasy starts first.
const probe = await build({ stdin: { resolveDir: root, contents: `
  export {start as startLegacy, stop as stopLegacy} from './src/skins/legacy/index.js';
  export {start as startFantasy} from './src/skins/fantasy/index.js';
  import {guard} from './src/skins/legacy/modules/Runtime.js';
  export function runLegacyCallback(fn) { return guard('inactive-profile-probe', fn); }
` }, bundle: true, write: false, format: 'iife', globalName: 'BoundaryProbe', loader: { '.css': 'text' } });
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
try {
  dom.window.eval(probe.outputFiles[0].text);
  dom.window.BoundaryProbe.startFantasy();
  dom.window.BoundaryProbe.runLegacyCallback(() => dom.window.document.body.dataset.legacyWrite = '1');
  assert.equal(dom.window.document.body.dataset.legacyWrite, undefined,
    'merely importing Legacy must not enable its presentation callbacks during Fantasy');
} finally { dom.window.close(); }
