/**
 * Viewport
 *
 * The game ships its whole panel stack TWICE — a wide `hidden xl:grid`
 * two-column section and a narrow `xl:hidden` single-column section — and
 * Tailwind swaps which one is live at its `xl` breakpoint (1280px). Below
 * 1280px the "hidden duplicate" CLAUDE.md warns about is the REAL column;
 * the class name that used to gate this (`[class~="xl:hidden"]`) is only
 * correct above 1280px and exactly inverted below it.
 *
 * `isRendered`/`preferRendered` replace that class test with an actual
 * rendered-state check, so the answer is correct at every width without the
 * skin having to know the game's Tailwind config. This generalises the
 * tie-break `HeaderRenderer.isVisible`/`pickVisible` already used — same
 * reasoning, promoted here so every module shares one implementation.
 *
 * `layoutEpoch` is the second half of the fix: a viewport crossing a
 * breakpoint mutates NOTHING, so DOMWatcher's MutationObserver never sees it
 * and no classifier is ever asked to re-resolve. `onLayoutChange` watches the
 * game's own Tailwind breakpoints via `matchMedia` (cheap: it only fires on a
 * crossing, not on every pixel of a drag) and bumps a counter every consumer
 * can fold into its cache-validity check.
 */

/**
 * Is `el` actually painting right now?
 *
 * A TIE-BREAK only, never a hard filter — jsdom lays nothing out, so every
 * rect there is `{w:0,h:0}` too, and a hard filter would make every test
 * fixture fail to resolve anything (see HeaderRenderer.js's own note on this).
 * `checkVisibility()` (Chrome 105+; manifest targets chrome109) already
 * returns false across a `display:none` ancestor, which is exactly the
 * column-swap case, so no options object is needed. `getBoundingClientRect`
 * is the fallback for anything older or absent (e.g. a detached node).
 */
export function isRendered(el) {
  if (!el?.isConnected) return false;
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  const rect = el.getBoundingClientRect?.();
  return !!rect && (rect.width > 0 || rect.height > 0);
}

/** First rendered candidate, or the first candidate if none appear rendered
 * (the jsdom/tie-break fallback above, applied to a single pick). */
export function pickRendered(candidates) {
  return candidates.find(isRendered) || candidates[0] || null;
}

/** Filter a candidate list down to the rendered ones — UNLESS that would
 * empty it, in which case return the list unchanged. This is the list form
 * of the same tie-break: a real page has some candidates strictly hidden
 * (the mirror column) and some rendered (the live one), so filtering is safe
 * there; a layout-less test DOM has none rendered, so filtering would wrongly
 * discard everything. */
export function preferRendered(candidates) {
  const live = candidates.filter(isRendered);
  return live.length ? live : candidates;
}

/* ── Layout epoch ──────────────────────────────────────────────────────── */

// Tailwind's default breakpoints, ascending. `xl` (1280) is the one that
// matters for the panel-column swap; the others are watched too because a
// route/component the skin doesn't classify column-wise may still key its own
// layout off them, and the epoch is a cheap single counter shared by everyone.
const BREAKPOINTS = [640, 768, 1024, 1280, 1536];

let layoutEpoch = 0;
let queries = [];
let bumpHandler = null;

/** Current layout epoch. Bump-only counter; compare with `!==`, never diff. */
export function getLayoutEpoch() {
  return layoutEpoch;
}

/**
 * Start watching the game's breakpoints. Idempotent — a second call while
 * already watching is a no-op, matching DOMWatcher's own start/stop shape.
 * `onCross` fires once per breakpoint crossing (not on every resize pixel)
 * and is left to the caller — DOMWatcher wires it to an `iw:dom-flush` so
 * every classifier's normal re-resolution path picks up the epoch bump for
 * free, without inventing a second event type.
 */
export function startLayoutWatch(onCross) {
  if (queries.length) return;
  if (typeof matchMedia !== 'function') return; // jsdom without a shim, or SSR
  bumpHandler = () => {
    layoutEpoch += 1;
    onCross?.();
  };
  queries = BREAKPOINTS.map(px => matchMedia(`(min-width: ${px}px)`));
  for (const mq of queries) {
    // addEventListener is broadly supported at the chrome109 target; no need
    // for the legacy addListener fallback older Safari needed.
    mq.addEventListener('change', bumpHandler);
  }
}

/** Stop watching and drop the listeners. Does NOT reset the epoch — a
 * consumer's cached `entry.epoch` staying behind the live counter after a
 * restart is exactly the "stale, re-resolve" case it already has to handle. */
export function stopLayoutWatch() {
  for (const mq of queries) mq.removeEventListener('change', bumpHandler);
  queries = [];
  bumpHandler = null;
}
