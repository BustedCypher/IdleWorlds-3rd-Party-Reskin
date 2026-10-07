// Shared deterministic preview/live renderer. The approved painting never moves.
export const SKARTH_PERIOD = 72;
const TAU = Math.PI * 2;
const frac = n => n - Math.floor(n);
const fade = u => Math.sin(Math.PI * u) ** 2;

export function createSkarthArenaScene(canvas, {background, atmosphere, ice, water, maxWidth=1774}) {
 const sw=background.naturalWidth||background.width,sh=background.naturalHeight||background.height;
 const width=Math.round(Math.min(sw,maxWidth)),height=Math.round(sh*width/sw);
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)throw new Error('Unable to create the Skarth canvas');
 const buffers=[];let destroyed=false;
 const buffer=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;buffers.push(c);return c;};
 const painting=buffer(width,height);painting.getContext('2d').drawImage(background,0,0,width,height);
 // Cache occupied alpha bounds, so different atlas silhouettes share sensible anchors.
 const atlas=image=>Array.from({length:4},(_,part)=>{
  const cell=buffer(384,384),cx=cell.getContext('2d',{willReadFrequently:true});
  if(!image)return {image:cell,x:0,y:0,w:384,h:384};
  const w=(image.naturalWidth||image.width)/2,h=(image.naturalHeight||image.height)/2;
  cx.drawImage(image,part%2*w,Math.floor(part/2)*h,w,h,0,0,384,384);
  const pixels=cx.getImageData(0,0,384,384);let x0=384,y0=384,x1=0,y1=0;
  for(let y=0;y<384;y++)for(let x=0;x<384;x++){
   const i=(y*384+x)*4+3,edge=Math.min(x,y,383-x,383-y)/12;
   pixels.data[i]*=Math.min(1,Math.max(0,edge));
   if(pixels.data[i]>12){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  }
  cx.putImageData(pixels,0,0);
  return x0>x1?{image:cell,x:0,y:0,w:384,h:384}:{image:cell,x:Math.max(0,x0-5),y:Math.max(0,y0-5),w:Math.min(384,x1+6)-Math.max(0,x0-5),h:Math.min(384,y1+6)-Math.max(0,y0-5)};
 });
 const air=atlas(atmosphere),floes=atlas(ice),foam=atlas(water);
 const sky=buffer(width,height),sc=sky.getContext('2d'),surface=buffer(width,height),wc=surface.getContext('2d');
 const mask=(points,holes=[])=>{
  const c=buffer(width,height),m=c.getContext('2d');
  const poly=p=>{m.beginPath();p.forEach(([x,y],i)=>i?m.lineTo(x*width,y*height):m.moveTo(x*width,y*height));m.closePath();m.fill();};
  m.filter=`blur(${width*.005}px)`;m.fillStyle='#fff';poly(points);
  m.globalCompositeOperation='destination-out';for(const p of holes)poly(p);
  m.filter='none';return c;
 };
 const skyMask=mask([[.095,0],[.974,0],[.962,.29],[.945,.37],[.87,.39],[.64,.29],[.59,.27],[.49,.27],[.46,.31],[.27,.28],[.095,.24]],[
  [[.61,.28],[.637,.18],[.685,.14],[.70,.095],[.76,.028],[.85,.005],[.90,.09],[.913,.33],[.94,.45],[.82,.59],[.69,.55],[.62,.40]],
  [[.115,.14],[.15,.135],[.152,.067],[.177,.06],[.18,.035],[.205,.03],[.207,.135],[.245,.155],[.265,.19],[.30,.20],[.309,.23],[.31,.3],[.12,.3]]
 ]);
 // The open channel below the body, above the courtyard shore and inside the piers.
 const waterMask=mask([[.12,.505],[.34,.525],[.49,.54],[.65,.568],[.76,.60],[.915,.602],[.942,.67],[.923,.78],[.76,.88],[.65,.91],[.49,.81],[.31,.74],[.18,.66],[.10,.565]]);
 const plume=(target,sprite,x,y,w,h,alpha,angle=0)=>{
  if(alpha<.001)return;
  target.save();target.globalAlpha=alpha;target.translate(x*width,y*height);target.rotate(angle);
  target.drawImage(sprite.image,sprite.x,sprite.y,sprite.w,sprite.h,-w*width/2,-h*height/2,w*width,h*height);target.restore();
 };
 const reset=target=>{target.setTransform(1,0,0,1,0,0);target.globalAlpha=1;target.globalCompositeOperation='source-over';target.clearRect(0,0,width,height);};
 const cloudBanks=[
  {x:.32,y:.08,w:.37,h:.19,flow:-.19,alpha:.23,offset:.16,part:0},
  {x:.51,y:.12,w:.32,h:.14,flow:-.16,alpha:.25,offset:.65,part:1},
  {x:.60,y:.015,w:.30,h:.18,flow:-.18,alpha:.20,offset:.85,part:0},
  {x:.37,y:.22,w:.29,h:.13,flow:-.14,alpha:.17,offset:.41,part:1},
  {x:.95,y:.085,w:.24,h:.19,flow:-.15,alpha:.19,offset:.50,part:1}
 ];
 const mistBanks=[
  {x:.24,y:.53,w:.30,h:.048,flow:-.15,offset:.15,alpha:.14,part:2},
  {x:.49,y:.573,w:.31,h:.05,flow:-.12,offset:.55,alpha:.17,part:3},
  {x:.75,y:.617,w:.37,h:.055,flow:-.13,offset:.30,alpha:.16,part:2},
  {x:.51,y:.725,w:.38,h:.06,flow:-.20,offset:.83,alpha:.16,part:3}
 ];
 let seed=6207;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const driftingIce=Array.from({length:13},(_,i)=>{
  const depth=i/12;return {x:.24+random()*.62,y:.585+depth*.245,w:.013+depth*.040,h:.007+depth*.020,flow:-.12-depth*.055,offset:random(),part:i%4,bob:random()*TAU,turn:(random()-.5)*.10};
 });
 // Root positions lie on the actual waterline, not on the head or exposed back.
 const breaches=[{x:.185,y:.505,w:.19},{x:.34,y:.523,w:.18},{x:.52,y:.546,w:.28},{x:.72,y:.586,w:.18},{x:.84,y:.596,w:.26}];
 const droplets=breaches.flatMap((b,j)=>Array.from({length:14},()=>({x:b.x+(random()-.5)*b.w*.62,y:b.y-.006,offset:random(),rise:.008+random()*.029,drift:-.012-random()*.015,size:.45+random()*.9,speed:12+j%3*6})));
 const snow= [{count:680,speed:12,size:.6,spread:.8,alpha:.35,fall:1.25,travel:.67,stretch:2},
  {count:200,speed:18,size:1.2,spread:1.4,alpha:.52,fall:1.32,travel:.86,stretch:3},
  {count:70,speed:24,size:2.1,spread:1.8,alpha:.62,fall:1.38,travel:1.03,stretch:4}
 ].flatMap(layer=>Array.from({length:layer.count},()=>({x:-.3+random()*1.9,offset:random(),dx:layer.travel*(.75+random()*.5),fall:layer.fall*(.86+random()*.28),speed:layer.speed,size:layer.size+random()*layer.spread,alpha:layer.alpha+random()*.10,stretch:layer.stretch*(.7+random()*.6)})));
 const snowSprite=buffer(32,32),sn=snowSprite.getContext('2d');
 const sg=sn.createRadialGradient(16,16,0,16,16,16);sg.addColorStop(0,'rgba(227,242,250,1)');sg.addColorStop(.35,'rgba(227,242,250,.72)');sg.addColorStop(1,'rgba(227,242,250,0)');sn.fillStyle=sg;sn.fillRect(0,0,32,32);
 const veil=buffer(width,height),vc=veil.getContext('2d'),vg=vc.createLinearGradient(0,0,0,height);
 vg.addColorStop(0,'rgba(175,200,221,.02)');vg.addColorStop(.52,'rgba(186,210,228,.13)');vg.addColorStop(1,'rgba(175,200,221,.015)');vc.fillStyle=vg;vc.fillRect(0,0,width,height);
 function drawClouds(phase){
  reset(sc);
  for(const p of cloudBanks){const u=frac(phase*2+p.offset);plume(sc,air[p.part],p.x+p.flow*(u-.5),p.y-.006*u,p.w*(1+.07*u),p.h*(1+.09*u),p.alpha*fade(u));}
  sc.globalCompositeOperation='destination-in';sc.drawImage(skyMask,0,0);ctx.drawImage(sky,0,0);
 }
 function drawMist(phase){
  for(const p of mistBanks){const u=frac(phase*3+p.offset);plume(ctx,air[p.part],p.x+p.flow*(u-.5),p.y-.006*u,p.w*(1+.12*u),p.h*(1+.20*u),p.alpha*fade(u));}
  // Cold breath leaves the nostrils and follows the prevailing wind.
  for(let i=0;i<3;i++){const u=frac(phase*6+i/3);plume(ctx,air[3],.625-.045*u,.259-.018*u,.014+.065*u,.008+.025*u,.18*fade(u),-.16);}
 }
 function drawIce(phase){
  for(const p of driftingIce){
   const u=frac(phase+p.offset),bob=Math.sin(TAU*phase*12+p.bob);
   const x=p.x+p.flow*(u-.5),y=p.y+bob*.002;
   // A low dark underside/reflection sits below each independently drifting floe.
   plume(wc,floes[p.part],x,y+.006,p.w,p.h*.65,.13*fade(u),p.turn+Math.sin(TAU*phase*2+p.bob)*.015);
   plume(wc,floes[p.part],x,y,p.w,p.h,.68*fade(u),p.turn+Math.sin(TAU*phase*2+p.bob)*.015);
   plume(wc,foam[1],x+.008,y+.011,p.w*1.7,.010,.17*fade(u));
  }
 }
 function drawWater(phase){
  for(let j=0;j<breaches.length;j++){
   const b=breaches[j];
   for(let i=0;i<3;i++){
    const u=frac(phase*9+i/3+j*.13);
    plume(wc,foam[i%2],b.x-.015*u,b.y+.005+.025*u,b.w*(.66+.7*u),.012+.025*u,.37*fade(u));
   }
  }
  // Low horizontal highlights drift downstream over the deep water.
  wc.save();wc.lineCap='round';
  for(let i=0;i<24;i++){
   const u=frac(phase*3+i*.617),y=.57+(i%8)*.032,x=.17+(i%6)*.13-.08*u;
   wc.strokeStyle=`rgba(175,206,224,${.065*fade(u)})`;wc.lineWidth=Math.max(.6,width*.0006);
   wc.beginPath();wc.moveTo(x*width,y*height);wc.quadraticCurveTo((x+.023)*width,(y+.003*Math.sin(TAU*phase*6+i))*height,(x+.043)*width,y*height);wc.stroke();
  }
  wc.restore();
 }
 function drawSpray(phase){
  for(let j=0;j<breaches.length;j++){
   const b=breaches[j];
   for(let i=0;i<2;i++){
    const u=frac(phase*12+i/2+j*.19),h=.018+.034*Math.sin(Math.PI*u);
    plume(ctx,foam[2+(j+i)%2],b.x-.011*u,b.y-h*.33,b.w*(.27+.25*u),h,.29*fade(u));
   }
  }
  ctx.save();ctx.fillStyle='#c1dce9';
  for(const p of droplets){const u=frac(phase*p.speed+p.offset),s=p.size*width/1774;ctx.globalAlpha=.42*fade(u);ctx.beginPath();ctx.ellipse((p.x+p.drift*u)*width,(p.y-p.rise*4*u*(1-u)+.008*u)*height,s*.6,s,0,0,TAU);ctx.fill();}
  ctx.restore();
 }
 function drawSnow(phase){
  ctx.save();ctx.globalAlpha=.65+.15*Math.sin(TAU*phase*4);ctx.drawImage(veil,0,0);
  for(const p of snow){
   const u=frac(phase*p.speed+p.offset),s=p.size*width/1774,g=TAU*phase*6+p.offset*TAU;
   const vx=(-p.dx*p.speed+.018*TAU*6*Math.cos(g))*width,vy=p.fall*p.speed*height;
   ctx.save();ctx.globalAlpha=p.alpha*fade(u);ctx.translate((p.x-p.dx*(u-.5)+.018*Math.sin(g))*width,(-.12+p.fall*u)*height);ctx.rotate(Math.atan2(-vx,vy));
   ctx.drawImage(snowSprite,-s*.85,-s*p.stretch,s*1.7,s*p.stretch*2);ctx.restore();
  }
  ctx.restore();
 }
 function drawForeground(phase){
  for(let i=0;i<3;i++){const u=frac(phase*6+i/3+.24);plume(ctx,air[2+i%2],.25+i*.3-.65*(u-.5),.93-i*.018,.52,.07+.025*u,.17*fade(u),-.04);}
  // Broad low squalls help the fine snow read as a blizzard without a white wall.
  for(let i=0;i<2;i++){const u=frac(phase*6+i/2+.12);plume(ctx,air[3],.54-.72*(u-.5),.68+i*.10,.73,.045,.13*fade(u),-.09);}
 }
 function render(seconds,{clouds=true,mist=true,ice=true,water=true,snow=true,foreground=true,ambient=true}={}){
  if(destroyed)return {t:0};
  const t=Math.round(((seconds%SKARTH_PERIOD+SKARTH_PERIOD)%SKARTH_PERIOD)*1e9)/1e9,phase=t/SKARTH_PERIOD;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(painting,0,0);
  if(ambient){
   if(clouds)drawClouds(phase);
   if(ice||water){reset(wc);if(water)drawWater(phase);if(ice)drawIce(phase);wc.globalCompositeOperation='destination-in';wc.drawImage(waterMask,0,0);ctx.drawImage(surface,0,0);}
   if(water)drawSpray(phase);
   if(mist)drawMist(phase);
   if(snow)drawSnow(phase);
   if(foreground)drawForeground(phase);
  }
  return {t};
 }
 return {render,period:SKARTH_PERIOD,destroy(){if(destroyed)return;destroyed=true;for(const c of buffers)c.width=c.height=1;canvas.width=canvas.height=1;}};
}
