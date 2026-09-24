# 11. Market, Leaderboards, Dungeon and every other route

Golden markup:

- before: [`generated/golden/market/market.before.html`](generated/golden/market/market.before.html)
- after: [`generated/golden/market/market.after.html`](generated/golden/market/market.after.html)

Source: `UIFoundation.classifyMarket`.

## 11.1 Market (`/market`)

| Node | Mark |
| --- | --- |
| the Market panel (the section frame whose title is exactly `Market`) | `data-iw-market="root"`, plus `section-frame`, `section-title` and the collapse marks (ch. 5) |
| each **leaf** `.compact-row` inside it (buy listings, your listings, empty slots) | `data-iw-market="row"` |
| the row's full-width name/detail `<button>` (`button.text-left` or `button[class*="flex-1"]`) | `data-iw-market="namebtn"`. This opts it out of the generic control plate, so it renders flat |
| the row's Buy / Cancel / List buttons | nothing. They take the generic forged plate automatically (ch. 12 §12.1) |

Never mark a `.compact-row` that holds an inventory overlay (`:scope > .fs-inv-row`), or one inside a chat or log feed. The same class is shared with those surfaces.

`.compact-row` is also a background-repaint candidate (ch. 3 §3.7). Check the contract capture for the live list.

## 11.2 Leaderboards, Dungeon, Village NPCs, Housing Bank, and any other route panel

These get the **frame only**:

- `section-frame` and `section-title` on each `.panel`;
- the collapse marks;
- the generic control plate on their buttons (automatic);
- the background repaint where it applies.

Their contents keep the game's own markup and styling under the theme CSS. The extension never classified anything inside them, so there is nothing more to emit.

Do **not** invent a themed look for them. That would be new design, which Curtis has not approved. Examples of such content:

- Leaderboard rows;
- the Dungeon raid card (`Leave Dungeon`, `⚔️ Raid Dungeon`, `⏳ Prejoined`).

## 11.3 Surfaces the skin never reached

The Equipment window, Mailbox, Notifications, Settings, Supporter Pack, Invite Friends and Profile:

- When they open as a modal, they get the modal frame (ch. 5 §5.6). Nothing inside them is marked.
- The **"Upgrade vs equipped" / "Downgrade vs equipped"** colours inside the Equipment window are game state (rule 5). They stay the game's own.

## 11.4 Acceptance

For each route (`/`, `/market`, `/leaderboards`, `/housing`, `/dungeon`, and the `/ssf/…` variants):

1. Capture a contract (ch. 13 §13.2).
2. Capture a parity reference with the extension on, after visiting the Game route first (ch. 3 §3.5).
3. Diff against the native build.
