/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * GuildPanels.js — the Guild route and its raid (live 2026-10-05).
 *
 * WHAT THE GAME RENDERS (two snapshots, a raid lobby as a guest and an active
 * fight; the route is anonymous Tailwind apart from the `raid-*` classes, so
 * these shapes ARE the contract):
 *
 *   .panel                                         "⚔️ Raid Dungeon" + Beta
 *     div (head row)  h2 > span title, span badge | p "🤝 Raiding as a guest…"
 *                     div > button "View my guild (Omen)", "Leave guest spot"
 *   LOBBY
 *     .compact-panel  amber   "⚔️ Ready check: Ashmaw Normal" · "time's up"
 *     div (two columns)
 *       .compact-panel  boss pills (button[title="Ashmaw, the …"], bg-ember =
 *                       selected), name, lore, stats, requirement, tip,
 *                       difficulty row (border-ember = selected, 🔒 = locked),
 *                       weekly-loot notice (emerald = available)
 *       .compact-panel  "🏆 Leaderboard" + attempt rows (text-ember = #1)
 *       .compact-panel  "Members" · "7/8 ready", member rows (status dot,
 *                       name button, ⭐ points, "Combat 66" chip, lend-skill
 *                       pill, READY badge / "Not ready"), "Raid guests (2/7)"
 *     .compact-panel  "Lend a Tradeskill" + picker button (+ its menu)
 *     .compact-panel  "🧪 Pre-raid prep" + potion rows with "Drink"
 *     .compact-panel  "Raid Loadout" select + "Set"
 *     .compact-panel  "✓ Ready" toggle (emerald = ready) + note
 *     .compact-panel  "💬 <Guild> Chat" feed + "Message your guild…" composer
 *   FIGHT
 *     .raid-battle-backdrop (--raid-bg-image)  game art: embers, boss sprite
 *       .raid-readable-panel  telegraph "Claw Rake (single target) in 10s"
 *       div  boss name · "7/7 standing", sprite, HP track, "10,352 / 21,000 HP"
 *       .raid-readable-panel  "⚡ Raid skills" toggle + active-effect lines
 *       .raid-arena-floor  button (disabled) per raider: sprite, nameplate,
 *                          lend skill, HP track, action-charge track, icons
 *       button.raid-readable-panel  "Combat Log" (tap to expand)
 *       p "Charging your action bar…"
 *     .compact-panel  "💬 Raid Chat"
 *
 * THE GUILD'S OWN PAGE (two more snapshots, v0.2.0+2026-10-05.16: a leader in
 * a guild, and a player with no guild). Same panel, same head row — its
 * subtitle is "woof • 7/12 members • ⭐ 1 guild points" (or a one-line pitch),
 * its one link "Leave Guild". Cards the guest lobby did not have:
 *     .compact-panel  "⚔️ Pickup Raid Group" + note | button-primary
 *     .compact-panel  "Invite Player" · "7/12" | note | input + "Invite"
 *     .compact-panel  "🤝 Invite a Raid Guest" · "0/7" | note | input + "Invite"
 *     .compact-panel  "✓ Ready" toggle beside "⚔️ Start Raid (7)" (leader)
 *     .compact-panel  button > p "🏰 All Guilds" · "show ▾"   (collapsed)
 *   NO GUILD
 *     .compact-panel  "Create a Guild" | input + "Create"
 *     .compact-panel  button > p "🏰 Find a Guild" | note | scroll list of
 *                     guild rows: button (▸ · #1 · name), ⭐ points, "8/12",
 *                     "Apply" (emerald)
 * A leader's member rows also carry a lend-skill PICKER (a sky button, ▾)
 * where a guest saw a static pill, and a "✕" kick button (title "Kick …").
 * The invite and create cards have an input, so they must be named BEFORE the
 * chat test — as chat, their help sentence took the card-title role.
 *
 * Every card is the shared `.compact-panel`, so the roles live in their OWN
 * `data-iw-guild*` namespace (CLAUDE.md, ownership). DOMWatcher also answers
 * 'unknown' for these cards, because the Members card's "Combat 66" chips used
 * to make SkillPanelRenderer rebuild it as a Combat skill card.
 *
 * RULE 5. Nearly every colour on this route is state: the selected boss and
 * difficulty, READY vs "Not ready", the emerald ready toggle, the amber ready
 * check, the online dot, low raider HP turning amber, your own nameplate in
 * sky. The game paints those through utility classes, and the skin's generic
 * rules either repaint them uniformly (`border-color` on every button and every
 * bordered rounded-xl box) or erase them outright (the generic plate's
 * `background-image` beats the game's own `!important` ember gradient — the
 * selected boss pill rendered as a blank dark slab). So this module READS the
 * state from the game's classes (`toneOf`, `selectedBy`) and writes it as an
 * attribute the sheet re-presents in the skin's palette; every marked control
 * opts out of the generic plate through `:not([data-iw-guild-role])`.
 *
 * Cost: one pass per flush over the resolved panels only, every write compared
 * first (`mark`). Ashmaw adds one owned decorative canvas layer, reconciled
 * idempotently; animation draws pixels without per-frame DOM writes. Native
 * gameplay nodes remain owned by React.
 */

import { reconcileAshmawScene, clearAshmawScenes, pruneAshmawScenes } from './AshmawScene.js';
import { reconcileThessalyScene, clearThessalyScenes, pruneThessalyScenes } from './ThessalyScene.js';
import { reconcileMorwennaScene, clearMorwennaScenes, pruneMorwennaScenes } from './MorwennaScene.js';
import { reconcileGrimjawScene, clearGrimjawScenes, pruneGrimjawScenes } from './GrimjawScene.js';
import { reconcileSkarthScene, clearSkarthScenes, pruneSkarthScenes } from './SkarthScene.js';
import { decorateRaidHud, clearRaidHud, pruneRaidDocks } from './RaidHud.js';
import { decorateGuildLobby, clearGuildLobby } from './GuildLobby.js';
// TESTING FEATURE: dummy raiders to preview a full party (RaidPartyPreview.js).
import { syncPartyPreview, syncPartyPreviewToggle, clearRaidPartyPreview } from './RaidPartyPreview.js';

const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
/** Labels lead with an emoji run ("⚔️ Ready check", "🧪 Pre-raid prep"). */
const label = value => norm(value).replace(/^[^\p{L}\p{N}]+/u, '');

const ROLE = 'data-iw-guild-role';
const ATTRS = ['data-iw-guild', 'data-iw-guild-card', ROLE, 'data-iw-guild-tone', 'data-iw-guild-state'];

function mark(el, key, value) {
  if (!el) return;
  if (value == null) { if (el.hasAttribute(key)) el.removeAttribute(key); return; }
  if (el.getAttribute(key) !== value) el.setAttribute(key, value);
}
const role = (el, value) => mark(el, ROLE, value);

/**
 * The semantic colour the game gave an element, read from its utility
 * classes. Order matters: a READY badge is `border-emerald-… bg-emerald-…
 * text-emerald-…`, a leader's name is `text-amber-200`, and a plain row is
 * `bg-white/5` — which must read as no tone at all, not as "white".
 */
function toneOf(el) {
  const cls = String(el?.className || '');
  if (/(?:^|\s)(?:[a-z]+:)?(?:bg|border|text)-(?:emerald|green|lime)-/.test(cls)) return 'good';
  if (/(?:^|\s)(?:[a-z]+:)?(?:bg|border|text)-(?:rose|red)-/.test(cls)) return 'bad';
  if (/(?:^|\s)(?:bg|border|text)-(?:amber|yellow|orange)-/.test(cls)) return 'warn';
  if (/(?:^|\s)(?:bg|border|text)-(?:sky|blue|cyan|indigo)-/.test(cls)) return 'info';
  if (/(?:^|\s)(?:bg|border|text)-ember\b/.test(cls)) return 'accent';
  return null;
}
const tone = (el, value = toneOf(el)) => mark(el, 'data-iw-guild-tone', value);

/** The game's own "this one is selected" classes for a pill / segment. */
function selectedBy(el, pattern) {
  return pattern.test(String(el?.className || ''));
}

function firstLine(card) {
  const p = card.querySelector('p');
  return p ? label(p.textContent) : '';
}

/* ------------------------------------------------------------- the head -- */

function decorateHead(root, heading) {
  if (!heading) return;
  let head = heading;
  while (head.parentElement && head.parentElement !== root) head = head.parentElement;
  if (head.parentElement !== root) return;
  role(head, 'head');
  // The Beta badge: an uppercase span inside the heading, beside the title.
  for (const span of heading.querySelectorAll(':scope > span')) {
    if (/^(beta|alpha|new)$/i.test(norm(span.textContent))) role(span, 'badge');
  }
  for (const p of head.querySelectorAll('p')) {
    if (!heading.contains(p)) role(p, 'subtitle');
  }
  // "⭐ 1 guild points" in a member's subtitle.
  for (const span of head.querySelectorAll('span[title]')) {
    if (/guild points/i.test(span.title)) role(span, 'points');
  }
  // TESTING FEATURE: the full-party preview toggle, shown only during a fight.
  // Synced before the sweep below, so it is a head link from its first pass.
  syncPartyPreviewToggle(root, head, decorateArena);
  // "View my guild (Omen)" / "Leave guest spot": text links wearing <button>.
  for (const button of head.querySelectorAll('button')) {
    if (button.hasAttribute('data-iw-collapse')) continue;
    role(button, 'head-link');
    mark(button, 'data-iw-guild-tone', /^(leave|disband|kick|decline)\b/i.test(label(button.textContent)) ? 'bad' : null);
  }
}

/* ------------------------------------------------------------ the cards -- */

// "Mark Ready" is the live label (2026-10-08 capture); unknown, the card went generic.
const READY_LABEL = /^(?:✓\s*)?(?:ready|not ready|unready|cancel ready|ready up|mark ready)$/i;

function cardKind(card) {
  const first = firstLine(card);
  const field = card.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea');
  if (field && /^(?:invite\b|create a guild$)/i.test(first)) return 'form';
  if (field) return 'chat';
  if (/^pickup raid group$/i.test(first)) return 'pickup';
  // A directory heads itself with its own disclosure button ("All Guilds",
  // collapsed; "Find a Guild", open with its list).
  if (/^(?:all guilds|find a guild)$/i.test(first) && card.querySelector(':scope > button p')) return 'directory';
  if (/^ready check\b/i.test(first)) return 'ready-check';
  if (card.querySelector('select')) return 'loadout';
  if (/^lend a tradeskill$/i.test(first)) return 'lend';
  if (/^pre-raid prep$/i.test(first)) return 'prep';
  if (/^leaderboard\b/i.test(first)) return 'leaderboard';
  if (/^members$/i.test(first)) return 'members';
  if ([...card.querySelectorAll('button[title]')].filter(b => /,\s*the\s/i.test(b.title)).length >= 2) return 'boss';
  // The ready toggle, alone (a member) or beside "Start Raid (7)" (the leader).
  const buttons = [...card.querySelectorAll('button')];
  const toggles = buttons.filter(b => READY_LABEL.test(label(b.textContent)));
  if (toggles.length === 1 && buttons.every(b => toggles.includes(b) || /^start raid\b/i.test(label(b.textContent)))) return 'ready';
  return 'generic';
}

function decorateBoss(card) {
  const pills = [...card.querySelectorAll('button[title]')].filter(b => /,\s*the\s/i.test(b.title));
  role(pills[0]?.parentElement, 'boss-tabs');
  for (const pill of pills) {
    role(pill, 'boss-tab');
    mark(pill, 'data-iw-guild-state', selectedBy(pill, /(?:^|\s)bg-ember(?:\s|$)/) ? 'selected' : null);
  }
  const difficulties = [...card.querySelectorAll('button')].filter(b => !pills.includes(b) &&
    /\b(practice|normal|hard|heroic|mythic)\b/i.test(label(b.textContent)));
  role(difficulties[0]?.parentElement, 'difficulties');
  for (const button of difficulties) {
    role(button, 'difficulty');
    mark(button, 'data-iw-guild-state',
      selectedBy(button, /(?:^|\s)border-ember(?:\s|$)/) ? 'selected'
        : /🔒/u.test(button.textContent) || button.disabled ? 'locked' : null);
  }
  for (const p of card.querySelectorAll(':scope > p')) {
    const cls = String(p.className);
    if (/\bitalic\b/.test(cls)) role(p, 'lore');
    else if (/\btext-sm\b/.test(cls) && /\bfont-semibold\b/.test(cls)) role(p, 'boss-name');
    else { role(p, 'line'); tone(p); }
  }
  for (const box of card.querySelectorAll(':scope > div')) {
    if (box === pills[0]?.parentElement || box === difficulties[0]?.parentElement) continue;
    if (/\bborder\b/.test(String(box.className))) { role(box, 'notice'); tone(box); }
  }
}

function decorateLeaderboard(card) {
  role(card.querySelector(':scope > p'), 'card-title');
  for (const row of card.querySelectorAll('button')) {
    role(row, 'lb-row');
    const name = row.firstElementChild;
    mark(name, 'data-iw-guild-tone', selectedBy(name, /(?:^|\s)text-ember(?:\s|$)/) ? 'accent' : null);
  }
}

/** READY badge, "Not ready", the online dot and the lend pill appear in both
 *  the member rows and the guest rows. */
function decorateRosterRow(row) {
  for (const el of row.querySelectorAll('span, div')) {
    const text = label(el.textContent);
    const cls = String(el.className || '');
    if (!el.childElementCount && /^ready$/i.test(text)) { role(el, 'ready-badge'); tone(el); }
    else if (!el.childElementCount && /^not ready$/i.test(text)) role(el, 'not-ready');
    else if (!el.childElementCount && !text && /\brounded-full\b/.test(cls) && /\bh-1\.5\b/.test(cls)) {
      role(el, 'dot');
      mark(el, 'data-iw-guild-state', toneOf(el) === 'good' ? 'online' : null);
    } else if (/guild points/i.test(el.title)) role(el, 'points');
    else if (/skill level/i.test(el.title)) { role(el, 'chip'); tone(el); }
    else if (el.tagName === 'DIV' && /\bborder-sky-/.test(cls) && /\brounded-lg\b/.test(cls)) role(el, 'lend-pill');
  }
  // A guest sees one control per row (the name). A leader also gets the
  // lend-skill picker (the sky button, the static pill's interactive twin;
  // its open menu's options follow it in the same `.relative` box) and "✕".
  for (const button of row.querySelectorAll('button')) {
    const picker = button.closest('.relative')?.querySelector('button');
    if (/^kick\b/i.test(button.title)) role(button, 'kick');
    else if (picker && picker !== button) {
      role(button, 'option');
      mark(button, 'data-iw-guild-state', toneOf(button) === 'info' || button.getAttribute('aria-selected') === 'true' ? 'selected' : null);
    } else if (/\bborder-sky-/.test(String(button.className))) role(button, 'picker');
    else role(button, 'member-name');
  }
}

function decorateMembers(card) {
  const head = card.querySelector(':scope > div');
  role(head, 'card-head');
  role(head?.querySelector('p'), 'card-title');
  for (const p of head ? head.querySelectorAll('p') : []) if (p !== head.querySelector('p')) role(p, 'card-count');
  for (const row of card.querySelectorAll('div')) {
    // A roster row: its own name button and nothing that is itself a row.
    const cls = String(row.className || '');
    if (!/\brounded-lg\b/.test(cls) || !row.querySelector('button')) continue;
    if (row.parentElement?.closest('[data-iw-guild-role="member"], [data-iw-guild-role="guest"]')) continue;
    const guest = /\bbg-sky-/.test(cls);
    role(row, guest ? 'guest' : 'member');
    decorateRosterRow(row);
  }
  for (const p of card.querySelectorAll('p')) {
    // "Raid guests (2/7)" in a guild; "Group (1/8)" in a pickup group (live, 2026-10-08).
    if (/^(?:raid guests\b|group\s*\(\d+\/\d+\))/i.test(label(p.textContent))) {
      role(p, 'subhead');
      role(p.parentElement !== card ? p.parentElement : null, 'guests');
    }
  }
}

function decorateLend(card) {
  role(card.querySelector(':scope > p'), 'card-title');
  const buttons = [...card.querySelectorAll('button')];
  role(buttons[0], 'picker');
  // The open menu (absent from the snapshots): every further control in the
  // card is one of its options.
  for (const option of buttons.slice(1)) {
    role(option, 'option');
    mark(option, 'data-iw-guild-state', toneOf(option) === 'info' || option.getAttribute('aria-selected') === 'true' ? 'selected' : null);
  }
}

function decoratePrep(card) {
  role(card.querySelector(':scope > p'), 'card-title');
  for (const p of card.querySelectorAll(':scope > p')) if (toneOf(p)) { role(p, 'line'); tone(p); }
  for (const button of card.querySelectorAll('button')) {
    role(button, 'drink');
    role(button.parentElement !== card ? button.parentElement : null, 'potion');
  }
}

function decorateLoadout(card) {
  role(card.querySelector(':scope > p'), 'card-title');
  role(card.querySelector('select'), 'select');
  for (const button of card.querySelectorAll('button')) role(button, 'cta');
}

function decorateReady(card) {
  for (const button of card.querySelectorAll('button')) {
    if (!READY_LABEL.test(label(button.textContent))) { role(button, 'start'); continue; }
    role(button, 'ready-toggle');
    mark(button, 'data-iw-guild-state', toneOf(button) === 'good' ? 'ready' : null);
  }
  for (const p of card.querySelectorAll(':scope > p')) role(p, 'note');
}

/** Invite Player / Invite a Raid Guest (title · "7/12" count, note) and
 *  Create a Guild (title only): one field and its submit. */
function decorateForm(card) {
  const field = card.querySelector('input, textarea');
  const head = card.querySelector(':scope > div:first-child');
  if (head && !head.contains(field)) {
    role(head, 'card-head');
    role(head.querySelector('p'), 'card-title');
    for (const span of head.querySelectorAll(':scope > span')) role(span, 'card-count');
  } else role(card.querySelector(':scope > p'), 'card-title');
  for (const p of card.querySelectorAll(':scope > p')) if (!p.hasAttribute(ROLE)) role(p, 'note');
  role(field, 'field');
  const composer = [...card.querySelectorAll(':scope > div')].find(div => div.contains(field) && div.querySelector('button'));
  role(composer, 'composer');
  for (const button of composer ? composer.querySelectorAll('button') : []) role(button, 'cta');
}

function decoratePickup(card) {
  const ps = card.querySelectorAll('p');
  role(ps[0], 'card-title');
  for (const p of [...ps].slice(1)) role(p, 'note');
  for (const button of card.querySelectorAll('button')) role(button, 'cta');
}

/** "All Guilds" / "Find a Guild": a disclosure head, then (open) a note and
 *  the ranked list. Apply keeps the game's tone: it is the one action here. */
function decorateDirectory(card) {
  const toggle = card.querySelector(':scope > button');
  role(toggle, 'disclosure');
  role(toggle?.querySelector('p'), 'card-title');
  for (const span of toggle ? toggle.querySelectorAll(':scope > span') : []) role(span, 'disclosure-hint');
  for (const p of card.querySelectorAll(':scope > p')) role(p, 'note');
  const list = [...card.querySelectorAll(':scope > div')].find(div => /\boverflow-y-auto\b/.test(String(div.className)));
  role(list, 'directory');
  for (const row of list ? list.children : []) {
    role(row, 'guild-row');
    // The row's own class list grows when it is opened to show its members.
    mark(row, 'data-iw-guild-state', /\S\s+\S/.test(String(row.className).trim()) || row.children.length > 1 ? 'open' : null);
    const line = row.firstElementChild;
    for (const button of line ? line.querySelectorAll(':scope > button') : []) {
      if (button.querySelector('span')) role(button, 'guild-name');
      else { role(button, 'apply'); tone(button); }
    }
    for (const span of line ? line.querySelectorAll(':scope > span') : []) {
      role(span, /guild points/i.test(span.title) ? 'points' : 'capacity');
    }
  }
}

function decorateReadyCheck(card) {
  mark(card, 'data-iw-guild-tone', toneOf(card) || 'warn');
  const head = card.querySelector(':scope > div');
  role(head, 'card-head');
  role(head?.querySelector('p'), 'rc-title');
  role(head?.querySelector('span'), 'rc-timer');
  for (const p of card.querySelectorAll(':scope > p')) role(p, 'rc-roster');
  for (const el of card.querySelectorAll(':scope > div:not(:first-child) span')) tone(el);
  // Accept / decline while the check is open: keep the game's own tone.
  for (const button of card.querySelectorAll('button')) { role(button, 'rc-action'); tone(button); }
}

function decorateChat(card) {
  role(card.querySelector(':scope > p'), 'card-title');
  for (const p of card.querySelectorAll(':scope > p')) if (p !== card.querySelector(':scope > p')) role(p, 'note');
  const input = card.querySelector('input, textarea');
  role(input, 'chat-input');
  const composer = input?.parentElement !== card ? input?.parentElement : null;
  role(composer, 'composer');
  for (const button of composer ? composer.querySelectorAll('button') : []) role(button, 'cta');
  for (const box of card.querySelectorAll(':scope > div')) {
    if (box !== composer && /\boverflow-y-auto\b/.test(String(box.className))) role(box, 'chat-feed');
  }
}

const DECORATORS = {
  boss: decorateBoss,
  leaderboard: decorateLeaderboard,
  members: decorateMembers,
  lend: decorateLend,
  prep: decoratePrep,
  loadout: decorateLoadout,
  ready: decorateReady,
  'ready-check': decorateReadyCheck,
  chat: decorateChat,
  form: decorateForm,
  pickup: decoratePickup,
  directory: decorateDirectory,
};

/* ----------------------------------------------------------- the fight -- */

/** A track whose only child is a `width: N%` fill. */
function isTrack(el) {
  const fill = el.children.length === 1 ? el.firstElementChild : null;
  return !!fill && /%$/.test(String(fill.style?.width || ''));
}

function decorateArena(arena) {
  role(arena, 'arena');
  reconcileAshmawScene(arena);
  reconcileThessalyScene(arena);
  reconcileMorwennaScene(arena);
  reconcileGrimjawScene(arena);
  reconcileSkarthScene(arena);
  const boss=arena.querySelector('img[src*="boss-"],img[alt^="Ashmaw"],img[alt^="Thessaly"],img[alt^="Morwenna"],img[alt^="Grimjaw"],img[alt^="Skarth"]');
  if(boss?.parentElement?.parentElement!==arena)role(boss?.parentElement?.parentElement,'boss-summary');
  for (const panel of arena.querySelectorAll('.raid-readable-panel')) {
    // The log, collapsed (a <button>) or expanded (a <div> holding the game's
    // '.txt' and Close buttons, which read as a second Raid skills panel when
    // keyed on the tag): the only readable panel inside a wrapper.
    if (panel.tagName === 'BUTTON' || (panel.parentElement !== arena && panel.parentElement?.parentElement === arena)) {
      role(panel, 'combat-log');
      // React owns the live log wrapper. Place it without moving its button.
      if (panel.parentElement !== arena && panel.parentElement?.parentElement === arena) role(panel.parentElement, 'combat-log-region');
      continue;
    }
    // RaidHud appends its own phone fold control here; it is not the game's toggle.
    const gameButtons = panel.querySelectorAll('button:not([data-iw-raid-owned])');
    role(panel, gameButtons.length ? 'effects' : 'telegraph');
    tone(panel, gameButtons.length ? 'info' : toneOf(panel));
    for (const button of gameButtons) role(button, 'effects-toggle');
  }
  for (const track of arena.querySelectorAll('div')) {
    if (!isTrack(track) || track.closest('.raid-arena-floor')) continue;
    role(track, 'boss-hp');
  }
  // TESTING FEATURE: tops the party up with dummy frames while the head-row
  // "🧪 Test: full party" toggle is on. Before the sweep, so they are tagged too.
  syncPartyPreview(arena);
  for (const raider of arena.querySelectorAll('.raid-arena-floor > button, .raid-arena-floor > div')) {
    role(raider, 'raider');
    const tracks = [...raider.querySelectorAll(':scope > div')].filter(isTrack);
    role(tracks[0], 'raider-hp');
    role(tracks[1], 'raider-charge');
    const plates = raider.querySelectorAll(':scope > p');
    role(plates[0], 'raider-name');
    role(plates[1], 'raider-skill');
  }
  for (const p of arena.querySelectorAll(':scope > p')) role(p, 'status');
  // The fight's own controls (Attack + the lent skill) and its result card
  // ("💀 Wipe." + Close). Untagged, both fell into an empty grid cell of the
  // HUD layout and stretched to fill it.
  for (const box of arena.querySelectorAll(':scope > div:not(.raid-arena-floor):not([data-iw-raid-owned])')) {
    const current = box.getAttribute(ROLE);
    if (current && current !== 'actions' && current !== 'outcome') continue;
    if (box.matches('[data-iw-ashmaw-art], [data-iw-thessaly-art], [data-iw-morwenna-art], [data-iw-grimjaw-art], [data-iw-skarth-art]')) continue;
    const kids = [...box.children];
    if (kids.length && kids.every(k => k.tagName === 'BUTTON')) {
      role(box, 'actions');
      tone(box, null);
      for (const button of kids) role(button, 'action');
    } else if (box.querySelector(':scope > p')) {
      role(box, 'outcome');
      tone(box);
      for (const button of box.querySelectorAll(':scope > button')) role(button, 'outcome-close');
    }
  }
  // Last: it reads every role tagged above (RaidHud.js).
  decorateRaidHud(arena);
}

/* ----------------------------------------------------------- lifecycle -- */

const signatures = new WeakMap();

/**
 * Decorate one resolved Guild panel. Called every `iw:dom-flush` by
 * UIFoundation.classifyGuildPanels. The per-card work is skipped while a
 * card's text and its controls' classes are unchanged — the chat card alone
 * carries ~100 lines, and nothing in it changes between messages.
 */
export function decorateGuildPanel({ root, heading }) {
  pruneAshmawScenes();
  pruneThessalyScenes();
  pruneMorwennaScenes();
  pruneGrimjawScenes();
  pruneSkarthScenes();
  mark(root, 'data-iw-guild', 'root');
  decorateHead(root, heading);
  for (const card of root.querySelectorAll('.compact-panel')) {
    if (card.querySelector('.compact-panel')) continue;
    // Text AND the controls' classes: a selection flip (bg-white/5 -> bg-ember)
    // changes no text at all.
    const sig = `${card.textContent}\u0000${[...card.querySelectorAll('button, span, div[class*="border"]')].map(el => el.className).join('|')}`;
    if (signatures.get(card) === sig && card.hasAttribute('data-iw-guild-card')) continue;
    signatures.set(card, sig);
    const kind = cardKind(card);
    mark(card, 'data-iw-guild-card', kind);
    DECORATORS[kind]?.(card);
  }
  for (const arena of root.querySelectorAll('.raid-battle-backdrop')) decorateArena(arena);
  pruneRaidDocks(root);
  // Last: it reads the card kinds tagged above (layout slots, records, the
  // ready-check pop-up).
  decorateGuildLobby(root);
}

export function clearGuildPanel(root) {
  if (!root) return;
  clearAshmawScenes(root);
  clearThessalyScenes(root);
  clearMorwennaScenes(root);
  clearGrimjawScenes(root);
  clearSkarthScenes(root);
  clearRaidPartyPreview(root); // TESTING FEATURE
  clearRaidHud(root);
  clearGuildLobby(root);
  for (const attr of ATTRS) {
    if (root.hasAttribute?.(attr)) root.removeAttribute(attr);
    root.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr));
  }
}
