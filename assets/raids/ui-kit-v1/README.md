# Ashen Iron raid UI kit · v1

Polished design and implementation artwork for the approved Thessaly layout.
The original preview is a standalone design example. The boss headshot overlays
and other HUD sprites are now wired into the live extension. Sample buffs,
damage, timers and percentages in the preview are demonstration
data; integration must use the game's observed state.

## View the design

The latest boss artwork is in `boss-health-atlas.png`, with five separately
generated transparent overlays. `boss-portraits/preview.html` shows transparent
channels on a checkerboard and live fill beneath each frame.
See `boss-portraits/README.md` for coordinates, encounter wiring and verification.
The original `raid-ui-atlas.png` retains the earlier skull study for reference;
the live boss HUD uses the five `sprites/boss-health-{boss}.png` files.

Open `preview.html` directly in a browser, or serve the project and visit
`/assets/raids/ui-kit-v1/preview.html`. Desktop, tablet, and portrait tablet
and mobile buttons change the encounter canvas. HP sliders demonstrate independent live
fills; low player health switches to the critical frame. Select a raider to
see the selected frame. Additional effects wrap onto another visible line.

The preview reuses the project's actual Thessaly arena, Cinzel and Barlow
fonts, shared panel corners and surface texture. It requires those existing
relative project assets. It makes no game or external network requests.

Rendered examples are in `output/raid-ui-kit-v1/`: `desktop.png` (1600×960),
`tablet.png` (1024×768), `portrait.png` (768×1024), and `mobile.png` (390×844).

On phones, the same atlas supplies a three-column party grid (118×68px
cards at a 390px screen width), with the final seventh player centered.
The boss name is centered above the portrait. Simple 26px health and cast bars
sit directly above the raid party, leaving the portrait clear. These mobile
bars use CSS rather than the ornate boss sprites. The personal HP
panel spans the lower dock, with two tap-to-open utility disclosures below.
Every player's active effect icons and durations stay visible.

## Design decisions

- Desktop/tablet: left-aligned boss identity, standing count, ornate health shell and cast bar.
  Its forged iron, brass scrollwork, rivets and jewel details follow the
  existing skill-card artwork. Red boss HP remains visually distinct from the
  amber cast timer.
- Keep the upper two thirds free of party and utility panels. The right side
  of the painting stays open for the boss. No enclosing opaque boss panel.
- Raid cards are 132×68 CSS pixels in the atlas, separated by 6px. The sample
  content also measures 132×68px. A 960px desktop strip contains all seven players;
  portrait tablet wraps four plus three, centered.
- Put a 16px original skill glyph at the far left, then name, skill, HP value,
  two thin bars and visible effect symbols with values/durations. These are
  deliberately compact inspection frames. Full effect meanings remain in
  accessible labels/tooltips. Extra effects wrap; never hide behind `+N`.
- Personal HP stays bottom center. A quiet teal jewel and selected-player
  trim distinguish it from the brass boss frame. The sample selected raider
  does not replace the personal HUD.
- Desktop utility panels use the existing shared corner art. Tablet turns
  them into compact disclosures; their open contents remain in the bottom
  encounter area. The kit also includes a matching utility shell for other
  implementations.

## Files

| File | Purpose |
| --- | --- |
| `raid-ui-atlas.png` | Transparent RGBA 2048×1024 packed atlas, 2× display resolution |
| `index.json` | 24 named sprite rectangles, native and logical sizes, provenance |
| `atlas.css` | Percentage sprite windows for all entries |
| `sprites/*.png` | The same registered sprites as separate transparent files |
| `chrome-source.png`, `status-source.png` | Untouched built-in ImageGen outputs |
| `prompts.json` | Complete generation prompts and reference provenance |
| `preview.html`, `preview.css`, `preview.js`, `index.js` | Working standalone UI example |

Eight chrome sprites: `boss-health`, `boss-cast`, `unit-normal`,
`unit-selected`, `unit-critical`, `personal-hud`, `utility-panel`, `divider`.

Six new status sprites: `shield`, `ward`, `war-cry`, `curse`, `bleed`, `taunt`.

Ten skill glyphs are rasterized from the project's **existing** white SVGs:
`skill-combat`, `skill-jewelcrafting`, `skill-tailoring`, `skill-construction`,
`skill-mining`, `skill-woodcutting`, `skill-alchemy`, `skill-gathering`,
`skill-smithing`, `skill-spellcrafting`. Their originals are unchanged.
Status and skill sprites use square cells with contained, centered artwork.
All three unit states share identical 264×136 atlas windows.

## Consume the atlas

Load `atlas.css`, then size a sprite with its registered aspect ratio:

```html
<i class="raid-art" data-sprite="unit-selected" style="width:132px"></i>
<i class="raid-art" data-sprite="skill-mining" style="width:16px"></i>
<i class="raid-art" data-sprite="curse" style="width:12px"></i>
```

The coordinates in `index.json` are physical pixels. `pixelRatio: 2`
means the intended CSS size is half the registered width and height.
For canvas rendering, use an entry's `x`, `y`, `width`, `height` as the
source rectangle and scale its destination uniformly. There are 8px
transparent gutters. Do not sample the whole atlas as one background.

CSS percentage window formulas, where W/H are atlas dimensions and w/h are
the entry dimensions:

```text
background-size:     (100 × W / w)% (100 × H / h)%
background-position: (100 × x / (W − w))% (100 × y / (H − h))%
```

Frame text and progress are **not baked into the atlas**. Use independent
elements above the empty artwork. Desktop/tablet content boxes use these
fractions of the complete frame rectangle:

| Frame | Left | Right | Top | Height / bottom |
| --- | ---: | ---: | ---: | ---: |
| Boss health channel | 27.7% | 13.5% | 45% | height 23% |
| Cast channel | 13.5% | 13.5% | 31% | height 36% |
| Personal HUD content | 6% | 6% | 28% | bottom 13% |

The skull consumes space in the boss sprite, so center HP text in the
**channel**, not in the complete decorative image. `preview.css` shows these
layers and the separate amber health, blue charge and red boss fills.

The preview uses Ashen Iron values from `src/styles/base.css`: dark grounds
`#171713` / `#0d0e0c`, brass `#d4ad63`, edge `#6b4f28`, ivory `#f0e8d6`,
muted text `#938a79`, and teal `#75a8c8`. Actual gameplay colours remain owned
by the game; retain its HP thresholds and effect semantics on integration.

For extension integration, namespace the sample classes and change the
`atlas.css` background URL to `url('../assets/raids/ui-kit-v1/raid-ui-atlas.png')`
so `StyleInjector` can resolve it. Follow the existing `GuildPanels` role hooks
and lifecycle-owned CSS. Keep React node identities and event handlers;
position native nodes with CSS instead of reparenting them. Add only
reversible, pointer-transparent decorations and derive every effect from
observed state. The live implementation uses these rules with the five
encounter-specific overlays; source changes require rebuilding the bundle.

## Rebuild and verify

```text
node build-tools/build-raid-ui-kit.mjs
node build-tools/verify-raid-ui-kit.mjs
```

The builder uses the installed Playwright browser and browser canvas only to
trim, contain, rasterize and pack existing artwork. It never changes the source
PNG/SVG files. If the browser cache lives outside the process's default cache,
set `PLAYWRIGHT_BROWSERS_PATH` to your installed cache before running.

The verifier fulfils all asset requests directly from disk, so no local server
or internet access is required. It checks atlas bounds and overlaps,
transparency, card sizing, effect containment, portrait wrapping, centered HP,
upper-two-thirds clearance, font loading, selection and critical state. It
renders all four layouts and writes `output/raid-ui-kit-v1/verification.json`.
These are standalone browser checks, not live game verification.

Artwork was generated with the built-in `image_gen` tool. `prompts.json`
preserves the full prompts; packing and the preview are deterministic.
