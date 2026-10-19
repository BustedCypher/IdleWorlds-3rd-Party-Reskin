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
 * Gameplay nodes stay untouched. The module reads the game's text and writes
 * attributes in its own namespace, which styles/skills.css and
 * styles/quests.css draw from:
 *
 *   data-iw-fantasy-skill  the discipline a tab / sheet head / tile names
 *   data-iw-fantasy-icon   an item sprite key (window in a generated sheet)
 *   data-iw-fantasy-lead   "icon": a leading emoji was SEEN and a sprite
 *                          replaces it, so the CSS may collapse it with
 *                          ::first-letter. Never written on a guess, so a
 *                          line that loses its emoji keeps its first letter.
 *   data-iw-fantasy-pct    a tab's XP bar, copied (the ring)
 *   data-iw-fantasy-boost  "daily": the boost line names this tab's skill
 *   data-iw-fantasy-run    on the Skill Actions panel: the Current Action
 *                          bar, copied (the running fill); -run-reset for
 *                          the one frame a completion snaps back
 *
 * Material counts are painted green (enough) or red (short) by materials.js
 * through the Custom Highlight API: no attribute, no wrapper.
 *
 * Nothing is hidden that is not replaced: no skill key, no sprite, no mark,
 * and the game's emoji stays. A material line naming several items keeps all
 * its emoji (one ::first-letter cannot reach the second).
 *
 * The sheet and work-order reskins stand down once the port styles them.
 * The user-selected skill-card art/layout and selected-skill frame stay active
 * independently. The frame decorates the header medallion without taking
 * ownership of the native recipe, progress or queue behavior.
 */

import { nativeFeatures } from '../core/NativeFeatures.js';
import { guard, raf } from '../core/Runtime.js';
import { inject, remove, setSheet } from '../core/StyleInjector.js';
import { requestPass } from '../core/Watcher.js';
import { isRendered } from '../core/Viewport.js';
import { label, mark, unmark, pruneWritten, ownerOf, removeOwned } from '../core/dom.js';
import { loadItemAtlas, onItemAtlas, findItemSprite, nameKey } from '../core/ItemAtlas.js';
import { queuePass, queueText, clearQueue } from './queue.js';
import { materialsPass, clearMaterials } from './materials.js';
import skillsCss from '../styles/skills.css';
import cardsCss from '../styles/skill-cards.css';
import frameCss from '../styles/skill-frame.css';
import queueCss from '../styles/queue.css';
import questsCss from '../styles/quests.css';

export const SKILL_ATTR = 'data-iw-fantasy-skill';
export const ICON_ATTR = 'data-iw-fantasy-icon';
export const LEAD_ATTR = 'data-iw-fantasy-lead';
export const PCT_ATTR = 'data-iw-fantasy-pct';
export const BOOST_ATTR = 'data-iw-fantasy-boost';
export const RUN_ATTR = 'data-iw-fantasy-run';
export const RUN_RESET_ATTR = 'data-iw-fantasy-run-reset';
export const CARDS_ATTR = 'data-iw-fantasy-cards';
export const FRAME_ATTR = 'data-iw-fantasy-skill-frame';
const ATTRS = [SKILL_ATTR, ICON_ATTR, LEAD_ATTR, PCT_ATTR, BOOST_ATTR, RUN_ATTR, RUN_RESET_ATTR, CARDS_ATTR, FRAME_ATTR];
const LOCATION_OWNED = 'data-iw-fantasy-skill-location-owned';
const ownLocation = ownerOf(LOCATION_OWNED);
const REMOTE_ACTION = '#current-action-panel button[title^="Jump to Zone "]';
const ACTION_WORDS = {
  fight: ['combat', 'Fighting'], mine: ['mining', 'Mining'],
  gather: ['gathering', 'Gathering'], harvest: ['gathering', 'Harvesting'],
  smelt: ['smithing', 'Smelting'], smith: ['smithing', 'Smithing'], forge: ['smithing', 'Forging'],
  brew: ['alchemy', 'Brewing'], weave: ['tailoring', 'Weaving'],
  chop: ['woodcutting', 'Woodcutting'], build: ['construction', 'Building'],
  assemble: ['construction', 'Assembling'], upgrade: [null, 'Upgrading'],
  cut: ['jewelcrafting', 'Cutting'], prospect: ['jewelcrafting', 'Prospecting'],
  craft: [null, 'Crafting'],
};

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

/*
 * The running action's fill. The game paints the action's progress only on
 * the Current Action bar, as that bar's INLINE width; the pass copies it, to
 * the nearest half percent, into data-iw-fantasy-run on the Skill Actions
 * panel and 201 static rules turn it into --iwf-run. The panel holds both the
 * running row and the tiles, so skills.css alone decides which one shows the
 * fill (the row while the sheet renders it, else the running tile), and
 * the two read one value. The skin never computes progress (rule 5).
 */
const RUN_RULES = Array.from({ length: 201 }, (_, n) => `:is(:root,#iwf) [${RUN_ATTR}="${n / 2}"]{--iwf-run:${n / 2}%}`).join('\n');
const RUN_FILL = '#current-action-panel [style*="width"]';

/** The game's Current Action fill as a half-percent string, or null. */
export function runPercent(root = document) {
  for (const el of root.querySelectorAll(RUN_FILL)) {
    const m = (el.style.width || '').match(/^([\d.]+)%$/);
    if (m) return String(Math.max(0, Math.min(100, Math.round(+m[1] * 2) / 2)));
  }
  return null;
}

/** "Daily XP Boost: Gathering + Smithing + Tailoring + 20 % XP" -> skill keys. */
export function boostedSkills(text) {
  const m = label(text).match(/^daily xp boost\s*:\s*(.*)$/i);
  if (!m) return new Set();
  return new Set(m[1].split('+').map(part => skillKey(part)).filter(Boolean));
}

const SHEET_ROOTS = '.iw-skill-tabs, .iw-skill-sheet';
const BOARD_ROOTS = '.iw-wo-board';
// The port's tag on the Skill Actions boost line: read, never written.
const BOOST_LINE = '[data-iw-skill-boost]';
// Text ticks that can change what a mark says. The running timer and the
// counts tick every second and name nothing, so they never re-run the pass.
const NAMED = `.iw-skill-tab-name, .iw-ss-name, .iw-ss-detail, .iw-wo-skill, .iw-wo-item, ${BOOST_LINE}`;

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

/** The panel that holds a tab strip: the tiles' and the sheet's common frame. */
const panelOf = tabs => tabs.closest('.panel') || tabs.parentElement;

function decorateSkillCards() {
  for (const tabs of document.querySelectorAll('.iw-skill-tabs')) {
    mark(tabs, CARDS_ATTR, 'soft-iron');
    const boosted = boostedSkills(panelOf(tabs)?.querySelector(BOOST_LINE)?.textContent);
    for (const tab of tabs.querySelectorAll('.iw-skill-tab')) {
      markSkill(tab, tab.querySelector('.iw-skill-tab-name')?.textContent);
      mark(tab, PCT_ATTR, tabPercent(tab));
      mark(tab, BOOST_ATTR, boosted.has(tab.getAttribute(SKILL_ATTR)) ? 'daily' : null);
    }
  }
}

function decorateSkillFrame() {
  for (const sheet of document.querySelectorAll('.iw-skill-sheet')) {
    mark(sheet, FRAME_ATTR, 'guild-iron');
    for (const head of sheet.querySelectorAll('.iw-ss-head')) {
      markSkill(head, head.querySelector('.iw-ss-name > span:first-child')?.textContent);
    }
  }
}

/** The native jump control exists only when the running action is in another
 * zone. Read its title even when our queue hides the Current Action panel;
 * queued rows and pending starts must never supply a running location. */
function decorateActionLocation() {
  const actions = [...document.querySelectorAll(REMOTE_ACTION)].filter(button =>
    !button.closest('[draggable]') && button.closest('#current-action-panel').querySelector('button[aria-label="Cancel current action"]'));
  // Queue mirroring hides the action panel itself, so inspect its column.
  // Batch visibility reads before adding or updating any of the notes.
  const rendered = new Set(actions.filter(button => isRendered(button.closest('#current-action-panel').parentElement)));
  const used = new Set();
  for (const sheet of document.querySelectorAll('.iw-skill-sheet')) {
    const name = sheet.querySelector('.iw-ss-name');
    const selected = skillKey(name?.firstElementChild?.textContent);
    const panel = sheet.closest('.panel') || sheet.parentElement;
    let candidates = actions;
    for (let ancestor = sheet.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const local = actions.filter(button => ancestor.contains(button));
      if (local.length) { candidates = local; break; }
    }
    const source = candidates.find(button => rendered.has(button)) || candidates[0];
    const zone = source?.title.match(/^Jump to Zone ([1-9]\d*)$/)?.[1];
    const action = label(source?.textContent);
    const verb = action.split(/\s/)[0]?.toLowerCase();
    const mana = verb === 'harvest' && /\bmana\b/i.test(action);
    const words = mana ? ['spellcrafting', 'Harvesting Mana'] : ACTION_WORDS[verb];
    const liveTab = panel?.querySelector('.iw-skill-tab:has(.iw-skill-tab-live) .iw-skill-tab-name');
    const running = words?.[0] || skillKey(liveTab?.textContent);
    if (!name || !selected || !zone || !words || running !== selected) continue;
    let note = name.querySelector(`[${LOCATION_OWNED}]`);
    if (!note) {
      note = ownLocation('span', 'iwf-skill-location');
      name.firstElementChild.after(note);
    }
    const text = `Currently ${words[1]} in Zone ${zone}`;
    if (note.textContent !== text) note.textContent = text;
    used.add(note);
  }
  for (const note of document.querySelectorAll(`[${LOCATION_OWNED}]`)) if (!used.has(note)) note.remove();
}

function decorateSkillSheet() {
  for (const line of document.querySelectorAll('.iw-ss-detail')) {
    const name = materialName(line.textContent);
    if (name) markItem(line, { name });
    else { mark(line, ICON_ATTR, null); mark(line, LEAD_ATTR, null); }
  }
}

/*
 * The fill's transition must last as long as the gap between two readings,
 * or it stalls (too short) or lags (too long); see
 * docs/traps/current-action-progress.md. That gap is MEASURED: the median of
 * the last five changes of the copied value, with a 1.12x lead so jitter
 * retargets a running transition instead of letting it finish early. The gap
 * into and out of a completion is not a tick (the game's first write of a
 * new action lands ~2x late), so neither is sampled. The result is written
 * to a generated sheet, never inline on a game node, and only when it moves
 * by more than 15%.
 */
const RUN_TICK_FALLBACK = 300;
const run = { value: null, at: 0, gaps: [], skip: false, tick: null };

function sampleRun(value, now) {
  const pct = +value;
  const reset = run.value != null && pct < +run.value;
  if (run.value != null && !reset && !run.skip) {
    const gap = now - run.at;
    if (gap > 40 && gap < 5000) run.gaps = [...run.gaps, gap].slice(-5);
  }
  run.skip = reset;
  run.value = value;
  run.at = now;
  if (run.gaps.length >= 3) {
    const sorted = [...run.gaps].sort((a, b) => a - b);
    const tick = Math.round(Math.max(80, Math.min(4000, sorted[sorted.length >> 1] * 1.12)));
    if (!run.tick || Math.abs(tick - run.tick) / run.tick > 0.15) {
      run.tick = tick;
      setSheet('run-tick', `:is(:root,#iwf){--iwf-run-tick:${tick}ms}`);
    }
  }
  return reset;
}

function decorateRun() {
  const value = runPercent();
  const reset = value != null && value !== run.value && sampleRun(value, performance.now());
  for (const tabs of document.querySelectorAll('.iw-skill-tabs')) {
    const panel = panelOf(tabs);
    mark(panel, RUN_ATTR, value);
    // A completion snaps back rather than sliding a whole bar backwards. The
    // tag is invisible to the Watcher, so it is released on the next frame
    // by this module itself, once the snapped frame has painted.
    if (reset) {
      mark(panel, RUN_RESET_ATTR, '1');
      raf(() => mark(panel, RUN_RESET_ATTR, null));
    }
  }
  if (value == null) { run.value = null; run.skip = false; }
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

let active = { skillCards: false, skillSheet: false, workOrders: false };
let unsubscribe = null;

function resetRun() {
  remove('run-tick');
  Object.assign(run, { value: null, at: 0, gaps: [], skip: false, tick: null });
}

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
  const next = { skillCards: present.skillSheet, skillSheet: !native.has('skillSheet'), workOrders: !native.has('workOrders') };
  // Native sheet styling must not retire the explicitly selected card art,
  // five-column grid or XP rings.
  if (next.skillCards) inject('skill-cards', `${cardsCss}\n${PCT_RULES}`);
  else remove('skill-cards');
  if (next.skillSheet && present.skillSheet) inject('skills', `${skillsCss}\n${queueCss}\n${RUN_RULES}`);
  else { remove('skills'); resetRun(); }
  if (!next.skillSheet && active.skillSheet) {
    clearUnder('.iw-skill-sheet');
    // The run tags sit on the panel, above both roots.
    unmark([RUN_ATTR, RUN_RESET_ATTR]);
  }
  // The requested frame is an art layer, independent of native recipe,
  // progress and queue behavior, just like the selected card design.
  if (document.querySelector('.iw-skill-sheet')) inject('skill-frame', frameCss);
  else remove('skill-frame');
  if (next.workOrders && present.workOrders) inject('quests', questsCss);
  else remove('quests');
  if (!next.workOrders && active.workOrders) clearUnder(BOARD_ROOTS);
  if (!next.skillSheet && !next.workOrders) { remove('item-icons'); sprites.clear(); }
  active = next;
  return { skillCards: next.skillCards, skillSheet: next.skillSheet && present.skillSheet, workOrders: next.workOrders && present.workOrders };
}

export function skillsPass() {
  pruneWritten();
  const on = settle();
  if (on.skillCards) guard('skills:cards', decorateSkillCards);
  if (on.skillCards) guard('skills:frame', decorateSkillFrame);
  if (on.skillCards) guard('skills:location', decorateActionLocation);
  else removeOwned(LOCATION_OWNED);
  if ((on.skillSheet && document.querySelector('.iw-ss-detail')) || on.workOrders) {
    if (!unsubscribe) unsubscribe = onItemAtlas(requestPass);
    loadItemAtlas();
  }
  if (on.skillSheet) guard('skills:sheet', decorateSkillSheet);
  if (on.skillSheet) guard('skills:materials', materialsPass);
  else clearMaterials();
  if (on.skillSheet) guard('skills:run', decorateRun);
  if (on.skillSheet) guard('skills:queue', queuePass);
  else clearQueue();
  if (on.workOrders) guard('skills:work-orders', decorateWorkOrders);
}

/** A tab switch can rewrite only text (React reuses the nodes). */
export function skillsText(parents) {
  if (!active.skillCards && !active.skillSheet && !active.workOrders) return;
  if (parents.some(p => p.closest?.(NAMED))) skillsPass();
  else {
    if (parents.some(p => p.closest?.(REMOTE_ACTION))) guard('skills:location-text', decorateActionLocation);
    if (active.skillSheet) queueText(parents);
  }
}

export function clearSkills() {
  unmark(ATTRS);
  remove('skills');
  remove('skill-cards');
  remove('skill-frame');
  remove('quests');
  remove('item-icons');
  resetRun();
  clearMaterials();
  clearQueue();
  removeOwned(LOCATION_OWNED);
  sprites.clear();
  unsubscribe?.();
  unsubscribe = null;
  active = { skillCards: false, skillSheet: false, workOrders: false };
}
