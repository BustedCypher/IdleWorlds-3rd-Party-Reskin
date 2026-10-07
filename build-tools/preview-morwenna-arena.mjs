import {mkdir,copyFile,writeFile} from 'node:fs/promises';
const folder='output/morwenna-arena';
await mkdir(folder,{recursive:true});
await copyFile('assets/raids/morwenna/arena.png',folder+'/arena.png');
await copyFile('src/modules/MorwennaArenaRenderer.js',folder+'/scene.js');
for(const name of ['storm-clouds','courtyard-mist'])await copyFile('assets/raids/morwenna/'+name+'.png',folder+'/'+name+'.png');
await copyFile('assets/raids/morwenna/prompts-atmosphere.json',folder+'/atmosphere-prompts.json');
await writeFile(folder+'/index.html',`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Morwenna · Embercourt</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#100e13;color:#e0d8cc;font:14px system-ui;padding:24px}main{max-width:1774px;margin:auto}.heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}h1{font:28px Georgia;margin:0 0 7px}.kicker{font-size:10px;color:#bd98ca;letter-spacing:.19em;margin:0 0 9px}p{color:#a89caa;margin:0}.frame{border:1px solid #695344;border-radius:4px;overflow:hidden;background:#141019}canvas{display:block;width:100%;height:auto}.tools{display:flex;align-items:center;flex-wrap:wrap;gap:12px;background:#17131c;padding:13px 16px;border-top:1px solid #4c3549}button{background:#211925;border:1px solid #775169;color:#ddd1dc;border-radius:3px;padding:8px 15px;cursor:pointer}button[aria-pressed=true]{background:#3b2b43;border-color:#987299}button:hover{background:#493044}input{flex:1;min-width:160px;accent-color:#b088ba}a{color:#c4a0ba}.time{font-variant-numeric:tabular-nums;min-width:62px}.note{margin-top:14px;font-size:12px;line-height:1.7}.error{color:#ffb38d}.badge{border:1px solid #5e403d;color:#bfa489;padding:6px 9px;font-size:11px;white-space:nowrap}@media(max-width:650px){body{padding:10px}.heading{align-items:start}h1{font-size:23px}.badge{display:none}}
</style>
<main><div class="heading"><div><p class="kicker">RAID ENCOUNTER · EMBERCOURT</p><h1>Morwenna, the Hollow Oracle</h1><p>An ancient presence. A hollow vessel. Every death already foretold.</p></div><span class="badge">AMBIENT ARENA STUDY</span></div>
<div class="frame"><canvas aria-label="Morwenna's veiled spectral Matriarch guiding her hollow doll over a ruined stone courtyard, with slow clouds and drifting mist"></canvas>
<div class="tools"><button id="pause">Pause</button><button id="clouds" aria-pressed="true">Clouds</button><button id="mist" aria-pressed="true">Mist</button><button id="curse" aria-pressed="true">Curse light</button><button id="foreground" aria-pressed="true">Foreground</button><input id="scrub" aria-label="Scene time" type="range" min="0" max="720" value="0"><span class="time" id="time">0.00 s</span></div></div>
<p class="error" id="error" role="alert"></p><p class="note">24-second seamless loop · flowing puppet-string light, slow clouds and wind-blown foreground mist and ash.<br><a href="arena.png">View the approved painting</a> · <a href="README.md">Scene assets and prompts</a></p></main>
<script type="module">
import {createMorwennaArenaScene} from './scene.js?v=morwenna-ambient-2';
const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Unable to load '+src));image.src=src;});
const canvas=document.querySelector('canvas'),pause=document.querySelector('#pause'),scrub=document.querySelector('#scrub'),time=document.querySelector('#time');
try {
 const [background,clouds,mist]=await Promise.all(['arena','storm-clouds','courtyard-mist'].map(name=>load(name+'.png')));
 window.arenaAssets={background,clouds,mist};
 const renderer=window.arenaRenderer=createMorwennaArenaScene(canvas,{background,clouds,mist});
 const preference=matchMedia('(prefers-reduced-motion:reduce)');
 const state=window.arenaPlayer={paused:preference.matches,clouds:true,mist:true,curse:true,foreground:true,time:0,last:performance.now(),draw,setPaused};
 function draw(t) {
  const frame=renderer.render(t,{clouds:state.clouds,mist:state.mist,curse:state.curse,foreground:state.foreground});
  state.time=frame.t;scrub.value=Math.round(frame.t*30);time.textContent=frame.t.toFixed(2)+' s';
 }
 function setPaused(value){state.paused=value;pause.textContent=value?'Play':'Pause';}
 setPaused(state.paused);pause.onclick=()=>setPaused(!state.paused);
 for(const id of ['clouds','mist','curse','foreground']) {
  const button=document.querySelector('#'+id);
  button.onclick=()=>{state[id]=!state[id];button.setAttribute('aria-pressed',String(state[id]));draw(state.time);};
 }
 scrub.oninput=()=>{setPaused(true);draw(Number(scrub.value)/30);};
 preference.onchange=e=>{if(e.matches)setPaused(true);};
 let request;
 function tick(now){const dt=Math.min(.1,Math.max(0,(now-state.last)/1000));state.last=now;if(!state.paused&&!document.hidden)draw(state.time+dt);request=requestAnimationFrame(tick);}
 addEventListener('pagehide',()=>{cancelAnimationFrame(request);});
 addEventListener('pageshow',e=>{if(e.persisted){state.last=performance.now();request=requestAnimationFrame(tick);}});
 draw(0);request=requestAnimationFrame(tick);
}catch(e){document.querySelector('#error').textContent=e.message;}
</script></html>`);
await writeFile(folder+'/README.md',`# Morwenna — Embercourt ambient preview

The approved rubble-and-mist painting remains anchored. Fresh independent cloud and mist textures drift in one direction, gently expand, then fade fully before resetting. Bright violet pulses and fine sparks travel down the puppet strings, with veil wisps and soft ember light around the Matriarch. Thin low mist ribbons and sparse tumbling ash move through the foreground to give the courtyard depth. Every layer shares the same seamless loop; foreground atmosphere can be switched off independently.

## Files

- arena.png — approved painting, copied without modification from ../morwenna-ember-court-v2/arena-rubble-mist.png.
- storm-clouds.png — four independently painted charcoal-violet cloud banks with real alpha.
- courtyard-mist.png — four distinct thin gray-violet mist formations with real alpha.
- atmosphere-prompts.json — exact prompts used with the built-in image_gen tool.
- scene.js — renderer copied from ../../src/modules/MorwennaArenaRenderer.js, shared with the live raid.
- index.html — responsive preview with pause, scrub and independent atmosphere/light controls.
- verification.json — pixel seam, movement, static negative control, protected detail and alpha checks.

## Reproduce

From the repository root, run node build-tools/preview-morwenna-arena.mjs, then node build-tools/verify-morwenna-arena.mjs. The preview server serves only the output directory on port 4175 (python -m http.server 4175 --bind 127.0.0.1 --directory output). Set MORWENNA_PREVIEW_URL to use another local preview URL.

The renderer uses a deterministic 24-second cycle. Each moving texture has a staggered lifetime and a zero-opacity reset. No raiders or battle effects are painted into the artwork. The same renderer and bundled artwork are used beneath the native live raid interface.
`);
console.log('Morwenna preview: http://127.0.0.1:4175/morwenna-arena/');
