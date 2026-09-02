/**
 * capture-inventory-tools.js — READ ONLY. Paste into the DevTools console on
 * idleworlds.com with the skin loaded. Writes nothing; mutates nothing.
 *
 * WHY THIS EXISTS
 * The inventory panel ships four icon tool buttons and the skin frames them
 * with `nav_frame_idle` via `[data-iw-inventory-control="icon"]`. Live, only
 * three are framed — the fourth (a cube/box glyph) renders bare. The frame art
 * itself is fine: rendered and measured, the sprite window is concentric with
 * its 30x31 box to within 0.0 x 0.73px. So the fourth button is simply never
 * being CLASSIFIED, and `classifyInventoryChrome` has exactly three ways to
 * miss it:
 *
 *   1. it is not a `button` / `a` / `[role="button"]`   (query never sees it)
 *   2. its trimmed textContent is longer than 2 chars   (label/sr-only text)
 *   3. it contains no `<svg>`                           (emoji, <img>, mask)
 *
 * ...or it is not inside the resolved inventory root at all. This dumps enough
 * to tell those four apart. `findInventoryRoot` is deliberately narrow (a
 * looser walk once classified 14 tool buttons across seven panels), so widening
 * it is not a guess to make blind.
 *
 * The page also ships a hidden `xl:hidden` duplicate of the whole column, so
 * every candidate is reported with its rect — a row of {w:0,h:0} is the
 * invisible copy, not the panel you are looking at.
 */
(() => {
  // Report VISIBLE roots first. A docked DevTools pane narrows the viewport
  // past the xl: breakpoint, which flips which copy of the column is live — the
  // first run of this script listed the hidden one first and every rect in it
  // read 0x0, which reads exactly like a broken capture.
  const roots = [...document.querySelectorAll('[data-iw-inventory-root="1"]')]
    .sort((a, b) => (b.getBoundingClientRect().width || 0) - (a.getBoundingClientRect().width || 0));
  if (!roots.length) {
    console.warn('No [data-iw-inventory-root="1"] — is the skin active and the inventory panel open?');
    return;
  }

  const vis = el => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  const describe = el => {
    const raw = String(el.textContent || '');
    const text = raw.replace(/\s+/g, ' ').trim();
    // Text that is present in the DOM but not on screen is the likeliest
    // reason a glyph-only control fails the `length <= 2` test.
    const hidden = [...el.querySelectorAll('*')]
      .filter(n => {
        const cs = getComputedStyle(n);
        return cs.display === 'none' || cs.visibility === 'hidden' ||
          (parseFloat(cs.width) <= 1 && parseFloat(cs.height) <= 1) ||
          /(^|\s)(sr-only|visually-hidden)(\s|$)/.test(n.className || '');
      })
      .map(n => String(n.textContent || '').trim())
      .filter(Boolean);
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || null,
      classified: el.getAttribute('data-iw-inventory-control') || null,
      text,
      textLen: text.length,
      hiddenText: hidden,
      ariaLabel: el.getAttribute('aria-label') || null,
      title: el.getAttribute('title') || null,
      svgCount: el.querySelectorAll('svg').length,
      imgCount: el.querySelectorAll('img').length,
      // Which of the three classifier conditions this control fails.
      failsTagQuery: !el.matches('button, a, [role="button"]'),
      failsTextTest: !(!text || text.length <= 2),
      failsSvgTest: !el.querySelector('svg'),
      className: String(el.className || '').slice(0, 160),
      rect: vis(el),
      parentClass: String(el.parentElement?.className || '').slice(0, 160),
      depthFromRoot: (() => {
        let d = 0, n = el;
        while (n && !n.hasAttribute?.('data-iw-inventory-root')) { n = n.parentElement; d += 1; }
        return n ? d : -1;
      })(),
    };
  };

  const report = roots.map((root, i) => {
    const r = vis(root);
    // Everything clickable in the panel that is NOT inside an item row, plus
    // the same sweep one level ABOVE the root — a tool button sitting just
    // outside the resolved root is the fourth explanation.
    const inRow = el => el.closest('.compact-row, [class*="item-row"]');
    const SEL = 'button, a, [role="button"], [tabindex], [onclick]';
    const inside = [...root.querySelectorAll(SEL)].filter(el => !inRow(el));
    const parent = root.parentElement;
    const outside = parent
      ? [...parent.querySelectorAll(SEL)].filter(el => !inRow(el) && !root.contains(el))
      : [];
    return {
      rootIndex: i,
      rootVisible: r.w > 0 && r.h > 0,
      rootRect: r,
      rootClass: String(root.className || '').slice(0, 200),
      insideRoot: inside.map(describe),
      justOutsideRoot: outside.map(describe),
    };
  });

  const live = report.filter(x => x.rootVisible);
  console.log('=== inventory tool button capture ===');
  console.log(`${report.length} root(s), ${live.length} visible`);
  for (const r of live) {
    const icons = r.insideRoot.filter(c => c.svgCount || c.imgCount || c.textLen <= 2);
    console.log(`\nroot #${r.rootIndex} ${r.rootRect.w}x${r.rootRect.h} — ` +
      `${r.insideRoot.length} controls inside, ${r.justOutsideRoot.length} just outside`);
    console.table(icons.map(c => ({
      tag: c.tag, classified: c.classified, text: c.text.slice(0, 18), len: c.textLen,
      hidden: c.hiddenText.join('|').slice(0, 24), aria: c.ariaLabel, svg: c.svgCount,
      img: c.imgCount, failsTag: c.failsTagQuery, failsText: c.failsTextTest,
      failsSvg: c.failsSvgTest, w: c.rect.w, h: c.rect.h,
    })));
  }

  const json = JSON.stringify(report, null, 2);
  console.log(`\n${json.length} bytes — copy(window.__ivTools) or use the download below`);
  window.__ivTools = report;
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'inventory-tools.json';
  a.textContent = 'download inventory-tools.json';
  a.style.cssText = 'position:fixed;z-index:2147483647;left:8px;bottom:8px;padding:6px 10px;' +
    'background:#111;color:#F0CE7C;font:12px system-ui;border:1px solid #C9A24D';
  document.body.appendChild(a);
  console.log('A download link was added at the bottom-left of the page. Remove it with: ' +
    'document.querySelector(\'a[download="inventory-tools.json"]\').remove()');
  return report;
})();
