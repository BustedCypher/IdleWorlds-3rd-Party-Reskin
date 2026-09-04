import assert from 'node:assert/strict';
import { buildInventoryDetails, inventoryDetailSignature, resolveInventoryItemName } from '../src/modules/InventoryModel.js';

const boots = {
  name: 'Eternal Weave Boots+1',
  tier: 19,
  subcategory: 'Boots',
  def: 16,
  xp_per_task: 1,
  item_find_pct: 2,
  sockets: 2,
};

const complex = buildInventoryDetails([
  'Eternal Weave Boots+1',
  'Tier 19 · Boots',
  'In loadout: Item Find',
  'DEF +16',
  'Cut Sunstone: +6% Item Find',
  'Cut Sunstone: +6% Item Find',
  'x1',
  'XP +1/task · +2% item find · 2 Sockets',
  'Requires Lv 65 (any skill)',
], boots, boots.name);

assert.deepEqual(complex.requirements, ['Requires Lv 65 (any skill)']);
assert.equal(complex.details.length, 2, 'only dynamic owned-item state should survive');
assert.equal(complex.details[0].kind, 'loadout');
assert.equal(complex.details[0].text, 'In loadout: Item Find');
assert.equal(complex.details[1].kind, 'socket');
assert.equal(complex.details[1].count, 2, 'identical socket effects should compress into one x2 detail');
assert.match(inventoryDetailSignature(complex), /socket:cut sunstone: \+6% item find:2/);

const vestment = buildInventoryDetails([
  "Ancient's Vestment",
  'Tier 19 · Chest',
  'In loadout: Experience',
  'DEF +44',
  'XP +18/task',
  'Not upgradable',
  'Requires Lv 65 (any skill)',
], { name: "Ancient's Vestment", tier: 19, subcategory: 'Chest', def: 44, xp_per_task: 18 }, "Ancient's Vestment");

assert.deepEqual(vestment.requirements, ['Requires Lv 65 (any skill)']);
assert.deepEqual(vestment.details.map(d => d.kind), ['loadout', 'status']);
assert.equal(vestment.details[1].text, 'Not upgradable');

const plain = buildInventoryDetails([
  'Copper Ore',
  'Tier 1 · Resource',
  'x103177',
], { name: 'Copper Ore', tier: 1, subcategory: 'Resource' }, 'Copper Ore');
assert.deepEqual(plain, { details: [], requirements: [] }, 'plain stacks should remain compact');

console.log('PASS inventory item-row model');

const vestmentLiveDom = buildInventoryDetails([
  "Ancient's Vestment",
  '🧥 Tier 19 · Chest',
  '📁 In loadout: Experience',
  'DEF +44',
  'XP +18/task',
  'Not upgradable',
  'Requires Lv 65 (any skill)',
  "Ancient's Vestment🧥 Tier 19 · Chest📁 In loadout: ExperienceDEF +44XP +18/taskNot upgradableRequires Lv 65 (any skill)",
  "Ancient's Vestment🧥 Tier 19 · Chest📁 In loadout: ExperienceDEF +44XP +18/taskNot upgradableRequires Lv 65 (any skill)x1EquippedList",
], { name: "Ancient's Vestment", tier: 19, subcategory: 'Chest', def: 44, xp_per_task: 18 }, "Ancient's Vestment");
assert.deepEqual(vestmentLiveDom.requirements, ['Requires Lv 65 (any skill)'], 'live wrapper aggregates must not duplicate requirements');
assert.deepEqual(vestmentLiveDom.details.map(d => [d.kind, d.text]), [
  ['loadout', 'In loadout: Experience'],
  ['status', 'Not upgradable'],
], 'live wrapper aggregates must collapse to atomic dynamic lines');

const setBonusGlyph = buildInventoryDetails([
  '✦ set bonus',
  '📁 In loadout: Item Find',
  '💎 Cut Sunstone: +6% Item Find',
  'Requires Lv 65 (any skill)',
], boots, boots.name);
assert.deepEqual(setBonusGlyph.details.map(d => d.text), [
  'In loadout: Item Find',
  'Cut Sunstone: +6% Item Find',
], 'decorative-glyph Set Bonus action text must not duplicate the preserved button');

const enhancedLookup = new Map([
  ['wool boots', { name: 'Wool Boots' }],
  ['wool boots+4', { name: 'Wool Boots+4' }],
]);
const lookupEnhanced = name => enhancedLookup.get(String(name).toLowerCase()) || null;
assert.equal(resolveInventoryItemName(['Wool Boots', '+4', 'x1'], lookupEnhanced), 'Wool Boots+4',
  'a separately rendered +4 badge must resolve the enhanced item before the base item');
assert.equal(resolveInventoryItemName(['Wool Boots', 'x1'], lookupEnhanced), 'Wool Boots',
  'ordinary base items must still resolve normally');

// Upgraded cloak: the game nests "+3" in the name span, so leafTexts yields the
// combined "Name+3" plus a bare "+3", and items.json has NO per-level record.
const cloakLookup = new Map([['fortunate regal cloak of the harvest',
  { name: 'Fortunate Regal Cloak of the Harvest', item_id: 'cloak_tier_18_x' }]]);
const lookupCloak = name => cloakLookup.get(String(name).toLowerCase()) || null;
assert.equal(
  resolveInventoryItemName(
    ['Fortunate Regal Cloak of the Harvest+3', '+3', '📦 Tier 18 • Cloak',
     'Not upgradable', 'Requires Lv 61 (any skill)', 'x1'],
    lookupCloak,
  ),
  'Fortunate Regal Cloak of the Harvest',
  'an upgraded item with no per-level record must fall back to its base identity',
);

// The "🎲 +N · <stats>" line: the "🎲 +N" roll count is dropped, but the rolled
// stat bonus after it ("+12 DEF · +3% 2x Gather Chance") is kept as a detail.
const cloakDetails = buildInventoryDetails([
  '📦 Tier 18 • Cloak',
  '🎲 +3 · +12 DEF · +3% 2x Gather Chance',
  '+18% 2x gather chance • +18% item find',
  'Not upgradable',
  'Requires Lv 61 (any skill)',
], { name: 'Fortunate Regal Cloak of the Harvest', tier: 18, subcategory: 'Cloak slot' },
   'Fortunate Regal Cloak of the Harvest');
assert.deepEqual(cloakDetails.requirements, ['Requires Lv 61 (any skill)']);
assert.deepEqual(cloakDetails.details.map(d => [d.kind, d.text]), [
  ['effect', '+12 DEF · +3% 2x Gather Chance'],
], 'rolled stat bonus kept; roll count stripped; "Not upgradable" dropped below +4');
assert.ok(
  !cloakDetails.details.some(d => /🎲/.test(d.text)) &&
  !cloakDetails.details.some(d => /^\+?3\b.*·/.test(d.text)),
  'the roll-count prefix must not leak into any detail',
);

// A freshly upgraded item with no rolled bonus yet shows nothing extra, and the
// misleading "Not upgradable" line is still suppressed (it can be orb-upgraded).
const freshRoll = buildInventoryDetails(
  ['📦 Tier 18 • Cloak', '🎲 +1', 'Not upgradable', 'Requires Lv 61 (any skill)'],
  { name: 'Fortunate Regal Cloak of the Harvest', tier: 18, subcategory: 'Cloak slot' },
  'Fortunate Regal Cloak of the Harvest');
assert.deepEqual(freshRoll.details, [], 'a below-max cloak shows no "Not upgradable"');

// At +4 the cloak is genuinely maxed, so the native "Not upgradable" stays.
const maxedCloak = buildInventoryDetails(
  ['📦 Tier 18 • Cloak', '🎲 +4 · +16 DEF · +4% 2x Gather Chance', 'Not upgradable', 'Requires Lv 61 (any skill)'],
  { name: 'Fortunate Regal Cloak of the Harvest', tier: 18, subcategory: 'Cloak slot' },
  'Fortunate Regal Cloak of the Harvest');
assert.deepEqual(maxedCloak.details.map(d => [d.kind, d.text]), [
  ['effect', '+16 DEF · +4% 2x Gather Chance'],
  ['status', 'Not upgradable'],
], 'a +4 cloak keeps "Not upgradable"');

// A non-orb item (ring/amulet/trinket) that really cannot be upgraded keeps it.
const ring = buildInventoryDetails(
  ['Lapis Ring of Gathering', 'Tier 19 · Ring', 'Not upgradable', 'Requires Lv 65 (any skill)'],
  { name: 'Lapis Ring of Gathering', tier: 19, subcategory: 'Ring' },
  'Lapis Ring of Gathering');
assert.deepEqual(ring.details.map(d => d.text), ['Not upgradable'],
  'items with no orb system keep their genuine "Not upgradable" line');

console.log('PASS upgraded-cloak identity + rolled-stat model');
