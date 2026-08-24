import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async rel => readFile(new URL(rel, root), 'utf8');

const code = text => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/* â”€â”€ Entry lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const content = await read('src/content.js');
const bootStart = content.indexOf('function boot()');
const startWatcherAt = content.indexOf("guard('start:watcher', startWatcher)", bootStart);
const bindConsumersAt = content.indexOf('bindConsumersOnce()', bootStart);
assert.ok(bootStart >= 0 && bindConsumersAt > bootStart && startWatcherAt > bindConsumersAt,
  'page-lifetime consumers must be bound before DOMWatcher initial discovery');
assert.match(content, /if \(consumersBound\) return/,
  're-enable must not register a second copy of page-lifetime listeners');
assert.match(content, /inject\('base', baseCss\)/,
  'global base theme must be lifecycle-owned and removable');
assert.match(content, /setRuntimeActive\(true\)/);
assert.match(content, /setRuntimeActive\(false\)/);
assert.match(content, /function teardown\(\)/);
assert.match(content, /removeAllStyles/);

/* â”€â”€ Exactly one MutationObserver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const modulesDir = new URL('src/modules/', root);
let observerCount = 0;
for (const name of await readdir(modulesDir)) {
  if (!name.endsWith('.js')) continue;
  const text = await read(`src/modules/${name}`);
  observerCount += (text.match(/new\s+MutationObserver\s*\(/g) || []).length;
}
assert.equal(observerCount, 1, 'there must be exactly one runtime MutationObserver');

/* â”€â”€ Runtime / storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const runtime = await read('src/modules/Runtime.js');
assert.match(runtime, /chrome\.storage\.local/, 'persistent extension state belongs in chrome.storage.local');
assert.match(runtime, /runtimeActive/, 'late reconciliation must be suppressible while disabled');
assert.match(runtime, /if \(!runtimeActive\) return false/, 'guard() must be inert while disabled');
assert.match(runtime, /export const raf/, 'RAF callbacks must still run their bookkeeping while disabled');

const db = await read('src/modules/ItemDatabase.js');
assert.doesNotMatch(code(db), /localStorage\.setItem/, 'skin data must never consume the game localStorage quota');
assert.match(db, /evictLegacyCache/, 'legacy page-origin cache should be reclaimed');

/* â”€â”€ Stylesheet lifecycle / reversible inline ownership â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const injector = await read('src/modules/StyleInjector.js');
assert.match(injector, /assetUrl/, 'runtime-injected base CSS must rewrite bundled asset URLs');
assert.match(injector, /\.\.\/assets\//, 'relative extension asset references must be rewritten');
assert.match(injector, /style\[data-iw-style\]/, 'all injected sheets need one removable ownership marker');

const styleOwner = await read('src/modules/InlineStyleOwner.js');
assert.match(styleOwner, /nativeValue/);
assert.match(styleOwner, /appliedValue/);
assert.match(styleOwner, /restoreElement/);
assert.match(styleOwner, /restoreWithin/);
assert.match(styleOwner, /restoreAll/);
assert.match(styleOwner, /new WeakRef\(el\)/, 'inline-style ownership should not strongly retain detached DOM nodes');
assert.match(styleOwner, /FinalizationRegistry/, 'dead weak refs should be pruned after collection');
assert.doesNotMatch(styleOwner, /const touched = new Set\(\)/, 'style ownership must not keep a strong set of every touched element');
assert.doesNotMatch(styleOwner, /removeAttribute\(['"]style['"]\)/,
  'property ownership must never erase an entire native style attribute');

const painter = await read('src/modules/BackgroundPainter.js');
assert.match(painter, /createInlineStyleOwner/);
assert.match(painter, /styleOwner\.restoreAll\(\)/);
assert.doesNotMatch(painter, /style\.removeProperty/,
  'BackgroundPainter teardown must restore owned values, not blindly remove native declarations');
assert.match(painter, /SURFACE_SELECTOR/);
assert.match(painter, /isSurfaceCandidate/);

/* â”€â”€ React-safe name annotation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const scanner = await read('src/modules/NameScanner.js');
assert.doesNotMatch(code(scanner), /replaceChild|appendChild|insertBefore|removeChild/,
  'NameScanner must never detach/reparent React-owned nodes');
assert.doesNotMatch(code(scanner), /\.innerHTML/,
  'NameScanner must never write markup into React-owned prose');
assert.match(scanner, /CSS\.highlights/);
assert.match(scanner, /ItemDatabase\.revision\(\)/);

const tooltipEngine = await read('src/modules/TooltipEngine.js');
const tooltipCss = await read('src/styles/tooltip-engine.css');
const itemDb = await read('src/modules/ItemDatabase.js');
assert.match(tooltipEngine, /cleanEffectText/);
assert.match(tooltipEngine, /drop_boosted_by/);
assert.match(tooltipEngine, /ItemDatabase\.source\(\)/,
  'tooltip footer must expose actual item-data provenance');
const tooltipClickStart = tooltipEngine.indexOf("document.addEventListener('click'");
const tooltipClickEnd = tooltipEngine.indexOf("document.addEventListener('keydown'", tooltipClickStart);
const tooltipClickBlock = tooltipEngine.slice(tooltipClickStart, tooltipClickEnd);
assert.doesNotMatch(tooltipClickBlock, /stopPropagation\(|stopImmediatePropagation\(/,
  'tooltip discovery must not consume native React click propagation');
assert.match(tooltipCss, /\.iw-tip-art/);
assert.match(tooltipCss, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  'rich tooltip stats should use a deterministic two-column layout');
assert.match(itemDb, /source\(\)\s*\{[\s\S]*return this\._source/);
assert.match(scanner, /caretPositionFromPoint/,
  'native item-name hit testing should resolve the actual text node under the pointer');
assert.match(scanner, /pointerInsideTooltip/,
  'virtual item tooltips must survive pointer handoff onto the card');
assert.match(scanner, /if \(!isTouchLike\(\)\) return/,
  'native React item text needs an explicit touch activation path');
assert.doesNotMatch(scanner, /SKIP_CONTAINERS[^\n]*button/,
  'native clickable item names must remain eligible for read-only tooltip discovery');

const watcherNames = await read('src/modules/DOMWatcher.js');
assert.doesNotMatch(watcherNames, /SEL_SCAN_ROOTS/,
  'item-name coverage must not be restricted to a hand-maintained panel selector list');
assert.match(watcherNames, /addNameRoot\(root\)/,
  'new React subtrees should be considered directly for item-name scanning');
assert.match(watcherNames, /root\?\.body \|\| root/,
  'item database refresh should trigger one page-wide scan');

/* â”€â”€ Inventory ItemRow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const inventory = await read('src/modules/InventoryRenderer.js');
assert.match(inventory, /isInventoryContext\(row\)/,
  'generic market/bank/salvage rows must not be rebuilt as Inventory');
assert.match(inventory, /data-fs-preserved-action/,
  'real React controls must remain the action surface');
assert.match(inventory, /buildInventoryDetails/);
assert.match(inventory, /createInlineStyleOwner/,
  'Inventory display suppression must use property-level inline style ownership');
assert.doesNotMatch(inventory, /data-fs-original-display|ORIGINAL_DISPLAY_ATTR/,
  'Inventory must not restore stale display snapshots from data attributes');
assert.match(inventory, /data-iw-tooltip-trigger/);
assert.doesNotMatch(inventory, /host\.setAttribute\(['"]role['"],\s*['"]button['"]\)/,
  'atlas icon must not inherit generic button background paint');
assert.match(inventory, /function cheapSignature\(row\)/);
assert.match(inventory, /text:\s*row\.textContent\s*\|\|\s*''/,
  'Inventory fast path must compare actual text content, not text length');
assert.match(inventory, /sameCheapSignature/);
const cheapStart = inventory.indexOf('function cheapSignature(row)');
const cheapEnd = inventory.indexOf('\n}', cheapStart);
assert.doesNotMatch(inventory.slice(cheapStart, cheapEnd), /textContent[^\n]*\.length/,
  'equal-length Inventory changes must invalidate the fast-path cache');
assert.match(inventory, /if \(listenerBound\) return/,
  'Inventory initializer should remain independently idempotent');

const inventoryCSS = await read('src/styles/inventory.css');
assert.match(inventoryCSS, /\.fs-inv-icon\s*\{[^}]*overflow:\s*visible/s,
  'Inventory enhancement sprites must be allowed to overhang the icon frame');
assert.match(inventoryCSS, /\.fs-inv-body\s*\{[^}]*overflow:\s*hidden/s);
assert.match(inventoryCSS, /\.fs-inv-detail[^}]*text-overflow:\s*ellipsis/s);
assert.match(inventoryCSS, /\.fs-inv-name\s*\{[^}]*-webkit-line-clamp:\s*2[^}]*white-space:\s*normal/s,
  'Inventory names must wrap to at most two lines rather than reverting to single-line ellipsis');
assert.match(inventoryCSS, /@media \(max-width: 700px\)[\s\S]*flex-wrap:\s*wrap\s*!important/,
  'mobile Inventory must wrap native actions instead of removing them');
assert.doesNotMatch(inventoryCSS, /data-fs-action-kind=\\?"set\\?"[^}]*display:\s*none/s,
  'mobile Inventory must never hide the native Set action');
assert.doesNotMatch(inventoryCSS, /\.fs-inv-details,\s*\.fs-inv-requirements\s*\{[^}]*display:\s*none/s,
  'mobile Inventory must preserve dynamic owned-item state and requirements');

/* â”€â”€ Skill detection / treatment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const contentEntry = await read('src/content.js');
assert.match(contentEntry, /ItemDatabase\.startAutoRefresh\(\)/,
  'boot must enable periodic item-data refresh');
assert.match(contentEntry, /ItemDatabase\.stopAutoRefresh\(\)/,
  'teardown must stop periodic item-data refresh');

const watcher = await read('src/modules/DOMWatcher.js');
assert.doesNotMatch(watcher, /panel\.textContent\.slice/,
  'skill detection must not search arbitrary panel body text');
assert.match(watcher, /JSON\.stringify\(\[buttons, identities, lockedCopy\]\)/,
  'skill cache must represent exact normalized detection signals');
assert.match(watcher, /drainGlobalBudget\(FLUSH_BUDGET\)/,
  'DOM reconciliation must enforce one global per-frame budget');
assert.doesNotMatch(watcher, /iw:equipment-panel|iw:shop-panel|pendingEquipment|pendingShop/,
  'DOM watcher must not spend budget on producer-only equipment/shop pipelines');
assert.doesNotMatch(watcher, /drainConnected\([^\n]+FLUSH_BUDGET/,
  'per-queue frame budgets can multiply work far beyond the intended cap');
const skillSigStart = watcher.indexOf('function skillSignature(panel)');
const skillSigEnd = watcher.indexOf('\n}', skillSigStart);
assert.doesNotMatch(watcher.slice(skillSigStart, skillSigEnd), /textContent[^\n]*\.length/,
  'equal-length skill action changes must invalidate the cache');
assert.match(watcher, /hasAction\('fight'\)/);
assert.match(watcher, /hasAction\('prospect', 'cut'\).*jewelcrafting/s);
assert.match(watcher, /skillTypeFromIdentity/);
assert.match(watcher, /'jewel', 'jewelcrafting'/);
assert.match(watcher, /'spellcraft', 'spellcrafting'/);
assert.match(watcher, /hasAction\('tailor', 'sew', 'weave'\).*tailoring/s);
assert.match(watcher, /unlock in a future update/,
  'locked skill detection must support split Coming Soon markup');
assert.ok(watcher.indexOf('if (identityType) return identityType;') < watcher.indexOf("if (hasAction('craft'))"),
  'generic Craft actions must defer to the visible skill identity');

const skill = await read('src/modules/SkillPanelRenderer.js');
assert.doesNotMatch(skill, /migrateLegacyWrapper|insertBefore\\(panel, wrapper\\)/,
  'Skill renderer must never reparent React-owned skill panels during migration or teardown');
assert.doesNotMatch(skill, /new\s+MutationObserver/);
assert.doesNotMatch(skill, /wrapper\.appendChild\(panel\)/,
  'skill renderer must not reparent gameplay panels');
assert.doesNotMatch(skill, /removeAttribute\(['"]style['"]\)/,
  'skill teardown must not erase the game entire style attribute');
assert.match(skill, /buttonStyleOwner\s*=\s*createInlineStyleOwner\(\)/);
assert.match(skill, /readoutStyleOwner\s*=\s*createInlineStyleOwner\(\)/);
assert.match(skill, /ingredientStyleOwner\s*=\s*createInlineStyleOwner\(\)/,
  'button/readout/ingredient ownership must stay separate');
assert.match(skill, /current\.has\(old\)/,
  'readout reconciliation should restore only nodes that left the readout branch');
assert.match(skill, /LEVEL_PROGRESS_PATTERN/);
assert.match(skill, /levelProgressButton/);
assert.match(skill, /role === 'level-progress'/);
assert.match(skill, /unexpectedFlowChild/);
assert.match(skill, /labels: \['Jewel', 'Jewelcrafting'\]/);
assert.match(skill, /actions: \['prospect', 'cut'\]/);
assert.match(skill, /labels: \['Spellcraft', 'Spellcrafting'\]/);
assert.match(skill, /actions: \['enchant', 'gather', 'harvest', 'craft'\]/);
assert.match(skill, /actions: \['tailor', 'sew', 'weave', 'craft'\]/);
assert.match(skill, /action-detail/);
assert.match(skill, /remaining native command button/,
  'identified skill panels must tolerate newly introduced action verbs');
assert.match(skill, /visibleActions/,
  'fallback action discovery must prefer the visible current action over stale hidden variants');
assert.match(skill, /SkillsArtService/,
  'Skill renderer must delegate dedicated artwork to SkillsArtService');
assert.doesNotMatch(skill, /Prospector's Pick|Weaver's Needle|Copper Upgrade Orb/,
  'Skill renderer must not reuse equipment/item artwork for skill identities');
assert.match(skill, /fs-skill-medallion-art/,
  'three-zone Skills must create a skin-owned medallion art host');
assert.match(skill, /fs-skill-identity-progress/,
  'approved Skills layout must mirror native progress into the identity column');
assert.match(skill, /fs-skill-base-exp/,
  'approved Skills layout must render a dedicated Base EXP plaque');
assert.match(skill, /data\.iwCleanText|dataset\.iwCleanText/,
  'approved Skills layout must preserve emoji-free visible labels without rewriting React text');
assert.match(skill, /ownsOtherControl/,
  'XP readout wrapper traversal must ignore the readout control itself');
assert.doesNotMatch(skill, /directChildren\.length === 3/);

const skillsArt = await read('src/modules/SkillsArtService.js');
assert.match(skillsArt, /assets\/skills_icons_index\.json/);
assert.match(skillsArt, /assets\/skills_ui_index\.json/);
assert.match(skillsArt, /assets\/skills_panel_texture\.webp/);
assert.match(skillsArt, /assetUrl\(/,
  'Skills artwork must resolve through bundled extension URLs');
assert.doesNotMatch(skillsArt, /gear_icons_atlas|item_icons_atlas|https?:\/\//,
  'Skills artwork service must use only its dedicated bundled assets');
assert.match(skillsArt, /medallion_frame/);
assert.match(skillsArt, /action_frame_idle/);
assert.match(skillsArt, /xp_plaque/);
const skillsUiIndex = JSON.parse(await read('assets/skills_ui_index.json'));
const xpPlaque = skillsUiIndex.entries.find(entry => entry.key === 'xp_plaque');
assert.ok(skillsUiIndex.width >= 860 && xpPlaque?.width >= 300 && xpPlaque?.height >= 100,
  'Skills UI atlas must retain the expanded six-digit Base: plaque artwork');

const skillCSS = await read('src/styles/skillpanel.css');
assert.doesNotMatch(skillCSS, /border-top:\s*54px/);
assert.match(skillCSS, /data-iw-skill-layout=\"three-zone\"/);
assert.match(skillCSS, /@media \(max-width: 600px\)[\s\S]*grid-template-areas:[\s\S]*identity commands[\s\S]*content content/,
  'phone skill cards must switch to a two-row mobile topology');
assert.match(skillCSS, /data-iw-skill-role=\"level-progress\"/);
assert.match(skillCSS, /data-iw-readout\]::before/);
assert.match(skillCSS, /fs-skill-medallion-art/,
  'Skills CSS must retain the atlas-backed medallion treatment');
assert.match(skillCSS, /data-iw-skill-art-ready/,
  'native skill glyphs must hide only after atlas art is ready');
assert.match(skillCSS, /action-button\"]::before/,
  'primary skill actions must retain the ornate stud treatment');
assert.match(skillCSS, /fs-skill-identity-progress/,
  'approved Skills CSS must place level progress beneath the left identity');
assert.match(skillCSS, /fs-skill-base-exp/,
  'approved Skills CSS must retain the atlas-backed Base EXP plaque');
assert.match(skillCSS, /content:\s*attr\(data-iw-clean-text\)/,
  'approved Skills CSS must render emoji-free title and identity text');
assert.match(skillCSS, /nav-group[^}]*position:\s*absolute/s,
  'desktop navigation controls must sit independently above the action button');

/* â”€â”€ Shared UI / tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const ui = await read('src/modules/UIFoundation.js');
assert.doesNotMatch(ui, /new\s+MutationObserver/);
assert.match(ui, /main-nav/);
assert.doesNotMatch(ui, /ENABLE_PLAYER_HUD_RELAYOUT|classifyPlayerHud|hud-player-name|iwHudLayout/,
  'disabled player-HUD relayout code must not remain as a dormant activation path');
const uiCss = await read('src/styles/ui-system.css');
assert.doesNotMatch(uiCss, /player-hud|hud-identity|hud-metric|hud-utility/,
  'disabled player-HUD role CSS must be removed with its dead classifier');

const tooltip = await read('src/modules/TooltipEngine.js');
assert.match(tooltip, /<span class="iw-item-ref" role="button" tabindex="0"/);
assert.doesNotMatch(tooltip, /<button type="button" class="iw-item-ref"/);
assert.doesNotMatch(tooltip, /HIDE_GRACE|hideTimer|overPanel/);
assert.match(tooltip, /const EDGE_GAP\s*=\s*0/);
assert.match(tooltip, /STATE\.el\.style\.display\s*=\s*'none'/);
assert.doesNotMatch(tooltip, /el\.style\.opacity\s*=\s*['"]1['"]/);
assert.match(tooltip, /setAttribute\('role', 'dialog'\)/,
  'interactive item cards must use dialog semantics rather than ARIA tooltip semantics');
assert.match(tooltip, /show\(trigger, \{ keyboard: true \}\)/,
  'keyboard activation must establish focus-owned tooltip state');
assert.match(tooltip, /iw-tip-close/,
  'interactive item cards need an explicit close control for touch and keyboard users');
assert.match(tooltipCss, /max-height:\s*calc\(100vh - 20px\)/,
  'item cards must remain vertically contained on short/mobile viewports');
assert.match(tooltipCss, /\.iw-tip-body\s*\{[^}]*overflow-y:\s*auto/s,
  'tooltip body must scroll without moving the header/footer');
assert.match(tooltip, /style\.display\s*=\s*'flex'/,
  'tooltip measurement/open state must preserve the flex card layout');
assert.match(tooltipCss, /100dvh/,
  'mobile tooltip height must account for dynamic browser viewport chrome');

/* â”€â”€ Base theme safety â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const baseCSS = await read('src/styles/base.css');
assert.doesNotMatch(baseCSS, /\[class\*="card"\],\s*\[class\*="panel"\]/,
  'broad generic card/panel paint selector must stay removed');
assert.match(baseCSS, /--iw-r-panel:\s+3px/);
assert.match(baseCSS, /chat-name-/);
assert.match(baseCSS, /level-progress/);
assert.match(baseCSS, /\.iw-icon-badge--sprite\s*\{[^}]*width:\s*22px[^}]*height:\s*22px/s,
  'enhancement sprite must retain the proven 22px corner size');

/* â”€â”€ Atlas correctness / dependency pin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const atlas = await read('src/modules/AtlasService.js');
assert.match(atlas, /_paintBadge\(hostEl, level\)/,
  'enhanced gear must use the atlas-backed badge painter');
assert.match(atlas, /iw-icon-badge iw-icon-badge--sprite/,
  'enhancement art must use the sprite badge class rather than plain text');
const gearManifest = JSON.parse(await read('assets/gear_icons_manifest.json'));
assert.deepEqual(gearManifest.icons.slice(0, 4).map(({ name, index }) => ({ name, index })), [
  { name: '+1', index: 0 }, { name: '+2', index: 1 },
  { name: '+3', index: 2 }, { name: '+4', index: 3 },
], 'gear atlas indexes 0..3 must remain the +1..+4 enhancement overlays');
assert.doesNotMatch(atlas, /https:\/\/raw\.githubusercontent\.com/,
  'runtime must not fetch atlas assets from third-party origins');
assert.match(atlas, /REQUIRED_ITEM_COLUMNS/);
assert.match(atlas, /maxX\s*=\s*Math\.max\(maxX, x \+ w\)/);
assert.match(atlas, /maxY\s*=\s*Math\.max\(maxY, y \+ h\)/);
assert.match(atlas, /Math\.ceil\(maxX \/ cell\)/);
assert.doesNotMatch(atlas, /Number\(row\.row\)|Number\(row\.column\)/,
  'runtime atlas dimensions must not depend on optional row/column metadata');

const vendor = await read('build-tools/vendor-assets.mjs');
assert.match(vendor, /39bc876307c3183d160a5e2c5868d37b50c1660b/,
  'sprite dependency must stay pinned to the immutable shared +4 atlas revision');

/* â”€â”€ Build / manifest / test contract â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const build = await read('build-tools/build.mjs');
assert.match(build, /format:\s*'iife'/, 'production bundle must remain a single content-script IIFE');
assert.match(build, /normalizedCssTextPlugin/);
assert.ok(build.includes("replace(/\\r\\n?/g, '\\n')"),
  'CSS text must normalize line endings before bundling');
assert.match(build, /loader:\s*'text'/,
  'CSS must remain bundled as removable runtime-owned text');
assert.match(build, /REQUIRED_ASSETS/);
assert.match(build, /allowMissingAssets/);

const manifest = JSON.parse(await read('manifest.json'));
assert.ok(manifest.permissions?.includes('storage'));
assert.ok(!JSON.stringify(manifest.host_permissions).includes('githubusercontent'));
assert.ok(manifest.web_accessible_resources?.some(r => r.resources?.includes('assets/*')));
assert.ok(!(manifest.content_scripts?.[0]?.css || []).includes('dist/base.css'),
  'runtime kill switch cannot remove manifest-declared CSS');

const pkg = JSON.parse(await read('package.json'));
assert.match(pkg.scripts?.test || '', /build\.mjs --allow-missing-assets/,
  'npm test must rebuild the esbuild bundle before smoke execution');
assert.match(pkg.scripts?.test || '', /node --check dist\/content\.bundle\.js/);
assert.ok(pkg.scripts?.['test:run'], 'raw regression suite should remain separately invokable by strict setup');

const distFiles = await readdir(new URL('dist/', root));
assert.ok(!distFiles.includes('base.css'), 'obsolete standalone dist/base.css must stay deleted');

const bundle = await read('dist/content.bundle.js');
assert.doesNotMatch(bundle, /sourceMappingURL=data:/);
assert.match(bundle, /--iw-ink-950:\s*#070806/,
  'rebuilt production bundle must contain the runtime-owned base stylesheet text');
const bundleStat = await stat(new URL('dist/content.bundle.js', root));
assert.ok(bundleStat.size < 300_000, `production bundle unexpectedly large: ${bundleStat.size}`);

const smoke = await read('tests/smoke.test.mjs');
assert.match(smoke, /nativeQtyText\.nodeValue\s*=\s*'x2'/,
  'smoke test must cover equal-length Inventory reconciliation without replacing Text nodes');
assert.match(smoke, /skillActionText\.nodeValue\s*=\s*'Fish'/,
  'smoke test must cover equal-length skill-cache invalidation');
assert.match(smoke, /smoke: re-enable/);
assert.match(smoke, /smoke: second disable/);
assert.match(smoke, /style\[data-iw-style="base"\]/);

console.log('PASS static lifecycle + visual invariants');
