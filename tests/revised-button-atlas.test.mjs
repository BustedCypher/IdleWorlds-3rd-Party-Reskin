import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {JSDOM} from 'jsdom';
import {chromium} from 'playwright';
import {THEME_NAMES} from '../src/modules/zoneThemes.js';
import {SkillsArtService} from '../src/modules/SkillsArtService.js';

const root=resolve(import.meta.dirname,'..'), dir='assets/skills-ui/buttons/revised-v5';
const index=JSON.parse(await readFile(resolve(root,dir,'index.json')));
assert.deepEqual([...index.themes].sort(),[...THEME_NAMES].sort(),'every theme needs a dedicated atlas');
const states=['idle','hover','clicked'];
const host=new JSDOM('<html></html>').window.document.documentElement;
const sheets=['base','header','inventory','skillpanel','tooltip-engine','overlay','ui-system'];
const css=(await Promise.all(sheets.map(n=>readFile(resolve(root,`src/styles/${n}.css`),'utf8')))).join('\n').replaceAll("url('../assets/","url('/assets/");
const manifest=JSON.parse(await readFile(resolve(root,'manifest.json')));
assert.ok(manifest.web_accessible_resources.some(e=>e.resources.includes(`${dir}/*.png`)));
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1000,height:700},deviceScaleFactor:2});
await page.route('**/*',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/assets/')&&!path.includes('..')) {
    try{return await route.fulfill({body:await readFile(resolve(root,'.'+path))});}catch{}
  }
  return route.fulfill({body:'<!doctype html><html></html>',contentType:'text/html'});
});
try {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://button-art.test/');
  for(const theme of index.themes) {
    SkillsArtService.applyThemeVariables(host,theme);
    assert.equal(host.dataset.iwButtonAtlas,'revised-v5');
    for(const entry of index.entries) {
      assert.equal(host.style.getPropertyValue(`--iw-${entry.key}`),`url("${dir}/${theme}.png")`);
      assert.ok(host.style.getPropertyValue(`--iw-${entry.key}-paint`).includes('no-repeat'));
    }
    const metrics=await page.evaluate(async({src,index})=>{
      const im=new Image();im.src=src;await im.decode();
      const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
      const c=canvas.getContext('2d');c.drawImage(im,0,0);
      const result={size:[im.width,im.height],groups:{}};
      for(const kind of ['action','chevron-prev','chevron-next']) {
        const entries=['idle','hover','clicked'].map(s=>index.entries.find(e=>e.key===`${kind}-${s}`));
        const data=entries.map(e=>c.getImageData(e.x,e.y,e.width,e.height).data);
        let mismatch=0,opaque=0;const delta=[0,0],bounds=[entries[0].width,225,0,0];
        for(let i=0;i<data[0].length;i+=4){
          const alpha=data[0][i+3];
          if(alpha!==data[1][i+3]||alpha!==data[2][i+3])mismatch++;
          if(alpha<128)continue;
          opaque++;const x=i/4%entries[0].width,y=Math.floor(i/4/entries[0].width);
          bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);
          bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);
          for(let s=1;s<3;s++)for(let j=0;j<3;j++)delta[s-1]+=Math.abs(data[0][i+j]-data[s][i+j]);
        }
        result.groups[kind]={mismatch,opaque,bounds,delta:delta.map(d=>d/opaque/3)};
      }
      return result;
    },{src:`/${dir}/${theme}.png`,index});
    assert.deepEqual(metrics.size,[index.width,index.height]);
    for(const [kind,m] of Object.entries(metrics.groups)) {
      assert.equal(m.mismatch,0,`${theme}/${kind}: state silhouettes must match pixel for pixel`);
      assert.ok(m.opaque>12000,`${theme}/${kind}: missing artwork`);
      assert.ok(m.bounds[0]>0&&m.bounds[1]>0&&m.bounds[3]<224,`${theme}/${kind}: clipped artwork`);
      assert.ok(m.delta[0]>12&&m.delta[1]>8,`${theme}/${kind}: weak state effects ${m.delta}`);
    }
    // All injected sheets, plus the renderer's inline !important shorthands.
    // Include Fight as a bare command button as well as the grouped skill shape.
    const action=(id,zone='')=>`<button id="${id}" ${zone} data-iw-skill-role="action-button" style="width:155px!important;min-width:155px!important;height:44px!important;padding:0 12px!important;border:0!important;background:var(--fs-button-background)!important">Fight</button>`;
    const nav=(direction)=>`<button id="${direction}" data-iw-skill-role="nav-button" data-iw-nav-direction="${direction}" style="width:26px!important;height:44px!important;padding:0!important;background:var(--fs-button-background)!important;transition:var(--fs-button-transition,background .13s)!important;border:var(--fs-button-border,1px solid red)!important;box-shadow:var(--fs-button-shadow,0 0 4px red)!important;font-size:0!important">›</button>`;
    await page.setContent(`<html data-iw-zone-theme="${theme}" data-iw-button-atlas="revised-v5" style='${host.style.cssText}'>
      <style>${css}</style><style>body{background:#100d10;padding:40px}*{box-sizing:border-box}.compact-panel{width:500px;min-height:120px;margin:20px}button{font:700 12px Arial;color:#f3e3c0}#row{display:flex;align-items:center;gap:5px;padding:20px}</style>
      <div class="compact-panel fs-skill-panel" data-iw-skills-ui-ready="1" data-iw-skill-layout="three-zone"><div id="row" data-iw-skill-zone="commands">${nav('prev')}${action('action')}${nav('next')}</div></div>
      <div class="compact-panel fs-skill-panel" data-iw-skills-ui-ready="1" data-iw-skill-layout="three-zone">${action('bare','data-iw-skill-zone="commands"')}</div>
      <div class="compact-panel fs-quest-panel" data-iw-skills-ui-ready="1"><button id="quest" data-iw-quest-role="turn-in">Turn In All (38)</button></div></html>`);
    for(const [id,kind] of [['action','action'],['bare','action'],['prev','chevron-prev'],['next','chevron-next'],['quest','action']]) {
      await page.mouse.move(950,650);const el=page.locator('#'+id);
      const geometry=()=>el.evaluate(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height,getComputedStyle(e).transform];});
      const baseline=await geometry(),frames=[];
      for(const state of states) {
        if(state==='hover')await el.hover();
        if(state==='clicked')await page.mouse.down();
        const s=await el.evaluate((e,state)=>{const base=getComputedStyle(e),s=getComputedStyle(e,state==='idle'?null:state==='hover'?'::before':'::after');return {image:s.backgroundImage,position:s.backgroundPosition,transition:s.transitionProperty,opacity:s.opacity,before:getComputedStyle(e,'::before').content,border:base.borderTopWidth,shadow:base.boxShadow};},state);
        assert.match(s.image,new RegExp(`${theme}\\.png`));
        const entry=index.entries.find(e=>e.key===`${kind}-${state}`),pos=s.position.split(' ').map(parseFloat);
        assert.ok(Math.abs(pos[0]-100*entry.x/(index.width-entry.width))<.01,`${id} sprite x`);
        assert.ok(Math.abs(pos[1]-100*entry.y/(index.height-entry.height))<.01,`${id}/${state} sprite y: ${s.position}`);
        assert.deepEqual(await geometry(),baseline,`${theme}/${id}/${state}: moved or resized`);
        assert.ok(!s.transition.split(', ').some(p=>['all','background','background-position','background-size','background-image'].includes(p)),`${theme}/${id}/${state}: must not scroll between sprite cells (${s.transition})`);
        if(state!=='idle')assert.equal(s.opacity,'1',`${id} active artwork must be visible`);
        if(kind.startsWith('chevron')){assert.equal(s.before,'""');assert.equal(s.border,'0px');assert.equal(s.shadow,'none');}
        frames.push((await el.screenshot()).toString('base64'));
      }
      await page.mouse.up();assert.notEqual(frames[0],frames[1]);assert.notEqual(frames[0],frames[2]);
      await el.evaluate(e=>e.disabled=true);await el.hover({force:true});await page.mouse.down();
      const disabledY=await el.evaluate(e=>parseFloat(getComputedStyle(e).backgroundPosition.split(' ')[1]));
      assert.ok(Math.abs(disabledY-100*12/(index.height-225))<.01,'disabled must stay idle');
      await page.mouse.up();await el.evaluate(e=>e.disabled=false);
    }
    if(theme==='infernal'){
      await page.mouse.move(950,650);await mkdir(resolve(root,'tmp/button-atlas-check'),{recursive:true});
      await page.screenshot({path:resolve(root,'tmp/button-atlas-check/integration.png')});
    }
  }
  // Sample the real browser transition at a deterministic intermediate time.
  // End-state screenshots alone cannot tell a crossfade from an abrupt swap.
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.mouse.move(950,650);
  const control=page.locator('#action');
  await control.evaluate(e=>{e.blur();window.buttonOriginal=e;window.buttonText=e.firstChild;});
  await page.waitForTimeout(220);
  const box=await control.boundingBox();
  await control.hover();
  const blend=await control.evaluate(e=>{
    const transition=e.getAnimations({subtree:true}).find(a=>a.transitionProperty==='opacity');
    if(!transition)return null;
    transition.pause();transition.currentTime=80;
    return {opacity:Number(getComputedStyle(e,'::before').opacity),base:getComputedStyle(e).backgroundPosition,
      hover:getComputedStyle(e,'::before').backgroundPosition,pressed:getComputedStyle(e,'::after').backgroundPosition};
  });
  assert.ok(blend&&blend.opacity>0&&blend.opacity<1,'hover must paint an intermediate blend');
  const idlePosition=blend.base.split(' ').map(parseFloat);
  assert.ok(Math.abs(idlePosition[0]-50)<.01&&Math.abs(idlePosition[1]-100*12/498)<.01,'idle layer must remain fixed');
  await control.evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.finish()));
  await page.mouse.down();
  const pressed=await control.evaluate(e=>{
    const a=e.getAnimations({subtree:true}).find(a=>a.transitionProperty==='opacity');
    if(!a)return null;a.pause();a.currentTime=30;
    return {opacity:Number(getComputedStyle(e,'::after').opacity),duration:a.effect.getTiming().duration};
  });
  assert.ok(pressed&&pressed.opacity>0&&pressed.opacity<1,'pressed must crossfade');
  assert.ok(pressed.duration<=100,'press must respond promptly');
  await control.evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.finish()));
  await page.mouse.up();await page.mouse.move(950,650);await page.waitForTimeout(220);
  assert.deepEqual(await control.boundingBox(),box,'animation must not affect layout');
  assert.ok(await control.evaluate(e=>e===window.buttonOriginal&&e.firstChild===window.buttonText),'native button and text must remain intact');
  await page.emulateMedia({reducedMotion:'reduce'});await control.hover();
  assert.equal(await control.evaluate(e=>getComputedStyle(e,'::before').transitionDuration),'0s');
  SkillsArtService.applyThemeVariables(host,null);
  assert.equal(host.dataset.iwButtonAtlas,undefined);
  for(const e of index.entries)assert.equal(host.style.getPropertyValue(`--iw-${e.key}-paint`),'');
  SkillsArtService.clearThemeVariables(host);
  assert.equal(host.style.cssText,'');
} finally {await browser.close();}
console.log('PASS revised atlases: nine themes, exact alpha registration, actual sprite windows, stable geometry, disabled controls and default-theme cleanup');
