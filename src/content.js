/**
 * IdleWorlds Fantasy Skin — content script entry point
 *
 * v1.6.0 boot order (retains the v1.4.1 stability guarantees):
 *   1. Inject module CSS. (base.css now ships declaratively via the manifest,
 *      so the theme lands at parse time instead of after document_idle — the
 *      flash of stock UI on every load is gone.)
 *   2. Register every consumer/listener (tooltip + renderers + repaint/scanner).
 *   3. Start async data services.
 *   4. Paint the existing page once.
 *   5. Start DOMWatcher LAST, so its initial discovery cannot emit events
 *      before consumers are listening.
 *
 * New in v1.6.0: the whole skin can be switched off at runtime without
 * uninstalling. Toggling `iw-skin-enabled` in extension storage tears every
 * module's decoration back off the live page and disconnects the observer,
 * which is the only practical way to A/B a suspected skin/game interaction
 * without losing the page state you are investigating.
 */

import { removeAll as removeAllStyles } from './modules/StyleInjector.js';
import { startWatcher, stopWatcher, on, getScanRoots } from './modules/DOMWatcher.js';
import { AtlasService } from './modules/AtlasService.js';
import { ItemDatabase } from './modules/ItemDatabase.js';
import { initTooltipEngine, hideTooltip } from './modules/TooltipEngine.js';
import { scanForItemNames, clearItemNameScan } from './modules/NameScanner.js';
import { initInventoryRenderer, clearInventoryRenderer } from './modules/InventoryRenderer.js';
import { initSkillPanelRenderer, clearSkillPanels } from './modules/SkillPanelRenderer.js';
import { initUIFoundation, clearUIFoundation } from './modules/UIFoundation.js';
import { paintBackground, clearBackgroundPaint } from './modules/BackgroundPainter.js';
import { guard, guardEach, storageGet, onStorageChanged } from './modules/Runtime.js';

const ENABLED_KEY = 'iw-skin-enabled';
const VERSION = '1.6.0';

let booted = false;

function scanRoots(roots) {
  if (!ItemDatabase.isReady()) return;
  const unique = new Set();
  for (const root of roots || []) {
    if (root && root.isConnected) unique.add(root);
  }
  guardEach('scan-roots', unique, root => scanForItemNames(root));
}

function boot() {
  if (booted) return;
  booted = true;

  // 1. Theme CSS.
  //
  // base.css is NOT injected from here any more. It is declared in
  // manifest.content_scripts[].css, for two reasons:
  //
  //   • it applies before first paint rather than at document_idle, so the
  //     flash of stock UI on every load is gone;
  //   • relative url() inside a JS-injected <style> resolves against the PAGE,
  //     while Chrome resolves it against the EXTENSION for declarative content
  //     script CSS — which is what makes the self-hosted @font-face work.
  //
  // The per-module sheets have no url() references, so they still go through
  // the injector and stay colocated with the code that depends on them.

  // 2. Register ALL consumers before the watcher is allowed to discover DOM.
  guard('init:tooltip', initTooltipEngine);
  guard('init:inventory', initInventoryRenderer);
  guard('init:skill-panel', initSkillPanelRenderer);
  guard('init:ui-foundation', initUIFoundation);

  on('iw:dom-flush', e => {
    const roots = e.detail?.roots || [];
    if (!roots.length) {
      guard('paint:document', () => paintBackground());
      return;
    }
    guardEach('paint:root', roots, root => paintBackground(root));
  });

  on('iw:name-scan-flush', e => {
    if (!ItemDatabase.isReady()) return;
    scanRoots(e.detail?.roots || []);
  });

  document.addEventListener('iw:item-db-updated', () => {
    scanRoots([...getScanRoots()]);
  });

  // 3. Start async services. Neither is allowed to poison itself forever
  // after a transient failure; renderers reconcile again on update events.
  AtlasService.ready().catch(err => {
    console.warn('[IW Fantasy Skin] Atlas failed to load:', err.message);
  });

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
 * Remove every trace of the skin from the live page.
 *
 * Teardown order is the reverse of boot: stop producing work, drop the
 * decorations that depend on the DOM, then remove the stylesheets that were
 * making them visible.
 */
function teardown() {
  if (!booted) return;
  booted = false;

  guard('teardown:watcher', stopWatcher);
  guard('teardown:tooltip', () => hideTooltip());
  guard('teardown:name-scan', clearItemNameScan);
  guard('teardown:inventory', clearInventoryRenderer);
  guard('teardown:skill-panel', clearSkillPanels);
  guard('teardown:ui-foundation', clearUIFoundation);
  guard('teardown:background', clearBackgroundPaint);
  guard('teardown:styles', removeAllStyles);

  console.log('[IW Fantasy Skin] disabled — page restored to native presentation');
}

function applyEnabled(enabled) {
  if (enabled === false) teardown();
  else boot();
}

(async function start() {
  // Default to enabled: a storage read failure must never leave the user with
  // a silently inert extension.
  const stored = await storageGet(ENABLED_KEY);
  applyEnabled(stored === null ? true : stored !== false);
  onStorageChanged(ENABLED_KEY, value => applyEnabled(value !== false));
})();
