/* ============================================================================
   IdleWorlds Fantasy Skin — section-frame + activity-panel diagnostic (v2)

   READ-ONLY. For Inventory / Quests / Action Log / Current Action / World Chat:
     - every element whose visible text IS exactly the panel label (tag,
       classes, childElementCount, tabName, ancestry) — so we can see what
       kind of node the title is;
     - which element (if any) currently carries data-iw-ui="section-frame"
       / data-iw-panel, and whether it is a leaf or a stripped column;
     - the computed corner / texture / hairline treatment on that element.

   RUN: idleworlds.com, extension enabled, all panels on screen. F12 -> Console,
   paste, Enter. Attach the downloaded iw-frames-capture.json.
   ========================================================================= */

(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const low = t => norm(t).toLowerCase();
  const short = (v, n = 200) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 240);
  const rectOf = el => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };

  const desc = (el, depth = 0) => {
    if (!el) return null;
    const out = {
      tag: el.tagName.toLowerCase(),
      classes: cls(el),
      id: el.id || null,
      role: el.getAttribute('role') || null,
      childElementCount: el.childElementCount,
      inXlHidden: !!el.closest('[class~="xl:hidden"]'),
      visible: visible(el),
      rect: rectOf(el),
      ownText: short(norm([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ')), 80) || null,
      text: short(norm(el.textContent), 120),
      iwAttrs: [...el.attributes].filter(a => a.name.startsWith('data-iw')).map(a => `${a.name}="${a.value}"`),
    };
    if (depth > 0) out.children = [...el.children].slice(0, 16).map(c => desc(c, depth - 1));
    return out;
  };

  const path = (el, stop = 10) => {
    const out = []; let cur = el;
    for (let i = 0; cur && i < stop; i++, cur = cur.parentElement) {
      const c = String(cur.className?.baseVal ?? cur.className ?? '');
      out.push(
        cur.tagName.toLowerCase() + (cur.id ? `#${cur.id}` : '') +
        (c ? '.' + c.trim().split(/\s+/).slice(0, 5).join('.') : '') +
        ` {${rectOf(cur).w}x${rectOf(cur).h}}` +
        ([...cur.attributes].filter(a => a.name.startsWith('data-iw')).map(a => ` ${a.name}=${a.value}`).join('')),
      );
    }
    return out;
  };

  const frameStyle = el => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const af = getComputedStyle(el, '::after');
    const bf = getComputedStyle(el, '::before');
    return {
      border: cs.borderTopWidth, padding: cs.paddingTop, borderRadius: cs.borderRadius,
      backgroundImage: short(cs.backgroundImage, 180),
      hasTexture: cs.backgroundImage.includes('skills_panel_texture'),
      corners: af.borderImageSource !== 'none' && af.content !== 'none',
      cornerImage: short(af.borderImageSource, 120),
      hairline: bf.content !== 'none',
    };
  };

  const LABELS = ['Inventory', 'Quests', 'Action Log', 'Current Action', 'World Chat'];

  const frames = LABELS.map(label => {
    const key = label.toLowerCase();
    // Every element whose full text is exactly the label, any tag.
    const exact = [...document.querySelectorAll('*')]
      .filter(el => low(el.textContent) === key)
      // keep only the innermost such element per branch
      .filter((el, _i, arr) => !arr.some(o => o !== el && el.contains(o)));
    // The marked frame, if any.
    const marked = document.querySelector(`[data-iw-panel="${label.toLowerCase().replace(/\s+/g, '-')}"], [data-iw-ui="section-title"]`) && exact[0]
      ? (exact[0].closest('[data-iw-ui="section-frame"], [data-iw-inventory-root="1"]'))
      : null;
    const titleNode = exact.find(visible) || exact[0] || null;
    const framed = titleNode ? titleNode.closest('[data-iw-ui="section-frame"], [data-iw-inventory-root="1"]') : null;

    return {
      label,
      exactTextMatches: exact.map(el => ({
        ...desc(el, 0),
        parent: el.parentElement ? { tag: el.parentElement.tagName.toLowerCase(), classes: cls(el.parentElement), childElementCount: el.parentElement.childElementCount } : null,
        ancestry: path(el, 9),
      })),
      titleNodeAncestry: titleNode ? path(titleNode, 10) : null,
      framedElement: framed ? {
        ...desc(framed, 1),
        isLeaf: !framed.querySelector('[data-iw-ui="section-frame"], [data-iw-inventory-root="1"], .fs-skills-section-frame[data-iw-skills-ui-ready="1"]'),
        style: frameStyle(framed),
      } : null,
    };
  });

  // What the classifiers produced overall.
  const marks = {
    sectionFrames: [...document.querySelectorAll('[data-iw-ui="section-frame"]')].map(el =>
      (el.querySelector('[data-iw-ui="section-title"]')?.textContent || el.dataset.iwPanel || cls(el)).trim().slice(0, 40)),
    panels: [...document.querySelectorAll('[data-iw-panel]')].map(el => `${el.dataset.iwPanel} {${rectOf(el).w}x${rectOf(el).h}}`),
    titles: [...document.querySelectorAll('[data-iw-ui="section-title"]')].map(el => norm(el.textContent).slice(0, 30)),
  };

  const capture = {
    meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight } },
    frames,
    marks,
    failedExtensionAssets: performance.getEntriesByType('resource')
      .filter(e => /chrome-extension:/.test(e.name) && e.transferSize === 0 && e.decodedBodySize === 0)
      .map(e => e.name.split('/').slice(-2).join('/')),
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwFramesCapture = capture;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'iw-frames-capture.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-frames-capture.json');
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  try { copy(json); console.log('[iw] copied to clipboard'); } catch {}
  console.log(capture);
})();
