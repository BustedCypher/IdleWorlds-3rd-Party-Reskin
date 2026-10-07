import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
const folder='output/ashmaw-raid-interface';await mkdir(folder,{recursive:true});
await copyFile('build-tools/ashmaw-raid-overlay.css',folder+'/raid-overlay.css');
const css=await readFile('build-tools/ashmaw-raid-overlay.css','utf8');
await writeFile(folder+'/index.html',`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ashmaw · Raid Interface Study</title><style>${css}</style></head>
<body><main><header class="study-head"><div><p class="eyebrow">Raid dungeon · Interface study</p><h1>Ashmaw, the Cinder Tyrant</h1><p>BustedCypher’s Pickup Group · 1 / 8 players</p></div><a href="../ashmaw-arena/">Arena only ↗</a></header>
<div class="frame"><div class="arena-stage">
<canvas aria-label="Animated volcanic arena with Ashmaw on a distant ledge"></canvas>
<section class="raid-overlay" aria-label="Raid encounter interface" id="raid-overlay">
<div class="raid-top"><div class="boss-title"><span class="boss-seal" aria-hidden="true"><svg viewBox="0 0 24 30"><path d="M13 1c2 7-5 8-4 14 2-1 3-3 3-5 7 5 10 9 8 14-2 6-13 7-17 1-3-5 0-10 4-13-1 6 0 8 2 8-4-8 8-11 4-19Z"/></svg></span><div><span class="eyebrow">The Cinder Tyrant</span><h2>Ashmaw</h2></div></div>
<div class="boss-meta"><span>Normal encounter</span><span>1 / 1 standing</span></div>
<div class="hp-track" role="progressbar" aria-label="Ashmaw health" aria-valuemin="0" aria-valuemax="13650" aria-valuenow="10352"><div class="hp-fill"></div></div><p class="boss-hp">10,352 / 13,650 HP</p>
<div class="cast-panel glass"><div class="cast-row"><strong>Claw Rake</strong><span>in 10 s</span></div><p>Single target · BustedCypher</p><div class="cast-track" aria-hidden="true"><i></i></div></div>
<div class="raid-skill-line"><button class="skill-button" id="skills" aria-expanded="false" aria-controls="skill-drawer">Raid skills ▾</button><span class="resist">Fire resistance <strong>9 / 60</strong></span></div>
<div class="skill-drawer glass" id="skill-drawer" hidden><header><strong>Raid skills</strong><span>1 contributor</span></header><p><strong>BustedCypher</strong> · Jewelcrafting</p><p>Ward: +9 fire resistance</p><p>Gear 0 + Ward 9 · 51 below recommended</p></div></div>
<div class="raid-bottom"><details class="combat-log glass" id="combat-log"><summary><span class="log-heading"><span>Combat log</span><span>Expand +</span></span><span class="log-latest"><b>Claw Rake</b> hits BustedCypher for 1,552.</span></summary><ol class="log-history"><li><time>00:32</time>Ward grants +9 fire resistance.</li><li><time>00:36</time>BustedCypher deals 3,298 damage to Ashmaw.</li><li><time>00:42</time>Ashmaw prepares Claw Rake.</li></ol></details>
<section class="player-card glass" aria-label="Your raider status"><div class="player-heading"><span>Your raider</span><span class="alive">Standing</span></div><div class="player-name">BustedCypher</div><p>Jewelcrafting · Ward active</p><div class="player-bars"><div><div class="player-stat"><span>Health</span><span>2,548 / 4,100</span></div><div class="mini-track" role="progressbar" aria-label="Your health" aria-valuemin="0" aria-valuemax="4100" aria-valuenow="2548"><i class="player-health"></i></div></div><div><div class="player-stat"><span>Action charge</span><span>72%</span></div><div class="mini-track" role="progressbar" aria-label="Action charge" aria-valuemin="0" aria-valuemax="100" aria-valuenow="72"><i class="player-charge"></i></div></div></div></section></div>
</section></div>
<div class="tools"><button id="overlay-toggle" aria-pressed="true" aria-controls="raid-overlay">Raid interface on</button><button id="pause">Pause scene</button><input id="scrub" aria-label="Scene time" type="range" min="0" max="480" value="0"><span class="time" id="time">0.00 s</span><a href="../ashmaw-arena/ashmaw-arena-ambient-loop.webm" download>Download background loop ↗</a></div></div>
<p class="error" id="error"></p><p class="note">Standalone interface experiment with sample encounter values. The interface is a separate HTML layer; no live game data is connected. Battle effects remain disabled.<a href="../ashmaw-arena/arena-painterly.png">View the painting</a></p></main>
<script type="module">
import {createArenaScene} from '../ashmaw-arena/scene.js?v=ambient-4';
const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Unable to load '+src));i.src=src;});
const canvas=document.querySelector('canvas'),pause=document.querySelector('#pause'),scrub=document.querySelector('#scrub'),time=document.querySelector('#time');
const overlay=document.querySelector('#raid-overlay'),toggle=document.querySelector('#overlay-toggle'),skills=document.querySelector('#skills'),drawer=document.querySelector('#skill-drawer');
toggle.onclick=()=>{overlay.hidden=!overlay.hidden;toggle.setAttribute('aria-pressed',String(!overlay.hidden));toggle.textContent=overlay.hidden?'Raid interface off':'Raid interface on';};
skills.onclick=()=>{drawer.hidden=!drawer.hidden;skills.setAttribute('aria-expanded',String(!drawer.hidden));skills.textContent=drawer.hidden?'Raid skills ▾':'Raid skills ▴';};
try{
 const [background,smoke]=await Promise.all([load('../ashmaw-arena/arena-painterly.png'),load('../../assets/raids/ashmaw/portrait/smoke.png')]);
 const renderer=window.arenaRenderer=createArenaScene(canvas,{background,smoke});
 const state=window.arenaPlayer={paused:matchMedia('(prefers-reduced-motion:reduce)').matches,time:0,last:performance.now(),draw};
 function draw(t){state.time=t;const cue=renderer.render(t);scrub.value=Math.round(cue.t*30);time.textContent=cue.t.toFixed(2)+' s';}
 pause.textContent=state.paused?'Play scene':'Pause scene';pause.onclick=()=>{state.paused=!state.paused;pause.textContent=state.paused?'Play scene':'Pause scene';};
 scrub.oninput=()=>{state.paused=true;pause.textContent='Play scene';draw(Number(scrub.value)/30);};
 function tick(now){const dt=Math.min(.1,Math.max(0,(now-state.last)/1000));state.last=now;if(!state.paused&&!document.hidden)draw(state.time+dt);requestAnimationFrame(tick);}
 draw(0);requestAnimationFrame(tick);
}catch(e){document.querySelector('#error').textContent=e.message;}
</script></body></html>`);
console.log('Raid interface study: http://127.0.0.1:4175/output/ashmaw-raid-interface/');
