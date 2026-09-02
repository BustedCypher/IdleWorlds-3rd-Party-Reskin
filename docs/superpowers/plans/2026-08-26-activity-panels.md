# Activity Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Current Action, Action Log, and World Chat compact fantasy frames, backgrounds, typography, and responsive controls without taking ownership away from React.

**Architecture:** Extend `UIFoundation` with a label-driven activity-panel classifier that writes semantic data attributes. Style those roles in the existing shared UI stylesheet, then exercise the classifier through the built bundle and render representative desktop/mobile fixtures.

**Tech Stack:** JavaScript ES modules, CSS, jsdom smoke tests, Playwright fixture renderer, esbuild.

**Spec:** `docs/superpowers/specs/2026-08-26-activity-panels-design.md`

## Global Constraints

- Preserve all game-owned DOM nodes, text, controls, and event handlers.
- Keep Action Log and World Chat as compact row feeds.
- Support viewport widths from 320px upward without horizontal overflow.
- Reuse existing frame art, background textures, fonts, and design tokens.

---

### Task 1: Semantic activity-panel roles

**Files:**
- Modify: `tests/smoke.test.mjs`
- Modify: `src/modules/UIFoundation.js`

**Interfaces:**
- Consumes: existing `iw:dom-flush` reconciliation and `data-iw-ui="section-frame"` contract.
- Produces: `data-iw-panel` values `current-action`, `action-log`, and `world-chat`; `data-iw-panel-part` hooks for progress, queue, feed, controls, composer, and Send action.

- [ ] **Step 1: Write the failing test**

Add synthetic versions of the three panels to `PAGE`, then assert that the built bundle identifies each panel and its required interactive/content parts while leaving native controls in place.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build -- --allow-missing-assets` followed by `node tests/smoke.test.mjs`.

Expected: FAIL because `data-iw-panel` and `data-iw-panel-part` are absent.

- [ ] **Step 3: Write minimal implementation**

Add a label-to-role map, a bounded ancestor finder, and small per-panel part classifiers in `UIFoundation.js`. Register the classifier in the existing guarded reconciliation callback and clear the new attributes in `clearUIFoundation()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build -- --allow-missing-assets` followed by `node tests/smoke.test.mjs`.

Expected: the new activity-panel checks pass and native controls remain connected.

### Task 2: Shared visual treatment and responsive fixture

**Files:**
- Modify: `src/styles/ui-system.css`
- Modify: `build-tools/render-fixtures.mjs`
- Generated: `dist/content.bundle.js`

**Interfaces:**
- Consumes: semantic attributes from Task 1 and existing `--iw-*` tokens/frame assets.
- Produces: compact desktop/mobile panel presentation plus `activity-panels.png` and `activity-panels-mobile.png` fixture captures.

- [ ] **Step 1: Write the failing fixture audit**

Add representative activity-panel HTML and assertions for three visible frames, no horizontal overflow at 320/390/768px, a dense feed-row ceiling, and a mobile composer that remains within its frame.

- [ ] **Step 2: Run fixture to verify it fails**

Run: `npm run fixtures`.

Expected: FAIL because the new panels do not yet have the required compact/responsive treatment.

- [ ] **Step 3: Write minimal styling**

Extend the shared frame selectors to include activity panels and add role-scoped typography, inset feeds, separators, progress, queue, toolbar, composer, button, focus, and responsive rules in `ui-system.css`.

- [ ] **Step 4: Run fixture and focused smoke verification**

Run: `npm run fixtures`, `npm run build -- --allow-missing-assets`, and `node tests/smoke.test.mjs`.

Expected: fixture assertions and new smoke checks pass with no page warnings.

- [ ] **Step 5: Inspect generated screenshots**

Inspect `build-tools/fixtures/activity-panels.png` and `build-tools/fixtures/activity-panels-mobile.png` for frame consistency, dense rows, readable hierarchy, and mobile containment.
