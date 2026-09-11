# Quiet metal compact controls

This version reduces the visual weight of the compact controls while retaining
the nine zone themes. Each 672 × 392 transparent atlas contains a text plate and
square icon plate in idle, hover and clicked states.

- Idle uses dark matte metal, low edge contrast and tiny dim corner accents.
- Hover adds one restrained coloured inner keyline and a modest metal lift.
- Clicked uses a darker recessed frame and subdued corner points.
- The central wells remain nearly black for label and icon readability.

State sprites share the idle alpha silhouette pixel for pixel. Text controls use
fixed 40-pixel source caps and a stretchable middle so labels of different widths
keep the same corner proportions. The previous `compact-v1` atlases remain in the
project for comparison and rollback.

The original generated sheets and the shared edit prompt are stored in
`sources/`. Rebuild with:

`python build-tools/build-compact-buttons.py compact-quiet-v2`

Then regenerate its interactive preview and runtime geometry with:

`node build-tools/preview-compact-buttons.mjs compact-quiet-v2`
