# Ashmaw live arena implementation plan

> Use inline execution with the executing-plans workflow. The user approved the arena and separate interface study and requested live Guild integration.

**Goal:** Show the approved animated volcanic arena beneath the native Ashmaw raid interface.

**Architecture:** Promote the existing Canvas 2D arena renderer into a runtime module, bundle its painting and smoke, and replace the previous Ashmaw scene through the existing GuildPanels lifecycle. Use CSS grid to position native raid information above the pointer-transparent art; no game nodes, handlers, state or text are replaced.

**Constraints:** Ashmaw only; 16-second seamless ambient loop; battle effects disabled; no new painted raiders; native party status remains visible; CORS-clean extension assets; reduced motion and offscreen/hidden suspension; complete reversible cleanup; no extra MutationObserver.

- [x] Update ownership and browser integration tests to require the new assets, loop and native overlay preservation; demonstrate failure against the older scene.
- [x] Promote the renderer, copy approved assets, replace scene mounting/cleanup and style native summary/telegraph/effects/floor/log regions. Keep standalone previews using the same renderer.
- [x] Build the extension, run targeted and full regression tests, review responsive live-raid fixtures and cleanup/load failures, and package the updated extension.

**Review focus:** Other encounters; asset errors and optional smoke failure; route removal and same-arena remount; hidden/reduced/offscreen lifecycle; expanded native raid panels and large parties at mobile widths; preservation of native handlers and health state.

**Validation:** Final `npm test` passed, including ownership, 16-second loop/seam,
load failures and cleanup. The unpacked-extension browser check passed with
CORS-clean animation, native handlers, wrapped log placement, expanded skills
and twelve raiders at 1440/900/390/320px. Captured native Guild DOM was reviewed
at those four widths (the snapshot harness approximates the saved game CSS).
The code review found no blocking issues. `npm run package` produced the release
ZIP; unused sprite/portrait studies are excluded without deleting workspace
artwork. The extracted release passed the same unpacked-extension browser
checks. A production raid was not started during verification.
