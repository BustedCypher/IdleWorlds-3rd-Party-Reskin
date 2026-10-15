/**
 * HydrationGate — hold the skin's FIRST boot until React has hydrated the page.
 *
 * The skin appends its own nodes into game containers. Doing that before React
 * finishes hydrating makes React throw #418 and client-render the whole tree
 * (see src/page/hydration-signal.js for the measurement). The page-world
 * signal script sets `data-iw-page-hydrated` on <html> once React's root has
 * hydrated; this module waits for that latch, then removes it.
 *
 * Never blocks for long: a hard timeout releases the boot regardless, so a
 * game update that changes React's internals (or a missing signal script)
 * degrades to today's behaviour plus at most TIMEOUT_MS of delay.
 *
 * Polls instead of observing: CLAUDE.md rule 4 allows exactly one
 * MutationObserver (DOMWatcher), and this runs before that one exists.
 *
 * TO REVERT: set HYDRATION_GATE_ENABLED = false (boot is then immediate,
 * exactly as before), and remove the hydration-signal entry from manifest.json.
 */

export const HYDRATION_GATE_ENABLED = true;
export const HYDRATION_ATTR = 'data-iw-page-hydrated';
const TIMEOUT_MS = 4000;
const POLL_MS = 50;

/**
 * Resolves with how the wait ended: '1' (hydrated), 'unknown' (signal could
 * not read React), 'timeout', or 'disabled'.
 */
export function waitForPageHydration({
  enabled = HYDRATION_GATE_ENABLED,
  timeoutMs = TIMEOUT_MS,
  pollMs = POLL_MS,
  root = document.documentElement,
} = {}) {
  if (!enabled || !root) return Promise.resolve({ state: 'disabled', waitedMs: 0 });
  const started = performance.now();
  return new Promise(resolve => {
    const finish = state => {
      if (root.hasAttribute(HYDRATION_ATTR)) root.removeAttribute(HYDRATION_ATTR);
      resolve({ state, waitedMs: Math.round(performance.now() - started) });
    };
    const poll = () => {
      const value = root.getAttribute(HYDRATION_ATTR);
      if (value) return finish(value);
      if (performance.now() - started >= timeoutMs) return finish('timeout');
      setTimeout(poll, pollMs);
    };
    poll();
  });
}

/** Teardown: never leave the page-world latch behind (rule 3). */
export function clearHydrationLatch(root = document.documentElement) {
  if (root?.hasAttribute(HYDRATION_ATTR)) root.removeAttribute(HYDRATION_ATTR);
}
