/* ============================================================================
   IdleWorlds Fantasy Skin — Market page DOM capture

   READ-ONLY. Does not modify the page, click anything, or send anything
   anywhere. Reads structure + computed styles and hands you a JSON file.

   HOW TO RUN
     1. Open idleworlds.com with the extension enabled, click the Market tab
        so the Market panel, item cards AND the "My Listings" block (incl. a
        couple of empty listing slots) are all on screen.
     2. F12 -> Console.
     3. Paste this whole file, press Enter.
     4. Attach the downloaded  iw-market-capture.json  to the chat. (A pasted
        capture was lost to compaction once already on this project — attach
        the FILE.)

   If the download is blocked the JSON is on your clipboard and at
   window.__iwMarketCapture.
   ========================================================================= */

(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const low = t => norm(t).toLowerCase();
  const short = (v, n = 160) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 260);
  const rectOf = el => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1) }; };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };

  const PROPS = [
    'display', 'position', 'boxSizing', 'width', 'height', 'padding', 'margin',
    'border', 'borderColor', 'borderRadius', 'background', 'backgroundColor',
    'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundBlendMode',
    'boxShadow', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing',
    'textTransform', 'opacity', 'gap', 'flex', 'alignItems', 'justifyContent',
    'gridTemplateColumns', 'backdropFilter',
  ];
  const styleOf = el => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of PROPS) o[p] = short(cs[p], 200);
    return o;
  };
  const pseudo = (el, which) => {
    if (!el) return null;
    const cs = getComputedStyle(el, which);
    if (cs.content === 'none') return null;
    return {
      content: short(cs.content, 40),
      background: short(cs.background, 160),
      backgroundImage: short(cs.backgroundImage, 160),
      borderImageSource: short(cs.borderImageSource, 120),
      boxShadow: short(cs.boxShadow, 160),
      inset: `${cs.top} ${cs.right} ${cs.bottom} ${cs.left}`,
    };
  };

  const desc = (el, depth = 0) => {
    if (!el) return null;
    const out = {
      tag: el.tagName.toLowerCase(),
      classes: cls(el),
      id: el.id || null,
      role: el.getAttribute('role') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      childElementCount: el.childElementCount,
      inXlHidden: !!el.closest('[class~="xl:hidden"]'),
      visible: visible(el),
      rect: rectOf(el),
      ownText: short(norm([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ')), 80) || null,
      text: short(norm(el.textContent), 140),
      iwAttrs: [...el.attributes].filter(a => a.name.startsWith('data-iw')).map(a => `${a.name}="${a.value}"`),
      inlineStyle: short(el.getAttribute('style'), 200) || null,
      style: styleOf(el),
      before: pseudo(el, '::before'),
      after: pseudo(el, '::after'),
    };
    if (depth > 0) out.children = [...el.children].slice(0, 20).map(c => desc(c, depth - 1));
    return out;
  };

  const path = (el, stop = 12) => {
    const out = []; let cur = el;
    for (let i = 0; cur && i < stop; i++, cur = cur.parentElement) {
      const c = String(cur.className?.baseVal ?? cur.className ?? '');
      out.push(
        cur.tagName.toLowerCase() + (cur.id ? `#${cur.id}` : '') +
        (c ? '.' + c.trim().split(/\s+/).slice(0, 6).join('.') : '') +
        ` {${rectOf(cur).w}x${rectOf(cur).h}}` +
        ([...cur.attributes].filter(a => a.name.startsWith('data-iw')).map(a => ` ${a.name}=${a.value}`).join('')),
      );
    }
    return out;
  };

  // --- The Market section frame -------------------------------------------
  const marketHeadings = [...document.querySelectorAll('h1,h2,h3,h4')]
    .filter(h => /^market$/i.test(norm(h.textContent)));
  const marketHeading = marketHeadings.find(visible) || marketHeadings[0] || null;
  const sectionFrame = marketHeading
    ? marketHeading.closest('[data-iw-ui="section-frame"], [data-iw-inventory-root="1"]')
    : null;
  const marketPanel = marketHeading ? marketHeading.closest('.panel') : null;

  // --- Item / listing rows ----------------------------------------------
  // Cards under the frame that are NOT the frame itself and look like a row:
  // have their own background and hold a price-ish "g" token.
  const scope = sectionFrame || marketPanel || document.body;
  const candidateRows = [...scope.querySelectorAll('div')].filter(el => {
    if (!visible(el)) return false;
    if (el === sectionFrame || el === marketPanel) return false;
    const r = el.getBoundingClientRect();
    if (r.height < 28 || r.height > 220 || r.width < 180) return false;
    const cs = getComputedStyle(el);
    const painted = cs.backgroundImage !== 'none' ||
      !/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/.test(cs.backgroundColor);
    return painted;
  });
  // Keep only the outermost painted box per branch (the card, not its inner fills).
  const rows = candidateRows
    .filter((el, _i, arr) => !arr.some(o => o !== el && o.contains(el) && o !== el))
    .slice(0, 14)
    .map(el => ({ ...desc(el, 1), ancestry: path(el, 8) }));

  // --- Toolbar controls -------------------------------------------------
  const controlLabels = /^(filter|create buy order|view buy orders|view npc buyer|history|prev|next|reprice|cancel|buy|sell|confirm)$/i;
  const controls = [...scope.querySelectorAll('button,[role="button"],a')]
    .filter(visible)
    .filter(el => controlLabels.test(norm(el.textContent)))
    .filter((el, i, arr) => arr.findIndex(o => norm(o.textContent).toLowerCase() === norm(el.textContent).toLowerCase()) === i)
    .map(el => desc(el, 0));

  // --- Inputs ---------------------------------------------------------
  const inputs = [...scope.querySelectorAll('input,textarea,select')]
    .filter(visible)
    .map(el => ({ ...desc(el, 0), placeholder: el.getAttribute('placeholder') || null }));

  // --- "My Listings" block + empty slots ------------------------------
  const myListingsHeading = [...document.querySelectorAll('*')]
    .filter(el => el.childElementCount === 0 && /^my listings$/i.test(norm(el.textContent)))[0] || null;
  const emptySlots = [...scope.querySelectorAll('*')]
    .filter(el => el.childElementCount === 0 && /^empty listing slot$/i.test(norm(el.textContent)))
    .map(el => ({ ...desc(el.parentElement || el, 0), labelAncestry: path(el, 6) }))
    .slice(0, 4);

  const capture = {
    meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight }, ts: new Date().toISOString() },
    marketHeading: marketHeading ? { ...desc(marketHeading, 0), ancestry: path(marketHeading, 12) } : null,
    sectionFrame: sectionFrame ? { ...desc(sectionFrame, 1), isLeaf: !sectionFrame.querySelector('[data-iw-ui="section-frame"]') } : null,
    marketPanel: marketPanel ? desc(marketPanel, 2) : null,
    rows,
    controls,
    inputs,
    myListings: myListingsHeading ? { ...desc(myListingsHeading, 0), ancestry: path(myListingsHeading, 10) } : null,
    emptySlots,
    allIwMarks: [...document.querySelectorAll('[data-iw-ui],[data-iw-panel],[data-iw-panel-part]')]
      .filter(visible)
      .map(el => `${el.tagName.toLowerCase()} ${[...el.attributes].filter(a => a.name.startsWith('data-iw')).map(a => a.name + '=' + a.value).join(' ')} :: ${short(norm(el.textContent), 40)}`)
      .slice(0, 60),
    failedExtensionAssets: performance.getEntriesByType('resource')
      .filter(e => /chrome-extension:/.test(e.name) && e.transferSize === 0 && e.decodedBodySize === 0)
      .map(e => e.name.split('/').slice(-2).join('/')),
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwMarketCapture = capture;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'iw-market-capture.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-market-capture.json');
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  try { copy(json); console.log('[iw] copied to clipboard'); } catch {}
  console.log(capture);
})();
