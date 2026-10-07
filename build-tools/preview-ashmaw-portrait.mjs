import {mkdir,writeFile,copyFile} from 'node:fs/promises';
const folder='output/ashmaw-portrait';await mkdir(folder,{recursive:true});
await copyFile('build-tools/ashmaw-portrait-scene.js',folder+'/scene.js');
await writeFile(folder+'/index.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ashmaw · Living Portrait</title>
<style>*{box-sizing:border-box}body{background:#110c10;color:#f1dbbf;font:15px system-ui;margin:0;padding:24px}main{max-width:1915px;margin:auto}h1{font:32px Georgia;margin:0 0 8px}p{color:#bd9b83;margin:0 0 18px}.frame{border:1px solid #735034;background:#180d0e;border-radius:7px;overflow:hidden}canvas{display:block;width:100%;aspect-ratio:1915/821}.tools{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:15px}button{background:#492719;color:#ffe2ba;border:1px solid #b56e3d;border-radius:4px;padding:8px 18px;cursor:pointer}input{flex:1;min-width:180px;accent-color:#d68f41}span{font-variant-numeric:tabular-nums}a{color:#edaa6c}.error{color:#ffac83}</style>
<main><h1>Ashmaw · Living Portrait</h1><p>Slow breathing, glowing eyes, billowing smoke, flowing lava and drifting embers · 8-second loop</p><div class="frame"><canvas aria-label="Animated Ashmaw close-up portrait"></canvas><div class="tools"><button id="pause">Pause</button><input id="scrub" aria-label="Animation time" type="range" min="0" max="240" value="0"><span id="time">0.00 s</span><a href="ashmaw-portrait-loop.webm" download>Download loop ↗</a></div></div><p class="error" id="error"></p></main>
<script type="module">
import {createPortraitScene} from './scene.js';
const canvas=document.querySelector('canvas'),pause=document.querySelector('#pause'),scrub=document.querySelector('#scrub'),label=document.querySelector('#time');
const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Unable to load '+src));i.src=src;});
try{
 const [background,dragon,blink,smoke]=await Promise.all(['background','dragon','blink','smoke'].map(n=>load('../../assets/raids/ashmaw/portrait/'+n+'.png')));
 const renderer=window.portraitRenderer=createPortraitScene(canvas,{background,dragon,blink,smoke});
 const state=window.portraitPlayer={paused:matchMedia('(prefers-reduced-motion: reduce)').matches,time:0,last:performance.now(),draw};
 function draw(t){state.time=t;renderer.render(t);scrub.value=Math.round(t%8*30);label.textContent=(t%8).toFixed(2)+' s';}
 pause.textContent=state.paused?'Play':'Pause';pause.onclick=()=>{state.paused=!state.paused;pause.textContent=state.paused?'Play':'Pause';};
 scrub.oninput=()=>{state.paused=true;pause.textContent='Play';draw(Number(scrub.value)/30);};
 function tick(now){const dt=Math.min(.1,Math.max(0,(now-state.last)/1000));state.last=now;if(!state.paused&&!document.hidden)draw(state.time+dt);requestAnimationFrame(tick);}
 draw(0);requestAnimationFrame(tick);
}catch(e){document.querySelector('#error').textContent=e.message;}
</script></html>`);
console.log('Living portrait: http://127.0.0.1:4175/output/ashmaw-portrait/');
