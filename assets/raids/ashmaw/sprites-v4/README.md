# Ashmaw stable idle

Idle only: 24 discrete frames, 1200 × 800 padded cells, six columns by four rows.
The body is one held painted cel, identical in every frame; the wing and tail
use the authored frame-by-frame drawings from the prior sheet. This keeps the
head, torso, armor details, legs and feet fixed while the appendages move.

The body cel was generated using built-in ImageGen. Prompts and source provenance
are recorded in `prompts.json` and the referenced v3 prompt archive. During
composition, source drawings are isolated from neighboring-frame fragments and
registered using one uniform scale and translation per drawing. This corrects
camera and drawing-size drift; no bones, mesh deformation, part rotations or
frame interpolation generate poses. The PNG is played as discrete drawn frames.

The moving wing/tail drawings still have some variation in painted detail. The
body is deliberately restrained rather than attempting another full-body redraw.
Verification checks every fully opaque body pixel remains identical across all
24 frames; it also checks distinct frames, crop margins, looping and controls.

Build: `node build-tools/bake-ashmaw-held-idle.mjs`
Preview: `node build-tools/preview-ashmaw-held-idle.mjs`
Verify: `node build-tools/verify-ashmaw-held-idle.mjs`
