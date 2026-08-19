import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async rel => readFile(new URL(rel, root), 'utf8');

/**
 * Strip comments so a "do not do X" assertion cannot be tripped by a comment
 * explaining why X is forbidden. Crude but sufficient for this source tree.
 */
const code = text => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const content = await read('src/content.js');
// Match the identifier at its call site rather than a literal `name()`, so the
// invariant survives the guard(...) wrapping introduced for error isolation.
const callSite = (text, name) => text.indexOf(name, text.indexOf('function boot()'));
const watcherAt = callSite(content, 'startWatcher');
assert.ok(callSite(content, 'initTooltipEngine') < watcherAt, 'tooltip engine must register before watcher');
assert.ok(callSite(content, 'initInventoryRenderer') < watcherAt, 'inventory listener must register before watcher');
assert.ok(callSite(content, 'initSkillPanelRenderer') < watcherAt, 'skill listener must register before watcher');
assert.ok(callSite(content, 'initUIFoundation') < watcherAt, 'UI foundation must register before watcher');
assert.match(content, /iw-skin-enabled/, 'the skin must be disableable at runtime without uninstalling');
assert.match(content, /function teardown\(\)/, 'a disable path must actually restore the native page');

const modulesDir = new URL('src/modules/', root);
let observerCount = 0;
for (const name of await readdir(modulesDir)) {
  if (!name.endsWith('.js')) continue;
  const text = await read(`src/modules/${name}`);
  observerCount += (text.match(/new\s+MutationObserver\s*\(/g) || []).length;
}
assert.equal(observerCount, 1, 'there must be exactly one MutationObserver in runtime modules');


const ui = await read('src/modules/UIFoundation.js');
assert.doesNotMatch(ui, /new\s+MutationObserver/, 'UI foundation must use the central DOMWatcher');
assert.match(ui, /data-iw-ui|dataset\.iwUi/, 'UI foundation should classify existing game nodes semantically');
assert.match(ui, /main-nav/, 'main navigation rail must be classified');
assert.match(ui, /player-hud/, 'player HUD must be classified');
assert.match(ui, /hud-player-name/, 'HUD must explicitly classify the player name so native dark text cannot disappear');
assert.match(ui, /iwHudPlayerText/, 'HUD must mark the actual detected player-name text node, not only its wrapper');
assert.match(ui, /button,a,\[role=\"button\"\]/, 'HUD name discovery must include clickable player-name controls');
assert.match(ui, /hudOrderedTextCandidates/, 'HUD name detection should use structural DOM order, not font size alone');
assert.match(ui, /markPlayerName/, 'HUD must force the entire detected cosmetic-name branch readable');
assert.match(ui, /iwHudLayout/, 'HUD should only opt verified DOM shapes into the compact three-zone layout');
assert.match(ui, /zone-bar/, 'zone controls should receive the shared compact command treatment');

const uiCSS = await read('src/styles/ui-system.css');
assert.match(uiCSS, /\[data-iw-ui="main-nav"\]/, 'shared UI CSS must include a joined main navigation rail');
assert.match(uiCSS, /\[data-iw-ui="player-hud"\]/, 'shared UI CSS must include a player HUD treatment');
assert.match(uiCSS, /\[data-iw-ui="hud-player-name"\]/, 'player name semantic styling may retain typography without replacing native cosmetic paint');
assert.match(uiCSS, /data-iw-hud-player-text="1"/, 'player-name semantic styling should remain non-destructive');
assert.doesNotMatch(uiCSS, /hud-player-name[^}]*background-image:\s*none/si, 'player-name rules must not destroy native cosmetic gradients');
assert.match(uiCSS, /\[data-iw-ui="hud-status"\]/, 'HUD status metrics should collapse into a shared rail');
assert.match(uiCSS, /\[data-iw-ui="main-nav-shell"\]/, 'oversized native navigation shell should be flattened');
assert.match(uiCSS, /\[data-iw-ui="nav-tab"\]\[data-iw-state="active"\]/, 'active nav tab needs a deterministic state treatment');

const inventory = await read('src/modules/InventoryRenderer.js');
assert.ok(inventory.indexOf('if (!data.name)') < inventory.indexOf('row.setAttribute(RENDERED_ATTR'), 'inventory must not mark an empty row rendered');
assert.match(inventory, /iw:item-db-updated/);
assert.match(inventory, /iw:atlas-updated/);
assert.match(inventory, /data-fs-preserved-action/);
assert.match(inventory, /isInventoryContext\(row\)/, 'generic item rows must be gated to actual inventory context');
assert.match(inventory, /data-fs-action-host/, 'mixed action hosts must be flattened rather than displayed twice');
assert.match(inventory, /buildInventoryDetails/, 'inventory must preserve dynamic owned-item state through the tested presentation model');
assert.match(inventory, /data-iw-inventory-root/, 'inventory chrome must be scoped to a positively identified Inventory root');
assert.match(inventory, /data-iw-tooltip-trigger/, 'inventory icon must opt into the delegated tooltip engine without inheriting inline-link CSS');
assert.doesNotMatch(inventory, /host\.setAttribute\(['"]role['"],\s*['"]button['"]\)/, 'inventory atlas icon must not become a generic role=button surface that masks its background image');
assert.match(inventory, /classifyActionControl/, 'real React controls must receive semantic action kinds rather than fabricated replacements');

const inventoryCSS = await read('src/styles/inventory.css');
assert.match(inventoryCSS, /\.fs-inv-body\s*\{[^}]*overflow:\s*hidden/s, 'inventory body must contain malformed/native long details instead of drawing beneath actions');
assert.match(inventoryCSS, /\.fs-inv-detail[^}]*text-overflow:\s*ellipsis/s, 'individual dynamic detail lines must not overflow the action rail');

const scanner = await read('src/modules/NameScanner.js');
assert.doesNotMatch(scanner, /iwScanned|data-iw-scanned/);
assert.match(scanner, /ItemDatabase\.revision\(\)/);
// The single most important invariant in the project. React holds direct
// references to the text nodes it created; replacing one throws NotFoundError on
// unmount, or silently strands a detached node so the visible text goes stale.
// Either is a functionality change. (Audit S1.4)
assert.doesNotMatch(code(scanner), /replaceChild|appendChild|insertBefore|removeChild/,
  'name annotation must never mutate the game DOM');
assert.doesNotMatch(code(scanner), /\.innerHTML/, 'name annotation must not write markup into game nodes');
assert.match(scanner, /CSS\.highlights/, 'annotation must be painted, not injected');

const runtime = await read('src/modules/Runtime.js');
assert.match(runtime, /chrome\.storage\.local/, 'persistent state belongs in extension-private storage');
assert.match(runtime, /export function guard\b/, 'consumers must be individually isolated');

const db = await read('src/modules/ItemDatabase.js');
assert.doesNotMatch(code(db), /localStorage\.setItem/, 'the skin must never write into the page origin storage quota');
assert.match(db, /evictLegacyCache/, 'a pre-1.6.0 cache must be reclaimed from the page origin');

const painter = await read('src/modules/BackgroundPainter.js');
assert.doesNotMatch(painter, /iwPainted\)\s*return|dataset\.iwPainted\s*\)\s*return/);
assert.match(painter, /SURFACE_SELECTOR/, 'background painting should be limited to structural surfaces');
assert.match(painter, /isSurfaceCandidate/, 'background painting should not treat every descendant as a surface');

const skill = await read('src/modules/SkillPanelRenderer.js');
assert.doesNotMatch(skill, /new\s+MutationObserver/);
assert.match(skill, /buttonStyleSnapshots/);
assert.doesNotMatch(skill, /wrapper\.appendChild\(panel\)/, 'renderer must not wrap React-owned skill panels');
assert.match(skill, /if \(!SKILL_META\[skillType\]\)/, 'unknown compact panels must not receive skill chrome');
assert.match(skill, /data-iw-skill-role|ROLE_ATTR/, 'skill renderer must attach semantic role markers');
assert.match(skill, /iwSkillLayout/, 'skill renderer should only opt verified DOM shapes into rigid layout');
assert.match(skill, /readoutBranch/, 'skill readout neutralisation must walk the safe visual branch, not exact-text wrappers only');
assert.match(skill, /LEVEL_PROGRESS_PATTERN/, 'skill XP readout must be positively identified before visual neutralisation');
assert.match(skill, /levelProgressButton/, 'live XP button must be identified before generic button styling');
assert.match(skill, /role === 'level-progress'/, 'generic skill button painter must explicitly skip XP data buttons');
assert.doesNotMatch(skill, /directChildren\.length === 3/, 'skill layout must not depend on an exact direct-child count');
assert.match(skill, /unexpectedFlowChild/, 'skill layout should ignore decorative non-flow children but reject unknown functional branches');

const watcher = await read('src/modules/DOMWatcher.js');
assert.doesNotMatch(watcher, /panel\.textContent\.slice/, 'skill detection must not search arbitrary panel body text');
assert.match(watcher, /hasAction\('fight'\)/, 'skill detection should use positive action signals');
assert.match(watcher, /hasAction\('prospect'\).*jewelcrafting/s, 'Prospect must resolve to Jewelcrafting, not Mining');
assert.match(watcher, /hasAction\('enchant'\).*spellcrafting/s, 'Spellcrafting action should be recognized');
assert.match(watcher, /hasAction\('tailor', 'sew'\).*tailoring/s, 'Tailoring action should be recognized');

const skillCSS = await read('src/styles/skillpanel.css');
assert.doesNotMatch(skillCSS, /border-top:\s*54px/, 'phantom skill-header spacer must be gone');
assert.doesNotMatch(skillCSS, /data-fs-skill-flavour/, 'skill flavour pseudo-header must not reserve UI space');
assert.match(skillCSS, /\.compact-panel\.fs-skill-panel::before/);
assert.match(skillCSS, /data-iw-skill-layout=\"three-zone\"/, 'skill CSS should provide an aligned three-zone layout when verified');
assert.match(skillCSS, /data-iw-skill-role=\"progress-track\"/, 'skill progress bars must use the shared action-frame role');

assert.match(skillCSS, /\.compact-panel\.fs-skill-panel::after\s*\{\s*content:\s*none/, 'large watermark glyph must remain removed');
assert.match(skillCSS, /data-iw-skill-role=\"level-progress\"/, 'XP readout must be treated as flat data');
assert.match(skillCSS, /\[data-iw-readout\]/, 'all nested XP readout shells must be flattened');
assert.match(skillCSS, /data-iw-readout\]::before/, 'readout pseudo-element frames must be disabled');

const tooltip = await read('src/modules/TooltipEngine.js');
assert.match(tooltip, /<span class="iw-item-ref" role="button" tabindex="0"/, 'inline item refs must not be native buttons');
assert.doesNotMatch(tooltip, /<button type="button" class="iw-item-ref"/, 'native inline item buttons cause game button styling leakage');
assert.doesNotMatch(tooltip, /HIDE_GRACE|hideTimer|overPanel/, 'desktop tooltips must not use grace-period ownership');
assert.match(tooltip, /const EDGE_GAP\s*=\s*0/, 'interactive tooltip must touch its trigger so direct hover handoff needs no linger timer');
assert.match(tooltip, /STATE\.el\.style\.display\s*=\s*'none'/, 'hide must physically remove the tooltip from rendering immediately');
assert.doesNotMatch(tooltip, /el\.style\.opacity\s*=\s*['"]1['"]/, 'positioning must never write inline opacity:1 that defeats the closed CSS state');
assert.match(tooltip, /isOpen\(\) && !activeSurfaceForNode\(e\.target\)\) hide\(\)/, 'open desktop tooltips must continuously enforce pointer ownership');
assert.match(tooltip, /nodeInside\(STATE\.el, e\.relatedTarget\)/, 'trigger-to-tooltip handoff must preserve the card only when the pointer enters the card directly');
assert.match(tooltip, /data-iw-tooltip-trigger/, 'non-text item surfaces such as inventory icons must be able to opt into the delegated tooltip engine');
const tooltipCSS = await read('src/styles/tooltip-engine.css');
assert.match(tooltipCSS, /transition:\s*none/, 'tooltip hide must not visibly linger through an opacity transition');

const baseCSS = await read('src/styles/base.css');
assert.doesNotMatch(baseCSS, /\[class\*="card"\],\s*\[class\*="panel"\]/, 'broad generic card/panel paint selector must stay removed');
assert.match(baseCSS, /rounded-3xl/, 'large dashboard radii should be normalized');
assert.match(baseCSS, /--iw-r-panel:\s+3px/, 'panel geometry token should be explicit and compact');
assert.match(baseCSS, /chat-name-/, 'native cosmetic player-name buttons must be excluded from generic button chrome');
assert.match(baseCSS, /level-progress/, 'XP data buttons must be excluded from generic button chrome');

const atlas = await read('src/modules/AtlasService.js');
// v1.6.0 supersedes the "pin the GitHub revision" invariant with a stronger one:
// there is no remote origin at runtime at all. Atlas images used to be applied as
// `background-image: url(https://raw.githubusercontent.com/...)`, a request made
// by the PAGE and therefore governed by the game's img-src CSP rather than by our
// host_permissions. (Audit S1.1)
assert.doesNotMatch(atlas, /https:\/\/raw\.githubusercontent\.com/, 'runtime must not fetch atlas assets from a remote origin');
assert.match(atlas, /assetUrl\('assets\/gear_icons_atlas\.png'\)/, 'gear atlas must resolve from the extension bundle');
assert.match(atlas, /assetUrl\('assets\/item_icons_atlas\.png'\)/, 'item atlas must resolve from the extension bundle');
assert.match(atlas, /REQUIRED_ITEM_COLUMNS/, 'item index schema drift must fail loudly, not paint every icon as cell 0,0');

// The revision pin still exists — it now governs what `npm run vendor` downloads.
const vendor = await read('build-tools/vendor-assets.mjs');
assert.match(vendor, /c4695b7f5519789558b0d72fa85e60338070e4b5/, 'vendored asset revision must be immutable');

const manifest = JSON.parse(await read('manifest.json'));
assert.ok(manifest.permissions?.includes('storage'), 'extension-private storage requires the storage permission');
assert.ok(!JSON.stringify(manifest.host_permissions).includes('githubusercontent'),
  'the GitHub host permission is obsolete once assets are bundled');
assert.ok(manifest.web_accessible_resources?.some(r => r.resources?.includes('assets/*')),
  'bundled atlases and fonts must be reachable from the page');
assert.ok(manifest.content_scripts?.[0]?.css?.includes('dist/base.css'),
  'base theme must ship declaratively so it applies before first paint');

const bundle = await read('dist/content.bundle.js');
assert.doesNotMatch(bundle, /sourceMappingURL=data:/);
const bundleStat = await stat(new URL('dist/content.bundle.js', root));
// Raised from 205k for v1.6.0: adds Runtime.js, the rewritten non-destructive
// NameScanner, teardown paths, and their rationale comments. The point of this
// ceiling is to catch an accidental inline source map or a bundled binary, not
// to discourage documentation.
assert.ok(bundleStat.size < 240_000, `production bundle unexpectedly large: ${bundleStat.size}`);

console.log('PASS static lifecycle + visual invariants');
