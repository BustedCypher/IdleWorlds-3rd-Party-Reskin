import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { THEME_NAMES } from '../src/modules/zoneThemes.js';
import { SkillsArtService } from '../src/modules/SkillsArtService.js';

const expectedKinds = [
  'action-idle', 'action-hover', 'action-clicked',
  'action-secondary-idle', 'action-secondary-hover', 'action-secondary-clicked',
  'chevron-prev-idle', 'chevron-prev-hover', 'chevron-prev-clicked',
  'chevron-next-idle', 'chevron-next-hover', 'chevron-next-clicked',
];

const host = new JSDOM('<!doctype html><html><body></body></html>').window.document.documentElement;
for (const theme of THEME_NAMES) {
  assert.equal(SkillsArtService.applyThemeVariables(host, theme), true);
  assert.equal(host.dataset.iwButtonAtlas, 'revised-v5');
  assert.equal(host.dataset.iwCompactAtlas, 'compact-ghost-v3');
  for (const kind of expectedKinds) {
    const image = host.style.getPropertyValue(`--iw-${kind}`);
    const paint = host.style.getPropertyValue(`--iw-${kind}-paint`);
    assert.equal(image, `url("assets/skills-ui/buttons/revised-v5/${theme}.png")`);
    assert.match(paint, new RegExp(`revised-v5/${theme}\\.png.*no-repeat`));
  }
}

assert.equal(SkillsArtService.applyThemeVariables(host, 'retired-theme'), false);
assert.equal(host.dataset.iwButtonAtlas, undefined);
assert.equal(host.dataset.iwCompactAtlas, undefined);
for (const kind of expectedKinds) {
  assert.equal(host.style.getPropertyValue(`--iw-${kind}`), '');
  assert.equal(host.style.getPropertyValue(`--iw-${kind}-paint`), '');
}

console.log('PASS themed button artwork uses revised-v5 exclusively and clears unknown themes');
