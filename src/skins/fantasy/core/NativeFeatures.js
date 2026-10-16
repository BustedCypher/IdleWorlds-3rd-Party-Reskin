/**
 * NativeFeatures — does the game's own Fantasy theme already ship a feature?
 *
 * The live `data-skin="fantasy"` theme IS the skin, ported natively (its
 * `/reskin-bc/theme/fantasy.css`; capture 2026-10-15). Fantasy features that
 * repeat a Legacy feature the port does not have yet must stand down the
 * moment the developer wires that feature in, or the page gets two banners,
 * two pop-ups, and two writers on one attribute (CLAUDE.md, Ownership).
 *
 * The signal is the PORT'S STYLESHEETS: a feature is native when any sheet
 * that is not Fantasy's own carries one of its selector tokens. CSS is the
 * one thing a native feature cannot ship without, and unlike DOM markers it
 * cannot be confused with what Fantasy itself wrote. Sheets the CSSOM refuses
 * to read (cross-origin fonts) are skipped.
 *
 * The scan walks ~3,000 rules, so it runs only when the set of sheets or
 * their rule counts change; every other call is a signature compare.
 */

import { STYLE_ATTR } from './StyleInjector.js';

/** feature -> selector tokens that only that feature's CSS contains. */
export const FEATURE_TOKENS = {
  lobby: ['data-iw-guild-slot', 'iw-rc-popup', 'iw-guild-records'],
  bossCard: ['data-iw-boss-card', 'iw-bc-'],
  leaderboard: ['iw-raid-lb'],
  result: ['data-iw-raid-result'],
  // The skill sheet and the work-order board are the GAME'S own markup (its
  // `.iw-ss-*` / `.iw-wo-*` classes, 2026-10-16), and the game's stock CSS
  // already names them. So these count only in the port's Fantasy theme
  // sheet: the day that sheet styles them, the port has taken them over.
  skillSheet: { sheet: /\/reskin-bc\//, tokens: ['.iw-ss-', '.iw-skill-tab'] },
  workOrders: { sheet: /\/reskin-bc\//, tokens: ['.iw-wo-'] },
};

const tokensOf = spec => (Array.isArray(spec) ? spec : spec.tokens);
const sheetAllowed = (spec, href) => Array.isArray(spec) || spec.sheet.test(href || '');

let signature = null;
let native = new Set();

function ownSheet(sheet) {
  return !!sheet.ownerNode?.hasAttribute?.(STYLE_ATTR);
}

function sheetsSignature() {
  const parts = [];
  for (const sheet of document.styleSheets) {
    if (ownSheet(sheet)) continue;
    let count = -1;
    try { count = sheet.cssRules.length; } catch { /* cross-origin */ }
    parts.push(`${sheet.href || 'inline'}#${count}`);
  }
  return parts.join('|');
}

function scan() {
  const found = new Set();
  const walk = (rules, tokens) => {
    for (const rule of rules) {
      const sel = rule.selectorText;
      if (sel) for (const [feature, spec] of tokens) if (!found.has(feature) && tokensOf(spec).some(t => sel.includes(t))) found.add(feature);
      // Recurse only into rules that HAVE children: a plain style rule's
      // cssRules is truthy and empty (CLAUDE.md, verification discipline).
      if (rule.cssRules && rule.cssRules.length > 0) walk(rule.cssRules, tokens);
    }
  };
  for (const sheet of document.styleSheets) {
    if (ownSheet(sheet)) continue;
    const tokens = Object.entries(FEATURE_TOKENS).filter(([, spec]) => sheetAllowed(spec, sheet.href));
    if (!tokens.length) continue;
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    walk(rules, tokens);
  }
  return found;
}

/** The features the port already ships. Cheap unless the sheets changed. */
export function nativeFeatures() {
  const sig = sheetsSignature();
  if (sig !== signature) {
    signature = sig;
    native = scan();
  }
  return native;
}

export function resetNativeFeatures() {
  signature = null;
  native = new Set();
}
