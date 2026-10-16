/**
 * Fantasy profile — layered on the game's own `data-skin="fantasy"` theme,
 * which is this skin's native port (CLAUDE.md, Fantasy profile).
 * Add only Fantasy presentation here; never import Legacy modules or styles.
 * Every activation has a matching, complete teardown in stop().
 *
 * Boot order: the profile's runtime flag, its stylesheet, then the ONE
 * watcher, whose first pass runs on the next frame. The skills/quests
 * sheets are injected by their own pass (each stands down on its own).
 */

import { setRuntimeActive } from './core/Runtime.js';
import { inject, removeAll } from './core/StyleInjector.js';
import { startWatcher, stopWatcher } from './core/Watcher.js';
import { resetNativeFeatures } from './core/NativeFeatures.js';
import { raidPass, raidText, clearRaid } from './raid/index.js';
import { skillsPass, skillsText, clearSkills } from './skills/index.js';
import raidCss from './styles/raid.css';

function flush() {
  raidPass();
  skillsPass();
}

function text(parents) {
  raidText(parents);
  skillsText(parents);
}

export function start() {
  setRuntimeActive(true);
  inject('raid', raidCss);
  startWatcher({ onFlush: flush, onText: text });
}

export function stop() {
  stopWatcher();
  clearRaid();
  clearSkills();
  removeAll();
  resetNativeFeatures();
  setRuntimeActive(false);
}
