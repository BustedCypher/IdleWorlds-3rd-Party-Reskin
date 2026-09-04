/* ============================================================================
   IdleWorlds Fantasy Skin — main nav rim probe  (READ-ONLY)

   Answers one question: why does the rim around the tab rail stop before
   DUNGEON? Reports whether every labelled tab is actually inside the element
   that draws the rim ([data-iw-ui="main-nav"]), the rim box vs the union of
   the tab boxes, and the paint each tab computes.

   RUN: idleworlds.com, extension enabled, nav on screen. F12 -> Console,
   paste, Enter. Copy the printed JSON back into the chat.
   ========================================================================= */
(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const box = el => { const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const cls = el => String(el.className?.baseVal ?? el.className ?? '').slice(0, 160);
  const LABELS = ['game', 'market', 'leaderboards', 'village', 'dungeon'];

  const all = [...document.querySelectorAll('button, a, [role="tab"]')];
  const hits = [];
  for (const el of all) {
    const label = norm(el.textContent).toLowerCase().replace(/^[^a-z0-9]+/i, '');
    if (LABELS.includes(label)) hits.push({ label, el });
  }

  const nav = document.querySelector('[data-iw-ui="main-nav"]');
  const shell = document.querySelector('[data-iw-ui="main-nav-shell"]');

  const chain = el => { const out = []; let n = el.parentElement;
    for (let i = 0; i < 6 && n; i += 1, n = n.parentElement) {
      out.push({ tag: n.tagName.toLowerCase(), classes: cls(n), box: box(n),
        iw: [...n.attributes].filter(a => a.name.startsWith('data-iw')).map(a => `${a.name}=${a.value}`) });
    } return out; };

  const tabInfo = ({ label, el }) => {
    const cs = getComputedStyle(el);
    return {
      label, tag: el.tagName.toLowerCase(), classes: cls(el), box: box(el),
      visible: el.getBoundingClientRect().width > 1,
      role: el.dataset.iwUi || null, state: el.dataset.iwState || null,
      insideNav: !!(nav && nav.contains(el)),
      parentTag: el.parentElement?.tagName.toLowerCase(),
      parentClasses: el.parentElement ? cls(el.parentElement) : null,
      isFlexItemOfNav: el.parentElement === nav,
      lastOfType: el.matches(':last-of-type'),
      paint: { background: cs.backgroundImage === 'none' ? cs.backgroundColor : cs.backgroundImage.slice(0, 90),
        border: cs.border, borderRight: cs.borderRight, borderLeft: cs.borderLeft,
        color: cs.color, boxShadow: cs.boxShadow.slice(0, 90), flex: cs.flex },
      chain: chain(el),
    };
  };

  const el = n => n && ({ tag: n.tagName.toLowerCase(), classes: cls(n), box: box(n),
    style: (cs => ({ display: cs.display, width: cs.width, maxWidth: cs.maxWidth, overflow: cs.overflow,
      flexWrap: cs.flexWrap, border: cs.border, borderRadius: cs.borderRadius, background: cs.backgroundColor,
      boxShadow: cs.boxShadow.slice(0, 90), padding: cs.padding }))(getComputedStyle(n)),
    scroll: { sw: n.scrollWidth, cw: n.clientWidth }, childCount: n.children.length,
    children: [...n.children].map(c => ({ tag: c.tagName.toLowerCase(), classes: cls(c),
      text: norm(c.textContent).slice(0, 30), box: box(c) })) });

  const tabs = hits.map(tabInfo);
  const vis = tabs.filter(t => t.visible);
  const union = vis.length ? {
    x: Math.min(...vis.map(t => t.box.x)),
    right: Math.max(...vis.map(t => t.box.x + t.box.w)),
  } : null;

  const out = {
    url: location.href, viewport: { w: innerWidth, h: innerHeight },
    labelledButtonsFound: tabs.length,
    navRim: el(nav), navShell: el(shell),
    unionOfVisibleTabs: union,
    rimRightEdge: nav ? +(nav.getBoundingClientRect().right).toFixed(1) : null,
    tabsOutsideRim: tabs.filter(t => t.visible && !t.insideNav).map(t => t.label),
    tabs,
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
})();
