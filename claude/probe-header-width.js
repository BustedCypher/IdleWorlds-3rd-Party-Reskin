/* ============================================================================
   IdleWorlds Fantasy Skin — header width-stability probe

   READ-ONLY. Reports the width chain from the <header> up to the page
   container and down to the status grid / tiles, so we can see WHICH element's
   width tracks the stat-tile content (the lower-right buff tile swapping
   between one and two lines currently resizes the whole bar; it must not).

   RUN TWICE and attach both files:
     A) with the lower-right buff tile on ONE line
     B) with it wrapped to TWO lines
   (wait for a buff countdown / roster change to flip it, or resize a hair).
   idleworlds.com, extension enabled, header visible. F12 -> Console, paste,
   Enter. Downloads iw-headerwidth-probe-<n>.json (auto-numbered).
   ========================================================================= */

(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const short = (v, n = 120) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 200);
  const rectW = el => +el.getBoundingClientRect().width.toFixed(2);

  const M = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      cls: cls(el),
      iw: [...el.attributes].filter(a => a.name.startsWith('data-iw')).map(a => `${a.name}=${a.value}`),
      rectW: rectW(el),
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
      display: cs.display,
      width: cs.width,
      minWidth: cs.minWidth,
      maxWidth: cs.maxWidth,
      flex: cs.flex,
      alignSelf: cs.alignSelf,
      boxSizing: cs.boxSizing,
      gridTemplateColumns: cs.display.includes('grid') ? cs.gridTemplateColumns : undefined,
      alignItems: (cs.display.includes('grid') || cs.display.includes('flex')) ? cs.alignItems : undefined,
      overflowX: cs.overflowX,
    };
  };

  const header = document.querySelector('[data-iw-header="root"]') ||
    [...document.querySelectorAll('header')].find(h => /combat\s+lv/i.test(h.textContent || ''));
  if (!header) { console.error('[iw] no header found'); return; }

  // Ancestor chain (header -> up to <body>).
  const ancestors = [];
  for (let cur = header; cur && cur !== document.documentElement; cur = cur.parentElement) {
    ancestors.push(M(cur));
    if (cur === document.body) break;
  }

  const layout = header.querySelector('[data-iw-header="layout"]');
  const statusGrid = header.querySelector('[data-iw-header="status-grid"]');
  const statusCards = statusGrid ? [...statusGrid.children].map(c => ({
    ...M(c),
    stat: c.getAttribute('data-iw-header-stat'),
    text: short(norm(c.textContent), 80),
    lines: Math.round(c.getBoundingClientRect().height / (parseFloat(getComputedStyle(c).lineHeight) || 16)),
    rectH: +c.getBoundingClientRect().height.toFixed(1),
  })) : [];

  const capture = {
    meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio } },
    ancestorsFromHeaderUp: ancestors,
    layout: M(layout),
    statusGrid: M(statusGrid),
    statusCards,
    // Widths of the OTHER header-stack bars — these reportedly stay put, so
    // whatever they do is the target behaviour for the header.
    siblingsForReference: {
      nav: (() => { const n = document.querySelector('[data-iw-ui="nav-rail"], nav'); return n ? { rectW: rectW(n), width: getComputedStyle(n).width, display: getComputedStyle(n).display } : null; })(),
      announcement: (() => { const n = document.querySelector('[data-iw-header="announcement"]'); return n ? { rectW: rectW(n), width: getComputedStyle(n).width } : null; })(),
      zoneShell: (() => { const n = document.querySelector('[data-iw-header="zone-shell"]'); return n ? { rectW: rectW(n), width: getComputedStyle(n).width } : null; })(),
    },
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwHeaderWidthProbe = capture;
  const n = (window.__iwHWN = (window.__iwHWN || 0) + 1);
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `iw-headerwidth-probe-${n}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log(`[iw] downloaded iw-headerwidth-probe-${n}.json`);
  } catch (e) { console.warn('[iw] download blocked — window.__iwHeaderWidthProbe', e.message); }
  try { copy(json); } catch {}
  console.log(capture);
})();
