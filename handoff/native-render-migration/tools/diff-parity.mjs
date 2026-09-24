#!/usr/bin/env node
/**
 * diff-parity.mjs — compare two captures made by capture-parity.js.
 *
 *   node handoff/native-render-migration/tools/diff-parity.mjs reference.json candidate.json [options]
 *
 * Options:
 *   --tolerance=0.5         px slack on element boxes (default 0.5)
 *   --ignore=<regex>        skip nodes whose key OR label matches (repeatable)
 *   --ignore-mark=<name>[=<value>]  skip nodes carrying that skin mark, and
 *                           everything inside them (repeatable), e.g.
 *                           --ignore-mark=data-iw-panel-part=feed
 *   --ignore-prop=<name>    skip one computed property everywhere (repeatable)
 *   --report=<file.md>      also write the full report as Markdown
 *   --max=200               cap on listed differences per section
 *   --ignore-route          allow the two captures to come from different paths
 *   --strict-attributes     also compare bookkeeping attributes no stylesheet reads
 *
 * Asset URLs are normalised before comparing (anything up to `/assets/` is
 * dropped), because the reference serves art from chrome-extension:// and the
 * native build from the game's own origin — the same file either way.
 *
 * Exit code 0 means no differences outside the ignore lists; 1 means there
 * are some. A report of "0 nodes compared" is a failed capture, not a pass.
 */
import { readFile, writeFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
const files = argv.filter(a => !a.startsWith('--'));
const opt = (name, fallback) => {
  const hit = argv.filter(a => a.startsWith(`--${name}=`)).map(a => a.slice(name.length + 3));
  return hit.length ? hit : fallback;
};
if (files.length !== 2) {
  console.error('usage: diff-parity.mjs reference.json candidate.json [--tolerance=0.5] [--ignore=regex] [--ignore-prop=name] [--report=file.md]');
  process.exit(2);
}
const TOL = Number(opt('tolerance', ['0.5'])[0]);
const IGNORE = opt('ignore', []).map(s => new RegExp(s));
const IGNORE_PROPS = new Set(opt('ignore-prop', []));
const MAX = Number(opt('max', ['200'])[0]);
const REPORT = opt('report', [null])[0];

const [ref, cand] = await Promise.all(files.map(async f => JSON.parse(await readFile(f, 'utf8'))));

/* Attributes the extension writes for its own bookkeeping that no stylesheet
   reads (generated/theme-constants.json → skinAttributes.bookkeeping). They
   carry no paint, the native render need not emit them, and they are skipped
   here. `--strict-attributes` compares them anyway. */
const BOOKKEEPING = new Set();
// Attributes the CSS only tests for presence: any value paints the same.
const PRESENCE_ONLY = new Set();
if (!argv.includes('--strict-attributes')) {
  try {
    const constants = JSON.parse(await readFile(new URL('../generated/theme-constants.json', import.meta.url), 'utf8'));
    for (const name of constants.skinAttributes?.bookkeeping || []) BOOKKEEPING.add(name);
    for (const name of constants.skinAttributes?.presenceOnly || []) PRESENCE_ONLY.add(name);
  } catch {
    console.error('note: generated/theme-constants.json not found; comparing every skin attribute (run export-theme-constants.mjs).');
  }
}
const norm = v => String(v ?? '')
  .replace(/url\((['"]?)[^'")]*?\/assets\//g, 'url($1assets/')
  .replace(/\s+/g, ' ')
  .trim();
// --ignore-mark=name=value (or just name): skip nodes carrying that skin mark,
// and everything inside them. For live content such as feeds:
//   --ignore-mark=data-iw-panel-part=feed
const IGNORE_MARKS = opt('ignore-mark', []).map(s => {
  const i = s.indexOf('=');
  return i < 0 ? { name: s, value: null } : { name: s.slice(0, i), value: s.slice(i + 1) };
});
const marksIgnored = n => IGNORE_MARKS.some(m => m.name in (n.skinAttributes || {})
  && (m.value === null || n.skinAttributes[m.name] === m.value));
function ignoredRoots(capture) {
  return capture.nodes.filter(marksIgnored).map(n => `${n.key}>`);
}
const refRoots = ignoredRoots(ref);
const candRoots = ignoredRoots(cand);
const underIgnored = n => [...refRoots, ...candRoots].some(prefix => `${n.key}>`.startsWith(prefix));
const skip = n => marksIgnored(n) || underIgnored(n) || IGNORE.some(re => re.test(n.key) || re.test(n.label || ''));

const lines = [];
const out = s => lines.push(s);
let differences = 0;

out(`# Parity diff`);
out('');
out(`- reference: \`${files[0]}\` (${ref.name}, ${ref.route}, ${ref.viewport.width}x${ref.viewport.height})`);
out(`- candidate: \`${files[1]}\` (${cand.name}, ${cand.route}, ${cand.viewport.width}x${cand.viewport.height})`);
if (ref.viewport.width !== cand.viewport.width) {
  out(`- **WARNING: viewport width differs; these captures are not comparable.**`);
  differences += 1;
}
if (ref.route !== cand.route && !argv.includes('--ignore-route')) {
  out(`- **WARNING: route differs; these captures are not comparable** (pass --ignore-route if the same screen is served at two paths).`);
  differences += 1;
}
out('');

// <html> state
out('## <html>');
const htmlDiffs = [];
for (const kind of ['attributes', 'inlineStyle']) {
  const a = ref.html?.[kind] || {}, b = cand.html?.[kind] || {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (/^data-iw-page-hydrated$/.test(k)) continue; // extension-only latch
    if (norm(a[k]) !== norm(b[k])) htmlDiffs.push(`- ${kind} \`${k}\`: reference \`${a[k] ?? '(absent)'}\` vs candidate \`${b[k] ?? '(absent)'}\``);
  }
}
if (htmlDiffs.length) { differences += htmlDiffs.length; htmlDiffs.forEach(out); } else out('- identical');
out('');

// Fonts
out('## Theme faces');
const faceKey = f => `${f.family} ${f.weight} ${f.style}`;
const refFaces = new Map((ref.fonts || []).map(f => [faceKey(f), f.status]));
const candFaces = new Map((cand.fonts || []).map(f => [faceKey(f), f.status]));
const faceDiffs = [];
for (const k of new Set([...refFaces.keys(), ...candFaces.keys()])) {
  if (refFaces.get(k) !== candFaces.get(k)) faceDiffs.push(`- ${k}: reference ${refFaces.get(k) ?? '(absent)'} vs candidate ${candFaces.get(k) ?? '(absent)'}`);
}
if (faceDiffs.length) { differences += faceDiffs.length; faceDiffs.forEach(out); } else out('- identical');
out('');

// Nodes
const refNodes = new Map(ref.nodes.filter(n => !skip(n)).map(n => [n.key, n]));
const candNodes = new Map(cand.nodes.filter(n => !skip(n)).map(n => [n.key, n]));
const missing = [...refNodes.keys()].filter(k => !candNodes.has(k));
const extra = [...candNodes.keys()].filter(k => !refNodes.has(k));
const common = [...refNodes.keys()].filter(k => candNodes.has(k));

out(`## Elements`);
out('');
out(`- reference: ${refNodes.size}, candidate: ${candNodes.size}, compared: ${common.length}`);
if (!common.length) {
  out('- **Nothing was compared. A capture with no common elements is a failed capture, not a pass.**');
  differences += 1;
}
out('');

function section(title, items, render) {
  out(`### ${title} (${items.length})`);
  out('');
  items.slice(0, MAX).forEach(item => out(render(item)));
  if (items.length > MAX) out(`- … ${items.length - MAX} more`);
  out('');
}
if (missing.length) {
  differences += missing.length;
  section('Marked in the reference, absent from the candidate', missing, k => `- \`${k}\` — "${refNodes.get(k).label}" ${JSON.stringify(refNodes.get(k).skinAttributes)}`);
}
if (extra.length) {
  differences += extra.length;
  section('Marked in the candidate only', extra, k => `- \`${k}\` — "${candNodes.get(k).label}" ${JSON.stringify(candNodes.get(k).skinAttributes)}`);
}

const nodeDiffs = [];
for (const k of common) {
  const a = refNodes.get(k), b = candNodes.get(k);
  const d = [];
  if (a.tag !== b.tag) d.push(`tag ${a.tag} vs ${b.tag}`);
  const ca = a.classes.join(' '), cb = b.classes.join(' ');
  if (ca !== cb) d.push(`classes \`${ca}\` vs \`${cb}\``);
  for (const name of new Set([...Object.keys(a.skinAttributes), ...Object.keys(b.skinAttributes)])) {
    if (BOOKKEEPING.has(name)) continue;
    if (PRESENCE_ONLY.has(name)) {
      if ((name in a.skinAttributes) !== (name in b.skinAttributes)) d.push(`${name} ${name in a.skinAttributes ? 'present' : 'absent'} vs ${name in b.skinAttributes ? 'present' : 'absent'}`);
      continue;
    }
    if (a.skinAttributes[name] !== b.skinAttributes[name]) d.push(`${name} \`${a.skinAttributes[name] ?? '(absent)'}\` vs \`${b.skinAttributes[name] ?? '(absent)'}\``);
  }
  for (const edge of ['x', 'y', 'w', 'h']) {
    if (Math.abs(a.rect[edge] - b.rect[edge]) > TOL) d.push(`box.${edge} ${a.rect[edge]} vs ${b.rect[edge]}`);
  }
  for (const [part, pa, pb] of [['', a.style, b.style], ['::before ', a.before, b.before], ['::after ', a.after, b.after]]) {
    if (!pa && !pb) continue;
    if (!pa || !pb) { d.push(`${part.trim() || 'element'} renders in ${pa ? 'reference' : 'candidate'} only`); continue; }
    for (const p of Object.keys(pa)) {
      if (IGNORE_PROPS.has(p)) continue;
      if (norm(pa[p]) !== norm(pb[p])) d.push(`${part}${p}: \`${pa[p]}\` vs \`${pb[p]}\``);
    }
  }
  if (d.length) nodeDiffs.push({ k, label: a.label, d });
}
if (nodeDiffs.length) {
  differences += nodeDiffs.length;
  section('Elements that paint differently', nodeDiffs, x => `- \`${x.k}\` — "${x.label}"\n${x.d.slice(0, 12).map(s => `  - ${s}`).join('\n')}${x.d.length > 12 ? `\n  - … ${x.d.length - 12} more` : ''}`);
}

out(`## Result`);
out('');
out(differences ? `**${differences} difference(s).**` : '**No differences.**');

const text = lines.join('\n') + '\n';
if (REPORT) await writeFile(REPORT, text, 'utf8');
console.log(text.length > 20000 ? `${text.slice(0, 20000)}\n… (see --report for the rest)` : text);
process.exit(differences ? 1 : 0);
