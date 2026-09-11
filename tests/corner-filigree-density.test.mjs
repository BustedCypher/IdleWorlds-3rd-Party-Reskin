/**
 * The themed corner sheet is physically 2x the fallback sheet. A pixel-valued
 * border-image slice therefore selects different source regions at each
 * density and stretches ornament pixels along the panel edges. Percentage
 * slices must divide both sheets into the same four logical quadrants.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const styles = await Promise.all([
  'src/styles/ui-system.css',
  'src/styles/header.css',
  'src/styles/tooltip-engine.css',
  'src/styles/overlay.css',
  'src/styles/inventory.css',
  'src/styles/skillpanel.css',
].map(path => readFile(resolve(ROOT, path), 'utf8')));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<!doctype html>
  <style>:root {
    --iw-corner-filigree: url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==");
    --iw-zone-separator: url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==");
  }</style>
  <style>${styles.join('\n')}</style>
  <div id="section" data-iw-ui="section-frame"><span>content</span></div>
  <header id="header" data-iw-header="root"></header>
  <div id="tooltip" class="iw-tip"></div>
  <div id="overlay" data-iw-overlay="panel"></div>
  <div class="fs-inv-rule"></div>
  <article id="skill" class="compact-panel fs-skill-panel" data-iw-skill-layout="three-zone" data-iw-skills-ui-ready="1">
    <div data-iw-skill-zone="identity"><span class="fs-skill-medallion-art"></span></div>
  </article>
  <article id="quest" class="compact-panel fs-quest-panel" data-iw-skills-ui-ready="1">
    <span class="fs-quest-sigil"></span>
  </article>`);

const cases = [
  ['section frame', '#section', '::after'],
  ['header frame', '#header', '::after'],
  ['tooltip frame', '#tooltip', '::after'],
  ['overlay frame', '#overlay', null],
];

let failures = 0;
for (const [label, selector, pseudo] of cases) {
  const slice = await page.$eval(selector, (element, pseudoElement) =>
    getComputedStyle(element, pseudoElement).borderImageSlice, pseudo);
  const ok = slice === '50%';
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label} divides the corner sheet by proportion${ok ? '' : ` — ${slice}`}`);
  if (!ok) failures += 1;
}

const skillRingDisplay = await page.$eval('#skill .fs-skill-medallion-art', element =>
  getComputedStyle(element, '::before').display);
const questRingDisplay = await page.$eval('#quest .fs-quest-sigil', element =>
  getComputedStyle(element, '::after').display);
const ringScoped = skillRingDisplay === 'none' && questRingDisplay !== 'none';
console.log(`${ringScoped ? 'ok  ' : 'FAIL'}  quest medallion is scoped to quest cards` +
  `${ringScoped ? '' : ` — skill=${skillRingDisplay}, quest=${questRingDisplay}`}`);
if (!ringScoped) failures += 1;

const skillCorner = await page.$eval('#skill [data-iw-skill-zone="identity"]', element => {
  const style = getComputedStyle(element, '::after');
  return { opacity: Number(style.opacity), filter: style.filter };
});
const cornerVisible = skillCorner.opacity >= .78 && /brightness/.test(skillCorner.filter);
console.log(`${cornerVisible ? 'ok  ' : 'FAIL'}  skill-card corner flourish matches the surrounding chrome brightness` +
  `${cornerVisible ? '' : ` — opacity=${skillCorner.opacity}, filter=${skillCorner.filter}`}`);
if (!cornerVisible) failures += 1;

const flourish = await page.$eval('.fs-inv-rule', element => {
  const style = getComputedStyle(element, '::after');
  return {
    image: style.backgroundImage,
    size: style.backgroundSize,
    position: style.backgroundPosition,
    transform: style.transform,
  };
});
const flourishStandalone = /data:image\/gif/.test(flourish.image) &&
  flourish.size === 'contain' && flourish.position === '50% 50%' &&
  !/0\.96/.test(flourish.transform);
console.log(`${flourishStandalone ? 'ok  ' : 'FAIL'}  separator flourish uses its repaired standalone asset` +
  `${flourishStandalone ? '' : ` — ${JSON.stringify(flourish)}`}`);
if (!flourishStandalone) failures += 1;

await browser.close();
console.log(failures === 0 ? '\nPASS' : `\nFAIL — ${failures} frame(s) use density-dependent slices`);
process.exit(failures === 0 ? 0 : 1);
