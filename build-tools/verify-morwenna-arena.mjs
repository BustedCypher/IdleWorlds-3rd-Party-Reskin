import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

// Fail immediately if the renderer has not been implemented yet.
await build({entryPoints:['src/modules/MorwennaArenaRenderer.js'],bundle:true,write:false,format:'esm',logLevel:'silent'});
const folder='output/morwenna-arena';
assert.deepEqual(await readFile(folder+'/scene.js'),await readFile('src/modules/MorwennaArenaRenderer.js'),'rebuild the preview so verification exercises the current live renderer');
assert.deepEqual(await readFile(folder+'/arena.png'),await readFile('output/morwenna-ember-court-v2/arena-rubble-mist.png'),'the approved painting must remain byte-identical');
const previewURL=process.env.MORWENNA_PREVIEW_URL || 'http://127.0.0.1:4175/morwenna-arena/';
const browser=await chromium.launch(process.env.IW_CHROMIUM_PATH ? {executablePath:process.env.IW_CHROMIUM_PATH} : {channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:1500,height:980}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(previewURL);
 await page.waitForFunction(()=>window.arenaPlayer,{},{timeout:15000});
 await page.evaluate(()=>{arenaPlayer.setPaused(true);});
 const checks=await page.evaluate(()=>{
  const r=arenaRenderer,c=document.querySelector('canvas'),ctx=c.getContext('2d');
  const pixels=()=>ctx.getImageData(0,0,c.width,c.height).data;
  const diff=(a,b,box=[0,0,1,1])=>{
   let total=0,count=0,max=0;
   for(let y=Math.floor(c.height*box[1]);y<Math.floor(c.height*box[3]);y++)for(let x=Math.floor(c.width*box[0]);x<Math.floor(c.width*box[2]);x++){
    const j=(y*c.width+x)*4;for(let k=0;k<3;k++){const d=Math.abs(a[j+k]-b[j+k]);total+=d;max=Math.max(max,d);count++;}
   }return {mean:total/count,max};
  };
  const frame=(t,options)=>{r.render(t,options);return pixels();};
  const P=r.period,base=frame(0,{ambient:false});
  const exact=diff(frame(0),frame(P));
  const near=diff(frame(0),frame(P-.00001));
  const repeat=diff(frame(7.25),frame(7.25+P));
  const still=diff(base,frame(15,{ambient:false}));
  const only=layer=>({clouds:false,mist:false,shroud:false,curse:false,embers:false,foreground:false,[layer]:true});
  const movement={};
  for(const layer of ['clouds','mist','shroud','curse','embers','foreground']){
   const early=frame(2,only(layer)),late=frame(11,only(layer));
   movement[layer]={travel:diff(early,late),visible:diff(base,late)};
  }
  const strings=diff(frame(2,only('curse')),frame(11,only('curse')),[.645,.225,.843,.41]);
  const foreground=diff(frame(2,only('foreground')),frame(11,only('foreground')),[0,.76,1,1]);
  const anchors={};
  for(const [name,box]of Object.entries({leftArch:[.06,.13,.20,.44],cathedral:[.35,.17,.39,.32],dollFace:[.736,.364,.748,.383]}))
   anchors[name]=diff(frame(2),frame(11),box);
  anchors.foregroundStone=diff(frame(2,{foreground:false}),frame(11,{foreground:false}),[.42,.84,.56,.95]);
  const atlasAlpha=Object.fromEntries(Object.entries(window.arenaAssets).filter(([n])=>n!=='background').map(([n,img])=>{
   const cc=document.createElement('canvas');cc.width=img.naturalWidth;cc.height=img.naturalHeight;
   const cx=cc.getContext('2d');cx.drawImage(img,0,0);const p=cx.getImageData(0,0,cc.width,cc.height).data;
   let clear=0,partial=0,solid=0;for(let i=3;i<p.length;i+=4){if(p[i]===0)clear++;else if(p[i]===255)solid++;else partial++;}
   return[n,{clear,partial,solid}];
  }));
  // Canvas commands queue work; read a pixel each frame to include raster cost.
  const start=performance.now();for(let i=0;i<60;i++){r.render(i*.3);ctx.getImageData(0,0,1,1);}
  return {period:P,width:c.width,height:c.height,exact,near,repeat,still,movement,strings,foreground,anchors,atlasAlpha,renderMs:(performance.now()-start)/60};
 });
 assert.equal(checks.exact.max,0,'loop boundary must be pixel-identical');
 assert.ok(checks.near.mean<.01,'loop must approach the seam continuously');
 assert.equal(checks.repeat.max,0,'arbitrary timestamps must repeat exactly');
 assert.equal(checks.still.max,0,'ambient-off is a real static negative control');
 assert.ok(checks.foreground.mean>.08,'foreground atmosphere must visibly move across the near courtyard');
 assert.ok(checks.strings.mean>.2,'moving puppet-string light must be more pronounced in the upper string span');
 for(const [layer,result]of Object.entries(checks.movement)){
  assert.ok(result.travel.mean>.001,layer+' must visibly move over time');
  assert.ok(result.visible.mean>.002,layer+' must affect the painting');
 }
 for(const [name,result]of Object.entries(checks.anchors))assert.equal(result.max,0,name+' must remain anchored and clear');
 for(const [name,alpha]of Object.entries(checks.atlasAlpha)){
  assert.ok(alpha.clear>10000,name+' must have real transparent margins');
  assert.ok(alpha.partial>10000,name+' must have soft translucent detail');
 }
 // Every effect is independently switchable, and scrubbing freezes the player.
 await page.locator('#scrub').fill('330');assert.equal(await page.locator('#time').textContent(),'11.00 s');
 assert.equal(await page.locator('#pause').textContent(),'Play');
 for(const id of ['clouds','mist','curse','foreground']){
  await page.locator('#'+id).click();assert.equal(await page.locator('#'+id).getAttribute('aria-pressed'),'false');
  await page.locator('#'+id).click();assert.equal(await page.locator('#'+id).getAttribute('aria-pressed'),'true');
 }
 await page.locator('#pause').click();await page.waitForTimeout(250);
 assert.notEqual(await page.locator('#time').textContent(),'11.00 s');
 for(const t of [2,8,14]){
  const encoded=await page.evaluate(t=>{arenaPlayer.setPaused(true);arenaPlayer.draw(t);return document.querySelector('canvas').toDataURL('image/png').split(',')[1];},t);
  await writeFile(folder+'/frame-'+t+'.png',Buffer.from(encoded,'base64'));
 }
 await page.evaluate(()=>arenaPlayer.draw(8));await page.screenshot({path:folder+'/preview.png',fullPage:true});
 // Respect the reduced-motion preference on initial load.
 const reduced=await browser.newPage({reducedMotion:'reduce'});
 await reduced.goto(previewURL);await reduced.waitForFunction(()=>window.arenaPlayer);
 assert.equal(await reduced.evaluate(()=>arenaPlayer.paused),true);await reduced.close();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile controls and scene must fit without horizontal overflow');
 await page.evaluate(()=>arenaRenderer.destroy());
 assert.equal(await page.evaluate(()=>document.querySelector('canvas').width),1,'destroy releases the canvas');
 assert.deepEqual(errors,[]);
 await writeFile(folder+'/verification.json',JSON.stringify({checks,errors},null,2)+'\n');
 console.log('Morwenna ambient scene verified:',JSON.stringify(checks,null,2));
} finally {await browser.close();}
