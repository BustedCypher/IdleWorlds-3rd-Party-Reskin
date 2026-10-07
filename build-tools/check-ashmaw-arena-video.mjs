import {chromium} from 'playwright';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4175/output/ashmaw-arena/');
 const result=await page.evaluate(async()=>{
  const v=document.createElement('video');v.muted=true;v.src='ashmaw-arena-ambient-loop.webm';document.body.append(v);
  await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=()=>reject(new Error('Video decode error'));});
  const initiallyFinite=Number.isFinite(v.duration);
  if(!initiallyFinite){v.currentTime=100000;await new Promise(resolve=>v.onseeked=resolve);}
  const duration=v.duration;v.currentTime=0;await v.play();
  await new Promise(resolve=>v.requestVideoFrameCallback(resolve));v.pause();
  return {duration,initiallyFinite,width:v.videoWidth,height:v.videoHeight,decoded:true};
 });
 console.log(JSON.stringify(result));
}finally{await browser.close();}
