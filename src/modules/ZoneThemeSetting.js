/** Presentation only: preserve native controls, text, state and handlers. */
/**
 * ZoneThemeSetting.js — the player's "Zone themes" switch (Curtis, 2026-10-08).
 *
 * On (the default), the skin themes every page to the player's zone: the
 * per-zone header painting and one of nine environment palettes. Off, every
 * route renders the stock "Ashen Iron" theme instead. HeaderRenderer's
 * `presentationZoneNumber()` asks `zoneThemesEnabled()` and returns null when
 * it is off — the same path the Village route already takes — so the header
 * art, `data-iw-zone-theme` and the atlas/corner/separator variables all fall
 * back together. The cached zone (`lastZoneNumber`) is kept, so switching back
 * on restores the zone at once.
 *
 * The switch is the skin's own `<label>` + checkbox, APPENDED to the row that
 * holds the game's Zones / Next Zone buttons (rule 2), so it lives on the Game
 * route like the zone bar itself. A checkbox, not a <button>: the generic
 * `button:not(…)` rules in base.css / ui-system.css never reach it, and it is
 * invisible to classifyZoneBar's `querySelectorAll('button')` sweep. It is
 * never placed directly in the zone bar, whose exactly-two-children shape
 * HeaderChrome depends on. Own namespace: `data-iw-theme-toggle`.
 *
 * The choice persists in chrome.storage (`iw-zone-themes`, false = off) and
 * follows changes made in another tab.
 */

import { storageGet, storageSet, onStorageChanged, guard } from './Runtime.js';

const KEY = 'iw-zone-themes';
const ATTR = 'data-iw-theme-toggle';

let enabled = true;
let onChange = null;
let unsubscribe = null;

export function zoneThemesEnabled() {
  return enabled;
}

function syncInputs() {
  for (const input of document.querySelectorAll(`[${ATTR}] input`)) {
    if (input.checked !== enabled) input.checked = enabled;
  }
  for (const label of document.querySelectorAll(`[${ATTR}]`)) {
    const state = enabled ? 'on' : 'off';
    if (label.getAttribute(ATTR) !== state) label.setAttribute(ATTR, state);
  }
}

function setEnabled(value, persist) {
  const next = value !== false;
  if (next === enabled) return;
  enabled = next;
  syncInputs();
  if (persist) storageSet(KEY, enabled);
  // A <html> attribute / inline-var change carries no flush (CLAUDE.md), so
  // the owner re-runs its own pass.
  guard('zone-theme-setting:change', () => onChange?.());
}

/** Read the stored choice and follow other tabs. `changed` re-applies the theme. */
export async function initZoneThemeSetting(changed) {
  onChange = changed;
  unsubscribe?.();
  unsubscribe = onStorageChanged(KEY, value => setEnabled(value, false));
  const stored = await storageGet(KEY);
  setEnabled(stored, false);
}

function buildToggle() {
  const label = document.createElement('label');
  label.setAttribute(ATTR, enabled ? 'on' : 'off');
  label.title = 'Zone themes: match the skin to your zone. Off uses the standard Ashen Iron theme everywhere.';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = enabled;
  input.addEventListener('change', () => setEnabled(input.checked, true));
  const track = document.createElement('span');
  track.className = 'iw-theme-toggle-track';
  track.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'iw-theme-toggle-text';
  text.textContent = 'Zone themes';
  label.append(input, track, text);
  return label;
}

/** Every pass: one switch at the end of each zone bar's action row. */
export function ensureZoneThemeToggle() {
  for (const bar of document.querySelectorAll('[data-iw-ui="zone-bar"]')) {
    const row = bar.querySelector('[data-iw-ui="zone-action"]')?.parentElement;
    if (!row || row === bar) continue;
    if (!row.querySelector(`:scope > [${ATTR}]`)) row.append(buildToggle());
  }
}

export function clearZoneThemeSetting() {
  document.querySelectorAll(`[${ATTR}]`).forEach(el => el.remove());
  unsubscribe?.();
  unsubscribe = null;
  onChange = null;
  enabled = true;
}
