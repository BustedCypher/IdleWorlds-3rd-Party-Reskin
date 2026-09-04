/* ============================================================================
   IdleWorlds Fantasy Skin — floating overlay / popup DOM capture

   READ-ONLY. Does not modify the page, click anything, or send anything
   anywhere. Reads structure + computed styles, hands you a JSON file.

   HOW TO RUN
     1. Open idleworlds.com with the extension enabled.
     2. OPEN THE POPUP you want captured (e.g. the active-players menu). Leave
        it on screen. You can open more than one thing if the game allows it.
     3. F12 -> Console. Paste this whole file, press Enter.
     4. It downloads  iw-overlay-capture.json  and copies it to the clipboard.
        Attach the FILE to the chat.
     5. Re-run with a different popup open to capture another one; the file has
        no timestamp so successive captures diff cleanly.

   WHAT IT COLLECTS
     Every element under <body> that is position:fixed or position:absolute with
     a numeric z-index, non-trivial size, and is actually visible — i.e. the
     candidate set a generic overlay-frame pass would have to classify. For each
     it records the box, computed surface styles, the ancestor chain up to
     <body>, siblings (to catch a dim/backdrop layer), a shallow child outline,
     and any role/aria/data hooks. No text content beyond short labels.
   ========================================================================= */

(() => {
  const PROPS = [
    'display', 'position', 'inset', 'top', 'left', 'right', 'bottom',
    'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
    'boxSizing', 'padding', 'margin', 'border', 'borderColor', 'borderRadius',
    'background', 'backgroundColor', 'backgroundImage', 'backgroundSize',
    'backgroundPosition', 'boxShadow', 'backdropFilter', 'color', 'fontFamily',
    'fontSize', 'fontWeight', 'overflow', 'zIndex', 'opacity', 'transform',
    'borderImageSource', 'borderImageSlice',
  ];

  const short = (v, n = 90) => {
    const s = String(v ?? '');
    return s.length > n ? s.slice(0, n) + `…(${s.length})` : s;
  };
  const cls = (el) => String(el.className?.baseVal ?? el.className ?? '');

  const descr = (el, depth = 0) => {
    if (!el || el.nodeType !== 1) return null;
    const csv = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const style = {};
    for (const p of PROPS) style[p] = short(csv[p], 120);
    const out = {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: short(cls(el), 260),
      attrs: [...el.attributes]
        .filter(a => a.name !== 'class' && a.name !== 'style')
        .map(a => `${a.name}="${short(a.value, 70)}"`),
      inlineStyle: short(el.getAttribute('style'), 220) || null,
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      label: short((el.getAttribute('aria-label') || el.getAttribute('title') || '').trim(), 60) || null,
      text: short((el.textContent || '').replace(/\s+/g, ' ').trim(), 80),
      style,
    };
    if (depth > 0) {
      out.children = [...el.children].slice(0, 16).map(c => descr(c, depth - 1));
    } else {
      out.childTags = [...el.children].slice(0, 16).map(c =>
        c.tagName.toLowerCase() + (cls(c) ? '.' + cls(c).trim().split(/\s+/).slice(0, 3).join('.') : ''));
    }
    return out;
  };

  const pseudo = (el, which) => {
    if (!el) return null;
    const c = getComputedStyle(el, which);
    if (c.content === 'none' || (!c.backgroundImage.includes('url') && c.borderImageSource === 'none' && c.content === '""')) {
      return { content: c.content, empty: true };
    }
    return {
      content: short(c.content, 40),
      backgroundImage: short(c.backgroundImage, 80),
      backgroundSize: c.backgroundSize,
      borderImageSource: short(c.borderImageSource, 80),
      borderImageSlice: c.borderImageSlice,
      inset: c.inset,
    };
  };

  const chain = (el, stop = 10) => {
    const out = [];
    let cur = el;
    for (let i = 0; cur && cur !== document.body && i < stop; i++, cur = cur.parentElement) {
      const c = getComputedStyle(cur);
      out.push({
        sel: cur.tagName.toLowerCase() + (cur.id ? `#${cur.id}` : '') +
          (cls(cur) ? '.' + cls(cur).trim().split(/\s+/).slice(0, 5).join('.') : ''),
        position: c.position,
        zIndex: c.zIndex,
        display: c.display,
      });
    }
    return out;
  };

  const visible = (el) => {
    const c = getComputedStyle(el);
    if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  };

  // Candidate set: fixed/absolute, numeric z-index OR fixed full-viewport, visible.
  const all = [...document.body.querySelectorAll('*')];
  const candidates = all.filter(el => {
    const c = getComputedStyle(el);
    if (c.position !== 'fixed' && c.position !== 'absolute') return false;
    if (!visible(el)) return false;
    const z = parseInt(c.zIndex, 10);
    const r = el.getBoundingClientRect();
    const bigDim = r.width >= 120 && r.height >= 60;
    const fullish = c.position === 'fixed' && r.width >= innerWidth * 0.6 && r.height >= innerHeight * 0.6;
    return (Number.isFinite(z) && z !== 0 && bigDim) || fullish;
  });

  // Drop candidates that are an ancestor of another candidate that is itself a
  // panel (keep the outermost of a backdrop+panel pair, and the panel).
  const ranked = candidates.map(el => {
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const isBackdrop =
      (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9) &&
      (parseFloat(c.backgroundColor.split(',')[3] || '1') <= 0.85) &&
      el.children.length <= 3;
    return {
      role: isBackdrop ? 'backdrop-or-shell' : 'panel',
      zIndex: c.zIndex,
      node: descr(el, 2),
      before: pseudo(el, '::before'),
      after: pseudo(el, '::after'),
      ancestors: chain(el),
      siblings: [...(el.parentElement?.children || [])]
        .filter(s => s !== el)
        .slice(0, 6)
        .map(s => descr(s, 0)),
    };
  });

  const capture = {
    meta: {
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      dataSkin: document.documentElement.getAttribute('data-skin') ||
        document.querySelector('[data-skin]')?.getAttribute('data-skin') || null,
      zoneTheme: document.documentElement.getAttribute('data-iw-zone-theme') || null,
      candidateCount: ranked.length,
      note: 'Open ONE popup before running. Re-run per popup.',
    },
    overlays: ranked,
    // Portal roots React commonly uses — helps see where popups mount.
    bodyDirectChildren: [...document.body.children].map(el => ({
      sel: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') +
        (cls(el) ? '.' + cls(el).trim().split(/\s+/).slice(0, 4).join('.') : ''),
      position: getComputedStyle(el).position,
      childCount: el.children.length,
      rect: (() => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(0), h: +r.height.toFixed(0) }; })(),
    })),
    failedAssets: performance.getEntriesByType('resource')
      .filter(e => /chrome-extension:/.test(e.name) && e.transferSize === 0 && e.decodedBodySize === 0)
      .map(e => e.name.split('/').pop())
      .slice(0, 20),
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwOverlayCapture = capture;

  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'iw-overlay-capture.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-overlay-capture.json');
  } catch (e) {
    console.warn('[iw] Download blocked:', e.message);
  }
  try { copy(json); console.log('[iw] Also copied to clipboard.'); } catch {}

  console.log(`[iw] ${ranked.length} overlay candidate(s):`);
  ranked.forEach((o, i) => console.log(
    `  #${i} [${o.role}] z=${o.zIndex} ${o.node.rect.w}x${o.node.rect.h} ` +
    `<${o.node.tag}> "${o.node.text.slice(0, 40)}"`));
  console.log(capture);
})();
