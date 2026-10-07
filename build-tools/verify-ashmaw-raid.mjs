import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch(),folder='output/ashmaw-raid-interface',errors=[];
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:4175/output/ashmaw-raid-interface/');await page.waitForFunction(()=>window.arenaPlayer);
 await page.evaluate(()=>{arenaPlayer.paused=true;arenaPlayer.draw(1.2);});
 const before=await page.locator('canvas').evaluate(c=>c.toDataURL());
 await page.locator('#overlay-toggle').click();assert.equal(await page.locator('#raid-overlay').isVisible(),false);
 assert.equal(await page.locator('#overlay-toggle').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('canvas').evaluate(c=>c.toDataURL()),before,'hiding the UI must not change background pixels');
 await page.locator('#overlay-toggle').click();assert.equal(await page.locator('#raid-overlay').isVisible(),true);
 await page.locator('#skills').click();assert.equal(await page.locator('#skill-drawer').isVisible(),true);
 assert.equal(await page.locator('#skills').getAttribute('aria-expanded'),'true');await page.locator('#skills').click();
 await page.locator('#combat-log summary').click();assert.equal(await page.locator('#combat-log').getAttribute('open'),'');await page.locator('#combat-log summary').click();
 const layouts=[];
 for(const width of [1500,1200,1100,1001,900,651,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>arenaPlayer.draw(1.2));
  const layout=await page.evaluate(()=>{
   const s=document.querySelector('.arena-stage').getBoundingClientRect(),f=document.querySelector('.frame').getBoundingClientRect();
   const bounds=[...document.querySelectorAll('.raid-top,.raid-bottom')].map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom};});
   return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,frame:{x:f.x,right:f.right},stage:{x:s.x,y:s.y,right:s.right,bottom:s.bottom},bounds};
  });if(layout.overflow){console.log(layout,await page.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})).filter(e=>e.right>innerWidth)));await page.screenshot({path:`${folder}/layout-debug.png`,fullPage:true});}
  assert.equal(layout.overflow,false,`no horizontal overflow at ${width}`);
  assert.ok(layout.stage.x>=layout.frame.x&&layout.stage.right<=layout.frame.right,`stage must fit the visible frame at ${width}`);
  for(const b of layout.bounds){assert.ok(b.x>=layout.stage.x&&b.right<=layout.stage.right+1&&b.y>=layout.stage.y&&b.bottom<=layout.stage.bottom+1,`UI must fit its stage at ${width}`);}
  assert.ok(layout.bounds[0].bottom<layout.bounds[1].y,`top and bottom UI must not overlap at ${width}`);
  layouts.push(layout);await page.screenshot({path:`${folder}/preview-${width}.png`,fullPage:true});
  await page.locator('#skills').click();await page.locator('#combat-log summary').click();
  const expanded=await page.evaluate(()=>{const top=document.querySelector('.raid-top').getBoundingClientRect(),bottom=document.querySelector('.raid-bottom').getBoundingClientRect(),cast=document.querySelector('.cast-panel').getBoundingClientRect();return {topBottom:top.bottom,bottomTop:bottom.top,castBottom:cast.bottom};});
  assert.ok(expanded.topBottom<expanded.bottomTop&&expanded.castBottom<expanded.bottomTop,`expanded panels must not collide at ${width}`);
  await page.locator('#skills').click();await page.locator('#combat-log summary').click();
 }
 await page.setViewportSize({width:1500,height:1000});await page.screenshot({path:`${folder}/preview.png`,fullPage:true});
 await page.locator('#skills').click();await page.locator('#combat-log summary').click();await page.screenshot({path:`${folder}/expanded.png`,fullPage:true});
 assert.deepEqual(errors,[]);await writeFile(`${folder}/verification.json`,JSON.stringify({backgroundPixelsUnchanged:true,overlayToggle:true,skillsDisclosure:true,combatLog:true,layouts,errors},null,2)+'\n');
 console.log('Separate raid layer, controls, unchanged background and responsive layouts verified.');
}finally{await browser.close();}
