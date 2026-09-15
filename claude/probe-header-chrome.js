/* ============================================================================
   IdleWorlds Fantasy Skin — header chrome compaction probe  (READ-ONLY)

   Answers: why does the nav rail still render at full size after the CSS
   compaction? Reports the actual data-iw-ui role on the nav's frame wrapper,
   its computed padding/border-width, and the zone bar's shape.

   RUN: idleworlds.com, extension enabled, nav+zone bar on screen.
   F12 -> Console, paste, Enter. Copy the printed JSON back into the chat.
   ========================================================================= */
(() => {
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };

  const nav = document.querySelector('[data-iw-ui="main-nav"]');
  const navFrame = nav?.closest('[data-iw-ui="section-frame"], [data-iw-ui="main-nav-shell"]') || nav?.parentElement;
  const navFrameCs = navFrame ? getComputedStyle(navFrame) : null;
  const navAfterCs = navFrame ? getComputedStyle(navFrame, '::after') : null;

  const zoneBar = document.querySelector('[data-iw-ui="zone-bar"]');
  const zoneBarCs = zoneBar ? getComputedStyle(zoneBar) : null;

  const result = {
    navExists: !!nav,
    navFrameRole: navFrame?.dataset?.iwUi || '(none)',
    navFrameTag: navFrame?.tagName,
    navFrameClasses: navFrame ? String(navFrame.className).slice(0, 200) : null,
    navFrameIsPanel: navFrame ? navFrame.classList.contains('panel') : null,
    navFrameBox: box(navFrame),
    navFramePadding: navFrameCs?.padding,
    navFramePadTokenY: navFrameCs?.getPropertyValue('--iw-frame-pad-y'),
    navAfterBorderWidth: navAfterCs?.borderTopWidth,
    navAfterHasImage: navAfterCs ? navAfterCs.borderImageSource !== 'none' : null,
    zoneBarExists: !!zoneBar,
    zoneBarRole: zoneBar?.dataset?.iwUi,
    zoneBarHeaderRole: zoneBar?.getAttribute('data-iw-header'),
    zoneBarBox: box(zoneBar),
    zoneBarPadding: zoneBarCs?.padding,
    extensionBuildMarker: (() => {
      // Any element the skin has ever touched carries no version string, so
      // just confirm the skin is active at all.
      return document.documentElement.hasAttribute('data-iw-zone-theme');
    })(),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
})();
