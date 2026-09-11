/**
 * render-fixtures — visual verification harness
 *
 *   node build-tools/render-fixtures.mjs
 *
 * Builds a static page that exercises every skin-owned CSS surface against the
 * REAL bundled atlases and typefaces, renders it in headless Chromium, and
 * writes PNGs to build-tools/fixtures/.
 *
 * This does not replace looking at the live game — it cannot, because the game's
 * own DOM and Tailwind classes are not here. What it does prove is the half we
 * own: that the atlas maths resolves to the right sprite, that every custom
 * property referenced by the stylesheets actually resolves, that the typefaces
 * load, and that the dark-fantasy palette reads as one system.
 */

import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { THEME_NAMES } from '../src/modules/zoneThemes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(HERE, 'fixtures');

const fileUrl = rel => pathToFileURL(resolve(ROOT, rel)).href;

/* ── Atlas maths — must mirror AtlasService._applySprite() exactly ───────── */

function spriteStyle(entry, dims, atlasRel) {
  const cell = dims.cell;
  const atlasW = dims.cols * cell;
  const atlasH = dims.rows * cell;
  const x = Number(entry.x) || 0;
  const y = Number(entry.y) || 0;
  const w = Number(entry.width) || cell;
  const h = Number(entry.height) || cell;
  const xPct = atlasW > w ? (x / (atlasW - w)) * 100 : 0;
  const yPct = atlasH > h ? (y / (atlasH - h)) * 100 : 0;
  return [
    // Single quotes: this string is interpolated into an HTML style="..."
    // attribute, and a double quote here silently truncates the attribute —
    // which is exactly how the first run produced blank icon slots.
    `background-image:url('${fileUrl(atlasRel)}')`,
    `background-size:${(atlasW / w) * 100}% ${(atlasH / h) * 100}%`,
    `background-position:${xPct.toFixed(6)}% ${yPct.toFixed(6)}%`,
    'background-repeat:no-repeat',
  ].join(';');
}

const gearManifest = JSON.parse(await readFile(resolve(ROOT, 'assets/gear_icons_manifest.json'), 'utf8'));
const gearDims = {
  cols: gearManifest.columns || 10,
  rows: gearManifest.rows || 150,
  cell: gearManifest.cell_size || 128,
};
const gearByName = new Map(gearManifest.icons.map(i => [i.name.toLowerCase(), i]));

const csv = await readFile(resolve(ROOT, 'assets/item_icons_index.csv'), 'utf8');
const [head, ...lines] = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
const cols = head.split(',');
const itemRows = lines.map(l => {
  const cells = l.split(',');
  return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
});
const itemById = new Map(itemRows.map(r => [r.item_id, r]));
const itemCell = Number(itemRows[0]?.width) || 128;
let maxX = 0, maxY = 0;
for (const r of itemRows) {
  const x = Number(r.x) || 0;
  const y = Number(r.y) || 0;
  const w = Number(r.width) || itemCell;
  const h = Number(r.height) || itemCell;
  maxX = Math.max(maxX, x + w);
  maxY = Math.max(maxY, y + h);
}
const itemDims = {
  cols: Math.max(1, Math.ceil(maxX / itemCell)),
  rows: Math.max(1, Math.ceil(maxY / itemCell)),
  cell: itemCell,
};

const gearSprite = name => {
  const e = gearByName.get(name.toLowerCase());
  if (!e) throw new Error(`gear icon not found: ${name}`);
  return spriteStyle(e, gearDims, 'assets/gear_icons_atlas.png');
};
const itemSprite = id => {
  const e = itemById.get(id);
  if (!e) throw new Error(`item icon not found: ${id}`);
  return spriteStyle(e, itemDims, 'assets/item_icons_atlas.png');
};

function indexedSpriteStyle(entry, index, atlasRel) {
  if (!entry) throw new Error(`atlas entry missing from ${atlasRel}`);
  const xRange = Math.max(1, index.width - entry.width);
  const yRange = Math.max(1, index.height - entry.height);
  return [
    `background-image:url('${fileUrl(atlasRel)}')`,
    `background-size:${(index.width / entry.width) * 100}% ${(index.height / entry.height) * 100}%`,
    `background-position:${((entry.x / xRange) * 100).toFixed(6)}% ${((entry.y / yRange) * 100).toFixed(6)}%`,
    'background-repeat:no-repeat',
  ].join(';');
}

const skillsIconIndex = JSON.parse(await readFile(resolve(ROOT, 'assets/skills_icons_index.json'), 'utf8'));
const skillsUiIndex = JSON.parse(await readFile(resolve(ROOT, 'assets/skills_ui_index.json'), 'utf8'));
const skillIconByKey = new Map(skillsIconIndex.entries.map(entry => [entry.key, entry]));
const skillUiByKey = new Map(skillsUiIndex.entries.map(entry => [entry.key, entry]));
const skillSprite = key => indexedSpriteStyle(skillIconByKey.get(key), skillsIconIndex, 'assets/skills_icons_atlas.webp');

const SKILL_UI_TOKENS = {
  medallion_frame: 'medallion-frame', nav_frame_idle: 'nav-idle', nav_frame_active: 'nav-active',
  action_frame_idle: 'action-idle', action_frame_disabled: 'action-disabled', corner_filigree: 'corner',
  xp_plaque: 'xp-plaque', horizontal_separator: 'separator', separator_flourish: 'flourish',
};
// Keep in step with SkillsArtService: the two action-frame cells carry three
// extra windows each (left cap / flat middle / right cap) and one derived
// ratio, and a fixture that emits only the whole-cell window renders a control
// the extension never shows.
const SLICED_UI_TOKENS = new Set(['action-idle', 'action-disabled']);
const ACTION_CAP_PX = 60;
const skillUiVars = [
  `--fs-skills-panel-texture:url('${fileUrl('assets/skills_panel_texture.webp')}')`,
  `--fs-skills-ui-atlas:url('${fileUrl('assets/skills_ui_atlas.webp')}')`,
  `--fs-skills-nav-prev:url('${fileUrl('assets/skills_nav_prev.svg')}')`,
  `--fs-skills-nav-next:url('${fileUrl('assets/skills_nav_next.svg')}')`,
];
for (const [key, token] of Object.entries(SKILL_UI_TOKENS)) {
  const entry = skillUiByKey.get(key);
  if (!entry) continue;
  const xRange = Math.max(1, skillsUiIndex.width - entry.width);
  const yRange = Math.max(1, skillsUiIndex.height - entry.height);
  skillUiVars.push(`--fs-ui-${token}-size:${(skillsUiIndex.width / entry.width) * 100}% ${(skillsUiIndex.height / entry.height) * 100}%`);
  skillUiVars.push(`--fs-ui-${token}-position:${((entry.x / xRange) * 100).toFixed(6)}% ${((entry.y / yRange) * 100).toFixed(6)}%`);
  if (!SLICED_UI_TOKENS.has(token)) continue;
  // Mirror of SkillsArtService's bandGeometry(): the action frame is cut into
  // three vertical bands so a button whose label length is the game's to
  // choose can stretch the flat middle and leave the ends at native scale.
  const cap = Math.min(ACTION_CAP_PX, Math.floor(entry.width / 2) - 1);
  const band = (offset, width) => {
    const range = Math.max(1, skillsUiIndex.width - width);
    return {
      size: `${(skillsUiIndex.width / width) * 100}% ${(skillsUiIndex.height / entry.height) * 100}%`,
      position: `${(((entry.x + offset) / range) * 100).toFixed(6)}% ${((entry.y / yRange) * 100).toFixed(6)}%`,
    };
  };
  const capLeft = band(0, cap);
  const capRight = band(entry.width - cap, cap);
  const mid = band(cap, entry.width - cap * 2);
  skillUiVars.push(`--fs-ui-${token}-cap-size:${capLeft.size}`);
  skillUiVars.push(`--fs-ui-${token}-cap-l-position:${capLeft.position}`);
  skillUiVars.push(`--fs-ui-${token}-cap-r-position:${capRight.position}`);
  skillUiVars.push(`--fs-ui-${token}-mid-size:${mid.size}`);
  skillUiVars.push(`--fs-ui-${token}-mid-position:${mid.position}`);
  skillUiVars.push(`--fs-ui-action-cap-ratio:${cap / entry.height}`);
}
const SKILL_UI_STYLE = skillUiVars.join(';');

/* ── Fixture markup ─────────────────────────────────────────────────────── */

const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

const invRow = ({ sprite, badge, name, tier, level, stats, details, reqs, qty, equipped, setAction = false }) => `
<div class="compact-row" style="display:flex;align-items:center;gap:0;min-height:62px;padding:0;position:relative;overflow:hidden;border:1px solid var(--iw-line);border-radius:3px;background:linear-gradient(180deg,rgba(255,255,255,.014),transparent 38%),#12110E;margin-bottom:6px;">
  <div class="fs-inv-row tier-${tier}${details ? ' has-details' : ''}${reqs ? ' has-requirements' : ''}${equipped ? ' is-equipped' : ''}">
    <div class="fs-inv-icon" style="${sprite}">${badge ? `<span class="iw-icon-badge iw-icon-badge--sprite" data-iw-badge="${badge.level}" style="${badge.sprite}"></span>` : ''}</div>
    <div class="fs-inv-body">
      <div class="fs-inv-name tier-${tier}"><span class="iw-item-ref">${name}</span>${level ? ` <span class="fs-inv-sub">Lv ${level}</span>` : ''}</div>
      ${stats ? `<div class="fs-inv-stats">${stats.map((s, i) => `<span class="fs-stat${i === 0 ? ' fs-stat--tier' : ' fs-stat--pos'}">${s}</span>`).join('')}</div>` : ''}
      ${details ? `<div class="fs-inv-details">${details.map(d => `<span class="fs-inv-detail fs-inv-detail--${d.kind}">${d.text}${d.count ? `<span class="fs-inv-detail-count">×${d.count}</span>` : ''}</span>`).join('')}</div>` : ''}
      ${reqs ? `<div class="fs-inv-requirements">${reqs.map(r => `<span class="fs-inv-requirement">${r}</span>`).join('')}</div>` : ''}
    </div>
    ${qty ? `<span class="fs-inv-qty">×${qty}</span>` : ''}
  </div>
  ${equipped
    ? '<button data-fs-preserved-action="control" data-fs-action-kind="equipped">Equipped</button>'
    : '<button data-fs-preserved-action="control" data-fs-action-kind="equip">Equip</button>'}
  ${setAction ? '<button data-fs-preserved-action="control" data-fs-action-kind="set">Set Bonus</button>' : ''}
  <button data-fs-preserved-action="control" data-fs-action-kind="secondary">List</button>
  <button data-fs-preserved-action="control" data-fs-action-kind="icon">🔒</button>
</div>`;

const SKILL_GLYPHS = {
  combat: '⚔', mining: '⛏', smithing: '⚒', gathering: '❧', alchemy: '⚗',
  jewelcrafting: '◆', spellcrafting: '✧', tailoring: '⋈', crafting: '✦', fishing: '⌁',
  woodcutting: '⋔', construction: '⌂',
};
const SKILL_ART = {
  combat: skillSprite('combat'),
  mining: skillSprite('mining'),
  smithing: skillSprite('smithing'),
  gathering: skillSprite('gathering'),
  alchemy: skillSprite('alchemy'),
  jewelcrafting: skillSprite('jewelcrafting'),
  spellcrafting: skillSprite('spellcrafting'),
  tailoring: skillSprite('tailoring'),
  crafting: skillSprite('crafting'),
  fishing: skillSprite('fishing'),
  // No free atlas cell — these two borrow the nearest existing sprite, matching
  // SkillsArtService.ICON_ALIASES.
  woodcutting: skillSprite('gathering'),
  construction: skillSprite('crafting'),
};
const SKILL_LEVELS = {
  combat: 42, mining: 42, smithing: 42, gathering: 42, alchemy: 42,
  jewelcrafting: 68, spellcrafting: 57, tailoring: 26, crafting: 42, fishing: 42,
  woodcutting: 35, construction: 29,
};

// `navIn` models the two shapes React actually ships: some panels put the
// recipe pager in the command cell, others put it in the content branch beside
// the title. The skin must present both identically, so the fixture renders
// both rather than assuming one.
// SkillPanelRenderer.styleButton() writes these INLINE with `!important`, which
// outranks every stylesheet rule. A fixture that omits them renders a button the
// live game never shows — which is exactly how the framed nav artwork survived a
// "verified" pass. Mirror BUTTON_STYLES + the role geometry here.
// Per Curtis (2026-09) the pager and the action button are both the same
// forged plate as the rest of the card — the inventory row's idle tab, with
// the live control alone getting the ember plate. Mirror FORGE from
// SkillPanelRenderer.js verbatim; all three copies move together.
const FORGE = {
  bg: 'linear-gradient(180deg, #100E0A, #0A0907)',
  border: '1px solid var(--iw-th-edge-faint, #2A241A)',
  shadow: 'inset 0 1px 0 rgba(255, 255, 255, .035), inset 0 -7px 10px -8px rgba(0, 0, 0, .95)',
  liveBg: 'linear-gradient(180deg, #1B150B, #120E07)',
  liveBorder: '1px solid var(--iw-th-brass, #8A6B2E)',
  // The live button's glow is mixed from the inherited `--fs-skill-accent` so it
  // carries discipline colour; ember `#D8791F` is the pre-classify fallback.
  liveShadow: 'inset 0 0 12px -2px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 55%, transparent), ' +
    'inset 0 1px 0 rgba(255, 216, 150, .18), ' +
    '0 0 0 1px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 16%, transparent)',
};

const navInline = () => [
  'width:26px', 'min-width:26px', 'height:44px', 'min-height:44px', 'padding:0',
  `background:${FORGE.bg}`,
  `border:${FORGE.border}`, 'border-radius:2px',
  `box-shadow:${FORGE.shadow}`,
  'color:transparent', 'font-size:0',
].map(d => `${d} !important`).join(';');

// Mirror of ACTION_ART.idle in SkillPanelRenderer: on a panel that has resolved
// the atlas (every fixture panel carries data-iw-skills-ui-ready="1"), the
// command button drops its plate for the quest rail's action_frame sprite, so
// the background/border/box-shadow the plate wrote are replaced rather than
// layered. A fixture still carrying the plate here would render a control the
// game never shows — and would hide exactly the "second frame under the art"
// regression the quest check below exists for.
const ACTION_INLINE = [
  "font-family:'Barlow',system-ui,sans-serif", 'font-weight:700',
  'letter-spacing:0.09em', 'text-transform:uppercase', 'border-radius:2px',
  'align-self:center', 'flex-shrink:0', 'cursor:pointer',
  'box-shadow:none',
  'background:transparent var(--fs-skills-ui-atlas) var(--fs-ui-action-idle-position) / ' +
    'var(--fs-ui-action-idle-size) no-repeat',
  'border:0',
  'color:#F3E3C0',
  'text-shadow:0 1px 0 rgba(0, 0, 0, .85), ' +
    '0 0 8px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 42%, transparent)',
  'font-size:12px',
  'width:155px', 'min-width:155px', 'height:44px', 'min-height:44px', 'padding:0 12px',
].map(d => `${d} !important`).join(';');

const navMarkup = '<div data-iw-skill-role="nav-group">' +
  `<button data-iw-skill-role="nav-button" data-iw-nav-direction="prev" style="${navInline()}"><span>‹</span></button>` +
  `<button data-iw-skill-role="nav-button" data-iw-nav-direction="next" style="${navInline()}"><span>›</span></button></div>`;

const skillPanel = ({ type, label, title, pct, xp, reward, ingredients, requirement, detail, nav = true, navIn = 'commands' }) => {
  const glyph = SKILL_GLYPHS[type] || '✦';
  const art = SKILL_ART[type] || '';
  const level = SKILL_LEVELS[type] || 42;
  const requirementText = requirement || `Requires ${label} Lv 9`;
  const rewardText = reward || `+${xp} ${label} XP/task`;
  const baseExp = /\bxp\b/i.test(String(rewardText))
    ? (String(rewardText).match(/[\d,]+/)?.[0]?.replaceAll(',', '') || String(xp).replaceAll(',', ''))
    : String(xp).replaceAll(',', '');
  const action = title.split(/\s+/)[0].toUpperCase();
  const ingredientItems = !ingredients ? [] : (Array.isArray(ingredients)
    ? ingredients
    : [{ text: `${ingredients} 12/20`, state: 'unmet' }]);
  const ingredientText = ingredientItems.map(item => item.text).join(' • ');
  const ingredientMarkup = ingredientItems.length ? `
      <div data-iw-skill-role="ingredient" data-iw-ingr="1" data-iw-ingredient-list-source="1">${ingredientText}</div>
      <div class="fs-skill-ingredient-grid" data-iw-skill-ingredient-list="1" role="list" aria-label="Required materials">
        ${ingredientItems.map(item => `<span class="fs-skill-ingredient-item" data-iw-ingredient-state="${item.state}" role="listitem">${item.text}</span>`).join('')}
      </div>` : '';
  return `
<div class="compact-panel fs-skill-panel fs-skill--${type}" data-iw-skill-layout="three-zone" data-iw-skills-ui-ready="1" style="margin-bottom:8px;${SKILL_UI_STYLE}">
  <div data-iw-skill-layout-shell="1">
    <div data-iw-skill-zone="identity">
      <div data-iw-skill-role="identity-icon">${glyph}</div>
      <span class="fs-skill-medallion-art" data-iw-skill-art="${type}" data-iw-skill-art-ready="1" aria-hidden="true" style="${art}"></span>
      <div data-iw-skill-role="identity" data-iw-clean-text="${label}">${label}</div>
      <div data-iw-skill-role="identity-level">Level ${level}</div>
      <span class="fs-skill-identity-percent">${pct}%</span>
      <span class="fs-skill-identity-progress"><span class="fs-skill-identity-progress-fill" style="width:${pct}%"></span></span>
    </div>
    <div data-iw-skill-zone="content">
      <div><div data-iw-skill-role="action-title" data-iw-clean-text="${title}">${title}</div><div data-iw-skill-role="level-progress" data-iw-progress-display="Lv ${level} • 12,480 XP to go">Lv ${level} - ${pct}% • 12,480 XP to go</div>${nav && navIn === 'content' ? navMarkup : ''}</div>
      <div data-iw-skill-role="xp-gain">+${xp} XP</div>
      <div data-iw-skill-role="progress-track"><div data-iw-skill-role="progress-fill" style="width:${pct}%"></div></div>
      ${ingredientMarkup}
      <span class="fs-skill-base-exp" data-iw-base-exp="${baseExp}">Base: ${baseExp}</span>
      <div data-iw-skill-role="requirement">${requirementText}</div>
      <div data-iw-skill-role="reward">Base reward: ${rewardText}</div>
      ${detail ? `<div data-iw-skill-role="action-detail">${detail}</div>` : ''}
    </div>
    ${nav && navIn === 'commands'
      ? `<div data-iw-skill-zone="commands">
      ${navMarkup}
      <button data-iw-skill-role="action-button" data-iw-btn-state="primary" style="${ACTION_INLINE}">${action}</button>
    </div>`
      : `<button data-iw-skill-zone="commands" data-iw-skill-role="action-button" data-iw-btn-state="primary" style="${ACTION_INLINE}">${action}</button>`}
  </div>
</div>`;
};

// Quest cards after QuestPanelRenderer has tagged the native nodes: role
// attributes + the skin-owned .fs-quest-sigil, laid out by the block appended
// to skillpanel.css.
const questCard = ({ accent, glyph, state = 'active', kicker, title, brief, objective, objIcon, objItem, reward, pct, turnInDisabled = true, skip, turnInLabel = 'Turn In' }) => `
<div class="compact-panel p-2.5 fs-quest-panel" data-fs-quest="1" data-iw-quest-state="${state}" data-iw-skills-ui-ready="1" style="--fs-quest-accent:${accent};${SKILL_UI_STYLE}">
  <div class="space-y-2" data-iw-quest-zone="body">
    <span class="fs-quest-sigil" aria-hidden="true" data-iw-quest-glyph="${glyph}"${objIcon ? ' data-iw-quest-icon="1"' : ''}>${objIcon ? `<span class="fs-quest-sigil-icon" style="${objIcon}"></span>` : ''}<span class="fs-quest-sigil-pct">${pct}%</span></span>
    <div class="flex items-start justify-between gap-3" data-iw-quest-zone="row">
      <div class="min-w-0 flex-1" data-iw-quest-zone="content">
        ${kicker ? `<p data-iw-quest-role="kicker">${kicker}</p>` : ''}
        <p data-iw-quest-role="title">${title}</p>
        ${brief ? `<p data-iw-quest-role="brief">${brief}</p>` : ''}
        <p data-iw-quest-role="objective"${objItem ? ` data-iw-tooltip-trigger="1" data-iw-item-name="${objItem}" tabindex="0"` : ''}>${objective}</p>
        <p data-iw-quest-role="reward" data-iw-quest-reward="${reward}">Reward: ${reward}</p>
      </div>
      <div class="flex shrink-0 flex-col gap-2" data-iw-quest-zone="commands">
        <button data-iw-quest-role="turn-in"${turnInDisabled ? ' disabled' : ''}>${turnInLabel}</button>
        ${skip ? `<button data-iw-quest-role="skip">Skip (${skip})</button>` : ''}
      </div>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-white/10" data-iw-quest-role="progress-track"><div class="h-full rounded-full bg-emerald-400" style="width:${pct}%" data-iw-quest-role="progress-fill"></div></div>
    <div class="text-[11px] text-white/45" data-iw-quest-role="progress-label" data-iw-quest-percent="${pct}">${pct}% complete</div>
  </div>
</div>`;

/* Village. Roles are exactly what VillagePanels writes on the live DOM, and the
   art element carries the same INLINE background-image the module paints (the
   sheet never sets one — see the AtlasService rule). The head row is present
   because `display: contents` on it is the whole reason the appended art can
   sit left of copy React owns. */
const villageArt = file =>
  `<div class="iw-village-art" data-iw-village-art="${file ? 'building' : 'generic'}" aria-hidden="true"` +
  (file ? ` style="--iw-village-sprite:url('${fileUrl(`assets/village/${file}`)}')"` : '') + '></div>';

const villageSlot = ({ n, name, file, effects }) => `
<div class="compact-panel" data-iw-village="slot" data-iw-village-state="${name ? 'installed' : 'vacant'}">
  <div data-iw-village-role="head" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
    <div data-iw-village-role="copy">
      <p data-iw-village-role="index">Slot ${n}</p>
      ${name
    ? `<p data-iw-village-role="name">${name}</p><p data-iw-village-role="effects">${effects}</p>`
    : '<p data-iw-village-role="vacant">Empty slot</p>'}
    </div>
    ${name
    ? '<div data-iw-village-role="actions">' +
      '<button data-iw-village-role="action" data-iw-village-action="destroy">Destroy</button>' +
      '<button data-iw-village-role="action" data-iw-village-action="uninstall">Uninstall (100k)</button></div>'
    : '<button data-iw-village-role="action" data-iw-village-action="install">Install</button>'}
  </div>
  ${villageArt(file)}
</div>`;

const villageOption = (name, file, effects) => `
<button data-iw-village-role="option">
  <p data-iw-village-role="option-name"><span class="iw-village-option-art" aria-hidden="true"` +
  ` style="--iw-village-sprite:url('${fileUrl(`assets/village/${file}`)}')"></span>${name} <span>&#x00D7;2</span></p>
  <p>${effects}</p>
</button>`;

const tooltipCard = ({ sprite, name, tier, badges, effect, stats, acqMain, acqSub, glyph = '&#x1F6E1;&#xFE0F;', source = 'cached data' }) => `
<div class="iw-tip is-open" style="position:relative;display:flex;opacity:1;left:0;top:0;margin-bottom:14px;">
  <div class="iw-tip-head has-art has-gear-art">
    <div class="iw-tip-art iw-tip-gear-art" aria-hidden="true"><span class="iw-tip-art-host iw-tip-art-painted" style="${sprite}"></span></div>
    <div class="iw-tip-title-block">
      <div class="iw-tip-name tier-${tier}">${name}</div>
      <div class="iw-tip-badges">${badges.map((b, i) => `<span class="iw-tip-badge${i === 0 ? ' t' : ''}${b.startsWith('Requires') ? ' req' : ''}">${b}</span>`).join('')}</div>
    </div>
  </div>
  <div class="iw-tip-body">
    ${effect ? `<div class="iw-tip-sec iw-tip-effect-sec"><div class="iw-tip-effect">${effect}</div></div>` : ''}
    <div class="iw-tip-sec"><div class="iw-tip-sec-title">Stats</div><div class="iw-tip-stats">
      ${stats.map(([k, v, cls]) => `<div class="iw-tip-stat"><span class="k">${k}</span><span class="v${cls ? ' ' + cls : ''}">${v}</span></div>`).join('')}
    </div></div>
    <div class="iw-tip-sec"><div class="iw-tip-sec-title">How to get it</div>
      <div class="iw-tip-acq"><div class="iw-tip-acq-main">${acqMain}</div><div class="iw-tip-acq-sub">${acqSub}</div></div>
    </div>
  </div>
  <div class="iw-tip-foot"><a class="iw-tip-link" href="#">&#x1F4D6; Wiki &#x2197;</a><span class="iw-tip-source">${source}</span><button type="button" class="iw-tip-close" aria-label="Close item details">&times;</button></div>
</div>`;

/* ── Header ───────────────────────────────────────────────────────────────
   Mirrors the live header captured from the running game (claude/capture-header.js):
   the real class names, the real role attributes HeaderRenderer writes, and the
   asset variables it sets inline. The header had never been fixture-rendered,
   which is how a mis-scaled frame ornament and a mis-aligned utility rail both
   survived "verified" passes. */
const HEADER_ASSET_VARS = [
  ['--iw-header-frame', 'header_frame.webp'],
  ['--iw-header-surface', 'header_surface.webp'],
  // Distinct file so the mobile-swap media query in header.css can be verified
  // by name below; HeaderRenderer sets this per zone alongside the wide strip.
  ['--iw-header-surface-mobile', 'zones/zone_1_mobile.webp'],
  ['--iw-header-crest', 'header_crest.webp'],
  ['--iw-header-divider', 'header_divider.webp'],
  ['--iw-utility-frame', 'utility_frame.webp'],
  ['--iw-status-frame', 'status_frame.webp'],
].map(([name, file]) => `${name}:url('${fileUrl(`assets/header/${file}`)}')`).join(';');

/* The four inventory tool controls. They were absent from this fixture, which
   is why nothing here ever showed that one of the live four goes unclassified
   and renders with no frame at all. */
const INV_TOOL_SVG = body =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${body}</svg>`;
const INV_TOOL_ICON = {
  filter: INV_TOOL_SVG('<path d="M22 3H2l8 9.46V19l4 2V12.46z"/>'),
  search: INV_TOOL_SVG('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  shield: INV_TOOL_SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'),
  // The ornament: a BARE svg, sibling of the controls, tagged `glyph` by
  // classifyInventoryChrome. Never a <button> — that is the whole point.
  box: '<svg class="lucide lucide-package" data-iw-inventory-control="glyph" width="16" height="16" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#D8791F" aria-hidden="true">' +
    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/>' +
    '<path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/></svg>',
};

const UTIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.6l1.1-6L3.4 9.4l6-.8z"/></svg>';

// Mirrors HeaderRenderer.statKind — the vitals/timers layout keys off this, so
// the fixture has to derive it the same way or it renders the pre-split grid.
const statKind = (text) => {
  if (/\batk\s*\d+\b.*\bdef\s*\d+\b.*\bhp\s*\d+\b/i.test(text)) return 'combat';
  if (/\bboosted\b/i.test(text)) return 'boost';
  if (/\b\d+\s*[dhm]\b[^]*\bleft\b/i.test(text)) return 'timer';
  if (/^[^\w]*[\d,]+$/.test(text)) return 'gold';
  return 'other';
};

const statusTile = (index, text, tag = 'button') =>
  `<${tag} data-iw-header="status-card" data-iw-header-card="${index}" data-iw-header-stat="${statKind(text)}">${text}</${tag}>`;

const headerBlock = () => `
<header class="panel p-3.5" data-iw-header="root" style="${HEADER_ASSET_VARS}">
  <div class="grid gap-3" data-iw-header="layout">
    <div class="flex min-w-0 items-start justify-between gap-3" data-iw-header="identity-region">
      <span class="fs-header-crest" aria-hidden="true"></span>
      <div class="min-w-0 overflow-hidden" data-iw-header="profile">
        <p data-iw-header="brand">IdleWorlds</p>
        <h1 class="header-player-name" data-iw-header="profile-name"><button class="hover:underline" title="View your profile" style="background-image:linear-gradient(90deg,#8FD3FF,#93C5FD);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent">BustedCypher</button></h1>
        <p class="header-player-title" data-iw-header="profile-title">Craftbound Innovator</p>
        <p data-iw-header="profile-meta">⚔️ Combat Lv 62 • Zone 19: Eternium Verge</p>
        <button data-iw-header="profile-online">Players online: 141</button>
      </div>
      <div class="flex items-center gap-2" data-iw-header="utilities">
        ${Array.from({ length: 5 }, () => `<button class="header-icon-btn" data-iw-header="utility-button">${UTIL_ICON}</button>`).join('')}
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2 min-w-0" data-iw-header="status-grid">
      ${statusTile(1, '💰 10,957,780', 'div')}
      ${statusTile(2, '🧪 XP +36/task • 17h 17m left')}
      ${statusTile(3, 'ATK 350 • DEF 358 • HP 477')}
      ${statusTile(4, '⚔️ ATK +34 • 17h 17m left')}
      ${statusTile(5, '🛡️ DEF +34 • 17h 17m left')}
      ${statusTile(6, '⚡ Matthais64 boosted (3/4) · 1d 8h left')}
    </div>
  </div>
</header>`;

/* StyleInjector rewrites every `url('../assets/…')` to a chrome-extension URL
   at runtime, so a fixture that inlines a sheet verbatim silently drops that
   sheet's art. base/ui-system/header were rewritten here; inventory, skillpanel
   and tooltip-engine were inlined RAW, so their sprites 404'd against the file
   page and every fixture render of them was missing its frames — the fixture
   lying about the skin exactly the way CLAUDE.md warns. One loader now, for
   all of them. */
const sheet = async name =>
  (await readFile(resolve(ROOT, `src/styles/${name}.css`), 'utf8'))
    .replaceAll('../assets/', fileUrl('assets') + '/');

/* The live page ships Tailwind preflight. Without it a fixture's <svg> stays
   INLINE and gets centred inside its button by accident, which hid a real
   defect: live, preflight's `svg{display:block}` makes the icon a BLOCK child
   and a block box with an explicit width sits flush LEFT, 7.5px off centre in
   a 30px frame. A fixture that omits the host page's reset lies the same way
   one that omits a stylesheet does. */
const PREFLIGHT_CSS = `
svg,img,video,canvas{display:block;vertical-align:middle}
button{font-family:inherit;font-size:100%;line-height:inherit;color:inherit}
`;

const baseCss = await sheet('base');
const uiSystemCss = await sheet('ui-system');
// header.css is injected BEFORE ui-system.css by content.js; keep that order or
// the generic control rule stops being the final say, exactly as it is live.
const headerCss = await sheet('header');

const page = `<!doctype html><html><head><meta charset="utf-8">
<style>
${PREFLIGHT_CSS}
${baseCss}
${await sheet('inventory')}
${await sheet('skillpanel')}
${await sheet('tooltip-engine')}
${headerCss}
${uiSystemCss}
body { padding: 22px; max-width: 1180px; margin: 0 auto; }
.fx-h { font-family: var(--iw-font-head); font-size: 11px; letter-spacing: .22em; text-transform: uppercase;
        color: var(--iw-gold-dim); margin: 26px 0 9px; border-bottom: 1px solid var(--iw-line); padding-bottom: 6px; }
.fx-h:first-child { margin-top: 0; }
.fx-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; align-items: start; }
.fx-skill-grid { grid-template-columns: 1fr; }
.fx-village { display: grid; grid-template-columns: minmax(320px, .42fr) minmax(0, .58fr); gap: 12px; align-items: start; }
.fx-village-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.fx-village-rest { border: 1px dashed var(--iw-line); border-radius: 3px; min-height: 240px; display: grid; place-items: center; color: var(--iw-gold-dim); font: 11px var(--iw-font-ui); letter-spacing: .18em; text-transform: uppercase; }
@media (max-width: 900px) { .fx-village { grid-template-columns: minmax(0, 1fr); } .fx-village-rest { display: none; } }
.fx-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.fx-sw { width: 92px; }
.fx-sw i { display: block; height: 34px; border: 1px solid var(--iw-line); border-radius: 2px; }
.fx-sw span { display: block; font-size: 9px; color: var(--iw-dim); margin-top: 3px; font-variant-numeric: tabular-nums; }
.fx-type div { margin-bottom: 5px; }
</style></head><body>

<div class="fx-h">Typography — Cinzel / Barlow / Crimson Text (self-hosted)</div>
<div class="fx-type">
  <h1 style="margin:0 0 4px">Ancient's Vestment</h1>
  <h3 style="margin:0 0 6px">Forge · Smithing</h3>
  <div style="font-family:var(--iw-font-ui);font-size:13px;color:var(--iw-text)">Barlow 400 — the quartermaster eyes your coin purse.</div>
  <div style="font-family:var(--iw-font-ui);font-weight:700;font-size:13px;color:var(--iw-text-hi)">Barlow 700 — EQUIP · LIST · SALVAGE</div>
  <div class="iw-tip-flavour">Crimson Text italic — "It was forged in a colder age."</div>
</div>

<div class="fx-h">Tier scale</div>
<div class="fx-swatches">
${TIERS.map(t => `<div class="fx-sw"><i style="background:var(--iw-t-${t})"></i><span class="tier-${t}">${t}</span></div>`).join('')}
</div>

<div class="fx-h">Surface / edge tokens</div>
<div class="fx-swatches">
${['ink-950', 'ink-900', 'ink-850', 'ink-800', 'ink-750', 'ink-700', 'ink-600', 'line', 'line-hi', 'line-hot', 'gold', 'gold-dim', 'ember', 'ember-hi']
  .map(n => `<div class="fx-sw"><i style="background:var(--iw-${n})"></i><span>${n}</span></div>`).join('')}
</div>

<div class="fx-h">Inventory rows — gear atlas, all six tiers</div>
${invRow({ sprite: gearSprite('Iron Sword'), badge: { level: 4, sprite: gearSprite('+4') }, name: 'Iron Sword+4', tier: 'common', level: '3', stats: ['Tier 4 · Weapon', 'ATK +18'], qty: null, equipped: false })}
${invRow({ sprite: gearSprite('Fortunate Dragonscale Silk Cloak of the Harvest'), name: 'Fortunate Dragonscale Silk Cloak of the Harvest', tier: 'common', level: null, stats: ['Tier 7 · Cloak', 'Find +4%', '2× gather 6%'], qty: null, equipped: false })}
${invRow({ sprite: gearSprite('Mythril Sword'), name: 'Mythril Sword', tier: 'uncommon', level: '11', stats: ['Tier 9 · Weapon', 'ATK +64', 'WAR +6'], details: [{ kind: 'loadout', text: 'In loadout: Main' }], equipped: true })}
${invRow({ sprite: gearSprite('Voidglass Gloves'), name: 'Voidglass Gloves', tier: 'rare', level: null, stats: ['Tier 16 · Hands', 'DEF +41', 'HP +120'], details: [{ kind: 'socket', text: 'Cut Sunstone: +4% gold find', count: 2 }] })}
${invRow({ sprite: gearSprite('Thalassic Shield'), name: 'Thalassic Shield', tier: 'epic', level: '22', stats: ['Tier 21 · Off-hand', 'DEF +88'], details: [{ kind: 'effect', text: 'Item find: +7%' }], reqs: ['Requires Combat Lv 45'] })}
${invRow({ sprite: gearSprite('Voidglass Leggings'), name: 'Voidglass Leggings', tier: 'legendary', level: null, stats: ['Tier 27 · Legs', 'DEF +140', 'HP +310'], details: [{ kind: 'set', text: 'Set bonus active' }, { kind: 'status', text: 'Not upgradable' }], setAction: true })}
${invRow({ sprite: gearSprite('Voidglass Boots'), name: 'Voidglass Boots', tier: 'mythic', level: '30', stats: ['Tier 33 · Feet', 'DEF +198', '2× gather 12%'], details: [{ kind: 'loadout', text: 'In loadout: Gathering' }], reqs: ['Requires Gathering Lv 80'] })}

<div class="fx-h">Inventory panel — outer section frame enclosing the inner list frame</div>
<div data-iw-inventory-root="1">
  <div class="mb-2 flex items-center justify-between"><h2 data-iw-inventory-title="1">Inventory</h2></div>
  <div class="fs-inv-rule"></div>
  <div class="mb-2 flex items-center justify-between gap-3">
    <button data-iw-inventory-control="page" disabled>Prev</button>
    <span data-iw-inventory-control="page-count">1 / 48</span>
    <button data-iw-inventory-control="page">Next</button>
  </div>
  <div class="space-y-1.5" data-iw-inventory-list="1">
    ${invRow({ sprite: gearSprite('Mythril Sword'), name: 'Mythril Sword', tier: 'uncommon', level: '11', stats: ['Tier 9 · Weapon', 'ATK +64'], details: [{ kind: 'loadout', text: 'In loadout: Main' }], equipped: true })}
    ${invRow({ sprite: itemSprite('copper_ore'), name: 'Astral Silk', tier: 'common', stats: ['Tier 20 · Raw material'], qty: '1' })}
    ${invRow({ sprite: gearSprite('Voidglass Gloves'), name: 'Astralium Relic+3', tier: 'rare', level: null, stats: ['Tier 20 · Trinket', 'XP +35'], details: [{ kind: 'set', text: 'set bonus' }], reqs: ['Requires Lv 69 (any skill)'], setAction: true })}
  </div>
</div>

<div class="fx-h">Inventory rows — item atlas (consumables / materials)</div>
${invRow({ sprite: itemSprite('copper_ore'), name: 'Copper Ore', tier: 'common', stats: ['Tier 1 · Raw material'], qty: '2,480' })}
${invRow({ sprite: itemSprite('iron_ore'), name: 'Iron Ore', tier: 'common', stats: ['Tier 3 · Raw material'], qty: '917' })}
${invRow({ sprite: itemSprite('titanium_atk_potion_super'), name: 'Super Titanium ATK Potion', tier: 'epic', stats: ['Tier 20 · Consumable', 'ATK +90'], qty: '12' })}

<div class="fx-h">Skill panels — accent per discipline</div>
<div class="fx-grid fx-skill-grid fs-skills-section-frame" data-iw-skills-ui-ready="1" style="${SKILL_UI_STYLE}">
<div>
${skillPanel({ type: 'combat', label: 'Combat', title: 'Fight Bone Marauder', pct: 69.8, xp: '123456', reward: '340g', nav: false })}
${skillPanel({ type: 'mining', label: 'Mining', title: 'Mine Copper Ore', pct: 28.6, xp: '85', ingredients: 'Copper Ore', nav: false })}
${skillPanel({ type: 'smithing', label: 'Smithing', title: 'Forge Iron Sword', pct: 91, xp: '410', ingredients: 'Iron Ore', navIn: 'content' })}
${skillPanel({ type: 'gathering', label: 'Gathering', title: 'Harvest Duskroot', pct: 45, xp: '150' })}
${skillPanel({ type: 'alchemy', label: 'Alchemy', title: 'Brew ATK Potion', pct: 12, xp: '260' })}
</div><div>
${skillPanel({ type: 'jewelcrafting', label: 'Jewel', title: 'Craft Moonstone Ring', pct: 16.6, xp: '1253', ingredients: [
  { text: '💎 Moonstone 1/1', state: 'met' },
  { text: '💎 Sapphire 0/1', state: 'unmet' },
  { text: '💎 Topaz 0/1', state: 'unmet' },
], requirement: 'Requires Jewelcrafting Lv 53', detail: 'Missing materials — will queue (gather first)' })}
${skillPanel({ type: 'spellcrafting', label: 'Spellcraft', title: 'Harvest Moonsteel Mana', pct: 94.6, xp: '124', requirement: 'Requires Spellcraft Lv 53', detail: 'Gather Moonsteel Mana from the ether' })}
${skillPanel({ type: 'tailoring', label: 'Tailor', title: 'Upgrade Moonsilk Silkbind Thread', pct: 21, xp: '5638', ingredients: [
  { text: '🔷 Moonsilk Silkbind Thread 0/3', state: 'unmet' },
  { text: '🔴 Moonsteel Upgrade Orb 0/1', state: 'unmet' },
], requirement: 'Requires Tailoring Lv 53 and Gathering Lv 49', navIn: 'content' })}
${skillPanel({ type: 'crafting', label: 'Crafting', title: 'Craft Upgrade Orb', pct: 33, xp: '190' })}
${skillPanel({ type: 'fishing', label: 'Fishing', title: 'Fish Abyssal Eel', pct: 67, xp: '220' })}
${skillPanel({ type: 'woodcutting', label: 'Wood', title: 'Chop Runic Oak', pct: 0.5, xp: '35', requirement: 'Needs level 29', nav: false })}
${skillPanel({ type: 'construction', label: 'Build', title: 'Craft Runite Building Parts', pct: 52, xp: '461', ingredients: [
  { text: '🧱 Voidiron Building Parts 2205/2200', state: 'met' },
  { text: '🧱 Voidbark 14304/12100', state: 'met' },
  { text: '🪨 Voidiron Ore 2545/6050', state: 'unmet' },
  { text: '📦 Silver Building Parts 0/120', state: 'unmet' },
  { text: '📦 Obsidian Building Parts 51/280', state: 'unmet' },
  { text: '📦 Runite Building Parts 528/320', state: 'met' },
], requirement: 'Needs Construction Lv 29 + Woodcutting Lv 25' })}
</div></div>

<div class="fx-h">Quest cards — forged into the skill-frame family</div>
<div class="fx-grid fx-quest-grid fs-skills-section-frame" data-iw-skills-ui-ready="1" style="${SKILL_UI_STYLE}">
<div>
${questCard({ accent: '#B84A20', glyph: '⚔', state: 'active', title: 'Night Claw Bounty', brief: 'Bring back 100 Night Claws from Moonsteel Basin.', objective: '💠 Night Claw 22/100', objIcon: itemSprite('night_claw'), objItem: 'Night Claw', reward: '+3,225g • +1350 combat XP', pct: 22, turnInDisabled: true })}
${questCard({ accent: '#C9A66A', glyph: '❖', state: 'ready', title: 'Cache of the Basin', brief: 'Recover the lost supply cache.', objective: 'Supply Cache 1/1', reward: '+5,000g', pct: 100, turnInDisabled: false })}
</div><div>
${questCard({ accent: '#A56E86', glyph: '⋈', state: 'ready', kicker: 'Tailoring Work Order', title: 'Craft and turn in 1 Moonsilk Boots.', objective: '🧵 Moonsilk Boots 0/1', objIcon: gearSprite('Moonsilk Boots'), objItem: 'Moonsilk Boots', reward: '+3,870g • +3240 tailoring XP', pct: 0, turnInDisabled: false, skip: 8 })}
${questCard({ accent: '#4E9FB8', glyph: '◆', state: 'active', kicker: 'Jewelcrafting Work Order', title: 'Cut and turn in 3 Star Sapphires.', objective: '💠 Star Sapphire 1/3', reward: '+2,410g • +1980 jewelcrafting XP', pct: 33, turnInDisabled: true, skip: 5 })}
${questCard({ accent: '#5E8FB7', glyph: '✦', state: 'ready', kicker: 'Crafting Work Order', title: 'Hand in the batch.', objective: '💠 Ironwood Plank 38/38', reward: '+12,480g • +9720 crafting XP', pct: 100, turnInDisabled: false, turnInLabel: 'Turn In All (38)' })}
</div></div>

<div class="fx-h">Tooltip cards ? Toolkit-style rich equipment detail</div>
<div class="fx-grid fx-tooltip-grid">
<div>${tooltipCard({ sprite: gearSprite('Dreadguard Signet'), name: 'Dreadguard Signet', tier: 'rare',
  badges: ['Tier 16', '&#x1F6E1;&#xFE0F; Equipment', 'Ring slot', 'Requires Lv 53 (any skill)'],
  effect: 'ATK +22 &#x2022; DEF +16, Requires Lv 53 (any skill), XP +16/task, +32% 2x gather chance, +12% gold find',
  stats: [['&#x2694;&#xFE0F; ATK', '22'], ['&#x1F6E1;&#xFE0F; DEF', '16'], ['&#x2728; XP/task', '16'], ['&#x1F33F; 2&#x00D7; Gather', '32%'], ['&#x1F4B0; Gold Find', '12%'], ['&#x1F4B0; Base value', '8,000g', 'amber'], ['&#x1F3F7;&#xFE0F; Turn-in', '1 token']],
  acqMain: 'Zone drop', acqSub: 'Rate 1/20000 &#x00B7; boosted by Item Find %' })}</div>
<div>${tooltipCard({ sprite: gearSprite('Eye of the Tempest'), name: 'Eye of the Tempest', tier: 'rare',
  badges: ['Tier 17', '&#x1F6E1;&#xFE0F; Equipment', 'Amulet slot', 'Requires Lv 57 (any skill)'],
  effect: 'ATK +23 &#x2022; DEF +17, Requires Lv 57 (any skill), XP +17/task, +34% 2x gather chance, +14% gold find',
  stats: [['&#x2694;&#xFE0F; ATK', '23'], ['&#x1F6E1;&#xFE0F; DEF', '17'], ['&#x2728; XP/task', '17'], ['&#x1F33F; 2&#x00D7; Gather', '34%'], ['&#x1F4B0; Gold Find', '14%'], ['&#x1F4B0; Base value', '10,000g', 'amber'], ['&#x1F3F7;&#xFE0F; Turn-in', '1 token']],
  acqMain: 'Zone drop', acqSub: 'Rate 1/20000 &#x00B7; boosted by Item Find %' })}</div>
</div>

<div class="fx-h">Navigation rail &amp; controls</div>
<div data-iw-ui="main-nav" style="margin-bottom:14px">
  <button data-iw-ui="nav-tab" data-iw-state="active">Game</button>
  <button data-iw-ui="nav-tab">Market</button>
  <button data-iw-ui="nav-tab">Leaderboards</button>
  <button data-iw-ui="nav-tab">Village</button>
  <button data-iw-ui="nav-tab">Dungeon</button>
  <a data-iw-ui="nav-tab" data-iw-nav-link="toolkit" href="https://idleworldstoolkit.com" target="_blank" rel="noopener noreferrer">Toolkit</a>
</div>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
  <button class="iw-btn iw-btn--primary">Primary</button>
  <button class="iw-btn">Secondary</button>
  <button class="iw-btn" disabled>Disabled</button>
  <button data-iw-ui="zone-action">Next Zone</button>
  <input type="search" placeholder="Search items…" style="width:200px">
  <span data-iw-inventory-control="page-count">3 / 18</span>
</div>

<div class="fx-h">Inventory tool row &mdash; three framed controls and one ornament</div>
<div data-iw-inventory-root="1" style="padding:8px 0">
  <div class="flex items-center gap-2" style="display:flex;align-items:center;gap:8px;line-height:24px;font-size:16px">
    <div class="relative" style="position:relative"><button data-iw-inventory-control="icon" aria-label="Filter inventory" title="Filter inventory">${INV_TOOL_ICON.filter}</button></div>
    <button data-iw-inventory-control="icon" aria-label="Search inventory" title="Search inventory">${INV_TOOL_ICON.search}</button>
    <button data-iw-inventory-control="icon" aria-label="Equipment Window" title="Equipment Window">${INV_TOOL_ICON.shield}</button>
    ${INV_TOOL_ICON.box}
  </div>
</div>

<div class="fx-h">Header — plate, crest, utility rail and status band</div>
${headerBlock()}

<div class="fx-h">Activity panels — current action, log, and world chat</div>
<div class="fx-activity-panels">
  <section data-iw-ui="section-frame" data-iw-panel="current-action">
    <header data-iw-panel-part="header"><h2 data-iw-ui="section-title">Current Action</h2><div><button aria-label="Cancel current action">×</button><span>3s</span></div></header>
    <div><span>⚒</span> <strong>Prospect Moonsteel Ore</strong></div>
    <div data-iw-panel-part="progress" role="progressbar" aria-valuenow="48" aria-valuemax="100"><div style="width:48%"></div></div>
    <p>6457 crafts left before the next queued action (~10h 45m)</p>
    <div data-iw-panel-part="queue"><span>Queued</span><div>1. Mine Moonsteel</div><button aria-label="Remove queued action">×</button></div>
  </section>
  <section data-iw-ui="section-frame" data-iw-panel="action-log">
    <header data-iw-panel-part="header"><div><h2 data-iw-ui="section-title">Action Log</h2><button data-iw-panel-part="panel-control">View All</button></div><span>832,170 XP/hr</span></header>
    <div data-iw-panel-part="feed">
      <article data-iw-panel-part="feed-row"><div><span>System</span><time>12:33:37</time></div><p>Prospect Moonsteel Ore completed 1 time. Salvage Material x28.</p><p>XP jewelcrafting+1387</p></article>
      <article data-iw-panel-part="feed-row"><div><span>System</span><time>12:33:25</time></div><p>Prospect Moonsteel Ore completed 1 time. Salvage Material x28.</p><p>XP jewelcrafting+1387</p></article>
      <article data-iw-panel-part="feed-row"><div><span>System</span><time>12:33:20</time></div><p>Prospect Moonsteel Ore completed 1 time. Salvage Material x28.</p><p>XP jewelcrafting+1387</p></article>
    </div>
  </section>
  <section data-iw-ui="section-frame" data-iw-panel="world-chat">
    <header data-iw-panel-part="header"><div><h2 data-iw-ui="section-title">World Chat</h2><p>Showing the latest 100 messages.</p></div><div><button aria-label="Favourite chat">☆</button><button aria-label="Global chat">◎</button><button aria-label="Chat settings">⚙</button></div></header>
    <div data-iw-panel-part="feed">
      <article data-iw-panel-part="feed-row"><div><strong>📣 IdleWorlds</strong><time>12:16:44</time></div><p><b>Kno000</b> was trying to upgrade their Regal Silk Boots+1, but they failed.</p></article>
      <article data-iw-panel-part="feed-row"><div><strong>📣 IdleWorlds</strong><time>12:16:55</time></div><p><b>Kno000</b> successfully upgraded Regal Silk Boots+1 to Regal Silk Boots+2!</p></article>
      <article data-iw-panel-part="feed-row"><div><strong>📣 IdleWorlds</strong><time>12:18:53</time></div><p>While gathering in Kingsfall Citadel, <b>BritishDemon</b> found a Kingsteel Upgrade Orb!</p></article>
    </div>
    <form data-iw-panel-part="composer"><input data-iw-panel-part="chat-input" placeholder="Message world chat..."><button data-iw-panel-part="send" type="button">Send</button></form>
  </section>
</div>

<div class="fx-h">Village &mdash; housing hero, add-on slots and the install picker</div>
<div class="fx-village">
  <div class="fx-village-col">
  <div data-iw-ui="section-frame" data-iw-village="housing" style="padding:14px">
    <h2 data-iw-ui="section-title" style="margin:0 0 10px">Village</h2>
    <div class="compact-panel" data-iw-village="house" data-iw-village-tier="4">
      <p data-iw-village-role="house-name">&#x1F3E0; Manor</p>
      <p data-iw-village-role="house-tier">Current tier: 4 &#x2022; Base actions take 6s</p>
      <p data-iw-village-role="house-note">Longer crafts also speed up proportionally. A 3-minute gear craft gets 18 seconds faster per housing tier.</p>
      <p data-iw-village-role="house-salvage">Salvage Material owned: 12,004</p>
      <p data-iw-village-role="house-next" class="text-emerald-100">Next upgrade: Citadel &#x2022; 1,000,000,000g &#x2022; 100,000,000 salvage</p>
      <button data-iw-village-role="action" data-iw-village-action="upgrade">Upgrade Housing</button>
      <div class="iw-village-art" data-iw-village-art="house" aria-hidden="true" style="--iw-village-sprite:url('${fileUrl('assets/village/house_4.webp')}')"></div>
      <div class="iw-village-tiers" aria-hidden="true">
        <span class="iw-village-tier-pip" data-iw-village-pip="held"></span>
        <span class="iw-village-tier-pip" data-iw-village-pip="held"></span>
        <span class="iw-village-tier-pip" data-iw-village-pip="held"></span>
        <span class="iw-village-tier-pip" data-iw-village-pip="held"></span>
        <span class="iw-village-tier-pip" data-iw-village-pip="open"></span>
      </div>
    </div>
  </div>
  <div data-iw-ui="section-frame" data-iw-village="addons" style="padding:14px">
    <h2 data-iw-ui="section-title" style="margin:0 0 8px">&#x1F3D7;&#xFE0F; Village Add-ons</h2>
    <p data-iw-village-role="intro">4 slots available (1 per housing tier). Only one of each building type per village.</p>
    <div style="display:grid;gap:8px">
      ${villageSlot({ n: 1, name: 'Voidiron Archive', file: 'building_11.webp', effects: '+4 ATK &#x2022; +7 XP/task &#x2022; +8% Item Find &#x2022; +2 smithing level' })}
      ${villageSlot({ n: 2, name: 'Celestial Exchange', file: 'building_12.webp', effects: '+7 XP/task &#x2022; +8% Gold Find &#x2022; +4% Double Gather &#x2022; +2 gathering level' })}
      ${villageSlot({ n: 3 })}
      <div class="compact-panel" data-iw-village="slot" data-iw-village-state="vacant">
        <div data-iw-village-role="head" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div data-iw-village-role="copy">
            <p data-iw-village-role="index">Slot 4</p>
            <p data-iw-village-role="vacant">Empty slot</p>
          </div>
          <button data-iw-village-role="action" data-iw-village-action="cancel">Cancel</button>
        </div>
        ${villageArt(null)}
        <div data-iw-village-role="picker">
          ${villageOption('Sunforge Arena', 'building_15.webp', '+9 ATK &#x2022; +6 XP/task')}
          ${villageOption('Skysteel Observatory', 'building_25.webp', '+11 XP/task &#x2022; +9% Item Find')}
        </div>
      </div>
    </div>
    <p data-iw-village-role="note">Assemble a building in the Construction skill panel first.</p>
  </div>
  </div>
  <div class="fx-village-rest">the route's wide column</div>
</div>

<div class="fx-h">Section frame</div>
<div data-iw-ui="section-frame" style="padding:14px">
  <h2 data-iw-ui="section-title" style="margin:0 0 8px">Inventory</h2>
  <div class="iw-xp">
    <div class="iw-xp__line"><span class="iw-xp__pct">62%</span><span class="iw-xp__togo">12,480 to go</span></div>
    <div class="iw-xp__track"><div class="iw-xp__fill" style="width:62%"></div></div>
  </div>
</div>

</body></html>`;

await mkdir(OUT, { recursive: true });
await writeFile(resolve(OUT, 'fixture.html'), page, 'utf8');

// The sandbox ships a Chromium build that may not match the playwright package's
// expected revision, and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD stops it fetching one.
// Point at whatever is actually on disk.
async function findChromium() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ];
    for (const candidate of candidates) {
      try { await access(candidate); return candidate; } catch { /* try next */ }
    }
  }
  const base = '/opt/pw-browsers';
  try {
    const dirs = (await readdir(base)).filter(d => d.startsWith('chromium-')).sort().reverse();
    for (const d of dirs) return `${base}/${d}/chrome-linux/chrome`;
  } catch { /* fall through */ }
  return undefined;
}
const executablePath = await findChromium();
// `--headless=old` was removed from modern Chrome builds; playwright only stops
// passing it when it recognises the binary as chrome-headless-shell.
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  ignoreDefaultArgs: ['--headless=old'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

const consoleIssues = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleIssues.push(m.text()); });
p.on('requestfailed', r => consoleIssues.push(`FAILED ${r.url()} — ${r.failure()?.errorText}`));

await p.goto(fileUrl('build-tools/fixtures/fixture.html'), { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);

await p.screenshot({ path: resolve(OUT, 'full.png'), fullPage: true });
await p.locator('.fx-skill-grid').screenshot({ path: resolve(OUT, 'skills-panel.png') });
await p.locator('.fx-quest-grid').screenshot({ path: resolve(OUT, 'quest-panel.png') });

// Once the action_frame sprite is on a quest command button, that sprite is the
// ONLY frame — skillpanel.css strips the plate to `box-shadow: none` and the
// depth cue lives in `filter: drop-shadow()`. base.css's generic
// `button { box-shadow: inset .., 0 1px 0 .. !important }` is (0,4,1) and used
// to outlive that strip (the strip rule is (0,4,0)), leaving a hairline just
// outside the art that read as a faint second frame. Needs base.css to carry
// the `:not([data-iw-quest-role])` opt-out; revert it and this throws.
const questButtonShadow = await p.evaluate(() => {
  const btns = [...document.querySelectorAll(
    '[data-iw-skills-ui-ready="1"] [data-iw-quest-role="turn-in"], ' +
    '[data-iw-skills-ui-ready="1"] [data-iw-quest-role="skip"]')];
  return {
    count: btns.length,
    withStrayShadow: btns
      .filter(b => getComputedStyle(b).boxShadow !== 'none')
      .map(b => `${b.textContent.trim()}: ${getComputedStyle(b).boxShadow}`),
  };
});
if (!questButtonShadow.count) {
  throw new Error('no ready quest command buttons in the fixture — this check cannot fail, so it is broken');
}
if (questButtonShadow.withStrayShadow.length) {
  throw new Error('quest command button keeps a plate box-shadow over its action_frame sprite ' +
    '(a second frame): ' + JSON.stringify(questButtonShadow.withStrayShadow));
}

// The skill command button and the quest rail wear the SAME artwork (Curtis,
// 2026-09) -- but no longer through the same technique, so a string equality of
// the two computed windows is not the check any more. The quest turn-in's label
// carries a live count, so its frame is cut into three bands (left cap / flat
// middle / right cap) and only the middle stretches; the skill button's label
// is a fixed short verb, so it keeps the whole-cell window.
//
// What still has to hold is that every one of those windows resolves to the
// SAME cell of the SAME sheet. So this reverses each computed percentage back
// into the source rect it addresses and compares THAT against
// skills_ui_index.json -- which is stronger than the old equality (it would
// also have caught a pair that agreed with each other on the wrong cell) and,
// like it, fails the moment either surface silently falls back to a plate.
const ACTION_CELL = skillUiByKey.get('action_frame_idle');
const commandFrame = await p.evaluate(({ atlasW, atlasH, cell, cap }) => {
  const num = v => parseFloat(v);
  // A percentage background-position maps the image's own p% point onto the
  // box's p% point, so a window `bandW` source pixels wide sits at
  //   sourceX = p% * (atlasW - bandW) / 100.
  const window = (el, pseudo, bandW) => {
    const cs = getComputedStyle(el, pseudo);
    const [sx, sy] = cs.backgroundSize.split(/\s+/).map(num);
    const [px, py] = cs.backgroundPosition.split(/\s+/).map(num);
    if (!cs.backgroundImage || cs.backgroundImage === 'none') return null;
    return {
      image: cs.backgroundImage,
      sourceX: +((px / 100) * (atlasW - bandW)).toFixed(2),
      sourceY: +((py / 100) * (atlasH - cell.height)).toFixed(2),
      scaleX: +(sx / 100 * bandW / atlasW).toFixed(4),
      scaleY: +(sy / 100 * cell.height / atlasH).toFixed(4),
    };
  };
  // Both sides must be in the SAME state or the comparison is meaningless: a
  // disabled quest turn-in draws action_frame_DISABLED (the grey cell), not the
  // gold idle one, and every skill button in the fixture is primary.
  const quest = document.querySelector(
    '[data-iw-skills-ui-ready="1"] [data-iw-quest-role="turn-in"]:not(:disabled)');
  const skills = [...document.querySelectorAll(
    '.compact-panel.fs-skill-panel[data-iw-skills-ui-ready="1"] ' +
    'button[data-iw-skill-role="action-button"]:not(:disabled)')];
  const mid = cell.width - cap * 2;
  return {
    count: skills.length,
    // key -> [window, expected source x, expected band width]
    windows: quest ? {
      'quest mid': [window(quest, null, mid), cell.x + cap],
      'quest cap-left': [window(quest, '::before', cap), cell.x],
      'quest cap-right': [window(quest, '::after', cap), cell.x + cell.width - cap],
    } : null,
    skillWindows: skills.map(el => [el.textContent.trim(), window(el, null, cell.width)]),
    plated: skills.filter(el => {
      const cs = getComputedStyle(el);
      return cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0;
    }).map(el => `${el.textContent.trim()}: ${getComputedStyle(el).boxShadow} / ${getComputedStyle(el).borderTopWidth}`),
    // The plate's diamond studs are its ornament; the frame art carries its own.
    studs: skills.filter(el => ['::before', '::after']
      .some(pseudo => getComputedStyle(el, pseudo).content !== 'none')).length,
    ratios: skills.map(el => {
      const r = el.getBoundingClientRect();
      return +(r.width / r.height).toFixed(2);
    }),
  };
}, {
  atlasW: skillsUiIndex.width, atlasH: skillsUiIndex.height,
  cell: ACTION_CELL, cap: Math.min(ACTION_CAP_PX, Math.floor(ACTION_CELL.width / 2) - 1),
});
if (!commandFrame.count || !commandFrame.windows) {
  throw new Error('no ready skill/quest command buttons in the fixture — this check cannot fail, so it is broken');
}
const frameFaults = [];
for (const [name, [win, expectedX]] of Object.entries(commandFrame.windows)) {
  if (!win) { frameFaults.push(`${name}: no background image (fell back to a plate?)`); continue; }
  if (Math.abs(win.sourceX - expectedX) > 0.6 || Math.abs(win.sourceY - ACTION_CELL.y) > 0.6) {
    frameFaults.push(`${name}: addresses source ${win.sourceX},${win.sourceY} — expected ${expectedX},${ACTION_CELL.y}`);
  }
}
for (const [label, win] of commandFrame.skillWindows) {
  if (!win) { frameFaults.push(`skill "${label}": no background image (fell back to a plate?)`); continue; }
  if (Math.abs(win.sourceX - ACTION_CELL.x) > 0.6 || Math.abs(win.sourceY - ACTION_CELL.y) > 0.6) {
    frameFaults.push(`skill "${label}": addresses source ${win.sourceX},${win.sourceY} — ` +
      `expected the action_frame_idle cell at ${ACTION_CELL.x},${ACTION_CELL.y}`);
  }
  const questMid = commandFrame.windows['quest mid'][0];
  if (questMid && win.image !== questMid.image) {
    frameFaults.push(`skill "${label}" draws a different sheet from the quest rail: ${win.image} vs ${questMid.image}`);
  }
}
if (frameFaults.length) {
  throw new Error('command button artwork is not the quest rail action_frame: ' + JSON.stringify(frameFaults));
}
if (commandFrame.plated.length) {
  throw new Error('skill command button keeps its plate under the action_frame sprite ' +
    '(a second frame): ' + JSON.stringify(commandFrame.plated));
}
if (commandFrame.studs) {
  throw new Error(`${commandFrame.studs} skill command buttons keep the plate's diamond studs over the frame art`);
}
if (commandFrame.ratios.some(r => Math.abs(r - 3.52) > 0.12)) {
  throw new Error('skill command button distorts the 3.52 action_frame art: ' +
    commandFrame.ratios.join(','));
}

/* THE LABEL LENGTH IS THE GAME'S, THE FRAME HAS TO FOLLOW IT.
   A work order's turn-in reads "Turn In All (38)" and the count is live. The
   old geometry pinned the box to the art's 3.52 ratio over a 148px floor and
   kept a FIXED 20px of padding, while the frame's end flourishes are a
   fraction of the box — so a long label ran out under the horns, which is what
   Curtis reported. Two things are asserted, and reverting either half of the
   fix breaks one of them:
     * the frame grows sideways only — same height as the short-label button;
     * the label's ink stays inside the CONTENT box, which is exactly the flat
       middle band (padding == the cap width, by construction).
   Measured with a Range over the real text node, so it is the painted line
   box, not scrollWidth on a flex container. */
const labelFit = await p.evaluate(() => {
  const buttons = [...document.querySelectorAll(
    '[data-iw-skills-ui-ready="1"] [data-iw-quest-role="turn-in"]:not(:disabled)')];
  return buttons.map(btn => {
    const cs = getComputedStyle(btn);
    const box = btn.getBoundingClientRect();
    const node = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    let text = null;
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      text = { left: r.left, right: r.right, width: r.width };
    }
    return {
      label: btn.textContent.trim(),
      width: +box.width.toFixed(1),
      height: +box.height.toFixed(1),
      padLeft: parseFloat(cs.paddingLeft),
      padRight: parseFloat(cs.paddingRight),
      overflowLeft: text ? +(box.left + parseFloat(cs.paddingLeft) - text.left).toFixed(1) : null,
      overflowRight: text ? +(text.right - (box.right - parseFloat(cs.paddingRight))).toFixed(1) : null,
    };
  });
});
const longLabel = labelFit.find(b => /\(\d+\)/.test(b.label));
const shortLabel = labelFit.find(b => b !== longLabel);
if (!longLabel || !shortLabel) {
  throw new Error('the fixture has no long-label quest turn-in to compare — this check cannot fail, so it is broken');
}
if (labelFit.some(b => b.padLeft < 1 || b.padRight < 1)) {
  throw new Error('a quest turn-in has no cap padding, so its label sits on the frame flourishes: ' +
    JSON.stringify(labelFit));
}
if (labelFit.some(b => b.overflowLeft > 0.6 || b.overflowRight > 0.6)) {
  throw new Error('a quest turn-in label runs out past the frame\'s flat interior: ' +
    JSON.stringify(labelFit));
}
if (Math.abs(longLabel.height - shortLabel.height) > 0.6) {
  throw new Error('a longer turn-in label changed the button HEIGHT — the frame must grow ' +
    `sideways only: ${JSON.stringify({ longLabel, shortLabel })}`);
}
if (longLabel.width <= shortLabel.width + 1) {
  throw new Error('a longer turn-in label did not widen its frame: ' +
    JSON.stringify({ longLabel, shortLabel }));
}

await p.locator('.fx-village').screenshot({ path: resolve(OUT, 'village.png') });

/* The Village art is the point of the surface, and a `background-image` that
   404s still reports a perfectly correct computed style (CLAUDE.md, "a render
   harness that cannot load its assets looks exactly like broken CSS"). So this
   measures PAINT: decode each medallion's sprite in the page and require real
   ink. It also checks the sprite is not stretched — the sources have their own
   aspect ratios and `background-size: <pct> auto` must preserve them. */
const villageAudit = await p.evaluate(async () => {
  const out = [];
  for (const el of document.querySelectorAll('.iw-village-art[data-iw-village-art="building"], .iw-village-art[data-iw-village-art="house"]')) {
    // The sprite is on ::before, from --iw-village-sprite. Read the pseudo's
    // COMPUTED background-image rather than the custom property's raw token
    // stream, so this also proves the var actually resolved into a paint.
    const url = /url\("?([^")]+)"?\)/.exec(getComputedStyle(el, '::before').backgroundImage)?.[1];
    const box = el.getBoundingClientRect();
    if (!url) { out.push({ url: null, box: [box.width, box.height] }); continue; }
    const img = new Image();
    img.src = url;
    let ok = true;
    try { await img.decode(); } catch { ok = false; }
    out.push({ url: url.split('/').pop(), ok, natural: [img.naturalWidth, img.naturalHeight], box: [box.width, box.height] });
  }
  return out;
});
if (villageAudit.length !== 3) {
  throw new Error(`expected 3 painted village medallions, measured ${villageAudit.length}`);
}
for (const entry of villageAudit) {
  if (!entry.url || !entry.ok || !entry.natural[0]) {
    throw new Error(`village sprite failed to load: ${JSON.stringify(entry)}`);
  }
  if (entry.natural[0] !== entry.natural[1]) {
    throw new Error(`village sprite is not the square canvas the import tool writes: ${JSON.stringify(entry)}`);
  }
}
console.log(`village medallions paint real art (${villageAudit.map(e => e.url).join(', ')})  ok`);

await p.locator('[data-iw-inventory-root="1"]').first().screenshot({ path: resolve(OUT, 'inventory-panel.png') });
await p.locator('[data-iw-header="root"]').screenshot({ path: resolve(OUT, 'header.png') });

// The header band is a DESKTOP composition; RESPONSIVE_WIDTHS below tops out
// below 1280 (Tailwind's `xl`, where the game's own panel columns collapse to
// one — see V1.6.0_MOBILE_LAYOUT_AUDIT.md), so auditing it there would never
// exercise the two-column layout this checks. Audit it here, at the 1400
// viewport the screenshot is taken in — the context viewport used to be 1240,
// which is BELOW 1280 and so was already rendering header.css's single-column
// treatment inside a fixture meant to show the desktop composition.
const headerAudit = await p.evaluate(() => {
  const root = document.querySelector('[data-iw-header="root"]');
  const btns = [...root.querySelectorAll('[data-iw-header="utility-button"]')];
  const tiles = [...root.querySelectorAll('[data-iw-header="status-card"]')];
  const t0 = tiles[0];
  const after = getComputedStyle(root, '::after');
  // The utility rail is now row 2 of the identity region: a strip directly
  // beneath the smoked-glass frame, its buttons spread `space-between` so the
  // first/last sit flush with the frame's left/right edges.
  const region = root.querySelector('[data-iw-header="identity-region"]');
  const rr = region.getBoundingClientRect();
  const pr = root.querySelector('[data-iw-header="profile"]').getBoundingClientRect();
  const first = btns[0].getBoundingClientRect();
  const last = btns[btns.length - 1].getBoundingClientRect();
  const railGaps = btns.slice(1).map((el, i) =>
    +(el.getBoundingClientRect().left - btns[i].getBoundingClientRect().right).toFixed(1));
  return {
    utilityCount: btns.length,
    tileCount: tiles.length,
    // > 0: the rail sits below the profile block, not level with the status band.
    railBelowFrame: +(first.top - pr.bottom).toFixed(1),
    // ~0 (within the frame's ±8px bleed): first/last button flush with frame edges.
    railLeftInset: +(first.left - rr.left).toFixed(1),
    railRightInset: +(rr.right - last.right).toFixed(1),
    // ~0: the four inter-button gaps are equal (evenly spaced).
    railGapSpread: +(Math.max(...railGaps) - Math.min(...railGaps)).toFixed(1),
    // The status tiles must stay COMPACT (Curtis, 2026-09: the old 42px tiles
    // read too tall/wide against the zone art). Assert the declared min-height,
    // not the rendered box — a headless emoji fallback inflates line boxes here
    // while the live tiles sit at their min-height. The utility rail is no
    // longer part of this band, so it is no longer the reference.
    firstTileMinHeight: parseFloat(getComputedStyle(t0).minHeight),
    // Every tile must share one surface family: tile 1 is a <div> and the rest
    // are <button>, and the generic control rule used to repaint only the
    // buttons, so tile 1 alone kept the bracket plate.
    distinctTileBorders: [...new Set(tiles.map(el => getComputedStyle(el).borderTopColor))],
    distinctTileBg: [...new Set(tiles.map(el => getComputedStyle(el).backgroundImage.slice(0, 60)))].length,
    // The status grid must still be top-aligned so its first tile sits level
    // with the identity FRAME's top edge (the rail moved out from under this
    // constraint, but the frame did not).
    gridAlignContent: getComputedStyle(root.querySelector('[data-iw-header="status-grid"]')).alignContent,
    // The header must draw the SAME corner filigree as every other framed
    // surface, so the page reads as one system.
    cornersPainted: /panel_corners.webp/.test(after.borderImageSource),
    borderSlice: after.borderImageSlice,
    ornamentBehindContent: Number(after.zIndex) <= 0,
    clipped: tiles.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim().slice(0, 30)),
  };
});
console.log('\nheader band:', JSON.stringify(headerAudit));
if (headerAudit.railBelowFrame < 2) {
  throw new Error(`header utility rail should sit below the identity frame, not level with it (gap ${headerAudit.railBelowFrame}px)`);
}
if (Math.abs(headerAudit.railLeftInset) > 10 || Math.abs(headerAudit.railRightInset) > 10) {
  throw new Error(`header utility rail is not flush with the identity frame edges: left ${headerAudit.railLeftInset}px, right ${headerAudit.railRightInset}px`);
}
if (headerAudit.railGapSpread > 2) {
  throw new Error(`header utility buttons are not evenly spaced across the frame: gap spread ${headerAudit.railGapSpread}px`);
}
if (headerAudit.firstTileMinHeight > 40 || headerAudit.firstTileMinHeight < 24) {
  throw new Error(`header status tiles are not compact: first tile min-height ${headerAudit.firstTileMinHeight}px (want 24-40)`);
}
if (!/^(start|flex-start)$/.test(headerAudit.gridAlignContent)) {
  throw new Error(`header status grid must be top-aligned, got align-content: ${headerAudit.gridAlignContent}`);
}
if (!headerAudit.cornersPainted) throw new Error('header must use the shared panel_corners.webp filigree, like every other frame');
if (!headerAudit.ornamentBehindContent) throw new Error('header frame ornament sits above the status tiles');
if (headerAudit.distinctTileBorders.length !== 1) {
  throw new Error(`header status tiles do not share one surface: borders ${JSON.stringify(headerAudit.distinctTileBorders)}`);
}
if (headerAudit.clipped.length) {
  throw new Error(`header status tiles truncate their values: ${JSON.stringify(headerAudit.clipped)}`);
}
/* Per-zone header art has two forms: the wide strip (--iw-header-surface) and
   the portrait crop (--iw-header-surface-mobile), and header.css swaps to the
   second inside `@media (max-width: 768px)`. Verify the swap by name at a phone
   width, then restore the desktop viewport the ink checks below require.
   Negative control: delete the @media block and the wide strip stays at 390px. */
const headerSurfaceBy = async width => {
  await p.setViewportSize({ width, height: 900 });
  await p.waitForTimeout(40);
  return p.evaluate(() => getComputedStyle(document.querySelector('[data-iw-header="root"]')).backgroundImage);
};
const surfaceNarrow = await headerSurfaceBy(390);
const surfaceWide = await headerSurfaceBy(1400);
await p.waitForTimeout(40);
if (!/zone_1_mobile\.webp/.test(surfaceNarrow)) {
  throw new Error(`header did not swap to the mobile zone surface at 390px: ${surfaceNarrow}`);
}
if (!/header_surface\.webp/.test(surfaceWide) || /zone_1_mobile\.webp/.test(surfaceWide)) {
  throw new Error(`header did not restore the wide zone surface at 1400px: ${surfaceWide}`);
}
console.log('header surface swap: mobile <=768, wide >768  ok');
/* The player's own display colour belongs to the game (rule 5). Removing the
   skin's zone-tinted repaint of it took FOUR passes, because the repaint never
   lived where it looked like it lived. The live shape is
   `h1[data-iw-header="profile-name"] > button.hover:underline`, and the game
   paints it with a clip-text gradient — a `background-image` shown through
   transparent glyphs. Three separate rules of ours broke it, only one of them
   in header.css:

     base.css  h1, h2, h3               { color: … !important }  beat the h1.
     base.css  button, [role="button"]  { color: var(--iw-text) } beat the
       BUTTON — and did so despite being weak and non-important, because a
       declaration on the element itself always beats an INHERITED value;
       specificity never enters into it. That rule's own comment ("any colour
       the game sets itself outranks this") is true only for a colour set ON
       the button, which is why this went unseen for so long.
     base.css  [class*="hover:underline"] { background: none !important } was
       the one that BLANKED it: the `background` SHORTHAND resets every
       longhand, so it took `background-image` and `background-clip` with it
       and the glyphs had nothing left to paint through.

   So assert the game's own paint survives all the way to rendered pixels.
   Negative controls, each verified to fail: restore that shorthand (blank), or
   drop either `:where()` exclusion in base.css (repainted warm). */
const nameStyle = await p.evaluate(() => {
  const btn = document.querySelector('[data-iw-header="profile-name"] button');
  const cs = getComputedStyle(btn);
  return { image: cs.backgroundImage, clip: cs.backgroundClip, fill: cs.webkitTextFillColor };
});
if (!/linear-gradient/.test(nameStyle.image) || nameStyle.clip !== 'text') {
  throw new Error(
    `the skin destroyed the player name's own clip-text paint: background-image ${nameStyle.image}, ` +
    `background-clip ${nameStyle.clip}. Almost certainly a \`background: none/…\` SHORTHAND somewhere — ` +
    `use the background-COLOUR longhand so the game's gradient survives.`);
}
/* Computed style alone cannot see whether the glyphs actually paint (this is the
   "a check reporting zero is passing" family), so measure the ink too: it must
   exist, and it must still be the game's blue rather than a warm skin token. */
const nameInk = await (async () => {
  const shot = (await p.locator('[data-iw-header="profile-name"]').screenshot()).toString('base64');
  return p.evaluate(async (shot) => {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej;
      i.src = 'data:image/png;base64,' + shot;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) continue;
      if (d[i] + d[i + 1] + d[i + 2] > 150) { n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    }
    return n ? { n, r: r / n, g: g / n, b: b / n } : { n: 0 };
  }, shot);
})();
if (nameInk.n < 200) {
  throw new Error(`the player name paints no glyphs (${nameInk.n} ink px) — the skin blanked it`);
}
if (nameInk.b <= nameInk.r) {
  throw new Error(
    `the player name is not the game's own colour any more: mean ink rgb(${[nameInk.r, nameInk.g, nameInk.b].map(Math.round)}) ` +
    `is warm, so a skin token repainted it. The player's display colour is the game's (rule 5).`);
}
console.log(`player name keeps the game's own clip-text gradient (${nameInk.n} ink px, blue-dominant)  ok`);
/* Sprite-backed chrome is only aligned if the ART is concentric with the BOX,
   and no computed-style check can see that: the sheet's own dead margin lives
   inside the image. So measure the painted pixels. utility_frame.webp is
   208x197 carrying a 180x176 plate at offset 6,7, and the old
   `border-image … 50 fill / 11px` mapped the whole sheet onto the button —
   which put a 35.5x37.1 plate in a 42x42 box, centred at 19.25,20.25 while the
   box-centred glyph sat at 21,21. Reverting the CSS crop fails this. */
async function inkBox(locator) {
  const shot = (await locator.screenshot()).toString('base64');
  const box = await locator.boundingBox();
  return p.evaluate(async ({ shot, box }) => {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej;
      i.src = 'data:image/png;base64,' + shot;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) {
      const i = (py * w + px) * 4;
      if (d[i + 3] > 24 && (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) > 14) {
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    const sx = box.width / w, sy = box.height / h;
    return {
      boxW: +box.width.toFixed(2), boxH: +box.height.toFixed(2),
      inkW: +((x1 - x0 + 1) * sx).toFixed(2), inkH: +((y1 - y0 + 1) * sy).toFixed(2),
      offX: +(((x0 + x1 + 1) / 2 * sx) - box.width / 2).toFixed(2),
      offY: +(((y0 + y1 + 1) / 2 * sy) - box.height / 2).toFixed(2),
    };
  }, { shot, box });
}

/* The FRAME being concentric with its box says nothing about the GLYPH being
   concentric with the frame — those are two different boxes, and the glyph one
   was off by half its own width for three rounds. Measure it directly. */
const glyphCentring = await p.evaluate(() => {
  const btns = [...document.querySelectorAll('[data-iw-inventory-control="icon"]')];
  return btns.map(el => {
    const b = el.getBoundingClientRect();
    const g = el.querySelector('svg').getBoundingClientRect();
    return {
      label: el.getAttribute('aria-label') || 'icon',
      dx: +((g.x + g.width / 2) - (b.x + b.width / 2)).toFixed(2),
      dy: +((g.y + g.height / 2) - (b.y + b.height / 2)).toFixed(2),
      btnDisplay: getComputedStyle(el).display,
      svgDisplay: getComputedStyle(el.querySelector('svg')).display,
    };
  });
});
console.log('inventory glyph centring:', JSON.stringify(glyphCentring));
if (!glyphCentring.length) {
  throw new Error('no inventory tool controls in the fixture — this check cannot fail, so it is broken');
}
/* NOT a computed-style check on the svg: `display: grid` blockifies its own
   children, so the fix itself would satisfy that and the check could never
   fail. What actually has to hold is that the PAGE ships preflight — without
   `svg{display:block}` the icon is inline content, a button centres it for
   free, and reverting the fix would not move it. Assert the input, not the
   output. */
if (!/svg[^{]*\{[^}]*display:\s*block/.test(PREFLIGHT_CSS)) {
  throw new Error('fixture is missing the live page preflight `svg{display:block}` — without it this ' +
    'check cannot see the glyph left-shift at all and will pass on broken CSS');
}
for (const g of glyphCentring) {
  if (Math.abs(g.dx) > 0.6 || Math.abs(g.dy) > 0.6) {
    throw new Error(`inventory "${g.label}" glyph sits ${g.dx},${g.dy}px off its frame centre ` +
      `(button ${g.btnDisplay}, svg ${g.svgDisplay}) — a block-level icon needs explicit centring`);
  }
}

const plate = await inkBox(p.locator('[data-iw-header="utility-button"]').first());
const invTool = await inkBox(p.locator('[data-iw-inventory-control="icon"]').first());
console.log('utility plate:', JSON.stringify(plate));
console.log('inventory tool frame:', JSON.stringify(invTool));
/* Tolerance is 1px, not 0. Ink is found by luminance against the page, so art
   whose outermost band is near-black (nav_frame_idle's lower bevel) reads a
   fraction short at that edge; the defect this guards against was 1.75px. */
for (const [label, m] of [['utility button plate', plate], ['inventory tool frame', invTool]]) {
  if (Math.abs(m.offX) > 1 || Math.abs(m.offY) > 1) {
    throw new Error(`${label} art is not concentric with its box: offset ${m.offX},${m.offY}px ` +
      `(ink ${m.inkW}x${m.inkH} in ${m.boxW}x${m.boxH}) — a box-centred glyph lands off-centre in the frame`);
  }
  if (m.inkW < m.boxW * 0.92 || m.inkH < m.boxH * 0.92) {
    throw new Error(`${label} art fills only ${m.inkW}x${m.inkH} of its ${m.boxW}x${m.boxH} box — ` +
      `the sheet's dead margin is being mapped onto the control, so the row will gap unevenly`);
  }
}

await p.locator('.fx-tooltip-grid').screenshot({ path: resolve(OUT, 'tooltips.png') });
await p.locator('.fx-activity-panels').screenshot({ path: resolve(OUT, 'activity-panels.png') });

await p.setViewportSize({ width: 390, height: 360 });
await p.waitForTimeout(50);
const shortTooltip = p.locator('.fx-tooltip-grid .iw-tip').first();
await shortTooltip.screenshot({ path: resolve(OUT, 'mobile-tooltip.png') });
const shortTooltipAudit = await shortTooltip.evaluate(el => ({
  height: el.getBoundingClientRect().height,
  maxHeight: parseFloat(getComputedStyle(el).maxHeight),
  scrollable: (() => { const body = el.querySelector('.iw-tip-body'); return body && body.scrollHeight > body.clientHeight; })(),
  closeVisible: !!el.querySelector('.iw-tip-close') && getComputedStyle(el.querySelector('.iw-tip-close')).display !== 'none',
}));
if (shortTooltipAudit.height > 341) throw new Error(`mobile tooltip exceeds short viewport: ${shortTooltipAudit.height}px`);
if (!shortTooltipAudit.scrollable) throw new Error('mobile tooltip body must scroll when content exceeds the viewport');
if (!shortTooltipAudit.closeVisible) throw new Error('mobile tooltip close control is not visible');

// 640/768/1024 are Tailwind's own sm/md/lg breakpoints, which every skin
// stylesheet's own breakpoints were realigned to (see
// V1.6.0_MOBILE_LAYOUT_AUDIT.md) — 640 replaces the old 600 (skillpanel/
// ui-system/inventory's mobile edge), 768 replaces 700/800/780, 1024 replaces
// 900/860. 900 stays in the sweep too: it used to BE a breakpoint and is now
// interior to the 641-1024 tablet band, worth confirming nothing regressed
// there. 1279 sits one pixel below 1280 (Tailwind's `xl`, where the game's own
// panel columns collapse to one — header.css's own §9 breakpoint) so the
// per-width header checks below exercise that edge too.
const RESPONSIVE_WIDTHS = [320, 360, 390, 430, 640, 768, 900, 1024, 1279];
const auditResponsive = async width => {
  await p.setViewportSize({ width, height: 844 });
  await p.waitForTimeout(60);
  const audit = await p.evaluate(viewportWidth => {
    const rows = [...document.querySelectorAll('.compact-row:has(> .fs-inv-row)')];
    const panels = [...document.querySelectorAll('.fx-skill-grid .compact-panel.fs-skill-panel')];
    const medallions = panels.map(el => el.querySelector('.fs-skill-medallion-art')).filter(Boolean);
    const identityLevels = panels.map(el => el.querySelector('[data-iw-skill-role="identity-level"]')).filter(Boolean);
    const actionButtons = panels.map(el => el.querySelector('[data-iw-skill-role="action-button"]')).filter(Boolean);
    const navPanels = panels.filter(el => el.querySelector('[data-iw-skill-role="nav-group"]'));
    const navButtons = panels.flatMap(el => [...el.querySelectorAll('[data-iw-skill-role="nav-button"]')]);
    const basePlaques = panels.map(el => el.querySelector('.fs-skill-base-exp')).filter(Boolean);
    const ingredientGrids = panels.flatMap(el => [...el.querySelectorAll('.fs-skill-ingredient-grid')]);
    const ingredientSources = panels.flatMap(el => [...el.querySelectorAll('[data-iw-ingredient-list-source="1"]')]);
    const activityPanels = [...document.querySelectorAll('.fx-activity-panels > [data-iw-panel]')];
    const activityWrapper = document.querySelector('.fx-activity-panels');
    const activityWrapperRect = activityWrapper?.getBoundingClientRect();
    const activityFeeds = activityPanels.flatMap(el => [...el.querySelectorAll('[data-iw-panel-part="feed"]')]);
    const activityRows = activityPanels.flatMap(el => [...el.querySelectorAll('[data-iw-panel-part="feed-row"]')]);
    const activityProgress = document.querySelector('[data-iw-panel="current-action"] [data-iw-panel-part="progress"]');
    const composer = document.querySelector('[data-iw-panel="world-chat"] [data-iw-panel-part="composer"]');
    const chatInput = composer?.querySelector('[data-iw-panel-part="chat-input"]');
    const send = composer?.querySelector('[data-iw-panel-part="send"]');
    const composerRect = composer?.getBoundingClientRect();
    const inputRect = chatInput?.getBoundingClientRect();
    const sendRect = send?.getBoundingClientRect();
    const longName = [...document.querySelectorAll('.fs-inv-name')]
      .find(el => el.textContent.includes('Fortunate Dragonscale Silk Cloak of the Harvest'));
    const longStyle = longName ? getComputedStyle(longName) : null;
    const longLines = longName && longStyle ? longName.getBoundingClientRect().height / parseFloat(longStyle.lineHeight) : 0;
    const badge = document.querySelector('.iw-icon-badge--sprite');
    const badgeHost = badge?.parentElement || null;
    const badgeRect = badge?.getBoundingClientRect() || null;
    const hostRect = badgeHost?.getBoundingClientRect() || null;
    const badgeStyle = badge ? getComputedStyle(badge) : null;
    const hostStyle = badgeHost ? getComputedStyle(badgeHost) : null;
    return {
      inventoryOverflow: rows.some(el => el.scrollWidth > el.clientWidth + 1),
      badgeVisible: !!badgeRect && badgeRect.width >= 21 && badgeRect.height >= 21,
      badgeUsesGearAtlas: !!badgeStyle?.backgroundImage.includes('gear_icons_atlas.png'),
      badgeOverhangs: !!badgeRect && !!hostRect && badgeRect.right > hostRect.right + 2 && badgeRect.bottom > hostRect.bottom + 2,
      badgeHostOverflowVisible: hostStyle?.overflow === 'visible',
      setVisible: !![...document.querySelectorAll('[data-fs-action-kind="set"]')].find(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0),
      detailsVisible: !![...document.querySelectorAll('.fs-inv-details')].find(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0),
      requirementsVisible: !![...document.querySelectorAll('.fs-inv-requirements')].find(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0),
      longNameLines: longLines,
      skillCount: panels.length,
      skillOverflow: panels.some(el => el.scrollWidth > el.clientWidth + 1),
      skillOverflowDetails: panels
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => ({ type: el.className, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })),
      maxSkillHeight: Math.max(...panels.map(el => el.getBoundingClientRect().height)),
      ingredientGridColumns: ingredientGrids.map(el => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length),
      ingredientSourcesHidden: ingredientSources.length === ingredientGrids.length &&
        ingredientSources.every(el => getComputedStyle(el).display === 'none'),
      medallionsVisible: medallions.length === panels.length && medallions.every(el => {
        const minSize = viewportWidth <= 640 ? 38 : 44;
        const rect = el.getBoundingClientRect();
        return rect.width >= minSize && rect.height >= minSize;
      }),
      medallionsPainted: medallions.length === panels.length && medallions.every(el => {
        const bg = getComputedStyle(el).backgroundImage;
        return bg && bg !== 'none' && /skills_icons_atlas\.webp/.test(bg);
      }),
      identityLevelsVisible: identityLevels.length === panels.length && identityLevels.every(el => el.getBoundingClientRect().height > 0),
      actionButtonsSized: actionButtons.length === panels.length && actionButtons.every(el => {
        const rect = el.getBoundingClientRect();
        return rect.width >= (viewportWidth <= 640 ? 108 : 124) && rect.height >= 44;
      }),
      // The command button now carries the quest rail's action_frame sprite,
      // and a percentage background-size stretches that cell to exactly fill
      // its box — so the box has to hold the art's 264x75 (3.52) at EVERY
      // width, not just the desktop one. This is the check that would catch a
      // future elastic-width tweak silently squashing the frame on a phone.
      actionFrameRatios: actionButtons.map(el => {
        const rect = el.getBoundingClientRect();
        return +(rect.width / rect.height).toFixed(2);
      }),
      // Live IdleWorlds ships BOTH command shapes: panels with recipe
      // navigation wrap the nav pair and the action control in one cell, and
      // panels without it expose the bare action button as that cell. Count
      // against the panels that actually have nav, not against every panel.
      navPanelCount: navPanels.length,
      // Thin flanking pager: 26px minor axis is below the suite's 44px target
      // but clears WCAG 2.5.8 (24x24); the 44px height is still enforced.
      navButtonsAccessible: navPanels.length > 0 && navButtons.length === navPanels.length * 2 && navButtons.every(el => {
        const rect = el.getBoundingClientRect();
        return rect.width >= 24 && rect.height >= 44 && getComputedStyle(el).display !== 'none';
      }),
      // The pager is now a thin steel plate with a CSS-drawn chevron. Verify the
      // plate paints (its own border + a non-image background, NOT the old svg),
      // the chevron `::before` renders, and the native glyph stays suppressed.
      navButtonsPainted: navButtons.length === navPanels.length * 2 && navButtons.every(el => {
        const cs = getComputedStyle(el);
        const before = getComputedStyle(el, '::before');
        const noOldArt = !/skills_nav_(?:prev|next)\.svg/.test(cs.backgroundImage);
        const plate = parseFloat(cs.borderTopWidth) > 0 && /gradient/.test(cs.backgroundImage);
        const chevron = before.content !== 'none' &&
          (parseFloat(before.borderRightWidth) > 0 || parseFloat(before.borderBottomWidth) > 0);
        const glyphHidden = cs.color === 'rgba(0, 0, 0, 0)' && parseFloat(cs.fontSize) === 0;
        return noOldArt && plate && chevron && glyphHidden;
      }),
      // Header band: the utility rail and the first status row are two halves
      // of one line across the top of the plate, so their top edges and their
      // control heights must agree. They were 5px and 4px out respectively.
      header: (() => {
        const root = document.querySelector('[data-iw-header="root"]');
        if (!root) return null;
        const btn = root.querySelector('[data-iw-header="utility-button"]');
        const tiles = [...root.querySelectorAll('[data-iw-header="status-card"]')];
        const first = tiles[0];
        if (!btn || !first) return null;
        const b = btn.getBoundingClientRect();
        const t = first.getBoundingClientRect();
        const after = getComputedStyle(root, '::after');
        return {
          topDelta: +Math.abs(b.top - t.top).toFixed(1),
          heightDelta: +Math.abs(b.height - t.height).toFixed(1),
          cornersPainted: /panel_corners\.webp/.test(after.borderImageSource),
          clippedTiles: tiles.filter(el => el.scrollWidth > el.clientWidth + 1 ||
            el.scrollHeight > el.clientHeight + 1).map(el => el.textContent.trim().slice(0, 34)),
          overflow: root.scrollWidth > root.clientWidth + 1,
        };
      })(),
      navChevronDebug: navButtons.slice(0, 1).map(el => {
        const before = getComputedStyle(el, '::before');
        const cs = getComputedStyle(el);
        return {
          content: before.content, bt: before.borderTopWidth, br: before.borderRightWidth,
          display: before.display, btnBorder: cs.borderTopWidth, bg: cs.backgroundImage.slice(0, 40),
        };
      }),
      // A nav-less panel must still centre its action button in the command
      // cell — that is the case the old translateY hack silently skewed.
      bareActionCentred: panels.filter(el => !el.querySelector('[data-iw-skill-role="nav-group"]')).every(el => {
        const cell = el.querySelector('[data-iw-skill-zone="commands"]');
        const btn = el.querySelector('[data-iw-skill-role="action-button"]');
        if (!cell || !btn) return false;
        const c = cell.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        return Math.abs((c.top + c.height / 2) - (b.top + b.height / 2)) <= 2;
      }),
      // Sprites are stretched to exactly fill their box, so a box whose ratio
      // disagrees with the art distorts it. xp_plaque is 300x100 (3.00).
      plaqueRatios: basePlaques.map(el => {
        const r = el.getBoundingClientRect();
        return +(r.width / r.height).toFixed(2);
      }),
      navBackgrounds: [...new Set(navButtons.map(el => getComputedStyle(el).backgroundImage))],
      basePlaquesFit: basePlaques.length === panels.length && basePlaques.every(el => el.scrollWidth <= el.clientWidth + 1),
      sixDigitBaseFits: !!document.querySelector('.fs-skill-base-exp[data-iw-base-exp="123456"]') && document.querySelector('.fs-skill-base-exp[data-iw-base-exp="123456"]').scrollWidth <= document.querySelector('.fs-skill-base-exp[data-iw-base-exp="123456"]').clientWidth + 1,
      // Whichever branch React put the pager in, the two arrows must flank the
      // action button — prev fully to its left, next fully to its right, all
      // three vertically centred together and never overlapping the hit area.
      // (nav-group can be `display: contents` in the command cell, so measure
      // the individual arrow boxes, not the group.)
      navFlanksAction: navPanels.length > 0 && navPanels.every(el => {
        const prev = el.querySelector('[data-iw-nav-direction="prev"]')?.getBoundingClientRect();
        const next = el.querySelector('[data-iw-nav-direction="next"]')?.getBoundingClientRect();
        const action = el.querySelector('[data-iw-skill-role="action-button"]')?.getBoundingClientRect();
        if (!prev || !next || !action) return false;
        const mid = action.top + action.height / 2;
        const centred = [prev, next].every(r => Math.abs((r.top + r.height / 2) - mid) <= 3);
        if (centred && prev.right <= action.left + 1 && next.left >= action.right - 1) return true;
        // Fallback: as long as the arrows never overlap the action hit area the
        // rail is not "malformed". The flank test above is the intended shape at
        // every width now (Curtis, 2026-09) but keep this so a future rail tweak
        // fails loud only on a real overlap.
        return [prev, next].every(r => r.bottom <= action.top + 1 || r.top >= action.bottom - 1 ||
          r.right <= action.left + 1 || r.left >= action.right - 1);
      }),
      // The command band always occupies its OWN grid row — never shared with
      // the content zone. Above 384px it sits beside the identity rail
      // ("identity commands"); at or below it the band spans the card
      // ("commands commands") because the renderer's inline 155px action button
      // cannot fit beside any usable rail there. Either row shape is correct;
      // sharing a row with content is not.
      commandRailOwnRow: panels.every(el => /(?:identity|commands) commands/
        .test(getComputedStyle(el.querySelector('[data-iw-skill-layout-shell="1"]') || el).gridTemplateAreas)),
      // Curtis (2026-09): the icon + level info run to the base of the card.
      // Only meaningful where the rail is full-height, i.e. above 430px.
      identityReachesBase: panels.every(el => {
        const shell = el.querySelector('[data-iw-skill-layout-shell="1"]');
        const id = el.querySelector('[data-iw-skill-zone="identity"]');
        if (!shell || !id) return false;
        return Math.abs(shell.getBoundingClientRect().bottom - id.getBoundingClientRect().bottom) <= 1;
      }),
      commandsVisible: panels.every(el => {
        const cmd = el.querySelector('[data-iw-skill-zone="commands"]');
        return cmd && getComputedStyle(cmd).display !== 'none' && cmd.getBoundingClientRect().width > 0;
      }),
      activityCount: activityPanels.length,
      activityOverflow: activityPanels.some(el => el.scrollWidth > el.clientWidth + 1),
      activityViewportOverflow: !activityWrapperRect || activityWrapper.scrollWidth > activityWrapper.clientWidth + 1 ||
        activityWrapperRect.left < -1 || activityWrapperRect.right > viewportWidth + 1,
      activityFramesPainted: activityPanels.every(el => getComputedStyle(el).backgroundImage.includes('skills_panel_texture.webp')),
      activityMaxPaddingTop: Math.max(...activityPanels.map(el => parseFloat(getComputedStyle(el).paddingTop))),
      // Action Log's feed is deliberately transparent now (ui-system.css,
      // Curtis 2026-09: the frame's own per-zone ground shows through instead
      // of a second, duller copy of it painted on the feed box) — only World
      // Chat still wants its own solid #0B0C0A fill. This check used to
      // require BOTH to be solid; keep it a real check (not just "some
      // background exists") by asserting each feed's OWN expected treatment
      // rather than one rule for both.
      activityFeedsInset: activityFeeds.length === 2 && activityFeeds.every(el => {
        const bg = getComputedStyle(el).backgroundColor;
        const panel = el.closest('[data-iw-panel]')?.dataset.iwPanel;
        return panel === 'action-log' ? bg === 'rgba(0, 0, 0, 0)' : bg !== 'rgba(0, 0, 0, 0)';
      }),
      activityRowsCompact: activityRows.length === 6 && activityRows.every(el => el.getBoundingClientRect().height <= 96),
      activityProgressHeight: activityProgress?.getBoundingClientRect().height || 0,
      composerGrid: composer ? getComputedStyle(composer).display === 'grid' : false,
      composerContained: !!composerRect && !!inputRect && !!sendRect &&
        inputRect.left >= composerRect.left - 1 && inputRect.right <= composerRect.right + 1 &&
        sendRect.left >= composerRect.left - 1 && sendRect.right <= composerRect.right + 1,
      composerStacked: !!inputRect && !!sendRect && sendRect.top >= inputRect.bottom - 1,
    };
  }, width);
  if (audit.inventoryOverflow) throw new Error(`Inventory overflows at ${width}px`);
  if (!audit.badgeVisible || !audit.badgeUsesGearAtlas || !audit.badgeOverhangs || !audit.badgeHostOverflowVisible) {
    throw new Error(`enhancement badge is clipped or not atlas-backed at ${width}px: ${JSON.stringify(audit)}`);
  }
  if (width <= 768 && (!audit.setVisible || !audit.detailsVisible || !audit.requirementsVisible)) {
    throw new Error(`mobile Inventory loses actions/details at ${width}px`);
  }
  if (width <= 430 && (audit.longNameLines < 1.5 || audit.longNameLines > 2.2)) {
    throw new Error(`long Inventory name must wrap to two lines at ${width}px, got ${audit.longNameLines.toFixed(2)}`);
  }
  if (width > 430 && width <= 768 && (audit.longNameLines < 0.9 || audit.longNameLines > 2.2)) {
    throw new Error(`long Inventory name exceeded its two-line cap at ${width}px: ${audit.longNameLines.toFixed(2)}`);
  }
  if (!audit.skillCount || audit.skillOverflow) throw new Error(`skill panels overflow at ${width}px: ${JSON.stringify(audit.skillOverflowDetails)}`);
  const expectedIngredientColumns = width <= 430 ? 1 : 2;
  if (!audit.ingredientGridColumns.length || audit.ingredientGridColumns.some(count => count !== expectedIngredientColumns)) {
    throw new Error(`skill material grids use the wrong column count at ${width}px: expected ${expectedIngredientColumns}, got ${audit.ingredientGridColumns.join(',')}`);
  }
  if (!audit.ingredientSourcesHidden) {
    throw new Error(`native skill material rows remain visible beside their generated lists at ${width}px`);
  }
  if (!audit.medallionsVisible || !audit.medallionsPainted || !audit.identityLevelsVisible) {
    throw new Error(`skill identity card is incomplete at ${width}px: ${JSON.stringify(audit)}`);
  }
  if (!audit.actionButtonsSized || !audit.navFlanksAction) {
    throw new Error(`skill command rail is malformed at ${width}px: ${JSON.stringify(audit)}`);
  }
  if (audit.actionFrameRatios.some(r => Math.abs(r - 3.52) > 0.12)) {
    throw new Error(`skill command button distorts its 3.52 action_frame art at ${width}px: ` +
      audit.actionFrameRatios.join(','));
  }
  if (!audit.bareActionCentred) {
    throw new Error(`nav-less skill panels do not centre their action button at ${width}px`);
  }
  // The Base readout no longer carries the xp_plaque sprite (dropped for
  // being too ornate — Curtis, 2026-09), so there is no fixed artwork ratio
  // to hold any more. It is now an auto-sized text chip; `basePlaquesFit`
  // below still guards that the value is never clipped.
  if (!audit.navButtonsAccessible) throw new Error(`skill tab arrows lose their touch targets at ${width}px`);
  if (!audit.navButtonsPainted) {
    throw new Error(`recipe pager lost its plate or chevron, or regained the native glyph at ${width}px: ${JSON.stringify(audit.navChevronDebug)}`);
  }
  if (audit.header) {
    const h = audit.header;
    if (!h.cornersPainted) throw new Error(`header corner ornaments are missing at ${width}px`);
    if (h.clippedTiles.length) throw new Error(`header status tiles truncate their values at ${width}px: ${JSON.stringify(h.clippedTiles)}`);
    if (h.overflow) throw new Error(`header overflows its plate at ${width}px`);
  }
  if (!audit.basePlaquesFit || !audit.sixDigitBaseFits) {
    throw new Error(`Base: plaque cannot contain six digits at ${width}px: ${JSON.stringify(audit)}`);
  }
  // Per Curtis (2026-09) the command rail is ALWAYS its own full-width row
  // beneath identity + content, at every width — see the "Command rail" block
  // at the end of skillpanel.css. Every card therefore carries one extra
  // ~56px control row that the old desktop three-column layout did not, so
  // the desktop ceiling is raised to suit. The 44px touch target inside that
  // row is NOT shrunk to buy space back — it is the floor this suite enforces.
  // A six-resource recipe deliberately becomes six stacked cells at phone
  // widths. That trades card height for readable, individually separated
  // requirements; wider cards recover the space through the two-column grid.
  const maxSkillHeight = width <= 430 ? 460 : width <= 640 ? 340 : 290;
  if (audit.maxSkillHeight > maxSkillHeight) {
    throw new Error(`skill cards are too tall at ${width}px: ${audit.maxSkillHeight}px (max ${maxSkillHeight}px)`);
  }
  if (!audit.commandRailOwnRow) throw new Error(`skill command band does not own its grid row at ${width}px`);
  if (width > 384 && !audit.identityReachesBase) {
    throw new Error(`skill identity rail does not reach the card base at ${width}px`);
  }
  if (!audit.commandsVisible) throw new Error(`skill commands hidden at ${width}px`);
  if (audit.activityCount !== 3 || audit.activityOverflow || audit.activityViewportOverflow || !audit.activityFramesPainted) {
    throw new Error(`activity frames are incomplete or overflow at ${width}px: ${JSON.stringify(audit)}`);
  }
  const maxActivityPadding = width <= 640 ? 16 : 18;
  if (audit.activityMaxPaddingTop > maxActivityPadding) {
    throw new Error(`activity frame padding is not compact at ${width}px: ${audit.activityMaxPaddingTop}px`);
  }
  if (!audit.activityFeedsInset || !audit.activityRowsCompact) {
    throw new Error(`activity feeds lost their compact inset treatment at ${width}px: ${JSON.stringify(audit)}`);
  }
  // Current Action intentionally shares Zone Control's detailed 18px meter:
  // enough height for the framed edge, segment marks and traveling current.
  // Keep a narrow tolerance so responsive overrides cannot collapse it back
  // into the former plain rail or inflate it into a dominant UI element.
  if (audit.activityProgressHeight < 16 || audit.activityProgressHeight > 18) {
    throw new Error(`current action progress lost its detailed meter geometry at ${width}px: ${audit.activityProgressHeight}px`);
  }
  if (!audit.composerGrid || !audit.composerContained || (width <= 430 ? !audit.composerStacked : audit.composerStacked)) {
    throw new Error(`world chat composer is malformed at ${width}px: ${JSON.stringify(audit)}`);
  }
};
for (const width of RESPONSIVE_WIDTHS) await auditResponsive(width);
await p.setViewportSize({ width: 390, height: 844 });
await p.screenshot({ path: resolve(OUT, 'mobile-responsive.png'), fullPage: true });
await p.locator('.fx-skill-grid').screenshot({ path: resolve(OUT, 'skills-mobile.png') });
await p.locator('[data-iw-village="addons"]').screenshot({ path: resolve(OUT, 'village-mobile.png') });

/* On a phone the slot card's controls take their own full-width row, so the
   copy column is the card's full inner width rather than the ~110px a fixed
   control stack leaves it. Measure it: at 390px the effect list broke one word
   per line before that rule, and nothing in a computed style says so. */
const villageMobile = await p.evaluate(() => {
  const card = document.querySelector('[data-iw-village="slot"][data-iw-village-state="installed"]');
  const copy = card?.querySelector('[data-iw-village-role="copy"]');
  const actions = card?.querySelector('[data-iw-village-role="actions"]');
  if (!card || !copy || !actions) return null;
  const c = card.getBoundingClientRect();
  return {
    copy: Math.round(copy.getBoundingClientRect().width),
    card: Math.round(c.width),
    actionsBelowCopy: actions.getBoundingClientRect().top >= copy.getBoundingClientRect().bottom - 1,
    actionsFullWidth: actions.getBoundingClientRect().width >= c.width - 26,
  };
});
if (!villageMobile) throw new Error('village slot card missing from the mobile pass');
if (!villageMobile.actionsBelowCopy || !villageMobile.actionsFullWidth) {
  throw new Error(`village controls did not take their own row at 390px: ${JSON.stringify(villageMobile)}`);
}
if (villageMobile.copy < villageMobile.card * 0.6) {
  throw new Error(`village copy column is squeezed at 390px: ${JSON.stringify(villageMobile)}`);
}
console.log(`village slot copy keeps ${villageMobile.copy}px of a ${villageMobile.card}px card at 390px  ok`);
await p.locator('.fx-activity-panels').screenshot({ path: resolve(OUT, 'activity-panels-mobile.png') });

await p.setViewportSize({ width: 1400, height: 1000 });

/* ── Automated checks ───────────────────────────────────────────────────── */

const report = await p.evaluate(() => {
  const out = { unresolvedVars: [], fonts: {}, iconsPainted: 0, iconsBlank: 0, contrast: [] };

  // Any var() that resolves to empty means a token referenced but never defined.
  const cs = getComputedStyle(document.documentElement);
  const names = ['--iw-font-head', '--iw-font-ui', '--iw-font-flav', '--iw-ink-900', '--iw-line',
    '--iw-gold', '--iw-ember', '--iw-text', '--iw-dim', '--iw-faint', '--iw-good',
    '--iw-t-common', '--iw-t-mythic', '--iw-r-panel', '--iw-r-control'];
  for (const n of names) if (!cs.getPropertyValue(n).trim()) out.unresolvedVars.push(n);

  for (const f of document.fonts) {
    out.fonts[`${f.family} ${f.weight} ${f.style}`] = f.status;
  }

  // NOT sufficient on its own: an earlier run reported 11/11 "painted" while
  // every icon slot rendered black, because a double quote inside the inline
  // style attribute had truncated it. A property being set proves nothing about
  // pixels. The real check samples the rendered image below.
  out.iconSlots = [];
  for (const el of document.querySelectorAll('.fs-inv-icon, .iw-tip-icon-host')) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') out.iconsPainted += 1; else out.iconsBlank += 1;
    const r = el.getBoundingClientRect();
    out.iconSlots.push({
      label: el.closest('.fs-inv-row, .iw-tip')?.querySelector('.fs-inv-name, .iw-tip-name')?.textContent?.trim()?.slice(0, 28) || '?',
      x: Math.round(r.x + window.scrollX), y: Math.round(r.y + window.scrollY),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }

  const lum = c => {
    const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const bg = 'rgb(18, 17, 14)';
  const samples = [
    ['body text', '.fx-type div'],
    ['item name', '.fs-inv-name .iw-item-ref'],
    ['stat chip', '.fs-stat--pos'],
    ['detail line', '.fs-inv-detail--socket'],
    ['requirement', '.fs-inv-requirement'],
    ['qty', '.fs-inv-qty'],
    ['skill title', '[data-iw-skill-role="action-title"]'],
    ['xp readout', '[data-iw-skill-role="level-progress"]'],
    ['tooltip label', '.iw-tip-stat .k'],
    ['tooltip section', '.iw-tip-sec-title'],
    ['nav tab', '[data-iw-ui="nav-tab"]'],
    ['page count', '[data-iw-inventory-control="page-count"]'],
  ];
  for (const [label, sel] of samples) {
    const el = document.querySelector(sel);
    if (!el) { out.contrast.push({ label, ratio: null, note: 'selector not found' }); continue; }
    out.contrast.push({ label, ratio: Number(ratio(getComputedStyle(el).color, bg).toFixed(2)) });
  }
  return out;
});

/* ── Pixel proof: each icon slot must contain actual sprite art ─────────── */

const pixelResults = [];
for (const slot of report.iconSlots) {
  const shot = await p.screenshot({ fullPage: true, clip: { x: slot.x, y: slot.y, width: slot.w, height: slot.h } });
  // Count distinct quantised colours. A blank slot is one flat fill (plus its
  // border); real sprite art is many-coloured.
  const png = shot;
  pixelResults.push({ label: slot.label, bytes: png.length });
  await writeFile(resolve(OUT, `icon-${pixelResults.length}.png`), png);
}

/* ── Per-zone accent themes ────────────────────────────────────────────────
   base.css defines --iw-th-* per :root[data-iw-zone-theme]; HeaderRenderer
   sets that attribute on <html> live. Cycle the nine palettes on this same
   fixture page, prove each one actually re-points the tokens (not a silent
   fall-through to the default), that accent-coloured text stays ≥3:1 on the
   themed panel ground, and capture a montage. */
const themeReport = await p.evaluate((themes) => {
  const html = document.documentElement;
  const probe = document.createElement('span');
  probe.style.color = 'var(--iw-gold)';
  probe.textContent = 'accent';
  (document.querySelector('[data-iw-ui="section-frame"]') || document.body).appendChild(probe);

  /* The inner frame scale is derived with color-mix(), and an UNREGISTERED
     custom property's computed value is the un-evaluated token stream — so
     reading --iw-th-edge-mid off <html> would report the color-mix() source
     text and "pass" even if the expression were malformed and painted nothing.
     Paint it instead: a border-*-color always resolves to rgb(), so this reads
     the colour the user actually sees. One probe carries all four. */
  const frameProbe = document.createElement('span');
  frameProbe.style.borderStyle = 'solid';
  frameProbe.style.borderWidth = '1px';
  frameProbe.style.borderTopColor = 'var(--iw-th-edge-mid)';
  frameProbe.style.borderRightColor = 'var(--iw-th-edge-soft)';
  frameProbe.style.borderBottomColor = 'var(--iw-th-edge-faint)';
  frameProbe.style.borderLeftColor = 'var(--iw-line)';
  document.body.appendChild(frameProbe);
  const frames = () => {
    const cs = getComputedStyle(frameProbe);
    return [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].join(' ');
  };

  const lum = c => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  // All nine --iw-th-ground-a values sit in a tight #12–17 band; a fixed dark
  // reference is enough for a ≥3:1 floor on accent text. getComputedStyle turns
  // the token into rgb() for us via the probe's own resolved color.
  const GROUND = 'rgb(20, 19, 16)';
  const rows = [];
  const seen = new Set();
  const seenFrames = new Set();
  for (const t of ['', ...themes]) {
    if (t) html.setAttribute('data-iw-zone-theme', t); else html.removeAttribute('data-iw-zone-theme');
    const cs = getComputedStyle(html);
    const accent = cs.getPropertyValue('--iw-th-accent').trim();
    const accentRGB = getComputedStyle(probe).color;
    const frameSet = frames();
    rows.push({
      theme: t || 'default',
      accent,
      edge: cs.getPropertyValue('--iw-th-edge').trim(),
      cta: cs.getPropertyValue('--iw-th-cta').trim(),
      distinct: !seen.has(accent),
      accentOnGround: Number(ratio(accentRGB, GROUND).toFixed(2)),
      // The inner frames must move with the palette. A theme that reports the
      // same painted quartet as another has fallen through to the stock
      // brass-brown -- the exact failure the derived block exists to prevent.
      frameMid: getComputedStyle(frameProbe).borderTopColor,
      framesDistinct: !seenFrames.has(frameSet),
    });
    seen.add(accent);
    seenFrames.add(frameSet);
  }
  html.removeAttribute('data-iw-zone-theme');
  probe.remove();
  frameProbe.remove();
  return rows;
}, THEME_NAMES);

// Montage: one card screenshot per theme, stitched.
const themeShots = [];
for (const t of ['', ...THEME_NAMES]) {
  await p.evaluate(name => {
    if (name) document.documentElement.setAttribute('data-iw-zone-theme', name);
    else document.documentElement.removeAttribute('data-iw-zone-theme');
  }, t);
  const card = p.locator('[data-iw-ui="section-frame"]').first();
  themeShots.push({ t: t || 'default', png: await card.screenshot() });
}
await p.evaluate(() => document.documentElement.removeAttribute('data-iw-zone-theme'));
{
  const cells = themeShots.map(s =>
    `<figure style="margin:0"><figcaption style="font:11px/1.6 monospace;color:#aaa;padding:2px 4px">${s.t}</figcaption>` +
    `<img src="data:image/png;base64,${s.png.toString('base64')}" style="display:block;width:100%"></figure>`).join('');
  const mp = await browser.newPage();
  await mp.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(2,1fr);gap:3px">${cells}</body>`);
  await mp.screenshot({ path: resolve(OUT, 'themes.png'), fullPage: true });
  await mp.close();
}

await browser.close();

const themeFail = themeReport.filter(r => r.theme !== 'default'
  && (!r.distinct || !r.framesDistinct || r.accentOnGround < 3));

console.log('\n── Fixture report ──────────────────────────────────');
console.log('per-zone accent themes (accent · edge · cta · contrast · painted inner frame):');
for (const r of themeReport) {
  const flag = r.theme === 'default' ? ' '
    : !r.distinct ? '✗ not re-pointed'
    : !r.framesDistinct ? '✗ frames not themed'
    : r.accentOnGround < 3 ? '✗ low contrast' : '✓';
  console.log(`  ${flag.padEnd(20)} ${r.theme.padEnd(16)} ${r.accent}  ${r.edge}  ${r.cta}  ${String(r.accentOnGround).padEnd(5)} ${r.frameMid}`);
}
console.log('unresolved custom properties:', report.unresolvedVars.length ? report.unresolvedVars : 'none');
console.log('icon slots with a background-image:', report.iconsPainted, '| without:', report.iconsBlank);
console.log('fonts:');
for (const [k, v] of Object.entries(report.fonts)) console.log(`  ${v === 'loaded' ? '✓' : '✗'} ${k} — ${v}`);
console.log('contrast vs #12110E (WCAG AA body = 4.5, large/secondary = 3.0):');
for (const c of report.contrast) {
  const flag = c.ratio === null ? '?' : c.ratio >= 4.5 ? '✓' : c.ratio >= 3 ? '~' : '✗';
  console.log(`  ${flag} ${c.label.padEnd(16)} ${c.ratio ?? c.note}`);
}
if (consoleIssues.length) {
  console.log('page issues:');
  for (const i of consoleIssues) console.log('  !', i);
} else {
  console.log('page issues: none');
}
console.log(`\nWrote ${resolve(OUT, 'full.png')}, ${resolve(OUT, 'skills-panel.png')}, ${resolve(OUT, 'themes.png')} and ${pixelResults.length} icon crops`);
if (consoleIssues.length) throw new Error(`fixture page reported ${consoleIssues.length} resource or console issue(s)`);
if (themeFail.length) {
  throw new Error('per-zone theme(s) failed: ' +
    themeFail.map(r => `${r.theme} (${!r.distinct ? 'not re-pointed' : `accent ${r.accentOnGround}:1`})`).join(', '));
}
