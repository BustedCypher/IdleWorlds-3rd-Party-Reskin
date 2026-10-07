# Ashmaw custom atmosphere integration

User approved the custom atmosphere experiment and requested wiring it into the live raid. Use its Subtle preset (0.75 strength), exact approved painting and twelve generated cloud/smoke/steam shapes. Preserve lava, eye light, furnace cadence, native gameplay nodes and 16-second loop.

- [x] Add live asset-loading regression and observe failure against the old renderer.
- [x] Promote approved renderer and atlases, load optional textures with CORS, guard late encounter changes, keep still/native fallbacks.
- [x] Update build requirements and canonical preview/export tooling.
- [x] Verify loops, independent atmosphere movement, native interactions, lifecycle and texture failures.
- [x] Review integration, run full extension checks, rebuild/package and verify current assets in release.

Work in the existing shared checkout; preserve unrelated changes and earlier scene studies. No commit, push or deployment requested.

Focused scene/loop checks and canonical comparison preview passed. Reviewer found no material issues and verified asset hashes and renderer equivalence to the approved experiment. `npm test` passed, including the real unpacked extension and all five scene lifecycles. `npm run package` succeeded; `output/ashmaw-custom-atmosphere/verify-package.mjs` confirmed the release bundle and four Ashmaw PNG hashes are current, generation prompts excluded, and approved painting unchanged. Full test log: `output/ashmaw-custom-atmosphere/test-run.log`. No installed extension was reloaded automatically.
