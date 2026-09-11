/* ============================================================================
   IdleWorlds Fantasy Skin — rearrange/drag probe

   "I click and drag a panel and nothing happens" has about nine possible
   causes and they are indistinguishable from the outside. This walks every
   precondition in the order the code needs them and stops at the FIRST one
   that fails, so the answer is a named step rather than a guess.

   It ends with a real synthetic drag on a real handle and reports whether the
   module reacted.

   MUTATION NOTICE. This is not read-only. It enters rearrange mode if it is
   not already on, and it performs one drag gesture which it CANCELS with
   Escape rather than committing, so no arrangement is saved. It restores the
   mode to however it found it. Nothing is written to storage.

   F12 -> Console, paste, Enter, on the main game page.
   ========================================================================= */

(() => {
  const out = { steps: [], verdict: null };
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
  const desc = el => !el ? null : el.tagName.toLowerCase()
    + (el.id ? '#' + el.id : '')
    + (el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0, 6).join('.') : '');
  const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };

  /* Record a step and, the first time one fails, freeze that as the verdict. */
  const step = (name, ok, detail) => {
    out.steps.push({ name, ok: !!ok, detail });
    if (!ok && !out.verdict) out.verdict = name;
    console.log((ok ? '  ok   ' : '  FAIL ') + name, detail === undefined ? '' : detail);
    return !!ok;
  };

  /* ---- 1. is the skin even running ------------------------------------ */

  const sheets = [...document.querySelectorAll('style[data-iw-style]')].map(s => s.dataset.iwStyle);
  step('the skin injected its stylesheets', sheets.length > 0, sheets.join(','));
  step('the panel-order rules are in the ui-system sheet',
    (document.querySelector('style[data-iw-style="ui-system"]')?.textContent || '').includes('data-iw-order-container'));

  /* ---- 2. did the module claim any containers -------------------------- */

  const leaves = [...document.querySelectorAll('.panel')].filter(p => !p.querySelector('.panel'));
  const containers = [...document.querySelectorAll('[data-iw-order-container="1"]')];
  const slotted = [...document.querySelectorAll('[data-iw-order]')];
  step('leaf .panel elements exist', leaves.length > 0, leaves.length + ' leaves');
  step('the module claimed at least one container', containers.length > 0,
    containers.map(desc).join(' | '));
  step('panels were given arrangement slots', slotted.length >= 2, slotted.length + ' slotted');

  /* Why a panel was or was not claimed — the same three tests the module runs,
     re-derived here so a mismatch is visible rather than assumed. */
  out.panels = leaves.map(panel => {
    const parent = panel.parentElement;
    const display = parent ? getComputedStyle(parent).display : null;
    const headingEl = panel.querySelector('h1, h2, h3, h4, [role="heading"]');
    const heading = norm(headingEl?.textContent).replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
    const key = panel.id ? 'id:' + panel.id
      : heading ? 'title:' + heading
        : panel.dataset.iwPanel ? 'panel:' + panel.dataset.iwPanel
          : (panel.querySelector('[data-iw-panel]') ? 'panel:' + panel.querySelector('[data-iw-panel]').dataset.iwPanel : null);
    return {
      el: desc(panel),
      rendered: panel.getBoundingClientRect().width > 0,
      key,
      parent: desc(parent),
      parentDisplay: display,
      parentHonoursOrder: /^(flex|inline-flex|grid|inline-grid)$/.test(display || ''),
      slot: panel.getAttribute('data-iw-order'),
      fixed: panel.getAttribute('data-iw-order-fixed') === '1',
      hasHandle: !!panel.querySelector(':scope > [data-iw-order-handle]'),
    };
  });
  const visible = out.panels.filter(p => p.rendered);
  step('the RENDERED panels sit in flex/grid containers',
    visible.length > 0 && visible.every(p => p.parentHonoursOrder),
    visible.filter(p => !p.parentHonoursOrder).map(p => p.el + ' -> ' + p.parentDisplay).join(' | ') || 'all ok');
  step('every rendered panel resolved an identity key',
    visible.every(p => p.key), visible.filter(p => !p.key).map(p => p.el).join(' | ') || 'all keyed');

  /* ---- 3. the mode control -------------------------------------------- */

  const toggle = document.querySelector('[data-iw-nav-link="rearrange"]');
  step('the Rearrange control exists in the nav', !!toggle, desc(toggle));
  if (toggle) {
    const cs = getComputedStyle(toggle);
    step('the Rearrange control is actually visible and clickable',
      toggle.getBoundingClientRect().width > 0 && cs.display !== 'none' && cs.pointerEvents !== 'none',
      JSON.stringify({ ...box(toggle), display: cs.display, pointerEvents: cs.pointerEvents }));
  }

  const wasOn = document.documentElement.dataset.iwOrderMode === '1';
  out.modeWasOn = wasOn;
  if (!wasOn && toggle) toggle.click();
  const modeOn = document.documentElement.dataset.iwOrderMode === '1';
  step('clicking Rearrange sets the mode flag on <html>', modeOn,
    'data-iw-order-mode=' + (document.documentElement.dataset.iwOrderMode ?? '(absent)'));

  /* ---- 4. the grab surfaces ------------------------------------------- */

  const handles = [...document.querySelectorAll('[data-iw-order-handle]')];
  step('grab surfaces were created', handles.length > 0, handles.length + ' handles');

  const live = handles.filter(h => h.getBoundingClientRect().width > 0);
  step('at least one grab surface is rendered', live.length > 0, live.length + ' rendered');

  const target = live.find(h => {
    const r = h.getBoundingClientRect();
    return r.top < innerHeight - 40 && r.bottom > 60;
  }) || live[0];

  if (target) {
    const cs = getComputedStyle(target);
    const r = target.getBoundingClientRect();
    const panel = target.parentElement;
    out.handle = {
      el: desc(target),
      panel: desc(panel),
      rect: box(target),
      panelRect: box(panel),
      position: cs.position,
      display: cs.display,
      zIndex: cs.zIndex,
      pointerEvents: cs.pointerEvents,
      touchAction: cs.touchAction,
      visibility: cs.visibility,
      opacity: cs.opacity,
      panelPosition: getComputedStyle(panel).position,
    };
    step('the grab surface got its panel-order CSS (absolute, z-index 5)',
      cs.position === 'absolute' && cs.zIndex === '5',
      JSON.stringify({ position: cs.position, zIndex: cs.zIndex, display: cs.display }));
    step('the grab surface covers its panel',
      Math.abs(r.width - panel.getBoundingClientRect().width) < 8,
      JSON.stringify({ handle: box(target), panel: box(panel) }));
    step('the grab surface accepts pointer events', cs.pointerEvents !== 'none', cs.pointerEvents);

    /* The decisive check: is the handle really the topmost thing at its own
       centre, or is something painted over it eating every press? */
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + Math.min(r.height / 2, 60));
    const top = document.elementFromPoint(cx, cy);
    out.hitTest = { at: { x: cx, y: cy }, got: desc(top), isHandle: top === target, insideHandle: !!target.contains(top) };
    step('a press at the grab surface would actually land on it',
      top === target || target.contains(top), desc(top));

    /* ---- 5. drive a real gesture ------------------------------------- */

    const send = (type, x, y, extra) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      clientX: x, clientY: y, ...extra,
    }));

    const before = panel.getAttribute('data-iw-order');
    let threw = null;
    try {
      send('pointerdown', cx, cy);
      send('pointermove', cx, cy - 20);
      send('pointermove', cx, cy - 140);
    } catch (err) { threw = String(err); }
    out.drag = {
      threw,
      markedSource: panel.getAttribute('data-iw-order-drag'),
      markedContainer: panel.parentElement?.getAttribute('data-iw-order-dragging'),
      slotBefore: before,
      slotDuring: panel.getAttribute('data-iw-order'),
    };
    step('a synthetic drag put the module into its dragging state',
      panel.getAttribute('data-iw-order-drag') === 'source', JSON.stringify(out.drag));

    /* Cancel rather than commit, so nothing is saved. */
    try {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      send('pointerup', cx, cy - 140);
    } catch { /* the drag may already be over */ }
    out.drag.slotAfterCancel = panel.getAttribute('data-iw-order');
    step('the cancel restored the slot the drag started from',
      panel.getAttribute('data-iw-order') === before,
      before + ' -> ' + panel.getAttribute('data-iw-order'));
  }

  /* ---- restore ---------------------------------------------------------- */

  if (!wasOn && toggle && document.documentElement.dataset.iwOrderMode === '1') toggle.click();
  out.modeRestored = (document.documentElement.dataset.iwOrderMode === '1') === wasOn;

  out.verdict = out.verdict || 'every precondition passed — the gesture works when driven synthetically';
  console.log('\n[iw] VERDICT:', out.verdict);
  console.log(out);
  window.__iwRearrange = out;

  const json = JSON.stringify(out, null, 2);
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'iw-rearrange.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    console.log('[iw] downloaded iw-rearrange.json');
  } catch (e) { console.warn('[iw] download blocked:', e.message); }
  try { copy(json); console.log('[iw] copied to clipboard'); } catch {}
})();
