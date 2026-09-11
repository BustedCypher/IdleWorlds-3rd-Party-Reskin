import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {JSDOM} from 'jsdom';
import {THEME_NAMES} from '../src/modules/zoneThemes.js';
import {SkillsArtService} from '../src/modules/SkillsArtService.js';

const root=resolve(import.meta.dirname,'..'),dir='assets/skills-ui/buttons/compact-ghost-v3';
const index=JSON.parse(await readFile(resolve(root,dir,'index.json')));
assert.deepEqual([...index.themes].sort(),[...THEME_NAMES].sort());
const manifest=JSON.parse(await readFile(resolve(root,'manifest.json')));
assert.ok(manifest.web_accessible_resources.some(e=>e.resources.includes(`${dir}/*.png`)));
const host=new JSDOM('<html></html>').window.document.documentElement;
const css=(await Promise.all(['base','header','inventory','skillpanel','tooltip-engine','overlay','ui-system','compact-buttons'].map(s=>readFile(resolve(root,`src/styles/${s}.css`),'utf8')))).join('\n').replaceAll("url('../assets/","url('/assets/");
const renderer=(await readFile(resolve(root,'src/modules/CompactButtons.js'),'utf8')).replaceAll('export function','function');
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1100,height:850},deviceScaleFactor:2});
await page.route('**/*',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/assets/')&&!path.includes('..')) {
    try{return await route.fulfill({body:await readFile(resolve(root,'.'+path))});}catch{}
  }
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'});
});
const fixture=`<div class="test-row"><button id="nav" data-iw-ui="nav-tab" data-iw-state="active"><span id="nav-label" class="native-active-label">Game</span></button><button id="long" data-iw-ui="nav-tab">Leaderboards</button><a id="toolkit" data-iw-ui="nav-tab" data-iw-nav-link="toolkit" href="#">Toolkit</a></div>
<div data-iw-inventory-root="1" style="display:contents"><div class="test-row"><button id="filter" data-iw-inventory-control="filter" data-iw-inventory-filter-state="active">Consumables</button><button id="prev" data-iw-inventory-control="page" disabled>Prev</button><button id="next" data-iw-inventory-control="page">Next</button></div></div>
<div class="test-row"><button id="equip" data-fs-preserved-action="control" data-fs-action-kind="equip">Equip</button><button id="equipped" data-fs-preserved-action="control" data-fs-action-kind="equipped">Equipped</button><button id="list" data-fs-preserved-action="control" data-fs-action-kind="secondary">List</button><button id="use" data-fs-preserved-action="control" data-fs-action-kind="secondary">Use</button><button id="bonus" data-fs-preserved-action="control" data-fs-action-kind="set">✦ Set Bonus</button><button id="lock" data-fs-preserved-action="control" data-fs-action-kind="icon" aria-label="Lock"><svg width="14" height="14" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" d="M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4"/></svg></button></div>
<div class="test-row"><div id="loadouts"><button id="one" class="small bg-ember" aria-pressed="true">I</button><button id="two" class="small" aria-pressed="false">II</button></div><div><button id="zone" class="small">Change Zone</button><button id="timer" class="small" aria-label="Zone timer">⏱</button></div><button id="send" data-iw-panel-part="send">Send</button><button id="zone-next" data-iw-ui="zone-action">Next Zone</button></div>
<button id="unrelated">Other dialog action</button><button id="inventory-tool" data-iw-inventory-control="icon"><svg width="14" height="14"></svg></button>`;
const ids=['nav','long','toolkit','filter','next','equip','equipped','list','use','bonus','lock','one','two','zone','timer','send','zone-next'];
const box=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};
try {
  await page.goto('http://compact-buttons.test/');
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const theme of index.themes) {
    SkillsArtService.applyThemeVariables(host,theme);
    assert.equal(host.dataset.iwCompactAtlas,'compact-ghost-v3');
    assert.equal(host.style.getPropertyValue('--iw-compact-atlas'),`url("${dir}/${theme}.png")`);
    await page.setContent(`<html data-iw-zone-theme="${theme}" data-iw-compact-atlas="compact-ghost-v3" style='${host.style.cssText}'><style>${css}</style><style>*{box-sizing:border-box}body{background:#090e12!important;padding:35px!important}.test-row{display:flex;gap:12px;align-items:center;margin:30px 0}button,a{font:600 12px Arial;color:#ddd4c0}.native-active-label{color:#050505!important}.small{height:26px;padding:0 10px;border:1px solid #345}#loadouts button{width:26px;padding:0}#inventory-tool{width:28px;height:28px}</style>${fixture}</html>`);
    const baseline=await page.evaluate(ids=>ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.x,r.y,r.width,r.height]}),ids);
    await page.addScriptTag({content:`(()=>{${renderer};window.decorate=decorateCompactButtons;window.clearCompact=clearCompactButtons;window.nativeRefs=[...document.querySelectorAll('button,a')].map(el=>[el,el.firstChild]);window.clickCount=0;document.getElementById('list').addEventListener('click',()=>window.clickCount++);decorateCompactButtons();})()`});
    const after=await page.evaluate(ids=>ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.x,r.y,r.width,r.height]}),ids);
    assert.deepEqual(after,baseline,`${theme}: adding art must preserve all native dimensions`);
    assert.equal(await page.locator('#unrelated').getAttribute('data-iw-compact-button'),null);
    assert.equal(await page.locator('#inventory-tool').getAttribute('data-iw-compact-button'),null);
    assert.equal(await page.locator('[data-iw-compact-layer]').count(),54);
    assert.notEqual(await page.locator('#nav-label').evaluate(el=>getComputedStyle(el).color),'rgb(5, 5, 5)',`${theme}: active nav label must remain readable over compact artwork`);
    await page.evaluate(()=>{window.decorate();window.decorate();});
    assert.equal(await page.locator('[data-iw-compact-layer]').count(),54,'reconciliation must not duplicate layers');

    const metrics=await page.evaluate(async({src,index})=>{
      const im=new Image();im.src=src;await im.decode();const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;const c=canvas.getContext('2d');c.drawImage(im,0,0);
      const result={size:[im.width,im.height],groups:[]};
      for(const kind of ['text','icon']) {
        const entries=index.states.map(s=>index.entries.find(e=>e.key===kind+'-'+s));
        const data=entries.map(e=>c.getImageData(e.x,e.y,e.width,e.height).data);
        let mismatch=0,opaque=0,delta=0,maxCentre=0;
        for(let i=0;i<data[0].length;i+=4){if(data[0][i+3]!==data[1][i+3]||data[0][i+3]!==data[2][i+3])mismatch++;if(data[0][i+3]>128){opaque++;for(let ch=0;ch<3;ch++)delta+=Math.abs(data[1][i+ch]-data[2][i+ch]);}}
        const e=entries[1];for(let y=Math.floor(e.height*.3);y<e.height*.7;y++)for(let x=Math.floor(e.width*.25);x<e.width*.75;x++){let i=(y*e.width+x)*4;maxCentre=Math.max(maxCentre,.2126*data[1][i]+.7152*data[1][i+1]+.0722*data[1][i+2]);}
        result.groups.push({kind,mismatch,opaque,delta:delta/opaque/3,maxCentre});
      }return result;
    },{src:`/${dir}/${theme}.png`,index});
    assert.deepEqual(metrics.size,[index.width,index.height]);
    for(const m of metrics.groups){assert.equal(m.mismatch,0,`${theme}/${m.kind}: alpha changed between states`);assert.ok(m.opaque>10000);assert.ok(m.delta>5,`${theme}/${m.kind}: states need visible rim differences`);assert.ok(m.maxCentre<60,`${theme}/${m.kind}: hover centre too bright (${m.maxCentre})`);}

    for(const id of ids){
      await page.mouse.move(1000,800);await page.evaluate(()=>document.activeElement?.blur());
      const el=page.locator('#'+id),bounds=await el.evaluate(box);
      const idle=el.locator('[data-iw-compact-layer="idle"]'),hover=el.locator('[data-iw-compact-layer="hover"]'),pressed=el.locator('[data-iw-compact-layer="clicked"]');
      assert.match(await idle.evaluate(e=>getComputedStyle(e).backgroundImage),new RegExp(`${theme}\\.png`));
      const idleShot=(await el.screenshot()).toString('base64');
      await el.hover();assert.equal(await hover.evaluate(e=>getComputedStyle(e).opacity),'1');
      const hoverShot=(await el.screenshot()).toString('base64');
      await page.mouse.down();assert.equal(await pressed.evaluate(e=>getComputedStyle(e).opacity),'1');
      const pressedShot=(await el.screenshot()).toString('base64');
      assert.deepEqual(await el.evaluate(box),bounds,`${theme}/${id}: state changes must not move the control`);
      assert.notEqual(idleShot,hoverShot,`${theme}/${id}: hover not visible`);assert.notEqual(hoverShot,pressedShot,`${theme}/${id}: press not visible`);
      await page.mouse.up();
    }
    assert.ok(await page.evaluate(()=>window.clickCount>0),'native handler must still receive clicks');
    assert.notEqual(await page.locator('#one [data-iw-compact-layer="idle"]').evaluate(e=>getComputedStyle(e).boxShadow),'none','loadout selection must paint above the atlas');
    assert.equal(await page.locator('#two [data-iw-compact-layer="idle"]').evaluate(e=>getComputedStyle(e).boxShadow),'none');
    await page.evaluate(()=>{document.getElementById('one').setAttribute('aria-pressed','false');document.getElementById('two').setAttribute('aria-pressed','true');window.decorate();});
    assert.equal(await page.locator('#one').getAttribute('data-iw-compact-selected'),null);
    assert.equal(await page.locator('#two').getAttribute('data-iw-compact-selected'),'true');
    assert.equal(await page.locator('#nav').evaluate(e=>getComputedStyle(e,'::after').height),'2px','selected navigation underline remains');
    assert.match(await page.locator('#toolkit').evaluate(e=>getComputedStyle(e,'::after').content),/↗/,'Toolkit arrow remains');
    assert.equal(await page.locator('#equipped').evaluate(e=>getComputedStyle(e).color),await page.locator('#equipped').evaluate(e=>{const s=document.createElement('span');s.style.color='var(--iw-good)';e.append(s);const c=getComputedStyle(s).color;s.remove();return c;}));
    await page.locator('#prev').hover({force:true});await page.mouse.down();
    assert.equal(await page.locator('#prev [data-iw-compact-layer="hover"]').evaluate(e=>getComputedStyle(e).opacity),'0');
    await page.mouse.up();
    if(theme==='tempest-oceanic') {await page.mouse.move(1000,800);await mkdir(resolve(root,'tmp/compact-button-check'),{recursive:true});await page.screenshot({path:resolve(root,'tmp/compact-button-check/controls.png')});}
    console.log(`${theme}: all 18 controls, stable bounds, dark hover centres and six aligned sprites verified`);
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.mouse.move(1000,800);await page.evaluate(()=>document.activeElement?.blur());
  const el=page.locator('#list');await el.hover();
  const midway=await el.locator('[data-iw-compact-layer="hover"]').evaluate(e=>{const a=e.getAnimations()[0];a.pause();a.currentTime=80;return {opacity:Number(getComputedStyle(e).opacity),duration:a.effect.getTiming().duration,property:a.transitionProperty};});
  assert.ok(midway.opacity>0&&midway.opacity<1);assert.equal(midway.duration,180);assert.equal(midway.property,'opacity');
  await el.locator('[data-iw-compact-layer="hover"]').evaluate(e=>e.getAnimations().forEach(a=>a.finish()));
  await page.mouse.down();
  const press=await el.locator('[data-iw-compact-layer="clicked"]').evaluate(e=>{const a=e.getAnimations()[0];a.pause();a.currentTime=30;return {opacity:Number(getComputedStyle(e).opacity),duration:a.effect.getTiming().duration};});
  assert.ok(press.opacity>0&&press.opacity<1);assert.equal(press.duration,70);
  await page.mouse.up();await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await el.locator('[data-iw-compact-layer="hover"]').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  await page.evaluate(()=>{document.getElementById('list').replaceChildren('List');window.decorate();});
  assert.equal(await el.locator('[data-iw-compact-layer]').count(),3,'React content replacement must restore artwork');
  await page.evaluate(()=>window.clearCompact());
  assert.equal(await page.locator('[data-iw-compact-layer],[data-iw-compact-button]').count(),0);
  assert.ok(await page.evaluate(()=>window.nativeRefs.every(([el,child])=>el.isConnected&&(el.id==='list'||el.firstChild===child))),'native nodes and content must survive teardown');
  SkillsArtService.clearThemeVariables(host);assert.equal(host.style.getPropertyValue('--iw-compact-atlas'),'');assert.equal(host.dataset.iwCompactAtlas,undefined);
  console.log('Compact-button transitions, native events, reconciliation, accessibility and teardown verified.');
} finally {await browser.close();}
