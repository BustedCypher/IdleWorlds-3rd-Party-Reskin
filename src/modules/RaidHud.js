/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * RaidHud.js — the live raid fight as a raid HUD (Ashen Iron raid UI kit v1,
 * assets/raids/ui-kit-v1; design approved 2026-10-06).
 *
 *   boss identity + ornate health shell + cast bar      (top left)
 *   the painting                                        (open middle)
 *   effect timers: buffs blue, debuffs red              (above the party)
 *   party frames, one per raider, with every effect     (low, centred)
 *   game caption + actions                              (bottom)
 *   combat log + raid skills, folded, after Raid Chat   (the dock)
 *
 * EVERYTHING IS READ FROM THE GAME'S OWN NODES (rule 5). GuildPanels tags the
 * roles; this module derives, per pass:
 *   - the boss name/epithet split from "🐉 Ashmaw, the Cinder Tyrant";
 *   - the boss HP percentage from the game's fill width;
 *   - the cast from "Claw Rake (single target) in 10s" (name, scope, seconds),
 *     with the countdown's maximum taken as the largest value seen for that
 *     attack name, because the DOM never states the wind-up;
 *   - each raider's skill (its lend line), HP percentage and HP tone (the
 *     game's fill colour: emerald / amber / rose), and its effects:
 *       personal ones from the raider's own titled status spans
 *       ("204 shield", "Tanking", "Cursed — reduced healing"),
 *       raid-wide ones from the Raid skills lines ("War Cry active … — 3s
 *       left", "Ward active … — 13s left"), which apply to every raider,
 *       and the tank's timer from "Noook is tanking (Challenge) — 21s left";
 *   - your raider from the game's own sky nameplate.
 * An effect the kit has no art for is still shown, with the game's own emoji
 * (README: "never hide behind +N").
 *
 * OWNED NODES. One `.iw-raid-fx` strip appended into each raider button and
 * one `.iw-raid-timers` row appended to the arena, plus one `.iw-raid-dock`
 * (combat log + Raid skills, see below) placed after the Raid Chat card, all marked
 * `data-iw-raid-owned`. A strip is rebuilt only when its derived signature
 * changes; a timer bar is updated in place (text, width, each compared) and
 * the row is rebuilt only when its set of timers changes. A settled fight
 * writes nothing; a ticking one rewrites only what a tick changed. (The
 * personal HUD that summarised your raider was removed on 2026-10-07: your
 * party frame never hides, so it only repeated it.) Every other mark is a `data-iw-raid-*`
 * attribute (outside DOMWatcher's filter) compared before writing.
 *
 * Nothing is moved (rule 2): the layout is CSS grid placement of the arena's
 * own children in guild.css ("Raid HUD").
 */

// TESTING FEATURE: test buffs/debuffs for the HUD (RaidPartyPreview.js).
import { previewEffects } from './RaidPartyPreview.js';

const norm = value =>String(value || '').replace(/\s+/g, ' ').trim();
const stripGlyph = value => norm(value).replace(/^[^\p{L}\p{N}]+/u, '');

const SKILLS = ['combat', 'jewelcrafting', 'tailoring', 'construction', 'mining', 'woodcutting', 'alchemy', 'gathering', 'smithing', 'spellcrafting'];
const SKILL_ALIASES = { herbalism: 'gathering', fishing: 'gathering', crafting: 'smithing' };

/** Raid-wide effect lines and the kit art for each, by the game's wording. */
const EFFECT_ART = [
  [/war\s*cry/i, 'war-cry', 'War Cry'],
  [/\bward\b/i, 'ward', 'Ward'],
  [/shield/i, 'shield', 'Shield'],
  [/tank|taunt|challenge/i, 'taunt', 'Tanking'],
  [/curse/i, 'curse', 'Cursed'],
  [/bleed|rend/i, 'bleed', 'Bleeding'],
];

const OWNED = 'data-iw-raid-owned';
const HUD_ATTRS = [
  'data-iw-raid-encounter',
  'data-iw-raid-hud', 'data-iw-raid-boss', 'data-iw-raid-epithet', 'data-iw-raid-pct',
  'data-iw-raid-cast', 'data-iw-raid-cast-name', 'data-iw-raid-cast-scope', 'data-iw-raid-cast-secs',
  'data-iw-raid-cast-urgency', 'data-iw-raid-cast-step', 'data-iw-raid-skill', 'data-iw-raid-hp',
  'data-iw-raid-frame', 'data-iw-raid-self', 'data-iw-raid-down', 'data-iw-raid-resist', 'data-iw-raid-resist-step',
  'data-iw-raid-fx-kind', 'data-iw-raid-scene-less', 'data-iw-raid-party', 'data-iw-raid-fold', 'data-iw-raid-timer',
  'data-iw-raid-result', 'data-iw-raid-result-glyph', 'data-iw-raid-result-word', 'data-iw-raid-result-boss',
];

const castMax = new Map();
const strips = new WeakMap();
const timerMax = new Map();
const timerSets = new WeakMap();
// Which dock panels are unfolded. Module state, so a React re-render of the
// arena keeps the reader's choice; it resets with the page, folded.
const folds = new Map();

function set(el, key, value) {
  if (!el) return;
  if (value == null || value === false) { if (el.hasAttribute(key)) el.removeAttribute(key); return; }
  const v = String(value);
  if (el.getAttribute(key) !== v) el.setAttribute(key, v);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.setAttribute(OWNED, '1');
  if (text != null) node.textContent = text;
  return node;
}

function percent(fill) {
  const w = parseFloat(fill?.style?.width);
  return Number.isFinite(w) ? Math.max(0, Math.min(100, Math.round(w))) : null;
}

function fillTone(fill) {
  const cls = String(fill?.className || '');
  if (/(?:^|\s)bg-(?:rose|red)-/.test(cls)) return 'bad';
  if (/(?:^|\s)bg-(?:amber|yellow|orange)-/.test(cls)) return 'warn';
  return 'good';
}

function skillKey(text) {
  const t = stripGlyph(text).toLowerCase();
  for (const key of SKILLS) if (t.startsWith(key)) return key;
  for (const [alias, key] of Object.entries(SKILL_ALIASES)) if (t.startsWith(alias)) return key;
  return null;
}

function artFor(text) {
  for (const [re, art, name] of EFFECT_ART) if (re.test(text)) return { art, name };
  return null;
}

/** Leading emoji run of a game line ("⛏️ War Cry …" -> "⛏️"). */
function glyphOf(text) {
  const m = /^[^\p{L}\p{N}]+/u.exec(norm(text));
  return m ? m[0].trim() : '';
}

/* ------------------------------------------------------------- boss -- */

function decorateBoss(arena) {
  const summary = arena.querySelector('[data-iw-guild-role="boss-summary"]');
  if (!summary) { set(arena, 'data-iw-raid-encounter', null); return; }
  const nameEl = summary.querySelector('.font-semibold') || summary.querySelector('span');
  if (nameEl) {
    const raw = stripGlyph(nameEl.textContent);
    const comma = raw.indexOf(',');
    const boss = (comma > 0 ? raw.slice(0, comma) : raw).trim().toLowerCase();
    // Native identity is available before the asynchronous arena painting.
    // Never borrow the previous scene's headshot during an encounter change.
    set(arena, 'data-iw-raid-encounter', ['ashmaw', 'thessaly', 'morwenna', 'grimjaw', 'skarth'].includes(boss) ? boss : null);
    set(nameEl, 'data-iw-raid-boss', comma > 0 ? raw.slice(0, comma).trim() : raw);
    set(nameEl, 'data-iw-raid-epithet', comma > 0 ? raw.slice(comma + 1).trim() : '');
  } else set(arena, 'data-iw-raid-encounter', null);
  const fill = summary.querySelector('[data-iw-guild-role="boss-hp"] > *');
  const text = [...summary.querySelectorAll(':scope > p')].find(p => /hp/i.test(p.textContent));
  const pct = percent(fill);
  set(text, 'data-iw-raid-pct', pct == null ? null : `${pct}%`);
}

/* ----------------------------------------------------------- result -- */

/**
 * The fight's result card ("🏆 Victory! Ashmaw, the Cinder Tyrant." /
 * "💀 Wipe. …", game source chunk 7027) as a banner: the headline is split
 * into the game's glyph, its word and the boss, which guild.css draws as a
 * medallion, a large gilded word and a subtitle. The game's text stays in
 * the DOM (the <p> only sets font-size 0). Victory or wipe comes from the
 * card's own colour classes, already read into data-iw-guild-tone (rule 5).
 * A headline this does not parse keeps the plain framed card.
 */
function decorateOutcome(arena) {
  const card = arena.querySelector(':scope > [data-iw-guild-role="outcome"]');
  if (!card) return;
  const head = card.querySelector(':scope > p');
  const m = /^([^\p{L}\p{N}]*)([\p{L}][^.!]*)[.!]\s*(.*?)\.?$/u.exec(norm(head?.textContent));
  const tone = card.getAttribute('data-iw-guild-tone');
  const kind = !m ? null : tone === 'good' ? 'victory' : tone === 'bad' ? 'wipe' : 'other';
  set(card, 'data-iw-raid-result', kind);
  set(card, 'data-iw-raid-result-glyph', m ? m[1].trim() || null : null); // the medallion is the card's ::after
  set(head, 'data-iw-raid-result-word', m ? m[2].trim() : null);
  set(head, 'data-iw-raid-result-boss', m ? m[3].trim() || null : null);
}

/* ------------------------------------------------------------- cast -- */

function decorateCast(arena) {
  const tg = arena.querySelector('[data-iw-guild-role="telegraph"]');
  if (!tg) return;
  const text = norm(tg.textContent);
  const m = /^(.+?)\s*(?:\(([^)]*)\))?\s+in\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?\.?$/i.exec(text);
  if (!m) {
    // A telegraph the pattern does not know keeps the game's own words.
    for (const key of ['data-iw-raid-cast', 'data-iw-raid-cast-name', 'data-iw-raid-cast-scope', 'data-iw-raid-cast-secs', 'data-iw-raid-cast-urgency', 'data-iw-raid-cast-step']) set(tg, key, null);
    return;
  }
  const name = m[1].trim();
  const secs = Number(m[3]);
  const max = Math.max(secs, castMax.get(name) || 0);
  castMax.set(name, max);
  set(tg, 'data-iw-raid-cast', '1');
  set(tg, 'data-iw-raid-cast-name', name);
  set(tg, 'data-iw-raid-cast-scope', m[2] ? m[2].replace(/^./, c => c.toUpperCase()) : '');
  set(tg, 'data-iw-raid-cast-secs', `${Number.isInteger(secs) ? secs : secs.toFixed(1)}s`);
  set(tg, 'data-iw-raid-cast-urgency', secs <= 2 ? 'now' : secs <= 5 ? 'near' : 'calm');
  set(tg, 'data-iw-raid-cast-step', String(max > 0 ? Math.round(10 * secs / max) : 10));
}

/* ---------------------------------------------------------- effects -- */

/** Raid-wide effects from the Raid skills panel, plus the named tank. */
function readRaidEffects(arena) {
  const shared = [];
  let tank = null;
  let resist = null;
  for (const line of arena.querySelectorAll('[data-iw-guild-role="effects"] > div')) {
    // "(who has what?)" opened: the lenders' list, one <p> per raider ("X —
    // War Cry: Unlocks …"). It names effects, it is not one: read as a line,
    // it put a second War Cry chip on every standing raider.
    if (line.querySelector(':scope > p')) { set(line, 'data-iw-raid-fx-kind', null); continue; }
    const text = norm(line.textContent);
    const left = /(\d+)\s*s\s*left/i.exec(text);
    const tanking = /^\W*(.+?)\s+is\s+tanking\b/i.exec(text);
    const res = /=\s*(\d+)\s*\/\s*(\d+)\s*needed/i.exec(text);
    if (res) {
      resist = { have: +res[1], need: +res[2], glyph: glyphOf(text) };
      set(line, 'data-iw-raid-fx-kind', 'resist');
      set(line, 'data-iw-raid-resist', `${res[1]} / ${res[2]}`);
      set(line, 'data-iw-raid-resist-step', String(Math.min(10, Math.round(10 * res[1] / Math.max(1, res[2])))));
      continue;
    }
    if (tanking) {
      tank = { name: tanking[1].trim(), secs: left ? `${left[1]}s` : '' };
      set(line, 'data-iw-raid-fx-kind', 'taunt');
      continue;
    }
    const art = artFor(text);
    set(line, 'data-iw-raid-fx-kind', art ? art.art : 'other');
    shared.push({ art: art?.art || null, name: art?.name || stripGlyph(text).replace(/\s+active\b.*$/i, ''), glyph: glyphOf(text), value: left ? `${left[1]}s` : '', title: text });
  }
  return { shared, tank, resist };
}

/** One raider's own effects, from the game's titled status spans. */
function readOwnEffects(raider) {
  const own = [];
  for (const span of raider.querySelectorAll('[title]')) {
    if (span.closest(`[${OWNED}]`)) continue;
    const title = norm(span.title);
    const art = artFor(title);
    const num = /^(\d[\d,]*)\s+/.exec(title);
    own.push({ art: art?.art || null, name: art?.name || title, glyph: norm(span.textContent), value: art?.art === 'shield' && num ? num[1] : '', title });
  }
  return own;
}

function chip(effect, withLabel) {
  const node = el('span', 'iw-raid-chip');
  if (effect.art) node.dataset.iwRaidArt = effect.art;
  if (effect.tone) node.dataset.iwRaidTone = effect.tone;
  node.title = effect.title || effect.name;
  node.setAttribute('aria-label', `${effect.name}${effect.value ? ` ${effect.value}` : ''}`);
  const icon = el('i', 'iw-raid-chip-icon', effect.art ? null : (effect.glyph || '•'));
  icon.setAttribute('aria-hidden', 'true');
  node.append(icon);
  if (withLabel) node.append(el('span', 'iw-raid-chip-name', effect.name));
  if (effect.value) node.append(el('b', 'iw-raid-chip-value', effect.value));
  return node;
}

const DEBUFF = new Set(['curse', 'bleed']);
const toneOf = e => (DEBUFF.has(e.art) || /curse|bleed|poison|burn|reduced/i.test(e.title || '') ? 'debuff' : 'buff');

/* ---------------------------------------------------------- raiders -- */

function decorateRaiders(arena, raid) {
  const party = [];
  let count = 0;
  let downed = 0;
  for (const raider of arena.querySelectorAll('[data-iw-guild-role="raider"]')) {
    const nameEl = raider.querySelector('[data-iw-guild-role="raider-name"]');
    const name = norm(nameEl?.textContent);
    const skillText = norm(raider.querySelector('[data-iw-guild-role="raider-skill"]')?.textContent);
    const hpFill = raider.querySelector('[data-iw-guild-role="raider-hp"] > *');
    const hp = percent(hpFill);
    const tone = fillTone(hpFill);
    const self = /(?:^|\s)text-sky-/.test(String(nameEl?.className || ''));
    const down = hp === 0;
    count += 1;
    if (down) downed += 1;
    set(raider, 'data-iw-raid-skill', skillKey(skillText));
    set(raider, 'data-iw-raid-hp', hp == null ? null : `${hp}%`);
    set(raider, 'data-iw-raid-frame', down || tone === 'bad' ? 'critical' : self ? 'self' : 'normal');
    set(raider, 'data-iw-raid-down', down ? '1' : null);
    // Identity, kept apart from the frame art: you still lead the row when your frame turns critical.
    set(raider, 'data-iw-raid-self', self ? '1' : null);

    const effects = readOwnEffects(raider);
    // The named tank's timer rides on that raider's own "Tanking" status.
    if (raid.tank && raid.tank.name === name) {
      const taunt = effects.find(e => e.art === 'taunt');
      if (taunt) taunt.value = raid.tank.secs;
      else effects.push({ art: 'taunt', name: 'Tanking', glyph: '🎯', value: raid.tank.secs, title: `${name} is tanking` });
    }
    // Raid-wide buffs reach every raider still standing.
    if (!down) for (const e of raid.shared) effects.push({ ...e });
    for (const e of effects) e.tone = toneOf(e);
    // Buffs first in a stable order, debuffs last where the eye ends.
    effects.sort((a, b) => (a.tone === 'debuff') - (b.tone === 'debuff'));

    const sig = JSON.stringify(effects.map(e => [e.art, e.name, e.value, e.glyph, e.tone]));
    let strip = raider.querySelector(`:scope > .iw-raid-fx[${OWNED}]`);
    if (!strip || strips.get(raider) !== sig) {
      if (!strip) {
        strip = el('span', 'iw-raid-fx');
        strip.setAttribute('role', 'list');
        raider.append(strip);
      }
      strip.replaceChildren(...effects.map(e => { const c = chip(e, false); c.setAttribute('role', 'listitem'); return c; }));
      strips.set(raider, sig);
    }
    party.push({ name, down, effects });
  }
  // "7 raiders · all standing": the party caption's count, from the frames.
  const floor = arena.querySelector(':scope > .raid-arena-floor');
  set(floor, 'data-iw-raid-party', count ? `${count} raider${count === 1 ? '' : 's'} · ${downed ? `${downed} down` : 'all standing'}` : null);
  return party;
}

/* -------------------------------------------------- effect timers -- */

const secsOf = text => { const m = /(\d+)\s*s\b/.exec(text || ''); return m ? Number(m[1]) : null; };

/**
 * Every effect the game counts down, plus the debuffs it shows on raiders:
 *   - raid-wide lines with "Ns left" (War Cry, Ward, Veil, …), on "Raid";
 *   - the tank's "X is tanking … — 21s left", on that raider;
 *   - each standing raider's debuff statuses, one bar per effect naming
 *     everyone who carries it, with seconds only when the game states them
 *     ("Cursed — reduced healing" states none, so it is a full bar).
 */
function timerSpecs(raid, party) {
  const specs = [];
  for (const e of raid.shared) {
    const secs = secsOf(e.value);
    if (secs == null) continue;
    specs.push({ key: `raid:${e.name}`, art: e.art, glyph: e.glyph, name: e.name, who: 'Raid', secs, tone: toneOf(e) });
  }
  const tankSecs = secsOf(raid.tank?.secs);
  if (tankSecs != null) specs.push({ key: 'tank', art: 'taunt', glyph: '🎯', name: 'Tanking', who: raid.tank.name, secs: tankSecs, tone: 'buff' });
  const debuffs = new Map();
  for (const member of party) {
    if (member.down) continue;
    for (const e of member.effects) {
      if (e.tone !== 'debuff' || raid.shared.some(r => r.name === e.name)) continue;
      const entry = debuffs.get(e.name) || { key: `debuff:${e.name}`, art: e.art, glyph: e.glyph, name: e.name, who: [], secs: null, tone: 'debuff' };
      entry.who.push(member.name);
      const secs = secsOf(e.title);
      if (secs != null) entry.secs = Math.max(entry.secs ?? 0, secs);
      debuffs.set(e.name, entry);
    }
  }
  for (const entry of debuffs.values()) specs.push({ ...entry, who: entry.who.join(', ') });
  // Buffs first in a stable order, debuffs last, as on the party frames.
  specs.sort((x, y) => (x.tone === 'debuff') - (y.tone === 'debuff'));
  return specs;
}

function buildTimer(spec) {
  const bar = el('div', 'iw-raid-timer');
  const icon = el('i', 'iw-raid-chip-icon', spec.art ? null : (spec.glyph || '•'));
  bar.append(el('i', 'iw-raid-timer-fill'), icon, el('span', 'iw-raid-timer-name'), el('span', 'iw-raid-timer-who'), el('b', 'iw-raid-timer-secs'));
  return bar;
}

function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

/** In place, every write compared: a tick touches only what it changed. */
function updateTimer(bar, spec) {
  const [fill, , name, who, secs] = bar.children;
  set(bar, 'data-iw-raid-art', spec.art);
  set(bar, 'data-iw-raid-tone', spec.tone);
  set(bar, 'data-iw-raid-timer', spec.key);
  setText(name, spec.name);
  setText(who, spec.who);
  setText(secs, spec.secs == null ? '' : `${spec.secs}s`);
  // Seconds over the longest count seen for this effect: the DOM never
  // states a duration (the cast bar infers its wind-up the same way).
  let width = 100;
  if (spec.secs != null) {
    const max = Math.max(spec.secs, timerMax.get(spec.key) || 0);
    timerMax.set(spec.key, max);
    width = max > 0 ? Math.round(100 * spec.secs / max) : 100;
  }
  if (fill.style.width !== `${width}%`) fill.style.width = `${width}%`;
}

function decorateTimers(arena, raid, party) {
  const specs = timerSpecs(raid, party);
  let row = arena.querySelector(`:scope > .iw-raid-timers[${OWNED}]`);
  if (!specs.length) { row?.remove(); return; }
  if (!row) {
    row = el('div', 'iw-raid-timers');
    row.setAttribute('aria-hidden', 'true'); // a reading of lines the game already exposes
    arena.append(row);
  }
  const keys = specs.map(spec => spec.key).join('|');
  if (timerSets.get(row) !== keys) {
    row.replaceChildren(...specs.map(buildTimer));
    timerSets.set(row, keys);
  }
  specs.forEach((spec, i) => updateTimer(row.children[i], spec));
}

/* ----------------------------------------------- log + skills dock -- */

/*
 * The combat log and Raid skills live inside the arena, and Raid Chat is the
 * card AFTER the arena, so the two cannot be placed under the chat without
 * moving React's nodes (rule 2). Instead (Curtis, 2026-10-07: "not needed
 * unless the user asks for it … under the raid chat, stacked") the game's
 * two panels are hidden in the arena (guild.css) and this dock, the skin's
 * own, is placed right after the chat: two stacked panels, folded to their
 * headings until opened, whose content is COPIED from the game's text.
 *
 * Every control the dock shows presses the game's own button, so nothing the
 * game does changes (rule 1): opening the log expands the game's log
 * (its "tap to expand" button), folding it presses the game's "✕ Close", and
 * the skills panel's "(who has what?)" presses the game's toggle. The log's
 * "⬇ .txt" download is not offered (Curtis, 2026-10-07).
 *
 * A folded panel builds no body, so a quiet dock costs one signature compare
 * per pass. Fold choices are module state (`folds`), so a React re-render of
 * the arena keeps them; they reset with the page, folded.
 */

const docks = new WeakMap(); // dock -> arena it mirrors
const dockSigs = new WeakMap(); // panel section -> body signature

/** The game's log panel (the collapsed <button> or the expanded <div>). */
function gameLog(arena) {
  return arena.querySelector('[data-iw-guild-role="combat-log"]');
}

function gameSkills(arena) {
  return arena.querySelector(':scope > [data-iw-guild-role="effects"]');
}

/** The log's lines in reading order: the expanded list is chronological, the
 * collapsed preview shows the last three newest-first. */
function logLines(log) {
  if (!log) return [];
  if (log.tagName === 'BUTTON') return [...log.querySelectorAll(':scope > p')].reverse().map(p => norm(p.textContent));
  const list = [...log.children].at(-1);
  return [...(list?.querySelectorAll(':scope > p') || [])].map(p => norm(p.textContent));
}

/** A copy of one game element: its classes (the game's state colours) and
 * text, none of the skin's marks, every node marked owned. */
function copyOf(node) {
  const copy = node.cloneNode(true);
  for (const elx of [copy, ...copy.querySelectorAll('*')]) {
    for (const attr of [...elx.attributes]) if (attr.name.startsWith('data-iw-') || attr.name === 'id') elx.removeAttribute(attr.name);
    elx.setAttribute(OWNED, '1');
  }
  return copy;
}

function onDockHead(event) {
  event.preventDefault();
  event.stopPropagation();
  const head = event.currentTarget;
  const panel = head.parentElement;
  const dock = panel.parentElement;
  const arena = docks.get(dock);
  const key = panel.dataset.iwRaidDock;
  const open = folds.get(key) !== true;
  folds.set(key, open);
  syncDockPanel(panel, open);
  if (!arena) return;
  // A fold is carried by data-iw-* alone, which DOMWatcher never sees, so
  // this pass fills the body itself (CLAUDE.md, mutation cost).
  decorateDock(arena);
  if (key !== 'log') return;
  // The game's own controls: open = its "tap to expand", fold = its "✕ Close".
  const log = gameLog(arena);
  if (open && log?.tagName === 'BUTTON') log.click();
  if (!open && log && log.tagName !== 'BUTTON') [...log.querySelectorAll('button')].find(b => /close/i.test(b.textContent))?.click();
}

function onDockToggle(event) {
  event.preventDefault();
  event.stopPropagation();
  const arena = docks.get(event.currentTarget.closest('.iw-raid-dock'));
  gameSkills(arena)?.querySelector('[data-iw-guild-role="effects-toggle"]')?.click();
}

function syncDockPanel(panel, open) {
  set(panel, 'data-iw-raid-fold', open ? 'open' : 'closed');
  const head = panel.firstElementChild;
  set(head, 'aria-expanded', String(open));
}

function dockPanel(key, title, glyph) {
  const panel = el('section', 'iw-raid-dock-panel');
  panel.dataset.iwRaidDock = key;
  const head = el('button', 'iw-raid-dock-head');
  head.type = 'button';
  if (glyph) head.append(el('span', 'iw-raid-dock-glyph', glyph));
  head.append(el('span', 'iw-raid-dock-title', title), el('i', 'iw-raid-dock-chevron'));
  head.addEventListener('click', onDockHead);
  panel.append(head, el('div', 'iw-raid-dock-body'));
  return panel;
}

function fillLog(panel, arena) {
  const lines = logLines(gameLog(arena));
  const sig = lines.join('\n');
  if (dockSigs.get(panel) === sig) return;
  dockSigs.set(panel, sig);
  const body = panel.lastElementChild;
  // Stay pinned to the newest line unless the reader has scrolled up.
  const pinned = !body.firstChild || body.scrollHeight - body.scrollTop - body.clientHeight < 12;
  const top = body.scrollTop;
  body.replaceChildren(...(lines.length ? lines : ['The fight begins…']).map(line => el('p', 'iw-raid-dock-line', line)));
  body.scrollTop = pinned ? body.scrollHeight : top;
}

function fillSkills(panel, arena) {
  const skills = gameSkills(arena);
  const toggle = skills?.querySelector('[data-iw-guild-role="effects-toggle"]');
  const rows = skills ? [...skills.children].filter(c => c !== toggle && !c.hasAttribute(OWNED)) : [];
  const sig = `${toggle ? norm(toggle.textContent) : ''}\u0000${rows.map(r => `${r.className}|${r.textContent}`).join('\u0001')}`;
  if (dockSigs.get(panel) === sig) return;
  dockSigs.set(panel, sig);
  const body = panel.lastElementChild;
  const kids = rows.map(row => {
    const copy = copyOf(row);
    // The fire-resist meter keeps its reading (guild.css draws the bar).
    for (const attr of ['data-iw-raid-fx-kind', 'data-iw-raid-resist-step']) if (row.hasAttribute(attr)) copy.setAttribute(attr, row.getAttribute(attr));
    return copy;
  });
  if (toggle) {
    // "(who has what?)" / "(hide)": the game's own words, the game's own toggle.
    const more = el('button', 'iw-raid-dock-more', norm(toggle.querySelector('span')?.textContent || toggle.textContent).replace(/^\(|\)$/g, ''));
    more.type = 'button';
    more.addEventListener('click', onDockToggle);
    kids.push(more);
  }
  body.replaceChildren(...kids);
}

/** The chat card after the arena, else the arena itself. */
function dockAnchor(arena) {
  for (let sib = arena.nextElementSibling; sib; sib = sib.nextElementSibling) {
    if (sib.matches('[data-iw-guild-card="chat"]')) return sib;
  }
  return arena;
}

function decorateDock(arena) {
  const parent = arena.parentElement;
  if (!parent) return;
  const hasLog = !!gameLog(arena);
  const hasSkills = !!gameSkills(arena);
  let dock = [...parent.querySelectorAll(`:scope > .iw-raid-dock[${OWNED}]`)].find(d => docks.get(d) === arena);
  if (!hasLog && !hasSkills) { dock?.remove(); return; }
  if (!dock) {
    dock = el('div', 'iw-raid-dock');
    dock.append(dockPanel('log', 'Combat log'), dockPanel('skills', 'Raid skills', '⚡'));
    docks.set(dock, arena);
  }
  const anchor = dockAnchor(arena);
  if (anchor.nextElementSibling !== dock) anchor.after(dock);
  const [logPanel, skillsPanel] = dock.children;
  for (const [panel, present, fill] of [[logPanel, hasLog, fillLog], [skillsPanel, hasSkills, fillSkills]]) {
    const open = folds.get(panel.dataset.iwRaidDock) === true;
    set(panel, 'hidden', present ? null : '');
    syncDockPanel(panel, open);
    if (present && open) fill(panel, arena);
  }
}

/** A dock whose arena has gone (the fight ended, the route changed). */
export function pruneRaidDocks(root) {
  for (const dock of root?.querySelectorAll?.(`.iw-raid-dock[${OWNED}]`) || []) {
    const arena = docks.get(dock);
    if (!arena || !arena.isConnected || !root.contains(arena)) dock.remove();
  }
}

/* ---------------------------------------------------------- public -- */

export function decorateRaidHud(arena) {
  set(arena, 'data-iw-raid-hud', '1');
  set(arena, 'data-iw-raid-scene-less', arena.hasAttribute('data-iw-raid-scene') ? null : '1');
  decorateBoss(arena);
  decorateCast(arena);
  decorateOutcome(arena);
  const raid = readRaidEffects(arena);
  // TESTING FEATURE: the "🧪 Effects" toggle's test buffs/debuffs, as raid-wide
  // effects (RaidPartyPreview.js). Empty unless the toggle is on.
  raid.shared.push(...previewEffects());
  const party = decorateRaiders(arena, raid);
  decorateTimers(arena, raid, party);
  decorateDock(arena);
}

/**
 * Text-tick refresh. The cast bar and every effect timer are drawn from
 * attributes copied off the game's text ("Claw Rake (single target) in 6s",
 * "War Cry active … — 3s left"), and a text-only change never reaches the
 * full Guild pass, so without this the copies froze until an unrelated
 * mutation flushed — the timer "hung", then jumped. Wired to DOMWatcher's
 * iw:text-flush; only an arena this module already decorated is refreshed.
 */
export function refreshRaidText(parents) {
  const arenas = new Set();
  for (const parent of parents) {
    const arena = parent?.closest?.('[data-iw-raid-hud]');
    if (arena && !parent.closest(`[${OWNED}]`)) arenas.add(arena);
  }
  for (const arena of arenas) decorateRaidHud(arena);
}

export function clearRaidHud(root) {
  if (!root) return;
  root.querySelectorAll(`[${OWNED}]`).forEach(node => node.remove());
  for (const attr of HUD_ATTRS) {
    if (root.hasAttribute?.(attr)) root.removeAttribute(attr);
    root.querySelectorAll(`[${attr}]`).forEach(node => node.removeAttribute(attr));
  }
}
