/* READ-ONLY live capture for the Skill Actions cards.
 *
 * Paste into the DevTools console on the game page with the skin running. It
 * changes nothing: it only reads the DOM and computed styles, then downloads
 * one JSON file.
 *
 * Why this exists: the local fixture reports a perfectly concentric EXP ring at
 * the same column width where the live page shows it badly offset, and the
 * live page shows the game's own "LV 57+2" level line on the cards that have a
 * recipe pager while the skin's own readout renders on the cards that do not.
 * Both mean the live DOM has a shape the fixture does not model, so the fixture
 * cannot be tuned into agreement — it has to be corrected from a capture.
 *
 * What it records, per card:
 *   - the real element tree with tag, skin attributes and the game's classes,
 *     so the fixture can be rebuilt to the same shape;
 *   - which branch each key node actually sits in (identity / content /
 *     commands), which is the thing suspected of differing on pager cards;
 *   - the medallion's box, its `position`, and the RESOLVED box of its ::after
 *     ring, so a non-concentric ring can be attributed to its containing block
 *     rather than guessed at;
 *   - every node in the hero branch and whether it is painting, which is how
 *     the native level/percent survive on some cards.
 */
(() => {
  const round = n => Math.round(n * 10) / 10;
  const rect = el => {
    const b = el.getBoundingClientRect();
    return { x: round(b.x), y: round(b.y), w: round(b.width), h: round(b.height),
      cx: round(b.x + b.width / 2), cy: round(b.y + b.height / 2) };
  };
  const shown = el => {
    const s = getComputedStyle(el); const b = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && b.width > 0.5 && b.height > 0.5;
  };
  const marks = el => Object.fromEntries([...el.attributes]
    .filter(a => a.name.startsWith('data-iw'))
    .map(a => [a.name.replace('data-iw-', ''), a.value]));
  const zoneOf = el => el.closest('[data-iw-skill-zone]')?.dataset.iwSkillZone || null;
  const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

  /* A pseudo-element's offsets resolve against its CONTAINING BLOCK's padding
     box, which is the host only when the host is positioned. Recording both
     the host's `position` and the resolved ring box is what distinguishes "the
     ring is mis-sized" from "the ring is anchored to the wrong element". */
  const pseudo = (el, which) => {
    const s = getComputedStyle(el, which);
    if (s.content === 'none' || s.display === 'none') return null;
    return {
      display: s.display, position: s.position, inset: s.inset,
      left: s.left, top: s.top, width: s.width, height: s.height,
      background: s.backgroundImage.slice(0, 90),
      mask: (s.maskImage || s.webkitMaskImage || 'none').slice(0, 90),
      transform: s.transform, zIndex: s.zIndex,
    };
  };

  const tree = (el, depth, out) => {
    for (const kid of el.children) {
      const s = getComputedStyle(kid);
      out.push({
        depth,
        tag: kid.tagName.toLowerCase(),
        cls: (kid.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 6).join(' '),
        marks: marks(kid),
        zone: zoneOf(kid),
        display: s.display, position: s.position, order: s.order,
        box: rect(kid),
        painting: shown(kid),
        text: text(kid),
      });
      if (depth < 5) tree(kid, depth + 1, out);
    }
  };

  const cards = [...document.querySelectorAll('.compact-panel.fs-skill-panel')]
    .filter(el => el.getBoundingClientRect().width > 1);

  const capture = {
    takenAt: new Date().toISOString(),
    href: location.href,
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    design: document.documentElement.dataset.iwSkillCardDesign || null,
    zoneTheme: document.documentElement.dataset.iwZoneTheme || null,
    buttonAtlas: document.documentElement.dataset.iwButtonAtlas || null,
    sheets: [...document.querySelectorAll('style[data-iw-style]')].map(s => s.dataset.iwStyle),
    cardCount: cards.length,
    cards: cards.map(card => {
      const q = sel => card.querySelector(sel);
      const art = q('.fs-skill-medallion-art');
      const nodes = [];
      tree(card, 0, nodes);

      const named = {};
      for (const [key, sel] of [
        ['shell', '[data-iw-skill-layout-shell="1"]'],
        ['identityZone', '[data-iw-skill-zone="identity"]'],
        ['contentZone', '[data-iw-skill-zone="content"]'],
        ['commandZone', '[data-iw-skill-zone="commands"]'],
        ['medallion', '.fs-skill-medallion-art'],
        ['skinReadout', '[data-iw-skill-v2-level-readout]'],
        ['nativePercent', '.fs-skill-identity-percent'],
        ['nativeBar', '.fs-skill-identity-progress'],
        ['nativeLevel', '[data-iw-skill-role="identity-level"]'],
        ['discipline', '[data-iw-skill-role="identity"]'],
        ['title', '[data-iw-skill-role="action-title"]'],
        ['actionButton', '[data-iw-skill-role="action-button"]'],
        ['navGroup', '[data-iw-skill-role="nav-group"]'],
        ['navButton', '[data-iw-skill-role="nav-button"]'],
        ['actionGlyph', '[data-iw-skill-v2-action-glyph]'],
        ['controls', '[data-iw-skill-v2-controls]'],
      ]) {
        const el = q(sel);
        named[key] = !el ? null : {
          zone: zoneOf(el),
          parentTag: el.parentElement?.tagName.toLowerCase() || null,
          parentZone: el.parentElement ? zoneOf(el.parentElement) : null,
          box: rect(el),
          painting: shown(el),
          position: getComputedStyle(el).position,
          display: getComputedStyle(el).display,
          inlineStyle: (el.getAttribute('style') || '').slice(0, 260),
          text: text(el),
        };
      }

      return {
        id: card.id || null,
        marks: marks(card),
        box: rect(card),
        /* The hero branch in full: this is where the native level and percent
           survive on some cards, and a survivor list keyed on DIRECT children
           misses anything the game nests one level deeper. */
        heroChildren: named.identityZone
          ? [...card.querySelector('[data-iw-skill-zone="identity"]').children].map(kid => ({
              tag: kid.tagName.toLowerCase(),
              cls: (kid.className || '').toString().slice(0, 60),
              marks: marks(kid),
              painting: shown(kid),
              box: rect(kid),
              text: text(kid),
              childCount: kid.children.length,
            }))
          : null,
        medallion: !art ? null : {
          box: rect(art),
          position: getComputedStyle(art).position,
          boxShadow: getComputedStyle(art).boxShadow.slice(0, 160),
          border: getComputedStyle(art).border,
          inlineStyle: (art.getAttribute('style') || '').slice(0, 260),
          offsetParent: art.offsetParent
            ? art.offsetParent.tagName.toLowerCase() + '.' +
              (art.offsetParent.className || '').toString().split(/\s+/)[0] +
              ' zone=' + (zoneOf(art.offsetParent) || 'none')
            : null,
          before: pseudo(art, '::before'),
          after: pseudo(art, '::after'),
        },
        /* The command group: where the action button, its icon and the arrows
           actually land, and every ancestor between the button and the card
           with each property that makes an element a containing block for
           absolutely positioned children. The icon and the button are placed
           from 50% of their containing block, so a mismatch here is the only
           way the icon can sit off its button. */
        commandGroup: (() => {
          const btn = card.querySelector('[data-iw-skill-role="action-button"]');
          const glyph = card.querySelector('[data-iw-skill-v2-action-glyph]');
          if (!btn) return null;
          const chain = [];
          for (let el = btn.parentElement; el && el !== card.parentElement; el = el.parentElement) {
            const cs = getComputedStyle(el);
            chain.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 80),
              zone: el.dataset.iwSkillZone || null, box: rect(el), position: cs.position, transform: cs.transform,
              translate: cs.translate, scale: cs.scale, rotate: cs.rotate, filter: cs.filter,
              backdrop: cs.backdropFilter, contain: cs.contain, willChange: cs.willChange,
              transformStyle: cs.transformStyle, perspective: cs.perspective, containerType: cs.containerType });
          }
          return { button: rect(btn), glyph: glyph ? rect(glyph) : null,
            glyphSharesParent: !!glyph && glyph.parentElement === btn.parentElement,
            buttonOffsetParent: btn.offsetParent ? btn.offsetParent.tagName.toLowerCase() + '.' + (btn.offsetParent.className || '').toString().split(/s+/)[0] : null,
            glyphOffsetParent: glyph?.offsetParent ? glyph.offsetParent.tagName.toLowerCase() + '.' + (glyph.offsetParent.className || '').toString().split(/s+/)[0] : null,
            arrows: [...card.querySelectorAll('[data-iw-skill-role="nav-button"]')].map(rect), chain };
        })(),
        named,
        nodes,
      };
    }),
  };

  const json = JSON.stringify(capture, null, 1);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'iw-skill-cards-capture.json';
  a.click();
  URL.revokeObjectURL(a.href);
  console.log(`captured ${capture.cardCount} skill cards, ${Math.round(json.length / 1024)} KB`);
  return capture;
})();
