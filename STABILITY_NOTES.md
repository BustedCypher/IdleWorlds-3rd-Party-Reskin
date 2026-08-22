# IdleWorlds Fantasy Skin — Stability and Validation Notes

## Current status

The current source is a hardened Manifest V3 content-script skin for IdleWorlds. After the pre-migration live Chrome regression passed, the recovered Python bundler was replaced with a standard esbuild pipeline while preserving the same single-file content-script architecture and runtime-owned CSS model.

The feature branch is intentionally kept separate from `main` while hardening is reviewed. The skin remains presentation-only: React owns gameplay DOM, state and event handlers.

## Completed hardening

- Centralized all DOM observation in one budgeted `MutationObserver`.
- Removed producer-only equipment/shop watcher queues that had no consumers.
- Prevented reparenting/replacement of React-owned gameplay nodes and text.
- Added reversible property-level inline style ownership for Inventory, Skills and background treatment.
- Fixed disable/re-enable lifecycle symmetry and listener duplication risks.
- Made enhanced `+1` through `+4` equipment resolve to the correct item records.
- Added current resistance, bonus-proc and work-order stat coverage from the live item contract.
- Preserved native Inventory actions, loadout/socket details and requirements on narrow screens.
- Restored long Inventory names to a two-line presentation.
- Expanded item-name tooltip discovery without consuming native game clicks.
- Hardened interactive item hovercards for keyboard, touch and short viewports.
- Removed the dormant player-HUD relayout subsystem rather than leaving an untested activation path.
- Added periodic ItemDatabase refresh so long-lived sessions do not stay pinned to stale cache data.
- Enforced one global per-frame DOM flush budget and reduced hot-path mutation work.
- Reduced long-session retention by pruning detached inline-style ownership records.
- Added responsive fixture coverage at 320, 360, 390, 430, 600 and 768px.
- Replaced the recovered Python bundler with esbuild after the live regression gate passed.

## Automated validation

Run the local validation sequence with:

```bash
npm test
npm run fixtures
npm run audit:items
```

`npm test` rebuilds `dist/content.bundle.js`, syntax-checks it, then runs data-service, Inventory-model, item-display, architecture-invariant and full lifecycle smoke suites. The smoke suite exercises disable → enable → disable, equal-length native text changes, mutation bursts, tooltip ownership, enhanced gear and React text-node preservation.

`npm run fixtures` performs visual and responsive assertions, including short-viewport tooltip scrolling and narrow Inventory/Skill layouts. `npm run audit:items` validates assumptions against the current public `/items.json` export and is kept out of CI because it depends on a live endpoint.

CI is read-only: pull requests and pushes to `main` run `npm ci`, rebuild/test the source, and fail if the committed production bundle is stale.
## Validation boundary

Automated and fixture validation is strong but is not a substitute for an authenticated live IdleWorlds regression pass. Real React/Tailwind structure, every Inventory action variant, and game updates can only be confirmed against the current live application.

For that reason:

- The pre-migration feature branch passed the user-run live Chrome regression on 2026-08-22.
- Automated validation still cannot independently prove every live game panel or future React/Tailwind update.
- A short post-migration live Chrome sanity check should be completed before merging the esbuild migration into `main`.

## Remaining maintenance items

- Revisit the temporary cloak alias compatibility layer when the upstream item naming contract no longer requires it.
- Re-run the live item contract audit after major IdleWorlds patches that change item statistics or acquisition metadata.
- Perform a short post-migration live Chrome sanity check before merge.
