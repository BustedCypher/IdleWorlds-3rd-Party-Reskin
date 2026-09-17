/** Additive artwork only: native labels, icons, handlers and layout stay owned by React. */
const CONTROL = 'button, a[data-iw-ui="nav-tab"], a[data-fs-preserved-action="control"], [role="button"][data-fs-preserved-action="control"]';
const LAYER = '[data-iw-compact-layer]';
let decorated = new Set();
const label = el => String(el.textContent || '').replace(/\s+/g, ' ').trim();

const STATES = ['idle', 'hover', 'clicked'];

/* This whole module runs on EVERY classify pass over every button on the page
   (~800 on a 200-row inventory), so a control's label is read once and only
   when a cheap attribute test has not already decided it: it used to be up to
   five `textContent` reads per button per pass, plus three `:scope >` queries
   for the layers. */
function loadoutPair(el, text = label(el)) {
  if (!/^(I|II)$/.test(text)) return false;
  const peers = [...(el.parentElement?.querySelectorAll('button') || [])];
  return peers.length === 2 && peers.some(p => label(p) === 'I') && peers.some(p => label(p) === 'II');
}

function kind(el, text) {
  // The skin's own per-panel collapse toggle paints itself in
  // collapsible.css; it is not one of the game's controls to re-skin.
  if (el.matches('[data-iw-collapse]')) return '';
  if (el.matches('[data-fs-preserved-action="control"]')) {
    return el.dataset.fsActionKind === 'icon' ? 'icon' : 'text';
  }
  if (el.matches('[data-iw-inventory-control="filter"], [data-iw-inventory-control="page"], [data-iw-ui="nav-tab"], [data-iw-ui="zone-action"], [data-iw-panel-part="send"]')) return 'text';
  if (loadoutPair(el, text())) return 'icon';
  if (/^change zone$/i.test(text())) return 'text';
  // The small timer in the screenshot belongs to the Change Zone group.
  // Do not restyle unrelated header/inventory icon tools.
  if ((!text() || /^[⏱⏲⏰⌚︎️]+$/u.test(text())) &&
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
    let cached;
    const text = () => (cached === undefined ? (cached = label(el)) : cached);
    const shape = kind(el, text);
    if (!shape) continue;
    next.add(el);
    if (el.dataset.iwCompactButton !== shape) el.dataset.iwCompactButton = shape;
    const nativeSelection = el.getAttribute('aria-pressed') ?? el.getAttribute('aria-selected');
    const selected = loadoutPair(el, text()) && (nativeSelection !== null ? nativeSelection === 'true' :
      el.dataset.state === 'active' || /(?:bg|text|border)-(?:orange|amber|primary|accent|ember)/i.test(String(el.className || '')));
    if (selected && el.dataset.iwCompactSelected !== 'true') el.dataset.iwCompactSelected = 'true';
    if (!selected && el.hasAttribute('data-iw-compact-selected')) delete el.dataset.iwCompactSelected;
    const present = new Set();
    for (const child of el.children) {
      const layerState = child.getAttribute('data-iw-compact-layer');
      if (layerState !== null) present.add(layerState);
    }
    for (const state of STATES) {
      if (present.has(state)) continue;
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
