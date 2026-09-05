/* ============================================================================
   IdleWorlds Fantasy Skin — Leaderboards page DOM capture

   READ-ONLY. Does not modify the page, click anything, or send anything
   anywhere. Reads structure + computed styles, hands you a JSON file.

   HOW TO RUN
     1. Open https://idleworlds.com/leaderboards with the extension enabled.
     2. F12 -> Console. Paste this whole file, press Enter.
     3. It downloads  iw-leaderboards-capture.json  and copies it to the
        clipboard. Attach the FILE to the chat.

   WHAT IT COLLECTS
     The section-frame panel, the category tab bar + one tab button, the row
     list container, the first 3 rows in full (including the player-name
     element), and any pseudo-element content on the name element (the
     "bevelled button" look is usually a plain <button> picking up the
     generic control skin).
   ========================================================================= */

(() => {
  const PROPS = [
    'display', 'position', 'width', 'height', 'boxSizing', 'padding', 'margin',
    'border', 'borderColor', 'borderWidth', 'borderRadius', 'background',
    'backgroundColor', 'backgroundImage', 'boxShadow', 'color', 'fontFamily',
    'fontWeight', 'textDecoration', 'cursor', 'overflow',
  ];

  const short = (v, n = 140) => {
    const s = String(v ?? '');
    return s.length > n ? s.slice(0, n) + `…(${s.length})` : s;
  };
  const cls = (el) => String(el.className?.baseVal ?? el.className ?? '');

  const styleOf = (el) => {
    const csv = getComputedStyle(el);
    const out = {};
    for (const p of PROPS) out[p] = short(csv[p]);
    return out;
  };

  const pseudo = (el, which) => {
    const c = getComputedStyle(el, which);
    if (c.content === 'none') return null;
    return {
      content: short(c.content, 40),
      background: short(c.background, 100),
      border: short(c.border, 60),
      boxShadow: short(c.boxShadow, 100),
    };
  };

  const descr = (el, depth = 2) => {
    if (!el || el.nodeType !== 1) return null;
    const r = el.getBoundingClientRect();
    const out = {
      tag: el.tagName.toLowerCase(),
      classes: short(cls(el), 300),
      attrs: [...el.attributes]
        .filter(a => a.name !== 'class' && a.name !== 'style')
        .map(a => `${a.name}="${short(a.value, 60)}"`),
      rect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      text: short((el.textContent || '').replace(/\s+/g, ' ').trim(), 60),
      style: styleOf(el),
      before: pseudo(el, '::before'),
      after: pseudo(el, '::after'),
    };
    if (depth > 0) out.children = [...el.children].map(c => descr(c, depth - 1));
    return out;
  };

  // Section frame: the panel whose heading reads "Leaderboards".
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')]
    .filter(h => /leaderboards/i.test(h.textContent || ''));
  const frame = headings[0]?.closest('.panel, [class*="panel"]') || headings[0]?.parentElement?.parentElement;

  // Tab bar: buttons near the top whose text matches known categories.
  const tabButtons = [...document.querySelectorAll('button')]
    .filter(b => /combat|mining|smithing|gathering|total levels|zone control/i.test(b.textContent || ''));

  // Row list: find the container holding rows that start with "#1", "#2", etc.
  const rankNodes = [...document.querySelectorAll('*')].filter(el =>
    el.children.length === 0 && /^#\d+$/.test((el.textContent || '').trim())
  );
  const rowCandidates = rankNodes.map(n => n.closest('[class]'));
  const firstRankEl = rankNodes[0];
  let rowEl = firstRankEl;
  // Walk up a bit to find the row container (has siblings that are also rows).
  for (let i = 0; i < 6 && rowEl; i++) {
    const parent = rowEl.parentElement;
    if (!parent) break;
    const siblingRows = [...parent.children].filter(c => /#\d+/.test(c.textContent || ''));
    if (siblingRows.length >= 3) break;
    rowEl = parent;
  }
  const listEl = rowEl?.parentElement;
  const rows = listEl ? [...listEl.children].slice(0, 3) : [];

  // Name element: inside the first row, the clickable player name.
  const nameEl = rows[0]?.querySelector('button, a, [role="button"]');

  const capture = {
    meta: { url: location.href, dataSkin: document.documentElement.getAttribute('data-skin') || null },
    sectionFrame: frame ? descr(frame, 1) : null,
    tabBar: tabButtons.length ? descr(tabButtons[0].parentElement, 1) : null,
    rowList: listEl ? descr(listEl, 0) : null,
    rows: rows.map(r => descr(r, 3)),
    nameElement: nameEl ? descr(nameEl, 2) : null,
    failedAssets: performance.getEntriesByType('resource')
      .filter(e => /chrome-extension:/.test(e.name) && e.transferSize === 0 && e.decodedBodySize === 0)
      .map(e => e.name.split('/').pop())
      .slice(0, 20),
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwLeaderboardsCapture = capture;

  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'iw-leaderboards-capture.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-leaderboards-capture.json');
  } catch (e) {
    console.warn('[iw] Download blocked:', e.message);
  }
  try { copy(json); console.log('[iw] Also copied to clipboard.'); } catch {}

  console.log('[iw] capture:', capture);
})();
