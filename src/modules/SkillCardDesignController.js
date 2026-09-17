import { on } from './DOMWatcher.js';
import { guard, isRuntimeActive, raf } from './Runtime.js';
import { sampleProgress, formatDuration } from './ProgressCadence.js';
import { getLayoutEpoch, pickRendered } from './Viewport.js';

/* The V2 skill card is the ONLY skill card design (Curtis, 2026-09). The
   old/new toggle at the top of Skill Actions is gone, and so is the stored
   preference it wrote. `html[data-iw-skill-card-design="new"]` is still set,
   because every V2 rule keys on it for specificity - see CLAUDE.md, "the whole
   sheet was one class short" - and removing it would mean re-deriving the
   cascade of ~300 selectors for no visual change. */
const DESIGN_ATTR = 'data-iw-skill-card-design';
/* The frame shows these sections, in this order, with no tabs: materials are
   the default state of a crafting card and sources of a gathering one.
   Requirements are shown on the foot row only when unmet; Queue and Rewards
   are still MARKED (that is what keeps the game's own lines clipped) but are
   never shown - Rewards repeats the BASE chip. */
const FRAME_SECTIONS = ['materials', 'sources', 'details'];
let bound = false, active = false;

function setData(el, key, value) {
  if (!el) return;
  const next = String(value);
  if (el.dataset[key] !== next) el.dataset[key] = next;
}
function setText(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}
function markSections(panel) {
  const desired = new Map();
  for (const [name, selector] of [
    ['requirements','[data-iw-skill-role="requirement"]'],
    ['materials','[data-iw-skill-ingredient-list],.fs-skill-ingredient-grid'],
    ['details','[data-iw-skill-role="action-detail"]'],
    ['rewards','[data-iw-skill-role="reward"]'],
  ]) panel.querySelectorAll(selector).forEach(el => desired.set(el, name));
  // Queue/source copy is sometimes an unclassified native paragraph. Read only
  // the game's direct text rows, never controls or our own mirrored detail body.
  const content = panel.querySelector('[data-iw-skill-zone="content"]');
  content?.querySelectorAll('p,span').forEach(el => {
    if (el.closest('[class*="iw-skill-v2"],.fs-skill-ingredient-grid,button,a')) return;
    if (el.querySelector('p,span,button,a')) return;
    const text = (el.textContent || '').trim();
    if (/missing materials|will queue|queued|queue first/i.test(text)) desired.set(el, 'queue');
    else if (/^(?:gather|harvest|obtain|found|source).*\b(?:from|in|at)\b/i.test(text)
      && !el.matches('[data-iw-skill-role="action-title"]')) desired.set(el, 'sources');
  });
  desired.forEach((name, el) => {
    if (name === 'details' && /queue|missing materials/i.test(el.textContent || '')) desired.set(el, 'queue');
  });

  panel.querySelectorAll('[data-iw-skill-v2-section]').forEach(el => {
    const next = desired.get(el);
    if (!next) delete el.dataset.iwSkillV2Section;
    else if (el.dataset.iwSkillV2Section !== next) el.dataset.iwSkillV2Section = next;
    desired.delete(el);
  });
  desired.forEach((name, el) => { el.dataset.iwSkillV2Section = name; });
}
/* The hero readout is the ONLY level/percent the V2 card shows, so it has to
   resolve on every card shape the game ships — the live capture had cards
   where the skin's block was missing and the game's own "LV 57" and "77.2%"
   showed instead, at two different heights, which is what made the column look
   different from card to card. Read the roled nodes first, then fall back to
   the identity branch's own copy, then to the progress custom property. */
function levelReadout(panel) {
  const zone = panel.querySelector('[data-iw-skill-zone="identity"]'); if (!zone) return;
  const text = panel.querySelector('[data-iw-skill-role="level-progress"]')?.textContent || '';
  const zoneText = zone.textContent || '';
  const pct = (panel.querySelector('.fs-skill-identity-percent')?.textContent || '').match(/(\d+(?:\.\d+)?)\s*%/)
    || text.match(/(\d+(?:\.\d+)?)\s*%/)
    || zoneText.match(/(\d+(?:\.\d+)?)\s*%/);
  const lvl = text.match(/\bLv\s*([\d]+(?:\s*\+\s*\d+)?|-)/i)
    || zoneText.match(/\bLv\s*([\d]+(?:\s*\+\s*\d+)?|-)/i);
  const value = pct ? Math.max(0, Math.min(100, Number(pct[1]))) : 0;
  const progress = `${Number.isFinite(value) ? value : 0}%`;
  if (panel.style.getPropertyValue('--iw-skill-v2-progress') !== progress) {
    panel.style.setProperty('--iw-skill-v2-progress', progress);
  }
  let out = zone.querySelector(':scope > [data-iw-skill-v2-level-readout]');
  if (!out) {
    out = document.createElement('span'); out.dataset.iwSkillV2LevelReadout = '1'; out.className = 'iw-skill-v2-level-readout';
    const a = document.createElement('span'); a.className = 'iw-skill-v2-level';
    const b = document.createElement('span'); b.className = 'iw-skill-v2-percent'; out.append(a,b); zone.append(out);
  }
  setText(out.children[0], lvl ? `Lv ${lvl[1].replace(/\s+/g,' ')}` : 'Lv —');
  setText(out.children[1], pct ? `${pct[1]}%` : '—');
}
/* Nodes from earlier designs, removed on sight so a card that has been through
   one of them does not keep a stray: the collapsed summary chip and its line
   break, the collapse chevron, the design toggle and the tab strip. */
function removeRetiredNodes(panel) {
  panel.querySelectorAll('[data-iw-skill-v2-summary], [data-iw-skill-v2-break], [data-iw-skill-v2-expand], [data-iw-skill-v2-tabs]')
    .forEach(el => el.remove());
}

/* The action button carries the discipline's own icon, from Curtis's artwork
   (build-tools/import-action-icons.mjs writes assets/skills-ui/action-icons/).
   The glyph is its OWN element rather than a pseudo-element on the button,
   because both of the button's pseudo-elements are already the atlas motion
   system's hover and pressed crossfade layers, and it is never put inside the
   control, so nothing the classifiers read inside a game button changes. The
   sheet picks the icon from the card's `data-iw-skill-v2-type`, so this writes
   no inline style - and a discipline the artwork does not cover (Crafting,
   Fishing) simply shows the button's label.

   It is appended to the BUTTON'S OWN PARENT, not to the command zone. Both are
   absolutely positioned from "50% of the containing block", and siblings
   always share one containing block, so the icon is placed against exactly the
   box the button is - whatever that box turns out to be. Appended to the zone
   it was placed against the ZONE while the button was placed against whatever
   the game wraps it in: reported live (Curtis, 2026-09) as every icon sitting
   ~12px high and poking over the button's top edge, and reproduced locally by
   wrapping the button in a node that establishes its own containing block
   (`claude/probe-skill-cards.mjs --wrap-command`), which put the icon 7px
   high against the label. */
function ensureActionGlyph(panel) {
  const zone = panel.querySelector('[data-iw-skill-zone="commands"]');
  /* The command ZONE can be the action button ITSELF: when the game ships the
     button as the shell's third child with no cell round it, the renderer tags
     the button as the zone (skillpanel.css guards eight rules with
     `[data-iw-skill-zone="commands"]:not(button)` for exactly this). Live,
     that is the shape. `querySelector` never matches the element it is called
     on, so a lookup inside the zone found no button, and every icon vanished -
     after the previous version had appended the icon INTO the button, placing
     it from the button's own box, ~5px above its top edge. Check the zone
     first. The icon then goes to the button's parent (the shell), still a
     sibling and still never inside the control. */
  const ACTION = '[data-iw-skill-role="action-button"]';
  const btn = zone?.matches(ACTION) ? zone : zone?.querySelector(ACTION);
  const host = btn?.parentElement;
  if (!host) return null;
  panel.querySelectorAll('[data-iw-skill-v2-action-glyph]').forEach(el => {
    if (el.parentElement !== host) el.remove();
  });
  const existing = host.querySelector(':scope > [data-iw-skill-v2-action-glyph]');
  if (existing) return existing;
  const glyph = document.createElement('span');
  glyph.dataset.iwSkillV2ActionGlyph = '1';
  glyph.className = 'iw-skill-v2-action-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  host.appendChild(glyph);
  return glyph;
}

/* The visible action label sits above the framed control as part of the same
   centred command stack. Keep the game's real text inside its native button
   for semantics and event ownership; this aria-hidden mirror is presentation
   only and follows any React text change without reparenting the control. */
function ensureActionLabel(panel) {
  const btn = actionButtonOf(panel);
  const host = btn?.parentElement;
  if (!host) return null;
  panel.querySelectorAll('[data-iw-skill-v2-action-label]').forEach(el => {
    if (el.parentElement !== host) el.remove();
  });
  let label = host.querySelector(':scope > [data-iw-skill-v2-action-label]');
  if (!label) {
    label = document.createElement('span');
    label.dataset.iwSkillV2ActionLabel = '1';
    label.className = 'iw-skill-v2-action-label';
    label.setAttribute('aria-hidden', 'true');
    host.appendChild(label);
  }
  setText(label, (btn.textContent || '').replace(/\s+/g, ' ').trim());
  return label;
}

/* The mirrored action label always fits on ONE line above the button frame
   (Curtis, 2026-09: "CRAFT PARTS" wrapped). The labels are the game's, so no
   stylesheet can size them - CSS has no idea how long a word is. The label is
   measured once per distinct text and layout with a Range over the visual
   mirror, and the size that fits is written as
   `--iw-skill-v2-action-label-font` on the card. Width is linear in font size
   (the tracking is in em), so one measurement at whatever size is current
   gives the exact answer.

   Cost: the key lives on `data-iw-*`, which DOMWatcher does not observe, and
   the inline write only happens when the size changes - a same-value
   setProperty emits no mutation record - so a settled card measures nothing
   and writes nothing. The key includes the layout, because a label measured
   before the V2 layout lands was measured in the legacy 155px button. A zero
   width is the hidden mirror column, not a measurement, and is retried. */
const LABEL_CEILING_PX = 9.5;
/* A technical guard only: the brief is one line ALWAYS, so the label shrinks as
   far as it must. Live verbs are short - "CRAFT PARTS" is the longest seen. */
const LABEL_FLOOR_PX = 4;
/* The horizontal extent of the visual mirror's text only. Using text ranges
   keeps this safe if the mirror later gains decorative children, and avoids
   reviving the old whole-button measurement bug caused by the activity fill. */
function labelTextBox(label) {
  const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let left = Infinity, right = -Infinity;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue.trim()) continue;
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect?.();
    if (!r || !(r.width > 0)) continue;
    left = Math.min(left, r.left); right = Math.max(right, r.right);
  }
  return right > left ? { width: right - left } : null;
}

/* The active skill's fill moves in steps: the game rewrites its
   `width: max(8, elapsed%)` from a 250ms `setInterval`, so the band jumped a
   quarter-second at a time. The sheet gives it a LINEAR width transition one
   tick long, which turns each step into continuous motion without the skin
   ever computing progress (rule 5) - the same fix, and the same shared cadence
   measurement, as the Current Action bar. Each width write mutates the span's
   `style`, which queues this card, so this runs once per tick.

   The measured duration is written inline on the CARD as
   `--iw-skill-v2-fill-duration`: a changed value queues one bounded re-entry,
   which reads the same width and writes nothing. The completion - the width
   dropping back to 8% as the next repetition starts - is tagged
   `data-iw-skill-v2-fill-reset` for one frame so the band snaps back instead
   of sliding backwards across the button. Samples are keyed by card, so a
   skill stopped and restarted on the same card keeps its measured tick. */
let fillSamples = new WeakMap();
const FILL = ':scope > span[style*="width"]';

function smoothActionFill(panel) {
  const btn = actionButtonOf(panel);
  const width = btn?.querySelector(FILL)?.style.width || '';
  if (!/^\d+(?:\.\d+)?%$/.test(width)) return;
  const { reset, durationMs } = sampleProgress(fillSamples, panel, parseFloat(width));
  if (reset) {
    panel.dataset.iwSkillV2FillReset = '1';
    raf(() => { delete panel.dataset.iwSkillV2FillReset; });
  }
  if (durationMs !== null) panel.style.setProperty('--iw-skill-v2-fill-duration', formatDuration(durationMs));
}

function actionButtonOf(panel) {
  const zone = panel.querySelector('[data-iw-skill-zone="commands"]');
  const ACTION = '[data-iw-skill-role="action-button"]';
  return zone?.matches(ACTION) ? zone : zone?.querySelector(ACTION);
}

/* The game's Current Action readout already owns the condition-adjusted
   duration. Mirror that value instead of starting a second clock: housing,
   boosts and any future modifiers therefore stay the game's decision. */
const LONG_ACTION_SECONDS = 11;
function durationSeconds(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const clock = /^(?:(\d+):)?(\d+):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const shortClock = /^(\d+):([0-5]\d)$/.exec(text);
  if (shortClock) return Number(shortClock[1]) * 60 + Number(shortClock[2]);
  const units = /^(?:(\d+)\s*h(?:ours?)?\s*)?(?:(\d+)\s*m(?:in(?:utes?)?)?\s*)?(?:(\d+)\s*s(?:ec(?:onds?)?)?)?$/.exec(text);
  if (!units || !units.slice(1).some(Boolean)) return null;
  return Number(units[1] || 0) * 3600 + Number(units[2] || 0) * 60 + Number(units[3] || 0);
}
function currentActionRemaining() {
  const host = pickRendered([...document.querySelectorAll(CURRENT_ACTION_HOSTS)]);
  if (!host) return null;
  for (const el of host.querySelectorAll('time,span,p,strong,div')) {
    if (el.childElementCount || el.closest('[data-iw-panel-part="progress"]')) continue;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const seconds = durationSeconds(text);
    if (seconds !== null) return { text, seconds };
  }
  return null;
}
function clearLongActionTimer(panel, glyph = panel.querySelector('[data-iw-skill-v2-action-glyph]')) {
  if (glyph?.hasAttribute('data-iw-skill-v2-action-timer')) {
    glyph.removeAttribute('data-iw-skill-v2-action-timer');
    setText(glyph, '');
  }
  delete panel.dataset.iwSkillV2LongAction;
}
function syncLongActionTimer(panel, glyph, remaining = currentActionRemaining) {
  const running = !!actionButtonOf(panel)?.querySelector(FILL);
  if (!running) return clearLongActionTimer(panel, glyph);
  if (typeof remaining === 'function') remaining = remaining();
  const startedLong = panel.dataset.iwSkillV2LongAction === '1';
  if (!startedLong && !(remaining?.seconds > LONG_ACTION_SECONDS)) return clearLongActionTimer(panel, glyph);
  if (!remaining || !glyph) return;
  setData(panel, 'iwSkillV2LongAction', '1');
  if (!glyph.hasAttribute('data-iw-skill-v2-action-timer')) glyph.setAttribute('data-iw-skill-v2-action-timer', '1');
  setText(glyph, remaining.text);
}
/* The countdown ticks in the Current Action panel, not in the card, so
   DOMWatcher's per-panel `iw:skill-panel` never fires for it: the card would
   only re-read the clock when its OWN fill width stepped, which on a long craft
   is every ~10s. A tick is a text mutation, so it reaches the flush events as a
   root inside (or around) the Current Action host; re-sync the running cards
   then. setText compares first, so the card's echo mutation settles at once.

   Cost: both flush events reach this on EVERY flush - chat rows, log rows,
   inventory ticks - and picking the rendered host is a `checkVisibility`, which
   forces a style recalc. So the pure containment test runs first, against every
   host candidate: only a flush that actually touches Current Action pays for
   the rendered pick, and the remaining time is then read once for every card
   rather than once per card. Measured on a 15k-node ticking page: ~30
   visibility reads a second before, ~1 after. */
const CURRENT_ACTION_HOSTS = '[data-iw-panel="current-action"], [id="current-action-panel"]';
function touchesHost(roots, host) {
  return roots.some(r => r === host || host.contains(r) || r?.contains?.(host));
}
function syncTimersOnTick(roots) {
  if (!Array.isArray(roots) || !roots.length) return;
  const candidates = [...document.querySelectorAll(CURRENT_ACTION_HOSTS)];
  if (!candidates.some(host => touchesHost(roots, host))) return;
  const host = pickRendered(candidates);
  if (!host || !touchesHost(roots, host)) return;
  let remaining;
  const readOnce = () => (remaining === undefined ? (remaining = currentActionRemaining()) : remaining);
  document.querySelectorAll('.compact-panel.fs-skill-panel[data-iw-skill-v2]').forEach(panel => {
    if (!panel.isConnected) return;
    if (panel.dataset.iwSkillV2LongAction !== '1' && !actionButtonOf(panel)?.querySelector(FILL)) return;
    syncLongActionTimer(panel, panel.querySelector('[data-iw-skill-v2-action-glyph]'), readOnce);
  });
}

function fitActionLabel(panel) {
  const zone = panel.querySelector('[data-iw-skill-zone="commands"]');
  const ACTION = '[data-iw-skill-role="action-button"]';
  const btn = zone?.matches(ACTION) ? zone : zone?.querySelector(ACTION);
  if (!btn) return;
  const visual = panel.querySelector('[data-iw-skill-v2-action-label]');
  const label = (btn.textContent || '').replace(/\s+/g, ' ').trim();
  /* The button's INLINE width is in the key too: on a card's first pass the
     renderer sizes the button before this module marks the card V2, so the
     label is first measured in the legacy 155px button and judged to fit -
     measured: "CRAFT PARTS" then stayed at 9.5px and ran 11px past a 64px
     button. Reading an inline style forces no layout, unlike clientWidth. */
  /* The layout epoch is in the key so a card in the hidden mirror column,
     which measures zero, is tried once and then again only when a breakpoint
     crossing makes it visible - never on every flush, because a Range rect
     forces layout. The key is written BEFORE measuring for the same reason:
     an attempt that cannot measure must not be retried each pass. That also
     covers jsdom, which has no Range geometry at all; retrying there, with a
     getComputedStyle per skill card per flush, dropped the smoke suite's
     burst render from 122 rows to 92. */
  const key = `${label}|${panel.dataset.iwSkillLayout || ''}|${btn.style.getPropertyValue('width')}|${getLayoutEpoch()}`;
  if (!label || panel.dataset.iwSkillV2LabelFit === key) return;
  panel.dataset.iwSkillV2LabelFit = key;
  const text = labelTextBox(visual || btn);
  if (!text || !(text.width > 0)) return;
  const cs = getComputedStyle(visual || btn);
  const room = (visual || btn).clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const current = parseFloat(cs.fontSize);
  if (!(room > 0) || !(current > 0)) return;
  /* The trailing letter-spacing after the last glyph is part of the range but
     not of the ink, so it is given back before comparing. */
  const tracking = parseFloat(cs.letterSpacing) || 0;
  const width = text.width - tracking;
  const fit = Math.floor(current * (room / width) * 10) / 10;
  const size = `${Math.max(LABEL_FLOOR_PX, Math.min(LABEL_CEILING_PX, fit))}px`;
  if (panel.style.getPropertyValue('--iw-skill-v2-action-label-font') !== size) panel.style.setProperty('--iw-skill-v2-action-label-font', size);
}

/* The info frame and the foot row are ROWS OF THE SHELL: the game's own grid
   wrapper, appended to (rule 2). The sheet places them in the centre column's
   rows, with the hero and command columns spanning all three, which is what
   puts the frame between the two dividers without reparenting anything.
   `SkillPanelRenderer.unexpectedFlowChild` ignores `[data-iw-skill-v2-row]`,
   or an in-flow child of the shell makes the card refuse the layout. */
function controlsHost(panel) {
  return panel.querySelector('[data-iw-skill-layout-shell="1"]') || panel;
}
/* "📦 Bloodstone Building Parts 298/2600" -> name, "298/2600". The count is
   the same N/M shape SkillPanelRenderer's INGR_COUNT_PATTERN reads. */
const MATERIAL_PARTS = /^(.*?)\s*([\d,]+\s*\/\s*[\d,]+)\s*$/;

/* The frame is BUILT by the skin from the game's section text, exactly as
   SkillPanelRenderer already builds .fs-skill-ingredient-grid from the raw
   material line. The game's own section nodes stay where they are and stay
   clipped, so nothing is reparented and nothing the renderer reads changes. */
function ensureDetailBody(panel) {
  const host = controlsHost(panel);
  if (!host) return null;
  let body = host.querySelector(':scope > [data-iw-skill-v2-body]');
  if (!body) {
    body = document.createElement('div');
    body.dataset.iwSkillV2Body = '1';
    body.dataset.iwSkillV2Row = 'body';
    body.className = 'iw-skill-v2-body';
    host.appendChild(body);
  }
  const selected = FRAME_SECTIONS.flatMap(name => {
    const sections = [...panel.querySelectorAll(`[data-iw-skill-v2-section="${name}"]`)];
    // A rendered materials grid supersedes its raw text source, never both.
    const grid = sections.find(el => el.classList.contains('fs-skill-ingredient-grid'));
    return grid ? [grid] : sections.filter(el => !sections.some(other => other !== el && other.contains(el)));
  });

  if (!selected.length) {
    if (body.childElementCount) body.replaceChildren();
    delete body.dataset.iwSkillV2BodySignature;
    return body;
  }

  /* Materials get a row per ingredient so the frame can lay them out as a
     grid; every other section is one block of prose. Rebuilt only when the
     text actually changes - `textContent` is a replace-all, so an
     unconditional write is a childList record every flush and that is a
     loop. */
  const rows = selected.flatMap(section => section.classList.contains('fs-skill-ingredient-grid')
    ? [...section.querySelectorAll('.fs-skill-ingredient-item')]
        .map(el => ({ text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
                      state: el.dataset.iwIngredientState || '', kind: 'material' }))
    : [{ text: (section.textContent || '').replace(/\s+/g, ' ').trim(), state: '', kind: '' }]);

  const signature = rows.map(r => `${r.kind}:${r.state}:${r.text}`).join(String.fromCharCode(31));
  if (body.dataset.iwSkillV2BodySignature === signature) return body;
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const el = document.createElement('span');
    el.className = 'iw-skill-v2-body-row';
    if (row.state) el.dataset.iwSkillV2BodyState = row.state;
    /* A material is a compact CELL: name and have/need count, which the sheet
       keeps on one line while the cell has room. The count is the state
       (rule 5), so it is never the part that gets squeezed. A line with no
       trailing N/M stays one block of prose. */
    const parts = row.kind === 'material' ? MATERIAL_PARTS.exec(row.text) : null;
    if (parts) {
      el.dataset.iwSkillV2BodyKind = 'material';
      const name = document.createElement('span');
      name.className = 'iw-skill-v2-body-name';
      name.textContent = parts[1];
      const count = document.createElement('span');
      count.className = 'iw-skill-v2-body-count';
      count.textContent = parts[2];
      el.append(name, count);
    } else {
      el.textContent = row.text;
    }
    frag.appendChild(el);
  }
  body.replaceChildren(frag);
  body.dataset.iwSkillV2BodySignature = signature;
  return body;
}

/* The foot row. It holds nothing but an UNMET requirement now, so it exists
   only while there is one. */
function ensureFootRow(panel) {
  const host = controlsHost(panel);
  if (!host) return null;
  let row = host.querySelector(':scope > [data-iw-skill-v2-controls]');
  if (!row) {
    row = document.createElement('div');
    row.dataset.iwSkillV2Controls = '1';
    row.dataset.iwSkillV2Row = 'tabs';
    row.className = 'iw-skill-v2-controls';
    host.appendChild(row);
  }
  return row;
}
/* A requirement is shown ONLY when the player does not meet it, in small type
   on the card's foot row. Met or unmet is the game's own class, read once into
   `data-iw-req-state` - this copies that decision and never makes its own
   (rule 5). The note lives inside the foot row, which
   SkillPanelRenderer.textCandidates and neutraliseIngredients both exclude, so
   the copied "Requires ..." line cannot be resolved as a second requirement. */
function syncRequirementNote(panel) {
  const unmet = [...new Set([...panel.querySelectorAll('[data-iw-skill-v2-section="requirements"][data-iw-req-state="unmet"]')]
    .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
  const existing = panel.querySelector('[data-iw-skill-v2-controls]');
  if (!unmet.length) { existing?.remove(); return null; }
  const row = ensureFootRow(panel);
  if (!row) return null;
  let note = row.querySelector(':scope > [data-iw-skill-v2-req-note]');
  if (!note) {
    note = document.createElement('span');
    note.dataset.iwSkillV2ReqNote = '1';
    note.className = 'iw-skill-v2-req-note';
    note.setAttribute('role', 'note');
    row.append(note);
  }
  setText(note, unmet.join(' \u00b7 '));
  return row;
}

export function enhanceSkillCardV2(panel, skillType) {
  if (!panel || !panel.isConnected || !skillType || skillType === 'unknown') return null;
  setData(panel, 'iwSkillV2', '1');
  setData(panel, 'iwSkillV2Type', skillType);
  /* Always "expanded": CollapsibleFrames' fold rule keys on this attribute
     being present, and there is no other state any more. */
  setData(panel, 'iwSkillV2State', 'expanded');
  markSections(panel);
  levelReadout(panel);
  const glyph = ensureActionGlyph(panel);
  ensureActionLabel(panel);
  fitActionLabel(panel);
  smoothActionFill(panel);
  syncLongActionTimer(panel, glyph);
  removeRetiredNodes(panel);
  const row = syncRequirementNote(panel);
  ensureDetailBody(panel);
  return row;
}
export function clearSkillCardV2(panel) {
  if (!panel) return;
  panel.querySelectorAll('[data-iw-skill-v2-controls],[data-iw-skill-v2-expand],[data-iw-skill-v2-level-readout],[data-iw-skill-v2-action-glyph],[data-iw-skill-v2-action-label],[data-iw-skill-v2-summary],[data-iw-skill-v2-break],[data-iw-skill-v2-body],[data-iw-skill-v2-req-note]')
    .forEach(el => el.remove());
  panel.querySelectorAll('[data-iw-skill-v2-section]').forEach(el => delete el.dataset.iwSkillV2Section);
  panel.style.removeProperty('--iw-skill-v2-progress');
  panel.style.removeProperty('--iw-skill-v2-btn-font');
  panel.style.removeProperty('--iw-skill-v2-action-label-font');
  panel.style.removeProperty('--iw-skill-v2-fill-duration');
  delete panel.dataset.iwSkillV2FillReset;
  delete panel.dataset.iwSkillV2LongAction;
  fillSamples.delete(panel);
  delete panel.dataset.iwSkillV2LabelFit;
  delete panel.dataset.iwSkillV2; delete panel.dataset.iwSkillV2Type; delete panel.dataset.iwSkillV2State; delete panel.dataset.iwSkillV2Tab;
}
function reconcile(panel, skill) {
  if (!panel?.isConnected) return;
  if (!skill || skill === 'unknown' || !panel.classList.contains('fs-skill-panel')) return clearSkillCardV2(panel);
  enhanceSkillCardV2(panel, skill);
}
function bindOnce() {
  if (bound) return;
  bound = true;
  on('iw:skill-panel', e => {
    if (active && isRuntimeActive()) guard('skill-v2:panel', () => reconcile(e.detail?.panel, e.detail?.skill));
  });
  for (const type of ['iw:name-scan-flush', 'iw:dom-flush']) on(type, e => {
    if (active && isRuntimeActive()) guard('skill-v2:action-timer', () => syncTimersOnTick(e.detail?.roots));
  });
}
export function initSkillCardDesignController() {
  active = true;
  bindOnce();
  /* A label measured in the fallback face is wrong once Barlow lands. */
  document.fonts?.ready?.then(() => guard('skill-v2:fonts', () => {
    if (!active) return;
    document.querySelectorAll('.compact-panel[data-iw-skill-v2-label-fit]').forEach(panel => {
      delete panel.dataset.iwSkillV2LabelFit;
      fitActionLabel(panel);
    });
  }));
  const root = document.documentElement;
  if (root && root.getAttribute(DESIGN_ATTR) !== 'new') root.setAttribute(DESIGN_ATTR, 'new');
  /* A toggle mounted by an older build in this same page session. */
  document.querySelectorAll('[data-iw-skill-design-toggle]').forEach(el => el.remove());
}
export function clearSkillCardDesignController() {
  active = false;
  document.documentElement?.removeAttribute(DESIGN_ATTR);
  document.querySelectorAll('[data-iw-skill-design-toggle]').forEach(el => el.remove());
  document.querySelectorAll('.compact-panel[data-iw-skill-v2]').forEach(clearSkillCardV2);
}
