# 12. Controls, compact buttons, the Tailwind hooks the CSS reads, motion, responsive

## 12.1 The generic control plate (automatic; know what opts out)

`07-ui-system.css` paints **every** `button` and `[role="button"]` on the page with a forged plate: (0,4,1) `!important`, the last sheet. You emit nothing for it. You only need to know which marks **opt a control out**, so that you never put one of them on a control the extension left generic, and never forget one on a control it did not.

The rule's `:not()` chain (`ui-system.css` around line 1019) is:

```text
.iw-item-ref                      [data-iw-collapse]                [data-iw-compact-button]
[data-iw-inventory-control]       [data-fs-preserved-action="control"]   [data-iw-ui="nav-tab"]
[class*="chat-name-"]             [class*="hover:underline"]        [class*="decoration-dotted"]
[data-iw-skill-role="level-progress"|"nav-button"|"action-button"]
[data-iw-quest-role]  [data-iw-boss-role]  [data-iw-village-role]  .iw-boss-reward
[data-iw-ui="section-title"]  [data-iw-header="utility-button"|"status-card"|"profile-online"]
[data-iw-ui="zone-action"]  [data-iw-zone-link]  [data-iw-panel-part="header-tools"] button
[data-iw-panel-part="panel-control"]  [data-iw-panel-part="queue"] > button  [data-iw-panel-part="send"]
[data-iw-market]  [data-iw-header="profile-name"] button  [data-iw-order-handle]  [data-fs-inv]
```

Similar chains exist in `base.css` (lines ~428–522).

**Consequences:**

1. **Text-link buttons stay text links through their Tailwind classes.** A player name in chat is `button.chat-name-3.hover:underline`. It is not plated **only because** its class contains `chat-name-` and `hover:underline`. Keep those class substrings on those elements (§12.2).
2. **A skin mark on a button changes its paint.** The chain decides whether the generic plate applies at all. Never add a mark from this list to a control the extension did not mark.
3. The retired `[data-iw-order-handle]` stays in the chains for specificity. Never emit it (ch. 3 §3.11).

## 12.2 Tailwind class substrings the CSS matches (keep them on the same elements)

The theme reads a handful of **game** class substrings. Renaming the utility, or moving it to a wrapper, changes the paint.

| Substring | Read by | Meaning to the theme |
| --- | --- | --- |
| `hover:underline`, `chat-name-`, `decoration-dotted` | `base.css`, `ui-system.css` control chains | a text link: no plate |
| `rounded-3xl`, `rounded-2xl`, `rounded-xl`, `rounded-lg`, `rounded-md`, `rounded-full` + `px-` | `base.css` | radii flattened to the theme's 3 px / 2 px |
| `border` together with `rounded-*` | `base.css` | recoloured border |
| `opacity-30` | `ui-system.css` | dimmed state kept |
| `tab` | `base.css` (`[class*="tab"] button`) | tab button weight/radius |
| `bg-ember`, `bg-orange`, `bg-primary`, `bg-accent` | skill-card button state (ch. 6 §6.7) | "primary" control |
| `text-(red\|rose\|orange\|amber\|yellow)-<n>`, `text-danger`, `text-warning` | requirement state (ch. 6 §6.9) | unmet |
| `(bg\|text\|border)-(orange\|amber\|primary\|accent)`, `data-[state=active]`, and the attributes `aria-selected="true"`, `aria-current="page"`, `data-state="active"` | nav / filter / loadout active state | the active control (rule 5) |
| `feed-panel` | `ui-system.css` | the log/chat feed background |
| `absolute` + `rounded-full` on a span inside a header icon button | `header.css` §4d | the unread pill |
| `header-icon-btn`, `header-player-name`, `stat-chip`, `.grid.grid-cols-2` | header (ch. 4) | header parts |

The full list is in [`generated/css-structure-contract.md`](generated/css-structure-contract.md), family "game markup only", and in the technical handover's Appendix C, section C.1.

## 12.3 Compact buttons (the three-layer crossfade art)

These controls get `data-iw-compact-button` plus **three appended layers**, as their last children:

```html
<span data-iw-compact-layer="idle" aria-hidden="true"></span>
<span data-iw-compact-layer="hover" aria-hidden="true"></span>
<span data-iw-compact-layer="clicked" aria-hidden="true"></span>
```

| Control | `data-iw-compact-button` |
| --- | --- |
| nav tabs and the Toolkit link (ch. 4) | `text` |
| zone actions `Zones` / `Previous Zone` / `Next Zone` (ch. 4) | `text` |
| inventory filter tabs and pagers (ch. 8) | `text` |
| World Chat `Send` (ch. 5) | `text` |
| inventory row controls kept live (ch. 8 §8.3) | `text`; `icon` when the action kind is `icon` |
| the `Change Zone` button | `text` |
| an icon-only button (no text, or only a clock glyph ⏱ ⏲ ⏰ ⌚) that is a **sibling** of a `Change Zone` button | `icon` |
| the loadout pair: exactly two sibling buttons labelled `I` and `II` | `icon`, and the selected one also gets `data-iw-compact-selected="true"` |

**Loadout selection** is the game's state (rule 5), read in this order:

1. `aria-pressed` / `aria-selected` when present (`"true"` = selected);
2. else `data-state="active"`;
3. else a class matching `(bg|text|border)-(orange|amber|primary|accent|ember)`.

**Never** on the collapse toggle, or on any other control.

The art comes from `<html>`'s `--iw-compact-atlas`, keyed by `html[data-iw-compact-atlas="compact-ghost-v3"]` (ch. 3 §3.4). The layers' opacity is the hover/pressed state machine. Do not style them.

## 12.4 Motion

Everything below is CSS, except the Zone Control impact sweep (ch. 9 §9.6). You emit nothing beyond the marks and the timing values already described.

| Motion | Where | Driven by |
| --- | --- | --- |
| progress glide + snap-back | Current Action bar (ch. 5 §5.3), skill action fill (ch. 6 §6.10) | `--iw-progress-duration`, `--iw-skill-v2-fill-duration`, and the one-frame reset attributes |
| meter shimmer (`iw-control-meter-current`), Zone Control currents, filaments, aura, crystal | Zone Control | CSS keyframes (10 infinite animations in `ui-system.css`) |
| unread alert (`iw-hd-alert-breathe`, `iw-hd-alert-ring`) | header utility buttons with an unread pill | CSS keyframes (2 infinite) |
| quest ready settle (`iw-quest-ready-settle`) | the objective icon of a quest card in state `ready`, only with `prefers-reduced-motion: no-preference` | CSS keyframe |
| compact button crossfades, hover blooms | controls | transitions |
| impact sweep | Zone Control, when strengths change | Web Animations API (ch. 9 §9.6) |

**Reduced motion.** `01-base.css` contains (source `base.css:692`):

```css
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important } }
```

- This also freezes the **game's own** animations for those players. That is finding FUN-03, owner decision B-03 in the technical handover.
- Keep it for parity; the owner decides later.
- Twelve more `prefers-reduced-motion` blocks keep states without movement.

## 12.5 Responsive behaviour

All responsive behaviour is in the CSS. **Your only job is to render the same DOM at every width** (the stock game's own width-dependent markup excepted).

| Kind | Values |
| --- | --- |
| Viewport breakpoints used by the theme | 1280/1279 (the duplicate stack swap), 1024, 861/860 (header chrome stacks), 768/767 (the Toolkit link hides; header mobile art), 761/760 (boss card, Zone Control), 641/640 (quest command block leaves the flow), 560, 520, 480, 430, 420, 400, 384, 380 |
| Container queries (**key on the box, not the viewport**) | `iw-skill-card` (≤ 580, ≤ 480) on the skill card; `iw-skill-body`; `iw-village` (≤ 470) on `.iw-vs-scene`; `iw-village-frame` (≥ 592) on `.iw-vs-body`; `iw-inventory-filters`; `iw-nav-row` |
| Pointer | `(pointer: coarse)` ×2; `(hover: hover) and (pointer: fine)` ×1 |

The container queries mean these elements' **widths decide their layout**:

- the skill card;
- the Village scene and ledger;
- the inventory filter row;
- the nav row.

Do not add wrappers that change those widths. Parity at the widths in chapter 13 §13.4 proves it.

[docs/traps/mobile.md](../../docs/traps/mobile.md) explains the phone-specific decisions (single-row menus, the Toolkit slot).
