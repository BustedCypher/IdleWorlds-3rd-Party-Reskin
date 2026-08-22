# IdleWorlds Fantasy Skin — Stability and Validation Notes

## Current status

The current source is a hardened Manifest V3 content-script skin for IdleWorlds. The project still uses the deterministic recovered Python bundler because build-system replacement is gated behind final live-game validation; runtime architecture and source code are otherwise maintained directly in `src/`.

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

## Automated validation

Run the local validation sequence with:

```bash
npm test
npm run fixtures
npm run audit:items
```

`npm test` rebuilds `dist/content.bundle.js`, syntax-checks it, then runs data-service, Inventory-model, item-display, architecture-invariant and full lifecycle smoke suites. The smoke suite exercises disable → enable → disable, equal-length native text changes, mutation bursts, tooltip ownership, enhanced gear and React text-node preservation.

`npm run fixtures` performs visual and responsive assertions, including short-viewport tooltip scrolling and narrow Inventory/Skill layouts. `npm run audit:items` validates assumptions against the current public `/items.json` export and is kept out of CI because it depends on a live endpoint.

CI is read-only: pushes and pull requests run `npm ci`, rebuild/test the source, and fail if the committed production bundle is stale.
## Validation boundary

Automated and fixture validation is strong but is not a substitute for an authenticated live IdleWorlds regression pass. Real React/Tailwind structure, every Inventory action variant, and game updates can only be confirmed against the current live application.

For that reason:

- `main` should remain untouched until the feature branch passes live Chrome regression.
- No claim should be made that every live game panel has been verified from this development environment.
- Build-system modernization should remain gated until the current runtime behavior is accepted as stable; replacing the recovered bundler at the same time as unresolved live-DOM changes would make regressions harder to isolate.

## Remaining maintenance items

- Revisit the temporary cloak alias compatibility layer when the upstream item naming contract no longer requires it.
- Re-run the live item contract audit after major IdleWorlds patches that change item statistics or acquisition metadata.
- Perform the final authenticated live regression before merge and before replacing the recovered bundler.
