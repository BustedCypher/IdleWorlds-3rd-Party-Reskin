/* READ-ONLY live capture for the repeated-copy card (Curtis, 2026-09-16).
 *
 * Paste into the DevTools console on the game page, WHILE the card is showing
 * the repeated text, with the skin running. It changes nothing: it reads the
 * DOM and downloads one JSON file.
 *
 * Why this exists: `ingredientEntries` anchored each material cell at the last
 * "•" or "\n" before its count, and the live line has neither (an emoji per
 * material, and textContent puts no newline between elements), so every cell
 * held the whole run-up to its own count. That defect is fixed and pinned by
 * tests/ingredient-entries.test.mjs — but it is BOUNDED by the source node's
 * own text, and the capture showed far more repetition than one card's copy.
 * The unbounded version needs a source that CONTAINS the node the skin writes
 * into, which feeds each pass's text back into its own input. That invariant
 * holds in all sixteen shapes claude/probe-text-runaway.mjs models, so if the
 * card comes back it is a shape this repo has never seen, and no session can
 * get it from a fixture. This records the answer directly.
 *
 * What it records, for every card whose text is implausibly long:
 *   - which skin node the runaway text actually lives in, and its length;
 *   - the full ancestor chain of that node with each ancestor's skin
 *     attributes, so a source that contains its own target is visible;
 *   - every containment violation among the three reader/writer pairs;
 *   - the ingredient sources and the raw text each one was sliced from;
 *   - whether the growth is still running, sampled twice one second apart.
 */
(() => {
  const PAIRS = [
    ['[data-iw-ingr]', '[data-iw-skill-ingredient-list]', 'ingredient source contains its own generated list'],
    ['[data-iw-skill-v2-section]', '[data-iw-skill-v2-body]', 'marked section contains the V2 body built from it'],
    ['[data-iw-skill-v2-section]', '[data-iw-skill-v2-req-note]', 'marked section contains the requirement note copied from it'],
  ];
  const flat = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const describe = el => ({
    tag: el.tagName.toLowerCase(),
    cls: (el.getAttribute('class') || '').slice(0, 120),
    skin: Object.fromEntries(Object.entries(el.dataset).filter(([k]) => k.startsWith('iw') || k.startsWith('fs'))),
    childElements: el.childElementCount,
    textLength: flat(el).length,
  });
  const chain = el => { const out = []; for (let c = el; c && c !== document.body; c = c.parentElement) out.push(describe(c)); return out; };

  const scan = () => [...document.querySelectorAll('.compact-panel')].map((panel, i) => {
    /* Every node the skin writes copied text into. The longest one is where
       the repetition is actually accumulating. */
    const written = [...panel.querySelectorAll(
      '.iw-skill-v2-body-row, .fs-skill-ingredient-item, [data-iw-skill-v2-req-note]')]
      .map(el => ({ el, len: flat(el).length }))
      .sort((a, b) => b.len - a.len);
    const worst = written[0] || null;

    const violations = [];
    for (const [srcSel, dstSel, why] of PAIRS) {
      for (const src of panel.querySelectorAll(srcSel)) {
        for (const dst of panel.querySelectorAll(dstSel)) {
          if (src !== dst && src.contains(dst)) violations.push({ why, source: describe(src), target: describe(dst) });
        }
      }
    }

    return {
      index: i,
      id: panel.id || null,
      skill: panel.dataset.iwSkillV2Type || panel.dataset.fsSkill || null,
      layout: panel.dataset.iwSkillLayout || null,
      panelTextLength: flat(panel).length,
      cells: written.length,
      widestCell: worst ? worst.len : 0,
      /* Both ends of the longest cell: a doubling loop shows the same run-in
         at the head and a truncated copy of it at the tail. */
      widestCellHead: worst ? flat(worst.el).slice(0, 400) : '',
      widestCellTail: worst ? flat(worst.el).slice(-200) : '',
      widestCellChain: worst ? chain(worst.el) : [],
      violations,
      /* What each cell was sliced FROM. If a source's text is already the
         card's whole copy, the source is the thing to explain, not the slice. */
      ingredientSources: [...panel.querySelectorAll('[data-iw-ingr]')]
        .filter(el => !el.parentElement?.closest?.('[data-iw-ingr]'))
        .map(el => ({ ...describe(el), text: flat(el).slice(0, 400),
          hasBullet: (el.textContent || '').includes('•'),
          hasNewline: (el.textContent || '').includes('\n'),
          listIsInside: !!el.querySelector('[data-iw-skill-ingredient-list]') })),
      sections: [...panel.querySelectorAll('[data-iw-skill-v2-section]')]
        .map(el => ({ section: el.dataset.iwSkillV2Section, ...describe(el), text: flat(el).slice(0, 200) })),
    };
  });

  const first = scan();
  setTimeout(() => {
    const second = scan();
    const capture = {
      capturedAt: new Date().toISOString(),
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight },
      skinVersion: document.documentElement.dataset.iwSkinVersion || null,
      /* Still growing, or settled at a large value? A doubling loop is a very
         different bug from one bad slice, and this is the only way to tell
         them apart after the fact. */
      growth: first.map((card, i) => ({
        id: card.id, index: i,
        panelText: [card.panelTextLength, second[i]?.panelTextLength ?? null],
        widestCell: [card.widestCell, second[i]?.widestCell ?? null],
        stillGrowing: (second[i]?.panelTextLength ?? 0) > card.panelTextLength,
      })),
      cards: second,
    };
    const json = JSON.stringify(capture, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'iw-runaway-text-capture.json';
    a.click();
    URL.revokeObjectURL(a.href);
    const growing = capture.growth.filter(g => g.stillGrowing).length;
    const violations = second.reduce((n, c) => n + c.violations.length, 0);
    console.log(`captured ${second.length} cards, ${violations} containment violation(s), `
      + `${growing} still growing, ${Math.round(json.length / 1024)} KB`);
    window.__iwRunawayCapture = capture;
  }, 1000);

  console.log('sampling for 1s, the download will start automatically…');
})();
