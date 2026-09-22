#!/usr/bin/env node
/**
 * file-inventory.mjs — Appendix A: every tracked file in the repository.
 *
 *   node handoff/reskin-technical-handover/tools/file-inventory.mjs
 *
 * For each file from `git ls-files`: size, line count (text files), whether it
 * ships in the release zip (the allowlist logic of
 * build-tools/package-release.mjs, replicated), how the runtime uses it, and a
 * one-line description extracted from the file itself (first doc comment,
 * first heading, <title>, JSON keys, CSV header, image dimensions) or from the
 * asset-family patterns below. Writes ../appendix-a-file-inventory.md.
 *
 * Descriptions are EXTRACTED, not written by hand, so they are only as good as
 * the files' own headers; asset-family labels are pattern-based.
 */
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const OUT = path.resolve(HERE, '..', 'appendix-a-file-inventory.md');

const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
if (!files.length) throw new Error('file-inventory: git ls-files returned nothing');

const manifest = JSON.parse(await readFile(path.join(ROOT, 'manifest.json'), 'utf8'));
const contentScripts = new Set(manifest.content_scripts.flatMap(s => s.js || []));
const PACKAGE_EXCLUDE = [/\.md$/i, /\.html$/i, /(^|\/)prompts?\.(txt|json)$/i, /^assets\/skills-ui\/buttons\/themes-v2\//, /^assets\/skills-ui\/buttons\/source-v4\//];
const ships = f => f === 'manifest.json' || contentScripts.has(f) || (f.startsWith('assets/') && !PACKAGE_EXCLUDE.some(rx => rx.test(f)));

const TEXT = /\.(m?js|cjs|css|md|json|csv|txt|html|py|ps1|yml|yaml|svg)$|^\.gitignore$|(^|\/)\.gitignore$/i;
const srcFiles = files.filter(f => /^src\/.*\.(js|css)$/.test(f) && !f.endsWith('header.claude.css'));
const srcText = new Map();
for (const f of srcFiles) srcText.set(f, await readFile(path.join(ROOT, f), 'utf8'));
/* Comments are stripped before searching, so a path mentioned only in prose
   ("Source of truth: assets/…") does not count as a runtime reference. */
const stripBlock = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
const cssCorpus = [...srcText].filter(([f]) => f.endsWith('.css')).map(([, t]) => stripBlock(t)).join('\n');
const jsCorpus = [...srcText].filter(([f]) => f.endsWith('.js'))
  .map(([, t]) => stripBlock(t).replace(/(^|\s)\/\/.*$/gm, '$1')).join('\n');

const FETCHED = new Set(['assets/gear_icons_manifest.json', 'assets/item_icons_index.csv', 'assets/skills_icons_index.json', 'assets/skills_ui_index.json']);
const BUNDLED_JSON = new Set(['assets/skills-ui/buttons/revised-v5/index.json', 'assets/world-bosses/rewards.json']);
const DYNAMIC = [
  [/^assets\/header\/zones\/zone_\d+(_mobile)?\.webp$/, 'JS assetUrl (zone template)'],
  [/^assets\/skills-ui\/(theme|panel_corners|separator_flourish)_[a-z-]+\.webp$/, 'JS assetUrl (theme template)'],
  [/^assets\/skills-ui\/buttons\/revised-v5\/[a-z-]+\.png$/, 'JS assetUrl (theme template)'],
  [/^assets\/skills-ui\/buttons\/compact-ghost-v3\/[a-z-]+\.png$/, 'JS assetUrl (theme template)'],
  [/^assets\/village\/(building|house)_\d+\.webp$/, 'JS assetUrl (generated table)'],
  [/^assets\/skills-ui\/buttons\/exact-v3\/[a-z-]+\/[a-z-]+\.png$/, 'UNREACHABLE (dead branch, SIZE-01)'],
];
function runtimeUse(f) {
  if (contentScripts.has(f)) return f.startsWith('dist/') ? 'content script (ISOLATED)' : 'content script (MAIN)';
  if (f === 'manifest.json') return 'extension manifest';
  if (f === 'src/styles/header.claude.css') return 'not imported';
  if (/^src\/.*\.css$/.test(f)) return 'bundled CSS';
  if (/^src\/.*\.js$/.test(f)) return 'bundled JS';
  if (!f.startsWith('assets/')) return '—';
  if (FETCHED.has(f)) return 'fetched at runtime';
  if (BUNDLED_JSON.has(f)) return 'imported into bundle';
  for (const [rx, label] of DYNAMIC) if (rx.test(f)) return label;
  const rel = f.replace(/^assets\//, '');
  const base = path.basename(f);
  const inCss = cssCorpus.includes(`../assets/${rel}`);
  const inJs = jsCorpus.includes(`assets/${rel}`) || (base.endsWith('.webp') || base.endsWith('.png') ? jsCorpus.includes(`'${base}'`) : false);
  if (f === 'assets/skills_icons_atlas.webp' || f === 'assets/skills_ui_atlas.webp') return 'named by fetched index';
  if (inCss && inJs) return 'CSS url() + JS';
  if (inCss) return 'CSS url()';
  if (inJs) return 'JS assetUrl';
  if (/\.(md|html|txt)$/i.test(f) || /prompts?\.json$/.test(f)) return 'documentation (not shipped)';
  return 'not referenced at runtime';
}

const FAMILY = [
  [/^assets\/header\/zones\/zone_(\d+)_mobile\.webp$/, m => `Zone ${m[1]} header painting (mobile portrait crop)`],
  [/^assets\/header\/zones\/zone_(\d+)\.webp$/, m => `Zone ${m[1]} header painting (desktop strip)`],
  [/^assets\/village\/building_(\d+)\.webp$/, m => `Village add-on building art, tier ${m[1]}`],
  [/^assets\/village\/house_(\d+)\.webp$/, m => `Village housing art, tier ${m[1]}`],
  [/^assets\/skills-ui\/theme_([a-z-]+)\.webp$/, m => `Skills UI atlas recoloured for the ${m[1]} theme`],
  [/^assets\/skills-ui\/panel_corners_([a-z-]+)\.webp$/, m => `Frame corner filigree sheet, ${m[1]} theme`],
  [/^assets\/skills-ui\/separator_flourish_([a-z-]+)\.webp$/, m => `Separator flourish sheet, ${m[1]} theme`],
  [/^assets\/skills-ui\/buttons\/exact-v3\/([a-z-]+)\/([a-z-]+)\.png$/, m => `exact-v3 button state "${m[2]}", ${m[1]} theme`],
  [/^assets\/skills-ui\/buttons\/revised-v5\/([a-z-]+)\.png$/, m => `Revised action + chevron button atlas (idle/hover/pressed), ${m[1]} theme`],
  [/^assets\/skills-ui\/buttons\/compact-ghost-v3\/([a-z-]+)\.png$/, m => `Compact ghost-metal control atlas, ${m[1]} theme`],
  [/^assets\/skills-ui\/action-icons\/([a-z-]+)\.svg$/, m => `V2 action-button icon: ${m[1]}`],
  [/^assets\/fonts\/(.+)\.woff2$/, m => `Web font: ${m[1]}`],
];

function firstComment(text) {
  const lines = text.split(/\r?\n/).slice(0, 60);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#!') || /^\/\*\*?$/.test(line) || /^\*\/$/.test(line) || /^[═─=*\s/]+$/.test(line)) continue;
    const m = line.match(/^(?:\/\*+|\*|\/\/+|#)\s*(.*?)\s*(?:\*\/)?$/);
    if (m && m[1] && !/^(eslint|@ts-|global |jshint|prettier)/.test(m[1]) && /[a-z]/i.test(m[1])) return m[1];
    if (!/^(\/\*|\*|\/\/|#)/.test(line)) break; // code reached before any comment
  }
  return '';
}
function dimensions(buf, f) {
  if (f.endsWith('.png') && buf.length > 24) return `${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)} px`;
  if (f.endsWith('.webp') && buf.length > 30) {
    const t = buf.toString('ascii', 12, 16);
    if (t === 'VP8X') return `${1 + buf.readUIntLE(24, 3)}×${1 + buf.readUIntLE(27, 3)} px`;
    if (t === 'VP8 ') return `${buf.readUInt16LE(26) & 0x3fff}×${buf.readUInt16LE(28) & 0x3fff} px`;
    if (t === 'VP8L') { const b = buf.readUInt32LE(21); return `${(b & 0x3fff) + 1}×${((b >> 14) & 0x3fff) + 1} px`; }
  }
  return '';
}
async function describe(f) {
  const family = FAMILY.map(([rx, fn]) => { const m = f.match(rx); return m ? fn(m) : null; }).find(Boolean);
  const abs = path.join(ROOT, f);
  if (/\.(png|webp)$/i.test(f)) {
    const buf = await readFile(abs);
    const dims = dimensions(buf, f);
    return [family, dims].filter(Boolean).join(' — ') || dims;
  }
  if (family) return family;
  if (/\.(pdf)$/i.test(f)) return 'PDF document';
  if (/\.woff2$/i.test(f)) return 'Web font';
  if (!TEXT.test(f)) return '';
  const text = await readFile(abs, 'utf8');
  if (f.endsWith('package-lock.json')) return 'npm lockfile (exact dev-dependency versions)';
  if (/\.md$/i.test(f)) return (text.match(/^#\s+(.+)$/m) || [])[1] || firstComment(text);
  if (/\.html$/i.test(f)) return ((text.match(/<title>([^<]+)<\/title>/i) || [])[1] || '').trim() || 'HTML page';
  if (/\.json$/i.test(f)) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return `JSON array (${data.length} entries)`;
      const keys = Object.keys(data);
      return `JSON: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ', …' : ''}`;
    } catch { return 'JSON'; }
  }
  if (/\.csv$/i.test(f)) {
    const rows = text.split(/\r?\n/).filter(Boolean);
    return `CSV (${rows.length - 1} rows): ${rows[0].replace(/^﻿/, '').split(',').slice(0, 6).join(', ')}…`;
  }
  if (/\.svg$/i.test(f)) return `SVG${(text.match(/viewBox="([^"]+)"/) || [])[1] ? ` (viewBox ${(text.match(/viewBox="([^"]+)"/) || [])[1]})` : ''}`;
  if (/\.ya?ml$/i.test(f)) return `Workflow: ${((text.match(/^name:\s*(.+)$/m) || [])[1] || '').trim()}`;
  if (/\.txt$/i.test(f)) return text.split(/\r?\n/).find(l => l.trim())?.trim().slice(0, 140) || '';
  if (/(^|\/)\.gitignore$/.test(f)) return 'Git ignore rules';
  return firstComment(text);
}

const rows = [];
let totalBytes = 0, shipped = 0, shippedBytes = 0;
for (const f of files) {
  const abs = path.join(ROOT, f);
  const { size } = await stat(abs);
  totalBytes += size;
  let lines = '';
  if (TEXT.test(f) && size < 5_000_000 && !f.endsWith('package-lock.json')) {
    const text = await readFile(abs, 'utf8');
    lines = String(text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0));
  }
  const s = ships(f);
  if (s) { shipped += 1; shippedBytes += size; }
  rows.push({ f, size, lines, ships: s, use: runtimeUse(f), desc: (await describe(f)).replace(/\|/g, '\\|').slice(0, 160) });
}

const human = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${n} B`);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const groups = new Map();
for (const r of rows) {
  const parts = r.f.split('/');
  const key = parts.length === 1 ? '(repository root)' : parts.length > 3 && parts[0] === 'assets' ? parts.slice(0, 3).join('/') : parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

const md = [
  '# Appendix A — File inventory',
  '',
  `Generated by \`tools/file-inventory.mjs\` from \`git ls-files\` at commit \`${commit}\`. ` +
  `**${rows.length} tracked files, ${human(totalBytes)}.** ${shipped} of them (${human(shippedBytes)}) ship in the release zip (the allowlist of \`build-tools/package-release.mjs\`).`,
  '',
  '**Columns.** *Ships*: included in `npm run package` output. *Runtime use*: how the running extension uses the file. The value is `bundled`, `fetched at runtime`, `CSS url()`, `JS assetUrl`, a template family, `not referenced at runtime`, or `UNREACHABLE`. *Description*: extracted from the file (first doc comment or heading, JSON keys, CSV header, image size) or from the asset-family pattern. Untracked and ignored local folders (browser profile, `tmp/`, `output/`, `release/`, `node_modules/`) are listed in [§1.7.2](01-project-overview.md), not here.',
  '',
  '| Group | Files | Size |',
  '| --- | ---: | ---: |',
  ...[...groups].map(([k, g]) => `| [${k}](#${k.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-')}) | ${g.length} | ${human(g.reduce((n, r) => n + r.size, 0))} |`),
  '',
];
for (const [k, g] of groups) {
  md.push(`## ${k}`, '', '| File | Size | Lines | Ships | Runtime use | Description |', '| --- | ---: | ---: | :---: | --- | --- |');
  for (const r of g) md.push(`| \`${r.f}\` | ${human(r.size)} | ${r.lines} | ${r.ships ? '✓' : ''} | ${r.use} | ${r.desc} |`);
  md.push('');
}
await writeFile(OUT, md.join('\n'));
console.log(`file-inventory: ${rows.length} files (${human(totalBytes)}); ${shipped} ship (${human(shippedBytes)}) -> appendix-a-file-inventory.md`);
