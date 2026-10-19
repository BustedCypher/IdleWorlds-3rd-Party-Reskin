/** Disabled, Fantasy-owned mobile slots. Never participate in game skill logic. */
import { ownerOf, removeOwned } from '../core/dom.js';

const RESERVED = 'data-iw-fantasy-reserved';
const own = ownerOf(RESERVED);

export function reservedSlots(tabs) {
  const slots = [...tabs.querySelectorAll(`:scope > [${RESERVED}]`)];
  // Real skills can fill these positions as the game grows past ten skills.
  const count = Math.max(0, Math.min(2, 12 - tabs.querySelectorAll(':scope > .iw-skill-tab').length));
  while (slots.length > count) slots.pop().remove();
  while (slots.length < count) {
    const slot = own('div', 'iwf-skill-reserved');
    slot.setAttribute('role', 'tab');
    slot.setAttribute('aria-selected', 'false');
    slot.setAttribute('aria-disabled', 'true');
    slot.setAttribute('aria-label', 'Reserved, locked skill slot');
    const name = own('span', 'iw-skill-tab-name', 'Reserved');
    const icon = own('span', 'iw-skill-tab-icon');
    const level = own('span', 'iw-skill-tab-lv', '—');
    for (const child of [name, icon, level]) child.setAttribute('aria-hidden', 'true');
    slot.append(name, icon, level);
    slots.push(slot);
  }
  // React can append real tabs after our decorations. Move only owned nodes,
  // and only when necessary, so a settled strip produces no mutations.
  if (slots.some((slot, index) => tabs.children[tabs.children.length - slots.length + index] !== slot)) tabs.append(...slots);
}

export function clearReserved() { removeOwned(RESERVED); }
