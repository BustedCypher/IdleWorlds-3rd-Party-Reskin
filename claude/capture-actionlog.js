/* ============================================================================
   IdleWorlds Fantasy Skin — Action Log title probe

   READ-ONLY. Finds EVERY text node containing "Action Log" and dumps its
   parent element's exact structure (which children are text vs element, their
   content, classes) plus ancestry — so we can see exactly how the title is
   rendered and why the classifier can't hook it.

   RUN: idleworlds.com, extension enabled, Action Log panel on screen.
   F12 -> Console, paste, Enter. Attach iw-actionlog-capture.json.
   ========================================================================= */

(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const short = (v, n = 160) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 220);
  const rectOf = el => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };

  const childBreakdown = el => [...el.childNodes].map(n => {
    if (n.nodeType === 3) return { kind: 'text', value: short(JSON.stringify(n.nodeValue), 80) };
    if (n.nodeType === 1) return {
      kind: 'element', tag: n.tagName.toLowerCase(), classes: cls(n),
      role: n.getAttribute('role') || null,
      text: short(norm(n.textContent), 60),
      childElementCount: n.childElementCount,
    };
    return { kind: 'other:' + n.nodeType };
  });

  const ancestry = (el, stop = 9) => {
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

  // 1. Every text node whose value contains "Action Log".
  const hits = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!/action\s*log/i.test(n.nodeValue || '')) continue;
    const p = n.parentElement;
    if (!p) continue;
    if (p.closest('[data-iw-panel-part="feed"], .iw-tip')) continue; // skip chat/feed prose
    hits.push({
      textNodeValue: short(JSON.stringify(n.nodeValue), 120),
      isExactLabel: norm(n.nodeValue).toLowerCase() === 'action log',
      parent: {
        tag: p.tagName.toLowerCase(), classes: cls(p), id: p.id || null,
        role: p.getAttribute('role') || null,
        childElementCount: p.childElementCount,
        rect: rectOf(p),
        iwAttrs: [...p.attributes].filter(a => a.name.startsWith('data-iw')).map(a => `${a.name}=${a.value}`),
        childNodes: childBreakdown(p),
        fullText: short(norm(p.textContent), 140),
      },
      grandparent: p.parentElement ? {
        tag: p.parentElement.tagName.toLowerCase(), classes: cls(p.parentElement),
        childElementCount: p.parentElement.childElementCount,
        childNodes: childBreakdown(p.parentElement),
      } : null,
      ancestry: ancestry(p, 9),
    });
  }

  // 2. The smallest element that contains both "Action Log" and a "View All"
  //    control and an XP/hr readout — the header row the classifier wants.
  let headerRow = null;
  const candidates = [...document.querySelectorAll('div,header,section')]
    .filter(el => /action\s*log/i.test(el.textContent) && /view\s*all/i.test(el.textContent) && /xp\s*\/\s*hr/i.test(el.textContent))
    .sort((a, b) => a.textContent.length - b.textContent.length);
  if (candidates[0]) {
    const el = candidates[0];
    headerRow = {
      tag: el.tagName.toLowerCase(), classes: cls(el), id: el.id || null,
      rect: rectOf(el),
      childNodes: childBreakdown(el),
      viewAllTag: (() => { const v = [...el.querySelectorAll('*')].find(x => /^view\s*all$/i.test(norm(x.textContent)) && x.childElementCount === 0); return v ? v.tagName.toLowerCase() + '.' + cls(v) : null; })(),
      ancestry: ancestry(el, 8),
    };
  }

  const capture = {
    meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight } },
    marks: {
      sectionFrames: [...document.querySelectorAll('[data-iw-ui="section-frame"]')].map(el =>
        (el.querySelector('[data-iw-ui="section-title"]')?.textContent || el.dataset.iwPanel || cls(el)).trim().slice(0, 40)),
      panels: [...document.querySelectorAll('[data-iw-panel]')].map(el => el.dataset.iwPanel),
    },
    actionLogTextNodes: hits,
    headerRowCandidate: headerRow,
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwActionLog = capture;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'iw-actionlog-capture.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-actionlog-capture.json');
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  try { copy(json); console.log('[iw] copied to clipboard'); } catch {}
  console.log(capture);
})();
