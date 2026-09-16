# Current Action progress smoothing

The transition that cancels the game's one-tick head start, and what the tick measurement must ignore. Logic now lives in `src/modules/ProgressCadence.js`.

Moved verbatim from CLAUDE.md on 2026-09-15. "This file" in the text below
means that original CLAUDE.md, and a "note below/above" may now live in another
file under `docs/traps/`. The short rules in CLAUDE.md link here.

**The Current Action bar's one-tick head start is fixed by a TRANSITION, not by
recomputing progress.** The game writes the fill's `width: N%` once per tick and
the value it writes is the progress at the END of the tick that just started, so
the bar renders a staircase whose first step is already a whole tick in ("it
starts at 1s elapsed, not 0s"). A LINEAR transition on
`[data-iw-panel-part="progress"] > *` whose duration EQUALS the tick does not
merely soften that staircase, it cancels the offset exactly: at tick k the game
sets `(k+1)/T`, the transition runs from the previous target `k/T` to `(k+1)/T`
over one tick, so the width shown at time t is `k/T + (t-k)/T = t/T` — the true
elapsed fraction at every instant. The skin therefore never computes or writes a
progress value; the action's duration (housing tier and the rest) stays entirely
the game's, which is also rule 5. Three things this depends on:

- **The duration must be the real update interval.** Guess it long and the bar
  lags every step; guess it short and it completes early and stalls. So
  `UIFoundation.smoothActionProgress()` measures the interval between actual
  width WRITES (median of five, ignoring flushes where the width did not
  change) and writes it CONTINUOUSLY — as an inline `--iw-progress-duration`
  custom property on the track, not a snap to one of a few fixed buckets — with
  a `PROGRESS_LEAD_BIAS` (1.12x) baked in. The bias exists because a duration
  that matches the measured tick EXACTLY still visibly stutters: real per-tick
  timing jitters around its nominal value (live capture: a "250ms" tick
  actually landed anywhere from 208-335ms), so an exact-match transition
  finishes early roughly half the time and the bar sits dead-still for the
  remainder before the next real update arrives. Overshooting slightly means
  the transition is almost always still in flight when that update lands, so
  the browser smoothly RETARGETS it — continuous velocity change, no
  positional jump or pause — and it never compounds, because every real update
  still snaps the target to the server's own value; any instant the bar is
  fractionally behind self-corrects at the very next tick. `--iw-action-tick`
  in `base.css` is only the pre-measurement fallback, used before a panel has
  the 3 samples `commitProgressDuration()` needs. `claude/probe-action-progress.js`
  is the read-only capture that reports the live tick, the step size, the
  derived action duration and whether the head start is really one whole step.
- **The completion reset is not a tick.** Once per action the width drops back
  to the start of the next repetition; interpolating THAT slides the bar
  backwards across a whole tick over an action already running.
  `smoothActionProgress` tags the drop `data-iw-progress-reset` (released on the
  next frame, not the next flush — a whole tick of suppression would un-smooth
  the new action's first step) and the CSS snaps instead.
- **The reset tag rides on `data-iw-*`; the duration deliberately does NOT.**
  DOMWatcher observes with the eight-entry `attributeFilter` below, so a
  `data-iw-*` write is
  invisible to it (that's why `data-iw-progress-reset` is one) but a `style`
  write is not: `commitProgressDuration()` writing `--iw-progress-duration`
  inline DOES queue an `attr:style` context on that node every time the
  duration actually moves. That was a real reason the earlier bucketed design
  avoided any inline write at all, and it is still true here — the difference
  is what the induced re-entrant `smoothActionProgress()` call does: it reads
  the SAME `pct` as before and returns immediately via the epsilon guard, so
  the extra flush is bounded to one harmless pass through classifiers that are
  already on their cached fast path (the flush-path caching work elsewhere in
  this file), not a new category of cost or a loop. `PROGRESS_DURATION_EPSILON_MS`
  (15ms) additionally skips the write on ordinary jitter around a stable rate,
  so most ticks of a settled action cause no extra flush at all.

`base.css` already carries a blanket `* { transition: none !important }` under
`prefers-reduced-motion`, but `ui-system.css` is injected LAST and its selector
is more specific, so the opt-out has to be restated there.

**A completion's OWN first tick is a second anomaly the measurement must not
learn from either.** `claude/probe-action-progress.js` against a real session
(2026-09) confirmed the design above — steady tick and step size agreed with
the derived action duration to within measurement noise, and the value written
right after a reset really did sit ~one step above a linear back-extrapolation
of the surrounding ticks. But it also turned up something the design didn't
anticipate: the gap between the reset write and the FIRST write of the new
action was consistently ~2x the steady tick (~500ms against a steady 250ms),
across every single completion in the capture. `smoothActionProgress` used to
compute that delta the same as any other and push it straight into the
5-sample window feeding the bucket median — on a long action (many ticks per
cycle) enough clean samples buried it, but on a SHORT action (a fast, low
housing-tier action, few ticks per cycle) that one polluted sample can be half
the window, and the median swings to the wrong bucket right as the action
resumes — exactly the moment getting it right matters most. Worked out by hand
(a 5-entry median seeded with the poisoned delta) and reproduced in
`tests/smoke.test.mjs`: three cycles of [reset, poison tick, steady tick]
flips the unfixed algorithm to the wrong bucket right after the third cycle's
poison tick, before that cycle's own steady tick can correct it. The fix is
`state.afterReset`: set on a reset, it excludes exactly the ONE delta that
spans the reset (the delta AFTER that one is a real interval again, so
`state.at` still advances through it). Note for anyone re-measuring this test:
the fixture's OTHER Current Action panel (`current-action-no-queue-progress`)
had to be used, not the first one, because the drift/relabel test earlier in
this file deletes that first panel's `dataset.iwPanel` to simulate a React
remount and — a known, separate limitation of `classifyActivityPanels`'s
coverage tracking, which is keyed by panel SLUG rather than by host — never
gets it back, since some OTHER host already satisfies the 'current-action'
slug. Real wall-clock intervals in that test are scaled to ~1s/2s rather than
the true 250ms/500ms, specifically so this harness's own flush/rAF latency
(tens to low hundreds of ms, confirmed by a failed first attempt at this test)
cannot be mistaken for the signal under test.
