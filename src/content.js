/**
 * IdleWorlds Fantasy Skin — content script entry point
 *
 * Lifecycle rules:
 *   1. Every stylesheet is runtime-owned and removable, including base.css.
 *   2. Consumer/listener registration happens ONCE for the page lifetime.
 *   3. Each activation re-injects presentation CSS, starts services/painting,
 *      then starts DOMWatcher LAST.
 *   4. Teardown reverses the active work and removes every skin stylesheet.
 *   5. Runtime guards make late reconciliation callbacks inert while disabled;
 *      queued callbacks still run their bookkeeping so no queue flag is stranded.
 */

import { inject, removeAll as removeAllStyles } from './modules/StyleInjector.js';
import { startWatcher, stopWatcher, on, getScanRoots } from './modules/DOMWatcher.js';
import { AtlasService } from './modules/AtlasService.js';
import { ItemDatabase } from './modules/ItemDatabase.js';
import { initTooltipEngine, hideTooltip } from './modules/TooltipEngine.js';
import { scanForItemNames, clearItemNameScan } from './modules/NameScanner.js';
import { initInventoryRenderer, clearInventoryRenderer } from './modules/InventoryRenderer.js';
import { initSkillPanelRenderer, clearSkillPanels } from './modules/SkillPanelRenderer.js';
import { initQuestPanelRenderer, clearQuestPanels } from './modules/QuestPanelRenderer.js';
import { initUIFoundation, clearUIFoundation, injectUIFoundationStyles } from './modules/UIFoundation.js';
import { initHeaderRenderer, clearHeaderRenderer } from './modules/HeaderRenderer.js';
import { paintBackground, clearBackgroundPaint } from './modules/BackgroundPainter.js';
import { frameOverlays, clearOverlayFramer } from './modules/OverlayFramer.js';
import {
  guard,
  guardEach,
  storageGet,
  onStorageChanged,
  setRuntimeActive,
} from './modules/Runtime.js';

import baseCss from './styles/base.css';
import tooltipCss from './styles/tooltip-engine.css';
import inventoryCss from './styles/inventory.css';
import skillPanelCss from './styles/skillpanel.css';
import headerCss from './styles/header.css';
import overlayCss from './styles/overlay.css';

const ENABLED_KEY = 'iw-skin-enabled';
const VERSION = '1.6.0';

let booted = false;
let consumersBound = false;

function injectPresentationStyles() {
  // base.css used to be declared in manifest.json. That made the kill switch
  // incapable of restoring the native page because manifest CSS cannot be
  // removed by StyleInjector. Keep ALL presentation lifecycle-owned instead.
  inject('base', baseCss);
  inject('tooltip-engine', tooltipCss);
  inject('inventory', inventoryCss);
  inject('skillpanel', skillPanelCss);
  inject('header', headerCss);
  inject('overlay', overlayCss);
  // ui-system.css MUST be injected LAST (see CLAUDE.md): its generic control
  // rule is the final say on shared button surfacing, and header.css's button
  // roles opt out via that rule's :not() chain.
  injectUIFoundationStyles();
}

function scanRoots(roots) {
  if (!ItemDatabase.isReady()) return;
  const unique = new Set();
  for (const root of roots || []) {
    if (root && root.isConnected) unique.add(root);
  }
  guardEach('scan-roots', unique, root => scanForItemNames(root));
}

function bindConsumersOnce() {
  if (consumersBound) return;
  consumersBound = true;

  // Module initializers register their delegated/document listeners. They are
  // intentionally page-lifetime bindings; activation state is controlled by
  // DOMWatcher + Runtime rather than adding another copy on every re-enable.
  guard('init:tooltip', initTooltipEngine);
  guard('init:inventory', initInventoryRenderer);
  guard('init:skill-panel', initSkillPanelRenderer);
  guard('init:quest-panel', initQuestPanelRenderer);
  guard('init:ui-foundation', initUIFoundation);
  guard('init:header', initHeaderRenderer);

  on('iw:dom-flush', e => {
    const roots = e.detail?.roots || [];
    if (!roots.length) {
      guard('paint:document', () => paintBackground());
    } else {
      guardEach('paint:root', roots, root => paintBackground(root));
    }
    // Overlays portal in anywhere and are few — always a whole-document
    // reconcile, cheap by construction (see OverlayFramer.frameOverlays).
    guard('frame:overlays', frameOverlays);
  });

  on('iw:name-scan-flush', e => {
    if (!ItemDatabase.isReady()) return;
    scanRoots(e.detail?.roots || []);
  });

  document.addEventListener('iw:item-db-updated', () => {
    scanRoots([...getScanRoots()]);
  });
}

function boot() {
  if (booted) return;
  booted = true;
  setRuntimeActive(true);

  // 1. Presentation CSS belongs to THIS activation.
  injectPresentationStyles();

  // 2. Event consumers belong to the PAGE lifetime and are bound once.
  bindConsumersOnce();

  // 3. Start async services. Neither is allowed to poison itself forever
  // after a transient failure; renderers reconcile again on update events.
  AtlasService.ready().catch(err => {
    console.warn('[IW Fantasy Skin] Atlas failed to load:', err.message);
  });

  ItemDatabase.startAutoRefresh();
  ItemDatabase.ready().catch(err => {
    console.warn('[IW Fantasy Skin] Item database failed to load:', err.message);
  });

  // 4. Existing page ground.
  guard('paint:initial', () => paintBackground());

  // 5. Initial DOM discovery happens here, after every listener exists.
  guard('start:watcher', startWatcher);

  console.log(`[IW Fantasy Skin] v${VERSION} booted`);
}

/**
 * Remove the active skin from the live page.
 *
 * Keep Runtime active until module cleanup has completed: teardown functions use
 * guardEach(), and they must be allowed to restore/remove the active decoration.
 * Runtime is marked inactive only after the page has been cleaned, which also
 * suppresses late data-service/reconciliation events until the next boot.
 */
function teardown() {
  if (!booted) {
    setRuntimeActive(false);
    return;
  }
  booted = false;

  guard('teardown:watcher', stopWatcher);
  ItemDatabase.stopAutoRefresh();
  guard('teardown:tooltip', () => hideTooltip());
  guard('teardown:name-scan', clearItemNameScan);
  guard('teardown:inventory', clearInventoryRenderer);
  guard('teardown:skill-panel', clearSkillPanels);
  guard('teardown:quest-panel', clearQuestPanels);
  guard('teardown:ui-foundation', clearUIFoundation);
  guard('teardown:header', clearHeaderRenderer);
  guard('teardown:background', clearBackgroundPaint);
  guard('teardown:overlay', clearOverlayFramer);
  guard('teardown:styles', removeAllStyles);

  // From here until the next boot, any late async/data callbacks are inert.
  setRuntimeActive(false);

  console.log('[IW Fantasy Skin] disabled — active presentation removed');
}

function applyEnabled(enabled) {
  if (enabled === false) teardown();
  else boot();
}

(async function start() {
  // Nothing should reconcile before the persisted enable state is known.
  setRuntimeActive(false);

  // Default to enabled: a storage read failure must never leave the user with
  // a silently inert extension.
  const stored = await storageGet(ENABLED_KEY);
  applyEnabled(stored === null ? true : stored !== false);

  // This listener intentionally remains active while the skin is disabled: it
  // is the mechanism that can turn the skin back on.
  onStorageChanged(ENABLED_KEY, value => applyEnabled(value !== false));
})();
