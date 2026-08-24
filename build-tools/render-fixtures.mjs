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
};
const SKILL_LEVELS = {
  combat: 42, mining: 42, smithing: 42, gathering: 42, alchemy: 42,
  jewelcrafting: 68, spellcrafting: 57, tailoring: 26, crafting: 42, fishing: 42,
};

const skillPanel = ({ type, label, title, pct, xp, reward, ingredients, requirement, detail }) => {
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
      <div><div data-iw-skill-role="action-title" data-iw-clean-text="${title}">${title}</div><div data-iw-skill-role="level-progress" data-iw-progress-display="Lv ${level} • 12,480 XP to go">Lv ${level} - ${pct}% • 12,480 XP to go</div>
        <div data-iw-skill-role="nav-group"><button data-iw-skill-role="nav-button" data-iw-nav-direction="prev"><span>‹</span></button><button data-iw-skill-role="nav-button" data-iw-nav-direction="next"><span>›</span></button></div></div>
      <div data-iw-skill-role="xp-gain">+${xp} XP</div>
      <div data-iw-skill-role="progress-track"><div data-iw-skill-role="progress-fill" style="width:${pct}%"></div></div>
      ${ingredients ? `<div data-iw-skill-role="ingredient"><span class="iw-item-ref">${ingredients}</span> 12/20</div>` : ''}
      <span class="fs-skill-base-exp" data-iw-base-exp="${baseExp}">Base: ${baseExp}</span>
      <div data-iw-skill-role="requirement">${requirementText}</div>
      <div data-iw-skill-role="reward">Base reward: ${rewardText}</div>
      ${detail ? `<div data-iw-skill-role="action-detail">${detail}</div>` : ''}
    </div>
    <button data-iw-skill-zone="commands" data-iw-skill-role="action-button" data-iw-btn-state="primary">${action}</button>
  </div>
</div>`;
};

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

const baseCss = (await readFile(resolve(ROOT, 'src/styles/base.css'), 'utf8'))
  .replaceAll('../assets/', fileUrl('assets') + '/');

const page = `<!doctype html><html><head><meta charset="utf-8">
<style>
${baseCss}
${await readFile(resolve(ROOT, 'src/styles/inventory.css'), 'utf8')}
${await readFile(resolve(ROOT, 'src/styles/skillpanel.css'), 'utf8')}
${await readFile(resolve(ROOT, 'src/styles/tooltip-engine.css'), 'utf8')}
${await readFile(resolve(ROOT, 'src/styles/ui-system.css'), 'utf8')}
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
${skillPanel({ type: 'combat', label: 'Combat', title: 'Fight Bone Marauder', pct: 62, xp: '123456', reward: '340g' })}
${skillPanel({ type: 'mining', label: 'Mining', title: 'Mine Copper Ore', pct: 28, xp: '85', ingredients: 'Copper Ore' })}
${skillPanel({ type: 'smithing', label: 'Smithing', title: 'Forge Iron Sword', pct: 91, xp: '410', ingredients: 'Iron Ore' })}
${skillPanel({ type: 'gathering', label: 'Gathering', title: 'Harvest Duskroot', pct: 45, xp: '150' })}
${skillPanel({ type: 'alchemy', label: 'Alchemy', title: 'Brew ATK Potion', pct: 12, xp: '260' })}
</div><div>
${skillPanel({ type: 'jewelcrafting', label: 'Jewel', title: 'Craft Moonstone Ring', pct: 16.6, xp: '1253', ingredients: 'Moonstone / Sapphire / Topaz', requirement: 'Requires Jewelcrafting Lv 53', detail: 'Missing materials — will queue (gather first)' })}
${skillPanel({ type: 'spellcrafting', label: 'Spellcraft', title: 'Harvest Moonsteel Mana', pct: 94.6, xp: '124', requirement: 'Requires Spellcraft Lv 53', detail: 'Gather Moonsteel Mana from the ether' })}
${skillPanel({ type: 'tailoring', label: 'Tailor', title: 'Upgrade Moonsilk Silkbind Thread', pct: 21, xp: '5638', ingredients: 'Moonsilk Silkbind Thread / Moonsteel Upgrade Orb', requirement: 'Requires Tailoring Lv 53 and Gathering Lv 49' })}
${skillPanel({ type: 'crafting', label: 'Crafting', title: 'Craft Upgrade Orb', pct: 33, xp: '190' })}
${skillPanel({ type: 'fishing', label: 'Fishing', title: 'Fish Abyssal Eel', pct: 67, xp: '220' })}
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
await p.locator('.fx-tooltip-grid').screenshot({ path: resolve(OUT, 'tooltips.png') });

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
  const audit = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.compact-row:has(> .fs-inv-row)')];
    const panels = [...document.querySelectorAll('.fx-skill-grid .compact-panel.fs-skill-panel')];
    const medallions = panels.map(el => el.querySelector('.fs-skill-medallion-art')).filter(Boolean);
    const identityLevels = panels.map(el => el.querySelector('[data-iw-skill-role="identity-level"]')).filter(Boolean);
    const actionButtons = panels.map(el => el.querySelector('[data-iw-skill-role="action-button"]')).filter(Boolean);
    const basePlaques = panels.map(el => el.querySelector('.fs-skill-base-exp')).filter(Boolean);
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
      medallionsVisible: medallions.length === panels.length && medallions.every(el => el.getBoundingClientRect().width >= 46 && el.getBoundingClientRect().height >= 46),
      medallionsPainted: medallions.length === panels.length && medallions.every(el => {
        const bg = getComputedStyle(el).backgroundImage;
        return bg && bg !== 'none' && /skills_icons_atlas\.webp/.test(bg);
      }),
      identityLevelsVisible: identityLevels.length === panels.length && identityLevels.every(el => el.getBoundingClientRect().height > 0),
      actionButtonsSized: actionButtons.length === panels.length && actionButtons.every(el => el.getBoundingClientRect().width >= 128 && el.getBoundingClientRect().height >= 46),
      basePlaquesFit: basePlaques.length === panels.length && basePlaques.every(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().width >= 188),
      sixDigitBaseFits: !!document.querySelector('.fs-skill-base-exp[data-iw-base-exp="123456"]') && document.querySelector('.fs-skill-base-exp[data-iw-base-exp="123456"]').scrollWidth <= document.querySelector('.fs-skill-base-exp[data-iw-base-exp="123456"]').clientWidth + 1,
      navAboveAction: panels.every(el => {
        const nav = el.querySelector('[data-iw-skill-role="nav-group"]')?.getBoundingClientRect();
        const action = el.querySelector('[data-iw-skill-role="action-button"]')?.getBoundingClientRect();
        return nav && action && nav.top <= action.top;
      }),
      twoRow: panels.every(el => getComputedStyle(el).gridTemplateAreas.includes('content content')),
      commandsVisible: panels.every(el => {
        const cmd = el.querySelector('[data-iw-skill-zone="commands"]');
        return cmd && getComputedStyle(cmd).display !== 'none' && cmd.getBoundingClientRect().width > 0;
      }),
    };
  });
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
  if (!audit.skillCount || audit.skillOverflow) throw new Error(`skill panels overflow at ${width}px`);
  if (!audit.medallionsVisible || !audit.medallionsPainted || !audit.identityLevelsVisible) {
    throw new Error(`skill identity card is incomplete at ${width}px: ${JSON.stringify(audit)}`);
  }
  if (!audit.actionButtonsSized || !audit.navAboveAction) {
    throw new Error(`skill command rail is malformed at ${width}px: ${JSON.stringify(audit)}`);
  }
  if (!audit.basePlaquesFit || !audit.sixDigitBaseFits) {
    throw new Error(`Base: plaque cannot contain six digits at ${width}px: ${JSON.stringify(audit)}`);
  }
  if (audit.twoRow !== (width <= 600)) throw new Error(`skill breakpoint mismatch at ${width}px`);
  if (!audit.commandsVisible) throw new Error(`skill commands hidden at ${width}px`);
};
for (const width of RESPONSIVE_WIDTHS) await auditResponsive(width);
await p.setViewportSize({ width: 390, height: 844 });
await p.screenshot({ path: resolve(OUT, 'mobile-responsive.png'), fullPage: true });
await p.locator('.fx-skill-grid').screenshot({ path: resolve(OUT, 'skills-mobile.png') });

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
