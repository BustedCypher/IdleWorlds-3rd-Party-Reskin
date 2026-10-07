import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4175/output/ashmaw-portrait/');
 const result=await page.evaluate(async()=>{
  const im=new Image();im.src='../ashmaw-anatomy-study/generated-sheet.png';await im.decode();
  const width=im.naturalWidth/4,height=im.naturalHeight/2;
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');
  const frames=[];
  for(let i=0;i<8;i++){ctx.clearRect(0,0,width,height);ctx.drawImage(im,-(i%4)*width,-Math.floor(i/4)*height);frames.push(c.toDataURL().split(',')[1]);}
  return {width:im.naturalWidth,height:im.naturalHeight,frameWidth:width,frameHeight:height,frames};
 });
 for(let i=0;i<result.frames.length;i++)await writeFile(`output/ashmaw-anatomy-study/pose-${i}.png`,Buffer.from(result.frames[i],'base64'));
 console.log({...result,frames:result.frames.length});
}finally{await browser.close();}
