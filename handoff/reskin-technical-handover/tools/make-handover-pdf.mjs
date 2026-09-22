#!/usr/bin/env node
/**
 * make-handover-pdf.mjs — print the handover package to PDF.
 *
 *   node handoff/reskin-technical-handover/tools/make-handover-pdf.mjs
 *   node handoff/reskin-technical-handover/tools/make-handover-pdf.mjs --only=main
 *
 * Writes two volumes beside the Markdown, because they read very differently:
 *
 *   IdleWorlds-Fantasy-Skin-Handover.pdf            portrait  — README, chapters 1-7, Appendix D
 *   IdleWorlds-Fantasy-Skin-Handover-Appendices.pdf landscape — Appendices A, B, C and the tool reports
 *
 * The PDFs are DERIVED from the Markdown, exactly like the appendices are
 * derived from the source: regenerate rather than edit. Playwright's Chromium
 * is already a dev dependency (it runs the browser test suites), so this adds
 * nothing to install. Markdown rendering uses marked and the diagrams use
 * mermaid, both pinned and loaded from cdnjs at build time — the finished PDF
 * carries no external dependency.
 *
 * Requires network access for those two libraries. Everything else is local.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const ROOT = path.resolve(PKG, '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright');

const MARKED = 'https://cdnjs.cloudflare.com/ajax/libs/marked/18.0.13/lib/marked.umd.min.js';
const MERMAID = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.15.0/mermaid.min.js';

const only = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || '';
/* --html-only keeps the intermediate print HTML instead of printing it, so the
   formatting can be inspected in a browser (same idea as the older
   build-tools/make-handoff-pdfs.mjs writing its HTML beside the PDF). */
const htmlOnly = process.argv.includes('--html-only');
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const today = new Date().toISOString().slice(0, 10);

const read = async rel => (await readFile(path.join(PKG, rel), 'utf8')).replace(/\r\n/g, '\n');
const firstH1 = md => ((md.match(/^#\s+(.+)$/m) || [])[1] || '').replace(/`/g, '').trim();

const SHEETS = ['base', 'tooltip-engine', 'inventory', 'skillpanel', 'skillcard-v2', 'skillcard-v2-runtime-safe',
  'card-button-atlas', 'card-buttons', 'header', 'overlay', 'ui-system', 'compact-buttons', 'village-scene',
  'collapsible', 'header.claude'];

const VOLUMES = [
  {
    key: 'main',
    file: 'IdleWorlds-Fantasy-Skin-Handover.pdf',
    landscape: false,
    title: 'IdleWorlds Fantasy Skin',
    subtitle: 'Technical handover, integration guide, maintenance manual and security review',
    volumeLine: 'Volume 1 of 2 — package guide, chapters 1–7, Appendix D',
    docs: [
      ['readme', 'README.md'],
      ['ch01', '01-project-overview.md'],
      ['ch02', '02-feature-inventory.md'],
      ['ch03', '03-css-architecture.md'],
      ['ch04', '04-constraints-and-workarounds.md'],
      ['ch05', '05-javascript-safety-review.md'],
      ['ch06', '06-integration-and-maintenance.md'],
      ['ch07', '07-testing-and-verification.md'],
      ['appD', 'appendix-d-dom-contract.md'],
    ],
  },
  {
    key: 'appendices',
    file: 'IdleWorlds-Fantasy-Skin-Handover-Appendices.pdf',
    landscape: true,
    title: 'Generated reference',
    subtitle: 'Appendices A, B and C, and the tool reports, for the IdleWorlds Fantasy Skin handover',
    volumeLine: 'Volume 2 of 2 — every tracked file, every CSS rule, every dependency',
    docs: [
      ['refA', 'appendix-a-file-inventory.md'],
      ['refB', 'appendix-b-css-rule-index/README.md'],
      ...SHEETS.map(s => [`refB-${s.replace('.', '-')}`, `appendix-b-css-rule-index/${s}.css.md`]),
      ['refC', 'appendix-c-css-dependency-surface.md'],
      ['toolSuperseded', 'tools/css-superseded.md'],
      ['toolHooks', 'tools/hook-census.md'],
      ['toolApi', 'tools/js-api-census.md'],
    ],
  },
];

/* Runs inside the page: render every document, wire ids and links, render the
   diagrams, then raise a flag for Playwright. */
function renderInPage(payload) {
  const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const slugify = t => String(t).trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
  const idFor = (docId, slug) => docId + '--' + slug;
  const inVolume = new Map(payload.docs.map(d => [d.path, d]));

  marked.use({
    gfm: true,
    renderer: {
      code(token) {
        if ((token.lang || '').trim() === 'mermaid') return '<pre class="mermaid">' + escapeHtml(token.text) + '</pre>\n';
        return false;
      },
    },
  });

  const resolvePath = (baseDir, rel) => {
    const parts = (baseDir ? baseDir.split('/') : []).concat(rel.split('/'));
    const out = [];
    for (const p of parts) {
      if (!p || p === '.') continue;
      if (p === '..') { if (out.length) out.pop(); else out.push('..'); }
      else out.push(p);
    }
    return out.join('/');
  };

  const SEVERITY = { high: 'high', medium: 'medium', low: 'low', info: 'info', 'low–med': 'medium', 'low-med': 'medium' };
  const EVIDENCE = /\[(Source|Generated|Test run|Project record|Assumption|Verify|Platform)(?=[\]:])/g;
  const EV_CLASS = { 'Source': 'source', 'Generated': 'generated', 'Test run': 'test', 'Project record': 'record', 'Assumption': 'assumption', 'Verify': 'verify', 'Platform': 'platform' };

  const body = document.getElementById('body');
  const tocList = document.getElementById('toc-list');

  payload.docs.forEach(doc => {
    const section = document.createElement('section');
    section.className = 'doc-section';
    section.id = doc.id;
    const chip = document.createElement('p');
    chip.className = 'doc-file';
    chip.textContent = doc.path;
    section.appendChild(chip);
    const holder = document.createElement('div');
    holder.innerHTML = marked.parse(doc.md);
    section.appendChild(holder);
    body.appendChild(section);

    const baseDir = doc.path.includes('/') ? doc.path.slice(0, doc.path.lastIndexOf('/')) : '';
    const seen = new Map();
    holder.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
      const slug = slugify(h.textContent);
      const n = seen.get(slug) || 0;
      seen.set(slug, n + 1);
      h.id = idFor(doc.id, n ? slug + '-' + n : slug);
    });
    holder.querySelectorAll('a[id]').forEach(a => { a.id = idFor(doc.id, a.id); });
    holder.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (/^(https?:|mailto:)/i.test(href)) return;
      if (href.startsWith('#')) { a.setAttribute('href', '#' + idFor(doc.id, href.slice(1))); return; }
      const hashAt = href.indexOf('#');
      const p = hashAt >= 0 ? href.slice(0, hashAt) : href;
      const anchor = hashAt >= 0 ? href.slice(hashAt + 1) : '';
      const target = inVolume.get(resolvePath(baseDir, decodeURI(p)));
      if (target) { a.setAttribute('href', '#' + (anchor ? idFor(target.id, anchor) : target.id)); return; }
      const span = document.createElement('span');
      span.className = 'ext-ref';
      span.title = resolvePath(baseDir, decodeURI(p));
      while (a.firstChild) span.appendChild(a.firstChild);
      a.replaceWith(span);
    });
    holder.querySelectorAll('table').forEach(t => {
      const heads = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent.trim().toLowerCase());
      if (heads.length >= 7) t.classList.add('dense');
      const sevCol = heads.findIndex(h => h === 'sev.' || h === 'severity');
      if (sevCol < 0) return;
      t.querySelectorAll('tbody tr').forEach(tr => {
        const cell = tr.children[sevCol];
        if (!cell) return;
        const key = cell.textContent.trim().toLowerCase();
        if (!SEVERITY[key]) return;
        const chipEl = document.createElement('span');
        chipEl.className = 'sev sev-' + SEVERITY[key];
        chipEl.textContent = cell.textContent.trim();
        cell.textContent = '';
        cell.appendChild(chipEl);
      });
    });
    const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.includes('[')) return NodeFilter.FILTER_REJECT;
        return node.parentElement && node.parentElement.closest('code,pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const text = node.nodeValue;
      EVIDENCE.lastIndex = 0;
      if (!EVIDENCE.test(text)) return;
      EVIDENCE.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = EVIDENCE.exec(text))) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index + 1)));
        const span = document.createElement('span');
        span.className = 'ev ev-' + EV_CLASS[m[1]];
        span.textContent = m[1];
        frag.appendChild(span);
        last = m.index + 1 + m[1].length;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.replaceWith(frag);
    });

    // Contents entry: the document, then its top-level sections.
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + (holder.querySelector('h1') ? holder.querySelector('h1').id : doc.id);
    a.textContent = doc.title;
    li.appendChild(a);
    const subs = holder.querySelectorAll('h2');
    if (subs.length) {
      const ol = document.createElement('ol');
      subs.forEach(h2 => {
        const sli = document.createElement('li');
        const sa = document.createElement('a');
        sa.href = '#' + h2.id;
        sa.textContent = h2.textContent;
        sli.appendChild(sa);
        ol.appendChild(sli);
      });
      li.appendChild(ol);
    }
    tocList.appendChild(li);
  });

  const diagrams = document.querySelectorAll('pre.mermaid');
  const done = () => {
    /* A diagram wider than it is tall is unreadable squeezed into a portrait
       column, so it gets a landscape page of its own (CSS named page). */
    document.querySelectorAll('pre.mermaid svg').forEach(svg => {
      const box = svg.viewBox && svg.viewBox.baseVal;
      const ratio = box && box.height ? box.width / box.height : 1;
      if (ratio > 1.35) svg.closest('pre.mermaid').classList.add('wide');
    });
    window.__printReady = true;
  };
  if (!diagrams.length || typeof mermaid === 'undefined') { done(); return; }
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', fontFamily: 'Barlow, sans-serif', flowchart: { useMaxWidth: true }, sequence: { useMaxWidth: true } });
  mermaid.run({ nodes: diagrams }).then(done).catch(err => { console.error('mermaid', err); done(); });
}

const CSS = `
@page { size: A4 %ORIENT%; margin: 15mm 13mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #17150F; background: #fff;
  font: 400 9.6pt/1.5 "Barlow", "Segoe UI", system-ui, sans-serif; }
a { color: #6F5115; text-decoration: none; }
code, pre { font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; }
code { font-size: .86em; background: #F3F0E8; padding: .4pt 2pt; border-radius: 2pt; word-break: break-word; }
pre { font-size: 7.8pt; line-height: 1.45; background: #F6F3EB; border: .4pt solid #DFD8C7;
  border-left: 2pt solid #8A6A2C; border-radius: 2pt; padding: 6pt 8pt; margin: 0 0 8pt; white-space: pre-wrap; word-break: break-word; }
pre code { background: none; padding: 0; font-size: inherit; }
pre.mermaid { background: #FBF9F4; border-left-color: #C9B27E; text-align: center; break-inside: avoid; }
pre.mermaid svg { max-width: 100%; height: auto; }
@page diagram { size: A4 landscape; margin: 12mm; }
pre.mermaid.wide { page: diagram; break-before: page; break-after: page; padding: 10pt; }
pre.mermaid.wide svg { width: 100%; }

/* Cover */
.cover { height: calc(100vh - 31mm); display: flex; flex-direction: column; justify-content: center; break-after: page; }
.cover .rule { width: 46mm; height: 2.4pt; background: #8A6A2C; margin-bottom: 9mm; }
.cover h1 { font: 700 30pt/1.1 "Cinzel", Georgia, serif; margin: 0 0 5mm; letter-spacing: .01em; }
.cover .sub { font: 400 13pt/1.35 "Barlow", sans-serif; color: #4A4437; margin: 0 0 8mm; max-width: 150mm; }
.cover .vol { font: 600 9.5pt/1.4 "Barlow", sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #6F5115; margin: 0 0 3mm; }
.cover dl { display: grid; grid-template-columns: 34mm 1fr; gap: 2.2mm 6mm; margin: 6mm 0 0; font-size: 9pt; max-width: 150mm; }
.cover dt { font-weight: 600; color: #5C5646; }
.cover dd { margin: 0; }
.cover .note { margin: 9mm 0 0; padding: 4mm 5mm; border-left: 2pt solid #8A6A2C; background: #FAF7EF; font-size: 9pt; max-width: 150mm; }

/* Contents */
.toc { break-after: page; }
.toc h2 { font: 700 15pt/1.2 "Cinzel", Georgia, serif; margin: 0 0 5mm; border: 0; padding: 0; }
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc > ol > li { margin: 0 0 3.4mm; break-inside: avoid; }
.toc > ol > li > a { font: 600 10.5pt "Barlow", sans-serif; color: #17150F; }
.toc ol ol { margin: 1.2mm 0 0 6mm; column-count: 2; column-gap: 8mm; }
.toc ol ol li { margin: 0 0 .8mm; font-size: 8.4pt; break-inside: avoid; }
.toc ol ol a { color: #4A4437; }

/* Documents */
.doc-section { break-before: page; }
.doc-section:first-of-type { break-before: auto; }
.doc-file { font: 500 7.6pt "JetBrains Mono", monospace; color: #7A7362; margin: 0 0 3mm; }
h1 { font: 700 20pt/1.15 "Cinzel", Georgia, serif; margin: 0 0 4mm; letter-spacing: .01em; break-after: avoid; }
h1::after { content: ""; display: block; width: 26mm; height: 1.6pt; background: #8A6A2C; margin-top: 3mm; }
h2 { font: 600 13.5pt/1.25 "Cinzel", Georgia, serif; margin: 7mm 0 2.6mm; padding-top: 2mm;
  border-top: .5pt solid #DED7C6; break-after: avoid; break-inside: avoid; }
h3 { font: 600 11pt/1.3 "Barlow", sans-serif; margin: 5mm 0 2mm; break-after: avoid; }
h4 { font: 700 8.2pt/1.3 "Barlow", sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #4A4437; margin: 4mm 0 1.6mm; break-after: avoid; }
h5 { font: 600 9pt "Barlow", sans-serif; margin: 3mm 0 1.4mm; break-after: avoid; }
p { margin: 0 0 6pt; orphans: 2; widows: 2; }
ul, ol { margin: 0 0 6pt; padding-left: 5mm; }
li { margin: 0 0 1.6pt; }
blockquote { margin: 0 0 8pt; padding: 4pt 7pt; background: #FAF7EF; border-left: 2pt solid #8A6A2C; break-inside: avoid; }
blockquote > :last-child { margin-bottom: 0; }
hr { border: 0; border-top: .5pt solid #DED7C6; margin: 6mm 0; }
strong { font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin: 0 0 8pt; font-size: 8.2pt; line-height: 1.38; }
table.dense { font-size: 7.4pt; }
thead { display: table-header-group; }
/* overflow-wrap, not word-break: the latter collapses a column's min-content
   width to one character, which starved narrow columns and broke short labels
   such as "N1" across two lines. */
th, td { border: .4pt solid #DED7C6; padding: 2.4pt 3.4pt; text-align: left; vertical-align: top; overflow-wrap: break-word; }
th { background: #F1ECE0; font-weight: 600; }
tr { break-inside: avoid; }
td ul, td ol { margin: 0; padding-left: 3.6mm; }
td p { margin: 0; }
.sev { font: 700 7pt "Barlow", sans-serif; letter-spacing: .05em; text-transform: uppercase; padding: 1pt 3pt; border: .5pt solid currentColor; border-radius: 2pt; white-space: nowrap; }
.sev-high { color: #A63D2F; } .sev-medium { color: #8A5A0E; } .sev-low { color: #36617A; } .sev-info { color: #6A6459; }
.ev { font-weight: 600; }
.ev-source, .ev-test, .ev-platform { color: #2C6448; }
.ev-generated { color: #3F5480; }
.ev-record { color: #6B5A2E; }
.ev-verify, .ev-assumption { color: #8C4A10; }
.ext-ref { border-bottom: .4pt dotted #C3BBA6; }
img { max-width: 100%; }
`;

function pageHtml(volume, docs) {
  const payload = { docs: docs.map(d => ({ id: d.id, path: d.path, title: d.title, md: d.md })) };
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + `<title>${volume.title}</title>`
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Cinzel:wght@600;700&family=JetBrains+Mono:wght@400;600&display=swap">'
    + `<style>${CSS.replace('%ORIENT%', volume.landscape ? 'landscape' : 'portrait')}</style></head><body>`
    + '<section class="cover"><div class="rule"></div>'
    + `<p class="vol">${volume.volumeLine}</p>`
    + `<h1>${volume.title}</h1>`
    + `<p class="sub">${volume.subtitle}</p>`
    + '<dl>'
    + '<dt>Extension</dt><dd>idleworlds-fantasy-skin v1.6.0 (Chrome MV3 content script)</dd>'
    + `<dt>Source commit</dt><dd>${commit} (branch main)</dd>`
    + `<dt>Prepared</dt><dd>17–18 September 2026 · PDF generated ${today}</dd>`
    + `<dt>Documents</dt><dd>${docs.length} — ${docs.map(d => d.path).slice(0, 3).join(', ')}${docs.length > 3 ? ', …' : ''}</dd>`
    + '<dt>Source of truth</dt><dd>handoff/reskin-technical-handover/*.md in the repository</dd>'
    + '</dl>'
    + '<p class="note">Nothing in this package was verified against the live game. Statements that need a check on the running application, its server or with the IdleWorlds team are marked <span class="ev ev-verify">Verify</span> or <span class="ev ev-assumption">Assumption</span>.</p>'
    + '</section>'
    + '<section class="toc"><h2>Contents</h2><ol id="toc-list"></ol></section>'
    + '<div id="body"></div>'
    + `<script src="${MARKED}"></script>`
    + (volume.key === 'main' ? `<script src="${MERMAID}"></script>` : '')
    + '<script>(' + renderInPage.toString() + ')(' + JSON.stringify(payload).replace(/</g, '\\u003c') + ');</script>'
    + '</body></html>';
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 120000 });
for (const volume of VOLUMES) {
  if (only && only !== volume.key) continue;
  const docs = [];
  for (const [id, rel] of volume.docs) {
    const md = await read(rel);
    docs.push({ id, path: rel, title: firstH1(md) || rel, md });
  }
  const html = pageHtml(volume, docs);
  const tmp = path.join(tmpdir(), `iw-handover-${volume.key}.html`);
  await writeFile(tmp, html);
  if (htmlOnly) { console.log(`wrote ${tmp}`); continue; }

  const page = await browser.newPage();
  page.on('pageerror', err => console.warn(`  page error: ${err.message}`));
  await page.goto('file://' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForFunction('window.__printReady === true', null, { timeout: 300000 });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });

  const options = {
    path: path.join(PKG, volume.file),
    format: 'A4',
    landscape: volume.landscape,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font:7pt Barlow,sans-serif;color:#8A8372;padding:0 13mm;'
      + 'display:flex;justify-content:space-between;">'
      + `<span>IdleWorlds Fantasy Skin — ${volume.key === 'main' ? 'technical handover' : 'generated reference'} · ${commit}</span>`
      + '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '15mm', bottom: '16mm', left: '13mm', right: '13mm' },
    timeout: 600000,
  };
  try {
    await page.pdf({ ...options, tagged: true, outline: true });
  } catch (err) {
    console.warn(`  outline/tagged PDF unsupported (${err.message.split('\n')[0]}); writing a plain PDF`);
    await page.pdf(options);
  }
  await page.close();
  await unlink(tmp).catch(() => {});
  const { size } = await stat(options.path);
  console.log(`wrote ${volume.file} (${(size / 1e6).toFixed(1)} MB)`);
}
await browser.close();
