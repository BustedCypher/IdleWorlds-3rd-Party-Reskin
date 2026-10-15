/** Presentation-only loot. Quantities, rarities and roll weights are DEMO choices,
 * not the game's drop rates. Tooltip fallbacks: items.json snapshot 2026-09-16.
 * Live ItemDatabase records take precedence when available. Nothing is awarded. */
const reward = (id, name, quantity, rarity, kind, itemId, effects, requirement = '') => Object.freeze({
  id, name, quantity, rarity, kind,
  icon: Object.freeze({ id: itemId, name }),
  item: Object.freeze({ item_id: itemId, name, effects_raw: effects, req_text: requirement }),
});
export const ARCANE_CACHE_REWARDS = Object.freeze([
  reward('essence', 'Revenant Essence', 120, 'common', 'resource', 'revenant_essence', 'Trade Good'),
  reward('moonstone', 'Cut Moonstone', 3, 'rare', 'resource', 'cut_moonstone', 'Socket effect: +6 Frost Resist'),
  reward('effigy', 'Arcane Effigy', 1, 'epic', 'item', 'arcane_effigy',
    'XP +12/task, +8% 2x gather chance, +10% gold find, +8% item find'),
]);
const GOLD = reward('gold', 'Gold', 250, 'common', 'currency', null, 'Currency');
const CLAW = reward('claw', 'Night Claw', 20, 'common', 'resource', 'night_claw', 'Trade Good');
const BONUS = Object.freeze([
  reward('copper-potion', 'Copper XP Potion', 1, 'uncommon', 'item', 'copper_xp_potion', '+1 XP/task for 1h'),
  ARCANE_CACHE_REWARDS[1],
  reward('celestium-sword', 'Celestium Sword', 1, 'rare', 'item', 'celestium_sword', 'ATK +48, 1 Socket', 'Requires Combat Lv 37'),
  reward('celestium-ring', 'Celestium Ring', 1, 'rare', 'item', 'celestium_ring', 'ATK +17 • DEF +12, XP +12/task, +24% 2x gather chance', 'Requires Lv 37 (any skill)'),
  reward('celestium-amulet', 'Celestium Amulet', 1, 'rare', 'item', 'celestium_amulet', 'ATK +17 • DEF +12, XP +12/task, +24% 2x gather chance', 'Requires Lv 37 (any skill)'),
  reward('bloodstone-sword', 'Bloodstone Sword', 1, 'epic', 'item', 'bloodstone_sword', 'ATK +52, 1 Socket', 'Requires Combat Lv 41'),
  ARCANE_CACHE_REWARDS[2],
  reward('bloodstone-amulet', 'Bloodstone Amulet', 1, 'legendary', 'item', 'bloodstone_amulet', 'ATK +18 • DEF +13, XP +13/task, +26% 2x gather chance', 'Requires Lv 41 (any skill)'),
]);
const RARITY = { common:0, uncommon:1, rare:2, epic:3, legendary:4, mythic:5 };

export function rollCacheRewards(count, random = Math.random) {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new RangeError('Choose 1–100 demo caches.');
  if (count === 1) return ARCANE_CACHE_REWARDS.map(entry => ({ ...entry }));
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push({ ...GOLD, quantity: 250 + Math.floor(random() * 751) });
    const material = random() < .5 ? ARCANE_CACHE_REWARDS[0] : CLAW;
    rolls.push({ ...material, quantity: 20 + Math.floor(random() * 61) });
    rolls.push({ ...BONUS[Math.min(BONUS.length - 1, Math.floor(random() * BONUS.length))] });
  }
  return rolls;
}

export function groupCacheRewards(rolls, bulk = false) {
  const unique = new Map();
  for (const entry of rolls) {
    const existing = unique.get(entry.id);
    if (existing) existing.quantity += entry.quantity;
    else unique.set(entry.id, { ...entry });
  }
  const cards = [], list = [];
  for (const entry of unique.values()) {
    const featured = !bulk || (entry.kind === 'item' && (RARITY[entry.rarity] ?? 0) >= RARITY.rare);
    (featured ? cards : list).push(entry);
  }
  if (bulk) cards.sort((a,b) => RARITY[b.rarity] - RARITY[a.rarity] || a.name.localeCompare(b.name));
  list.sort((a,b) => Number(b.kind === 'currency') - Number(a.kind === 'currency'));
  return { cards, list };
}

/** Same fields as TooltipEngine, without its full stats/acquisition UI. */
export function cacheItemDetails(reward, liveItem) {
  const item = liveItem || reward.item || {};
  const requirement = String(item.req_text || (item.req_level
    ? `Requires ${String(item.req_skill).toLowerCase() === 'any' ? '' : `${item.req_skill || 'skill'} `}Lv ${item.req_level}${String(item.req_skill).toLowerCase() === 'any' ? ' (any skill)' : ''}` : '')).trim();
  const description = String(item.effects_raw || item.description || '')
    .replace(requirement || /$^/, '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' • ')
    .replace(/([,•])\s*[,•]/g, '$1').replace(/^[\s,•]+|[\s,•]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  return { description, requirement };
}

/** Split tooltip effects, not the grouping commas inside values such as 1,250. */
export function cacheStatLines(description) {
  return String(description ?? '').split(/[•;\r\n]+|,(?!\d{3}(?:\D|$))/)
    .map(line => line.trim()).filter(Boolean);
}
