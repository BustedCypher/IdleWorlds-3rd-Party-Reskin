/**
 * VillageLedger.js — the Village scene's right-hand reading of the village.
 *
 * The scene next door is a PICTURE of the village: which plots are filled and
 * what stands on them. It cannot say what any of it is worth, because the
 * dashboard renders no village at all (docs/traps/village.md) and the
 * `/api/player` snapshot VillageScene holds carries identity only — a tier, a
 * slot number, an `itemKey` and a name. The numbers come from somewhere else
 * entirely: every add-on building is an ITEM in the game's own items.json
 * (`construction_building_tier_<N>`, category "Trade Good"), carrying the same
 * `atk`/`def`/`xp_per_task`/`*_pct`/`skill_bonus_*` fields the inventory rows
 * and the tooltip card already read. So the join is `ItemDatabase.find({ id })`
 * on the key the village snapshot already has, and `deriveDisplayStats()` — the
 * shared derivation, so a building's ATK is labelled and formatted exactly as
 * that same building's hover card labels it.
 *
 * WHAT THIS MODULE MAY NOT DO. The housing tiers are NOT items: nothing in
 * items.json matches Camp/Cottage/Villa/Manor/Citadel, so the home's own
 * benefits cannot be looked up. Two of them are still honest to print. The
 * slot count is arithmetic the game itself states on the route ("N slots
 * available (1 per housing tier)") and VillageScene already holds it. The
 * action-speed line is the game's own copy, captured verbatim from the Village
 * route's "Current tier: 4 • Base actions take 6s" when the player has stood
 * there this session — `perks` below. Everything else about housing is
 * deliberately absent rather than guessed: an invented number here would read
 * exactly like a measured one.
 *
 * OVERALL STATS counts INSTALLED BUILDINGS ONLY, per the request. That is also
 * the only total this module can stand behind: it is the sum of the per-item
 * fields it just listed, so a reader can check it against the entries above it.
 * Housing contributes an action interval and slots, which are not the same
 * currency and cannot be added to an ATK.
 *
 * OWNERSHIP. Not one node here is the game's, and none of them are marked in
 * this module's name either: `own()` is passed IN by VillageScene, so every
 * node carries `data-iw-village-scene-owned` and the scene's own teardown
 * reaches all of it. This module holds no DOM between calls — only the
 * collapse preferences, which are the player's and live in chrome.storage,
 * exactly as CollapsibleFrames keeps its per-panel choices.
 */
import { ItemDatabase } from './ItemDatabase.js';
import { deriveDisplayStats } from './itemDisplay.js';
import { assetUrl, storageGet, storageSet, warnOnce } from './Runtime.js';

const STORE_KEY = 'iw-village-ledger';

/**
 * The stat fields a building can carry, in the order the game's own
 * `effects_raw` copy lists them ("ATK +4, XP +7/task, Smithing Level +2, +8%
 * item find"). Every one is read through `deriveDisplayStats`, so a field the
 * API drops but still spells out in prose is picked up by that module's
 * regexes rather than silently missing here.
 *
 * `pct` is a percentage the game writes as "+8% item find"; `flat` is a plain
 * additive number. Nothing here is a ratio or a multiplier, which is what makes
 * the totals below a straight sum.
 */
const BENEFITS = [
  { key: 'atk', label: 'ATK', kind: 'flat' },
  { key: 'def', label: 'DEF', kind: 'flat' },
  { key: 'hp', label: 'HP', kind: 'flat' },
  { key: 'warfare', label: 'Warfare', kind: 'flat' },
  { key: 'xpPerTask', label: 'XP / task', kind: 'flat' },
  { key: 'doubleGatherPct', label: '2× gather', kind: 'pct' },
  { key: 'goldFindPct', label: 'Gold find', kind: 'pct' },
  { key: 'itemFindPct', label: 'Item find', kind: 'pct' },
  { key: 'allResists', label: 'All resists', kind: 'flat' },
  { key: 'fireResist', label: 'Fire resist', kind: 'flat' },
  { key: 'frostResist', label: 'Frost resist', kind: 'flat' },
  { key: 'lightningResist', label: 'Lightning resist', kind: 'flat' },
  { key: 'bonusBrewPct', label: 'Bonus brew', kind: 'pct' },
  { key: 'bonusEnhancePct', label: 'Bonus enhance', kind: 'pct' },
  { key: 'bonusEnchantPct', label: 'Bonus enchant', kind: 'pct' },
];

const amount = (value, kind) =>
  `${value > 0 ? '+' : ''}${Number(value.toFixed(2))}${kind === 'pct' ? '%' : ''}`;

/** items.json spells the skill bonus in its own id case ("jewelcrafting"). */
const skillLabel = skill =>
  String(skill || '').replace(/(^|\s)\p{Ll}/gu, m => m.toUpperCase());

/* ------------------------------------------------------- the collapse -- */

/**
 * Open/closed per ENTRY, remembered across sessions.
 *
 * Keyed on the building rather than on the slot, so uninstalling a building
 * and putting it back in a different plot keeps the reading the player chose
 * for it. Only the CLOSED entries are stored: open is the default, so an
 * unknown key (a new building, a renamed one) reads as open, which is the
 * direction that cannot hide information the player never asked to hide.
 */
let prefs = null;
let loading = null;
/** Keys toggled this session: a late storage read must not overwrite a choice
 *  the player already made while it was in flight (CollapsibleFrames' rule). */
const touched = new Set();
/** The entries this module last built, so a storage read that lands after the
 *  render can still apply. Rebuilt every render; stale rows are detached and
 *  applying to them is harmless. */
let live = [];

function loadPreferences() {
  if (prefs) return loading;
  prefs = new Map();
  loading = storageGet(STORE_KEY).then(bag => {
    if (!bag || typeof bag !== 'object') return;
    for (const [key, value] of Object.entries(bag)) {
      if (value === false && !touched.has(key)) prefs.set(key, false);
    }
    // A change carried only by `data-iw-*` drives no mutation record and so no
    // flush (CLAUDE.md): whatever makes it has to run the pass itself.
    for (const row of live) applyEntry(row);
  }).catch(err => warnOnce('village-ledger:load', err));
  return loading;
}

function persist() {
  const bag = {};
  for (const [key, value] of prefs) if (value === false) bag[key] = false;
  void storageSet(STORE_KEY, bag);
}

function applyEntry(row) {
  const open = prefs?.get(row.key) !== false;
  const want = open ? '1' : '0';
  if (row.entry.dataset.iwVsOpen !== want) row.entry.dataset.iwVsOpen = want;
  const expanded = open ? 'true' : 'false';
  if (row.button.getAttribute('aria-expanded') !== expanded) {
    row.button.setAttribute('aria-expanded', expanded);
  }
  const label = `${open ? 'Collapse' : 'Expand'} ${row.name}`;
  if (row.button.getAttribute('title') !== label) row.button.setAttribute('title', label);
}

/* ------------------------------------------------------------- pieces -- */

let ids = 0;

/** The building's own icon, at reading size. Deliberately NOT `.iw-vs-sprite`:
 *  that class is the SCENE's, sized to fill an absolutely positioned plot. */
function icon(own, file, fallback) {
  const box = own('span', 'iw-vs-entry-icon');
  box.setAttribute('aria-hidden', 'true');
  if (!file) { box.textContent = fallback; return box; }
  const img = own('img', 'iw-vs-entry-sprite');
  img.src = assetUrl(`assets/${file}`);
  img.alt = '';
  img.decoding = 'async';
  box.append(img);
  return box;
}

/** One label/value list. A `<dl>` because every row IS a term and its value,
 *  and the totals reuse it so a sum reads in the same shape as its parts. */
function statList(own, rows) {
  const list = own('dl', 'iw-vs-stats');
  for (const row of rows) {
    const line = own('div', 'iw-vs-stat');
    if (row.kind) line.dataset.iwVsStatKind = row.kind;
    line.append(own('dt', '', row.label), own('dd', '', row.value));
    list.append(line);
  }
  return list;
}

/** The rotated border corner both disclosures here draw, and the one
 *  CollapsibleFrames draws on the panel: no glyph, so no font, and nothing a
 *  text-matching classifier can pick up. */
function chevron(own) {
  const mark = own('span', 'iw-vs-chevron');
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}

/**
 * Make one box a disclosure.
 *
 * The mechanism is the skin's own button plus one `data-iw-vs-open` attribute
 * on the box, and `village-scene.css` does the hiding — CollapsibleFrames'
 * mechanism, in its own namespace so that module's document-wide
 * `[data-iw-collapse]` sweep can never adopt or remove these controls. Shared
 * by the per-building entries and by the BUILDINGS section header, so the two
 * cannot drift apart in what a click does or what it remembers.
 */
function wire(key, name, box, button) {
  const row = { key, name, entry: box, button };
  button.addEventListener('click', event => {
    event.preventDefault();
    const closed = prefs.get(key) === false;
    if (closed) prefs.delete(key); else prefs.set(key, false);
    touched.add(key);
    persist();
    applyEntry(row);
  });
  live.push(row);
  applyEntry(row);
  return row;
}

/** One building (or the home): a heading over its benefits. */
function entry(own, { key, name, meta, file, fallback, rows, notes, empty }) {
  const box = own('div', 'iw-vs-entry');
  box.dataset.iwVsEntry = key;
  const button = own('button', 'iw-vs-entry-head');
  button.type = 'button';
  button.dataset.iwVsToggle = '1';
  const bodyId = `iw-vs-entry-${(ids += 1)}`;
  button.setAttribute('aria-controls', bodyId);
  button.setAttribute('aria-expanded', 'true');
  const label = own('span', 'iw-vs-entry-label');
  label.append(own('span', 'iw-vs-entry-name', name));
  if (meta) label.append(own('span', 'iw-vs-entry-meta', meta));
  button.append(icon(own, file, fallback), label, chevron(own));
  const body = own('div', 'iw-vs-entry-body');
  body.id = bodyId;
  const lines = notes || [];
  if (rows.length) body.append(statList(own, rows));
  for (const note of lines) body.append(own('p', 'iw-vs-entry-note', note));
  if (!rows.length && !lines.length) {
    body.append(own('p', 'iw-vs-entry-note', empty || 'No recorded effects.'));
  }
  box.append(button, body);
  wire(key, name, box, button);
  return box;
}

/* --------------------------------------------------------------- data -- */

/**
 * The item record behind an installed slot.
 *
 * `itemKey` first: it is the game's own id and survives a rename. The name is
 * the fallback for the rendered-route path, which never sees a key — the same
 * two-step join VillagePanels.resolveBuilding does for the art.
 */
function buildingItem(slot) {
  if (!ItemDatabase.isReady()) return null;
  return ItemDatabase.find({ id: slot.itemKey || '', name: slot.name || '' });
}

/** One building's benefits, formatted the way the game words them. */
export function buildingBenefits(item) {
  if (!item) return [];
  const stats = deriveDisplayStats(item);
  const rows = [];
  for (const spec of BENEFITS) {
    const value = stats[spec.key];
    if (!Number.isFinite(value) || value === 0) continue;
    rows.push({ label: spec.label, value: amount(value, spec.kind) });
  }
  const skill = String(item.skill_bonus_skill || '').trim();
  const level = Number(item.skill_bonus_value);
  if (skill && Number.isFinite(level) && level !== 0) {
    rows.push({
      label: `${skillLabel(skill)} level`,
      value: amount(level, 'flat'),
      kind: 'skill-level',
    });
  }
  return rows;
}

/**
 * Everything the INSTALLED BUILDINGS add up to.
 *
 * A straight sum, because every field in BENEFITS is additive in the game's own
 * copy ("+8% item find", "XP +7/task") — none is a multiplier, so nothing here
 * needs to know how the server compounds them. Skill levels are summed per
 * skill rather than pooled: "Smithing +4" is a different thing from
 * "Mining +2", and adding them would invent a stat the game does not have.
 */
export function totalBenefits(items) {
  const sums = new Map();
  const skills = new Map();
  for (const item of items) {
    const stats = deriveDisplayStats(item);
    for (const spec of BENEFITS) {
      const value = stats[spec.key];
      if (!Number.isFinite(value) || value === 0) continue;
      sums.set(spec.key, (sums.get(spec.key) || 0) + value);
    }
    const skill = String(item.skill_bonus_skill || '').trim();
    const level = Number(item.skill_bonus_value);
    if (skill && Number.isFinite(level) && level !== 0) {
      skills.set(skill, (skills.get(skill) || 0) + level);
    }
  }
  const rows = [];
  for (const spec of BENEFITS) {
    if (!sums.has(spec.key)) continue;
    rows.push({ label: spec.label, value: amount(sums.get(spec.key), spec.kind) });
  }
  for (const [skill, level] of [...skills].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push({
      label: `${skillLabel(skill)} level`,
      value: amount(level, 'flat'),
      kind: 'skill-level',
    });
  }
  return rows;
}

/* -------------------------------------------------------------- build -- */

/**
 * Build the whole ledger for one village snapshot.
 *
 * @param {object}   args
 * @param {object}   args.snapshot  VillageScene's normalised village.
 * @param {object}   args.house     The housing entry (name/file) or null.
 * @param {string[]} args.perks     Housing copy captured from the Village route.
 * @param {Function} args.own       VillageScene's node factory — see the header.
 */
export function buildVillageLedger({ snapshot, house, perks, own }) {
  void loadPreferences();
  live = [];
  const ledger = own('div', 'iw-vs-ledger');
  ledger.dataset.iwVillageLedger = '1';

  /**
   * The BUILDINGS list folds as a whole, leaving the header, the totals and
   * the plot scene standing — the reading collapses to its conclusion.
   *
   * The control is a small square beside the heading rather than a full-width
   * plate like the entries', because ui-system.css paints every unclaimed
   * `button` as a forged plate and a plate here would give the section header
   * exactly the weight of the entries under it, flattening the hierarchy. A
   * 22px square wearing that same plate reads as a control instead, which is
   * also what CollapsibleFrames' own panel toggle looks like. The heading
   * SURVIVES the fold for CollapsibleFrames' reason (rule 5): a list folded
   * down to nothing would erase what it even was.
   */
  const head = own('div', 'iw-vs-ledger-head');
  head.append(own('div', 'iw-vs-ledger-title', 'Buildings'));
  const sectionToggle = own('button', 'iw-vs-ledger-toggle');
  sectionToggle.type = 'button';
  sectionToggle.dataset.iwVsToggle = 'section';
  sectionToggle.setAttribute('aria-expanded', 'true');
  sectionToggle.append(chevron(own));
  head.append(sectionToggle);
  const list = own('div', 'iw-vs-ledger-list');
  list.id = `iw-vs-list-${(ids += 1)}`;
  sectionToggle.setAttribute('aria-controls', list.id);
  ledger.append(head, list);
  wire('ledger', 'the building list', ledger, sectionToggle);

  list.append(entry(own, {
    key: 'home',
    name: house?.name || 'No House',
    meta: `Home · tier ${snapshot.tier}`,
    file: house?.file || null,
    fallback: '⌂',
    rows: snapshot.tier ? [{ label: 'Village slots', value: String(snapshot.capacity) }] : [],
    notes: snapshot.tier ? perks || [] : [],
    empty: 'Build a home on the Village tab to open your first plot.',
  }));

  const installed = [];
  for (const slot of snapshot.slots) {
    if (slot.state !== 'installed') {
      const line = own('div', 'iw-vs-ledger-vacant');
      // NOT `data-plot-state`: that one is the SCENE's, on its five plots, and
      // the scene's own test counts it. One attribute, one writer.
      line.dataset.iwVsSlotState = slot.state;
      line.append(own('span', '', `Slot ${slot.slot}`),
        own('span', '', slot.state === 'locked' ? 'Locked · upgrade housing' : 'Empty plot'));
      list.append(line);
      continue;
    }
    const item = buildingItem(slot);
    if (item) installed.push(item);
    const tier = Number(item?.tier);
    list.append(entry(own, {
      key: `building:${slot.name.toLowerCase()}`,
      name: slot.name,
      meta: `Slot ${slot.slot}${Number.isFinite(tier) ? ` · tier ${tier}` : ''}`,
      file: slot.file,
      fallback: '⌂',
      rows: buildingBenefits(item),
      empty: ItemDatabase.isReady()
        ? 'This building records no effects.'
        : 'Effects arrive with the item database.',
    }));
  }

  const totals = own('section', 'iw-vs-totals');
  totals.dataset.iwVillageTotals = '1';
  const title = own('div', 'iw-vs-totals-title', 'Overall stats');
  title.setAttribute('role', 'heading');
  title.setAttribute('aria-level', '3');
  totals.append(title);
  const rows = totalBenefits(installed);
  if (rows.length) totals.append(statList(own, rows));
  let note;
  if (!ItemDatabase.isReady()) note = 'Waiting on the item database before totalling your buildings.';
  else if (!installed.length) note = 'No installed buildings yet, so nothing is counted here.';
  else {
    note = `Summed from ${installed.length} installed building${installed.length === 1 ? '' : 's'}.`
      + ' Housing is not counted.';
  }
  totals.append(own('p', 'iw-vs-totals-note', note));
  ledger.append(totals);
  return ledger;
}

/** Kill switch. The player's open/closed choices are theirs and survive it;
 *  only the in-memory cache goes, so the next activation re-reads storage. */
export function clearVillageLedger() {
  prefs = null;
  loading = null;
  live = [];
  touched.clear();
}
