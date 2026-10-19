/** Supply new item art inside the game's own tooltip, preserving its nodes. */
import { findExpansionIcon } from '../../../shared/ItemExpansionIcons.js';
import { assetUrl } from '../core/Runtime.js';
import { inject, remove } from '../core/StyleInjector.js';
import { mark, ownerOf } from '../core/dom.js';
import css from '../styles/tooltips.css';

const ATTR = 'data-iw-fantasy-tooltip-art';
const own = ownerOf('data-iw-fantasy-tooltip-owned');
const slots = new Map();

function clearSlot(slot) {
  slots.get(slot)?.host.remove();
  slots.delete(slot);
  mark(slot, ATTR, null);
}

export function tooltipsPass() {
  for (const slot of slots.keys()) if (!slot.isConnected) clearSlot(slot);
  for (const slot of document.querySelectorAll('#iw-tip .iw-tip-art')) {
    const name = slot.closest('#iw-tip').querySelector('.iw-tip-name')?.textContent;
    const icon = findExpansionIcon({ name });
    if (!icon) { clearSlot(slot); continue; }
    const key = `${icon.item_id}:${icon.badge}`;
    const previous = slots.get(slot);
    if (previous?.key === key && previous.host.parentElement === slot) continue;
    clearSlot(slot);
    inject('tooltips', css);
    const host = own('span', 'iw-tip-art-host iwf-tooltip-icon');
    host.setAttribute('aria-hidden', 'true');
    host.style.backgroundImage = `url("${assetUrl(icon.path)}")`;
    if (icon.badge) {
      const badge = own('span', 'iw-icon-badge', `+${icon.badge}`);
      badge.setAttribute('data-iw-badge', String(icon.badge));
      host.append(badge);
    }
    slot.append(host);
    mark(slot, ATTR, icon.item_id);
    slots.set(slot, { key, host });
  }
}

export function tooltipsText(parents) {
  if (parents.some(parent => parent.closest?.('#iw-tip'))) tooltipsPass();
}

export function clearTooltips() {
  for (const slot of slots.keys()) clearSlot(slot);
  remove('tooltips');
}
