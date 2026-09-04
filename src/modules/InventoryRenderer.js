/**
 * InventoryRenderer — reusable owned-item row presentation
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
import { categoryClass, statChips } from './itemDisplay.js';
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
const INVENTORY_LIST_ATTR = 'data-iw-inventory-list';
const INVENTORY_FILTER_STATE_ATTR = 'data-iw-inventory-filter-state';
const ROW_SELECTOR = '.compact-row, [class*="item-row"]';
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [tabindex]';
const pendingEmptyRetries = new WeakSet();
const displayStyleOwner = createInlineStyleOwner();

/** row -> exact cheap change signature, see renderRow(). */
const cheapSignatures = new WeakMap();
/**
 * row -> { sig, inContext, root }: the resolveInventoryContext() result,
 * revalidated (not just signature-matched) before reuse -- see renderRow().
 */
const contextCache = new WeakMap();
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
  const seen = new Set();
  const out = [];
  for (const el of row.querySelectorAll('span, div, p')) {
    if (el.closest('.fs-inv-row') || isInsideNativeControl(el, row)) continue;

    // A strictly childless element is a leaf line as before. Additionally
    // accept a "near-leaf": an element whose child elements are ALL themselves
    // childless and which holds no interactive descendant. The game now renders
    // an enhancement level as a nested <span> inside the item-name span
    // (`Name<span>+3</span>`), which made the whole name invisible to a
    // childless-only sweep and broke identity resolution for upgraded gear.
    const nearLeaf = el.childElementCount > 0 &&
      el.childElementCount <= 3 &&
      el.textContent.trim().length <= 120 &&
      !el.querySelector(INTERACTIVE_SELECTOR) &&
      [...el.children].every(c => c.childElementCount === 0);
    if (el.childElementCount !== 0 && !nearLeaf) continue;

    const text = el.textContent.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function detailTexts(row, displayName = '') {
  const interesting = /loadout|requires?|needs\b|upgrad|set bonus|sunstone|moonstone|gem(?:stone)?|socketed|cut\s+[a-z]|:\s*[+-]?\d|🎲/i;

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

  // The game renders an enhancement level either flat inside the name
  // ("Regal Silk Boots+3") or as a separate "+3" token / nested span. When the
  // resolved identity does NOT already carry it (the cloak/orb upgrade system
  // has no per-level item record), keep it so the icon badge and name pip can
  // still show it.
  let enhancement = null;
  if (!/\+\s*\d+\s*$/.test(name)) {
    const tok = texts.find(t => /^\+\s*[1-9]$/.test(t));
    if (tok) enhancement = tok.replace(/\D/g, '');
  }

  return { name, qty: guessQuantity(texts), detailTexts: detailTexts(row, name), enhancement };
}

/**
 * The panel heading is not necessarily a DIRECT child of the panel: IdleWorlds
 * wraps the title and the tool buttons in a flex row, so the heading is a
 * grandchild. The old `:scope >` lookup therefore matched nothing and this
 * function returned null on the live DOM — which silently disabled
 * classifyInventoryChrome() and left every chrome rule in inventory.css dead.
 *
 * Searching descendants is safe here because we walk UP from the row: the
 * first ancestor that contains an "Inventory" heading is the nearest one,
 * i.e. the panel — not some page-level container that also happens to
 * contain it. Headings inside an item row are ignored.
 */
function headingIsInventory(el) {
  return String(el.textContent || '').trim().toLowerCase() === 'inventory';
}

function findInventoryRoot(row) {
  // aria-label wins outright when the game supplies one.
  let cur = row;
  for (let depth = 0; cur && depth < 10; depth += 1, cur = cur.parentElement) {
    const aria = String(cur.getAttribute?.('aria-label') || '').trim().toLowerCase();
    if (aria === 'inventory') return cur;
  }

  // Otherwise: pair this row with an "Inventory" heading and return the panel
  // they SHARE.
  //
  // Climbing until any ancestor merely CONTAINS such a heading is wrong, and a
  // live capture proved it: rows outside Inventory climb past their own panel
  // and land on `section.grid.gap-3.xl:hidden`, a container of seven sibling
  // panels. Every chrome rule then applied to Quests, Skills and the rest —
  // 14 tool buttons classified instead of 4. The page also carries a hidden
  // `xl:hidden` duplicate of the whole column, so "the first heading found" is
  // frequently the invisible copy.
  //
  // The correct root is the heading's OWN panel — the nearest ancestor of the
  // heading that actually holds item rows — and only when that panel contains
  // this row too. A row in another panel resolves to null, as it should.
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, [data-title]')]
    .filter(h => !h.closest(ROW_SELECTOR) && headingIsInventory(h));

  for (const heading of headings) {
    let node = heading.parentElement;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      if (!node.querySelector(ROW_SELECTOR)) continue;
      // This heading's panel. If it owns our row we are done; if not, the row
      // belongs to a different copy of the panel (the page ships a hidden
      // xl:hidden duplicate) so try the next heading rather than giving up.
      if (node.contains(row)) return node;
      break;
    }
  }
  return null;
}

/**
 * Resolves both membership and panel root in one pass. An equip-labeled row
 * proves membership without needing the heading-paired root, but the root is
 * still resolved unconditionally because classifyInventoryChrome() needs it
 * either way -- callers must never invoke findInventoryRoot a second time to
 * get what this already computed.
 */
function resolveInventoryContext(row) {
  const controls = [...row.querySelectorAll('button, [role="button"]')]
    .map(el => String(el.textContent || '').trim().toLowerCase())
    .filter(Boolean);
  const equipShortcut = controls.some(t => /^(equip|equipped|unequip|list)$/.test(t));
  const root = findInventoryRoot(row);
  return { inContext: equipShortcut || !!root, root };
}

function isInventoryContext(row) {
  return resolveInventoryContext(row).inContext;
}

/**
 * The title flourish needs to span the whole panel and centre its ornament on a
 * hairline. It cannot live on the heading's ::after: the heading sits two flex
 * wrappers deep, so a pseudo there is stuck at the heading's own width and left
 * edge. So the skin appends one decorative element of its own after the header
 * row — additive, never reparenting anything the game owns, the same pattern
 * HeaderRenderer uses for .fs-header-crest.
 */
function ensureInventoryRule(root, title) {
  if (!root || !title) return;
  let anchorChild = title;
  while (anchorChild && anchorChild.parentElement !== root) anchorChild = anchorChild.parentElement;
  if (!anchorChild) return;

  let rule = root.querySelector(':scope > .fs-inv-rule');
  if (!rule) {
    rule = document.createElement('div');
    rule.className = 'fs-inv-rule';
    rule.setAttribute('aria-hidden', 'true');
  }
  if (anchorChild.nextElementSibling !== rule) anchorChild.after(rule);
}

function classifyInventoryChrome(root) {
  if (!root) return;
  root.setAttribute(INVENTORY_ROOT_ATTR, '1');
  const titleCandidates = root.querySelectorAll('h1, h2, h3, h4, [data-title]');
  for (const title of titleCandidates) {
    if (title.closest(ROW_SELECTOR)) continue;
    if (headingIsInventory(title)) {
      title.setAttribute(INVENTORY_TITLE_ATTR, '1');
      ensureInventoryRule(root, title);
    }
  }

  // The tool buttons in the panel header are not all <button>: at least one is
  // an anchor, which the old `button, [role="button"]` query missed entirely —
  // so the icon role was never assigned and its chrome rule never applied.
  const buttons = [...root.querySelectorAll('button, a, [role="button"]')];
  for (const button of buttons) {
    // Never classify controls inside individual item rows here; the ItemRow
    // action model owns those independently.
    if (button.closest(ROW_SELECTOR)) continue;
    const text = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    let role = '';
    if (/^(all|gear|materials|consumables|drops)$/.test(text)) role = 'filter';
    else if (/^(prev|previous|next)$/.test(text)) role = 'page';
    // An icon control carries no label of its own and draws an <svg>. Both
    // conditions are required: a bare text-free anchor is not a tool button.
    else if ((!text || text.length <= 2) && button.querySelector('svg')) role = 'icon';
    if (role) button.setAttribute(INVENTORY_CONTROL_ATTR, role);

    // Which filter is live is real information the game paints itself. If the
    // skin repaints every filter identically that information is destroyed,
    // so the active one is marked here and styled separately. Same derivation
    // UIFoundation already uses for the main nav tabs.
    if (role === 'filter') {
      const cls = String(button.className || '');
      const active =
        button.getAttribute('aria-selected') === 'true' ||
        button.getAttribute('aria-current') === 'page' ||
        button.dataset?.state === 'active' ||
        /(?:bg|text|border)-(?:orange|amber|primary|accent)|data-\[state=active\]/i.test(cls);
      if (active) button.setAttribute(INVENTORY_FILTER_STATE_ATTR, 'active');
      else button.removeAttribute(INVENTORY_FILTER_STATE_ATTR);
    }
  }

  // The tool row ends with a bare <svg class="lucide lucide-package … text-ember">
  // that is NOT a control: `cursor: auto`, no role, no tabindex, no aria-label,
  // no title, while all three real controls beside it carry pointer + label +
  // title. It is therefore invisible to the button sweep above, which is why it
  // rendered unframed and looked like a miss. It is not a miss — the game draws
  // that distinction deliberately and the skin must not repaint it away (rule
  // 5), so it is tagged as an ORNAMENT and styled as one, never framed.
  //
  // Scoped to the tool row itself rather than swept for across the panel: start
  // from the controls already classified above and take only their own row's
  // direct <svg> children. That is O(number of icon controls), cannot reach an
  // item row, and cannot promote an <svg> that lives inside some other control.
  const iconControls = [...root.querySelectorAll(`[${INVENTORY_CONTROL_ATTR}="icon"]`)];
  const toolRows = new Set();
  for (const control of iconControls) {
    let node = control.parentElement;
    for (let depth = 0; node && node !== root && depth < 3; depth += 1, node = node.parentElement) {
      if (iconControls.filter(other => node.contains(other)).length >= 2) {
        toolRows.add(node);
        break;
      }
    }
  }
  for (const toolRow of toolRows) {
    for (const child of toolRow.children) {
      if (child.tagName.toLowerCase() !== 'svg') continue;
      child.setAttribute(INVENTORY_CONTROL_ATTR, 'glyph');
    }
  }

  for (const el of root.querySelectorAll('span, div, p')) {
    if (el.closest(ROW_SELECTOR)) continue;
    const text = String(el.textContent || '').trim();
    if (/^\d+\s*\/\s*\d+$/.test(text)) el.setAttribute(INVENTORY_CONTROL_ATTR, 'page-count');
  }

  classifyRowList(root);
}

/**
 * The game stacks the item rows in one wrapper of their own (`div.space-y-1.5`),
 * a sibling of the header / filter tabs / pagers — not a shared parent. Tagging
 * that wrapper lets inventory.css draw a recessed inner frame around just the
 * list, the way each quest card is framed inside the Quests panel. This is
 * additive: an attribute on a node the game already has, no reparenting.
 */
function classifyRowList(root) {
  // Game rows only — the skin's own `.fs-inv-row` overlay lives inside each one
  // and must not be mistaken for the list.
  const rows = [...root.querySelectorAll(ROW_SELECTOR)];
  const list = rows.length ? rows[0].parentElement : null;
  const ok = list && list !== root && root.contains(list) &&
    rows.every(r => r.parentElement === list) &&
    // never the wrapper that also holds the title or a pager/filter control
    !list.querySelector(`[${INVENTORY_TITLE_ATTR}], [${INVENTORY_CONTROL_ATTR}]`);

  root.querySelectorAll(`[${INVENTORY_LIST_ATTR}]`).forEach(el => {
    if (el !== list) el.removeAttribute(INVENTORY_LIST_ATTR);
  });
  if (ok) list.setAttribute(INVENTORY_LIST_ATTR, '1');
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
    data.enhancement || '',
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
  // When the identity resolved without a "+N" but the row carries one, hand the
  // enhanced name to AtlasService so it strips the suffix for the sprite lookup
  // AND paints the matching enhancement badge.
  const iconName = data.enhancement && !/\+\s*\d+\s*$/.test(fullName)
    ? `${fullName}+${data.enhancement}`
    : fullName;
  const ref = item ? { id: item.item_id, name: iconName } : { name: iconName };

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

  // Cheap pre-check before ANY expensive resolution, including the
  // whole-document heading scan inside findInventoryRoot(). A cached root is
  // only trusted after re-validating isConnected + containment -- the exact
  // check findInventoryRoot itself uses to defeat the hidden xl:hidden
  // duplicate-column trap -- so a stale entry can never resolve to the wrong
  // panel; it just falls through to a fresh resolve like a cache miss would.
  const cheapSig = cheapSignature(row);
  const cachedContext = contextCache.get(row);
  let inContext, root;
  if (cachedContext && sameCheapSignature(cachedContext.sig, cheapSig) &&
      (cachedContext.root === null || (cachedContext.root.isConnected && cachedContext.root.contains(row)))) {
    ({ inContext, root } = cachedContext);
  } else {
    ({ inContext, root } = resolveInventoryContext(row));
    contextCache.set(row, { sig: cheapSig, inContext, root });
  }

  if (!inContext) {
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
  if (existingOverlay && sameCheapSignature(cheapSignatures.get(row), cheapSig)) {
    hideOriginalChildren(row, existingOverlay);
    syncRowState(row, existingOverlay);
    return;
  }

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

  const cat = item ? categoryClass(item) : 'fs-cat-unknown';
  const { base, level } = splitLevel(item ? item.name : data.name);
  const nameHTML = item
    ? itemRef(item, base)
    : `<span class="fs-inv-name-plain">${esc(base)}</span>`;
  const levelHTML = level ? ` <span class="fs-inv-sub">Lv ${esc(level)}</span>` : '';
  // Enhancement pip for identities whose "+N" is not part of the record name
  // (e.g. upgraded cloaks — items.json has no per-level entry). Boots-style
  // items keep the "+N" in `base` and need no extra pip.
  const plusHTML = data.enhancement && !/\+\s*\d+\s*$/.test(base)
    ? ` <span class="fs-inv-plus">+${esc(data.enhancement)}</span>`
    : '';

  const chips = item ? statChips(item, { max: 8 }) : [];
  const chipsHTML = chips.map(c => {
    const mod = c.kind === 'pos' ? ' fs-stat--pos' : c.kind === 'tier' ? ' fs-stat--tier' : '';
    return `<span class="fs-stat${mod}">${esc(c.text)}</span>`;
  }).join('');

  // Upgrade Orb consumables get a warm-orange identity (name + frame) over the
  // Consumable colour. See `.fs-inv-orb` in inventory.css.
  const isOrb = /\bupgrade orb\b/i.test(String(item?.subcategory || ''));

  const dynamic = detailHTML(detailModel);
  const overlay = document.createElement('div');
  overlay.className = `fs-inv-row ${cat}${isOrb ? ' fs-inv-orb' : ''}${dynamic.details ? ' has-details' : ''}${dynamic.requirements ? ' has-requirements' : ''}`;
  overlay.innerHTML = `
    <div class="fs-inv-icon"></div>
    <div class="fs-inv-body">
      <div class="fs-inv-name">${nameHTML}${plusHTML}${levelHTML}</div>
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
      contextCache.delete(row);
    });
  document.querySelectorAll(`[${INVENTORY_ROOT_ATTR}]`).forEach(el => {
    el.removeAttribute(INVENTORY_ROOT_ATTR);
  });
  document.querySelectorAll(`[${INVENTORY_LIST_ATTR}]`).forEach(el => {
    el.removeAttribute(INVENTORY_LIST_ATTR);
  });
  document.querySelectorAll('.fs-inv-rule').forEach(el => el.remove());
  document.querySelectorAll(
    `[${INVENTORY_CONTROL_ATTR}], [${INVENTORY_TITLE_ATTR}], [${INVENTORY_FILTER_STATE_ATTR}]`
  ).forEach(el => {
    el.removeAttribute(INVENTORY_CONTROL_ATTR);
    el.removeAttribute(INVENTORY_TITLE_ATTR);
    el.removeAttribute(INVENTORY_FILTER_STATE_ATTR);
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
