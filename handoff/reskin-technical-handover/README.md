# IdleWorlds Fantasy Skin — Technical handover

A complete technical handover, integration guide, maintenance manual and security review for the **IdleWorlds Fantasy Skin**: a Chrome extension that reskins `idleworlds.com` into a dark-fantasy interface without access to the game's source.

| | |
| --- | --- |
| **Snapshot** | Commit `059081671bf3af4490a025121f25f13ada142b7e` on `main`, extension version **1.6.0** |
| **Prepared** | 17–18 September 2026, from a line-by-line reading of every shipped file, plus generated inventories and a full test run |
| **Audience** | IdleWorlds developers who will audit, maintain, modify or officially integrate the skin |
| **Status of this package** | Untracked files in `handoff/reskin-technical-handover/`; **not committed**. No other file in the repository was changed |

## How to read this package

| Part | File | Read it for |
| --- | --- | --- |
| 1 | [Project overview](01-project-overview.md) | Purpose, scope, UX, how it integrates with the game, architecture diagrams, module map, repository layout, asset inventory and provenance, dependencies, browser floor, network surface, build and CI, documentation drift |
| 2 | [Feature inventory](02-feature-inventory.md) | All **55 features** (F-01…F-55), each with what, why, where, dependencies, runtime, states and fallbacks, responsive, motion, interaction, accessibility, edge cases and tests |
| 3 | [CSS architecture](03-css-architecture.md) | Delivery pipeline, cascade model, `!important` strategy and removal procedure, design tokens, every stylesheet section by section, selectors, media and container queries, animations, fragile rules, conflicts, browser behaviour, performance, recommendations |
| 4 | [Constraints and workarounds](04-constraints-and-workarounds.md) | The 24 constraints that shaped the code, design versus workaround, and how full access would replace each |
| 5 | [JavaScript documentation and safety review](05-javascript-safety-review.md) | Threat model, complete network/storage/sink/listener census, **29 per-feature reviews** (J-01…J-29) with explicit safety statements, the **findings register**, the hardening plan |
| 6 | [Integration and maintenance](06-integration-and-maintenance.md) | Install, kill switch, integration options, start-up order, every constant, customisation how-tos, **all assumptions about the game**, break/diagnose matrix, troubleshooting, migration plan, owner decisions |
| 7 | [Testing and verification](07-testing-and-verification.md) | The 47 suites, current results, manual test plan (MT-01…MT-30), responsive, accessibility, cross-browser, performance, regression and security testing, recommended tests, the final checklist |
| A | [File inventory](appendix-a-file-inventory.md) | Every tracked file (556): size, whether it ships, runtime use, description (generated) |
| B | [CSS rule index](appendix-b-css-rule-index/README.md) | Every CSS rule (1,373): selectors, specificity, context, properties, `!important`, host/skin hooks, fragility, comment (generated) |
| C | [CSS dependency surface](appendix-c-css-dependency-surface.md) | Game hooks, skin hooks, fragile patterns, `:has()`, `!important` by property, custom properties, queries, animations, pseudo-classes and pseudo-elements (generated) |
| D | [DOM contract](appendix-d-dom-contract.md) | Every attribute (all 141 names), class, element, inline property, event, storage key and highlight the skin owns, with owner and teardown |
| PDF | [`IdleWorlds-Fantasy-Skin-Handover.pdf`](IdleWorlds-Fantasy-Skin-Handover.pdf) (194 pages, 11.6 MB) and [`IdleWorlds-Fantasy-Skin-Handover-Appendices.pdf`](IdleWorlds-Fantasy-Skin-Handover-Appendices.pdf) (327 pages, 16.0 MB) | A printable, offline copy of everything below, with bookmarks, clickable contents and the diagrams rendered. **Derived** from the Markdown — regenerate, never edit (§ Regenerating) |
| Tools | [`tools/`](tools/) | Reproducible generators: `css-inventory.mjs`, `css-superseded.mjs`, `hook-census.mjs`, `js-api-census.mjs`, `file-inventory.mjs`, `make-handover-pdf.mjs` |
| Evidence | [`evidence/npm-test-2026-09-17.log`](evidence/npm-test-2026-09-17.log) | The full `npm test` output (local path redacted) |

**Evidence labels** used throughout:

| Label | Meaning |
| --- | --- |
| [Source] | Confirmed in the cited file and line |
| [Generated] | Produced by a script in `tools/` |
| [Test run] | Observed in the test run |
| [Project record] | Stated in the project's own notes; not re-measured |
| [Assumption] / [Verify] | Needs confirmation on the live game or with the owners |

**Nothing in this package was verified on the live game.**

## Executive summary

**What it is.** An MV3 extension with:

- **permissions**: `storage` only, on two host patterns;
- **two content scripts**: the bundle, in the isolated world at `document_idle`; and a 64-line page-world probe that detects React hydration;
- **no background worker, UI, telemetry or runtime dependencies**.

It turns the game's rendered DOM into the fantasy look through six reversible mechanisms:

1. 7 injected stylesheets;
2. semantic `data-iw-*` role attributes;
3. four classes;
4. owned inline styles;
5. appended decorative elements;
6. CSS highlight registrations.

**How it works.**

- **Observation.** A single budgeted `MutationObserver` (60 elements per frame) emits events to classifiers and renderers.
- **Classification.** They recognise surfaces from the game's structure and **English copy**, because the game ships almost no stable hooks.
- **Data.** Item data comes from the public `items.json`. The dashboard Village frame reads the authenticated `/api/player` endpoint.
- **Reversibility.** Everything is removed by a storage-key kill switch.

**Engineering quality.** The code is unusually disciplined for an overlay:

- compare-before-write everywhere;
- measured performance fixes;
- per-module attribute namespaces;
- exact restoration of native inline styles;
- 47 regression suites with negative controls.

`npm test` passed (exit 0, 3 min 26 s).

The main costs are structural, and belong to the extension approach:

- **Fragility against game copy and markup changes**: 37 documented assumptions (§6.5).
- **A heavy cascade**: 3,879 `!important` declarations, at least 350 of them provably dead.
- **Very large art**: a 142.8 MB zip, 60.8 MB of it unreachable; sprite atlases that decode to about 126 MiB.

**Safety.** No High-severity issue was found. The census demonstrates:

- no dynamic or remote code;
- no third-party requests;
- no cookie or credential access;
- no messaging or globals;
- no synthetic interaction with the game;
- game text treated strictly as text.

The disclosed issues are below.

## Key findings

Full register: [§5.6](05-javascript-safety-review.md#findings-register).

| ID | Severity | Finding | Recommended action |
| --- | --- | --- | --- |
| SEC-04 | Medium | The dashboard Village frame polls the authenticated `/api/player` endpoint (session cookies + league header) every 5 min | IdleWorlds decision; add backoff (H-14) or remove (B-08) |
| SEC-07 | Medium | A real browser profile (saved logins, autofill, wallet) and business documents sit inside the working tree (git-ignored) | Remove before sharing any copy of the folder (H-20) |
| FUN-01 | Medium | The game's "cycle XP display" button is disabled and hidden by skin CSS, so a game control is unreachable | Design decision B-01; add operability test T-01 |
| CONT-01 | Medium | Skin-authored gameplay statements (World Boss notice, orb and drop copy) appear as if they were game text | Replace with game-provided copy (B-06) |
| A11Y-01 | Medium | Text shown through CSS generated content over hidden native text, and mirrors not hidden from assistive technology: duplicate or mismatched announcements | B-10; screen-reader test |
| PERF-01 / PERF-07 | Medium | Infinite decorative animations; sprite atlases up to 1280×19,584 px | H-17; H-24 |
| SIZE-01 | Medium | 60.8 MB unreachable `exact-v3` art in the release | H-18 (§6.8) |
| SEC-01 | Low | Two catalogue fields (`craft_level`, `tier`) are concatenated unescaped into the tooltip HTML | H-01 (one-line fix) + H-02 + H-03 |
| FUN-04 | Low | After a kill-switch round trip, collapsed panels can lose their title | H-08 + test T-04 |
| TEST-01 | Low | The quest signature suite tests a stale copy of the module logic | T-09 |

**Decisions needed from IdleWorlds**: API use, authored content, the Toolkit link, the XP-cycle control, art rights, AI-generated art, reduced-motion intent, integration path, distribution, and font attribution ([§6.9](06-integration-and-maintenance.md#69-decision-checklist-for-idleworlds)).

## Quick facts

| Metric | Value |
| --- | --- |
| Runtime JavaScript | 35 files, 11,869 lines (33 modules + entry + page probe); 0 import cycles |
| Stylesheets | 14 active (+1 inactive), injected as 7 `<style>` elements; 1,373 rules; 5,888 declarations; 3,879 `!important`; 37 `:has()` rules; highest specificity (0,30,3) |
| Bundle | `dist/content.bundle.js`: 668,309 bytes, unminified; 48.6% of it is CSS text |
| Skin DOM vocabulary | 141 `data-iw-*`/`data-fs-*` attribute names; 4 classes on game nodes; 6 storage keys; 6 event types |
| Network | 2 game endpoints (`items.json`, `/api/player`) + packaged assets; 0 third-party runtime origins |
| HTML sinks | 3 `innerHTML` writes (1 constant; 1 fully escaped; 1 with SEC-01) |
| Tests | 47 suites + sprite-window audit; all passed on 2026-09-17 |
| Tracked files | 556 (148.4 MB); 325 ship (144.6 MB); zip 142.8 MB |
| Effective browser floor | Chrome 111 (the manifest declares none) |

## Regenerating the generated parts

Run from the repository root:

```bash
node handoff/reskin-technical-handover/tools/css-inventory.mjs
```

```bash
node handoff/reskin-technical-handover/tools/css-superseded.mjs
```

```bash
node handoff/reskin-technical-handover/tools/hook-census.mjs
```

```bash
node handoff/reskin-technical-handover/tools/js-api-census.mjs
```

```bash
node handoff/reskin-technical-handover/tools/file-inventory.mjs
```

The two PDFs are printed from the same Markdown with Playwright's Chromium (already a dev dependency), rendering Markdown with `marked` and the diagrams with `mermaid`, both pinned and loaded from cdnjs at build time; the finished PDFs carry no external dependency. `--only=main` or `--only=appendices` prints one volume, and `--html-only` keeps the intermediate print HTML for inspection:

```bash
node handoff/reskin-technical-handover/tools/make-handover-pdf.mjs
```

The PDFs are **derived artefacts of about 28 MB**. Regenerate them after any edit to the Markdown, and consider keeping them out of the repository (or in a release attachment) if that size is unwelcome in git history.

The other scripts are dependency-free (Node.js only). They read `src/`, `assets/`, `manifest.json` and `git ls-files`, and refuse to report "clean" when they find nothing.

## Notes

- `handoff/technical/` contains **separate, earlier draft documents produced by another tool**. This package did not modify or rely on them.
- The repository's own engineering notes (`CLAUDE.md`, `docs/traps/*.md`) remain the best record of *why* individual decisions were made; this package cites them where relevant.
- Do not commit or distribute `build-tools/header-live-profile/`, `output/`, `tmp/` or `release/` (§1.7.2).
