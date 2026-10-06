# Guild route and raid

`GuildPanels.js` + `src/styles/guild.css`, added 2026-10-05 from two
skin-off snapshots: a raid lobby seen as a guest, and an active fight. The
guild's own page followed the same day (v0.2.0+2026-10-05.16): a leader in a
guild, and a player with no guild. See "The guild's own page" below. The
in-fight view as a member, and an OPEN All Guilds row (its member list), are
still unseen; a card the module does not recognise falls back to
`data-iw-guild-card="generic"` and the frame/ground every `.compact-panel`
already gets. Ask for a snapshot before styling either.

`tmp/guild-snap/render-pages.mjs` renders the two page snapshots (each
carries the game's CSS inlined) on Legacy or `--game-skin sans`, stock and
skinned, and prints every card's kind, its roles and any button left
unmarked. `tmp/guild-snap/render.mjs` renders the older snapshots with the saved game stylesheet
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
- **Ashmaw has an owned animated backdrop.** `AshmawScene.js` detects the
  native boss image and `--raid-bg-image`, and adds a pointer-transparent
  decorative layer. Only after the bundled arena painting loads does the arena
  opt into `data-iw-raid-scene="ashmaw"`. The original boss image is hidden
  with CSS, preserving its node. CSS grid positions the native boss summary,
  telegraph, skills, party and log above the background without reparenting.
  The live combat-log button sits inside a native wrapper: mark that wrapper
  `combat-log-region` for grid row 6. Styling only the inner button places the
  unmarked wrapper in the first available cell and covers the boss. The
  unpacked-extension test checks both shapes at 1440/900/390/320px, with an
  expanded skills panel and twelve native party controls.
  Other encounters keep the game's backdrop. A failed image load leaves
  native art; optional smoke failure still renders the arena. Unavailable
  Canvas 2D or a mask error uses the approved painting as a still fallback.
  The approved 16-second arena scene keeps Ashmaw and the ground fixed while
  rolling clouds, lava light, jaw/shoulder smoke, steam, eye embers and drifting
  ash animate. Battle hazards are disabled. `AshmawArenaRenderer.js` is shared
  with the standalone preview, capped at 1440 × 720 for live rendering. All
  clocks use integer harmonics of one repeating phase. No per-frame DOM writes.
  Drawing pauses offscreen, in hidden tabs, and for reduced motion; cleanup
  cancels RAF, disconnects observers, releases canvas buffers and removes owned
  art on route removal/disable. A replaced boss wrapper or removed decoration
  remounts the scene. Rebuild `dist` after changes; a stale bundle can silently
  show the previous scene instead of the approved arena.

## The guild's own page

Measured on the two snapshots with `render-pages.mjs` before any change, with
today's module:

- **Inputs are not chat.** "Invite Player", "🤝 Invite a Raid Guest" and
  "Create a Guild" each have an input, and `cardKind` tested for an input
  FIRST, so all three were chat. Chat takes the card's first `> p` as its
  title; in the invite cards the real title sits in a head row beside the
  "7/12" count, so the first `> p` is the HELP sentence, and it rendered as a
  13px small-caps heading. They are `form` cards now, named by their title
  before the input test. A new card with an input must be named the same way,
  or it is chat.
- **A row's buttons are not all names.** A guest sees one button per member
  row (the name). A leader also gets the lend-skill PICKER (a sky
  `border-sky-*` button with ▾, where a guest saw a static `lend-pill` div)
  and a "✕" kick (`title="Kick …"`). Every row button was `member-name`.
  They are `member-name` / `picker` / `kick` (+ `option` for a menu the
  picker opens inside its own `.relative` box; not in the snapshots).
- **Two buttons in the ready card.** The leader's card holds "✓ Ready" and
  "⚔️ Start Raid (7)", and `kind = ready` required exactly one button, so it
  went generic and lost the ready state (rule 5). Start is role `start`
  (the CTA). Beside it, a NOT-ready toggle steps down to a plain plate
  (`:has([data-iw-guild-role="start"])`), otherwise two ember buttons sit side
  by side. Ready / not ready / Start must stay three different edges; the
  backgrounds alone differ by a 58% vs 62% colour mix, which a string compare
  calls different and the eye does not.
- **Directory.** "🏰 All Guilds" (collapsed, "show ▾") and "🏰 Find a Guild"
  (open) are one shape: a `> button` holding the title `p` is the
  disclosure, then a note and an `overflow-y-auto` list of rows
  (▸ · #rank · name button, ⭐ points, "8/12", "Apply"). Apply keeps the game's
  emerald as `data-iw-guild-tone`; a row gets `data-iw-guild-state="open"`
  when its class list grows or it gains children (the open shape is a guess
  until seen).
- **Pickup Raid Group** is `pickup`: title, note, CTA.
- The **Combat chip** was repainted dim for everyone; it now carries the
  game's tone, so an under-level (rose) chip stays different from a met one.
- The **subtitle** "woof • 7/12 members • ⭐ 1 guild points" marks its points
  span `points`; the generic `subtitle > span` rule skips marked spans.

The five boss tabs wrap to two rows at 390px (Skarth alone on the second).
That is the existing boss-tab design, not part of this change.

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

`tests/guild-pages.test.mjs`: the guild's own page, on the game's sans skin:
form vs chat and the invite title, member-name / picker / kick, the
three-way ready card, Pickup, the directory rows and Apply's tone, the chip
tone, and the kill switch. Its four negative controls (listed in its header)
were run by patching each fix out of a copy of the built bundle; each made the
suite fail.
