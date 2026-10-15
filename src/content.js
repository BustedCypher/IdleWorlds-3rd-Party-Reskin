/** Shared bootstrap. Every presentation rule belongs to exactly one skin. */
import * as legacy from './skins/legacy/index.js';
import * as fantasy from './skins/fantasy/index.js';
import { waitForPageHydration } from './shared/HydrationGate.js';
import { readSettings, watchSettings } from './shared/ExtensionSettings.js';
import { createSkinController } from './shared/SkinController.js';
const VERSION = '1.7.0';
const controller = createSkinController({
  skins: { legacy, fantasy },
  waitUntilReady: async () => {
    const hydration = await waitForPageHydration();
    console.log(`[IW Fantasy Skin] v${VERSION} boot after page hydration: ${hydration.state} (${hydration.waitedMs}ms)`);
  },
});
let settings = null;
const changesDuringRead = {};
const apply = () => controller.update(settings).catch(err => {
  console.warn('[IW Fantasy Skin] Profile activation failed:', err.message);
});

// Subscribe first. Newer per-key events override the initial read's snapshot.
watchSettings(patch => {
  if (settings === null) Object.assign(changesDuringRead, patch);
  else {
    settings = { ...settings, ...patch };
    apply();
  }
});

(async function start() {
  const stored = await readSettings();
  settings = { ...stored, ...changesDuringRead };
  await apply();
})();
