# 6. Skill cards (Skill Actions)

The largest contract in the theme: about 600 rules key on it.

Golden markup:

- before: [`generated/golden/dashboard/skill-actions.before.html`](generated/golden/dashboard/skill-actions.before.html)
- after: [`generated/golden/dashboard/skill-actions.after.html`](generated/golden/dashboard/skill-actions.after.html)

That example is a Jewelcrafting card, mid-action, with one unmet requirement and two materials (one met, one not). Background: [docs/traps/skill-card-v2.md](../../docs/traps/skill-card-v2.md), [docs/traps/sprites-and-buttons.md](../../docs/traps/sprites-and-buttons.md), [docs/traps/classification.md](../../docs/traps/classification.md).

**V2 is the only card design** (Curtis, 2026-09). Everything below assumes `html[data-iw-skill-card-design="new"]` (ch. 3 §3.4).

## 6.1 The game's card, as the theme expects it

```html
<div class="panel p-3.5">                                   ← Skill Actions panel (the "frame")
  <div class="flex items-center justify-between"><h2>Skill Actions</h2>
    <div><p>Daily XP Boost: … +20% XP</p><p>Resets in 13:17</p></div></div>
  <div class="compact-panel">                               ← one card per recipe
    <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2"> ← the layout SHELL (card's single child)
      <div>                                                 ← identity branch
        <p>💎 Jewel</p>                                     ← discipline label (the game abbreviates some)
        <p>LV 70</p>                                        ← level
      </div>
      <div>                                                 ← content branch
        <p>💎 Prospect Moonsteel Ore</p>                    ← recipe title
        <button title="Click to cycle XP display" class="hover:text-white/70">Lv 70 - 41.1% • 4,120 to go</button>
        <p class="text-red-400">Requires Jewelcrafting Lv 73</p>          ← requirement (colour = met/unmet)
        <p>📦 Moonsteel Ore 3/2 • Silver Dust 1/4</p>                      ← materials line
        <p>Base reward: +677 jewelcrafting XP/task</p>                     ← reward line
        <div class="h-1.5 rounded-full bg-white/10"><div class="…" style="width:41%"></div></div>  ← level progress bar
      </div>
      <div>                                                 ← command branch
        <div><button aria-label="Previous">‹</button><button aria-label="Next">›</button></div>   ← recipe pager
        <button class="bg-ember">Prospect<span style="width: 38%"></span></button>            ← action button (+ running fill)
      </div>
    </div>
  </div>
</div>
```

**Three distinct branches are required**: identity, content and command. They must be direct children of the shell, or of the card itself if your card has no shell. The extension looks for them, and if it cannot find all three it refuses the whole card layout (§6.6). Natively you render them, so they always exist. **Do not add a fourth visible child to the shell** except the skin's own rows (§6.8).

## 6.2 Disciplines

The **type** is the key everything else hangs off. Map your skill id to it:

| Type (`fs-skill--<type>`, `data-iw-skill-v2-type`) | Display label (`data-iw-clean-text` on identity) | Glyph | Game's action verbs (the action button's text) |
| --- | --- | --- | --- |
| `combat` | Combat | ⚔︎ | Fight |
| `mining` | Mining | ⛏︎ | Mine |
| `smithing` | Smithing | ⚒︎ | Smelt, Forge (titles may start with Craft) |
| `gathering` | Herbalism | ❧ | Gather, Harvest |
| `alchemy` | Alchemy | ⚗︎ | Brew |
| `jewelcrafting` | Jewelcrafting | ◆ | Prospect, Cut |
| `spellcrafting` | Spellcrafting | ✧ | Enchant, Gather, Harvest, Craft |
| `tailoring` | Tailoring | ⋈ | Tailor, Sew, Weave, Craft |
| `woodcutting` | Woodcutting | ⋔ | Chop |
| `construction` | Construction | ⌂ | Craft Parts, Build, Craft |
| `crafting` | Crafting | ✦ | Craft |
| `fishing` | Fishing | ⌁ | Fish |
| `locked` | Coming Soon | ◇ | (the disabled control of an upcoming skill) |

The full table, including the extension's detection aliases, is `theme-constants.json` → `skillMeta`.

- **A new discipline** needs a row there, an accent in `skillpanel.css` and an icon decision (the icon atlas is full). That is a theme change in the skin repository, not something to improvise in the game.
- The medallion icon for `woodcutting` reuses the `gathering` cell, and `construction` reuses `crafting` (`theme-constants.json` → `skillIcons`).

## 6.3 The Skill Actions frame (the `.panel` that holds the cards)

| Mark | Value |
| --- | --- |
| class | add `fs-skills-section-frame` (keep every game class) |
| `data-iw-ui` | `section-frame` (ch. 5 §5.1) |
| heading | `data-iw-ui="section-title"` (ch. 5 §5.1) |
| `data-iw-skills-ui-ready` | `1` |
| inline custom properties | all 33 entries of `theme-constants.json` → `skillsUi.inlineStyle` (`--fs-skills-panel-texture`, `--fs-skills-ui-atlas`, `--fs-skills-nav-prev`, `--fs-skills-nav-next`, and the `--fs-ui-<token>-size/-position` windows plus the action-frame slices) |
| collapse | toggle and marks per ch. 5 §5.5; key `title:skill actions` |
| boost line | `data-iw-skill-boost="1"` per ch. 5 §5.4 |

After the frame, as its next sibling, comes the **Village scene** (ch. 10 §10.5).

## 6.4 The card root (`.compact-panel`)

| Mark | Value | Needed? |
| --- | --- | --- |
| class | add `fs-skill-panel` and `fs-skill--<type>` | **yes** (`fs-skill--<type>` sets `--fs-skill-accent`) |
| `data-iw-ui` | `skill-panel` | yes |
| `data-iw-skills-ui-ready` | `1` | **yes**: the action-button art only paints with it |
| inline custom properties | the same 33 `skillsUi` entries as the frame | yes |
| `data-iw-skill-layout` | `three-zone` | yes (§6.6) |
| `data-iw-skill-v2` | `1` | yes |
| `data-iw-skill-v2-type` | the type | yes (selects the action glyph) |
| `data-iw-skill-v2-state` | `expanded` (the only state now) | yes |
| inline `--iw-skill-v2-progress` | `<displayed percent>%` (§6.9) | yes |
| inline `--iw-skill-v2-fill-duration` | tick × 1.12 in seconds (§6.10), only while known | yes |
| inline `--iw-skill-v2-action-label-font` | measured px (§6.11) | yes |
| `data-iw-skill-v2-fill-reset` | `1` for one frame when the running fill restarts (§6.10) | yes |
| `data-iw-skill-v2-long-action` | `1` while a running action is in long-action mode (§6.12) | yes |
| `data-fs-skill`, `data-iw-skill`, `data-iw-skill-glyph`, `data-fs-skill-label`, `data-iw-skill-v2-label-fit` | type / type / glyph / label / cache key | bookkeeping, optional |

## 6.5 Roles on the game's own nodes

`data-iw-skill-role` on each node:

| Node | `data-iw-skill-role` | Extra marks |
| --- | --- | --- |
| discipline label (`<p>💎 Jewel</p>`) | `identity` | `data-iw-clean-text="<display label>"`: the **full** name from §6.2 (`Jewelcrafting`, not `Jewel`) |
| level line (`LV 70`) | `identity-level` | |
| a separate icon leaf in the identity branch (≤ 4 chars, non-alphanumeric), when your markup has one | `identity-icon` | |
| recipe title | `action-title` | `data-iw-clean-text="<title with the leading icon run removed>"` (`Prospect Moonsteel Ore`) |
| XP readout control (the `title="Click to cycle XP display"` button) | `level-progress` | `data-iw-progress-display="<central text>"` (§6.9); readout neutralisation (§6.7) |
| action button | `action-button` | `data-iw-btn-state` (§6.7); plate inline styles (§6.7) |
| each pager button | `nav-button` | `data-iw-nav-direction="prev"` / `"next"`; `data-iw-btn-state`; plate (§6.7) |
| the pager buttons' common parent (when there are two) | `nav-group` | |
| requirement line ("Needs …" / "Requires …") | `requirement` | `data-iw-req-state="met"` / `"unmet"` (§6.9); `data-iw-skill-v2-section="requirements"` |
| reward line ("Base reward: …") | `reward` | `data-iw-skill-v2-section="rewards"` |
| an `N XP` line, when present | `xp-gain` | |
| a discipline detail line: Spellcrafting "… from the ether", Tailoring "Missing materials …", Locked "Unlock in a future update" | `action-detail` | `data-iw-skill-v2-section="details"` (or `queue`, §6.8) |
| the card's level progress bar | `progress-track` | |
| its fill | `progress-fill` | keep the game's `width` |
| every other button in the card | — | `data-iw-btn-state` + plate (§6.7) |

Where the element that carries the text is wrapped in shells with **identical text** (`<div><span>Prospect…</span></div>`), the role goes on the **outermost** same-text shell, stopping before any button, link or `[role=button]`. This applies to identity, title, requirement, reward, detail and xp-gain.

**Zones**: `data-iw-skill-zone` goes on the shell's three branches:

- identity branch → `identity`;
- content branch → `content`;
- command branch → `commands`.

If the shell is not the card itself, the shell gets `data-iw-skill-layout-shell="1"`. The command branch **can be the action button itself** when the game renders the button as the shell's third child. The CSS guards for that (`[data-iw-skill-zone="commands"]:not(button)`). Render whichever your markup is, and mark it the same way.

## 6.6 When `data-iw-skill-layout="three-zone"` applies

Set it only when **all** of these hold:

1. the identity, title and action-button roles resolve;
2. their nearest common ancestor is the card or the card's direct child (the shell);
3. they sit in **three different** direct children of it;
4. the shell has **no other visible, in-flow child**.

Exceptions to condition 4: the skin's own V2 rows (`[data-iw-skill-v2-row]`), the V2 action glyph/label, and an empty progress rail on locked cards are allowed.

Without `three-zone`, the card falls back to a legacy shape: no medallion, no three-column grid, no pager chevrons. **Natively this should always hold.** If your markup ever adds a fourth visible child to the shell (a badge, a queue chip), the card silently loses its whole layout. That child must go inside one of the three branches instead.

## 6.7 Inline styles: control plates, readout, materials

All of these are **inline `!important`**. Use `useImportantStyles` (ch. 3 §3.8). The final maps are precomputed in `theme-constants.json`.

### Buttons

For every `<button>` in the card **except** the XP readout.

**State** (`data-iw-btn-state`):

- disabled (`disabled` or `aria-disabled="true"`) → `disabled`;
- otherwise, for the **action button** → `primary`;
- otherwise, text of 2 characters or fewer → `icon`;
- otherwise, a class matching `bg-ember|bg-orange|bg-primary|bg-accent` → `primary`;
- otherwise → `secondary`.

**Inline map**: `skillButtonFinalInline[<role>][<state>]`, where role is `action-button`, `nav-button` or `other`. For example the action button, `primary`:

```text
font-family: 'Barlow', system-ui, sans-serif; font-size: var(--iw-skill-v2-btn-font, 0px); font-weight: 700;
letter-spacing: var(--iw-skill-v2-btn-tracking, 0.09em); text-transform: uppercase; border-radius: 8px;
transition: var(--fs-button-transition, background .13s, border-color .13s, color .13s, box-shadow .13s);
align-self: center; height/min-height: var(--iw-skill-v2-btn-h, 94px); flex-shrink: 0;
background: var(--fs-button-background, transparent var(--fs-skills-ui-atlas) var(--fs-ui-action-idle-position) / var(--fs-ui-action-idle-size) no-repeat);
border: var(--fs-button-border, 3px double #96bddf); color: #F3E3C0;
text-shadow: 0 1px 0 rgba(0, 0, 0, .85), 0 0 8px color-mix(in srgb, var(--fs-skill-accent, #D8791F) 42%, transparent);
padding: var(--iw-skill-v2-btn-pad, 44px 4px 8px); width/min-width: var(--iw-skill-v2-btn-w, 90px); cursor: pointer;
box-shadow: var(--fs-button-shadow, none)          — every declaration !important
```

These maps were checked in a real browser against the extension's own inline output: **all 54 longhands identical**.

- **Re-derive the state on every render.** The game disables **every** action button while any request is in flight. The plate follows `disabled`, and nothing else changes: no role, no structure.
- The label is hidden (`font-size: 0` via the token) and redrawn by the V2 label mirror (§6.8).

### XP readout

On the readout control, and on each same-text wrapper around it up to (not including) the first ancestor that holds another role or control:

- `data-iw-readout="1"`;
- the `skillReadoutInlineStyle` map:

  ```text
  background: none; border: none; border-radius: 0; outline: none; box-shadow: none; padding: 0; margin: 0;
  width: auto; min-width: 0; height: auto; min-height: 0; max-height: none
  ```

- `cursor: pointer` on the control itself (it really cycles the XP format), `default` on wrappers;
- `transform: none; filter: none; align-self: auto`.

All `!important`.

### Materials line

On the materials `<p>`, and on each same-text wrapper around it:

- `data-iw-ingr="1"`;
- the `skillIngredientInlineStyle` map (`background: none; border: none; border-radius: 0; padding: 0; box-shadow: none`), `!important`.

A line is a materials line when its text matches `^(?!.*\bxp\b).{0,80}\b\d+\s*/\s*\d+\b` (case-insensitive), it has three or fewer element children, it is not inside a button or link, and it is not (and does not contain) the XP readout.

**Never** apply these to the readout: "14,096,043/20,373,233 XP" looks like have/need.

## 6.8 Nodes the card appends (render them as JSX, in these positions)

### Identity branch

Append after the game's own children, in this order:

```html
<span class="fs-skill-medallion-art" aria-hidden="true"
      style="background-image: url(&quot;<base>assets/skills_icons_atlas.webp&quot;); background-size: 600% 200%; background-position: <x>% <y>%; background-repeat: no-repeat;"></span>
<span class="fs-skill-identity-percent" aria-hidden="true">41%</span>          ← only when a percent is known (§6.9)
<span class="fs-skill-identity-progress" aria-hidden="true"><span class="fs-skill-identity-progress-fill" style="width: 41%;"></span></span>
<span class="iw-skill-v2-level-readout" data-iw-skill-v2-level-readout="1"><span class="iw-skill-v2-level">Lv 70</span><span class="iw-skill-v2-percent">41%</span></span>
<span class="iw-skill-v2-xp" data-iw-skill-v2-xp="1" tabindex="0" title="Click to cycle XP display">4,120 to go</span>   ← only when non-empty
```

- The medallion sprite window per type is `theme-constants.json` → `skillIcons.<type>.inlineStyle`, normal priority. The extension also sets `data-iw-skill-art="<type>"` and `data-iw-skill-art-ready="1"`; **`data-iw-skill-art-ready` is read by the CSS**, so emit it.
- The XP line is a **real control**. On click, or Enter/Space, call the same handler the game's readout button uses (cycle the XP display format). The extension forwards the click to the hidden game button (rule 1: the control does exactly what it did).

### Content branch

- **Immediately after the materials line**, insert the ingredient grid:

  ```html
  <div class="fs-skill-ingredient-grid" data-iw-skill-ingredient-list="1" role="list" aria-label="Required materials" data-iw-skill-v2-section="materials">
    <span class="fs-skill-ingredient-item" data-iw-ingredient-state="met" role="listitem">📦 Moonsteel Ore 3/2</span>
    <span class="fs-skill-ingredient-item" data-iw-ingredient-state="unmet" role="listitem">Silver Dust 1/4</span>
  </div>
  ```

  The materials line itself also gets `data-iw-ingredient-list-source="1"` (the CSS hides it).
- **At the end of the branch**, append the base-XP plaque:

  ```html
  <span class="fs-skill-base-exp" aria-hidden="true" data-iw-base-exp="677">Base: 677</span>   ← only when an amount exists (§6.9)
  ```

### Command branch

Append these to **the action button's parent**, never inside the button:

```html
<span data-iw-skill-v2-action-glyph="1" class="iw-skill-v2-action-glyph" aria-hidden="true"></span>
<span data-iw-skill-v2-action-label="1" class="iw-skill-v2-action-label" aria-hidden="true">Prospect</span>
```

The label text is the action button's text with whitespace collapsed. Both are positioned against the same containing block as the button, which is why they must be its **siblings**. Appended to the command zone instead, they sat about 12 px high in live testing.

### Shell

Append these after the three branches:

```html
<div data-iw-skill-v2-controls="1" data-iw-skill-v2-row="tabs" class="iw-skill-v2-controls">   ← only while ≥ 1 requirement is UNMET
  <span data-iw-skill-v2-req-note="1" class="iw-skill-v2-req-note" role="note">Requires Jewelcrafting Lv 73</span>
</div>
<div data-iw-skill-v2-body="1" data-iw-skill-v2-row="body" class="iw-skill-v2-body">                 ← always
  <span class="iw-skill-v2-body-row" data-iw-skill-v2-body-state="met" data-iw-skill-v2-body-kind="material">
    <span class="iw-skill-v2-body-name">📦 Moonsteel Ore</span>
    <span class="iw-skill-v2-body-count"><span class="iw-skill-v2-body-count-owned">3/</span><span class="iw-skill-v2-body-count-required">2</span></span>
  </span>
  …one row per material, then one prose row per "sources" / "details" section
</div>
```

- The **req note** text is every unmet requirement's text, de-duplicated and joined with ` · ` (U+00B7 with spaces).
- The **body** lists, in order:
  - materials, one row per ingredient item (`data-iw-skill-v2-body-kind="material"`, state met/unmet);
  - then each `sources` section's text, then each `details` section's text, as rows **with no** state or kind attributes.

  A material row splits into name and count on the trailing `N/M`: `^(.*?)\s*([\d,]+\s*/\s*[\d,]+)\s*$`. Owned is `"<N>/"`; required is `"<M>"`.

### Sections (`data-iw-skill-v2-section`)

These marks tell the CSS which native lines to clip (they stay in the DOM, 1 px and absolute):

| Section | Given to |
| --- | --- |
| `requirements` | the requirement line |
| `materials` | the ingredient grid |
| `details` | the action-detail line, unless its text mentions queue / missing materials (then `queue`) |
| `rewards` | the reward line (never shown; the Base plaque replaces it) |
| `queue` | a plain text line in the content branch reading "missing materials" / "will queue" / "queued" / "queue first" |
| `sources` | a plain text line starting with gather / harvest / obtain / found / source and containing from / in / at (not the title) |

## 6.9 Derived values: exact rules

| Value | Rule |
| --- | --- |
| **percent** (`percentValue`) | (1) the level progress fill's inline `width` when it is `N%`; else (2) the track's `aria-valuenow / aria-valuemax × 100`, clamped 0–100; else (3) the first `N%` in the readout text. Natively: the player's progress in the level, as a number |
| `.fs-skill-identity-percent` text | `percentValue` rounded to at most one decimal, trailing zeros dropped: `Number(Number(x).toFixed(1)) + '%'` → `41%`, `69.8%`. The node is absent when there is no percent |
| `.fs-skill-identity-progress-fill` `width` | `percentValue` **unrounded** (e.g. `41%`, `69.8192%`), or `0%` |
| `--iw-skill-v2-progress` (card) | the identity-percent **text's** number (rounded), else the readout's `N%`, else the identity branch text's `N%`; clamped 0–100; default `0%` |
| `.iw-skill-v2-level` text | `Lv <n>` (or `Lv <n>+<m>` for a boosted level), from the readout text `Lv <n>` or the identity branch; `Lv —` when unknown |
| `.iw-skill-v2-percent` text | `<n>%` from the same percent sources as `--iw-skill-v2-progress`; `—` when unknown |
| `data-iw-progress-display` (readout) | The readout text with its ` - N% • ` (or ` • N% • `) segment collapsed to ` • `: `Lv 70 - 41.1% • 4,120 to go` → `Lv 70 • 4,120 to go` |
| `.iw-skill-v2-xp` text | The readout text minus a leading `Lv N[+M]` and separator, minus a leading `N%` and separator, with `/` spaced as ` / `, and a unit glued to its number (`24,850,867XP`) split to `24,850,867 XP`. So `Lv 70 - 41.1% • 4,120 to go` → `4,120 to go`, and `Lv 63 • 14,096,043/20,373,233 XP` → `14,096,043 / 20,373,233 XP`. **The format is the player's choice; never compute a number the readout did not show** |
| `.fs-skill-base-exp` | Only when the reward line contains `XP`: the number after `Base reward:` with commas removed → text `Base: <n>`, `data-iw-base-exp="<n>"`. Fallback: an `xp-gain` line `+N XP`. Absent otherwise |
| `data-iw-req-state` | `unmet` when the requirement line, or any element inside it, has a class matching `text-(red\|rose\|orange\|amber\|yellow)-<n>`, `text-danger` or `text-warning`. Otherwise `met`. **Natively: from your requirement check, not your class**. The two must agree, because the game's colour class is how the stock UI shows it (rule 5) |
| ingredient item text / state | One item per material: the game's own text for that material, trimmed, including its leading icon if the game prints one (`📦 Moonsteel Ore 3/2`). `met` when have ≥ need, else `unmet` |

## 6.10 The running fill (action button)

While an action runs, the game renders a fill **inside** the action button: `<span style="width: N%">`, a direct child, rewritten about every 250 ms and starting at 8%. The theme draws it as a band and smooths it:

- `--iw-skill-v2-fill-duration` on the **card** = tick × 1.12, as `(ms * 1.12 / 1000).toFixed(3) + 's'`. The rule is the same as ch. 5 §5.3.
- `data-iw-skill-v2-fill-reset="1"` on the **card** for one animation frame when the width drops (the next repetition started).

Keep the game's fill span exactly as it is: a direct child span with an inline `width`. The CSS finds it with `button[data-iw-skill-role="action-button"]:has(> span[style*="width"])`.

## 6.11 The action label's font size

The mirrored label (`.iw-skill-v2-action-label`) must always fit **one line**. The extension measures it and writes `--iw-skill-v2-action-label-font` on the card:

```text
text   = width of the label's text (a Range over its text nodes) minus the trailing letter-spacing
room   = label.clientWidth − paddingLeft − paddingRight
fit    = floor(currentFontPx × room / text × 10) / 10
value  = clamp(fit, 4, 9.5) + 'px'        (written only when it changes)
```

Re-measure when the label text, the card layout or the button's width changes, when the viewport crosses a breakpoint, and once after `document.fonts.ready`. Natively, do this in `useLayoutEffect` on the label, with a `ResizeObserver`. Skip it when the label measures zero width (a hidden copy).

## 6.12 Long actions: the countdown in the glyph

When the card's action is **running** (its fill span exists) and the Current Action's remaining time is **more than 11 seconds**:

- the card gets `data-iw-skill-v2-long-action="1"`;
- the glyph gets `data-iw-skill-v2-action-timer="1"`, and its **text** becomes the remaining time exactly as the Current Action panel prints it (`0:42`, `1:02:03`, `1h 2m 3s`).

Once a run has entered this mode, it stays in it until the action stops, even when the remaining time drops under 11 s. When the fill span disappears, remove both attributes and empty the glyph's text.

Natively, read the remaining time from the same state the Current Action panel renders. The extension parses that panel's text, so the strings must be the **same strings**.

## 6.13 States to diff

| State | What changes |
| --- | --- |
| idle | fill absent; no long-action |
| running, short action | fill span; `--iw-skill-v2-fill-duration`; the reset frame at each completion |
| running, long action | plus long-action + timer glyph text |
| disabled (cannot afford / busy) | every affected button → `data-iw-btn-state="disabled"` and its map (the action button draws the disabled atlas cell) |
| requirement unmet | `data-iw-req-state="unmet"`; the foot row and note appear |
| requirement met | `met`; no foot row |
| a material short | its item → `unmet`; its body row → `data-iw-skill-v2-body-state="unmet"` |
| locked ("Coming soon" / "Upcoming skill" + "Unlock in a future update", disabled control) | type `locked`: `fs-skill--locked`, action button = the disabled control, detail line = the unlock text |
| XP display format cycled | readout, `data-iw-progress-display`, XP line text |

## 6.14 JSX sketch

```tsx
function SkillCard({ recipe, skill }: Props) {
  const s = useSkin();
  const type = skinTypeFor(skill.id);                        // §6.2
  const meta = THEME.skillMeta[type];
  const pct = skill.progressPercent;                         // number | null
  const pctText = pct == null ? '' : `${Number(pct.toFixed(1))}%`;
  const unmet = recipe.requirements.filter(r => !r.met);
  const actionRef = useImportantStyles<HTMLButtonElement>(s.on ? THEME.skillButtonFinalInline['action-button'][recipe.disabled ? 'disabled' : 'primary'] : null);
  const readoutRef = useImportantStyles<HTMLButtonElement>(s.on ? { ...THEME.skillReadoutInlineStyle, cursor: 'pointer', transform: 'none', filter: 'none', 'align-self': 'auto' } : null);
  return (
    <div className={cx('compact-panel', s.on && `fs-skill-panel fs-skill--${type}`)}
      {...marks(s.on, { 'data-iw-ui': 'skill-panel', 'data-iw-skills-ui-ready': '1', 'data-iw-skill-layout': 'three-zone',
        'data-iw-skill-v2': '1', 'data-iw-skill-v2-type': type, 'data-iw-skill-v2-state': 'expanded',
        'data-iw-skill-v2-long-action': longAction ? '1' : undefined, 'data-iw-skill-v2-fill-reset': fillReset ? '1' : undefined })}
      style={s.on ? { ...THEME.skillsUi.inlineStyle, '--iw-skill-v2-progress': `${pct == null ? 0 : Number(pct.toFixed(1))}%`,
        ...(fillMs && { '--iw-skill-v2-fill-duration': `${(fillMs * 1.12 / 1000).toFixed(3)}s` }),
        ...(labelFont && { '--iw-skill-v2-action-label-font': labelFont }) } : undefined}>
      <div className="grid grid-cols-[60px_minmax(0,1fr)] gap-2" {...marks(s.on, { 'data-iw-skill-layout-shell': '1' })}>
        <div {...marks(s.on, { 'data-iw-skill-zone': 'identity' })}>
          <p {...marks(s.on, { 'data-iw-skill-role': 'identity', 'data-iw-clean-text': meta.label })}>{skill.icon} {skill.shortName}</p>
          <p {...marks(s.on, { 'data-iw-skill-role': 'identity-level' })}>LV {skill.level}</p>
          {s.on && <>
            <span className="fs-skill-medallion-art" aria-hidden="true" data-iw-skill-art-ready="1" style={THEME.skillIcons[type].inlineStyle} />
            {pctText && <span className="fs-skill-identity-percent" aria-hidden="true">{pctText}</span>}
            <span className="fs-skill-identity-progress" aria-hidden="true"><span className="fs-skill-identity-progress-fill" style={{ width: pct == null ? '0%' : `${pct}%` }} /></span>
            <span className="iw-skill-v2-level-readout" data-iw-skill-v2-level-readout="1"><span className="iw-skill-v2-level">{levelText}</span><span className="iw-skill-v2-percent">{pctText || '—'}</span></span>
            {xpLine && <span className="iw-skill-v2-xp" data-iw-skill-v2-xp="1" tabIndex={0} title="Click to cycle XP display" onClick={cycleXpDisplay} onKeyDown={enterOrSpace(cycleXpDisplay)}>{xpLine}</span>}
          </>}
        </div>
        {/* content branch: title, readout (ref={readoutRef}), requirement, materials + grid, reward, bar, plaque … */}
        {/* command branch: pager (nav-group/nav-button), action button (ref={actionRef}) with the game's fill span, then glyph + label siblings */}
        {s.on && unmet.length > 0 && <div data-iw-skill-v2-controls="1" data-iw-skill-v2-row="tabs" className="iw-skill-v2-controls">
          <span data-iw-skill-v2-req-note="1" className="iw-skill-v2-req-note" role="note">{[...new Set(unmet.map(r => r.text))].join(' · ')}</span></div>}
        {s.on && <div data-iw-skill-v2-body="1" data-iw-skill-v2-row="body" className="iw-skill-v2-body">{/* rows §6.8 */}</div>}
      </div>
    </div>
  );
}
```

## 6.15 Acceptance

- Diff every state in §6.13 at 1440, 1100, 768 and 390 px.
- A requirement that turns unmet **after** the card first renders must show its note on the same render. The extension learned this the hard way.
- The action label fits one line for the longest live verb (`CRAFT PARTS`).
- `tests/skill-card-v2-render.test.mjs` explains the paint traps. The title and discipline name are drawn by `::before` from `data-iw-clean-text` over zero-size native text, so any `font-size` on those elements shows the raw text twice.
