#!/usr/bin/env node
/**
 * export-theme-constants.mjs
 *
 * Every value the extension's JavaScript writes into the page that is NOT a
 * plain literal in the source: sprite windows computed from the atlas index
 * JSON files, the per-zone button-art custom properties, the page-level zone
 * variables, the skill-icon windows, and so on. The game should emit these
 * values verbatim instead of re-deriving the arithmetic.
 *
 * It also re-exports the private lookup tables and inline-style maps the
 * modules keep as module-level constants (SKILL_META, BUTTON_STYLES, …). They
 * are read by bundling the REAL module with esbuild and exporting the
 * constant, so this output cannot drift from src/ the way a hand copy would.
 *
 * Usage (from the repository root):
 *   node handoff/native-render-migration/tools/export-theme-constants.mjs
 *   node handoff/native-render-migration/tools/export-theme-constants.mjs --asset-base=/static/fantasy/
 */
import { build } from 'esbuild';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [k, ...v] = arg.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const ASSET_BASE = String(args['asset-base'] ?? '/fantasy-skin/').replace(/\/?$/, '/');
const OUT = path.resolve(ROOT, String(args.out ?? 'handoff/native-render-migration/generated/theme-constants.json'));
const abs = rel => path.join(ROOT, rel);
/** The extension's assetUrl() for a repository-relative asset path. */
const assetUrl = rel => `${ASSET_BASE}${String(rel).replace(/^\/+/, '')}`;
const exists = async rel => { try { await access(abs(rel)); return true; } catch { return false; } };
const json = async rel => JSON.parse(await readFile(abs(rel), 'utf8'));

/**
 * Bundle one real module with its private constants exported, then import it.
 * CSS imports are stubbed (the modules import their sheet as text). No module
 * touched here has a top-level DOM side effect, which is checked by the fact
 * that the import succeeds in Node at all.
 */
async function extract(file, names) {
  const source = await readFile(abs(file), 'utf8');
  const contents = `${source}\nexport const __extracted = { ${names.join(', ')} };\n`;
  const result = await build({
    stdin: { contents, resolveDir: path.dirname(abs(file)), sourcefile: file, loader: 'js' },
    bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent',
    plugins: [{
      name: 'css-stub',
      setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'text' })); },
    }],
  });
  const code = result.outputFiles[0].text;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return mod.__extracted;
}

/** JSON-safe copy: regexes become {regex, flags}, Sets become arrays. */
function plain(value) {
  if (value instanceof RegExp) return { regex: value.source, flags: value.flags };
  if (value instanceof Set) return [...value].map(plain);
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, plain(v)]));
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  return value;
}

/* ── Source tables ─────────────────────────────────────────────────────── */

const zoneThemes = await import(pathToFileURL(abs('src/modules/zoneThemes.js')).href);
const village = await import(pathToFileURL(abs('src/modules/villageBuildings.js')).href);
const cadence = await import(pathToFileURL(abs('src/modules/ProgressCadence.js')).href);

const skillPanel = await extract('src/modules/SkillPanelRenderer.js', [
  'SKILL_META', 'FORGE', 'ACTION_ART', 'BUTTON_STYLES', 'NAV_BUTTON_W', 'READOUT_STYLES', 'INGR_STYLES',
  'LEVEL_PROGRESS_PATTERN', 'LEVEL_READOUT_LOOSE', 'XP_READOUT_TITLE', 'INGR_PATTERN', 'UNMET_CLASS',
]);
const skillsArt = await extract('src/modules/SkillsArtService.js', [
  'UI_TOKENS', 'ACTION_CAP_PX', 'SLICED_TOKENS', 'BUTTON_ART_KINDS', 'ICON_ALIASES', 'REVISED_BUTTON_ROOT',
  'TEXTURE_URL', 'NAV_PREV_URL', 'NAV_NEXT_URL',
]);
const quest = await extract('src/modules/QuestPanelRenderer.js', ['DISCIPLINE_STYLE', 'GENERIC_STYLE']);
const painter = await extract('src/modules/BackgroundPainter.js', ['GAME_NAVIES', 'SURFACE_SELECTOR', 'ourColour']);
const header = await extract('src/modules/HeaderRenderer.js', [
  'HEADER_ASSETS', 'ZONE_SURFACE_DIR', 'ZONE_SURFACE_MAX', 'THEME_ASSET_DIR', 'FALLBACK_VISUAL_THEME',
]);
const ui = await extract('src/modules/UIFoundation.js', [
  'NAV_LABELS', 'NAV_ROUTE_KEYS', 'SECTION_FRAME_NAMES', 'ACTIVITY_PANELS', 'DAILY_BOOST', 'TOOLKIT_URL',
]);
const v2 = await extract('src/modules/SkillCardDesignController.js', [
  'FRAME_SECTIONS', 'LABEL_CEILING_PX', 'LABEL_FLOOR_PX', 'LONG_ACTION_SECONDS',
]);
const bosses = await extract('src/modules/WorldBossPanels.js', ['BOSSES']);
const display = await extract('src/modules/itemDisplay.js', ['TIER_BANDS', 'CATEGORY_CLASS', 'CONSUMABLE_SUB_CLASS']);

/* ── <html> state per zone theme ───────────────────────────────────────── */

const revised = await json('assets/skills-ui/buttons/revised-v5/index.json');
const warnings = [];

/** SkillsArtService.applyThemeVariables(), value for value. */
function buttonThemeVars(visualTheme) {
  const vars = { '--iw-compact-atlas': `url("${assetUrl(`assets/skills-ui/buttons/compact-ghost-v3/${visualTheme}.png`)}")` };
  for (const kind of skillsArt.BUTTON_ART_KINDS) {
    const entry = revised.entries.find(item => item.key === kind.replace('action-secondary-', 'action-'));
    const image = `url("${assetUrl(`${skillsArt.REVISED_BUTTON_ROOT}/${visualTheme}.png`)}")`;
    const x = 100 * entry.x / (revised.width - entry.width);
    const y = 100 * entry.y / (revised.height - entry.height);
    const size = `${100 * revised.width / entry.width}% ${100 * revised.height / entry.height}%`;
    vars[`--iw-${kind}`] = image;
    vars[`--iw-${kind}-paint`] = `transparent ${image} ${x}% ${y}% / ${size} no-repeat`;
  }
  return vars;
}

const htmlRoot = {};
for (const theme of ['default', ...zoneThemes.THEME_NAMES]) {
  const real = theme === 'default' ? null : theme;
  const visual = real || header.FALLBACK_VISUAL_THEME;
  const attributes = {
    'data-iw-zone-theme': theme,
    'data-iw-compact-atlas': 'compact-ghost-v3',
    'data-iw-button-atlas': 'revised-v5',
    'data-iw-skill-card-design': 'new',
  };
  const inlineStyle = {};
  if (real) {
    inlineStyle['--iw-zone-atlas'] = `url("${assetUrl(`${header.THEME_ASSET_DIR}/theme_${real}.webp`)}")`;
    inlineStyle['--iw-corner-filigree'] = `url("${assetUrl(`${header.THEME_ASSET_DIR}/panel_corners_${real}.webp`)}")`;
    inlineStyle['--iw-zone-separator'] = `url("${assetUrl(`${header.THEME_ASSET_DIR}/separator_flourish_${real}.webp`)}")`;
    for (const file of [`theme_${real}.webp`, `panel_corners_${real}.webp`, `separator_flourish_${real}.webp`]) {
      if (!(await exists(`${header.THEME_ASSET_DIR}/${file}`))) warnings.push(`missing ${header.THEME_ASSET_DIR}/${file}`);
    }
  }
  Object.assign(inlineStyle, buttonThemeVars(visual));
  htmlRoot[theme] = { visualButtonTheme: visual, attributes, inlineStyle };
}

/* ── Skills UI atlas variables (SkillsArtService.applyUiVariables) ─────── */

const uiIndex = await json('assets/skills_ui_index.json');
const uiByKey = new Map(uiIndex.entries.map(e => [e.key, e]));
function spriteGeometry(index, entry) {
  const xRange = Math.max(1, index.width - entry.width);
  const yRange = Math.max(1, index.height - entry.height);
  return {
    image: `url("${assetUrl(`assets/${index.atlas}`)}")`,
    size: `${(index.width / entry.width) * 100}% ${(index.height / entry.height) * 100}%`,
    position: `${(entry.x / xRange) * 100}% ${(entry.y / yRange) * 100}%`,
  };
}
function bandGeometry(index, entry, offset, width) {
  const xRange = Math.max(1, index.width - width);
  const yRange = Math.max(1, index.height - entry.height);
  return {
    size: `${(index.width / width) * 100}% ${(index.height / entry.height) * 100}%`,
    position: `${((entry.x + offset) / xRange) * 100}% ${(entry.y / yRange) * 100}%`,
  };
}
const skillsUiVars = {
  '--fs-skills-panel-texture': `url("${assetUrl(skillsArt.TEXTURE_URL)}")`,
  '--fs-skills-ui-atlas': `var(--iw-zone-atlas, url("${assetUrl(`assets/${uiIndex.atlas}`)}"))`,
  '--fs-skills-nav-prev': `url("${assetUrl(skillsArt.NAV_PREV_URL)}")`,
  '--fs-skills-nav-next': `url("${assetUrl(skillsArt.NAV_NEXT_URL)}")`,
};
for (const [key, token] of Object.entries(skillsArt.UI_TOKENS)) {
  const entry = uiByKey.get(key);
  if (!entry) { warnings.push(`skills_ui_index.json has no "${key}"`); continue; }
  const sprite = spriteGeometry(uiIndex, entry);
  skillsUiVars[`--fs-ui-${token}-size`] = sprite.size;
  skillsUiVars[`--fs-ui-${token}-position`] = sprite.position;
  if (!skillsArt.SLICED_TOKENS.has(token)) continue;
  const cap = Math.min(skillsArt.ACTION_CAP_PX, Math.floor(entry.width / 2) - 1);
  const capLeft = bandGeometry(uiIndex, entry, 0, cap);
  const capRight = bandGeometry(uiIndex, entry, entry.width - cap, cap);
  const mid = bandGeometry(uiIndex, entry, cap, entry.width - cap * 2);
  skillsUiVars[`--fs-ui-${token}-cap-size`] = capLeft.size;
  skillsUiVars[`--fs-ui-${token}-cap-l-position`] = capLeft.position;
  skillsUiVars[`--fs-ui-${token}-cap-r-position`] = capRight.position;
  skillsUiVars[`--fs-ui-${token}-mid-size`] = mid.size;
  skillsUiVars[`--fs-ui-${token}-mid-position`] = mid.position;
  skillsUiVars['--fs-ui-action-cap-ratio'] = String(cap / entry.height);
}

/* ── Skill medallion icon windows (SkillsArtService.paintIcon) ─────────── */

const iconIndex = await json('assets/skills_icons_index.json');
const iconByKey = new Map(iconIndex.entries.map(e => [e.key, e]));
const skillIcons = {};
for (const type of Object.keys(skillPanel.SKILL_META)) {
  const entry = iconByKey.get(type) || iconByKey.get(skillsArt.ICON_ALIASES[type]) || iconByKey.get('generic');
  const g = spriteGeometry(iconIndex, entry);
  skillIcons[type] = {
    cell: entry.key,
    inlineStyle: {
      'background-image': g.image,
      'background-size': g.size,
      'background-position': g.position,
      'background-repeat': 'no-repeat',
    },
    attributes: { 'data-iw-skills-atlas': iconIndex.atlas, 'data-iw-skills-atlas-index': String(entry.index ?? '') },
  };
}

/* ── Item icon atlases (AtlasService._applySprite) ─────────────────────── */

const gear = await json('assets/gear_icons_manifest.json');
const csv = (await readFile(abs('assets/item_icons_index.csv'), 'utf8')).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const head = csv[0].split(',').map(h => h.trim());
const col = name => head.indexOf(name);
let maxX = 0, maxY = 0, cell = 0;
for (const line of csv.slice(1)) {
  const cells = line.split(',');
  const x = Number(cells[col('x')]), y = Number(cells[col('y')]);
  const w = Number(cells[col('width')]), h = Number(cells[col('height')]);
  if (!cell) cell = w || 128;
  maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
}
const itemAtlases = {
  gear: {
    image: `url("${assetUrl('assets/gear_icons_atlas.png')}")`,
    cols: gear.columns || 10, rows: gear.rows || 150, cell: gear.cell_size || 128, icons: gear.icons.length,
  },
  item: {
    image: `url("${assetUrl('assets/item_icons_atlas.png')}")`,
    cols: Math.max(1, Math.ceil(maxX / cell)), rows: Math.max(1, Math.ceil(maxY / cell)), cell, icons: csv.length - 1,
  },
  formula: 'atlasW = cols*cell; atlasH = rows*cell; background-size = `${atlasW/w*100}% ${atlasH/h*100}%`; background-position = `${(x/(atlasW-w)*100).toFixed(6)}% ${(y/(atlasH-h)*100).toFixed(6)}%` (0 when atlasW<=w / atlasH<=h); background-repeat: no-repeat. Resolution order: AtlasService.resolve().',
};

/* ── Header zone artwork (HeaderRenderer.applyZoneSurface) ─────────────── */

const zoneSurfaces = {};
for (let zone = 1; zone <= header.ZONE_SURFACE_MAX; zone += 1) {
  const wide = `${header.ZONE_SURFACE_DIR}/zone_${zone}.webp`;
  const mobile = `${header.ZONE_SURFACE_DIR}/zone_${zone}_mobile.webp`;
  zoneSurfaces[zone] = {
    theme: zoneThemes.zoneTheme(zone),
    '--iw-header-surface': `url("${assetUrl(wide)}")`,
    '--iw-header-surface-mobile': `url("${assetUrl(mobile)}")`,
    fileExists: { wide: await exists(wide), mobile: await exists(mobile) },
  };
  if (!zoneSurfaces[zone].fileExists.wide) warnings.push(`missing ${wide} (the extension would still point at it)`);
  if (!zoneSurfaces[zone].fileExists.mobile) warnings.push(`missing ${mobile} (the extension would still point at it)`);
}
const fallbackSurface = `url("${assetUrl(header.HEADER_ASSETS.headerSurface)}")`;

/* ── Background repaint (BackgroundPainter) ────────────────────────────── */

const navyMap = Object.fromEntries([...painter.GAME_NAVIES].map(hex => [hex, painter.ourColour(hex)]));

/* ── Skill-card control plates: the FINAL inline maps ──────────────────── */
/*
 * SkillPanelRenderer.styleButton() writes, in order and all `!important`:
 *   BUTTON_STYLES.base, then BUTTON_STYLES[state] merged with ACTION_ART (the
 *   action button only, once the card's atlas variables are present), then the
 *   role geometry. A later write of the same property wins, and no map pairs a
 *   shorthand with its own longhand, so a merged object IS the final inline
 *   style. `compact` is always true now: V2 is the only card design
 *   (html[data-iw-skill-card-design="new"]).
 */
function finalButtonInline(role, state) {
  const B = skillPanel.BUTTON_STYLES;
  const F = skillPanel.FORGE;
  const out = { ...B.base, ...B[state] };
  if (role === 'action-button') Object.assign(out, skillPanel.ACTION_ART[state === 'disabled' ? 'disabled' : 'idle']);
  if (role === 'nav-button') Object.assign(out, {
    width: 'var(--iw-skill-v2-nav-w, 39px)', 'min-width': 'var(--iw-skill-v2-nav-w, 39px)',
    height: 'var(--iw-skill-v2-nav-h, 22px)', 'min-height': 'var(--iw-skill-v2-nav-h, 22px)',
    padding: '0', background: `var(--fs-button-background, ${F.bg})`, border: `var(--fs-button-border, ${F.border})`,
    'border-radius': 'var(--iw-skill-v2-nav-radius, 2px)', 'box-shadow': `var(--fs-button-shadow, ${F.shadow})`,
    color: 'transparent', 'font-size': '0',
  });
  if (role === 'action-button') Object.assign(out, {
    width: 'var(--iw-skill-v2-btn-w, 90px)', 'min-width': 'var(--iw-skill-v2-btn-w, 90px)',
    height: 'var(--iw-skill-v2-btn-h, 94px)', 'min-height': 'var(--iw-skill-v2-btn-h, 94px)',
    padding: 'var(--iw-skill-v2-btn-pad, 44px 4px 8px)',
    'font-size': 'var(--iw-skill-v2-btn-font, 0px)', 'letter-spacing': 'var(--iw-skill-v2-btn-tracking, 0.09em)',
    border: 'var(--fs-button-border, 3px double #96bddf)', 'box-shadow': 'var(--fs-button-shadow, none)', 'border-radius': '8px',
  });
  return out;
}
const skillButtonFinalInline = {
  note: 'Every value is written inline with !important (chapter 3 §3.8). data-iw-btn-state = the state key. The XP readout button (role level-progress) takes NONE of these; it takes skillReadoutInlineStyle instead.',
  'action-button': { primary: finalButtonInline('action-button', 'primary'), disabled: finalButtonInline('action-button', 'disabled') },
  'nav-button': Object.fromEntries(['icon', 'secondary', 'primary', 'disabled'].map(s => [s, finalButtonInline('nav-button', s)])),
  other: Object.fromEntries(['secondary', 'primary', 'disabled', 'icon'].map(s => [s, finalButtonInline('other', s)])),
};

/* ── Which skin attributes the CSS actually reads ──────────────────────── */
/*
 * Every `data-iw-*` / `data-fs-*` name the modules write, split by whether any
 * shipped stylesheet selects on it. A name no rule selects on carries no paint:
 * it is the extension's own bookkeeping (a rebuild signature, a "pending"
 * flag, a cache key). The native render never needs those, and
 * diff-parity.mjs ignores them by default.
 */
const { readdir } = await import('node:fs/promises');
const moduleFiles = (await readdir(abs('src/modules'))).filter(f => f.endsWith('.js'));
const written = new Set();
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
for (const file of moduleFiles) {
  const text = await readFile(abs(`src/modules/${file}`), 'utf8');
  for (const m of text.matchAll(/\bdata-(?:iw|fs)-[a-z0-9-]*[a-z0-9]/g)) written.add(m[0]);
  for (const m of text.matchAll(/dataset\.((?:iw|fs)[A-Z][A-Za-z0-9]*)/g)) written.add(`data-${kebab(m[1])}`);
  // Helpers such as setOwnData(el, 'iwSkillArtReady', '1') pass the dataset
  // key as a string literal.
  for (const m of text.matchAll(/['"]((?:iw|fs)[A-Z][A-Za-z0-9]*)['"]/g)) written.add(`data-${kebab(m[1])}`);
}
const shippedCss = ['base.css', 'tooltip-engine.css', 'inventory.css', 'skillpanel.css', 'skillcard-v2.css',
  'skillcard-v2-runtime-safe.css', 'card-button-atlas.css', 'card-buttons.css', 'header.css', 'overlay.css',
  'ui-system.css', 'compact-buttons.css', 'village-scene.css', 'collapsible.css'];
let cssText = '';
for (const f of shippedCss) cssText += await readFile(abs(`src/styles/${f}`), 'utf8');
// Selected on (`[name…]`) OR printed by `content: attr(name)` — the second is
// how cleaned titles, reward chips and glyphs reach the screen.
const selectedByCss = name => new RegExp(`\\[${name}(?=[\\]=~^$*|\\s])|attr\\(\\s*${name}\\s*[),]`).test(cssText);
const attributesUsedByCss = [...written].filter(selectedByCss).sort();
const bookkeepingAttributes = [...written].filter(n => !selectedByCss(n)).sort();
// Of the attributes the CSS reads, those it only ever tests for PRESENCE
// (`[name]`, never `[name="…"]` and never `attr(name)`): any value paints the
// same. diff-parity.mjs compares these by presence only.
const presenceOnlyAttributes = attributesUsedByCss.filter(name => {
  const uses = [...cssText.matchAll(new RegExp(`\\[${name}(\\s*[~|^$*]?=[^\\]]*)?\\]`, 'g'))];
  return uses.length && uses.every(m => !m[1]) && !new RegExp(`attr\\(\\s*${name}\\s*[),]`).test(cssText);
});

// capture-parity.js carries its own copy of the bookkeeping list (a DevTools
// snippet cannot read this file). Fail loudly if the two drift.
{
  const snippet = await readFile(abs('handoff/native-render-migration/tools/capture-parity.js'), 'utf8');
  const m = /const BOOKKEEPING = new Set\(\[([^\]]*)\]\)/.exec(snippet);
  const embedded = m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort() : [];
  if (JSON.stringify(embedded) !== JSON.stringify(bookkeepingAttributes)) {
    console.error('capture-parity.js BOOKKEEPING list is out of date. Replace it with:');
    console.error(bookkeepingAttributes.map(n => `'${n}'`).join(', '));
    process.exit(1);
  }
}

/* ── Self-check against the REAL SkillsArtService ──────────────────────── */
/*
 * The arithmetic above is a copy, so it is checked against the module itself:
 * the real SkillsArtService is bundled, `fetch` is pointed at the local asset
 * files, and its own decoratePanel / applyThemeVariables / paintIcon write
 * into fake elements. Every value must match. `--no-verify` skips this.
 */
async function verifyAgainstModule() {
  const mismatches = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const rel = String(url).replace(/^\/+/, '');
    try {
      const body = await readFile(abs(rel), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
    } catch {
      return { ok: false, status: 404, json: async () => null, text: async () => '' };
    }
  };
  try {
    const { SkillsArtService } = await extract('src/modules/SkillsArtService.js', ['SkillsArtService']);
    await SkillsArtService.ready();
    const fake = () => {
      const props = new Map();
      return {
        props,
        dataset: {},
        style: {
          setProperty(k, v) { props.set(k, v); },
          removeProperty(k) { props.delete(k); },
          set backgroundImage(v) { props.set('background-image', v); },
          set backgroundSize(v) { props.set('background-size', v); },
          set backgroundPosition(v) { props.set('background-position', v); },
          set backgroundRepeat(v) { props.set('background-repeat', v); },
        },
      };
    };
    // The module runs without chrome.runtime, so its assetUrl() returns the
    // bare repository path; map it onto this export's asset base to compare.
    const rebase = v => String(v).replaceAll('url("assets/', `url("${ASSET_BASE}assets/`);
    const compare = (label, mine, theirs) => {
      const keys = new Set([...Object.keys(mine), ...theirs.keys()]);
      for (const key of keys) {
        const a = mine[key];
        const b = theirs.has(key) ? rebase(theirs.get(key)) : undefined;
        if (a !== b) mismatches.push(`${label} ${key}: export=${a} module=${b}`);
      }
    };

    const panel = fake();
    SkillsArtService.decoratePanel(panel);
    compare('skillsUi', skillsUiVars, panel.props);

    for (const [theme, state] of Object.entries(htmlRoot)) {
      const html = fake();
      SkillsArtService.applyThemeVariables(html, state.visualButtonTheme);
      const mine = Object.fromEntries(Object.entries(state.inlineStyle).filter(([k]) => !/^--iw-(zone-atlas|corner-filigree|zone-separator)$/.test(k)));
      compare(`htmlRoot[${theme}]`, mine, html.props);
    }

    for (const [type, icon] of Object.entries(skillIcons)) {
      const host = fake();
      SkillsArtService.paintIcon(host, type);
      compare(`skillIcons[${type}]`, icon.inlineStyle, host.props);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  return mismatches;
}

if (!args['no-verify']) {
  const mismatches = await verifyAgainstModule();
  if (mismatches.length) {
    console.error(`${mismatches.length} value(s) differ from the real SkillsArtService:`);
    for (const m of mismatches.slice(0, 40)) console.error(`  ${m}`);
    process.exit(1);
  }
  console.log('  verified: skills-ui, per-theme button and skill-icon values match the real SkillsArtService');
}

/* ── Every asset the theme can request at runtime ──────────────────────── */
/*
 * The union of what the exported CSS references and what the JS-emitted values
 * above point at, plus the index files a verbatim port of AtlasService /
 * SkillsArtService reads. This is the list to host — nothing else under
 * assets/ is requested by the shipped theme.
 */
const { stat } = await import('node:fs/promises');
const runtime = new Map();
const addAsset = (rel, why) => {
  const key = rel.replace(/^\/+/, '');
  if (!runtime.has(key)) runtime.set(key, new Set());
  runtime.get(key).add(why);
};
try {
  const cssManifest = JSON.parse(await readFile(abs('handoff/native-render-migration/generated/theme-css/manifest.json'), 'utf8'));
  for (const a of cssManifest.assets) addAsset(a.path, 'css');
} catch {
  warnings.push('generated/theme-css/manifest.json missing: run export-theme-css.mjs first for a complete runtimeAssets list');
}
const urlPath = value => [...String(value).matchAll(/url\("([^"]+)"\)/g)].map(m => m[1].slice(ASSET_BASE.length));
for (const state of Object.values(htmlRoot)) for (const v of Object.values(state.inlineStyle)) urlPath(v).forEach(p => addAsset(p, 'html-root'));
for (const v of Object.values(skillsUiVars)) urlPath(v).forEach(p => addAsset(p, 'skills-ui vars'));
for (const icon of Object.values(skillIcons)) urlPath(icon.inlineStyle['background-image']).forEach(p => addAsset(p, 'skill medallion'));
for (const z of Object.values(zoneSurfaces)) {
  if (z.fileExists.wide) urlPath(z['--iw-header-surface']).forEach(p => addAsset(p, 'header zone art'));
  if (z.fileExists.mobile) urlPath(z['--iw-header-surface-mobile']).forEach(p => addAsset(p, 'header zone art'));
}
addAsset(header.HEADER_ASSETS.headerCrest, 'header crest');
addAsset(header.HEADER_ASSETS.headerSurface, 'header fallback / zone bar scene');
addAsset('assets/gear_icons_atlas.png', 'item icons');
addAsset('assets/item_icons_atlas.png', 'item icons');
for (const entry of [...Object.values(village.VILLAGE_BUILDINGS), ...Object.values(village.VILLAGE_HOUSES)]) addAsset(`assets/${entry.file}`, 'village art');
for (const index of ['assets/gear_icons_manifest.json', 'assets/item_icons_index.csv', 'assets/skills_icons_index.json',
  'assets/skills_ui_index.json', 'assets/skills-ui/buttons/revised-v5/index.json']) addAsset(index, 'index (only if you port the resolver code verbatim)');
const runtimeAssets = [];
let runtimeBytes = 0;
for (const [rel, why] of [...runtime].sort((a, b) => a[0].localeCompare(b[0]))) {
  let bytes = null;
  try { bytes = (await stat(abs(rel))).size; runtimeBytes += bytes; } catch { warnings.push(`runtime asset missing: ${rel}`); }
  runtimeAssets.push({ path: rel, bytes, usedBy: [...why] });
}

/* ── Output ────────────────────────────────────────────────────────────── */

const out = {
  generatedBy: 'handoff/native-render-migration/tools/export-theme-constants.mjs',
  assetBase: ASSET_BASE,
  readme: 'Values the extension computes at runtime, precomputed. Emit them verbatim. Keys are referenced by chapter from handoff/native-render-migration/.',
  htmlRoot,
  zoneThemes: { byZone: zoneThemes.ZONE_THEMES, themes: zoneThemes.THEME_NAMES, fallbackVisualButtonTheme: header.FALLBACK_VISUAL_THEME },
  header: {
    crest: { '--iw-header-crest': `url("${assetUrl(header.HEADER_ASSETS.headerCrest)}")` },
    zoneBarScene: { '--iw-zone-scene': fallbackSurface },
    fallbackSurface: { '--iw-header-surface': fallbackSurface, '--iw-header-surface-mobile': fallbackSurface },
    zoneSurfaces,
  },
  skillsUi: { attribute: { 'data-iw-skills-ui-ready': '1' }, inlineStyle: skillsUiVars },
  skillIcons,
  itemAtlases,
  skillMeta: plain(skillPanel.SKILL_META),
  skillButtonInlineStyles: plain({
    FORGE: skillPanel.FORGE,
    BUTTON_STYLES: skillPanel.BUTTON_STYLES,
    ACTION_ART: skillPanel.ACTION_ART,
    NAV_BUTTON_W: skillPanel.NAV_BUTTON_W,
  }),
  skillButtonFinalInline: plain(skillButtonFinalInline),
  skillReadoutInlineStyle: plain(skillPanel.READOUT_STYLES),
  skillIngredientInlineStyle: plain(skillPanel.INGR_STYLES),
  skillPatterns: plain({
    LEVEL_PROGRESS_PATTERN: skillPanel.LEVEL_PROGRESS_PATTERN,
    LEVEL_READOUT_LOOSE: skillPanel.LEVEL_READOUT_LOOSE,
    XP_READOUT_TITLE: skillPanel.XP_READOUT_TITLE,
    INGR_PATTERN: skillPanel.INGR_PATTERN,
    UNMET_CLASS: skillPanel.UNMET_CLASS,
  }),
  skillCardV2: plain(v2),
  questDiscipline: plain({ table: quest.DISCIPLINE_STYLE, generic: quest.GENERIC_STYLE }),
  navigation: plain(ui),
  worldBosses: plain(bosses.BOSSES),
  itemDisplay: plain(display),
  village: { buildings: village.VILLAGE_BUILDINGS, houses: village.VILLAGE_HOUSES },
  progressCadence: {
    PROGRESS_EPSILON: cadence.PROGRESS_EPSILON,
    PROGRESS_LEAD_BIAS: cadence.PROGRESS_LEAD_BIAS,
    PROGRESS_DURATION_EPSILON_MS: cadence.PROGRESS_DURATION_EPSILON_MS,
  },
  runtimeAssets: { count: runtimeAssets.length, bytes: runtimeBytes, files: runtimeAssets },
  skinAttributes: {
    note: 'usedByCss: a shipped stylesheet selects on the name, so it must be emitted exactly. bookkeeping: written by the extension for its own caching/state and selected by no stylesheet; never needed natively (diff-parity.mjs ignores them).',
    usedByCss: attributesUsedByCss,
    presenceOnly: presenceOnlyAttributes,
    bookkeeping: bookkeepingAttributes,
  },
  backgroundRepaint: {
    surfaceSelector: painter.SURFACE_SELECTOR,
    backgroundColorMap: navyMap,
    borderColorForAnyNavySide: '#342D20',
    priority: 'important',
  },
  warnings,
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`Wrote ${path.relative(ROOT, OUT)} (asset base "${ASSET_BASE}")`);
console.log(`  html root states: ${Object.keys(htmlRoot).length}, skills-ui vars: ${Object.keys(skillsUiVars).length}, skill icons: ${Object.keys(skillIcons).length}, zones: ${Object.keys(zoneSurfaces).length}`);
if (warnings.length) {
  console.log(`  ${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`    - ${w}`);
}
