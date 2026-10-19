/**
 * Fantasy chrome — the page header, nav rail, zone bar and the Skill Actions
 * boost line, as the port lays them out (HeaderRenderer / HeaderChrome tags:
 * `data-iw-header`, `data-iw-chrome`, `data-iw-ui`, `data-iw-skill-boost`).
 *
 * styles/chrome.css does almost all of it from the port's tags. The one
 * thing CSS cannot see is TEXT, which the potion pair needs: the game prints
 * the ATK and DEF potions as two separate status chips ("⚔️ No ATK potion
 * active", "🛡️ No DEF potion active"), and the skin shows them as ONE frame
 * with a summary. No node is created or moved (rule 2):
 *
 *   data-iw-fantasy-potion="merged"   the ATK chip: the frame that stays,
 *                                     its own text hidden, the summary drawn
 *                                     by ::after from -potion-text
 *   data-iw-fantasy-potion="folded"   the DEF chip: hidden. Both chips open
 *                                     the same "active buffs & stats" sheet,
 *                                     so the merged frame is still the way in
 *   data-iw-fantasy-potion-state      "none" | "active" (rule 5: an active
 *                                     potion must not read like an empty slot)
 *
 * Written only when BOTH chips were found in one status grid; otherwise the
 * game's two chips stay exactly as the port draws them.
 */

import { guard } from '../core/Runtime.js';
import { inject, remove } from '../core/StyleInjector.js';
import { norm, label, mark, unmark, pruneWritten } from '../core/dom.js';
import chromeCss from '../styles/chrome.css';
import { navigationPass, navigationText, clearNavigation } from './ThumbDock.js';
import { skillHeaderPass, skillHeaderText, clearSkillHeader } from './SkillHeader.js';

export const POTION_ATTR = 'data-iw-fantasy-potion';
export const POTION_TEXT_ATTR = 'data-iw-fantasy-potion-text';
export const POTION_STATE_ATTR = 'data-iw-fantasy-potion-state';
const ATTRS = [POTION_ATTR, POTION_TEXT_ATTR, POTION_STATE_ATTR];

const SURFACES = '[data-iw-header="status-grid"], [data-iw-chrome], [data-iw-skill-boost], .iw-ss-zone, .iw-skill-tabs';
const ICON = { atk: '⚔️', def: '🛡️' };

/** "atk" / "def" for a potion chip, null for any other status card. The
 *  combat line ("ATK 250 • DEF 177 • HP 484") has neither the emoji nor
 *  the word "potion". */
export function potionKind(text) {
  const t = norm(text);
  if (/^\s*⚔/u.test(t) || /\batk\b[^•·]*\bpotion\b/i.test(t)) return 'atk';
  if (/^\s*🛡/u.test(t) || /\bdef\b[^•·]*\bpotion\b/i.test(t)) return 'def';
  return null;
}

/** null for "No ATK potion active", else the chip's text without its emoji. */
export function potionDetail(text) {
  const t = label(text);
  return /^no (atk|def) potions? active$/i.test(t) ? null : t;
}

/** The merged frame's text: one line when neither is up, else one per stat. */
export function potionSummary(atkText, defText) {
  const atk = potionDetail(atkText);
  const def = potionDetail(defText);
  if (!atk && !def) return `${ICON.atk}${ICON.def} No potions active`;
  return `${ICON.atk} ${atk || 'No ATK potion'}\n${ICON.def} ${def || 'No DEF potion'}`;
}

function decoratePotions() {
  const seen = new Set();
  for (const grid of document.querySelectorAll('[data-iw-header="status-grid"]')) {
    const chips = { atk: null, def: null };
    for (const card of grid.children) {
      const kind = potionKind(card.textContent);
      if (kind && !chips[kind]) chips[kind] = card;
    }
    if (!chips.atk || !chips.def) continue;
    const summary = potionSummary(chips.atk.textContent, chips.def.textContent);
    mark(chips.atk, POTION_ATTR, 'merged');
    mark(chips.atk, POTION_TEXT_ATTR, summary);
    mark(chips.atk, POTION_STATE_ATTR, summary.includes('\n') ? 'active' : 'none');
    mark(chips.def, POTION_ATTR, 'folded');
    seen.add(chips.atk).add(chips.def);
  }
  // A chip that is no longer one of a found pair (the game dropped one, or
  // its text changed kind) goes back to the port's own drawing.
  for (const el of document.querySelectorAll(`[${POTION_ATTR}]`)) {
    if (!seen.has(el)) unmark(ATTRS, el);
  }
}

let active = false;

export function chromePass() {
  pruneWritten();
  active = !!document.querySelector(SURFACES);
  if (!active) { clearSkillHeader(); clearNavigation(); remove('chrome'); return; }
  inject('chrome', chromeCss);
  guard('chrome:potions', decoratePotions);
  guard('chrome:navigation', navigationPass);
  guard('chrome:skill-header', skillHeaderPass);
}

/** A potion timer ticks as text, and a chip's text is what the summary copies. */
export function chromeText(parents) {
  if (!active) return;
  guard('chrome:navigation-text', () => navigationText(parents));
  guard('chrome:skill-header-text', () => skillHeaderText(parents));
  if (parents.some(p => p.closest?.('[data-iw-header="status-card"]'))) guard('chrome:potions', decoratePotions);
}

export function clearChrome() {
  clearSkillHeader();
  clearNavigation();
  unmark(ATTRS);
  remove('chrome');
  active = false;
}
