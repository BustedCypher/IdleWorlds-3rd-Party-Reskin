/* ============================================================================
   IdleWorlds Fantasy Skin — Skill Actions pager diagnostic

   READ-ONLY. Answers the one question that decides whether skills can be
   re-dealt across the I / II pager pages in CSS alone:

     when page I is showing, are page II's panels still IN THE DOM (hidden),
     or does React never mount them at all?

   Plus the structure a CSS reorder would need: the panels' shared parent, its
   computed display (`order` only applies inside flex/grid), whether each panel
   is a DIRECT child of it or sits in a per-panel wrapper, and — if the inactive
   page IS present — exactly which ancestor hides it.

   RUN TWICE: idleworlds.com, extension enabled, Skill Actions on screen.
   F12 -> Console, paste, Enter with page I active; then click II and paste
   again. Attach BOTH downloaded files (iw-pager-capture-1.json / -2.json —
   it names the file from the active page, so nothing to rename).
   ========================================================================= */

(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const short = (v, n = 120) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 240);
  const rectOf = el => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };

  // WHY a panel is not painting decides the technique, so record the whole
  // chain: `display:none` on an ancestor cannot be undone from a descendant
  // rule, whereas a zero-height or aria-hidden wrapper can.
  const hiddenBy = el => {
    const out = [];
    for (let cur = el; cur && cur !== document.body; cur = cur.parentElement) {
      const cs = getComputedStyle(cur);
      const why = [];
      if (cs.display === 'none') why.push('display:none');
      if (cs.visibility === 'hidden') why.push('visibility:hidden');
      if (cs.opacity === '0') why.push('opacity:0');
      if (cur.hasAttribute('hidden')) why.push('[hidden]');
      if (cur.getAttribute('aria-hidden') === 'true') why.push('aria-hidden');
      if (cs.height === '0px' || cs.maxHeight === '0px') why.push('zero-height');
      if (why.length) out.push({ tag: cur.tagName.toLowerCase(), classes: cls(cur), why, isSelf: cur === el });
    }
    return out;
  };

  const path = (el, stop = 10) => {
    const out = [];
    let cur = el;
    for (let i = 0; cur && i < stop; i += 1, cur = cur.parentElement) {
      const c = String(cur.className?.baseVal ?? cur.className ?? '');
      out.push(
        cur.tagName.toLowerCase() + (cur.id ? `#${cur.id}` : '') +
        (c ? '.' + c.trim().split(/\s+/).slice(0, 6).join('.') : '') +
        ` {${rectOf(cur).w}x${rectOf(cur).h} ${getComputedStyle(cur).display}}`,
      );
    }
    return out;
  };

  const commonAncestor = list => {
    if (!list.length) return null;
    let cur = list[0];
    while (cur && cur !== document.documentElement) {
      if (list.every(el => cur === el || cur.contains(el))) return cur;
      cur = cur.parentElement;
    }
    return null;
  };

  // Every skill panel in the document, hidden xl:hidden mirrors included. The
  // skin only tags MOUNTED panels, so a skill missing from this list entirely
  // is the "React never mounted it" answer.
  const isSkillPanel = el => el.matches('.fs-skill-panel, [data-iw-skill]') ||
    (/\blv\b/i.test(norm(el.textContent)) && !!el.querySelector('button'));

  const panelEls = [...document.querySelectorAll('.compact-panel')].filter(isSkillPanel);
  const panels = panelEls.map(el => ({
    skill: el.dataset.iwSkill || null,
    classes: cls(el),
    label: short(norm(el.textContent), 90),
    visible: visible(el),
    rect: rectOf(el),
    inXlHidden: !!el.closest('[class~="xl:hidden"]'),
    hiddenBy: hiddenBy(el),
    parentTag: el.parentElement?.tagName.toLowerCase() || null,
    parentClasses: el.parentElement ? cls(el.parentElement) : null,
    ancestry: path(el, 8),
  }));

  const liveEls = panelEls.filter(el => visible(el) && !el.closest('[class~="xl:hidden"]'));
  const live = panels.filter(p => p.visible && !p.inXlHidden);

  // The container a CSS reorder would act on, and whether `order` even applies.
  const parent = commonAncestor(liveEls);
  const container = parent ? (() => {
    const cs = getComputedStyle(parent);
    return {
      tag: parent.tagName.toLowerCase(),
      classes: cls(parent),
      display: cs.display,
      flexDirection: cs.flexDirection,
      gridTemplateColumns: cs.gridTemplateColumns,
      gap: cs.gap,
      orderApplies: /flex|grid/.test(cs.display),
      childElementCount: parent.childElementCount,
      // If panels are wrapped one level down, `order` must be written against
      // the wrapper, not the panel — and the wrapper carries no skill identity.
      panelsAreDirectChildren: liveEls.every(el => el.parentElement === parent),
      children: [...parent.children].slice(0, 20).map(c => ({
        tag: c.tagName.toLowerCase(),
        classes: cls(c),
        display: getComputedStyle(c).display,
        skill: c.dataset?.iwSkill || c.querySelector?.('[data-iw-skill]')?.dataset.iwSkill || null,
        rect: rectOf(c),
        text: short(norm(c.textContent), 60),
      })),
      ancestry: path(parent, 6),
    };
  })() : null;

  // The pager: short-label controls inside the Skill Actions frame, excluding
  // the per-panel recipe arrows.
  const frame = liveEls[0]?.closest('[data-iw-ui="section-frame"], .fs-skills-section-frame') ||
    [...document.querySelectorAll('div,section')].find(el => /^skill actions/i.test(norm(el.textContent))) ||
    null;
  const pager = frame ? [...frame.querySelectorAll('button')]
    .filter(b => norm(b.textContent).length <= 3 && !b.closest('.compact-panel'))
    .map(b => ({
      label: norm(b.textContent),
      classes: cls(b),
      ariaSelected: b.getAttribute('aria-selected'),
      ariaCurrent: b.getAttribute('aria-current'),
      disabled: b.disabled,
      rect: rectOf(b),
      looksActive: /(?:bg|text|border)-(?:orange|amber|primary|accent)/i.test(cls(b)) ||
        b.getAttribute('aria-selected') === 'true',
      ancestry: path(b, 5),
    })) : [];

  const activePage = pager.find(p => p.looksActive)?.label || (live.length > 3 ? 'I?' : 'II?');

  const capture = {
    meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight }, activePage },
    // THE ANSWER. A non-empty mountedButHiddenSkills on page I means the other
    // page IS in the DOM and a pure-CSS re-deal is viable; an empty one means
    // React mounts only the active page and it is not.
    verdict: {
      activePage,
      visibleSkills: live.map(p => p.skill || p.label.slice(0, 24)),
      mountedButHiddenSkills: panels
        .filter(p => !p.visible && !p.inXlHidden)
        .map(p => ({ skill: p.skill || p.label.slice(0, 24), hiddenBy: p.hiddenBy })),
      xlHiddenMirrorCount: panels.filter(p => p.inXlHidden).length,
      totalCompactPanelsInDom: document.querySelectorAll('.compact-panel').length,
    },
    pager,
    container,
    panels,
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwPagerCapture = capture;
  const file = `iw-pager-capture-${/II/.test(activePage) ? '2' : '1'}.json`;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log(`[iw] Downloaded ${file}`);
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  console.log('[iw] active page:', activePage,
    '| visible:', capture.verdict.visibleSkills,
    '| mounted-but-hidden:', capture.verdict.mountedButHiddenSkills.map(x => x.skill));
  console.log(capture);
})();
