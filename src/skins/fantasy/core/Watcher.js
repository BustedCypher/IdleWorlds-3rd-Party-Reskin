/**
 * Watcher — the Fantasy profile's ONE MutationObserver (rule 4), budgeted to
 * one pass per animation frame.
 *
 * Legacy's DOMWatcher carries skill detection, inventory queues and name
 * scans Fantasy does not use, so this is a small rewrite with the same
 * contract, not a copy:
 *   - the usual eight state attributes plus the port's item identity and theme-toggle
 *     state (Fantasy never writes that attribute). Other `data-iw-*` writes
 *     remain invisible, so the skin cannot drive its own flush loop;
 *   - structural changes (childList, a watched attribute) schedule `onFlush`;
 *   - text ticks schedule `onText(parents)` ONLY, never a full pass
 *     (CLAUDE.md: "Text ticks never emit iw:dom-flush");
 *   - a Tailwind breakpoint crossing (Viewport.startLayoutWatch) schedules a
 *     full pass, because it mutates nothing.
 *
 * Callbacks are called directly, not through `iw:*` document events: on the
 * live Fantasy theme the game's native port runs the skin's own code and
 * dispatches those events itself.
 *
 * Mutations made entirely of the skin's own nodes (`data-iw-fantasy-owned`)
 * are dropped, so inserting a decoration does not schedule another pass.
 */

import { guard, raf } from './Runtime.js';
import { startLayoutWatch, stopLayoutWatch } from './Viewport.js';

export const OWNED_ATTR = 'data-iw-fantasy-owned';
const OWNED = `[${OWNED_ATTR}]`;

let observer = null;
let queued = false;
let structural = false;
const textParents = new Set();
let handlers = { onFlush: null, onText: null };

const isOwnedNode = n => n.nodeType === 1 && n.matches(OWNED);
const insideOwned = n => !!(n.nodeType === 1 ? n : n.parentElement)?.closest(OWNED);

function schedule() {
  if (queued) return;
  queued = true;
  raf(run);
}

function run() {
  queued = false;
  if (!observer) return;
  if (structural) {
    structural = false;
    textParents.clear(); // a full pass re-reads every text a text pass would
    guard('flush', () => handlers.onFlush?.());
    return;
  }
  if (textParents.size) {
    const parents = [...textParents];
    textParents.clear();
    guard('text-flush', () => handlers.onText?.(parents));
  }
}

function onMutations(records) {
  for (const m of records) {
    if (insideOwned(m.target)) continue;
    // Only the native action's jump title supplies state we copy. Other
    // tooltips can tick without scheduling a structural pass.
    if (m.type === 'attributes' && m.attributeName === 'title' && !m.target.closest('#current-action-panel')) continue;
    if (m.type === 'characterData') {
      if (m.target.parentElement) textParents.add(m.target.parentElement);
      continue;
    }
    if (m.type === 'childList') {
      const nodes = [...m.addedNodes, ...m.removedNodes];
      if (nodes.length && nodes.every(isOwnedNode)) continue;
      // A text-only replacement (React swapping a text node) is a text tick.
      if (nodes.length && nodes.every(n => n.nodeType === 3)) {
        textParents.add(m.target);
        continue;
      }
    }
    structural = true;
  }
  if (structural || textParents.size) schedule();
}

export function startWatcher({ onFlush, onText }) {
  if (observer) return;
  handlers = { onFlush, onText };
  observer = new MutationObserver(onMutations);
  observer.iwProfile = 'fantasy'; // lets a harness tell this observer from Legacy's
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'title', 'disabled', 'aria-disabled', 'aria-pressed', 'aria-selected', 'aria-current', 'data-state', 'data-iw-theme-toggle', 'data-iw-item', 'data-iw-item-name'],
  });
  guard('layout-watch', () => startLayoutWatch(() => { structural = true; schedule(); }));
  structural = true;
  schedule();
}

/** Run a full pass now (a network result carries no mutation). */
export function requestPass() {
  if (!observer) return;
  structural = true;
  schedule();
}

export function stopWatcher() {
  observer?.disconnect();
  observer = null;
  stopLayoutWatch();
  queued = false;
  structural = false;
  textParents.clear();
  handlers = { onFlush: null, onText: null };
}
