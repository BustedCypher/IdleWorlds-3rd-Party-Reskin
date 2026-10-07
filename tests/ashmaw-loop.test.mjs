import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const compiled=await build({entryPoints:['src/modules/AshmawScene.js'],bundle:true,write:false,format:'iife',globalName:'Ashmaw'});
const browser=await chromium.launch(),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});page.on('pageerror',e=>errors.push(String(e)));
 await page.route('https://scene.test/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/')return route.fulfill({contentType:'text/html',body:`<body><canvas id="scene"></canvas><script>${compiled.outputFiles[0].text}</script>`});
  return route.fulfill({contentType:'image/png',body:await readFile('assets/raids/ashmaw/'+pathname.slice(1))});
 });
 await page.goto('https://scene.test/');
 const result=await page.evaluate(async()=>{
  const load=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=src;});
  const [env,cloudAtlas,smokeAtlas,steamAtlas]=await Promise.all(['arena','clouds','furnace-smoke','steam'].map(n=>load('/'+n+'.png')));
  const c=document.querySelector('canvas'),r=Ashmaw.createAshmawRenderer(c,env,null,{cloudAtlas,smokeAtlas,steamAtlas,maxWidth:1440});
  const frame=t=>{r.render(t);return c.toDataURL();};
  const first=frame(0),end=frame(16),later=frame(3),next=frame(19);
  const pixels=t=>{r.render(t);return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
  const a=pixels(15.999),b=pixels(0);let total=0;
  for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);
  r.render(6.4,{battle:false});const ambient=c.toDataURL();r.render(6.4,{battle:true});const battlesDisabled=ambient===c.toDataURL();
  r.render(1,{ambient:false});const fixed= c.toDataURL();r.render(5,{ambient:false});const anchored=fixed===c.toDataURL();
  const disabled={cloudMotion:false,bossMotion:false,atmosphere:false,lava:false,eyeLight:false};
  const layers=Object.fromEntries(['cloudMotion','bossMotion','atmosphere'].map(key=>{r.render(1,{...disabled,[key]:true});const before=c.toDataURL();r.render(5,{...disabled,[key]:true});return [key,before!==c.toDataURL()];}));
  r.render(3);return {period:r.period,width:c.width,height:c.height,exact:first===end,repeat:later===next,moves:first!==later,seamMean:total/a.length,battlesDisabled,anchored,layers};
 });
 assert.equal(result.period,16);assert.equal(result.width,1440);assert.equal(result.height,720);
 assert.ok(result.exact&&result.repeat,'complete scene must repeat at its sixteen-second boundary');
 assert.ok(result.moves,'live scene must animate');assert.ok(result.seamMean<.2,'loop wrap must be continuous');
 assert.ok(result.battlesDisabled,'ambient scene must not trigger archived combat effects');assert.ok(result.anchored,'art must not morph or float');
 for(const [key,moves]of Object.entries(result.layers))assert.ok(moves,key+' custom layer must animate independently');
 await mkdir('output/ashmaw-live',{recursive:true});await page.screenshot({path:'output/ashmaw-live/renderer.png'});
 const integration=await browser.newPage({viewport:{width:1000,height:850}});integration.on('pageerror',e=>errors.push(String(e)));
 let failPainting=false,failSmoke=false;const assetRequests=new Set();
 const html=`<style>${await readFile('src/styles/guild.css','utf8')}body{margin:10px;background:#14110e;color:#ddd}.raid-battle-backdrop{padding:14px;width:960px}.raid-arena-floor{display:flex;gap:10px}.raid-readable-panel{padding:8px}button{color:inherit}</style>
  <div data-iw-guild="root"><h2>Raid Dungeon</h2><div class="raid-battle-backdrop" style="--raid-bg-image:url(boss-ashmaw.png)">
   <div data-iw-guild-role="boss-summary"><span>Ashmaw, the Cinder Tyrant</span><div><img alt="Ashmaw, the Cinder Tyrant" src=""></div><div id="hp" style="height:10px"><div style="width:50%;height:100%;background:#c44"></div></div><p id="hp-value">10,500 / 21,000 HP</p></div>
   <div data-iw-guild-role="telegraph" class="raid-readable-panel">Claw Rake in 10s</div>
   <div data-iw-guild-role="effects" class="raid-readable-panel"><button id="action">Raid skills</button><p>Ward active</p></div>
   <div class="raid-arena-floor"><button disabled>Raider status</button></div>
   <button data-iw-guild-role="combat-log">Combat Log</button><p data-iw-guild-role="status">Charging your action bar…</p>
  </div></div><script>window.clicks=0;document.querySelector('#action').onclick=()=>window.clicks++;window.chrome={runtime:{id:'fixture',getURL:p=>'https://art.scene.test/'+p}};</script>
  <script>${compiled.outputFiles[0].text}</script><script>Ashmaw.reconcileAshmawScene(document.querySelector('.raid-battle-backdrop'));</script>`;
 await integration.route('https://raid.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
 await integration.route('https://art.scene.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  assetRequests.add(name);
  if((failPainting&&name.endsWith('/arena.png'))||(failSmoke&&/\/(clouds|furnace-smoke|steam)\.png$/.test(name)))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:await readFile(name)});
 });
 await integration.goto('https://raid.test/');
 await integration.waitForSelector('[data-iw-ashmaw-art][data-iw-animated]',{timeout:10000});
 for(const asset of ['clouds','furnace-smoke','steam'])assert.ok(assetRequests.has('assets/raids/ashmaw/'+asset+'.png'),'live raid loads approved custom '+asset+' atlas');
 assert.ok(!assetRequests.has('assets/raids/ashmaw/smoke.png'),'live raid stops reusing the original single smoke image');
 await integration.locator('#action').click();assert.equal(await integration.evaluate(()=>clicks),1,'decorative canvas must not intercept native controls');
 await integration.screenshot({path:'output/ashmaw-live/integration.png',fullPage:true});
 assert.ok(await integration.evaluate(()=>{
  const arena=document.querySelector('.raid-battle-backdrop'),art=arena.querySelector('[data-iw-ashmaw-art]');document.querySelector('#hp>div').style.width='21%';document.querySelector('#hp-value').textContent='4,410 / 21,000 HP';
  Ashmaw.reconcileAshmawScene(arena);return art===arena.querySelector('[data-iw-ashmaw-art]')&&document.querySelector('#hp>div').style.width==='21%';
 }),'native ticking HP must survive without remounting the scene');
 await integration.evaluate(()=>document.querySelector('.raid-battle-backdrop').style.marginTop='1800px');await integration.waitForTimeout(120);
 assert.ok(await integration.evaluate(async()=>{const c=document.querySelector('canvas'),before=c.toDataURL();await new Promise(r=>setTimeout(r,150));return before===c.toDataURL();}),'offscreen scene must pause');
 await integration.evaluate(()=>document.querySelector('.raid-battle-backdrop').style.marginTop='0');await integration.waitForTimeout(120);
 assert.ok(await integration.evaluate(async()=>{const c=document.querySelector('canvas'),before=c.toDataURL();await new Promise(r=>setTimeout(r,150));return before!==c.toDataURL();}),'returning onscreen must resume');
 assert.ok(await integration.evaluate(async()=>{
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
  const c=document.querySelector('canvas'),before=c.toDataURL();await new Promise(r=>setTimeout(r,150));const frozen=before===c.toDataURL();
  delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));return frozen;
 }),'hidden document must pause');
 await integration.emulateMedia({reducedMotion:'reduce'});await integration.waitForTimeout(120);
 assert.ok(await integration.evaluate(async()=>{const c=document.querySelector('canvas'),before=c.toDataURL();await new Promise(r=>setTimeout(r,150));return before===c.toDataURL();}),'reduced motion must freeze the whole scene');
 await integration.evaluate(()=>Ashmaw.clearAshmawScene(document.querySelector('.raid-battle-backdrop')));assert.equal(await integration.locator('[data-iw-ashmaw-art]').count(),0);
 await integration.evaluate(()=>Ashmaw.reconcileAshmawScene(document.querySelector('.raid-battle-backdrop')));await integration.waitForSelector('[data-iw-animated]');
 const removed=await integration.evaluate(()=>{const arena=document.querySelector('.raid-battle-backdrop'),canvas=arena.querySelector('canvas');arena.remove();Ashmaw.pruneAshmawScenes();return {art:!!arena.querySelector('[data-iw-ashmaw-art]'),flag:arena.hasAttribute('data-iw-raid-scene'),released:canvas.width===1&&canvas.height===1};});
 assert.deepEqual(removed,{art:false,flag:false,released:true},'route removal must dispose canvas buffers while reduced motion is active');
 failSmoke=true;await integration.goto('https://raid.test/');await integration.waitForSelector('[data-iw-animated]');assert.ok(await integration.locator('canvas').isVisible(),'all optional atlas failures must retain the approved scene');
 failPainting=true;await integration.goto('https://raid.test/');await integration.waitForFunction(()=>!document.querySelector('[data-iw-ashmaw-art]'));
 assert.equal(await integration.locator('[data-iw-raid-scene]').count(),0,'failed painting must leave native backdrop active');
 assert.ok(await integration.locator('img[alt^="Ashmaw"]').isVisible(),'native boss returns after failed painting');
 assert.deepEqual(errors,[]);console.log('Ashmaw live arena loop, native state, cross-origin assets, lifecycle and load fallbacks verified:',result);
}finally{await browser.close();}
