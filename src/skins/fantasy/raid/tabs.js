/**
 * Which of the Guild route's two tabs is showing: "My Guild" or "Raids"
 * (the game added them after the 2026-10-05 snapshots; Curtis, 2026-10-16).
 *
 * The lobby frame (grid, boss card rework, record times) belongs to the
 * Raids tab ONLY. The My Guild tab also shows a boss card (the guild's, with
 * "Boss Progression"), which the port tags `data-iw-guild-card="boss"` just
 * like the raid lobby's, so without this gate the rework landed on it too,
 * and its marks outlived a tab swap.
 *
 * Signals, strongest first:
 *   0. The PORT'S tags: live captures (2026-10-16) show the port tags the
 *      two tabs `data-iw-guild-role="view-tab"` (row: "view-tabs") and the
 *      selected one `data-iw-guild-state="selected"`. That tagging is the
 *      developer's own, newer than the 2026-10-07 delivery.
 *   1. The game's own tab state (rule 5): the two tab buttons, found by
 *      their labels, and the selected one by aria-selected / aria-pressed /
 *      data-state, else by the one carrying the game's accent fill.
 *   2. Content: a "Boss Progression" or "Guild Log" heading is the My Guild
 *      tab's.
 *   3. Neither: the pre-tabs page, where the lobby frame always applied.
 */

import { label } from '../core/dom.js';

const GUILD_TAB = /^my guild\b/i;
const RAIDS_TAB = /^raids?\b/i;
const ACCENT = /(?:^|\s)(?:bg|border)-(?:ember|orange|amber|primary|accent)(?:\/|\s|$)/;
const GUILD_ONLY = /^(?:boss progression|guild log)$/i;

function selectedByState(el) {
  return el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true'
    || el.getAttribute('data-state') === 'active' || el.getAttribute('aria-current') === 'page';
}

/** 'raids' | 'guild' | null (no readable tab pair on the page). */
export function activeGuildTab(scope = document) {
  const picked = scope.querySelector('[data-iw-guild-role="view-tab"][data-iw-guild-state="selected"]');
  if (picked) {
    const text = label(picked.textContent);
    if (RAIDS_TAB.test(text)) return 'raids';
    if (GUILD_TAB.test(text)) return 'guild';
  }
  const buttons = [...scope.querySelectorAll('button, [role="tab"], a')];
  for (const raids of buttons) {
    if (!RAIDS_TAB.test(label(raids.textContent))) continue;
    // Its sibling tab: the "My Guild" control under the same parent row.
    const guild = [...(raids.parentElement?.children || [])]
      .find(el => el !== raids && GUILD_TAB.test(label(el.textContent)));
    if (!guild) continue;
    const [r, g] = [selectedByState(raids), selectedByState(guild)];
    if (r !== g) return r ? 'raids' : 'guild';
    const [ra, ga] = [ACCENT.test(String(raids.className || '')), ACCENT.test(String(guild.className || ''))];
    if (ra !== ga) return ra ? 'raids' : 'guild';
  }
  return null;
}

/** Is `root` (a port-tagged Guild frame) showing the Raids tab's lobby?
 *  `tab` is activeGuildTab(), read once per pass by the caller. */
export function onRaidsTab(root, tab) {
  if (tab) return tab === 'raids';
  for (const el of root.querySelectorAll('h2, h3, p')) {
    if (el.closest('[data-iw-fantasy-owned]')) continue;
    if (GUILD_ONLY.test(label(el.textContent))) return false;
  }
  return true;
}
