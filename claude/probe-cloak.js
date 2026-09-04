/* ============================================================================
   IdleWorlds Fantasy Skin — upgradeable-cloak identity probe

   READ-ONLY. Does not modify the page, click anything, or send anything
   anywhere. It reads DOM structure + attributes and hands you a JSON file.

   WHY: after the patch that made cloaks upgradeable, the inventory row for an
   upgradeable cloak renders with a "?" icon and the plain headline
   "Tier 18 • Cloak". That is exactly what the skin's *fallback* path produces
   when it cannot find the item's real name in the row, so we need to see what
   the native row actually contains now — is the full name ("Fortunate Regal
   Cloak of the Harvest+3") present somewhere the parser isn't looking (a
   nested span, a title=/aria-label= attribute, an <img alt>), or is it gone
   from the row entirely and only reachable from the gear/equip panel?

   HOW TO RUN
     1. Open idleworlds.com with the extension enabled, Inventory panel visible,
        and make sure an UPGRADEABLE cloak row is on screen (filter to Gear if
        needed). If you can, also open the gear/equipment window so the
        "Fortunate Regal Cloak of the Harvest+3" card from screenshot 2 is in
        the DOM.
     2. F12 → Console. Paste this whole file, Enter.
     3. It downloads  iw-cloak-probe.json  and copies it to the clipboard.
        Attach the FILE to the chat.
   ========================================================================= */

(() => {
  const short = (v, n = 200) => {
    const s = String(v ?? '');
    return s.length > n ? s.slice(0, n) + `…(${s.length})` : s;
  };

  const attrs = (el) => [...el.attributes]
    .filter(a => a.name !== 'class' && a.name !== 'style')
    .map(a => `${a.name}=${JSON.stringify(short(a.value, 120))}`);

  // Own (direct) text only — not descendant text.
  const ownText = (el) => [...el.childNodes]
    .filter(n => n.nodeType === 3)
    .map(n => n.nodeValue.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ⏐ ');

  const describe = (el) => {
    if (!el || el.nodeType !== 1) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      classes: short(el.className?.baseVal ?? el.className, 200),
      childCount: el.childElementCount,
      attrs: attrs(el),
      ownText: short(ownText(el), 160) || null,
      rect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      bg: short(cs.backgroundImage, 90),
    };
  };

  // Full element dump of a subtree, depth-first, with indices so nesting is
  // reconstructable.
  const dumpTree = (root, cap = 400) => {
    const out = [];
    const walk = (el, depth) => {
      if (out.length >= cap) return;
      out.push({ depth, ...describe(el) });
      for (const c of el.children) walk(c, depth + 1);
    };
    if (root) walk(root, 0);
    return out;
  };

  const pathOf = (el, stop = 10) => {
    const out = [];
    let cur = el;
    for (let i = 0; cur && i < stop; i++, cur = cur.parentElement) {
      const cls = String(cur.className?.baseVal ?? cur.className ?? '');
      out.push(
        cur.tagName.toLowerCase() +
        (cls ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : '') +
        `«${short(ownText(cur), 40)}»`
      );
    }
    return out;
  };

  const ROW_SEL = '.compact-row, [class*="item-row"]';

  // 1. Every inventory row: full text + whether the skin has already skinned it.
  const rows = [...document.querySelectorAll(ROW_SEL)].map((row, i) => {
    const skinned = row.querySelector(':scope > .fs-inv-row');
    return {
      index: i,
      fullText: short((row.textContent || '').replace(/\s+/g, ' ').trim(), 300),
      hasSkinOverlay: !!skinned,
      skinIconText: short(skinned?.querySelector('.fs-inv-icon')?.textContent || '', 10),
      skinName: short(skinned?.querySelector('.fs-inv-name')?.textContent || '', 80),
    };
  });

  // 2. Deep dump of any row that looks like a cloak / upgradeable item.
  const cloakRows = [...document.querySelectorAll(ROW_SEL)]
    .filter(row => /cloak|tier\s*\d+\s*[·•]/i.test(row.textContent || ''))
    .map((row, i) => ({
      which: i,
      path: pathOf(row, 6),
      tree: dumpTree(row, 300),
    }));

  // 3. Anything anywhere containing the real cloak name from screenshot 2.
  //    Walk text nodes so we catch it even inside a canvas-adjacent panel.
  const NEEDLE = /cloak of (?:the harvest|fortune|insight)|regal (?:silk )?cloak/i;
  const nameHits = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let tn;
  while ((tn = tw.nextNode())) {
    const t = tn.nodeValue.replace(/\s+/g, ' ').trim();
    if (t && NEEDLE.test(t) && nameHits.length < 15) {
      nameHits.push({
        text: short(t, 160),
        parentPath: pathOf(tn.parentElement, 8),
        parentTree: dumpTree(tn.parentElement?.closest('[class*="compact"], [class*="panel"], [class*="card"], [class*="row"]') || tn.parentElement, 120),
      });
    }
  }

  // 4. Attribute sweep inside the inventory root: any title / aria-label / alt
  //    that carries a plausible item name.
  const invRoot = document.querySelector('[data-iw-inventory-root]') ||
    [...document.querySelectorAll('*')].find(el => /^inventory$/i.test((el.getAttribute('aria-label') || '').trim()));
  const labelledInRoot = invRoot ? [...invRoot.querySelectorAll('[title],[aria-label],[alt],[data-name],[data-item],[data-item-id],img')]
    .map(el => ({
      tag: el.tagName.toLowerCase(),
      title: el.getAttribute('title'),
      ariaLabel: el.getAttribute('aria-label'),
      alt: el.getAttribute('alt'),
      src: short(el.getAttribute('src'), 120),
      data: attrs(el).filter(a => /^data-/.test(a)),
      inRowIndex: [...document.querySelectorAll(ROW_SEL)].findIndex(r => r.contains(el)),
    }))
    .slice(0, 60) : [];

  const capture = {
    meta: {
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      rowCount: rows.length,
      cloakRowCount: cloakRows.length,
      nameHitCount: nameHits.length,
      invRootFound: !!invRoot,
    },
    rows,
    cloakRows,
    nameHits,
    labelledInRoot,
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwCloakProbe = capture;

  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'iw-cloak-probe.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-cloak-probe.json');
  } catch (e) {
    console.warn('[iw] Download blocked:', e.message, '— JSON is at window.__iwCloakProbe');
  }
  try { copy(json); console.log('[iw] Also copied to clipboard.'); } catch {}
  console.log(capture);
})();
