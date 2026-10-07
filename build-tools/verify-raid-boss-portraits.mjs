import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'..'),kit=resolve(root,'assets/raids/ui-kit-v1'),out=resolve(root,'output/raid-boss-headshots');
const index=JSON.parse(await readFile(resolve(kit,'boss-health-index.json'),'utf8'));
assert.equal(index.entries.length,5);
for(const [i,a] of index.entries.entries()){
 assert(a.x>=32&&a.y>=32&&a.x+a.width<=index.width-32&&a.y+a.height<=index.height-32);
 for(const b of index.entries.slice(i+1))assert(a.x+a.width+32<=b.x||b.x+b.width+32<=a.x||a.y+a.height+32<=b.y||b.y+b.height+32<=a.y,`${a.key} overlaps ${b.key}`);
}
const data=async file=>'data:image/png;base64,'+(await readFile(file)).toString('base64');
const atlas=await data(resolve(kit,index.atlas)),sprites=await Promise.all(index.entries.map(async e=>({...e,src:await data(resolve(kit,`sprites/${e.name}.png`))})));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:980,height:1400}});
 const results=await page.evaluate(async({atlas,index,sprites})=>{
  const load=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src;});
  const a=await load(atlas),c=document.createElement('canvas');c.width=a.width;c.height=a.height;const ctx=c.getContext('2d');ctx.drawImage(a,0,0);const pixels=ctx.getImageData(0,0,a.width,a.height).data;
  let gutterLeaks=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++)if(pixels[(y*a.width+x)*4+3]&&!index.entries.some(e=>x>=e.x&&x<e.x+e.width&&y>=e.y&&y<e.y+e.height))gutterLeaks++;
  const rows=[];
  for(const e of sprites){const im=await load(e.src),s=document.createElement('canvas');s.width=im.width;s.height=im.height;const sc=s.getContext('2d');sc.drawImage(im,0,0);const p=sc.getImageData(0,0,s.width,s.height).data;let channelOpaque=0,mismatches=0;
   for(let y=0;y<e.height;y++)for(let x=0;x<e.width;x++){const o=(y*e.width+x)*4,ao=((y+e.y)*a.width+x+e.x)*4;for(let ch=0;ch<4;ch++)if(p[o+ch]!==pixels[ao+ch])mismatches++;if(x>=e.channel.x&&x<e.channel.x+e.channel.width&&y>=e.channel.y&&y<e.channel.y+e.channel.height&&p[o+3])channelOpaque++;}
   rows.push({key:e.key,width:im.width,height:im.height,channelOpaque,mismatches,portraitAlpha:p[(205*e.width+150)*4+3]});
  }
  return {gutterLeaks,rows};
 },{atlas,index,sprites});
 assert.equal(results.gutterLeaks,0,'Artwork leaks into gutters');
 for(const r of results.rows){assert.equal(r.channelOpaque,0,`${r.key}: HP channel not fully transparent`);assert.equal(r.mismatches,0,`${r.key}: atlas differs from standalone sprite`);assert(r.portraitAlpha>200,`${r.key}: portrait accidentally transparent`);}
 await mkdir(out,{recursive:true});
 await page.goto(pathToFileURL(resolve(kit,'boss-portraits/preview.html')).href);await page.evaluate(async()=>{const im=new Image();im.src='../boss-health-atlas.png';await im.decode();});
 assert.equal(await page.locator('.raid-boss-art').count(),10);await page.locator('main').screenshot({path:resolve(out,'preview.png')});
 await page.locator('#health').fill('20');await page.locator('#health').dispatchEvent('input');assert.deepEqual(await page.locator('.hp').allTextContents(),Array(5).fill('20%'));
 await writeFile(resolve(out,'verification.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
