/* ============================================================================
   IdleWorlds Fantasy Skin — Quests DOM capture  (v2)

   READ-ONLY. Does not modify the page, click anything, or send anything.
   v2 fixes: ignores the xl:hidden mirror column (only visible, non-zero-rect
   nodes), finds the real Quests panel by content, and identifies quest cards
   as the repeated children that carry a reward line / progress / Turn In.

   HOW TO RUN
     1. idleworlds.com, extension enabled, Quests panel visible. Best if one
        quest is in progress, one is ready to Turn In, and one shows SKIP (n).
     2. F12 -> Console. Paste this whole file, Enter.
     3. Attach the downloaded  iw-quests-capture.json  to the chat.
   ========================================================================= */

(() => {
  const PROPS = [
    'display', 'position', 'boxSizing', 'width', 'height', 'padding', 'margin',
    'border', 'borderRadius', 'background', 'backgroundImage', 'backgroundColor',
    'color', 'font', 'letterSpacing', 'textTransform', 'textAlign',
    'flexDirection', 'alignItems', 'justifyContent', 'gap',
    'gridTemplateColumns', 'gridTemplateRows', 'overflow', 'boxShadow', 'opacity',
  ];
  const short = (v, n = 100) => {
    const s = String(v ?? '');
    return s.length > n ? s.slice(0, n) + `…(${s.length})` : s;
  };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 260);
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const rectOf = el => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(0), y: +r.y.toFixed(0) }; };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  const describe = (el, depth) => {
    if (!el) return null;
    const csv = getComputedStyle(el);
    const style = {};
    for (const p of PROPS) style[p] = short(csv[p], 120);
    const ownText = [...el.childNodes]
      .filter(n => n.nodeType === 3).map(n => norm(n.textContent)).filter(Boolean).join(' ');
    const out = {
      tag: el.tagName.toLowerCase(),
      classes: cls(el),
      attrs: [...el.attributes].filter(a => a.name !== 'class' && a.name !== 'style')
        .map(a => `${a.name}="${short(a.value, 90)}"`),
      inlineStyle: short(el.getAttribute('style'), 200) || null,
      rect: rectOf(el),
      ownText: ownText || null,
      role: el.getAttribute('role') || null,
      style,
    };
    const before = getComputedStyle(el, '::before');
    const after = getComputedStyle(el, '::after');
    if (before.content && before.content !== 'none') out.before = { content: short(before.content, 30), backgroundImage: short(before.backgroundImage, 70), width: before.width, height: before.height, position: before.position };
    if (after.content && after.content !== 'none') out.after = { content: short(after.content, 30), backgroundImage: short(after.backgroundImage, 70), width: after.width, height: after.height, position: after.position };
    if (depth > 0) out.children = [...el.children].slice(0, 20).map(ch => describe(ch, depth - 1));
    else out.childTags = [...el.children].map(ch => ch.tagName.toLowerCase() + '.' + short(cls(ch), 40));
    return out;
  };

  const path = (el, stop = 9) => {
    const out = []; let cur = el;
    for (let i = 0; cur && i < stop; i++, cur = cur.parentElement) {
      const c = String(cur.className?.baseVal ?? cur.className ?? '');
      out.push(cur.tagName.toLowerCase() + (cur.id ? `#${cur.id}` : '') +
        (c ? '.' + c.trim().split(/\s+/).slice(0, 5).join('.') : '') +
        ` {${rectOf(cur).w}x${rectOf(cur).h}}`);
    }
    return out;
  };

  // 1. VISIBLE "Quests" heading only (skip the xl:hidden mirror).
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')]
    .filter(h => /^quests\b/i.test(norm(h.textContent)));
  const heading = headings.find(visible) || headings[0];
  if (!heading) { console.error('[iw] No "Quests" heading found.'); return; }

  // 2. Real Quests panel = nearest visible ancestor that contains a reward
  //    line AND a Turn In control (or "% complete").
  const looksLikePanel = el => {
    const t = norm(el.textContent).toLowerCase();
    const hasReward = /reward\s*:/.test(t);
    const hasTurnIn = [...el.querySelectorAll('button,[role="button"]')].some(b => /turn in|skip/i.test(norm(b.textContent)));
    const hasPct = /% complete/.test(t);
    return (hasReward && (hasTurnIn || hasPct));
  };
  let panel = heading;
  for (let cur = heading, i = 0; cur && i < 8; i++, cur = cur.parentElement) {
    if (visible(cur) && looksLikePanel(cur)) { panel = cur; break; }
  }

  // 3. Quest cards = visible descendants that each contain their own reward
  //    line + Turn In/Skip button, taking the outermost such element per branch.
  const all = [...panel.querySelectorAll('*')].filter(visible);
  let cardSet = all.filter(el => {
    const t = norm(el.textContent).toLowerCase();
    if (!/reward\s*:/.test(t)) return false;
    const btns = [...el.querySelectorAll('button,[role="button"]')].map(b => norm(b.textContent));
    return btns.some(b => /turn in/i.test(b));
  });
  cardSet = cardSet.filter(el => !cardSet.some(other => other !== el && other.contains(el)));
  const cardContainer = cardSet[0]?.parentElement || null;

  const buttonsOf = el => [...el.querySelectorAll('button,[role="button"],a')].map(b => ({
    tag: b.tagName.toLowerCase(), text: norm(b.textContent), aria: b.getAttribute('aria-label') || null,
    disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
    classes: cls(b), inlineStyle: short(b.getAttribute('style'), 200) || null, rect: rectOf(b),
    computed: (() => { const s = getComputedStyle(b); return { background: short(s.background, 90), color: s.color, border: s.border, borderRadius: s.borderRadius, font: short(s.font, 80), padding: s.padding, boxShadow: short(s.boxShadow, 80) }; })(),
  }));

  const progressOf = el => [...el.querySelectorAll('[role="progressbar"],[class*="progress"],[class*="rounded-full"],[style*="width:"]')]
    .filter(visible).slice(0, 8).map(p => ({
      tag: p.tagName.toLowerCase(), role: p.getAttribute('role') || null, classes: cls(p),
      valuenow: p.getAttribute('aria-valuenow'), valuemax: p.getAttribute('aria-valuemax'),
      inlineStyle: short(p.getAttribute('style'), 120) || null,
      firstChild: p.firstElementChild ? { classes: cls(p.firstElementChild), inlineStyle: short(p.firstElementChild.getAttribute('style'), 120) || null } : null,
      rect: rectOf(p),
      computed: (() => { const s = getComputedStyle(p); return { height: s.height, background: short(s.background, 90), borderRadius: s.borderRadius }; })(),
    }));

  // Flat list of every leaf text run in a card, with the owning element's classes.
  const leafTextOf = el => [...el.querySelectorAll('*')].filter(visible)
    .filter(n => [...n.childNodes].some(c => c.nodeType === 3 && norm(c.textContent)))
    .map(n => ({ classes: short(cls(n), 90), tag: n.tagName.toLowerCase(), text: short(norm([...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join(' ')), 120) }))
    .slice(0, 40);

  const capture = {
    meta: {
      url: location.href, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      headingCount: headings.length, headingWasVisible: visible(heading),
      panelResolved: panel !== heading, panelClasses: cls(panel), panelRect: rectOf(panel),
      cardCount: cardSet.length,
    },
    heading: { el: describe(heading, 0), ancestors: path(heading) },
    panel: { el: describe(panel, 1), ancestors: path(panel) },
    cardContainer: cardContainer ? { el: describe(cardContainer, 0), childTags: [...cardContainer.children].map(c => c.tagName.toLowerCase() + '.' + short(cls(c), 50)) } : null,
    cards: cardSet.slice(0, 4).map(card => ({
      el: describe(card, 5),
      ancestors: path(card, 5),
      buttons: buttonsOf(card),
      progress: progressOf(card),
      itemRefs: [...card.querySelectorAll('.iw-item-ref')].map(r => ({ text: norm(r.textContent), item: r.getAttribute('data-iw-item') || null })),
      leafText: leafTextOf(card),
    })),
    failedAssets: performance.getEntriesByType('resource')
      .filter(e => /chrome-extension:/.test(e.name) && e.transferSize === 0 && e.decodedBodySize === 0)
      .map(e => e.name.split('/').pop()).slice(0, 20),
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwQuestCapture = capture;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'iw-quests-capture.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-quests-capture.json');
  } catch (e) { console.warn('[iw] Download blocked:', e.message); }
  try { copy(json); console.log('[iw] Also copied to clipboard.'); } catch {}
  console.log(`[iw] heading visible:${visible(heading)} | panel:${cls(panel)} {${rectOf(panel).w}x${rectOf(panel).h}} | ${cardSet.length} quest card(s)`);
  console.log(capture);
})();
