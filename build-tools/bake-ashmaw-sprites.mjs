import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const base='assets/raids/ashmaw/sprites-v2';
const output='output/ashmaw-sprites-v2';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1536,height:1024}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('https://sprite-bake.test/**',async route=>{
 const file=new URL(route.request().url()).pathname.slice(1);
 if(!file)return route.fulfill({contentType:'text/html',body:`<canvas id="frame" width="1536" height="1024"></canvas><script type="module">
 import {createSpriteRig} from '/build-tools/ashmaw-sprite-rig.js';
 const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
 const [dragon,flame]=await Promise.all([load('/${base}/source/dragon-master.png'),load('/${base}/source/flame-master.png')]);
 window.sources={dragon,flame};window.spriteRig=createSpriteRig(document.querySelector('canvas'),dragon,flame);
 </script>`});
 return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'image/png',body:await readFile(file)});
});
const manifest={character:'Ashmaw, the Cinder Tyrant',version:2,facing:'right',columns:6,rows:4,
 cellWidth:1536,cellHeight:1024,sheetWidth:9216,sheetHeight:4096,
 textureSource:'source/dragon-master.png',method:'one fixed character texture, posed once per baked frame',animations:{}};
try{
 await page.goto('https://sprite-bake.test/');await page.waitForFunction(()=>window.spriteRig);
 for(const name of ['idle','fireBreath']){
  const result=await page.evaluate(name=>{
   const canvas=document.querySelector('canvas'),rig=window.spriteRig;
   const gl=canvas.getContext('webgl'),width=canvas.width,height=canvas.height;
   const atlas=document.createElement('canvas');atlas.width=width*6;atlas.height=height*4;
   const ctx=atlas.getContext('2d'),hashes=[],feet=[];let preview;
   const pixels=()=>{const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
   const hash=(data,alpha=false)=>{let h=2166136261;const end=alpha?width*135*4:data.length;for(let i=alpha?3:0;i<end;i+=alpha?4:31)h=Math.imul(h^data[i],16777619);return h>>>0;};
   for(let i=0;i<24;i++){
    rig.draw(name,i/24);const data=pixels();hashes.push(hash(data));feet.push(hash(data,true));
    ctx.drawImage(canvas,(i%6)*width,Math.floor(i/6)*height);
    if(i===(name==='idle'?6:12))preview=canvas.toDataURL('image/png').split(',')[1];
   }
   rig.draw(name,0);const first=pixels();const firstHash=hash(first);
   rig.draw(name,1);const loopHash=hash(pixels());
   rig.draw(name,1-.000001);const near=pixels();let delta=0;
   for(let i=0;i<first.length;i++)delta+=Math.abs(first[i]-near[i]);
   let edgeAlpha=0;
   for(let frame=0;frame<24;frame++){
    rig.draw(name,frame/24);const d=pixels();
    for(let x=0;x<width;x++)edgeAlpha=Math.max(edgeAlpha,d[x*4+3],d[((height-1)*width+x)*4+3]);
    for(let y=0;y<height;y++)edgeAlpha=Math.max(edgeAlpha,d[(y*width)*4+3],d[(y*width+width-1)*4+3]);
   }
   return {png:atlas.toDataURL('image/png').split(',')[1],preview,
    verification:{uniqueFrames:new Set(hashes).size,pinnedFootAlpha:new Set(feet).size===1,
      exactLoop:firstHash===loopHash,seamMean:delta/first.length,edgeAlpha,sourceSize:[sources.dragon.width,sources.dragon.height]}};
  },name);
  const v=result.verification;
  assert.equal(v.uniqueFrames,24,`${name}: all frames must contain distinct motion`);
  assert.ok(v.pinnedFootAlpha,`${name}: feet stay anchored throughout the loop`);
  assert.ok(v.exactLoop,`${name}: phase zero and one must match`);
  assert.ok(v.seamMean<.05,`${name}: no jump at phase wrap`);
  assert.ok(v.edgeAlpha<8,`${name}: no visible cell-edge clipping (${v.edgeAlpha})`);
  assert.ok(v.sourceSize[0]>=1500&&v.sourceSize[1]>=1000,'higher-resolution character master required');
  const file=name==='idle'?'idle-24.png':'fire-breath-24.png';
  await writeFile(`${base}/${file}`,Buffer.from(result.png,'base64'));
  await writeFile(`${output}/${name}-frame.png`,Buffer.from(result.preview,'base64'));
  manifest.animations[name]={file,frameCount:24,fps:24,frameMilliseconds:1000/24,loopMilliseconds:1000,
   sequence:Array.from({length:24},(_,i)=>i),frames:Array.from({length:24},(_,i)=>({x:i%6*1536,y:Math.floor(i/6)*1024,width:1536,height:1024})),verification:v};
  console.log(`${name}:`,v);
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${base}/sprites.json`,JSON.stringify(manifest,null,2)+'\n');
 console.log('Saved two 24-frame sheets; 1536x1024 per frame (2.83x the previous dimensions).');
}finally{await browser.close();}
