import {mkdir,copyFile,writeFile} from 'node:fs/promises';
const folder='output/thessaly-arena';await mkdir(folder,{recursive:true});
await copyFile('assets/raids/thessaly/arena-storm.png',folder+'/arena-painterly.png');
await copyFile('assets/raids/thessaly/prompts-storm.json',folder+'/painterly-prompts.json');
await copyFile('src/modules/ThessalyArenaRenderer.js',folder+'/scene.js');
await copyFile('assets/raids/thessaly/prompts-atmosphere.json',folder+'/atmosphere-prompts.json');
for(const name of ['storm-clouds','courtyard-mist','hair-wisps','body-clouds'])await copyFile('assets/raids/thessaly/'+name+'.png',folder+'/'+name+'.png');
await writeFile(folder+'/index.html',`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thessaly · Arena Study</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0d1013;color:#dce0cc;font:14px system-ui;padding:24px}main{max-width:1774px;margin:auto}.heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}h1{font:28px Georgia;margin:0 0 7px}.kicker{font-size:10px;color:#93ab8c;letter-spacing:.19em;margin:0 0 9px}p{color:#a89486;margin:0}.frame{border:1px solid #725039;border-radius:4px;overflow:hidden;background:#101518}canvas{display:block;width:100%;height:auto}.tools{display:flex;align-items:center;flex-wrap:wrap;gap:14px;background:#15191b;padding:13px 16px;border-top:1px solid #4f352b}button{background:#20292a;border:1px solid #886046;color:#d5dcc8;border-radius:3px;padding:8px 15px;cursor:pointer}button[aria-pressed=true]{background:#374c37;border-color:#be7546}button:hover{background:#483024}input{flex:1;min-width:160px;accent-color:#88a677}a{color:#c99a72}.status{min-width:180px;font-size:12px;color:#a8baa0}.time{font-variant-numeric:tabular-nums;min-width:40px}.note{margin-top:14px;font-size:12px;line-height:1.7}.error{color:#ffb38d}.badge{border:1px solid #5e4030;color:#bfa489;padding:6px 9px;font-size:11px;white-space:nowrap}@media(max-width:650px){body{padding:10px}.heading{align-items:start}h1{font-size:23px}.status{order:3;width:100%}.badge{display:none}}
</style>
<main><div class="heading"><div><p class="kicker">RAID ENCOUNTER · THESSALY</p><h1>The Plague Warden</h1><p>A storm given a body, bound to guard the dead pits beneath the old plague wards.</p></div><span class="badge">ARENA COMPOSITION STUDY</span></div>
<div class="frame"><canvas aria-label="Thessaly's female storm form and flowing silver hair above the misty plague pits and uneven ruined courtyard"></canvas>
<div class="tools"><button id="pause">Pause</button><button id="lightning" aria-pressed="true">Lightning</button><button id="battle" disabled aria-pressed="false" style="opacity:.45;cursor:default">Battle effects disabled</button><input id="scrub" aria-label="Scene time" type="range" min="0" max="480" value="0"><span class="time" id="time">0.00 s</span><span class="status" id="status">Ambient · storm clouds and plague mist</span></div></div>
<p class="error" id="error"></p><p class="note">16-second loop · Fresh cloud and mist artwork, a slight cloud-body sway and silver hair waving in the wind.<br>Lightning is a separate effect; toggle it to view the quiet storm. <a href="arena-painterly.png">View the painting</a> · <a href="atmosphere-prompts.json">Atmosphere prompts</a></p></main>
<script type="module">
import {createThessalyArenaScene} from './scene.js?v=fresh-clouds-soft-wind-3';
const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Unable to load '+src));i.src=src;});
const canvas=document.querySelector('canvas'),pause=document.querySelector('#pause'),lightning=document.querySelector('#lightning'),scrub=document.querySelector('#scrub'),time=document.querySelector('#time'),status=document.querySelector('#status');
try{
 const [background,clouds,mist,hair,body]=await Promise.all(['arena-painterly','storm-clouds','courtyard-mist','hair-wisps','body-clouds'].map(name=>load(name+'.png')));
 const renderer=window.arenaRenderer=createThessalyArenaScene(canvas,{background,clouds,mist,hair,body});
 const state=window.arenaPlayer={paused:matchMedia('(prefers-reduced-motion:reduce)').matches,battle:false,lightning:true,time:0,last:performance.now(),draw};
 function draw(t){state.time=t;const c=renderer.render(t,{lightning:state.lightning});scrub.value=Math.round(c.t*30);time.textContent=c.t.toFixed(2)+' s';status.textContent=state.lightning?'Ambient · storm crackle and plague mist':'Ambient · clouds and mist';}
 pause.textContent=state.paused?'Play':'Pause';pause.onclick=()=>{state.paused=!state.paused;pause.textContent=state.paused?'Play':'Pause';};
 lightning.onclick=()=>{state.lightning=!state.lightning;lightning.setAttribute('aria-pressed',String(state.lightning));draw(state.time);};
 scrub.oninput=()=>{state.paused=true;pause.textContent='Play';draw(Number(scrub.value)/30);};
 function tick(now){const dt=Math.min(.1,Math.max(0,(now-state.last)/1000));state.last=now;if(!state.paused&&!document.hidden)draw(state.time+dt);requestAnimationFrame(tick);}
 draw(0);requestAnimationFrame(tick);
}catch(e){document.querySelector('#error').textContent=e.message;}
</script></html>`);
console.log('Arena study: http://127.0.0.1:4175/output/thessaly-arena/');
