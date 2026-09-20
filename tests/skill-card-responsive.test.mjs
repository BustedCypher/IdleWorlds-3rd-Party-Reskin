import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const bundle = await readFile(resolve(ROOT, 'dist/content.bundle.js'), 'utf8');
const LUCIDE = d => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide h-4 w-4"><path d="${d}"/></svg>`;
const PAGER = `<div><button>${LUCIDE('m15 18-6-6 6-6')}</button><button>${LUCIDE('m9 18 6-6-6-6')}</button></div>`;
const card = ({ id, skill, level, title, verb, materials, requirement, pagerBranch='content' }) => `
<div class="compact-panel" id="${id}">
 <div class="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
  <div><p>◆ ${skill}</p><p>LV ${level}</p></div>
  <div><p>${title}</p><button>Lv ${level} - 41.1% • 4,120 to go</button>
   ${materials ? `<p>Materials: ${materials}</p>` : ''}
   ${requirement ? `<p class="text-red-400">${requirement}</p>` : ''}
   ${pagerBranch === 'content' ? PAGER : ''}
  </div>
  <div>${pagerBranch === 'commands' ? PAGER : ''}<button>${verb}</button></div>
 </div>
</div>`;
const STRESS = card({ id:'stress', skill:'Jewelcrafting', level:'57+2',
 title:'Craft Lapis Amulet', verb:'Craft',
 materials:'• Lapis 0/2 • Moonstone 218,014,373/221,276,974 • Sapphire 4/2 • Topaz 7/2',
 requirement:'Requires Jewelcrafting Lv 73 and Mining Lv 69' });const DENSE = card({ id:'dense', skill:'Construction', level:'56',
 title:'Craft Sunforged Building Parts', verb:'Craft Parts', pagerBranch:'commands',
 materials:'• Moonsteel Building Parts 1220/2800 • Moonwood 35940/19600 • Moonsteel Ore 58097/9800 • Mythril Building Parts 152/200 • Aethersteel Building Parts 1/400 • Bloodstone Building Parts 0/520',
 requirement:'Requires Construction Lv 80 and Woodcutting Lv 70' });
const PAGE = `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}.grid{display:grid}.gap-2{gap:.5rem}button{font:inherit;color:inherit;background:none}body{margin:0;background:#0f172a}.panel{padding:8px}</style>
</head><body><div id="root"><header><div><h1>Player</h1><p>Combat Lv 62</p></div></header>
<nav><button>Game</button></nav>
<div class="panel"><div><p>Zone 19: Eternium Verge</p><div><button>Zones</button><button>Next Zone</button></div></div></div>
<div class="panel"><h2>Skill Actions</h2>${STRESS}${DENSE}</div></div><script>${bundle}</` + `script></body></html>`;
const MIME={'.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const ORIGIN='http://iw.test';
const WIDTHS=[1024,900,820,768,745,700,640,600,581,580,560,520,500,481,480,460,440,430,412,390,375,360,344,330,320];
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1024,height:1400}});
const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.origin!==ORIGIN)return route.abort();
 if(u.pathname==='/'||u.pathname.endsWith('.html'))return route.fulfill({contentType:'text/html; charset=utf-8',body:PAGE});
 try{return route.fulfill({contentType:MIME[extname(u.pathname)]||'application/octet-stream',body:await readFile(resolve(ROOT,u.pathname.slice(1)))})}
 catch{return route.fulfill({status:404,body:''})}
});await page.goto(ORIGIN+'/',{waitUntil:'load'});
await page.waitForSelector('#dense[data-iw-skill-v2="1"]',{timeout:8000});
await page.waitForTimeout(700);
const failures=[];
for(const width of WIDTHS){
 await page.setViewportSize({width,height:1600});
 await page.waitForTimeout(120);
 const audit=await page.evaluate(()=>{
  const rect=e=>{const b=e?.getBoundingClientRect();return b?{x:b.x,y:b.y,r:b.right,b:b.bottom,w:b.width,h:b.height}:null};
  const overlap=(a,b)=>a&&b&&Math.min(a.r,b.r)-Math.max(a.x,b.x)>1&&Math.min(a.b,b.b)-Math.max(a.y,b.y)>1;
  const paintedOverflow=e=>{if(!e)return 0;const b=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);
    const rs=[...range.getClientRects()]; if(!rs.length)return 0;
    return Math.max(0,...rs.map(r=>r.right-b.right),...rs.map(r=>b.left-r.left));};
  return ['stress','dense'].map(id=>{
   const c=document.getElementById(id), q=s=>c.querySelector(s);
   const rows=[...c.querySelectorAll('.iw-skill-v2-body-row[data-iw-skill-v2-body-kind="material"]')];
   const title=rect(q('[data-iw-skill-role="action-title"]')), chip=rect(q('.fs-skill-base-exp'));
   const button=rect(q('[data-iw-skill-role="action-button"]')), nav=rect(q('[data-iw-skill-role="nav-group"]'));
   const body=rect(q('[data-iw-skill-v2-body]')), note=rect(q('[data-iw-skill-v2-req-note]'));
   const card=rect(c), label=q('.iw-skill-v2-action-label');
   const countOverflow=rows.map(r=>Math.max(paintedOverflow(r),...([...r.children].map(paintedOverflow))));
   return {id,card,body,note,button,nav,title,chip,
    maxMaterialOverflow:countOverflow.length?Math.max(...countOverflow):0,
    titleCollision:overlap(title,button)||overlap(title,nav)||overlap(chip,button)||overlap(chip,nav),
    bodyOutside:body?body.x<card.x-1||body.r>card.r+1:false,
    noteOutside:note?note.x<card.x-1||note.r>card.r+1:false,
    labelFont:label?parseFloat(getComputedStyle(label).fontSize):0,
    pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
 });
 for(const row of audit){
   if(row.maxMaterialOverflow>1) failures.push(`${width}px ${row.id}: material paint overflow ${row.maxMaterialOverflow.toFixed(1)}px`);
   if(row.titleCollision) failures.push(`${width}px ${row.id}: title/BASE collides with command controls`);
   if(row.bodyOutside) failures.push(`${width}px ${row.id}: body escapes card`);
   if(row.noteOutside) failures.push(`${width}px ${row.id}: requirement escapes card`);
   if(row.pageOverflow>2) failures.push(`${width}px ${row.id}: document horizontal overflow ${row.pageOverflow}px`);
 }
}
await browser.close();
if(errors.length) failures.push(...errors.map(e=>'pageerror: '+e));
if(failures.length) console.error(failures.join('\n'));
else console.log(`PASS responsive skill-card matrix (${WIDTHS.length} widths × 2 stress cards)`);
assert.equal(failures.length,0,`${failures.length} responsive skill-card invariant failure(s)`);