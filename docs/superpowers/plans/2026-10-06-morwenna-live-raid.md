# Morwenna live raid scene implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved integration in the existing checkout. Preserve the ongoing Ashmaw and Thessaly work.

**Goal:** Use the approved animated Embercourt scene beneath Morwenna's native raid HUD.

**Architecture:** Follow the existing Ashmaw/Thessaly scene managers and CSS grid layering. Promote the preview renderer to a runtime module and share that exact module with the preview. Bundle only the approved painting, cloud atlas and mist atlas. The native boss sprite remains in React's DOM and is hidden only after the approved painting loads.

**Tech stack:** JavaScript, Canvas 2D, CSS, esbuild, JSDOM and Playwright.

**Approved requirements:** User approved the 24-second Morwenna scene with stronger puppet strings, foreground mist and ash, and requested "done, wire it in". Retain native controls, HP and state; no reparenting. Pause offscreen, in hidden tabs and for reduced motion. Dispose all animation resources on removal/disable. Preserve native art on painting failure; use the approved still painting if animation is unavailable. Optional cloud/mist failure must not remove the approved scene. No new battle hazards or gameplay behavior.

## Work

- [x] Add a failing Morwenna Guild ownership/switching test.
- [x] Promote the approved renderer and assets; add MorwennaScene lifecycle; extend Guild reconciliation, teardown and shared raid CSS.
- [x] Share the runtime renderer with the portable preview, add required assets to the build and register the new tests.
- [x] Verify runtime loop, movement, cross-origin assets, optional-asset/still/native fallbacks, visibility and cleanup in a browser fixture.
- [x] Extend the unpacked-extension check to Morwenna, encounter switching and responsive native HUD layout.
- [x] Update the Guild trap notes, rebuild, run the regression suite and packaging checks, request read-only review, and fix required findings.

## Review focus

- Loading Morwenna followed by a different boss before its assets finish must not reactivate an obsolete scene.
- Reconciliation must not replace native controls or remount art during normal HP updates.
- Missing optional textures must leave useful animation or the approved painting.
- Returning to the viewport must resume exactly one drawing loop.
- The release must contain all three Morwenna images and use the same approved renderer as the preview.

## Execution record

Ruling: Continue in the existing checkout — the approved renderer, art and pending Thessaly integration are the current task's shared working state; a fresh checkout would omit that work. Preserve it and keep all additions scoped to Morwenna. No commit, push or deployment was requested.

The ownership test first failed because GuildPanels had no Morwenna scene. It passes after integration. Runtime browser checks passed for the exact 24-second repeat, all six independently animated layers, three missing-texture combinations, native HP and click handlers, offscreen/hidden/reduced-motion pauses, cleanup, unavailable Canvas 2D, failed painting and stale delayed loads. The production renderer and preview now share one source module.

The real unpacked-extension checks passed for Morwenna, a twelve-player roster, mobile layouts and switching among all three encounters. The approved preview verifier passed against the production renderer, including exact loop pixels and stationary architectural/face anchors. The release ZIP contains byte-identical scene assets and the current runtime bundle, with generation prompts excluded. Read-only final review reported no Critical, Important or actionable Minor findings.

Final verification: strict build passed; the complete `npm test` suite exited 0, including the unpacked extension, all three raid scenes, Morwenna fallback/lifecycle checks and sprite-window audit. Packaging completed successfully. Authenticated gameplay was not exercised; validation used the actual unpacked extension against controlled native raid fixtures.
