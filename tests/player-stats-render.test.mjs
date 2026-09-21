import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT=resolve(import.meta.dirname,'..');
const overlayCss=(await readFile(resolve(ROOT,'src/styles/overlay.css'),'utf8')).replaceAll("url('../assets/","url('/assets/");
const PAGE=`<!doctype html><html><head><meta charset="utf-8"><style>
:root{--iw-th-edge:#76511f;--iw-th-ground-a:#17110b;--iw-th-ground-b:#090806;--iw-th-glow:#ffffff12;--iw-text:#ddd}
*{box-sizing:border-box}body{margin:0;color:#ddd;font-family:Arial,sans-serif}
.fixed{position:fixed}.inset-0{inset:0}.z-50{z-index:50}.panel{width:420px;margin:auto;padding:16px;background:#111}
.compact-panel{padding:12px}.row{display:flex;justify-content:space-between}.label{font-size:12px}.value{font-size:12px;font-weight:600}
${overlayCss}</style></head><body>
<div class="fixed inset-0 z-50" id="stats-scrim" style="display:flex;background:rgba(0,0,0,.65);backdrop-filter:blur(4px)">
 <div class="panel" id="stats-modal">
  <div><h2>Character Stats</h2><button>Close</button></div>
  <div class="compact-panel" id="lifetime">
   <p>Lifetime Stats</p>
   <div class="row"><p class="label">⚔️ Monsters Defeated</p><p class="value">12,345</p></div>
   <div class="row"><p class="label" id="wood-label" style="font-weight:700">🪓 Wood Chopped</p><p class="value">6,789</p></div>
   <div class="row"><p class="label">🧪 Potions Brewed</p><p class="value">321</p></div>
  </div>
 </div>
</div>
<p id="outside-wood" style="font-weight:700">Wood Chopped strategy notes</p>
<script type="module">import{frameOverlays,clearOverlayFramer}from'/src/modules/OverlayFramer.js';window.frameOverlays=frameOverlays;window.clearOverlayFramer=clearOverlayFramer;</script>
</body></html>`;
const MIME={'.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'};
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:800,height:700}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.origin!=='http://iw.test')return route.fulfill({status:404,body:''});
 if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:PAGE});
 try{
  const body=await readFile(resolve(ROOT,u.pathname.slice(1)));
  return route.fulfill({contentType:MIME[extname(u.pathname)]||'application/octet-stream',body});
 }catch{return route.fulfill({status:404,body:''});}
});
await page.goto('http://iw.test/',{waitUntil:'load'});
await page.waitForFunction(()=>typeof window.frameOverlays==='function');
const before=await page.evaluate(()=>({
 wood:getComputedStyle(document.getElementById('wood-label')).fontWeight,
 values:[...document.querySelectorAll('.value')].map(e=>getComputedStyle(e).fontWeight),
 outside:getComputedStyle(document.getElementById('outside-wood')).fontWeight
}));
assert.equal(before.wood,'700','negative control: screenshot anomaly starts bold');
assert.deepEqual(before.values,['600','600','600'],'native value fixture starts semibold');
await page.evaluate(()=>window.frameOverlays());
const after=await page.evaluate(()=>({
 content:document.getElementById('lifetime').dataset.iwOverlayContent||'',
 labels:[...document.querySelectorAll('#lifetime [data-iw-overlay-role="stat-label"]')].map(e=>getComputedStyle(e).fontWeight),
 values:[...document.querySelectorAll('#lifetime [data-iw-overlay-role="stat-value"]')].map(e=>getComputedStyle(e).fontWeight),
 outsideRole:document.getElementById('outside-wood').dataset.iwOverlayRole||'',
 outsideWeight:getComputedStyle(document.getElementById('outside-wood')).fontWeight
}));
assert.equal(after.content,'player-stats','Lifetime Stats surface is classified structurally');
assert.deepEqual(after.labels,['400','400','400'],'every stat label computes to normal weight');
assert.deepEqual(after.values,['700','700','700'],'every numeric stat value stays bold');
assert.equal(after.outsideRole,'','unrelated Wood Chopped prose is not role-tagged');
assert.equal(after.outsideWeight,'700','unrelated prose keeps its own weight');
await page.evaluate(()=>window.clearOverlayFramer());
const cleared=await page.evaluate(()=>({
 markers:document.querySelectorAll('[data-iw-overlay-content],[data-iw-overlay-role]').length,
 wood:getComputedStyle(document.getElementById('wood-label')).fontWeight,
 values:[...document.querySelectorAll('.value')].map(e=>getComputedStyle(e).fontWeight)
}));
assert.equal(cleared.markers,0,'teardown removes Player Stats semantic markers');
assert.equal(cleared.wood,'700','teardown restores the anomalous/native label weight');
assert.deepEqual(cleared.values,['600','600','600'],'teardown restores native value weights');
assert.equal(errors.length,0,'no page errors: '+errors.join(' | '));
await browser.close();
console.log('PASS player-stats-render');
