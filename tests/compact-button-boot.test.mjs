// Exercise the actual bundled startup and reactivation path. Do not inject
// source styles manually: that hid the missing compact stylesheet in production.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';

const root=resolve(import.meta.dirname,'..');
const bundle=await readFile(resolve(root,'dist/content.bundle.js'),'utf8');
const fixture=`<!doctype html><html><body>
<nav><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button></nav>
<div><p>Zone 19: Eternium Verge</p><div><button>Zones</button><button>Next Zone</button></div></div>
<h2>Inventory</h2><section aria-label="Inventory" id="inventory">
<div><button>All</button><button>Gear</button><button>Materials</button><button>Consumables</button><button>Drops</button></div>
<div><div class="compact-row"><div><span>Iron Sword</span><span>Lv 3</span></div><div>Tier 4 · Weapon</div><div>x1</div><button id="equip">Equip</button><button id="list">List</button><button id="lock" aria-label="Lock item"><svg width="14" height="14" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" d="M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4"/></svg></button></div></div>
<button>Next</button></section></body></html>`;
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1000,height:800},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const mime={'.png':'image/png','.webp':'image/webp','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='http://compact-boot.test')return route.abort();
  if(url.pathname==='/')return route.fulfill({body:fixture,contentType:'text/html'});
  if(!url.pathname.startsWith('/assets/'))return route.fulfill({status:404,body:''});
  try{return await route.fulfill({body:await readFile(resolve(root,'.'+url.pathname)),contentType:mime[extname(url.pathname)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
});
await page.addInitScript(()=>{
  const listeners=[],data={};
  window.chrome={runtime:{id:'compact-boot-test',getURL:p=>'http://compact-boot.test/'+p},storage:{local:{get:async key=>({[key]:data[key]}),set:async bag=>Object.assign(data,bag),remove:async key=>{delete data[key];}},onChanged:{addListener:fn=>listeners.push(fn),removeListener:fn=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);}}}};
  window.toggleSkin=enabled=>listeners.forEach(fn=>fn({'iw-skin-enabled':{newValue:enabled}},'local'));
});
try{
  await page.goto('http://compact-boot.test/');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addScriptTag({content:bundle});
  for(const phase of ['initial startup','disable/re-enable']){
    if(phase!=='initial startup'){
      await page.evaluate(()=>window.toggleSkin(false));
      assert.equal(await page.locator('style[data-iw-style]').count(),0);
      assert.equal(await page.locator('[data-iw-compact-layer]').count(),0);
      await page.evaluate(()=>window.toggleSkin(true));
    }
    await page.waitForFunction(()=>document.querySelector('#list')?.dataset.iwCompactButton==='text');
    const evidence=await page.evaluate(()=>({theme:document.documentElement.dataset.iwZoneTheme,atlas:document.documentElement.dataset.iwCompactAtlas,layers:document.querySelectorAll('#list [data-iw-compact-layer]').length,compactCss:document.querySelector('style[data-iw-style="ui-system"]')?.textContent.includes('[data-iw-compact-layer]')}));
    console.log(phase,evidence);
    assert.equal(evidence.compactCss,true,`${phase}: boot must inject compact artwork CSS, not just attach layers`);
    assert.equal(evidence.atlas,'compact-ghost-v3');assert.equal(evidence.layers,3);
    assert.equal(await page.locator('style[data-iw-style]').count(),7);
    for(const id of ['list','lock','equip']){
      const el=page.locator('#'+id);await page.mouse.move(950,750);await page.evaluate(()=>document.activeElement?.blur());
      const idle=el.locator('[data-iw-compact-layer="idle"]');
      assert.equal(await idle.evaluate(e=>getComputedStyle(e).display),'block');
      const image=await idle.evaluate(async e=>{const url=getComputedStyle(e).backgroundImage.match(/url\("?([^"\)]+)/)[1];const im=new Image();im.src=url;await im.decode();return [im.width,im.height];});
      assert.deepEqual(image,[672,392]);
      const box=await el.boundingBox(),before=await el.screenshot();
      await el.hover();const hover=await el.screenshot();
      assert.equal(await el.locator('[data-iw-compact-layer="hover"]').evaluate(e=>getComputedStyle(e).opacity),'1');
      await page.mouse.down();const pressed=await el.screenshot();await page.mouse.up();
      assert.notDeepEqual(before,hover);assert.notDeepEqual(hover,pressed);assert.deepEqual(await el.boundingBox(),box);
    }
  }
  await page.mouse.move(950,750);await mkdir(resolve(root,'tmp/compact-button-check'),{recursive:true});
  await page.locator('#inventory').screenshot({path:resolve(root,'tmp/compact-button-check/actual-bundle-inventory.png')});
  await page.evaluate(()=>window.toggleSkin(false));
  assert.deepEqual(errors,[]);
  console.log('PASS actual extension bundle: compact CSS, loaded atlas, visible states, stable bounds and reactivation');
}finally{await browser.close();}
