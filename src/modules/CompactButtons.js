/** Additive artwork only: native labels, icons, handlers and layout stay owned by React. */
const CONTROL = 'button, a[data-iw-ui="nav-tab"], a[data-fs-preserved-action="control"], [role="button"][data-fs-preserved-action="control"]';
const LAYER = '[data-iw-compact-layer]';
let decorated = new Set();
const label = el => String(el.textContent || '').replace(/\s+/g, ' ').trim();

function loadoutPair(el) {
  if (!/^(I|II)$/.test(label(el))) return false;
  const peers = [...(el.parentElement?.querySelectorAll('button') || [])];
  return peers.length === 2 && peers.some(p => label(p) === 'I') && peers.some(p => label(p) === 'II');
}

function kind(el) {
  // The skin's own per-panel collapse toggle paints itself in
  // collapsible.css; it is not one of the game's controls to re-skin.
  if (el.matches('[data-iw-collapse], [data-iw-order-handle]')) return '';
  if (el.matches('[data-fs-preserved-action="control"]')) {
    return el.dataset.fsActionKind === 'icon' ? 'icon' : 'text';
  }
  if (el.matches('[data-iw-inventory-control="filter"], [data-iw-inventory-control="page"], [data-iw-ui="nav-tab"], [data-iw-ui="zone-action"], [data-iw-panel-part="send"]')) return 'text';
  if (loadoutPair(el)) return 'icon';
  if (/^change zone$/i.test(label(el))) return 'text';
  // The small timer in the screenshot belongs to the Change Zone group.
  // Do not restyle unrelated header/inventory icon tools.
  if ((!label(el) || /^[⏱⏲⏰⌚︎️]+$/u.test(label(el))) &&
      [...(el.parentElement?.children || [])].some(p => p.matches('button') && /^change zone$/i.test(label(p)))) return 'icon';
  return '';
}

function clear(el) {
  el.querySelectorAll(`:scope > ${LAYER}`).forEach(n => n.remove());
  delete el.dataset.iwCompactButton;
  delete el.dataset.iwCompactSelected;
}

export function decorateCompactButtons(root = document) {
  const next = new Set();
  for (const el of root.querySelectorAll(CONTROL)) {
    const shape = kind(el);
    if (!shape) continue;
    next.add(el);
    if (el.dataset.iwCompactButton !== shape) el.dataset.iwCompactButton = shape;
    const nativeSelection = el.getAttribute('aria-pressed') ?? el.getAttribute('aria-selected');
    const selected = loadoutPair(el) && (nativeSelection !== null ? nativeSelection === 'true' :
      el.dataset.state === 'active' || /(?:bg|text|border)-(?:orange|amber|primary|accent|ember)/i.test(String(el.className || '')));
    if (selected && el.dataset.iwCompactSelected !== 'true') el.dataset.iwCompactSelected = 'true';
    if (!selected && el.hasAttribute('data-iw-compact-selected')) delete el.dataset.iwCompactSelected;
    for (const state of ['idle', 'hover', 'clicked']) {
      if (el.querySelector(`:scope > [data-iw-compact-layer="${state}"]`)) continue;
      const layer = el.ownerDocument.createElement('span');
      layer.dataset.iwCompactLayer = state;
      layer.setAttribute('aria-hidden', 'true');
      el.append(layer);
    }
  }
  for (const el of decorated) if (!next.has(el)) clear(el);
  decorated = next;
}

export function clearCompactButtons() {
  for (const el of decorated) clear(el);
  decorated.clear();
}
