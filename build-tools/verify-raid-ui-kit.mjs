// Render and inspect the standalone design kit; not a live game verification.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'..'),kit=resolve(root,'assets/raids/ui-kit-v1'),out=resolve(root,'output/raid-ui-kit-v1');
await mkdir(out,{recursive:true});
const index=JSON.parse(await readFile(resolve(kit,'index.json'),'utf8'));
assert.equal(index.entries.length,24);assert(index.transparentFraction>.4);
for(const [i,a] of index.entries.entries()){
  assert(a.x>=0&&a.y>=0&&a.x+a.width<=index.width&&a.y+a.height<=index.height,`${a.name} outside atlas`);
  for(const b of index.entries.slice(i+1))assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${a.name} overlaps ${b.name}`);
}
// Fulfil every request from disk so verification needs no network access.
const url='http://raid-ui.local/assets/raids/ui-kit-v1/preview.html';
const browser=await chromium.launch({headless:true});const errors=[];const results=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.route('**/*',async route=>{try{const file=resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));if(!file.startsWith(root+sep))throw new Error('Invalid path');await stat(file);await route.fulfill({status:200,contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{await route.fulfill({status:404,body:'Not found'});}});
 for(const [view,w,h] of [['desktop',1648,1140],['tablet',1072,950],['portrait',816,1190],['mobile',414,1060]]){
  await page.setViewportSize({width:w,height:h});await page.goto(url);await page.locator('button[data-view='+view+']').click();await page.waitForFunction(()=>window.raidAtlas?.entries.length===24);await page.evaluate(()=>document.fonts.ready);
  const info=await page.evaluate(()=>{
   const scene=document.querySelector('.scene'),s=scene.getBoundingClientRect(),party=document.querySelector('.party').getBoundingClientRect(),hud=document.querySelector('.player-hud').getBoundingClientRect();
   const units=[...document.querySelectorAll('.unit')].map(u=>{const b=u.getBoundingClientRect();return {x:b.x-s.x,y:b.y-s.y,width:b.width,height:b.height,effects:u.querySelectorAll('.effect').length};});
   const effects=[...document.querySelectorAll('.effect')];const clipped=effects.filter(e=>{const a=e.getBoundingClientRect(),b=e.closest('.unit').getBoundingClientRect();return a.right>b.right+.5||a.bottom>b.bottom+.5;}).length;
   const name=document.querySelector('.boss h2').getBoundingClientRect(),hp=document.querySelector('.boss-health').getBoundingClientRect(),cast=document.querySelector('.boss-cast').getBoundingClientRect(),heading=document.querySelector('.party-heading').getBoundingClientRect();
   return {width:s.width,height:s.height,partyTop:party.y-s.y,hudCenter:hud.x+hud.width/2-s.x,bossNameCenter:name.x+name.width/2-s.x,bossBars:{hpHeight:hp.height,castHeight:cast.height,hpBottom:hp.bottom-s.y,castTop:cast.top-s.y,castBottom:cast.bottom-s.y,partyHeadingTop:heading.top-s.y},units,clipped,fonts:{cinzel:document.fonts.check('700 20px Cinzel'),barlow:document.fonts.check('600 12px Barlow')},overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(info.units.length,7);assert.equal(info.clipped,0,`${view} clips status icons`);assert(info.units.every(u=>u.width<=132.1&&u.height<=70),`${view}: raid cards grew`);assert(info.partyTop>info.height*(view==='mobile'?.4:.65),`${view}: party obscures encounter`);assert(Math.abs(info.hudCenter-info.width/2)<2,`${view}: HUD not centered`);assert(info.fonts.cinzel&&info.fonts.barlow);assert(!info.overflow,`${view}: horizontal page overflow`);
  if(view==='mobile'){assert(Math.abs(info.bossNameCenter-info.width/2)<1,'Mobile boss name not centered');assert(info.bossBars.hpHeight<=28&&info.bossBars.castHeight<=28,'Mobile boss bars not compact');assert(info.bossBars.hpBottom<=info.bossBars.castTop,'Mobile bars overlap');const gap=info.bossBars.partyHeadingTop-info.bossBars.castBottom;assert(gap>=0&&gap<=12,'Mobile boss bars not directly above raid frames');}
  await page.locator('.scene').screenshot({path:resolve(out,`${view}.png`)});results.push({view,...info});
 }
 await page.locator('#more-effects').click();const expanded=await page.evaluate(()=>[...document.querySelectorAll('.effect')].every(e=>{const a=e.getBoundingClientRect(),b=e.closest('.unit').getBoundingClientRect();return a.right<=b.right+.5&&a.bottom<=b.bottom+.5;}));assert(expanded,'Additional effects clipped instead of wrapping');
 await page.locator('#your-hp').fill('20');await page.locator('#your-hp').dispatchEvent('input');assert.equal(await page.locator('.unit.mine .unit-frame').getAttribute('data-sprite'),'unit-critical');
 assert.equal(await page.locator('.health b').innerText(),'20%');
 await page.locator('.unit').nth(1).click();assert.equal(await page.locator('.unit').nth(1).getAttribute('aria-pressed'),'true');
 const offline=await browser.newPage();await offline.goto(pathToFileURL(resolve(kit,'preview.html')).href);await offline.waitForFunction(()=>window.raidAtlas?.entries.length===24);await offline.evaluate(()=>document.fonts.ready);assert.equal(await offline.locator('.sprite-card').count(),24);assert(await offline.evaluate(()=>document.fonts.check('600 12px Barlow')));await offline.close();
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'verification.json'),JSON.stringify({atlas:{width:index.width,height:index.height,sprites:index.entries.length,transparentFraction:index.transparentFraction},results,expandedEffects:expanded,criticalState:true,selection:true,directFilePreview:true,errors},null,2)+'\n');
 console.log(JSON.stringify({sprites:index.entries.length,views:results.map(r=>({view:r.view,stage:`${r.width}x${r.height}`,partyTop:r.partyTop,unit:`${r.units[0].width}x${r.units[0].height}`,clipped:r.clipped})),expandedEffects:expanded,criticalState:true,selection:true,errors},null,2));
}finally{await browser.close();}
