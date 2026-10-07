import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base='assets/raids/ashmaw/sprites-v3';
const output='output/ashmaw-sprites-v3';
const manifest=JSON.parse(await readFile(`${base}/sprites.json`,'utf8'));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:4175/output/ashmaw-sprites-v3/');
 // A missing favicon/asset must return 404 without killing the preview server.
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/missing-preview-asset.png');return r.status;}),404);
 await page.waitForFunction(()=>spritePlayers.idle&&spritePlayers.fireBreath);
 const result=await page.evaluate(async()=>{
  const result={};
  const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
  for(const [name,p] of Object.entries(spritePlayers)){
   p.paused=true;
   const config=spriteConfig.animations[name],canvas=document.querySelector('[data-animation="'+name+'"]'),ctx=canvas.getContext('2d');
   const hashes=[],samples=[],sources={},alphas=[],exact=[];
   for(let i=0;i<24;i++){
    p.draw(i);const f=config.frames[i],d=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let hash=2166136261,edgeAlpha=0;
    for(let j=0;j<d.length;j+=31)hash=Math.imul(hash^d[j],16777619);hashes.push(hash>>>0);
    for(let x=0;x<canvas.width;x++)edgeAlpha=Math.max(edgeAlpha,d[x*4+3],d[((canvas.height-1)*canvas.width+x)*4+3]);
    for(let y=0;y<canvas.height;y++)edgeAlpha=Math.max(edgeAlpha,d[y*canvas.width*4+3],d[(y*canvas.width+canvas.width-1)*4+3]);
    alphas.push(edgeAlpha);
    // Every exported frame must be an untouched crop of its authored source,
    // registered using translation only. This rules out baked rig deformation.
    const source=sources[f.source]??=await load('../../assets/raids/ashmaw/sprites-v3/source/'+f.source);
    const e=document.createElement('canvas');e.width=canvas.width;e.height=canvas.height;const ec=e.getContext('2d');
    const nw=f.nativeSize[0],nh=f.nativeSize[1],sx=f.sourceFrame===0?0:Math.ceil(source.width/2);
    ec.drawImage(source,sx,0,nw,nh,Math.round((e.width-nw)/2)+f.registration.x,Math.round((e.height-nh)/2)+f.registration.y,nw,nh);
    const expected=ec.getImageData(0,0,e.width,e.height).data;
    exact.push(d.every((v,j)=>v===expected[j]));
    const s=document.createElement('canvas');s.width=192;s.height=128;s.getContext('2d').drawImage(canvas,0,0,192,128);samples.push(s.getContext('2d').getImageData(0,0,192,128).data);
   }
   const differences=samples.map((a,i)=>{const b=samples[(i+1)%24];let d=0;for(let j=0;j<a.length;j++)d+=Math.abs(a[j]-b[j]);return d/a.length;});
   const median=differences.slice(0,23).sort((a,b)=>a-b)[11];
   p.draw(name==='idle'?12:13);
   result[name]={uniqueFrames:new Set(hashes).size,allFramesAreUnwarpedDrawings:exact.every(Boolean),edgeAlpha:Math.max(...alphas),seamRatio:differences[23]/median,canvas:[canvas.width,canvas.height]};
  }
  return result;
 });
 for(const [name,r] of Object.entries(result)){
  assert.equal(r.uniqueFrames,24,name);assert.equal(r.allFramesAreUnwarpedDrawings,true,name);
  assert.ok(r.edgeAlpha<=2,`${name}: visible cell-edge clipping`);assert.ok(r.seamRatio<1.25,`${name}: seam exceeds ordinary transitions`);
  assert.deepEqual(r.canvas,[1200,800]);
  assert.equal(manifest.animations[name].fps,24);
  assert.equal(new Set(manifest.animations[name].frames.map(f=>f.source)).size,12);
  for(const f of manifest.animations[name].frames)assert.ok(f.nativeSize[0]>=1080&&f.nativeSize[1]>=720);
 }
 await page.screenshot({path:`${output}/preview.png`});
 await page.locator('[data-scrub="idle"]').fill('23');
 assert.equal(await page.locator('[data-label="idle"]').textContent(),'24 / 24');
 await page.locator('[data-toggle="idle"]').click();await page.waitForTimeout(250);
 assert.notEqual(await page.locator('[data-label="idle"]').textContent(),'24 / 24');
 await page.locator('#large').click();assert.equal(await page.locator('.grid.large').count(),1);
 await page.locator('#speed').selectOption('.5');
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/verification.json`,JSON.stringify({result,errors},null,2)+'\n');
 for(const name of ['idle','fireBreath']){
  const video=await page.evaluate(async name=>{
   const p=spritePlayers[name];p.paused=true;const original=document.querySelector('[data-animation="'+name+'"]');
   const c=document.createElement('canvas');c.width=1200;c.height=800;const ctx=c.getContext('2d');
   const stream=c.captureStream(24),type=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
   const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:8000000}),parts=[];
   recorder.ondataavailable=e=>parts.push(e.data);const stopped=new Promise(resolve=>recorder.onstop=resolve);
   const paint=i=>{p.draw(i);ctx.fillStyle='#1b1820';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(original,0,0);};
   paint(0);recorder.start();
   for(let i=0;i<72;i++){paint(i%24);await new Promise(resolve=>setTimeout(resolve,1000/24));}
   recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
   const b=new Blob(parts,{type});return await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.readAsDataURL(b);});
  },name);
  await writeFile(`${output}/${name}-loop.webm`,Buffer.from(video,'base64'));
 }
 console.log('Verified authored frames, native resolution, alpha margins, 24 fps playback, controls and loop seams:',result);
}finally{await browser.close();}
