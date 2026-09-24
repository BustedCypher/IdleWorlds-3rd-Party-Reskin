#!/usr/bin/env node
/**
 * css-structure-contract.mjs
 *
 * Lists every DOM RELATIONSHIP the theme's CSS depends on: child (`>`),
 * adjacent (`+`) and general-sibling (`~`) combinators, relative `:has(> …)`
 * / `:has(+ …)` / `:has(~ …)` arguments, and positional pseudo-classes
 * (`:first-child`, `:nth-child()`, `:last-of-type`, `:only-child`, `:empty`,
 * `:scope`).
 *
 * A descendant selector (`A B`) survives an extra wrapper; none of these do.
 * Adding a wrapper element, reordering siblings, or rendering a node the
 * extension never saw between two siblings silently turns the matching rules
 * off — which is how the merged header frame came apart (`[data-iw-chrome=
 * "shell"] > header` stops matching the moment the header is not a direct
 * child of the shell). Every relationship listed here must hold in the
 * native markup.
 *
 * Reads src/styles/*.css directly (comments blanked, line numbers preserved),
 * so every entry cites the file and line to read.
 *
 *   node handoff/native-render-migration/tools/css-structure-contract.mjs
 *   node handoff/native-render-migration/tools/css-structure-contract.mjs --out=path/to/report.md
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.resolve(ROOT, (process.argv.find(a => a.startsWith('--out=')) || '').slice(6)
  || 'handoff/native-render-migration/generated/css-structure-contract.md');
const STYLES = path.join(ROOT, 'src', 'styles');
// The shipped sheets. header.claude.css is not imported by anything.
const SHIPPED = ['base.css', 'tooltip-engine.css', 'inventory.css', 'skillpanel.css', 'skillcard-v2.css',
  'skillcard-v2-runtime-safe.css', 'card-button-atlas.css', 'card-buttons.css', 'header.css', 'overlay.css',
  'ui-system.css', 'compact-buttons.css', 'village-scene.css', 'collapsible.css'];

/** Blank comments without moving any character, so offsets map to lines. */
function blankComments(css) {
  let out = '';
  let quote = null;
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += css[i + 1] ?? ''; i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += css.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
      continue;
    }
    out += c;
  }
  return out;
}

/** Yield { selectorText, offset } for every style rule, recursing into
 *  conditional group rules and skipping @font-face/@keyframes bodies. */
function* rules(css, start = 0, end = css.length) {
  let i = start;
  let prelude = '';
  let preludeStart = start;
  while (i < end) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const q = c; let j = i + 1;
      while (j < end && css[j] !== q) j += css[j] === '\\' ? 2 : 1;
      prelude += css.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '{') {
      let depth = 1; let j = i + 1;
      while (j < end && depth) {
        if (css[j] === '"' || css[j] === "'") { const q = css[j]; j += 1; while (j < end && css[j] !== q) j += css[j] === '\\' ? 2 : 1; }
        else if (css[j] === '{') depth += 1;
        else if (css[j] === '}') depth -= 1;
        j += 1;
      }
      const head = prelude.trim();
      if (head.startsWith('@')) {
        if (/^@(media|supports|container|layer|document)\b/.test(head)) yield* rules(css, i + 1, j - 1);
      } else if (head) {
        // preludeStart already sits on the first non-space character.
        yield { selectorText: head, offset: preludeStart };
      }
      prelude = ''; i = j; preludeStart = i; continue;
    }
    if (c === ';' && prelude.trim().startsWith('@')) { prelude = ''; i += 1; preludeStart = i; continue; }
    if (!prelude.trim()) preludeStart = i;
    prelude += c; i += 1;
  }
}

/** Split at top-level occurrences of any char in `seps`, outside (), [] and strings. */
function splitTop(text, seps) {
  const parts = []; let depth = 0; let buf = ''; let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) { buf += c; if (c === '\\') { buf += text[i + 1] ?? ''; i += 1; } else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === '(' || c === '[') depth += 1;
    if (c === ')' || c === ']') depth -= 1;
    if (!depth && seps.includes(c)) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  parts.push(buf);
  return parts;
}

/** Tokenise one complex selector into [compound, combinator, compound, …]. */
function tokens(selector) {
  const out = []; let depth = 0; let buf = ''; let quote = null; let pendingSpace = false;
  const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = ''; };
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i];
    if (quote) { buf += c; if (c === '\\') { buf += selector[i + 1] ?? ''; i += 1; } else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; if (pendingSpace && buf === '' && out.length && !/^[>+~]$/.test(out.at(-1))) out.push(' '); pendingSpace = false; buf += c; continue; }
    if (c === '(' || c === '[') depth += 1;
    if (c === ')' || c === ']') depth -= 1;
    if (!depth && /[>+~]/.test(c)) { flush(); out.push(c); pendingSpace = false; continue; }
    if (!depth && /\s/.test(c)) { if (buf.trim()) { flush(); pendingSpace = true; } continue; }
    if (pendingSpace && out.length && !/^[>+~]$/.test(out.at(-1))) out.push(' ');
    pendingSpace = false;
    buf += c;
  }
  flush();
  return out;
}

const POSITIONAL = /:(first-child|last-child|only-child|first-of-type|last-of-type|only-of-type|empty|scope|nth-(?:last-)?(?:child|of-type)\([^)]*\))/g;
const NAMES = { '>': 'child', '+': 'adjacent sibling', '~': 'later sibling' };

const relations = new Map(); // key -> { kind, left, comb, right, refs: [] }
function add(kind, left, comb, right, ref) {
  const key = `${kind}|${left}|${comb}|${right}`;
  if (!relations.has(key)) relations.set(key, { kind, left, comb, right, refs: [] });
  relations.get(key).refs.push(ref);
}

function scan(selector, ref) {
  const t = tokens(selector);
  for (let i = 1; i < t.length - 1; i += 2) {
    if (/^[>+~]$/.test(t[i])) add('combinator', t[i - 1], t[i], t[i + 1], ref);
  }
  for (const compound of t.filter((_, i) => i % 2 === 0)) {
    for (const m of compound.matchAll(POSITIONAL)) add('positional', compound, `:${m[1]}`, '', ref);
    // Relative :has() arguments.
    for (const m of compound.matchAll(/:has\(/g)) {
      let depth = 1; let j = m.index + 5;
      while (j < compound.length && depth) { if (compound[j] === '(') depth += 1; else if (compound[j] === ')') depth -= 1; j += 1; }
      const inner = compound.slice(m.index + 5, j - 1);
      for (const arg of splitTop(inner, ',')) {
        const a = arg.trim();
        const rel = /^([>+~])\s*(.+)$/.exec(a);
        if (rel) add('has', compound.replace(/:has\(.*$/, '') || '*', rel[1], rel[2].trim(), ref);
      }
    }
  }
}

const files = (await readdir(STYLES)).filter(f => SHIPPED.includes(f));
let ruleCount = 0;
let selectorCount = 0;
for (const file of files) {
  const text = blankComments((await readFile(path.join(STYLES, file), 'utf8')).replace(/\r\n?/g, '\n'));
  for (const { selectorText, offset } of rules(text)) {
    ruleCount += 1;
    const line = text.slice(0, offset).split('\n').length;
    for (const selector of splitTop(selectorText, ',')) {
      selectorCount += 1;
      scan(selector.replace(/\s+/g, ' ').trim(), `${file}:${line}`);
    }
  }
}

/** Which hook family a relation belongs to, for grouping. */
function family(r) {
  const text = `${r.left} ${r.right}`;
  const hooks = [...text.matchAll(/\[(data-(?:iw|fs)-[a-z0-9-]+)/g)].map(m => m[1]);
  const classes = [...text.matchAll(/\.((?:fs|iw)-[a-z0-9-]+)/g)].map(m => `.${m[1]}`);
  const first = hooks[0] || classes[0];
  return first || 'game markup only (no skin hook)';
}

const groups = new Map();
for (const r of relations.values()) {
  const f = family(r);
  if (!groups.has(f)) groups.set(f, []);
  groups.get(f).push(r);
}
const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

const esc = s => String(s).replace(/\|/g, '\\|').replace(/`/g, "'");
const lines = [];
lines.push('# CSS structure contract');
lines.push('');
lines.push('> Generated by `handoff/native-render-migration/tools/css-structure-contract.mjs` from `src/styles/*.css`. Do not edit; regenerate.');
lines.push('');
lines.push('Every relationship below is one the shipped theme CSS **requires** of the DOM. They are not layout suggestions: each is a selector that stops matching, silently, when the relationship is broken. A descendant selector (`A B`) survives an extra wrapper; none of these do.');
lines.push('');
lines.push('- **child** `A > B`: B must be a DIRECT child of A. Adding a wrapper between them breaks it.');
lines.push('- **adjacent sibling** `A + B`: B must IMMEDIATELY follow A under the same parent.');
lines.push('- **later sibling** `A ~ B`: B must follow A under the same parent (anything may sit between).');
lines.push('- **has** `A:has(> B)`: A must have B as a direct child (or `+`/`~` sibling).');
lines.push('- **positional** `:first-child`, `:nth-child()`, `:last-of-type`, …: the element\'s index among its siblings matters. A node the skin appends counts as a sibling too.');
lines.push('');
lines.push(`Scanned ${files.length} shipped stylesheets, ${ruleCount} rules, ${selectorCount} selectors; ${relations.size} distinct structural relationships in ${groups.size} hook families.`);
lines.push('');
lines.push('## Families by size');
lines.push('');
lines.push('| Hook family | Relationships |');
lines.push('| --- | --- |');
for (const [f, list] of ordered) lines.push(`| \`${esc(f)}\` | ${list.length} |`);
lines.push('');
for (const [f, list] of ordered) {
  lines.push(`## \`${esc(f)}\``);
  lines.push('');
  lines.push('| Kind | Requirement | Rules | First source |');
  lines.push('| --- | --- | --- | --- |');
  list.sort((a, b) => b.refs.length - a.refs.length || a.left.localeCompare(b.left));
  for (const r of list) {
    const req = r.kind === 'positional'
      ? `\`${esc(r.left)}\` — position matters (\`${esc(r.comb)}\`)`
      : r.kind === 'has'
        ? `\`${esc(r.left)}\` has \`${esc(r.right)}\` as ${NAMES[r.comb]}`
        : `\`${esc(r.right)}\` is ${NAMES[r.comb]} of \`${esc(r.left)}\``;
    lines.push(`| ${r.kind} | ${req} | ${r.refs.length} | ${r.refs[0]} |`);
  }
  lines.push('');
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${path.relative(ROOT, OUT)}: ${relations.size} relationships in ${groups.size} families (${selectorCount} selectors scanned).`);
