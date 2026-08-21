/**
 * InventoryRenderer — v1.5.10 ItemRow correction pass
 *
 * Inventory is the first full reusable RPG item-row implementation. React
 * keeps ownership of every real command; the skin owns only presentation.
 * Stable item identity/stats come from ItemDatabase, while dynamic owned-item
 * state (loadout membership, socketed gem lines, requirements, upgrade state)
 * is read from the native row before display-only branches are suppressed.
 */

import { on } from './DOMWatcher.js';
import { AtlasService } from './AtlasService.js';
import { ItemDatabase } from './ItemDatabase.js';
import { itemRef } from './TooltipEngine.js';
import { inject } from './StyleInjector.js';
import { tierClass, statChips } from './itemDisplay.js';
import { buildInventoryDetails, inventoryDetailSignature, resolveInventoryItemName } from './InventoryModel.js';
import { guard, guardEach, raf } from './Runtime.js';
import { createInlineStyleOwner } from './InlineStyleOwner.js';
import css from '../styles/inventory.css';

const RENDERED_ATTR = 'data-fs-inv';
const HIDDEN_ATTR = 'data-fs-hidden';
const ACTION_ATTR = 'data-fs-preserved-action';
const ACTION_HOST_ATTR = 'data-fs-action-host';
const SUPPRESSED_ATTR = 'data-fs-suppressed';
const ACTION_KIND_ATTR = 'data-fs-action-kind';
const INVENTORY_ROOT_ATTR = 'data-iw-inventory-root';
const INVENTORY_CONTROL_ATTR = 'data-iw-inventory-control';
const INVENTORY_TITLE_ATTR = 'data-iw-inventory-title';
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [tabindex]';
const pendingEmptyRetries = new WeakSet();
const displayStyleOwner = createInlineStyleOwner();

/** row -> exact cheap change signature, see renderRow(). */
const cheapSignatures = new WeakMap();
let listenerBound = false;

function cheapSignature(row) {
  // Reading textContent is cheap compared with the two selector sweeps in
  // extractRowData(). Store the ACTUAL text rather than only its length: equal-
  // length changes such as x1 -> x2 are semantically real and must reconcile.
  return {
    childCount: row.childElementCount,
    text: row.textContent || '',
    dbRevision: ItemDatabase.revision(),
    atlasRevision: AtlasService.revision(),
  };
}

function sameCheapSignature(a, b) {
  return !!a && !!b &&
    a.childCount === b.childCount &&
    a.text === b.text &&
    a.dbRevision === b.dbRevision &&
    a.atlasRevision === b.atlasRevision;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isInsideNativeControl(el, row) {
  const control = el.closest?.(INTERACTIVE_SELECTOR);
  return !!(control && control !== row && row.contains(control));
}

function leafTexts(row) {
  return [...row.querySelectorAll('span, div, p')]
    .filter(el => !el.closest('.fs-inv-row'))
    .filter(el => !isInsideNativeControl(el, row))
    .filter(el => el.childElementCount === 0)
    .map(el => el.textContent.trim())
    .filter(Boolean);
}

function detailTexts(row, displayName = '') {
  const interesting = /loadout|requires?|needs\b|upgrad|set bonus|sunstone|moonstone|gem(?:stone)?|socketed|cut\s+[a-z]|:\s*[+-]?\d/i;

  // Capture both atomic leaf lines and compact wrappers used by the native
  // row when an icon is a separate child. Parent containers can concatenate
  // the whole item into one textContent string, so record the originating
  // elements and prune ancestry rather than deduplicating by text alone.
  const records = [];
  for (const el of row.querySelectorAll('span, div, p, li')) {
    if (el.closest('.fs-inv-row') || isInsideNativeControl(el, row)) continue;
    const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 220 || !interesting.test(text)) continue;
    records.push({ el, text, key: text.toLowerCase() });
  }

  // If an ancestor and descendant expose identical textContent, the ancestor
  // is only a wrapper. Drop it. Identical text in two separate sibling lines
  // is retained so two socketed gems can correctly become ×2.
  const deNested = records.filter((rec, idx) => !records.some((other, j) =>
    idx !== j && rec.key === other.key && rec.el.contains(other.el)
  ));

  const nameKey = String(displayName || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const ordered = deNested.sort((a, b) => a.text.length - b.text.length);
  const kept = [];
  for (const rec of ordered) {
    const { text, key } = rec;

    // A native wrapper that starts with the item name and also contains tier,
    // stats, requirements or action-state text is an aggregate of the row,
    // never one semantic owned-item detail.
    if (nameKey && key.startsWith(nameKey) && /(?:\btier\b|\b(?:atk|def|hp)\s*[+-]?\d|\bxp\b.*\/task|\brequires?\b|\bupgrad|\bloadout\b)/i.test(text)) {
      continue;
    }

    // Prefer atomic child lines over longer parent concatenations. Only a
    // strictly shorter string can suppress this record, so repeated sibling
    // gem lines survive and can be counted by InventoryModel.
    const containsAtomic = kept.some(shorter =>
      shorter.text.length < text.length && shorter.key.length >= 5 && key.includes(shorter.key)
    );
    if (containsAtomic) continue;

    kept.push(rec);
  }
  return kept.map(rec => rec.text);
}

function guessQuantity(texts) {
  for (const t of texts) {
    const m = t.match(/^[x×]\s*(\d[\d,]*)$/i);
    if (m) return m[1].replace(/,/g, '');
  }
  const nums = texts.filter(t => /^\d[\d,]*$/.test(t));
  return nums.length ? nums[nums.length - 1].replace(/,/g, '') : null;
}

function extractRowData(row) {
  const texts = leafTexts(row);
  const name = resolveInventoryItemName(texts, name => ItemDatabase.getByName(name));
  return { name, qty: guessQuantity(texts), detailTexts: detailTexts(row, name) };
}

function findInventoryRoot(row) {
  let cur = row;
  for (let depth = 0; cur && depth < 8; depth += 1, cur = cur.parentElement) {
    const aria = String(cur.getAttribute?.('aria-label') || '').trim().toLowerCase();
    if (aria === 'inventory') return cur;

    const headings = cur.querySelectorAll?.(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [data-title]') || [];
    for (const h of headings) {
      if (String(h.textContent || '').trim().toLowerCase() === 'inventory') return cur;
    }
  }
  return null;
}

function isInventoryContext(row) {
  const controls = [...row.querySelectorAll('button, [role="button"]')]
    .map(el => String(el.textContent || '').trim().toLowerCase())
    .filter(Boolean);
  if (controls.some(t => /^(equip|equipped|unequip|list)$/.test(t))) return true;
  return !!findInventoryRoot(row);
}

function classifyInventoryChrome(root) {
  if (!root) return;
  root.setAttribute(INVENTORY_ROOT_ATTR, '1');
  const titleCandidates = root.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [data-title]');
  for (const title of titleCandidates) {
    if (String(title.textContent || '').trim().toLowerCase() === 'inventory') {
      title.setAttribute(INVENTORY_TITLE_ATTR, '1');
    }
  }

  const buttons = [...root.querySelectorAll('button, [role="button"]')];
  for (const button of buttons) {
    // Never classify controls inside individual item rows here; the ItemRow
    // action model owns those independently.
    if (button.closest('.compact-row, [class*="item-row"]')) continue;
    const text = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    let role = '';
    if (/^(all|gear|materials|consumables|drops)$/.test(text)) role = 'filter';
    else if (/^(prev|previous|next)$/.test(text)) role = 'page';
    else if (!text || text.length <= 2) role = 'icon';
    if (role) button.setAttribute(INVENTORY_CONTROL_ATTR, role);
  }

  for (const el of root.querySelectorAll('span, div, p')) {
    if (el.closest('.compact-row, [class*="item-row"]')) continue;
    const text = String(el.textContent || '').trim();
    if (/^\d+\s*\/\s*\d+$/.test(text)) el.setAttribute(INVENTORY_CONTROL_ATTR, 'page-count');
  }
}

function splitLevel(name) {
  const m = String(name || '').match(/^(.*?)\s+lv\.?\s*(\d+)\s*$/i);
  return m ? { base: m[1].trim(), level: m[2] } : { base: name, level: null };
}

function isInteractiveHost(el) {
  return !!(el.matches?.(INTERACTIVE_SELECTOR) || el.querySelector?.(INTERACTIVE_SELECTOR));
}

function restoreDisplay(el) {
  displayStyleOwner.restoreElement(el);
}

function suppressDisplayBranch(el) {
  el.setAttribute(SUPPRESSED_ATTR, '1');
  el.removeAttribute(ACTION_ATTR);
  el.removeAttribute(ACTION_HOST_ATTR);
  displayStyleOwner.set(el, 'display', 'none', '');
}

function classifyActionControl(el) {
  const text = String(el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (/^equipped$|^unequip$/.test(text)) return 'equipped';
  if (/^equip$/.test(text)) return 'equip';
  if (/set bonus/.test(text)) return 'set';
  if (/^list$|^sell$|^use$|^deposit$|^withdraw$/.test(text)) return 'secondary';
  if (/^lock$|^unlock$/.test(text) || (!text && el.querySelector?.('svg'))) return 'icon';
  return 'secondary';
}

function preserveInteractiveTree(el) {
  if (!el) return;

  if (el.matches?.(INTERACTIVE_SELECTOR)) {
    el.setAttribute(ACTION_ATTR, 'control');
    el.setAttribute(ACTION_KIND_ATTR, classifyActionControl(el));
    el.removeAttribute(ACTION_HOST_ATTR);
    el.removeAttribute(SUPPRESSED_ATTR);
    restoreDisplay(el);
    return;
  }

  if (!isInteractiveHost(el)) {
    suppressDisplayBranch(el);
    return;
  }

  el.setAttribute(ACTION_ATTR, 'host');
  el.setAttribute(ACTION_HOST_ATTR, '1');
  el.removeAttribute(SUPPRESSED_ATTR);
  restoreDisplay(el);
  [...el.children].forEach(child => preserveInteractiveTree(child));
}

function hideOriginalChildren(row, overlay) {
  [...row.children].forEach(child => {
    if (child === overlay || child.classList?.contains('fs-inv-row')) return;
    if (isInteractiveHost(child)) preserveInteractiveTree(child);
    else suppressDisplayBranch(child);
  });
}

function restoreOriginalChildren(row) {
  displayStyleOwner.restoreWithin(row);
  row.querySelectorAll(`[${HIDDEN_ATTR}], [${ACTION_ATTR}], [${ACTION_HOST_ATTR}], [${SUPPRESSED_ATTR}]`).forEach(el => {
    el.removeAttribute(HIDDEN_ATTR);
    el.removeAttribute(ACTION_ATTR);
    el.removeAttribute(ACTION_HOST_ATTR);
    el.removeAttribute(SUPPRESSED_ATTR);
    el.removeAttribute(ACTION_KIND_ATTR);
  });
}

function clearRenderedRow(row) {
  row.querySelectorAll(':scope > .fs-inv-row').forEach(el => el.remove());
  restoreOriginalChildren(row);
  row.removeAttribute(RENDERED_ATTR);
}

function rowSignature(data, item, detailModel) {
  return [
    item ? String(item.item_id ?? item.name) : data.name,
    data.qty || '',
    inventoryDetailSignature(detailModel),
    ItemDatabase.revision(),
    AtlasService.revision(),
  ].join('|');
}

function scheduleEmptyRetry(row) {
  if (pendingEmptyRetries.has(row)) return;
  pendingEmptyRetries.add(row);
  raf(() => guard('inventory:empty-retry', () => {
    pendingEmptyRetries.delete(row);
    if (!row.isConnected) return;
    const retry = extractRowData(row);
    if (retry.name) renderRow(row);
    else if (row.querySelector(':scope > .fs-inv-row')) clearRenderedRow(row);
  }));
}

function configureIconTooltip(host, item, data) {
  if (!host) return;
  const name = item?.name || data.name;
  if (item?.item_id != null) host.setAttribute('data-iw-item', String(item.item_id));
  else host.setAttribute('data-iw-item-name', name);
  host.setAttribute('data-iw-tooltip-trigger', '1');
  // Do not expose the icon as role=button: the global IdleWorlds/Fantasy
  // button language applies background-image !important to role=button, which
  // masks AtlasService's sprite background. The delegated tooltip engine only
  // requires the data attributes, so a focusable neutral surface is enough.
  host.removeAttribute('role');
  host.setAttribute('tabindex', '0');
  host.setAttribute('aria-haspopup', 'true');
  host.setAttribute('aria-expanded', 'false');
  host.setAttribute('aria-label', `${name}, item details`);
}

function paintIcon(overlay, item, data) {
  const host = overlay.querySelector('.fs-inv-icon');
  if (!host) return;
  configureIconTooltip(host, item, data);

  const fullName = item ? item.name : data.name;
  const ref = item ? { id: item.item_id, name: fullName } : { name: fullName };

  const apply = () => {
    if (!overlay.isConnected || !host.isConnected) return;
    host.textContent = '';
    if (!AtlasService.paint(host, ref)) host.textContent = '❓';
  };

  if (AtlasService.isReady()) apply();
  AtlasService.ready().then(apply).catch(() => {
    if (host.isConnected && !host.style.backgroundImage) host.textContent = '❓';
  });
}

function detailHTML(detailModel) {
  const details = (detailModel?.details || []).map(detail => {
    const count = detail.count > 1 ? `<span class="fs-inv-detail-count">×${detail.count}</span>` : '';
    return `<span class="fs-inv-detail fs-inv-detail--${esc(detail.kind)}">${esc(detail.text)}${count}</span>`;
  }).join('');
  const requirements = (detailModel?.requirements || []).map(text =>
    `<span class="fs-inv-requirement">${esc(text)}</span>`
  ).join('');

  return {
    details: details ? `<div class="fs-inv-details">${details}</div>` : '',
    requirements: requirements ? `<div class="fs-inv-requirements">${requirements}</div>` : '',
  };
}

function syncRowState(row, overlay) {
  if (!overlay) return;
  const kinds = [...row.querySelectorAll(`[${ACTION_ATTR}="control"]`)]
    .map(el => el.getAttribute(ACTION_KIND_ATTR));
  overlay.classList.toggle('is-equipped', kinds.includes('equipped'));
  overlay.classList.toggle('has-set-action', kinds.includes('set'));
}

function renderRow(row) {
  if (!row || !row.isConnected) return;

  if (!isInventoryContext(row)) {
    if (row.querySelector(':scope > .fs-inv-row')) clearRenderedRow(row);
    return;
  }

  const existingOverlay = row.querySelector(':scope > .fs-inv-row');

  // Cheap pre-check before the expensive path.
  //
  // extractRowData() runs two querySelectorAll sweeps over the row. One exact
  // textContent read plus child/revision fields is still much cheaper, but unlike
  // the old text-LENGTH signature it cannot miss an equal-length semantic
  // change such as x1 -> x2 or one item name being replaced by another.
  const cheapSig = cheapSignature(row);
  if (existingOverlay && sameCheapSignature(cheapSignatures.get(row), cheapSig)) {
    hideOriginalChildren(row, existingOverlay);
    syncRowState(row, existingOverlay);
    return;
  }

  const root = findInventoryRoot(row);
  classifyInventoryChrome(root);

  const data = extractRowData(row);
  if (!data.name) {
    scheduleEmptyRetry(row);
    return;
  }

  const item = ItemDatabase.getByName(data.name);
  const detailModel = buildInventoryDetails(data.detailTexts, item, data.name);
  const signature = rowSignature(data, item, detailModel);
  const existing = row.querySelector(':scope > .fs-inv-row');

  if (existing && row.getAttribute(RENDERED_ATTR) === signature) {
    hideOriginalChildren(row, existing);
    syncRowState(row, existing);
    cheapSignatures.set(row, cheapSig);
    return;
  }

  if (existing) existing.remove();
  restoreOriginalChildren(row);

  const tier = item ? tierClass(item) : 'tier-common';
  const { base, level } = splitLevel(item ? item.name : data.name);
  const nameHTML = item
    ? itemRef(item, base)
    : `<span class="fs-inv-name-plain">${esc(base)}</span>`;
  const levelHTML = level ? ` <span class="fs-inv-sub">Lv ${esc(level)}</span>` : '';

  const chips = item ? statChips(item, { max: 8 }) : [];
  const chipsHTML = chips.map(c => {
    const mod = c.kind === 'pos' ? ' fs-stat--pos' : c.kind === 'tier' ? ' fs-stat--tier' : '';
    return `<span class="fs-stat${mod}">${esc(c.text)}</span>`;
  }).join('');

  const dynamic = detailHTML(detailModel);
  const overlay = document.createElement('div');
  overlay.className = `fs-inv-row ${tier}${dynamic.details ? ' has-details' : ''}${dynamic.requirements ? ' has-requirements' : ''}`;
  overlay.innerHTML = `
    <div class="fs-inv-icon"></div>
    <div class="fs-inv-body">
      <div class="fs-inv-name ${tier}">${nameHTML}${levelHTML}</div>
      ${chipsHTML ? `<div class="fs-inv-stats">${chipsHTML}</div>` : ''}
      ${dynamic.details}
      ${dynamic.requirements}
    </div>
    ${data.qty ? `<span class="fs-inv-qty">×${esc(data.qty)}</span>` : ''}
  `;

  row.appendChild(overlay);
  hideOriginalChildren(row, overlay);
  syncRowState(row, overlay);
  row.setAttribute(RENDERED_ATTR, signature);
  cheapSignatures.set(row, cheapSig);
  paintIcon(overlay, item, data);
}

function reconcileAll() {
  guardEach('inventory:reconcile-all',
    document.querySelectorAll('.compact-row, [class*="item-row"]'),
    renderRow);
}

/** Remove every skin-owned overlay and restore the native rows. Kill switch. */
export function clearInventoryRenderer() {
  guardEach('inventory:teardown',
    document.querySelectorAll('.compact-row, [class*="item-row"]'),
    row => {
      if (row.querySelector(':scope > .fs-inv-row')) clearRenderedRow(row);
      cheapSignatures.delete(row);
    });
  document.querySelectorAll(`[${INVENTORY_ROOT_ATTR}]`).forEach(el => {
    el.removeAttribute(INVENTORY_ROOT_ATTR);
  });
  document.querySelectorAll(`[${INVENTORY_CONTROL_ATTR}], [${INVENTORY_TITLE_ATTR}]`).forEach(el => {
    el.removeAttribute(INVENTORY_CONTROL_ATTR);
    el.removeAttribute(INVENTORY_TITLE_ATTR);
  });
  displayStyleOwner.restoreAll();
}

export function initInventoryRenderer() {
  inject('inventory', css);
  if (listenerBound) return;
  listenerBound = true;
  on('iw:inventory-row', e => guard('inventory:row', () => renderRow(e.detail.row)));
  document.addEventListener('iw:item-db-updated', reconcileAll);
  document.addEventListener('iw:atlas-updated', reconcileAll);
}
