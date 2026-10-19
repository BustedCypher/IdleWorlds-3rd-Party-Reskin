/**
 * Raid art over the native inventory renderer. The port owns its rows, item
 * sprites, item tooltips and gameplay controls; Fantasy reads their identity
 * and adds only its own attributes and passive RAID badge.
 */
import { findRaidGear } from '../core/RaidGear.js';
import { mark, unmark, ownerOf, removeOwned } from '../core/dom.js';
import { inject, remove } from '../core/StyleInjector.js';
import css from '../styles/raid-gear.css';

const ROOT = '[data-iw-inventory-root="1"]';
const ROW = '.fs-inv-row';
const GEAR = 'data-iw-fantasy-raid-gear';
const SHELL = 'data-iw-fantasy-raid-shell';
const BADGE = 'data-iw-fantasy-raid-badge';
const own = ownerOf(BADGE);
const decorated = new Map(); // native overlay -> its native row shell

function clear(row, host) {
  mark(row, GEAR, null);
  mark(host, SHELL, null);
  removeOwned(BADGE, row);
  decorated.delete(row);
}

function decorate(row) {
  const host = row.parentElement;
  if (!host?.hasAttribute('data-fs-inv') || !row.closest(ROOT)) return;
  const name = row.querySelector('.fs-inv-name');
  const ref = name?.querySelector('.iw-item-ref, .fs-inv-name-plain');
  const icon = row.querySelector('.fs-inv-icon');
  const gear = findRaidGear({
    id: ref?.getAttribute('data-iw-item') || icon?.getAttribute('data-iw-item'),
    // Native refs also contain a hidden info glyph ("i"). It is not part of
    // the item name, so prefer the semantic name or the actual label span.
    name: ref?.getAttribute('data-iw-item-name') || ref?.querySelector('.iw-item-name')?.textContent
      || ref?.textContent || name?.firstChild?.textContent,
  });
  if (!gear) { clear(row, host); return; }
  mark(row, GEAR, gear.boss);
  mark(host, SHELL, gear.boss);
  decorated.set(row, host);
  if (!row.querySelector(`[${BADGE}]`) && name) {
    const badge = own('span', 'iwf-raid-gear-badge', 'RAID');
    badge.setAttribute('aria-label', 'Raid equipment');
    (row.querySelector('.fs-inv-stats') || name.parentElement).append(badge);
  }
}

function stylesheet() {
  if (decorated.size) inject('raid-gear', css);
  else remove('raid-gear');
}

export function inventoryPass() {
  const rows = document.querySelectorAll(`${ROOT} ${ROW}`);
  const present = new Set(rows);
  for (const [row, host] of decorated) {
    if (!present.has(row) || row.parentElement !== host) clear(row, host);
  }
  for (const row of rows) decorate(row);
  stylesheet();
}

/** Text-only reuse needs the same identity check, without sweeping the list. */
export function inventoryText(parents) {
  const rows = new Set(parents.map(parent => parent.closest?.(ROW)).filter(Boolean));
  if (!rows.size) return;
  for (const row of rows) decorate(row);
  stylesheet();
}

export function clearInventory() {
  for (const [row, host] of decorated) clear(row, host);
  unmark([GEAR, SHELL]);
  remove('raid-gear');
}
