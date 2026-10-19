/**
 * Fantasy profile — layered on the game's own `data-skin="fantasy"` theme,
 * which is this skin's native port (CLAUDE.md, Fantasy profile).
 * Add only Fantasy presentation here; never import Legacy modules or styles.
 * Every activation has a matching, complete teardown in stop().
 *
 * Boot order: the profile's runtime flag, its stylesheet, then the ONE
 * watcher, whose first pass runs on the next frame. The skills/quests and
 * chrome sheets are injected by their own passes, only where their surfaces exist.
 */

import { setRuntimeActive } from './core/Runtime.js';
import { inject, removeAll } from './core/StyleInjector.js';
import { startWatcher, stopWatcher } from './core/Watcher.js';
import { resetNativeFeatures } from './core/NativeFeatures.js';
import { raidPass, raidText, clearRaid } from './raid/index.js';
import { skillsPass, skillsText, clearSkills } from './skills/index.js';
import { chromePass, chromeText, clearChrome } from './chrome/index.js';
import { inventoryPass, inventoryText, clearInventory } from './inventory/index.js';
import { worldBossPass, worldBossText, clearWorldBosses } from './world-boss/index.js';
import { tooltipsPass, tooltipsText, clearTooltips } from './tooltips/index.js';
import raidCss from './styles/raid.css';

function flush() {
  raidPass();
  skillsPass();
  chromePass();
  inventoryPass();
  worldBossPass();
  tooltipsPass();
}

function text(parents) {
  raidText(parents);
  skillsText(parents);
  chromeText(parents);
  inventoryText(parents);
  worldBossText(parents);
  tooltipsText(parents);
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
  clearChrome();
  clearInventory();
  clearWorldBosses();
  clearTooltips();
  removeAll();
  resetNativeFeatures();
  setRuntimeActive(false);
}
