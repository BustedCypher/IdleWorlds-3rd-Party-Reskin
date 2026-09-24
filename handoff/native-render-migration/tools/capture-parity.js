/*
 * capture-parity.js — DevTools snippet. READ-ONLY.
 *
 * Records what the fantasy theme actually PAINTS, so two builds can be
 * compared number for number instead of by eye:
 *   - every element that carries a skin mark (data-iw-* / data-fs-* attribute
 *     or an fs-* / iw-* class): a curated set of computed properties, its box
 *     (document coordinates), its classes and skin attributes, and the same
 *     computed set for its ::before and ::after when they render;
 *   - <html>: attributes, inline custom properties, the stylesheet order, and
 *     which theme faces have loaded.
 *
 * Run it on the LIVE game with the extension on (the reference) and on the
 * native build with the extension OFF or uninstalled (the candidate), at the
 * same route, viewport width and game state, then compare the two files with
 *   node handoff/native-render-migration/tools/diff-parity.mjs reference.json candidate.json
 *
 * HOW TO RUN: paste into the DevTools console (the page's own "top" context is
 * fine; no extension API is used). Options, set BEFORE pasting:
 *   window.IW_PARITY_ROOT = '[data-iw-chrome="shell"]';  // limit to one subtree
 *   window.IW_PARITY_ALL = true;   // also record UNMARKED elements under the root
 *   window.IW_PARITY_NAME = 'reference';                   // file-name label
 * Downloads `iw-parity-<name>-<route>-<width>.json`.
 *
 * PRIVACY: element labels include page text. Treat the file as account data.
 */
(async () => {
  const ROOT_SELECTOR = globalThis.IW_PARITY_ROOT || 'body';
  const ALL = !!globalThis.IW_PARITY_ALL;
  const NAME = String(globalThis.IW_PARITY_NAME || 'capture');
  const root = document.querySelector(ROOT_SELECTOR);
  if (!root) throw new Error(`IW_PARITY_ROOT "${ROOT_SELECTOR}" matched nothing on this page.`);

  // Everything that decides what a box looks like and where it sits.
  const PROPS = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float',
    'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
    'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat',
    'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    'background-clip', 'background-origin', 'background-blend-mode', 'background-attachment',
    'box-shadow', 'outline-style', 'outline-color', 'outline-width', 'outline-offset',
    'opacity', 'visibility', 'overflow-x', 'overflow-y', 'clip-path', 'mask-image', 'filter', 'backdrop-filter',
    'transform', 'mix-blend-mode', 'isolation', 'pointer-events', 'cursor',
    'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'order',
    'justify-content', 'align-items', 'align-content', 'align-self', 'justify-self', 'row-gap', 'column-gap',
    'grid-template-columns', 'grid-template-rows', 'grid-row-start', 'grid-row-end', 'grid-column-start', 'grid-column-end',
    'container-type', 'container-name', 'aspect-ratio',
    'color', '-webkit-text-fill-color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'letter-spacing', 'text-transform', 'text-align', 'text-decoration-line', 'text-shadow',
    'white-space', 'text-overflow', 'overflow-wrap', 'word-break', 'font-variant-numeric',
    'animation-name', 'animation-duration', 'transition-property', 'transition-duration', 'transition-timing-function',
  ];
  const PSEUDO_PROPS = ['content', ...PROPS];
  const SKIN_ATTR = /^data-(?:iw|fs)-/;
  const SKIN_CLASS = /^(?:fs|iw)-/;
  // Attributes the extension writes for its own bookkeeping that NO stylesheet
  // reads. They do not make an element "skinned", so a native render that
  // omits them is captured identically. Keep in step with
  // generated/theme-constants.json → skinAttributes.bookkeeping
  // (export-theme-constants.mjs fails if they drift).
  const BOOKKEEPING = new Set(['data-fs-hidden', 'data-fs-quest', 'data-fs-skill', 'data-fs-skill-flavour', 'data-fs-skill-label', 'data-fs-skill-rune', 'data-iw-atlas', 'data-iw-badge', 'data-iw-base-exp', 'data-iw-boss-action-label', 'data-iw-boss-art-ready', 'data-iw-control-crest', 'data-iw-control-source', 'data-iw-header-card', 'data-iw-ingredient-signature', 'data-iw-item', 'data-iw-item-name', 'data-iw-page-hydrated', 'data-iw-painted', 'data-iw-quest-art-pending', 'data-iw-quest-icon-pending', 'data-iw-quest-percent', 'data-iw-skill', 'data-iw-skill-art', 'data-iw-skill-art-pending', 'data-iw-skill-design-toggle', 'data-iw-skill-glyph', 'data-iw-skill-ingredient-list', 'data-iw-skill-v2-action-glyph', 'data-iw-skill-v2-action-label', 'data-iw-skill-v2-body', 'data-iw-skill-v2-body-signature', 'data-iw-skill-v2-break', 'data-iw-skill-v2-controls', 'data-iw-skill-v2-expand', 'data-iw-skill-v2-label-fit', 'data-iw-skill-v2-req-note', 'data-iw-skill-v2-row', 'data-iw-skill-v2-summary', 'data-iw-skill-v2-tab', 'data-iw-skill-v2-tabs', 'data-iw-skills-atlas', 'data-iw-skills-atlas-index', 'data-iw-style', 'data-iw-tab', 'data-iw-village-owned', 'data-iw-village-scene', 'data-iw-village-scene-owned', 'data-iw-village-tier', 'data-iw-village-totals', 'data-iw-vs-entry', 'data-iw-vs-toggle', 'data-iw-zone']);

  // Skinned = carries a mark some stylesheet reads, a skin class, or an inline
  // `!important` declaration (the background repaint and the skill-card
  // control plates are written that way, on nodes with no other mark).
  const marked = el => [...el.attributes].some(a => SKIN_ATTR.test(a.name) && !BOOKKEEPING.has(a.name))
    || [...el.classList].some(c => SKIN_CLASS.test(c))
    || /!important/.test(el.getAttribute('style') || '');
  const label = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);

  /** tag:nth-child chain from <body>. Classes are deliberately NOT in the key:
   *  they are compared as a property, so a missing class shows up as a
   *  difference on the right node instead of orphaning its whole subtree. */
  function keyOf(el) {
    const parts = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const parent = node.parentElement;
      const index = parent ? [...parent.children].indexOf(node) + 1 : 1;
      parts.unshift(`${node.tagName.toLowerCase()}:${index}`);
      if (node === document.body) break;
    }
    return parts.join('>');
  }

  function computed(el, pseudo, props) {
    const cs = getComputedStyle(el, pseudo);
    const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  }
  const renders = (el, pseudo) => {
    const content = getComputedStyle(el, pseudo).getPropertyValue('content');
    return content && content !== 'none' && content !== 'normal';
  };

  const scrollX = window.scrollX, scrollY = window.scrollY;
  // The dashboard renders its panel stack twice and Tailwind hides one copy at
  // 1280px. The extension marks only the live copy; a native render may mark
  // both (chapter 2 §2.7). Whatever sits in the copy that is NOT rendering
  // paints nothing either way, so it is left out of both captures.
  const hiddenStacks = [...document.querySelectorAll('[class~="xl:hidden"], [class~="xl:grid"]')]
    .filter(el => typeof el.checkVisibility === 'function' && !el.checkVisibility());
  const candidates = [root, ...root.querySelectorAll('*')]
    .filter(el => !el.closest('script, style, noscript, #iw-tip'))
    .filter(el => !hiddenStacks.some(stack => stack.contains(el)))
    .filter(el => ALL || marked(el));

  const nodes = [];
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const skinAttributes = {};
    for (const a of el.attributes) if (SKIN_ATTR.test(a.name) && !BOOKKEEPING.has(a.name)) skinAttributes[a.name] = a.value;
    const entry = {
      key: keyOf(el),
      tag: el.tagName.toLowerCase(),
      label: label(el),
      classes: [...el.classList].sort(),
      skinAttributes,
      rect: { x: +(r.left + scrollX).toFixed(2), y: +(r.top + scrollY).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
      style: computed(el, null, PROPS),
    };
    if (renders(el, '::before')) entry.before = computed(el, '::before', PSEUDO_PROPS);
    if (renders(el, '::after')) entry.after = computed(el, '::after', PSEUDO_PROPS);
    nodes.push(entry);
  }

  const html = document.documentElement;
  const htmlInline = {};
  for (let i = 0; i < html.style.length; i += 1) htmlInline[html.style[i]] = html.style.getPropertyValue(html.style[i]);
  const htmlAttributes = {};
  for (const a of html.attributes) if (a.name !== 'style') htmlAttributes[a.name] = a.value;
  const sheets = [...document.styleSheets].map((sheet, index) => ({
    index,
    href: sheet.href,
    owner: sheet.ownerNode?.tagName?.toLowerCase() || null,
    skinId: sheet.ownerNode?.getAttribute?.('data-iw-style') || null,
    rules: (() => { try { return sheet.cssRules.length; } catch { return null; } })(),
  }));
  await document.fonts?.ready;
  const fonts = [...(document.fonts || [])]
    .filter(f => /cinzel|barlow|crimson/i.test(f.family))
    .map(f => ({ family: f.family.replace(/["']/g, ''), weight: f.weight, style: f.style, status: f.status }));

  const capture = {
    generatedBy: 'handoff/native-render-migration/tools/capture-parity.js',
    name: NAME,
    capturedAt: new Date().toISOString(),
    route: location.pathname,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    root: ROOT_SELECTOR,
    all: ALL,
    html: { attributes: htmlAttributes, inlineStyle: htmlInline },
    sheets,
    fonts,
    nodes,
  };
  globalThis.__iwParityCapture = capture;

  if (!globalThis.IW_PARITY_NO_DOWNLOAD) {
    const file = `iw-parity-${NAME}${location.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || '-root'}-${innerWidth}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(capture)], { type: 'application/json' }));
    a.download = file;
    document.body.append(a);
    a.click();
    a.remove();
    console.log(`[parity] ${nodes.length} elements recorded; downloaded ${file}`);
  }
  return { nodes: nodes.length, sheets: sheets.length };
})();
