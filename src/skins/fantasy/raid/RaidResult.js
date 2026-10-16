/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * RaidResult.js — the fight's Victory / Wipe banner. Fantasy fork of
 * Legacy's RaidHud.decorateOutcome (d57f24d, 2026-10-07); the port's RaidHud
 * is the version just before it, so it tags the result card but draws no
 * banner.
 *
 * The fight's result card ("🏆 Victory! Ashmaw, the Cinder Tyrant." /
 * "💀 Wipe. …", game source chunk 7027) becomes a banner: the headline is
 * split into the game's glyph, its word and the boss, which raid.css draws as
 * a medallion, a large gilded word and a subtitle. The game's text stays in
 * the DOM (the <p> only sets font-size 0). Victory or wipe comes from the
 * card's own colour, which the port's GuildPanels already read into
 * `data-iw-guild-tone` (rule 5). A headline this does not parse keeps the
 * port's framed card.
 *
 * Reads: `[data-iw-raid-hud]` (the port's RaidHud) and its
 * `[data-iw-guild-role="outcome"]` child (the port's GuildPanels). Writes
 * only `data-iw-raid-result*`, which the port's HUD_ATTRS do not include, so
 * its teardown never fights this one.
 */

import { norm, mark, unmark } from '../core/dom.js';

export const RESULT_ATTRS = ['data-iw-raid-result', 'data-iw-raid-result-glyph', 'data-iw-raid-result-word', 'data-iw-raid-result-boss'];
const HEADLINE = /^([^\p{L}\p{N}]*)([\p{L}][^.!]*)[.!]\s*(.*?)\.?$/u;

function decorateOutcome(arena) {
  const card = arena.querySelector(':scope > [data-iw-guild-role="outcome"]');
  if (!card) return;
  const head = card.querySelector(':scope > p');
  const m = HEADLINE.exec(norm(head?.textContent));
  const tone = card.getAttribute('data-iw-guild-tone');
  const kind = !m ? null : tone === 'good' ? 'victory' : tone === 'bad' ? 'wipe' : 'other';
  mark(card, 'data-iw-raid-result', kind);
  mark(card, 'data-iw-raid-result-glyph', m ? m[1].trim() || null : null); // the medallion is the card's ::after
  mark(head, 'data-iw-raid-result-word', m ? m[2].trim() : null);
  mark(head, 'data-iw-raid-result-boss', m ? m[3].trim() || null : null);
}

/** Every pass, for each Guild root the port tagged. */
export function decorateRaidResults(root) {
  for (const arena of root.querySelectorAll('[data-iw-raid-hud]')) decorateOutcome(arena);
}

/** The banner's text lives in its headline, which ticks no countdown, but a
 *  React text swap there must still re-split it. */
export function refreshRaidResultText(parents) {
  for (const parent of parents) {
    const card = parent?.closest?.('[data-iw-raid-hud] > [data-iw-guild-role="outcome"]');
    const arena = card?.parentElement;
    if (arena) decorateOutcome(arena);
  }
}

export function clearRaidResults(root = null) {
  unmark(RESULT_ATTRS, root);
}
