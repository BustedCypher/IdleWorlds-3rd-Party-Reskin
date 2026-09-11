# Handoff package

Two features, built and shipped inside the IdleWorlds Fantasy Skin browser
extension, written up so they can be rebuilt inside IdleWorlds itself.

Both are **frozen**. The extension will not develop them further.

| Feature | Spec | PDF |
| --- | --- | --- |
| Collapsible panels | [collapsible-panels.spec.js](collapsible-panels.spec.js) | [collapsible-panels.pdf](collapsible-panels.pdf) |
| Rearrangeable panels | [rearrangeable-panels.spec.js](rearrangeable-panels.spec.js) | [rearrangeable-panels.pdf](rearrangeable-panels.pdf) |

## What these are

Functional specifications written as annotated pseudo-code. Nothing in them
imports anything and none of it is meant to run. They describe **what the
feature does, why each decision was made, and what it costs** — not how the
extension happened to implement it.

They are written to be read by someone rebuilding the feature with full access
to the application source, which the extension never had.

## Why they are shaped this way

The extension operates under one hard constraint: it may not modify the
application. It cannot add state, cannot change what renders, and cannot move a
single node the app produced. Roughly half of its implementation exists purely
to work around that.

That half is worthless to you, and reading it would cost more than it returns.
So every section is tagged:

- **KEEP** — a product decision or a measurement. Survives any implementation.
  This is what took the time.
- **DROP** — a workaround for the constraint above. You own the source. Delete
  it and the feature gets simpler.

Each spec opens with a suggested reading order for the three sections that
carry most of the value, so a short read is still a useful one.

## What is worth the most

If you read nothing else:

- **Collapsible panels §5** — why collapsed bars are not the same height by
  default, and the four independent causes that each have to be neutralised.
  This is the entire perceived quality of the feature.
- **Rearrangeable panels §6** — a measurement that should decide your layout
  approach before you write anything. Merging two panel columns into one grid
  adds 1,004px of empty space to the page, measured against real panel heights.
- **Both §10** — failure modes that actually shipped and were reported, each
  with the check shape that detects it. Several are invisible to the obvious
  test.

## Regenerating the PDFs

The PDFs are derived from the spec files, so they cannot drift:

```bash
npm run handoff
```

Edit a `.spec.js` and re-run. The intermediate `.html` is written alongside so
formatting changes are diffable without opening a PDF reader.
