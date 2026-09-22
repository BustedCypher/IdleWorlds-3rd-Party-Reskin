/** Documentation-only, lossless CSS inventory. Run from any directory with Node.
 * Reads source; writes only CSS_RULE_REFERENCE.md and css-coverage.json beside it.
 * --check verifies both committed outputs without changing them.
 * Uses locked, already-installed transitive packages; performs no network I/O.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { tokenize, TokenType as T } from '@csstools/css-tokenizer';
import CSSOM from 'rrweb-cssom';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, '../..');
const order = [
  ['base.css', 'base'], ['tooltip-engine.css', 'tooltip-engine'],
  ['inventory.css', 'inventory'], ['skillpanel.css', 'skillpanel'],
  ['skillcard-v2.css', 'skillpanel'], ['skillcard-v2-runtime-safe.css', 'skillpanel'],
  ['card-button-atlas.css', 'skillpanel'], ['card-buttons.css', 'skillpanel'],
  ['header.css', 'header'], ['overlay.css', 'overlay'], ['ui-system.css', 'ui-system'],
  ['compact-buttons.css', 'ui-system'], ['village-scene.css', 'ui-system'],
  ['collapsible.css', 'ui-system'], ['header.claude.css', null],
];
const trivia = t => t[0] === T.Comment || t[0] === T.Whitespace;
const open = new Map([[T.OpenCurly, T.CloseCurly], [T.OpenSquare, T.CloseSquare], [T.OpenParen, T.CloseParen], [T.Function, T.CloseParen]]);
const close = new Set(open.values());
const cleanComment = s => s.replace(/^\/\*|\*\/$/g, '').replace(/^\s*\* ?/gm, '').trim();
const compact = s => s.replace(/\s+/g, ' ').trim();
const escapeCell = s => compact(s).replace(/\|/g, '\\|').replace(/`/g, '&#96;');
const code = s => '`' + String(s).replace(/`/g, '&#96;') + '`';
const fileAnchor = name => name.replace(/\./g, '-');
const sum = (items, f) => items.reduce((n, x) => n + f(x), 0);
const compareSpecificity = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function tokensFor(css) {
  const errors = [];
  const tokens = tokenize({ css }, { onParseError: e => errors.push(String(e)) }).filter(t => t[0] !== T.EOF);
  assert.equal(errors.length, 0, 'CSS tokenizer errors: ' + errors.join('; '));
  assert.equal(tokens.map(t => t[1]).join(''), css, 'Tokenizer must preserve every source character');
  return tokens;
}
function matching(tokens) {
  const stack = [], pairs = new Map();
  for (let i = 0; i < tokens.length; i++) {
    if (open.has(tokens[i][0])) stack.push(i);
    else if (close.has(tokens[i][0])) {
      const start = stack.pop();
      assert.notEqual(start, undefined, 'Unmatched closing bracket');
      assert.equal(open.get(tokens[start][0]), tokens[i][0], 'Mismatched bracket');
      pairs.set(start, i);
    }
  }
  assert.equal(stack.length, 0, 'Unclosed bracket');
  return pairs;
}
function splitTop(tokens, delimiter) {
  const pairs = matching(tokens), lists = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (pairs.has(i)) { i = pairs.get(i); continue; }
    if (tokens[i][0] === delimiter) { lists.push(tokens.slice(start, i)); start = i + 1; }
  }
  lists.push(tokens.slice(start));
  return lists;
}
function specificity(tokens) {
  const pairs = matching(tokens);
  const n = [0, 0, 0];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (trivia(t)) continue;
    if (t[0] === T.Hash && t[4]?.type === 'id') { n[0]++; continue; }
    if (t[0] === T.OpenSquare) { n[1]++; i = pairs.get(i); continue; }
    if (t[0] === T.Delim && t[1] === '.') { n[1]++; i++; continue; }
    if (t[0] === T.Colon) {
      const double = tokens[i + 1]?.[0] === T.Colon;
      if (double) i++;
      const p = tokens[++i];
      assert.ok(p, 'Missing pseudo selector');
      const name = p[4]?.value?.toLowerCase();
      if (double || ['before', 'after', 'first-line', 'first-letter'].includes(name)) n[2]++;
      else if (!['is', 'not', 'has', 'where'].includes(name)) n[1]++;
      if (p[0] === T.Function) {
        const end = pairs.get(i), args = tokens.slice(i + 1, end);
        if (['is', 'not', 'has'].includes(name)) {
          const max = splitTop(args, T.Comma).map(specificity).sort(compareSpecificity).at(-1) || [0, 0, 0];
          max.forEach((v, j) => n[j] += v);
        } else if (['nth-child', 'nth-last-child'].includes(name)) {
          const ofIndex = args.findIndex(t => t[0] === T.Ident && t[4]?.value === 'of');
          if (ofIndex >= 0) {
            const max = splitTop(args.slice(ofIndex + 1), T.Comma).map(specificity).sort(compareSpecificity).at(-1);
            max.forEach((v, j) => n[j] += v);
          }
        } else assert.ok((double && ['highlight', 'part'].includes(name)) || ['where', 'nth-child', 'nth-last-child', 'lang', 'dir'].includes(name), 'Review unsupported functional pseudo: ' + name);
        i = end;
      }
      continue;
    }
    if (t[0] === T.Ident) { n[2]++; continue; }
    assert.ok(t[0] === T.Delim || t[0] === T.Comma, 'Review unexpected selector token: ' + t[1]);
  }
  return n;
}

function parseFile(name, source, styleTag) {
  const tokens = tokensFor(source), pairs = matching(tokens), records = [], seenBraces = new Set();
  const ids = new Set();
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  function line(pos) {
    let lo = 0, hi = lineStarts.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (lineStarts[mid] <= pos) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function raw(a, b) { return tokens.slice(a, b).map(t => t[1]).join(''); }
  function declarations(a, b) {
    const result = [];
    for (const group of splitTop(tokens.slice(a, b), T.Semicolon)) {
      const significant = group.filter(t => !trivia(t));
      if (!significant.length) continue;
      assert.equal(significant[0][0], T.Ident, 'Unexpected declaration start in ' + name + ':' + line(significant[0][2]));
      assert.equal(significant[1]?.[0], T.Colon, 'Unexpected declaration syntax');
      const prop = significant[0][4].value;
      const colon = group.indexOf(significant[1]);
      assert.ok(!group.some(t => t[0] === T.OpenCurly), 'Nested style/custom block requires parser extension');
      const value = group.slice(colon + 1).filter(t => t[0] !== T.Comment).map(t => t[1]).join('').trim();
      result.push({ property: prop, value, line: line(significant[0][2]), important: /!\s*important\s*$/i.test(value) });
    }
    return result;
  }
  function rules(a, b, parents = []) {
    const children = [];
    let i = a, precedingComments = [];
    while (i < b) {
      if (trivia(tokens[i])) {
        if (tokens[i][0] === T.Comment) precedingComments.push({ line: line(tokens[i][2]), text: cleanComment(tokens[i][1]) });
        i++; continue;
      }
      const start = i;
      while (i < b && tokens[i][0] !== T.OpenCurly && tokens[i][0] !== T.Semicolon) {
        if (pairs.has(i)) i = pairs.get(i);
        i++;
      }
      assert.ok(i < b && tokens[i][0] === T.OpenCurly, 'Unexpected non-block rule in ' + name + ':' + line(tokens[start][2]));
      const end = pairs.get(i);
      assert.ok(end < b, 'Rule outside parent');
      seenBraces.add(i);
      const header = raw(start, i).trim();
      const atName = tokens[start][0] === T.AtKeyword ? tokens[start][4].value.toLowerCase() : null;
      const grouping = ['media', 'container', 'supports', 'keyframes', '-webkit-keyframes', 'layer', 'scope'].includes(atName);
      const kind = atName || (parents.at(-1)?.kind.endsWith('keyframes') ? 'keyframe' : 'style');
      assert.ok(!atName || grouping || atName === 'font-face', 'Review unknown at-rule: ' + atName);
      const baseId = `${name.replace(/\.css$/, '').replace(/\./g, '-')}-L${line(tokens[start][2])}`;
      let id = baseId, occurrence = 1;
      while (ids.has(id)) id = baseId + '-' + (++occurrence);
      ids.add(id);
      const record = {
        id,
        index: records.length + 1, source: 'src/styles/' + name,
        line: line(tokens[start][2]), endLine: line(tokens[end][3]), kind, header,
        context: parents.map(r => ({ id: r.id, header: r.header })),
        comments: precedingComments, declarations: [], selectors: [], children: [],
        raw: source.slice(tokens[start][2], tokens[end][3] + 1),
      };
      precedingComments = [];
      if (kind === 'style') {
        record.selectors = splitTop(tokens.slice(start, i), T.Comma).map(ts => ({
          selector: ts.map(t => t[1]).join('').trim(), specificity: specificity(ts),
        }));
      }
      records.push(record); children.push(record);
      if (grouping) record.children = rules(i + 1, end, [...parents, record]);
      else record.declarations = declarations(i + 1, end);
      i = end + 1;
    }
    return children;
  }
  const roots = rules(0, tokens.length);
  assert.ok(records.length > 0, 'Every source sheet must contain at least one rule');
  assert.equal(seenBraces.size, tokens.filter(t => t[0] === T.OpenCurly).length, 'Every block must be inventoried');
  const cssom = CSSOM.parse(source), cssomRecords = [];
  function walkCSSOM(rules) {
    for (const r of rules) {
      cssomRecords.push(r);
      if (r.cssRules?.length) walkCSSOM(r.cssRules);
    }
  }
  walkCSSOM(cssom.cssRules);
  assert.equal(cssomRecords.length, records.length, 'Independent CSSOM rule count mismatch: ' + name);
  for (let j = 0; j < records.length; j++) {
    const r = records[j], c = cssomRecords[j];
    if (r.kind === 'style') assert.equal(compact(c.selectorText), compact(r.header), 'CSSOM selector mismatch: ' + r.id);
    if (r.kind === 'keyframe') assert.equal(compact(c.keyText).replace(/\s*,\s*/g, ','), compact(r.header).replace(/\s*,\s*/g, ','), 'CSSOM keyframe mismatch: ' + r.id);
    if (c.style) {
      const last = new Map(r.declarations.map(d => [d.property, d]));
      assert.equal(c.style.length, last.size, 'CSSOM declaration count mismatch: ' + r.id);
      for (const [p, d] of last) {
        assert.equal(compact(c.style.getPropertyValue(p)), compact(d.value.replace(/\s*!\s*important\s*$/i, '')), 'CSSOM value mismatch: ' + r.id + ' ' + p);
        assert.equal(c.style.getPropertyPriority(p), d.important ? 'important' : '', 'CSSOM priority mismatch');
      }
    } else assert.equal(r.declarations.length, 0, 'Unexpected declarations on grouping rule');
  }
  return {
    name, source, styleTag, records, roots,
    coverage: {
      file: 'src/styles/' + name, active: styleTag !== null, styleTag,
      sha256: createHash('sha256').update(source).digest('hex'), bytes: Buffer.byteLength(source),
      lines: source.split('\n').length, blocks: records.length,
      styleRules: records.filter(r => r.kind === 'style').length,
      selectorBranches: sum(records, r => r.selectors.length),
      declarations: sum(records, r => r.declarations.length),
      importantDeclarations: sum(records, r => r.declarations.filter(d => d.important).length),
      customPropertyDeclarations: sum(records, r => r.declarations.filter(d => d.property.startsWith('--')).length),
      atRules: records.filter(r => r.kind !== 'style' && r.kind !== 'keyframe').length,
      keyframeSteps: records.filter(r => r.kind === 'keyframe').length,
      independentCSSOMBlocks: cssomRecords.length,
      tokenizerRoundTrip: true, everyCurlyBlockAssigned: true, cssomSelectorsAndDeclarationsMatch: true,
    },
  };
}

const surfacePatterns = [
  [/iw-skill-v2|fs-skill-v2|iw-skill-card-design/, 'the V2 skill-card composition'],
  [/iw-control-|fs-control-/, 'the Zone Control ward and state indicators'],
  [/iw-village-scene|iw-vs-/, 'the extension-owned village scene or ledger'],
  [/iw-village|fs-village/, 'the Village route housing/add-on cards'],
  [/iw-quest|fs-quest/, 'quest cards and their native commands'],
  [/fs-skill|iw-skill|fs-motion|fs-button/, 'skill cards and their native controls'],
  [/iw-boss|fs-boss/, 'World Boss cards and participation controls'],
  [/fs-inv|iw-inv/, 'inventory rows, filters or native action controls'],
  [/iw-tip|fs-tooltip|iw-tooltip|fs-item-name/, 'item tooltips or item-name affordances'],
  [/iw-header|fs-header|iw-zone|fs-zone|iw-chrome/, 'header identity, navigation and zone chrome'],
  [/iw-collapse|iw-collapsed/, 'panel disclosure controls and collapsed state'],
  [/iw-compact/, 'compact atlas-backed native controls'],
  [/iw-overlay/, 'detected modal scrims or content cards'],
  [/current-action|action-|progress/, 'Current Action/progress presentation'],
  [/chat|log|feed/, 'activity feeds and chat/log chrome'],
  [/main-nav|nav-tab/, 'the main navigation rail'],
  [/market/, 'Market listing cards and native controls'],
  [/panel|section-frame|section-title/, 'shared panel/frame presentation'],
  [/button|input|select|textarea|fs-btn/, 'shared controls'],
];
function effects(r) {
  const ds = r.declarations, pieces = [];
  const list = re => ds.filter(d => re.test(d.property)).map(d => d.property);
  const has = p => ds.find(d => d.property === p);
  const custom = ds.filter(d => d.property.startsWith('--'));
  if (custom.length) pieces.push(`Defines or overrides ${custom.length} custom propert${custom.length === 1 ? 'y' : 'ies'}; inherited token consumers resolve these values on their own elements`);
  if (has('display')) pieces.push(`Uses ${code(has('display').value)} display, determining whether this box lays out as a grid/flex/block, disappears, or passes layout through with contents`);
  const groups = [
    [/^(grid|flex|align-|justify-|place-|order$|gap$|row-gap$|column-gap$)/, 'Assigns grid/flex tracks, placement or spacing'],
    [/^(position$|inset|top$|right$|bottom$|left$|float$)/, 'Establishes positioning/containing-box offsets'],
    [/^(width$|height$|min-|max-|aspect-ratio$|box-sizing$|padding|margin)/, 'Sets sizing and box-model geometry'],
    [/^(font|line-height|letter-spacing|text-|white-space|word-|overflow-wrap|color$|vertical-align)/, 'Sets text hierarchy, wrapping or foreground treatment'],
    [/^(background|border|box-shadow|outline|filter$|backdrop-filter|mask|clip-path|opacity$|-webkit-)/, 'Paints, masks or clips the surface/artwork'],
    [/^(overflow|isolation$|z-index$|contain$|container)/, 'Controls clipping, stacking or container-query scope'],
    [/^(transition|animation|transform|transform-origin|will-change)/, 'Controls motion or geometric transformation'],
    [/^(cursor$|pointer-events$|user-select$|touch-action$|appearance$)/, 'Controls hit-testing, interaction affordance or native control appearance'],
    [/^(content$)/, 'Generates pseudo-element text/artwork content'],
    [/^(object-fit$|object-position$|image-rendering$)/, 'Controls image placement or resampling'],
  ];
  for (const [re, label] of groups) { const ps = [...new Set(list(re))]; if (ps.length) pieces.push(`${label} (${ps.map(code).join(', ')})`); }
  const known = ds.filter(d => !d.property.startsWith('--') && d.property !== 'display' && !groups.some(([re]) => re.test(d.property)));
  if (known.length) pieces.push('Additional CSS settings: ' + known.map(d => `${code(d.property)} = ${code(d.value)}`).join('; '));
  return pieces;
}
function meaning(r) {
  if (r.kind === 'font-face') return 'Registers a bundled font face. Family, style, weight range, loading policy and font URL are explicit below; this does not itself assign that font to an element.';
  if (r.kind === 'media') return 'Conditionally applies its child rules when the viewport, input capability or user preference matches the media query. It does not add selector specificity.';
  if (r.kind === 'container') return 'Conditionally applies child rules according to the named ancestor query container’s inline size, independently of viewport width. It does not add selector specificity.';
  if (r.kind.endsWith('keyframes')) return 'Defines named animation keyframes; the animation runs only where an animation declaration references this name and has not been disabled by another rule.';
  if (r.kind === 'keyframe') return 'Specifies the animated property values at the listed animation offsets; these are keyframe selectors, not DOM selectors.';
  const target = surfacePatterns.find(([re]) => re.test(r.header))?.[1] || (/^:root/.test(r.header) ? 'global theme tokens and host theme aliases' : 'the exact host/extension elements matched by this selector');
  let out = 'Styles ' + target + '.';
  if (/:hover|:focus|:active/.test(r.header)) out += ' Interaction pseudos narrow the indicated branches to hover, keyboard focus or press state.';
  if (/disabled|aria-disabled/.test(r.header)) out += ' Disabled tests distinguish action availability; a :not() branch excludes rather than selects that state.';
  if (/::before|::after/.test(r.header)) out += ' Pseudo-element branches paint generated boxes; their positioning, content and pointer behavior depend on the originating element.';
  if (/:has\(/.test(r.header)) out += ' Relational :has() depends on the specified descendants/siblings still being present.';
  if (/>/.test(r.header)) out += ' Direct-child combinators are structure-sensitive: an extra wrapper changes matching.';
  if (/:is\(|:not\(/.test(r.header)) out += ' :is()/:not() contribute their most specific argument; exclusions are also part of the specificity contract.';
  return out;
}
function mdBlock(r) {
  if (!r.children.length) return r.raw;
  return r.header + ' {\n  /* Child blocks are fully enumerated in the following entries. */\n}';
}
function sourceLink(r, text = r.source + ':' + r.line) { return `[${text}](../../${r.source}#L${r.line})`; }

const present = (await fs.readdir(path.join(ROOT, 'src/styles'))).filter(n => n.endsWith('.css')).sort();
assert.deepEqual([...order.map(([n]) => n)].sort(), present, 'Update inventory when CSS files are added/removed');
const files = [];
for (const [name, styleTag] of order) files.push(parseFile(name, await fs.readFile(path.join(ROOT, 'src/styles', name), 'utf8'), styleTag));
const all = files.flatMap(f => f.records), active = files.filter(f => f.styleTag);
assert.equal(new Set(all.map(r => r.id)).size, all.length, 'Every documentation anchor must be unique');
const totals = fs => Object.fromEntries(['bytes', 'blocks', 'styleRules', 'selectorBranches', 'declarations', 'importantDeclarations', 'customPropertyDeclarations', 'atRules', 'keyframeSteps'].map(k => [k, sum(fs, f => f.coverage[k])]));

const coverage = {
  schema: 1,
  generatedBy: 'handoff/technical/generate-css-reference.mjs',
  method: 'Lossless CSSTools tokenizer; brace and declaration traversal; independently checked against rrweb-cssom for every flattened rule, selector, final property value and priority. Duplicate declarations are retained in source inventory.',
  scope: 'Every .css file directly in src/styles, including inactive header.claude.css; source rules, not computed-style/live application coverage.',
  all: totals(files), active: totals(active), inactive: totals(files.filter(f => !f.styleTag)),
  files: files.map(f => f.coverage),
  ruleIndex: all.map(({ raw, children, comments, ...r }) => r),
};
let md = `# CSS rule reference\n\nGenerated from the actual source by [generate-css-reference.mjs](generate-css-reference.mjs). For architecture, cascade hazards and integration recommendations, read [CSS_GUIDE.md](CSS_GUIDE.md). This is a source inventory, not a claim that every historical selector matches the current live game.\n\n## Coverage and reading conventions\n\n- ${files.length} source files: ${active.length} active files in seven lifecycle-owned style tags, plus inactive \`header.claude.css\`.\n- ${coverage.all.blocks} total blocks: ${coverage.all.styleRules} style rules, ${coverage.all.atRules} at-rule blocks, ${coverage.all.keyframeSteps} keyframe steps; ${coverage.all.selectorBranches} comma-separated selector branches; ${coverage.all.declarations} declarations, including ${coverage.all.importantDeclarations} marked \`!important\` and ${coverage.all.customPropertyDeclarations} custom-property writes.\n- Every declaration is retained verbatim in its source block; later duplicate selectors/properties are separate entries. Source comments immediately before a block are included as author intent, not independent proof of runtime behavior. Comments inside blocks remain in the exact source excerpt.\n- Specificity is \`(IDs, classes/attributes/pseudo-classes, types/pseudo-elements)\`, listed in comma-separated selector order. \`:is()\`, \`:not()\` and \`:has()\` use the most specific argument; \`:where()\` contributes zero. At-rule conditions add no specificity. Inline styles, importance, origin and source order remain separate cascade dimensions.\n- Grouping blocks list their exact condition and link to child entries. Each leaf block is reproduced once. Context chains retain nesting. All links identify the source path and starting line.\n- Verification: tokenizer reconstruction equals every source character; every curly block is assigned exactly once; an independent \`rrweb-cssom\` traversal agrees on every rule count, selector, final declaration value and priority. [css-coverage.json](css-coverage.json) contains file hashes, counts and the full structured index. This is syntactic coverage, not rendered-state verification.\n\nRegenerate: \`node handoff/technical/generate-css-reference.mjs\`. Check drift: \`node handoff/technical/generate-css-reference.mjs --check\`.\n\n## File order\n\n| Source | Active style tag / concatenation order | Blocks | Selector branches | Declarations | !important |\n|---|---|---:|---:|---:|---:|\n`;
for (const [i, f] of files.entries()) md += `| [${f.name}](#${fileAnchor(f.name)}) | ${f.styleTag ? `${i + 1}. ${code(f.styleTag)}` : '**Inactive** — no production import'} | ${f.coverage.blocks} | ${f.coverage.selectorBranches} | ${f.coverage.declarations} | ${f.coverage.importantDeclarations} |\n`;
for (const f of files) {
  md += `\n<a id="${fileAnchor(f.name)}"></a>\n\n## ${f.name}\n\n${f.styleTag ? `Active within ${code(f.styleTag)}; order shown above is load/concatenation order.` : '**Inactive alternate stylesheet.** No production import; these rules have no runtime cascade effect unless separately loaded.'} [Open source](../../src/styles/${f.name}).\n`;
  for (const r of f.records) {
    md += `\n<a id="${r.id}"></a>\n\n### ${r.id} — ${r.kind}\n\n${sourceLink(r)}; ends at line ${r.endLine}.`;
    if (r.context.length) md += ' Context: ' + r.context.map(c => `[${code(compact(c.header))}](#${c.id})`).join(' → ') + '.';
    md += '\n\n' + meaning(r) + '\n';
    if (r.comments.length) {
      md += '\n**Immediately preceding source intent:**\n\n';
      for (const c of r.comments) md += `> (line ${c.line}) ` + c.text.replace(/\r/g, '').split('\n').map(s => s.trim()).join('\n> ') + '\n\n';
    }
    if (r.selectors.length) md += '\n**Selector specificity, in source branch order:** ' + r.selectors.map(s => code('(' + s.specificity.join(',') + ')')).join(', ') + '.\n';
    if (r.declarations.length) {
      md += '\n**Effect:** ' + effects(r).join('. ') + '.\n';
      const dup = [...new Set(r.declarations.filter((d, i, ds) => ds.findIndex(x => x.property === d.property) !== i).map(d => d.property))];
      if (dup.length) md += '\n**Repeated properties in this block:** ' + dup.map(code).join(', ') + '; preserve their order and importance.\n';
    }
    md += '\n```css\n' + mdBlock(r).replace(/\r/g, '') + '\n```\n';
    if (r.children.length) md += '\n**Child blocks:** ' + r.children.map(c => `[${c.id}](#${c.id})`).join(', ') + '.\n';
  }
}
const tokenDefs = new Map(), tokenUses = new Map(), animations = [], conditions = [];
for (const r of all) {
  if (r.kind === 'media' || r.kind === 'container') conditions.push(r);
  if (r.kind.endsWith('keyframes')) animations.push(r);
  for (const d of r.declarations) {
    if (d.property.startsWith('--')) { const set = tokenDefs.get(d.property) || new Set(); set.add(r.id); tokenDefs.set(d.property, set); }
    for (const match of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) { const set = tokenUses.get(match[1]) || new Set(); set.add(r.id); tokenUses.set(match[1], set); }
  }
}
md += '\n## All custom-property definitions and consumers\n\nThis includes the inactive alternate sheet. Values appear in the linked rule entries; a missing stylesheet definition often means a JavaScript/inline token or an intentional fallback, not necessarily an error. Property inheritance flows from parent to child; it cannot carry a child’s token back to its parent.\n\n| Property | Definition rules | Consumer rules |\n|---|---|---|\n';
for (const key of [...new Set([...tokenDefs.keys(), ...tokenUses.keys()])].sort()) {
  const links = set => [...(set || [])].map(id => `[${id}](#${id})`).join(', ') || '—';
  md += `| ${code(key)} | ${links(tokenDefs.get(key))} | ${links(tokenUses.get(key))} |\n`;
}
md += '\n## Every media and container condition\n\n| Rule | Condition | Direct child blocks |\n|---|---|---:|\n';
for (const r of conditions) md += `| [${r.id}](#${r.id}) | ${escapeCell(r.header)} | ${r.children.length} |\n`;
md += '\n## Every named keyframe animation\n\n| Rule | Name | Steps |\n|---|---|---:|\n';
for (const r of animations) md += `| [${r.id}](#${r.id}) | ${escapeCell(r.header)} | ${r.children.length} |\n`;
const outputs = [['CSS_RULE_REFERENCE.md', md], ['css-coverage.json', JSON.stringify(coverage, null, 2) + '\n']];
for (const [name, text] of outputs) {
  if (process.argv.includes('--check')) assert.equal(await fs.readFile(path.join(OUT, name), 'utf8'), text, name + ' is stale');
  else await fs.writeFile(path.join(OUT, name), text, 'utf8');
}
console.log(JSON.stringify({ mode: process.argv.includes('--check') ? 'checked' : 'generated', files: files.length, all: coverage.all, active: coverage.active, verification: 'All source characters and blocks covered; CSSOM checks passed.' }, null, 2));
