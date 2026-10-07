import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='output/ashmaw-portrait';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:4175/output/ashmaw-portrait/');await page.waitForFunction(()=>window.portraitPlayer);
 const verification=await page.evaluate(()=>{
  portraitPlayer.paused=true;const r=portraitRenderer,c=document.querySelector('canvas'),ctx=c.getContext('2d');
  const pixels=()=>ctx.getImageData(0,0,c.width,c.height).data;
  const hash=d=>{let h=2166136261;for(let j=0;j<d.length;j+=31)h=Math.imul(h^d[j],16777619);return h>>>0;};
  r.render(0);const first=pixels(),start=hash(first);r.render(8);const end=hash(pixels());
  r.render(8-.00001);const near=pixels();let delta=0;for(let j=0;j<near.length;j++)delta+=Math.abs(near[j]-first[j]);
  const shapes=Array.from({length:32},(_,i)=>{const pose=r.render(i/4);return {...pose,hash:hash(pixels())};});
  const eyeMean=()=>{const d=pixels();let sum=0,n=0;for(let y=185;y<238;y++)for(let x=1320;x<1410;x++){const j=(y*c.width+x)*4;sum+=d[j]+d[j+1];n+=2;}return sum/n;};
  const open=r.render(4.70);const openBrightness=eyeMean();const closed=r.render(5.07);const closedBrightness=eyeMean();
  const regionDelta=(a,b,x0,y0,x1,y1)=>{let sum=0,count=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   const j=(y*c.width+x)*4;for(let k=0;k<3;k++){sum+=Math.abs(a[j+k]-b[j+k]);count++;}
  }return sum/count;};
  r.render(1.1);const effectsOn=pixels();r.render(1.1,{showSmoke:false});const noSmoke=pixels();
  r.render(1.1,{flowLava:false});const noLava=pixels();
  r.render(1.1,{flowSurface:false});const noSurface=pixels();
  const smokeMeanDelta=regionDelta(effectsOn,noSmoke,0,0,c.width,c.height);
  const lavaMeanDelta=regionDelta(effectsOn,noLava,522,0,551,239);
  const lavaSurfaceDelta=regionDelta(effectsOn,noSurface,277,580,640,631);
  r.render(1.6,{showSmoke:false});const laterFall=pixels();
  const lavaTimeDelta=regionDelta(noSmoke,laterFall,522,0,551,239);
  let lavaInternalJump=0;
  for(const time of [.346666667,.706666667,1.68,2.04,3.013333333,3.373333333,4.346666667,4.706666667,5.68,6.04,7.013333333,7.373333333]){
   r.render(time-.000001,{showSmoke:false});const before=pixels();
   r.render(time+.000001,{showSmoke:false});const after=pixels();
   for(let y=0;y<239;y++)for(let x=522;x<551;x++){
    const j=(y*c.width+x)*4;for(let k=0;k<3;k++)lavaInternalJump=Math.max(lavaInternalJump,Math.abs(before[j+k]-after[j+k]));
   }
  }
  const renderStart=performance.now();for(let i=0;i<60;i++)r.render(i/7);
  const renderMeanMs=(performance.now()-renderStart)/60;
  r.render(0);
  return {width:c.width,height:c.height,exactLoop:start===end,seamMean:delta/near.length,uniqueSamples:new Set(shapes.map(s=>s.hash)).size,
   maxHeadVerticalTravel:Math.max(...shapes.map(s=>Math.abs(s.dy))),maxHeadRotation:Math.max(...shapes.map(s=>Math.abs(s.tilt))),
   openBlinkAmount:open.blinkAmount,closedBlinkAmount:closed.blinkAmount,openBrightness,closedBrightness,
   smokeMeanDelta,lavaMeanDelta,lavaSurfaceDelta,lavaTimeDelta,lavaInternalJump,renderMeanMs};
 });
 assert.equal(verification.exactLoop,true);assert.ok(verification.seamMean<.02,'no visible wrap discontinuity');
 assert.equal(verification.uniqueSamples,32);
 assert.ok(verification.maxHeadVerticalTravel>12,'the stronger breathing motion must be visible');
 assert.ok(verification.maxHeadVerticalTravel<=18,'keep the head movement restrained');
 assert.equal(verification.openBlinkAmount,0);assert.ok(verification.closedBlinkAmount>.95);
 assert.ok(verification.closedBrightness<verification.openBrightness-3,'painted blink must visibly close the eye');
 assert.ok(verification.smokeMeanDelta>.1,'painted smoke must visibly affect the scene');
 assert.ok(verification.lavaMeanDelta>.05,'light must affect the painted lava fall');
 assert.ok(verification.lavaSurfaceDelta>.2,'molten texture must move visibly on the broad lava river');
 assert.ok(verification.lavaTimeDelta>.05,'the background fall must change over time');
 assert.ok(verification.lavaInternalJump<=1,'lava highlights must enter the fall without brightness pops');
 for(const [name,time] of [['rest',0],['inhale',4],['blink',5.07]]){
  const png=await page.evaluate(t=>{portraitPlayer.draw(t);return document.querySelector('canvas').toDataURL('image/png').split(',')[1];},time);
  await writeFile(`${output}/${name}.png`,Buffer.from(png,'base64'));
 }
 await page.locator('#scrub').fill('120');assert.equal(await page.locator('#time').textContent(),'4.00 s');
 await page.locator('#pause').click();await page.waitForTimeout(220);assert.notEqual(await page.locator('#time').textContent(),'4.00 s');
 await page.evaluate(()=>{portraitPlayer.paused=true;portraitPlayer.draw(0);});
 await page.screenshot({path:`${output}/preview.png`});
 const encoded=await page.evaluate(async()=>{
  portraitPlayer.paused=true;const c=document.querySelector('canvas'),r=portraitRenderer;
  const stream=c.captureStream(0),track=stream.getVideoTracks()[0];
  const type=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
  const rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:14000000}),parts=[];
  rec.ondataavailable=e=>parts.push(e.data);const done=new Promise(resolve=>rec.onstop=resolve);
  r.render(0);rec.start();const start=performance.now();
  for(let frame=0;frame<240;frame++){
   r.render(frame/30);track.requestFrame();
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,start+(frame+1)*1000/30-performance.now())));
  }
  rec.stop();await done;stream.getTracks().forEach(t=>t.stop());
  return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(parts,{type}));});
 });
 await writeFile(`${output}/ashmaw-portrait-loop.webm`,Buffer.from(encoded,'base64'));
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/verification.json`,JSON.stringify({verification,errors},null,2)+'\n');
 console.log('Portrait motion, painted blink, exact loop, seam continuity and playback verified:',verification);
}finally{await browser.close();}
