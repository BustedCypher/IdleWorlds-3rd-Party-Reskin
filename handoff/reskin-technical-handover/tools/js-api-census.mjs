#!/usr/bin/env node
/**
 * js-api-census.mjs — where every security- or lifecycle-relevant browser API
 * is used in the shipped JavaScript.
 *
 *   node handoff/reskin-technical-handover/tools/js-api-census.mjs
 *
 * Scans src/content.js, src/page/*.js and src/modules/*.js (the complete
 * runtime) and writes tools/js-api-census.md: one table of API -> file:line
 * call sites, plus per-file imports, custom events emitted and consumed, and
 * DOM listener registrations. Lines that are pure comments are skipped so
 * prose mentions are not counted.
 *
 * It is a LEXICAL census. It proves absence well (an API that never appears in
 * the source is not called) and locates presence; Chapter 5 of the handover
 * explains each hit. A pattern that matches nothing in a category that must
 * exist (fetch, MutationObserver) makes the script fail, because a census that
 * finds nothing is broken, not clean.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

const files = [
  'src/content.js',
  ...(await readdir(path.join(ROOT, 'src/page'))).filter(f => f.endsWith('.js')).map(f => `src/page/${f}`),
  ...(await readdir(path.join(ROOT, 'src/modules'))).filter(f => f.endsWith('.js')).map(f => `src/modules/${f}`),
];

/* [label, regex, category]. Categories group the Markdown table. */
const APIS = [
  ['fetch()', /\bfetch\(/, 'Network'],
  ['XMLHttpRequest', /XMLHttpRequest/, 'Network'],
  ['WebSocket / EventSource', /\bnew\s+(WebSocket|EventSource)\(/, 'Network'],
  ['navigator.sendBeacon', /sendBeacon/, 'Network'],
  ['AbortController', /AbortController/, 'Network'],
  ['chrome.storage', /chrome\.storage/, 'Storage'],
  ['localStorage', /localStorage/, 'Storage'],
  ['sessionStorage', /sessionStorage/, 'Storage'],
  ['indexedDB', /indexedDB/, 'Storage'],
  ['document.cookie', /document\.cookie/, 'Storage'],
  ['chrome.runtime', /chrome\.runtime/, 'Extension'],
  ['chrome.tabs / scripting / other chrome.*', /chrome\.(tabs|scripting|cookies|webRequest|declarativeNetRequest|identity|history|downloads|permissions)\b/, 'Extension'],
  ['postMessage / onmessage', /postMessage\(|addEventListener\(\s*'message'/, 'Messaging'],
  ['innerHTML write', /\.innerHTML\s*=/, 'HTML sinks'],
  ['outerHTML write', /\.outerHTML\s*=/, 'HTML sinks'],
  ['insertAdjacentHTML', /insertAdjacentHTML/, 'HTML sinks'],
  ['document.write', /document\.write/, 'HTML sinks'],
  ['DOMParser / createContextualFragment', /DOMParser|createContextualFragment/, 'HTML sinks'],
  ['eval / new Function', /\beval\(|new\s+Function\(/, 'Dynamic code'],
  ['setTimeout/setInterval with string', /set(Timeout|Interval)\(\s*['"`]/, 'Dynamic code'],
  ['dynamic import()', /\bimport\(/, 'Dynamic code'],
  ['script element creation', /createElement\(\s*['"]script['"]/, 'Dynamic code'],
  ['window.open', /window\.open\(/, 'Navigation'],
  ['location write', /location\.(href\s*=|assign\(|replace\()/, 'Navigation'],
  ['element.href / .src / target assignment', /\.(href|src|target)\s*=/, 'Navigation'],
  ['.click() (synthetic)', /\.click\(\)/, 'Game interaction'],
  ['dispatchEvent', /dispatchEvent\(/, 'Game interaction'],
  ['preventDefault', /preventDefault\(/, 'Game interaction'],
  ['stopPropagation', /stopPropagation\(|stopImmediatePropagation\(/, 'Game interaction'],
  ['.focus()', /\.focus\(/, 'Game interaction'],
  ['MutationObserver', /new\s+MutationObserver/, 'Observers & timers'],
  ['IntersectionObserver / ResizeObserver', /new\s+(IntersectionObserver|ResizeObserver)/, 'Observers & timers'],
  ['setTimeout', /\bsetTimeout\(/, 'Observers & timers'],
  ['setInterval', /\bsetInterval\(/, 'Observers & timers'],
  ['requestAnimationFrame / raf()', /requestAnimationFrame|\braf\(/, 'Observers & timers'],
  ['queueMicrotask', /queueMicrotask\(/, 'Observers & timers'],
  ['matchMedia', /matchMedia\(/, 'Observers & timers'],
  ['addEventListener', /addEventListener\(/, 'Listeners'],
  ['removeEventListener', /removeEventListener\(/, 'Listeners'],
  ['window/globalThis property write', /\b(window|globalThis|self)\.[A-Za-z_$][\w$]*\s*=[^=]/, 'Globals'],
  ['console output', /console\.(log|warn|error|info|debug)\(/, 'Diagnostics'],
  ['getComputedStyle', /getComputedStyle\(/, 'Layout reads'],
  ['getBoundingClientRect / getClientRects', /getBoundingClientRect\(|getClientRects\(/, 'Layout reads'],
  ['checkVisibility', /checkVisibility/, 'Layout reads'],
  ['elementFromPoint / caret*FromPoint', /elementFromPoint|caret(Position|Range)FromPoint/, 'Layout reads'],
  ['CSS.highlights / Highlight', /CSS\.highlights|new\s+Highlight\(/, 'Rendering'],
  ['Element.animate', /\.animate\(/, 'Rendering'],
  ['document.fonts', /document\.fonts/, 'Rendering'],
  ['WeakRef / FinalizationRegistry', /new\s+WeakRef|FinalizationRegistry/, 'Memory'],
];

const hits = new Map(APIS.map(([label]) => [label, []]));
const perFile = [];
for (const rel of files) {
  const text = await readFile(path.join(ROOT, rel), 'utf8');
  const lines = text.split(/\r?\n/);
  const code = lines.map(l => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l));
  code.forEach((line, i) => {
    for (const [label, rx] of APIS) if (rx.test(line)) hits.get(label).push(`${path.basename(rel)}:${i + 1}`);
  });
  const joined = code.join('\n');
  perFile.push({
    file: rel,
    lines: lines.length - (text.endsWith('\n') ? 1 : 0),
    imports: [...text.matchAll(/^import\s+[\s\S]*?from\s+'([^']+)'/gm)].map(m => m[1]),
    emits: [...new Set([...joined.matchAll(/(?:emit|CustomEvent)\(\s*'(iw:[a-z-]+)'/g)].map(m => m[1]))],
    consumes: [...new Set([...joined.matchAll(/(?:\bon|addEventListener)\(\s*'(iw:[a-z-]+)'/g)].map(m => m[1]))],
    listeners: code.flatMap((l, i) => [...l.matchAll(/([\w.?\])]+)\.addEventListener\(\s*'([a-zA-Z:-]+)'/g)].map(m => `${m[2]} on ${m[1]} (L${i + 1})`)),
  });
}

/* Import cycles among the runtime modules (relative .js imports only). */
const graph = new Map(perFile.map(f => [f.file, f.imports
  .filter(i => i.startsWith('.') && i.endsWith('.js'))
  .map(i => path.posix.normalize(path.posix.join(path.posix.dirname(f.file), i)))]));
const cycles = [];
const visitState = new Map();
const visit = (node, stack) => {
  visitState.set(node, 1);
  stack.push(node);
  for (const next of graph.get(node) || []) {
    if (visitState.get(next) === 1) cycles.push([...stack.slice(stack.indexOf(next)), next].join(' -> '));
    else if (!visitState.get(next)) visit(next, stack);
  }
  stack.pop();
  visitState.set(node, 2);
};
for (const node of graph.keys()) if (!visitState.get(node)) visit(node, []);

for (const required of ['fetch()', 'MutationObserver', 'addEventListener']) {
  if (!hits.get(required).length) throw new Error(`js-api-census: found no ${required} - the census is broken, not clean`);
}

const md = ['# JavaScript API census', '',
  'Generated by `tools/js-api-census.mjs` from `src/content.js`, `src/page/*.js` and `src/modules/*.js`. ' +
  'Comment-only lines are skipped. **"none"** means the API does not appear anywhere in the shipped source.', ''];
let category = '';
md.push('| Category | API | Call sites |', '| --- | --- | --- |');
for (const [label, , cat] of APIS) {
  const sites = hits.get(label);
  md.push(`| ${cat === category ? '' : cat} | ${label} | ${sites.length ? sites.join(', ') : '**none**'} |`);
  category = cat;
}
md.push('', '## Import graph', '',
  `${graph.size} runtime files; **${cycles.length} import cycle(s)**${cycles.length ? ':' : '.'}`,
  ...cycles.map(c => `- ${c}`));
md.push('', '## Per-file imports, events and listeners', '',
  '| File | Lines | Local imports | `iw:*` emitted | `iw:*` consumed | DOM listeners registered |', '| --- | ---: | --- | --- | --- | --- |');
for (const f of perFile) {
  md.push(`| ${f.file} | ${f.lines} | ${f.imports.map(i => path.basename(i)).join(', ') || '—'} | ${f.emits.join(', ') || '—'} | ${f.consumes.join(', ') || '—'} | ${f.listeners.join('; ') || '—'} |`);
}
md.push('');
await writeFile(path.join(HERE, 'js-api-census.md'), md.join('\n'));
console.log(`js-api-census: ${files.length} files, ${[...hits.values()].reduce((n, s) => n + s.length, 0)} call sites -> tools/js-api-census.md`);
