/**
 * probe-boss-prejoin-scroll.js - READ ONLY (it never clicks anything). Paste
 * into the DevTools console on idleworlds.com, World Bosses cards on screen.
 * Click Prejoin yourself on one card, wait ~3 seconds, run
 *   copy(__iwScrollProbe.dump())
 * and paste the result back. __iwScrollProbe.stop() removes it.
 *
 * Reported: clicking Prejoin on any boss card scrolls the window up slightly.
 *
 * Established 2026-09-16 over rounds 1-6:
 *  - `overflow-anchor: none` on <html> stops it: it IS scroll anchoring.
 *    -17px twice per click (~150ms after click, then ~800ms later).
 *  - no remount, no scroll call or scrollTop write, document height constant.
 *  - frame to frame, no rendered element, text box, pseudo style or sticky
 *    layer moved; round 6's simulated anchor (a Skills card, left column) held
 *    its document position exactly while the window moved 17px.
 * So the layout that Chrome anchored against never reached a frame: something
 * changed and changed BACK inside one task, with a layout in between.
 *
 * Round 7 attributes it. Anchoring adjustments are applied synchronously
 * during layout, so scrollY itself changes inside the offending task. A
 * MutationObserver callback runs right after every task / rAF callback that
 * touched the DOM; each one reads scrollY. The batch in which scrollY first
 * differs is the culprit, and its records - with any attribute that ended the
 * batch back at its starting value ("transient") - say what it did.
 */
(() => {
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);
  const WINDOW_MS = 3000;
  const batches = [];
  const events = [];
  const label = node => {
    if (!node) return String(node);
    if (node.nodeType !== 1) return node.nodeName;
    const attrs = [...node.attributes].filter(a => a.name.startsWith('data-iw') || a.name === 'id')
      .slice(0, 4).map(a => `${a.name}=${a.value.slice(0, 16)}`).join(' ');
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return `${node.tagName.toLowerCase()}.${String(node.className?.baseVal ?? node.className ?? '').slice(0, 36)} [${attrs}] "${text}"`;
  };

  let lastY = scrollY, until = 0, seq = 0;
  const summarize = records => {
    const groups = new Map();
    for (const r of records) {
      const key = r.type === 'attributes' ? `${r.attributeName}@${label(r.target)}` : `${r.type}@${label(r.target)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, g = { key, n: 0, target: r.target, attr: r.attributeName, first: r.oldValue, added: 0, removed: 0 });
      g.n += 1;
      if (r.type === 'childList') { g.added += r.addedNodes.length; g.removed += r.removedNodes.length; }
    }
    return [...groups.values()].map(g => {
      if (g.attr) {
        const nowValue = g.target.getAttribute(g.attr);
        const transient = g.n > 1 && nowValue === g.first;
        return `${transient ? 'TRANSIENT ' : ''}x${g.n} ${g.key} :: ${String(g.first).slice(0, 60)} -> ${String(nowValue).slice(0, 60)}`;
      }
      if (g.key.startsWith('childList')) return `${g.added === g.removed && g.added ? 'REPLACED ' : ''}x${g.n} ${g.key} +${g.added}/-${g.removed}`;
      return `x${g.n} ${g.key}`;
    });
  };
  const mo = new MutationObserver(records => {
    if (performance.now() > until) { lastY = scrollY; return; }
    const y = scrollY;
    batches.push({ i: seq++, t: now(), dScroll: Math.round(y - lastY), scrollY: Math.round(y), count: records.length, detail: summarize(records) });
    lastY = y;
  });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });

  // Frame boundaries, so a scroll change that happened in rendering (not in a
  // script) is told apart from one inside a mutation batch.
  const frame = () => {
    if (performance.now() > until) return;
    const y = scrollY;
    if (y !== lastY) { batches.push({ i: seq++, t: now(), kind: 'rAF-start (changed during rendering, not in a batch)', dScroll: Math.round(y - lastY), scrollY: Math.round(y) }); lastY = y; }
    requestAnimationFrame(frame);
  };

  const onEvent = e => {
    events.push({ t: now(), kind: e.type, scrollY: Math.round(scrollY), target: e.target?.nodeType === 1 ? label(e.target) : undefined });
    if (e.type === 'pointerdown') { until = performance.now() + WINDOW_MS; lastY = scrollY; requestAnimationFrame(frame); }
  };
  for (const type of ['pointerdown', 'click', 'focusout']) addEventListener(type, onEvent, true);
  const onScroll = () => events.push({ t: now(), kind: 'SCROLL', scrollY: Math.round(scrollY) });
  addEventListener('scroll', onScroll, { passive: true });

  window.__iwScrollProbe = {
    dump() {
      // Full detail for each batch where scrollY moved and the two before it;
      // every other batch as a one-line count, so the timeline stays readable.
      const hot = new Set();
      batches.forEach((b, idx) => { if (b.dScroll) [idx, idx - 1, idx - 2].forEach(k => k >= 0 && hot.add(k)); });
      const timeline = batches.map((b, idx) => hot.has(idx) ? b : `#${b.i} t=${b.t} records=${b.count}`);
      return JSON.stringify({ scrollY: Math.round(scrollY), events, timeline }, null, 2);
    },
    stop() {
      until = 0;
      mo.disconnect();
      for (const type of ['pointerdown', 'click', 'focusout']) removeEventListener(type, onEvent, true);
      removeEventListener('scroll', onScroll);
      delete window.__iwScrollProbe;
    },
  };
  console.log('Probe armed (round 7). Click Prejoin, wait ~3s, then run: copy(__iwScrollProbe.dump())');
})();
