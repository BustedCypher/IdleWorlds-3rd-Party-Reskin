# Activity Panels Design

## Scope

Style the existing Current Action, Action Log, and World Chat surfaces so they share the fantasy skin's forged frame, textured background, typography, and control language. Preserve all game-owned DOM nodes, text, controls, and event handlers.

## Visual direction

- Current Action uses the shared outer frame, a compact action readout, a vivid progress track, and an inset queue tray.
- Action Log uses the shared outer frame and keeps entries as dense, separated feed rows.
- World Chat uses the shared outer frame, dense message rows, an integrated header toolbar, and a compact composer.
- Headings use the existing display font; feed copy and metadata use the existing UI font and color tokens.
- At narrow widths, outer padding and type scale down, feed metadata may wrap below primary content, and the chat composer stacks without horizontal overflow.

## Architecture

`UIFoundation` identifies the three sections from stable visible labels and adds semantic data attributes only. `ui-system.css` paints those attributes. React remains the sole owner of behavior and structure. The fixture mirrors the semantic contract for desktop and mobile visual review.

## Acceptance criteria

- All three sections receive the same forged frame/background family as other major sections.
- Action Log and World Chat remain compact feeds, not collections of individual cards.
- Current action progress, queue controls, log controls, chat toolbar, message field, and Send button remain visible and usable.
- No panel introduces horizontal overflow from 320px upward.
- Disabling the skin removes every new semantic attribute.
