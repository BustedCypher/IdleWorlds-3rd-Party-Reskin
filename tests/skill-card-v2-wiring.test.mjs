import fs from 'node:fs';

const content = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/skillcard-v2.css', import.meta.url), 'utf8');

const checks = [
  ['content imports V2 controller', /SkillCardDesignController\.js/.test(content)],
  ['content initialises V2 controller', /guard\(\s*['"]init:skill-card-design['"]\s*,\s*initSkillCardDesignController\s*\)/.test(content)],
  ['content tears V2 controller down', /guard\(\s*['"]teardown:skill-card-design['"]\s*,\s*clearSkillCardDesignController\s*\)/.test(content)],
  ['V2 CSS is composed into lifecycle-owned skillpanel stylesheet', /skillCardV2Css/.test(content) && /skillPanelCss\s*\+/.test(content)],
  ['new design selector is explicit', /data-iw-skill-card-design=["']new["']/.test(css)],
  // Expansion and tab content are exercised by the browser tests. They no
  // longer depend on un-clipping native source nodes with per-tab CSS rules.
  /* The V2 card is the only design (Curtis, 2026-09): no switch, no "current" mode. */
  ['the old/new design switch is gone from the sheet', !/iw-skill-design-toggle/.test(css)],
  ['no rule targets a "current" design', !/data-iw-skill-card-design=["']current/.test(css)],
  ['every discipline in the artwork has an action icon rule', ['combat','mining','smithing','gathering','alchemy','jewelcrafting','spellcrafting','tailoring','woodcutting','construction'].every(k => css.includes(`[data-iw-skill-v2-type="${k}"] .iw-skill-v2-action-glyph`) && fs.existsSync(new URL(`../assets/skills-ui/action-icons/${k}.svg`, import.meta.url)))],
];

let fail = 0;
for (const [label, ok] of checks) {
  if (!ok) fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
}
console.log(fail ? `\nFAIL - ${fail} wiring check(s)` : '\nPASS skill-card-v2 wiring');
process.exit(fail ? 1 : 0);
