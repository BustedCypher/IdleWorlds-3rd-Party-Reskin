// Package generated chrome, status art and the project's existing SVG glyphs.
// Source artwork stays untouched. No runtime files or game DOM are modified.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'assets/raids/ui-kit-v1');
await mkdir(resolve(dir, 'sprites'), {recursive:true});
const chromeNames = ['boss-health', 'boss-cast', 'unit-normal', 'unit-selected', 'unit-critical', 'personal-hud', 'utility-panel', 'divider'];
const targets = [[620,190],[460,80],[132,68],[132,68],[132,68],[500,176],[286,118],[300,40]];
const statusNames = ['shield','ward','war-cry','curse','bleed','taunt'];
const skills = ['combat','jewelcrafting','tailoring','construction','mining','woodcutting','alchemy','gathering','smithing','spellcrafting'];
const uri = (mime, data) => `data:${mime};base64,${data.toString('base64')}`;
const inputs = [
  {kind:'chrome',src:uri('image/png',await readFile(resolve(dir,'chrome-source.png'))),cols:2,rows:4,names:chromeNames,targets},
  {kind:'status',src:uri('image/png',await readFile(resolve(dir,'status-source.png'))),cols:3,rows:2,names:statusNames,targets:statusNames.map(()=>[18,18])},
];
for (const skill of skills) inputs.push({kind:'skill',src:uri('image/svg+xml',await readFile(resolve(root,`assets/skills-ui/action-icons/${skill}.svg`))),cols:1,rows:1,names:[`skill-${skill}`],targets:[[22,22]]});
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({inputs}) => {
    const load = src => new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});
    const assets=[];
    for (const source of inputs) {
      const image=await load(source.src);
      const c=document.createElement('canvas');c.width=image.naturalWidth || 600;c.height=image.naturalHeight || 600;
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);
      const pixels=ctx.getImageData(0,0,c.width,c.height).data;
      for (let n=0;n<source.names.length;n++) {
        const col=n%source.cols,row=Math.floor(n/source.cols);
        const left=Math.floor(col*c.width/source.cols),top=Math.floor(row*c.height/source.rows);
        const right=Math.floor((col+1)*c.width/source.cols),bottom=Math.floor((row+1)*c.height/source.rows);
        let x1=right,y1=bottom,x2=-1,y2=-1;
        for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(pixels[(y*c.width+x)*4+3]>8){x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y);}
        if(x2<0)throw new Error(`Empty source cell: ${source.names[n]}`);
        x1=Math.max(left,x1-4);y1=Math.max(top,y1-4);x2=Math.min(right-1,x2+4);y2=Math.min(bottom-1,y2+4);
        const sw=x2-x1+1,sh=y2-y1+1;
        const [maxW,maxH]=source.targets[n];const scale=Math.min(maxW*2/sw,maxH*2/sh);
        const square=source.kind!=='chrome';
        const unit=source.names[n].startsWith('unit-');
        const w=square||unit?maxW*2:Math.max(2,Math.round(sw*scale)),h=square||unit?maxH*2:Math.max(2,Math.round(sh*scale));
        const sprite=document.createElement('canvas');sprite.width=w;sprite.height=h;
        const sc=sprite.getContext('2d');sc.imageSmoothingQuality='high';const dw=sw*scale,dh=sh*scale;sc.drawImage(c,x1,y1,sw,sh,(w-dw)/2,(h-dh)/2,dw,dh);
        assets.push({name:source.names[n],kind:source.kind,source:{image:source.kind==='chrome'?'chrome-source.png':source.kind==='status'?'status-source.png':`../../skills-ui/action-icons/${source.names[n].slice(6)}.svg`,x:x1,y:y1,width:sw,height:sh},width:w,height:h,canvas:sprite});
      }
    }
    const W=2048,pad=8;let x=pad,y=pad,rowH=0;
    for(const a of assets){if(x+a.width+pad>W){x=pad;y+=rowH+pad;rowH=0;}a.x=x;a.y=y;x+=a.width+pad;rowH=Math.max(rowH,a.height);}
    const H=2**Math.ceil(Math.log2(y+rowH+pad));
    const atlas=document.createElement('canvas');atlas.width=W;atlas.height=H;const ac=atlas.getContext('2d');
    const entries=assets.map(a=>{ac.drawImage(a.canvas,a.x,a.y);return {name:a.name,kind:a.kind,x:a.x,y:a.y,width:a.width,height:a.height,logicalWidth:a.width/2,logicalHeight:a.height/2,source:a.source,png:a.canvas.toDataURL('image/png').split(',')[1]};});
    const alpha=ac.getImageData(0,0,W,H).data;let transparent=0;for(let i=3;i<alpha.length;i+=4)if(alpha[i]===0)transparent++;
    return {width:W,height:H,transparentFraction:transparent/(W*H),entries,png:atlas.toDataURL('image/png').split(',')[1]};
  },{inputs});
  await writeFile(resolve(dir,'raid-ui-atlas.png'),Buffer.from(result.png,'base64'));
  const entries=[];
  for(const {png,...entry} of result.entries){await writeFile(resolve(dir,'sprites',`${entry.name}.png`),Buffer.from(png,'base64'));entries.push(entry);}
  const index={version:1,atlas:'raid-ui-atlas.png',width:result.width,height:result.height,pixelRatio:2,padding:8,transparentFraction:result.transparentFraction,entries};
  await writeFile(resolve(dir,'index.json'),JSON.stringify(index,null,2)+'\n');
  await writeFile(resolve(dir,'index.js'),`/* Same sprite map as index.json; allows opening preview.html directly from disk. */\nwindow.RAID_UI_ATLAS=${JSON.stringify(index)};\n`);
  const css=['/* Generated by build-tools/build-raid-ui-kit.mjs. Percent windows preserve sprite registration at any scale. */', '.raid-art { display:block; background-image:url("./raid-ui-atlas.png"); background-repeat:no-repeat; }'];
  for(const e of entries){const sx=100*index.width/e.width,sy=100*index.height/e.height,px=100*e.x/(index.width-e.width),py=100*e.y/(index.height-e.height);css.push(`.raid-art[data-sprite="${e.name}"] { aspect-ratio:${e.width}/${e.height}; background-size:${sx}% ${sy}%; background-position:${px}% ${py}%; }`);}
  await writeFile(resolve(dir,'atlas.css'),css.join('\n')+'\n');
  console.log(JSON.stringify({atlas:`${index.width}x${index.height}`,sprites:entries.length,transparentFraction:index.transparentFraction,entries:entries.map(({name,x,y,width,height})=>({name,x,y,width,height}))},null,2));
} finally {await browser.close();}
