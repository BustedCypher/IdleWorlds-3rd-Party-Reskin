import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const ROOT=resolve(import.meta.dirname,'..');
const bundle=await readFile(resolve(ROOT,'dist/content.bundle.js'),'utf8');
const NOTE='Out of skips - they reset daily at 00:00 UTC, or completing (not skipping) a work order refills them to your daily max right away.';
const CARD='<div class="compact-panel p-2.5" id="quest"><div class="space-y-2">'
 +'<div class="flex items-start justify-between gap-3"><div class="min-w-0 flex-1">'
 +'<p>Tailoring Work Order</p><p>Craft 1 Moonsilk Boots for the tailor.</p>'
 +'<p>Moonsilk Boots 0/1</p><p>Reward: +3,870g &bull; +3240 tailoring XP</p></div>'
 +'<div class="flex shrink-0 flex-col gap-2"><button>Turn In</button><button>Skip (0)</button></div></div>'
 +'<p id="skip-note">'+NOTE+'</p>'
 +'<div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-emerald-400" style="width:0%"></div></div>'
 +'<div>0% complete</div></div></div>';
const PAGE='<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><style>'
 +'*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0}button{font:inherit;color:inherit;background:none}.panel{padding:8px}'
 +'.flex{display:flex}.flex-col{flex-direction:column}.items-start{align-items:flex-start}.justify-between{justify-content:space-between}'
 +'.gap-2{gap:.5rem}.gap-3{gap:.75rem}.flex-1{flex:1 1 0%}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}'
 +'</style></head><body><div id="root"><header><div><h1>Player</h1><p>Combat Lv 62</p></div></header>'
 +'<nav><button>Game</button></nav><div><p>Zone 19: Eternium Verge</p><button>Zones</button></div>'
 +'<div class="panel"><h2>Quests</h2>'+CARD+'</div></div><script>'+bundle+'</'+'script></body></html>';
const MIME={'.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const PAGE_URL='http://iw.test/quest-skip-note.html';
async function serve(page){await page.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.origin!=='http://iw.test')return route.abort();
 if(u.pathname==='/quest-skip-note.html')return route.fulfill({contentType:'text/html',body:PAGE});
 try{return route.fulfill({contentType:MIME[extname(u.pathname)]||'application/octet-stream',body:await readFile(resolve(ROOT,u.pathname.slice(1)))})}
 catch{return route.fulfill({status:404,body:''})}
});}
const browser=await chromium.launch({args:['--headless=new','--no-sandbox','--disable-dev-shm-usage'],ignoreDefaultArgs:['--headless=old'],timeout:120000});
let failures=0;const errors=[];
const check=(label,cond,detail='')=>{if(cond)console.log('  ok    '+label);else{failures++;console.log('  FAIL  '+label+(detail?' — '+detail:''));}};
for(const width of [360,1100]){
 const page=await browser.newPage({viewport:{width,height:900}});
 page.on('pageerror',e=>errors.push(String(e)));await serve(page);
 await page.goto(PAGE_URL,{waitUntil:'load',timeout:60000});
 await page.waitForFunction(()=>document.getElementById('quest')?.classList.contains('fs-quest-panel'),null,{timeout:20000});
 await page.waitForTimeout(250);
 const r=await page.evaluate(()=>{
  const q=s=>document.querySelector(s);
  const box=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
  const body=q('#quest [data-iw-quest-zone="body"]'),note=q('#skip-note');
  const host=note?.closest('[data-iw-quest-zone="skip-note"]');
  const cs=body?getComputedStyle(body):null,br=body?box(body):null;
  return{role:note?.getAttribute('data-iw-quest-role')||'',host:!!host,body:br,note:note?box(note):null,
   sigil:q('#quest .fs-quest-sigil')?box(q('#quest .fs-quest-sigil')):null,
   commands:q('#quest [data-iw-quest-zone="commands"]')?box(q('#quest [data-iw-quest-zone="commands"]')):null,
   label:q('#quest [data-iw-quest-role="progress-label"]')?box(q('#quest [data-iw-quest-role="progress-label"]')):null,
   innerLeft:br&&cs?br.left+parseFloat(cs.paddingLeft):0,innerRight:br&&cs?br.right-parseFloat(cs.paddingRight):0};
 });
 const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
 console.log('\n@'+width+'px');
 check('helper has skip-note role',r.role==='skip-note',r.role||'(none)');
 check('helper direct host owns skip-note zone',r.host);
 if(r.note&&r.body){
  check('note starts at the body content edge',Math.abs(r.note.left-r.innerLeft)<=2,r.note.left.toFixed(1)+' vs '+r.innerLeft.toFixed(1));
  check('note spans both inner grid columns',Math.abs(r.note.right-r.innerRight)<=2,r.note.right.toFixed(1)+' vs '+r.innerRight.toFixed(1));
 }
 if(r.note&&r.label)check('note sits below the progress label',r.note.top>=r.label.bottom-1,'note top '+r.note.top.toFixed(1)+', label bottom '+r.label.bottom.toFixed(1));
 if(r.note&&r.sigil)check('note does not overlap the sigil',!overlap(r.note,r.sigil));
 if(r.note&&r.commands)check('note does not overlap the command rail',!overlap(r.note,r.commands));
 await page.close();
}
await browser.close();
if(errors.length){failures++;console.log('pageerrors: '+errors.join(' | '));}
if(failures){console.error('FAIL quest-skip-note-layout — '+failures+' check(s) failed');process.exit(1);}
console.log('\nPASS quest-skip-note-layout');
