/**
 * audit-sprite-windows.mjs
 *
 * Every CSS-declared pixel window onto skills_ui_atlas.webp must land exactly
 * on a cell from skills_ui_index.json, at that cell's native size.
 *
 * WHY THIS EXISTS
 * A pixel `background-size` does not merely resize a sprite — it MOVES THE
 * WINDOW onto a different region of the sheet, so a wrong number here yields
 * art that is silently the wrong picture rather than obviously broken art. And
 * a box whose size disagrees with `cell x scale` either crops the sprite or
 * leaves dead space inside the control, which is what put the header plate
 * 1.75px off-centre inside its own button (see CLAUDE.md, "The sheet is not the
 * sprite"). Neither failure is visible to any computed-style check.
 *
 * This is the ANALYTIC half of that check. The PIXEL half lives in
 * render-fixtures.mjs, which measures painted ink against box centre.
 *
 * Usage:  node build-tools/audit-sprite-windows.mjs
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(await readFile(resolve(ROOT, 'assets/skills_ui_index.json'), 'utf8'));
const cells = index.entries;

const SHEETS = ['base', 'inventory', 'skillpanel', 'tooltip-engine', 'header', 'ui-system'];
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;

const findings = [];
const lines = [];
let checked = 0;

const decl = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;!]+)`, 'i'));
  return m ? m[1].trim() : null;
};
// A :hover / :focus / [state] variant re-aims the window at another cell while
// inheriting the base rule's background-size. Key on the selector with those
// suffixes stripped so those rules get checked too — the inventory tool
// button's hover frame lives in exactly such a rule.
const baseKey = sel => sel.replace(/\s+/g, ' ').trim()
  .replace(/:{1,2}(hover|focus|focus-visible|active|disabled|before|after)\b/g, '')
  .replace(/\[data-[^\]]*state[^\]]*\]/gi, '');

// Pass 1: rules that declare a window outright.
const rules = [];
const scaleBySelector = new Map();
for (const name of SHEETS) {
  const css = (await readFile(resolve(ROOT, `src/styles/${name}.css`), 'utf8'))
    // Comments in this project carry CSS samples, braces and all, which would
    // desynchronise the block matcher below.
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // A body that cannot itself contain braces matches only LEAF rules, which is
  // exactly what we want; @media wrappers are skipped over naturally.
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const size = decl(body, 'background-size');
    const pos = decl(body, 'background-position');
    if (!pos) continue;
    const declaresAtlas = /skills_ui_atlas\.webp/.test(body);
    if (!declaresAtlas && !size) rules.push({ name, selector, body, pos, size: null, inherited: true });
    else if (declaresAtlas) rules.push({ name, selector, body, pos, size, inherited: false });
    if (declaresAtlas && size) scaleBySelector.set(baseKey(selector), size);
  }
}

for (const r of rules) {
  const sel = `${r.name}.css  ${r.selector.replace(/\s+/g, ' ').trim().slice(0, 62)}`;
  let size = r.size;
  if (r.inherited) {
    size = scaleBySelector.get(baseKey(r.selector));
    if (!size) continue; // a background-position on some non-atlas element
  }
  if (!size) {
    // Not a fault: a rule may declare only the URL and inherit the window.
    lines.push(`  ${sel}\n    declares the atlas but no pixel window here — skipped`);
    continue;
  }
  // Percentage pairs are AtlasService's contract, computed at runtime from the
  // manifest. CSS must not second-guess them (CLAUDE.md).
  if (size.includes('%')) {
    lines.push(`  ${sel}\n    percentage background-size — AtlasService's to own, skipped`);
    continue;
  }
  checked += 1;

  const [sw, sh] = size.split(/\s+/).map(parseFloat);
  const [px, py] = r.pos.split(/\s+/).map(parseFloat);
  const scaleX = sw / index.width;
  const scaleY = sh / index.height;

  if (!near(scaleX, scaleY, 0.002)) {
    findings.push(`${sel}\n    background-size ${size} is anisotropic against the ` +
      `${index.width}x${index.height} sheet (x${scaleX.toFixed(4)} vs y${scaleY.toFixed(4)}) — sprite is distorted`);
    continue;
  }

  const srcX = -px / scaleX;
  const srcY = -py / scaleY;
  const cell = cells.find(c => near(c.x, srcX) && near(c.y, srcY));
  if (!cell) {
    findings.push(`${sel}\n    window origin resolves to ${srcX.toFixed(1)},${srcY.toFixed(1)}, ` +
      `which is not a cell in skills_ui_index.json — this paints the wrong region of the sheet`);
    continue;
  }

  const boxW = parseFloat(decl(r.body, 'width'));
  const boxH = parseFloat(decl(r.body, 'height'));
  const drawnW = cell.width * scaleX;
  const drawnH = cell.height * scaleY;
  let note = `${sel}\n    ${cell.key} ${cell.width}x${cell.height} @${scaleX.toFixed(4)} ` +
    `-> ${drawnW.toFixed(2)}x${drawnH.toFixed(2)}${r.inherited ? '  (window inherited from the base rule)' : ''}`;

  if (Number.isFinite(boxW) && Number.isFinite(boxH)) {
    const dw = drawnW - boxW;
    const dh = drawnH - boxH;
    if (Math.abs(dw) > 0.75 || Math.abs(dh) > 0.75) {
      findings.push(`${sel}\n    ${cell.key} draws ${drawnW.toFixed(2)}x${drawnH.toFixed(2)} into a ` +
        `${boxW}x${boxH} box — ${dw > 0 ? 'crops' : 'leaves dead space'} of ` +
        `${Math.abs(dw).toFixed(2)}x${Math.abs(dh).toFixed(2)}px`);
      continue;
    }
    note += `  box ${boxW}x${boxH}  ok (${dw >= 0 ? '+' : ''}${dw.toFixed(2)}, ${dh >= 0 ? '+' : ''}${dh.toFixed(2)})`;
  } else {
    note += '  box not declared in this rule';
  }
  lines.push(`  ${note}`);
}

console.log(lines.join('\n'));
console.log(`\n${checked} pixel sprite window(s) checked against ${cells.length} atlas cells`);

// "A check reporting zero is broken, not passing" (CLAUDE.md). The sheets above
// are known to declare pixel windows; finding none means the parser broke.
if (checked === 0) {
  console.error('\nFAIL — parsed no pixel sprite windows at all. The matcher is broken, not the CSS.');
  process.exit(1);
}
if (findings.length) {
  console.error(`\n${findings.length} problem(s):\n` + findings.map(f => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('PASS — every pixel window lands on a named cell and fills its box');
