import assert from 'node:assert/strict';
import { buildInventoryDetails, inventoryDetailSignature } from '../src/modules/InventoryModel.js';

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
