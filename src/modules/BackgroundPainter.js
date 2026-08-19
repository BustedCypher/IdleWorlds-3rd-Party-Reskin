/**
 * BackgroundPainter
 *
 * Reconciles only colours that match the game's known navy palette. Nodes
 * are intentionally NOT treated as permanently processed: React can reuse
 * the same element and later write a stock background back onto it.
 *
 * NOTE (Audit S2.2): the surface gate below — depth-2 from <body> plus an
 * exact-hex whitelist — is the main reason the skin stops at a boundary on
 * deeper React trees. Replacing it with a luminance-based classifier is
 * Phase 2 work; this pass only fixes the border parsing and adds teardown.
 */

import { warnOnce } from './Runtime.js';

const GAME_NAVIES = new Set([
  '#0f172a', '#111827', '#131d28', '#131e28', '#131d27',
  '#141e28', '#121d27', '#121c27', '#121d28', '#1a2030',
  '#1b231f', '#191f1d', '#162920', '#111c24', '#0f1923',
  '#111926', '#0d1a24', '#131b26', '#12202d', '#1c2940',
]);

const SURFACE_SELECTOR = [
  '.compact-panel',
  '.compact-row',
  '[class*="item-row"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  'main',
  'section',
  'article',
  'aside',
  'header',
  'nav',
].join(', ');

function ourColour(gameHex) {
  const r = parseInt(gameHex.slice(1, 3), 16);
  const g = parseInt(gameHex.slice(3, 5), 16);
  const b = parseInt(gameHex.slice(5, 7), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum < 12) return '#0B0C0A';
  if (lum < 20) return '#14130F';
  if (lum < 28) return '#191711';
  return '#1E1B15';
}

function normHex(colour) {
  if (!colour || colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)') return null;
  const m = colour.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function ownedTree(el) {
  return el.closest?.('.fs-inv-row, .fs-skill-header, .iw-tip') || null;
}

function shouldSkip(el) {
  if (!el || el.nodeType !== 1) return true;
  if (['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'HTML'].includes(el.tagName)) return true;
  if (el.classList.contains('fs-skill-wrapper')) return true;
  if (ownedTree(el)) return true;
  return false;
}

function isSurfaceCandidate(el) {
  if (el === document.body) return true;
  if (el.matches?.(SURFACE_SELECTOR)) return true;

  // Root application shells are often plain divs. Paint only the first two
  // layers beneath body; do not recursively classify every text wrapper as a
  // surface just because it happens to have a navy computed background.
  const parent = el.parentElement;
  if (parent === document.body) return true;
  if (parent?.parentElement === document.body && el.children.length > 1) return true;
  return false;
}

function setImportant(el, prop, value) {
  if (el.style.getPropertyValue(prop) === value && el.style.getPropertyPriority(prop) === 'important') return false;
  el.style.setProperty(prop, value, 'important');
  return true;
}

function paintElement(el) {
  if (shouldSkip(el) || !isSurfaceCandidate(el)) return false;
  let changed = false;
  const style = getComputedStyle(el);

  const bg = normHex(style.backgroundColor);
  if (bg && GAME_NAVIES.has(bg)) {
    changed = setImportant(el, 'background-color', ourColour(bg)) || changed;
  }

  // `border-color` computes to a single value only when all four sides agree.
  // When they differ Chrome returns a multi-value string, which the single-rgb
  // regex in normHex() rejected — so mixed-border panels silently never got the
  // brass edge. Check each side, and repaint whichever sides are game navy.
  // (Audit S2.2)
  const sides = ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
  const sideProps = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
  for (let i = 0; i < sides.length; i += 1) {
    const hex = normHex(style[sides[i]]);
    if (hex && GAME_NAVIES.has(hex)) {
      changed = setImportant(el, sideProps[i], '#342D20') || changed;
    }
  }

  if (changed && el.dataset.iwPainted !== '1') el.dataset.iwPainted = '1';
  return changed;
}

export function paintBackground(root = document.body) {
  if (!root) return 0;
  let changed = 0;

  try {
    if (root.nodeType === 1 && paintElement(root)) changed += 1;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (paintElement(node)) changed += 1;
    }
  } catch (err) {
    warnOnce('background:paint', err);
  }
  return changed;
}

/** Undo every repaint this module performed. Kill switch. */
export function clearBackgroundPaint() {
  const props = [
    'background-color',
    'border-color',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  ];
  document.querySelectorAll('[data-iw-painted="1"]').forEach(el => {
    for (const prop of props) el.style.removeProperty(prop);
    delete el.dataset.iwPainted;
  });
}
