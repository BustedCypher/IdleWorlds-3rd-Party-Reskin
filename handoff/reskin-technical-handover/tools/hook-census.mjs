#!/usr/bin/env node
/**
 * hook-census.mjs — where every skin-owned DOM hook is written and read.
 *
 *   node handoff/reskin-technical-handover/tools/hook-census.mjs
 *
 * Scans src/modules/*.js (and src/page) for data-iw-* / data-fs-* attribute
 * names (both the kebab-case form and `dataset.iwFooBar` camelCase access) and
 * src/styles/*.css for attribute selectors, and writes
 * tools/hook-census.json plus a Markdown table that Appendix D embeds.
 *
 * It is a lexical census: it finds every NAME and the files that mention it.
 * Whether a mention is a write, a read or a teardown is classified by simple
 * patterns and is labelled as such — Appendix D's hand-written columns are the
 * authoritative description.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

const kebab = camel => camel.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);

async function files(dir, ext) {
  return (await readdir(path.join(ROOT, dir))).filter(f => f.endsWith(ext)).map(f => path.join(dir, f));
}

const census = new Map();
const note = (name, file, kind) => {
  const e = census.get(name) || { js: new Map(), css: new Map() };
  const bucket = kind === 'css' ? e.css : e.js;
  bucket.set(file, (bucket.get(file) || new Set()).add(kind));
  census.set(name, e);
};

const jsFiles = [...await files('src/modules', '.js'), ...await files('src/page', '.js'), 'src/content.js'];
for (const rel of jsFiles) {
  const text = await readFile(path.join(ROOT, rel), 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach(line => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // skip comment lines
    for (const m of line.matchAll(/data-(iw|fs)-[a-z0-9-]+/g)) {
      const name = m[0].replace(/-$/, '');
      const kind = /removeAttribute|delete\s/.test(line) ? 'clear'
        : /setAttribute|mark\(|setAttr\(|setRole|unmark/.test(line) ? 'write'
          : 'read';
      note(name, rel, kind);
    }
    for (const m of line.matchAll(/dataset(?:\?)?\.((?:iw|fs)[A-Z][A-Za-z0-9]*)/g)) {
      const name = `data-${kebab(m[1])}`;
      const after = line.slice(m.index + m[0].length);
      const kind = /^\s*=[^=]/.test(after) ? 'write'
        : /delete\s+[\w.?]*dataset/.test(line) ? 'clear'
          : 'read';
      note(name, rel, kind);
    }
    for (const m of line.matchAll(/setData\([^,]+,\s*'((?:iw|fs)[A-Z][A-Za-z0-9]*)'/g)) note(`data-${kebab(m[1])}`, rel, 'write');
    for (const m of line.matchAll(/setOwnData\([^,]+,\s*'((?:iw|fs)[A-Z][A-Za-z0-9]*)'/g)) note(`data-${kebab(m[1])}`, rel, 'write');
  });
}

const cssFiles = (await files('src/styles', '.css')).filter(f => !f.endsWith('header.claude.css'));
for (const rel of cssFiles) {
  const text = (await readFile(path.join(ROOT, rel), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/\[\s*(data-(?:iw|fs)-[a-z0-9-]+)/g)) note(m[1], rel, 'css');
}

const rows = [...census.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const json = rows.map(([name, e]) => ({
  name,
  js: [...e.js.entries()].map(([f, kinds]) => ({ file: f, kinds: [...kinds] })),
  css: [...e.css.keys()],
}));
await writeFile(path.join(HERE, 'hook-census.json'), JSON.stringify(json, null, 1));

/* The Markdown deliberately lists FILES only. Many writes go through a named
   constant (`setAttr(el, INVENTORY_ROOT_ATTR, '1')`), so a lexical write/read
   guess would mislabel them; Appendix D carries the authoritative ownership. */
const md = ['| Attribute | JavaScript files that mention it | Stylesheets that select on it |', '| --- | --- | --- |'];
for (const r of json) {
  const js = r.js.map(j => path.basename(j.file)).join(', ') || '— (CSS only)';
  const css = r.css.map(f => path.basename(f)).join(', ') || '— (JS only)';
  md.push(`| \`${r.name}\` | ${js} | ${css} |`);
}
await writeFile(path.join(HERE, 'hook-census.md'), md.join('\n') + '\n');
console.log(`hook-census: ${json.length} distinct data-iw-*/data-fs-* attributes`);
