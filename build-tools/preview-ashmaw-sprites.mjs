// Inspect equal-cell sprite crops and generate frame-by-frame playback only.
// This never warps/interpolates sprites or modifies the generated PNG pixels.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base='assets/raids/ashmaw/sprites';
const manifest={character:'Ashmaw, the Cinder Tyrant',facing:'right',columns:4,rows:2,
  animations:{idle:{file:'idle.png',displayScale:.84,frameMilliseconds:180,sequence:[0,1,2,3,4,5,6,7,6,5,4,3,2,1]},
  fireBreath:{file:'fire-breath.png',displayScale:1,frameMilliseconds:160,sequence:[0,1,2,3,4,5,6,7]}}};
const browser=await chromium.launch();
try{
  const page=await browser.newPage();
  await page.route('https://sprites.test/**',async route=>{
    const file=new URL(route.request().url()).pathname.slice(1);
    if(!file)return route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'});
    return route.fulfill({contentType:'image/png',body:await readFile(`${base}/${file}`)});
  });
  await page.goto('https://sprites.test/');
  for(const [name,animation] of Object.entries(manifest.animations)){
    const metrics=await page.evaluate(async file=>{
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/'+file;});
      const width=img.width/4,height=img.height/2;
      if(!Number.isInteger(width)||!Number.isInteger(height))throw new Error('Sheet dimensions must divide into 4x2 cells');
      const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
      const data=ctx.getImageData(0,0,img.width,img.height).data;
      const alpha=(x,y)=>data[(y*img.width+x)*4+3];
      const frames=[];
      for(let frame=0;frame<8;frame++){
        const sx=(frame%4)*width,sy=Math.floor(frame/4)*height;
        let left=width,top=height,right=-1,bottom=-1,foot=-1;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          if(alpha(sx+x,sy+y)<160)continue;
          left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
          // Fire/sparks on the right don't get mistaken for planted feet.
          if(y>height*.6 && x>width*.20 && x<width*.66)foot=Math.max(foot,y);
        }
        if(right<0 || foot<0)throw new Error('Missing sprite or feet in frame '+frame);
        frames.push({x:sx,y:sy,width,height,offsetX:0,offsetY:Math.round(height*.90-foot),
          bounds:{left,top,right,bottom},footBaseline:foot});
      }
      return {sheetWidth:img.width,sheetHeight:img.height,cellWidth:width,cellHeight:height,
        cornerAlpha:alpha(0,0),frames};
    },animation.file);
    if(metrics.cornerAlpha!==0)throw new Error(`${name} lacks transparent background`);
    Object.assign(animation,metrics);delete animation.cornerAlpha;
    for(const f of animation.frames){
      f.offsetX=name==='idle'?Math.round(f.width*.031):0;
      f.offsetY=Math.round(f.height*.95-f.footBaseline*animation.displayScale);
      if(f.bounds.top*animation.displayScale+f.offsetY<0 || f.bounds.bottom*animation.displayScale+f.offsetY>=f.height)
        throw new Error(`${name} registration clips a pose`);
    }
    console.log(`${name}: ${metrics.sheetWidth}x${metrics.sheetHeight}, eight ${metrics.cellWidth}x${metrics.cellHeight} cells; foot baselines`,metrics.frames.map(f=>f.footBaseline));
    for(const [index,f] of metrics.frames.entries()){
      if(f.bounds.top<=1||f.bounds.left<=1||f.bounds.right>=f.width-2||f.bounds.bottom>=f.height-2)
        throw new Error(`${name} frame ${index+1} touches a cell edge; inspect clipping`);
    }
  }
}finally{await browser.close();}
await writeFile(`${base}/sprites.json`,JSON.stringify(manifest,null,2)+'\n');
await mkdir('output/ashmaw-sprites',{recursive:true});
await writeFile('output/ashmaw-sprites/index.html',`<!doctype html><html lang="en">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ashmaw Sprite Animation</title>
<style>*{box-sizing:border-box}body{background:#111015;color:#eee4d6;margin:0;padding:32px;font:16px system-ui}h1{font:32px Georgia;margin:0 0 8px}p{color:#b7aa9a;margin:0 0 28px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{min-width:0;border:1px solid #51402e;padding:16px;border-radius:8px;background:#1b1820}canvas{display:block;width:100%;aspect-ratio:1.5;background:radial-gradient(ellipse,#33202b,#17151c)}h2{font:22px Georgia;margin:4px 0 16px}.tools{display:flex;align-items:center;gap:14px;margin-top:16px}button{background:#4a291c;color:#fff1de;border:1px solid #ae6842;border-radius:4px;padding:8px 14px;cursor:pointer}.label{color:#c3aa92;font-size:13px}a{color:#efa773}@media(max-width:760px){body{padding:18px}.grid{grid-template-columns:1fr}}</style>
<h1>Ashmaw · Sprite Animation</h1><p>Drawn animation frames. Idle and fire breath, with transparent backgrounds.</p>
<div class="grid"><article><h2>Idle</h2><canvas data-animation="idle"></canvas><div class="tools"><button data-toggle="idle">Pause</button><span class="label" data-label="idle"></span></div></article>
<article><h2>Fire breath</h2><canvas data-animation="fireBreath"></canvas><div class="tools"><button data-toggle="fireBreath">Pause</button><span class="label" data-label="fireBreath"></span></div></article></div>
<script>
const config=${JSON.stringify(manifest)},players={};
window.spriteConfig=config;
const load=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=src;});
for(const [name,a] of Object.entries(config.animations)){
 load('../../assets/raids/ashmaw/sprites/'+a.file).then(img=>{
   const canvas=document.querySelector('[data-animation="'+name+'"]'),ctx=canvas.getContext('2d');
   canvas.width=a.cellWidth;canvas.height=a.cellHeight;
   const state=players[name]={paused:false,frame:0,time:0,last:performance.now(),draw};
   function draw(frame){const f=a.frames[frame];ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,f.x,f.y,f.width,f.height,f.offsetX,f.offsetY,f.width*a.displayScale,f.height*a.displayScale);document.querySelector('[data-label="'+name+'"]').textContent='Frame '+(frame+1)+' / 8';}
   function tick(now){const delta=Math.max(0,now-state.last);state.last=now;if(!state.paused&&!document.hidden){state.time+=delta;state.frame=a.sequence[Math.floor(state.time/a.frameMilliseconds)%a.sequence.length];draw(state.frame);}requestAnimationFrame(tick);}
   document.querySelector('[data-toggle="'+name+'"]').onclick=event=>{state.paused=!state.paused;event.target.textContent=state.paused?'Play':'Pause';};
   draw(0);requestAnimationFrame(tick);
 });
}
window.spritePlayers=players;
</script></html>`);
console.log('Sprite preview: http://127.0.0.1:4175/output/ashmaw-sprites/');
