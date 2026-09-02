/* ============================================================================
   IdleWorlds Fantasy Skin — header / nav / announcement / zone-bar capture

   READ-ONLY. Reports, for the visible header stack:
     - which data-iw-header roles landed, and on what
     - the header plate's content box vs the corner-ornament overlay
     - every status tile: box, whether its text is CLIPPED (scrollWidth >
       clientWidth), and its computed type
     - the utility cluster and profile block geometry
     - nav tabs, announcement, and the zone bar (per-button label, whether
       data-iw-ui="zone-action" / data-iw-zone-action landed, computed paint)
     - which header artwork URLs resolved vs returned 0 bytes

   RUN: idleworlds.com, extension enabled, header on screen. F12 -> Console,
   paste, Enter. Attach the downloaded iw-header-capture.json.
   ========================================================================= */

(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const short = (v, n = 150) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 200);
  const box = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };

  const desc = (el, depth = 0) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {
      tag: el.tagName.toLowerCase(), classes: cls(el),
      iw: [...el.attributes].filter(a => a.name.startsWith('data-iw')).map(a => `${a.name}=${a.value}`),
      box: box(el), text: short(norm(el.textContent), 90),
      clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
      scroll: { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight },
      style: {
        display: cs.display, gridTemplateColumns: cs.gridTemplateColumns, gridTemplateAreas: short(cs.gridTemplateAreas, 80),
        padding: cs.padding, margin: cs.margin, gap: cs.gap, border: cs.border, borderRadius: cs.borderRadius,
        overflow: cs.overflow, font: short(cs.font, 70), color: cs.color, whiteSpace: cs.whiteSpace,
        backgroundImage: short(cs.backgroundImage, 120), backgroundSize: short(cs.backgroundSize, 60),
        alignItems: cs.alignItems, justifyContent: cs.justifyContent, minHeight: cs.minHeight,
      },
    };
    if (depth > 0) out.children = [...el.children].slice(0, 14).map(c => desc(c, depth - 1));
    return out;
  };

  const pseudo = (el, which) => {
    if (!el) return null;
    const cs = getComputedStyle(el, which);
    return {
      content: short(cs.content, 30), position: cs.position, inset: cs.inset, zIndex: cs.zIndex,
      backgroundImage: short(cs.backgroundImage, 110), backgroundSize: short(cs.backgroundSize, 80),
      backgroundPosition: short(cs.backgroundPosition, 80), maskSize: short(cs.maskSize || cs.webkitMaskSize, 60),
    };
  };

  const root = document.querySelector('[data-iw-header="root"]') ||
    [...document.querySelectorAll('header')].find(visible) || null;

  // Zone bar — the region that looked vanilla.
  const zoneShell = document.querySelector('[data-iw-header="zone-shell"]') ||
    document.querySelector('[data-iw-ui="zone-bar"]') ||
    [...document.querySelectorAll('div,section')].filter(visible)
      .filter(el => /zone\s*\d+\s*:/i.test(el.textContent) && /next zone/i.test(el.textContent))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;

  const zoneButtons = zoneShell ? [...zoneShell.querySelectorAll('button,a,[role="button"]')].map(b => {
    const cs = getComputedStyle(b);
    return {
      rawText: short(norm(b.textContent), 40),
      normalized: norm(b.textContent).toLowerCase(),
      strippedLeadingIcon: norm(b.textContent).toLowerCase().replace(/^[^a-z0-9]+/i, '').trim(),
      iwUi: b.getAttribute('data-iw-ui'), iwZoneAction: b.getAttribute('data-iw-zone-action'),
      box: box(b),
      paint: { background: short(cs.background, 110), backgroundImage: short(cs.backgroundImage, 110), border: cs.border, borderRadius: cs.borderRadius, font: short(cs.font, 60), color: cs.color },
    };
  }) : [];

  const statusGrid = document.querySelector('[data-iw-header="status-grid"]');
  const statusCards = statusGrid ? [...statusGrid.children].map(c => ({
    ...desc(c, 0),
    innerLeaves: [...c.querySelectorAll('*')].filter(n => n.childElementCount === 0)
      .map(n => ({ tag: n.tagName.toLowerCase(), text: short(norm(n.textContent), 50), w: +n.getBoundingClientRect().width.toFixed(1) })),
  })) : [];

  const nav = document.querySelector('[data-iw-ui="main-nav"]');
  const navTabs = nav ? [...nav.querySelectorAll('button,a')].map(b => ({
    text: norm(b.textContent), iwUi: b.getAttribute('data-iw-ui'), state: b.getAttribute('data-iw-state'),
    box: box(b), bg: short(getComputedStyle(b).backgroundImage, 90),
  })) : [];

  const assetPerf = performance.getEntriesByType('resource').filter(e => /chrome-extension:.*assets\/header\//.test(e.name));

  const capture = {
    meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio } },
    rolesPresent: [...document.querySelectorAll('[data-iw-header]')]
      .map(el => `${el.getAttribute('data-iw-header')} {${box(el).w}x${box(el).h}}`),
    header: root ? {
      el: desc(root, 2),
      after: pseudo(root, '::after'),
      before: pseudo(root, '::before'),
      contentBox: (() => { const cs = getComputedStyle(root); return { padding: cs.padding, width: root.clientWidth, overflow: cs.overflow }; })(),
    } : null,
    identityRegion: desc(document.querySelector('[data-iw-header="identity-region"]'), 1),
    profile: desc(document.querySelector('[data-iw-header="profile"]'), 1),
    crest: desc(document.querySelector('.fs-header-crest'), 0),
    utilities: desc(document.querySelector('[data-iw-header="utilities"]'), 1),
    statusGrid: desc(statusGrid, 0),
    statusCards,
    nav: { el: desc(nav, 0), tabs: navTabs },
    announcement: desc(document.querySelector('[data-iw-header="announcement"]'), 0),
    zoneBar: { el: desc(zoneShell, 1), buttons: zoneButtons },
    headerAssets: assetPerf.map(e => ({ file: e.name.split('/').pop(), bytes: e.transferSize || e.decodedBodySize || e.encodedBodySize || 0 })),
    failedExtensionAssets: performance.getEntriesByType('resource')
      .filter(e => /chrome-extension:/.test(e.name) && e.transferSize === 0 && e.decodedBodySize === 0)
      .map(e => e.name.split('/').slice(-2).join('/')),
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwHeaderCapture = capture;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'iw-header-capture.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-header-capture.json');
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  try { copy(json); console.log('[iw] copied to clipboard'); } catch {}
  console.log(capture);
})();
