/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * RaidBossCard.js — the raid lobby's boss card as something you scan rather
 * than read (Curtis, 2026-10-08).
 *
 *   - A hero band behind the boss's name and lore: the upper band of the
 *     boss's own arena painting (where it stands), with its raid-HUD headshot
 *     medallion beside the name. Art: assets/raids/lobby/, derived by
 *     build-tools/build-raid-lobby-art.py.
 *   - The stat line becomes chips: ATK, DEF, HP, the element, its abilities.
 *   - The requirement sentence becomes two tiles: the real requirement (to
 *     join) and the resist, labelled "Recommended" in the advice colour so
 *     it does not read as a gate. The Jewelcrafting-lend clause is dropped
 *     on purpose (Curtis, 2026-10-08); it stays in the tile's title.
 *   - The game's one generic tip is replaced by the skin's own per-boss
 *     "Recommended Team Loadout" (role counts) and a tip naming the boss's
 *     signature threat and its counter (TACTICS below; Curtis, 2026-10-08).
 *   - The weekly-loot notice (its "claimed" and "available" templates only)
 *     becomes a status bar: the state, the rule, the countdown and the
 *     reset time. Its countdown is a text tick, so it also refreshes on
 *     iw:text-flush (refreshBossCardText). Every other notice (locks, test
 *     guild, coming soon) stays the game's.
 *
 * The three source lines are the game's (chunk 8577), built from one template
 * for every boss:
 *
 *   "ATK <span>2,750</span> • DEF 450 • HP <span>21,000</span> • 🔥 fire-based
 *    abilities (single-target, AOE, curse, burning)"
 *   "Requires Combat 50+ to join. Wants 60 fire resist total to mitigate most
 *    fire damage — a level 70 Jewelcrafting lend covers 26 of that, bring the
 *    rest on gear."
 *   "Tip: bring a tank (Combat lend → Challenge) …" (one fixed string)
 *
 * A line is hidden (`data-iw-boss-card-src`, display: none) ONLY when it
 * parsed completely, and every owned tile carries its source sentence as a
 * title, so no information is lost. A line that does not parse stays the
 * game's, as it was. Rule 5: the game colours ATK and HP rose on Hard and
 * emerald on Practice; the chips carry that tone.
 *
 * Nothing is moved (rule 2). The card becomes a one-column grid in guild.css;
 * the art (an owned node) shares the name/lore/stat rows behind them. Owned
 * nodes are `data-iw-boss-card-owned`; the card's boss key is
 * `data-iw-boss-card` — this module's own namespace (GuildPanels owns
 * `data-iw-guild-*`, GuildLobby `data-iw-guild-slot`).
 */

import { bossKeyOf } from './RaidLeaderboards.js';

const OWNED = 'data-iw-boss-card-owned';
const CARD = 'data-iw-boss-card';
const SRC = 'data-iw-boss-card-src';
const ATTRS = [CARD, SRC];
const BOSSES = new Set(['ashmaw', 'thessaly', 'morwenna', 'grimjaw', 'skarth']);

const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
const cap = value => value ? value[0].toUpperCase() + value.slice(1) : value;

const STATS = /^ATK ([\d,]+) • DEF ([\d,]+) • HP ([\d,]+) • (\S+) ([\p{L}]+)-based abilities \(([^)]+)\)$/u;
const REQ = /^Requires Combat (\d+)\+ to join\. Wants (\d+) ([\p{L}]+) resist total to mitigate most ([\p{L}]+) damage — a level (\d+) ([\p{L}]+) lend covers (\d+) of that, bring the rest on gear\.$/u;
const CLAIMED = /^✅ You['’]ve claimed (.+?)['’]s loot this week\. You can keep raiding it for leaderboard times, but it won['’]t drop loot for you again until the weekly reset in ([^.]+)\.\s*Weekly reset: (.+?), same time for everyone\.$/u;
const AVAILABLE = /^🎁 Loot available this week\. Your first (.+?) clear on Normal or Hard rolls loot for everyone in the group, alive or not\. After that it['’]s claimed until the weekly reset in ([^.]+)\.\s*Weekly reset: (.+?), same time for everyone\.$/u;
const TIP = 'Tip: bring a tank (Combat lend → Challenge) so the big single hits land on them, plus healers and Cleanse. Fortify (Smithing) makes tanking much safer.';

/*
 * Per-boss loadout and tip. The loadouts are Curtis's (Ashmaw's 1/2/2/3 is
 * the base; Grimjaw takes a second tank, Morwenna a third support). Every
 * mechanic in a tip is the game's own ability/skill text (chunk 9811,
 * 2026-10-08): AOEs "only Ward mitigates"; Veil dodges the heavy
 * single-target hit; Cleanse is the only cure for curses, DoT stacks and
 * Soulrend Mark; Soul Anchor kills a tank at 2 stacks. A tip is an array of
 * [text, bold?] runs.
 */
const TACTICS = {
  ashmaw: { roles: [1, 2, 2, 3], tip: [['Watch out for '], ['Cinderstorm', 1], [': only '], ['Ward', 1], [' mitigates it, boosting resistances raid-wide. '], ['Veil', 1], [' helps dodge '], ['Claw Rake', 1], ['.']] },
  thessaly: { roles: [1, 2, 2, 3], tip: [['Watch out for '], ['Stormsurge', 1], [': it hits harder the more max HP you have. '], ['Ward', 1], [' boosts lightning resist raid-wide; '], ['Cleanse', 1], [' Voltaic Wound before it jumps.']] },
  morwenna: { roles: [1, 2, 3, 2], tip: [['Watch out for '], ['Soulrend Mark', 1], [': '], ['Cleanse', 1], [' it before it expires, or the marked raider dies and the raid takes 35% of max HP. Only '], ['Ward', 1], [' mitigates Hollow Wave.']] },
  grimjaw: { roles: [2, 2, 2, 2], tip: [['Watch out for '], ['Soul Anchor', 1], [': 2 stacks kill the tank outright, so swap '], ['Challenge', 1], [' to the second tank before it reapplies. Only '], ['Ward', 1], [' mitigates Absolute Zero.']] },
  skarth: { roles: [1, 2, 2, 3], tip: [['Watch out for '], ['Blizzard', 1], [': only '], ['Ward', 1], [' mitigates it. '], ['Cleanse', 1], [' Frostbite before it runs out, or it jumps to another raider.']] },
};
const ROLES = [['Tank', 'Tanks', 'combat', null], ['Healer', 'Healers', 'spellcrafting', null], ['Support', 'Support', 'jewelcrafting', null], ['DPS', 'DPS', null, '⚔']];

const sigs = new WeakMap();
let lastCard = null;

function mark(el, key, value) {
  if (!el) return;
  if (value == null) { if (el.hasAttribute(key)) el.removeAttribute(key); return; }
  if (el.getAttribute(key) !== value) el.setAttribute(key, value);
}

function own(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.setAttribute(OWNED, '1');
  if (text != null) el.textContent = text;
  return el;
}

/** The difficulty colour the game gave ATK / HP: rose on Hard, emerald on Practice. */
function toneOf(span) {
  const cls = String(span?.className || '');
  if (/(?:^|\s)text-(?:rose|red)-/.test(cls)) return 'hard';
  if (/(?:^|\s)text-(?:emerald|green)-/.test(cls)) return 'easy';
  return null;
}

function icon(skill) {
  const el = own('span', 'iw-bc-icon');
  el.setAttribute('aria-hidden', 'true');
  el.dataset.iwBcSkill = skill;
  return el;
}

/** A skill icon when the kit has one, else the given glyph. */
function badge(skill, glyph) {
  if (skill) return icon(skill);
  const el = own('span', 'iw-bc-glyph', glyph);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function chip(labelText, value, tone) {
  const el = own('span', 'iw-bc-stat');
  const v = own('b', 'iw-bc-stat-value', value);
  if (tone) v.dataset.iwBcTone = tone;
  el.append(own('span', 'iw-bc-stat-label', labelText), v);
  return el;
}

function tile({ skill, glyph, labelText, value, sub, title, kind }) {
  const el = own('div', 'iw-bc-tile');
  el.title = title;
  if (kind) el.dataset.iwBcKind = kind;
  el.append(badge(skill, glyph));
  const body = own('div', 'iw-bc-tile-body');
  body.append(own('span', 'iw-bc-tile-label', labelText), own('span', 'iw-bc-tile-value', value));
  if (sub) body.append(own('span', 'iw-bc-tile-sub', sub));
  el.append(body);
  return el;
}

/* -------------------------------------------------------------- parsing -- */

function readLines(card) {
  const out = { stats: null, req: null, tip: null, notice: null };
  for (const div of card.querySelectorAll(':scope > div[data-iw-guild-role="notice"]')) {
    const text = norm(div.textContent);
    if (CLAIMED.test(text) || AVAILABLE.test(text)) { out.notice = div; break; }
  }
  for (const p of card.querySelectorAll(':scope > p')) {
    const text = norm(p.textContent);
    if (!out.stats && /^ATK\b/.test(text)) out.stats = p;
    else if (!out.req && /^Requires Combat\b/.test(text)) out.req = p;
    else if (!out.tip && /^Tip:/.test(text)) out.tip = p;
  }
  return out;
}

function buildStats(p) {
  const m = p && STATS.exec(norm(p.textContent));
  if (!m) return null;
  const [, atk, def, hp, glyph, element, abilities] = m;
  const spans = p.querySelectorAll(':scope > span');
  const strip = own('div', 'iw-bc-stats');
  strip.title = norm(p.textContent);
  strip.append(chip('ATK', atk, toneOf(spans[0])), chip('DEF', def), chip('HP', hp, toneOf(spans[1])));
  const kind = own('span', 'iw-bc-element');
  kind.append(own('b', 'iw-bc-element-name', `${glyph} ${cap(element)}`),
    own('span', 'iw-bc-element-list', abilities.split(/\s*,\s*/).join(' · ')));
  strip.append(kind);
  return strip;
}

function buildRequirements(p, glyph) {
  const m = p && REQ.exec(norm(p.textContent));
  if (!m) return null;
  const [, combat, resist, element] = m;
  const sentence = norm(p.textContent);
  const row = own('div', 'iw-bc-tiles');
  row.append(
    tile({ skill: 'combat', labelText: 'To join', value: `Combat ${combat}+`, title: sentence }),
    tile({ glyph: glyph || '🛡️', labelText: 'Recommended', value: `${resist} ${cap(element)} resist`,
      sub: `mitigates most ${element} damage`, title: sentence, kind: 'advice' }),
  );
  return row;
}

function buildTactics(p, key) {
  const plan = TACTICS[key];
  if (!p || !plan || norm(p.textContent) !== TIP) return null;
  const box = own('div', 'iw-bc-tactics');
  box.title = TIP; // the game's own generic tip, still on hover
  box.append(own('span', 'iw-bc-tactics-label', `${cap(key)}: Recommended Team Loadout`));
  const roles = own('div', 'iw-bc-roles');
  ROLES.forEach(([one, many, skill, glyph], i) => {
    const n = plan.roles[i];
    const el = own('span', 'iw-bc-role');
    el.append(badge(skill, glyph), own('b', 'iw-bc-role-count', String(n)), own('span', null, n === 1 ? one : many));
    roles.append(el);
  });
  const tip = own('p', 'iw-bc-tip');
  tip.append(own('b', 'iw-bc-tip-label', 'Tip:'), ' ', ...plan.tip.map(([text, bold]) => (bold ? own('b', null, text) : text)));
  box.append(roles, tip);
  return box;
}

function buildLoot(div) {
  const text = div && norm(div.textContent);
  const claimed = text && CLAIMED.exec(text);
  const open = !claimed && text && AVAILABLE.exec(text);
  if (!claimed && !open) return null;
  const [, , countdown, reset] = claimed || open;
  const bar = own('div', 'iw-bc-loot');
  bar.title = text;
  bar.dataset.iwBcLoot = claimed ? 'claimed' : 'available';
  const tone = div.getAttribute('data-iw-guild-tone');
  if (tone) bar.dataset.iwBcTone = tone;
  const when = own('span', 'iw-bc-loot-when');
  when.append(own('span', 'iw-bc-loot-label', claimed ? 'Loot again in' : 'Resets in'),
    own('b', 'iw-bc-loot-count', countdown), own('span', 'iw-bc-loot-reset', `${reset}, same for everyone`));
  bar.append(
    own('span', 'iw-bc-loot-state', claimed ? '✅ Loot claimed this week' : '🎁 Loot available this week'),
    own('span', 'iw-bc-loot-rule', claimed
      ? 'Repeat runs count for leaderboard times only, no loot.'
      : `Your first ${open[1]} clear on Normal or Hard rolls loot for the whole group, alive or not.`),
    when,
  );
  return bar;
}

/* ------------------------------------------------------------- placing -- */

/** Keep `node` directly after `anchor`; only touches the DOM when it is not. */
function place(anchor, node) {
  if (anchor.nextElementSibling !== node) anchor.after(node);
}

function setPart(card, cls, anchor, node, src, srcKey) {
  const old = card.querySelector(`:scope > .${cls}[${OWNED}]`);
  if (!node) {
    old?.remove();
    mark(src, SRC, null);
    return;
  }
  if (old) old.replaceWith(node);
  place(anchor, node);
  mark(src, SRC, srcKey);
}

function ensureArt(card, name, key) {
  let art = card.querySelector(`:scope > .iw-bc-art[${OWNED}]`);
  if (!art) {
    art = own('div', 'iw-bc-art');
    art.setAttribute('aria-hidden', 'true');
    art.append(own('span', 'iw-bc-portrait'));
  }
  if (art.dataset.iwBcBoss !== key) art.dataset.iwBcBoss = key;
  // Directly before the name: in the grid it is placed explicitly, so DOM
  // position only keeps it out of the way of the game's own siblings.
  if (name.previousElementSibling !== art) name.before(art);
}

/* -------------------------------------------------------------- public -- */

/** Every Guild pass (GuildLobby.decorateGuildLobby). */
export function decorateBossCard(root) {
  const card = root?.querySelector('[data-iw-guild-card="boss"]');
  if (card) decorateCard(card);
}

/** Text-only ticks (the loot countdown) never reach the full pass. */
export function refreshBossCardText(parents) {
  if (!lastCard?.isConnected) return;
  for (const parent of parents) {
    if (parent && lastCard.contains(parent) && !parent.closest(`[${OWNED}]`)) { decorateCard(lastCard); return; }
  }
}

function decorateCard(card) {
  lastCard = card;
  const name = card.querySelector(':scope > [data-iw-guild-role="boss-name"]');
  const selected = card.querySelector('[data-iw-guild-role="boss-tab"][data-iw-guild-state="selected"]');
  const key = bossKeyOf(selected?.title || name?.textContent);
  if (!name || !BOSSES.has(key)) { clearBossCard(card); return; }

  const lines = readLines(card);
  const spans = lines.stats ? [...lines.stats.querySelectorAll(':scope > span')].map(s => s.className).join('|') : '';
  const sig = [key, norm(lines.stats?.textContent), spans, norm(lines.req?.textContent), norm(lines.tip?.textContent),
    norm(lines.notice?.textContent), lines.notice?.getAttribute('data-iw-guild-tone') || ''].join('\u0000');
  const owned = card.querySelectorAll(`:scope > [${OWNED}]`).length;
  if (sigs.get(card) === sig && owned && card.getAttribute(CARD) === key) {
    // Unchanged: only re-seat anything React's reconciliation displaced.
    const art = card.querySelector(`:scope > .iw-bc-art[${OWNED}]`);
    if (art && name.previousElementSibling !== art) name.before(art);
    for (const [cls, src] of [['iw-bc-stats', lines.stats], ['iw-bc-tiles', lines.req], ['iw-bc-tactics', lines.tip], ['iw-bc-loot', lines.notice]]) {
      const node = card.querySelector(`:scope > .${cls}[${OWNED}]`);
      if (node && src) place(src, node);
    }
    return;
  }
  sigs.set(card, sig);
  mark(card, CARD, key);
  ensureArt(card, name, key);
  setPart(card, 'iw-bc-stats', lines.stats, buildStats(lines.stats), lines.stats, 'stats');
  const glyph = STATS.exec(norm(lines.stats?.textContent))?.[4];
  setPart(card, 'iw-bc-tiles', lines.req, buildRequirements(lines.req, glyph), lines.req, 'req');
  setPart(card, 'iw-bc-tactics', lines.tip, buildTactics(lines.tip, key), lines.tip, 'tip');
  setPart(card, 'iw-bc-loot', lines.notice, buildLoot(lines.notice), lines.notice, 'notice');
  // A notice that stopped parsing (it became a lock, say) is shown again.
  for (const el of card.querySelectorAll(`:scope > [${SRC}="notice"]`)) if (el !== lines.notice) mark(el, SRC, null);
}

export function clearBossCard(root) {
  if (!root) return;
  if (lastCard && (root === lastCard || root.contains?.(lastCard))) lastCard = null;
  root.querySelectorAll(`[${OWNED}]`).forEach(node => node.remove());
  for (const attr of ATTRS) {
    if (root.hasAttribute?.(attr)) root.removeAttribute(attr);
    root.querySelectorAll(`[${attr}]`).forEach(node => node.removeAttribute(attr));
  }
}
