/* ============================================================================
   IdleWorlds Fantasy Skin — Leaderboards ROW capture (follow-up)

   READ-ONLY. Run on https://idleworlds.com/leaderboards.
   Drills into the row-list container directly and dumps the first 2 rows in
   full, including every descendant (to find the player-name element and its
   classes/attrs) and its ::before/::after.
   ========================================================================= */

(() => {
  const short = (v, n = 160) => {
    const s = String(v ?? '');
    return s.length > n ? s.slice(0, n) + `…(${s.length})` : s;
  };
  const cls = (el) => String(el.className?.baseVal ?? el.className ?? '');

  const PROPS = [
    'display', 'position', 'width', 'height', 'boxSizing', 'padding', 'margin',
    'border', 'borderColor', 'borderWidth', 'borderRadius', 'background',
    'backgroundColor', 'backgroundImage', 'boxShadow', 'color', 'fontFamily',
    'fontWeight', 'textDecoration', 'cursor',
  ];
  const styleOf = (el) => {
    const csv = getComputedStyle(el);
    const out = {};
    for (const p of PROPS) out[p] = short(csv[p], 130);
    return out;
  };
  const pseudo = (el, which) => {
    const c = getComputedStyle(el, which);
    if (c.content === 'none') return null;
    return { content: short(c.content, 30), background: short(c.background, 100), border: short(c.border, 60) };
  };

  const descr = (el, depth) => {
    if (!el || el.nodeType !== 1) return null;
    const out = {
      tag: el.tagName.toLowerCase(),
      classes: short(cls(el), 300),
      attrs: [...el.attributes].filter(a => a.name !== 'class' && a.name !== 'style')
        .map(a => `${a.name}="${short(a.value, 60)}"`),
      href: el.getAttribute && el.getAttribute('href') || null,
      text: short((el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) ? el.textContent : ''), 40),
      style: styleOf(el),
      before: pseudo(el, '::before'),
      after: pseudo(el, '::after'),
    };
    if (depth > 0) out.children = [...el.children].map(c => descr(c, depth - 1));
    return out;
  };

  // Find every heading-adjacent panel; pick the one containing rank text.
  const allDivs = [...document.querySelectorAll('div')];
  const listEl = allDivs.find(d => cls(d).trim() === 'space-y-1.5' && /^#\d/.test((d.textContent || '').trim()));

  if (!listEl) {
    console.warn('[iw] Could not find the row-list container. Dumping candidates.');
    const candidates = allDivs.filter(d => /^#\d/.test((d.textContent || '').trim()));
    console.log(candidates.slice(0, 5).map(d => ({ classes: cls(d), text: short(d.textContent, 60) })));
    return;
  }

  const rows = [...listEl.children].slice(0, 2);
  const capture = {
    listClasses: cls(listEl),
    listStyle: styleOf(listEl),
    rows: rows.map(r => descr(r, 6)),
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwLeaderboardRows = capture;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'iw-leaderboard-rows.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-leaderboard-rows.json');
  } catch (e) { console.warn('[iw] Download blocked:', e.message); }
  try { copy(json); console.log('[iw] Also copied to clipboard.'); } catch {}
  console.log('[iw] capture:', capture);
})();
