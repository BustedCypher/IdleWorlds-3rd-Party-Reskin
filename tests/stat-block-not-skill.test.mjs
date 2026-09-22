/**
 * A control-less stat block is never a skill card.
 *
 * Character Stats' "Lifetime Stats" is a `.compact-panel` of label/value rows
 * and no buttons. DOMWatcher's anchored label fallback matched "Wood Chopped"
 * against `^wood\s` and reported it as `woodcutting`, so SkillPanelRenderer
 * painted it as a skill card: gold accent, different ground, and "Wood
 * Chopped" promoted to the card title (reported 2026-09-22). Markup below is
 * the deployed bundle's (chunk 4872: `compact-panel p-3 space-y-1.5`), with no
 * whitespace between elements, as React emits it.
 *
 * Drives the REAL DOMWatcher. Positive control: a Woodcutting card with a Chop
 * button still reports `woodcutting`, and so does one identified only by its
 * label fallback (a "Wood" heading plus a non-verb control). Removing the
 * button guard fails the first assertion.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const compiled = await build({
  stdin: { contents: "export { startWatcher, stopWatcher } from './src/modules/DOMWatcher.js';", resolveDir: ROOT },
  bundle: true, write: false, format: 'iife', globalName: 'Watch', loader: { '.css': 'text' },
});

const row = (label, value) => `<div class="flex items-center justify-between"><p class="text-xs text-white/70">${label}</p><p class="text-xs font-semibold text-white">${value}</p></div>`;
const LIFETIME = `<div class="compact-panel p-3 space-y-1.5" id="lifetime"><p class="text-[11px] font-semibold uppercase tracking-wide text-white/40">Lifetime Stats</p>`
  + row('⚔️ Monsters Defeated', '13,597') + row('⛏️ Ore Mined', '162,428') + row('🪓 Wood Chopped', '88,999')
  + row('🧱 Building Parts Crafted', '15,159') + row('🏗️ Buildings Assembled', '1') + row('📋 Work Orders Turned In', '3,991')
  + `</div>`;
const CHOP = `<div class="compact-panel" id="chop"><h3>Woodcutting</h3><p>Oak Log</p><button>Chop</button></div>`;
const LABEL_ONLY = `<div class="compact-panel" id="label-only"><p>Wood Cutting</p><p>Oak Log</p><button>Start</button></div>`;

const dom = new JSDOM('<!doctype html><html data-iw-page-hydrated="1"><head></head><body><main id="root"></main></body></html>', {
  url: 'https://idleworlds.com/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const { window } = dom;
window.eval(compiled.outputFiles[0].text);

const seen = new Map();
window.document.addEventListener('iw:skill-panel', e => seen.set(e.detail.panel.id, e.detail.skill));
window.Watch.startWatcher();
window.document.getElementById('root').innerHTML = LIFETIME + CHOP + LABEL_ONLY;
await new Promise(r => setTimeout(r, 300));

assert.equal(seen.get('lifetime'), 'unknown', 'Lifetime Stats (no controls) is not a Woodcutting card');
assert.equal(seen.get('chop'), 'woodcutting', 'positive control: a Chop card is still Woodcutting');
assert.equal(seen.get('label-only'), 'woodcutting', 'positive control: the label fallback still works on a card with a control');

window.Watch.stopWatcher();
window.close();
console.log('PASS stat-block-not-skill');
