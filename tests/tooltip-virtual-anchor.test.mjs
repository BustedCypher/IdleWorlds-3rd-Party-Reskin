/**
 * TooltipEngine: leaving the card while it is open on a VIRTUAL anchor.
 *
 * NameScanner opens the item card on a virtual anchor - a rect provider, not a
 * DOM node - because it annotates the game's prose without wrapping it. The
 * card's `mouseleave` handler asked `nodeInside(STATE.anchor, relatedTarget)`,
 * which calls `anchor.contains()`; a virtual anchor has none, so hovering an
 * item name, moving onto the card and off it again threw
 * "TypeError: root.contains is not a function" (live console, 2026-09-16) and
 * skipped `hide()`. The sibling `focusout` handler already guarded this.
 *
 * Checks: no throw, the card closes when the pointer leaves for somewhere that
 * is not the anchor, and it stays open when the pointer returns onto the
 * anchor's rect (the virtual equivalent of "moved back to the trigger").
 * Negative control: run against the pre-fix module and the first check fails.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const compiled = await build({
  stdin: { contents: "export * from './src/modules/TooltipEngine.js';", resolveDir: ROOT },
  bundle: true, write: false, format: 'iife', globalName: 'Tip', loader: { '.css': 'text', '.json': 'json' },
});
const dom = new JSDOM('<!doctype html><body><p id="prose">A Night Claw lies here.</p></body>', {
  runScripts: 'outside-only', pretendToBeVisual: true,
});
const { window } = dom;
window.chrome = { runtime: { id: 'test', getURL: p => p }, storage: { local: { get: async () => ({}), set: async () => {} } } };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.eval(compiled.outputFiles[0].text);
const { initTooltipEngine, showForItem, isTooltipOpen } = window.Tip;

const errors = [];
window.addEventListener('error', e => errors.push(e.error?.message || e.message));
initTooltipEngine();

const ANCHOR = { left: 10, top: 10, right: 90, bottom: 30, width: 80, height: 20 };
const item = { item_id: 'night_claw', name: 'Night Claw', category: 'Material' };
const flush = () => new Promise(r => setTimeout(r, 50));
const mouse = (target, type, init) => target.dispatchEvent(new window.MouseEvent(type, { bubbles: type !== 'mouseleave', ...init }));

async function openOnVirtualAnchor() {
  mouse(window.document.body, 'mousemove', { clientX: 20, clientY: 20 });
  showForItem(item, () => ANCHOR, 'name-scan');
  await flush();
  const card = window.document.querySelector('iw-tip, #iw-tip, .iw-tip');
  assert.ok(card, 'the tooltip card element exists');
  assert.equal(isTooltipOpen(), true, 'the card opened on the virtual anchor');
  return card;
}

/* 1. Leave the card for the page: must not throw, must close. */
{
  const card = await openOnVirtualAnchor();
  mouse(window.document.body, 'mousemove', { clientX: 400, clientY: 400 });
  errors.length = 0;
  let thrown = null;
  try { mouse(card, 'mouseleave', { relatedTarget: window.document.body, clientX: 400, clientY: 400 }); }
  catch (e) { thrown = e; }
  assert.equal(thrown?.message ?? errors[0] ?? null, null, 'leaving the card on a virtual anchor does not throw');
  await flush();
  assert.equal(isTooltipOpen(), false, 'leaving the card for the page closes it');
}

/* 2. Leave the card back onto the anchor's rect: stays open. */
{
  const card = await openOnVirtualAnchor();
  errors.length = 0;
  mouse(card, 'mouseleave', { relatedTarget: window.document.getElementById('prose'), clientX: 20, clientY: 20 });
  await flush();
  assert.deepEqual(errors, [], 'no error when returning to the anchor');
  assert.equal(isTooltipOpen(), true, 'returning onto the virtual anchor keeps the card open');
}

console.log('tooltip-virtual-anchor: leaving the card on a virtual anchor closes it without throwing; returning to the anchor keeps it open');
