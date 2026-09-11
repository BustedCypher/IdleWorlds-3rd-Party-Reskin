/**
 * SkillsArtService
 *
 * Owns the dedicated Skills artwork atlases generated for the redesigned
 * action cards. Sprite geometry comes from committed JSON indexes rather than
 * hard-coded atlas coordinates.
 */

import { assetUrl, warnOnce } from './Runtime.js';
import revisedButtonAtlas from '../../assets/skills-ui/buttons/revised-v5/index.json' with { type: 'json' };

const ICON_INDEX_URL = 'assets/skills_icons_index.json';
const UI_INDEX_URL = 'assets/skills_ui_index.json';
const TEXTURE_URL = 'assets/skills_panel_texture.webp';
const NAV_PREV_URL = 'assets/skills_nav_prev.svg';
const NAV_NEXT_URL = 'assets/skills_nav_next.svg';
const BUTTON_THEME_ROOT = 'assets/skills-ui/buttons/exact-v3';
const REVISED_BUTTON_ROOT = 'assets/skills-ui/buttons/revised-v5';
const BUTTON_ART_KINDS = Object.freeze([
  'action-idle', 'action-hover', 'action-clicked',
  'action-secondary-idle', 'action-secondary-hover', 'action-secondary-clicked',
  'chevron-prev-idle', 'chevron-prev-hover', 'chevron-prev-clicked',
  'chevron-next-idle', 'chevron-next-hover', 'chevron-next-clicked',
]);

const UI_TOKENS = {
  medallion_frame: 'medallion-frame',
  nav_frame_idle: 'nav-idle',
  nav_frame_active: 'nav-active',
  action_frame_idle: 'action-idle',
  action_frame_disabled: 'action-disabled',
  corner_filigree: 'corner',
  xp_plaque: 'xp-plaque',
  horizontal_separator: 'separator',
  separator_flourish: 'flourish',
};
/**
 * The action frame is the one control on the page whose LABEL LENGTH is not
 * the skin's to control: a quest turn-in reads "Turn In" on one card and
 * "Turn In All (38)" on the next, and the count is live. A percentage sprite
 * window stretches its cell to EXACTLY fill the box, so a wider button drags
 * the frame's end flourishes inward over the label -- the same distortion the
 * reward plaque hit (CLAUDE.md).
 *
 * These extra windows cut the same cell into three vertical bands, so a
 * consumer can draw the two ends at their native scale and stretch only the
 * flat middle. That is `border-image`'s trick, which an atlas cannot use --
 * a border-image slice is measured from a standalone image's own four edges
 * and cannot address a region inside a sheet.
 *
 * ACTION_CAP_PX is measured off the art, not guessed: in the 264x75 cell the
 * horn and the inner field's rounded corner are done by x=45, and 60 clears
 * that with the margin that keeps a label off the flourish. Everything else
 * is derived -- a consumer sizes each cap box at
 * `height * --fs-ui-action-cap-ratio`, which is the same scale the band's own
 * window uses, so the ends never distort at any button width.
 */
const ACTION_CAP_PX = 60;
const SLICED_TOKENS = new Set(['action-idle', 'action-disabled']);
const SLICE_VARS = ['cap-size', 'cap-l-position', 'cap-r-position', 'mid-size', 'mid-position'];

/**
 * The icon atlas is a fixed 6x2 sheet and every cell is spoken for, so skills
 * IdleWorlds added after it was drawn borrow the closest existing sprite rather
 * than falling through to the featureless `generic` slot. Accent colour, glyph
 * and label still distinguish them; only the medallion art is shared.
 */
const ICON_ALIASES = {
  woodcutting: 'gathering',
  construction: 'crafting',
};

let loadPromise = null;
let iconIndex = null;
let uiIndex = null;
let iconByKey = new Map();
let uiByKey = new Map();

function validateIndex(data, label) {
  if (!data || !Number.isFinite(data.width) || !Number.isFinite(data.height) || !Array.isArray(data.entries)) {
    throw new Error(`${label} index is malformed`);
  }
  for (const entry of data.entries) {
    if (!entry?.key || !Number.isFinite(entry.x) || !Number.isFinite(entry.y) ||
        !Number.isFinite(entry.width) || !Number.isFinite(entry.height)) {
      throw new Error(`${label} contains a malformed entry`);
    }
  }
  return data;
}

async function fetchIndex(path, label) {
  const response = await fetch(assetUrl(path), { cache: 'no-store' });
  if (!response.ok) throw new Error(`${label} fetch failed: ${response.status}`);
  return validateIndex(await response.json(), label);
}
function spriteGeometry(index, entry) {
  const xRange = Math.max(1, index.width - entry.width);
  const yRange = Math.max(1, index.height - entry.height);
  return {
    image: `url("${assetUrl(`assets/${index.atlas}`)}")`,
    size: `${(index.width / entry.width) * 100}% ${(index.height / entry.height) * 100}%`,
    position: `${(entry.x / xRange) * 100}% ${(entry.y / yRange) * 100}%`,
  };
}

/** A window onto a sub-rect of a cell: the full cell height, `width` source
 *  pixels wide, starting `offset` pixels in from the cell's left edge. Same
 *  percentage contract as spriteGeometry() -- resolution independent, so the
 *  2x themed recolours read it unchanged. */
function bandGeometry(index, entry, offset, width) {
  const xRange = Math.max(1, index.width - width);
  const yRange = Math.max(1, index.height - entry.height);
  return {
    size: `${(index.width / width) * 100}% ${(index.height / entry.height) * 100}%`,
    position: `${((entry.x + offset) / xRange) * 100}% ${(entry.y / yRange) * 100}%`,
  };
}

function paint(host, index, entry) {
  if (!host || !index || !entry) return false;
  const sprite = spriteGeometry(index, entry);
  host.style.backgroundImage = sprite.image;
  host.style.backgroundSize = sprite.size;
  host.style.backgroundPosition = sprite.position;
  host.style.backgroundRepeat = 'no-repeat';
  host.dataset.iwSkillsAtlas = index.atlas;
  host.dataset.iwSkillsAtlasIndex = String(entry.index ?? '');
  return true;
}

function setVar(panel, name, value) {
  panel.style.setProperty(name, value);
}

function clearThemeVariables(host) {
  if (!host?.style) return;
  for (const kind of BUTTON_ART_KINDS) {
    host.style.removeProperty(`--iw-${kind}`);
    host.style.removeProperty(`--iw-${kind}-paint`);
  }
  delete host.dataset.iwButtonAtlas;
  delete host.dataset.iwCompactAtlas;
  host.style.removeProperty('--iw-compact-atlas');
}

function applyThemeVariables(host, theme) {
  if (!host?.style || !theme) {
    clearThemeVariables(host);
    return false;
  }
  const revised = revisedButtonAtlas.themes.includes(theme);
  if (revised) {
    host.dataset.iwCompactAtlas = 'compact-ghost-v3';
    setVar(host, '--iw-compact-atlas', `url("${assetUrl(`assets/skills-ui/buttons/compact-ghost-v3/${theme}.png`)}")`);
  } else {
    delete host.dataset.iwCompactAtlas;
    host.style.removeProperty('--iw-compact-atlas');
  }
  if (revised) host.dataset.iwButtonAtlas = 'revised-v5';
  else delete host.dataset.iwButtonAtlas;
  for (const kind of BUTTON_ART_KINDS) {
    if (revised) {
      const entry = revisedButtonAtlas.entries.find(item => item.key === kind.replace('action-secondary-', 'action-'));
      const image = `url("${assetUrl(`${REVISED_BUTTON_ROOT}/${theme}.png`)}")`;
      const x = 100 * entry.x / (revisedButtonAtlas.width - entry.width);
      const y = 100 * entry.y / (revisedButtonAtlas.height - entry.height);
      const size = `${100 * revisedButtonAtlas.width / entry.width}% ${100 * revisedButtonAtlas.height / entry.height}%`;
      setVar(host, `--iw-${kind}`, image);
      setVar(host, `--iw-${kind}-paint`, `transparent ${image} ${x}% ${y}% / ${size} no-repeat`);
    } else {
      setVar(host, `--iw-${kind}`, `url("${assetUrl(`${BUTTON_THEME_ROOT}/${theme}/${kind}.png`)}")`);
      host.style.removeProperty(`--iw-${kind}-paint`);
    }
  }
  return true;
}
function applyUiVariables(panel) {
  if (!panel || !uiIndex) return false;
  setVar(panel, '--fs-skills-panel-texture', `url("${assetUrl(TEXTURE_URL)}")`);
  // Resolve through the page-level --iw-zone-atlas (HeaderRenderer points it at
  // the current zone's recoloured atlas; base.css defines the un-themed
  // fallback). Every theme atlas shares this sheet's 860x463 canvas and cell
  // positions, so the sprite-window vars below are correct for all of them.
  setVar(panel, '--fs-skills-ui-atlas',
    `var(--iw-zone-atlas, url("${assetUrl(`assets/${uiIndex.atlas}`)}"))`);
  setVar(panel, '--fs-skills-nav-prev', `url("${assetUrl(NAV_PREV_URL)}")`);
  setVar(panel, '--fs-skills-nav-next', `url("${assetUrl(NAV_NEXT_URL)}")`);

  for (const [key, token] of Object.entries(UI_TOKENS)) {
    const entry = uiByKey.get(key);
    if (!entry) continue;
    const sprite = spriteGeometry(uiIndex, entry);
    setVar(panel, `--fs-ui-${token}-size`, sprite.size);
    setVar(panel, `--fs-ui-${token}-position`, sprite.position);
    if (!SLICED_TOKENS.has(token)) continue;
    const cap = Math.min(ACTION_CAP_PX, Math.floor(entry.width / 2) - 1);
    const capLeft = bandGeometry(uiIndex, entry, 0, cap);
    const capRight = bandGeometry(uiIndex, entry, entry.width - cap, cap);
    const mid = bandGeometry(uiIndex, entry, cap, entry.width - cap * 2);
    setVar(panel, `--fs-ui-${token}-cap-size`, capLeft.size);
    setVar(panel, `--fs-ui-${token}-cap-l-position`, capLeft.position);
    setVar(panel, `--fs-ui-${token}-cap-r-position`, capRight.position);
    setVar(panel, `--fs-ui-${token}-mid-size`, mid.size);
    setVar(panel, `--fs-ui-${token}-mid-position`, mid.position);
    // The cap BOX is sized from the button's own height by the sheet, so the
    // two ends stay at the band window's scale however wide the button grows.
    setVar(panel, '--fs-ui-action-cap-ratio', String(cap / entry.height));
  }
  panel.dataset.iwSkillsUiReady = '1';
  return true;
}

function clearUiVariables(panel) {
  if (!panel?.style) return;
  panel.style.removeProperty('--fs-skills-panel-texture');
  panel.style.removeProperty('--fs-skills-ui-atlas');
  panel.style.removeProperty('--fs-skills-nav-prev');
  panel.style.removeProperty('--fs-skills-nav-next');
  for (const token of Object.values(UI_TOKENS)) {
    panel.style.removeProperty(`--fs-ui-${token}-size`);
    panel.style.removeProperty(`--fs-ui-${token}-position`);
    if (!SLICED_TOKENS.has(token)) continue;
    for (const suffix of SLICE_VARS) panel.style.removeProperty(`--fs-ui-${token}-${suffix}`);
  }
  panel.style.removeProperty('--fs-ui-action-cap-ratio');
  delete panel.dataset.iwSkillsUiReady;
}
async function load() {
  const [icons, ui] = await Promise.all([
    fetchIndex(ICON_INDEX_URL, 'Skills icon'),
    fetchIndex(UI_INDEX_URL, 'Skills UI'),
  ]);
  iconIndex = icons;
  uiIndex = ui;
  iconByKey = new Map(icons.entries.map(entry => [entry.key, entry]));
  uiByKey = new Map(ui.entries.map(entry => [entry.key, entry]));
  return true;
}

export const SkillsArtService = {
  ready() {
    if (!loadPromise) {
      loadPromise = load().catch(err => {
        loadPromise = null;
        warnOnce('skills-art', err);
        throw err;
      });
    }
    return loadPromise;
  },

  isReady() {
    return !!iconIndex && !!uiIndex;
  },
  paintIcon(host, key) {
    const entry = iconByKey.get(key)
      || iconByKey.get(ICON_ALIASES[key])
      || iconByKey.get('generic');
    return paint(host, iconIndex, entry);
  },

  decoratePanel(panel) {
    return applyUiVariables(panel);
  },

  clearPanel(panel) {
    clearUiVariables(panel);
  },

  applyThemeVariables(host, theme) {
    return applyThemeVariables(host, theme);
  },

  clearThemeVariables(host) {
    clearThemeVariables(host);
  },

  iconEntry(key) {
    return iconByKey.get(key) || iconByKey.get(ICON_ALIASES[key]) || null;
  },
};
