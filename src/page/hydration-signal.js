/**
 * hydration-signal.js — runs in the PAGE's world ("world": "MAIN"), not the
 * content script's isolated world, because only page JavaScript can see
 * React's internals. It is deliberately NOT part of the esbuild bundle: it
 * must stay tiny, dependency-free and separately removable.
 *
 * Why it exists (2026-09-16): IdleWorlds is a Next.js app that React HYDRATES
 * after the server HTML arrives. The skin's content script runs at
 * `document_idle`, which Chrome may fire before hydration finishes, and the
 * skin APPENDS its own nodes into game containers. React then finds DOM it
 * did not render and throws #418 ("args[]=HTML"), discarding the server DOM
 * and client-rendering the whole tree. Measured by Curtis: #418 on 10/10
 * reloads with the skin, 6/10 without it (the game has its own mismatches).
 *
 * READ ONLY. It never touches React state or the game's DOM. Its single
 * write is one latch attribute on <html>, set only AFTER React reports the
 * root hydrated, which HydrationGate.js reads (and removes) to release the
 * skin's first boot. If React's internals ever change shape, it signals
 * "unknown" instead of waiting; the gate also has its own hard timeout.
 *
 * TO REVERT: delete this file's entry from manifest.json (and this file), or
 * set HYDRATION_GATE_ENABLED = false in src/modules/HydrationGate.js.
 */
(() => {
  const ATTR = 'data-iw-page-hydrated';
  const GIVE_UP_MS = 15000;
  const POLL_MS = 50;
  const started = performance.now();

  const rootKeyOf = node => {
    if (!node) return null;
    for (const key of Object.keys(node)) if (key.startsWith('__reactContainer$')) return key;
    return null;
  };

  const signal = state => {
    const html = document.documentElement;
    if (html && !html.hasAttribute(ATTR)) html.setAttribute(ATTR, state);
  };

  const check = () => {
    // The Next.js App Router hydrates the whole `document`; other shapes use
    // <body>, #__next, or a top-level mount div. Take the first container
    // React has claimed.
    const containers = [document, document.documentElement, document.body,
      document.getElementById('__next'), ...(document.body ? document.body.children : [])];
    for (const container of containers) {
      const key = rootKeyOf(container);
      if (!key) continue;
      // HostRoot fiber -> FiberRoot -> CURRENT HostRoot fiber. `isDehydrated`
      // turns false once the root's hydration has committed (including the
      // client-render recovery after a mismatch).
      const state = container[key]?.stateNode?.current?.memoizedState;
      if (!state || typeof state.isDehydrated !== 'boolean') return signal('unknown');
      if (state.isDehydrated === false) return signal('1');
      break; // root found, still hydrating
    }
    if (performance.now() - started < GIVE_UP_MS) setTimeout(check, POLL_MS);
    // Past GIVE_UP_MS: write nothing. The gate's own timeout has long since
    // released the skin, and a late write to <html> would help nobody.
  };

  check();
})();
