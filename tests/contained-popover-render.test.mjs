import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT=resolve(import.meta.dirname,'..');
const css=(await Promise.all(['ui-system.css','inventory.css','overlay.css'].map(f=>readFile(resolve(ROOT,'src/styles',f),'utf8'))))
  .join('\n').replaceAll("url('../assets/","url('/assets/");
const PAGE=`<!doctype html><html><head><meta charset="utf-8"><style>
:root{--iw-th-edge:#76511f;--iw-th-ground-a:#17110b;--iw-th-ground-b:#090806;--iw-th-glow:#ffffff12;--iw-th-hairline:#9b6b2d;--iw-th-hairline-hi:#dba34e;--iw-text:#ddd7c8}
*,::before,::after{box-sizing:border-box}body{margin:0;background:#050505;color:#ddd}
${css}</style></head><body>
<div id="inventory" data-iw-inventory-root="1" style="width:420px;height:340px;margin:40px;padding:20px">
  <div id="tools" style="height:52px">
    <div id="anchor" class="relative" style="position:relative;margin-left:240px;width:40px;height:32px">
      <button aria-label="Filter inventory" title="Filter inventory" style="width:40px;height:30px">F</button>
      <div id="popup" class="absolute right-0 top-full z-30" style="position:absolute;right:0;top:100%;z-index:30;width:224px;height:180px;padding:12px;background:#101018">
        <p>Tier</p><button>All</button><button>18</button><p>Type</p><button>Weapon</button><button>Material</button>
      </div>
    </div>
  </div>
  <div id="list" data-iw-inventory-list="1" style="height:230px"><div style="height:100%;background:#26150e">Later inventory list</div></div>
</div>
<script type="module">import {frameOverlays,clearOverlayFramer} from '/src/modules/OverlayFramer.js';window.frameOverlays=frameOverlays;window.clearOverlayFramer=clearOverlayFramer;</script>
</body></html>`;
const MIME={'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:700,height:600}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.origin!=='http://iw.test')return route.abort();
 if(u.pathname==='/'||u.pathname.endsWith('.html'))return route.fulfill({contentType:'text/html',body:PAGE});
 try{const body=await readFile(resolve(ROOT,u.pathname.slice(1)));return route.fulfill({contentType:MIME[extname(u.pathname)]||'application/octet-stream',body});}
 catch{return route.fulfill({status:404,body:''});}
});
await page.goto('http://iw.test/',{waitUntil:'load'});
await page.waitForFunction(()=>typeof window.frameOverlays==='function');
const overlapPoint=await page.evaluate(()=>{
 const p=document.getElementById('popup').getBoundingClientRect(),l=document.getElementById('list').getBoundingClientRect();
 const left=Math.max(p.left,l.left),right=Math.min(p.right,l.right),top=Math.max(p.top,l.top),bottom=Math.min(p.bottom,l.bottom);
 if(right-left<10||bottom-top<10)throw new Error('fixture has no popup/list overlap');
 return{x:left+Math.min(30,(right-left)/2),y:top+Math.min(30,(bottom-top)/2)};
});
const before=await page.evaluate(pt=>{
 const top=document.elementFromPoint(pt.x,pt.y);return {id:top?.id||top?.closest?.('[id]')?.id||'',rootOverflow:getComputedStyle(document.getElementById('inventory')).overflow,
 toolsZ:getComputedStyle(document.getElementById('tools')).zIndex,listZ:getComputedStyle(document.getElementById('list')).zIndex};
},overlapPoint);
assert.notEqual(before.id,'popup','negative control: later z=1 list paints over the trapped popup before classification');

await page.evaluate(()=>window.frameOverlays());
const after=await page.evaluate(pt=>{
 const popup=document.getElementById('popup'),host=document.getElementById('tools'),root=document.getElementById('inventory');
 const top=document.elementFromPoint(pt.x,pt.y);const s=getComputedStyle(popup);
 return{popup:popup.dataset.iwOverlay,host:host.dataset.iwOverlayHost,topId:top?.id||top?.closest?.('#popup')?.id||'',
  rootOverflow:getComputedStyle(root).overflow,z:s.zIndex,border:s.borderTopWidth+' '+s.borderTopStyle+' '+s.borderTopColor,
  background:s.backgroundImage,shadow:s.boxShadow,color:s.color};
},overlapPoint);
assert.equal(after.popup,'popup','contained menu is classified');
assert.equal(after.host,'1','the direct frame child is lifted');
assert.equal(after.topId,'popup','popup is topmost at the overlap point');
assert.equal(after.rootOverflow,'visible','Inventory clipping is relaxed only while popup is open');
assert.equal(after.z,'21','popup receives the local overlay z-index');
assert.notEqual(after.border,'0px none rgb(221, 215, 200)','popup receives themed border chrome');
assert.match(after.background,/gradient|skills_panel_texture/,'popup receives themed background');
assert.notEqual(after.shadow,'none','popup receives overlay shadow');await page.evaluate(()=>{
 const popup=document.getElementById('popup');popup.style.display='none';window.frameOverlays();
});
const closed=await page.evaluate(()=>({
 popup:document.getElementById('popup').dataset.iwOverlay||'',
 host:document.getElementById('tools').dataset.iwOverlayHost||'',
 overflow:getComputedStyle(document.getElementById('inventory')).overflow
}));
assert.equal(closed.popup,'','closing removes popup marker');
assert.equal(closed.host,'','closing releases host marker');
assert.equal(closed.overflow,'hidden','Inventory clipping restores when popup closes');

await page.evaluate(()=>{document.getElementById('popup').style.display='block';window.frameOverlays();window.clearOverlayFramer();});
assert.equal(await page.locator('[data-iw-overlay],[data-iw-overlay-host]').count(),0,'teardown removes popup and host markers');
assert.equal(errors.length,0,'no page errors: '+errors.join(' | '));
await browser.close();
console.log('PASS contained-popover-render');