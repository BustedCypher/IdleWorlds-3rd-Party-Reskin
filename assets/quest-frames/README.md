# Quest icon frames

The nine approved circular frames are selected directly from
`approved-frames.png`. This is an unchanged copy of the original approved
concept sheet, preserving its artwork instead of redrawing the rings.

`index.json` records each square source window in the 1254 x 1254 image.
The image is RGB; transparency is applied in `src/styles/skillpanel.css` with
a radial CSS mask. The source labels and other cells remain outside the
sprite windows. The dark inset is retained behind each item icon.

The root `data-iw-zone-theme` attribute selects the frame with CSS inheritance.
Unresolved zones use Forged Metal. Quest frames load independently of the
Skills UI atlas. They use the existing 72, 44 and 40 CSS pixel medallions,
with a 4 pixel desktop or 2 pixel mobile overhang.

For a source window `(x, y, w, h)` in atlas `(W, H)`, CSS registration is:

- background-size: `(100 * W / w)% (100 * H / h)%`
- background-position: `(100 * x / (W - w))% (100 * y / (H - h))%`

Generation: built-in image generation tool. The approved design prompt and
theme palette reference are recorded in `prompt.txt`. A subsequent transparent
conversion was discarded because it redrew details and returned opaque pixels;
only the approved source is shipped.
