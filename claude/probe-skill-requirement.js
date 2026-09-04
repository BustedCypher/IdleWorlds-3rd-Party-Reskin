/* ============================================================================
   IdleWorlds Fantasy Skin — skill "Requires …" line state probe

   READ-ONLY. Does not modify the page or send anything anywhere.

   QUESTION: when the player MEETS a skill action's requirement, how does the
   game render the "Requires X Lv Y" / "Needs level N" line differently from
   when they DON'T meet it? The skin currently forces that line red for every
   skill panel; we want it grey once the requirement is met, and need to see
   what native signal distinguishes the two states (a text-red/-rose class, an
   inline colour, a disabled action button, …).

   HOW TO RUN
     1. idleworlds.com, extension enabled, Skill Actions panel(s) visible.
        Ideally have BOTH kinds on screen at once — one skill whose action you
        CAN do, and one you can't yet (or page to a locked recipe). If you
        can't get both at once, run it twice and attach both files.
     2. F12 → Console, paste this whole file, Enter.
     3. Attach the downloaded iw-skillreq-probe.json.
   ========================================================================= */

(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const short = (v, n = 160) => { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + `…(${s.length})` : s; };
  const cls = el => short(el.className?.baseVal ?? el.className ?? '', 240);

  const colourChain = (el) => {
    const out = [];
    for (let cur = el, i = 0; cur && cur !== document.body && i < 8; cur = cur.parentElement, i++) {
      const cs = getComputedStyle(cur);
      out.push({
        tag: cur.tagName.toLowerCase(),
        cls: cls(cur),
        color: cs.color,
        inlineColor: cur.style?.color || null,
        ownText: short(norm([...cur.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' ')), 80) || null,
      });
    }
    return out;
  };

  const panels = [...document.querySelectorAll('.compact-panel.fs-skill-panel, .compact-panel')]
    .filter(p => p.querySelector('[data-iw-skill-role], [data-iw-skill-layout]') ||
                 /requires|needs\s+(?:level|lv)/i.test(p.textContent || ''));

  const report = panels.map((panel, idx) => {
    const roleReq = panel.querySelector('[data-iw-skill-role="requirement"]');
    // Also find the raw native line by text, in case role tagging missed it.
    const nativeReq = [...panel.querySelectorAll('p, span, div')]
      .filter(el => el.childElementCount === 0 && /^(?:needs|requires)\b/i.test(norm(el.textContent)))
      .slice(0, 3);
    const actionBtn = panel.querySelector('[data-iw-skill-role="action-button"]');
    const allButtons = [...panel.querySelectorAll('button')].map(b => ({
      text: short(norm(b.textContent), 40),
      disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
      cls: cls(b),
      role: b.getAttribute('data-iw-skill-role'),
    }));
    const levelReadout = panel.querySelector('[data-iw-skill-role="level-progress"], [data-iw-skill-role="identity"]');

    return {
      idx,
      skill: panel.getAttribute('data-fs-skill') || panel.getAttribute('data-iw-skill-role') || null,
      panelText: short(norm(panel.textContent), 240),
      requirementRoleEl: roleReq ? { cls: cls(roleReq), text: short(norm(roleReq.textContent), 90), computedColor: getComputedStyle(roleReq).color, chain: colourChain(roleReq) } : null,
      nativeRequirementEls: nativeReq.map(el => ({
        cls: cls(el),
        text: short(norm(el.textContent), 90),
        computedColor: getComputedStyle(el).color,
        chain: colourChain(el),
      })),
      actionButton: actionBtn ? { text: short(norm(actionBtn.textContent), 40), disabled: actionBtn.disabled || actionBtn.getAttribute('aria-disabled') === 'true', cls: cls(actionBtn) } : null,
      buttons: allButtons,
      levelReadout: levelReadout ? short(norm(levelReadout.textContent), 120) : null,
    };
  });

  const capture = {
    meta: { url: location.href, viewport: { w: innerWidth, h: innerHeight }, panelCount: report.length },
    panels: report,
  };
  const json = JSON.stringify(capture, null, 2);
  window.__iwSkillReqProbe = capture;
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'iw-skillreq-probe.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log('[iw] Downloaded iw-skillreq-probe.json');
  } catch (e) { console.warn('[iw] download blocked — window.__iwSkillReqProbe', e.message); }
  try { copy(json); console.log('[iw] copied to clipboard'); } catch {}
  console.log(capture);
})();
