/**
 * SkillsArtService
 *
 * Owns the dedicated Skills artwork atlases generated for the redesigned
 * action cards. Sprite geometry comes from committed JSON indexes rather than
 * hard-coded atlas coordinates.
 */

import { assetUrl, warnOnce } from './Runtime.js';

const ICON_INDEX_URL = 'assets/skills_icons_index.json';
const UI_INDEX_URL = 'assets/skills_ui_index.json';
const TEXTURE_URL = 'assets/skills_panel_texture.webp';

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
function applyUiVariables(panel) {
  if (!panel || !uiIndex) return false;
  setVar(panel, '--fs-skills-panel-texture', `url("${assetUrl(TEXTURE_URL)}")`);
  setVar(panel, '--fs-skills-ui-atlas', `url("${assetUrl(`assets/${uiIndex.atlas}`)}")`);

  for (const [key, token] of Object.entries(UI_TOKENS)) {
    const entry = uiByKey.get(key);
    if (!entry) continue;
    const sprite = spriteGeometry(uiIndex, entry);
    setVar(panel, `--fs-ui-${token}-size`, sprite.size);
    setVar(panel, `--fs-ui-${token}-position`, sprite.position);
  }
  panel.dataset.iwSkillsUiReady = '1';
  return true;
}

function clearUiVariables(panel) {
  if (!panel?.style) return;
  panel.style.removeProperty('--fs-skills-panel-texture');
  panel.style.removeProperty('--fs-skills-ui-atlas');
  for (const token of Object.values(UI_TOKENS)) {
    panel.style.removeProperty(`--fs-ui-${token}-size`);
    panel.style.removeProperty(`--fs-ui-${token}-position`);
  }
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
    const entry = iconByKey.get(key) || iconByKey.get('generic');
    return paint(host, iconIndex, entry);
  },

  decoratePanel(panel) {
    return applyUiVariables(panel);
  },

  clearPanel(panel) {
    clearUiVariables(panel);
  },

  iconEntry(key) {
    return iconByKey.get(key) || null;
  },
};
