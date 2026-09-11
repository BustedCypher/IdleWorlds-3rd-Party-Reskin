import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const compiled = await build({
  stdin: { contents: `import {decorateWorldBossPanel,clearWorldBossPanel} from './src/modules/WorldBossPanels.js';
    const root=document.querySelector('.panel');
    window.decorate=()=>decorateWorldBossPanel({root,heading:root.querySelector('h2')});
    window.clear=()=>clearWorldBossPanel(root);
    window.setControl=team=>{
      document.querySelector('#title').textContent=team==='contested'?'⚔️ Zone 12 — Race to capture!':(team==='red'?'🔴 Red':'🔵 Blue')+' Team controls Zone 12';
      document.querySelector('#protection').textContent=team==='contested'?'':'Protected for 1h 4m';
      window.decorate();
    };
    window.decorate();`, resolveDir: root },
  bundle: true, write: false, format: 'iife', loader: { '.css': 'text' }
});
let css = '';
for (const name of ['base','tooltip-engine','inventory','skillpanel','header','overlay','ui-system']) {
  css += await readFile(resolve(root, 'src/styles', name + '.css'), 'utf8');
}
css = css.replaceAll('../assets/', '/assets/');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
*{box-sizing:border-box}body{margin:0;padding:12px;background:#090b08;color:#dfd8c8;font-family:Barlow,sans-serif}
.panel{max-width:960px;margin:auto;padding:12px;background:#0e100c}p{margin:0}h2{font:700 20px Cinzel,serif;margin:0 0 10px}
.flex{display:flex;justify-content:space-between;gap:12px}
:root{--iw-th-edge:#776b43;--iw-th-ground-a:#12130f;--iw-th-ground-b:#090b08;--iw-th-ground-wash:transparent;--iw-th-hairline-hi:#c6ab61;--iw-font-head:Cinzel,serif;--iw-font-body:Barlow,sans-serif}
@media(max-width:600px){body{padding:5px}.panel{padding:5px}}
</style></head><body><main class="panel"><h2>World Bosses</h2>
<div class="compact-panel"><div class="flex"><p id="title">⚔️ Zone 12 — Race to capture!</p><p id="protection"></p></div>
<div class="team-strength"><span class="bg-red-500"></span><div class="rounded-full"><div style="width:84.16%"></div></div><p id="red-strength">4,208</p></div>
<div class="team-strength"><span class="bg-blue-500"></span><div class="rounded-full"><div style="width:100%"></div></div><p id="blue-strength">5,000</p></div>
<button>Last battle participants</button></div></main><script>${compiled.outputFiles[0].text}</script><script>
if (new URLSearchParams(location.search).has('demo')) {
  const states = ['contested', 'red', 'contested', 'blue'];
  let index = 0;
  setInterval(() => window.setControl(states[++index % states.length]), 4200);
}
</script></body></html>`;
await mkdir(resolve(root,'output'), { recursive: true });
await writeFile(resolve(root,'output/zone-motion-preview.html'), html);
const browser = await chromium.launch();
const errors = [];
async function createPage(options = {}) {
  const context = await browser.newContext({ viewport:{width:1000,height:430}, ...options });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*',async route=>{
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({contentType:'text/html',body:html});
    if (path.startsWith('/assets/')) {
      const file=resolve(root,path.slice(1));
      return route.fulfill({body:await readFile(file),contentType:file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':'font/woff2'});
    }
    return route.abort();
  });
  await page.goto('http://ward-preview.local/');
  await page.waitForSelector('.iw-control-crest-art');
  await page.evaluate(()=>document.fonts.ready);
  return {context,page};
}
try {
  const {context,page} = await createPage();
  const state = () => page.evaluate(() => {
    const style=(s,p)=>getComputedStyle(document.querySelector(s),p);
    return {
      art:['red','blue','contested'].map(t=>Number(style('.iw-control-crest-art-'+t).opacity)),
      artImages:['red','blue','contested'].map(t=>style('.iw-control-crest-art-'+t).backgroundImage),
      capturedGem:['red','blue'].map(t=>({
        blend:style('.iw-control-crest-art-'+t,'::after').mixBlendMode,
        clip:style('.iw-control-crest-art-'+t,'::after').clipPath
      })),
      aura: {
        opacity:Number(style('.iw-control-crest','::before').opacity),
        play:style('.iw-control-crest','::before').animationPlayState,
        name:style('.iw-control-crest','::before').animationName,
        color:style('.iw-control-crest').getPropertyValue('--iw-control-aura').trim()
      },
      sword:['red','blue'].map(t=>({duration:style('.iw-control-sword-energy-'+t,'::before').animationDuration,delay:style('.iw-control-sword-energy-'+t,'::before').animationDelay,play:style('.iw-control-sword-energy-'+t,'::before').animationPlayState})),
      swordVisibility: {
        opacity: Number(style('.iw-control-sword-energy-red').opacity),
        filamentWidth: parseFloat(style('.iw-control-sword-energy-red','::before').width) / parseFloat(style('.iw-control-sword-energy-red').width),
        filamentFilter: style('.iw-control-sword-energy-red','::before').filter
      },
      core:style('.iw-control-crystal-core','::before').transform,
      coreOpacity:style('.iw-control-crystal-core','::before').opacity,
      coreEase:style('.iw-control-crystal-core','::before').animationTimingFunction,
      battleOpacity:Number(style('.iw-control-crystal-core').opacity),
      light:style('.iw-control-crest-art-red','::after').opacity,
      lightPlay:style('.iw-control-crest-art-red','::after').animationPlayState,
      crest:style('.iw-control-crest').transform
    };
  });
  const first = await state();
  const crestTop = (await page.locator('.iw-control-crest').boundingBox()).y;
  assert.notEqual(first.sword[0].duration,first.sword[1].duration,'swords must not share a loop duration');
  assert.notEqual(first.sword[0].delay,first.sword[1].delay,'swords must start on different phases');
  assert.equal(new Set(first.artImages).size,1,'captured and contested states must use the exact same crest artwork');
  assert.ok(first.capturedGem.every(g=>g.blend==='color' && g.clip!=='none'),'captured states must recolor only the clipped central gem');
  assert.equal(first.aura.opacity,0,'contested wards must not show a captured-team aura');
  assert.equal(first.aura.play,'paused','contested wards must pause the captured-team aura');
  assert.ok(first.swordVisibility.opacity >= .82,'contested sword energy must be plainly visible');
  assert.ok(first.swordVisibility.filamentWidth >= .45,'traveling sword filaments must occupy enough of the blade to read clearly');
  assert.match(first.swordVisibility.filamentFilter,/drop-shadow/,'sword filaments must carry a luminous edge');
  assert.ok(!first.coreEase.includes('steps'),'crystal light must interpolate continuously');
  await page.waitForFunction(initial => getComputedStyle(document.querySelector('.iw-control-crystal-core'),'::before').transform !== initial, first.core, { timeout: 2000 });
  const flowing = await state();
  assert.notEqual(first.core,flowing.core,'energy must move spatially inside the crystal');
  assert.ok(Number(flowing.coreOpacity)>.3,'crystal energy never blinks off');
  assert.equal(flowing.crest,'none','base crest never breathes or moves');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const beforeMetrics = (await cdp.send('Performance.getMetrics')).metrics;
  await page.waitForTimeout(600);
  const afterMetrics = (await cdp.send('Performance.getMetrics')).metrics;
  const metric = (list,name) => list.find(m=>m.name===name).value;
  assert.equal(metric(afterMetrics,'LayoutCount')-metric(beforeMetrics,'LayoutCount'),0,'steady ward motion must not cause layout work');
  await cdp.detach();
  await page.evaluate(()=>window.setControl('red'));
  await page.waitForTimeout(220);
  const during = await state();
  assert.equal(await page.locator('#title').evaluate(el=>el.parentElement.dataset.iwBossRole),'header','a protection timer must not replace the header role and make the crest jump');
  assert.ok(Math.abs((await page.locator('.iw-control-crest').boundingBox()).y-crestTop)<1,'desktop capture must keep the crest vertically anchored');
  assert.ok(during.art[0]>0 && during.art[0]<1 && during.art[2]>0 && during.art[2]<1,'capture must show both artworks mid-crossfade');
  assert.ok(during.battleOpacity>0 && during.battleOpacity<.65,'battle energy fades away on capture');
  assert.equal(during.aura.play,'running','captured wards slowly pulse a background aura');
  assert.equal(during.aura.name,'iw-control-captured-aura');
  assert.equal(during.aura.color,'255, 48, 36','red control supplies the crimson aura color');
  // Reverse before the first capture completes. No timeout may later restore
  // an obsolete state, and no new artwork layers may accumulate.
  await page.evaluate(()=>window.setControl('blue'));
  await page.waitForTimeout(150);
  assert.equal((await state()).aura.color,'36, 142, 255','blue control supplies the azure aura color');
  await page.evaluate(()=>window.setControl('contested'));
  await page.waitForTimeout(1400);
  assert.deepEqual((await state()).art,[0,0,1],'rapid interruptions settle on the latest state');
  assert.equal(await page.locator('.iw-control-crest-art').count(),3);
  await page.evaluate(()=>window.setControl('red'));
  await page.waitForTimeout(1400);
  const resting = await state();
  assert.deepEqual(resting.art,[1,0,0]);
  assert.equal(resting.battleOpacity,0);
  assert.ok(resting.sword.every(s=>s.play==='paused'),'battle loops pause in controlled state');
  assert.equal(resting.lightPlay,'running','controlled crystal retains ambient light');
  assert.equal(await page.locator('.team-strength').evaluateAll(rows=>rows.every(row=>getComputedStyle(row).display==='none')),true,'native strength rows must stay hidden if they outlive the capture update');
  await page.waitForTimeout(350);
  assert.notEqual((await state()).light,resting.light,'controlled gem light actually breathes');
  await page.evaluate(()=>{
    window.setControl('contested');
    document.querySelector('#red-strength').textContent='5,000';window.decorate();
  });
  assert.equal(await page.locator('.iw-control-meter-track').getAttribute('aria-valuenow'),'50');
  await page.setViewportSize({width:390,height:700});
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile has no horizontal overflow');
  assert.ok((await state()).swordVisibility.opacity >= .55,'mobile sword energy remains visible without restoring the secondary layer');
  assert.equal(await page.locator('.iw-control-crystal-core').evaluate(el=>getComputedStyle(el,'::after').display),'none','mobile omits secondary light layers');
  await page.locator('[data-iw-encounter="zone"]').screenshot({path:resolve(root,'output/zone-motion-mobile.png')});
  // Live preference changes must suppress active effects, including tick impacts.
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{document.querySelector('#red-strength').textContent='4,208';window.decorate();});
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.iw-control-dominion').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'reduced motion stops all active ward animations');
  await page.evaluate(()=>window.setControl('blue'));
  assert.deepEqual((await state()).art,[0,1,0],'reduced motion captures immediately');
  await page.evaluate(()=>window.clear());
  assert.equal(await page.locator('.iw-control-dominion').count(),0,'teardown removes all motion layers');
  await context.close();
  if (process.argv.includes('--record')) {
    const {context,page} = await createPage({recordVideo:{dir:resolve(root,'output/motion-recording'),size:{width:1000,height:430}}});
    await page.waitForTimeout(1800);
    await page.locator('[data-iw-encounter="zone"]').screenshot({path:resolve(root,'output/zone-motion-desktop.png')});
    await page.waitForTimeout(4200);
    await page.evaluate(()=>{document.querySelector('#red-strength').textContent='3,200';window.decorate();});
    await page.waitForTimeout(1800);
    await page.evaluate(()=>window.setControl('red'));
    await page.waitForTimeout(6500);
    await page.evaluate(()=>window.setControl('contested'));
    await page.waitForTimeout(2300);
    await page.evaluate(()=>window.setControl('blue'));
    await page.waitForTimeout(5000);
    const video=page.video();
    await context.close();
    await video.saveAs(resolve(root,'output/zone-control-organic-motion.webm'));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS ward motion: irregular flow, continuous crystal, interrupted crossfades, controlled ambient light, mobile, reduced motion, teardown');
} finally { await browser.close(); }
