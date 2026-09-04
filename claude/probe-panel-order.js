/* ============================================================================
   IdleWorlds Fantasy Skin — panel-order probe  (v2: captures ALL copies)

   READ-ONLY. The page ships the panel stack TWICE: a wide two-column
   `hidden xl:grid` section, and a narrow single-column `xl:hidden` stack.
   v1 only saw whichever was visible at capture time. v2 enumerates every
   Action Log panel and every Inventory root, pairs each by nearest common
   ancestor, and reports — per pairing — whether Action Log and Inventory are
   flex/grid SIBLINGS in one container (=> a scoped CSS `order:` swap can lift
   Action Log above Inventory, §1/§2 safe) or sit in separate columns
   (=> CSS reorder can't reach across, request needs another approach).

   RUN once per route (Main Game, Dungeon) at your NORMAL play width.
   F12 -> Console, paste, Enter. Downloads iw-panel-order-<route>.json.
   ========================================================================= */

(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const cls = el => String(el.className?.baseVal ?? el.className ?? '').trim().split(/\s+/).slice(0, 12).join('.');
  const rect = el => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(0), h: +r.height.toFixed(0), y: +r.top.toFixed(0) }; };
  const desc = el => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (cls(el) ? '.' + cls(el) : '');
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const chain = el => { const out = []; let c = el; while (c && c !== document.body) { out.push(c); c = c.parentElement; } return out; };

  const allActionLogs = [...document.querySelectorAll('[data-iw-panel="action-log"]')];
  let allInventories = [...document.querySelectorAll('[data-iw-inventory-root="1"]')];
  if (!allInventories.length) {
    allInventories = [...document.querySelectorAll('h1,h2,h3,h4')]
      .filter(h => /^inventory$/i.test(norm(h.textContent)))
      .map(h => h.closest('div.panel') || h.closest('div'))
      .filter(Boolean);
  }

  // Which layout variant a node lives in, by walking its ancestors' class lists.
  const variantOf = el => {
    for (const a of chain(el)) {
      const c = ' ' + String(a.className || '') + ' ';
      if (/\sxl:hidden\s/.test(c)) return 'narrow (xl:hidden single-column stack)';
      if (/\shidden\s/.test(c) && /\sxl:grid\s/.test(c)) return 'wide (hidden xl:grid two-column)';
    }
    return 'other/unknown';
  };

  const pairings = [];
  for (const al of allActionLogs) {
    const alChainSet = new Set(chain(al));
    // nearest inventory that shares an ancestor with this action-log
    let best = null, bestCommon = null, bestDepth = Infinity;
    for (const inv of allInventories) {
      let common = null, d = 0;
      for (const anc of chain(inv)) { if (alChainSet.has(anc)) { common = anc; break; } d++; }
      if (common && d < bestDepth) { best = inv; bestCommon = common; bestDepth = d; }
    }
    if (!best) { pairings.push({ variant: variantOf(al), note: 'no inventory shares an ancestor with this action-log' }); continue; }

    const childFor = (panel, common) => { let c = panel; while (c && c.parentElement !== common) c = c.parentElement; return c; };
    const alChild = childFor(al, bestCommon);
    const invChild = childFor(best, bestCommon);
    const g = getComputedStyle(bestCommon);

    pairings.push({
      variant: variantOf(al),
      actionLogVisible: visible(al),
      inventoryVisible: visible(best),
      commonAncestor: {
        el: desc(bestCommon), rect: rect(bestCommon),
        display: g.display, flexDirection: g.flexDirection,
        gridTemplateColumns: g.gridTemplateColumns,
        childCount: bestCommon.children.length,
      },
      siblingsInSameContainer: alChild?.parentElement === invChild?.parentElement,
      sameDirectChild: alChild === invChild,
      directChildHoldingActionLog: alChild ? { el: desc(alChild), rect: rect(alChild), order: getComputedStyle(alChild).order,
        otherPanels: [...alChild.querySelectorAll('[data-iw-panel]')].map(p => p.dataset.iwPanel) } : null,
      directChildHoldingInventory: invChild ? { el: desc(invChild), rect: rect(invChild), order: getComputedStyle(invChild).order,
        otherPanels: [...invChild.querySelectorAll('[data-iw-panel]')].map(p => p.dataset.iwPanel) } : null,
      orderNowByY: (alChild && invChild)
        ? (rect(alChild).y <= rect(invChild).y ? 'action-log at/above inventory' : 'inventory above action-log')
        : 'n/a',
      // If siblings: the full ordered child list of the shared container.
      sharedContainerChildren: (alChild?.parentElement === invChild?.parentElement && alChild?.parentElement)
        ? [...alChild.parentElement.children].map(c => ({
            el: desc(c), y: rect(c).y, order: getComputedStyle(c).order,
            isActionLogBranch: c === alChild, isInventoryBranch: c === invChild,
            panels: [...c.querySelectorAll('[data-iw-panel]')].map(p => p.dataset.iwPanel),
            hasInventory: c.querySelector('[data-iw-inventory-root="1"]') ? true : /inventory/i.test(norm(c.textContent).slice(0, 40)),
          }))
        : null,
    });
  }

  const report = {
    route: location.pathname,
    viewport: { w: innerWidth, h: innerHeight },
    counts: { actionLogPanels: allActionLogs.length, inventoryRoots: allInventories.length },
    pairings,
  };

  const json = JSON.stringify(report, null, 2);
  window.__iwPanelOrder = report;
  console.log(report);
  try {
    const slug = (location.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root');
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `iw-panel-order-${slug}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    console.log('[iw] downloaded iw-panel-order-' + slug + '.json');
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  try { copy(json); console.log('[iw] copied to clipboard'); } catch {}
})();
