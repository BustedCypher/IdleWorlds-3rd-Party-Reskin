#!/usr/bin/env node
/* Imports the V2 skill card's action-button icons from Curtis's Illustrator
 * artwork (2026-09) and writes one SVG per discipline into
 * assets/skills-ui/action-icons/.
 *
 *   node build-tools/import-action-icons.mjs "<path to Vector Action button Icons.eps>"
 *
 * The file is a DOS-binary EPS: a 32-byte header, the PostScript, then a
 * TIFF preview. The preview is a 2071px palette image that clips the last icon
 * at the artboard edge, so it is NOT used. The PostScript page draws each icon
 * as flat filled paths with Illustrator's own short operators - `mo` moveto,
 * `li` lineto, `cv` curveto, `cp` closepath, `f` fill - in a y-DOWN artboard
 * space, which maps to SVG path data one-to-one. Nothing is traced or
 * re-drawn.
 *
 * The artboard holds ten icons in one row, left to right in the renderer's
 * own SKILL_META order. Every icon is written into the SAME square viewBox,
 * sized to the largest icon and centred on each one, so the relative sizes
 * Curtis drew them at survive: the anvil stays wider and shorter than the
 * sword instead of each being blown up to fill its own box.
 *
 * It fails loudly rather than guessing: anything other than exactly ten icon
 * clusters, or a paint operator other than a single flat fill, stops the run.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/* Left to right on the artboard. `gathering` is the renderer's key for
   Herbalism (the leaf). */
export const ACTION_ICON_SKILLS = ['combat', 'mining', 'smithing', 'gathering', 'alchemy',
  'jewelcrafting', 'spellcrafting', 'tailoring', 'woodcutting', 'construction'];

const OUT = resolve(import.meta.dirname, '../assets/skills-ui/action-icons');
const PAD = 0.04;

function postScriptOf(buf) {
  if (buf.readUInt32BE(0) === 0xC5D0D3C6) {
    const off = buf.readUInt32LE(4), len = buf.readUInt32LE(8);
    return buf.subarray(off, off + len).toString('latin1');
  }
  return buf.toString('latin1');
}

function pageOf(ps) {
  const start = ps.indexOf('%%Page:');
  const end = ps.indexOf('%%PageTrailer');
  if (start < 0 || end < 0) throw new Error('no %%Page ... %%PageTrailer section');
  /* Binary image data can contain anything, including bytes that tokenise as
     operators; drop every embedded binary block before reading paths. */
  return ps.slice(start, end).replace(/%%BeginBinary[\s\S]*?%%EndBinary/g, ' ');
}

function fillsOf(page) {
  const fills = [];
  let stack = [], path = [];
  const take = n => { const v = stack.slice(-n); stack = []; return v; };
  for (const tok of page.split(/\s+/)) {
    if (/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(tok)) { stack.push(Number(tok)); continue; }
    switch (tok) {
      case 'mo': path.push(['M', take(2)]); break;
      case 'li': path.push(['L', take(2)]); break;
      case 'cv': path.push(['C', take(6)]); break;
      case 'cp': path.push(['Z', []]); stack = []; break;
      case 'f': if (path.length) fills.push(path); path = []; stack = []; break;
      case 'np': path = []; stack = []; break;
      case 'f*': case 's': case 'S': case 'B': case 'b':
        throw new Error(`unsupported paint operator "${tok}" - the importer only knows flat fills`);
      default: stack = [];
    }
  }
  return fills;
}

const boxOf = path => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [, a] of path) for (let i = 0; i < a.length; i += 2) {
    x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]);
    y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]);
  }
  return { x0, y0, x1, y1 };
};

function clusters(fills, gap = 40) {
  const items = fills.map(p => ({ path: p, box: boxOf(p) })).sort((a, b) => a.box.x0 - b.box.x0);
  const groups = [];
  for (const it of items) {
    const g = groups.find(g => it.box.x0 <= g.box.x1 + gap && it.box.x1 >= g.box.x0 - gap);
    if (g) {
      g.paths.push(it.path);
      g.box = { x0: Math.min(g.box.x0, it.box.x0), y0: Math.min(g.box.y0, it.box.y0),
                x1: Math.max(g.box.x1, it.box.x1), y1: Math.max(g.box.y1, it.box.y1) };
    } else groups.push({ paths: [it.path], box: { ...it.box } });
  }
  return groups.sort((a, b) => a.box.x0 - b.box.x0);
}

const num = v => { const r = Math.round(v * 10) / 10; return Object.is(r, -0) ? '0' : String(r); };

function svgOf(group, side) {
  const pad = side * PAD, full = side + 2 * pad;
  const cx = (group.box.x0 + group.box.x1) / 2, cy = (group.box.y0 + group.box.y1) / 2;
  const ox = cx - full / 2, oy = cy - full / 2;
  const d = group.paths.map(path => path.map(([op, a]) => {
    const pts = [];
    for (let i = 0; i < a.length; i += 2) pts.push(`${num(a[i] - ox)} ${num(a[i + 1] - oy)}`);
    return op + pts.join(' ');
  }).join('')).map(p => `<path d="${p}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(full)} ${num(full)}" fill="#fff">${d}</svg>\n`;
}

if (process.argv[1]?.endsWith('import-action-icons.mjs')) {
  const src = process.argv[2];
  if (!src) { console.error('usage: node build-tools/import-action-icons.mjs <icons.eps>'); process.exit(2); }
  const groups = clusters(fillsOf(pageOf(postScriptOf(readFileSync(src)))));
  if (groups.length !== ACTION_ICON_SKILLS.length) {
    console.error(`expected ${ACTION_ICON_SKILLS.length} icons, found ${groups.length}`);
    process.exit(1);
  }
  const side = Math.max(...groups.map(g => Math.max(g.box.x1 - g.box.x0, g.box.y1 - g.box.y0)));
  mkdirSync(OUT, { recursive: true });
  groups.forEach((g, i) => {
    const file = resolve(OUT, `${ACTION_ICON_SKILLS[i]}.svg`);
    const svg = svgOf(g, side);
    writeFileSync(file, svg);
    console.log(`${ACTION_ICON_SKILLS[i].padEnd(14)} ${g.paths.length} paths  ${Math.round(g.box.x1 - g.box.x0)}x${Math.round(g.box.y1 - g.box.y0)}  ${svg.length} bytes`);
  });
  writeFileSync(resolve(OUT, 'index.json'), JSON.stringify({ skills: ACTION_ICON_SKILLS }, null, 2) + '\n');
}
