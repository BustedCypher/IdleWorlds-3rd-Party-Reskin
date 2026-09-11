/**
 * UIFoundation
 *
 * Classifies existing IdleWorlds DOM into semantic visual roles. React keeps
 * ownership of all nodes/handlers; the skin only adds data attributes. The
 * central DOMWatcher remains the sole MutationObserver.
 */

import { on } from './DOMWatcher.js';
import { inject } from './StyleInjector.js';
import { guard, raf, warnOnce } from './Runtime.js';
import { getLayoutEpoch, pickRendered, preferRendered } from './Viewport.js';
import { decorateWorldBossPanel, clearWorldBossPanel } from './WorldBossPanels.js';
import { decorateVillagePanel, clearVillagePanel } from './VillagePanels.js';
import { reconcileVillageScene, clearVillageScene } from './VillageScene.js';
import { decorateCollapsibleFrames, clearCollapsibleFrames } from './CollapsibleFrames.js';
import {
  decoratePanelOrder, clearPanelOrder, setRearrangeMode, isRearrangeMode, resetPanelOrder,
} from './PanelOrder.js';
import css from '../styles/ui-system.css';
import villageSceneCss from '../styles/village-scene.css';
import collapsibleCss from '../styles/collapsible.css';
import panelOrderCss from '../styles/panel-order.css';
import compactCss from '../styles/compact-buttons.css';
import { decorateCompactButtons, clearCompactButtons } from './CompactButtons.js';

const NAV_LABELS = ['game', 'market', 'leaderboards', 'village', 'dungeon'];
/**
 * Controls the SKIN appended into a game node, and the game-control selector
 * that excludes them.
 *
 * CLAUDE.md: "An element the skin APPENDS into a game node changes what every
 * other classifier reads there." The collapse toggle proved it — on the pass
 * after its append, World Chat and Action Log stopped reading as split headers
 * and lost their two-column treatment, a regression whose cause was in a
 * different module from its symptom. Every sweep below that counts controls in
 * a panel has to be told about both of them.
 */
const SKIN_OWNED_CONTROL = '[data-iw-collapse], [data-iw-order-handle]';
const GAME_CONTROL = 'button:not([data-iw-collapse]):not([data-iw-order-handle])';
const ACTIVITY_PANELS = new Map([
  ['current action', 'current-action'],
  ['action log', 'action-log'],
  ['world chat', 'world-chat'],
]);
// The distinct panel slugs, for the coverage fast path in
// classifyActivityPanels(). Derived, so a fourth panel added above is picked
// up here automatically rather than silently weakening that check.
const ACTIVITY_PANEL_SLUGS = [...new Set(ACTIVITY_PANELS.values())];
function normText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function setRole(el, role) {
  if (el && el.dataset.iwUi !== role) el.dataset.iwUi = role;
  return el;
}

function setPanel(el, role) {
  if (el && el.dataset.iwPanel !== role) el.dataset.iwPanel = role;
  return el;
}

function setPanelPart(el, role) {
  if (el && el.dataset.iwPanelPart !== role) el.dataset.iwPanelPart = role;
  return el;
}

function nearestButtonLabel(btn) {
  return normText(btn?.textContent).toLowerCase();
}

/**
 * A control's label with any leading icon run removed: the live zone bar ships
 * "🌐 Zones", so an anchored /^zones$/ test never matched it and that button
 * alone kept its vanilla surfacing while its siblings were skinned. Mirrors
 * SkillPanelRenderer.textWithoutLeadingGlyph.
 */
function buttonLabelText(btn) {
  return nearestButtonLabel(btn).replace(/^[^a-z0-9]+/i, '').trim();
}

/**
 * A nav tab's label with a leading OR trailing icon/badge run removed. The
 * nav tab set is matched by exact label, so a single decorated tab
 * ("Dungeon 🔒", "⚔️ Dungeon") drops out of the set while its siblings match:
 * it keeps its vanilla surfacing inside a rail the skin has reframed, which
 * reads as "the rim skips that one button". Same family as the zone bar's
 * leading-glyph trap (CLAUDE.md).
 */
function navLabelText(btn) {
  return nearestButtonLabel(btn)
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9]+$/i, '')
    .trim();
}

function commonAncestor(elements) {
  const list = elements.filter(Boolean);
  if (!list.length) return null;
  let cur = list[0];
  while (cur && cur !== document.documentElement) {
    if (list.every(el => cur === el || cur.contains(el))) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function sameTextShell(el, stop, maxDepth = 4) {
  if (!el) return null;
  const text = normText(el.textContent);
  let cur = el;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parent = cur.parentElement;
    if (!parent || parent === stop) break;
    if (parent.matches?.('button, a, input, select, textarea')) break;
    if (normText(parent.textContent) !== text) break;
    cur = parent;
  }
  return cur;
}

function matchingLeaves(root, predicate) {
  return [...root.querySelectorAll('div,span,p,strong,time')]
    .filter(el => el.childElementCount === 0 && predicate(normText(el.textContent).toLowerCase(), el));
}

function directChildUnder(el, ancestor) {
  let cur = el;
  while (cur?.parentElement && cur.parentElement !== ancestor) cur = cur.parentElement;
  return cur?.parentElement === ancestor ? cur : null;
}

function warmBackground(btn) {
  try {
    const colour = getComputedStyle(btn).backgroundColor || '';
    const m = colour.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return false;
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    return r >= 90 && r > g * 1.35 && g > b * .9;
  } catch {
    return false;
  }
}

function deriveTabActive(btn) {
  if (!btn) return false;
  if (btn.getAttribute('aria-selected') === 'true' || btn.getAttribute('aria-current') === 'page') return true;
  const cls = String(btn.className || '');
  return /(?:bg|text|border)-(?:orange|amber|primary|accent)|data-\[state=active\]/i.test(cls);
}

// Which elements ARE the nav track/shell/tabs is stable once resolved; only
// which tab is ACTIVE changes live (route changes, semantic aria updates).
// Cache the former, always recompute the latter.
let mainNavResolution = null;

// Distinct nav labels present under `root`. Counting LABELS, not elements,
// matters: a duplicate control for the same label would otherwise never equal
// the deduped tab list and the cache would re-resolve (a whole-document scan)
// on every single flush.
function countNavTabsIn(root) {
  if (!root) return 0;
  const seen = new Set();
  for (const btn of root.querySelectorAll('button, a, [role="tab"]')) {
    const label = navLabelText(btn);
    if (NAV_LABELS.includes(label)) seen.add(label);
  }
  return seen.size;
}

function mainNavResolutionValid(entry) {
  return entry.epoch === getLayoutEpoch() &&
    entry.track.isConnected && entry.track.dataset.iwUi === 'main-nav' &&
    entry.tabs.every(btn => btn.isConnected && btn.dataset.iwUi === 'nav-tab') &&
    (entry.shell === entry.track ||
      (entry.shell.isConnected && entry.shell.dataset.iwUi === 'main-nav-shell')) &&
    // A rail that GAINS a tab after the first classification (Dungeon unlocks,
    // or the route mounts it late) used to stay cached forever: every check
    // above passes while the new sibling never gets `nav-tab` and renders
    // vanilla inside a skinned rail. Re-count the rail's own labelled controls
    // -- bounded to the rail, not the document -- and re-resolve on a change.
    countNavTabsIn(entry.track) === entry.tabs.length;
}

function resolveMainNav() {
  const buttons = [...document.querySelectorAll('button, a, [role="tab"]')];
  // Collect every candidate per label rather than the first in document
  // order: like the header, the main nav may be duplicated below Tailwind's
  // `xl` breakpoint (HeaderRenderer.findLiveHeader/pickVisible already
  // defend the header itself against exactly this), and "first in document
  // order" would pin the wide-layout copy even once it is the hidden one.
  const byLabel = new Map();
  for (const btn of buttons) {
    const label = navLabelText(btn);
    if (!NAV_LABELS.includes(label)) continue;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(btn);
  }
  if (byLabel.size < 4) return null;

  const tabs = NAV_LABELS.map(label => byLabel.has(label) ? pickRendered(byLabel.get(label)) : null).filter(Boolean);
  const track = commonAncestor(tabs);
  if (!track) return null;
  setRole(track, 'main-nav');

  // IdleWorlds currently places the button track inside a much larger rounded
  // shell. Mark the outer same-content wrapper separately so we can flatten it
  // without forcing an unknown wrapper to become a flex row.
  let shell = track;
  const navText = normText(track.textContent);
  for (let depth = 0; depth < 3; depth += 1) {
    const parent = shell.parentElement;
    if (!parent || parent === document.body) break;
    const parentButtons = [...parent.querySelectorAll('button, a, [role="tab"]')]
      .filter(btn => NAV_LABELS.includes(nearestButtonLabel(btn)));
    const rect = parent.getBoundingClientRect?.();
    if (parentButtons.length !== tabs.length || normText(parent.textContent) !== navText) break;
    if (rect && rect.height > 110) break;
    shell = parent;
  }
  if (shell !== track) setRole(shell, 'main-nav-shell');

  return { tabs, track, shell, epoch: getLayoutEpoch() };
}

function applyMainNavState(tabs) {
  const semanticActive = tabs.map(btn => deriveTabActive(btn));
  const hasSemanticActive = semanticActive.some(Boolean);
  const route = `${location.pathname || ''} ${location.hash || ''}`.toLowerCase();
  const routeActive = tabs.map(btn => {
    const label = navLabelText(btn);
    if (label === 'game') return /(?:^|\/)(?:game)?\/?$/.test(location.pathname || '/') && !location.hash;
    return route.includes(label);
  });
  const hasRouteActive = routeActive.some(Boolean);
  const firstClassification = tabs.every(btn => btn.dataset.iwUi !== 'nav-tab');
  const warmActive = firstClassification ? tabs.map(warmBackground) : tabs.map(() => false);

  tabs.forEach((btn, index) => {
    const wasActive = btn.dataset.iwState === 'active';
    setRole(btn, 'nav-tab');
    btn.dataset.iwTab = navLabelText(btn);
    const active = hasSemanticActive
      ? semanticActive[index]
      : hasRouteActive
        ? routeActive[index]
        : firstClassification
          ? warmActive[index]
          : wasActive;
    if (active) btn.dataset.iwState = 'active';
    else delete btn.dataset.iwState;
  });
}

/**
 * The one control the skin ADDS rather than decorates: an outbound link to the
 * companion site, sitting slightly apart from the route tabs. It is APPENDED as
 * the track's last child (rule 2 -- appended, never reparented) and it wears
 * `nav-tab` so the rail's own plate covers it for free, whichever sheet ends up
 * winning that rule; `data-iw-nav-link` is its own namespace, written only here,
 * so the separation styling and the teardown can key on it without contending
 * with anyone else on one node.
 *
 * It cannot disturb the nav cache: `navLabelText` reads "toolkit", which is not
 * in NAV_LABELS, so neither `resolveMainNav` nor `countNavTabsIn` sees it and
 * `applyMainNavState` never iterates it (so it can never be marked active).
 * Every attribute is set BEFORE insertion and nothing is written afterwards, so
 * the append costs exactly one mutation record on the flush that creates it and
 * the skin stays quiescent after (see the flush-quiescence trap in CLAUDE.md).
 */
const TOOLKIT_URL = 'https://idleworldstoolkit.com';

function ensureToolkitLink(track) {
  if (!track || track.querySelector(':scope > [data-iw-nav-link="toolkit"]')) return;
  const link = document.createElement('a');
  link.dataset.iwNavLink = 'toolkit';
  link.dataset.iwUi = 'nav-tab';
  link.href = TOOLKIT_URL;
  // The game is an idle game running in this tab -- navigating away in place
  // would cost the player the session they are watching.
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = 'IdleWorlds Toolkit (opens in a new tab)';
  link.textContent = 'Toolkit';
  track.append(link);
}

/**
 * The skin's own Rearrange and Reset controls.
 *
 * Same shape and the same four reasons as ensureToolkitLink above: they wear
 * `data-iw-ui="nav-tab"` so the rail's plate and metrics come from whichever
 * nav rule is winning; `data-iw-nav-link` is this module's namespace and is
 * already swept by clearUIFoundation; every attribute is set BEFORE insertion
 * so the append costs one mutation record and nothing after; and neither label
 * is in NAV_LABELS, so countNavTabsIn cannot see the skin's own appends and
 * invalidate the nav cache into a whole-document re-resolve every flush.
 *
 * Reset is always present and hidden by CSS outside the mode, rather than
 * created and destroyed with it — a `<button>` appended on a mode change would
 * be one more childList record on a gesture that currently costs zero.
 */
function ensureOrderControls(track) {
  if (!track || track.querySelector(':scope > [data-iw-nav-link="rearrange"]')) return;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.iwNavLink = 'rearrange';
  toggle.dataset.iwUi = 'nav-tab';
  toggle.title = 'Rearrange panels (your layout is remembered)';
  toggle.textContent = 'Rearrange';
  toggle.addEventListener('click', event => {
    event.preventDefault();
    setRearrangeMode(!isRearrangeMode(document), document);
  });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.dataset.iwNavLink = 'order-reset';
  reset.dataset.iwUi = 'nav-tab';
  reset.title = 'Restore the game’s own panel order';
  reset.textContent = 'Reset layout';
  reset.addEventListener('click', event => {
    event.preventDefault();
    resetPanelOrder(document);
  });

  track.append(toggle);
  track.append(reset);
}

function classifyMainNav() {
  if (mainNavResolution && mainNavResolutionValid(mainNavResolution)) {
    applyMainNavState(mainNavResolution.tabs);
    ensureToolkitLink(mainNavResolution.track);
    ensureOrderControls(mainNavResolution.track);
    return;
  }
  mainNavResolution = resolveMainNav();
  if (!mainNavResolution) return;
  applyMainNavState(mainNavResolution.tabs);
  ensureToolkitLink(mainNavResolution.track);
  ensureOrderControls(mainNavResolution.track);
}

// Once a zone-bar host is resolved, WHICH element plays the role never
// changes on a later tick -- only the zone-bar's own live copy (handled
// elsewhere) does. Cache the resolution and skip the whole-document scan
// (CLAUDE.md's own named ~65%-of-flush cost) as long as every previously
// found host/button/title still validates; any invalidation falls back to a
// full fresh scan, never a partial patch, so a stale entry can't linger.
let zoneBarResolutions = null;

function zoneBarResolutionValid(entry) {
  return entry.host.isConnected && entry.host.dataset.iwUi === 'zone-bar' &&
    (!entry.title || entry.title.isConnected) &&
    entry.buttons.every(btn => btn.isConnected && btn.dataset.iwUi === 'zone-action');
}

/**
 * Is there a zone bar in the document at all?
 *
 * The full resolve below sweeps `div,span,p,strong` — CLAUDE.md's own named
 * ~65%-of-flush cost — so an empty resolution must NOT simply rescan every
 * tick. This is the cheap gate: the same two controls the host walk keys on
 * (`Zones` + `Next Zone`), matched with the same regexes, over `button` only.
 */
function zoneBarCandidatePresent() {
  let zones = false;
  let next = false;
  for (const btn of document.querySelectorAll('button')) {
    const text = nearestButtonLabel(btn);
    if (/zones/.test(text)) zones = true;
    if (/next\s+zone/.test(text)) next = true;
    if (zones && next) return true;
  }
  return false;
}

function classifyZoneBar() {
  // `[].every(valid)` is vacuously TRUE, so once this resolved to nothing — on
  // any route without a zone bar, i.e. Market and Leaderboards — the cached
  // early return fired forever and the bar was never re-classified on the way
  // back to Game. That also silently strands HeaderRenderer.applyZoneSurface,
  // which reads the zone number off `data-iw-ui="zone-title"` to pick the
  // per-zone header artwork. An empty resolution is only trustworthy while the
  // cheap probe agrees there is nothing to find.
  if (zoneBarResolutions
      && (zoneBarResolutions.length
        ? zoneBarResolutions.every(zoneBarResolutionValid)
        : !zoneBarCandidatePresent())) return;

  zoneBarResolutions = [];
  // The live label reads "🧭 Zone 19: Eternium Verge", so an anchored
  // /^zone \d+:/ never matched it and the WHOLE zone bar stayed unclassified —
  // no zone-bar role, so HeaderRenderer never bound its frame/scene artwork and
  // the region rendered vanilla. Strip the leading icon run before testing.
  const zoneLabel = el => /^zone\s*\d+\s*:/i.test(normText(el.textContent).replace(/^[^a-z0-9]+/i, ''));
  const matches = [...document.querySelectorAll('div,span,p,strong')]
    .filter(el => zoneLabel(el) && el.childElementCount <= 2);
  // Keep only the INNERMOST match per branch. The bar's own container starts
  // with the zone name too, and the host walk below begins at the label's
  // PARENT — so treating the container as a label tags the page wrapper as the
  // zone bar, which then collects the whole header's artwork.
  const labels = matches.filter(el => !matches.some(other => other !== el && el.contains(other)));
  for (const label of labels) {
    let host = label.parentElement;
    for (let depth = 0; host && depth < 5; depth += 1, host = host.parentElement) {
      // Never climb past the zone bar into a page wrapper: once a candidate
      // also contains the header or the main nav it is layout, not the bar.
      if (host.querySelector('header, [data-iw-ui="main-nav"]')) break;
      const buttons = [...host.querySelectorAll('button')];
      const buttonText = buttons.map(nearestButtonLabel);
      if (buttonText.some(x => /zones/.test(x)) && buttonText.some(x => /next\s+zone/.test(x))) {
        setRole(host, 'zone-bar');
        const zoneButtons = [];
        buttons.forEach(btn => {
          const text = buttonLabelText(btn);
          const match = /^(zones|previous\s+zone|next\s+zone)$/.exec(text);
          if (match) {
            setRole(btn, 'zone-action');
            // Tone hook: header.css keys the teal/active/idle button art off
            // this rather than :first-of-type/:last-of-type, which mis-fire
            // whenever the game reorders or adds a control.
            const tone = match[1].startsWith('zones') ? 'zones'
              : match[1].startsWith('previous') ? 'prev' : 'next';
            if (btn.dataset.iwZoneAction !== tone) btn.dataset.iwZoneAction = tone;
            zoneButtons.push(btn);
          }
        });
        const title = sameTextShell(label, host, 2);
        setRole(title, 'zone-title');
        zoneBarResolutions.push({ host, title, buttons: zoneButtons });
        break;
      }
    }
  }
}

// Same freeze-once shape as classifyZoneBar: the leaf-vs-container walk is
// the expensive part (a wildcard descendant count plus a growing textContent
// read per ancestor level), and once a heading is paired with its frame that
// pairing does not change tick to tick.
let sectionFrameResolutions = null;
// Headings the last resolve pass EXAMINED (not merely the ones it framed).
let sectionFrameSeen = new Set();

/**
 * Heading copy that identifies a panel in a DOM variant that ships NO `.panel`
 * wrapper. This used to be the only trigger, which made coverage a per-route
 * chase: Village's three sub-panels, and everything on Market, Leaderboards and
 * Dungeon below the top-level card, rendered bare because their headings were
 * not in the list — and a name list cannot be completed from here, because the
 * live app is anonymous Tailwind and only the user can read its copy. `.panel`
 * (below) is the real trigger now; this is the fallback for headings with no
 * `.panel` ancestor at all.
 */
const SECTION_FRAME_NAMES = /^(inventory|market|leaderboards|quests|world bosses|village|salvaging|skill actions|zone selector)$/i;

/**
 * Panels OverlayFramer owns. Its cards are their own scroll container, so it
 * draws their frame on the border box alone and deliberately uses no
 * pseudo-elements; the section-frame rule's ::before hairline and ::after
 * filigree would scroll away with the content. A modal whose card is also a
 * `.panel` would otherwise get both treatments.
 *
 * Checked in the validity guard as well as at resolve time: OverlayFramer runs
 * on the same `iw:dom-flush`, so a modal that mounts mid-flush can be framed
 * here once, before the scrim is tagged. Re-checking on validity is what
 * releases it on the next flush instead of leaving it double-chromed forever.
 */
/**
 * A `.panel` some OTHER owner already dresses. Framing these was a regression:
 *
 *  - `<header>`: `HeaderRenderer.applyZoneSurface()` paints the per-zone
 *    artwork there. The section-frame rule's `background` is `!important` and
 *    ui-system.css is injected LAST, so framing anything in the header replaces
 *    that artwork with the forged ground — the zone art simply vanishes.
 *  - `[data-iw-ui="zone-bar"]`: its own `::before` scene, same story.
 *  - `[data-iw-panel]`: `classifyActivityPanels` sets `section-frame` on its own
 *    hosts, and those hosts ARE `.panel`s (see findActivityPanelHost). Two
 *    modules writing one attribute is the flash CLAUDE.md documents for the
 *    boss cards — here it also means two stale-clear loops deleting each
 *    other's mark. That classifier now runs BEFORE this one so the marker
 *    exists when this test runs.
 */
function ownedElsewhere(el) {
  return !!el.closest?.('header, [data-iw-ui="zone-bar"], [data-iw-panel]');
}

function inOverlay(el) {
  if (el.closest?.('[data-iw-overlay="scrim"], [data-iw-overlay="panel"]')) return true;
  // Structural fallback, NOT redundant with the tag above: OverlayFramer runs
  // on the same `iw:dom-flush`, so on the tick a modal mounts its scrim may not
  // be tagged yet. Keying only on the tag leaves a window where the card takes
  // both treatments at once -- the two-writers-on-one-node flash CLAUDE.md
  // documents for the boss cards. A `.panel` inside a fixed layer is a modal
  // card by construction; no route panel lives in one. Same cheap prefilter
  // OverlayFramer uses: a class-name probe confirmed by rendered state.
  const layer = el.closest?.('[class*="fixed"]');
  return !!layer && getComputedStyle(layer).position === 'fixed';
}

/** The panel's own heading — not one belonging to a panel nested inside it. */
/**
 * Per-pass heading index.
 *
 * Four separate places here each ran their OWN `h1,h2,h3,h4` sweep on every
 * classify pass: sectionFrameOrphanHeadings(), bossHeadings(),
 * villageHeadings() — all three document-wide — plus panelHeading(), which
 * re-queried per `.panel` inside the section-frame loop and therefore walked
 * the whole inventory subtree once per panel. Together ~68ms of a 225ms
 * profile at 13k nodes, all of it re-deriving the identical list.
 *
 * queueClassify() runs every classifier inside ONE rAF callback, so the DOM
 * cannot change between them, and nothing any of them appends is a heading
 * (VillagePanels/WorldBossPanels only ever create div/span/section/p). One
 * index per pass is therefore exactly equivalent to four sweeps, and it is
 * rebuilt from scratch next pass — no staleness across flushes.
 */
let passToken = 0;
let headingIndexToken = -1;
let headingIndexValue = null;

function beginClassifyPass() {
  passToken += 1;
}

function headingIndex() {
  if (headingIndexToken === passToken && headingIndexValue) return headingIndexValue;
  const all = [...document.querySelectorAll('h1,h2,h3,h4')];
  const firstByPanel = new Map();
  const orphans = [];
  for (const h of all) {
    const panel = h.closest('.panel');
    // Document order is preserved, so the first heading seen for a panel is
    // the same one the old per-panel query returned.
    if (panel) { if (!firstByPanel.has(panel)) firstByPanel.set(panel, h); }
    else orphans.push(h);
  }
  headingIndexValue = { all, firstByPanel, orphans };
  headingIndexToken = passToken;
  return headingIndexValue;
}

function panelHeading(panel) {
  return headingIndex().firstByPanel.get(panel) || null;
}

function sectionFrameResolutionValid(entry) {
  // The epoch check is belt-and-suspenders here: sectionFramePanels() is
  // itself viewport-aware (preferRendered, re-run fresh every classify call),
  // so the coverage check below already catches a resize because the live
  // panel set changes identity. Checking the epoch too means correctness
  // does not quietly depend on that coverage shape staying node-keyed.
  return entry.epoch === getLayoutEpoch() &&
    entry.frame.isConnected &&
    entry.frame.dataset.iwUi === 'section-frame' &&
    !inOverlay(entry.frame) && !ownedElsewhere(entry.frame) &&
    // A panel with no heading YET is legal (an async route paints the card
    // before its title); re-resolve once one appears so it gets its
    // section-title. Same race as the empty-Quests panel below.
    (entry.heading
      ? entry.heading.isConnected &&
        entry.heading.dataset.iwUi === 'section-title' &&
        entry.frame.contains(entry.heading)
      : !panelHeading(entry.frame)) &&
    // A resolution that is NOT a `.panel` yet CONTAINS one is a multi-panel
    // layout column picked before the inner panel had content (the Quests
    // race). Force a re-resolve so the tighter `.panel` frame wins.
    (entry.frame.classList.contains('panel') || !entry.frame.querySelector('.panel'));
}

/**
 * Every panel on every route.
 *
 * `.panel` is one of the four durable hooks the whole app ships (CLAUDE.md);
 * it wraps each real panel and nothing else, so it identifies them without
 * depending on heading copy that a rewording breaks silently. The leaf-vs-
 * column split that used to need a heading walk is already handled downstream
 * by ui-system.css's `:not(:has(...))` rule: a `.panel` nesting another is
 * stripped bare as a layout column, the innermost one is framed.
 *
 * The game ships the whole stack twice below Tailwind's `xl` breakpoint (the
 * "hidden duplicate" trap in CLAUDE.md swaps which copy is live at 1280px) —
 * `preferRendered` picks whichever copy is actually painting rather than
 * assuming the wide-layout copy is always the mirror. Below 1280px it is NOT:
 * see Viewport.js.
 */
function sectionFramePanels() {
  return preferRendered([...document.querySelectorAll('.panel')]
    .filter(p => !inOverlay(p) && !ownedElsewhere(p)));
}

/**
 * Name-matched headings that have NO `.panel` ancestor — the only ones the
 * structural pass cannot see. Anchored tests are run against the label with a
 * leading icon run stripped: the live app prefixes many of them ("🏗️ Village
 * Add-ons"), the same trap that once cost the whole zone bar.
 */
function sectionFrameOrphanHeadings() {
  // headingIndex().orphans is exactly "no `.panel` ancestor", already computed
  // for this pass.
  const matches = headingIndex().orphans.filter(heading =>
    !inOverlay(heading) &&
    SECTION_FRAME_NAMES.test(normText(heading.textContent).replace(/^[^a-z0-9]+/i, '')));
  return preferRendered(matches);
}

function classifySectionFrames() {
  // Coverage as well as validity, for the same vacuous-`[].every()` reason as
  // classifyMarket. This one is not route-shaped (every real route has at
  // least one framed panel) but it IS race-shaped: a flush that lands after
  // the route mounts and before its heading renders resolves to an empty
  // array, which then validates forever and the panel is never framed at all.
  //
  // Coverage is tracked against the targets this pass EXAMINED, not the ones
  // it managed to frame. Keying on resolved entries instead would make an
  // orphan heading the walk can never pair with a frame re-trigger the whole
  // resolve -- the wildcard descendant count below -- on every single flush.
  const panels = sectionFramePanels();
  const orphans = sectionFrameOrphanHeadings();
  const targets = [...panels, ...orphans];
  if (sectionFrameResolutions
      && sectionFrameResolutions.every(sectionFrameResolutionValid)
      && targets.every(target => sectionFrameSeen.has(target))) return;

  // Drop marks from the previous (possibly stale) resolution — the :has()
  // column rule only *hides* a mis-picked column, it does not un-mark it.
  if (sectionFrameResolutions) {
    for (const e of sectionFrameResolutions) {
      // If another owner has claimed this node since (an activity panel that
      // resolved late), the mark on it is THEIRS now. Deleting it here is what
      // turns a hand-off into a one-flush flash.
      if (ownedElsewhere(e.frame)) continue;
      if (e.frame.dataset.iwUi === 'section-frame') delete e.frame.dataset.iwUi;
      if (e.heading?.dataset.iwUi === 'section-title') delete e.heading.dataset.iwUi;
    }
  }

  sectionFrameResolutions = [];
  sectionFrameSeen = new Set(targets);

  // The panel IS the frame. No walk, no size heuristic, no name.
  for (const panel of panels) {
    const heading = panelHeading(panel);
    setRole(panel, 'section-frame');
    if (heading) setRole(heading, 'section-title');
    sectionFrameResolutions.push({ heading, frame: panel, epoch: getLayoutEpoch() });
  }

  // Fallback: a named heading with no `.panel` to anchor to still needs a frame
  // resolved by walking up to a container that reads as a panel.
  for (const heading of orphans) {
    const ownPanel = heading.closest('.panel');
    let cur = heading.parentElement;
    let picked = null;
    for (let depth = 0; cur && depth < 5; depth += 1, cur = cur.parentElement) {
      if (cur.matches?.('.compact-panel')) break;
      const rect = cur.getBoundingClientRect?.();
      // Prefer the game's own `.panel` wrapper: it IS the frame, and it has
      // layout width before it has content, so an empty-at-first-paint panel
      // still resolves. Width alone also excludes the 0-width hidden mirror.
      if (cur.classList?.contains('panel') && rect && rect.width > 1) { picked = cur; break; }
      const descendantCount = cur.querySelectorAll?.('*').length || 0;
      const substantial = descendantCount >= 12 && normText(cur.textContent).length >= 45;
      const roomy = !rect || (rect.width > 320 && rect.height > 110);
      // Fallback for DOM variants without `.panel`: never accept a container
      // that also wraps a DIFFERENT panel — that is a layout column.
      const wrapsSiblingPanel = ownPanel
        ? [...cur.querySelectorAll('.panel')].some(p => p !== ownPanel && !p.contains(ownPanel) && !ownPanel.contains(p))
        : cur.querySelectorAll('.panel').length > 1;
      if (substantial && roomy && !wrapsSiblingPanel) { picked = cur; break; }
    }
    if (picked) {
      setRole(picked, 'section-frame');
      setRole(heading, 'section-title');
      sectionFrameResolutions.push({ heading, frame: picked, epoch: getLayoutEpoch() });
    }
  }
}

/**
 * World Boss cards.
 *
 * The boss list is a stack of the game's shared `.compact-panel` cards. Nothing
 * else claims them - they expose no skill verb (DOMWatcher.detectSkillType
 * returns 'unknown') and no Reward:/Turn In pair (QuestPanelRenderer rejects
 * them) - so they kept the game's flat plate inside our forged frame. Tagging
 * is scoped to the "World Bosses" panel, never `.compact-panel` at large, which
 * quests, skills, village and shop all share.
 *
 * The role lives in its OWN attribute rather than `data-iw-ui`, the same way
 * QuestPanelRenderer namespaces `data-iw-quest-role`: SkillPanelRenderer sees
 * these cards on `iw:skill-panel`, reports 'unknown', and its clear path used
 * to strip `data-iw-ui` off them on every flush - the card visibly flashed
 * between the skinned and vanilla ground while the two writers fought over the
 * one attribute.
 *
 * Resolution is cached like every other classifier here; only the card sweep
 * (a small same-panel query) re-runs per tick, so a boss card that mounts late
 * is still tagged.
 */
let bossPanelResolutions = null;
let bossPanelSeen = new Set();

function bossPanelResolutionValid(entry) {
  return entry.epoch === getLayoutEpoch() &&
    entry.heading.isConnected && entry.root.isConnected && entry.root.contains(entry.heading);
}

/** The panel that owns the boss list. The game's own `.panel` wrapper is
 *  preferred - it also holds the Zone Control card below the boss stack - with
 *  the resolved section frame as the fallback for variants without one. */
function bossPanelRoot(heading) {
  const panel = heading.closest('.panel');
  if (panel) return panel;
  const entry = (sectionFrameResolutions || []).find(e => e.heading === heading);
  return entry ? entry.frame : null;
}

function tagBossCards(entry) {
  for (const card of entry.root.querySelectorAll('.compact-panel')) {
    // Tag the leaf card only, the same rule the panel frames follow.
    if (card.querySelector('.compact-panel')) continue;
    if (card.dataset.iwBoss !== 'card') card.dataset.iwBoss = 'card';
  }
  decorateWorldBossPanel(entry);
}

function untagBossCards(entry) {
  clearWorldBossPanel(entry.root);
  for (const card of entry.root.querySelectorAll('[data-iw-boss]')) delete card.dataset.iwBoss;
}

function bossHeadings() {
  // Same duplicate-column reasoning as sectionFrameHeadings() above.
  const matches = headingIndex().all.filter(heading =>
    /^world bosses$/i.test(normText(heading.textContent)));
  return preferRendered(matches);
}

function classifyBossCards() {
  // Same vacuous-`[].every()` freeze as classifyMarket: World Bosses is a
  // Game-route panel, so any visit to Market/Leaderboards resolves this to an
  // empty array and the boss cards were never re-tagged on the way back.
  const headings = bossHeadings();
  if (bossPanelResolutions
      && bossPanelResolutions.every(bossPanelResolutionValid)
      && headings.every(heading => bossPanelSeen.has(heading))) {
    bossPanelResolutions.forEach(tagBossCards);
    return;
  }
  // Same reason classifySectionFrames/classifyActivityPanels drop their old
  // marks: a resize that moves World Bosses to the other layout column would
  // otherwise leave `data-iw-boss="card"` stuck on the now-hidden column's
  // cards forever, since only isConnected is checked and a display:none
  // ancestor stays connected.
  if (bossPanelResolutions) bossPanelResolutions.forEach(untagBossCards);
  bossPanelResolutions = [];
  bossPanelSeen = new Set(headings);
  for (const heading of headings) {
    const root = bossPanelRoot(heading);
    if (!root || bossPanelResolutions.some(e => e.root === root)) continue;
    const entry = { heading, root, epoch: getLayoutEpoch() };
    bossPanelResolutions.push(entry);
    tagBossCards(entry);
  }
}

/**
 * Market.
 *
 * The Market page is a single `.panel` that classifySectionFrames already
 * frames. Inside it the game stacks its shared `.compact-row` cards — buy
 * listings, the player's own listings, empty slots — as individually rounded
 * Tailwind plates that float against the forged frame instead of matching it.
 * `.compact-row` is also worn by inventory rows and Action Log / World Chat
 * feed rows, so this is scoped to its own `data-iw-market` namespace rather
 * than styled through the shared class (the same reason World Boss cards got
 * `data-iw-boss`).
 *
 * Which frame is the Market is cached; the leaf-card sweep re-runs per tick so
 * a listing that mounts late is still tagged. Depends on classifySectionFrames
 * having run first this flush to set `section-title` — it is called before this
 * in queueClassify.
 */
let marketResolutions = null;
let marketSeen = new Set();

function marketResolutionValid(entry) {
  return entry.frame.isConnected && entry.frame.dataset.iwMarket === 'root' &&
    entry.title.isConnected && /^market$/i.test(normText(entry.title.textContent));
}

function tagMarketCards(entry) {
  for (const row of entry.frame.querySelectorAll('.compact-row')) {
    // Leaf cards only, and never an inventory row or a feed message row that
    // wears the same class.
    if (row.querySelector('.compact-row')) continue;
    if (row.querySelector(':scope > .fs-inv-row')) continue;
    if (row.closest('[data-iw-panel-part="feed"]')) continue;
    if (row.dataset.iwMarket !== 'row') row.dataset.iwMarket = 'row';
    // The row's name/detail area is a bare full-width text <button> (the item
    // click target), which the shared control rule otherwise plates as a
    // forged control -- the lighter rectangle inside each card. Tag it so it
    // opts out of that rule (:not([data-iw-market])) and renders flat.
    const nameBtn = row.querySelector('button.text-left, button[class*="flex-1"]');
    if (nameBtn && nameBtn.dataset.iwMarket !== 'namebtn') nameBtn.dataset.iwMarket = 'namebtn';
  }
}

function untagMarket(entry) {
  if (entry.frame.dataset.iwMarket === 'root') delete entry.frame.dataset.iwMarket;
  for (const el of entry.frame.querySelectorAll('[data-iw-market]')) delete el.dataset.iwMarket;
}

function marketTitles() {
  return [...document.querySelectorAll('[data-iw-ui="section-title"]')]
    .filter(title => /^market$/i.test(normText(title.textContent)));
}

function classifyMarket() {
  // Coverage, not just validity. `[].every(valid)` is vacuously TRUE, so the
  // bare validity guard froze this classifier the first time it ran on a route
  // with no Market (i.e. every boot on the Game tab): the empty resolution
  // stayed "valid" forever and navigating to /market never tagged a thing.
  // classifySectionFrames still re-resolved -- its entries go DISCONNECTED on a
  // route swap, which is invalidation the empty case never gets -- so the panel
  // kept its forged frame while the rows inside reverted, which reads as "the
  // CSS was forgotten" rather than "a classifier stopped running". Require that
  // every Market title currently in the DOM is represented, the same shape
  // classifyActivityPanels uses. See tests/route-swap-reclassify.test.mjs.
  const titles = marketTitles();
  if (marketResolutions
      && marketResolutions.every(marketResolutionValid)
      && titles.every(title => marketSeen.has(title))) {
    marketResolutions.forEach(tagMarketCards);
    return;
  }
  // Same reason classifySectionFrames/classifyBossCards drop their old marks
  // before a fresh resolve: a resize while on the Market route can move the
  // panel to the other layout column, and only isConnected is checked above,
  // which a display:none ancestor still satisfies.
  if (marketResolutions) marketResolutions.forEach(untagMarket);
  marketResolutions = [];
  marketSeen = new Set(titles);
  for (const title of titles) {
    const frame = title.closest('[data-iw-ui="section-frame"]');
    if (!frame || marketResolutions.some(e => e.frame === frame)) continue;
    if (frame.dataset.iwMarket !== 'root') frame.dataset.iwMarket = 'root';
    const entry = { frame, title };
    marketResolutions.push(entry);
    tagMarketCards(entry);
  }
}

/**
 * Village route: the Housing hero and the Village Add-on slots.
 *
 * Two panels, resolved from their own headings ("Village" and the icon-prefixed
 * "Village Add-ons" -- the leading icon run is stripped before the anchored
 * test, the zone bar's trap). Both are `.panel`s that classifySectionFrames
 * already frames; this classifier only resolves WHICH panel is which and hands
 * it to VillagePanels, which owns every `data-iw-village*` role inside.
 *
 * Cached and coverage-tracked exactly like classifyBossCards/classifyMarket:
 * these panels exist only on the Village route, so the resolution is empty on
 * every other one and `[].every(valid)` would otherwise freeze this classifier
 * for the session (see the note on classifyMarket above). The per-card sweep
 * inside decorateVillagePanel re-runs every flush behind its own signature
 * guard, so a slot that installs or a picker that opens is still decorated.
 */
let villageResolutions = null;
let villageSeen = new Set();

function villageResolutionValid(entry) {
  return entry.epoch === getLayoutEpoch() &&
    entry.heading.isConnected && entry.root.isConnected && entry.root.contains(entry.heading);
}

function villageLabel(heading) {
  return normText(heading.textContent).replace(/^[^a-z0-9]+/i, '');
}

function villageHeadings() {
  // Same duplicate-column reasoning as sectionFrameHeadings(): below 1280px the
  // live copy is the one Tailwind did NOT mark hidden, and a class test gets
  // that backwards.
  const matches = headingIndex().all.filter(heading => {
    const text = villageLabel(heading);
    return /^village$/i.test(text) || /^village add-?ons$/i.test(text);
  });
  return preferRendered(matches);
}

function classifyVillagePanels() {
  const headings = villageHeadings();
  if (villageResolutions
      && villageResolutions.every(villageResolutionValid)
      && headings.every(heading => villageSeen.has(heading))) {
    villageResolutions.forEach(decorateVillagePanel);
    return;
  }
  // Drop the old marks before re-resolving, for the same reason the boss and
  // market classifiers do: a resize across 1280px moves these panels to the
  // other layout column, and isConnected alone still holds for the hidden one.
  if (villageResolutions) villageResolutions.forEach(entry => clearVillagePanel(entry.root));
  villageResolutions = [];
  villageSeen = new Set(headings);
  for (const heading of headings) {
    const root = heading.closest('.panel');
    if (!root || villageResolutions.some(e => e.root === root)) continue;
    const kind = /^village add-?ons$/i.test(villageLabel(heading)) ? 'addons' : 'housing';
    const entry = { heading, root, kind, epoch: getLayoutEpoch() };
    villageResolutions.push(entry);
    decorateVillagePanel(entry);
  }
}

function findCurrentActionProgress(root) {
  const semantic = root.querySelector('[role="progressbar"], [aria-valuenow][aria-valuemax]');
  if (semantic) return semantic;
  const fill = [...root.querySelectorAll('[style]')]
    .find(el => /^\d+(?:\.\d+)?%$/.test(el.style.width || '') && el.parentElement !== root);
  return fill?.parentElement || null;
}

/* ---------------------------------------------------------------------------
 * Current Action progress smoothing
 *
 * Presentation only, and deliberately WITHOUT a second source of truth: the
 * skin never computes or writes a progress value. The whole animation is the
 * CSS transition on `[data-iw-panel-part="progress"] > *` (see ui-system.css
 * for why a linear transition whose duration equals the update interval is an
 * exact fix for the game's one-tick head start, not just a smoothing pass).
 *
 * All this code does is supply that transition with two facts CSS cannot
 * observe:
 *   1. how long a tick actually is, measured from the writes themselves —
 *      guessing it wrong is what makes such a bar lag or stall, and the
 *      interval is derived from the action's duration (housing tier and the
 *      rest), which is the game's business, not ours;
 *   2. which single update per action is the completion RESET rather than a
 *      tick, so the bar snaps back instead of sliding backwards for a whole
 *      tick over an action that has already restarted.
 *
 * Both are carried on `data-iw-*` attributes, which is what keeps this off the
 * flush path: DOMWatcher's observer runs with
 * `attributeFilter: ['class','style','disabled','aria-disabled']`, so these
 * writes are invisible to it. An inline style (even a custom property) on the
 * same node would queue an `attr:style` context on every action.
 */

// Below this the two widths are the same value re-written, not a tick.
const PROGRESS_EPSILON = 0.05;

// The measured tick is deliberately overshot before it becomes a transition
// duration. A duration that matches the tick EXACTLY still stutters: real
// per-tick timing jitters (live capture: a nominal 250ms tick actually landed
// anywhere from 208-335ms), so an exact-match transition finishes early about
// half the time and the bar sits dead-still for the remainder of that tick
// before the next real update arrives. Overshooting means the transition is
// almost always still in flight when that update lands, so the browser
// smoothly RETARGETS it (continuous velocity change, no positional jump)
// instead of the bar visibly pausing and then jumping. 12% is small enough
// that the bar is never perceptibly slow, and it never compounds across
// ticks: each real update snaps the target to the server's own value, so any
// instant where the bar is fractionally behind is corrected at the very next
// tick, not accumulated.
const PROGRESS_LEAD_BIAS = 1.12;

// A duration write is skipped below this threshold, so ordinary tick-to-tick
// jitter around a stable rate doesn't churn the inline style (and the
// self-triggered flush that comes with it -- see the note above
// smoothActionProgress) every single update.
const PROGRESS_DURATION_EPSILON_MS = 15;

let progressSamples = new WeakMap();

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/**
 * The percentage the game is currently showing, from whichever of the two
 * shapes findCurrentActionProgress() matched: an inline `width: N%` fill, or a
 * semantic bar carrying aria-valuenow/max. Returns null when neither reads as
 * a number, which is the normal state of a panel with no action running.
 */
function progressPercent(track) {
  const fill = [...track.querySelectorAll('[style]')]
    .find(el => /^\d+(?:\.\d+)?%$/.test(el.style.width || ''));
  if (fill) return parseFloat(fill.style.width);
  const now = parseFloat(track.getAttribute('aria-valuenow'));
  const max = parseFloat(track.getAttribute('aria-valuemax'));
  if (Number.isFinite(now) && Number.isFinite(max) && max > 0) return (now / max) * 100;
  return null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Suppress the transition for exactly one update. The tag is dropped on the
 * next frame rather than on the next flush: the next flush is a whole tick
 * away, and leaving the transition off across it would un-smooth the first
 * step of the new action.
 */
function markProgressReset(track) {
  track.dataset.iwProgressReset = '1';
  raf(() => {
    if (track.dataset.iwProgressReset) delete track.dataset.iwProgressReset;
  });
}

/**
 * Commit a measured tick to the transition duration the CSS actually uses,
 * as a CONTINUOUS inline custom property rather than a snap to one of a
 * handful of discrete buckets. A bucketed value is either exactly right or
 * off by up to a whole bucket step; a continuous one tracks the measured
 * cadence directly, and — combined with PROGRESS_LEAD_BIAS above — is what
 * keeps the tween from ever visibly stalling between ticks. `--iw-action-tick`
 * in base.css is what still applies before this ever fires (pre-measurement,
 * or a still-loading panel).
 *
 * Written inline (not as a `data-iw-*` attribute) so it IS visible to
 * DOMWatcher's `attributeFilter: [...,'style',...]` and queues one extra
 * `attr:style` flush on this node per committed change. That is an accepted,
 * narrow cost, not an oversight: the write only happens when the duration has
 * actually moved (PROGRESS_DURATION_EPSILON_MS), the re-entrant
 * smoothActionProgress() call it triggers reads the SAME pct and returns
 * immediately via the epsilon guard above, and every classifier this flush
 * reaches is already on its cached fast path (the flush-path caching work
 * elsewhere in this file) — it is one more cheap pass on a page already
 * flushing about once per animation frame, not a new category of cost.
 */
function commitProgressDuration(track, state, ms) {
  const durationMs = Math.min(4000, Math.max(60, ms)) * PROGRESS_LEAD_BIAS;
  if (state.appliedDurationMs !== undefined &&
      Math.abs(durationMs - state.appliedDurationMs) < PROGRESS_DURATION_EPSILON_MS) return;
  track.style.setProperty('--iw-progress-duration', (durationMs / 1000).toFixed(3) + 's');
  state.appliedDurationMs = durationMs;
}

function smoothActionProgress(track) {
  if (!track) return;
  const pct = progressPercent(track);
  if (pct === null || !Number.isFinite(pct)) return;

  const at = nowMs();
  const state = progressSamples.get(track);
  if (!state) {
    progressSamples.set(track, { pct, at, deltas: [], afterReset: false });
    return;
  }
  // A flush the width did not cause — most of them, on an idle game. Leaving
  // `at` alone here is what makes the delta below an interval between WRITES
  // rather than between flushes.
  if (Math.abs(pct - state.pct) < PROGRESS_EPSILON) return;

  if (pct < state.pct - PROGRESS_EPSILON) {
    markProgressReset(track);
    // A completion is not a tick: it says nothing about the interval, and
    // timing it would poison the median with the action's whole duration.
    // Live capture (claude/probe-action-progress.js) confirms the game's
    // first tick of a new action consistently takes roughly DOUBLE the
    // steady-state interval (measured: ~500ms vs a steady 250ms), so the
    // NEXT delta -- from this reset write to the first write of the new
    // action -- is equally unrepresentative and must not reach `deltas`
    // either. `afterReset` flags exactly that one upcoming delta for
    // exclusion below, while `state.at` still advances so the delta AFTER
    // that one measures real wall-clock time again.
    state.afterReset = true;
  } else {
    const delta = at - state.at;
    // Discard anything outside the plausible range for an update interval: a
    // sub-frame delta is two writes coalesced into one flush, a multi-second
    // one is a resumed/unpaused action rather than a tick, and the delta
    // spanning a completion is the anomalous post-reset gap described above,
    // not a steady tick.
    if (delta >= 60 && delta <= 4000 && !state.afterReset) {
      state.deltas.push(delta);
      if (state.deltas.length > 5) state.deltas.shift();
      // Three samples before committing, so one janked frame during boot
      // cannot pin the bar to the wrong duration for the rest of the session.
      if (state.deltas.length >= 3) commitProgressDuration(track, state, median(state.deltas));
    }
    state.afterReset = false;
  }

  state.pct = pct;
  state.at = at;
}

function hasPanelBodyOutsideHeading(candidate, heading) {
  const headingBranch = directChildUnder(heading, candidate);
  if (!headingBranch) return false;
  return [...candidate.children].some(child => {
    if (child === headingBranch || child.matches?.('button,a,[role="button"]')) return false;
    if (child.matches?.(SKIN_OWNED_CONTROL)) return false;
    return !/^\s*[\d,.]+\s*xp\s*\/\s*hr\s*$/i.test(normText(child.textContent));
  });
}

function panelHostMatches(candidate, panel, heading) {
  if (panel === 'current-action') {
    return !!findCurrentActionProgress(candidate);
  }
  if (panel === 'action-log') {
    const hasControl = [...candidate.querySelectorAll(GAME_CONTROL + ',a')]
      .some(el => /^view\s+all$/i.test(normText(el.textContent)));
    const hasRate = /\b[\d,.]+\s*xp\s*\/\s*hr\b/i.test(normText(candidate.textContent));
    return (hasControl || hasRate) && hasPanelBodyOutsideHeading(candidate, heading);
  }
  if (panel === 'world-chat') {
    return !![...candidate.querySelectorAll('input,textarea')]
      .find(el => /message\s+world\s+chat/i.test(el.getAttribute('placeholder') || ''));
  }
  return false;
}

function findActivityPanelHost(heading, panel) {
  let cur = heading.parentElement;
  for (let depth = 0; cur && cur !== document.body && depth < 6; depth += 1, cur = cur.parentElement) {
    if (panelHostMatches(cur, panel, heading)) return cur;
  }
  // The structural matchers miss when the game concatenates the header with the
  // feed: Action Log glues "…XP/hr" onto "System…" (kills the rate regex) and
  // renders "View All" as a <span>, not a <button>. Every activity panel is the
  // game's own `.panel` primitive, and `heading` is already a positively
  // matched panel label, so that ancestor is a safe fallback host. `heading`
  // itself was already picked from the rendered copy by
  // activityPanelLabelNodes() (see Viewport.js), so its own `.panel` ancestor
  // needs no separate duplicate-column check here.
  const panelEl = heading.closest?.('.panel');
  if (panelEl && panelEl.contains(heading)) return panelEl;
  return null;
}

function classifyPanelHeader(host, heading) {
  const titleBranch = directChildUnder(heading, host);
  if (!titleBranch) return;
  let companion = titleBranch.nextElementSibling;
  // Skip the skin's own appended controls: a panel whose only other child is
  // the rearrange handle must still read exactly as it did before the append.
  while (companion?.matches?.(SKIN_OWNED_CONTROL)) companion = companion.nextElementSibling;
  // `:not([data-iw-collapse])` — the skin's OWN per-panel collapse toggle is
  // appended INTO this row (CollapsibleFrames), and counting it as a control
  // made a split header stop reading as split on the very next pass: the
  // classifier saw a button in the title branch that the game never wrote.
  const split = titleBranch !== heading &&
    !titleBranch.querySelector(GAME_CONTROL + ',a,[role="button"]:not([data-iw-collapse]):not([data-iw-order-handle])') &&
    companion &&
    !companion.querySelector('input,textarea,h1,h2,h3,h4,[role="heading"]') &&
    (companion.querySelector('button,a,[role="button"]') || /\bxp\s*\/\s*hr\b/i.test(normText(companion.textContent)));
  if (split) {
    host.dataset.iwPanelHeader = 'split';
    setPanelPart(titleBranch, 'header-title');
    setPanelPart(companion, 'header-tools');
  } else {
    delete host.dataset.iwPanelHeader;
    // titleBranch is the direct child of host that carries the title — that IS
    // the header row (Action Log keeps its title, View All and XP/hr in one).
    // Never fall back to host itself: that made the whole panel a header row.
    setPanelPart(titleBranch, 'header');
  }
}

function classifyFeed(host) {
  let markers = matchingLeaves(host, text => /^\d{1,2}:\d{2}:\d{2}$/.test(text));
  if (!markers.length) markers = matchingLeaves(host, text => text === 'system');
  let feed = markers.length > 1
    ? commonAncestor(markers)
    : markers.length === 1
      ? directChildUnder(markers[0], host)
      : null;
  if (!feed) {
    feed = [...host.children].find(child =>
      child.dataset.iwPanelPart !== 'header' &&
      // Without this the skin's own full-panel rearrange handle — a direct
      // child with no input and no heading — is the first thing this fallback
      // finds, and it would be given the feed's `overflow-y:auto; max-height`.
      !child.matches(SKIN_OWNED_CONTROL) &&
      !child.querySelector('input,textarea') &&
      !child.matches('form') &&
      !child.querySelector('h1,h2,h3,h4,[role="heading"]')) || null;
  }
  if (!feed || feed === host || !host.contains(feed)) return;
  setPanelPart(feed, 'feed');
  const rows = new Set(markers.map(marker => directChildUnder(marker, feed)).filter(Boolean));
  rows.forEach(row => setPanelPart(row, 'feed-row'));
}

function classifyCurrentAction(host) {
  const track = setPanelPart(findCurrentActionProgress(host), 'progress');
  smoothActionProgress(track);
  const queued = matchingLeaves(host, text => text === 'queued')[0];
  let cur = queued?.parentElement;
  for (let depth = 0; cur && cur !== host && depth < 3; depth += 1, cur = cur.parentElement) {
    if (cur.querySelector(GAME_CONTROL) && normText(cur.textContent).length > 6) {
      setPanelPart(cur, 'queue');
      break;
    }
  }
}

function classifyActionLog(host) {
  const control = [...host.querySelectorAll(GAME_CONTROL + ',a')]
    .find(el => /^view\s+all$/i.test(normText(el.textContent)));
  setPanelPart(control, 'panel-control');
  classifyFeed(host);
}

function classifyWorldChat(host) {
  const input = [...host.querySelectorAll('input,textarea')]
    .find(el => /message\s+world\s+chat/i.test(el.getAttribute('placeholder') || ''));
  setPanelPart(input, 'chat-input');
  if (input) {
    let composer = input.parentElement;
    for (let depth = 0; composer && composer !== host && depth < 3; depth += 1, composer = composer.parentElement) {
      const send = [...composer.querySelectorAll('button')]
        .find(el => /^send$/i.test(normText(el.textContent)));
      if (!send) continue;
      setPanelPart(composer, 'composer');
      setPanelPart(send, 'send');
      break;
    }
  }
  classifyFeed(host);
}

// Only the HOST identity (which element is the Current Action / Action Log
// / World Chat panel) is cached -- that pairing is stable once resolved. The
// per-tick content inside it (feed rows, queue, progress %) is never cached
// here; runActivityPanel() below always re-runs against the resolved host.
let activityPanelResolutions = null;

function activityPanelResolutionValid(entry) {
  // Unlike sectionFrame/bossPanel above, this classifier's OWN coverage check
  // (classifyActivityPanels below) is keyed by PANEL SLUG, not by label node
  // identity — "is there still some resolution for 'current-action'" stays
  // true even when the live label has moved to the other layout column. So
  // the epoch check here is load-bearing, not defense-in-depth: without it a
  // resize would leave every activity panel permanently bound to whichever
  // column was live at first resolve.
  return entry.epoch === getLayoutEpoch() &&
    entry.heading.isConnected && entry.host.isConnected &&
    entry.host.dataset.iwUi === 'section-frame' &&
    entry.host.dataset.iwPanel === entry.panel &&
    entry.host.contains(entry.heading);
}

function runActivityPanel(entry) {
  const { host, heading, panel } = entry;
  classifyPanelHeader(host, heading);
  if (panel === 'current-action') classifyCurrentAction(host);
  else if (panel === 'action-log') classifyActionLog(host);
  else classifyWorldChat(host);
}

/**
 * {node, panel} title nodes for the activity panels. IdleWorlds does not
 * always use a semantic heading here:
 *   1. a real <h1-4> / [role=heading];
 *   2. a leaf element whose whole text is exactly a panel label;
 *   3. (only for a still-missing panel) an element that holds the label as a
 *      bare direct text node alongside sibling controls — Action Log's title
 *      is a bare text node inside a `<button>` that also wraps a nested
 *      "view all" span, with the XP/hr readout as a sibling.
 * The game ships each of these labels twice below Tailwind's `xl` breakpoint
 * (see CLAUDE.md's hidden-duplicate trap and Viewport.js); collectAndFilter()
 * below keeps only the copy that is actually rendering, per label slug, so
 * this works whichever column is currently live rather than assuming it is
 * always the wide one.
 */
function activityPanelLabelNodes() {
  const seen = new Set();
  const collected = [];
  const push = (el, panel) => {
    if (!el || !panel || seen.has(el)) return;
    seen.add(el);
    collected.push({ node: el, panel });
  };

  for (const el of document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')) {
    push(el, ACTIVITY_PANELS.get(normText(el.textContent).toLowerCase()));
  }
  for (const el of document.querySelectorAll('p,span,div,strong,b')) {
    if (el.childElementCount === 0) push(el, ACTIVITY_PANELS.get(normText(el.textContent).toLowerCase()));
  }

  // Tier 4, and the only one that does not read the label's TEXT.
  //
  // Reading the live app bundle (2026-09) turned up exactly one stable hook on
  // this whole surface: the game renders Current Action as
  // `<div id="current-action-panel" className="panel …">`. Everything else in
  // IdleWorlds is anonymous Tailwind utilities, which is why every classifier
  // in this file is a text heuristic and why a relabel keeps costing a whole
  // surface — "🧭 Zone 19", "🌐 Zones" and "⚔️ Combat Lv" have each done it.
  //
  // So when the text passes above have NOT found Current Action, fall back to
  // the id and take that panel's own first short leaf as the label node. This
  // is deliberately last: when the label still reads "Current Action" nothing
  // here runs, so the ordinary path is untouched. `getElementById` is O(1) but
  // returns only the FIRST match in document order, which is exactly wrong if
  // the id is duplicated across the two layout columns the way every other
  // hook on this surface is (CLAUDE.md's hidden-duplicate trap) — it would
  // pin the wide copy's id forever, even below 1280px. This only runs on the
  // miss path, so the extra `querySelectorAll` here does not touch the flush
  // budget.
  const haveBeforeId = new Set(collected.map(o => o.panel));
  if (!haveBeforeId.has('current-action')) {
    const byId = pickRendered([...document.querySelectorAll('[id="current-action-panel"]')]);
    if (byId) {
      const label = [...byId.querySelectorAll('h1,h2,h3,h4,[role="heading"],p,span,div,strong,b')]
        .find(el => el.childElementCount === 0 && normText(el.textContent).length > 0 &&
          normText(el.textContent).length <= 40);
      push(label || byId, 'current-action');
    }
  }

  const have = new Set(collected.map(o => o.panel));
  if (have.size < ACTIVITY_PANELS.size) {
    for (const el of document.querySelectorAll('div,header,section,h2,h3,h4,span,p,button,a')) {
      if (seen.has(el)) continue;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3) continue;
        const panel = ACTIVITY_PANELS.get(normText(n.textContent).toLowerCase());
        if (panel && !have.has(panel)) { push(el, panel); break; }
      }
    }
  }

  // Below 1280px each slug can carry up to two candidates — one per layout
  // column (see the file comment above). Keep only the one actually
  // rendering, per slug, with the same tie-break every other classifier here
  // uses (Viewport.preferRendered): filter to rendered when some ARE
  // rendered, otherwise keep them all so a layout-less test DOM still
  // resolves. classifyActivityPanels()'s own host-dedup below is unaffected
  // either way.
  const byPanel = new Map();
  for (const entry of collected) {
    if (!byPanel.has(entry.panel)) byPanel.set(entry.panel, []);
    byPanel.get(entry.panel).push(entry);
  }
  const out = [];
  for (const entries of byPanel.values()) {
    const picked = new Set(preferRendered(entries.map(e => e.node)));
    for (const entry of entries) if (picked.has(entry.node)) out.push(entry);
  }
  return out;
}

function classifyActivityPanels() {
  // FAST PATH — provably equivalent to the coverage check below, and the reason
  // this file stopped being the most expensive thing on the flush path.
  //
  // activityPanelLabelNodes() is a whole-document `p,span,div,strong,b` sweep
  // (plus a second `div,header,section,…` pass whenever a slug is missing). It
  // ran BEFORE the cache check on every single flush — the identical mistake
  // CLAUDE.md records for InventoryRenderer.findInventoryRoot, and measured at
  // 185ms of a 386ms profile at 13k nodes, i.e. about half of everything the
  // skin still cost once the flush loop was fixed.
  //
  // It is skippable because coverage here is keyed by SLUG, not by host (a
  // known limitation CLAUDE.md already documents), and ACTIVITY_PANELS holds
  // exactly three of them. So once every slug has a valid entry, `wantSlugs`
  // is necessarily a subset of what is already resolved, whatever the scan
  // returns — the early return below would fire regardless. Scanning first only
  // paid for the answer we already had.
  //
  // While ANY slug is still unresolved the scan must run in full: that is the
  // route-swap case, and the empty-resolution freeze CLAUDE.md warns about
  // lives exactly there.
  if (activityPanelResolutions
      && activityPanelResolutions.every(activityPanelResolutionValid)
      && ACTIVITY_PANEL_SLUGS.every(slug => activityPanelResolutions.some(e => e.panel === slug))) {
    activityPanelResolutions.forEach(runActivityPanel);
    return;
  }

  const labels = activityPanelLabelNodes();
  const wantSlugs = new Set(labels.map(l => l.panel));

  if (activityPanelResolutions
      && activityPanelResolutions.every(activityPanelResolutionValid)
      && [...wantSlugs].every(slug => activityPanelResolutions.some(e => e.panel === slug))) {
    activityPanelResolutions.forEach(runActivityPanel);
    return;
  }

  // Drop marks from the previous (possibly stale) resolution — same reason
  // classifySectionFrames does this. Without it, a resize that moves a panel
  // from the wide host to the narrow one leaves the now-hidden wide host
  // permanently wearing `data-iw-ui="section-frame"` / `data-iw-panel`, which
  // is at best dead weight and at worst confuses a future :has()/coverage
  // check that assumes those attributes mean "the live panel".
  if (activityPanelResolutions) {
    for (const e of activityPanelResolutions) {
      if (e.host.dataset.iwUi === 'section-frame') delete e.host.dataset.iwUi;
      if (e.heading.dataset.iwUi === 'section-title') delete e.heading.dataset.iwUi;
      delete e.host.dataset.iwPanel;
    }
  }

  activityPanelResolutions = [];
  for (const { node: heading, panel } of labels) {
    const host = findActivityPanelHost(heading, panel);
    if (!host) continue;
    // A different label already framed this exact host (a semantic heading and
    // a leaf label that both resolve to the same panel).
    if (activityPanelResolutions.some(e => e.host === host)) continue;
    setRole(host, 'section-frame');
    setRole(heading, 'section-title');
    setPanel(host, panel);
    const entry = { heading, host, panel, epoch: getLayoutEpoch() };
    activityPanelResolutions.push(entry);
    runActivityPanel(entry);
  }
}

let queued = false;
function queueClassify() {
  if (queued) return;
  queued = true;
  raf(() => {
    queued = false;
    // Invalidate the per-pass memos (headingIndex) so this pass reads the DOM
    // as it is NOW. Everything below runs synchronously inside this callback,
    // which is what makes one shared index correct for all of them.
    beginClassifyPass();
    // Each classifier is isolated: a throw inside classifyMainNav() must not
    // stop the zone bar and section frames from being classified. (Audit S3.7)
    guard('ui:main-nav', classifyMainNav);
    guard('ui:zone-bar', classifyZoneBar);
    // Activity panels first: they own `section-frame` on their own hosts, which
    // are `.panel`s, so classifySectionFrames has to see `data-iw-panel` already
    // set to leave them alone. Boss cards stay AFTER section frames -- they read
    // sectionFrameResolutions as their root fallback.
    guard('ui:activity-panels', classifyActivityPanels);
    guard('ui:section-frames', classifySectionFrames);
    guard('ui:boss-cards', classifyBossCards);
    guard('ui:market', classifyMarket);
    guard('ui:village', classifyVillagePanels);
    // `guard` only catches SYNCHRONOUSLY; this pass awaits a network read, so
    // the rejection has to be caught on the promise or a failed read surfaces
    // as an unhandled rejection in the game's own console.
    guard('ui:village-scene', () => {
      reconcileVillageScene().catch(err => warnOnce('ui:village-scene', err));
    });
    guard('ui:compact-buttons', decorateCompactButtons);
    // LAST: it reads the marks every classifier above writes — which frames are
    // leaves, which host is an activity panel, and where each title landed.
    guard('ui:collapsible', () => decorateCollapsibleFrames(document));
    // AFTER collapsible: the panel identity falls back to `data-iw-panel`
    // for Action Log, which ships no heading of its own, so the order pass
    // has to run once every classifier above has had its say.
    guard('ui:panel-order', () => decoratePanelOrder(document));
  });
}

/** Remove every semantic role attribute this module applied. Kill switch. */
export function clearUIFoundation() {
  clearPanelOrder(document);
  clearCollapsibleFrames(document);
  clearVillageScene();
  clearCompactButtons();
  // Drop the per-pass memo with everything else, so a kill-switch round trip
  // cannot hand the next activation a heading list from the previous one.
  headingIndexToken = -1;
  headingIndexValue = null;
  clearWorldBossPanel(document);
  clearVillagePanel(document.body);
  villageResolutions = null;
  villageSeen = new Set();
  mainNavResolution = null;
  // The skin's own appended control: removed outright, not just stripped of
  // its attributes, so the kill switch leaves the rail exactly as React wrote it.
  document.querySelectorAll('[data-iw-nav-link]').forEach(el => { el.remove(); });
  zoneBarResolutions = null;
  sectionFrameResolutions = null;
  sectionFrameSeen = new Set();
  bossPanelResolutions = null;
  bossPanelSeen = new Set();
  marketResolutions = null;
  marketSeen = new Set();
  activityPanelResolutions = null;
  progressSamples = new WeakMap();
  // The measured duration is the ONLY inline property this module ever
  // writes, so it is removed directly rather than routed through
  // InlineStyleOwner — there is no native value to restore underneath it.
  document.querySelectorAll('[data-iw-panel-part="progress"]')
    .forEach(el => { el.style.removeProperty('--iw-progress-duration'); });
  document.querySelectorAll('[data-iw-progress-reset]').forEach(el => { delete el.dataset.iwProgressReset; });
  document.querySelectorAll('[data-iw-ui]').forEach(el => { delete el.dataset.iwUi; });
  document.querySelectorAll('[data-iw-tab]').forEach(el => { delete el.dataset.iwTab; });
  document.querySelectorAll('[data-iw-state]').forEach(el => { delete el.dataset.iwState; });
  document.querySelectorAll('[data-iw-panel]').forEach(el => { delete el.dataset.iwPanel; });
  document.querySelectorAll('[data-iw-panel-part]').forEach(el => { delete el.dataset.iwPanelPart; });
  document.querySelectorAll('[data-iw-panel-header]').forEach(el => { delete el.dataset.iwPanelHeader; });
  document.querySelectorAll('[data-iw-zone-action]').forEach(el => { delete el.dataset.iwZoneAction; });
  document.querySelectorAll('[data-iw-boss]').forEach(el => { delete el.dataset.iwBoss; });
  document.querySelectorAll('[data-iw-market]').forEach(el => { delete el.dataset.iwMarket; });
}

// Both activation and standalone initialization must install the same complete
// sheet. StyleInjector keeps the first sheet for an id and ignores later calls.
export function injectUIFoundationStyles() {
  inject('ui-system', css + '\n' + compactCss + '\n' + villageSceneCss + '\n' + collapsibleCss + '\n' + panelOrderCss);
}

export function initUIFoundation() {
  injectUIFoundationStyles();
  on('iw:dom-flush', queueClassify);
  // Native title/button text ticks deliberately do not emit dom-flush.
  // Reconcile only the already-resolved boss panel through the shared watcher.
  on('iw:skill-panel', event => {
    const panel = event.detail?.panel;
    if (!panel) return;
    const entry = (bossPanelResolutions || []).find(entry =>
      bossPanelResolutionValid(entry) && entry.root.contains(panel));
    if (entry) guard('ui:boss-state', () => decorateWorldBossPanel(entry));
  });
  queueClassify();
}
