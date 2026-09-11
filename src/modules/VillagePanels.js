/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * VillagePanels.js — the Village route's two illustrated panels.
 *
 * WHAT THE GAME RENDERS (read from the deployed bundle, 2026-09; the whole
 * route is anonymous Tailwind, so these shapes ARE the contract):
 *
 *   Housing            .panel > h2 "Village"
 *                        └ .compact-panel
 *                            p "🏠 Manor" | "🏕️ No House"
 *                            p "Current tier: 4 • Base actions take 6s"
 *                            p "Salvage Material owned: N"
 *                            p "Next upgrade: Citadel • 1,000,000,000g • …"
 *                            button "Upgrade Housing"
 *
 *   Village Add-ons    .panel > h2 "🏗️ Village Add-ons"
 *                        p "4 slots available (1 per housing tier). …"
 *                        div.space-y-2
 *                          └ .compact-panel                       (one per slot)
 *                              div (head row)
 *                                ├ div  p "Slot 1"
 *                                │      p "Voidiron Archive"      (installed)
 *                                │      p "+4 ATK • +7 XP/task …" (installed)
 *                                │      p "Empty slot"            (vacant)
 *                                └ div  button "Destroy"
 *                                       button "Uninstall (100k)"
 *                                  or button "Install" / "Cancel" (vacant)
 *                              div (install picker, only while open)
 *                                └ button  p "Celestial Exchange ×2"
 *                                          p "+7 XP/task • …"
 *
 * Every one of those cards is the game's shared `.compact-panel`, so it also
 * reaches SkillPanelRenderer on `iw:skill-panel` as `skill: 'unknown'`. The
 * roles here therefore live in their own `data-iw-village*` namespace, exactly
 * like `data-iw-boss` and `data-iw-quest-role` — CLAUDE.md's "two modules must
 * never write the same attribute on the same node" (the World Boss cards
 * visibly flashed once per flush when they did).
 *
 * ART. `assets/village/building_<tier>.webp` and `house_<tier>.webp` are the
 * game's own hand-painted Construction/housing icons, imported by
 * build-tools/import-village-art.mjs. They are painted as an inline
 * `background-image` on an APPENDED element (`.iw-village-art`), never on a
 * game node and never from CSS — the same division of labour AtlasService has
 * with `.fs-inv-icon`.
 *
 * RESOLVING WHICH BUILDING. A building's item key never reaches the DOM; only
 * its rendered name does, so `VILLAGE_BUILDINGS` is keyed by normalised name
 * and a rename upstream is a miss. A miss is not a blank card — it falls back
 * to the generic construction sigil — but it is worth knowing about, so the
 * fallback is a distinct `data-iw-village-art="generic"` value rather than
 * silence. Housing is luckier: the game prints "Current tier: N" beside the
 * name, so `houseTier()` reads the NUMBER first and only falls back to the
 * name, which makes the hero survive a housing rename.
 */
import { ItemDatabase } from './ItemDatabase.js';
import { assetUrl } from './Runtime.js';
import { VILLAGE_BUILDINGS, VILLAGE_HOUSES } from './villageBuildings.js';

/** Housing tiers by number, so a tier reads without depending on key order in
 *  the generated map. Its length is also the tier track's pip count. */
const HOUSE_BY_TIER = Object.values(VILLAGE_HOUSES).sort((a, b) => a.tier - b.tier);
const HOUSE_TIERS = HOUSE_BY_TIER.length;

const cardSignatures = new WeakMap();
const houseSignatures = new WeakMap();

const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
/** The live app prefixes labels with an emoji ("🏠 Manor", "🏗️ Village
 *  Add-ons"), so every anchored test here strips a leading non-alphanumeric
 *  run first — CLAUDE.md, "Anchored label regexes break on the game's leading
 *  icons". */
const label = value => norm(value).replace(/^[^\p{L}\p{N}]+/u, '');

function mark(el, key, value) {
  if (el && el.getAttribute(key) !== value) el.setAttribute(key, value);
}
function unmark(el, key) {
  if (el && el.hasAttribute(key)) el.removeAttribute(key);
}
function owned(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  el.dataset.iwVillageOwned = '1';
  if (text) el.textContent = text;
  return el;
}
/** Direct-child elements the game itself rendered. */
function nativeChildren(el) {
  return el ? [...el.children].filter(child => !child.hasAttribute('data-iw-village-owned')) : [];
}

/* ------------------------------------------------------------------ art -- */

/**
 * Paint one building/house icon onto an appended layer inside `card`.
 *
 * `background-size: contain` keeps the source's own aspect ratio inside
 * whatever box CSS gives the medallion (CLAUDE.md, "A sprite-backed box must
 * keep its art's aspect ratio") — the import tool already trimmed each source
 * to its opaque bbox, so every icon reads at the same optical weight.
 */
function ensureArt(card, entry, kind) {
  let art = card.querySelector(':scope > .iw-village-art');
  if (!art) {
    art = owned('div', 'iw-village-art');
    art.setAttribute('aria-hidden', 'true');
    card.appendChild(art);
  }
  const file = entry?.file || null;
  mark(art, 'data-iw-village-art', file ? kind : 'generic');
  // A CUSTOM PROPERTY, not `background-image` directly (the SkillsArtService
  // idiom). The medallion's own background is the lit ground plot, and the
  // sprite has to sit ON TOP of that: painting both through one element is
  // impossible, and a `::before` ground at `z-index: -1` loses — an element's
  // own background paints BEFORE its negative-z children, so the ground covered
  // every building and the panel rendered with empty plots. The sprite
  // therefore lives on `::before`, which can only read a variable. JS still
  // owns the URL; the sheet only dereferences it.
  if (file) art.style.setProperty('--iw-village-sprite', `url("${assetUrl(`assets/${file}`)}")`);
  else art.style.removeProperty('--iw-village-sprite');
  return art;
}

function removeArt(card) {
  card.querySelector(':scope > .iw-village-art')?.remove();
}

/* -------------------------------------------------------- add-on slots -- */

function resolveBuilding(name) {
  return VILLAGE_BUILDINGS[norm(name).toLowerCase()] || null;
}

/**
 * Hover-card the installed building through the shared TooltipEngine.
 *
 * Attributes only, no wrapper — the QuestPanelRenderer objective pattern.
 * NameScanner skips `[data-iw-tooltip-trigger]`, so this cannot stack a second
 * prose highlight on the same line. Bound to the NAME paragraph only, never to
 * a control: `aria-haspopup="dialog"` on the Install button would describe a
 * control that does something else entirely.
 */
function ensureTrigger(el, name) {
  if (!el) return;
  const item = name && ItemDatabase.isReady() ? ItemDatabase.find({ name }) : null;
  if (!item) { clearTrigger(el); return; }
  mark(el, 'data-iw-item-name', item.name);
  mark(el, 'data-iw-tooltip-trigger', '1');
  mark(el, 'tabindex', '0');
  mark(el, 'aria-haspopup', 'dialog');
  mark(el, 'aria-controls', 'iw-tip');
  if (!el.hasAttribute('aria-expanded')) el.setAttribute('aria-expanded', 'false');
}

function clearTrigger(el) {
  for (const attr of ['data-iw-item-name', 'data-iw-item', 'data-iw-tooltip-trigger',
    'tabindex', 'aria-haspopup', 'aria-controls', 'aria-expanded']) unmark(el, attr);
}

/**
 * One add-on slot card.
 *
 * The head row is the card's first native child and holds a copy column plus
 * either the Destroy/Uninstall pair (installed) or the Install/Cancel control
 * (vacant). Roles are read positionally within that column rather than by
 * copy, because only "Slot N" and "Empty slot" are fixed strings — the name and
 * the effect list are both data.
 */
function decorateSlot(card) {
  const head = nativeChildren(card)[0] || null;
  const copy = head ? nativeChildren(head)[0] : null;
  const lines = copy ? [...copy.children].filter(el => el.tagName === 'P') : [];
  const index = lines.find(el => /^slot\s+\d+$/i.test(label(el.textContent))) || null;
  const rest = lines.filter(el => el !== index);
  const vacant = rest.find(el => /^empty slot$/i.test(label(el.textContent))) || null;
  const name = vacant ? null : rest[0] || null;
  const effects = vacant ? null : rest[1] || null;

  const buildingName = name ? label(name.textContent) : '';
  const building = resolveBuilding(buildingName);
  const state = vacant ? 'vacant' : name ? 'installed' : 'unknown';
  // A card whose copy column matches neither shape is not ours: leave it to
  // the generic .compact-panel treatment rather than half-decorating it.
  if (state === 'unknown') { undecorateSlot(card); return false; }

  mark(card, 'data-iw-village', 'slot');
  mark(card, 'data-iw-village-state', state);
  mark(head, 'data-iw-village-role', 'head');
  mark(copy, 'data-iw-village-role', 'copy');
  mark(index, 'data-iw-village-role', 'index');
  mark(name, 'data-iw-village-role', 'name');
  mark(effects, 'data-iw-village-role', 'effects');
  mark(vacant, 'data-iw-village-role', 'vacant');

  const actions = head ? nativeChildren(head)[1] : null;
  if (actions) {
    mark(actions, 'data-iw-village-role', actions.tagName === 'BUTTON' ? 'action' : 'actions');
    for (const button of actions.tagName === 'BUTTON' ? [actions] : actions.querySelectorAll('button')) {
      mark(button, 'data-iw-village-role', 'action');
      const verb = label(button.textContent).toLowerCase();
      mark(button, 'data-iw-village-action',
        verb.startsWith('destroy') ? 'destroy'
          : verb.startsWith('uninstall') ? 'uninstall'
            : verb.startsWith('install') ? 'install'
              : verb.startsWith('cancel') ? 'cancel' : 'other');
    }
  }

  // The install picker is the card's SECOND native child and only exists while
  // this slot's picker is open. Its option buttons carry a building name too,
  // which is the other place the art earns its keep.
  const picker = nativeChildren(card)[1] || null;
  mark(picker, 'data-iw-village-role', 'picker');
  // Both shapes the picker can hold: an installable <button> and the greyed
  // "already installed elsewhere" <div>. Requiring the name to be a DIRECT
  // child <p> is what keeps a wrapper (`div.space-y-1`) from answering for the
  // tile inside it.
  for (const option of picker ? picker.querySelectorAll('button, div') : []) {
    if (option.closest('[data-iw-village-owned]')) continue;
    const optionName = option.querySelector(':scope > p');
    if (!optionName) continue;
    // "Celestial Exchange ×2" — the count lives in its own <span>, so strip the
    // span's text rather than guessing at a separator.
    const bare = label(optionName.firstChild?.textContent ?? optionName.textContent);
    const match = resolveBuilding(bare);
    mark(option, 'data-iw-village-role', option.tagName === 'BUTTON' ? 'option' : 'option-owned');
    mark(optionName, 'data-iw-village-role', 'option-name');
    ensureOptionArt(optionName, match);
  }

  ensureArt(card, building, 'building');
  ensureTrigger(name, building ? building.name : buildingName);
  return true;
}

/** Options live inside a <button>; the art rides on the name line so the
 *  control's own box, padding and hit area are left exactly as the game set
 *  them. */
function ensureOptionArt(nameEl, entry) {
  let art = nameEl.querySelector(':scope > .iw-village-option-art');
  if (!entry) { art?.remove(); return; }
  if (!art) {
    art = owned('span', 'iw-village-option-art');
    art.setAttribute('aria-hidden', 'true');
    nameEl.prepend(art);
  }
  art.style.setProperty('--iw-village-sprite', `url("${assetUrl(`assets/${entry.file}`)}")`);
}

function undecorateSlot(card) {
  removeArt(card);
  card.querySelectorAll('[data-iw-village-owned]').forEach(el => el.remove());
  card.querySelectorAll('[data-iw-tooltip-trigger]').forEach(clearTrigger);
  clearTrigger(card);
  for (const attr of ['data-iw-village', 'data-iw-village-state', 'data-iw-village-role',
    'data-iw-village-action', 'data-iw-village-art']) {
    unmark(card, attr);
    card.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr));
  }
  cardSignatures.delete(card);
}

/** Cheap before-guard: re-decorating only matters when the copy or the control
 *  set actually changed (install, uninstall, picker open/close). */
function slotSignature(card) {
  const head = nativeChildren(card)[0];
  const controls = [...card.querySelectorAll('button')].map(b => norm(b.textContent)).join('|');
  return `${norm(head?.textContent)} ${controls} ${nativeChildren(card).length} ${ItemDatabase.revision()}`;
}

/* ------------------------------------------------------------- housing -- */

/**
 * Which house is standing, as a tier number.
 *
 * "Current tier: N" is preferred over the "🏠 Manor" name because it is the
 * one machine-readable value on the panel; the name is the fallback for a
 * layout that ever drops the tier line. Tier 0 ("🏕️ No House") resolves to
 * null and the hero renders as an empty plot, which is the honest picture.
 */
function houseTier(card, nameEl) {
  const tierLine = [...card.querySelectorAll('p')].map(el => norm(el.textContent))
    .find(text => /^current tier\s*:/i.test(text));
  const digits = tierLine ? /^current tier\s*:\s*(\d+)/i.exec(tierLine) : null;
  if (digits) return Number(digits[1]) || null;
  const named = VILLAGE_HOUSES[label(nameEl?.textContent).toLowerCase()];
  return named ? named.tier : null;
}

/** A row of tier studs. Pure re-presentation of the "Current tier: N" the game
 *  already prints — it adds a reading of existing state, it does not repaint
 *  any signal the game owns (rule 5). */
function ensureTierTrack(card, tier) {
  let track = card.querySelector(':scope > .iw-village-tiers');
  if (!track) {
    track = owned('div', 'iw-village-tiers');
    track.setAttribute('aria-hidden', 'true');
    card.appendChild(track);
  }
  if (track.children.length !== HOUSE_TIERS) {
    track.replaceChildren(...Array.from({ length: HOUSE_TIERS }, () => owned('span', 'iw-village-tier-pip')));
  }
  [...track.children].forEach((pip, i) => {
    mark(pip, 'data-iw-village-pip', i < (tier || 0) ? 'held' : 'open');
  });
}

function decorateHousing(root) {
  const card = root.querySelector('.compact-panel');
  if (!card) return false;
  const lines = [...card.children].filter(el => el.tagName === 'P');
  const nameEl = lines[0] || null;
  if (!nameEl) return false;

  const tier = houseTier(card, nameEl);
  const sig = `${norm(card.textContent)} ${nativeChildren(card).length}`;
  mark(root, 'data-iw-village', 'housing');
  mark(card, 'data-iw-village', 'house');
  if (houseSignatures.get(card) === sig) return true;
  houseSignatures.set(card, sig);

  mark(card, 'data-iw-village-tier', String(tier ?? 0));
  mark(nameEl, 'data-iw-village-role', 'house-name');
  for (const line of lines.slice(1)) {
    const text = norm(line.textContent);
    if (/^current tier\s*:/i.test(text)) mark(line, 'data-iw-village-role', 'house-tier');
    else if (/^salvage material owned\s*:/i.test(text)) mark(line, 'data-iw-village-role', 'house-salvage');
    else if (/^next upgrade\s*:/i.test(text)) mark(line, 'data-iw-village-role', 'house-next');
    else if (/^maximum housing tier reached/i.test(text)) mark(line, 'data-iw-village-role', 'house-max');
    else mark(line, 'data-iw-village-role', 'house-note');
  }
  for (const button of card.querySelectorAll('button')) {
    mark(button, 'data-iw-village-role', 'action');
    mark(button, 'data-iw-village-action', 'upgrade');
  }
  ensureArt(card, HOUSE_BY_TIER.find(house => house.tier === tier) || null, 'house');
  ensureTierTrack(card, tier);
  return true;
}

/* ----------------------------------------------------------- lifecycle -- */

/**
 * Decorate one resolved Village panel. Called every `iw:dom-flush` by
 * UIFoundation.classifyVillagePanels with the cached resolution, so the
 * per-card work is guarded by a signature: the live page re-renders this whole
 * subtree on every install/uninstall, and re-painting art on an unchanged card
 * would be a per-flush cost for nothing.
 */
export function decorateVillagePanel({ root, kind }) {
  if (kind === 'housing') { decorateHousing(root); return; }
  mark(root, 'data-iw-village', 'addons');
  const intro = [...root.children].find(el => el.tagName === 'P');
  mark(intro, 'data-iw-village-role', 'intro');
  for (const card of root.querySelectorAll('.compact-panel')) {
    if (card.querySelector('.compact-panel')) continue;
    const sig = slotSignature(card);
    if (cardSignatures.get(card) === sig) continue;
    cardSignatures.set(card, sig);
    if (!decorateSlot(card)) cardSignatures.delete(card);
  }
  // The stack's trailing "Assemble a building …" hint is a sibling of the
  // cards, not a card; tag it so it reads as a note rather than a dead line.
  for (const note of root.querySelectorAll('p')) {
    if (note === intro || note.closest('.compact-panel')) continue;
    mark(note, 'data-iw-village-role', 'note');
  }
}

export function clearVillagePanel(root) {
  if (!root) return;
  root.querySelectorAll('.compact-panel').forEach(undecorateSlot);
  root.querySelectorAll('[data-iw-village-owned]').forEach(el => el.remove());
  root.querySelectorAll('[data-iw-tooltip-trigger]').forEach(clearTrigger);
  for (const attr of ['data-iw-village', 'data-iw-village-state', 'data-iw-village-role',
    'data-iw-village-action', 'data-iw-village-art', 'data-iw-village-tier', 'data-iw-village-pip']) {
    if (root.hasAttribute?.(attr)) root.removeAttribute(attr);
    root.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr));
  }
}
