import assert from 'node:assert/strict';
import * as loot from '../src/modules/arcaneCacheRewards.js';

assert.equal(typeof loot.rollCacheRewards, 'function', 'batch rewards can be generated');
assert.equal(typeof loot.groupCacheRewards, 'function', 'bulk loot is partitioned without losing quantities');
const drop = (id, quantity, rarity, kind = 'item') => ({ id, name:id, quantity, rarity, kind });
const input = [drop('sword',1,'rare'),drop('gold',250,'common','currency'),
  drop('sword',2,'rare'),drop('essence',9,'epic','resource'),drop('potion',3,'uncommon'),
  drop('effigy',1,'epic'),drop('gold',500,'common','currency')];
const snapshot = JSON.stringify(input);
const grouped = loot.groupCacheRewards(input, true);
assert.deepEqual(grouped.cards.map(x=>[x.id,x.quantity]), [['effigy',1],['sword',3]]);
assert.deepEqual(grouped.list.map(x=>[x.id,x.quantity]), [['gold',750],['essence',9],['potion',3]]);
assert.equal(JSON.stringify(input), snapshot, 'grouping must not mutate source rolls');
assert.equal(loot.groupCacheRewards(input, false).cards.length, 5, 'single mode retains all item cards');
assert.equal(loot.groupCacheRewards([], true).cards.length, 0);
assert.equal(loot.groupCacheRewards([drop('gold',1,'common','currency')], true).cards.length, 0);

for (const count of [20,21,50,100]) {
  const rolls = loot.rollCacheRewards(count, () => 0);
  assert.equal(rolls.length, count * 3, 'every cache contributes its own rolls');
  const result = loot.groupCacheRewards(rolls, true);
  assert.equal(result.list.find(x=>x.id==='gold').quantity, count * 250);
  assert.equal(result.list.find(x=>x.id==='essence').quantity, count * 20);
  assert.equal(result.list.find(x=>x.id==='copper-potion').quantity, count);
  assert.equal(result.cards.length, 0, 'a batch without rare loot is a valid list-only result');
  assert.equal([...result.cards,...result.list].reduce((n,x)=>n+x.quantity,0), count * 271);
}
assert.equal(loot.rollCacheRewards(1).length, 3);
for (const invalid of [0,-1,1.5,101,Infinity,NaN,'20']) {
  assert.throws(()=>loot.rollCacheRewards(invalid), RangeError);
}
let seed = 42;
const varied = loot.groupCacheRewards(loot.rollCacheRewards(100, () => {
  seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296;
}), true);
assert.ok(varied.cards.length > 3, 'the demo exercises more than one page of rare loot');
assert.ok(varied.cards.every(x=>['rare','epic','legendary','mythic'].includes(x.rarity) && x.kind==='item'));
assert.equal(new Set([...varied.cards,...varied.list].map(x=>x.id)).size, varied.cards.length + varied.list.length);
assert.deepEqual(loot.cacheItemDetails({item:{effects_raw:'Fallback',req_text:'Fallback requirement'}},
  {effects_raw:'ATK +48, Requires Combat Lv 37, 1 Socket',req_text:'Requires Combat Lv 37'}),
  {description:'ATK +48, 1 Socket',requirement:'Requires Combat Lv 37'});
assert.deepEqual(loot.cacheItemDetails({item:{effects_raw:'XP +12/task',req_text:''}}),
  {description:'XP +12/task',requirement:''});
assert.equal(typeof loot.cacheStatLines, 'function', 'card stats can be shown on separate lines');
for (const [description, lines] of [
  ['ATK +18 • DEF +13, XP +13/task, +26% 2x gather chance', ['ATK +18','DEF +13','XP +13/task','+26% 2x gather chance']],
  ['XP +12/task, +8% 2x gather chance, +10% gold find, +8% item find', ['XP +12/task','+8% 2x gather chance','+10% gold find','+8% item find']],
  ['ATK +1,250, DEF +2,000 • XP +1,000,000/task', ['ATK +1,250','DEF +2,000','XP +1,000,000/task']],
  ['ATK +48,1 Socket', ['ATK +48','1 Socket']],
  [' ATK +48;\n DEF +12 • ', ['ATK +48','DEF +12']],
  ['Socket effect: +6 Frost Resist', ['Socket effect: +6 Frost Resist']],
  ['', []], [undefined, []],
]) assert.deepEqual(loot.cacheStatLines(description), lines);
console.log('PASS cache loot: independent rolls, exact aggregation, rarity/resource split, bounds, descriptions');
