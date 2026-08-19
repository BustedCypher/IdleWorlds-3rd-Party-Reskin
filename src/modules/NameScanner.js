/**
 * NameScanner — non-destructive rewrite (Audit S1.4)
 *
 * WHAT CHANGED AND WHY
 * ────────────────────
 * The previous implementation found item names in the game's prose and did:
 *
 *     textNode.parentNode.replaceChild(span, textNode);
 *
 * React keeps a direct reference to every text node it created (fiber
 * `stateNode`). Two things follow from swapping one out:
 *
 *   1. On unmount React calls `parentInstance.removeChild(textNode)` for a node
 *      that is no longer a child of that parent — `NotFoundError`, and the
 *      surrounding React subtree can come down with it.
 *   2. On update React assigns `textInstance.nodeValue = next` to the detached
 *      node. That succeeds silently and the visible text never changes, which
 *      is the quieter and arguably worse failure.
 *
 * Either is a functionality change, which the project charter forbids. There is
 * no "careful" way to mutate React-owned text.
 *
 * So this module no longer touches the DOM at all. Instead it:
 *
 *   • records matches as live `Range` objects over the game's own text nodes,
 *   • paints them via the CSS Custom Highlight API (`::highlight(iw-item-name)`)
 *     — a pure paint-time effect with no DOM node behind it,
 *   • hit-tests the pointer against those ranges and drives the tooltip through
 *     TooltipEngine's virtual-anchor API.
 *
 * The game's DOM is now strictly read-only to this module.
 *
 * Graceful degradation: where `CSS.highlights` is unavailable the highlight is
 * skipped and tooltips still work, because hover is driven by range geometry
 * rather than by the highlight itself.
 */

import { ItemDatabase } from './ItemDatabase.js';
import { showForItem, hideTooltip, isTooltipOpen } from './TooltipEngine.js';
import { guard, raf, warnOnce } from './Runtime.js';

const HIGHLIGHT_NAME = 'iw-item-name';
const MIN_NAME_LENGTH = 3;

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'BUTTON', 'A', 'INPUT', 'TEXTAREA',
  'SELECT', 'OPTION', 'IW-TIP', 'CANVAS', 'SVG',
]);

/**
 * Containers whose text we never annotate.
 *
 * `.iw-item-ref` — already an explicit trigger.
 * `.fs-inv-row` / `.fs-skill-header` / `.iw-tip` — skin-owned surfaces.
 * The game's own tooltips are excluded at the scan-root level (see DOMWatcher):
 * decorating text inside a native tooltip is the most likely way to disturb its
 * measurement and positioning.
 */
const SKIP_CONTAINERS = '.iw-item-ref, .fs-inv-row, .fs-skill-header, .iw-tip, button, a, input, textarea, select, [role="button"]';

/* ── Trie ────────────────────────────────────────────────────────────── */

let _trie = null;
let _trieRevision = -1;

function buildTrie() {
  const items = ItemDatabase.all();
  if (!items.length) return null;
  const revision = ItemDatabase.revision();
  if (_trie && _trieRevision === revision) return _trie;

  const root = { children: new Map(), item: null };
  for (const item of items) {
    const name = item.name;
    if (!name || name.length < MIN_NAME_LENGTH) continue;
    insert(root, name.toLowerCase(), item);
  }

  _trie = root;
  _trieRevision = revision;
  return root;
}

function insert(root, lowerName, item) {
  let node = root;
  for (const ch of lowerName) {
    if (!node.children.has(ch)) node.children.set(ch, { children: new Map(), item: null });
    node = node.children.get(ch);
  }
  node.item = item;
}

function longestMatchAt(root, lowerText, start) {
  let node = root;
  let best = null;
  let i = start;

  while (i < lowerText.length) {
    const next = node.children.get(lowerText[i]);
    if (!next) break;
    node = next;
    i += 1;
    if (node.item) {
      const after = lowerText[i];
      if (after === undefined || !/[a-z0-9]/i.test(after)) {
        best = { length: i - start, item: node.item };
      }
    }
  }
  return best;
}

/* ── Match index ─────────────────────────────────────────────────────── */

/**
 * Text node → [{ start, end, item }]. A plain Map (not Weak) because we need to
 * enumerate it to rebuild the highlight; entries for disconnected nodes are
 * pruned on every rebuild, so it cannot grow without bound.
 */
const matchIndex = new Map();

function shouldSkipParent(el) {
  if (!el) return true;
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.closest?.(SKIP_CONTAINERS)) return true;
  return false;
}

function findMatches(text, trie) {
  const lower = text.toLowerCase();
  const out = [];
  let i = 0;

  while (i < lower.length) {
    const prev = lower[i - 1];
    if (i === 0 || !/[a-z0-9]/i.test(prev)) {
      const hit = longestMatchAt(trie, lower, i);
      if (hit && hit.length >= MIN_NAME_LENGTH) {
        out.push({ start: i, end: i + hit.length, item: hit.item });
        i += hit.length;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

/* ── Highlight painting ──────────────────────────────────────────────── */

const supportsHighlight = typeof CSS !== 'undefined'
  && typeof CSS.highlights !== 'undefined'
  && typeof Highlight !== 'undefined';

let rebuildQueued = false;

function queueHighlightRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  raf(() => {
    rebuildQueued = false;
    guard('name-scan:highlight', rebuildHighlight);
  });
}

function rebuildHighlight() {
  const ranges = [];

  for (const [node, matches] of [...matchIndex.entries()]) {
    if (!node.isConnected) {
      matchIndex.delete(node);
      continue;
    }
    const len = node.nodeValue ? node.nodeValue.length : 0;
    for (const m of matches) {
      // Text may have changed between scan and paint; a stale offset would
      // throw on setStart/setEnd.
      if (m.end > len) continue;
      const range = document.createRange();
      try {
        range.setStart(node, m.start);
        range.setEnd(node, m.end);
        ranges.push(range);
      } catch (err) {
        /* stale offset — drop this one silently */
      }
    }
  }

  if (!supportsHighlight) return;
  try {
    if (!ranges.length) CSS.highlights.delete(HIGHLIGHT_NAME);
    else CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  } catch (err) {
    warnOnce('name-scan:highlight-set', err);
  }
}

/* ── Pointer hit testing ─────────────────────────────────────────────── */

let hoverBound = false;
let activeItem = null;
let pointerQueued = false;
let lastX = 0;
let lastY = 0;

function rectContains(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Find the item whose matched range sits under the pointer.
 * Scoped to the hovered element's own text nodes, so cost is bounded by that
 * element rather than by the number of matches on the page.
 */
function hitTest(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || shouldSkipParent(el)) return null;

  for (const node of el.childNodes) {
    if (node.nodeType !== 3) continue;
    const matches = matchIndex.get(node);
    if (!matches || !matches.length) continue;

    const len = node.nodeValue ? node.nodeValue.length : 0;
    for (const m of matches) {
      if (m.end > len) continue;
      const range = document.createRange();
      try {
        range.setStart(node, m.start);
        range.setEnd(node, m.end);
      } catch (err) {
        continue;
      }
      for (const rect of range.getClientRects()) {
        if (rectContains(rect, x, y)) return { item: m.item, rect };
      }
    }
  }
  return null;
}

function handlePointer() {
  pointerQueued = false;
  const hit = hitTest(lastX, lastY);

  if (!hit) {
    if (activeItem) {
      activeItem = null;
      hideTooltip('name-scan');
    }
    return;
  }

  if (activeItem === hit.item && isTooltipOpen()) return;
  activeItem = hit.item;
  // The rect is captured per hit so the card tracks the exact matched word,
  // not the whole paragraph.
  showForItem(hit.item, () => {
    const fresh = hitTest(lastX, lastY);
    return fresh ? fresh.rect : hit.rect;
  }, 'name-scan');
}

function bindHover() {
  if (hoverBound) return;
  hoverBound = true;

  document.addEventListener('mousemove', e => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (pointerQueued) return;
    pointerQueued = true;
    raf(() => guard('name-scan:pointer', handlePointer));
  }, { passive: true, capture: true });

  // Any scroll invalidates the cached rect geometry.
  window.addEventListener('scroll', () => {
    if (activeItem) {
      activeItem = null;
      hideTooltip('name-scan');
    }
  }, { passive: true, capture: true });
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Index item names inside `root`. Read-only: no node is created, moved or
 * removed. Returns the number of matched text nodes.
 */
export function scanForItemNames(root) {
  if (!root || !root.isConnected) return 0;
  const trie = buildTrie();
  if (!trie) return 0;

  bindHover();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipParent(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let matchedNodes = 0;
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    if (!text || text.trim().length < MIN_NAME_LENGTH) {
      if (matchIndex.has(node)) matchIndex.delete(node);
      continue;
    }

    const matches = findMatches(text, trie);
    if (matches.length) {
      matchIndex.set(node, matches);
      matchedNodes += 1;
    } else if (matchIndex.has(node)) {
      matchIndex.delete(node);
    }
  }

  queueHighlightRebuild();
  return matchedNodes;
}

/** Drop every recorded match and clear the paint. Used by the kill switch. */
export function clearItemNameScan() {
  matchIndex.clear();
  activeItem = null;
  if (supportsHighlight) {
    try { CSS.highlights.delete(HIGHLIGHT_NAME); } catch (err) { /* no-op */ }
  }
}

/** Kept for compatibility with older callers. Scans are inherently repeatable. */
export function resetScanMark() {}
