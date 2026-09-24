# 2. What we assume about the game's code, and where the theme plugs in

The skin was built **without** the game's source. Everything below is inferred from:

- the deployed bundle;
- live DOM captures;
- the regression suites' copies of live markup.

Each assumption carries its evidence and a **"if yours differs"** instruction. None of the rules in later chapters depends on these being exactly right: the contract is defined by the DOM that must come out, not by how your components are named.

Evidence labels:

- **[Bundle]**: read from the deployed Next.js bundle;
- **[Capture]**: a live DOM or layout capture (`claude/captures/`, or a capture quoted in `docs/traps/`);
- **[Test]**: a regression fixture built from live markup;
- **[Assumption]**: inferred, needs your confirmation.

## 2.1 Stack

| # | Assumption | Evidence | If yours differs |
| --- | --- | --- | --- |
| S1 | **Next.js** app, client-side route transitions | [Bundle] `/_next/static/chunks/9075-ab1177f6f4522a71.js`, `/_next/static/css/47785f59571f8636.css` | Nothing in the contract depends on Next; only §2.6 (SSR) does |
| S2 | **React 18+** with SSR + hydration | [Bundle] the hydration probe reads `__reactContainer$…` → `memoizedState.isDehydrated`; appending nodes mid-hydration raised **React error #418** | If you render client-only, §2.6's hydration rules relax |
| S3 | **Tailwind CSS**, default breakpoints `sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536` | [Capture] utility classes everywhere (`xl:hidden`, `max-w-[1380px]`, `text-white/45`, `grid-cols-[60px_minmax(0,1fr)]`) | The theme CSS matches Tailwind class **substrings** in a few places (chapter 12 §12.2). Keep those class names on those elements |
| S4 | **shadcn/ui-style design tokens** on `:root` | [Bundle] `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--accent`, `--ring`, `--border`, `--input`, `--muted`, `--sidebar*`, plus the game's own `--panel-bg`, `--panel-border`, `--surface-bg`, `--surface-border`. `base.css` overrides all of them | If you rename a token, the stock components that read it stop picking up the theme's value. Keep the names |
| S5 | **Radix-style primitives**: `data-state="active"`, `aria-pressed`, `aria-selected`, `role="switch"` | [Bundle] `role` appears only as `button` and `switch`; `data-[state=active]` Tailwind variants | The active-state rules in chapters 4, 8 and 12 read these; keep emitting them |
| S6 | **lucide-react** icons | [Capture] `svg.lucide.lucide-package.text-ember` in the inventory tool row; lucide `<svg>` inside skill pager buttons | Chapter 8 §8.3 tags the bare tool-row svg; chapter 6 hides pager svgs |
| S7 | A game-level skin switch already exists: `data-skin="default"` on the root wrapper | [Bundle] only four durable hooks exist in the whole app; `data-skin` is one | **Recommended integration point**: `data-skin="fantasy"` selects the native theme (§2.5) |

## 2.2 Durable hooks the game already ships

These are the only stable identifiers the game renders today [Bundle]:

- `.panel`: the card primitive on every route;
- `.compact-panel`: the inner card shared by skill, quest, boss, village, shop and stat cards;
- `.compact-row`: list rows (inventory, market, salvage, chat and log rows);
- `#current-action-panel`: the Current Action card;
- `data-skin`: the root wrapper;
- `data-roster-ignore`.

The theme CSS depends on **`.panel`, `.compact-panel` and `.compact-row` staying exactly as they are**:

- `.compact-panel` alone is referenced by 561 rules;
- `.compact-row` and `[class*="item-row"]` style the list rows.

Do not rename these classes, and do not move them to a different element.

## 2.3 The page shell (dashboard)

Captured live on 2026-09-11 at 1188 px and 1683 px [Capture: `claude/captures/iw-panel-layout-root-*.json`]:

```text
div#root[data-skin="default"]
└─ div.mx-auto.flex.w-full.max-w-[1380px].flex-col.gap-3.overflow-x-hidden.px-2.py-3.sm:px-4.sm:py-5   ← THE SHELL
   ├─ header.panel.p-3.5.sm:p-4                                   header (identity, utilities, status tiles)
   ├─ div.panel.flex.flex-wrap.gap-2.p-2                          nav rail: route tabs are DIRECT children
   ├─ div  (announcement, only while the game has one)            the "notice": NOT a .panel
   ├─ div.panel.flex.flex-col.gap-2.p-3.text-xs.text-white/70.sm:flex-row.sm:items-center.sm:justify-between
   │                                                              zone bar: exactly TWO element children
   ├─ section.grid.gap-3.xl:hidden                                narrow stack (live below 1280 px)
   │    Skill Actions · Current Action · Action Log · Inventory · Quests · World Bosses · World Chat
   └─ div.hidden.xl:grid …                                        wide layout (live from 1280 px)
        ├─ div.flex.min-w-0.flex-col.gap-3    Skill Actions · Current Action · Action Log · World Chat
        └─ div.flex.min-w-0.flex-col.gap-3    Inventory · Quests · World Bosses
```

Measured at 1683 px: header 1348×197, nav 1348×85, zone bar 1348×49, left column 681 wide, right column 655 wide.

**Assumed components** (names are ours; map them to yours):

| Our name | Renders | Chapter |
| --- | --- | --- |
| `AppShell` | the shell `div` above | 4 |
| `Header` | `header.panel` | 4 |
| `MainNav` | the nav `.panel` with tab buttons as direct children | 4 |
| `Announcement` | the optional notice | 4 |
| `ZoneBar` | the zone bar `.panel` with a text branch and an actions branch | 4 |
| `DashboardNarrow` / `DashboardWide` | the two panel stacks | 3 §3.9 |
| `Panel` | `.panel` wrapper with an `h2` title | 5 |
| `SkillActionsPanel` → `SkillCard` | `.panel` → `.compact-panel` per recipe | 6 |
| `CurrentActionPanel` | `#current-action-panel.panel` | 5 |
| `ActionLogPanel`, `WorldChatPanel` | activity panels with feeds | 5 |
| `QuestsPanel` → `QuestCard` | `.panel` → `.compact-panel` per quest | 7 |
| `InventoryPanel` → `InventoryRow` | `.panel` → `.compact-row` per item | 8 |
| `WorldBossesPanel` → `BossCard`, `ZoneControlCard` | `.panel` → `.compact-panel` | 9 |
| `VillageRoute` → `HousingPanel`, `AddonsPanel`, `SalvagePanel` | `/housing` | 10 |
| `MarketRoute` | `/market` | 11 |
| `Modal` | a `position: fixed` viewport-covering backdrop containing a card | 5 |

## 2.4 Data the theme needs, and where we assume it lives

The extension scrapes each of these from rendered text. Natively, read it from your state. Every value must be the **same value** the extension would have derived, or the output differs.

| Datum | Extension's source today | Assumed native source | Used by |
| --- | --- | --- | --- |
| Current zone number | the `Zone N:` label in the zone bar, remembered across routes | player/zone store | ch. 3 §3.5 (zone theme), ch. 4 (header art) |
| Current route | `location.pathname`; Village's route is `/housing`; SSF league prefix `/ssf` | router | nav active tab, zone theme on `/housing`, Village scene |
| Skill discipline of a card | button verb + identity label heuristics (`DOMWatcher.detectSkillType`) | recipe/skill data | ch. 6 |
| Level, percent, XP-to-go, readout format | the readout button text | skill state + the player's XP display preference | ch. 6 |
| Requirement met/unmet | the requirement line's Tailwind colour class | requirement check | ch. 6 |
| Material have/need counts | `N/M` text in the material line | recipe + inventory | ch. 6 |
| Action tick interval | measured from successive `width` writes | the action timer (the game writes a new width every **250 ms**; the first tick of a new action takes about **2×**) | ch. 5 §5.3, ch. 6 |
| Remaining action time | the Current Action countdown text (`h:mm:ss`, `m:ss`, `1h 2m 3s`) | action state | ch. 6 (long-action timer) |
| Quest reward discipline, objective item, completion %, turn-in availability | card text + `disabled` | quest state | ch. 7 |
| Inventory item identity, category, tier, stats, enhancement level, loadout/socket/roll lines | row text joined to `items.json` | inventory + item catalogue | ch. 8 |
| Boss identity, action state, team | card title + action button text | boss/zone-control state | ch. 9 |
| Housing tier, slot capacity, installed buildings (slot, `itemKey`, name) | `/housing` DOM, or `GET /api/player?section=…&scope=core` with an `x-idleworlds-league` header | player store (`player.housing.tier`, `player.villageAddons`) | ch. 10 |
| Housing perk line ("Base actions take 6s") | the `/housing` tier line, captured verbatim | housing data | ch. 10 |
| Item catalogue | public `https://idleworlds.com/items.json` | your item data (the same fields) | ch. 8, 10 |

## 2.5 Where the theme switch lives

Recommended shape:

```tsx
// One source of truth for "is the fantasy theme on, and with what zone".
type Skin = { on: boolean; zoneTheme: ZoneTheme | 'default'; visualButtonTheme: ZoneTheme };

const SkinContext = React.createContext<Skin>({ on: false, zoneTheme: 'default', visualButtonTheme: 'forged-metal' });
export const useSkin = () => React.useContext(SkinContext);

// Spread helper: returns the marks only when the theme is on, so the stock
// theme renders byte-for-byte what it renders today.
export function marks(on: boolean, attrs: Record<string, string | undefined>) {
  if (!on) return {};
  return Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined));
}
```

- The `on` flag comes from the player's theme setting. Put it on the existing root wrapper as `data-skin="fantasy"`, and on `<html>` as `data-iw-native-skin="1"` (chapter 1 §1.5 rule 9).
- `zoneTheme` and `visualButtonTheme` come from chapter 3 §3.5.
- **With the theme off, emit nothing:** no marks, no appended nodes, no theme CSS. The stock theme must be unaffected.
- Load the seven stylesheets only when the theme is on (chapter 3 §3.2). Toggling at runtime means:
  - adding or removing the `<link>` elements;
  - re-rendering with `on` flipped.

## 2.6 SSR and hydration rules (Next.js)

The extension hit React error #418 by appending nodes during hydration. The native render avoids that by construction, but only if:

1. **Server HTML and the first client render are identical.** Every mark and appended node derived from **server-known state** renders on the server too:
   - zone theme;
   - skill type;
   - quest state;
   - village snapshot.

   This removes the flash the extension has today, where the stock UI shows first and is re-skinned after hydration.
2. **Values that exist only on the client** must render their initial value on the server and update after mount:
   - collapse preferences;
   - the Village ledger's open/closed entries;
   - the boss "Possible Rewards" disclosure.

   The initial value is the default: expanded, open. Apply the stored choice in `useEffect`, or render it server-side from a cookie.
3. **Values the extension measures from layout** are set in `useLayoutEffect`, after mount, exactly as the extension does:
   - the V2 action-label font fit, `--iw-skill-v2-action-label-font`;
   - the quest command-block width, `--fs-quest-cmd-w`.

   Their server/first-render value is **absent**, and the CSS fallbacks cover that frame. The extension also starts from absent.
4. **Inline `!important` styles** are applied in a layout effect (chapter 3 §3.8), because React cannot serialise `!important`. The server HTML omits them. The theme CSS paints the pre-render fallback for those few controls until hydration, which is no worse than today, where the extension paints them only after hydration **and** classification.
5. **Timing-derived values** (the progress-bar transition duration) start at the CSS default and are set from your known tick interval on the client (chapter 5 §5.3).

## 2.7 Duplicate panel stacks

The dashboard renders its panels **twice** (§2.3), and Tailwind hides one copy at 1280 px. The extension spends real effort deciding which copy is live and marks only that one.

Natively:

- **render the marks on both copies**;
- the hidden copy is `display: none`, so its marks cost nothing and paint nothing;
- a breakpoint crossing then needs no re-render.

There are three exceptions, singleton skin nodes that must exist **once** per page:

| Singleton | Where it goes |
| --- | --- |
| The Village scene frame (chapter 10) | After the **rendered** Skill Actions panel only. Render it in both stacks if you prefer; the extension moves it to whichever copy is live |
| The collapse-toggle identity (chapter 5 §5.5) | The toggle may exist on both copies. Its persisted state is keyed by name, so both copies agree |
| The page-level `<html>` state (chapter 3 §3.4) | Once, on `<html>` |

## 2.8 Things we could NOT see, and what to do about them

| Unknown | Why it matters | What to do |
| --- | --- | --- |
| Surfaces the skin never reached: Equipment window, Mailbox, Notifications, Settings, Supporter Pack, Invite Friends, Profile | They have no contract beyond the generic modal frame (chapter 5 §5.6) and the generic control rule (chapter 12) | Leave them exactly as they render today with the theme CSS loaded. Do not invent a look for them |
| Routes whose inner content only gets the frame: Leaderboards, Dungeon, Village NPCs, Housing Bank | Their `.panel`s get `section-frame`; their contents keep the game's styling under the theme CSS | Chapter 11 |
| Whether any game CSS loads **after** the theme CSS on client navigation | The extension's sheets sit at the end of `<head>` when it boots; chunks loaded later land after them | Chapter 3 §3.2 gives the rule and the check |
| Exact live markup of rarely seen states (e.g. a locked "Coming soon" skill card, a Dungeon raid card) | Fixtures cover the common shapes | Run `capture-skin-contract.js` on the live page in that state (chapter 13 §13.2) |
