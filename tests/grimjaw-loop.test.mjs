import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const compiled=await build({entryPoints:['src/modules/GrimjawScene.js'],bundle:true,write:false,format:'iife',globalName:'Grimjaw'});
const browser=await chromium.launch(),errors=[];
try {
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.route('https://grimjaw.test/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/')return route.fulfill({contentType:'text/html',body:`<canvas></canvas><script>${compiled.outputFiles[0].text}</script>`});
  return route.fulfill({contentType:'image/png',body:await readFile(pathname.slice(1))});
 });
 await page.goto('https://grimjaw.test/');
 const loop=await page.evaluate(async()=>{
  const load=name=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/assets/raids/grimjaw/'+name+'.png';});
  const [env,clouds,mist]=await Promise.all(['arena','storm-clouds','courtyard-mist'].map(load));
  const canvas=document.querySelector('canvas'),r=Grimjaw.createGrimjawRenderer(canvas,env,{clouds,mist},{maxWidth:1440});
  const cx=canvas.getContext('2d');
  const frame=(t,options)=>{r.render(t,options);return cx.getImageData(0,0,canvas.width,canvas.height).data;};
  const diff=(a,b)=>{let max=0,sum=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d;}return {max,mean:sum/a.length};};
  const exact=diff(frame(0),frame(72)),repeat=diff(frame(7.25),frame(79.25)),near=diff(frame(0),frame(71.999));
  const regular=diff(frame(12),frame(11.999));
  const staticCheck=diff(frame(2,{ambient:false}),frame(11,{ambient:false}));
  const only=key=>({clouds:false,mist:false,boss:false,snow:false,foreground:false,[key]:true});
  const motion=Object.fromEntries(['clouds','mist','boss','snow','foreground'].map(key=>[key,diff(frame(2,only(key)),frame(11,only(key)))]));
  // Missing optional textures must keep independent light and ash usable.
  const fallbacks=[];
  for(const assets of [{clouds,mist:null},{clouds:null,mist},{clouds:null,mist:null}]){
   const c=document.createElement('canvas'),fallback=Grimjaw.createGrimjawRenderer(c,env,assets,{maxWidth:1440});
   fallback.render(2);const a=c.toDataURL();fallback.render(11);fallbacks.push(a!==c.toDataURL());fallback.destroy();
  }
  const result={period:r.period,width:canvas.width,height:canvas.height,exact,repeat,near,regular,staticCheck,motion,fallbacks};
  r.destroy();result.released=canvas.width===1&&canvas.height===1;return result;
 });
 assert.equal(loop.period,72);assert.equal(loop.width,1440);assert.equal(loop.height,720);
 assert.equal(loop.exact.max,0);assert.equal(loop.repeat.max,0);
 // Fast sleet moves during any 1ms interval; the loop boundary must behave
 // like ordinary motion rather than requiring the particles to stay still.
 assert.ok(loop.near.mean<loop.regular.mean*3+.001);
 assert.equal(loop.staticCheck.max,0);for(const [name,d]of Object.entries(loop.motion))assert.ok(d.mean>.001,name+' must animate independently');
 assert.deepEqual(loop.fallbacks,[true,true,true]);assert.ok(loop.released);

 const integration=await browser.newPage({viewport:{width:1100,height:900}});integration.on('pageerror',e=>errors.push(String(e)));
 let failPainting=false,failAtmosphere=false,holdPainting=false,releasePainting;
 const requested=new Set();
 const html=`<style>${await readFile('src/styles/guild.css','utf8')}body{margin:10px;background:#141019;color:#ddd}.raid-battle-backdrop{padding:14px;max-width:1000px}.raid-arena-floor{display:flex;gap:10px}.raid-readable-panel{padding:8px}button{color:inherit}</style>
 <div data-iw-guild="root"><h2>Raid Dungeon</h2><div class="raid-battle-backdrop" style="--raid-bg-image:url(boss-grimjaw.png)">
 <div data-iw-guild-role="boss-summary"><span>Grimjaw, the Undying Bulwark</span><div id="boss-stage"><img alt="Grimjaw, the Undying Bulwark" src="https://raid.test/native.svg"></div><div id="hp" style="height:10px"><div style="width:50%;height:100%;background:#c44"></div></div><p id="hp-value">10,500 / 21,000 HP</p></div>
 <div data-iw-guild-role="telegraph" class="raid-readable-panel">Death Mark in 10s</div>
 <div data-iw-guild-role="effects" class="raid-readable-panel"><button id="action">Raid skills</button><p>Curse ward active</p></div>
 <div class="raid-arena-floor"><button disabled>Raider status</button></div><button data-iw-guild-role="combat-log">Combat Log</button><p data-iw-guild-role="status">Charging your action bar…</p>
 </div></div><script>window.clicks=0;document.querySelector('#action').onclick=()=>window.clicks++;window.chrome={runtime:{id:'fixture',getURL:p=>'https://art.scene.test/'+p}};</script>
 <script>${compiled.outputFiles[0].text}</script><script>Grimjaw.reconcileGrimjawScene(document.querySelector('.raid-battle-backdrop'));</script>`;
 await integration.route('https://raid.test/**',route=>route.fulfill({contentType:route.request().url().endsWith('native.svg')?'image/svg+xml':'text/html',body:route.request().url().endsWith('native.svg')?'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#78465d"/></svg>':html}));
 await integration.route('https://art.scene.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);requested.add(name);
  if(holdPainting&&name.endsWith('/arena.png'))await new Promise(resolve=>{releasePainting=resolve;});
  if((failPainting&&name.endsWith('/arena.png'))||(failAtmosphere&&/\/(storm-clouds|courtyard-mist)\.png$/.test(name)))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:await readFile(name)});
 });
 const arena=()=>integration.locator('.raid-battle-backdrop');
 await integration.goto('https://raid.test/');await integration.waitForSelector('[data-iw-grimjaw-art][data-iw-animated]');
 for(const name of ['arena','storm-clouds','courtyard-mist'])assert.ok(requested.has('assets/raids/grimjaw/'+name+'.png'));
 assert.equal(await integration.locator('[data-iw-grimjaw-art]').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
 assert.equal(await integration.locator('#boss-stage').isVisible(),false,'only the native sprite stage is hidden');
 await integration.locator('#action').click();assert.equal(await integration.evaluate(()=>clicks),1);
 assert.ok(await integration.evaluate(()=>{
  const arena=document.querySelector('.raid-battle-backdrop'),art=arena.querySelector('[data-iw-grimjaw-art]');
  document.querySelector('#hp>div').style.width='21%';document.querySelector('#hp-value').textContent='4,410 / 21,000 HP';
  Grimjaw.reconcileGrimjawScene(arena);return arena.querySelector('[data-iw-grimjaw-art]')===art&&document.querySelector('#hp>div').style.width==='21%';
 }));
 const moving=()=>integration.locator('canvas').evaluate(async c=>{const before=c.toDataURL();await new Promise(r=>setTimeout(r,180));return before!==c.toDataURL();});
 await arena().evaluate(el=>el.style.marginTop='1800px');await integration.waitForTimeout(150);assert.equal(await moving(),false,'offscreen drawing pauses');
 await arena().evaluate(el=>el.style.marginTop='0');await integration.waitForTimeout(150);assert.equal(await moving(),true,'onscreen drawing resumes');
 await integration.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal(await moving(),false,'hidden tabs pause');
 await integration.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await moving(),true);
 await integration.emulateMedia({reducedMotion:'reduce'});await integration.waitForTimeout(100);assert.equal(await moving(),false,'reduced motion freezes the scene');
 await mkdir('output/grimjaw-live',{recursive:true});await arena().screenshot({path:'output/grimjaw-live/fixture-raid.png'});
 await integration.evaluate(()=>Grimjaw.clearGrimjawScene(document.querySelector('.raid-battle-backdrop')));
 assert.equal(await integration.locator('[data-iw-grimjaw-art]').count(),0);assert.equal(await integration.locator('#boss-stage').isVisible(),true);
 await integration.evaluate(()=>Grimjaw.reconcileGrimjawScene(document.querySelector('.raid-battle-backdrop')));await integration.waitForSelector('[data-iw-animated]');
 assert.ok(await integration.evaluate(()=>{const arena=document.querySelector('.raid-battle-backdrop'),c=arena.querySelector('canvas');arena.remove();Grimjaw.pruneGrimjawScenes();return !arena.querySelector('[data-iw-grimjaw-art]')&&!arena.hasAttribute('data-iw-raid-scene')&&c.width===1&&c.height===1;}),'route removal releases canvas even in reduced motion');
 failAtmosphere=true;await integration.goto('https://raid.test/');await integration.waitForSelector('[data-iw-animated]');assert.equal(await integration.locator('canvas').isVisible(),true);
 failPainting=true;await integration.goto('https://raid.test/');await integration.waitForFunction(()=>!document.querySelector('[data-iw-grimjaw-art]'));
 assert.equal(await integration.locator('[data-iw-raid-scene]').count(),0);assert.equal(await integration.locator('#boss-stage').isVisible(),true);
 failPainting=failAtmosphere=false;
 await integration.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='2d'?null:original.call(this,type,...args);};});
 await integration.goto('https://raid.test/');await integration.waitForSelector('[data-iw-raid-scene="grimjaw"]');
 assert.equal(await integration.locator('[data-iw-animated]').count(),0);assert.equal(await integration.locator('[data-iw-art="environment"]').isVisible(),true,'unavailable canvas retains the approved still painting');
 holdPainting=true;await integration.goto('https://raid.test/',{waitUntil:'domcontentloaded'});await integration.waitForFunction(()=>!!document.querySelector('[data-iw-grimjaw-art]'));
 // Change the native encounter before the delayed painting arrives, without
 // relying on another reconciliation call to remove stale pending art.
 await integration.evaluate(()=>{const arena=document.querySelector('.raid-battle-backdrop'),boss=arena.querySelector('img[alt^="Grimjaw"]');boss.alt='Skarth, the Rime Wyrm';arena.style.setProperty('--raid-bg-image','url(boss-skarth.png)');});
 const paintingDeadline=Date.now()+5000;
 while(!releasePainting&&Date.now()<paintingDeadline)await integration.waitForTimeout(10);
 assert.equal(typeof releasePainting,'function','delayed painting request arrives within five seconds');
 releasePainting();
 await integration.waitForFunction(()=>!document.querySelector('[data-iw-grimjaw-art]'));
 assert.equal(await integration.locator('[data-iw-raid-scene]').count(),0,'late painting must not activate an obsolete encounter');
 assert.deepEqual(errors,[]);console.log('Grimjaw live loop, assets, native state, visibility, cleanup and fallbacks passed:',loop);
} finally {await browser.close();}

