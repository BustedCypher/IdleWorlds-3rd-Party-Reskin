import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve(import.meta.dirname,'../assets/skills-ui/buttons/revised-v5');
const index=JSON.parse(await readFile(resolve(dir,'index.json')));
const names={'forged-metal':'Forged Iron',infernal:'Infernal',glacial:'Glacial',celestial:'Celestial','lunar-spectral':'Lunar Spectral','runic-arcane':'Runic Arcane','tempest-oceanic':'Tempest Oceanic',verdant:'Verdant',voidborn:'Voidborn'};
function paint(theme,key){
  const e=index.entries.find(e=>e.key===key);
  return `url('${theme}.png') ${100*e.x/(index.width-e.width)}% ${100*e.y/(index.height-e.height)}% / ${100*index.width/e.width}% ${100*index.height/e.height}% no-repeat`;
}
function controls(theme,state='live',small=false){
  return `<div class="trio ${state} ${small?'small':''}">${['chevron-prev','action','chevron-next'].map(kind=>`<button aria-label="${kind==='action'?'Fight':kind==='chevron-prev'?'Previous':'Next'}" class="control ${kind==='action'?'action':'chevron'}" style="--idle:${paint(theme,kind+'-idle')};--hover:${paint(theme,kind+'-hover')};--pressed:${paint(theme,kind+'-clicked')}">${kind==='action'?'FIGHT':''}</button>`).join('')}</div>`;
}
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Revised button atlas</title>
<style>
:root{font:15px system-ui,sans-serif;color:#e7e4df;background:#100f13;color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:32px 24px 60px}main{max-width:950px;margin:auto}h1{font-size:26px;margin:0 0 8px}p{color:#a9a5ad;margin:6px 0 24px;line-height:1.6}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.tab{font:inherit;background:#211e26;border:1px solid #39333f;padding:10px 18px;border-radius:6px;cursor:pointer}.tab[aria-selected=true]{color:#f7d9a3;border-color:#b99861;background:#30271e}.theme[hidden]{display:none}.sheet{background:#18161c;border:1px solid #312d36;border-radius:12px;padding:24px}.label{color:#b0a9b8;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin:16px 0 8px}.trio{display:flex;align-items:center;justify-content:center;gap:10px;max-width:100%;margin-bottom:16px}.control{display:flex;align-items:center;justify-content:center;border:0;padding:0;background:var(--idle);color:#f5e7cb;text-shadow:0 1px 3px #000,0 1px 8px #000;font:700 16px Georgia,serif;letter-spacing:.07em;cursor:pointer;flex-shrink:0}.control:focus-visible{outline:2px solid #fff;outline-offset:4px}.action{width:528px;height:150px}.chevron{width:90px;height:150px}.hover .control{background:var(--hover)}.clicked .control{background:var(--pressed)}.small .action{width:155px;height:44px;font:700 12px Arial,sans-serif}.small .chevron{width:26px;height:44px}.small{gap:5px;margin:12px auto 28px}footer{margin-top:22px;font-size:13px;color:#96909f}a{color:#dfc494}@media(max-width:820px){.action{width:352px;height:100px}.chevron{width:60px;height:100px}.control{font-size:12px}.sheet{padding:12px}}@media(max-width:590px){body{padding:20px 10px}.action{width:211.2px;height:60px}.chevron{width:36px;height:60px}.trio{gap:4px}.control{font-size:11px}}

.live .control{position:relative;isolation:isolate}
.live .control::before,.live .control::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:0;transition:opacity 180ms ease-out}
.live .control::before{background:var(--hover)}
.live .control::after{background:var(--pressed);transition-duration:70ms}
.live .control:is(:hover,:focus-visible,:active)::before,.live .control:active::after{opacity:1}
@media(prefers-reduced-motion:reduce){.live .control::before,.live .control::after{transition:none}}
</style><main><h1>Revised button atlas</h1><p>Clean idle, energized hover, and a distinct pressed state. Try the small buttons at their in-game size, with smooth hover and press transitions. The large rows show the artwork in detail.</p>
<nav class="tabs" aria-label="Theme">${index.themes.map((t,i)=>`<button class="tab" data-theme="${t}" aria-selected="${i===0}">${names[t]}</button>`).join('')}</nav>
${index.themes.map((t,i)=>`<section class="theme" id="${t}" ${i?'hidden':''}><div class="label">Interactive • in-game size</div>${controls(t,'live',true)}<div class="sheet">${['idle','hover','clicked'].map(s=>`<div class="label">${s==='clicked'?'Pressed':s}</div>${controls(t,s)}`).join('')}</div><footer><a href="${t}.png">Open transparent atlas</a> · 9 sprites · 1110 × 723 · identical state outlines</footer></section>`).join('')}
<footer>Four original main-button references supplied by you. Matching chevrons and five additional themes generated with the built-in image tool. All state silhouettes and sprite cells are registered to the idle shape.</footer></main><script>
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',String(t===button)));document.querySelectorAll('.theme').forEach(s=>s.hidden=s.id!==button.dataset.theme)}));
</script></html>`;
await writeFile(resolve(dir,'preview.html'),html);
console.log('Created revised-v5/preview.html');
