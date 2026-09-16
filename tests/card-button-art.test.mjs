import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(root, 'dist/content.bundle.js'), 'utf8');
const themes = ['forged-metal', 'infernal', 'glacial', 'celestial', 'lunar-spectral', 'runic-arcane', 'tempest-oceanic', 'verdant', 'voidborn'];
const index = JSON.parse(await readFile(resolve(root,'assets/skills-ui/buttons/card-v6/index.json'),'utf8'));
assert.deepEqual(index.themes,themes);
assert.equal(index.entries.length,54);
for(const entry of index.entries) {
  const atlas=index.atlases[entry.kind];
  assert.ok(entry.x>=0 && entry.y>=0 && entry.x+entry.width<=atlas.width && entry.y+entry.height<=atlas.height,'registered sprite stays inside its sheet');
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*,::before,::after{box-sizing:border-box;border:0 solid}button{font:inherit;color:inherit}
body{margin:0;background:#09090c}.panel{padding:8px}.grid{display:grid}.gap-2{gap:.5rem}
</style></head><body><div id="root" data-skin="default">
<header><div><h1>Player</h1><p>Combat Lv 62</p></div><div><button>S</button></div></header><nav><button>Game</button></nav>
<div id="zone-bar-panel" class="panel"><div><p>Zone 19: Eternium Verge</p></div><div><button>Zones</button><button>Next Zone</button></div></div>
<div id="panel-column" style="display:flex;flex-direction:column;gap:12px"><div class="panel" id="skill-actions"><h2>Skill Actions</h2><div class="compact-panel" id="card">
<div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
<div><p>💎 Jewelcrafting</p><p>LV 70</p></div>
<div><p>Prospect Eternium Ore</p><button>Lv 70 - 50.8% • 4,120 to go</button>
<p>Materials: • Eternium Ore 63489/2</p><p>Base reward: +720 jewelcrafting XP/task</p></div>
<div><div><button id="prev">‹</button><button id="next">›</button></div><button id="action"><span>Prospect</span></button></div>
</div></div></div></div></div><script>${bundle}</script></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1180,height:500}});
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://buttons.test') return route.abort();
  if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:html});
  try { await route.fulfill({contentType:({'.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2'})[extname(url.pathname)] || 'text/plain',body:await readFile(resolve(root,url.pathname.slice(1)))}); }
  catch { await route.fulfill({status:404,body:''}); }
});
const paint = id => page.locator(id).evaluate(el => {
  const s = getComputedStyle(el), before = getComputedStyle(el,'::before'), after = getComputedStyle(el,'::after');
  const b = el.getBoundingClientRect();
  return {image:s.backgroundImage,position:s.backgroundPosition,border:s.borderTopWidth,filter:s.filter,
    hover:before.backgroundImage,hoverOpacity:before.opacity,pressed:after.backgroundImage,pressedOpacity:after.opacity,
    box:[b.width,b.height],text:el.textContent};
});
try {
  await page.goto('http://buttons.test/');
  await page.waitForSelector('#card[data-iw-skill-v2="1"]');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#action')).backgroundImage.includes('card-v6/action-atlas.png'));
  await page.waitForTimeout(900);
  const decoded=await page.evaluate(async atlases=>Promise.all(Object.entries(atlases).map(async([kind,size])=>{
    const img=new Image();img.src='/assets/skills-ui/buttons/card-v6/'+kind+'-atlas.png';await img.decode();
    return img.naturalWidth===size.width && img.naturalHeight===size.height;
  })),index.atlases);
  assert.ok(decoded.every(Boolean),'both real graphic sheets decode at their registered dimensions');
  await page.evaluate(() => {
    window.originalAction=document.querySelector('#action');
    window.originalLabel=originalAction.firstChild;
    window.hits=0; originalAction.addEventListener('click',()=>window.hits++);
  });
  let lastPosition;
  for (const theme of themes) {
    await page.mouse.move(0,0);
    await page.evaluate(theme=>document.documentElement.dataset.iwZoneTheme=theme,theme);
    const idle = await paint('#action');
    assert.match(idle.image,/card-v6\/action-atlas.png/,`${theme}: square graphic must replace the coded frame`);
    assert.notEqual(idle.position,lastPosition,`${theme}: uses its own theme artwork`); lastPosition=idle.position;
    await page.locator('#action').hover(); await page.waitForTimeout(220);
    const hover = await paint('#action');
    assert.equal(hover.hoverOpacity,'1'); assert.match(hover.hover,/card-v6\/action-atlas.png/);
    await page.mouse.down(); await page.waitForTimeout(100);
    const pressed=await paint('#action'); assert.equal(pressed.pressedOpacity,'1');
    assert.deepEqual(pressed.box,idle.box,'press must not move the layout');
    await page.mouse.up();
    for(const id of ['#prev','#next']) {
      await page.mouse.move(0,0); const nav=await paint(id);
      assert.match(nav.image,/card-v6\/nav-atlas.png/);
      await page.locator(id).hover(); const hot=await paint(id);
      assert.notEqual(hot.position,nav.position,'arrow has a distinct hover graphic');
      await page.mouse.down(); const down=await paint(id);
      assert.notEqual(down.position,hot.position,'arrow has a distinct pressed graphic');
      assert.deepEqual(down.box,nav.box); await page.mouse.up();
    }
  }
  await page.mouse.move(0,0);
  await page.evaluate(()=>{const f=document.createElement('span'); f.style.width='40%'; f.id='fill'; originalAction.append(f);});
  await page.waitForTimeout(500);
  const fill = await page.locator('#fill').evaluate(el=>({width:el.style.width,bg:getComputedStyle(el).backgroundImage,z:getComputedStyle(el).zIndex,clip:getComputedStyle(el).clipPath}));
  assert.equal(fill.width,'40%'); assert.match(fill.bg,/linear-gradient/); assert.notEqual(fill.clip,'none');
  assert.equal(await page.locator('#action').textContent(),'Prospect');
  assert.equal(await page.evaluate(()=>originalAction===document.querySelector('#action') && originalLabel===originalAction.firstChild),true);
  await page.locator('#action').evaluate(el=>el.disabled=true); await page.locator('#action').hover(); await page.waitForTimeout(220);
  assert.equal((await paint('#action')).hoverOpacity,'0','disabled action stays idle');
  await page.locator('#action').evaluate(el=>el.disabled=false);
  await page.mouse.move(0,0);
  await page.keyboard.press('Tab');
  await page.locator('#action').focus(); await page.waitForTimeout(220);
  assert.equal((await paint('#action')).hoverOpacity,'1','keyboard focus shows the action hover artwork');
  for(const id of ['#prev','#next']) {
    await page.locator(id).focus();
    assert.equal(await page.locator(id).evaluate(el=>getComputedStyle(el).outlineWidth),'2px');
    await page.locator(id).evaluate(el=>el.disabled=true);
    const disabled=await paint(id); await page.locator(id).hover();
    assert.equal((await paint(id)).position,disabled.position,'disabled arrows retain idle artwork');
    await page.locator(id).evaluate(el=>el.disabled=false);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#fill').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  if(process.env.CAPTURE_BUTTONS) {
    await mkdir(resolve(root,'output/card-buttons'),{recursive:true});
    await page.locator('#card').screenshot({path:resolve(root,'output/card-buttons/in-context.png')});
  }
  for(const width of [1180,440,360]) {
    await page.setViewportSize({width,height:500}); await page.waitForTimeout(350);
    const extent=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
    const baseline=await page.evaluate(()=>{
      const style=[...document.querySelectorAll('style')].find(el=>el.textContent.includes('--iw-card-action-idle: transparent'));
      const text=style.textContent; const at=text.lastIndexOf('html[',text.indexOf('--iw-card-action-idle: transparent'));
      if(at<0) throw new Error('Cannot isolate new button sheet');
      style.textContent=text.slice(0,at); const baseline=document.documentElement.scrollWidth; style.textContent=text; return baseline;
    });
    assert.ok(extent.scroll <= baseline,`${width}px: buttons must not add page overflow`);
    assert.equal(await page.evaluate(()=>{
      const card=document.querySelector('#card').getBoundingClientRect();
      return ['action','prev','next'].every(id=>{const b=document.getElementById(id).getBoundingClientRect();return b.left>=card.left && b.right<=card.right && b.top>=card.top && b.bottom<=card.bottom;});
    }),true,`${width}px: controls stay inside the card`);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS card button artwork: nine themes, three states, both arrows, stable geometry, native content and progress, disabled, reduced motion, responsive');
  if(process.env.CAPTURE_BUTTONS) {
    await page.setViewportSize({width:1180,height:500}); await page.waitForTimeout(350);
    await mkdir(resolve(root,'output/card-buttons'),{recursive:true});
    await page.locator('#card').screenshot({path:resolve(root,'output/card-buttons/in-context.png')});
  }
} finally { await browser.close(); }
