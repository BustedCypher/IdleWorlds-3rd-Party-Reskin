import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const folder='output/ashmaw-arena',browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1500,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:4175/output/ashmaw-arena/');
 await page.waitForFunction(()=>window.arenaPlayer);await page.evaluate(()=>arenaPlayer.paused=true);
 const verification=await page.evaluate(()=>{
  const r=arenaRenderer,c=document.querySelector('canvas'),ctx=c.getContext('2d');
  const pixels=()=>ctx.getImageData(0,0,c.width,c.height).data;
  const difference=(a,b,box=[0,0,1,1])=>{let total=0,count=0,max=0;for(let y=Math.floor(c.height*box[1]);y<c.height*box[3];y++)for(let x=Math.floor(c.width*box[0]);x<c.width*box[2];x++){
   const j=(y*c.width+x)*4;for(let k=0;k<3;k++){const d=Math.abs(a[j+k]-b[j+k]);total+=d;max=Math.max(max,d);count++;}
  }return {mean:total/count,max};};
  const loop=[];for(const battle of [false,true]){
   r.render(0,{battle});const first=pixels();r.render(16,{battle});const exact=difference(first,pixels());
   r.render(15.99999,{battle});loop.push({battle,exact,near:difference(first,pixels())});
  }
  r.render(1,{ambient:false});const still=pixels();r.render(5,{ambient:false});const fixedBoss=difference(still,pixels(),[.59,.03,.9,.36]);
  r.render(1);const early=pixels();r.render(2.3);const later=pixels();const falls=difference(early,later,[.469,.371,.509,.568]);
  r.render(6.4,{battle:false});const ambientRupture=pixels();r.render(6.4,{battle:true});const disabledBattle=difference(ambientRupture,pixels());
  r.render(3,{cloudMotion:false,bossMotion:false,atmosphere:false,lava:false});const plain=pixels();
  r.render(3,{cloudMotion:true,bossMotion:false,atmosphere:false,lava:false});const movingClouds=pixels();
  const clouds=difference(plain,movingClouds,[.225,0,.62,.15]);
  r.render(3,{cloudMotion:false,bossMotion:true,atmosphere:false,lava:false});const livingBoss=pixels();
  const bossActivity=difference(plain,livingBoss,[.59,.14,.82,.38]);
  r.render(3,{cloudMotion:false,bossMotion:false,eyeLight:false,atmosphere:false,lava:false});const noEyes=pixels();
  r.render(3,{cloudMotion:false,bossMotion:false,eyeLight:true,atmosphere:false,lava:false});
  const eyeStream=difference(noEyes,pixels(),[.615,.19,.668,.237]);
  r.render(1,{bossMotion:false,eyeLight:false,atmosphere:false,lava:false});const skyEarly=pixels();
  r.render(5,{bossMotion:false,eyeLight:false,atmosphere:false,lava:false});const skyLate=pixels();
  const cloudTravel=difference(skyEarly,skyLate,[.25,0,.58,.14]);
  const start=performance.now();for(let i=0;i<60;i++)r.render(i/4,{battle:true});const renderMs=(performance.now()-start)/60;
  return {width:c.width,height:c.height,loop,fixedBoss,falls,disabledBattle,clouds,bossActivity,eyeStream,cloudTravel,renderMs};
 });
 for(const seam of verification.loop){assert.equal(seam.exact.max,0,'the loop boundary must be pixel-identical');assert.ok(seam.near.mean<.01,'the approach to the boundary must be continuous');}
 assert.equal(verification.fixedBoss.max,0,'the dragon and its terrain must stay anchored');
 assert.ok(verification.falls.mean>.1,'painted lava falls must visibly flow');
 assert.equal(verification.disabledBattle.max,0,'battle effects must be disabled even when requested');
 assert.ok(verification.clouds.mean>.1,'painted cloud movement must be visible');
 assert.ok(verification.bossActivity.mean>.1,'furnace breathing and exhale must affect the boss');
 assert.ok(verification.eyeStream.mean>.1,'light must stream from the visible eye corner');
 assert.ok(verification.cloudTravel.mean>2,'cloud banks must visibly billow between phases');
 for(const [name,t,battle] of [['ambient',1.2,false],['clouds',3,false],['exhale',6.4,false]]){
  const encoded=await page.evaluate(({t,battle})=>{arenaPlayer.paused=true;arenaPlayer.battle=battle;arenaPlayer.draw(t);return document.querySelector('canvas').toDataURL('image/png').split(',')[1];},{t,battle});
  await writeFile(`${folder}/${name}.png`,Buffer.from(encoded,'base64'));
 }
 await page.evaluate(()=>{arenaPlayer.battle=false;arenaPlayer.draw(0);});
 assert.equal(await page.locator('#battle').isDisabled(),true);
 await page.locator('#scrub').fill('165');assert.equal(await page.locator('#time').textContent(),'5.50 s');assert.match(await page.locator('#status').textContent(),/Ambient/);
 await page.locator('#pause').click();await page.waitForTimeout(200);assert.notEqual(await page.locator('#time').textContent(),'5.50 s');
 await page.evaluate(()=>{arenaPlayer.paused=true;arenaPlayer.battle=false;arenaPlayer.draw(1.2);});
 await page.screenshot({path:`${folder}/preview.png`});
 const encoded=await page.evaluate(async()=>{
  const c=document.querySelector('canvas'),r=arenaRenderer,stream=c.captureStream(0),track=stream.getVideoTracks()[0];
  const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:9000000}),parts=[];
  recorder.ondataavailable=e=>parts.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);
  r.render(0);recorder.start();const start=performance.now();
  for(let i=0;i<480;i++){r.render(i/30);track.requestFrame();await new Promise(resolve=>setTimeout(resolve,Math.max(0,start+(i+1)*1000/30-performance.now())));}
  recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
  return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(parts,{type:mimeType}));});
 });
 await writeFile(`${folder}/ashmaw-arena-ambient-loop.webm`,Buffer.from(encoded,'base64'));
 assert.deepEqual(errors,[]);await writeFile(`${folder}/verification.json`,JSON.stringify({verification,errors},null,2)+'\n');
 console.log('Ambient arena, disabled battles, painted clouds, furnace breathing, loop and controls verified:',verification);
}finally{await browser.close();}
