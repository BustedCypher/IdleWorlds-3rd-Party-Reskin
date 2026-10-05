# Guild route and raid

`GuildPanels.js` + `src/styles/guild.css`, added 2026-10-05 from two
skin-off snapshots: a raid lobby seen as a guest, and an active fight. The
guild's own page (what "View my guild" opens) has not been seen yet, so cards
there fall back to `data-iw-guild-card="generic"` and the frame/ground every
`.compact-panel` already gets. Ask for a snapshot before styling it.

`tmp/guild-snap/render.mjs` renders snapshots with the saved game stylesheet
(`tmp/native-snap/game-52dc34e0.css`) stock and skinned at any widths, with
`--eval <probe.js>` and `--game-skin sans|default`. That stylesheet predates
the raid: its `raid-*` rules are a hand-written stand-in, so the battle scene
is checked against an approximation of the game's own raid CSS.

## What broke before this module existed

- **The Members card became a Combat skill card.** Each member row prints a
  "Combat 66" chip, and `DOMWatcher.detectSkillType`'s anchored label fallback
  (`^combat(?:\s|$)`) accepted it. SkillPanelRenderer then rebuilt the card:
  names as skill plates, the "Guest 63AC" row as an empty medallion, a stray
  "7/8". Chat lines are the same hazard ("Mining is slow" is a 15-char leaf).
  `isGuildSurface()` answers 'unknown' first, from the ROUTE and from the
  panel's own "Raid Dungeon" title. It cannot read GuildPanels' marks: the
  skill event fires in the flush that discovers the card, before classify has
  tagged anything, and the type cache keys on content, so a wrong first answer
  sticks.
- **The selected boss pill was a blank slab.** The game draws `bg-ember` as
  `background: linear-gradient(…) !important` in its own skin layer; the
  generic control plate's `background-image` (later, higher specificity) erased
  it, and `text-ink` then sat dark on dark. Rule 5: the selection vanished.
- **Every raider stood on a slab.** Raiders are disabled `<button>`s, so
  base.css's unguarded (0,0,1) `button` fill plus the generic plate drew a box
  behind each sprite, and the "Raid skills" toggle and Combat Log got plate
  bands too.
- **The Guild tab was vanilla** inside the skinned rail: it was not in
  `NAV_LABELS`.

## Rules this surface follows

- **State is read, then re-presented.** `toneOf()` reads the game's colour
  utility (emerald / rose / amber / sky / ember) and writes
  `data-iw-guild-tone`; `selectedBy()` reads `bg-ember` (boss pill) and
  `border-ember` (difficulty). guild.css maps tones onto the skin palette.
  Fills the skin cannot know the full state space of (online dot, raider HP
  emerald -> amber, the action charge, your own sky nameplate, the leader's
  amber name) are never recoloured, only framed.
- **Every marked control is out of the generic plate** via
  `:not([data-iw-guild-role])` in ui-system's three chains and base.css's
  hairline chain — the village precedent.
- **Anchor on `:root`.** The game's "sans" skin layer ships
  `:root:is([data-skin=…]) [class*="bg-amber-"]` and `… .button-primary` at
  (0,3,0) `!important`; at (0,2,0) the ready check stayed flat yellow and "Set"
  kept the game's gold. Live players may be on `sans` or `default`, so the
  harness renders both.
- **`min-width: 0` on the panel.** It is a grid item of `section.grid`, and a
  potion row's nowrap `truncate` name contributes its full width as
  min-content (`min-w-0` on the flex item does not change the container's
  contribution). At 320px that held the panel 57px wider than the screen in
  the STOCK game too; `main` clipped it, along with the collapse toggle.
- **The backdrop is the game's art.** `.raid-battle-backdrop` (its
  `--raid-bg-image`, embers, sprites) is framed, never repainted. `raid-*` are
  the only stable hooks on the route; GuildPanels keys the fight on them.

## Six-tab rail

GUILD measures k = 2.819 (Barlow 700, uppercase, .025em, rendered at 100px),
so the routes sum to 25.731. The extra plate does not fit the phone floor at
8px padding (6.0px fitted type at 320px against the 7.5px clamp), so the
guild variant uses 5px padding and a 4px gap: 7.57px at 320px, every label
exactly inside its plate. Variants key on `:has(> [data-iw-tab="guild"])`, so
a rail without the tab keeps the old numbers.

**`scrollWidth` cannot see a squeezed tab.** A tab is a centred flex box with
`min-width: 0`; a label wider than it spills into both paddings, and
scrollWidth (end-side overflow only) stays equal. The first version of the
check passed with the phone block deleted. Measure the text node's Range
against the content box, and use the unrounded rect width: the fit is exact
by design (58.03px of text in a 58.48px box), and `clientWidth` rounds 68.48
down to 68.

## Tests

`tests/guild-panels.test.mjs`: detection on and off the route, every state
pair above, raider plates, the ready check and Set against the game's sans
rules, the nav tab, 320/390px rail and panel width, and the kill-switch round
trip. Its five negative controls are listed in its header; each was run.
