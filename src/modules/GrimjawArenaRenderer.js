// Independent generated atmosphere. The approved painting remains stationary.
export const GRIMJAW_PERIOD = 72;
const TAU = Math.PI * 2;
const frac = value => value - Math.floor(value);
const fade = u => Math.sin(Math.PI * u) ** 2;

export function createGrimjawArenaScene(canvas, {background, clouds, mist, maxWidth = 1774}) {
 const sw = background.naturalWidth || background.width;
 const sh = background.naturalHeight || background.height;
 const width = Math.round(Math.min(sw, maxWidth)), height = Math.round(sh * width / sw);
 canvas.width = width; canvas.height = height;
 const ctx = canvas.getContext('2d', {alpha:false});
 if (!ctx) throw new Error('Unable to create the Grimjaw canvas');
 const buffers = [];
 let destroyed = false;
 const buffer = (w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  buffers.push(c); return c;
 };
 const painting = buffer(width, height);
 painting.getContext('2d').drawImage(background, 0, 0, width, height);
 const atlas = image => Array.from({length:4}, (_, index) => {
  const c = buffer(512, 256), cx = c.getContext('2d');
  if (!image) return c;
  const w = (image.naturalWidth || image.width) / 2, h = (image.naturalHeight || image.height) / 2;
  cx.drawImage(image, index % 2 * w, Math.floor(index / 2) * h, w, h, 0, 0, 512, 256);
  // Feather cell boundaries in addition to each asset's native alpha.
  const pixels = cx.getImageData(0, 0, 512, 256);
  for (let y=0; y<256; y++) for (let x=0; x<512; x++) {
   const distance=((x-255.5)/255.5)**2+((y-127.5)/127.5)**2;
   const rim=Math.max(0,Math.min(1,(1-distance)/.55));
   pixels.data[(y*512+x)*4+3] *= rim*rim*(3-2*rim);
  }
  cx.putImageData(pixels, 0, 0); return c;
 });
 const storm = atlas(clouds), fog = atlas(mist);
 const sky = buffer(width, height), sc = sky.getContext('2d');
 const skyMask = buffer(width, height), sm = skyMask.getContext('2d');
 const polygon = (target, points) => {
  target.beginPath(); points.forEach(([x,y], i) => i ? target.lineTo(x*width,y*height) : target.moveTo(x*width,y*height));
  target.closePath(); target.fill();
 };
 sm.filter = `blur(${width*.006}px)`; sm.fillStyle = '#fff';
 polygon(sm, [[.233,0],[.681,0],[.659,.12],[.636,.27],[.605,.42],[.545,.49],[.237,.49]]);
 polygon(sm, [[.829,0],[.976,0],[.955,.34],[.891,.29],[.862,.16]]);
 sm.globalCompositeOperation = 'destination-out';
 // Keep the fortress, left arch and Grimjaw clear of the sky overlays.
 polygon(sm, [[.309,.33],[.324,.225],[.35,.201],[.369,.143],[.389,.10],[.432,.127],[.433,.241],[.478,.279],[.478,.43],[.303,.43]]);
 sm.filter = 'none';
 const skyBanks = [
  {x:.34,y:.08,w:.36,h:.21,flow:-.18,alpha:.31,offset:.11,part:0},
  {x:.51,y:.18,w:.35,h:.25,flow:-.16,alpha:.29,offset:.56,part:1},
  {x:.60,y:.04,w:.32,h:.17,flow:-.20,alpha:.23,offset:.79,part:2},
  {x:.49,y:.38,w:.30,h:.19,flow:-.14,alpha:.18,offset:.31,part:3},
  {x:.90,y:.09,w:.23,h:.19,flow:-.15,alpha:.22,offset:.47,part:0}
 ];
 const ground = [
  {x:.12,y:.643,w:.30,h:.074,flow:-.12,alpha:.16,offset:.12,part:0,speed:1},
  {x:.32,y:.657,w:.32,h:.066,flow:-.10,alpha:.18,offset:.63,part:1,speed:1},
  {x:.49,y:.668,w:.29,h:.080,flow:-.13,alpha:.15,offset:.33,part:3,speed:1},
  {x:.67,y:.692,w:.26,h:.071,flow:-.09,alpha:.15,offset:.82,part:0,speed:2},
  {x:.79,y:.704,w:.28,h:.071,flow:-.10,alpha:.17,offset:.05,part:2,speed:2},
  {x:.94,y:.652,w:.25,h:.085,flow:-.12,alpha:.14,offset:.49,part:1,speed:1}
 ];
 const near = [
  {x:.10,y:.884,w:.48,h:.12,flow:-.70,alpha:.33,offset:.23,part:3,speed:4},
  {x:.48,y:.958,w:.57,h:.14,flow:-.82,alpha:.36,offset:.65,part:0,speed:6},
  {x:.90,y:.861,w:.49,h:.11,flow:-.76,alpha:.30,offset:.39,part:1,speed:4}
 ];
 const squalls = [
  {x:.40,y:.34,w:.72,h:.14,flow:-.86,alpha:.19,offset:.11,part:0,speed:6},
  {x:.67,y:.49,w:.83,h:.17,flow:-.94,alpha:.25,offset:.61,part:2,speed:6},
  {x:.26,y:.61,w:.68,h:.12,flow:-1.02,alpha:.32,offset:.36,part:1,speed:8},
  {x:.81,y:.69,w:.79,h:.17,flow:-.87,alpha:.31,offset:.84,part:3,speed:6},
  {x:.45,y:.78,w:.90,h:.09,flow:-1.12,alpha:.32,offset:.52,part:0,speed:8}
 ];
 let seed = 7301;
 const random = () => {seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296;};
 const flakes = [
  {count:900,speed:12,size:.65,spread:1.0,alpha:.38,fall:1.24,travel:.68,stretch:2.0},
  {count:240,speed:18,size:1.3,spread:1.5,alpha:.54,fall:1.30,travel:.85,stretch:3.0},
  {count:84,speed:24,size:2.3,spread:2.2,alpha:.66,fall:1.38,travel:1.05,stretch:4.4}
 ].flatMap(layer=>Array.from({length:layer.count},()=>({
  x:-.30+random()*1.90,offset:random(),dx:layer.travel*(.76+random()*.48),
  fall:layer.fall*(.86+random()*.28),speed:layer.speed,size:layer.size+random()*layer.spread,
  alpha:layer.alpha+random()*.13,stretch:layer.stretch*(.7+random()*.6)
 })));
 const handMotes=Array.from({length:22},()=>({offset:random(),x:.845+random()*.012,rise:.07+random()*.11,drift:-.016+random()*.026,size:.6+random()*1.2}));
 const snowSprite=buffer(32,32),sn=snowSprite.getContext('2d');
 const sg=sn.createRadialGradient(16,16,0,16,16,16);
 sg.addColorStop(0,'rgba(231,243,250,1)');sg.addColorStop(.35,'rgba(231,243,250,.72)');sg.addColorStop(1,'rgba(231,243,250,0)');
 sn.fillStyle=sg;sn.fillRect(0,0,32,32);
 const whiteout=buffer(width,height),wc=whiteout.getContext('2d');
 const veil=wc.createLinearGradient(0,0,0,height);
 veil.addColorStop(0,'rgba(193,213,227,.05)');
 veil.addColorStop(.45,'rgba(204,223,235,.14)');
 veil.addColorStop(.70,'rgba(204,223,235,.17)');
 veil.addColorStop(1,'rgba(193,213,227,.02)');
 wc.fillStyle=veil;wc.fillRect(0,0,width,height);
 function plume(target, image, x,y,w,h,alpha,angle=0) {
  target.save(); target.globalAlpha=alpha; target.translate(x*width,y*height); target.rotate(angle);
  target.drawImage(image,-w*width/2,-h*height/2,w*width,h*height); target.restore();
 }
 function mistBanks(banks, phase) {
  for (const p of banks) {
   const u=frac(phase*p.speed+p.offset);
   plume(ctx,fog[p.part],p.x+p.flow*(u-.5),p.y-.012*u,p.w*(1+.12*u),p.h*(1+.18*u),p.alpha*fade(u));
  }
 }
 function drawClouds(phase) {
  sc.globalCompositeOperation='source-over'; sc.clearRect(0,0,width,height);
  for (const p of skyBanks) {
   const u=frac(phase*4+p.offset);
   plume(sc,storm[p.part],p.x+p.flow*(u-.5),p.y-.012*u,p.w*(1+.07*u),p.h*(1+.12*u),p.alpha*fade(u));
  }
  sc.globalCompositeOperation='destination-in'; sc.drawImage(skyMask,0,0); ctx.drawImage(sky,0,0);
 }
 function drawBoss(phase) {
  // Breath and rising vapour originate at the approved skull and open palm.
  for(let i=0;i<3;i++) {
   const u=frac(phase*6+i/3);
   plume(ctx,fog[(i+3)%4],.738-.040*u,.168-.011*u,.016+.050*u,.009+.017*u,.22*fade(u),-.08);
  }
  for(let i=0;i<5;i++) {
   const v=frac(phase*9+i/5+.17);
   plume(ctx,fog[i%4],.850-.027*v+.005*Math.sin(TAU*phase*3+i)*v,.364-.163*v,.028+.056*v,.036+.068*v,.28*fade(v),-1.1);
  }
  ctx.save(); ctx.globalCompositeOperation='lighter';
  const pulse=.5-.5*Math.cos(TAU*phase*6);
  const x=.847*width,y=.371*height;
  const g=ctx.createRadialGradient(x,y,0,x,y,width*.017);
  g.addColorStop(0,`rgba(126,205,234,${.08+.05*pulse})`);g.addColorStop(1,'rgba(126,205,234,0)');
  ctx.fillStyle=g;ctx.fillRect(x-width*.017,y-width*.017,width*.034,width*.034);
  // Tapered curling filaments accompany the soft mist; each grows upward,
  // fades at its tip, and resets only after it becomes transparent.
  for(let i=0;i<4;i++) {
   const u=frac(phase*9+i/4),length=.025+.16*u,root=.849+(i-1.5)*.0025;
   const path=()=>{ctx.beginPath();for(let j=0;j<=24;j++){
    const q=j/24,px=(root-.018*u*q+.006*Math.sin(TAU*phase*3+i*1.3+q*6)*q)*width;
    const py=(.365-length*q)*height;j?ctx.lineTo(px,py):ctx.moveTo(px,py);
   }};
   const cg=ctx.createLinearGradient(root*width,.365*height,root*width,(.365-length)*height);
   cg.addColorStop(0,'rgba(116,205,240,0)');cg.addColorStop(.24,`rgba(116,205,240,${.25*fade(u)})`);cg.addColorStop(.72,`rgba(190,234,255,${.35*fade(u)})`);cg.addColorStop(1,'rgba(190,234,255,0)');
   ctx.strokeStyle=cg;ctx.lineCap='round';ctx.lineWidth=width*.0020;ctx.globalAlpha=.25;path();ctx.stroke();
   ctx.globalAlpha=1;ctx.lineWidth=Math.max(.7,width*.00065);path();ctx.stroke();
  }
  for(const p of handMotes) {
   const u=frac(phase*6+p.offset),s=p.size*width/1774;
   ctx.globalAlpha=.43*fade(u);ctx.fillStyle='#b8e9fa';ctx.beginPath();
   ctx.arc((p.x+p.drift*u)*width,(.362-p.rise*u)*height,s,0,TAU);ctx.fill();
  }
  ctx.restore();
 }
 function drawSnow(phase) {
  ctx.save();
  // A broad veil and staggered snow squalls give the flakes a storm to inhabit.
  ctx.globalAlpha=.78+.20*Math.sin(TAU*phase*4);ctx.drawImage(whiteout,0,0);ctx.globalAlpha=1;
  mistBanks(squalls,phase);
  for(const p of flakes) {
   const u=frac(phase*p.speed+p.offset),s=p.size*width/1774;
   const gustPhase=TAU*phase*6+p.offset*TAU;
   const gust=.018*Math.sin(gustPhase);
   // Canvas rotates the downward sprite axis toward the left with a positive
   // angle. Include gust velocity so the streak follows its actual trajectory.
   const vx=(-p.dx*p.speed+.018*TAU*6*Math.cos(gustPhase))*width;
   const vy=p.fall*p.speed*height;
   const tilt=Math.atan2(-vx,vy);
   ctx.save();ctx.globalAlpha=p.alpha*fade(u);
   ctx.translate((p.x-p.dx*(u-.5)+gust)*width,(-.12+p.fall*u)*height);ctx.rotate(tilt);
   ctx.drawImage(snowSprite,-s*.85,-s*p.stretch,s*1.7,s*p.stretch*2);ctx.restore();
  }
  ctx.restore();
 }
 function render(seconds,{clouds=true,mist=true,boss=true,snow=true,foreground=true,ambient=true}={}) {
  if(destroyed)return {t:0};
  const t=Math.round(((seconds%GRIMJAW_PERIOD+GRIMJAW_PERIOD)%GRIMJAW_PERIOD)*1e9)/1e9, phase=t/GRIMJAW_PERIOD;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(painting,0,0);
  if(ambient) {
   if(clouds)drawClouds(phase);
   if(boss)drawBoss(phase);
   if(mist)mistBanks(ground,phase);
   if(foreground)mistBanks(near,phase);
   if(snow)drawSnow(phase);
  }
  return {t};
 }
 return {render,period:GRIMJAW_PERIOD,destroy(){if(destroyed)return;destroyed=true;for(const c of buffers)c.width=c.height=1;canvas.width=canvas.height=1;}};
}
