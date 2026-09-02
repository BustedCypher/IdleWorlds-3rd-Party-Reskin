/* Action Log classifier probe — paste in console after reloading the extension.
   READ-ONLY. Replays the classifier's label + host detection for 'action-log'
   and reports where it stops. Prints AND downloads iw-probe.json. */
(() => {
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const ACT = new Map([['current action','current-action'],['action log','action-log'],['world chat','world-chat']]);

  // 1. Which panels are currently framed / paneled?
  const framed = [...document.querySelectorAll('[data-iw-ui="section-frame"]')]
    .map(el => (el.querySelector('[data-iw-ui="section-title"]')?.textContent || el.dataset.iwPanel || el.className).trim().slice(0, 40));
  const paneled = [...document.querySelectorAll('[data-iw-panel]')].map(el => el.dataset.iwPanel);

  // 2. Replay activityPanelLabelNodes()
  const seen = new Set(), out = [];
  const push = (el, panel, why) => {
    const rec = { why, tag: el.tagName.toLowerCase(), text: norm(el.textContent).slice(0, 30), panel,
      inXlHidden: !!el.closest('[class~="xl:hidden"]'), added: false };
    if (!el || !panel || seen.has(el)) { rec.skip = 'dupe/none'; out.push(rec); return; }
    if (el.closest('[class~="xl:hidden"]')) { rec.skip = 'xl:hidden'; out.push(rec); return; }
    seen.add(el); rec.added = true; out.push(rec);
  };
  for (const el of document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')) push(el, ACT.get(norm(el.textContent).toLowerCase()), 'pass1-heading');
  for (const el of document.querySelectorAll('p,span,div,strong,b')) if (el.childElementCount === 0) push(el, ACT.get(norm(el.textContent).toLowerCase()), 'pass2-leaf');
  const have = new Set(out.filter(r => r.added).map(r => r.panel));
  const pass3ran = have.size < ACT.size;
  if (pass3ran) {
    for (const el of document.querySelectorAll('div,header,section,h2,h3,h4,span,p,button,a')) {
      if (seen.has(el)) continue;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3) continue;
        const panel = ACT.get(norm(n.textContent).toLowerCase());
        if (panel && !have.has(panel)) { push(el, panel, 'pass3-textnode'); break; }
      }
    }
  }

  // 3. For the action-log label (if found), replay findActivityPanelHost
  const alRec = out.find(r => r.added && r.panel === 'action-log');
  let hostTrace = null;
  if (alRec) {
    const btn = [...document.querySelectorAll('button,a,h1,h2,h3,h4,[role="heading"],p,span,div')]
      .find(el => !el.closest('[class~="xl:hidden"]') && [...el.childNodes].some(n => n.nodeType === 3 && norm(n.textContent).toLowerCase() === 'action log') && norm(el.textContent).toLowerCase().startsWith('action log'));
    hostTrace = [];
    let cur = btn?.parentElement;
    for (let d = 0; cur && cur !== document.body && d < 6; d++, cur = cur.parentElement) {
      const hasControl = [...cur.querySelectorAll('button,a')].some(el => /^view\s+all$/i.test(norm(el.textContent)));
      const hasRate = /\b[\d,.]+\s*xp\s*\/\s*hr\b/i.test(norm(cur.textContent));
      const kids = [...cur.children];
      const headingBranch = (() => { let c = btn; while (c?.parentElement && c.parentElement !== cur) c = c.parentElement; return c?.parentElement === cur ? c : null; })();
      const bodyOutside = !!headingBranch && kids.some(ch => ch !== headingBranch && !ch.matches('button,a,[role="button"]') && !/^\s*[\d,.]+\s*xp\s*\/\s*hr\s*$/i.test(norm(ch.textContent)));
      const match = (hasControl || hasRate) && bodyOutside;
      hostTrace.push({ depth: d, el: cur.tagName.toLowerCase() + '.' + String(cur.className).split(/\s+/).slice(0, 3).join('.'),
        rectH: +cur.getBoundingClientRect().height.toFixed(0), hasControl, hasRate, headingBranch: !!headingBranch, bodyOutside, MATCH: match,
        iwUi: cur.dataset.iwUi || null, iwPanel: cur.dataset.iwPanel || null });
      if (match) break;
    }
  }

  const capture = { framed, paneled, labelReplay: out, have: [...have], pass3ran, actionLogLabelFound: !!alRec, hostTrace };
  const json = JSON.stringify(capture, null, 2);
  window.__iwProbe = capture;
  console.log(capture);
  try { const b = new Blob([json], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'iw-probe.json'; document.body.appendChild(a); a.click(); a.remove(); } catch {}
  try { copy(json); } catch {}
})();
