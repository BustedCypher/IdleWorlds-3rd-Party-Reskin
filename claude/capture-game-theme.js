/* ============================================================================
   IdleWorlds Fantasy Skin — game theme capture

   READ-ONLY. This snippet does not modify the page, click anything, or send
   anything anywhere. It reads the game's own theme (the `data-skin` knob),
   every stylesheet rule that theme ships, the design tokens, fonts and the
   computed look of the main surfaces, then hands you a JSON file to download.
   It is the starting point for Fantasy-profile work: what the game already
   paints, before the skin adds anything.

   HOW TO RUN
     1. Open idleworlds.com with the game's theme set to the one you want to
        capture (the game's own settings). Turn the extension off, so the
        capture is the game's look and not the extension's (Legacy, or the
        Fantasy profile's raid port). The capture reports extension styles in
        `meta.skin` either way. With the extension on, `hooks` also lists
        Fantasy's own marks, so capture hooks with it off too.
     2. Visit the route you care about (Game tab covers most surfaces).
     3. F12 (or Ctrl+Shift+J) -> Console. Paste this whole file, press Enter.
     4. It downloads  iw-game-theme-<skin>.json  and copies the JSON to your
        clipboard. Attach the FILE to the chat.

   OPTIONAL: to include the extension's own settings (`iw-skin-theme` etc.),
   pick "IdleWorlds Fantasy Skin" in the Console's context dropdown (top-left,
   usually "top") before pasting; `chrome.storage` is only visible there.
   Run once per game theme to compare them.

   If the download is blocked, the JSON stays at  window.__iwThemeCapture.
   ========================================================================= */

(async () => {
  const short = (v, n = 120) => {
    const s = String(v ?? '');
    return s.length > n ? s.slice(0, n) + `…(${s.length})` : s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const skinOwned = (el) => !!el.closest('[data-iw-village-scene-owned],[data-iw-raid-owned],[data-iw-style],[data-iw-fantasy-owned]');

  /* ---- 1. Which theme is live -------------------------------------------- */
  const skinNodes = [...document.querySelectorAll('[data-skin]')];
  const liveSkin = (skinNodes.find(visible) ?? skinNodes[0])?.getAttribute('data-skin') ?? null;

  /* ---- 2. Every rule, walked properly ------------------------------------
     Recurse into a rule's children only when it HAS children: a plain
     CSSStyleRule exposes a truthy-but-empty cssRules, and treating that as
     "a group" once silently dropped every style rule (CLAUDE.md). */
  const sheets = [];
  const themeRules = [];       // selectors that mention data-skin
  const themeSheetRules = [];  // EVERY rule of a theme-only sheet (/theme/<name>.css):
                               // such a sheet is loaded per theme, so its selectors
                               // need not mention data-skin at all
  const tokenDecls = [];       // every --custom-property declaration
  const fontFaces = [];
  const keyframes = [];
  const skinValues = new Set(); // every theme name the CSS knows about
  let styleRuleCount = 0;

  const conditionOf = (rule) => {
    const out = [];
    for (let p = rule.parentRule; p; p = p.parentRule) {
      if (p.conditionText !== undefined) out.unshift(`@${p.constructor.name.replace(/^CSS|Rule$/g, '').toLowerCase()} ${p.conditionText}`);
      else if (p.name !== undefined && p.constructor.name === 'CSSLayerBlockRule') out.unshift(`@layer ${p.name}`);
      else if (p.selectorText) out.unshift(p.selectorText);
    }
    return out;
  };

  const walk = (rules, source, themeSheet) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        styleRuleCount++;
        const sel = rule.selectorText;
        for (const m of sel.matchAll(/data-skin\s*[~|^$*]?=\s*["']?([\w-]+)/g)) skinValues.add(m[1]);
        if (/data-skin/.test(sel)) {
          themeRules.push({ source, context: conditionOf(rule), selector: sel, css: rule.style.cssText });
        }
        if (themeSheet) themeSheetRules.push({ source, context: conditionOf(rule), selector: sel, css: rule.style.cssText });
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i];
          if (prop.startsWith('--')) {
            tokenDecls.push({
              source, selector: sel, context: conditionOf(rule), prop,
              value: rule.style.getPropertyValue(prop).trim(),
              important: rule.style.getPropertyPriority(prop) === 'important',
            });
          }
        }
      } else if (rule instanceof CSSFontFaceRule) {
        fontFaces.push({
          family: rule.style.getPropertyValue('font-family'),
          weight: rule.style.getPropertyValue('font-weight'),
          style: rule.style.getPropertyValue('font-style'),
          src: short(rule.style.getPropertyValue('src'), 200),
          unicodeRange: short(rule.style.getPropertyValue('unicode-range'), 80),
        });
      } else if (rule instanceof CSSKeyframesRule) {
        keyframes.push(rule.name);
      }
      if (rule.cssRules && rule.cssRules.length > 0) walk(rule.cssRules, source, themeSheet);
    }
  };

  for (const sheet of document.styleSheets) {
    const owner = sheet.ownerNode;
    const source = sheet.href ?? (owner?.getAttribute?.('data-iw-fantasy-style')
      ? `skin:<style data-iw-fantasy-style="${owner.getAttribute('data-iw-fantasy-style')}">`
      : owner?.getAttribute?.('data-iw-style')
      ? `skin:<style data-iw-style="${owner.getAttribute('data-iw-style')}">`
      : `inline:<${owner?.tagName?.toLowerCase() ?? '?'}>`);
    const entry = { source, media: sheet.media?.mediaText || null, disabled: sheet.disabled, rules: null, readable: true };
    // The extension's own sheets are not the game's theme — list, don't walk.
    if (owner?.hasAttribute?.('data-iw-style') || owner?.hasAttribute?.('data-iw-fantasy-style')) { entry.skin = true; sheets.push(entry); continue; }
    entry.themeSheet = /\/theme\/[\w-]+\.css(\?|$)/.test(sheet.href ?? '');
    try {
      entry.rules = sheet.cssRules.length;
      walk(sheet.cssRules, source, entry.themeSheet);
    } catch (e) {
      entry.readable = false;
      entry.error = e.name; // cross-origin sheet: CSSOM refuses to read it
    }
    sheets.push(entry);
  }

  /* ---- 3. Token values as they actually resolve --------------------------
     Declared names come from the CSS; the value that wins on :root and on the
     data-skin wrapper is what the game is painting with right now. */
  const tokenNames = [...new Set(tokenDecls.map(t => t.prop))].sort();
  const resolveTokens = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {};
    for (const name of tokenNames) {
      const v = cs.getPropertyValue(name).trim();
      if (v) out[name] = v;
    }
    return out;
  };
  const skinEl = skinNodes.find(visible) ?? skinNodes[0] ?? null;

  /* ---- 4. Computed look of the main surfaces ----------------------------- */
  const PROPS = [
    'display', 'position', 'color', 'backgroundColor', 'backgroundImage',
    'border', 'borderColor', 'borderRadius', 'boxShadow', 'outline',
    'backdropFilter', 'opacity', 'fontFamily', 'fontSize', 'fontWeight',
    'lineHeight', 'letterSpacing', 'textTransform', 'textShadow', 'padding',
    'gap', 'transition', 'filter',
  ];
  const describe = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const style = {};
    for (const p of PROPS) style[p] = short(cs[p], 160);
    return {
      tag: el.tagName.toLowerCase(),
      classes: short(el.className?.baseVal ?? el.className, 240),
      attrs: [...el.attributes]
        .filter(a => !['class', 'style'].includes(a.name) && !a.name.startsWith('data-iw'))
        .map(a => `${a.name}="${short(a.value, 60)}"`),
      text: short((el.textContent || '').replace(/\s+/g, ' ').trim(), 60),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      style,
      before: pseudo(el, '::before'),
      after: pseudo(el, '::after'),
    };
  };
  const pseudo = (el, which) => {
    const cs = getComputedStyle(el, which);
    if (cs.content === 'none' || cs.content === 'normal') return null;
    return { content: short(cs.content, 60), backgroundImage: short(cs.backgroundImage, 120), border: cs.border, boxShadow: short(cs.boxShadow, 120) };
  };
  const SURFACES = {
    html: 'html', body: 'body', skinRoot: '[data-skin]', header: 'header', nav: 'nav', main: 'main',
    panel: '.panel', compactPanel: '.compact-panel', currentAction: '#current-action-panel',
    h1: 'h1', h2: 'h2', h3: 'h3', paragraph: 'p', link: 'a[href]',
    buttonPrimary: '.button-primary', button: 'button', switch: '[role="switch"]',
    input: 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])',
    select: 'select', table: 'table', progress: 'progress, [role="progressbar"], [class*="progress"]',
    badge: '[class*="badge"], [class*="rounded-full"]', scrollbar: '[class*="overflow-y-auto"], [class*="overflow-auto"]',
  };
  const surfaces = {};
  for (const [key, sel] of Object.entries(SURFACES)) {
    const hits = [...document.querySelectorAll(sel)].filter(el => !skinOwned(el) && visible(el));
    surfaces[key] = { matched: hits.length, samples: hits.slice(0, key === 'button' ? 8 : 3).map(describe) };
  }

  /* ---- 5. Palette / type / shape tallies over every visible element -------
     Reads only, in one pass: no writes, so no layout thrash. */
  const tally = { color: new Map(), backgroundColor: new Map(), borderColor: new Map(),
    fontFamily: new Map(), fontSize: new Map(), fontWeight: new Map(), borderRadius: new Map(),
    boxShadow: new Map(), classToken: new Map() };
  const bump = (map, k) => map.set(k, (map.get(k) ?? 0) + 1);
  let walked = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (walked >= 8000) break;
    if (skinOwned(el) || el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    walked++;
    const cs = getComputedStyle(el);
    bump(tally.color, cs.color);
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bump(tally.backgroundColor, cs.backgroundColor);
    if (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') bump(tally.borderColor, cs.borderTopColor);
    bump(tally.fontFamily, cs.fontFamily);
    bump(tally.fontSize, cs.fontSize);
    bump(tally.fontWeight, cs.fontWeight);
    if (cs.borderTopLeftRadius !== '0px') bump(tally.borderRadius, cs.borderRadius);
    if (cs.boxShadow !== 'none') bump(tally.boxShadow, short(cs.boxShadow, 160));
    for (const c of el.classList) bump(tally.classToken, c);
  }
  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));

  /* ---- 6. Settings ------------------------------------------------------- */
  const readStore = (getStore) => {
    const all = {}; const themeLike = {};
    let store;
    try { store = getStore(); } catch (e) { return { error: e.message }; }
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        const v = store.getItem(k);
        all[k] = `${(v ?? '').length} chars`;
        if (/theme|skin|font|colou?r|mode|setting|pref|ui|display/i.test(k)) themeLike[k] = short(v, 400);
      }
    } catch (e) { return { error: e.message }; }
    return { keys: all, themeLike };
  };
  let extensionSettings = 'unavailable here — pick the extension in the Console context dropdown to include it';
  try {
    if (globalThis.chrome?.storage?.local) extensionSettings = await chrome.storage.local.get(null);
  } catch (e) { extensionSettings = `error: ${e.message}`; }

  /* ---- 7. Assemble -------------------------------------------------------- */
  /* ---- 6b. Hook inventory ------------------------------------------------
     Every data-iw-* attribute on the page, with its values and a count: the
     native port writes the skin's own hooks, so this is the contract a
     Fantasy rule or module can key on, route by route. */
  const hooks = new Map();
  for (const el of document.querySelectorAll('*')) {
    for (const a of el.attributes) {
      if (!a.name.startsWith('data-iw')) continue;
      const h = hooks.get(a.name) ?? { count: 0, values: new Map(), sample: null };
      h.count++;
      const v = short(a.value, 40);
      h.values.set(v, (h.values.get(v) ?? 0) + 1);
      h.sample ??= `${el.tagName.toLowerCase()}.${short(el.className?.baseVal ?? el.className, 60)}`;
      hooks.set(a.name, h);
    }
  }
  const ownedClasses = new Map(); // the port's own iw-* / fs-* class names
  for (const el of document.querySelectorAll('[class*="iw-"], [class*="fs-"]')) {
    for (const c of el.classList) if (/^(iw|fs)-/.test(c)) bump(ownedClasses, c);
  }

  // Legacy's sheets are style[data-iw-style]; the Fantasy profile's are
  // style[data-iw-fantasy-style] (src/skins/fantasy/core/StyleInjector.js).
  const skinStyles = document.querySelectorAll('style[data-iw-style], style[data-iw-fantasy-style]').length;
  // The game's native Fantasy port writes the same data-iw-* hooks, so marked
  // nodes alone do NOT mean the extension is active; its <style> tags do.
  const skinMarks = document.querySelectorAll('[data-iw-ui],[data-iw-chrome],[data-iw-overlay],[data-iw-collapse]').length;
  const capture = {
    meta: {
      capturedAt: new Date().toISOString(),
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      userAgent: navigator.userAgent,
      liveSkin,
      skinNodes: skinNodes.map(n => ({ tag: n.tagName.toLowerCase(), value: n.getAttribute('data-skin'), visible: visible(n) })),
      skinValuesInCss: [...skinValues].sort(),
      htmlAttrs: [...document.documentElement.attributes].filter(a => !a.name.startsWith('data-iw')).map(a => `${a.name}="${short(a.value, 80)}"`),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      skin: { styleTags: skinStyles, markedNodes: skinMarks,
        warning: skinStyles ? "Extension presentation is ACTIVE (Legacy, or Fantasy's raid port) — surfaces below include it. Turn the extension off for a clean capture of the game's own theme." : null },
      counts: { sheets: sheets.length, styleRules: styleRuleCount, themeRules: themeRules.length, themeSheetRules: themeSheetRules.length,
        tokenDeclarations: tokenDecls.length, tokens: tokenNames.length, fontFaces: fontFaces.length, elementsTallied: walked },
    },
    settings: {
      localStorage: readStore(() => localStorage),
      sessionStorage: readStore(() => sessionStorage),
      extension: extensionSettings,
    },
    tokens: {
      resolvedOnRoot: resolveTokens(document.documentElement),
      resolvedOnSkinRoot: resolveTokens(skinEl),
      declarations: tokenDecls,
    },
    themeRules,
    themeSheetRules,
    themeRulesForLiveSkin: liveSkin ? themeRules.filter(r => new RegExp(`data-skin\\s*[~|^$*]?=\\s*["']?${liveSkin}\\b`).test(r.selector)) : [],
    fonts: {
      faces: fontFaces,
      loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight} ${f.style}`),
    },
    keyframes: [...new Set(keyframes)].sort(),
    sheets,
    surfaces,
    palette: {
      color: top(tally.color, 40), backgroundColor: top(tally.backgroundColor, 40),
      borderColor: top(tally.borderColor, 30), boxShadow: top(tally.boxShadow, 20),
    },
    type: { fontFamily: top(tally.fontFamily, 15), fontSize: top(tally.fontSize, 25), fontWeight: top(tally.fontWeight, 10) },
    shape: { borderRadius: top(tally.borderRadius, 20) },
    classTokens: top(tally.classToken, 200),
    hooks: Object.fromEntries([...hooks].sort().map(([k, h]) => [k, {
      count: h.count, sample: h.sample,
      values: Object.fromEntries([...h.values].sort((x, y) => y[1] - x[1]).slice(0, 25)) }])),
    ownedClasses: top(ownedClasses, 300),
  };

  // A capture that walked zero rules or elements is broken, not empty.
  if (!styleRuleCount) console.warn('[iw] Read ZERO style rules — capture is broken (cross-origin sheets?). See `sheets`.');
  if (!walked) console.warn('[iw] Tallied ZERO visible elements — capture is broken.');
  if (!liveSkin) console.warn('[iw] No [data-skin] found — the game may have renamed its theme hook.');

  const json = JSON.stringify(capture, null, 2);
  window.__iwThemeCapture = capture;
  const file = `iw-game-theme-${liveSkin ?? 'unknown'}.json`;
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log(`[iw] Downloaded ${file} (${(json.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.warn('[iw] Download blocked:', e.message);
  }
  try { copy(json); console.log('[iw] Also copied to clipboard.'); }
  catch { console.log('[iw] Clipboard copy unavailable — use the downloaded file.'); }

  const c = capture.meta.counts;
  console.log(`[iw] skin "${liveSkin}" | known skins: ${capture.meta.skinValuesInCss.join(', ') || 'none'} | ` +
    `${c.styleRules} rules, ${c.themeRules} theme rules (${capture.themeRulesForLiveSkin.length} for this skin), ${c.themeSheetRules} in theme sheets | ` +
    `${c.tokens} tokens | ${c.fontFaces} font faces | ${c.elementsTallied} elements | ${Object.keys(capture.hooks).length} data-iw hooks`);
  if (capture.meta.skin.warning) console.warn('[iw]', capture.meta.skin.warning);
  console.log(capture);
})();
