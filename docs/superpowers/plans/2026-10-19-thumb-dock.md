# Thumb Dock Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this approved navigation refinement.

**Goal:** Implement the approved fantasy thumb dock on mobile and a compact desktop navigation strip, preserving native navigation and zone functionality.

**Architecture:** Extend Fantasy's existing chrome pass. Keep React's controls, text and handlers in place; render extension-owned navigation proxies in shadow roots so the native port cannot classify or repaint them. Read native active/disabled/link state on the existing watcher, forward ordinary activation to the latest original control, and preserve native anchor behavior for modified clicks. Keep zone travel and extra zone information native, with compact styling. Do not add another observer.

**Tech Stack:** JavaScript, CSS, Manifest V3, esbuild, Playwright.

**Current user-approved refinement:** Brass rail replaces the heavy metal tiles
on mobile and desktop. Navigation and More inherit the active theme's accent,
edges and ground colours. Primary destinations are Game, Market, Village and
Guild; Dungeon remains in More. This supersedes the earlier fixed Ashen dock
palette and primary-route selection below.

**Spec:** Approved in-chat thumb-dock mockup, 2026-10-19; `thumb-dock-refined.html` in this chat's visualization directory. Main links: Game, Market, Village, Dungeon; More contains Guild, Leaderboards and available native utilities.

**User styling refinement:** Minimal header travel controls; default Ashen
Iron colours for the added dock, More menu and zone frame; smaller, quieter
native zone shortcuts in skill sheets. Preserve all native actions and text.

**Latest approved reference:** Minimal joined zone control: chevrons around
a wide Zones picker with a simple line globe, two quiet dividers and one
rounded outline. Keep Ashen colours and native zone details. The original
button nodes, labels and handlers remain in place; this refinement is CSS.

## Global Constraints

- Fantasy remains independent of Legacy; no game node is moved, replaced or edited for its text.
- Preserve all native destinations, Toolkit, player presence, theme toggles, active/disabled/locked state, zone travel, notices and zone detail text.
- Every owned node/attribute/style has lifecycle cleanup; incomplete or unfamiliar navigation falls back to native.
- Dock targets are at least 44px; support 320px phones, short landscape viewports and desktop; reserve mobile safe-area/content clearance.
- Use the existing single watcher; settled navigation must not drive mutation loops.
- Rebuild the committed `dist/content.bundle.js`.

## Review Focus

- Responsive duplicate navigation must activate the live copy after a 1280px column swap.
- Native route replacement and late unlocks must invalidate stale references.
- Modified link activation must retain href, target and rel.
- More must close before forwarding an action that opens a native modal; Escape and focus return must work.
- Unknown navigation controls must remain reachable, and unsupported form shapes must stay native.

### Task 1: Reversible navigation and responsive fantasy chrome

**Files:**
- Create `src/skins/fantasy/chrome/ThumbDock.js` for source resolution, proxy state and owned dialog lifecycle.
- Create `src/skins/fantasy/styles/thumb-dock.css` for isolated dock/menu chrome.
- Modify `src/skins/fantasy/chrome/index.js` to reconcile and clear navigation with existing chrome.
- Modify `src/skins/fantasy/styles/chrome.css` to hide represented source controls and arrange native zone chrome.
- Create `tests/fantasy-navigation.test.mjs` and register it in `package.json`.
- Update `docs/traps/header-chrome.md` with ownership and verification notes.
- Rebuild `dist/content.bundle.js`.

**Interfaces:** `navigationPass()`, `navigationText(parents)`, `clearNavigation()`; invoked only by Fantasy's existing chrome lifecycle.

- [x] Write browser regressions for native forwarding, active/disabled state, all destinations/utilities, safe layout, duplicate/source replacement, quiescence and teardown.
- [x] Run the navigation suite against unchanged production code and verify it fails because the dock is absent.
- [x] Implement owned navigation and compact native zone styles.
- [x] Run navigation and existing Fantasy chrome, skin boundary/isolation and lifecycle regressions.
- [x] Render/inspect desktop, mobile, More and short landscape views; verify controls fit and remain reachable.
- [x] Run `npm test` with the installed Playwright cache selected; record any unrelated failures.
- [x] Review the final diff and rebuild output. Leave user assets and unrelated work untouched.

## Baseline

Branch: `codex/unified-fantasy-buttons`; no tracked changes on entry. Existing untracked art/scratch is unrelated and remains untouched. Work stays in the authorized checkout. Initial `npm test` passed its first four suites, then could not locate Chromium in the sandbox-specific cache. The installed cache is `C:/Users/curti/AppData/Local/ms-playwright`; use `PLAYWRIGHT_BROWSERS_PATH` for verification without installing dependencies.

## Review and corrections

An independent read-only review found unsupported interactive controls could be
hidden and a stale checkbox could reverse the user's requested setting. Both
now have reproducing browser regressions and fixes. Native tooltip/accessible
names are also copied. Additional regressions cover source loss while More is
open, hash routes, cloned source markers, game-modal layering and short desktop
windows. Each reproduced its failure before correction. Native theme-state
updates use the existing watcher with one additional native-only attribute.

The unpacked-extension test requires a full Chromium process outside the
Windows app-container sandbox; normal headless fixture tests run inside it.

## Completed verification

- Strict `npm run build`: PASS; committed-output path rebuilt (98 source modules).
- Full `npm test`: PASS, including all 93 registered `test:run` commands,
  unpacked-extension end-to-end coverage and sprite-window audit.
- Final navigation browser suite: PASS after the review corrections and owned
  SVG marker update; desktop/mobile fixture screenshots inspected.
- JavaScript syntax checks and `git diff --check`: PASS.
- No new dependencies. Existing unrelated assets/scratch and branch state
  remain untouched; changes are left available for review in the checkout.
- Verification used Chromium fixtures and the unpacked extension against the
  test server. A live account and physical-device safe areas were not tested.

## Mobile layout and Ashen refinement

- [x] Reproduce the mobile stack using the native zone-shell marker/classes,
  nested picker label and compact-atlas layers; assert one row and bounds.
- [x] Reset the native group/button `width:100%` and wrapping overrides.
- [x] Hide native travel artwork without removing nodes; use short phone text
  labels and retain full accessible names/handlers and 44px targets.
- [x] Replace the new navigation's jade/green palette with Ashen Iron colours.
- [x] Reduce skill shortcut padding, text/icon size, colour and button weight;
  retain requirement text, disabled/dismiss behaviour and keyboard focus.
- [x] Add browser regressions for plain buttons, fixed Ashen colours,
  320–1440px skill shortcuts, native handlers and exact teardown.
- [x] Keep compact shortcuts active after native skill-sheet takeover; verify
  the full sheet reskin still stands down and teardown remains exact.
- [x] Correct the short mobile labels' accessible names using empty CSS
  accessibility alternatives; exact native-name browser assertions pass.
- [x] Independent follow-up review: approved with no remaining findings.
- [x] Final strict build and full `npm test`: PASS on the final source,
  including unpacked-extension coverage and the sprite-window audit.

The combined mobile fixture preview is saved to
`tmp/thumb-dock/ashen-mobile-preview.png`; individual header/More and skill
shortcut screenshots are in the same directory. Preview and regression
checks use browser fixtures, not a live account or physical device.

## Joined minimal control verification

- [x] Reproduce the old separate-button geometry with a failing regression.
- [x] Render the joined outline, simple globe, dividers and slim arrows with
  44px targets and exact native accessible names across 320–1400px.
- [x] Update the older desktop-order assertion for the approved picker-between-
  arrows layout. The native DOM order and handlers remain untouched.
- [x] Independent review approved; strict build and final full `npm test` pass.
- [x] Inspect mobile/desktop fixtures and refresh the combined mobile preview.

The rendered control close-up is `tmp/thumb-dock/minimal-zone-control.png`.

## Skill Actions travel and centred header refinement

Latest user direction: remove travel from the page header; centre its native
title/requirements and match the shared Fantasy panel frame. Place the same
minimal travel controls at the right of Skill Actions, and daily boost/reset
information directly below the skill-card grid.

- [x] Add owned shadow travel proxies in the native heading wrapper, preserving
  every game node, parent and handler. Retain 44px targets and native state.
- [x] Use reversible grid markers for the heading, tile grid and daily footer;
  keep collapse functional and preserve the existing quiet skill shortcuts.
- [x] Reuse shared frame texture, theme variables and corner filigree.
- [x] Reproduce and fix hidden responsive sources inside one visible shell.
- [x] Reproduce and fix keyboard order so travel precedes the skill tiles.
- [x] Inspect mobile/desktop fixture screenshots and run focused regressions.
- [x] Strict build passes (101 source modules); final full `npm test` passes
  all 94 registered commands, including unpacked-extension and asset audits.

Current previews: `tmp/thumb-dock/skill-header-390.png` and
`tmp/thumb-dock/skill-header-1400.png`. Verification uses Chromium fixtures.

## Clickable zone header and edge arrows

Latest user revision replaces the Skill Actions travel row with simple arrows
at the zone frame's edges. Its central title/requirements area opens the
existing zone picker. The daily footer and shared frame styling remain.

- [x] Move only the owned host to zone-text; preserve every native node/handler.
- [x] Make native button proxies transparent over the header, with 44px arrow
  targets, keyboard activation, current disabled state and accessible names.
- [x] Remove the extra skill heading row and retain the daily footer/collapse.
- [x] Keep team tooltips above the hit target; refuse overlays over unfamiliar
  interactive header content, leaving native travel reachable.
- [x] Inspect mobile/desktop previews and pass focused browser suites.
- [x] Independent review: no remaining important findings; strict build passes.
- [x] Final full `npm test` passes all 94 registered commands on the revised
  source, including unpacked-extension coverage and the sprite-window audit.
