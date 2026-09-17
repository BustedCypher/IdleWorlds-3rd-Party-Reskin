/* Read-only DevTools snippet: what gates the skill-card action timer during
   the first seconds of a long craft?

   Paste into the idleworlds.com console, then click a long action's button
   within 60s. Every animation frame for 15s after the click it samples the
   two inputs `syncLongActionTimer` depends on - the button's fill span and
   the Current Action text - plus what the skin painted, and logs a row only
   when one of them changes. Writes nothing to the page.
   Result: console.table, and `window.__iwTimerProbe` (copy(...) it). */
(() => {
  const FILL = ':scope > span[style*="width"]';
  const flat = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const rendered = el => !!el && el.getClientRects().length > 0;
  const actionHost = () => {
    const hosts = [...document.querySelectorAll('[data-iw-panel="current-action"], [id="current-action-panel"]')];
    return hosts.find(rendered) || hosts[0] || null;
  };
  const durationLeaves = host => host ? [...host.querySelectorAll('time,span,p,strong,div')]
    .filter(el => !el.childElementCount && !el.closest('[data-iw-panel-part="progress"]'))
    .map(flat).filter(t => /^(?:\d+:)?\d+:[0-5]\d$|^(?:\d+\s*h\S*\s*)?(?:\d+\s*m\S*\s*)?(?:\d+\s*s\S*)?$/i.test(t) && /\d/.test(t)) : [];

  const rows = [];
  let t0 = 0, panel = null, button = null, last = '';
  const sample = () => {
    const t = performance.now() - t0;
    const fill = button?.querySelector(FILL);
    const host = actionHost();
    const glyph = panel?.querySelector('[data-iw-skill-v2-action-glyph]');
    const row = {
      ms: Math.round(t),
      buttonConnected: !!button?.isConnected,
      buttonDisabled: !!button?.disabled,
      fill: fill ? fill.style.width : '(none)',
      buttonChildren: button ? [...button.children].map(c => c.tagName.toLowerCase() + (c.getAttribute('style') ? `[${c.getAttribute('style')}]` : '')).join(' ') : '',
      caDurations: durationLeaves(host).join(' | ') || '(none)',
      caText: flat(host).slice(0, 140),
      longAction: panel?.dataset.iwSkillV2LongAction || '',
      glyphTimer: glyph?.hasAttribute('data-iw-skill-v2-action-timer') ? flat(glyph) : '(off)',
    };
    const key = JSON.stringify({ ...row, ms: 0 });
    if (key !== last) { rows.push(row); last = key; }
    if (t < 15000) requestAnimationFrame(sample);
    else {
      window.__iwTimerProbe = rows;
      console.table(rows);
      console.log('[iw-probe] done - copy(window.__iwTimerProbe) to share');
    }
  };
  const onClick = e => {
    const btn = e.target.closest?.('[data-iw-skill-role="action-button"]');
    if (!btn) return;
    document.removeEventListener('click', onClick, true);
    button = btn;
    panel = btn.closest('.compact-panel');
    t0 = performance.now();
    console.log('[iw-probe] click captured, sampling 15s...');
    sample();
  };
  document.addEventListener('click', onClick, true);
  setTimeout(() => document.removeEventListener('click', onClick, true), 60000);
  console.log('[iw-probe] armed - click a long action button within 60s');
})();
