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
const navInline = dir => [
  'width:44px', 'min-width:44px', 'height:44px', 'min-height:44px', 'padding:0',
  'background:none', `background-image:var(--fs-skills-nav-${dir})`,
  'background-size:68% 68%', 'background-position:center', 'background-repeat:no-repeat',
  'border:0', 'box-shadow:none', 'color:transparent', 'font-size:0',
].map(d => `${d} !important`).join(';');

const ACTION_INLINE = [
  "font-family:'Barlow',system-ui,sans-serif", 'font-weight:700',
  'letter-spacing:0.06em', 'text-transform:uppercase', 'border-radius:2px',
  'align-self:center', 'flex-shrink:0', 'cursor:pointer', 'box-shadow:none',
  'background:linear-gradient(180deg,color-mix(in srgb,var(--fs-skill-accent) 74%,#593018),color-mix(in srgb,var(--fs-skill-accent) 48%,#25170F))',
  'border:1px solid color-mix(in srgb,var(--fs-skill-accent) 72%,#8A6633)',
  'color:#FFEAD1', 'font-size:12px',
  'width:155px', 'min-width:155px', 'height:44px', 'min-height:44px', 'padding:0 12px',
].map(d => `${d} !important`).join(';');

const navMarkup = '<div data-iw-skill-role="nav-group">' +
  `<button data-iw-skill-role="nav-button" data-iw-nav-direction="prev" style="${navInline('prev')}"><span>‹</span></button>` +
  `<button data-iw-skill-role="nav-button" data-iw-nav-direction="next" style="${navInline('next')}"><span>›</span></button></div>`;

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
      ${ingredients ? `<div data-iw-skill-role="ingredient"><span class="iw-item-ref">${ingredients}</span> 12/20</div>` : ''}
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
const questCard = ({ accent, glyph, state = 'active', kicker, title, brief, objective, objIcon, objItem, reward, pct, turnInDisabled = true, skip }) => `
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
        <button data-iw-quest-role="turn-in"${turnInDisabled ? ' disabled' : ''}>Turn In</button>
        ${skip ? `<button data-iw-quest-role="skip">Skip (${skip})</button>` : ''}
      </div>
    </div>
    <div class="h-1.5 overflow-hidden rounded-full bg-white/10" data-iw-quest-role="progress-track"><div class="h-full rounded-full bg-emerald-400" style="width:${pct}%" data-iw-quest-role="progress-fill"></div></div>
    <div class="text-[11px] text-white/45" data-iw-quest-role="progress-label" data-iw-quest-percent="${pct}">${pct}% complete</div>
  </div>
</div>`;

const tooltipCard = ({ sprite, name, tier, badges, effect, stats, acqMain, acqSub, glyph = '&#x1F6E1;&#xFE0F;', source = 'cached data' }) => `
<div class="iw-tip is-open" style="position:relative;display:flex;opacity:1;left:0;top:0;margin-bottom:14px;">
  <div class="iw-tip-head has-art has-gear-art">
    <div class="iw-tip-icon" aria-hidden="true">${glyph}</div>
    <div class="iw-tip-title-block">
      <div class="iw-tip-name tier-${tier}">${name}</div>
      <div class="iw-tip-badges">${badges.map((b, i) => `<span class="iw-tip-badge${i === 0 ? ' t' : ''}${b.startsWith('Requires') ? ' req' : ''}">${b}</span>`).join('')}</div>
    </div>
    <div class="iw-tip-art iw-tip-gear-art" aria-hidden="true"><span class="iw-tip-art-host iw-tip-art-painted" style="${sprite}"></span></div>
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
        <h1 class="header-player-name" data-iw-header="profile-name">BustedCypher</h1>
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
${skillPanel({ type: 'jewelcrafting', label: 'Jewel', title: 'Craft Moonstone Ring', pct: 16.6, xp: '1253', ingredients: 'Moonstone / Sapphire / Topaz', requirement: 'Requires Jewelcrafting Lv 53', detail: 'Missing materials — will queue (gather first)' })}
${skillPanel({ type: 'spellcrafting', label: 'Spellcraft', title: 'Harvest Moonsteel Mana', pct: 94.6, xp: '124', requirement: 'Requires Spellcraft Lv 53', detail: 'Gather Moonsteel Mana from the ether' })}
${skillPanel({ type: 'tailoring', label: 'Tailor', title: 'Upgrade Moonsilk Silkbind Thread', pct: 21, xp: '5638', ingredients: 'Moonsilk Silkbind Thread / Moonsteel Upgrade Orb', requirement: 'Requires Tailoring Lv 53 and Gathering Lv 49', navIn: 'content' })}
${skillPanel({ type: 'crafting', label: 'Crafting', title: 'Craft Upgrade Orb', pct: 33, xp: '190' })}
${skillPanel({ type: 'fishing', label: 'Fishing', title: 'Fish Abyssal Eel', pct: 67, xp: '220' })}
${skillPanel({ type: 'woodcutting', label: 'Wood', title: 'Chop Runic Oak', pct: 0.5, xp: '35', requirement: 'Needs level 29', nav: false })}
${skillPanel({ type: 'construction', label: 'Build', title: 'Craft Runite Building Parts', pct: 52, xp: '461', ingredients: 'Runic Oak 473/16 / Runite Ore 19318/8', requirement: 'Needs Construction Lv 29 + Woodcutting Lv 25' })}
</div></div>

<div class="fx-h">Quest cards — forged into the skill-frame family</div>
<div class="fx-grid fx-quest-grid fs-skills-section-frame" data-iw-skills-ui-ready="1" style="${SKILL_UI_STYLE}">
<div>
${questCard({ accent: '#B84A20', glyph: '⚔', state: 'active', title: 'Night Claw Bounty', brief: 'Bring back 100 Night Claws from Moonsteel Basin.', objective: '💠 Night Claw 22/100', objIcon: itemSprite('night_claw'), objItem: 'Night Claw', reward: '+3,225g • +1350 combat XP', pct: 22, turnInDisabled: true })}
${questCard({ accent: '#C9A66A', glyph: '❖', state: 'ready', title: 'Cache of the Basin', brief: 'Recover the lost supply cache.', objective: 'Supply Cache 1/1', reward: '+5,000g', pct: 100, turnInDisabled: false })}
</div><div>
${questCard({ accent: '#A56E86', glyph: '⋈', state: 'ready', kicker: 'Tailoring Work Order', title: 'Craft and turn in 1 Moonsilk Boots.', objective: '🧵 Moonsilk Boots 0/1', objIcon: gearSprite('Moonsilk Boots'), objItem: 'Moonsilk Boots', reward: '+3,870g • +3240 tailoring XP', pct: 0, turnInDisabled: false, skip: 8 })}
${questCard({ accent: '#4E9FB8', glyph: '◆', state: 'active', kicker: 'Jewelcrafting Work Order', title: 'Cut and turn in 3 Star Sapphires.', objective: '💠 Star Sapphire 1/3', reward: '+2,410g • +1980 jewelcrafting XP', pct: 33, turnInDisabled: true, skip: 5 })}
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
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1000 }, deviceScaleFactor: 2 });
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
await p.locator('[data-iw-header="root"]').screenshot({ path: resolve(OUT, 'header.png') });

// The header band is a DESKTOP composition; RESPONSIVE_WIDTHS below tops out at
// 768, so auditing it there would never exercise the two-column layout this
// checks. Audit it here, at the 1240 viewport the screenshot is taken in.
const headerAudit = await p.evaluate(() => {
  const root = document.querySelector('[data-iw-header="root"]');
  const btns = [...root.querySelectorAll('[data-iw-header="utility-button"]')];
  const tiles = [...root.querySelectorAll('[data-iw-header="status-card"]')];
  const b = btns[0].getBoundingClientRect();
  const t0 = tiles[0];
  const t = t0.getBoundingClientRect();
  const after = getComputedStyle(root, '::after');
  return {
    utilityCount: btns.length,
    tileCount: tiles.length,
    topDelta: +Math.abs(b.top - t.top).toFixed(1),
    // Compare against the DECLARED control height, not the rendered box: a
    // headless emoji fallback inflates some tiles' line boxes here, while the
    // live capture shows every tile sitting at its 42px min-height.
    heightDelta: +Math.abs(b.height - parseFloat(getComputedStyle(t0).minHeight)).toFixed(1),
    // Every tile must share one surface family: tile 1 is a <div> and the rest
    // are <button>, and the generic control rule used to repaint only the
    // buttons, so tile 1 alone kept the bracket plate.
    distinctTileBorders: [...new Set(tiles.map(el => getComputedStyle(el).borderTopColor))],
    distinctTileBg: [...new Set(tiles.map(el => getComputedStyle(el).backgroundImage.slice(0, 60)))].length,
    // topDelta below is an OUTCOME check and cannot fail in this fixture: a
    // headless emoji fallback inflates the tiles until the grid happens to fill
    // the identity row, so centring costs ~0px here while it cost 9px live
    // (grid 142 in a 160 row). Assert the contract that produced the fix too,
    // which does fail when reverted.
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
if (headerAudit.topDelta > 1) {
  throw new Error(`header utility rail is ${headerAudit.topDelta}px out of line with the status band`);
}
if (headerAudit.heightDelta > 1) {
  throw new Error(`header utility buttons and status tiles differ in height by ${headerAudit.heightDelta}px`);
}
if (!/^(start|flex-start)$/.test(headerAudit.gridAlignContent)) {
  throw new Error(`header status grid must be top-aligned to sit level with the utility rail, got align-content: ${headerAudit.gridAlignContent}`);
}
if (!headerAudit.cornersPainted) throw new Error('header must use the shared panel_corners.webp filigree, like every other frame');
if (!headerAudit.ornamentBehindContent) throw new Error('header frame ornament sits above the status tiles');
if (headerAudit.distinctTileBorders.length !== 1) {
  throw new Error(`header status tiles do not share one surface: borders ${JSON.stringify(headerAudit.distinctTileBorders)}`);
}
if (headerAudit.clipped.length) {
  throw new Error(`header status tiles truncate their values: ${JSON.stringify(headerAudit.clipped)}`);
}
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

const RESPONSIVE_WIDTHS = [320, 360, 390, 430, 600, 768];
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
      medallionsVisible: medallions.length === panels.length && medallions.every(el => {
        const minSize = viewportWidth <= 600 ? 38 : 50;
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
        return rect.width >= (viewportWidth <= 600 ? 108 : 124) && rect.height >= 44;
      }),
      // Live IdleWorlds ships BOTH command shapes: panels with recipe
      // navigation wrap the nav pair and the action control in one cell, and
      // panels without it expose the bare action button as that cell. Count
      // against the panels that actually have nav, not against every panel.
      navPanelCount: navPanels.length,
      navButtonsAccessible: navPanels.length > 0 && navButtons.length === navPanels.length * 2 && navButtons.every(el => {
        const rect = el.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44 && getComputedStyle(el).display !== 'none';
      }),
      // The pager IS the framed arrow artwork. Verify it renders, that the
      // control adds no outline of its own around that frame, and that nothing
      // (pseudo-element or native glyph) is drawn over the top of it.
      navButtonsPainted: navButtons.length === navPanels.length * 2 && navButtons.every(el => {
        const cs = getComputedStyle(el);
        const before = getComputedStyle(el, '::before');
        const after = getComputedStyle(el, '::after');
        const artwork = /skills_nav_(?:prev|next)\.svg/.test(cs.backgroundImage);
        const ownOutline = parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== 'none';
        const overlaid = before.content !== 'none' || after.content !== 'none' ||
          cs.color !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.fontSize) > 0;
        return artwork && !ownOutline && !overlaid;
      }),
      navArtInset: navButtons.every(el => getComputedStyle(el).backgroundSize === '68% 68%'),
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
      basePlaquesFit: basePlaques.length === panels.length && basePlaques.every(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().width >= (viewportWidth <= 600 ? 144 : 168)),
      sixDigitBaseFits: !!document.querySelector('.fs-skill-base-exp[data-iw-base-exp="123456"]') && document.querySelector('.fs-skill-base-exp[data-iw-base-exp="123456"]').scrollWidth <= document.querySelector('.fs-skill-base-exp[data-iw-base-exp="123456"]').clientWidth + 1,
      // Desktop: whichever branch React put the pager in, it must end up
      // centred directly above the action button and clear of its hit area.
      navAboveAction: navPanels.length > 0 && navPanels.every(el => {
        const nav = el.querySelector('[data-iw-skill-role="nav-group"]')?.getBoundingClientRect();
        const action = el.querySelector('[data-iw-skill-role="action-button"]')?.getBoundingClientRect();
        return nav && action && nav.bottom <= action.top + 1 &&
          Math.abs((nav.left + nav.width / 2) - (action.left + action.width / 2)) <= 2;
      }),
      // Mobile: the rail is a row and the content-branch pager stays in flow,
      // so the only hard requirement is that it never overlaps the action.
      navBesideAction: navPanels.length > 0 && navPanels.every(el => {
        const nav = el.querySelector('[data-iw-skill-role="nav-group"]')?.getBoundingClientRect();
        const action = el.querySelector('[data-iw-skill-role="action-button"]')?.getBoundingClientRect();
        if (!nav || !action) return false;
        return nav.bottom <= action.top + 1 || nav.top >= action.bottom - 1 ||
          nav.right <= action.left + 1 || nav.left >= action.right - 1;
      }),
      mobileControlRail: panels.every(el => getComputedStyle(el.querySelector('[data-iw-skill-layout-shell="1"]') || el).gridTemplateAreas.includes('commands commands')),
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
      activityFeedsInset: activityFeeds.length === 2 && activityFeeds.every(el => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'),
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
  if (width <= 700 && (!audit.setVisible || !audit.detailsVisible || !audit.requirementsVisible)) {
    throw new Error(`mobile Inventory loses actions/details at ${width}px`);
  }
  if (width <= 430 && (audit.longNameLines < 1.5 || audit.longNameLines > 2.2)) {
    throw new Error(`long Inventory name must wrap to two lines at ${width}px, got ${audit.longNameLines.toFixed(2)}`);
  }
  if (width > 430 && width <= 700 && (audit.longNameLines < 0.9 || audit.longNameLines > 2.2)) {
    throw new Error(`long Inventory name exceeded its two-line cap at ${width}px: ${audit.longNameLines.toFixed(2)}`);
  }
  if (!audit.skillCount || audit.skillOverflow) throw new Error(`skill panels overflow at ${width}px: ${JSON.stringify(audit.skillOverflowDetails)}`);
  if (!audit.medallionsVisible || !audit.medallionsPainted || !audit.identityLevelsVisible) {
    throw new Error(`skill identity card is incomplete at ${width}px: ${JSON.stringify(audit)}`);
  }
  if (!audit.actionButtonsSized || (width <= 600 ? !audit.navBesideAction : !audit.navAboveAction)) {
    throw new Error(`skill command rail is malformed at ${width}px: ${JSON.stringify(audit)}`);
  }
  if (!audit.bareActionCentred) {
    throw new Error(`nav-less skill panels do not centre their action button at ${width}px`);
  }
  // xp_plaque art is 300x100. A box far off 3.00 stretches the sprite and
  // crowds the label against the frame, which is what "Base: N" looked like.
  const badRatio = audit.plaqueRatios.filter(r => r < 2.7 || r > 3.35);
  if (badRatio.length) {
    throw new Error(`Base: plaque distorts its 3:1 artwork at ${width}px: ratios ${JSON.stringify(audit.plaqueRatios)}`);
  }
  if (!audit.navButtonsAccessible) throw new Error(`skill tab arrows lose their touch targets at ${width}px`);
  if (!audit.navButtonsPainted) {
    throw new Error(`recipe pager lost its artwork, or regained an outline/overlaid glyph at ${width}px: ${JSON.stringify(audit.navChevronDebug)}`);
  }
  if (!audit.navArtInset) throw new Error(`recipe pager artwork is not inset in its touch target at ${width}px`);
  if (audit.header) {
    const h = audit.header;
    if (!h.cornersPainted) throw new Error(`header corner ornaments are missing at ${width}px`);
    if (h.clippedTiles.length) throw new Error(`header status tiles truncate their values at ${width}px: ${JSON.stringify(h.clippedTiles)}`);
    if (h.overflow) throw new Error(`header overflows its plate at ${width}px`);
  }
  if (!audit.basePlaquesFit || !audit.sixDigitBaseFits) {
    throw new Error(`Base: plaque cannot contain six digits at ${width}px: ${JSON.stringify(audit)}`);
  }
  // Re-baselined with the alignment pass. The Base plaque now matches its 3:1
  // artwork (it was squashed to 40px, which is what made the label unreadable),
  // so the card is legitimately taller than the old 140/220 pins allowed. That
  // growth was paid for in the same pass: the hidden xp-gain/reward/progress
  // rows used to reserve ~35px of invisible space per card because an atlas
  // `min-height` beat their `height: 1px`. Observed maxima are 187 desktop and
  // 250 at 320px; these ceilings keep modest headroom over that.
  // Below 601px the rail becomes a full-width row and the content-branch pager
  // stays in flow, so those panels carry one extra 44px control row. The hit
  // area is deliberately NOT shrunk to buy the space back — 44px is the touch
  // target floor this suite already enforces.
  const maxSkillHeight = width <= 600 ? 310 : 200;
  if (audit.maxSkillHeight > maxSkillHeight) {
    throw new Error(`skill cards are too tall at ${width}px: ${audit.maxSkillHeight}px (max ${maxSkillHeight}px)`);
  }
  if (audit.mobileControlRail !== (width <= 600)) throw new Error(`skill breakpoint mismatch at ${width}px`);
  if (!audit.commandsVisible) throw new Error(`skill commands hidden at ${width}px`);
  if (audit.activityCount !== 3 || audit.activityOverflow || audit.activityViewportOverflow || !audit.activityFramesPainted) {
    throw new Error(`activity frames are incomplete or overflow at ${width}px: ${JSON.stringify(audit)}`);
  }
  const maxActivityPadding = width <= 600 ? 16 : 18;
  if (audit.activityMaxPaddingTop > maxActivityPadding) {
    throw new Error(`activity frame padding is not compact at ${width}px: ${audit.activityMaxPaddingTop}px`);
  }
  if (!audit.activityFeedsInset || !audit.activityRowsCompact) {
    throw new Error(`activity feeds lost their compact inset treatment at ${width}px: ${JSON.stringify(audit)}`);
  }
  if (audit.activityProgressHeight < 8 || audit.activityProgressHeight > 14) {
    throw new Error(`current action progress is not compact at ${width}px: ${audit.activityProgressHeight}px`);
  }
  if (!audit.composerGrid || !audit.composerContained || (width <= 430 ? !audit.composerStacked : audit.composerStacked)) {
    throw new Error(`world chat composer is malformed at ${width}px: ${JSON.stringify(audit)}`);
  }
};
for (const width of RESPONSIVE_WIDTHS) await auditResponsive(width);
await p.setViewportSize({ width: 390, height: 844 });
await p.screenshot({ path: resolve(OUT, 'mobile-responsive.png'), fullPage: true });
await p.locator('.fx-skill-grid').screenshot({ path: resolve(OUT, 'skills-mobile.png') });
await p.locator('.fx-activity-panels').screenshot({ path: resolve(OUT, 'activity-panels-mobile.png') });

await p.setViewportSize({ width: 1240, height: 1000 });

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

await browser.close();

console.log('\n── Fixture report ──────────────────────────────────');
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
console.log(`\nWrote ${resolve(OUT, 'full.png')}, ${resolve(OUT, 'skills-panel.png')} and ${pixelResults.length} icon crops`);
if (consoleIssues.length) throw new Error(`fixture page reported ${consoleIssues.length} resource or console issue(s)`);
