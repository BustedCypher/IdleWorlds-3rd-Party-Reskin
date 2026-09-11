# Zone Control motion revision — 8 September 2026

The user's latest direction overrides the earlier all-static controlled state.
Battle effects should settle on capture; a calm crystal light remains. Design
decisions and implementation are authorized without further approval.

## Research and decisions

- [web.dev animation performance](https://web.dev/articles/animations-guide):
  ongoing animation uses transforms and opacity. Removed scrolling gradient
  backgrounds, animated filters, and speculative permanent will-change hints.
  Static gradients provide the light texture; small clipped elements move it.
- [MDN CSS transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Transitions/Using):
  keep red, blue, and contested artwork layers mounted and transition opacity.
  CSS retargets interrupted transitions from the current appearance without a
  stale timer or a fourth accumulating texture. State text stays current.
- [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion):
  disable ward animations and transitions, including pseudo-elements. A short
  live strength impact also listens for preference changes while active and
  removes that listener on finish, replacement, capture, or teardown.

## Implemented

- Independent sword corridors preserve the existing red and blue diagonals and
  mask the middle behind the crystal. Unequal timing, phase offsets, intensity,
  trail lengths, and quiet intervals remove the mirrored rhythm.
- Two overlapping light volumes drift continuously inside the contested crystal.
  No stepped timing, no complete opacity blink, and strength ticks do not replace
  the core animation.
- Ownership artwork crossfades over 1.2 seconds. Battle layers fade away over
  0.85 seconds and pause in controlled states. The selected controlled crystal
  breathes gently over 7.7 seconds; the base artwork itself never scales.
- Meter currents move inward from opposing sides at different timings. The
  ownership colour boundary eases to its new position; numerical/ARIA readouts
  update immediately from the native strength data.
- Mobile removes the secondary sword and crystal light layers and slows/dims
  the remaining effects.
- Small optional additions: reward icons lift two pixels on mouse hover or
  keyboard focus; a ready quest icon settles once over 0.85 seconds. Neither
  adds a perpetual ambient loop elsewhere.

## Verification completed

- npm test: passed; production bundle rebuilt. Existing bundle soft-budget
  warning remains. Unrelated workspace changes were preserved.
- npm run test:motion: passed actual browser checks for asymmetric phase/timing,
  continuously moving crystal light, intermediate capture opacity, interrupted
  red/blue/contested transitions, persistent controlled light, accurate strength,
  mobile overflow, reduced motion, and teardown. Measured zero LayoutCount
  increase during the 600 ms steady-animation sample in the isolated fixture.
  This is a fixture measurement, not physical-phone or live-game validation.
- Focused WorldBossPanels test first failed for the missing crossfade layers,
  then passed after implementation. Browser checks also caught and verified a
  fix for an in-flight impact surviving a reduced-motion preference change.
- git diff --check: passed.
- Desktop/mobile still frames inspected. Motion preview recorded with actual
  runtime transitions: output/zone-control-organic-motion.webm.

## Scheduled follow-up

The thread heartbeat is refine-fantasy-skin-animations, every two hours, bounded
by 8 September 2026 23:51 Australia/Sydney (13:51 UTC). Use the current thread
model settings; do not redeem a usage reset. The next run should review the
recorded motion and any new user feedback before deciding whether another
change is justified. Do not repeat the implementation or full test suite without
a new change, failure, or specific unresolved concern. Keep the page restrained.
Pause the heartbeat once this final review is complete, or at the deadline.

## Final scheduled review — 8 September, morning

Decoded the recorded preview directly with the bundled video decoder. Browser
seeking had returned stale frames, so the misleading contact sheet was discarded.
The decoded capture exposed two transition problems that were fixed:

- Native red/blue strength rows can outlive the ownership title update. Keep
  positively identified faction rows hidden through capture, without using the
  ambiguous numeric-order fallback outside a race.
- A protection timer directly inside the header was overwriting its header role.
  Preserve that role, and apply the full-width nested-header layout only to a
  wrapper, never to the title itself. This prevents the timer wrapping and
  shifting the crest during the desktop crossfade.

Added failing browser regressions for both cases before fixing them, including
an actual crest-position assertion. The motion recording has been regenerated.
