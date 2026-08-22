/**
 * InventoryModel
 *
 * Pure presentation model for inventory-only dynamic details. The item
 * database remains authoritative for the stable item identity/stat rail;
 * native row text is used only for state that can vary per owned item
 * (loadouts, socketed gems, requirements, upgrade state, etc.).
 *
 * Keeping this parser separate from InventoryRenderer lets us regression-test
 * the information model without mounting or mutating the live React DOM.
 */

const ACTION_WORDS = /^(equip|equipped|unequip|list|sell|use|drop|lock|unlock|deposit|withdraw|set bonus)$/i;
const QUANTITY = /^(?:x|×)\s*\d[\d,]*$/i;
const LEVEL_ONLY = /^lv\.?\s*\d+$/i;
const NUMBER_ONLY = /^\d[\d,]*$/;
const TIER_OR_SLOT = /^(?:tier\s*\d+|level\s*\d+)(?:\s*[·•-]\s*.+)?$/i;
const BASIC_STAT = /^(?:atk|def|hp|war(?:fare)?)\s*\+?-?\d+/i;
const SUMMARY_STAT = /(?:\bxp\b.*\/task|\bitem find\b|\bgold find\b|\bdouble gather\b|\b2\s*[×x]\s*gather\b|\bsockets?\b)/i;
const REQUIREMENT = /^(?:requires?|needs)\b/i;
const LOADOUT = /\b(?:in\s+)?loadout\b/i;
const UPGRADE_STATE = /\b(?:not\s+)?upgradable\b|\bcannot\s+be\s+upgraded\b/i;
const SOCKET_EFFECT = /\b(?:cut\s+[a-z][a-z' -]*|sunstone|moonstone|gem(?:stone)?|socketed)\b/i;
const DYNAMIC_EFFECT = /:\s*[+-]?\d+(?:\.\d+)?(?:%|\b)/i;
const SET_STATE = /\bset bonus\b/i;

export function normaliseInventoryText(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    // Native rows often prefix semantic lines with emoji / decorative glyphs
    // (📁, 💎, ✦, etc.). The fantasy presentation supplies its own glyph, so
    // remove leading symbols before classification and duplicate detection.
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
}

function compareKey(value) {
  return normaliseInventoryText(value)
    .toLowerCase()
    .replace(/[.:;,]+$/g, '')
    .replace(/\s+/g, ' ');
}

function splitLevelName(name) {
  const text = normaliseInventoryText(name);
  const m = text.match(/^(.*?)\s+lv\.?\s*(\d+)\s*$/i);
  return m ? { full: text, base: m[1].trim(), level: m[2] } : { full: text, base: text, level: null };
}

function kindFor(text) {
  if (LOADOUT.test(text)) return 'loadout';
  if (SOCKET_EFFECT.test(text)) return 'socket';
  if (DYNAMIC_EFFECT.test(text)) return 'effect';
  if (SET_STATE.test(text)) return 'set';
  if (UPGRADE_STATE.test(text)) return 'status';
  return 'detail';
}

function isNameFragment(text, nameParts) {
  const key = compareKey(text);
  if (!key) return true;
  if (key === compareKey(nameParts.full) || key === compareKey(nameParts.base)) return true;
  if (nameParts.level && key === compareKey(`Lv ${nameParts.level}`)) return true;
  return false;
}

function isStableStatNoise(text) {
  if (LOADOUT.test(text) || UPGRADE_STATE.test(text) || SET_STATE.test(text)) return false;
  if (TIER_OR_SLOT.test(text)) return true;
  if (BASIC_STAT.test(text)) return true;
  if (SUMMARY_STAT.test(text) && !SOCKET_EFFECT.test(text)) return true;
  return false;
}

function isLikelyAggregate(text, nameParts) {
  const key = compareKey(text);
  const base = compareKey(nameParts.base);
  if (!key || !base || !key.startsWith(base)) return false;
  return /(?:\btier\b|\b(?:atk|def|hp)\s*[+-]?\d|\bxp\b.*\/task|\brequires?\b|\bloadout\b|\bupgrad)/i.test(text);
}

/**
 * Resolve an item identity from native row text without losing a separately
 * rendered +1..+4 enhancement badge. Prefer an exact enhanced record over the
 * base item whenever the combined name exists in ItemDatabase.
 */
export function resolveInventoryItemName(texts, getByName) {
  const lookup = typeof getByName === 'function' ? getByName : () => null;
  const source = (texts || []).map(t => String(t == null ? '' : t).trim()).filter(Boolean);
  const candidates = source.filter(t =>
    t.length > 2 && !/^\d[\d,]*$/.test(t) && !/^[x×]\s*\d/i.test(t) &&
    !/^lv\.?\s*\d+$/i.test(t) && !/^\+\s*[1-4]$/.test(t) &&
    !/^(equip|equipped|unequip|use|drop|sell|list|lock|unlock|set bonus)$/i.test(t)
  );
  const upgradeToken = source.find(t => /^\+\s*[1-4]$/.test(t));
  if (upgradeToken) {
    const suffix = '+' + upgradeToken.replace(/\D/g, '');
    for (const base of candidates) {
      for (const combined of [base + suffix, base + ' ' + suffix]) {
        if (lookup(combined)) return combined;
      }
    }
  }
  for (const c of candidates) if (lookup(c)) return c;
  const lvPat = /^lv\.?\s*(\d+)$/i;
  for (let i = 0; i < source.length; i++) {
    const base = source[i];
    if (!base || base.length < 3) continue;
    const prev = source[i - 1] || '';
    const next = source[i + 1] || '';
    for (const lv of [prev, next]) {
      const m = lvPat.exec(lv);
      if (!m) continue;
      for (const combined of [base + ' Lv. ' + m[1], base + ' Lv ' + m[1]]) {
        if (lookup(combined)) return combined;
      }
    }
  }
  return candidates[0] || '';
}
/**
 * Convert native row text into dynamic detail lines.
 *
 * @param {string[]} rawTexts text fragments/compact element text from the live row
 * @param {object|null} item ItemDatabase record (optional)
 * @param {string} displayName resolved inventory item name
 * @returns {{details:{text:string,kind:string,count:number}[], requirements:string[]}}
 */
export function buildInventoryDetails(rawTexts, item, displayName) {
  const nameParts = splitLevelName(item?.name || displayName || '');
  const counts = new Map();
  const requirements = [];
  const requirementKeys = new Set();

  // Work shortest-to-longest and discard parent-wrapper aggregates whenever
  // they contain an already captured semantic child. This mirrors the live
  // React DOM, where a row wrapper's textContent may concatenate name, tier,
  // loadout, stats, requirement and action labels into one giant string.
  const source = (rawTexts || [])
    .map(normaliseInventoryText)
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);
  const atomics = [];
  for (const text of source) {
    if (text.length > 220 || isLikelyAggregate(text, nameParts)) continue;
    const key = compareKey(text);
    const containsAtomic = atomics.some(shorter => {
      const shortKey = compareKey(shorter);
      return shorter.length < text.length && shortKey.length >= 5 && key.includes(shortKey);
    });
    if (containsAtomic) continue;
    atomics.push(text);
  }

  for (const text of atomics) {
    if (!text || text.length > 180) continue;
    if (isNameFragment(text, nameParts)) continue;
    if (ACTION_WORDS.test(text) || QUANTITY.test(text) || LEVEL_ONLY.test(text) || NUMBER_ONLY.test(text)) continue;

    if (REQUIREMENT.test(text)) {
      const key = compareKey(text);
      if (!requirementKeys.has(key)) {
        requirementKeys.add(key);
        requirements.push(text);
      }
      continue;
    }

    // The stable tier/slot/stats are already sourced from ItemDatabase and
    // rendered on the primary meta rail. Native text is retained only when it
    // represents owned-item state the static database cannot know.
    if (isStableStatNoise(text)) continue;

    const interesting = LOADOUT.test(text) || SOCKET_EFFECT.test(text) || DYNAMIC_EFFECT.test(text) || UPGRADE_STATE.test(text) || SET_STATE.test(text);
    if (!interesting) continue;

    const key = compareKey(text);
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { text, kind: kindFor(text), count: 1 });
    }
  }

  const order = { loadout: 0, socket: 1, effect: 2, set: 3, status: 4, detail: 5 };
  const details = [...counts.values()].sort((a, b) => {
    const kindDiff = (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
    return kindDiff || a.text.localeCompare(b.text);
  });

  return { details, requirements };
}

export function inventoryDetailSignature(model) {
  if (!model) return '';
  return [
    ...(model.details || []).map(d => `${d.kind}:${compareKey(d.text)}:${d.count || 1}`),
    ...(model.requirements || []).map(r => `req:${compareKey(r)}`),
  ].join('|');
}
