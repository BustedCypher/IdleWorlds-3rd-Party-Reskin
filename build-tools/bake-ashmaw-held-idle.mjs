// Traditional held-cel composition: the body is identical in every frame.
// Moving cels are authored wing/tail drawings, registered as whole images.
// No skeletal posing, mesh deformation, rotation, or synthesized in-betweens.
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base='assets/raids/ashmaw/sprites-v4';
const previous=JSON.parse(await readFile('assets/raids/ashmaw/sprites-v3/sprites.json','utf8'));
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.route('https://held-idle.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  await route.fulfill(name?{contentType:'image/png',body:await readFile(name)}:{contentType:'text/html',body:'<!doctype html><body></body>'});
 });
 await page.goto('https://held-idle.test/');
 const result=await page.evaluate(async({previous,base})=>{
  const width=1200,height=800;
  const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/'+src;});
  const [sheet,body]=await Promise.all([load('assets/raids/ashmaw/sprites-v3/idle-24.png'),load(base+'/source/held-body.png')]);
  const create=()=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
  const held=create();held.getContext('2d').drawImage(body,0,0,width,height);
  const heldPixels=held.getContext('2d').getImageData(0,0,width,height).data;
  const sources=[],images=[];
  for(const f of previous.animations.idle.frames){
   const c=create(),ctx=c.getContext('2d');ctx.drawImage(sheet,f.x,f.y,width,height,0,0,width,height);
   const pixels=ctx.getImageData(0,0,width,height);
   // Isolate the actual dragon from detached fragments of neighboring cells.
   const d=pixels.data,n=width*height,labels=new Int32Array(n),queue=new Int32Array(n);let label=0,largest=0,largestSize=0;
   for(let p=0;p<n;p++){
    if(labels[p]||d[p*4+3]<32)continue;
    label++;let start=0,end=1;queue[0]=p;labels[p]=label;
    while(start<end){const q=queue[start++],x=q%width,y=Math.floor(q/width);
     for(const a of [x>0?q-1:-1,x<width-1?q+1:-1,y>0?q-width:-1,y<height-1?q+width:-1]){
      if(a>=0&&!labels[a]&&d[a*4+3]>=32){labels[a]=label;queue[end++]=a;}
     }
    }
    if(end>largestSize){largestSize=end;largest=label;}
   }
   for(let p=0;p<n;p++)if(labels[p]!==largest){d[p*4]=0;d[p*4+1]=0;d[p*4+2]=0;d[p*4+3]=0;}
   ctx.putImageData(pixels,0,0);images.push(c);sources.push(d);
  }
  const ref=sources[0],points=[];
  // Locate camera/size drift using the unchanged leg/torso artwork, not moving
  // head, wing or tail. Registration is one uniform scale and translation.
  for(let y=550;y<735;y+=7)for(let x=440;x<1020;x+=7){
   const p=(y*width+x)*4;if(ref[p+3]>240&&ref[p]+ref[p+1]+ref[p+2]>90)points.push([x,y,ref[p],ref[p+1],ref[p+2],ref[p+3]]);
  }
  const register=d=>{
   const score=(s,dx,dy)=>{let sum=0;for(const [x,y,r,g,b,a] of points){
    const sx=Math.round(750+(x-750-dx)/s),sy=Math.round(740+(y-740-dy)/s);
    if(sx<0||sx>=width||sy<0||sy>=height){sum+=1020;continue;}
    const p=(sy*width+sx)*4;sum+=Math.abs(r-d[p])+Math.abs(g-d[p+1])+Math.abs(b-d[p+2])+Math.abs(a-d[p+3])*2;
   }return sum/points.length;};
   let best={scale:1,x:0,y:0,score:Infinity};
   for(let si=94;si<=106;si++)for(let dx=-45;dx<=45;dx+=5)for(let dy=-25;dy<=25;dy+=5){const s=si/100,v=score(s,dx,dy);if(v<best.score)best={scale:s,x:dx,y:dy,score:v};}
   const coarse={...best};
   for(let si=-4;si<=4;si++)for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){
    const s=coarse.scale+si*.002,v=score(s,coarse.x+dx,coarse.y+dy);if(v<best.score)best={scale:s,x:coarse.x+dx,y:coarse.y+dy,score:v};
   }
   return best;
  };
  const poses=sources.map((d,i)=>i===0?{scale:1,x:0,y:0,score:0}:register(d));
  const atlas=document.createElement('canvas');atlas.width=7200;atlas.height=3200;const ac=atlas.getContext('2d');
  const frames=[],hashes=[],samples=[];let locked=true,maxBodyDelta=0;
  for(let i=0;i<24;i++){
   const c=create(),ctx=c.getContext('2d'),t=poses[i];
   const cel=create(),cc=cel.getContext('2d');
   cc.translate(750+t.x,740+t.y);cc.scale(t.scale,t.scale);cc.translate(-750,-740);cc.drawImage(images[i],0,0);
   // Draw only the authored appendages behind the fixed held body.
   for(const polygon of [
    [[130,35],[840,35],[845,315],[810,410],[700,515],[520,540],[300,490],[150,350]],
    [[40,385],[330,385],[495,540],[660,605],[665,720],[35,720]]
   ]){
    ctx.save();ctx.beginPath();polygon.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();ctx.drawImage(cel,0,0);ctx.restore();
   }
   ctx.drawImage(held,0,0);
   const d=ctx.getImageData(0,0,width,height).data;let hash=2166136261;
   for(let j=0;j<d.length;j+=31)hash=Math.imul(hash^d[j],16777619);
   hashes.push(hash>>>0);
   for(let p=0;p<width*height;p++)if(heldPixels[p*4+3]===255){
    for(let channel=0;channel<4;channel++)maxBodyDelta=Math.max(maxBodyDelta,Math.abs(d[p*4+channel]-heldPixels[p*4+channel]));
   }
   ac.drawImage(c,i%6*width,Math.floor(i/6)*height);frames.push(c);
   const small=document.createElement('canvas');small.width=192;small.height=128;small.getContext('2d').drawImage(c,0,0,192,128);samples.push(small.getContext('2d').getImageData(0,0,192,128).data);
  }
  const differences=samples.map((a,i)=>{const b=samples[(i+1)%24];let sum=0;for(let j=0;j<a.length;j++)sum+=Math.abs(a[j]-b[j]);return sum/a.length;});
  const median=differences.slice(0,23).sort((a,b)=>a-b)[11];
  return {png:atlas.toDataURL('image/png').split(',')[1],first:frames[0].toDataURL('image/png').split(',')[1],peak:frames[12].toDataURL('image/png').split(',')[1],poses,
   verification:{uniqueFrames:new Set(hashes).size,maxBodyPixelDelta:maxBodyDelta,adjacentDifferences:differences,seamRatio:differences[23]/median},
   frames:Array.from({length:24},(_,i)=>({x:i%6*1200,y:Math.floor(i/6)*800,width:1200,height:800,drawnAppendageSource:i}))};
 },{previous,base});
 assert.equal(result.verification.maxBodyPixelDelta,0,'held-body details must never change');
 assert.equal(result.verification.uniqueFrames,24);
 await writeFile(`${base}/idle-24.png`,Buffer.from(result.png,'base64'));
 await writeFile('output/ashmaw-sprites-v4/first.png',Buffer.from(result.first,'base64'));
 await writeFile('output/ashmaw-sprites-v4/peak.png',Buffer.from(result.peak,'base64'));
 await writeFile(`${base}/sprites.json`,JSON.stringify({character:'Ashmaw',version:4,method:'held body cel plus frame-by-frame painted wing and tail cels; uniform image registration only',cellWidth:1200,cellHeight:800,columns:6,rows:4,sheetWidth:7200,sheetHeight:3200,sourceSheet:'../sprites-v3/idle-24.png',registration:result.poses,animations:{idle:{file:'idle-24.png',frameCount:24,fps:24,frameMilliseconds:1000/24,sequence:Array.from({length:24},(_,i)=>i),frames:result.frames,verification:result.verification}}},null,2)+'\n');
 console.log(JSON.stringify(result.verification));
}finally{await browser.close();}
