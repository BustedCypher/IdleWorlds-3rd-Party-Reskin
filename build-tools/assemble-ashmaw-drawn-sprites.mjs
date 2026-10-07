// Assemble authored drawings. Cropping and integer registration only;
// no rig, deformation, synthesized in-betweens, or frame interpolation.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base='assets/raids/ashmaw/sprites-v3';
const output='output/ashmaw-sprites-v3';
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.route('https://drawn-sprites.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  await route.fulfill(name?{contentType:'image/png',body:await readFile(`${base}/source/${name}`)}:
   {contentType:'text/html',body:'<!doctype html><body></body>'});
 });
 await page.goto('https://drawn-sprites.test/');
 const manifest={character:'Ashmaw, the Cinder Tyrant',version:3,facing:'right',columns:6,rows:4,
  cellWidth:1200,cellHeight:800,sheetWidth:7200,sheetHeight:3200,
  method:'individually painted frame drawings; crop and integer registration only',animations:{}};
 for(const [name,prefix] of [['idle','idle'],['fireBreath','fire']]){
  const sources=Array.from({length:12},(_,i)=>`${prefix}-${String(i*2+1).padStart(2,'0')}-${String(i*2+2).padStart(2,'0')}.png`);
  const result=await page.evaluate(async({sources,name})=>{
   const width=1200,height=800,frames=[],metrics=[];
   for(const file of sources){
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Missing '+file));i.src='/'+file;});
    if(img.width<2160||img.width>2190||img.height<720||img.height>730)throw new Error(`${file}: unexpected native size ${img.width}x${img.height}`);
    for(let index=0;index<2;index++){
     const c=document.createElement('canvas');c.width=width;c.height=height;
     const nativeWidth=Math.floor(img.width/2),sx=index===0?0:Math.ceil(img.width/2);
     const px=Math.round((width-nativeWidth)/2),py=Math.round((height-img.height)/2);
     const ctx=c.getContext('2d');ctx.drawImage(img,sx,0,nativeWidth,img.height,px,py,nativeWidth,img.height);
     const d=ctx.getImageData(0,0,width,height).data;
     let left=width,top=height,right=-1,bottom=-1,foot=-1,footLeft=width,footRight=-1;
     const footBand=name==='idle'?.80:.68;
     const footX=name==='idle'?[.32,.90]:[.23,.66];
     for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      if(d[(y*width+x)*4+3]<160)continue;
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
      if(y>height*footBand&&x>width*footX[0]&&x<width*footX[1]){
       foot=Math.max(foot,y);footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);
      }
     }
     if(foot<0)throw new Error(`No feet in ${file} frame ${index}`);
     metrics.push({source:file,sourceFrame:index,nativeSize:[nativeWidth,img.height],bounds:{left,top,right,bottom},footBaseline:foot,footCenter:(footLeft+footRight)/2});
     frames.push(c);
    }
   }
   // Remove camera jitter using a whole-frame integer translation. All drawing
   // pixels, dimensions, and anatomical relationships remain untouched.
   const baseline=Math.round(height*.925),center=metrics[0].footCenter;
   const atlas=document.createElement('canvas');atlas.width=width*6;atlas.height=height*4;
   const ac=atlas.getContext('2d'),hashes=[],deltas=[],registered=[];
   for(let i=0;i<24;i++){
    const m=metrics[i],dx=Math.round(center-m.footCenter),dy=baseline-m.footBaseline;
    if(m.bounds.left+dx<=0||m.bounds.right+dx>=width-1||m.bounds.top+dy<=0||m.bounds.bottom+dy>=height-1)
     throw new Error(`${name} ${i+1} would clip after registration (${dx},${dy})`);
    const c=document.createElement('canvas');c.width=width;c.height=height;
    c.getContext('2d').drawImage(frames[i],dx,dy);registered.push(c);
    ac.drawImage(c,i%6*width,Math.floor(i/6)*height);
    const d=c.getContext('2d').getImageData(0,0,width,height).data;let hash=2166136261;
    for(let j=0;j<d.length;j+=31)hash=Math.imul(hash^d[j],16777619);
    hashes.push(hash>>>0);m.offsetX=dx;m.offsetY=dy;
   }
   // Coarse image differences flag a seam that is worse than normal transitions.
   const sample=registered.map(c=>{const s=document.createElement('canvas');s.width=192;s.height=128;const x=s.getContext('2d');x.drawImage(c,0,0,192,128);return x.getImageData(0,0,192,128).data;});
   for(let i=0;i<24;i++){const a=sample[i],b=sample[(i+1)%24];let delta=0;for(let j=0;j<a.length;j++)delta+=Math.abs(a[j]-b[j]);deltas.push(delta/a.length);}
   const sorted=deltas.slice(0,23).sort((a,b)=>a-b),median=sorted[11];
   return {png:atlas.toDataURL('image/png').split(',')[1],metrics,
    first:registered[0].toDataURL('image/png').split(',')[1],
    peak:registered[name==='idle'?12:13].toDataURL('image/png').split(',')[1],
    verification:{nativeFrameSizes:metrics.map(m=>m.nativeSize),paddedFrameSize:[width,height],uniqueDrawings:new Set(hashes).size,adjacentDifferences:deltas,seamDifference:deltas[23],medianDifference:median,seamRatio:deltas[23]/median,registeredBaseline:baseline}};
  },{sources,name});
  assert.equal(result.verification.uniqueDrawings,24,'24 distinct authored drawings required');
  const file=name==='idle'?'idle-24.png':'fire-breath-24.png';
  await writeFile(`${base}/${file}`,Buffer.from(result.png,'base64'));
  await writeFile(`${output}/${name}-first.png`,Buffer.from(result.first,'base64'));
  await writeFile(`${output}/${name}-peak.png`,Buffer.from(result.peak,'base64'));
  manifest.animations[name]={file,frameCount:24,fps:24,frameMilliseconds:1000/24,loopMilliseconds:1000,
   sequence:Array.from({length:24},(_,i)=>i),frames:result.metrics.map((m,i)=>({x:i%6*1200,y:Math.floor(i/6)*800,width:1200,height:800,source:m.source,sourceFrame:m.sourceFrame,nativeSize:m.nativeSize,registration:{x:m.offsetX,y:m.offsetY}})),verification:result.verification};
  console.log(name,JSON.stringify(result.verification));
 }
 await writeFile(`${base}/sprites.json`,JSON.stringify(manifest,null,2)+'\n');
}finally{await browser.close();}
