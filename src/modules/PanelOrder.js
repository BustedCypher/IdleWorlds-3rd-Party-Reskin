/**
 * Per-player panel arrangement.
 *
 * The player reorders the page's panels and the skin remembers it. Nothing
 * moves in the DOM: React keeps every node exactly where it wrote it, and the
 * skin writes one `data-iw-order` attribute per panel that `panel-order.css`
 * turns into a flex/grid `order`. That is rule 2 satisfied by construction —
 * there is no code path here that could reparent a game node.
 *
 * MEASURED on the live dashboard (2026-09-11, claude/probe-panel-layout.js,
 * captures in claude/captures/): every container that holds panels already
 * computes to flex or grid, so `order` reaches them with no `display` shim.
 * The probe's self-test moved World Chat to the top of its container and put
 * it back, at 1683px and at 1188px. Also measured there: the panel IS the flex
 * item in all 17 cases, so the attribute goes on the panel itself rather than
 * on a wrapper.
 *
 * WHY AN ATTRIBUTE AND NOT AN INLINE STYLE. Measured in Chromium under
 * DOMWatcher's real `attributeFilter`: 100 `data-iw-*` writes produce 0
 * mutation records, 100 changed inline-style writes produce 100. An inline
 * `order` would therefore queue a flush per write, and every changed style
 * write inside `document.body` costs a full classify pass plus a whole-document
 * OverlayFramer sweep. The attribute costs nothing, so a settled arrangement is
 * free — see tests/flush-quiescence.test.mjs.
 *
 * The same measurement is why nothing here writes `aria-pressed`,
 * `aria-selected`, `aria-current`, `data-state` or a class: all four ARE in the
 * filter, and a same-value `setAttribute` still emits a record (unlike a
 * same-value `setProperty`, which emits none).
 *
 * WHY A MODE. The heading row has no space left: CollapsibleFrames reserves a
 * 30px gutter for its toggle, which sits 8px clear of the game's own header
 * controls, and Action Log's label is itself a `<button>` occupying the left of
 * the row. A second always-live grab control there is a mis-click machine in a
 * game the player clicks in constantly. So rearranging is an explicit mode,
 * entered from the skin's own nav item, and the grab surface is one appended
 * full-panel button that exists ONLY while the mode is on. During normal play
 * this module has no control on the page and no event listener anywhere.
 *
 * The handle takes both a pointer drag and the arrow keys, and the keyboard
 * path is not a fallback bolted on afterwards: `order` desynchronises visual
 * order from DOM and tab order, so it is the accessibility answer for the whole
 * feature. Both paths end in the same `commitSequence`.
 *
 * The drag deliberately has NO element following the cursor — what moves is the
 * layout itself. See the pointer section below for why that is also the only
 * version of this that costs nothing.
 */
import { storageGet, storageSet, warnOnce } from './Runtime.js';
import { isRendered } from './Viewport.js';

const STORE_KEY = 'iw-panel-order';
const ITEM_ATTR = 'data-iw-order';
const CONTAINER_ATTR = 'data-iw-order-container';
const HANDLE_ATTR = 'data-iw-order-handle';
const MODE_ATTR = 'iwOrderMode';

/**
 * What counts as a movable panel.
 *
 * The SAME set CollapsibleFrames folds, deliberately: a player who can collapse
 * a frame expects to be able to move it, and two different answers to "what is
 * a panel" is how the Village scene ended up unmovable. `.panel` alone is not
 * that set — the skin builds frames of its own that carry `data-iw-ui` marks
 * without the game's class, and a name list of them cannot be completed from a
 * session (CLAUDE.md).
 */
const FRAME = '[data-iw-ui="section-frame"], [data-iw-inventory-root="1"], .fs-skills-section-frame[data-iw-skills-ui-ready="1"]';

/**
 * How many `order` values panel-order.css declares. The rules are static
 * because generating them per container would mean a stylesheet write per
 * flush; 40 is well above the largest container measured live (8) and above
 * the 25-panel kitchen-sink column in tests/smoke.test.mjs, so the clamp below
 * stays a genuine edge case rather than something the suite trips over.
 * An item past the cap keeps the last slot rather than falling back to 0,
 * which would send it to the FRONT — the failure that looks like a bug.
 */
export const ORDER_SLOTS = 40;

let preferences = null;
let loading = null;
/** Keys the player has moved this session. A storage read still in flight when
 *  they act must not overwrite the choice they just made — the same protection
 *  CollapsibleFrames.touched provides. */
const touched = new Set();
let liveRegion = null;

function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** The game prefixes labels with an emoji run ("🏗️ Village Add-ons"), the trap
 *  that once cost the whole zone bar its classification. */
function labelText(el) {
  return normText(el?.textContent).replace(/^[^\p{L}\p{N}]+/u, '');
}

/* ── Identity ─────────────────────────────────────────────────────────────
 *
 * A saved arrangement is only as good as the name it remembers each panel by,
 * and ordering is far less forgiving than collapsing: a lost key means a panel
 * with no position, not merely a panel that stays open.
 *
 * MEASURED (claude/captures/): CollapsibleFrames.frameKey() cannot be reused
 * as-is, because the key it returns FLIPS as the skin classifies the page.
 * Current Action reports `panel:current-action` in the rendered copy and
 * `title:current action` in the hidden mirror, so one panel would own two
 * storage slots depending on timing. The fix is to prefer the game's OWN
 * durable hooks, which do not depend on the skin having run:
 *
 *   1. the element id — `#current-action-panel` is one of the four durable
 *      hooks the whole app ships, and it is classification-independent;
 *   2. a real `h1`-`h4` or `[role="heading"]`, which the game writes itself.
 *      Deliberately NOT `[data-iw-ui="section-title"]`: that mark is the
 *      skin's, it appears late, and on Action Log it lands on a `<button>`;
 *   3. the skin's `data-iw-panel` slug, the only option for Action Log, which
 *      ships no heading at all.
 *
 * A panel that satisfies none of these returns null and is left exactly where
 * the game put it, rather than being given a position it cannot keep.
 */
function itemKey(el) {
  if (el.id) return `id:${el.id}`;
  const heading = el.querySelector('h1, h2, h3, h4, [role="heading"]');
  const name = labelText(heading).toLowerCase();
  if (name) return `title:${name}`;
  const slug = el.dataset?.iwPanel || el.querySelector('[data-iw-panel]')?.dataset.iwPanel;
  return slug ? `panel:${slug}` : null;
}

/* ── Which boxes are orderable ───────────────────────────────────────────── */

/**
 * The page shell holds the header, the nav rail and the zone bar as siblings of
 * the panel stack, and all three are `.panel`s too. They are excluded by owner
 * rather than by name: HeaderRenderer paints per-zone artwork on the header and
 * the zone bar draws its own scene, so letting either be reordered would put
 * the skin's own chrome somewhere its art does not belong.
 */
function isReorderable(el) {
  if (el.tagName === 'HEADER') return false;
  if (el.hasAttribute('data-iw-header')) return false;
  if (el.dataset?.iwUi === 'zone-bar' || el.dataset?.iwUi === 'main-nav' ||
      el.dataset?.iwUi === 'main-nav-shell') return false;
  if (el.querySelector('[data-iw-ui="main-nav"], [data-iw-ui="zone-bar"]')) return false;
  return true;
}

/** Is this child something the player may pick up? It has to BE a frame or
 *  hold one, and it must not be chrome another module owns. */
function isMovable(el) {
  if (!isReorderable(el)) return false;
  // The game's own card, or a wrapper holding one. Tested FIRST and on the
  // `.panel` primitive rather than on a skin mark, because `data-iw-ui` arrives
  // only once the classifiers have run — making movability wait on that is the
  // same late-state trap that made the identity key flip.
  if (el.matches?.('.panel') || el.querySelector?.('.panel')) return true;
  // The skin's own frames carry no `.panel` class: the Village scene is a bare
  // `<section>`, and it is a panel to the player in every way that matters.
  return el.matches?.(FRAME) || !!el.querySelector?.(FRAME);
}

/** The flex/grid item is whichever ancestor is a direct child of the container.
 *  Measured live it is the `.panel` itself in every case, but a wrapper is what
 *  claude/probe-panel-order.js was written to detect, so resolve it rather than
 *  assuming. */
function itemFor(panel, container) {
  let cur = panel;
  while (cur && cur.parentElement && cur.parentElement !== container) cur = cur.parentElement;
  return cur?.parentElement === container ? cur : null;
}

/** `order` is honoured only by a flex or grid container. In a block container —
 *  a Tailwind `space-y-*` stack, which this app does use elsewhere — it is
 *  silently inert, which reads exactly like a broken CSS rule. */
function honoursOrder(el) {
  const display = el.ownerDocument.defaultView?.getComputedStyle(el).display || '';
  return /^(flex|inline-flex|grid|inline-grid)$/.test(display);
}

/**
 * Every RENDERED container on the page that holds two or more reorderable
 * panels.
 *
 * Claiming the hidden mirror copy too looked harmless and is not. The scope
 * index is the container's position among the claimed set, and a hidden
 * container measures `{0,0}` — so it sorts FIRST, and every visible container
 * behind it shifts by one. Which copy is hidden swaps at 1280px, so the same
 * column would own different scope keys at different widths and the player's
 * saved arrangement would be orphaned by a resize.
 *
 * `preferRendered` rather than a hard filter: jsdom lays nothing out, so a hard
 * filter would leave every test fixture claiming nothing at all (Viewport.js
 * carries the same note). Crossing the breakpoint re-runs discovery through
 * `Viewport.startLayoutWatch` -> `DOMWatcher.discover()`, because a viewport
 * crossing mutates nothing and no flush would otherwise arrive.
 */
function discoverContainers(root) {
  // Containers are found from the game's own `.panel` primitive, which is the
  // one durable hook that reliably marks a real card.
  const panels = [...root.querySelectorAll('.panel')].filter(panel => !panel.querySelector('.panel'));
  const containers = new Set();
  for (const panel of panels) {
    const container = panel.parentElement;
    if (!container || container === root) continue;
    // The page SHELL also holds `.panel`s — the header, the nav rail and the
    // zone bar are all `.panel`s — so it looks like a column. Its `<header>`
    // child is what tells them apart, and unlike the `data-iw-ui` marks on the
    // nav and zone bar it is there from the first paint rather than after the
    // classifiers run.
    if (container.querySelector(':scope > header')) continue;
    if (itemFor(panel, container) && honoursOrder(container)) containers.add(container);
  }

  const out = [];
  for (const container of containers) {
    // EVERY direct child, not only the movable ones. A child left without a
    // slot keeps `order: 0`, and slot 0 is a real slot, so it ties with
    // whichever panel the player put first and jumps to the top of the column.
    // That is exactly how the Village scene ended up above Current Action.
    const items = [...container.children].map(el => ({
      el,
      key: itemKey(el),
      movable: isMovable(el),
    }));
    if (items.filter(item => item.movable && item.key).length < 2) continue;
    out.push({ container, items });
  }
  // The list form of the rendered tie-break: drop the hidden mirror copy, but
  // never empty the list doing it.
  const live = out.filter(entry => isRendered(entry.container));
  return live.length ? live : out;
}

/* ── Scope ────────────────────────────────────────────────────────────────
 *
 * One arrangement per route, per layout, per container. The two layouts cannot
 * share one list: measured live, the wide layout is TWO independent columns of
 * four and three panels, and the narrow layout is ONE grid holding all seven.
 * A wide arrangement is simply not expressible as a narrow one, so the player
 * gets to arrange each.
 */
function layoutKey(view) {
  return view?.matchMedia?.('(min-width: 1280px)').matches ? 'wide' : 'narrow';
}

/**
 * A container's index within its layout, by painted position: left-to-right
 * then top-to-bottom, with DOM order as the tie-break so a layout-less test DOM
 * (every rect is zero in jsdom) still produces a stable, repeatable answer.
 */
function scopeFor(entries, index, view) {
  const route = view?.location?.pathname || '/';
  return `${route}|${layoutKey(view)}|${index}`;
}

function sortContainers(entries) {
  return entries
    .map((entry, domIndex) => {
      const rect = entry.container.getBoundingClientRect?.() || { left: 0, top: 0 };
      return { entry, domIndex, left: Math.round(rect.left), top: Math.round(rect.top) };
    })
    .sort((a, b) => a.left - b.left || a.top - b.top || a.domIndex - b.domIndex)
    .map(row => row.entry);
}

/* ── Storage ─────────────────────────────────────────────────────────────── */

function loadPreferences() {
  if (preferences) return loading;
  preferences = new Map();
  loading = storageGet(STORE_KEY).then(bag => {
    if (!bag || typeof bag !== 'object' || bag.v !== 1) return;
    for (const [scope, keys] of Object.entries(bag.scopes || {})) {
      if (Array.isArray(keys) && !touched.has(scope)) preferences.set(scope, keys.filter(k => typeof k === 'string'));
    }
  }).catch(err => warnOnce('panel-order:load', err)).then(() => {
    // The read resolves AFTER the first pass has already run with an empty
    // preference map, and nothing about a resolved promise produces a mutation,
    // so there may be no flush left to apply the arrangement on. Without this
    // re-run the player's layout silently reverts on every page load — the same
    // "a data-iw-* write is invisible to the observer" consequence that makes
    // the mode toggle call the pass directly.
    if (preferences?.size) decoratePanelOrder(document);
  });
  return loading;
}

function persist() {
  const scopes = {};
  for (const [scope, keys] of preferences) if (keys.length) scopes[scope] = keys;
  void storageSet(STORE_KEY, { v: 1, scopes });
}

/* ── The arrangement ─────────────────────────────────────────────────────── */

/**
 * Apply a saved key order to the items actually present.
 *
 * Only items whose key appears in the saved list take part. Everything else —
 * a panel the game added since, one whose heading changed, one the skin has not
 * classified yet — keeps the slot it already had, because the known items are
 * redistributed across the slots THEY occupied rather than across all of them.
 * That is what makes a missing key cost one panel's position instead of
 * scrambling the container.
 */
function arrange(items, savedKeys) {
  if (!savedKeys?.length) return items;
  const rank = new Map(savedKeys.map((key, i) => [key, i]));
  const slots = [];
  const movable = [];
  items.forEach((item, index) => {
    if (item.movable && item.key && rank.has(item.key)) { slots.push(index); movable.push(item); }
  });
  if (movable.length < 2) return items;
  movable.sort((a, b) => rank.get(a.key) - rank.get(b.key));
  const out = [...items];
  slots.forEach((slot, i) => { out[slot] = movable[i]; });
  return out;
}

/** Accepts either a `{el, key}` row or a bare element: `moveItem` is called
 *  from the keyboard handler with the element it found, and from the pass with
 *  a row, and a mismatch here threw AFTER the preference had been persisted —
 *  so the arrangement was saved and then never applied. */
function describe(item) {
  const el = item?.el || item;
  const heading = el?.querySelector?.('h1, h2, h3, h4, [role="heading"]');
  return labelText(heading) || labelText(el).slice(0, 32) || 'panel';
}

/* ── The handle ──────────────────────────────────────────────────────────── */

/**
 * One grab surface per panel, created only while the mode is on.
 *
 * It covers the whole panel (`position: absolute; inset: 0` in the sheet) so
 * there is no gutter to negotiate with the collapse toggle and no game control
 * underneath it to mis-click. Being out of flow it is also invisible to
 * SkillPanelRenderer's `unexpectedFlowChild`, which refuses the three-zone
 * layout for any in-flow child larger than 2x2 — the same reason
 * CollapsibleFrames positions its toggle absolutely.
 *
 * Every attribute is set BEFORE insertion, so the append costs exactly one
 * mutation record and nothing afterwards.
 */
function ensureHandle(item) {
  let handle = item.querySelector(`:scope > [${HANDLE_ATTR}]`);
  if (handle) return handle;
  handle = item.ownerDocument.createElement('button');
  handle.type = 'button';
  handle.setAttribute(HANDLE_ATTR, '1');
  const chip = item.ownerDocument.createElement('span');
  chip.setAttribute('data-iw-order-chip', '1');
  handle.append(chip);
  handle.addEventListener('keydown', onHandleKey);
  handle.addEventListener('pointerdown', onHandlePointerDown);
  item.append(handle);
  return handle;
}

function setText(el, text) {
  // `textContent` is a replace-all, so a same-value assignment still emits a
  // childList record — the trap that drove a ~790/sec reconcile loop once.
  if (el.textContent !== text) el.textContent = text;
}

function labelHandle(handle, item, position, total) {
  const name = describe(item);
  const text = `${name} — ${position} of ${total}`;
  const aria = `Move ${name}. Position ${position} of ${total}. Use the up and down arrow keys.`;
  if (handle.getAttribute('aria-label') !== aria) handle.setAttribute('aria-label', aria);
  if (handle.getAttribute('title') !== aria) handle.setAttribute('title', aria);
  const chip = handle.firstElementChild;
  if (chip) setText(chip, text);
}

function announce(message) {
  const doc = document;
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = doc.createElement('div');
    liveRegion.setAttribute('data-iw-order-live', '1');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('role', 'status');
    doc.body.append(liveRegion);
  }
  setText(liveRegion, message);
}

/* ── Moving ──────────────────────────────────────────────────────────────── */

function onHandleKey(event) {
  // Escape abandons a pointer drag and puts the panel back where it started,
  // which is the only way out once a drag is in flight over a captured pointer.
  if (event.key === 'Escape' && drag) {
    event.preventDefault();
    endDrag(false);
    announce('Move cancelled.');
    return;
  }
  const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1
    : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1
      : event.key === 'Home' ? -Infinity
        : event.key === 'End' ? Infinity
          : 0;
  if (!delta) return;
  event.preventDefault();
  event.stopPropagation();
  const item = event.currentTarget.parentElement;
  if (moveItem(item, delta)) {
    // Re-running the pass synchronously is required, not an optimisation: a
    // `data-iw-*` write is invisible to DOMWatcher by design, so nothing here
    // would produce a flush to repaint on.
    decoratePanelOrder(document);
    event.currentTarget.focus();
  }
}

/**
 * Move one item within its container and persist the result.
 *
 * The new order is written from the PREFERENCE, never re-derived from measured
 * geometry. A geometric derivation would read rects, decide an order, write it,
 * change the rects and read again — a self-driving loop of exactly the kind
 * this project has paid for twice.
 */
export function moveItem(item, delta) {
  const context = contextFor(item);
  if (!context) return false;
  const { scope, rows } = context;
  // Stepped over the MOVABLE panels only, so an arrow key never spends a press
  // swapping with a spacer the player cannot see.
  const movable = rows.filter(row => row.movable && row.key);
  const at = movable.findIndex(row => row.el === item);
  if (at < 0) return false;
  let to = delta === -Infinity ? 0 : delta === Infinity ? movable.length - 1 : at + delta;
  to = Math.max(0, Math.min(movable.length - 1, to));
  if (to === at) {
    announce(`${describe(movable[at])} is already ${at === 0 ? 'first' : 'last'}.`);
    return false;
  }
  const next = [...movable];
  next.splice(to, 0, next.splice(at, 1)[0]);
  commitSequence(scope, next);
  announce(`${describe(item)} moved to position ${to + 1} of ${movable.length}.`);
  return true;
}

/** The items of one container in the order they are CURRENTLY shown. */
function currentOrder(entry, scope) {
  // `entry.items` already carries {el, key, movable} from discoverContainers —
  // re-deriving the key here would also re-run itemKey() on every child of
  // every container on every flush.
  return arrange(entry.items, preferences?.get(scope));
}

/** Write the slot attributes for one sequence. Clamped, never wrapped: an item
 *  past the declared slot count keeps the last one, because falling back to
 *  `order: 0` would send it to the FRONT. */
function applySlots(rows) {
  rows.forEach((row, position) => {
    const slot = String(Math.min(position, ORDER_SLOTS - 1));
    if (row.el.getAttribute(ITEM_ATTR) !== slot) row.el.setAttribute(ITEM_ATTR, slot);
  });
}

/**
 * Apply a candidate sequence the way it will actually SETTLE.
 *
 * Only keyed rows can be stored, and `arrange()` puts unkeyed rows back at
 * their own index — so applying a raw drag sequence directly would show the
 * player one result and produce another the moment the next pass ran. Both
 * paths therefore derive the key list and then re-run `arrange()` over it, so
 * the preview IS the committed answer by construction.
 */
function keysOf(rows) {
  return rows.filter(row => row.movable && row.key).map(row => row.key);
}

function applyArrangement(rows, keys) {
  const settled = arrange(rows, keys);
  applySlots(settled);
  return settled;
}

function commitSequence(scope, rows) {
  preferences.set(scope, keysOf(rows));
  touched.add(scope);
  persist();
}

/** The container entry, its scope and its displayed rows, for one item. */
function contextFor(item) {
  const container = item?.parentElement;
  if (!container) return null;
  const entries = sortContainers(discoverContainers(document));
  const index = entries.findIndex(entry => entry.container === container);
  if (index < 0) return null;
  const scope = scopeFor(entries, index, item.ownerDocument.defaultView || window);
  return { container, scope, rows: currentOrder(entries[index], scope) };
}

/* ── Pointer dragging ─────────────────────────────────────────────────────
 *
 * There is deliberately NO element following the cursor. Measured: every
 * CHANGED inline-style write inside `document.body` emits a mutation record,
 * which queues a classify pass AND a whole-document OverlayFramer sweep, so a
 * ghost repositioned at 60fps would be 60 of each per second — and gating that
 * sweep was already tried, measured and rejected (CLAUDE.md).
 *
 * What moves instead is the LAYOUT. A drag rewrites the same `data-iw-order`
 * attributes the keyboard path writes, and those cost 0 mutation records, so
 * the panels reflow live under the pointer for free. That is also better
 * feedback than a ghost: the player sees the arrangement itself, not a picture
 * of one.
 *
 * The insertion index is computed from geometry CAPTURED AT DRAG START, never
 * from live rects. Re-measuring each frame would be a feedback loop in the
 * literal sense — the reflow this move causes would change the rects the next
 * move reads, and the item would oscillate between two slots. Item heights do
 * not change when their order does, so the captured heights stay true for the
 * whole drag, and one `getBoundingClientRect` per drag replaces one per frame.
 */

/** Pixels the pointer must travel before a press becomes a drag, so a plain
 *  click on the grab surface stays a click. */
const DRAG_THRESHOLD = 5;
/** Distance from the viewport edge at which a drag starts scrolling the page,
 *  and the most it scrolls per frame. The dashboard column is ~1,800px tall on
 *  a real account, so a drag from bottom to top cannot be done without this. */
const EDGE_BAND = 90;
const EDGE_SPEED = 22;

let drag = null;

function onHandlePointerDown(event) {
  // Primary button only; every other button belongs to the browser's own menus.
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (drag) return;
  const handle = event.currentTarget;
  const item = handle.parentElement;
  const context = contextFor(item);
  if (!context) return;
  const at = context.rows.findIndex(row => row.el === item);
  if (at < 0 || context.rows.length < 2) return;

  const view = item.ownerDocument.defaultView || window;
  const styles = view.getComputedStyle(context.container);
  const gap = parseFloat(styles.rowGap) || parseFloat(styles.gap) || 0;
  const rect = context.container.getBoundingClientRect();

  drag = {
    pointerId: event.pointerId,
    handle,
    item,
    view,
    ...context,
    // Page coordinates, so the capture survives the autoscroll below — a page
    // scroll moves clientY but never pageY.
    contentTop: rect.top + view.scrollY + (parseFloat(styles.paddingTop) || 0),
    gap,
    heights: context.rows.map(row => row.el.getBoundingClientRect().height),
    from: at,
    index: at,
    startX: event.clientX,
    startY: event.clientY,
    clientY: event.clientY,
    started: false,
    frame: 0,
  };

  handle.setPointerCapture?.(event.pointerId);
  handle.addEventListener('pointermove', onHandlePointerMove);
  handle.addEventListener('pointerup', onHandlePointerUp);
  handle.addEventListener('pointercancel', onHandlePointerUp);
  handle.addEventListener('lostpointercapture', onHandlePointerUp);
}

/** Where the dragged item would land if it were dropped at this page Y. */
function indexAt(pageY) {
  const others = drag.rows
    .map((row, i) => ({ row, height: drag.heights[i] }))
    .filter((_, i) => i !== drag.from);
  let edge = drag.contentTop;
  let index = 0;
  for (const other of others) {
    if (pageY <= edge + other.height / 2) break;
    index += 1;
    edge += other.height + drag.gap;
  }
  return index;
}

function sequenceFor(index) {
  const next = drag.rows.filter((_, i) => i !== drag.from);
  next.splice(index, 0, drag.rows[drag.from]);
  return next;
}

function updateDrag() {
  const index = indexAt(drag.clientY + drag.view.scrollY);
  if (index === drag.index) return;
  drag.index = index;
  const next = sequenceFor(index);
  applyArrangement(drag.rows, keysOf(next));
}

function autoscroll() {
  if (!drag?.started) return;
  const height = drag.view.innerHeight;
  const y = drag.clientY;
  let step = 0;
  if (y < EDGE_BAND) step = -EDGE_SPEED * (1 - y / EDGE_BAND);
  else if (y > height - EDGE_BAND) step = EDGE_SPEED * (1 - (height - y) / EDGE_BAND);
  if (step) {
    drag.view.scrollBy(0, step);
    updateDrag();
  }
  drag.frame = drag.view.requestAnimationFrame(autoscroll);
}

function onHandlePointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.clientY = event.clientY;
  if (!drag.started) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
    drag.started = true;
    // Both are `data-iw-*`, so the lifted treatment and the grabbing cursor
    // cost nothing to switch on.
    drag.item.setAttribute('data-iw-order-drag', 'source');
    drag.container.setAttribute('data-iw-order-dragging', '1');
    drag.frame = drag.view.requestAnimationFrame(autoscroll);
  }
  // The pointer is captured, so this fires even over another panel or off the
  // window entirely — no document-level listener is needed, and nothing else on
  // the page sees these events.
  event.preventDefault();
  updateDrag();
}

function endDrag(commit) {
  if (!drag) return;
  const { handle, view, frame, item, container, scope, index, from, started } = drag;
  if (frame) view.cancelAnimationFrame(frame);
  handle.removeEventListener('pointermove', onHandlePointerMove);
  handle.removeEventListener('pointerup', onHandlePointerUp);
  handle.removeEventListener('pointercancel', onHandlePointerUp);
  handle.removeEventListener('lostpointercapture', onHandlePointerUp);
  const all = drag.rows;
  const rows = sequenceFor(commit ? index : from);
  drag = null;
  item.removeAttribute('data-iw-order-drag');
  container.removeAttribute('data-iw-order-dragging');
  applyArrangement(all, keysOf(rows));
  if (!started) return;
  if (commit && index !== from) {
    commitSequence(scope, rows);
    const movable = keysOf(rows);
    announce(`${describe(item)} moved to position ${movable.indexOf(itemKey(item)) + 1} of ${movable.length}.`);
  }
  // Focus follows the drop so the keyboard path can continue from where the
  // pointer left off, which is the whole reason the two share a control.
  handle.focus?.();
}

function onHandlePointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  endDrag(event.type === 'pointerup' || event.type === 'lostpointercapture');
}

/* ── The pass ────────────────────────────────────────────────────────────── */

export function isRearrangeMode(doc = document) {
  return doc.documentElement.dataset[MODE_ATTR] === '1';
}

/**
 * Toggle the mode.
 *
 * The flag lives on `<html>`, which is OUTSIDE `document.body` — the single
 * observer's only root — so turning the mode on or off produces no mutation
 * record at all. That is also why the pass has to be invoked directly here
 * rather than waited for.
 */
export function setRearrangeMode(on, doc = document) {
  const root = doc.documentElement;
  if (on) root.dataset[MODE_ATTR] = '1';
  else delete root.dataset[MODE_ATTR];
  decoratePanelOrder(doc);
  announce(on
    ? 'Rearrange mode on. Tab to a panel and use the arrow keys to move it.'
    : 'Rearrange mode off.');
}

export function resetPanelOrder(doc = document) {
  if (!preferences) return;
  for (const scope of [...preferences.keys()]) { preferences.set(scope, []); touched.add(scope); }
  persist();
  decoratePanelOrder(doc);
  announce('Panel arrangement reset.');
}

export function decoratePanelOrder(root = document) {
  void loadPreferences();
  if (!preferences) return;
  const doc = root.ownerDocument || root;
  const view = doc.defaultView || window;
  const mode = isRearrangeMode(doc);
  const entries = sortContainers(discoverContainers(root));
  const liveItems = new Set();

  entries.forEach((entry, index) => {
    const { container } = entry;
    if (container.getAttribute(CONTAINER_ATTR) !== '1') container.setAttribute(CONTAINER_ATTR, '1');
    const scope = scopeFor(entries, index, view);
    const items = currentOrder(entry, scope);
    items.forEach(item => liveItems.add(item.el));
    // A drag holds a PREVIEW of an arrangement that is not in preferences yet,
    // so re-deriving this container's slots mid-drag would snap the panel back
    // to where it started on the next flush the game happens to emit.
    if (drag?.container === container) return;
    applySlots(items);
    if (!mode) return;
    const movable = items.filter(item => item.movable);
    items.forEach(item => {
      // A child that is not a frame — a spacer, a divider, something the game
      // put between the cards — still holds a slot so it cannot jump, but it
      // is not something the player picks up, so it gets no treatment at all.
      if (!item.movable) {
        item.el.querySelector(`:scope > [${HANDLE_ATTR}]`)?.remove();
        if (item.el.hasAttribute('data-iw-order-fixed')) item.el.removeAttribute('data-iw-order-fixed');
        return;
      }
      // A panel with no stable identity gets NO grab surface. It can be moved
      // on screen — nothing stops the attribute being written — but `arrange()`
      // has no name to remember it by, so the next pass puts it back. Offering
      // a handle that appears to work and then silently reverts is worse than
      // offering none, so the panel is marked as pinned instead.
      if (!item.key) {
        item.el.querySelector(`:scope > [${HANDLE_ATTR}]`)?.remove();
        if (item.el.getAttribute('data-iw-order-fixed') !== '1') item.el.setAttribute('data-iw-order-fixed', '1');
        return;
      }
      if (item.el.hasAttribute('data-iw-order-fixed')) item.el.removeAttribute('data-iw-order-fixed');
      labelHandle(ensureHandle(item.el), item, movable.indexOf(item) + 1, movable.length);
    });
  });

  // A panel that left a container, or the whole mode being switched off, has to
  // give the handle back. Keyed on the ITEM rather than on whether this pass
  // re-tagged it, because a container that rebuilds its children drops the mark
  // for one frame and keying on the button would read that gap as "gone".
  for (const handle of root.querySelectorAll(`[${HANDLE_ATTR}]`)) {
    if (mode && liveItems.has(handle.parentElement)) continue;
    handle.remove();
  }
}

export function clearPanelOrder(root = document) {
  // A drag in flight owns a captured pointer and an animation frame; the kill
  // switch has to take both back before the handle it is bound to is removed.
  if (drag) endDrag(false);
  root.querySelectorAll('[data-iw-order-drag], [data-iw-order-dragging], [data-iw-order-fixed]').forEach(el => {
    el.removeAttribute('data-iw-order-drag');
    el.removeAttribute('data-iw-order-dragging');
    el.removeAttribute('data-iw-order-fixed');
  });
  root.querySelectorAll(`[${HANDLE_ATTR}]`).forEach(el => { el.remove(); });
  root.querySelectorAll(`[${ITEM_ATTR}]`).forEach(el => { el.removeAttribute(ITEM_ATTR); });
  root.querySelectorAll(`[${CONTAINER_ATTR}]`).forEach(el => { el.removeAttribute(CONTAINER_ATTR); });
  root.querySelectorAll('[data-iw-order-live]').forEach(el => { el.remove(); });
  const doc = root.ownerDocument || root;
  delete doc.documentElement?.dataset[MODE_ATTR];
  liveRegion = null;
  // The player's arrangement is theirs and survives a kill-switch round trip,
  // exactly like their collapsed panels; only the in-memory cache is dropped so
  // the next activation re-reads storage.
  preferences = null;
  loading = null;
  touched.clear();
}

/** Exported for the tests: `isRendered` is the sanctioned way to tell which
 *  mirror copy is live, and this module's scope index depends on it. */
export const __testing = { itemKey, arrange, discoverContainers, layoutKey, isRendered };
