/* ============================================================================
   IdleWorlds Fantasy Skin — header width WATCHER

   READ-ONLY. Paste ONCE. It watches the header for ~30 seconds and records a
   snapshot every time the header's width changes, so we catch both the
   one-line and two-line states without you having to run it twice.

   While it runs, just leave the Skills/Game tab open so the buff timers tick
   and the lower-right stat tile flips between one and two lines at least once.

   idleworlds.com, extension enabled, header visible. F12 -> Console, paste,
   Enter, wait for "DONE" (~30s). It downloads iw-headerwidth-watch.json.
   ========================================================================= */

(() => {
  const DURATION_MS = 180000;
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const short = (v, n = 90) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const w = el => (el ? +el.getBoundingClientRect().width.toFixed(2) : null);
  const h = el => (el ? +el.getBoundingClientRect().height.toFixed(2) : null);

  const header = document.querySelector('[data-iw-header="root"]') ||
    [...document.querySelectorAll('header')].find(x => /combat\s+lv/i.test(x.textContent || ''));
  if (!header) { console.error('[iw] no header'); return; }

  const parent = header.parentElement;
  const layout = header.querySelector('[data-iw-header="layout"]');
  const grid = header.querySelector('[data-iw-header="status-grid"]');
  const announcement = document.querySelector('[data-iw-header="announcement"]');
  const zone = document.querySelector('[data-iw-header="zone-shell"]');

  const snap = (reason) => {
    const cs = getComputedStyle(header);
    return {
      t: +(performance.now() / 1000).toFixed(1),
      reason,
      headerW: w(header), headerScrollW: header.scrollWidth,
      headerCssWidth: cs.width, headerMinW: cs.minWidth, headerMaxW: cs.maxWidth,
      headerFlex: cs.flex, headerDisplay: cs.display,
      parentW: w(parent), parentCssWidth: getComputedStyle(parent).width,
      layoutW: w(layout), layoutCols: layout ? getComputedStyle(layout).gridTemplateColumns : null,
      gridW: w(grid), gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
      announcementW: w(announcement),
      zoneW: w(zone),
      tiles: grid ? [...grid.children].map(c => ({
        stat: c.getAttribute('data-iw-header-stat'),
        text: short(norm(c.textContent), 60),
        w: w(c), h: h(c),
      })) : [],
    };
  };

  const frames = [snap('initial')];
  let lastW = frames[0].headerW;

  const ro = new ResizeObserver(() => {
    const cur = +header.getBoundingClientRect().width.toFixed(2);
    if (Math.abs(cur - lastW) > 0.5) {
      lastW = cur;
      frames.push(snap('header-resize'));
    }
  });
  ro.observe(header);
  if (layout) ro.observe(layout);
  if (grid) ro.observe(grid);

  // Also sample on a timer in case a resize is transient.
  const iv = setInterval(() => {
    const cur = +header.getBoundingClientRect().width.toFixed(2);
    if (Math.abs(cur - lastW) > 0.5) { lastW = cur; frames.push(snap('poll')); }
  }, 400);

  setTimeout(() => {
    ro.disconnect(); clearInterval(iv);
    frames.push(snap('final'));
    const distinctWidths = [...new Set(frames.map(f => f.headerW))];
    const capture = {
      meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, durationMs: DURATION_MS },
      distinctHeaderWidths: distinctWidths,
      changed: distinctWidths.length > 1,
      frames,
    };
    const json = JSON.stringify(capture, null, 2);
    window.__iwHeaderWatch = capture;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'iw-headerwidth-watch.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { console.warn('[iw] download blocked — window.__iwHeaderWatch', e.message); }
    try { copy(json); } catch {}
    console.log(`[iw] DONE — header widths seen: ${distinctWidths.join(', ')}`);
    console.log(capture);
  }, DURATION_MS);

  console.log('[iw] watching header width for 30s… leave the tab open so buff timers tick.');
})();
