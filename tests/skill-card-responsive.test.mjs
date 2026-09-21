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
const ONE_CONTENT = card({ id:'one-content', skill:'Jewelcrafting', level:'57+2',
 title:'Craft Lapis Ring', verb:'Craft', pagerBranch:'content', materials:'• Lapis 2/2' });
const SIX_CONTENT = card({ id:'six-content', skill:'Construction', level:'56',
 title:'Craft Building Parts', verb:'Craft Parts', pagerBranch:'content',
 materials:'• A 1/2 • B 2/3 • C 3/4 • D 4/5 • E 5/6 • F 6/7' });
const PAGE = `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IdleWorlds</title>
<style>*,::before,::after{box-sizing:border-box;border:0 solid}svg{display:block}.grid{display:grid}.gap-2{gap:.5rem}button{font:inherit;color:inherit;background:none}body{margin:0;background:#0f172a}.panel{padding:8px}</style>
</head><body><div id="root"><header><div><h1>Player</h1><p>Combat Lv 62</p></div></header>
<nav><button>Game</button></nav>
<div class="panel"><div><p>Zone 19: Eternium Verge</p><div><button>Zones</button><button>Next Zone</button></div></div></div>
<div class="panel"><h2>Skill Actions</h2>${STRESS}${DENSE}${ONE_CONTENT}${SIX_CONTENT}</div></div><script>${bundle}</` + `script></body></html>`;
const MIME={'.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const ORIGIN='http://iw.test';
/* Container queries use the card's content box. The rendered section frame and
   card borders mean 517/516 produce exact 481/480px container widths. */
const WIDTHS=[1024,900,820,768,745,700,640,600,581,580,560,520,517,516,500,481,480,460,440,430,412,390,375,360,344,330,320];
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
  return ['stress','dense','one-content','six-content'].map(id=>{
   const c=document.getElementById(id), q=s=>c.querySelector(s);
   const rows=[...c.querySelectorAll('.iw-skill-v2-body-row[data-iw-skill-v2-body-kind="material"]')];
   const title=rect(q('[data-iw-skill-role="action-title"]')), chip=rect(q('.fs-skill-base-exp'));
   const button=rect(q('[data-iw-skill-role="action-button"]')), nav=rect(q('[data-iw-skill-role="nav-group"]'));
   const actionLabel=rect(q('[data-iw-skill-v2-action-label]')), glyph=rect(q('[data-iw-skill-v2-action-glyph]'));
   const bodyEl=q('[data-iw-skill-v2-body]'), body=rect(bodyEl), note=rect(q('[data-iw-skill-v2-req-note]'));
   const card=rect(c), content=rect(q('[data-iw-skill-zone="content"]')), label=q('.iw-skill-v2-action-label');
   const countOverflow=rows.map(r=>Math.max(paintedOverflow(r),...([...r.children].map(paintedOverflow))));
   const labelRange=label?document.createRange():null; if(labelRange) labelRange.selectNodeContents(label);
   const labelRects=labelRange?[...labelRange.getClientRects()]:[];
   const gutter=bodyEl?(parseFloat(getComputedStyle(bodyEl).getPropertyValue('--iw-skill-v2-gutter'))||20):20;
   return {id,card,containerW:c.clientWidth,content,body,note,button,nav,actionLabel,glyph,title,chip,gutter,
    maxMaterialOverflow:countOverflow.length?Math.max(...countOverflow):0,
    titleCollision:overlap(title,button)||overlap(title,nav)||overlap(chip,button)||overlap(chip,nav),
    bodyOutside:body?body.x<card.x-1||body.r>card.r+1:false,
    noteOutside:note?note.x<card.x-1||note.r>card.r+1:false,
    noteBeforeBody:note&&body?note.y<body.b-1:false,
    pagerGap:nav&&button?nav.y-button.b:null,
    commandOutside:[actionLabel,button,nav].filter(Boolean).some(r=>r.x<card.x-1||r.r>card.r+1||r.y<card.y-1||r.b>card.b+1),
    labelOverflow:label?paintedOverflow(label):0,
    labelLines:labelRects.length?new Set(labelRects.map(r=>Math.round(r.top))).size:0,
    centralBody:body&&content?body.x>=content.x-1&&body.r<=content.r+1:false,
    fullWidthBody:body?body.w>=card.w-2*gutter-4:false,
    pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
 });
 const oneGap=audit.find(r=>r.id==='one-content')?.pagerGap;
 const sixGap=audit.find(r=>r.id==='six-content')?.pagerGap;
 const boundaryCardWidth=width===517?481:width===516?480:null;
 if(boundaryCardWidth!==null&&audit.some(r=>Math.abs(r.containerW-boundaryCardWidth)>.1))
   failures.push(`${width}px viewport did not produce the expected ${boundaryCardWidth}px card-container boundary (got ${audit.map(r=>r.containerW).join('/')})`);
 if(oneGap===null||oneGap===undefined||sixGap===null||sixGap===undefined||Math.abs(oneGap-sixGap)>0.5)
   failures.push(`${width}px content-branch pager gap differs: one=${oneGap} six=${sixGap}`);
 for(const row of audit){
   if(row.maxMaterialOverflow>1) failures.push(`${width}px ${row.id}: material paint overflow ${row.maxMaterialOverflow.toFixed(1)}px`);
   if(row.titleCollision) failures.push(`${width}px ${row.id}: title/BASE collides with command controls`);
   if(row.bodyOutside) failures.push(`${width}px ${row.id}: body escapes card`);
   if(row.noteOutside) failures.push(`${width}px ${row.id}: requirement escapes card`);
   if(row.noteBeforeBody) failures.push(`${width}px ${row.id}: requirement overlaps detail frame`);
   if(row.pagerGap !== null && (row.pagerGap < 6 || row.pagerGap > 10)) failures.push(`${width}px ${row.id}: button→pager gap ${row.pagerGap.toFixed(1)}px`);
   if(row.commandOutside) failures.push(`${width}px ${row.id}: command controls escape card`);
   if(row.labelOverflow > 1 || row.labelLines !== 1) failures.push(`${width}px ${row.id}: action label overflow ${row.labelOverflow.toFixed(1)}px lines=${row.labelLines}`);
   const labelGap=row.actionLabel&&row.button?row.button.y-row.actionLabel.b:null;
   if(!row.actionLabel || !row.button || row.actionLabel.x<row.button.x-1 || row.actionLabel.r>row.button.r+1
     || labelGap<3 || labelGap>5)
     failures.push(`${width}px ${row.id}: action label is not a single band above its button (gap=${labelGap})`);
   if(row.glyph&&row.button&&(Math.abs((row.glyph.x+row.glyph.w/2)-(row.button.x+row.button.w/2))>1
     || Math.abs((row.glyph.y+row.glyph.h/2)-(row.button.y+row.button.h/2))>1))
     failures.push(`${width}px ${row.id}: discipline icon is not centred inside the action button`);
   if(row.containerW > 480 && (!row.centralBody || !row.body || !row.title || Math.abs(row.body.x-row.title.x)>1))
     failures.push(`${width}px ${row.id}: detail frame is not left-aligned inside the centre column (body=${row.body?.x} title=${row.title?.x} content=${row.content?.x})`);
   if(row.containerW <= 480 && !row.fullWidthBody) failures.push(`${width}px ${row.id}: phone detail frame is not full width`);
   if(row.pageOverflow>2) failures.push(`${width}px ${row.id}: document horizontal overflow ${row.pageOverflow}px`);
 }
}

/* Touch devices change the pager token through (pointer: coarse). Verify the
   same geometry contract under an actual touch-capable browser context rather
   than assuming the desktop-pointer matrix covers it. */
const touchContext=await browser.newContext({viewport:{width:390,height:1600},hasTouch:true,isMobile:true});
const touchPage=await touchContext.newPage();
const touchErrors=[]; touchPage.on('pageerror',e=>touchErrors.push(String(e)));
await touchPage.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.origin!==ORIGIN)return route.abort();
 if(u.pathname==='/'||u.pathname.endsWith('.html'))return route.fulfill({contentType:'text/html; charset=utf-8',body:PAGE});
 try{return route.fulfill({contentType:MIME[extname(u.pathname)]||'application/octet-stream',body:await readFile(resolve(ROOT,u.pathname.slice(1)))})}
 catch{return route.fulfill({status:404,body:''})}
});
await touchPage.goto(ORIGIN+'/',{waitUntil:'load'});
await touchPage.waitForSelector('#dense[data-iw-skill-v2="1"]',{timeout:8000});
await touchPage.waitForTimeout(500);
for(const width of [390,768]){
 await touchPage.setViewportSize({width,height:1600}); await touchPage.waitForTimeout(120);
 const t=await touchPage.evaluate(()=>{
  const buttons=[...document.querySelectorAll('[data-iw-skill-role="nav-button"]')];
  return {coarse:matchMedia('(pointer: coarse)').matches,
   minNav:buttons.length?Math.min(...buttons.map(b=>b.getBoundingClientRect().height)):0,
   pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
 });
 if(!t.coarse) failures.push(`${width}px touch context did not resolve pointer: coarse`);
 if(t.minNav<24) failures.push(`${width}px touch pager target is only ${t.minNav}px high`);
 if(t.pageOverflow>2) failures.push(`${width}px touch document horizontal overflow ${t.pageOverflow}px`);
}
await touchContext.close();
await browser.close();
if(errors.length) failures.push(...errors.map(e=>'pageerror: '+e));
if(touchErrors.length) failures.push(...touchErrors.map(e=>'touch pageerror: '+e));
if(failures.length) console.error(failures.join('\n'));
else console.log(`PASS responsive skill-card matrix (${WIDTHS.length} widths × 4 stress cards)`);
assert.equal(failures.length,0,`${failures.length} responsive skill-card invariant failure(s)`);
