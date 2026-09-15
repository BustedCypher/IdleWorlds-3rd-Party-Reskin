/**
 * ProgressCadence — the measurement half of smoothing a progress fill the
 * GAME writes in steps.
 *
 * Two surfaces have the same shape: the Current Action bar and the active
 * skill card's action-button fill. The game rewrites an inline `width: N%`
 * once per tick, and the skin turns the staircase into motion with a LINEAR
 * transition whose duration is the tick itself, so the skin never computes or
 * writes a progress value (rule 5). This module decides the two things that
 * transition needs, from the writes themselves:
 *
 *   1. how long a tick really is (median of the last five intervals between
 *      actual width CHANGES, overshot by PROGRESS_LEAD_BIAS);
 *   2. which single update per action is the completion RESET rather than a
 *      tick, so the fill snaps back instead of sliding backwards.
 *
 * It holds no DOM and writes nothing: callers own where the duration and the
 * reset tag live, and their teardown.
 */

// Below this the two widths are the same value re-written, not a tick.
export const PROGRESS_EPSILON = 0.05;

// The measured tick is deliberately overshot before it becomes a transition
// duration. A duration that matches the tick EXACTLY still stutters: real
// per-tick timing jitters (live capture: a nominal 250ms tick actually landed
// anywhere from 208-335ms), so an exact-match transition finishes early about
// half the time and the fill sits dead-still for the remainder of that tick
// before the next real update arrives. Overshooting means the transition is
// almost always still in flight when that update lands, so the browser
// smoothly RETARGETS it (continuous velocity change, no positional jump)
// instead of the fill visibly pausing and then jumping. 12% is small enough
// that it is never perceptibly slow, and it never compounds across ticks:
// each real update snaps the target to the game's own value.
export const PROGRESS_LEAD_BIAS = 1.12;

// A duration write is skipped below this threshold, so ordinary tick-to-tick
// jitter around a stable rate doesn't churn the caller's inline style (and
// the self-triggered flush that comes with it) every single update.
export const PROGRESS_DURATION_EPSILON_MS = 15;

export function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Feed one reading of the percentage the game is showing.
 *
 * `samples` is the caller's WeakMap and `key` the node its state belongs to.
 * Returns `{ reset, durationMs }`: `reset` is true on the one update that is a
 * completion, and `durationMs` is a new (already biased) transition duration
 * to write, or null when nothing should be written.
 */
export function sampleProgress(samples, key, pct, at = nowMs()) {
  const none = { reset: false, durationMs: null };
  if (pct === null || !Number.isFinite(pct)) return none;
  const state = samples.get(key);
  if (!state) {
    samples.set(key, { pct, at, deltas: [], afterReset: false });
    return none;
  }
  // A flush the width did not cause. Leaving `at` alone here is what makes
  // the delta below an interval between WRITES rather than between flushes.
  if (Math.abs(pct - state.pct) < PROGRESS_EPSILON) return none;

  const out = { reset: false, durationMs: null };
  if (pct < state.pct - PROGRESS_EPSILON) {
    out.reset = true;
    // A completion is not a tick: it says nothing about the interval, and
    // timing it would poison the median with the action's whole duration.
    // Live capture (claude/probe-action-progress.js) confirms the game's
    // first tick of a new action consistently takes roughly DOUBLE the
    // steady-state interval (measured: ~500ms vs a steady 250ms), so the
    // NEXT delta -- from this reset write to the first write of the new
    // action -- is equally unrepresentative and must not reach `deltas`
    // either. `afterReset` flags exactly that one upcoming delta for
    // exclusion below, while `state.at` still advances so the delta AFTER
    // that one measures real wall-clock time again.
    state.afterReset = true;
  } else {
    const delta = at - state.at;
    // Discard anything outside the plausible range for an update interval: a
    // sub-frame delta is two writes coalesced into one flush, a multi-second
    // one is a resumed/unpaused action rather than a tick, and the delta
    // spanning a completion is the anomalous post-reset gap described above.
    if (delta >= 60 && delta <= 4000 && !state.afterReset) {
      state.deltas.push(delta);
      if (state.deltas.length > 5) state.deltas.shift();
      // Three samples before committing, so one janked frame during boot
      // cannot pin the fill to the wrong duration for the rest of the session.
      if (state.deltas.length >= 3) {
        const ms = Math.min(4000, Math.max(60, median(state.deltas))) * PROGRESS_LEAD_BIAS;
        if (state.appliedDurationMs === undefined ||
            Math.abs(ms - state.appliedDurationMs) >= PROGRESS_DURATION_EPSILON_MS) {
          state.appliedDurationMs = ms;
          out.durationMs = ms;
        }
      }
    }
    state.afterReset = false;
  }
  state.pct = pct;
  state.at = at;
  return out;
}

export function formatDuration(ms) {
  return (ms / 1000).toFixed(3) + 's';
}
