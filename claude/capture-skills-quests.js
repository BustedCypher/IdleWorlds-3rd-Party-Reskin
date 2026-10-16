/* ============================================================================
   IdleWorlds Fantasy Skin — Skills + Quests menu capture

   READ-ONLY. This snippet does not modify the page, click anything, or send
   anything anywhere. It records the game's NEW Skills and Quests menus so the
   Fantasy profile can reskin them: their DOM shape, classes, where emoji are
   used as icons, the computed look of each node, and which of the native
   port's skill/quest rules (`/reskin-bc/theme/fantasy.css`) still match
   something on the page and which have gone stale.

   HOW TO RUN
     1. Open idleworlds.com with the game's theme set to Fantasy. Turn the
        extension OFF (chrome://extensions), so every data-iw-* hook on the
        page is the port's and not ours.
     2. Open the Skills menu (and, if it is a separate view, run once there).
        Then open the Quests menu and run again. If both are on screen at
        once, one run covers both.
     3. F12 -> Console. Paste this whole file, press Enter.
     4. It downloads  iw-skills-quests-<n>.json  and copies the JSON to your
        clipboard. Attach the FILE(S) to the chat, plus a screenshot of each
        menu if you can.

   If the download is blocked, the JSON stays at  window.__iwSkillsQuests.
   ========================================================================= */

(() => {
  const short = (v, n = 160) => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + `…(${s.length})` : s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  // Emoji: pictographs plus the variation selector / keycap forms the game uses.
  const EMOJI = /(\p{Extended_Pictographic}|\p{Regional_Indicator})(️|‍\p{Extended_Pictographic})*/gu;
  const stripLead = s => s.replace(/^[\s\p{Extended_Pictographic}️‍]+/u, '').trim();
  const headingOf = (root) => {
    const h = root.querySelector('h1,h2,h3,h4,[role="heading"]');
    return h ? stripLead(h.textContent || '') : '';
  };

  /* ---- 1. Find the menus ------------------------------------------------- */
  // Positive identity by heading or tab copy, never by class name (CLAUDE.md:
  // the live app has almost no stable hooks). Candidates: .panel cards,
  // dialogs, and any portalled fixed layer; plus route containers when the
  // URL itself names the menu.
  const WANT = /\b(skills?|quests?|quest log|quest board|work orders?)\b/i;
  const seen = new Set();
  const roots = [];
  const consider = (el, why) => {
    if (!el || seen.has(el) || !visible(el)) return;
    // keep the outermost candidate only
    for (const r of roots) if (r.el.contains(el)) return;
    for (let i = roots.length - 1; i >= 0; i--) if (el.contains(roots[i].el)) roots.splice(i, 1);
    seen.add(el);
    roots.push({ el, why });
  };
  // A candidate counts only when the heading is ITS OWN, not a descendant
  // panel's: the dashboard <section> wraps every panel, and taking it by its
  // first <h2> ("Skill Actions") spent the whole node budget before the
  // quests (run 1, 2026-10-16).
  const CANDIDATE = '.panel, [role="dialog"], [aria-modal="true"], [class*="fixed"]';
  for (const el of document.querySelectorAll(CANDIDATE)) {
    const hEl = el.querySelector('h1,h2,h3,h4,[role="heading"]');
    if (!hEl || hEl.closest(CANDIDATE) !== el) continue;
    const h = stripLead(hEl.textContent || '');
    if (h && WANT.test(h) && h.length < 40) consider(el, `heading "${h}"`);
  }
  // Panels with no matching heading of their own but quest-shaped content.
  for (const el of document.querySelectorAll('.panel')) {
    if (seen.has(el)) continue;
    const t = el.textContent || '';
    if (/quests?/i.test(t) && /Turn In|% complete|Reward:/i.test(t) && !el.querySelector('.panel')) consider(el, 'quest-shaped content');
  }
  // Tab / menu buttons that name the menus, so we see the navigation too.
  const navButtons = [...document.querySelectorAll('button, a, [role="tab"]')]
    .filter(b => visible(b) && WANT.test(stripLead(b.textContent || '')) && (b.textContent || '').length < 40);
  if (/skill|quest/i.test(location.pathname) && document.querySelector('main')) consider(document.querySelector('main'), `route ${location.pathname}`);

  /* ---- 2. Describe each node -------------------------------------------- */
  const PROPS = [
    'display', 'position', 'gridTemplateColumns', 'flexDirection', 'gap',
    'width', 'height', 'padding', 'margin',
    'color', 'backgroundColor', 'backgroundImage', 'backgroundSize',
    'border', 'borderRadius', 'borderImageSource', 'boxShadow',
    'fontFamily', 'fontSize', 'fontWeight', 'textTransform', 'opacity',
  ];
  const DEFAULTS = new Set(['none', 'normal', '0px', 'auto', 'rgba(0, 0, 0, 0)', 'static', 'block', 'inline', '1', 'visible', '0px none rgb(0, 0, 0)']);
  const styleOf = (el) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of PROPS) {
      const v = cs[p];
      if (v && !DEFAULTS.has(v)) out[p] = short(v, 120);
    }
    return out;
  };
  const attrsOf = (el) => {
    const out = {};
    for (const a of el.attributes) {
      if (a.name === 'class' || a.name === 'style') continue;
      out[a.name] = short(a.value, 80);
    }
    return out;
  };
  const pathOf = (el, root) => {
    const parts = [];
    for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
      const i = n.parentElement ? [...n.parentElement.children].indexOf(n) : 0;
      parts.unshift(`${n.tagName.toLowerCase()}:${i}`);
    }
    return parts.join('>');
  };

  const MAX_NODES = 2500;
  const describeTree = (root) => {
    const nodes = [];
    const emoji = [];
    const imgs = [];
    const walk = (el, depth) => {
      if (nodes.length >= MAX_NODES) return;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ');
      const node = {
        path: pathOf(el, root),
        depth,
        tag: el.tagName.toLowerCase(),
        cls: short(el.getAttribute('class') || '', 240),
        attrs: attrsOf(el),
        inline: short(el.getAttribute('style') || '', 200) || undefined,
        text: short(own, 100) || undefined,
        visible: visible(el),
        box: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
        style: styleOf(el),
        before: (() => { const p = getComputedStyle(el, '::before'); return p.content && p.content !== 'none' ? short(`${p.content} ${p.backgroundImage}`, 140) : undefined; })(),
        after: (() => { const p = getComputedStyle(el, '::after'); return p.content && p.content !== 'none' ? short(`${p.content} ${p.backgroundImage}`, 140) : undefined; })(),
        children: el.children.length,
      };
      nodes.push(node);
      for (const m of own.matchAll(EMOJI)) {
        emoji.push({ emoji: m[0], path: node.path, tag: node.tag, cls: node.cls, context: short(own, 60), fontSize: getComputedStyle(el).fontSize });
      }
      if (el.tagName === 'IMG' || el.tagName === 'svg' || el.tagName === 'SVG') {
        imgs.push({ path: node.path, tag: node.tag, src: short(el.getAttribute('src') || '', 160), alt: el.getAttribute('alt') || undefined, cls: node.cls });
      }
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(root, 0);
    return { nodes, emoji, imgs, truncated: nodes.length >= MAX_NODES };
  };

  /* ---- 3. The port's skill/quest rules: matched or stale ----------------- */
  const ownSheet = s => !!s.ownerNode?.closest?.('[data-iw-style],[data-iw-fantasy-style]');
  const RELEVANT = /skill|quest|compact-panel|data-iw-ui|work-?order|sigil/i;
  const portRules = [];
  const walkRules = (rules, href) => {
    for (const r of rules) {
      if (r.selectorText && RELEVANT.test(r.selectorText)) portRules.push({ sel: r.selectorText, href });
      // Recurse only into real grouping rules (CLAUDE.md, verification).
      if (r.cssRules && r.cssRules.length > 0) walkRules(r.cssRules, href);
    }
  };
  const sheets = [];
  for (const s of document.styleSheets) {
    if (ownSheet(s)) continue;
    let rules;
    try { rules = s.cssRules; } catch { sheets.push({ href: s.href, readable: false }); continue; }
    sheets.push({ href: s.href || 'inline', rules: rules.length });
    walkRules(rules, s.href || 'inline');
  }
  const matchCount = (sel) => {
    // Strip pseudo-elements/classes that querySelectorAll cannot take.
    const clean = sel.replace(/::?(before|after|placeholder|marker|selection|-webkit-[\w-]+)/g, '')
      .replace(/:(hover|focus|focus-visible|focus-within|active|visited)/g, '');
    try { return document.querySelectorAll(clean).length; } catch { return -1; }
  };
  const ruleReport = { total: portRules.length, matched: [], stale: [], unparsable: [] };
  const dedup = new Map();
  for (const r of portRules) if (!dedup.has(r.sel)) dedup.set(r.sel, r);
  for (const r of dedup.values()) {
    const n = matchCount(r.sel);
    const entry = { sel: short(r.sel, 300), n, href: r.href };
    if (n > 0) ruleReport.matched.push(entry);
    else if (n === 0) ruleReport.stale.push(entry);
    else ruleReport.unparsable.push(entry);
  }

  /* ---- 3b. The game's own CSS for its new skill/quest classes ------------ */
  // Full text, not a summary: these are the rules the reskin layers over.
  const NEW_CLASS = /\.iw-(skill-tab|skill-sheet|skill-cards|ss-|q|quest)/;
  const gameRules = [];
  const collect = (rules, href) => {
    for (const r of rules) {
      if (r.selectorText && NEW_CLASS.test(r.selectorText)) gameRules.push({ href, css: r.cssText });
      else if (r.cssRules && r.cssRules.length > 0 && r.cssText && NEW_CLASS.test(r.cssText)) {
        const head = r.cssText.slice(0, r.cssText.indexOf('{')).trim();
        for (const c of r.cssRules) if (c.selectorText && NEW_CLASS.test(c.selectorText)) gameRules.push({ href, at: head, css: c.cssText });
      }
    }
  };
  for (const s of document.styleSheets) {
    if (ownSheet(s)) continue;
    try { collect(s.cssRules, s.href || `inline:${s.ownerNode?.parentElement?.className || ''}`); } catch { /* cross-origin */ }
  }
  const inlineStyles = roots.flatMap(({ el }) => [...el.querySelectorAll('style')].map(st => ({ parent: st.parentElement?.className || '', css: st.textContent })));

  /* ---- 4. Port hooks present on the page --------------------------------- */
  const hookCounts = {};
  for (const el of document.querySelectorAll('*')) {
    for (const a of el.attributes) {
      if (!a.name.startsWith('data-iw-')) continue;
      const k = `${a.name}=${short(a.value, 30)}`;
      hookCounts[k] = (hookCounts[k] || 0) + 1;
    }
  }

  /* ---- 5. Output --------------------------------------------------------- */
  const out = {
    meta: {
      captured: new Date().toISOString(),
      url: location.pathname + location.search,
      viewport: [innerWidth, innerHeight],
      dataSkin: document.documentElement.getAttribute('data-skin') || document.body.getAttribute('data-skin'),
      extensionStylesPresent: !!document.querySelector('[data-iw-style],[data-iw-fantasy-style]'),
      storedSkin: (() => { try { return localStorage.getItem('idleworlds-skin'); } catch { return null; } })(),
    },
    menus: roots.map(({ el, why }) => ({
      why,
      heading: headingOf(el),
      outerHTMLHead: short(el.outerHTML, 6000),
      ...describeTree(el),
    })),
    navButtons: navButtons.slice(0, 40).map(b => ({ tag: b.tagName.toLowerCase(), text: short(b.textContent, 40), cls: short(b.getAttribute('class') || '', 200), attrs: attrsOf(b), style: styleOf(b) })),
    sheets,
    portRules: ruleReport,
    gameRules,
    inlineStyles,
    hooks: hookCounts,
  };

  const json = JSON.stringify(out, null, 1);
  window.__iwSkillsQuests = out;
  const n = (window.__iwSkillsQuestsRun = (window.__iwSkillsQuestsRun || 0) + 1);
  const file = `iw-skills-quests-${n}.json`;
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    console.log(`[iw] Downloaded ${file}`);
  } catch { console.log('[iw] Download blocked — the JSON is at window.__iwSkillsQuests'); }
  try { copy(json); console.log('[iw] Also copied to clipboard.'); }
  catch { console.log('[iw] Clipboard copy unavailable — use the downloaded file.'); }
  console.log(`[iw] ${roots.length} menu(s): ${roots.map(r => r.why).join('; ') || 'NONE FOUND — open the menu and run again'}; ` +
    `${out.menus.reduce((s, m) => s + m.emoji.length, 0)} emoji; port rules ${ruleReport.matched.length} matched / ${ruleReport.stale.length} stale.`);
})();
