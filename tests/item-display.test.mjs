import assert from 'node:assert/strict';
import { deriveDisplayStats, statChips, statRows } from '../src/modules/itemDisplay.js';

const woolPlus4 = {
  name: 'Wool Boots+4', tier: 2, category: 'Equipment', subcategory: 'Boots',
  def: 2, double_gather_pct: '', sockets: 2,
  effects_raw: 'DEF +2, +3% 2x gather chance, 2 Sockets',
};
const woolStats = deriveDisplayStats(woolPlus4);
assert.equal(woolStats.doubleGatherPct, 3,
  'enhanced Tailoring bonus must fall back to effects_raw when structured field is blank');
assert.ok(statChips(woolPlus4, { max: 8 }).some(c => c.text === '2× gather 3%'),
  'Inventory stat rail must expose the enhanced Tailoring bonus');
assert.ok(statRows(woolPlus4).some(r => r.label.includes('2× Gather') && r.value === '3%'),
  'tooltip stat grid must expose the same enhanced Tailoring bonus');

const cottonPlus1 = {
  name: 'Cotton Hood+1', tier: 3, category: 'Equipment', subcategory: 'Hood',
  def: 1, item_find_pct: '', sockets: 2,
  effects_raw: 'DEF +1, +1% item find, 2 Sockets',
};
assert.equal(deriveDisplayStats(cottonPlus1).itemFindPct, 1);
assert.ok(statChips(cottonPlus1, { max: 8 }).some(c => c.text === 'Find +1%'));

const mythrilPlus2 = {
  name: 'Mythril Silk Hood+2', tier: 12, category: 'Equipment', subcategory: 'Hood',
  def: 4, gold_find_pct: '', sockets: 2,
  effects_raw: 'DEF +4, +2% gold find, 2 Sockets',
};
assert.equal(deriveDisplayStats(mythrilPlus2).goldFindPct, 2);

const bloodweavePlus4 = {
  name: 'Bloodweave Hood+4', tier: 22, category: 'Equipment', subcategory: 'Hood',
  def: 12, sockets: 2,
  effects_raw: 'DEF +12, Requires Lv 41 (any skill), All Resists +4, 2 Sockets',
};
assert.equal(deriveDisplayStats(bloodweavePlus4).allResists, 4);
assert.ok(statRows(bloodweavePlus4).some(r => r.label.includes('All Resists') && r.value === '+4'));

const structuredWins = {
  double_gather_pct: 7,
  effects_raw: '+3% 2x gather chance',
};
assert.equal(deriveDisplayStats(structuredWins).doubleGatherPct, 7,
  'authoritative structured data must win when it is populated');

const structuredZero = { double_gather_pct: 0, effects_raw: '+3% 2x gather chance' };
assert.equal(deriveDisplayStats(structuredZero).doubleGatherPct, 0,
  'an explicit structured zero is data, not a missing field');

console.log('PASS enhanced item display model');
