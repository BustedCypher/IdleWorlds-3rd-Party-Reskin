# 9. World Bosses and Zone Control

Golden markup:

- before: [`generated/golden/dashboard/world-bosses.before.html`](generated/golden/dashboard/world-bosses.before.html)
- after: [`generated/golden/dashboard/world-bosses.after.html`](generated/golden/dashboard/world-bosses.after.html)

That example is an Ancient Treant card in its prejoin window, plus a red-held Zone Control card. Source: `src/modules/WorldBossPanels.js`, `UIFoundation.classifyBossCards`. Background: [docs/traps/classification.md](../../docs/traps/classification.md) (the boss grid, the participation hit-test) and [docs/zone-control-motion-notes.md](../../docs/zone-control-motion-notes.md).

**Note: the technical handover's Appendix D is out of date for this surface.** The current code (after commit `2ca5f3f`, "unify world boss action buttons") uses the action states below. It writes no `data-iw-boss-action-label` and no `data-iw-boss-art-ready`.

## 9.1 The game's panel, as the theme expects it

```html
<div class="panel p-3.5">
  <div><h2>World Bosses</h2><p>Shared world events</p></div>
  <div class="compact-panel">                                   ← boss card
    <div>                                                       ← header (the card's first child)
      <div><p>🌍 Ancient Treant</p><p>Solo</p><p>Buff on kill: +4 XP/task for 1h</p></div>
      <button>Prejoin</button>                                  ← action (may sit one level deeper, in a flex-col wrapper)
    </div>
    <div class="h-1.5 rounded-full"><div style="width: 40%"></div></div>   ← HP / progress
    <button>World boss participation</button>
    <div class="fighter-details"><p>Top Fighters</p>…</div>
    <div><p>Respawns 3m left</p></div>                          ← status (its <p> is the timer)
  </div>
  <h2>Zone Control</h2>
  <div class="compact-panel">                                   ← zone control card
    <div><p>🔴 Red Team controls Zone 12</p></div>
    <p>12,500 / 20,000 HP</p>
    <div class="h-1.5 rounded-full"><div style="width: 62.5%"></div></div>
    <p>Protected for 1h</p>
    <button>Last battle participants</button>
  </div>
</div>
```

## 9.2 Panel-level marks

| Node | Mark |
| --- | --- |
| the panel | `section-frame` and the collapse marks (ch. 5). The panel **also** holds the Zone Control card |
| every **leaf** `.compact-panel` in the panel (one that holds no other `.compact-panel`) | `data-iw-boss="card"` |
| **after** the heading's wrapper, or after the heading itself when the wrapper is the panel or contains a card | appended `<p class="iw-boss-notice" data-iw-boss-owned="1">There are no minimum requirements and no risk in joining and contributing to a world boss encounter.</p>` |

The notice is **skin-authored gameplay copy**: finding CONT-01, owner decision B-06 in the technical handover. Reproduce it exactly until IdleWorlds decides whether to keep it or replace it with its own copy.

## 9.3 Card marks (boss and zone control)

A card gets the marks below only when its title is either:

- a known boss: **Ancient Treant**, **Abyssal Behemoth**, **World Eater**; or
- a zone-control title: `… controls Zone N`, or `Zone N … Race to capture` / `… contested`.

Anything else keeps only `data-iw-boss="card"`.

| Node | Mark |
| --- | --- |
| card | `data-iw-encounter` = `ancient_treant` / `abyssal_behemoth` / `world_eater` / `zone` |
| the card's first child (header) | `data-iw-boss-role="header"` |
| the header's first `<p>` (the title) | `data-iw-boss-role="title"` |
| the action button: the first button in the header whose text matches prejoin / fight / defeated / join, at any depth | `data-iw-boss-role="action"` and `data-iw-boss-action-state` (§9.4). For Zone Control's "Fight for Red/Blue" **only**, also `data-iw-boss-action-team="red"` / `"blue"` |
| the first button or `<p>` reading "World boss participation" / "N players currently fighting world boss" / "Last battle participants" | `data-iw-boss-role="participation"` |
| `<p>` whose whole text is `Solo`, `Raid` or `Mythic` | `data-iw-boss-role="difficulty"` |
| `<p>` starting `Buff on kill:` | `data-iw-boss-role="buff"` |
| `<p>` starting `Respawns` / `Buff active` / `No world buff` / `Protected for`, or ending `<n> HP` | `data-iw-boss-role="timer"`. Its parent, unless that parent is the card or the header, also gets `data-iw-boss-role="status"` |
| a direct child of the card that is a single-child progress bar (inline `width: N%` fill; class contains `h-1`, `progress` or `rounded-full`) | `data-iw-boss-role="progress"` |
| a direct child containing "Top Fighters" / "Last Kill Participants" | `data-iw-boss-role="details"` |
| appended to the card (once) | `<div class="iw-boss-art" data-iw-boss-owned="1" aria-hidden="true"></div>` (the encounter art) |

Boss cards then get the rewards disclosure (§9.5); zone-control cards get §9.6.

## 9.4 The action button

The label is drawn by the art: the button's own text is transparent at `font-size: 0`, but it stays the accessible name. The box is fixed at 150 × 30, a 5:1 ratio.

| Game's text | `data-iw-boss-action-state` | Art |
| --- | --- | --- |
| contains `Fighting` | `fighting` | `world_boss_fighting-v3.png`, orange glow |
| contains `Prejoined` (e.g. `⏳ Prejoined`) | `prejoined` | `world_boss_prejoined-v2.png`, blue glow |
| a whole word `Prejoin`, `Join` or `Fight` (`Prejoin`, `Fight Boss`, `⚔️ Fight for Red!`) | `join` | `world_boss_join-v2.png` (hover `…_hover-v2.png`), gold glow. With `data-iw-boss-action-team`, the glow is red or blue instead |
| anything else (`Defeated`) | `idle` | no art: the game's word on a plain plate at the same box. Painting JOIN over "Defeated" would lie (rule 5) |

The state follows the game's text on **every** render. Natively, derive it from the encounter state:

- fighting → `fighting`;
- prejoined → `prejoined`;
- can join, prejoin or fight → `join`;
- otherwise → `idle`.

## 9.5 Boss rewards disclosure (boss cards only), appended to the card

```html
<details class="iw-boss-rewards" data-iw-boss-owned="1" aria-label="Ancient Treant possible rewards" open>
  <summary class="iw-boss-rewards-title" data-iw-boss-owned="1">Possible Rewards</summary>
  <div class="iw-boss-reward-list" data-iw-boss-owned="1">
    <button class="iw-boss-reward" data-iw-boss-owned="1" type="button" data-iw-tooltip-trigger="1"
            data-iw-item="miners_gloves" data-iw-item-name="Miner's Gloves" aria-label="Miner's Gloves — item details">
      <span class="iw-boss-reward-icon" data-iw-boss-owned="1" aria-hidden="true" style="(item sprite window, ch. 8 §8.6)"></span>
      <span class="iw-boss-reward-name" data-iw-boss-owned="1">Miner's Gloves</span>
    </button>
    …
  </div>
</details>
```

- **Reward list, in order:**
  - the boss's fixed ids (`theme-constants.json` → `worldBosses`; for example the Treant's nine skill gloves);
  - then every catalogue item with `acquisition_type` `BossDrop` whose acquisition summary or detail names the boss;
  - then `trader_token`;
  - then `boss_upgrade_orb`.

  De-duplicate the list. Skip ids with no catalogue record and no fallback record (`assets/world-bosses/rewards.json`, plus the two inline fallbacks in the source).
- The Upgrade Orb tile uses the **Copper Upgrade Orb** icon. A tile with no sprite shows `◆` as its icon text.
- `open` = not collapsed. The player's choice persists per boss (`iw-boss-rewards-collapsed:<bossKey>` in the extension). Default is open; on SSR, render open and apply the stored choice after mount.
- Each tile is a tooltip trigger (the tooltip workstream's). The tile's look does not depend on it.

## 9.6 Zone Control

**Card marks:**

| Node | Mark |
| --- | --- |
| card | `data-iw-control` = `red` (title reads "Red Team controls"), `blue` ("Blue Team controls"), else `contested` |
| the element holding both "Red Team" and "Blue Team" rosters | `data-iw-boss-role="control-teams"` |
| the element whose first child starts with `Queue` | `data-iw-boss-role="control-queue"` |
| the `… HP` line | `data-iw-boss-role="control-hp"` |
| the progress track | `data-iw-boss-role="control-progress"` |
| each team's native strength row, during a race (hidden by CSS) | `data-iw-boss-role="control-strength"` |

**Team colour is game state.** Never repaint it uniformly (rule 5).

**The dominion block**, appended to the card. The exact markup is in the golden file; the variable parts are:

| Element | Content |
| --- | --- |
| `.iw-control-crest` | 3 art layers (`-red`, `-blue`, `-contested`), 2 sword-energy spans each holding an impact span, and a crystal core. `aria-hidden="true"` |
| `.iw-control-kicker` | `Dominion Ward` |
| `.iw-control-state` | `Crimson Dominion` (red) / `Azure Dominion` (blue) / `Ward contested` |
| `.iw-control-meter-label` | `Ward Strength` during a race with readable strengths, else `Ward Integrity` |
| `.iw-control-meter-value` | race: `<red raw> · <blue raw>`; else the HP line's text; else `Under siege` (contested) / `Fortified` |
| `.iw-control-meter-fill` inline style | race: `width: 100%` and `--iw-control-split: <red ÷ (red + blue) × 100, rounded to 1 decimal>%`. Otherwise `width: <the control progress bar's %, or 100>%` |
| `.iw-control-meter-track` ARIA | `role="progressbar"`. Race: `aria-label="Ward strength balance"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow="<split>"`, `aria-valuetext="Crimson <red>, Azure <blue>"`. With a percent: label `Ward integrity`, value = percent, no valuetext. Neither: label `Ward integrity`, valuetext = the value text, no valuenow/min/max |
| `.iw-control-factions` | `Crimson Oath` ✦ `Azure Covenant` |

This block is also skin-authored copy (CONT-01); keep it verbatim until the owner decides otherwise.

**Impact animation.** When a team's strength changes during a race, the extension plays a Web Animations API sweep on `.iw-control-impact-<team>`:

- keyframes: opacity 0 → 0.65 (0.4 on phones) → 0, and `translateX(-100%) scaleX(.45)` → `translateX(65%) scaleX(1.1)` at 42% → `translateX(330%) scaleX(.6)`;
- 1250 ms (1000 ms at 760 px or narrower), with blue delayed 170 ms, easing `cubic-bezier(.3,.1,.3,1)`;
- **never** under `prefers-reduced-motion: reduce`.

Port that exactly: `element.animate(...)` in an effect keyed on the strength values.

## 9.7 Layout facts the CSS depends on

- **Grid:** `104px auto minmax(0, 1fr)`. The participation link owns the `auto` column and the status (timer) the `1fr` column, so a long "28 players currently fighting world boss" never overlaps the HP readout. Keep participation and status as **separate** children of the card.
- **Action button position:** matched at any depth inside the header; lifted relative to the **card**. Do not make the header or its wrapper `position: relative`: that changes the button's containing block and drags it inward.

## 9.8 States to diff

| Card | States |
| --- | --- |
| each boss | respawning; prejoin open (`join`); prejoined; fighting; defeated (`idle`) |
| zone control | red-held; blue-held; race with strengths (the `factions` split); contested without strengths |
| rewards | collapsed and open |
