import assert from 'node:assert/strict';
import {getArenaCue,ARENA_PERIOD} from './ashmaw-arena-scene.js';
assert.equal(ARENA_PERIOD,16);
assert.deepEqual(getArenaCue(0),getArenaCue(ARENA_PERIOD),'battle cues must wrap to the same rest state');
assert.deepEqual(getArenaCue(-1),getArenaCue(15),'negative seeks must wrap correctly');
assert.ok(getArenaCue(5.5).warning>.8,'ground rupture needs readable anticipation');
assert.ok(getArenaCue(6.4).rupture>.8,'the warning must resolve into an eruption');
assert.ok(getArenaCue(7.5).debris>.5,'the rupture must resolve into falling debris');
for(let i=0;i<160;i++){
 const c=getArenaCue(i/10,false);
 assert.equal(c.warning+c.rupture+c.debris,0,'ambient-only mode must omit combat effects');
}
console.log('Arena cue order, anticipation, debris, ambient mode and cyclic timing verified.');
