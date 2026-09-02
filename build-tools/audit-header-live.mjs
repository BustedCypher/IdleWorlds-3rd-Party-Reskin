import { chromium } from 'playwright';
const b=await chromium.connectOverCDP('http://127.0.0.1:9223');
const p=b.contexts()[0].pages()[0];
await p.waitForLoadState('domcontentloaded');
const out=await p.evaluate(()=>{
 const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
 const anchors=['DarkHammer 4','Players online: 151','120','No XP potion active','ATK 4 • DEF 2 • HP 41','No ATK potion active','No DEF potion active','Barrowwind boosted','Game','Choose an action above to get started.','Zone 1: Greenwake Den','Next Zone'];
 const all=[...document.querySelectorAll('body *')];
 function pick(a){
  let m=all.filter(e=>norm(e.textContent)===a || norm(e.textContent).includes(a));
  m.sort((x,y)=>norm(x.textContent).length-norm(y.textContent).length || x.childElementCount-y.childElementCount);
  return m[0]||null;
 }
 function info(el){if(!el)return null; const r=el.getBoundingClientRect(); const c=getComputedStyle(el); return {tag:el.tagName.toLowerCase(),cls:typeof el.className==='string'?el.className:'',text:norm(el.textContent).slice(0,180),x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),display:c.display,position:c.position,grid:c.gridTemplateColumns,flex:c.flexDirection,gap:c.gap,pad:c.padding,borderRadius:c.borderRadius};}
 const result={viewport:[innerWidth,innerHeight]};
 for(const a of anchors){ const el=pick(a); let chain=[]; let cur=el; for(let i=0;cur&&cur!==document.body&&i<8;i++,cur=cur.parentElement) chain.push(info(cur)); result[a]=chain; }
 return result;
});
console.log(JSON.stringify(out,null,2));
await p.screenshot({path:'build-tools/fixtures/header-native-audit.png',fullPage:false});
await b.close();
