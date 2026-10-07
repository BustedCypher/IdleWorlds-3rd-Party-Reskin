// Generates a portable looping preview and a one-cycle WebM from the same
// renderer used by the extension. Run with --video to refresh the video export.
import { build } from 'esbuild';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const root=path.resolve('.');
await mkdir('output/ashmaw',{recursive:true});
for(const name of ['arena','clouds','furnace-smoke','steam'])await copyFile('assets/raids/ashmaw/'+name+'.png','output/ashmaw/'+name+'.png');
await build({entryPoints:['src/modules/AshmawScene.js'],bundle:true,format:'iife',globalName:'Ashmaw',outfile:'output/ashmaw/scene.js'});
await writeFile('output/ashmaw/index.html',`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ashmaw · The Cinder Tyrant</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#100605;color:#f5dac0;font-family:Georgia,serif}
main{position:relative;width:100vw;height:100vh;min-height:450px;overflow:hidden}
canvas{display:block;width:100%;height:100%;object-fit:cover}
.caption{position:absolute;bottom:6%;left:5%;pointer-events:none;text-shadow:0 2px 15px #000}
.eyebrow{font:11px system-ui;letter-spacing:.28em;text-transform:uppercase;color:#e8a267}
h1{margin:10px 0;font-size:clamp(36px,5vw,76px);letter-spacing:.02em;font-weight:400}
.subtitle{font-size:clamp(14px,1.5vw,20px);color:#d3b398;letter-spacing:.12em}
.tools{position:absolute;right:4%;bottom:5%;display:flex;gap:12px;align-items:center;font:12px system-ui;color:#e4bba0}
button{color:#f6d3b6;border:1px solid #8e5135;background:#180b08b8;border-radius:4px;padding:9px 14px;cursor:pointer}
.error{position:absolute;top:10px;left:10px;font:14px system-ui}a{color:#edba8f}
@media(max-width:600px){.caption{bottom:16%}.tools{left:5%;right:auto}}
</style>
<main><canvas id="scene" aria-label="Ashmaw, a molten red dragon looming above an uneven volcanic arena"></canvas>
<div class="caption"><div class="eyebrow">Raid encounter · Volcanic arena</div><h1>Ashmaw</h1><div class="subtitle">THE CINDER TYRANT</div></div>
<div class="tools"><span>16 second seamless loop</span><button id="pause" type="button">Pause</button></div>
<div class="error" id="error"></div></main><script src="scene.js"></script><script>
const canvas=document.querySelector('#scene'),button=document.querySelector('#pause');
const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
Promise.all(['arena','clouds','furnace-smoke','steam'].map(n=>load(n+'.png'))).then(([env,cloudAtlas,smokeAtlas,steamAtlas])=>{
  const renderer=Ashmaw.createAshmawRenderer(canvas,env,null,{cloudAtlas,smokeAtlas,steamAtlas,maxWidth:1440});
  if(!renderer)throw new Error('Canvas is required for this animated preview.');
  window.ashmawRenderer=renderer;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');let paused=motion.matches,seconds=0,last=performance.now();
  const resize=()=>renderer.render(seconds);
  addEventListener('resize',resize);resize();
  function tick(now){const delta=Math.min((now-last)/1000,.1);last=now;if(!paused&&!document.hidden){seconds+=delta;renderer.render(seconds);}requestAnimationFrame(tick);}
  button.textContent=paused?'Play':'Pause';button.onclick=()=>{paused=!paused;button.textContent=paused?'Play':'Pause';};
  window.ashmawPause=()=>{paused=true;};requestAnimationFrame(tick);
}).catch(e=>{document.querySelector('#error').textContent=e.message||'Unable to load scene assets.';});
</script></html>`);

if(process.argv.includes('--video') || process.argv.includes('--serve')) {
  const mime={'.html':'text/html','.js':'text/javascript','.png':'image/png','.webm':'video/webm'};
  const server=http.createServer(async(req,res)=>{
    try {
      const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file=path.resolve(root,'.'+name+(name.endsWith('/')?'index.html':''));
      if(!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(4175,'127.0.0.1',resolve));
  console.log('Ashmaw preview: http://127.0.0.1:4175/output/ashmaw/');
  if(process.argv.includes('--video')) {
    const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    try {
      const page=await browser.newPage({viewport:{width:1600,height:900}});
      await page.goto('http://127.0.0.1:4175/output/ashmaw/');await page.waitForFunction(()=>window.ashmawRenderer);
      const base64=await page.evaluate(async()=>{
        window.ashmawPause();const c=document.querySelector('canvas'),r=window.ashmawRenderer;
        r.render(0);const stream=c.captureStream(0),track=stream.getVideoTracks()[0];
        const type=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
        const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:9000000}),chunks=[];
        recorder.ondataavailable=e=>chunks.push(e.data);
        const complete=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
        const start=performance.now();
        for(let i=0;i<480;i++) {
          const wait=start+i*1000/30-performance.now();if(wait>0)await new Promise(done=>setTimeout(done,wait));
          r.render(i/30);track.requestFrame();
        }
        await new Promise(done=>setTimeout(done,Math.max(0,start+16000-performance.now())));
        recorder.stop();await complete;stream.getTracks().forEach(t=>t.stop());
        return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type}));});
      });
      await writeFile('output/ashmaw/ashmaw-loop.webm',Buffer.from(base64,'base64'));
      console.log('Exported output/ashmaw/ashmaw-loop.webm');
    }finally{await browser.close();if(!process.argv.includes('--serve'))server.close();}
  }
}
