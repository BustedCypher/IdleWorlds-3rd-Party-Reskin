import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const version=process.argv[2]||'compact-v1';
const dir=resolve(root,`assets/skills-ui/buttons/${version}`);
const index=JSON.parse(await readFile(resolve(dir,'index.json')));
const entry=index.entries.find(e=>e.key==='text-idle');
const icon=index.entries.find(e=>e.key==='icon-idle');
const cap=index.textCapWidth, middle=entry.width-2*cap;
const percent=(value,total)=>`${100*value/total}%`;
const scope=`html[data-iw-compact-atlas="${version}"]`;
const geometry=`${scope} {
  --iw-compact-mid-size: ${percent(index.width,middle)} ${percent(index.height,entry.height)};
  --iw-compact-mid-x: ${percent(entry.x+cap,index.width-middle)};
  --iw-compact-cap-size: ${percent(index.width,cap)} ${percent(index.height,entry.height)};
  --iw-compact-left-x: ${percent(entry.x,index.width-cap)};
  --iw-compact-right-x: ${percent(entry.x+entry.width-cap,index.width-cap)};
  --iw-compact-icon-size: ${percent(index.width,icon.width)} ${percent(index.height,icon.height)};
  --iw-compact-icon-x: ${percent(icon.x,index.width-icon.width)};
}
${index.states.map(state=>{
  const e=index.entries.find(e=>e.key===`text-${state}`);
  return `${scope} [data-iw-compact-layer="${state}"] { --iw-compact-y: ${percent(e.y,index.height-e.height)}; }`;
}).join('\n')}`;
const cssPath=resolve(root,'src/styles/compact-buttons.css');
let compactCss=await readFile(cssPath,'utf8');
compactCss=compactCss.replace(/\/\* COMPACT_GEOMETRY \*\/[\s\S]*?(?=\n\nhtml\[data-iw-compact-atlas="[^"]+"\] \[data-iw-compact-button\] >)/,
  `/* COMPACT_GEOMETRY */\n${geometry}`);
await writeFile(cssPath,compactCss);

const sheets=['base','header','inventory','skillpanel','tooltip-engine','overlay','ui-system'];
const css=(await Promise.all(sheets.map(n=>readFile(resolve(root,`src/styles/${n}.css`),'utf8')))).join('\n')+'\n'+compactCss;
const renderer=(await readFile(resolve(root,'src/modules/CompactButtons.js'),'utf8')).replaceAll('export function','function');
const names={ 'forged-metal':'Forged Iron','infernal':'Infernal','glacial':'Glacial','celestial':'Celestial','lunar-spectral':'Lunar Spectral','runic-arcane':'Runic Arcane','tempest-oceanic':'Tempest Oceanic','verdant':'Verdant','voidborn':'Voidborn'};
const iconSvg='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>';
const control=(text,attrs='')=>`<button type="button" ${attrs}>${text}</button>`;
const rowActions=['Use','List','Equip','Equipped','✦ Set Bonus'].map((s,i)=>control(s,`data-fs-preserved-action="control" data-fs-action-kind="${['secondary','secondary','equip','equipped','set'][i]}"`)).join('')+control(iconSvg,'data-fs-preserved-action="control" data-fs-action-kind="icon" aria-label="Lock item"');
const presentation=version==='compact-ghost-v3'?{title:'Ghost Metal controls',heading:'Barely there. Clear when needed.'}:version==='compact-quiet-v2'?{title:'Quiet Metal controls',heading:'Small frames. Full character.'}:{title:'Compact controls',heading:'Small frames. Full character.'};
const html=`<!doctype html><html lang="en" data-iw-zone-theme="tempest-oceanic" data-iw-compact-atlas="${version}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${presentation.title} · IdleWorlds</title>
<style>${css.replaceAll("url('../assets/","url('../../../")}</style>
<style>
*{box-sizing:border-box}body{margin:0!important;background:#080d10!important;color:#eee6d5!important;font:14px/1.5 Arial,sans-serif!important;padding:40px!important}main{max-width:1120px;margin:auto}h1{font:500 32px Georgia;margin:0 0 8px;color:#eee6d5}p{color:#9ca9af;margin:0 0 24px}.eyebrow{color:#6fbdc9;font-size:10px;letter-spacing:.2em;text-transform:uppercase;margin-bottom:12px}.themes{display:flex;flex-wrap:wrap;gap:7px;margin:24px 0}.theme-choice{font:12px Arial!important;color:#9ca9af!important;padding:9px 12px!important;border:1px solid #2c393d!important;background:#10191d!important;border-radius:4px!important;cursor:pointer}.theme-choice[aria-pressed="true"]{color:#f7efdd!important;border-color:#69c4d1!important}.demo{padding:24px;border:1px solid #27363c;background:linear-gradient(140deg,#111a1e,#080c0e);border-radius:12px;margin-bottom:18px}.demo h2{font:11px Arial;color:#88a0aa;letter-spacing:.13em;text-transform:uppercase;margin:0 0 18px}.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}.row:last-child{margin-bottom:0}.row button{cursor:pointer;flex-shrink:0}.native-small{height:26px;padding:0 10px;color:#d6d7cc;background:#101619;border:1px solid #27363c;border-radius:2px}.loadouts{display:inline-flex;gap:3px;padding:3px;border:1px solid #25343a;border-radius:4px}.loadouts button{width:26px;height:26px;padding:0}.count{color:#6da6b1;font:12px Georgia;margin:0 12px}.states{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.state-label{font:11px Arial;letter-spacing:.12em;text-transform:uppercase;color:#8da3ad;margin-bottom:14px}.states .demo{pointer-events:none}.states button{height:44px;padding:0 24px;font:600 13px Arial;color:#eee6d5;background:transparent;border:0}.states [data-iw-compact-button="icon"]{width:44px;padding:0}.states [data-force="hover"] [data-iw-compact-layer="hover"],.states [data-force="clicked"] [data-iw-compact-layer="clicked"]{opacity:1!important}.states [data-force="idle"] [data-iw-compact-layer]:not([data-iw-compact-layer="idle"]){opacity:0!important}.atlas{max-width:672px;width:100%;display:block;margin-top:20px}.caption{font-size:12px;color:#7d939d;margin-top:12px}a.download{color:#8bc6ce}footer{margin-top:32px;color:#607c86;font-size:12px}@media(max-width:760px){body{padding:20px!important}.states{grid-template-columns:1fr}.demo{padding:18px}}
</style>
<main><div class="eyebrow">IdleWorlds · Secondary controls</div><h1>${presentation.heading}</h1><p>Hover, focus, or hold any control to try the transitions. Each theme has its own six-sprite atlas.</p>
<div class="themes">${index.themes.map(t=>`<button class="theme-choice" data-theme="${t}" aria-pressed="${t==='tempest-oceanic'}">${names[t]}</button>`).join('')}</div>
<section class="demo"><h2>Navigation</h2><div class="row">${['Game','Market','Leaderboards','Village','Dungeon'].map((s,i)=>control(s,`data-iw-ui="nav-tab" ${i?'':'data-iw-state="active"'}`)).join('')}<a href="#" data-iw-ui="nav-tab" data-iw-nav-link="toolkit">Toolkit</a></div></section>
<section class="demo"><h2>Inventory</h2><div data-iw-inventory-root="1" style="display:contents"><div class="row filters">${['All','Gear','Materials','Consumables','Drops'].map((s,i)=>control(s,`data-iw-inventory-control="filter" ${i?'':'data-iw-inventory-filter-state="active"'}`)).join('')}</div><div class="row">${control('Prev','data-iw-inventory-control="page" disabled')}<span class="count">1 / 48</span>${control('Next','data-iw-inventory-control="page"')}</div><div class="row">${rowActions}</div></div></section>
<section class="demo"><h2>Loadouts, zone controls &amp; chat</h2><div class="row"><div class="loadouts">${control('I','class="native-small" aria-pressed="true"')}${control('II','class="native-small" aria-pressed="false"')}</div><span class="count">ZONE 17</span><div class="row" style="margin:0">${control('Change Zone','class="native-small"')}${control('⏱','class="native-small" aria-label="Zone timer"')}</div>${control('Send','data-iw-panel-part="send"')}</div></section>
<div class="states">${index.states.map(s=>`<section class="demo" data-force="${s}"><div class="state-label">${s==='clicked'?'Pressed':s}</div><div class="row">${control('Button label','data-iw-inventory-control="page"')}${control(iconSvg,'data-fs-preserved-action="control" data-fs-action-kind="icon" aria-label="Lock"')}</div></section>`).join('')}</div>
<details><summary>View the separate atlas</summary><img id="atlas" class="atlas" src="tempest-oceanic.png" alt="Six sprites: text and square controls in idle, hover and pressed states"><p class="caption">Top: idle · Middle: hover · Bottom: pressed. Transparent canvas, identical state bounds.</p><a id="download" class="download" href="tempest-oceanic.png" download>Download this theme’s atlas</a></details>
<footer>180 ms hover blend · 70 ms press response · Reduced-motion preferences respected. Preview controls do not send messages or alter the game.</footer></main>
<script>${renderer}
function choose(theme){document.documentElement.dataset.iwZoneTheme=theme;document.documentElement.style.setProperty('--iw-compact-atlas','url("'+theme+'.png")');document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.theme===theme));document.getElementById('atlas').src=theme+'.png';document.getElementById('download').href=theme+'.png'}
choose('tempest-oceanic');decorateCompactButtons();
document.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.theme)));
document.querySelectorAll('.filters button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.filters button').forEach(p=>p.removeAttribute('data-iw-inventory-filter-state'));b.dataset.iwInventoryFilterState='active'}));
document.querySelectorAll('.loadouts button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.loadouts button').forEach(p=>p.setAttribute('aria-pressed',p===b));decorateCompactButtons()}));
document.querySelector('[data-iw-nav-link]').addEventListener('click',e=>e.preventDefault());
</script></html>`;
await writeFile(resolve(dir,'preview.html'),html);
console.log('Compact atlas geometry and interactive preview generated.');
