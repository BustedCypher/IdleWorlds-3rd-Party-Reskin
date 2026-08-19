# IdleWorlds Fantasy Skin v1.4.1 — Stability Pass

## Scope

This source tree was recovered from the inline source map shipped in the v1.4.0 release bundle, then revised for the v1.4.1 stability pass. It is **not** a replacement for the canonical full development project: the uploaded v1.4.0 release ZIP did not contain the original `package.json`, `build-tools/build.js`, `build-tools/pack.js`, or `src/loader/skin-loader.js`.

The supplied `build-tools/build_recovered.py` is a deterministic recovery build used only to reproduce the patched Chrome content bundle without the unavailable original esbuild project.

## v1.4.1 changes

- Register all renderers/listeners before initial DOM discovery.
- Use one central `MutationObserver` with batched dirty-root/component reconciliation.
- Observe relevant React state changes (`class`, `style`, `disabled`, `aria-disabled`, text and child changes).
- Remove one-shot inventory rendering; rows reconcile when data/atlas state changes.
- Preserve interactive game controls in inventory rows instead of hiding every original child indiscriminately.
- Remove per-skill-panel observers.
- Stop reparenting React-owned skill panels; skill chrome now uses CSS pseudo-elements on the existing panel.
- Allow BackgroundPainter to repair a previously painted node when React writes game colours back to it.
- Replace permanent NameScanner root marks with repeatable scanning and ItemDatabase revision invalidation.
- Unify item-name normalisation across ItemDatabase and AtlasService.
- Make ItemDatabase cache/load failures retryable, including stale-cache fallback.
- Make atlas metadata loading independently recoverable so one failed atlas does not disable the other.
- Pin atlas/index assets to immutable Git commit `c4695b7f5519789558b0d72fa85e60338070e4b5` instead of the mutable `main` branch.
- Refresh open tooltips after item/atlas updates.
- Remove the inline source map from the production content bundle.

## Automated checks

Run:

```bash
npm test
npm run build
node --check dist/content.bundle.js
```

Current automated coverage verifies:

- ItemDatabase stale-cache fallback and retry after an initial failure.
- Partial AtlasService load and later recovery of the missing atlas.
- Renderer listeners register before DOMWatcher.
- Runtime contains exactly one `MutationObserver`.
- Inventory rows can reconcile on item-database and atlas updates and preserve interactive hosts.
- NameScanner no longer uses a permanent scanned marker.
- BackgroundPainter no longer permanently excludes previously painted nodes.
- SkillPanelRenderer has no private observer and does not append the game panel into an extension wrapper.
- Atlas assets are pinned to an immutable revision rather than `main`.
- Production bundle contains no inline source map and stays below the size guard.

## Deliberately deferred

These items need the canonical full source and/or live IdleWorlds DOM before they should be changed:

- Audit and modification of the hosted `skin-loader.js` path.
- Original esbuild/pack pipeline and web-deploy ZIP generation.
- Hosted CSP/font dependency verification.
- Narrowing broad legacy CSS selectors after live coverage testing.
- Exact inventory action-host layout verification against every live row type. v1.4.1 chooses gameplay safety over aggressive hiding; a mixed content/action host may therefore temporarily retain some duplicate visual content.
- A less DOM-invasive replacement for NameScanner in React-owned skill text, if live testing shows reconciliation conflicts.
- EquipmentRenderer and ShopRenderer.
- Temporary cloak aliases and +4/+5 placeholder badge art.

## Validation boundary

The recovered source, data-service tests, structural lifecycle tests, build, and JavaScript syntax checks pass. This environment's Chromium process did not run even a trivial local page reliably, so **no claim is made that v1.4.1 has completed live browser/IdleWorlds regression testing yet**. The next step is to load the v1.4.1 extension in Chrome and exercise live panel mount/remount, inventory actions, cache states, and button state changes before expanding features.
