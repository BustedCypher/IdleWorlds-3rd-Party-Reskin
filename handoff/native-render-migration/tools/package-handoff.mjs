#!/usr/bin/env node
/**
 * package-handoff.mjs — the documentation-only zip for the IdleWorlds dev.
 *
 *   node handoff/native-render-migration/tools/package-handoff.mjs [--date=YYYY-MM-DD]
 *
 * Writes handoff/native-render-migration-docs-<date>.zip containing ONLY the
 * package's markdown documentation (README + chapters 01–13). No extension
 * source, assets, generated data or tools.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(PKG, '..', '..');
const date = (process.argv.find(a => a.startsWith('--date=')) || '').slice(7) || new Date().toISOString().slice(0, 10);
const TOP = 'native-render-migration-docs';
const OUT = path.join(ROOT, 'handoff', `native-render-migration-docs-${date}.zip`);

const docs = readdirSync(PKG).filter(f => f.endsWith('.md')).sort();
const stage = mkdtempSync(path.join(tmpdir(), 'iw-docs-'));
mkdirSync(path.join(stage, TOP));
for (const f of docs) cpSync(path.join(PKG, f), path.join(stage, TOP, f));

rmSync(OUT, { force: true });
const run = process.platform === 'win32'
  ? spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', OUT, '-C', stage, TOP], { encoding: 'utf8' })
  : spawnSync('zip', ['-r', '-X', '-q', OUT, TOP], { cwd: stage, encoding: 'utf8' });
rmSync(stage, { recursive: true, force: true });
if (run.status !== 0) throw new Error(`zip failed: ${run.stderr || run.error}`);
console.log(`${path.relative(ROOT, OUT)}  ${(statSync(OUT).size / 1024).toFixed(0)} KB  (${docs.length} documents)`);
