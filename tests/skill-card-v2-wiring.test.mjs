import fs from 'node:fs';

const content = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/skillcard-v2.css', import.meta.url), 'utf8');

const checks = [
  ['content imports V2 controller', /SkillCardDesignController\.js/.test(content)],
  ['content initialises V2 controller', /initSkillCardDesignController\(\)/.test(content)],
  ['content tears V2 controller down', /clearSkillCardDesignController\(\)/.test(content)],
  ['V2 CSS is composed into lifecycle-owned skillpanel stylesheet', /skillCardV2Css/.test(content) && /skillPanelCss\s*\+/.test(content)],
  ['new design selector is explicit', /data-iw-skill-card-design=["']new["']/.test(css)],
  ['collapsed and expanded states are styled', /data-iw-skill-v2-state=["']collapsed["']/.test(css) && /data-iw-skill-v2-state=["']expanded["']/.test(css)],
  ['tab-selected sections are state driven', /data-iw-skill-v2-tab=["']materials["']/.test(css) && /data-iw-skill-v2-section=["']materials["']/.test(css)],
  ['legacy mode hides only V2 controls', /data-iw-skill-card-design=["']current["'][\s\S]*iw-skill-v2-controls/.test(css)],
];

let fail = 0;
for (const [label, ok] of checks) {
  if (!ok) fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
}
console.log(fail ? `\nFAIL - ${fail} wiring check(s)` : '\nPASS skill-card-v2 wiring');
process.exit(fail ? 1 : 0);
