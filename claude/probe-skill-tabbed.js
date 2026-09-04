/* ============================================================================
   IdleWorlds Fantasy Skin — "why doesn't this skill card look forged" probe

   READ-ONLY. A user screenshot showed a Smithing card rendering with no
   medallion column and blank (chevron-less) pager boxes, next to Mine/
   Gathering cards that ARE fully forged with a visible chevron. The forge
   plate + chevron mechanism only exists inside CSS scoped to
   `[data-iw-skill-layout="three-zone"]`, which SkillPanelRenderer sets only
   when it finds three DISTINCT identity/content/commands zones under one
   shell. This dumps, for every live skill panel, whether that classification
   landed, and if not, why (missing zone? an extra visible flow child that
   tripped the fallback?).

   RUN ONCE: idleworlds.com, extension enabled, Skill Actions panel on screen
   with the Smithing card (or whichever card looked wrong) visible. F12 ->
   Console, paste, Enter. Attach the downloaded iw-skill-tabbed-probe.json.
   ========================================================================= */

(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const short = (v, n = 160) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 200);
  const rectOf = el => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1) }; };
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };

  const isSkillPanel = el => el.matches('.fs-skill-panel, [data-iw-skill]') ||
    (/\blv\b/i.test(norm(el.textContent)) && !!el.querySelector('button'));

  const panelEls = [...document.querySelectorAll('.compact-panel')]
    .filter(isSkillPanel)
    .filter(el => visible(el) && !el.closest('[class~="xl:hidden"]'));

  const describeButton = btn => {
    if (!btn) return null;
    const cs = getComputedStyle(btn);
    const before = getComputedStyle(btn, '::before');
    return {
      role: btn.getAttribute('data-iw-skill-role'),
      navDirection: btn.getAttribute('data-iw-nav-direction'),
      btnState: btn.getAttribute('data-iw-btn-state'),
      rect: rectOf(btn),
      display: cs.display,
      background: short(cs.backgroundImage, 40) === 'none' ? cs.backgroundColor : short(cs.backgroundImage, 60),
      border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      inlineStyle: short(btn.getAttribute('style') || '', 300),
      before: { content: before.content, width: before.width, height: before.height, borderRightWidth: before.borderRightWidth },
      text: short(norm(btn.textContent), 20),
    };
  };

  const panels = panelEls.map(panel => {
    const layout = panel.getAttribute('data-iw-skill-layout');
    const shell = panel.querySelector('[data-iw-skill-layout-shell]') || panel;
    const zones = {
      identity: panel.querySelector('[data-iw-skill-zone="identity"]'),
      content: panel.querySelector('[data-iw-skill-zone="content"]'),
      commands: panel.querySelector('[data-iw-skill-zone="commands"]'),
    };
    const roleEls = [...panel.querySelectorAll('[data-iw-skill-role]')].map(el => ({
      role: el.getAttribute('data-iw-skill-role'),
      tag: el.tagName.toLowerCase(),
      classes: cls(el),
      text: short(norm(el.textContent), 50),
      rect: rectOf(el),
      visible: visible(el),
    }));
    const navButtons = [...panel.querySelectorAll('[data-iw-skill-role="nav-button"]')].map(describeButton);
    const actionButtons = [...panel.querySelectorAll('[data-iw-skill-role="action-button"]')].map(describeButton);
    const navGroup = panel.querySelector('[data-iw-skill-role="nav-group"]');
    return {
      skill: panel.dataset.iwSkill || null,
      skillLayout: layout,
      skillsUiReady: panel.getAttribute('data-iw-skills-ui-ready'),
      panelClasses: cls(panel),
      panelRect: rectOf(panel),
      shellIsPanel: shell === panel,
      shellClasses: shell !== panel ? cls(shell) : null,
      shellChildCount: shell.children.length,
      shellChildren: [...shell.children].map(c => ({
        tag: c.tagName.toLowerCase(),
        classes: cls(c),
        zoneAttr: c.getAttribute('data-iw-skill-zone'),
        display: getComputedStyle(c).display,
        position: getComputedStyle(c).position,
        rect: rectOf(c),
        visible: visible(c),
        text: short(norm(c.textContent), 40),
      })),
      zonesFound: {
        identity: !!zones.identity,
        content: !!zones.content,
        commands: !!zones.commands,
      },
      navGroupZone: navGroup?.closest('[data-iw-skill-zone]')?.getAttribute('data-iw-skill-zone') || null,
      roleEls,
      navButtons,
      actionButtons,
      label: short(norm(panel.textContent), 100),
    };
  });

  const capture = {
    meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight } },
    panels,
  };

  const json = JSON.stringify(capture, null, 2);
  window.__iwSkillTabbedProbe = capture;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'iw-skill-tabbed-probe.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-skill-tabbed-probe.json');
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  console.log('[iw] skill layouts:', panels.map(p => ({ skill: p.skill || p.label.slice(0, 20), layout: p.skillLayout, zonesFound: p.zonesFound })));
  console.log(capture);
})();
