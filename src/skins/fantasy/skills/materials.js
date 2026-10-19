/**
 * Material counts on the Skills sheet, green when the player holds enough
 * and red when short — Legacy's ingredient highlight
 * (SkillPanelRenderer `iw-skill-ingredient-met`), forked for the game's own
 * `.iw-ss-detail` line.
 *
 * The line is React's text ("📦 Astral Bough 0/40 • 🪨 Astralium Ore
 * 98709/20"), often ONE text node holding several materials, so a wrapper
 * per entry would take ownership of game text (rule 2). The CSS Custom
 * Highlight API paints ranges instead: nothing is written into the DOM,
 * and teardown is deleting two registry entries. The verdict is the game's
 * own numbers, owned >= required, never a guess (rule 5).
 *
 * Entries are split the way Legacy learned to (docs/traps/skill-card-v2.md):
 * an entry starts at the latest of the previous count's end, a `•`, and an
 * element boundary, because `textContent` joins sibling nodes with nothing
 * between them and the game separates materials with an emoji, not always
 * a bullet.
 */

export const MET = 'iwf-material-met';
export const SHORT = 'iwf-material-short';

const DETAIL = '.iw-ss-detail';
const COUNT = /(\d[\d.,]*)([kmb]?)\s*\/\s*(\d[\d.,]*)([kmb]?)(?!\p{L})/giu;
const SCALE = { '': 1, k: 1e3, m: 1e6, b: 1e9 };

const supported = () => !!globalThis.CSS?.highlights && typeof globalThis.Highlight === 'function';

export function amount(digits, suffix = '') {
  const n = Number(String(digits).replace(/,/g, '').replace(/\.$/, ''));
  return Number.isFinite(n) ? n * SCALE[suffix.toLowerCase()] : NaN;
}

/** Text nodes of `root` with their offsets into its textContent. */
function textNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node, start: offset, parent: node.parentElement });
    offset += node.nodeValue?.length || 0;
  }
  return nodes;
}

function pointAt(nodes, target) {
  for (const { node, start } of nodes) {
    const end = start + (node.nodeValue?.length || 0);
    if (target <= end) return { node, offset: target - start };
  }
  return null;
}

/**
 * Each "<name> <owned>/<required>" entry in `text` with its offsets and
 * verdict. `elementStarts` are the offsets where a new element's text begins.
 */
export function materialEntries(text, elementStarts = [0]) {
  const entries = [];
  let previousEnd = 0;
  COUNT.lastIndex = 0;
  for (let m = COUNT.exec(text); m; m = COUNT.exec(text)) {
    let end = m.index + m[0].length;
    let elementStart = 0;
    for (const at of elementStarts) { if (at > m.index) break; elementStart = at; }
    let start = Math.max(text.lastIndexOf('•', m.index - 1) + 1, elementStart, previousEnd);
    previousEnd = end;
    const owned = amount(m[1], m[2]);
    const required = amount(m[3], m[4]);
    if (!Number.isFinite(owned) || !Number.isFinite(required)) continue;
    while (start < end && /\s/.test(text[start])) start += 1;
    while (end > start && /[\s.,]/.test(text[end - 1])) end -= 1;
    entries.push({ start, end, met: owned >= required });
  }
  return entries;
}

function lineRanges(line) {
  const nodes = textNodes(line);
  const starts = [];
  let lastParent;
  for (const n of nodes) { if (n.parent !== lastParent) { starts.push(n.start); lastParent = n.parent; } }
  const out = { met: [], short: [] };
  for (const entry of materialEntries(line.textContent || '', starts)) {
    const from = pointAt(nodes, entry.start);
    const to = pointAt(nodes, entry.end);
    if (!from || !to) continue;
    try {
      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      (entry.met ? out.met : out.short).push(range);
    } catch { /* stale React text; the next pass rebuilds it */ }
  }
  return out;
}

/*
 * skillsPass runs on every flush, so the ranges are rebuilt only when a
 * line's text changed or one of their text nodes left the page (React
 * swapped it). A range follows an in-place text edit by itself, but its
 * verdict would not, hence the text key.
 */
let key = null;
let ranges = [];

export function materialsPass(root = document) {
  if (!supported()) return;
  const lines = [...root.querySelectorAll(DETAIL)];
  const next = lines.map(line => line.textContent || '').join('\u0000');
  if (next === key && ranges.every(r => r.startContainer.isConnected && r.endContainer.isConnected)) return;
  const met = [];
  const short = [];
  for (const line of lines) {
    const r = lineRanges(line);
    met.push(...r.met);
    short.push(...r.short);
  }
  key = next;
  ranges = [...met, ...short];
  try {
    if (met.length) CSS.highlights.set(MET, new Highlight(...met)); else CSS.highlights.delete(MET);
    if (short.length) CSS.highlights.set(SHORT, new Highlight(...short)); else CSS.highlights.delete(SHORT);
  } catch { /* registry refused the ranges; the next pass retries */ key = null; }
}

export function clearMaterials() {
  key = null;
  ranges = [];
  if (!supported()) return;
  CSS.highlights.delete(MET);
  CSS.highlights.delete(SHORT);
}
