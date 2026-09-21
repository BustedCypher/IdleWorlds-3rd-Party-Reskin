/**
 * Quest cards must be recognised on markup with NO whitespace between elements.
 *
 * QuestPanelRenderer.isQuestCard opens with a cheap prefilter over the card's
 * flattened `textContent`. That string joins sibling elements with no
 * separator, and React's production markup has no whitespace text nodes, so a
 * live card reads "...+900 smithing XPTurn InSkip0% complete". The prefilter
 * was `\bturn\s*in\b` / `\d+%\s*complete\b`: no word boundary exists at those
 * joins, so a real quest card was rejected unless "N% complete" happened to be
 * its last text. Every other fixture in this repo indents its markup, which
 * inserts the whitespace React does not - found 2026-09-17 by loading the
 * unpacked extension against a compact fixture.
 *
 * Drives the REAL module through the same `iw:skill-panel` event DOMWatcher
 * emits. Negative controls: a compact-panel that merely contains "return
 * into" (no reward line, no quest control) must stay untouched, and restoring
 * the `\b` gate fails the first check.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const compiled = await build({
  stdin: { contents: "export { initQuestPanelRenderer, clearQuestPanels } from './src/modules/QuestPanelRenderer.js';", resolveDir: ROOT },
  bundle: true, write: false, format: 'iife', globalName: 'Quest', loader: { '.css': 'text' },
});

// Whitespace-free, in the live card's element order: text column, controls,
// progress bar, then the percent line.
const CARDS = `<div class="panel"><div><h2>Quests</h2></div><div class="space-y-2">`
  + `<div class="compact-panel" id="no-percent-last"><div class="space-y-2"><div><div><p>Tailoring Work Order</p><p>Craft 1 Moonsilk Boots for the tailor.</p><p>Moonsilk Boots 0/1</p><p>Reward: +3,870g • +3240 tailoring XP</p></div><div><button>Turn In</button><button>Skip (0)</button></div></div><p id="skip-note">Out of skips - they reset daily at 00:00 UTC, or completing (not skipping) a work order refills them to your daily max right away.</p><div class="h-1.5 rounded-full"><div style="width: 0%"></div></div><div>0% complete</div><p>Expires in 3h</p></div></div>`
  + `<div class="compact-panel" id="turn-in-only"><div><p>Night Claw Bounty</p><p>Reward: +3,225g • +1350 combat XP</p></div><div><button>Turn In</button></div><p>Ready</p></div>`
  + `<div class="compact-panel" id="not-a-quest"><p>Return into town to rest.</p><button>Rest</button></div>`
  + `</div></div>`;

const dom = new JSDOM(`<!doctype html><html><head></head><body>${CARDS}</body></html>`, {
  url: 'https://idleworlds.com/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const { window } = dom;
window.fetch = () => Promise.reject(new Error('offline fixture'));
window.eval(compiled.outputFiles[0].text);
window.Quest.initQuestPanelRenderer();

const doc = window.document;
for (const card of doc.querySelectorAll('.compact-panel')) {
  doc.dispatchEvent(new window.CustomEvent('iw:skill-panel', { detail: { panel: card, skill: 'unknown', reason: 'reconcile' } }));
}
await new Promise(r => setTimeout(r, 50));

const isQuest = id => doc.getElementById(id).classList.contains('fs-quest-panel');
assert.equal(isQuest('no-percent-last'), true,
  'a whitespace-free card whose "% complete" is NOT its last text is still a quest');
assert.equal(isQuest('turn-in-only'), true,
  'a whitespace-free card with a Turn In control and no percent line is still a quest');
assert.equal(isQuest('not-a-quest'), false,
  'negative control: "return into" text with no reward line is not a quest');

const skipNote = doc.getElementById('skip-note');
assert.equal(skipNote.getAttribute('data-iw-quest-role'), 'skip-note',
  'the Out of skips helper receives its own semantic role, not brief');
assert.notEqual(skipNote.getAttribute('data-iw-quest-role'), 'brief',
  'the helper never inherits main-column brief typography');
const body = doc.getElementById('no-percent-last').querySelector('[data-iw-quest-zone="body"]');
let skipHost = skipNote;
while (skipHost?.parentElement && skipHost.parentElement !== body) skipHost = skipHost.parentElement;
assert.ok(body && skipHost && skipHost.parentElement === body,
  'fixture resolves a direct helper host under the quest body');
assert.equal(skipHost.getAttribute('data-iw-quest-zone'), 'skip-note',
  'the direct helper host owns the full-width skip-note grid zone');

window.Quest.clearQuestPanels();
assert.equal(doc.querySelectorAll('.fs-quest-panel').length, 0, 'teardown clears every card');
console.log('PASS quest card detection on whitespace-free markup');
