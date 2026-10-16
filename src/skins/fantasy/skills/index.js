/**
 * Fantasy skills + quests: the game's own Skills sheet and its Bounties &
 * Work Orders board (live 2026-10-16), reskinned.
 *
 * The game replaced the skill cards the port styles with its own markup —
 * `.iw-skill-tabs` / `.iw-skill-sheet` (`.iw-ss-*`) in the Skill Actions
 * panel and `.iw-wo-board` (`.iw-wo-*`) in the Quests panel — styled only by
 * its stock CSS, with emoji for every icon. The `iw-` prefix is the game
 * developer's, not ours: these are game nodes, React's to render.
 *
 * So this module never creates a node. It reads the game's text and writes
 * three attributes in its own namespace, which styles/skills.css and
 * styles/quests.css draw from:
 *
 *   data-iw-fantasy-skill  the discipline a tab / sheet head / tile names
 *   data-iw-fantasy-icon   an item sprite key (window in a generated sheet)
 *   data-iw-fantasy-lead   "icon": a leading emoji was SEEN and a sprite
 *                          replaces it, so the CSS may collapse it with
 *                          ::first-letter. Never written on a guess, so a
 *                          line that loses its emoji keeps its first letter.
 *
 * Nothing is hidden that is not replaced: no skill key, no sprite, no mark,
 * and the game's emoji stays. A material line naming several items keeps all
 * its emoji (one ::first-letter cannot reach the second).
 *
 * Each menu stands down once the port's Fantasy sheet styles it
 * (NativeFeatures `skillSheet` / `workOrders`), clearing what it wrote.
 */

import { nativeFeatures } from '../core/NativeFeatures.js';
import { guard } from '../core/Runtime.js';
import { inject, remove, setSheet } from '../core/StyleInjector.js';
import { requestPass } from '../core/Watcher.js';
import { label, mark, unmark, pruneWritten } from '../core/dom.js';
import { loadItemAtlas, onItemAtlas, findItemSprite, nameKey } from '../core/ItemAtlas.js';
import skillsCss from '../styles/skills.css';
import questsCss from '../styles/quests.css';

export const SKILL_ATTR = 'data-iw-fantasy-skill';
export const ICON_ATTR = 'data-iw-fantasy-icon';
export const LEAD_ATTR = 'data-iw-fantasy-lead';
export const PCT_ATTR = 'data-iw-fantasy-pct';
const ATTRS = [SKILL_ATTR, ICON_ATTR, LEAD_ATTR, PCT_ATTR];

/*
 * The tab's XP ring. The game gives a tab's progress only as its bar's
 * INLINE width ("width: 35.111%"), so the pass copies that number, rounded,
 * into data-iw-fantasy-pct and 101 static rules turn it into the ring's
 * sweep. No layout read, no inline style written on a game node; a new
 * width is a `style` mutation, which the Watcher already sees.
 */
const PCT_RULES = Array.from({ length: 101 }, (_, n) => `:is(:root,#iwf) .iw-skill-tab[${PCT_ATTR}="${n}"]{--iwf-pct:${n}%}`).join('\n');

export function tabPercent(tab) {
  const width = tab.querySelector('.iw-skill-tab-bar > span')?.style.width || '';
  const m = width.match(/^([\d.]+)%$/);
  return m ? String(Math.max(0, Math.min(100, Math.round(+m[1])))) : null;
}

const SHEET_ROOTS = '.iw-skill-tabs, .iw-skill-sheet';
const BOARD_ROOTS = '.iw-wo-board';
// Text ticks that can change what a mark says. The running timer and the
// counts tick every second and name nothing, so they never re-run the pass.
const NAMED = '.iw-skill-tab-name, .iw-ss-name, .iw-ss-detail, .iw-wo-skill, .iw-wo-item';

/** Discipline names as the game prints them -> the action-icon set's keys. */
const SKILLS = {
  combat: 'combat', bounty: 'combat',
  mining: 'mining',
  smithing: 'smithing',
  gathering: 'gathering', herbalism: 'gathering', herbing: 'gathering',
  alchemy: 'alchemy',
  jewelcrafting: 'jewelcrafting',
  spellcrafting: 'spellcrafting',
  tailoring: 'tailoring',
  woodcutting: 'woodcutting',
  construction: 'construction',
};

const PICTO = /\p{Extended_Pictographic}/gu;
const LEADING = /^\s*\p{Extended_Pictographic}/u;

export function skillKey(text) {
  const word = label(text).split(/\s/)[0]?.toLowerCase() || '';
  return SKILLS[word] || null;
}

/** "🪨 Eternium Ore 121174/8" -> "Eternium Ore"; null for a multi-item line. */
export function materialName(text) {
  const s = String(text || '');
  if ((s.match(PICTO) || []).length !== 1) return null;
  const m = label(s).match(/^(.*?)\s+[\d.,]+[kmb]?\s*\/\s*[\d.,]+[kmb]?$/i);
  return m ? m[1] : null;
}

/* ── generated sprite windows ─────────────────────────────────────────── */

const sprites = new Map(); // icon key -> window

function spriteSheet() {
  let css = '';
  for (const [key, win] of sprites) {
    css += `[${ICON_ATTR}="${key}"]{--iwf-sprite-img:var(--iwf-${win.atlas}-atlas);--iwf-sprite-size:${win.size};--iwf-sprite-pos:${win.pos}}\n`;
  }
  return css;
}

function markItem(el, query) {
  const win = findItemSprite(query);
  const key = win ? `${win.atlas}-${nameKey(query.id) || nameKey(query.name)}` : null;
  if (key && !sprites.has(key)) {
    sprites.set(key, win);
    setSheet('item-icons', spriteSheet());
  }
  mark(el, ICON_ATTR, key);
  mark(el, LEAD_ATTR, key && LEADING.test(el.textContent || '') ? 'icon' : null);
}

function markSkill(el, text, { lead = false } = {}) {
  const key = skillKey(text);
  mark(el, SKILL_ATTR, key);
  if (lead) mark(el, LEAD_ATTR, key && LEADING.test(el.textContent || '') ? 'icon' : null);
}

/* ── the two menus ────────────────────────────────────────────────────── */

function decorateSkillSheet() {
  for (const tab of document.querySelectorAll('.iw-skill-tab')) {
    markSkill(tab, tab.querySelector('.iw-skill-tab-name')?.textContent);
    mark(tab, PCT_ATTR, tabPercent(tab));
  }
  for (const head of document.querySelectorAll('.iw-ss-head')) {
    markSkill(head, head.querySelector('.iw-ss-name > span:first-child')?.textContent);
  }
  for (const line of document.querySelectorAll('.iw-ss-detail')) {
    const name = materialName(line.textContent);
    if (name) markItem(line, { name });
    else { mark(line, ICON_ATTR, null); mark(line, LEAD_ATTR, null); }
  }
}

function decorateWorkOrders() {
  for (const skill of document.querySelectorAll('.iw-wo-skill')) markSkill(skill, skill.textContent, { lead: true });
  for (const item of document.querySelectorAll('.iw-wo-item')) {
    // `data-iw-item` is the PORT'S attribute on the game's node: read, never written.
    markItem(item, { id: item.getAttribute('data-iw-item'), name: label(item.textContent) });
  }
  for (const title of document.querySelectorAll('.iw-wo-head > span:first-child:not(.iw-wo-sub)')) {
    // The board title's emoji has no sprite of its own; the heading's
    // diamond (quests.css) takes its place, so it is still a replacement.
    mark(title, LEAD_ATTR, LEADING.test(title.textContent || '') ? 'icon' : null);
  }
}

/* ── lifecycle ────────────────────────────────────────────────────────── */

let active = { skillSheet: false, workOrders: false };
let unsubscribe = null;

function clearUnder(selector) {
  for (const root of document.querySelectorAll(selector)) unmark(ATTRS, root);
}

/*
 * A sheet exists only while its menu is on the page, and the item indexes
 * load only once an item line exists: a route without these menus costs no
 * stylesheet and no request (tests/theme-isolation pins both).
 */
function settle() {
  const native = nativeFeatures();
  const present = { skillSheet: !!document.querySelector(SHEET_ROOTS), workOrders: !!document.querySelector(BOARD_ROOTS) };
  const next = { skillSheet: !native.has('skillSheet'), workOrders: !native.has('workOrders') };
  if (next.skillSheet && present.skillSheet) inject('skills', `${skillsCss}\n${PCT_RULES}`);
  else remove('skills');
  if (!next.skillSheet && active.skillSheet) clearUnder(SHEET_ROOTS);
  if (next.workOrders && present.workOrders) inject('quests', questsCss);
  else remove('quests');
  if (!next.workOrders && active.workOrders) clearUnder(BOARD_ROOTS);
  if (!next.skillSheet && !next.workOrders) { remove('item-icons'); sprites.clear(); }
  active = next;
  return { skillSheet: next.skillSheet && present.skillSheet, workOrders: next.workOrders && present.workOrders };
}

export function skillsPass() {
  pruneWritten();
  const on = settle();
  if ((on.skillSheet && document.querySelector('.iw-ss-detail')) || on.workOrders) {
    if (!unsubscribe) unsubscribe = onItemAtlas(requestPass);
    loadItemAtlas();
  }
  if (on.skillSheet) guard('skills:sheet', decorateSkillSheet);
  if (on.workOrders) guard('skills:work-orders', decorateWorkOrders);
}

/** A tab switch can rewrite only text (React reuses the nodes). */
export function skillsText(parents) {
  if (!active.skillSheet && !active.workOrders) return;
  if (parents.some(p => p.closest?.(NAMED))) skillsPass();
}

export function clearSkills() {
  unmark(ATTRS);
  remove('skills');
  remove('quests');
  remove('item-icons');
  sprites.clear();
  unsubscribe?.();
  unsubscribe = null;
  active = { skillSheet: false, workOrders: false };
}
