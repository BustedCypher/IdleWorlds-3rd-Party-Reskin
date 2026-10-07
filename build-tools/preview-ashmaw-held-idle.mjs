import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base='assets/raids/ashmaw/sprites-v4';
const manifest=JSON.parse(await readFile(`${base}/sprites.json`,'utf8'));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ashmaw · Idle</title>
<style>*{box-sizing:border-box}body{margin:0;background:#111015;color:#f4e3d1;font:15px system-ui;padding:24px}main{max-width:1200px;margin:auto}h1{font:32px Georgia;margin:0 0 8px}p{color:#c5aa91;margin:0 0 18px}.stage{border:1px solid #5b412c;border-radius:8px;padding:12px;background:#1b1820}canvas{display:block;width:100%;aspect-ratio:1.5;background:radial-gradient(ellipse,#30212a,#18151d)}.controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0 6px}button,select{background:#4a291c;color:#fff1de;border:1px solid #ae6842;border-radius:4px;padding:8px 14px;cursor:pointer}input{flex:1;min-width:160px;accent-color:#ce8946}a{color:#eda770}.label{min-width:58px;font-variant-numeric:tabular-nums}.error{color:#ffbb9e}</style>
<main><h1>Ashmaw · Idle Loop</h1><p>24-frame idle · Stable body and scale markings · Drawn wing and tail motion</p><div class="stage"><canvas width="1200" height="800" aria-label="Ashmaw idle animation"></canvas><div class="controls"><button id="pause">Pause</button><button id="previous" aria-label="Previous frame">←</button><input id="scrub" type="range" min="0" max="23" value="0" aria-label="Idle frame"><button id="next" aria-label="Next frame">→</button><span class="label" id="label">Loading…</span><select id="speed" aria-label="Playback speed"><option value=".5">Half speed</option><option value="1" selected>24 fps</option></select><a href="../../${base}/idle-24.png" download>PNG sheet ↗</a></div></div><p class="error" id="error"></p></main>
<script>
const config=${JSON.stringify(manifest)},a=config.animations.idle,c=document.querySelector('canvas'),ctx=c.getContext('2d'),scrub=document.querySelector('#scrub'),pause=document.querySelector('#pause');
window.spriteConfig=config;
const img=new Image();img.onerror=()=>document.querySelector('#error').textContent='Unable to load the idle sheet.';
img.onload=()=>{const p=window.idlePlayer={frame:0,time:0,last:performance.now(),paused:matchMedia('(prefers-reduced-motion: reduce)').matches,speed:1,draw};
 function draw(frame){p.frame=((frame%24)+24)%24;const f=a.frames[p.frame];ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,f.x,f.y,f.width,f.height,0,0,f.width,f.height);scrub.value=p.frame;document.querySelector('#label').textContent=(p.frame+1)+' / 24';}
 const setPause=v=>{p.paused=v;pause.textContent=v?'Play':'Pause';p.time=p.frame*a.frameMilliseconds;};
 pause.onclick=()=>setPause(!p.paused);scrub.oninput=()=>{setPause(true);draw(Number(scrub.value));p.time=p.frame*a.frameMilliseconds;};
 document.querySelector('#previous').onclick=()=>{setPause(true);draw(p.frame-1);};document.querySelector('#next').onclick=()=>{setPause(true);draw(p.frame+1);};document.querySelector('#speed').onchange=e=>p.speed=Number(e.target.value);
 function tick(now){const dt=Math.min(100,Math.max(0,now-p.last));p.last=now;if(!p.paused&&!document.hidden){p.time+=dt*p.speed;const f=Math.floor(p.time/a.frameMilliseconds)%24;if(f!==p.frame)draw(f);}requestAnimationFrame(tick);}
 setPause(p.paused);draw(0);requestAnimationFrame(tick);
};img.src='../../${base}/idle-24.png';
</script></html>`;
for(const folder of ['output/ashmaw-sprites-v4','output/ashmaw-sprites-v3','output/ashmaw-sprites']){await mkdir(folder,{recursive:true});await writeFile(folder+'/index.html',html);}
console.log('Idle-only preview: http://127.0.0.1:4175/output/ashmaw-sprites-v4/');
