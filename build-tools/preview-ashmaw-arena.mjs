import {mkdir,copyFile,writeFile} from 'node:fs/promises';
const folder='output/ashmaw-arena';await mkdir(folder,{recursive:true});
await copyFile('assets/raids/ashmaw/arena.png',folder+'/arena-painterly.png');
await copyFile('assets/raids/ashmaw/arena-source/prompts.json',folder+'/painterly-prompts.json');
await copyFile('src/modules/AshmawArenaRenderer.js',folder+'/scene.js');
await writeFile(folder+'/index.html',`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ashmaw · Arena Study</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#110e10;color:#e4d3bc;font:14px system-ui;padding:24px}main{max-width:1774px;margin:auto}.heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}h1{font:28px Georgia;margin:0 0 7px}.kicker{font-size:10px;color:#b9926d;letter-spacing:.19em;margin:0 0 9px}p{color:#a89486;margin:0}.frame{border:1px solid #725039;border-radius:4px;overflow:hidden;background:#171114}canvas{display:block;width:100%;height:auto}.tools{display:flex;align-items:center;flex-wrap:wrap;gap:14px;background:#191214;padding:13px 16px;border-top:1px solid #4f352b}button{background:#2d211e;border:1px solid #886046;color:#edd8bc;border-radius:3px;padding:8px 15px;cursor:pointer}button[aria-pressed=true]{background:#663223;border-color:#be7546}button:hover{background:#483024}input{flex:1;min-width:160px;accent-color:#b87648}a{color:#c99a72}.status{min-width:180px;font-size:12px;color:#cda983}.time{font-variant-numeric:tabular-nums;min-width:40px}.note{margin-top:14px;font-size:12px;line-height:1.7}.error{color:#ffb38d}.badge{border:1px solid #5e4030;color:#bfa489;padding:6px 9px;font-size:11px;white-space:nowrap}@media(max-width:650px){body{padding:10px}.heading{align-items:start}h1{font-size:23px}.status{order:3;width:100%}.badge{display:none}}
</style>
<main><div class="heading"><div><p class="kicker">RAID ENCOUNTER · ASHMAW</p><h1>The Cinder Tyrant</h1><p>An open battlefield beneath his volcanic perch.</p></div><span class="badge">ARENA COMPOSITION STUDY</span></div>
<div class="frame"><canvas aria-label="Empty uneven stone arena bordered by lava falls, with Ashmaw on a distant ledge"></canvas>
<div class="tools"><button id="pause">Pause</button><button id="battle" disabled aria-pressed="false" style="opacity:.45;cursor:default">Battle effects disabled</button><input id="scrub" aria-label="Scene time" type="range" min="0" max="480" value="0"><span class="time" id="time">0.00 s</span><span class="status" id="status">Ambient · clouds and furnace breath</span><a href="ashmaw-arena-ambient-loop.webm" download>Download loop ↗</a></div></div>
<p class="error" id="error"></p><p class="note">16-second loop · Drifting painted clouds, furnace light, smoke and flowing lava.<br>This is a standalone composition study. <a href="arena-painterly.png">View the painting</a> · <a href="painterly-prompts.json">Artwork prompt</a></p></main>
<script type="module">
import {createArenaScene} from './scene.js?v=ambient-4';
const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Unable to load '+src));i.src=src;});
const canvas=document.querySelector('canvas'),pause=document.querySelector('#pause'),battle=document.querySelector('#battle'),scrub=document.querySelector('#scrub'),time=document.querySelector('#time'),status=document.querySelector('#status');
try{
 const [background,smoke]=await Promise.all([load('arena-painterly.png'),load('../../assets/raids/ashmaw/smoke.png')]);
 const renderer=window.arenaRenderer=createArenaScene(canvas,{background,smoke});
 const state=window.arenaPlayer={paused:matchMedia('(prefers-reduced-motion:reduce)').matches,battle:false,time:0,last:performance.now(),draw};
 function draw(t){state.time=t;const c=renderer.render(t);scrub.value=Math.round(c.t*30);time.textContent=c.t.toFixed(2)+' s';status.textContent='Ambient · clouds and furnace breath';}
 pause.textContent=state.paused?'Play':'Pause';pause.onclick=()=>{state.paused=!state.paused;pause.textContent=state.paused?'Play':'Pause';};
 scrub.oninput=()=>{state.paused=true;pause.textContent='Play';draw(Number(scrub.value)/30);};
 function tick(now){const dt=Math.min(.1,Math.max(0,(now-state.last)/1000));state.last=now;if(!state.paused&&!document.hidden)draw(state.time+dt);requestAnimationFrame(tick);}
 draw(0);requestAnimationFrame(tick);
}catch(e){document.querySelector('#error').textContent=e.message;}
</script></html>`);
console.log('Arena study: http://127.0.0.1:4175/output/ashmaw-arena/');
