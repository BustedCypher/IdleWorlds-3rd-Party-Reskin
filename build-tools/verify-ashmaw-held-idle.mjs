import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='assets/raids/ashmaw/sprites-v4',output='output/ashmaw-sprites-v4';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1040}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:4175/output/ashmaw-sprites-v4/');await page.waitForFunction(()=>window.idlePlayer);
 const result=await page.evaluate(async()=>{
  const p=idlePlayer;p.paused=true;const c=document.querySelector('canvas'),ctx=c.getContext('2d');
  const body=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='../../assets/raids/ashmaw/sprites-v4/source/held-body.png';});
  const held=document.createElement('canvas');held.width=1200;held.height=800;held.getContext('2d').drawImage(body,0,0,1200,800);const b=held.getContext('2d').getImageData(0,0,1200,800).data;
  let maxBodyDelta=0,edgeAlpha=0;const hashes=[];
  for(let frame=0;frame<24;frame++){
   p.draw(frame);const d=ctx.getImageData(0,0,1200,800).data;let hash=2166136261;
   for(let j=0;j<d.length;j+=31)hash=Math.imul(hash^d[j],16777619);hashes.push(hash>>>0);
   for(let j=0;j<d.length;j+=4)if(b[j+3]===255)for(let k=0;k<4;k++)maxBodyDelta=Math.max(maxBodyDelta,Math.abs(b[j+k]-d[j+k]));
   for(let x=0;x<1200;x++)edgeAlpha=Math.max(edgeAlpha,d[x*4+3],d[(799*1200+x)*4+3]);
  }
  p.draw(0);return {uniqueFrames:new Set(hashes).size,maxBodyPixelDelta:maxBodyDelta,edgeAlpha};
 });
 assert.equal(result.uniqueFrames,24);assert.equal(result.maxBodyPixelDelta,0);assert.ok(result.edgeAlpha<3);
 await page.locator('#scrub').fill('23');assert.equal(await page.locator('#label').textContent(),'24 / 24');
 await page.locator('#next').click();assert.equal(await page.locator('#label').textContent(),'1 / 24');
 await page.locator('#pause').click();await page.waitForTimeout(200);assert.notEqual(await page.locator('#label').textContent(),'1 / 24');
 await page.evaluate(()=>{idlePlayer.paused=true;idlePlayer.draw(12);});
 await page.screenshot({path:`${output}/preview.png`});
 const video=await page.evaluate(async()=>{
  const p=idlePlayer,c=document.querySelector('canvas'),out=document.createElement('canvas');out.width=1200;out.height=800;const ctx=out.getContext('2d');p.paused=true;
  const stream=out.captureStream(24),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:8000000}),parts=[];rec.ondataavailable=e=>parts.push(e.data);const done=new Promise(resolve=>rec.onstop=resolve);
  const paint=i=>{p.draw(i);ctx.fillStyle='#1b1820';ctx.fillRect(0,0,1200,800);ctx.drawImage(c,0,0);};paint(0);rec.start();
  for(let i=0;i<72;i++){paint(i%24);await new Promise(resolve=>setTimeout(resolve,1000/24));}rec.stop();await done;stream.getTracks().forEach(t=>t.stop());
  return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob(parts,{type:'video/webm'}));});
 });
 await writeFile(`${output}/idle-loop.webm`,Buffer.from(video,'base64'));
 assert.deepEqual(errors,[]);const manifest=JSON.parse(await readFile(`${base}/sprites.json`,'utf8'));
 assert.ok(manifest.animations.idle.verification.seamRatio<1.25);
 await writeFile(`${output}/verification.json`,JSON.stringify({result,errors,seamRatio:manifest.animations.idle.verification.seamRatio},null,2)+'\n');
 console.log('Held body, 24 distinct frames, seam and playback controls verified:',result);
}finally{await browser.close();}
