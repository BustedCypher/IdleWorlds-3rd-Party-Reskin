/**
 * Per-panel collapse, on the skin's OWN control.
 *
 * The World Boss "Possible Rewards" disclosure is a `<details>` the skin builds
 * out of its own nodes, so it can wrap them. A route panel cannot work that
 * way: its contents are React's, and putting them inside a `<details>` would
 * reparent game nodes (rule 2). So the mechanism here is an appended button
 * plus one attribute on the frame, and `collapsible.css` does the hiding —
 * presentation only, nothing moves, and every game node keeps its parent.
 *
 * Rule 5 is why the header always survives a collapse: a panel folded down to
 * nothing would erase which panel it even was. The title stays, the control
 * says `aria-expanded="false"`, and the chevron points at the closed state.
 *
 * Cost: after the first pass this module writes nothing. The append is guarded
 * by a `:scope >` probe, and every attribute it writes afterwards
 * (`data-iw-*`, `aria-expanded`, `aria-label`) is outside DOMWatcher's
 * `attributeFilter`, so a settled page produces no mutation records at all —
 * see tests/flush-quiescence.test.mjs.
 */
import { storageGet, storageSet, warnOnce } from './Runtime.js';

/**
 * The three frame families ui-system.css paints, and the same leaf test: a
 * frame that CONTAINS another is a layout column, and collapsing a column
 * would fold several panels at once.
 */
const FRAME = '[data-iw-ui="section-frame"], [data-iw-inventory-root="1"], .fs-skills-section-frame[data-iw-skills-ui-ready="1"]';
const STORE_KEY = 'iw-collapsed-frames';

/** Written once, then read from memory: one storage round trip for all panels. */
let preferences = null;
let loading = null;
/** Keys the player has toggled this session; a late storage read must not
 *  overwrite a choice they already made while it was in flight. */
const touched = new Set();

function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** The game prefixes many labels with an emoji ("🏗️ Village Add-ons"), the
 *  same trap that once cost the whole zone bar. */
function labelText(el) {
  return normText(el?.textContent).replace(/^[^\p{L}\p{N}]+/u, '');
}

/**
 * The frame's own heading. `data-iw-ui="section-title"` is the classified one;
 * `[role="heading"]` catches the skin's own frames (the Village scene builds a
 * div with an explicit role), and a bare `h1..h4` is the last resort for a
 * panel whose heading never classified.
 */
function frameTitle(frame) {
  return frame.querySelector('[data-iw-ui="section-title"]')
    || frame.querySelector('[role="heading"]')
    || frame.querySelector('h1, h2, h3, h4');
}

/**
 * The direct child of the frame that carries the heading — the one row a
 * collapse must leave visible. Returns the title itself when it is already a
 * direct child.
 */
function headOf(frame, title) {
  let cur = title;
  while (cur && cur.parentElement && cur.parentElement !== frame) cur = cur.parentElement;
  return cur?.parentElement === frame ? cur : null;
}

/** The last title each head was marked for, so the spine is re-walked only
 *  when the row's shape actually changed. */
const spines = new WeakMap();

/**
 * Tag the chain from the heading row down to the title.
 *
 * A collapsed panel is a one-line bar, and getting there means hiding
 * everything else the row holds — the Daily XP Boost lines, "2 installed / 4
 * slots", the XP/hr readout, and the game's own header controls. Those live at
 * different depths in every panel, so the honest way to say "keep this and
 * nothing else" is to mark the path to the title and let one CSS rule hide
 * every element in the row that is not on it.
 *
 * Marking the path rather than the title alone is what keeps the title
 * VISIBLE: hiding a wrapper hides the title inside it.
 */
function markSpine(head, title) {
  if (spines.get(head) === title) return;
  spines.set(head, title);
  for (const stale of head.querySelectorAll('[data-iw-collapse-spine], [data-iw-collapse-title]')) {
    delete stale.dataset.iwCollapseSpine;
    delete stale.dataset.iwCollapseTitle;
  }
  if (title.dataset.iwCollapseTitle !== '1') title.dataset.iwCollapseTitle = '1';
  for (let cur = title; cur && cur !== head; cur = cur.parentElement) {
    if (cur.dataset.iwCollapseSpine !== '1') cur.dataset.iwCollapseSpine = '1';
  }
}

/**
 * What a fold should actually take away.
 *
 * The frame MARK is not always on the panel. `classifyActivityPanels` resolves
 * its own host structurally, and for the Action Log that host can be the
 * heading ROW rather than the card — its matcher walks up from the label and
 * stops at the first ancestor that looks right, and a header carrying both an
 * XP/hr and a win-rate line satisfies it. Collapsing that would hide the rate
 * readout and leave the feed standing, which reads as a broken toggle rather
 * than as a resolution difference.
 *
 * `.panel` is one of the four durable hooks the whole app ships (CLAUDE.md), it
 * wraps every real panel and nothing else, so it is the honest answer to "which
 * box is this". A `.panel` that wraps another is a layout column and folding it
 * would take several panels at once, so that one is declined and the frame
 * stands in.
 */
function collapseTarget(frame) {
  const panel = frame.closest?.('.panel');
  if (panel && !panel.querySelector('.panel')) return panel;
  return frame;
}

/**
 * A stable identity to remember the choice against.
 *
 * The activity panels already carry a slug the skin resolved
 * (`current-action`, `action-log`, `world-chat`), and so does the Village
 * scene, so those are exact. Everything else is keyed on its heading, because
 * the live app ships no test ids and nothing else durable (CLAUDE.md). A
 * reworded heading therefore forgets that panel's state, which resets it to
 * expanded — the safe direction — rather than folding the wrong panel.
 */
function frameKey(target, title) {
  // The slug may sit on an inner host rather than on the card itself — see
  // collapseTarget() — so look inside as well as at the target.
  const slug = target.dataset.iwPanel
    || target.querySelector('[data-iw-panel]')?.dataset.iwPanel;
  if (slug) return `panel:${slug}`;
  const name = labelText(title).toLowerCase();
  return name ? `title:${name}` : null;
}

function loadPreferences() {
  if (preferences) return loading;
  preferences = new Map();
  loading = storageGet(STORE_KEY).then(bag => {
    if (!bag || typeof bag !== 'object') return;
    for (const [key, value] of Object.entries(bag)) {
      if (value === true && !touched.has(key)) preferences.set(key, true);
    }
  }).catch(err => warnOnce('collapse:load', err));
  return loading;
}

function persist() {
  const bag = {};
  for (const [key, value] of preferences) if (value) bag[key] = true;
  void storageSet(STORE_KEY, bag);
}

function applyState(frame, button, key, name) {
  const collapsed = preferences.get(key) === true;
  const want = collapsed ? '1' : null;
  if ((frame.dataset.iwCollapsed || null) !== want) {
    if (want) frame.dataset.iwCollapsed = want;
    else delete frame.dataset.iwCollapsed;
  }
  const expanded = collapsed ? 'false' : 'true';
  if (button.getAttribute('aria-expanded') !== expanded) button.setAttribute('aria-expanded', expanded);
  const label = `${collapsed ? 'Expand' : 'Collapse'} ${name}`;
  if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  if (button.getAttribute('title') !== label) button.setAttribute('title', label);
}

/**
 * One toggle per frame, created once and reused for the life of the frame.
 *
 * It is appended to the HEAD, not to the frame, so it can centre itself on the
 * heading row — measured, those rows run from 30px to 93px tall depending on
 * the frame family and its title's font size, and a control pinned to a fixed
 * offset from the panel's top corner floated up to 37px above the title it
 * belongs to. Being `position: absolute` it is not a flex item, so the game's
 * own `justify-between` header still sees exactly the two children it wrote;
 * appending into a game node is the same move as HeaderRenderer.ensureCrest.
 */
function ensureToggle(head, frame, key, name) {
  let button = head.querySelector(':scope > [data-iw-collapse]');
  if (button) return button;
  button = document.createElement('button');
  // Everything is set BEFORE insertion, so the append costs exactly one
  // mutation record and nothing after it — the same discipline as
  // UIFoundation.ensureToolkitLink.
  button.type = 'button';
  button.dataset.iwCollapse = '1';
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-label', `Collapse ${name}`);
  button.setAttribute('title', `Collapse ${name}`);
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const next = preferences.get(key) !== true;
    preferences.set(key, next);
    touched.add(key);
    persist();
    applyState(frame, button, key, name);
  });
  head.append(button);
  return button;
}

export function decorateCollapsibleFrames(root = document) {
  void loadPreferences();
  const frames = [...root.querySelectorAll(FRAME)].filter(frame => !frame.querySelector(FRAME));
  // Two frames can resolve to one card (a `.panel` marked `section-frame` that
  // also holds an activity host), so dedupe on the TARGET or the second visit
  // appends a second toggle to the same box.
  const targets = new Set(frames.map(collapseTarget));
  const live = new Set();
  for (const target of targets) {
    const title = frameTitle(target);
    const head = title ? headOf(target, title) : null;
    const key = frameKey(target, title);
    // No heading means no identity to remember and no row to leave behind,
    // so such a panel simply does not get a toggle rather than getting one
    // that folds it into an anonymous strip.
    if (!key || !head) continue;
    if (head.dataset.iwCollapseHead !== '1') head.dataset.iwCollapseHead = '1';
    markSpine(head, title);
    const name = labelText(title) || 'section';
    const button = ensureToggle(head, target, key, name);
    live.add(button);
    applyState(target, button, key, name);
  }
  // A frame that lost its mark (a route swap, or another owner claiming it)
  // must lose the control too, or the page keeps a toggle that folds a panel
  // the skin no longer manages.
  //
  // Keyed on the TARGET, not on whether this pass got as far as re-tagging it.
  // VillageScene rebuilds its own children when the village changes, which
  // drops `data-iw-collapse-head` until the next flush restores it; keying on
  // the button would have read that one-frame gap as "no longer a panel" and
  // silently thrown away the player's collapsed state.
  for (const button of root.querySelectorAll('[data-iw-collapse]')) {
    const head = button.parentElement;
    if (live.has(button) || targets.has(head?.parentElement)) continue;
    button.remove();
    if (head) {
      delete head.dataset.iwCollapseHead;
      spines.delete(head);
      head.querySelectorAll('[data-iw-collapse-spine], [data-iw-collapse-title]').forEach(el => {
        delete el.dataset.iwCollapseSpine;
        delete el.dataset.iwCollapseTitle;
      });
    }
    const frame = head?.parentElement;
    if (frame) delete frame.dataset.iwCollapsed;
  }
}

export function clearCollapsibleFrames(root = document) {
  root.querySelectorAll('[data-iw-collapse]').forEach(el => { el.remove(); });
  root.querySelectorAll('[data-iw-collapsed]').forEach(el => { delete el.dataset.iwCollapsed; });
  root.querySelectorAll('[data-iw-collapse-head]').forEach(el => { delete el.dataset.iwCollapseHead; });
  root.querySelectorAll('[data-iw-collapse-spine]').forEach(el => { delete el.dataset.iwCollapseSpine; });
  root.querySelectorAll('[data-iw-collapse-title]').forEach(el => { delete el.dataset.iwCollapseTitle; });
  // The player's choices are theirs and survive a kill-switch round trip; only
  // the in-memory cache is dropped, so the next activation re-reads storage.
  preferences = null;
  loading = null;
  touched.clear();
}
