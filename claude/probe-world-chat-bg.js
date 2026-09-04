/* ============================================================================
   IdleWorlds Fantasy Skin — World Chat feed background probe

   READ-ONLY. Does not modify the page, click anything, or send anything.
   Walks the World Chat panel from its frame down through the feed to the
   message rows and dumps every element's PAINTED background (colour, image,
   the effective alpha) plus its data-iw hooks and rect — so we can see which
   node is the "ugly brown" and why our transparency rule isn't reaching it.

   RUN: idleworlds.com, extension enabled, World Chat panel on screen.
   F12 -> Console, paste this whole file, Enter.
   Downloads iw-worldchat-bg.json and copies it to the clipboard. Attach the
   FILE to the chat (a pasted capture was lost to compaction once already).
   Also left at window.__iwWorldChatBg.
   ========================================================================= */

(() => {
  const short = (v, n = 120) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 200);
  const rectOf = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const iw = el => [...el.attributes].filter(a => a.name.startsWith('data-iw')).map(a => `${a.name}=${a.value}`);

  const paint = el => {
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      classes: cls(el),
      iw: iw(el),
      rect: rectOf(el),
      backgroundColor: cs.backgroundColor,
      backgroundImage: short(cs.backgroundImage, 140),
      backgroundBlendMode: cs.backgroundBlendMode,
      boxShadow: short(cs.boxShadow, 140),
      opacity: cs.opacity,
      border: cs.border,
      borderImageSource: short(cs.borderImageSource, 90),
      mixBlendMode: cs.mixBlendMode,
      filter: short(cs.filter, 90),
    };
  };

  // Locate the World Chat panel: prefer the skin hook, fall back to text.
  let panel = document.querySelector('[data-iw-panel="world-chat"]');
  if (!panel) {
    panel = [...document.querySelectorAll('section,div')]
      .filter(el => /world\s*chat/i.test(el.textContent) && el.querySelector('input,textarea'))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
  }
  if (!panel) { console.warn('[iw] World Chat panel not found — is it on screen?'); return; }

  // The framed ancestor (section-frame) that actually paints the forged ground.
  const frame = panel.closest('[data-iw-ui="section-frame"]') || panel.parentElement;

  const feed = panel.querySelector('[data-iw-panel-part="feed"]')
    || [...panel.querySelectorAll('*')].find(el => el.scrollHeight > el.clientHeight + 4 && el.querySelector('time'))
    || null;

  const firstRow = panel.querySelector('[data-iw-panel-part="feed-row"]')
    || (feed && [...feed.querySelectorAll('*')].find(el => /\d\d:\d\d/.test(el.textContent) && el.querySelector('time')))
    || null;

  // Full chain: frame -> ... -> feed -> ... -> firstRow, every element inclusive.
  const chain = [];
  if (frame && firstRow) {
    let cur = firstRow;
    const stopAt = frame.parentElement;
    while (cur && cur !== stopAt) { chain.unshift(cur); cur = cur.parentElement; }
  }

  // Also: every descendant of the feed that has a non-transparent backgroundColor.
  const paintedInFeed = feed
    ? [...feed.querySelectorAll('*')].filter(el => {
        const bc = getComputedStyle(el).backgroundColor;
        return bc && bc !== 'rgba(0, 0, 0, 0)' && bc !== 'transparent';
      }).slice(0, 40).map(paint)
    : [];

  const capture = {
    meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight }, ts: new Date().toISOString() },
    found: {
      panel: panel ? { classes: cls(panel), iw: iw(panel), rect: rectOf(panel) } : null,
      frame: frame ? { classes: cls(frame), iw: iw(frame), rect: rectOf(frame) } : null,
      feed: feed ? { classes: cls(feed), iw: iw(feed), rect: rectOf(feed) } : null,
      firstRow: firstRow ? { classes: cls(firstRow), iw: iw(firstRow), rect: rectOf(firstRow) } : null,
    },
    chainFrameToRow: chain.map(paint),
    feedDescendantsWithBackground: paintedInFeed,
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwWorldChatBg = capture;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'iw-worldchat-bg.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-worldchat-bg.json');
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  try { copy(json); console.log('[iw] copied to clipboard'); } catch {}
  console.log(capture);
})();
