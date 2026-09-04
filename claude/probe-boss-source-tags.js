/**
 * probe-boss-source-tags.js - READ ONLY. Paste into the DevTools console on
 * idleworlds.com with the skin ACTIVE and the World Bosses panel visible.
 *
 * The "World boss participation" / "Last battle participants" lines inside the
 * boss + Zone Control cards paint an odd grey rounded rectangle on the card's
 * flat-black ground. This dumps exactly what each of those nodes IS so the fix
 * targets a real element instead of a guess:
 *
 *  - tag / class / role / href  -> is it <span>, <a>, <button>, [role=button]?
 *    (the [data-iw-boss="card"] flatten rule exempts a / button / [role=button]
 *     because the Prejoined control's fill is live state - rule 5.)
 *  - the WINNING computed background-color + border-bottom + border-radius
 *  - whether it is a direct child of the card (the current rule is `> *` only)
 *    or a nested descendant (current rule never reaches it).
 *
 * Always check getBoundingClientRect: the page ships an xl:hidden mirror.
 */
(() => {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const box = el => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`; };
  const RX = /^(world boss participation|last battle participants|world boss|participation)/i;

  const cards = [...document.querySelectorAll('[data-iw-boss="card"]')]
    .filter(c => c.getBoundingClientRect().width > 1);

  // Zone Control card is a sibling compact-panel that is NOT tagged data-iw-boss;
  // include any visible compact-panel whose text mentions "controls zone".
  const zone = [...document.querySelectorAll('.compact-panel')]
    .filter(c => c.getBoundingClientRect().width > 1 && /controls zone/i.test(norm(c.textContent)));

  const roots = [...new Set([...cards, ...zone])];
  const out = [];

  for (const root of roots) {
    for (const el of root.querySelectorAll('*')) {
      const t = norm(el.textContent);
      if (!RX.test(t)) continue;
      if ([...el.children].some(c => RX.test(norm(c.textContent)))) continue; // leaf-most
      const cs = getComputedStyle(el);
      out.push({
        text: JSON.stringify(t.slice(0, 60)),
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 160),
        role: el.getAttribute('role') || null,
        href: el.getAttribute('href') || null,
        hasTitle: el.hasAttribute('title'),
        tabindex: el.getAttribute('tabindex'),
        cursor: cs.cursor,
        directChildOfCard: el.parentElement === root,
        depthFromCard: (() => { let d = 0; for (let c = el; c && c !== root; c = c.parentElement) d += 1; return d; })(),
        bgColor: cs.backgroundColor,
        bgImage: cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 90),
        borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomStyle + ' ' + cs.borderBottomColor,
        borderRadius: cs.borderRadius,
        padding: cs.padding,
        rootIsBossCard: root.dataset.iwBoss === 'card',
        rect: box(el),
      });
    }
  }

  const report = { href: location.href, bossCards: cards.length, zoneCards: zone.length, tags: out };
  console.log(JSON.stringify(report, null, 2));
  try { copy(JSON.stringify(report, null, 2)); console.log('^ copied to clipboard'); } catch {}
})();
