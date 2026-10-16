/**
 * The Fantasy raid port: the raid UI Legacy gained after the game's native
 * Fantasy port was last delivered (2026-10-07, reskin 37c608b).
 *
 *   result       Victory / Wipe banner               (Legacy d57f24d)
 *   lobby        lobby grid, record times, ready-check pop-up (58ff726)
 *   bossCard     the boss card rework                (58ff726)
 *   leaderboard  raid leaderboard on /leaderboards   (58ff726)
 *
 * Everything else about the raid (GuildPanels' tags, the HUD, the arenas) is
 * the PORT'S, and this module only reads it: it never writes a
 * `data-iw-guild-card` / `-role` / `-tone` or a HUD attribute.
 *
 * Each feature stands down, and clears what it wrote, as soon as the port's
 * own stylesheets show it ships that feature (NativeFeatures). Left out on
 * purpose: Legacy's raid gear sprites (they live in the port's AtlasService,
 * which paints game nodes inline; a second painter would fight it), its
 * CompactButtons plate on the game's result Close button (the port's
 * CompactButtons owns game buttons), and the lobby test toggles.
 */

import { nativeFeatures } from '../core/NativeFeatures.js';
import { guard } from '../core/Runtime.js';
import { requestPass } from '../core/Watcher.js';
import { decorateGuildLobby, refreshGuildLobbyText, pruneGuildLobby, clearGuildLobby } from './GuildLobby.js';
import { clearBossCard } from './RaidBossCard.js';
import { reconcileRaidLeaderboards, clearRaidLeaderboards } from './RaidLeaderboards.js';
import { decorateRaidResults, refreshRaidResultText, clearRaidResults } from './RaidResult.js';
import { pruneWritten } from '../core/dom.js';
import { activeGuildTab, onRaidsTab } from './tabs.js';

const ROOTS = '[data-iw-guild="root"]';
let active = { lobby: false, bossCard: false, leaderboard: false, result: false };

function roots() {
  return [...document.querySelectorAll(ROOTS)];
}

/** Turn each feature on or off from what the port ships; clear on the way off. */
function settle() {
  const native = nativeFeatures();
  const next = {
    lobby: !native.has('lobby'),
    bossCard: !native.has('bossCard'),
    leaderboard: !native.has('leaderboard'),
    result: !native.has('result'),
  };
  if (active.lobby && !next.lobby) clearGuildLobby(document.body);
  if (active.bossCard && !next.bossCard) clearBossCard(document.body);
  if (active.leaderboard && !next.leaderboard) clearRaidLeaderboards();
  if (active.result && !next.result) clearRaidResults();
  active = next;
  return next;
}

export function raidPass() {
  pruneWritten();
  const on = settle();
  const list = roots();
  const tab = on.lobby && list.length ? activeGuildTab(document) : null;
  for (const root of list) {
    if (on.lobby) guard('raid:lobby', () => decorateGuildLobby(root, { bossCard: on.bossCard, frame: onRaidsTab(root, tab), onBoard: requestPass }));
    if (on.result) guard('raid:result', () => decorateRaidResults(root));
  }
  if (on.lobby) guard('raid:lobby-prune', pruneGuildLobby);
  if (on.leaderboard) guard('raid:leaderboard', reconcileRaidLeaderboards);
}

export function raidText(parents) {
  if (active.lobby) guard('raid:lobby-text', () => refreshGuildLobbyText(parents));
  if (active.result) guard('raid:result-text', () => refreshRaidResultText(parents));
}

export function clearRaid() {
  clearGuildLobby(document.body);
  clearBossCard(document.body);
  clearRaidLeaderboards();
  clearRaidResults();
  active = { lobby: false, bossCard: false, leaderboard: false, result: false };
}
