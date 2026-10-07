import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const compiled=await build({entryPoints:['src/modules/ThessalyScene.js'],bundle:true,write:false,format:'iife',globalName:'Thessaly'});
const browser=await chromium.launch(),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});page.on('pageerror',e=>errors.push(String(e)));
 await page.route('https://scene.test/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/')return route.fulfill({contentType:'text/html',body:`<body><canvas id="scene"></canvas><script>${compiled.outputFiles[0].text}</script>`});
  return route.fulfill({contentType:'image/png',body:await readFile('assets/raids/thessaly/'+pathname.slice(1))});
 });
 await page.goto('https://scene.test/');
 const result=await page.evaluate(async()=>{
  const load=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=src;});
  const [env,clouds,mist,hair,body]=await Promise.all(['arena-storm','storm-clouds','courtyard-mist','hair-wisps','body-clouds'].map(name=>load('/'+name+'.png')));
  const assets={clouds,mist,hair,body};
  for(const image of Object.values(assets)){
   const sample=document.createElement('canvas');sample.width=image.naturalWidth;sample.height=image.naturalHeight;
   const sc=sample.getContext('2d');sc.drawImage(image,0,0);const data=sc.getImageData(0,0,sample.width,sample.height).data;
   if(data[3]!==0||!data.some((v,i)=>i%4===3&&v>0&&v<255))throw Error('Atmosphere asset must have fading real alpha');
  }
  const c=document.querySelector('canvas'),r=Thessaly.createThessalyRenderer(c,env,assets,{maxWidth:1440});
  const frame=t=>{r.render(t);return c.toDataURL();};
  const first=frame(0),end=frame(16),later=frame(3),next=frame(19);
  const pixels=t=>{r.render(t);return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
  const a=pixels(15.999),b=pixels(0);let total=0;
  for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);
  r.render(6.4,{battle:false});const ambient=c.toDataURL();r.render(6.4,{battle:true});const battlesDisabled=ambient===c.toDataURL();
  r.render(1,{ambient:false});const fixed= c.toDataURL();r.render(5,{ambient:false});const anchored=fixed===c.toDataURL();
  const chargeOnly={cloudMotion:false,atmosphere:false,courtyardMist:false,bossMotion:false,spores:false};
  r.render(0,chargeOnly);const chargeStart=c.toDataURL();
  const floorStart=c.getContext('2d').getImageData(0,c.height*.85,c.width,c.height*.15).data;
  r.render(2,chargeOnly);const chargeLater=c.toDataURL();
  const floorLater=c.getContext('2d').getImageData(0,c.height*.85,c.width,c.height*.15).data;
  r.render(18,chargeOnly);const stormChargeRepeats=chargeLater===c.toDataURL();
  const coreWithLightning=c.getContext('2d').getImageData(c.width*.70,c.height*.29,c.width*.02,c.height*.06).data;
  r.render(2,{...chargeOnly,lightning:false});
  const coreWithoutLightning=c.getContext('2d').getImageData(c.width*.70,c.height*.29,c.width*.02,c.height*.06).data;
  const lightningOutsideBody=coreWithLightning.every((v,i)=>v===coreWithoutLightning[i]);
  r.render(0,{...chargeOnly,lightning:false});const noCharge=c.toDataURL();
  r.render(2,{...chargeOnly,lightning:false});const chargeCanDisable=noCharge===c.toDataURL();
  const stormChargeMoves=chargeStart!==chargeLater,chargeLeavesFloor=floorStart.every((v,i)=>v===floorLater[i]);
  const cloudsOnly={atmosphere:false,courtyardMist:false,bossMotion:false,lightning:false,spores:false};
  r.render(3,{...cloudsOnly,cloudMotion:false});
  const tower=c.getContext('2d').getImageData(c.width*.383,c.height*.135,c.width*.057,c.height*.21).data;
  r.render(3,cloudsOnly);
  const towerMoving=c.getContext('2d').getImageData(c.width*.383,c.height*.135,c.width*.057,c.height*.21).data;
  const towerAnchored=tower.every((v,i)=>v===towerMoving[i]);
  const mistOnly={...chargeOnly,lightning:false,courtyardMist:true};
  r.render(1,mistOnly);const mistStart=c.toDataURL();
  r.render(5,mistOnly);const mistLater=c.toDataURL();
  r.render(21,mistOnly);const mistRepeats=mistLater===c.toDataURL();
  const courtyardMistMoves=mistStart!==mistLater;
  const bodyOnly={...chargeOnly,lightning:false,bossMotion:true,hairMotion:false,bodyClouds:true,spectralWisps:false};
  r.render(1,bodyOnly);const bodyStart=c.toDataURL();
  const face=c.getContext('2d').getImageData(c.width*.682,c.height*.052,c.width*.031,c.height*.063).data;
  r.render(5,bodyOnly);const bodyLater=c.toDataURL();
  const faceLater=c.getContext('2d').getImageData(c.width*.682,c.height*.052,c.width*.031,c.height*.063).data;
  r.render(21,bodyOnly);const bodyRepeats=bodyLater===c.toDataURL();
  const hairOnly={...bodyOnly,hairMotion:true,bodyClouds:false};
  r.render(1,hairOnly);const hairStart=c.toDataURL();r.render(5,hairOnly);const hairLater=c.toDataURL();
  r.render(21,hairOnly);const hairRepeats=hairLater===c.toDataURL();
  r.render(3);return {period:r.period,width:c.width,height:c.height,exact:first===end,repeat:later===next,moves:first!==later,seamMean:total/a.length,battlesDisabled,anchored,stormChargeMoves,stormChargeRepeats,chargeCanDisable,chargeLeavesFloor,lightningOutsideBody,towerAnchored,courtyardMistMoves,mistRepeats,bodyMoves:bodyStart!==bodyLater,bodyRepeats,faceAnchored:face.every((v,i)=>v===faceLater[i]),hairMoves:hairStart!==hairLater,hairRepeats};
 });
 assert.equal(result.period,16);assert.equal(result.width,1440);assert.equal(result.height,720);
 assert.ok(result.exact&&result.repeat,'complete scene must repeat at its sixteen-second boundary');
 assert.ok(result.moves,'live scene must animate');assert.ok(result.seamMean<.2,'loop wrap must be continuous');
 assert.ok(result.battlesDisabled,'ambient scene must not trigger archived combat effects');assert.ok(result.anchored,'art must not morph or float');
  assert.ok(result.stormChargeMoves,'lightning must move independently of fog and cloud layers');
  assert.ok(result.stormChargeRepeats&&result.chargeCanDisable,'lightning must loop and honour its preview toggle');
  assert.ok(result.chargeLeavesFloor,'lightning must not shift or wash out the playable ground');
  assert.ok(result.lightningOutsideBody,'lightning must crackle outside the cloud body, not through its core');
  assert.ok(result.towerAnchored,'cloud motion must not sample, duplicate or relight the fixed ward tower');
  assert.ok(result.courtyardMistMoves&&result.mistRepeats,'custom courtyard haze must move independently and repeat exactly');
  assert.ok(result.bodyMoves&&result.bodyRepeats&&result.faceAnchored,'slight cloud-body rig must loop without moving the face');
  assert.ok(result.hairMoves&&result.hairRepeats,'fresh silver hair trails must wave independently and loop');
 await mkdir('output/thessaly-live',{recursive:true});await page.screenshot({path:'output/thessaly-live/renderer.png'});
 const integration=await browser.newPage({viewport:{width:1000,height:850}});integration.on('pageerror',e=>errors.push(String(e)));
 let failPainting=false,failAtmosphere=false;const assetRequests=new Set();
 const html=`<style>${await readFile('src/styles/guild.css','utf8')}body{margin:10px;background:#14110e;color:#ddd}.raid-battle-backdrop{padding:14px;width:960px}.raid-arena-floor{display:flex;gap:10px}.raid-readable-panel{padding:8px}button{color:inherit}</style>
  <div data-iw-guild="root"><h2>Raid Dungeon</h2><div class="raid-battle-backdrop" style="--raid-bg-image:url(boss-thessaly.png)">
   <div data-iw-guild-role="boss-summary"><span>Thessaly, the Plague Warden</span><div><img alt="Thessaly, the Plague Warden" src=""></div><div id="hp" style="height:10px"><div style="width:50%;height:100%;background:#c44"></div></div><p id="hp-value">10,500 / 21,000 HP</p></div>
   <div data-iw-guild-role="telegraph" class="raid-readable-panel">Plague Wave in 10s</div>
   <div data-iw-guild-role="effects" class="raid-readable-panel"><button id="action">Raid skills</button><p>Plague ward active</p></div>
   <div class="raid-arena-floor"><button disabled>Raider status</button></div>
   <button data-iw-guild-role="combat-log">Combat Log</button><p data-iw-guild-role="status">Charging your action bar…</p>
  </div></div><script>window.clicks=0;document.querySelector('#action').onclick=()=>window.clicks++;window.chrome={runtime:{id:'fixture',getURL:p=>'https://art.scene.test/'+p}};</script>
  <script>${compiled.outputFiles[0].text}</script><script>Thessaly.reconcileThessalyScene(document.querySelector('.raid-battle-backdrop'));</script>`;
 await integration.route('https://raid.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
 await integration.route('https://art.scene.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  assetRequests.add(name);
  if((failPainting&&name.endsWith('/arena-storm.png'))||(failAtmosphere&&/\/(storm-clouds|courtyard-mist|hair-wisps|body-clouds)\.png$/.test(name)))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:await readFile(name)});
 });
 await integration.goto('https://raid.test/');
 await integration.waitForSelector('[data-iw-thessaly-art][data-iw-animated]',{timeout:10000});
 for(const name of ['storm-clouds','courtyard-mist','hair-wisps','body-clouds'])assert.ok(assetRequests.has('assets/raids/thessaly/'+name+'.png'),'live scene must load its fresh '+name+' asset');
 assert.ok(!assetRequests.has('assets/raids/ashmaw/smoke.png'),'Thessaly must own all of her atmospheric artwork');
 await integration.locator('#action').click();assert.equal(await integration.evaluate(()=>clicks),1,'decorative canvas must not intercept native controls');
 assert.ok(await integration.evaluate(()=>{
  const arena=document.querySelector('.raid-battle-backdrop'),art=arena.querySelector('[data-iw-thessaly-art]');document.querySelector('#hp>div').style.width='21%';document.querySelector('#hp-value').textContent='4,410 / 21,000 HP';
  Thessaly.reconcileThessalyScene(arena);return art===arena.querySelector('[data-iw-thessaly-art]')&&document.querySelector('#hp>div').style.width==='21%';
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
 await integration.evaluate(()=>Thessaly.clearThessalyScene(document.querySelector('.raid-battle-backdrop')));assert.equal(await integration.locator('[data-iw-thessaly-art]').count(),0);
 await integration.evaluate(()=>Thessaly.reconcileThessalyScene(document.querySelector('.raid-battle-backdrop')));await integration.waitForSelector('[data-iw-animated]');
 const removed=await integration.evaluate(()=>{const arena=document.querySelector('.raid-battle-backdrop'),canvas=arena.querySelector('canvas');arena.remove();Thessaly.pruneThessalyScenes();return {art:!!arena.querySelector('[data-iw-thessaly-art]'),flag:arena.hasAttribute('data-iw-raid-scene'),released:canvas.width===1&&canvas.height===1};});
 assert.deepEqual(removed,{art:false,flag:false,released:true},'route removal must dispose canvas buffers while reduced motion is active');
 failAtmosphere=true;await integration.goto('https://raid.test/');await integration.waitForSelector('[data-iw-animated]');assert.ok(await integration.locator('canvas').isVisible(),'optional atmosphere failure must retain the approved scene');
 failPainting=true;await integration.goto('https://raid.test/');await integration.waitForFunction(()=>!document.querySelector('[data-iw-thessaly-art]'));
 assert.equal(await integration.locator('[data-iw-raid-scene]').count(),0,'failed painting must leave native backdrop active');
 assert.ok(await integration.locator('img[alt^="Thessaly"]').isVisible(),'native boss returns after failed painting');
 assert.deepEqual(errors,[]);console.log('Thessaly live arena loop, native state, cross-origin assets, lifecycle and load fallbacks verified:',result);
}finally{await browser.close();}
