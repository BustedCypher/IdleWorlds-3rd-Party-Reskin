/*
 * capture-skin-contract.js — DevTools snippet. READ-ONLY with respect to the
 * game: it only toggles the extension's own on/off key.
 *
 * WHAT IT PRODUCES
 *   The exact list of everything the Fantasy Skin extension adds to the page
 *   you are looking at, node by node: attributes, classes, inline style
 *   properties, and appended elements (with their full markup). That list IS
 *   the contract a native render has to reproduce for this route, this width
 *   and this game state. Nothing in it is inferred from source code.
 *
 * HOW IT WORKS
 *   1. Snapshot every element with the skin ON.
 *   2. Turn the skin OFF with its own kill switch (chrome.storage key
 *      `iw-skin-enabled`), wait for teardown, snapshot again.
 *   3. Turn the skin back ON, wait for it to settle, snapshot a third time.
 *   The extension never reparents or replaces game nodes, so element identity
 *   survives the round trip and a per-element diff is exact. A value that
 *   differs between the two ON snapshots is the GAME ticking, not the skin,
 *   and is reported as `volatile` instead of as a contract value.
 *
 * HOW TO RUN
 *   1. Load the live game with the extension enabled. Pick the route, the
 *      viewport width and the game state you want the contract for.
 *   2. DevTools -> Console -> the context dropdown (top left, default "top")
 *      -> choose the extension's content-script context ("IdleWorlds Fantasy
 *      Skin"). This snippet needs `chrome.storage`, which only exists there.
 *   3. Paste this whole file and press Enter. It takes ~6 seconds and
 *      downloads `iw-skin-contract-<route>-<width>.json`.
 *   Run it once per route (/, /market, /leaderboards, /housing, /dungeon)
 *   and per width you care about (at least 1440, 1100 and 390).
 *
 * PRIVACY
 *   The capture contains text from the page (player name, chat lines, item
 *   names) inside appended-node markup and element labels. Treat the file as
 *   account data; do not post it publicly.
 */
(async () => {
  const KEY = 'iw-skin-enabled';
  if (!globalThis.chrome?.storage?.local) {
    throw new Error('Run this in the extension content-script console context (DevTools console context dropdown -> "IdleWorlds Fantasy Skin").');
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frames = n => new Promise(resolve => {
    let i = 0;
    const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
  const SKIP = 'script, noscript, style[data-iw-style], #iw-tip, #iw-tip *';

  function styleMap(el) {
    const out = {};
    const s = el.style;
    if (!s) return out;
    for (let i = 0; i < s.length; i += 1) {
      const prop = s[i];
      const priority = s.getPropertyPriority(prop);
      out[prop] = s.getPropertyValue(prop) + (priority ? ' !important' : '');
    }
    return out;
  }

  function snapshot() {
    const map = new Map();
    for (const el of [document.documentElement, ...document.querySelectorAll('*')]) {
      if (el.matches?.(SKIP)) continue;
      const attrs = {};
      for (const a of el.attributes) if (a.name !== 'style' && a.name !== 'class') attrs[a.name] = a.value;
      map.set(el, {
        attrs,
        classes: [...el.classList],
        style: styleMap(el),
        // Kept because teardown DETACHES the skin's own nodes: after it runs,
        // their parentElement is null and their position is gone.
        parent: el.parentElement,
        prev: el.previousElementSibling,
        next: el.nextElementSibling,
      });
    }
    return map;
  }

  /** tag.classes:nth-child(n) from <body>, using the classes the element has
   *  with the skin OFF where known, so paths read as the game's own markup. */
  function pathOf(el, offSnap) {
    const parts = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const parent = node.parentElement;
      const index = parent ? [...parent.children].indexOf(node) + 1 : 1;
      const classes = (offSnap.get(node)?.classes || [...node.classList]).slice(0, 6);
      const id = node.id ? `#${node.id}` : '';
      parts.unshift(`${node.tagName.toLowerCase()}${id}${classes.map(c => `.${CSS.escape(c)}`).join('')}:nth-child(${index})`);
      if (node === document.body) break;
    }
    return parts.join(' > ');
  }

  const label = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

  /** The nearest thing a person would call "the surface": a heading-labelled
   *  .panel, the header, the chrome shell, a modal, or the document root. */
  function surfaceOf(el) {
    const host = el.closest?.('[data-iw-overlay="panel"], [data-iw-overlay="scrim"], [role="dialog"], .compact-panel, .panel, header, [data-iw-chrome="shell"]');
    if (!host) return el === document.documentElement ? '<html>' : '(page)';
    const heading = host.querySelector('h1, h2, h3, h4, [role="heading"]');
    const tag = host.matches('.compact-panel') ? 'card' : host.matches('header') ? 'header' : host.matches('.panel') ? 'panel' : host.matches('[data-iw-chrome="shell"]') ? 'shell' : 'overlay';
    return `${tag}: ${heading ? label(heading).slice(0, 40) : label(host).slice(0, 40)}`;
  }

  async function setEnabled(value) {
    await chrome.storage.local.set({ [KEY]: value });
  }

  async function settle() {
    // Wait until the skin's own marks stop changing (three equal counts).
    let last = -1, same = 0;
    for (let i = 0; i < 40 && same < 3; i += 1) {
      await frames(4);
      await wait(120);
      const count = document.querySelectorAll('[data-iw-ui], [data-iw-header], [data-fs-skill], [data-iw-chrome], [data-iw-compact-button]').length;
      same = count === last ? same + 1 : 0;
      last = count;
    }
  }

  const route = location.pathname;
  const width = innerWidth;
  const stored = (await chrome.storage.local.get(KEY))[KEY];
  if (stored === false) throw new Error('The skin is currently OFF. Turn it on first: chrome.storage.local.set({"iw-skin-enabled": true})');

  console.log('[contract] snapshot 1/3 (skin on)…');
  await settle();
  const on1 = snapshot();
  const on1Elements = new Set(on1.keys());

  console.log('[contract] snapshot 2/3 (skin off)…');
  await setEnabled(false);
  await frames(6); await wait(400);
  const off = snapshot();

  console.log('[contract] snapshot 3/3 (skin on again)…');
  await setEnabled(true);
  await settle();
  const on2 = snapshot();

  const report = {
    generatedBy: 'handoff/native-render-migration/tools/capture-skin-contract.js',
    capturedAt: new Date().toISOString(),
    route, width, height: innerHeight, devicePixelRatio,
    userAgent: navigator.userAgent,
    html: null,
    nodes: [],
    appended: [],
    volatile: [],
    summary: { attributes: {}, classes: {}, inlineProperties: {}, appendedByClass: {} },
  };

  // 1. Nodes the skin APPENDED: present with the skin on, gone after teardown.
  //    Report only the outermost of each appended subtree. Every node the skin
  //    creates carries a skin class or attribute at its top level; an UNMARKED
  //    node that vanished was removed by the game itself in the meantime (a
  //    chat row, a toast) and is reported as volatile instead.
  const skinMarked = el => [...el.attributes].some(a => /^data-(?:iw|fs)-/.test(a.name))
    || [...el.classList].some(c => /^(?:fs|iw)-/.test(c));
  for (const el of on1Elements) {
    if (off.has(el)) continue;
    const rec = on1.get(el);
    const parent = rec.parent;
    const insideAppended = parent && !off.has(parent) && on1Elements.has(parent);
    if (!skinMarked(el) && !insideAppended) {
      report.volatile.push({ path: parent ? pathOf(parent, off) : '(detached)', label: label(el), changes: [{ kind: 'removed-by-game', name: el.tagName.toLowerCase() }] });
      continue;
    }
    if (insideAppended) continue; // reported with its outermost appended ancestor
    let previousGame = rec.prev;
    while (previousGame && !off.has(previousGame)) previousGame = on1.get(previousGame)?.prev || null;
    let nextGame = rec.next;
    while (nextGame && !off.has(nextGame)) nextGame = on1.get(nextGame)?.next || null;
    report.appended.push({
      surface: parent ? surfaceOf(parent) : '(detached)',
      parentPath: parent ? pathOf(parent, off) : null,
      position: !previousGame ? 'first child (before every game child)' : !nextGame ? 'last child (after every game child)' : 'between game children',
      afterGameChild: previousGame ? pathOf(previousGame, off).split(' > ').pop() : null,
      outerHTML: el.outerHTML.length > 4000 ? `${el.outerHTML.slice(0, 4000)}…(truncated)` : el.outerHTML,
    });
    const key = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : el.tagName.toLowerCase();
    report.summary.appendedByClass[key] = (report.summary.appendedByClass[key] || 0) + 1;
  }

  // 2. Marks written on GAME nodes: differ between on1 and off; confirmed by on2.
  for (const [el, a] of on1) {
    const b = off.get(el);
    if (!b) continue;
    const c = on2.get(el);
    const entry = { surface: surfaceOf(el), path: pathOf(el, off), label: label(el), attributes: {}, removedAttributes: [], classes: [], inlineStyle: {} };
    const volatile = [];

    for (const [name, value] of Object.entries(a.attrs)) {
      if (b.attrs[name] === value) continue;
      if (c && c.attrs[name] !== value) { volatile.push({ kind: 'attribute', name, on1: value, off: b.attrs[name] ?? null, on2: c.attrs[name] ?? null }); continue; }
      entry.attributes[name] = value;
      report.summary.attributes[name] = (report.summary.attributes[name] || 0) + 1;
    }
    for (const name of Object.keys(b.attrs)) {
      if (!(name in a.attrs)) entry.removedAttributes.push(name);
    }
    for (const cls of a.classes) {
      if (b.classes.includes(cls)) continue;
      if (c && !c.classes.includes(cls)) { volatile.push({ kind: 'class', name: cls }); continue; }
      entry.classes.push(cls);
      report.summary.classes[cls] = (report.summary.classes[cls] || 0) + 1;
    }
    for (const [prop, value] of Object.entries(a.style)) {
      if (b.style[prop] === value) continue;
      if (c && c.style[prop] !== value) { volatile.push({ kind: 'inline', name: prop, on1: value, off: b.style[prop] ?? null, on2: c.style[prop] ?? null }); continue; }
      entry.inlineStyle[prop] = { value, nativeValueWithSkinOff: b.style[prop] ?? null };
      report.summary.inlineProperties[prop] = (report.summary.inlineProperties[prop] || 0) + 1;
    }

    const empty = !Object.keys(entry.attributes).length && !entry.removedAttributes.length && !entry.classes.length && !Object.keys(entry.inlineStyle).length;
    if (volatile.length) report.volatile.push({ path: entry.path, label: entry.label, changes: volatile });
    if (empty) continue;
    if (el === document.documentElement) report.html = entry;
    else report.nodes.push(entry);
  }

  // Sort for reading: by surface, then document order.
  report.nodes.sort((x, y) => x.surface.localeCompare(y.surface));

  globalThis.__iwSkinContract = report;
  const file = `iw-skin-contract${route.replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || '-root'}-${width}.json`;
  if (!globalThis.IW_CONTRACT_NO_DOWNLOAD) {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file;
    document.body.append(a);
    a.click();
    a.remove();
  }

  console.log(`[contract] ${report.nodes.length} game nodes carry skin marks; ${report.appended.length} appended subtrees; ${report.volatile.length} nodes changed on their own (game ticking).`);
  console.table(Object.entries(report.summary.attributes).sort((p, q) => q[1] - p[1]).map(([name, count]) => ({ attribute: name, nodes: count })));
  console.table(Object.entries(report.summary.appendedByClass).sort((p, q) => q[1] - p[1]).map(([name, count]) => ({ appended: name, count })));
  console.log(`[contract] downloaded ${file}`);
  return report.summary;
})();
