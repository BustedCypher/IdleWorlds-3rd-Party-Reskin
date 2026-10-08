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
  Encounters without an owned scene keep the game's backdrop. A failed image load leaves
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
- **Thessaly uses the same native HUD ownership and lifecycle.**
  `ThessalyScene.js` detects her native image/background and owns only
  `data-iw-thessaly-art`; it activates `data-iw-raid-scene="thessaly"` after
  `assets/raids/thessaly/arena-storm.png` loads. The painting has an empty,
  uneven courtyard, a female storm body on the right, quiet dark teal ruin
  masses and green plague mist. Detail in the background is suggested through
  shadow and mist. No raiders or lightning bolts are painted into the artwork.
  `ThessalyArenaRenderer.js` supplies a seamless 16-second loop of rolling
  clouds, billowing fog, drifting spores and restrained eye, hand and hair
  wisps. Separate seeded lightning arcs crackle outside the cloud body; their
  short faded events repeat exactly, including across the loop boundary.
  `lightning:false` disables this atmospheric effect independently. Face,
  hands and terrain stay fixed; native battle hazards stay off.
  Clouds and mist use fresh transparent ImageGen atlases, not sampled patches
  of the background or recoloured Ashmaw smoke. Cache four variants per atlas
  with softly feathered cell borders; do not filter a full surface per puff.
  The storm painting's tower starts around x .415, y .16. Exclude it from
  the sky masks: the older implementation sampled it and produced a second,
  displaced spire. Fresh sky banks drift slowly in one direction and fade
  fully before their hidden reset; do not use sinusoidal travel that reverses
  their direction. They are spread apart with restrained opacity,
  while seeded mist banks vary in shape, aspect, speed and direction. A
  cloud-only pixel check pins the tower's original rectangle unchanged. Keep
  a generous exclusion around the tower when broadening cloud travel. Custom
  courtyard mist uses a one-time green-colour mask of the painting, feathered
  before animated low wisps are clipped into it. Its `courtyardMist` option
  is independent of sky, general smoke and lightning; all mask/surface canvases
  belong to the renderer's released buffer list.
  A slight waist/shoulder cloud rig moves new body vapour, keeping the face
  and hands steady. The separate silver hair asset bends in connected strips,
  with fixed roots and progressively moving tips. Additional fine wisps extend
  it into the wind. All four atmosphere assets are optional at runtime. Reconcile
  and prune both scene managers: switching a native boss in place must remove
  the previous decoration, cancel its drawing and release its canvas buffers
  while preserving native controls. `tests/thessaly-scene.test.mjs` and
  `tests/thessaly-loop.test.mjs` cover ownership, loop continuity and fallbacks;
  `tests/extension-e2e.test.mjs` loads both scenes from actual extension URLs,
  checks in-place switching and exercises the shared responsive HUD.

**Morwenna shares the native HUD and reversible scene lifecycle.**
`MorwennaScene.js` detects the native `boss-morwenna` image (or Morwenna alt
text) and compatible backdrop before appending `data-iw-morwenna-art`.
Activation waits for `assets/raids/morwenna/arena.png`; late loads check the
native encounter again so an obsolete painting cannot reactivate after a
boss switch. `MorwennaArenaRenderer.js` is shared with the preview and supplies
the approved 24-second Embercourt loop: slow one-way sky and courtyard mist,
veil wisps, pronounced violet light and sparks along the puppet strings,
ember light, and low foreground mist with tumbling ash. The doll, hands,
Matriarch silhouette and stonework stay anchored. All particle resets fade
to zero and every motion repeats with the shared phase.
Only the approved painting and the fresh `storm-clouds.png` and
`courtyard-mist.png` atlases are bundled. The atlases are optional: empty
cached sprites preserve independent curse light and ash when textures fail.
Unavailable Canvas 2D keeps the approved still painting; a failed painting
restores the game's native boss and backdrop. Pause and disposal mirror the
other two scenes, with a 1440 × 720 live canvas and a 30fps drawing cap.
Reconcile, prune and clear all three managers, and include Morwenna in every
shared scene/art/stage CSS selector. `tests/morwenna-scene.test.mjs` covers
ownership and transitions; `tests/morwenna-loop.test.mjs` covers the runtime
loop, cross-origin assets, visibility and fallbacks. The unpacked-extension
test now exercises all three bosses and their responsive native HUDs.

**Grimjaw uses the approved frozen courtyard and blizzard.**
`GrimjawScene.js` follows Morwenna's native ownership, delayed-load checks,
visibility pauses, still/native fallbacks and disposal. The bundled `arena.png`
is the approved left-facing helmet/skull correction, with the fixed matte-painted
composition. `GrimjawArenaRenderer.js` supplies the shared 72-second preview/live
loop: one-way clouds and snow squalls, courtyard and foreground mist, rising palm
wisps, icy breath, and three depths of dense falling snow. Sleet streak rotation
uses actual velocity, including gusts; clockwise rotation points the sprite's
downward axis left. Fall angles vary per particle while preserving down-left
wind. Optional atlas failures retain procedural snow and energy. All four
managers must participate in reconcile/prune/clear and every scene/art/stage CSS
selector, including the HUD child exclusion. Tests cover native handlers and HP,
encounter switches, exact loop repeat, visibility, failures and cleanup; the
unpacked-extension fixture includes Grimjaw and responsive HUD checks.

**Skarth preserves the approved flooded leviathan composition.**
`SkarthScene.js` follows the same delayed-load, pause, fallback and teardown
contract. `SkarthArenaRenderer.js` uses independent transparent atmosphere, ice
and foam/spray atlases, not cutouts of the approved painting. Floes drift slowly
downstream with subtle bob and turn; foam flows and spray rises at five actual
breach roots. A cached open-water mask prevents ice and ripples crossing the
paving; a sky mask protects the head and distant architecture. Custom snow
sprites use Grimjaw's velocity-aligned, varied-angle blizzard technique. The
72-second loop repeats exactly with no per-frame DOM changes. All five managers
participate in reconcile/prune/clear and all shared scene/art/stage/HUD CSS
selectors. Skarth is included in the native-extension responsive and switching
fixture; generated prompts/documentation are excluded from the package.

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

## The raid lobby layout (2026-10-08)

`GuildLobby.js` + the "Raid lobby layout" section at the end of guild.css,
from Curtis's list and his live capture of a pickup-group leader (build
v0.2.0+2026-10-08.3). The live Raid Dungeon panel holds: head; notices and
the ready-check card; a two-column row (left column: boss, Leaderboard,
"📜 My raid history"; right: Members); a stacked block (Lend, Pre-raid
prep, Raid Loadout, the invite card(s)); the Ready/Start card; Group Chat;
the Disband row.

- **Nothing moves; the wrappers dissolve.** Each wrapper between a card and
  the panel is `data-iw-guild-wrap` -> `display: contents`, so every card
  is a grid item of the panel, placed by `data-iw-guild-slot` (this
  module's own attribute; `data-iw-guild-card` stays GuildPanels'). Only the
  lobby shape (boss card in a column of a row that is a direct child of the
  panel) gets `data-iw-guild-layout="lobby"`; the fight keeps its flow.
- **Two columns by auto-placement, not named areas** (>=1024px, the game's
  `lg`): orders lend 10 / invite 11 / boss 20 / members 21 (span 4) /
  chat 30 / prep 40 / loadout 41, then full-width other, start, history,
  footer. A column-1 item after a column-2 item starts a new row, so the
  columns stack without knowing heights; members spans boss..loadout. Below
  1024px: one column, boss, chat, lend, prep, loadout, invite, members,
  start, history, footer.
- **Merged frames** (invite(s) + Members, Prep + Loadout): the upper card
  stretches its row and runs `-12px` into the gap, dropping its foot; the
  lower one drops its head. The invite help line is hidden ("Invite player,
  then the display name bar").
- **The Space-y margins must be cancelled.** The wrappers are `space-y-3`:
  their margin-top still applies to cards inside a `display: contents`
  wrapper. Every lobby item is `margin: 0 !important`; the fixture models
  the margins, or it would lie.
- **The Leaderboard card is hidden** and the board moved to the Leaderboards
  route (`RaidLeaderboards.js`): `GET /api/guild/raid/leaderboard` ->
  `{ leaderboard: { [boss]: { easy|normal|hard: [ { sessionId, guildName,
  isPickup?, isTestGuild?, elapsedMs | elapsedSec } ] } } }`, ranked. The
  skin's own section frame goes after the game's Leaderboards `.panel`
  (rendered copy, `target.after`). It carries no `.panel` class (like the
  Village scene). Times are the game's `m:ss.cc`.
- **Record time per difficulty:** an owned row under the difficulty pills
  (one cell per pill, flex 1 like the pills) reads the same board for the
  selected boss tab. A network result is no mutation, so the read's callback
  redraws the row itself.
- **"Mark Ready" is the live ready label.** `READY_LABEL` lacked it, so the
  Ready/Start card was `generic` (and lost its ready state styling).
- **The ready-check pop-up** is the skin's own, on `document.body`, from the
  game's ready-check card (chunk 8577): shown when the card offers YOU
  "Confirm — I'm here!", never when it carries the leader-only "Start now".
  Confirm presses the game's button; Dismiss hides it for that card node (a
  new check is a new card). The countdown is copied on `iw:text-flush`.
  **Every leaf panel on /guild runs the Guild pass** (the header too): a pass
  that closed the pop-up whenever ITS panel had no card rebuilt it every
  flush (measured). Only the panel holding the card, or a disconnected card
  (`pruneGuildLobby`, every classify pass), may close it. Off the Guild tab
  it does not exist: that needs `/api/guild/mine`, unseen.
- Tests: `tests/guild-lobby.test.mjs` (desktop placement, merged frames,
  records, pop-up member / dismiss / new check / leader, phone order, the
  Leaderboards panel, kill switch). Negative controls run: wrappers not
  `contents` (8 checks fail), no merge margin (3), no leader exclusion (1).

- **TESTING FEATURE — lobby test toggles (2026-10-08):** `LobbyPreview.js`
  adds a dashed "🧪 Test:" strip under the lobby heading (never in a fight)
  with four separate toggles: Pending invite (a "Waiting for an answer (2)"
  block in the invite card, or a whole test invite card), Full party (test
  roster rows up to 8, guest or member shape from a real row's role), Ready
  check (a test ready-check card; its own Confirm marks it confirmed) and
  Pop-up (`GuildLobby.setLobbyTestPopup`, a 30s demo countdown). Test nodes
  are the game's own markup (chunk 8577, the live capture), appended and
  `data-iw-lobby-dummy`; a dummy ready-check card never opens the pop-up
  (negative control: let it, and the "NO pop-up" check fails). Two gaps it
  found: "Group (1/8)" (pickup) was not recognised as the guest list (only
  "Raid guests" was), and a pending invite's "cancel" link-buttons get the
  generic plate. Remove the module, its GuildLobby call sites (marked) and
  the `data-iw-lobby-test` rules in guild.css when the lobby is settled.

### The boss card (RaidBossCard.js, 2026-10-08)

Curtis: "cleaner, requires less reading but still contains just as much info",
with the raid boss art. The card keeps the game's tabs, name, lore,
difficulty pills and record times; four prose blocks become owned parts:

- **Hero**: `.iw-bc-art` (owned, `aria-hidden`, pointer-transparent) shares
  the name / lore / stat-chip grid rows behind them. Art is
  `assets/raids/lobby/<boss>-banner.webp` (upper 62% of the live arena
  painting; Thessaly's is `arena-storm.png`) and `<boss>-portrait.webp`
  (the HUD frame's headshot medallion on a feathered circle), both from
  `build-tools/build-raid-lobby-art.py`; the arena PNGs are ~2 MB each.
  The banner is drawn at 150% of the hero's width so the boss can sit right
  of the text: a boss at fraction b of the painting lands at 80% with
  x = 3b − 1.6 (`--iw-bc-focus`, b = the HEAD's position). At `cover` it
  fitted the width and the boss sat under the lore. Every head is in the
  banner's top quarter, so y stays at 0–8% (Ashmaw 26%): anchoring at 30–60%
  cut the heads off at the live ~930px card (Curtis's screenshots,
  2026-10-08), while the 600px fixture still looked fine. Check 960px renders.
- **Stat chips**, **two tiles**: "To join" (the real gate, amber) and the
  resist as "Recommended" (sky, the advice colour, so it never reads as a
  requirement). The Jewelcrafting-lend clause is dropped on request; it
  survives only in the tile's title.
  a per-boss **Recommended Team Loadout** + tip (`TACTICS` in the module:
  the skin's OWN copy replacing the game's one generic tip, which stays as
  the title; every mechanic quoted is the game's chunk-9811 ability/skill
  text. Curtis asked for "Veil mitigates Cinderstorm"; the game says only
  Ward does and Veil dodges the single-target hit, and he chose the game's
  version), and the **loot bar** (claimed / available templates only).
- Every source is chunk 8577's single template, so the parse is exact
  regexes. A line is hidden (`data-iw-boss-card-src`) only when it parsed
  fully; each owned part carries its sentence as `title`. Anything else
  (lock, test-guild, coming-soon notices; a reworded line) stays the game's.
  Negative control in the test: an odd requirement line and a lock notice
  stay visible with no owned part.
- Lore ink is #e4dac6 with a dark halo over a darker left band; the dim
  ink was unreadable over Thessaly's and Grimjaw's pale storms.
- Record times under the difficulty pills read "🏆 1:50.00 · Royal Flush"
  (time, then the group that set it; GuildLobby.decorateRecords).
- Rule 5: ATK/HP's `text-rose-300` (Hard) / `text-emerald-300` (Practice)
  carry onto the chips as `data-iw-bc-tone`; the loot bar copies the
  notice's `data-iw-guild-tone` for its rail.
- The loot countdown ("3d 18h") is a text tick: `refreshBossCardText` runs
  from `refreshGuildLobbyText`. Negative control: unwire it and "a
  text-only countdown tick reaches the bar" fails.
- Grid: rows are explicit only for the hero (`--iw-bc-r1..3`, shifted to
  start at 1 by `:has()` when the game renders no tabs, i.e. one boss);
  everything after auto-places in DOM order.

`tests/raid-boss-card.test.mjs` (screenshots in `tmp/raid-boss-card/`).
Fixture-rendered only, not live-verified.

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

## Raid HUD (2026-10-06)

`RaidHud.js` + the "Raid HUD" section at the end of `guild.css`, built from the
Ashen Iron raid UI kit v1 (`assets/raids/ui-kit-v1/`, design approved by
Curtis). It applies to EVERY raid arena, painted scene or not.

- **Layout is grid placement of the arena's own children** (rule 2): boss
  summary, telegraph, floor, the log's native wrapper, effects panel and the
  game's status line take named areas. Desktop `boss/cast` top left, painting
  open, `timers` row, `party` row, foot `log | status+actions | fx`;
  tablet (<1100px) foot becomes actions then `log | fx`, party 4+3; phone
  (<700px): see the phone bullet. The actions are `align-self: start`: the
  log and skills panels span their row and grow it, which stretched the
  buttons to ~100px tall.
- **Phone (2026-10-07, Curtis's Thessaly mock):** identity on a dark band,
  the painting as a hero window, the health shell and cast bar at full width,
  the party three-up (last row centred, "N raiders · all standing" from the
  frames) under the timers two-up, actions, then `log | fx` folded to
  their headings. The
  boss summary goes `display: contents` so its header, track and HP text take
  their own rows; the HP text shares the track's cell and copies its percent
  padding (which resolves against the shared width) to land on the channel.
  The art layer is an absolutely placed GRID child, so `grid-area: hero` makes
  that area its containing block; `object-position: 97%` keeps the boss (every
  painting stands it right of centre) in the crop. A scene-less boss's sprite
  takes the hero area instead. Three-up leaves ~90px per frame, so on phones
  the HP % rides the skill line; the name keeps the top line with the icon.
- **Combat log and Raid skills live in a dock after Raid Chat (Curtis,
  2026-10-07: "not needed unless the user asks for it … under the raid chat,
  stacked").** Both are the arena's children and Raid Chat is the card AFTER
  the arena, so they cannot be placed under it without moving React's nodes
  (rule 2). The game's two panels are `display: none` in the arena at every
  width, and RaidHud appends `.iw-raid-dock` right after the chat card
  (`[data-iw-guild-card="chat"]`, else after the arena): two stacked panels
  in the shared forged frame, folded to a heading bar. Content is COPIED from
  the game's text (skills rows keep the game's colour classes, and the resist
  meter its attributes; every `data-iw-*` and `id` is stripped from the
  copies). Every dock control presses the game's own button: opening the log
  presses its "tap to expand", folding presses its "✕ Close", and "who has
  what?" presses the Raid skills toggle. The "⬇ .txt" download is never
  offered. A folded panel builds no body. A fold is carried by `data-iw-*`
  alone, which DOMWatcher never sees, so the click handler runs the dock pass
  itself (measured: without it, Raid skills opened empty).
  `pruneRaidDocks` (GuildPanels, after the arena loop) removes a dock whose
  arena has gone.
- **The expanded combat log is a `<div>`, not a `<button>`** (game source,
  chunk 7027): header ("Combat Log", "⬇ .txt", "✕ Close") plus a
  `max-h-[260px]` scroll list, swapped in for the collapsed button inside
  the same `div.relative` wrapper. Keyed on the tag, GuildPanels tagged it
  as a second Raid skills panel (it holds buttons) and its two buttons as
  `effects-toggle`. The log is now "the readable panel inside a wrapper".
  Negative control: revert to the tag test and the expanded-log checks fail.
- **Veil and Fortify are timed lines** like War Cry ("🧵 Veil active (+N%
  dodge vs. single-target) — Ns left", "🛡️ Fortify active (+N% raid DEF) —
  Ns left"; game source), so they reach the timer row with no special case.
- **Owned nodes are only** each raider's `.iw-raid-fx` strip and the
  `.iw-raid-timers` row and the `.iw-raid-dock` (`data-iw-raid-owned`). A strip rebuilds only when a
  derived signature changes; a timer bar updates in place (each write
  compared) and the row rebuilds only when its SET of timers changes.
  `tests/raid-hud.test.mjs` proves a settled fight makes zero owned-node
  mutations, attributes included (negative control: rebuild the row every
  pass, 700 records).
- **No personal HUD (Curtis, 2026-10-07):** "irrelevant with raid frames
  available and raid frames will never ever be hidden." The `.iw-raid-me`
  summary is gone; the fire-resist meter it repeated stays in Raid skills.
- **Effect timers above the party (2026-10-07):** one bar per counted effect,
  in the cast bar's manner (name, target, seconds, fill). Sources: Raid skills
  lines with "Ns left" (target "Raid"), the tank line (target the tank), and
  standing raiders' debuff statuses grouped by effect (targets listed). Buffs
  fill blue, debuffs red (`toneOf`, the same rule the frame chips use). The
  fill is seconds over the LONGEST count seen per effect, as for the cast,
  because the DOM never states a duration; joining mid-buff shows a full bar
  until the next application. The curse states no count in any capture
  ("Cursed — reduced healing"), so it is a full red bar without seconds; if
  the game ever puts seconds in that title, `secsOf` picks them up. A
  downed raider's debuffs leave the row. Veil has no capture of its active
  line; the raid-wide parser takes any "X active … — Ns left" line, so it
  appears if the game words it that way. Negative control: paint debuffs
  blue and the colour check fails.
- **Effects are read, never invented.** Personal: the raider's own titled
  spans (`204 shield`, `Tanking`, `Cursed — reduced healing`). Raid-wide: the
  Raid skills lines (`War Cry active … — 3s left`) applied to every standing
  raider. The tank's timer: `X is tanking … — 21s left`. An effect with no kit
  art still shows with the game's emoji; nothing hides behind `+N`.
- **The "who has what?" list is not an effect line (2026-10-07).** Opened,
  the game puts the lenders' list (`div` of `<p>`: "X — War Cry: Unlocks …")
  among the Raid skills lines; read as a line it matched `/war\s*cry/`, so
  every standing raider got a second War Cry chip and the list a
  `data-iw-raid-fx-kind`. `readRaidEffects` skips a child holding `<p>` lines.
  `tests/raid-hud.test.mjs` opens the list (negative control: without the
  guard, "2,2,2,2" War Cry chips). Native kit: decision 16.
- **"You" is the nameplate's sky class, never a sky match on the whole
  raider:** every lend line is `text-sky-200`, and a `:has(> [class*=text-sky])`
  order rule pinned all seven frames to `order:-1` (measured).
- **Kit art only where it is a bar, never a frame (2026-10-07).** The boss
  shell keeps its aspect (skull/jewels) and puts content in the README's
  channel fractions. The boss shell IS the game's track (padding =
  channel), so the game's `width:N%` fill lands in the channel untouched; the
  HP text overlays it with `cqw` units from the summary's inline-size
  container.
- **The cast bar is a slim CSS bar hung under the shell's channel
  (2026-10-07, Curtis: the kit's `boss-cast.png` plate was "too large").**
  24px tall (22 on phones), 58.8% of the shell's width, 25.7% in on desktop
  (shell `-2%` margin + `27.7%` padding; 27.7% on phones, no margin), pulled
  up by `-(4.5% of shell width) - row gap` to sit just under the frame's
  lower lip. Margin percentages resolve against the grid area, which the
  summary shares, so `--iw-shell-w: min(100%, 560px)` reproduces the shell's
  width. Two placement traps: the HUD's generic child rule (0,7,0) and the
  scene rule (0,4,0) both set `margin: 0 !important`, so the cast is in their
  `:not()` lists (no specificity escalation). And the fill/ink defaults live on
  a (0,2,0) `:root [data-iw-raid-cast]` rule: declared on the (0,3,0)
  placement rule, they beat the step/urgency rules and the bar sat full and
  calm for the whole countdown (pinned by the "hangs slim" check; negative
  control: move `--iw-cast-fill` back, fill reads 100%). `boss-cast.png` is
  now unused but still in REQUIRED_ASSETS.
- **The boss HP fill sits BEHIND the per-boss shell and under its rim
  (2026-10-07).** The shell art is the track's `::before` at z-index 1; the
  game's fill is the track's content. `--iw-shell-l/-t/-r/-b` (sheet px of
  1216x406, set per `data-iw-raid-encounter`) are each boss's transparent
  opening measured at alpha < 40, grown 8px on every side, so the rim
  overlaps the fill's edges and the rounded end tucks under the tapered
  tip. The old fixed channel (804x68) stopped 42px short of the 848x76
  opening and sat flush with the rim, so the fill read as painted on top.
  The HP text uses the same insets in cqw. Re-measure if the art changes.
- **Party: two rows of four (2026-10-07).** At >=700px the floor is a 4-column
  grid, `min(100%, 860px)` wide (the timer row matches it), so a full party
  of eight is 4+4 and a short last row keeps the card width; phones keep
  their three-up flex row, since four would leave ~87px a card. Negative
  control: eight columns fails "two rows of four".
- **Attack and the lent skill wear the standard compact plate (2026-10-07).**
  `CompactButtons.kind()` opts `[data-iw-guild-role="action"]` into
  compact-ghost-v3 (the nav tabs' and Send's idle/hover/pressed plate); guild.css
  paints no surface, so the plate shows. The plate's caps are a third of its
  height (40px on a 120px cell), so `--iw-compact-cap` is pinned with the
  height: 15px at 44px, 13px at 40px on phones. The game's `.button-primary`
  (Attack) keeps an ember rule drawn on the plate's LAYERS: on the button
  itself it painted under them and only the corners showed. Disabled stays
  dimmed (game state).
- **The result card is a banner when its headline parses (2026-10-07).**
  The game renders `<p>🏆 Victory! <boss>.</p>` (or `💀 Wipe. <boss>.`), an
  optional loot `<p>` and Close, in emerald or rose classes (game source).
  `RaidHud.decorateOutcome` splits the headline into
  `data-iw-raid-result-glyph` (on the card), `-word` and `-boss` (on the
  <p>), and `data-iw-raid-result` = victory/wipe/other from the card's own
  tone. guild.css draws: card ::before a sunburst (rotates; still under
  reduced motion), card ::after the glyph in a medallion breaking the top
  rule, headline ::before the word in gilt (background-clip text), ::after
  the boss between rules, loot line ::before a diamond. The <p> keeps its
  text at font-size 0, so the words stay readable to assistive tech. An
  unparsed headline keeps the framed card. Close joins the compact plate.
  On phones the banner sits at the hero's foot so the medallion overhang
  lands on the painting. Negative control: drop the decorateOutcome call
  and both banner checks fail.
- **Every raid panel wears the skin's shared forged frame (2026-10-07):**
  Curtis rejected the kit's `personal-hud.png` / `utility-panel.png` frames
  ("don't suit the theme, are inconsistent, don't fit all the info and cannot
  be resized accurately for mobile and tablet"). The result banner, combat
  log and raid skills (and the personal HUD until it was removed) now use the
  overlay.css recipe, drawn
  only on the border box: per-zone `--iw-corner-filigree` as a real
  `border-image` (slice 50%, width `--iw-raid-corner-w`, 25x23, 20x18 on
  phones), the head hairline as a background layer, the forged ground, and
  the 1px edge as an outer shadow (a border-image replaces the border's own
  colour). No pseudo-elements, no aspect-ratio: each panel grows to its
  content. Party cards take the same ground, hairline and themed edge but no
  filigree (the corner marks a PANEL, not a unit); self teal and critical red
  stay as `--iw-frame-edge/-glow` state. `tests/raid-hud.test.mjs` pins
  the frame and that no panel overflows at 1440 and 390px (negative control:
  `border-image: none` fails all three panel checks). The unit, personal-hud
  and utility-panel sprites are unused but still in REQUIRED_ASSETS.
- **Mirrored timers need text ticks (2026-10-07).** The cast bar's seconds and
  every effect timer on the frames/HUD are COPIES of game text, drawn from
  attributes. A text-only change never emits `iw:dom-flush`, so the copies
  froze until an unrelated mutation flushed: the boss timer "hung", then
  jumped. `DOMWatcher` now emits `iw:text-flush` (parents of changed text);
  `RaidHud.refreshRaidText` re-runs only for an arena it decorated, skipping
  its own nodes. `tests/raid-hud.test.mjs` ticks text nodes alone; with the
  listener disabled it reads `10s` four ticks running. A long `0s` is the
  game's own text (waiting on the server), not the skin.
- **The cast countdown's maximum is inferred** (largest seconds seen per
  attack name): the DOM never states the wind-up. Fill and resistance meters
  are 0-10 step attributes into custom properties, so nothing writes an
  inline style on a game node.
- **Release:** only `assets/raids/ui-kit-v1/sprites/` ships
  (`package-release.mjs`); the atlas, ImageGen sources and preview are design
  material. The sprites are in `build.mjs` REQUIRED_ASSETS.
- **First live capture (2026-10-06) broke three things.** (1) The fight's
  own controls (`div.relative.flex.flex-wrap.gap-2` > Attack `button-primary`
  + the lent skill) and the result card (`💀 Wipe. …` + Close) were untagged
  arena children, so grid auto-placement dropped them into an empty `.`
  cell, where the flex-1 buttons stretched into a 240x380 slab. Every arena
  child needs an area: they are now `actions` (under your HUD) and `outcome`
  (a banner in the open painting row), toned from the game's classes. (2) The
  game draws on `.raid-arena-floor::before` (absolutely placed), so the
  "Raid party" caption landed on the first frame's health bar; the whole box
  is reset (CLAUDE.md pseudo-element rule) and the test checks its computed
  `position`. (3) `.raid-readable-panel` blurs its backdrop, which showed as a
  hazy box around the cast bar's transparent corners; `backdrop-filter: none`.
- **Down raiders:** the game greys the raider (`opacity-35`) and puts a 💀
  over the hidden sprite; the frame says "💀 Down" instead. "You lead the row"
  keys on `data-iw-raid-self` (identity), not on `data-iw-raid-frame="self"`
  (art): a critical frame swapped the art and your frame fell out of first.
- **Live-DOM unknowns:** more than eight raiders, a kill result card, the open
  Raid skills list, and boss telegraph wording other than `Name (scope) in Ns`.
  An unmatched telegraph keeps the game's own words on a plain plate.
- **TESTING FEATURE — full-party preview (2026-10-07):** during a fight only,
  the head row carries a dashed-amber "🧪 Test: full party" toggle
  (`RaidPartyPreview.js`). On, it tops the floor up to 8 with dummy frames
  cloned from a real raider (so the live markup and sprite), marked
  `data-iw-raid-dummy` — not `data-iw-raid-owned`, because RaidHud skips titled
  spans inside owned nodes and the dummies' status effects would vanish. The
  first four dummies cover tank, amber, critical and down. Off by default,
  not persisted; remove the module and its "TESTING FEATURE" call sites in
  GuildPanels.js and guild.css when the full-party layout is settled. Like the
  dock, the toggle outlives a removal-only mutation until the next flush.
- **TESTING FEATURE — effect preview (2026-10-07):** a second head-row toggle,
  "🧪 Effects", cycles off → 2 → 4 → 6 and injects that many test buffs AND
  test debuffs. They never touch the game's DOM: `RaidHud.decorateRaidHud`
  appends `previewEffects()` to the raid-wide effects it read, so each standing
  raider's strip and the timer row carry them. Names avoid the game's own
  ("Battle Hymn", not "War Cry") so no timer key collides; every debuff's title
  carries curse/bleed art or burn/poison/"reduced" so `toneOf` reads it red.
  Seconds come from the clock and only advance when a pass runs (live, the cast
  countdown's text tick), so the HUD stays quiet between ticks. A change of
  count is module state only, so the toggle runs the arena pass itself.

### Ashmaw custom atmosphere (2026-10-07)

Ashmaw's atmosphere now uses its approved custom Subtle preset (0.75): `clouds.png`, `furnace-smoke.png`, and `steam.png` are independent transparent atlases. The fixed painting, lava/eye light and 16-second cadence remain. No painting pixels are advected for sky movement. Texture load failures retain light/cinders; painting failure restores native art. `AshmawScene` guards late loads against native boss/stage/backdrop changes. Preview/export generators and build requirements must include all three atlases; the old single smoke texture is retained only for historical studies.

### Boss headshot overlays (2026-10-07)

- All five encounters use individually generated organic magical frames in
  `ui-kit-v1/sprites/boss-health-{boss}.png`. No shared skull frame remains in
  the live boss HUD. `RaidHud` reads the native name into the reversible
  `data-iw-raid-encounter` attribute; scene loading cannot select an old portrait.
  Unknown names clear the mark. Cleanup includes this attribute.
- The art is a pointer-transparent `boss-hp::before` overlay ABOVE the native
  HP fill, with a fully transparent live-fill rectangle. Do not restore it as
  an opaque track background. Native nodes and width styles remain untouched.
- Registration: 1216×406 physical pixels; fill rectangle `(280,168,804,68)`.
  Percent padding uses WIDTH for both axes: top 13.8158%, right 10.8553%,
  bottom 13.9803%, left 23.0263%. The HP label and cast placement use this
  same geometry, including on phones. Tests must use the new channel bottom.
- `boss-health-atlas.png` is 1280×2222, with 32px transparent gutters and
  `boss-health-index.json` source windows. Runtime ships the separate sprites;
  the atlas, untouched sources and prompts are implementation/design material.
  `build-raid-boss-portraits.mjs` rebuilds them and the dedicated verifier checks
  exact alpha, atlas/sprite agreement, bounds and gutter leaks.
- Browser fixtures verify all five native-name transitions (even with stale
  scene identity), live fill at 0/49/100%, cleanup, and phone containment.
  These checks do not establish live-game verification.
