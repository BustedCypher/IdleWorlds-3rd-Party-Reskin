/**
 * Render handoff/*.spec.js to PDF.
 *
 * The PDFs are DERIVED from the spec files, never written alongside them, so
 * the two cannot drift. Editing a spec and re-running this is the only way to
 * change a PDF.
 *
 * Playwright is already a dev dependency and its Chromium is already
 * downloaded for the test suite, so this adds nothing to install.
 *
 *   npm run handoff
 */
import { chromium } from 'playwright';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIR = resolve(ROOT, 'handoff');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── Parse a spec file into blocks ─────────────────────────────────────────
 *
 * The spec files use exactly three comment shapes, so this is a small
 * deterministic split rather than a real parser:
 *   ═ rules  -> the title block
 *   ─ rules with a § heading -> a section heading
 *   anything else in a block comment -> prose
 * Everything outside a block comment is code.
 */
function parse(source) {
  const blocks = [];
  const re = /\/\*([\s\S]*?)\*\//g;
  let last = 0;
  let match;
  while ((match = re.exec(source))) {
    const code = source.slice(last, match.index);
    if (code.trim()) blocks.push({ kind: 'code', text: code.replace(/^\n+|\n+$/g, '') });
    blocks.push({ kind: 'comment', text: match[1] });
    last = match.index + match[0].length;
  }
  const tail = source.slice(last);
  if (tail.trim()) blocks.push({ kind: 'code', text: tail.replace(/^\n+|\n+$/g, '') });
  return blocks;
}

/** Strip the leading ` * ` gutter that block comments carry. */
function undent(text) {
  return text.split('\n')
    .map(line => line.replace(/^\s*\*\s?/, '').replace(/^\s{0,3}/, ''))
    .join('\n');
}

const isRule = line => /^[═─]{5,}|^\s*[═─]{5,}/.test(line) || /[═─]{10,}/.test(line);

/**
 * A paragraph is preformatted if any of its lines is indented four or more
 * spaces, or uses a run of three or more spaces as a column separator. That
 * covers every table, code sample and measurement list in the specs without
 * needing them to be marked up.
 */
const isPre = para => para.split('\n').some(l => /^\s{4,}\S/.test(l) || /\S {3,}\S/.test(l));

function renderProse(text) {
  const lines = undent(text).split('\n').filter(l => !isRule(l));
  // Drop a leading "§N TITLE" — the caller has already used it as a heading.
  if (/^\s*§\d+\s/.test(lines[0] || '')) lines.shift();
  const paras = lines.join('\n').split(/\n\s*\n/).map(p => p.replace(/^\n+|\n+$/g, '')).filter(Boolean);
  return paras.map(para => {
    if (isPre(para)) return `<pre class="sample">${esc(para)}</pre>`;
    // A short ALL-CAPS line is a lead-in, not a sentence — whether it stands
    // alone or heads the paragraph it introduces.
    const lines2 = para.split('\n');
    const LEAD = /^[A-Z][A-Z0-9 ,'\u2019-]{3,60}$/;
    if (LEAD.test(lines2[0].trim())) {
      const lead = `<p class="lead">${esc(lines2[0].trim())}</p>`;
      const rest = lines2.slice(1).join('\n').trim();
      return rest ? lead + '\n' + renderParagraph(rest) : lead;
    }
    return renderParagraph(para);
  }).join('\n');
}

function renderParagraph(para) {
  {
    const html = esc(para.replace(/\n\s*/g, ' ').trim())
      // ▓ KEEP / ▓ DROP are the whole point of the document: they tell a
      // reader which paragraphs they may skip.
      .replace(/▓\s*(KEEP|DROP)/g, (_, w) => `<b class="tag ${w.toLowerCase()}">${w}</b>`)
      // Inline `code`.
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    return `<p>${html}</p>`;
  }
}

function toHtml(name, source) {
  const blocks = parse(source);
  const out = [];
  let title = name;
  let subtitle = '';

  blocks.forEach((block, i) => {
    if (block.kind === 'code') {
      out.push(`<pre class="code">${esc(block.text)}</pre>`);
      return;
    }
    const body = undent(block.text);
    // The first ═-ruled block is the cover.
    if (i === 0 && body.includes('═')) {
      // Keep the blank lines: they are what separates the cover's paragraphs,
      // and filtering them out first collapsed the whole intro into one block
      // and rendered it as preformatted text.
      const kept = body.split('\n').filter(l => !isRule(l));
      const meaningful = kept.filter(l => l.trim());
      title = meaningful[0]?.replace(/\s*—.*$/, '').trim() || name;
      subtitle = meaningful[0]?.includes('—') ? meaningful[0].split('—').slice(1).join('—').trim() : '';
      out.push(`<header class="cover"><h1>${esc(title)}</h1>`
        + (subtitle ? `<p class="sub">${esc(subtitle)}</p>` : '')
        + `<p class="origin">${esc(meaningful[1] || '')}</p></header>`);
      out.push(renderProse(kept.slice(kept.indexOf(meaningful[1]) + 1).join('\n')));
      return;
    }
    const heading = body.match(/§(\d+)\s+(.+)/);
    if (heading && body.includes('─')) {
      out.push(`<h2><span class="num">§${heading[1]}</span> ${esc(heading[2].trim())}</h2>`);
      return;
    }
    out.push(renderProse(body));
  });

  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5pt/1.55 Georgia, 'Times New Roman', serif; color: #16181d; }
  .cover { margin: 0 0 26px; padding: 0 0 18px; border-bottom: 2px solid #16181d; }
  h1 { margin: 0; font-size: 25pt; line-height: 1.15; letter-spacing: -.01em; }
  .sub { margin: 6px 0 0; font-size: 12pt; color: #4a4f5a; }
  .origin { margin: 10px 0 0; font: 8.5pt/1.4 ui-monospace, 'SFMono-Regular', Consolas, monospace; color: #6b7280; }
  h2 { margin: 26px 0 8px; padding-top: 10px; border-top: 1px solid #d6d9e0;
       font-size: 13pt; letter-spacing: .01em; break-after: avoid; break-inside: avoid; }
  h2 .num { color: #9aa1ad; margin-right: 8px; font-variant-numeric: tabular-nums; }
  p { margin: 0 0 9px; orphans: 2; widows: 2; }
  code { font: 9pt ui-monospace, 'SFMono-Regular', Consolas, monospace;
         background: #f1f2f5; padding: .5px 3px; border-radius: 2px; }
  pre { margin: 0 0 11px; padding: 9px 11px; border-radius: 3px;
        font: 8.6pt/1.45 ui-monospace, 'SFMono-Regular', Consolas, monospace;
        white-space: pre-wrap; break-inside: avoid; }
  pre.sample { background: #f6f7f9; border-left: 3px solid #c3c8d2; color: #1f2430; }
  pre.code   { background: #fbfaf6; border-left: 3px solid #b9a26a; color: #1f2430; }
  .tag { font-family: ui-monospace, Consolas, monospace; font-size: 8.5pt;
         padding: 1px 5px; border-radius: 3px; letter-spacing: .04em; }
  .tag.keep { background: #1f6f43; color: #fff; }
  .tag.drop { background: #8a2f2f; color: #fff; }
  p.lead { margin: 15px 0 5px; font: 600 8.6pt/1.4 ui-monospace, Consolas, monospace;
           letter-spacing: .09em; color: #5b6270; break-after: avoid; }
</style>
${out.join('\n')}`;
}

const files = (await readdir(DIR)).filter(f => f.endsWith('.spec.js')).sort();
if (!files.length) {
  console.error('no handoff/*.spec.js files found');
  process.exit(1);
}

let executablePath;
try { executablePath = process.env.IW_CHROMIUM_PATH || chromium.executablePath(); }
catch { executablePath = process.env.IW_CHROMIUM_PATH || undefined; }

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  ignoreDefaultArgs: ['--headless=old'],
  timeout: 120000,
});

for (const file of files) {
  const source = await readFile(resolve(DIR, file), 'utf8');
  const name = basename(file, '.spec.js');
  const html = toHtml(name, source);
  // Written beside the PDF so the formatting can be inspected without a
  // reader, and so a diff shows what changed.
  await writeFile(resolve(DIR, `${name}.html`), html);

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({
    path: resolve(DIR, `${name}.pdf`),
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font:8pt Georgia,serif;color:#8b919c;'
      + 'padding:0 16mm;display:flex;justify-content:space-between;">'
      + `<span>${esc(name)}</span>`
      + '<span class="pageNumber"></span></div>',
    margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
  });
  await page.close();
  console.log(`wrote handoff/${name}.pdf`);
}

await browser.close();
