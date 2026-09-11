/* ============================================================================
   IdleWorlds Fantasy Skin — panel-layout probe (v3)

   Supersedes claude/probe-panel-order.js, which asked one question ("can
   Action Log be lifted above Inventory?") about one pair of panels. This one
   asks the general question a drag-to-reorder feature needs answered:

       For every panel on this route, in every copy of the panel stack:
       what is the flex/grid ITEM, what container holds it, and does that
       container actually respond to `order`?

   Why it has to be measured rather than reasoned about: the game stacks things
   with Tailwind `space-y-*` in several places (the inventory list, the quest
   zone bodies), and `space-y-*` is MARGIN spacing on a BLOCK container. In a
   block container the `order` property does nothing at all. If the dashboard
   columns are block stacks, reordering needs the skin to set
   `display:flex; flex-direction:column` on the column first — a real design
   decision with its own consequences, not a detail.

   It also runs a live SELF-TEST: it applies the candidate mechanism to one
   real panel, measures whether the panel actually moved, and puts everything
   back. That is the only evidence that settles the question.

   MUTATION NOTICE. Everything except the self-test is read-only. The self-test
   writes inline styles on at most two nodes and restores their exact previous
   `style` attribute values in a `finally`. Set window.__iwProbeOpts =
   {selfTest:false} before pasting to skip it.

   RUN at your NORMAL play width, on the main game page. Then run it AGAIN with
   the window narrower than 1280px, because which copy of the panel stack is
   live swaps at that breakpoint. F12 -> Console, paste, Enter. It downloads
   iw-panel-layout-<route>-<width>.json and copies the same to the clipboard.
   ========================================================================= */

(() => {
  const OPTS = { selfTest: true, ...(window.__iwProbeOpts || {}) };

  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const label = t => norm(t).replace(/^[^\p{L}\p{N}]+/u, '');
  const clsOf = el => String(el.className?.baseVal ?? el.className ?? '').trim();
  const desc = el => el.tagName.toLowerCase()
    + (el.id ? `#${el.id}` : '')
    + (clsOf(el) ? '.' + clsOf(el).split(/\s+/).slice(0, 10).join('.') : '');
  const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const rendered = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const chain = el => { const out = []; for (let c = el; c && c !== document.body; c = c.parentElement) out.push(c); return out; };

  /* ---- what a panel calls itself -------------------------------------- */

  /* The same identity CollapsibleFrames.frameKey() builds, so the probe
     reports exactly the keys a reorder feature would have to persist. A panel
     that reports key:null here is a panel a saved arrangement cannot name. */
  const titleOf = p => p.querySelector('[data-iw-ui="section-title"]')
    || p.querySelector('[role="heading"]')
    || p.querySelector('h1, h2, h3, h4');

  const keyOf = p => {
    const slug = p.dataset?.iwPanel || p.querySelector('[data-iw-panel]')?.dataset.iwPanel;
    if (slug) return `panel:${slug}`;
    const name = label(titleOf(p)?.textContent).toLowerCase();
    return name ? `title:${name}` : null;
  };

  /* ---- how a container spaces its children ---------------------------- */

  /* The distinction the whole feature turns on. `order` is honoured only by a
     flex or grid container; `space-y-*` is a block container with margins and
     ignores it silently — which looks exactly like a broken CSS rule. */
  const containerKind = el => {
    const g = getComputedStyle(el);
    const d = g.display;
    const flexy = /^(flex|inline-flex|grid|inline-grid)$/.test(d);
    const spaceY = /(^|\s)space-y-[\d.]+/.test(clsOf(el));
    return {
      el: desc(el),
      display: d,
      flexDirection: g.flexDirection,
      gridTemplateColumns: g.gridTemplateColumns,
      gridTemplateRows: g.gridTemplateRows,
      gridAutoFlow: g.gridAutoFlow,
      gap: g.gap,
      alignItems: g.alignItems,
      position: g.position,
      childCount: el.children.length,
      /* The verdict line. */
      honoursOrder: flexy,
      spacedByMargins: spaceY,
      needsDisplayFlexFirst: !flexy,
      classes: clsOf(el).split(/\s+/).slice(0, 24),
    };
  };

  /* ---- which mirror copy is which ------------------------------------- */

  /* CLAUDE.md is emphatic that a class-name test gets this BACKWARDS below
     1280px, so the authoritative answer is rendered state; the class is
     reported alongside only so the two can be compared. */
  const variantOf = el => {
    for (const a of chain(el)) {
      const c = ' ' + clsOf(a) + ' ';
      if (/\sxl:hidden\s/.test(c)) return 'narrow (xl:hidden stack)';
      if (/\shidden\s/.test(c) && /\sxl:grid\s/.test(c)) return 'wide (hidden xl:grid)';
    }
    return 'unclassified';
  };

  /* ---- the panels ------------------------------------------------------ */

  /* `.panel` is one of the four durable hooks the app ships, and a `.panel`
     that wraps another `.panel` is a layout column, not a panel — the same
     leaf test ui-system.css and CollapsibleFrames both use. */
  const panels = [...document.querySelectorAll('.panel')].filter(p => !p.querySelector('.panel'));

  /* The flex/grid ITEM for a panel is not necessarily the panel: it is
     whichever ancestor is a direct child of the container. Reordering has to
     be written THERE, not on the panel. */
  const itemFor = (panel, container) => {
    let c = panel;
    while (c && c.parentElement && c.parentElement !== container) c = c.parentElement;
    return c?.parentElement === container ? c : null;
  };

  const records = panels.map(panel => {
    const parent = panel.parentElement;
    const item = parent ? itemFor(panel, parent) : null;
    return {
      key: keyOf(panel),
      title: label(titleOf(panel)?.textContent) || null,
      el: desc(panel),
      rendered: rendered(panel),
      variant: variantOf(panel),
      rect: box(panel),
      /* Is the panel itself the flex item, or is it wrapped? */
      isDirectChildOfContainer: item === panel,
      itemEl: item ? desc(item) : null,
      itemOrder: item ? getComputedStyle(item).order : null,
      container: parent ? containerKind(parent) : null,
      /* Everything the skin has already tagged here, so the reorder module
         knows which other owners are present (the two-writers trap). */
      skinAttrs: Object.keys(panel.dataset || {}).filter(k => k.startsWith('iw')),
    };
  });

  /* ---- group panels by the container that holds them ------------------ */

  const groups = [];
  for (const r of records) {
    if (!r.container) continue;
    let g = groups.find(x => x.container.el === r.container.el && x.variant === r.variant);
    if (!g) { g = { container: r.container, variant: r.variant, renderedGroup: r.rendered, panels: [] }; groups.push(g); }
    g.panels.push({ key: r.key, title: r.title, y: r.rect.y, itemEl: r.itemEl, order: r.itemOrder });
  }
  for (const g of groups) g.panels.sort((a, b) => a.y - b.y);

  /* ---- THE SELF-TEST --------------------------------------------------- */

  /* Reasoning about whether `order` reaches these boxes is exactly the kind of
     confident-and-wrong this project keeps paying for, so instead: move a real
     panel, measure whether it moved, put it back.

     It picks the largest RENDERED group holding at least two panels, sends the
     last item to the front, and reports before/after geometry. Two variants
     are tried in turn — plain `order` (works only if the container is already
     flex or grid), then `display:flex` on the container plus `order` (the
     fallback a block stack would need). */
  const selfTest = { ran: false };
  if (OPTS.selfTest) {
    const target = groups
      .filter(g => g.renderedGroup && g.panels.length >= 2)
      .sort((a, b) => b.panels.length - a.panels.length)[0];

    if (!target) {
      selfTest.skipped = 'no rendered container holds two or more leaf panels';
    } else {
      const container = [...document.querySelectorAll('*')].find(el => desc(el) === target.container.el);
      const items = container ? [...container.children] : [];
      const last = items[items.length - 1];

      if (!container || !last) {
        selfTest.skipped = 'could not re-resolve the container or its last item';
      } else {
        const prevContainerStyle = container.getAttribute('style');
        const prevItemStyle = last.getAttribute('style');
        const before = box(last).y;
        const firstBefore = box(items[0]);
        try {
          selfTest.ran = true;
          selfTest.container = desc(container);
          selfTest.movedItem = desc(last);
          selfTest.before = { movedItemY: before, firstItemRect: firstBefore };

          /* Variant A: order alone. */
          last.style.setProperty('order', '-1');
          selfTest.orderAlone = { movedItemY: box(last).y, moved: box(last).y < before - 1 };

          /* Variant B: force the container to a flex column first. */
          if (!selfTest.orderAlone.moved) {
            container.style.setProperty('display', 'flex');
            container.style.setProperty('flex-direction', 'column');
            selfTest.withDisplayFlex = {
              movedItemY: box(last).y,
              moved: box(last).y < before - 1,
              /* Did forcing flex disturb what was already there? A width change
                 says the block stack was relying on block-level auto width; a
                 gap change says its margin spacing landed differently. */
              firstItemRectAfter: box(items[0]),
              containerRectAfter: box(container),
            };
          }
        } finally {
          if (prevItemStyle === null) last.removeAttribute('style'); else last.setAttribute('style', prevItemStyle);
          if (prevContainerStyle === null) container.removeAttribute('style'); else container.setAttribute('style', prevContainerStyle);
          selfTest.restored = { movedItemY: box(last).y, backWhereItStarted: Math.abs(box(last).y - before) <= 1 };
        }
      }
    }
  }

  /* ---- report ---------------------------------------------------------- */

  const report = {
    route: location.pathname,
    viewport: { w: innerWidth, h: innerHeight },
    /* 1280 is the load-bearing number: which copy of the stack is live swaps
       here, so a capture is only meaningful with its side recorded. */
    breakpoint: {
      xlActive: matchMedia('(min-width: 1280px)').matches,
      note: innerWidth >= 1280 ? 'wide side of 1280' : 'narrow side of 1280',
    },
    counts: {
      leafPanels: panels.length,
      renderedLeafPanels: records.filter(r => r.rendered).length,
      unkeyedPanels: records.filter(r => !r.key).length,
      containers: groups.length,
      containersHonouringOrder: groups.filter(g => g.container.honoursOrder).length,
    },
    groups,
    panels: records,
    selfTest,
  };

  window.__iwPanelLayout = report;
  console.log(report);
  console.log('[iw] containers honouring `order`:', report.counts.containersHonouringOrder, 'of', report.counts.containers);
  if (selfTest.ran) {
    console.log('[iw] self-test:', selfTest.orderAlone?.moved
      ? 'order ALONE works'
      : (selfTest.withDisplayFlex?.moved ? 'needs display:flex FIRST' : 'NEITHER worked — read the report'));
  }
  if (report.counts.unkeyedPanels) {
    console.warn('[iw]', report.counts.unkeyedPanels, 'panel(s) have no stable identity — a saved arrangement cannot name them');
  }

  const json = JSON.stringify(report, null, 2);
  try {
    const slug = (location.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root') + '-' + innerWidth;
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `iw-panel-layout-${slug}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    console.log('[iw] downloaded iw-panel-layout-' + slug + '.json');
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  try { copy(json); console.log('[iw] copied to clipboard'); } catch {}
})();
