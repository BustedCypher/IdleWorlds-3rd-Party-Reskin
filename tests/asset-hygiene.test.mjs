import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const retired = [
  'assets/skills-ui/buttons/exact-v3',
  'assets/skills-ui/buttons/source-v4',
  'assets/skills-ui/buttons/themes-v2',
  'assets/skills_xp_plaque_wide.webp',
  'assets/header/header_frame.webp',
  'assets/header/header_divider.webp',
  'assets/header/utility_frame.webp',
  'assets/header/status_frame.webp',
  'assets/header/nav_rail.webp',
  'assets/header/nav_active.webp',
  'assets/header/nav_idle.webp',
  'assets/header/announcement_frame.webp',
  'assets/header/zone_frame.webp',
  'assets/header/zone_scene.webp',
  'assets/header/zone_button_active.webp',
  'assets/header/zone_button_idle.webp',
  'assets/header/zone_button_teal.webp',
  'assets/world-boss/world_boss_join.webp',
  'assets/world-boss/world_boss_join_hover.webp',
  'assets/world-boss/world_boss_prejoined.webp',
  'assets/world-boss/world_boss_fighting.webp',
  'assets/world-boss/world_boss_fighting-v2.png',
  'assets/skills-ui/action-icons/index.json',
  'assets/skills-ui/buttons/revised-v5/registration.json',
  'assets/skills-ui/buttons/compact-ghost-v3/registration.json',
];

const present = retired.filter(path => existsSync(resolve(root, path)));
assert.deepEqual(present, [], `retired assets must stay out of the repository:\n${present.join('\n')}`);
console.log('ok    retired assets are absent');
