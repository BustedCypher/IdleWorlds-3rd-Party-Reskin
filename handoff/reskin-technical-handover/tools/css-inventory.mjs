#!/usr/bin/env node
/**
 * css-inventory.mjs — regenerate the CSS rule index for the technical handover.
 *
 *   node handoff/reskin-technical-handover/tools/css-inventory.mjs
 *
 * Reads every stylesheet in src/styles, parses it with a small line-aware CSS
 * parser (no dependencies), and writes:
 *
 *   appendix-b-css-rule-index/README.md        per-file statistics + legend
 *   appendix-b-css-rule-index/<sheet>.md       one row per rule, every selector
 *   appendix-c-css-dependency-surface.md       hooks, custom properties, media
 *                                              queries, keyframes, !important
 *   tools/css-inventory.json                   the same data, machine-readable
 *
 * Nothing here is hand-maintained: re-run it after any stylesheet change and
 * the appendices cannot drift from the source. It FAILS (exit 1) when a sheet
 * in src/styles is not accounted for in INJECTION/INACTIVE below, or when it
 * parses zero rules — a count of zero means the parser is broken, not that the
 * sheet is empty.
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const ROOT = path.resolve(OUT, '..', '..');
const STYLES = path.join(ROOT, 'src', 'styles');

/* The runtime injection order, verified against src/content.js
   (injectPresentationStyles) and src/modules/UIFoundation.js
   (injectUIFoundationStyles). Files concatenated into one <style> are listed in
   concatenation order. */
const INJECTION = [
  { style: 'base', files: ['base.css'], source: 'src/content.js injectPresentationStyles()' },
  { style: 'tooltip-engine', files: ['tooltip-engine.css'], source: 'src/content.js injectPresentationStyles()' },
  { style: 'inventory', files: ['inventory.css'], source: 'src/content.js injectPresentationStyles()' },
  { style: 'skillpanel', files: ['skillpanel.css', 'skillcard-v2.css', 'skillcard-v2-runtime-safe.css', 'card-button-atlas.css', 'card-buttons.css'], source: 'src/content.js injectPresentationStyles()' },
  { style: 'header', files: ['header.css'], source: 'src/content.js injectPresentationStyles()' },
  { style: 'overlay', files: ['overlay.css'], source: 'src/content.js injectPresentationStyles()' },
  { style: 'ui-system', files: ['ui-system.css', 'compact-buttons.css', 'village-scene.css', 'collapsible.css'], source: 'src/modules/UIFoundation.js injectUIFoundationStyles()' },
];
const INACTIVE = {
  'header.claude.css': 'Not imported by any module; esbuild never bundles it. Kept in the repository only.',
};

/* ------------------------------------------------------------ helpers -- */

const countNl = s => (s.match(/\n/g) || []).length;

function splitTopLevel(str, sep) {
  const parts = [];
  let depthParen = 0, depthBracket = 0, quote = null, cur = '';
  for (let i = 0; i < str.length; i += 1) {
    const c = str[i];
    if (quote) {
      cur += c;
      if (c === '\\') { cur += str[i + 1] ?? ''; i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '\\') { cur += c + (str[i + 1] ?? ''); i += 1; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(') depthParen += 1;
    else if (c === ')') depthParen -= 1;
    else if (c === '[') depthBracket += 1;
    else if (c === ']') depthBracket -= 1;
    if (c === sep && depthParen === 0 && depthBracket === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}

/* --------------------------------------------------------- CSS parser -- */

/**
 * Returns a tree: { type:'root'|'atrule'|'rule', prelude, line, endLine,
 * children, declarations:[{prop,value,important,line}], comment } plus a flat
 * list of comments. Handles comments, strings, escapes and nested blocks.
 */
function parseCss(text, file) {
  const root = { type: 'root', prelude: '', line: 1, children: [], declarations: [] };
  const stack = [root];
  const comments = [];
  let buf = '';
  let bufLine = null;
  let line = 1;
  let pendingComment = null;
  let parenDepth = 0;

  const top = () => stack[stack.length - 1];
  const pushDeclaration = (node, raw, atLine) => {
    const text = raw.trim();
    if (!text) return;
    const colon = text.indexOf(':');
    if (colon <= 0) {
      if (node.type === 'root' || node.type === 'atrule') {
        node.children.push({ type: 'statement', prelude: text, line: atLine, children: [], declarations: [] });
      }
      return;
    }
    const prop = text.slice(0, colon).trim();
    let value = text.slice(colon + 1).trim();
    let important = false;
    const imp = /!\s*important\s*$/i.exec(value);
    if (imp) { important = true; value = value.slice(0, imp.index).trim(); }
    node.declarations.push({ prop, value, important, line: atLine });
  };

  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const body = text.slice(i + 2, end === -1 ? text.length : end);
      const comment = { text: body, line, endLine: line + countNl(body) };
      comments.push(comment);
      pendingComment = comment;
      line += countNl(body);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) { if (text[j] === '\\') j += 1; j += 1; }
      const s = text.slice(i, j + 1);
      if (bufLine === null) bufLine = line;
      buf += s;
      line += countNl(s);
      i = j + 1;
      continue;
    }
    if (c === '\\') {
      if (bufLine === null) bufLine = line;
      buf += c + (text[i + 1] ?? '');
      if (text[i + 1] === '\n') line += 1;
      i += 2;
      continue;
    }
    if (c === '(') parenDepth += 1;
    if (c === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (c === '{' && parenDepth === 0) {
      const prelude = buf.replace(/\s+/g, ' ').trim();
      const node = prelude.startsWith('@')
        ? { type: 'atrule', prelude, line: bufLine ?? line, children: [], declarations: [] }
        : { type: 'rule', prelude, line: bufLine ?? line, children: [], declarations: [] };
      if (pendingComment && pendingComment.endLine <= (bufLine ?? line)) node.comment = pendingComment;
      pendingComment = null;
      node.parent = top();
      top().children.push(node);
      stack.push(node);
      buf = ''; bufLine = null;
      i += 1;
      continue;
    }
    if (c === '}' && parenDepth === 0) {
      const node = top();
      if (buf.trim()) pushDeclaration(node, buf, bufLine ?? line);
      node.endLine = line;
      if (stack.length > 1) stack.pop();
      else throw new Error(`${file}:${line} unbalanced '}'`);
      buf = ''; bufLine = null;
      i += 1;
      continue;
    }
    if (c === ';' && parenDepth === 0) {
      pushDeclaration(top(), buf, bufLine ?? line);
      buf = ''; bufLine = null;
      i += 1;
      continue;
    }
    if (c === '\n') line += 1;
    if (bufLine === null && !/\s/.test(c)) bufLine = line;
    buf += c;
    i += 1;
  }
  if (stack.length !== 1) throw new Error(`${file}: ${stack.length - 1} unclosed block(s)`);
  return { root, comments };
}

/* ------------------------------------------------- selector analysis -- */

const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const ARG_MAX_PSEUDOS = new Set(['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any']);

function readIdent(s, i) {
  let out = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { out += s[i + 1] ?? ''; i += 2; continue; }
    if (/[A-Za-z0-9_\--￿]/.test(c)) { out += c; i += 1; continue; }
    break;
  }
  return [out, i];
}

function readBalanced(s, i, open, close) {
  // s[i] === open
  let depth = 0, quote = null, j = i;
  for (; j < s.length; j += 1) {
    const c = s[j];
    if (quote) { if (c === '\\') { j += 1; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '\\') { j += 1; continue; }
    if (c === open) depth += 1;
    else if (c === close) { depth -= 1; if (depth === 0) break; }
  }
  return [s.slice(i + 1, j), j + 1];
}

function emptyInfo() {
  return { classes: new Set(), ids: new Set(), attrs: new Set(), attrSelectors: new Set(), types: new Set(),
    pseudoClasses: new Set(), pseudoElements: new Set(), combinators: new Set(), hasHas: false };
}

function analyseSelector(sel, info = emptyInfo()) {
  let a = 0, b = 0, c = 0;
  let i = 0;
  const s = sel.trim();
  let sawSpace = false;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { sawSpace = true; i += 1; continue; }
    if (ch === '>' || ch === '+' || ch === '~') { info.combinators.add(ch); sawSpace = false; i += 1; continue; }
    if (sawSpace) { info.combinators.add(' '); sawSpace = false; }
    if (ch === '#') { const [id, j] = readIdent(s, i + 1); info.ids.add(id); a += 1; i = j; continue; }
    if (ch === '.') { const [cls, j] = readIdent(s, i + 1); info.classes.add(cls); b += 1; i = j; continue; }
    if (ch === '[') {
      const [inner, j] = readBalanced(s, i, '[', ']');
      const m = /^\s*([^\s~|^$*!=\]]+)\s*(?:([~|^$*]?=)\s*(.*?))?\s*(?:\s[is])?\s*$/.exec(inner);
      const name = m ? m[1] : inner.trim();
      info.attrs.add(name);
      info.attrSelectors.add(`[${inner.trim()}]`);
      b += 1; i = j; continue;
    }
    if (ch === ':') {
      const isElement = s[i + 1] === ':';
      const [name, j0] = readIdent(s, i + (isElement ? 2 : 1));
      let j = j0;
      let args = null;
      if (s[j] === '(') { const [inner, k] = readBalanced(s, j, '(', ')'); args = inner; j = k; }
      const lname = name.toLowerCase();
      if (isElement || LEGACY_PSEUDO_ELEMENTS.has(lname)) {
        info.pseudoElements.add(lname + (args !== null ? `(${args})` : ''));
        c += 1;
      } else {
        info.pseudoClasses.add(lname);
        if (lname === 'has') info.hasHas = true;
        if (ARG_MAX_PSEUDOS.has(lname) && args !== null) {
          let best = [0, 0, 0];
          for (const part of splitTopLevel(args, ',')) {
            const sp = analyseSelector(part, info).specificity;
            if (cmpSpec(sp, best) > 0) best = sp;
          }
          a += best[0]; b += best[1]; c += best[2];
        } else if (lname === 'where') {
          if (args !== null) for (const part of splitTopLevel(args, ',')) analyseSelector(part, info);
        } else if ((lname === 'nth-child' || lname === 'nth-last-child') && args && / of /i.test(args)) {
          b += 1;
          const list = args.slice(args.toLowerCase().indexOf(' of ') + 4);
          let best = [0, 0, 0];
          for (const part of splitTopLevel(list, ',')) {
            const sp = analyseSelector(part, info).specificity;
            if (cmpSpec(sp, best) > 0) best = sp;
          }
          a += best[0]; b += best[1]; c += best[2];
        } else {
          b += 1;
        }
      }
      i = j;
      continue;
    }
    if (ch === '*') { i += 1; continue; }
    if (ch === '&') { i += 1; continue; }
    if (/[A-Za-z_\-]/.test(ch) || ch === '\\') {
      const [type, j] = readIdent(s, i);
      if (type) { info.types.add(type.toLowerCase()); c += 1; }
      i = j === i ? i + 1 : j;
      continue;
    }
    i += 1;
  }
  return { specificity: [a, b, c], info };
}

function cmpSpec(x, y) {
  for (let k = 0; k < 3; k += 1) if (x[k] !== y[k]) return x[k] - y[k];
  return 0;
}
const fmtSpec = s => `(${s.join(',')})`;

/* ------------------------------------------------- classification ---- */

const SKIN_CLASS = /^(?:fs-|iw-)/;
const SKIN_ATTR = /^(?:data-iw-|data-fs-)/;
const TAILWIND_LIKE = /[:\/\[\]]|^(?:grid|flex|hidden|block|inline|fixed|absolute|relative|sticky|min-w-|max-w-|w-|h-|p[xytrbl]?-|m[xytrbl]?-|gap-|space-[xy]-|text-|bg-|border|rounded|shadow|overflow|items-|justify-|self-|col-|row-|z-|opacity-|font-|leading-|tracking-|truncate|lucide)/;

function classifyHooks(info) {
  const skin = [], game = [], fragile = [];
  for (const cls of info.classes) {
    if (SKIN_CLASS.test(cls)) skin.push(`.${cls}`);
    else {
      game.push(`.${cls}`);
      if (TAILWIND_LIKE.test(cls)) fragile.push(`utility class .${cls}`);
    }
  }
  for (const id of info.ids) (id.startsWith('iw-') ? skin : game).push(`#${id}`);
  for (const sel of info.attrSelectors) {
    const name = /^\[\s*([^\s~|^$*!=\]]+)/.exec(sel)?.[1] || sel;
    if (SKIN_ATTR.test(name)) skin.push(sel);
    else {
      game.push(sel);
      if (/^\[\s*(?:class|style)\s*[*^$~|]?=/.test(sel)) fragile.push(`substring/attribute match ${sel}`);
    }
  }
  for (const t of info.types) {
    if (t === 'html' || t === 'body') continue;
    game.push(t);
  }
  const structural = [...info.pseudoClasses].filter(p => /^(?:nth-|first-|last-|only-)/.test(p));
  if (structural.length) fragile.push(`position-dependent :${structural.join(', :')}`);
  if (info.combinators.has('+') || info.combinators.has('~')) fragile.push('sibling combinator');
  return { skin: [...new Set(skin)], game: [...new Set(game)], fragile: [...new Set(fragile)] };
}

/* ------------------------------------------------------------- walk ---- */

function contextOf(node) {
  const parts = [];
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) parts.unshift(p.prelude);
  return parts;
}

function firstSentence(text, max = 180) {
  const clean = String(text || '').replace(/[═─━=*#§]{3,}/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const m = /^(.{20,}?[.!?])(\s|$)/.exec(clean);
  const s = m ? m[1] : clean;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function collect(tree, file, style) {
  const rules = [], keyframes = [], fontFaces = [], media = [], containers = [], supports = [], statements = [];
  let lastCommentInBlock = new Map();
  (function visit(node) {
    for (const child of node.children) {
      if (child.type === 'statement') { statements.push({ file, line: child.line, text: child.prelude }); continue; }
      if (child.type === 'atrule') {
        const name = /^@([a-z-]+)/i.exec(child.prelude)?.[1]?.toLowerCase();
        if (name === 'keyframes' || name === '-webkit-keyframes') {
          keyframes.push({ file, style, name: child.prelude.replace(/^@[a-z-]*keyframes\s+/i, '').trim(), line: child.line, endLine: child.endLine, steps: child.children.map(k => k.prelude) });
          continue;
        }
        if (name === 'font-face') {
          const d = Object.fromEntries(child.declarations.map(x => [x.prop, x.value]));
          fontFaces.push({ file, style, line: child.line, family: d['font-family'], weight: d['font-weight'], style_: d['font-style'], display: d['font-display'], src: d.src });
          continue;
        }
        if (name === 'media') media.push({ file, style, line: child.line, query: child.prelude.replace(/^@media\s*/i, ''), rules: 0 });
        if (name === 'container') containers.push({ file, style, line: child.line, query: child.prelude.replace(/^@container\s*/i, '') });
        if (name === 'supports') supports.push({ file, style, line: child.line, query: child.prelude.replace(/^@supports\s*/i, '') });
        visit(child);
        continue;
      }
      if (child.type === 'rule') {
        const selectors = splitTopLevel(child.prelude, ',');
        const perSelector = selectors.map(sel => {
          const { specificity, info } = analyseSelector(sel);
          return { selector: sel, specificity, info };
        });
        const merged = emptyInfo();
        for (const ps of perSelector) {
          for (const key of Object.keys(merged)) {
            if (merged[key] instanceof Set) for (const v of ps.info[key]) merged[key].add(v);
          }
          if (ps.info.hasHas) merged.hasHas = true;
        }
        const maxSpec = perSelector.reduce((m, ps) => (cmpSpec(ps.specificity, m) > 0 ? ps.specificity : m), [0, 0, 0]);
        const hooks = classifyHooks(merged);
        const decls = child.declarations;
        const ctx = contextOf(child);
        const inKeyframes = ctx.some(c => /^@(?:-webkit-)?keyframes/i.test(c));
        if (inKeyframes) continue;
        if (child.comment) lastCommentInBlock.set(node, child.comment);
        const comment = child.comment || lastCommentInBlock.get(node) || null;
        const m = media.find(x => x.file === file && ctx.includes(`@media ${x.query}`));
        if (m) m.rules += 1;
        rules.push({
          file, style, line: child.line, endLine: child.endLine, context: ctx,
          selectors: perSelector.map(ps => ({ selector: ps.selector, specificity: ps.specificity })),
          maxSpecificity: maxSpec,
          declarations: decls.map(d => ({ prop: d.prop, value: d.value, important: d.important, line: d.line })),
          importantCount: decls.filter(d => d.important).length,
          customPropsDefined: decls.filter(d => d.prop.startsWith('--')).map(d => d.prop),
          varsUsed: [...new Set(decls.flatMap(d => [...d.value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map(x => x[1])))],
          animations: decls.filter(d => /^(?:animation|animation-name)$/i.test(d.prop)).map(d => d.value),
          transitions: decls.filter(d => /^transition/i.test(d.prop)).map(d => `${d.prop}: ${d.value}`),
          pseudoClasses: [...merged.pseudoClasses],
          pseudoElements: [...merged.pseudoElements],
          hasHas: merged.hasHas,
          hooks,
          comment: comment ? { line: comment.line, own: comment === child.comment, text: firstSentence(comment.text) } : null,
        });
        // Nested rules (CSS nesting) — none today; visit so they are not lost.
        if (child.children.length) visit(child);
      }
    }
  })(tree);
  return { rules, keyframes, fontFaces, media, containers, supports, statements };
}

/* ------------------------------------------------------------ output --- */

/* Escape table pipes everywhere, and angle brackets outside code spans, so a
   quoted comment such as "the game's <button>" renders as text, not HTML. */
const mdEsc = s => String(s).replace(/\n/g, ' ')
  .split(/(`+[^`]*`+)/).map((part, i) => (i % 2 ? part : part.replace(/</g, '&lt;').replace(/>/g, '&gt;'))).join('')
  .replace(/\|/g, '\\|');
const code = s => {
  const text = String(s);
  const ticks = text.includes('``') ? '```' : text.includes('`') ? '``' : '`';
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${mdEsc(text)}${pad}${ticks}`;
};

async function main() {
  const all = (await readdir(STYLES)).filter(f => f.endsWith('.css')).sort();
  const known = new Set([...INJECTION.flatMap(s => s.files), ...Object.keys(INACTIVE)]);
  const unknown = all.filter(f => !known.has(f));
  if (unknown.length) {
    console.error(`Unaccounted stylesheet(s): ${unknown.join(', ')} — add them to INJECTION or INACTIVE.`);
    process.exit(1);
  }
  let commit = 'unknown';
  let dirty = '';
  try {
    commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
    dirty = execSync('git status --porcelain -- src/styles', { cwd: ROOT }).toString().trim();
  } catch { /* not a git checkout */ }

  const order = [];
  INJECTION.forEach((entry, idx) => entry.files.forEach((file, k) => order.push({ file, style: entry.style, styleIndex: idx + 1, part: k + 1, parts: entry.files.length, active: true, source: entry.source })));
  for (const [file, why] of Object.entries(INACTIVE)) order.push({ file, style: null, active: false, why });

  const data = { generated: new Date().toISOString(), commit, dirtyStyles: dirty, sheets: [] };
  for (const sheet of order) {
    const text = (await readFile(path.join(STYLES, sheet.file), 'utf8')).replace(/\r\n?/g, '\n');
    const { root, comments } = parseCss(text, sheet.file);
    const out = collect(root, sheet.file, sheet.style);
    if (!out.rules.length && !out.fontFaces.length) {
      console.error(`${sheet.file}: parsed ZERO rules — the parser is broken, not the sheet.`);
      process.exit(1);
    }
    data.sheets.push({ ...sheet, bytes: Buffer.byteLength(text), lines: text.split('\n').length, comments: comments.length, ...out });
  }

  await mkdir(path.join(OUT, 'appendix-b-css-rule-index'), { recursive: true });

  /* ---- per-sheet rule index ---- */
  const legend = [
    '**Columns.** *Line* is the rule\'s first line in the source file at the commit above. *Context* is the enclosing `@media`/`@container`/`@supports` chain. *Specificity* is the highest (id, class, type) of the rule\'s selector list, computed per Selectors Level 4 (`:is()/:not()/:has()` take their most specific argument, `:where()` counts zero). *Decl* is the declaration count; *!imp* the number marked `!important`. *Properties* lists every property the rule sets, with `!` marking `!important`. *Hooks* separates skin-owned hooks (`data-iw-*`, `data-fs-*`, `.fs-*`, `.iw-*`, `#iw-tip`) from game/host hooks (classes, attributes, elements the extension does not own). *Fragility* flags selectors that depend on utility class names, attribute substrings, element position or sibling order. *Comment* is the nearest authored comment for the rule\'s block (its own when marked ●, otherwise the last one above it in the same block, marked ○).',
  ];
  for (const sheet of data.sheets) {
    const lines = [];
    const title = sheet.active
      ? `# ${sheet.file} — rule index`
      : `# ${sheet.file} — rule index (INACTIVE)`;
    lines.push(title, '');
    lines.push(`> Generated by \`tools/css-inventory.mjs\` from \`src/styles/${sheet.file}\` at commit \`${commit.slice(0, 12)}\`${dirty ? ' (working tree had uncommitted style changes)' : ''}. Do not edit by hand.`, '');
    if (sheet.active) {
      lines.push(`Injected as part of \`<style data-iw-style="${sheet.style}">\` — stylesheet ${sheet.styleIndex} of 7 in injection order${sheet.parts > 1 ? `, part ${sheet.part} of ${sheet.parts} in that element's concatenation` : ''} (${sheet.source}).`, '');
    } else {
      lines.push(`**Not shipped.** ${sheet.why}`, '');
    }
    const decls = sheet.rules.reduce((n, r) => n + r.declarations.length, 0);
    const imps = sheet.rules.reduce((n, r) => n + r.importantCount, 0);
    const sels = sheet.rules.reduce((n, r) => n + r.selectors.length, 0);
    lines.push(`${sheet.lines} lines · ${sheet.bytes.toLocaleString('en-US')} bytes · ${sheet.rules.length} rules · ${sels} selectors · ${decls} declarations · ${imps} \`!important\` · ${sheet.media.length} \`@media\` · ${sheet.containers.length} \`@container\` · ${sheet.keyframes.length} \`@keyframes\` · ${sheet.fontFaces.length} \`@font-face\``, '');
    lines.push(...legend, '');
    if (sheet.fontFaces.length) {
      lines.push('## @font-face', '', '| Line | Family | Weight | Style | Display | Source |', '| --- | --- | --- | --- | --- | --- |');
      for (const f of sheet.fontFaces) lines.push(`| ${f.line} | ${mdEsc(f.family)} | ${mdEsc(f.weight)} | ${mdEsc(f.style_ || 'normal')} | ${mdEsc(f.display || '')} | ${code(f.src)} |`);
      lines.push('');
    }
    if (sheet.keyframes.length) {
      lines.push('## @keyframes', '', '| Line | Name | Steps |', '| --- | --- | --- |');
      for (const k of sheet.keyframes) lines.push(`| ${k.line} | ${code(k.name)} | ${mdEsc(k.steps.join(' · '))} |`);
      lines.push('');
    }
    lines.push('## Rules', '');
    lines.push('| # | Line | Context | Selector(s) | Specificity | Decl / !imp | Properties | Hooks | Fragility | Comment |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    sheet.rules.forEach((r, idx) => {
      const ctx = r.context.length ? r.context.map(code).join(' › ') : '—';
      const selectors = r.selectors.map(s => code(s.selector)).join('<br>');
      const spec = r.selectors.length > 1
        ? `max ${fmtSpec(r.maxSpecificity)}`
        : fmtSpec(r.maxSpecificity);
      const props = r.declarations.map(d => `${d.prop}${d.important ? '!' : ''}`).join(', ');
      const hooks = [
        r.hooks.skin.length ? `skin: ${r.hooks.skin.map(code).join(' ')}` : '',
        r.hooks.game.length ? `host: ${r.hooks.game.map(code).join(' ')}` : '',
      ].filter(Boolean).join('<br>') || '—';
      const fragile = r.hooks.fragile.length ? mdEsc(r.hooks.fragile.join('; ')) : '—';
      const comment = r.comment ? `${r.comment.own ? '●' : '○'} L${r.comment.line}: ${mdEsc(r.comment.text)}` : '—';
      lines.push(`| ${idx + 1} | ${r.line} | ${ctx} | ${selectors} | ${spec} | ${r.declarations.length} / ${r.importantCount} | ${mdEsc(props) || '—'} | ${hooks} | ${fragile} | ${comment} |`);
    });
    lines.push('');
    await writeFile(path.join(OUT, 'appendix-b-css-rule-index', `${sheet.file}.md`), lines.join('\n'));
  }

  /* ---- appendix B index ---- */
  const idx = [];
  idx.push('# Appendix B — CSS rule index', '');
  idx.push(`> Generated by \`tools/css-inventory.mjs\` at commit \`${commit}\`${dirty ? ' (with uncommitted style changes)' : ''}. Every qualified rule in every stylesheet under \`src/styles\` has exactly one row in the per-file pages linked below. Regenerate after any stylesheet change: \`node handoff/reskin-technical-handover/tools/css-inventory.mjs\`.`, '');
  idx.push('Injection order at runtime (each row is one `<style data-iw-style>` element; later elements win ties in the cascade):', '');
  idx.push('| Order | `data-iw-style` | Files concatenated (in order) | Rules | Selectors | Declarations | `!important` | `@media` | `:has()` rules | Rules with host hooks | Rules flagged fragile | Highest specificity |');
  idx.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const totals = { rules: 0, sels: 0, decls: 0, imps: 0, media: 0, has: 0, host: 0, fragile: 0 };
  INJECTION.forEach((entry, i) => {
    const sheets = data.sheets.filter(s => s.style === entry.style);
    const rules = sheets.flatMap(s => s.rules);
    const row = {
      rules: rules.length,
      sels: rules.reduce((n, r) => n + r.selectors.length, 0),
      decls: rules.reduce((n, r) => n + r.declarations.length, 0),
      imps: rules.reduce((n, r) => n + r.importantCount, 0),
      media: sheets.reduce((n, s) => n + s.media.length, 0),
      has: rules.filter(r => r.hasHas).length,
      host: rules.filter(r => r.hooks.game.length).length,
      fragile: rules.filter(r => r.hooks.fragile.length).length,
    };
    for (const k of Object.keys(totals)) totals[k] += row[k];
    const maxSpec = rules.reduce((m, r) => (cmpSpec(r.maxSpecificity, m) > 0 ? r.maxSpecificity : m), [0, 0, 0]);
    idx.push(`| ${i + 1} | \`${entry.style}\` | ${entry.files.map(f => `[${f}](${encodeURI(`${f}.md`)})`).join(' + ')} | ${row.rules} | ${row.sels} | ${row.decls} | ${row.imps} | ${row.media} | ${row.has} | ${row.host} | ${row.fragile} | ${fmtSpec(maxSpec)} |`);
  });
  idx.push(`| | **Total shipped** | | **${totals.rules}** | **${totals.sels}** | **${totals.decls}** | **${totals.imps}** | **${totals.media}** | **${totals.has}** | **${totals.host}** | **${totals.fragile}** | |`, '');
  for (const [file, why] of Object.entries(INACTIVE)) {
    const s = data.sheets.find(x => x.file === file);
    idx.push(`Not shipped: [${file}](${encodeURI(`${file}.md`)}) — ${why} (${s.rules.length} rules, ${s.rules.reduce((n, r) => n + r.importantCount, 0)} \`!important\`).`, '');
  }
  idx.push(...legend, '');
  await writeFile(path.join(OUT, 'appendix-b-css-rule-index', 'README.md'), idx.join('\n'));

  /* ---- appendix C: dependency surface ---- */
  const active = data.sheets.filter(s => s.active);
  const rulesAll = active.flatMap(s => s.rules);
  const c = [];
  c.push('# Appendix C — CSS dependency surface', '');
  c.push(`> Generated by \`tools/css-inventory.mjs\` at commit \`${commit}\`. Shipped stylesheets only (\`header.claude.css\` excluded). Counts are rules, not declarations, unless stated.`, '');

  const tally = (getter) => {
    const map = new Map();
    for (const r of rulesAll) for (const key of getter(r)) {
      const e = map.get(key) || { count: 0, files: new Map() };
      e.count += 1;
      e.files.set(r.file, (e.files.get(r.file) || []).concat(r.line));
      map.set(key, e);
    }
    return [...map.entries()].sort((x, y) => y[1].count - x[1].count || x[0].localeCompare(y[0]));
  };
  const fileLines = e => [...e.files.entries()].map(([f, ls]) => `${f} (${ls.length}: L${ls.slice(0, 6).join(', L')}${ls.length > 6 ? ', …' : ''})`).join('; ');

  c.push('## C.1 Host (game) hooks the stylesheets depend on', '');
  c.push('Every class, id, attribute selector and element name that the extension does NOT create. A change to any of these in the IdleWorlds markup can silently disable the rules listed. Ordered by rule count.', '');
  c.push('| Hook | Rules | Where (file: count, first lines) |', '| --- | --- | --- |');
  for (const [key, e] of tally(r => r.hooks.game)) c.push(`| ${code(key)} | ${e.count} | ${mdEsc(fileLines(e))} |`);
  c.push('');

  c.push('## C.2 Skin-owned hooks', '');
  c.push('Hooks written by the extension\'s own JavaScript (attributes) or on its own elements (classes). A rename in JavaScript must be mirrored in these rules.', '');
  c.push('| Hook | Rules | Where |', '| --- | --- | --- |');
  const skinTally = tally(r => r.hooks.skin.map(h => h.replace(/=.*\]$/, ']').replace(/\s+/g, '')));
  for (const [key, e] of skinTally) c.push(`| ${code(key)} | ${e.count} | ${mdEsc(fileLines(e))} |`);
  c.push('');

  c.push('## C.3 Fragile selector patterns', '');
  c.push('| Pattern | Rules | Where |', '| --- | --- | --- |');
  for (const [key, e] of tally(r => r.hooks.fragile)) c.push(`| ${mdEsc(key)} | ${e.count} | ${mdEsc(fileLines(e))} |`);
  c.push('');

  c.push('## C.4 `:has()` rules', '');
  c.push('`:has()` is a subject-invalidation selector: Chrome re-evaluates it when any descendant it names changes. These rules are the ones to profile first on a large page.', '');
  c.push('| File | Line | Selector(s) |', '| --- | --- | --- |');
  for (const r of rulesAll.filter(r => r.hasHas)) c.push(`| ${r.file} | ${r.line} | ${r.selectors.map(s => code(s.selector)).join('<br>')} |`);
  c.push('');

  c.push('## C.5 `!important` by property', '');
  const impProps = new Map();
  for (const r of rulesAll) for (const d of r.declarations) if (d.important) impProps.set(d.prop, (impProps.get(d.prop) || 0) + 1);
  c.push('| Property | `!important` declarations |', '| --- | --- |');
  for (const [p, n] of [...impProps.entries()].sort((x, y) => y[1] - x[1])) c.push(`| ${code(p)} | ${n} |`);
  c.push('');

  c.push('## C.6 Custom properties', '');
  c.push('Defined = declared in a stylesheet rule. JS-set = written inline by a module (found by scanning `src/modules` for the name). Used = read through `var()`. A property that is used but neither defined nor JS-set always resolves to its `var()` fallback.', '');
  const defined = new Map(), used = new Map();
  for (const r of rulesAll) {
    for (const p of r.customPropsDefined) defined.set(p, (defined.get(p) || []).concat(`${r.file}:${r.line}`));
    for (const p of r.varsUsed) used.set(p, (used.get(p) || []).concat(`${r.file}:${r.line}`));
  }
  const moduleText = (await Promise.all((await readdir(path.join(ROOT, 'src', 'modules'))).filter(f => f.endsWith('.js')).map(async f => [f, await readFile(path.join(ROOT, 'src', 'modules', f), 'utf8')])));
  const jsSetters = name => moduleText.filter(([, t]) => t.includes(`'${name}'`) || t.includes(`"${name}"`) || t.includes(`\`${name}\``) || t.includes(name)).map(([f]) => f);
  const names = [...new Set([...defined.keys(), ...used.keys()])].sort();
  c.push('| Custom property | Defined in CSS (rules) | Used via var() (rules) | Mentioned in JS modules |', '| --- | --- | --- | --- |');
  for (const n of names) {
    const d = defined.get(n) || [];
    const u = used.get(n) || [];
    const js = jsSetters(n);
    c.push(`| ${code(n)} | ${d.length ? `${d.length} (${d.slice(0, 3).join(', ')}${d.length > 3 ? ', …' : ''})` : '—'} | ${u.length ? `${u.length} (${u.slice(0, 3).join(', ')}${u.length > 3 ? ', …' : ''})` : '—'} | ${js.length ? js.join(', ') : '—'} |`);
  }
  c.push('');

  c.push('## C.7 Media and container queries', '');
  c.push('| File | Line | Query | Rules inside |', '| --- | --- | --- | --- |');
  for (const s of active) for (const m of s.media) c.push(`| ${s.file} | ${m.line} | ${code(`@media ${m.query}`)} | ${m.rules} |`);
  for (const s of active) for (const m of s.containers) c.push(`| ${s.file} | ${m.line} | ${code(`@container ${m.query}`)} | — |`);
  c.push('');
  const distinct = new Map();
  for (const s of active) for (const m of s.media) distinct.set(m.query, (distinct.get(m.query) || 0) + 1);
  c.push('Distinct `@media` conditions:', '', '| Condition | Blocks |', '| --- | --- |');
  for (const [q, n] of [...distinct.entries()].sort((x, y) => y[1] - x[1])) c.push(`| ${code(q)} | ${n} |`);
  c.push('');

  c.push('## C.8 Animations and transitions', '');
  c.push('| Keyframes | File:Line | Referenced by (file:line) |', '| --- | --- | --- |');
  const kfs = active.flatMap(s => s.keyframes);
  for (const k of kfs) {
    const refs = rulesAll.filter(r => r.animations.some(a => new RegExp(`(^|[\\s,])${k.name}([\\s,]|$)`).test(a))).map(r => `${r.file}:${r.line}`);
    c.push(`| ${code(k.name)} | ${k.file}:${k.line} | ${refs.join(', ') || '— (unused)'} |`);
  }
  c.push('');
  const transitionRules = rulesAll.filter(r => r.transitions.length);
  c.push(`${transitionRules.length} rules declare a \`transition\`. ${rulesAll.filter(r => r.animations.length).length} rules declare an \`animation\`.`, '');
  c.push('| File | Line | Selector(s) | Transition / animation |', '| --- | --- | --- | --- |');
  for (const r of rulesAll.filter(r => r.transitions.length || r.animations.length)) {
    c.push(`| ${r.file} | ${r.line} | ${r.selectors.map(s => code(s.selector)).join('<br>')} | ${mdEsc([...r.transitions, ...r.animations.map(a => `animation: ${a}`)].join(' · '))} |`);
  }
  c.push('');

  c.push('## C.9 Pseudo-elements', '');
  const pe = tally(r => r.pseudoElements.map(p => `::${p.replace(/\(.*\)$/, '()')}`));
  c.push('| Pseudo-element | Rules | Where |', '| --- | --- | --- |');
  for (const [key, e] of pe) c.push(`| ${code(key)} | ${e.count} | ${mdEsc(fileLines(e))} |`);
  c.push('');
  c.push('## C.10 Pseudo-classes', '');
  const pc = tally(r => r.pseudoClasses.map(p => `:${p}`));
  c.push('| Pseudo-class | Rules | Where |', '| --- | --- | --- |');
  for (const [key, e] of pc) c.push(`| ${code(key)} | ${e.count} | ${mdEsc(fileLines(e))} |`);
  c.push('');

  await writeFile(path.join(OUT, 'appendix-c-css-dependency-surface.md'), c.join('\n'));

  /* ---- JSON ---- */
  const json = JSON.stringify(data, (key, value) => (key === 'parent' ? undefined : value), 1);
  await writeFile(path.join(HERE, 'css-inventory.json'), json);

  console.log(`css-inventory: ${active.length} shipped sheets, ${rulesAll.length} rules, ${rulesAll.reduce((n, r) => n + r.importantCount, 0)} !important — commit ${commit.slice(0, 12)}${dirty ? ' (dirty styles)' : ''}`);
}

main().catch(err => { console.error(err); process.exit(1); });
