import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base='assets/raids/ashmaw/sprites-v2';
const manifest=JSON.parse(await readFile(`${base}/sprites.json`,'utf8'));
await mkdir('output/ashmaw-sprites-v2',{recursive:true});
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ashmaw · 24-frame Sprite Animation</title>
<style>
*{box-sizing:border-box}body{background:#111015;color:#eee4d6;margin:0;padding:28px;font:15px system-ui}h1{font:32px Georgia;margin:0 0 8px}.intro{color:#b7aa9a;margin:0 0 22px}.toolbar{display:flex;gap:16px;align-items:center;margin-bottom:24px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.grid.large{grid-template-columns:1fr;max-width:1600px;margin:auto}article{min-width:0;border:1px solid #51402e;padding:16px;border-radius:8px;background:#1b1820}canvas{display:block;width:100%;aspect-ratio:1.5;background:radial-gradient(ellipse,#33202b,#17151c)}h2{font:22px Georgia;margin:4px 0 12px}.tools{display:flex;align-items:center;gap:14px;margin-top:16px;flex-wrap:wrap}button,select{background:#4a291c;color:#fff1de;border:1px solid #ae6842;border-radius:4px;padding:8px 14px;cursor:pointer}.label{color:#c3aa92;font-size:13px}input{accent-color:#d68844;flex:1;min-width:110px}a{color:#efa773;text-decoration:none}.files{font-size:13px;margin-left:auto}small{color:#bfa38a}.error{color:#ffba96}@media(max-width:760px){body{padding:16px}.grid{grid-template-columns:1fr}.files{margin-left:0}}
</style>
<h1>Ashmaw · Sprite Animation</h1><p class="intro">24 unique frames per loop · 1536 × 1024 per frame · Consistent scale and lava-crack artwork</p>
<div class="toolbar"><label>Playback <select id="speed"><option value=".5">½ speed · 12 fps</option><option value="1" selected>Normal · 24 fps</option><option value="1.25">Fast · 30 fps</option></select></label><button id="large">Large view</button><small>Pause and scrub to inspect individual frames.</small></div>
<div class="grid"><article><h2>Idle</h2><canvas data-animation="idle"></canvas><div class="tools"><button data-toggle="idle">Pause</button><input type="range" min="0" max="23" value="0" aria-label="Idle frame" data-scrub="idle"><span class="label" data-label="idle">Loading…</span><a class="files" href="../../${base}/idle-24.png" download>PNG sheet ↗</a></div></article>
<article><h2>Fire breath</h2><canvas data-animation="fireBreath"></canvas><div class="tools"><button data-toggle="fireBreath">Pause</button><input type="range" min="0" max="23" value="0" aria-label="Fire breath frame" data-scrub="fireBreath"><span class="label" data-label="fireBreath">Loading…</span><a class="files" href="../../${base}/fire-breath-24.png" download>PNG sheet ↗</a></div></article></div>
<p class="error" id="error"></p>
<script>
const config=${JSON.stringify(manifest)},players={};window.spriteConfig=config;window.spritePlayers=players;
let speed=1;document.querySelector('#speed').onchange=e=>speed=Number(e.target.value);
document.querySelector('#large').onclick=e=>{const expanded=document.querySelector('.grid').classList.toggle('large');e.target.textContent=expanded?'Side-by-side view':'Large view';};
const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Unable to load '+src));i.src=src;});
for(const [name,a] of Object.entries(config.animations)){
 load('../../${base}/'+a.file).then(img=>{
  const canvas=document.querySelector('[data-animation="'+name+'"]'),ctx=canvas.getContext('2d');
  canvas.width=config.cellWidth;canvas.height=config.cellHeight;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const toggle=document.querySelector('[data-toggle="'+name+'"]'),scrub=document.querySelector('[data-scrub="'+name+'"]');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const state=players[name]={paused:motion.matches,frame:0,time:0,last:performance.now(),draw};
  function draw(frame){const f=a.frames[frame];state.frame=frame;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,f.x,f.y,f.width,f.height,0,0,f.width,f.height);scrub.value=frame;document.querySelector('[data-label="'+name+'"]').textContent=(frame+1)+' / '+a.frameCount;}
  function tick(now){const delta=Math.min(100,Math.max(0,now-state.last));state.last=now;if(!state.paused&&!document.hidden){state.time+=delta*speed;const frame=a.sequence[Math.floor(state.time/a.frameMilliseconds)%a.sequence.length];if(frame!==state.frame)draw(frame);}requestAnimationFrame(tick);}
  toggle.textContent=state.paused?'Play':'Pause';toggle.onclick=()=>{state.paused=!state.paused;state.time=state.frame*a.frameMilliseconds;toggle.textContent=state.paused?'Play':'Pause';};
  scrub.oninput=()=>{state.paused=true;toggle.textContent='Play';state.time=Number(scrub.value)*a.frameMilliseconds;draw(Number(scrub.value));};
  draw(0);requestAnimationFrame(tick);
 }).catch(e=>document.querySelector('#error').textContent=e.message);
}
</script></html>`;
await writeFile('output/ashmaw-sprites-v2/index.html',html);
// Keep the user's already-open URL current, while retaining a versioned link.
await writeFile('output/ashmaw-sprites/index.html',html);
console.log('Updated http://127.0.0.1:4175/output/ashmaw-sprites/ with 24-frame playback.');
