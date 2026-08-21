import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async rel => readFile(new URL(rel, root), 'utf8');

const code = text => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/* ── Entry lifecycle ─────────────────────────────────────────────────── */

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

/* ── Exactly one MutationObserver ────────────────────────────────────── */

const modulesDir = new URL('src/modules/', root);
let observerCount = 0;
for (const name of await readdir(modulesDir)) {
  if (!name.endsWith('.js')) continue;
  const text = await read(`src/modules/${name}`);
  observerCount += (text.match(/new\s+MutationObserver\s*\(/g) || []).length;
}
assert.equal(observerCount, 1, 'there must be exactly one runtime MutationObserver');

/* ── Runtime / storage ───────────────────────────────────────────────── */

const runtime = await read('src/modules/Runtime.js');
assert.match(runtime, /chrome\.storage\.local/, 'persistent extension state belongs in chrome.storage.local');
assert.match(runtime, /runtimeActive/, 'late reconciliation must be suppressible while disabled');
assert.match(runtime, /if \(!runtimeActive\) return false/, 'guard() must be inert while disabled');
assert.match(runtime, /export const raf/, 'RAF callbacks must still run their bookkeeping while disabled');

const db = await read('src/modules/ItemDatabase.js');
assert.doesNotMatch(code(db), /localStorage\.setItem/, 'skin data must never consume the game localStorage quota');
assert.match(db, /evictLegacyCache/, 'legacy page-origin cache should be reclaimed');

/* ── Stylesheet lifecycle / reversible inline ownership ─────────────── */

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
assert.doesNotMatch(styleOwner, /removeAttribute\(['"]style['"]\)/,
  'property ownership must never erase an entire native style attribute');

const painter = await read('src/modules/BackgroundPainter.js');
assert.match(painter, /createInlineStyleOwner/);
assert.match(painter, /styleOwner\.restoreAll\(\)/);
assert.doesNotMatch(painter, /style\.removeProperty/,
  'BackgroundPainter teardown must restore owned values, not blindly remove native declarations');
assert.match(painter, /SURFACE_SELECTOR/);
assert.match(painter, /isSurfaceCandidate/);

/* ── React-safe name annotation ──────────────────────────────────────── */

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

/* ── Inventory ItemRow ───────────────────────────────────────────────── */

const inventory = await read('src/modules/InventoryRenderer.js');
assert.match(inventory, /isInventoryContext\(row\)/,
  'generic market/bank/salvage rows must not be rebuilt as Inventory');
assert.match(inventory, /data-fs-preserved-action/,
  'real React controls must remain the action surface');
assert.match(inventory, /buildInventoryDetails/);
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

/* ── Skill detection / treatment ────────────────────────────────────── */

const watcher = await read('src/modules/DOMWatcher.js');
assert.doesNotMatch(watcher, /panel\.textContent\.slice/,
  'skill detection must not search arbitrary panel body text');
assert.match(watcher, /JSON\.stringify\(\[buttons, identities\]\)/,
  'skill cache must represent exact normalized detection signals');
const skillSigStart = watcher.indexOf('function skillSignature(panel)');
const skillSigEnd = watcher.indexOf('\n}', skillSigStart);
assert.doesNotMatch(watcher.slice(skillSigStart, skillSigEnd), /textContent[^\n]*\.length/,
  'equal-length skill action changes must invalidate the cache');
assert.match(watcher, /hasAction\('fight'\)/);
assert.match(watcher, /hasAction\('prospect'\).*jewelcrafting/s);
assert.match(watcher, /skillTypeFromIdentity/);
assert.match(watcher, /'jewel', 'jewelcrafting'/);
assert.match(watcher, /'spellcraft', 'spellcrafting'/);
assert.match(watcher, /hasAction\('tailor', 'sew', 'weave'\).*tailoring/s);

const skill = await read('src/modules/SkillPanelRenderer.js');
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
assert.match(skill, /labels: \['Spellcraft', 'Spellcrafting'\]/);
assert.match(skill, /actions: \['tailor', 'sew', 'weave'\]/);
assert.match(skill, /action-detail/);
assert.doesNotMatch(skill, /directChildren\.length === 3/);

const skillCSS = await read('src/styles/skillpanel.css');
assert.doesNotMatch(skillCSS, /border-top:\s*54px/);
assert.match(skillCSS, /data-iw-skill-layout=\"three-zone\"/);
assert.match(skillCSS, /data-iw-skill-role=\"level-progress\"/);
assert.match(skillCSS, /data-iw-readout\]::before/);

/* ── Shared UI / tooltip ─────────────────────────────────────────────── */

const ui = await read('src/modules/UIFoundation.js');
assert.doesNotMatch(ui, /new\s+MutationObserver/);
assert.match(ui, /main-nav/);
assert.match(ui, /player-hud/);
assert.match(ui, /hud-player-name/);
assert.match(ui, /hudOrderedTextCandidates/);
assert.match(ui, /iwHudLayout/);

const tooltip = await read('src/modules/TooltipEngine.js');
assert.match(tooltip, /<span class="iw-item-ref" role="button" tabindex="0"/);
assert.doesNotMatch(tooltip, /<button type="button" class="iw-item-ref"/);
assert.doesNotMatch(tooltip, /HIDE_GRACE|hideTimer|overPanel/);
assert.match(tooltip, /const EDGE_GAP\s*=\s*0/);
assert.match(tooltip, /STATE\.el\.style\.display\s*=\s*'none'/);
assert.doesNotMatch(tooltip, /el\.style\.opacity\s*=\s*['"]1['"]/);

/* ── Base theme safety ───────────────────────────────────────────────── */

const baseCSS = await read('src/styles/base.css');
assert.doesNotMatch(baseCSS, /\[class\*="card"\],\s*\[class\*="panel"\]/,
  'broad generic card/panel paint selector must stay removed');
assert.match(baseCSS, /--iw-r-panel:\s+3px/);
assert.match(baseCSS, /chat-name-/);
assert.match(baseCSS, /level-progress/);

/* ── Atlas correctness / dependency pin ─────────────────────────────── */

const atlas = await read('src/modules/AtlasService.js');
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

/* ── Build / manifest / test contract ───────────────────────────────── */

const build = await read('build-tools/build_recovered.py');
assert.match(build, /STANDALONE_CSS\s*=\s*set\(\)/,
  'base.css must be bundled as removable text rather than copied for manifest injection');

const manifest = JSON.parse(await read('manifest.json'));
assert.ok(manifest.permissions?.includes('storage'));
assert.ok(!JSON.stringify(manifest.host_permissions).includes('githubusercontent'));
assert.ok(manifest.web_accessible_resources?.some(r => r.resources?.includes('assets/*')));
assert.ok(!(manifest.content_scripts?.[0]?.css || []).includes('dist/base.css'),
  'runtime kill switch cannot remove manifest-declared CSS');

const pkg = JSON.parse(await read('package.json'));
assert.match(pkg.scripts?.test || '', /build_recovered\.py --allow-missing-assets/,
  'npm test must rebuild the bundle before smoke execution');
assert.match(pkg.scripts?.test || '', /node --check dist\/content\.bundle\.js/);
assert.ok(pkg.scripts?.['test:run'], 'raw regression suite should remain separately invokable by strict setup');

const distFiles = await readdir(new URL('dist/', root));
assert.ok(!distFiles.includes('base.css'), 'obsolete standalone dist/base.css must stay deleted');

const bundle = await read('dist/content.bundle.js');
assert.doesNotMatch(bundle, /sourceMappingURL=data:/);
assert.match(bundle, /__modules\["styles\/base\.css"\]/,
  'rebuilt production bundle must contain the runtime-owned base stylesheet module');
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
