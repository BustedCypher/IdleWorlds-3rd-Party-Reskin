/**
 * probe-inventory-toolrow.js — READ ONLY. Paste into the DevTools console on
 * idleworlds.com with the skin active and the inventory visible.
 *
 * Two questions, one probe.
 *
 * 1. WHERE IS THE CUBE? capture-inventory-tools.js proved the visible inventory
 *    root (607x698, `panel p-3.5`) holds exactly 12 controls — 3 icons, 5
 *    filters, 4 page buttons — and every one of them is already classified.
 *    Nothing interactive sits outside the root anywhere near the icon row
 *    either. So the cube is NOT a button / a / [role=button] / [tabindex]: it
 *    is a bare <svg>, <div> or <span>, most likely with a React onClick, which
 *    no attribute selector can see. This dumps EVERY child of the row, not
 *    just the interactive ones, plus the row's outerHTML.
 *
 * 2. WHY IS THE FUNNEL 3px HIGH? The capture measured Filter at y=473 against
 *    Search and Equipment at y=476, all three 31px tall. Filter is the one
 *    wrapped in `div.relative`. Modelling that wrapper as a bare shrink-wrap
 *    reproduces NO offset, so the wrapper has geometry of its own — this
 *    reports it rather than guessing at it again.
 *
 * Everything is pinned to the VISIBLE copy: the page ships a hidden xl:hidden
 * duplicate, and a docked DevTools pane narrows the viewport past the xl:
 * breakpoint, which is how the previous capture ended up reporting a root whose
 * every rect was 0x0.
 */
(() => {
  const seen = el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const rect = el => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const cls = el => (typeof el.className === 'string' ? el.className : el.className?.baseVal || '');

  const icons = [...document.querySelectorAll('[data-iw-inventory-control="icon"]')].filter(seen);
  if (!icons.length) {
    console.warn('No VISIBLE classified icon controls. Undock DevTools (or widen the window) so the ' +
      'desktop column is the live one, then re-run.');
    return;
  }

  // The row is the nearest ancestor that contains more than one of them.
  let row = icons[0].parentElement;
  for (let i = 0; row && i < 6; i += 1, row = row.parentElement) {
    if (icons.filter(b => row.contains(b)).length === icons.length) break;
  }

  const describe = el => ({
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute?.('role') || null,
    tabindex: el.getAttribute?.('tabindex') || null,
    aria: el.getAttribute?.('aria-label') || null,
    title: el.getAttribute?.('title') || null,
    classified: el.getAttribute?.('data-iw-inventory-control') || null,
    text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
    svg: el.querySelectorAll?.('svg').length ?? 0,
    // A React onClick leaves no `onclick` attribute, so this is the only hint
    // available from the DOM that an element is meant to be clicked.
    cursor: getComputedStyle(el).cursor,
    display: getComputedStyle(el).display,
    rect: rect(el),
    cls: cls(el).slice(0, 110),
  });

  const out = {
    row: { ...describe(row), childCount: row.children.length },
    // Every child, interactive or not — this is where the cube must be.
    rowChildren: [...row.children].map(describe),
    // Question 2: the wrapper geometry the fixture could not guess.
    iconWrappers: icons.map(b => ({
      aria: b.getAttribute('aria-label'),
      button: { rect: rect(b), display: getComputedStyle(b).display, vAlign: getComputedStyle(b).verticalAlign },
      wrapper: {
        ...describe(b.parentElement),
        alignSelf: getComputedStyle(b.parentElement).alignSelf,
        padding: getComputedStyle(b.parentElement).padding,
        lineHeight: getComputedStyle(b.parentElement).lineHeight,
        fontSize: getComputedStyle(b.parentElement).fontSize,
        childCount: b.parentElement.children.length,
      },
      wrapperChildren: [...b.parentElement.children].map(describe),
    })),
    rowStyle: (({ display, alignItems, gap, lineHeight, fontSize }) =>
      ({ display, alignItems, gap, lineHeight, fontSize }))(getComputedStyle(row)),
    outerHTML: row.outerHTML.slice(0, 6000),
  };

  console.log('=== inventory tool row ===');
  console.log('row', out.row.rect, out.rowStyle, `\n  ${out.row.cls}`);
  console.table(out.rowChildren);
  console.log('\nicon wrappers (question 2):');
  for (const w of out.iconWrappers) {
    console.log(`  ${w.aria}: button y=${w.button.rect.y} h=${w.button.rect.h} display=${w.button.display} ` +
      `| wrapper <${w.wrapper.tag}> ${JSON.stringify(w.wrapper.rect)} display=${w.wrapper.display} ` +
      `align-self=${w.wrapper.alignSelf} line-height=${w.wrapper.lineHeight} children=${w.wrapper.childCount}`);
  }
  console.log('\nrow outerHTML:\n' + out.outerHTML);

  window.__toolRow = out;
  const json = JSON.stringify(out, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'inventory-toolrow.json';
  a.textContent = 'download inventory-toolrow.json';
  a.style.cssText = 'position:fixed;z-index:2147483647;left:8px;bottom:8px;padding:6px 10px;' +
    'background:#111;color:#F0CE7C;font:12px system-ui;border:1px solid #C9A24D';
  document.body.appendChild(a);
  console.log('\nDownload link added bottom-left. Remove with: ' +
    'document.querySelector(\'a[download="inventory-toolrow.json"]\').remove()');
  return out;
})();
