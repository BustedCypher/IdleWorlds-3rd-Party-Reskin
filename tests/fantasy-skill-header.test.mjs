/** Clickable zone frame and edge arrows; CSS-only daily-info placement. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT=resolve(import.meta.dirname,'..');
const FIX=resolve(ROOT,'tests/fixtures/live-2026-10-16');
const script=(await build({entryPoints:[resolve(ROOT,'src/skins/fantasy/index.js')],bundle:true,write:false,format:'iife',globalName:'Fantasy',loader:{'.css':'text'},logLevel:'silent'})).outputFiles[0].text;
const panels=await readFile(resolve(FIX,'skills-quests.html'),'utf8');
const nav=`<div data-iw-chrome="nav">${['Game','Market','Village','Dungeon','Guild','Leaderboards'].map(name=>`<button data-iw-ui="nav-tab" data-iw-tab="${name.toLowerCase()}">${name}</button>`).join('')}</div>`;
const layers=['idle','hover','clicked'].map(state=>`<span aria-hidden="true" data-iw-compact-layer="${state}"></span>`).join('');
const zones=`<div data-iw-ui="zone-bar" data-iw-chrome="zone-bar" data-iw-header="zone-shell"><div data-iw-chrome="zone-text"><p class="flex items-center gap-1.5"><span data-iw-ui="zone-title">🧭 Zone 20: Astral Crucible</span><span id="zone-team" class="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" title="Blue team controls this zone"></span></p><p id="requirements">Next zone needs ATK 325 / DEF 332 (or Lv 81 in any skill)</p></div><div data-iw-chrome="zone-actions">${['zones','prev','next'].map(key=>`<button data-iw-ui="zone-action" data-iw-zone-action="${key}" data-iw-compact-button="text" id="native-${key}">${key==='zones'?'<span aria-hidden="true">🌐</span><span>Zones</span>':key==='prev'?'Previous Zone':'Next Zone'}${layers}</button>`).join('')}</div></div>`;
const shell=(id='shell')=>`<div data-iw-chrome="shell" id="${id}"><header>Player</header>${nav}${zones}<div class="iw-fixture">${panels}</div></div>`;
const html=contents=>`<!doctype html><html data-skin="fantasy" data-iw-zone-theme="voidborn" data-iw-compact-atlas="compact-ghost-v3"><head><meta charset="utf-8"><link rel="stylesheet" href="/game.css"><link rel="stylesheet" href="/reskin-bc/theme/fantasy.css"><style>body{margin:0}#root{max-width:1280px;padding:12px;margin:auto}.iw-fixture{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}@media(min-width:1280px){.iw-fixture{grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr)}}.wide{display:none}@media(min-width:1280px){.wide{display:block}.narrow{display:none}}</style></head><body><div id="root">${contents}</div></body></html>`;
const browser=await chromium.launch();
const errors=[];
async function settle(page){await page.waitForTimeout(130);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function open(width=390,contents=shell()){
  const page=await browser.newPage({viewport:{width,height:1100}});page.setDefaultTimeout(4000);
  page.on('pageerror',err=>errors.push(err.message));
  await page.route('http://iw.test/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/')return route.fulfill({contentType:'text/html',body:html(contents)});
    if(path==='/game.css'||path==='/reskin-bc/theme/fantasy.css')return route.fulfill({contentType:'text/css',body:await readFile(resolve(FIX,path==='/game.css'?'game.css':'port-fantasy.css'))});
    if(path.includes('/assets/')){try{return route.fulfill({body:await readFile(resolve(ROOT,'assets',path.split('/assets/')[1]))});}catch{}}
    return route.fulfill({status:404,body:''});
  });
  await page.goto('http://iw.test/');
  await page.evaluate(()=>{
    window.presses={};
    for(const b of document.querySelectorAll('[data-iw-zone-action]'))b.onclick=()=>presses[b.id]=(presses[b.id]||0)+1;
    for(const b of document.querySelectorAll('[data-iw-collapse]'))b.onclick=()=>{const p=b.closest('.panel');const collapsed=p.getAttribute('data-iw-collapsed')==='1';p.toggleAttribute('data-iw-collapsed',!collapsed);if(!collapsed)p.setAttribute('data-iw-collapsed','1');b.setAttribute('aria-expanded',String(collapsed));};
    window.nativeNodes=[...document.querySelectorAll('#root *')].map(el=>[el,el.parentElement]);
    window.before=document.querySelector('#root').innerHTML;
  });
  await page.addScriptTag({content:script});await page.evaluate(()=>Fantasy.start());await settle(page);return page;
}
const travel=page=>page.locator('[data-iw-fantasy-zone-travel]');
const control=(page,name)=>travel(page).getByRole('button',{name,exact:true});
try{
  const page=await open();
  assert.equal(await travel(page).count(),1,'zone travel appears over the zone frame');
  assert.equal(await page.locator('.panel [data-iw-fantasy-zone-travel]').count(),0,'Skill Actions no longer contains travel controls');
  assert.equal(await page.locator('[data-iw-chrome="zone-actions"]').isVisible(),false,'original artwork stays hidden');
  await control(page,'Previous Zone').focus();
  await page.keyboard.press('Tab');
  assert.equal(await control(page,'Zones').evaluate(el=>el.getRootNode().activeElement===el),true,'keyboard order follows previous, header picker, next');
  for(const name of ['Previous Zone','Zones','Next Zone'])await control(page,name).click();
  assert.deepEqual(await page.evaluate(()=>presses),{'native-prev':1,'native-zones':1,'native-next':1},'the new controls press each original action exactly once');
  await control(page,'Zones').focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>presses['native-zones']),3,'header supports Enter and Space');
  assert.equal(await page.evaluate(()=>nativeNodes.every(([el,parent])=>el.isConnected&&el.parentElement===parent)),true,'native gameplay nodes retain identity and parents');
  await page.evaluate(()=>{document.querySelector('#native-prev').disabled=true;document.querySelector('#native-next').title='Travel to Zone 21';});await settle(page);
  assert.equal(await control(page,'Previous Zone').isDisabled(),true);
  assert.equal(await control(page,'Next Zone').getAttribute('title'),'Travel to Zone 21');
  await page.evaluate(()=>{document.querySelector('[data-iw-skill-boost]').textContent='Daily XP Boost: Mining + Smithing + 20 % XP';});await settle(page);
  assert.match(await page.locator('[data-iw-skill-boost]').textContent(),/Mining/,'daily info stays live in its new visual position');
  for(const width of [320,390,540,768,769,1024,1400]){
    await page.setViewportSize({width,height:1100});await settle(page);
    assert.equal(await travel(page).isVisible(),true,`${width}px header travel remains available`);
    const title=await page.locator('[data-iw-ui="zone-title"]').boundingBox();
    const panel=await page.locator('[data-iw-chrome="zone-text"]').boundingBox();
    const group=await travel(page).boundingBox();
    assert.ok(Math.abs(group.x-panel.x)<.5&&Math.abs(group.width-panel.width)<.5,`${width}px travel spans the zone frame`);
    const previous=await control(page,'Previous Zone').boundingBox();
    const picker=await control(page,'Zones').boundingBox();
    const next=await control(page,'Next Zone').boundingBox();
    assert.ok(previous.x===group.x&&next.x+next.width<=group.x+group.width+.5&&picker.x>=previous.x+previous.width-.5&&picker.x+picker.width<=next.x+.5,`${width}px arrows flank the clickable header`);
    assert.ok(title.x>=picker.x-.5&&title.x+title.width<=picker.x+picker.width+.5,`${width}px title remains between the arrow targets`);
    await page.mouse.click(picker.x+picker.width/2,title.y+title.height/2);
    assert.ok(await page.evaluate(()=>presses['native-zones']>=4),'clicking the visible header text opens the native picker');
    const tabs=await page.locator('.iw-skill-tabs').boundingBox();
    const heading=await page.getByRole('heading',{name:'Skill Actions',exact:true}).boundingBox();
    assert.ok(tabs.y-heading.y-heading.height<38,`${width}px Skill Actions has no empty travel row`);
    const daily=await page.locator('[data-iw-skill-boost]').boundingBox();
    const sheet=await page.locator('.iw-skill-sheet').boundingBox();
    assert.ok(daily.y>=tabs.y+tabs.height-.5&&daily.y+daily.height<=sheet.y+.5,`${width}px daily info is beneath the skill-card grid`);
    for(const button of await travel(page).getByRole('button').all()){const r=await button.boundingBox();assert.ok(r.width>=44&&r.height>=44,`${width}px travel retains touch targets`);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px has no horizontal overflow`);
    assert.equal(await page.locator('[data-iw-chrome="zone-text"]').evaluate(el=>getComputedStyle(el).textAlign),'center');
    const frame=await page.locator('#shell').evaluate(el=>({background:getComputedStyle(el,'::before').backgroundImage,corners:getComputedStyle(el,'::after').borderImageSource}));
    assert.match(frame.background,/skills_panel_texture/,'the header uses the shared Fantasy frame ground');
    assert.notEqual(frame.corners,'none','the header uses the shared corner filigree');
    assert.equal(await page.locator('#zone-team').isVisible(),true,'zone team state remains visible');
    assert.equal(await page.locator('#zone-team').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),true,'native team tooltip remains reachable above the picker target');
    const team=await page.locator('#zone-team').boundingBox();
    assert.ok(team.y+team.height<=title.y+title.height+4,`${width}px team marker stays with the title rather than on its own row`);
  }
  await page.setViewportSize({width:390,height:1100});await settle(page);
  await page.getByRole('button',{name:'Collapse Skill Actions',exact:true}).click();await settle(page);
  assert.equal(await travel(page).isVisible(),true,'mobile header travel stays available when Skill Actions collapses');
  assert.equal(await page.locator('.iw-skill-tabs').isVisible(),false);
  assert.equal(await page.locator('[data-iw-skill-boost]').isVisible(),false,'the daily footer folds with the cards');
  await page.getByRole('button',{name:'Collapse Skill Actions',exact:true}).click();await settle(page);
  await page.evaluate(()=>Fantasy.stop());
  assert.equal(await page.locator('[data-iw-fantasy-zone-travel],[data-iw-fantasy-skill-header],[data-iw-fantasy-daily-info]').count(),0,'stop removes owned controls and layout markers');
  await page.close();

  const clean=await open(390);
  await clean.evaluate(()=>{window.mutations=0;window.probe=new MutationObserver(records=>mutations+=records.length);probe.observe(document.querySelector('#root'),{subtree:true,childList:true,attributes:true,characterData:true});});
  await clean.waitForTimeout(180);assert.equal(await clean.evaluate(()=>mutations),0,'settled layout does not write repeatedly');await clean.evaluate(()=>probe.disconnect());
  await clean.evaluate(()=>Fantasy.stop());assert.equal(await clean.evaluate(()=>document.querySelector('#root').innerHTML===before),true,'teardown restores the exact native markup');
  await clean.evaluate(()=>Fantasy.start());await settle(clean);await mkdir(resolve(ROOT,'tmp/thumb-dock'),{recursive:true});
  for(const width of [390,1400]){await clean.setViewportSize({width,height:1100});await settle(clean);await clean.screenshot({path:resolve(ROOT,`tmp/thumb-dock/skill-header-${width}.png`)});}
  await clean.close();

  const twins=await open(390,`<div class="wide">${shell('wide-shell')}</div><div class="narrow">${shell('narrow-shell')}</div>`);
  assert.equal(await travel(twins).evaluate(el=>el.closest('[data-iw-chrome="shell"]').id),'narrow-shell');
  await twins.setViewportSize({width:1400,height:1100});await settle(twins);
  assert.equal(await travel(twins).evaluate(el=>el.closest('[data-iw-chrome="shell"]').id),'wide-shell','the travel header follows the rendered column');
  await control(twins,'Zones').click();
  await twins.evaluate(()=>{const old=document.querySelector('#wide-shell [data-iw-chrome="zone-actions"]');const fresh=old.cloneNode(true);fresh.querySelector('[data-iw-zone-action="zones"]').onclick=()=>window.replacementPressed=true;old.replaceWith(fresh);});await settle(twins);
  await control(twins,'Zones').click();assert.equal(await twins.evaluate(()=>replacementPressed),true,'replaced source controls are resolved before activation');
  await twins.evaluate(()=>document.querySelector('#root').replaceChildren());await settle(twins);assert.equal(await travel(twins).count(),0,'source removal clears the owned header');await twins.close();
  const shared=await open(1024,shell('shared-shell').replace(zones,`<div class="wide">${zones}</div><div class="narrow">${zones}</div>`));
  await shared.evaluate(()=>{for(const b of document.querySelectorAll('[data-iw-zone-action="zones"]'))b.onclick=()=>window.pickedSource=b.closest('.wide,.narrow').className;});
  await control(shared,'Zones').click();assert.equal(await shared.evaluate(()=>pickedSource),'narrow','a rendered outer shell must not make its hidden source column eligible');
  await shared.setViewportSize({width:1400,height:1100});await settle(shared);await control(shared,'Zones').click();assert.equal(await shared.evaluate(()=>pickedSource),'wide');await shared.close();
  const fallback=await open(1024,shell().replace(nav,'<nav><button>Game</button><button>Market</button></nav>'));
  const fallbackText=await fallback.locator('[data-iw-chrome="zone-text"]').boundingBox();
  const fallbackTravel=await travel(fallback).boundingBox();
  assert.ok(Math.abs(fallbackText.y-fallbackTravel.y)<.5&&Math.abs(fallbackText.height-fallbackTravel.height)<.5,'travel stays anchored to the header when main navigation uses native fallback');
  await control(fallback,'Zones').click();assert.equal(await fallback.evaluate(()=>presses['native-zones']),1);await fallback.close();
  const extra=await open(390,shell().replace(nav,'<nav><button>Game</button><button>Market</button></nav>').replace('<p class="flex items-center gap-1.5">','<p class="flex items-center gap-1.5"><button id="extra-zone-link">Presence</button>'));
  assert.equal(await travel(extra).count(),0,'unknown interactive header content uses native travel rather than intercepting its clicks');
  assert.equal(await extra.locator('#native-zones').isVisible(),true,'native fallback travel stays available on mobile');
  await extra.locator('#extra-zone-link').click();
  await extra.setViewportSize({width:1024,height:1100});await settle(extra);
  assert.equal(await extra.locator('#native-zones').isVisible(),true,'native fallback travel is restored on desktop');await extra.close();
  assert.deepEqual(errors,[]);console.log('fantasy-skill-header: controls, daily placement, shared frames, state, responsive swaps and teardown PASS');
}finally{await browser.close();}
