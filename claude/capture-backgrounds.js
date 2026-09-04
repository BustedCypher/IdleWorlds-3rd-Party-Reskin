/* Read-only DevTools snippet — paste into the console on idleworlds.com with
   the skin loaded, on a page showing Action Log / World Bosses / Quests.
   Dumps the painted background of every ancestor chain that could be lifting a
   surface off the panel ground, so the tint can be pinned to a real node
   instead of guessed at. Writes nothing to the page. */
(() => {
  const bg = el => {
    const cs = getComputedStyle(el);
    return {
      bgColor: cs.backgroundColor,
      bgImage: cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 120),
      opacity: cs.opacity,
      boxShadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 90),
    };
  };
  const chain = (el, stopAt) => {
    const out = [];
    for (let cur = el; cur && cur !== document.body; cur = cur.parentElement) {
      out.push({
        tag: cur.tagName.toLowerCase(),
        cls: (cur.getAttribute('class') || '').slice(0, 110),
        iw: Object.entries(cur.dataset).filter(([k]) => k.startsWith('iw') || k.startsWith('fs')),
        rect: (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(cur.getBoundingClientRect()),
        ...bg(cur),
      });
      if (stopAt && cur.matches(stopAt)) break;
    }
    return out;
  };
  const visible = sel => [...document.querySelectorAll(sel)]
    .filter(el => el.getBoundingClientRect().width > 1);

  const report = {
    href: location.href,
    actionLogFeed: visible('[data-iw-panel="action-log"] [data-iw-panel-part="feed"]').map(f => bg(f)),
    actionLogRow: visible('[data-iw-panel="action-log"] [data-iw-panel-part="feed-row"]')
      .slice(0, 1).map(r => chain(r, '[data-iw-panel="action-log"]')),
    actionLogUnclassified: visible('[data-iw-panel="action-log"]').length === 0
      ? 'NO [data-iw-panel="action-log"] IN THE DOM — the panel never classified'
      : visible('[data-iw-panel="action-log"] [data-iw-panel-part="feed-row"]').length,
    bossCard: visible('[data-iw-boss="card"]').slice(0, 1).map(c => chain(c, '[data-iw-ui="section-frame"]')),
    bossCardCount: visible('[data-iw-boss="card"]').length,
    questCard: visible('.compact-panel.fs-quest-panel').slice(0, 1).map(q => bg(q)),
    actionLogTitle: visible('[data-iw-panel="action-log"] [data-iw-ui="section-title"]').map(t => ({
      tag: t.tagName.toLowerCase(), text: t.textContent.trim().slice(0, 40), ...bg(t),
    })),
  };
  console.log(JSON.stringify(report, null, 2));
  copy(JSON.stringify(report, null, 2));
  return 'copied to clipboard';
})();
