/* ============================================================================
   IdleWorlds Fantasy Skin — inventory DOM capture

   READ-ONLY. This snippet does not modify the page, click anything, or send
   anything anywhere. It reads structure and computed styles, then hands you a
   JSON file to download.

   HOW TO RUN
     1. Open idleworlds.com with the extension enabled, on the Game tab so the
        Inventory panel is visible.
     2. F12 (or Ctrl+Shift+J) -> Console.
     3. Paste this whole file, press Enter.
     4. It downloads  iw-inventory-capture.json  and also copies the JSON to
        your clipboard. Attach the FILE to the chat — a pasted capture was lost
        to compaction once already on this project.

   If the download is blocked, the JSON is still on your clipboard, and the
   snippet also leaves it at  window.__iwCapture  so you can right-click ->
   "Store as global variable" / "Copy object".
   ========================================================================= */

(() => {
  const PROPS = [
    'display', 'position', 'boxSizing', 'width', 'minWidth', 'maxWidth',
    'height', 'minHeight', 'lineHeight', 'padding', 'margin', 'border',
    'borderRadius', 'background', 'backgroundImage', 'backgroundSize',
    'backgroundPosition', 'color', 'fontFamily', 'fontSize', 'fontWeight',
    'letterSpacing', 'textTransform', 'textAlign', 'flex', 'alignSelf',
    'alignItems', 'justifyContent', 'gap', 'overflow', 'zIndex', 'opacity',
  ];

  const short = (v, n = 90) => {
    const s = String(v ?? '');
    return s.length > n ? s.slice(0, n) + `…(${s.length})` : s;
  };

  const describe = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const style = {};
    for (const p of PROPS) style[p] = short(cs[p]);
    return {
      tag: el.tagName.toLowerCase(),
      classes: short(el.className?.baseVal ?? el.className, 220),
      attrs: [...el.attributes]
        .filter(a => a.name !== 'class' && a.name !== 'style')
        .map(a => `${a.name}="${short(a.value, 60)}"`),
      inlineStyle: short(el.getAttribute('style'), 220) || null,
      rect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      text: short((el.textContent || '').replace(/\s+/g, ' ').trim(), 60),
      childTags: [...el.children].map(c => c.tagName.toLowerCase()).slice(0, 12),
      style,
    };
  };

  const pseudo = (el, which) => {
    if (!el) return null;
    const cs = getComputedStyle(el, which);
    if (cs.content === 'none') return { content: 'none' };
    return {
      content: short(cs.content, 40),
      display: cs.display,
      position: cs.position,
      width: cs.width,
      height: cs.height,
      margin: cs.margin,
      backgroundImage: short(cs.backgroundImage, 70),
      backgroundSize: cs.backgroundSize,
      backgroundPosition: cs.backgroundPosition,
      borderWidth: cs.borderWidth,
      borderImageSource: short(cs.borderImageSource, 70),
      borderImageSlice: cs.borderImageSlice,
      borderImageWidth: cs.borderImageWidth,
      zIndex: cs.zIndex,
      opacity: cs.opacity,
    };
  };

  const path = (el, stop = 6) => {
    const out = [];
    let cur = el;
    for (let i = 0; cur && i < stop; i++, cur = cur.parentElement) {
      const cls = String(cur.className?.baseVal ?? cur.className ?? '');
      out.push(
        cur.tagName.toLowerCase() +
        (cur.id ? `#${cur.id}` : '') +
        (cls ? '.' + cls.trim().split(/\s+/).slice(0, 4).join('.') : '')
      );
    }
    return out;
  };

  const root = document.querySelector('[data-iw-inventory-root]');
  if (!root) {
    console.error(
      '[iw] No [data-iw-inventory-root] on the page.\n' +
      'Make sure the extension is enabled and the Inventory panel is visible, ' +
      'then run this again.'
    );
    return;
  }

  const heading = root.querySelector('[data-iw-inventory-title]');
  const filters = [...root.querySelectorAll('[data-iw-inventory-control="filter"]')];
  const activeFilter = filters.find(b => b.hasAttribute('data-iw-inventory-filter-state'));
  const icons = [...root.querySelectorAll('[data-iw-inventory-control="icon"]')];
  const pages = [...root.querySelectorAll('[data-iw-inventory-control="page"]')];
  const overlay = root.querySelector('.fs-inv-row');
  const shell = overlay?.parentElement || null;
  const actions = shell ? [...shell.querySelectorAll('[data-fs-preserved-action="control"]')] : [];
  const byKind = k => actions.find(a => a.getAttribute('data-fs-action-kind') === k);

  const capture = {
    meta: {
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      ua: short(navigator.userAgent, 140),
      // NOTE: no timestamp — deliberately, so re-running produces a diffable file.
      counts: {
        filters: filters.length,
        activeFilterFound: !!activeFilter,
        icons: icons.length,
        pages: pages.length,
        rowsRendered: root.querySelectorAll('.fs-inv-row').length,
        actionsInFirstRow: actions.length,
      },
    },

    // Q1 — why is the title flourish centred rather than left aligned?
    heading: {
      el: describe(heading),
      after: pseudo(heading, '::after'),
      ancestors: heading ? path(heading, 4) : null,
      parent: describe(heading?.parentElement),
    },

    // Q2 — what governs the filter bar's width and seams?
    filterBar: {
      container: describe(filters[0]?.parentElement),
      first: describe(filters[0]),
      active: describe(activeFilter),
      activeAttrPresent: !!activeFilter,
      allLabels: filters.map(f => (f.textContent || '').trim()),
    },

    // Q3 — what is actually setting the action button box?
    actions: {
      shell: describe(shell),
      shellPath: shell ? path(shell, 4) : null,
      equipped: describe(byKind('equipped')),
      secondary: describe(byKind('secondary')),
      icon: describe(byKind('icon')),
      equip: describe(byKind('equip')),
      kindsPresent: actions.map(a => a.getAttribute('data-fs-action-kind')),
    },

    // Supporting context
    panel: {
      root: describe(root),
      before: pseudo(root, '::before'),
      after: pseudo(root, '::after'),
      directChildren: [...root.children].map(describe),
    },
    toolButtons: icons.map(describe),
    pager: pages.map(describe),
    itemRow: {
      overlay: describe(overlay),
      icon: describe(overlay?.querySelector('.fs-inv-icon')),
      name: describe(overlay?.querySelector('.fs-inv-name')),
    },

    // Did any skin asset fail to load?
    failedAssets: performance.getEntriesByType('resource')
      .filter(e => /chrome-extension:/.test(e.name) && e.transferSize === 0 && e.decodedBodySize === 0)
      .map(e => e.name.split('/').pop())
      .slice(0, 20),
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwCapture = capture;

  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'iw-inventory-capture.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-inventory-capture.json');
  } catch (e) {
    console.warn('[iw] Download blocked:', e.message);
  }

  try {
    copy(json);
    console.log('[iw] Also copied to clipboard.');
  } catch {
    console.log('[iw] Clipboard copy unavailable — use the downloaded file.');
  }

  console.log(
    `[iw] root ${capture.meta.counts.rowsRendered} rows | ` +
    `${capture.meta.counts.filters} filters (active flag: ${capture.meta.counts.activeFilterFound}) | ` +
    `${capture.meta.counts.icons} tool buttons | ` +
    `${capture.meta.counts.actionsInFirstRow} actions in row 1`
  );
  if (capture.failedAssets.length) {
    console.warn('[iw] extension assets that loaded 0 bytes:', capture.failedAssets);
  }
  console.log(capture);
})();
