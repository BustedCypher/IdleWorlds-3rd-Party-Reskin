# Ghost Metal compact controls

This version strips the compact controls back to subtle embedded panel chrome
while retaining all nine zone themes. Each 672 × 392 transparent atlas contains
a text plate and square icon plate in idle, hover and clicked states.

- Idle uses a near-black well, one low-contrast metal hairline and a micro bevel.
- Hover adds a restrained theme-coloured inner keyline without bloom.
- Clicked darkens the well and adds four pin-sized, dim corner glints.
- Bright rails, luminous corner gems and jewellery-like highlights are removed.

State sprites share the idle alpha silhouette pixel for pixel. Text controls use
fixed 40-pixel source caps and a stretchable middle so labels of different widths
keep the same corner proportions. `compact-v1` and `compact-quiet-v2` remain in
the project for comparison and rollback.

The generated source sheets and prompt record are stored in `sources/`. Rebuild:

`python build-tools/build-compact-buttons.py compact-ghost-v3`

Regenerate the preview and runtime geometry:

`node build-tools/preview-compact-buttons.mjs compact-ghost-v3`
