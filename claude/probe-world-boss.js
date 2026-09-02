/**
 * probe-world-boss.js - READ ONLY. Paste into the DevTools console on
 * idleworlds.com with the skin ACTIVE and the World Bosses panel visible.
 *
 * The boss cards refuse the [data-iw-boss="card"] treatment and I have guessed
 * twice. The three things that can be wrong, and what this prints for each:
 *
 *  1. THE HEADING. classifyBossCards() matches /^world bosses$/i on an
 *     h1-h4's normalised textContent. If the live heading also swallows the
 *     "Shared world events" kicker, or is not an h1-h4 at all, the loop never
 *     starts. -> "heading" block.
 *  2. THE ROOT. It then walks heading.closest('.panel'). If the live wrapper
 *     is not .panel, or is a panel that does not contain the cards, the sweep
 *     runs over the wrong subtree. -> "root" block.
 *  3. THE CARDS. It tags leaf .compact-panel descendants. If the boss rows are
 *     some other element, nothing is tagged - and if they ARE tagged, then the
 *     attribute is landing and the failure is CSS being outranked instead.
 *     -> "cards" block, which reports both the attribute AND the winning
 *     computed background/border, so the two cases are told apart in one pass.
 *
 * Always check getBoundingClientRect: the page ships an xl:hidden mirror of
 * the whole panel stack and querySelector often returns the invisible copy.
 */
(() => {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const box = el => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`; };
  const out = { heading: [], root: null, cards: [], other: [] };

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')]
    .filter(h => /world boss/i.test(norm(h.textContent)));
  for (const h of headings) {
    out.heading.push({
      tag: h.tagName,
      text: JSON.stringify(norm(h.textContent)),
      matchesRegex: /^world bosses$/i.test(norm(h.textContent)),
      childElements: h.childElementCount,
      iwUi: h.dataset.iwUi || null,
      hidden: !!h.closest('[class~="xl:hidden"]'),
      rect: box(h),
    });
  }

  const heading = headings.find(h => !h.closest('[class~="xl:hidden"]') && h.getBoundingClientRect().width > 1);
  if (!heading) { console.log('NO VISIBLE World Bosses heading', out); return; }

  const chain = [];
  for (let cur = heading.parentElement, i = 0; cur && i < 6; cur = cur.parentElement, i += 1) {
    chain.push({ tag: cur.tagName, cls: (cur.className || '').toString().slice(0, 90), iwUi: cur.dataset.iwUi || null, rect: box(cur), compactPanels: cur.querySelectorAll('.compact-panel').length });
  }
  const root = heading.closest('.panel');
  out.root = { found: !!root, cls: root ? (root.className || '').toString().slice(0, 90) : null, rect: root ? box(root) : null, ancestorChain: chain };

  const scope = root || heading.closest('[data-iw-ui="section-frame"]') || heading.parentElement;
  for (const el of scope.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 200 || r.height < 40) continue;          // card-sized boxes only
    if (!/respawns|buff on kill|controls zone/i.test(norm(el.textContent))) continue;
    if ([...el.children].some(c => /respawns|buff on kill/i.test(norm(c.textContent)) && c.getBoundingClientRect().height > 40)) continue; // leaf-most
    const cs = getComputedStyle(el);
    out.cards.push({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 110),
      isCompactPanel: el.classList.contains('compact-panel'),
      iwBoss: el.getAttribute('data-iw-boss'),
      iwUi: el.dataset.iwUi || null,
      rect: box(el),
      border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      bgImage: cs.backgroundImage.slice(0, 120),
      bgColor: cs.backgroundColor,
      inlineStyle: el.getAttribute('style') || '',
    });
  }
  out.other = [...scope.querySelectorAll('.compact-panel')].map(el => ({ cls: (el.className || '').toString().slice(0, 80), iwBoss: el.getAttribute('data-iw-boss'), rect: box(el) }));

  console.log(JSON.stringify(out, null, 2));
  copy(JSON.stringify(out, null, 2));
  console.log('^ copied to clipboard');
})();
