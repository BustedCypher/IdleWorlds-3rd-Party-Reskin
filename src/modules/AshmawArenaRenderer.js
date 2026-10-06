// Shared live-raid and preview renderer. A fixed painting carries boss/terrain;
// only atmospheric layers, painted lava light and battle hazards animate.
export const ARENA_PERIOD=16;
export const BATTLE_EFFECTS_ENABLED=false;
const TAU=Math.PI*2;
const frac=x=>x-Math.floor(x);
const smooth=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};
const envelope=(t,a,b,c,d)=>smooth(a,b,t)*(1-smooth(c,d,t));
export function getArenaCue(seconds,battle=true){
 const t=frac(seconds/ARENA_PERIOD)*ARENA_PERIOD;
 return {t,warning:battle?envelope(t,4.6,5.3,6.0,6.2):0,
  rupture:battle?envelope(t,6.05,6.22,6.6,7.8):0,
  debris:battle?envelope(t,6.25,6.45,7.7,9.5):0};
}
export function createArenaScene(canvas,{background,smoke,ruptureOverlay,maxWidth}={}){
 const sourceWidth=background.naturalWidth||background.width,sourceHeight=background.naturalHeight||background.height;
 const scale=Math.min(1,(maxWidth||sourceWidth)/sourceWidth);
 const width=Math.round(sourceWidth*scale),height=Math.round(sourceHeight*scale);
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)return null;
 const buffers=[];let destroyed=false;
 const layer=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;buffers.push(c);return c;};
 if(scale<1){const scaled=layer(width,height);scaled.getContext('2d').drawImage(background,0,0,width,height);background=scaled;}
 let seed=491;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const dust=Array.from({length:140},()=>({x:random(),offset:random(),s:.7+random()*1.8,drift:random()*2-1}));
 const debris=Array.from({length:26},()=>({x:random(),v:random(),s:2+random()*5,spin:random()*2-1,delay:random()*.3}));
 // Sample the painting's own clouds. Feathered masks stay above the mountain
 // skyline and away from the horns; no ground or character pixels move.
 const skyLayers=[
  {points:[[.225,0],[.610,0],[.602,.065],[.582,.10],[.570,.15],[.495,.15],[.43,.11],[.41,.085],[.37,.10],[.32,.07],[.225,.07]],dx:100,dy:28,offset:0,alpha:.96},
  {points:[[.40,0],[.588,0],[.588,.067],[.572,.13],[.52,.16],[.45,.12],[.40,.075]],dx:-72,dy:32,offset:.65,alpha:.88},
  {points:[[0,0],[.23,0],[.22,.057],[.18,.060],[.145,.02],[.10,.01],[.072,.035],[.045,.08],[0,.085]],dx:80,dy:16,offset:1.4,alpha:.84}
 ].map(f=>{
  const x=Math.max(0,Math.floor(Math.min(...f.points.map(p=>p[0]))*width)-39),y=0;
  const w=Math.min(width,Math.ceil(Math.max(...f.points.map(p=>p[0]))*width)+39)-x;
  const h=Math.ceil(Math.max(...f.points.map(p=>p[1]))*height)+39;
  const mask=layer(w,h),mc=mask.getContext('2d');mc.filter='blur(13px)';mc.fillStyle='#fff';
  mc.beginPath();f.points.forEach(([a,b],i)=>i?mc.lineTo(a*width-x,b*height-y):mc.moveTo(a*width-x,b*height-y));mc.closePath();mc.fill();
  const source=layer(w,h),sourceCtx=source.getContext('2d');
  sourceCtx.drawImage(background,-x,-y);sourceCtx.globalCompositeOperation='destination-in';sourceCtx.drawImage(mask,0,0);
  const surface=layer(w,h);return {...f,x,y,w,h,mask,source,surface,sc:surface.getContext('2d')};
 });
 // The original cloud brushwork is kept, with rolling smoke layered into the
 // same sky mask. Both source and destination are masked to protect silhouettes.
 const skySmoke=layer(512,256),ss=skySmoke.getContext('2d');
 if(smoke){
  ss.drawImage(smoke,0,0,512,256);const p=ss.getImageData(0,0,512,256);
  for(let i=0;i<p.data.length;i+=4){const tone=p.data[i]*.30+p.data[i+1]*.5+p.data[i+2]*.20;
   p.data[i]=tone*.76+29;p.data[i+1]=tone*.53+17;p.data[i+2]=tone*.47+18;
  }ss.putImageData(p,0,0);
 }
 function paintedClouds(phase){
  ctx.save();
  for(const [index,f] of skyLayers.entries()){
   const a=TAU*phase*2+f.offset,x=f.dx*Math.sin(a),y=f.dy*Math.sin(a+.7);
   const sc=f.sc;sc.globalCompositeOperation='source-over';sc.clearRect(0,0,f.w,f.h);
   // The left bank uses smoke alone: its skyline is too close to the clouds
   // to resample the painting without also picking up mountain tips.
   if(index!==2){
    sc.save();sc.translate(f.w*.5+x,f.h*.35+y);sc.rotate(.055*Math.sin(a+.4));
    sc.scale(1.10+.09*Math.sin(a),1.16+.13*Math.sin(a+1.1));sc.drawImage(f.source,-f.w*.5,-f.h*.35);sc.restore();
   }
   for(let i=0;i<7;i++){
    const u=frac(phase*4+i/7+index*.17),fade=Math.sin(Math.PI*u)**2;
    const px=width*((index===2?-.08:.18)+i*.055+u*.18)-f.x,py=height*(.015+(i%3)*.033-u*.044)-f.y;
    const w=width*(.14+u*.15),h=height*(.10+u*.11);
    sc.save();sc.globalAlpha=fade*(index===1?.38:.52);sc.translate(px,py);sc.rotate(-.24+.55*u);
    sc.scale(i%2?-1:1,1);sc.drawImage(skySmoke,-w/2,-h/2,w,h);sc.restore();
   }
   f.sc.globalCompositeOperation='destination-in';f.sc.drawImage(f.mask,0,0);
   ctx.globalAlpha=f.alpha;ctx.drawImage(f.surface,f.x,f.y);
  }ctx.restore();
 }
 const furnace=layer(width,height),fc=furnace.getContext('2d',{willReadFrequently:true});fc.drawImage(background,0,0);
 const heat=fc.getImageData(0,0,width,height);
 const hotAreas=[{x:.621,y:.217,rx:.018,ry:.022},{x:.632,y:.278,rx:.041,ry:.049},
  {x:.700,y:.300,rx:.069,ry:.065},{x:.766,y:.264,rx:.059,ry:.058}];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,d=heat.data;let shape=0;
  for(const f of hotAreas){const distance=Math.hypot((x/width-f.x)/f.rx,(y/height-f.y)/f.ry);shape=Math.max(shape,1-smooth(.60,1,distance));}
  const hot=shape*smooth(170,240,d[i])*smooth(75,155,d[i+1])*smooth(40,115,d[i]-d[i+2]);
  d[i]=255;d[i+1]=128;d[i+2]=36;d[i+3]=Math.round(hot*190);
 }
 fc.putImageData(heat,0,0);
 const furnaceX=Math.floor(width*.59),furnaceY=Math.floor(height*.12),furnaceW=Math.ceil(width*.24),furnaceH=Math.ceil(height*.26);
 const furnacePatch=layer(furnaceW,furnaceH);furnacePatch.getContext('2d').drawImage(furnace,-furnaceX,-furnaceY);
 function furnaceBreathing(phase){
  const lift=(.5-.5*Math.cos(TAU*phase*2))**1.35;
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.10+.40*lift;ctx.drawImage(furnacePatch,furnaceX,furnaceY);ctx.restore();
  // Staggered wisps rise from the jaw; each vanishes before its emitter resets.
  for(let i=0;i<4;i++){
   const u=frac(phase*4+i/4+.07),fade=Math.sin(Math.PI*u)**2;
   cloud(width*(.618-u*.09),height*(.280-u*.083),width*(.035+u*.14),height*(.024+u*.10),fade*(.18+.17*lift),u,i%2===1);
  }
  for(let i=0;i<3;i++){
   const u=frac(phase*2+i/3+.31),fade=Math.sin(Math.PI*u)**2;
   cloud(width*(.71+i*.027-u*.055),height*(.355-u*.08),width*(.12+u*.13),height*(.06+u*.075),fade*.23,u,i%2===1);
  }
 }
 function eyeStreaming(phase){
  // The visible outer eye corner emits short, ember-like ribbons, not a beam.
  const x=width*.626,y=height*.219,breath=.5-.5*Math.cos(TAU*phase*2);
  ctx.save();ctx.globalCompositeOperation='lighter';
  glow(x,y,width*.009,height*.013,'255,143,46',.09+.07*breath);
  for(let i=0;i<3;i++){
   const a=TAU*phase*2+i*1.7,length=width*(.018+.007*Math.sin(a)),rise=height*(.010+.004*Math.cos(a));
   const g=ctx.createLinearGradient(x,y,x+length,y-rise);g.addColorStop(0,`rgba(255,184,82,${.20+.12*breath})`);g.addColorStop(.3,'rgba(246,133,43,.13)');g.addColorStop(1,'rgba(220,87,20,0)');
   ctx.strokeStyle=g;ctx.lineWidth=i===0?1.2:.7;
   ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+length*.28,y-rise*.2+i*.8,x+length*.65,y-rise*1.4+Math.sin(a)*3,x+length,y-rise);ctx.stroke();
  }
  for(let i=0;i<6;i++){
   const u=frac(phase*4+i/6),fade=Math.sin(Math.PI*u)**2;
   const px=x+width*.030*u,py=y-height*.016*u+Math.sin(u*Math.PI*2+i)*1.3*u;
   glow(px,py,1.6,1.1,'255,164,57',fade*.28);
  }ctx.restore();
 }
 // Broad moving light remains inside the existing painted lava. It adds no
 // new stone/scale detail and never advects the terrain or the dragon.
 const tile=layer(256,256),tc=tile.getContext('2d'),tp=tc.createImageData(256,256);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const v=.5+.5*Math.sin(TAU*y/256+.45*Math.sin(TAU*x/256));
  tp.data.set([255,125,32,Math.round(10+v*v*v*105)],(y*256+x)*4);
 }
 tc.putImageData(tp,0,0);
 const regions=[
  {points:[[.469,.371],[.509,.372],[.502,.568],[.462,.568]],d:[0,1],cycles:16},
  {points:[[.898,.302],[.943,.310],[.938,.618],[.891,.617]],d:[0,1],cycles:16},
  {points:[[.435,.541],[.584,.551],[.799,.588],[.799,.633],[.576,.587],[.430,.578]],d:[1,.1],cycles:2},
  {points:[[.787,.584],[.916,.627],[.974,.702],[.974,.77],[.915,.680],[.785,.627]],d:[.75,.66],cycles:2},
  {points:[[.916,.697],[.974,.718],[.942,.794],[.757,.917],[.743,.875],[.919,.753]],d:[-.88,.48],cycles:2},
  {points:[[.743,.857],[.793,.920],[.556,1],[.446,1],[.477,.954]],d:[-.88,.48],cycles:2}
 ];
 const flows=regions.map(({points,d,cycles})=>{
  const px=points.map(([x,y])=>[Math.round(x*width),Math.round(y*height)]);
  const x=Math.min(...px.map(p=>p[0])),y=Math.min(...px.map(p=>p[1]));
  const w=Math.max(...px.map(p=>p[0]))-x,h=Math.max(...px.map(p=>p[1]))-y;
  const mask=layer(w,h),mc=mask.getContext('2d',{willReadFrequently:true});
  mc.drawImage(background,-x,-y);const pixels=mc.getImageData(0,0,w,h);
  for(let i=0;i<pixels.data.length;i+=4){
   const p=pixels.data,k=smooth(166,232,p[i])*smooth(72,155,p[i+1])*smooth(18,80,p[i]-p[i+2]);
   p[i]=p[i+1]=p[i+2]=255;p[i+3]=Math.round(k*220);
  }
  mc.putImageData(pixels,0,0);mc.globalCompositeOperation='destination-in';
  mc.beginPath();px.forEach(([a,b],i)=>i?mc.lineTo(a-x,b-y):mc.moveTo(a-x,b-y));mc.closePath();mc.fill();
  const flow=layer(w,h),fc=flow.getContext('2d'),pattern=fc.createPattern(tile,'repeat');
  const length=Math.hypot(...d);return {x,y,w,h,mask,flow,fc,pattern,dx:d[0]/length,dy:d[1]/length,cycles};
 });
 function lavaLight(phase){
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const f of flows){
   const travel=phase*256*f.cycles*(f.cycles===16?1:2);
   f.pattern.setTransform(new DOMMatrix([-f.dy,f.dx,f.dx,f.dy,-f.x+travel*f.dx,-f.y+travel*f.dy]));
   f.fc.globalCompositeOperation='source-over';f.fc.clearRect(0,0,f.w,f.h);f.fc.drawImage(f.mask,0,0);
   f.fc.globalCompositeOperation='source-in';f.fc.fillStyle=f.pattern;f.fc.fillRect(0,0,f.w,f.h);
   ctx.drawImage(f.flow,f.x,f.y);
  }ctx.restore();
 }
 function cloud(x,y,w,h,alpha,u,flip=false){
  if(!smoke||alpha<=0)return;
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(.11*Math.sin(TAU*u));ctx.scale(flip?-1:1,1);
  ctx.drawImage(smoke,-w/2,-h/2,w,h);ctx.restore();
 }
 function glow(x,y,rx,ry,color,alpha){
  ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
  const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(${color},${alpha})`);g.addColorStop(1,`rgba(${color},0)`);
  ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 function hazards(cue){
  const t=cue.t;
  if(ruptureOverlay){
   ctx.save();ctx.globalAlpha=cue.warning*.14+cue.rupture*.79+cue.debris*.13;
   ctx.drawImage(ruptureOverlay,0,0,width,height);ctx.restore();
  }
  if(cue.rupture>0){
   glow(width*.46,height*.745,width*.26,height*.21,'255,105,26',cue.rupture*.09);
   ctx.save();ctx.globalCompositeOperation='lighter';
   for(let i=0;i<30;i++){
    const age=t-6.08-(i%7)*.035,u=age/1.3;if(u<0||u>1)continue;
    const alpha=cue.rupture*Math.sin(Math.PI*u)**2;
    const x=width*(.446+(i%5)*.009)+(i%2?1:-1)*u*(10+i%6*5);
    const y=height*.762-height*(.16+i%3*.025)*u*(1-u);
    ctx.fillStyle=`rgba(245,${145+i%4*15},54,${alpha*.7})`;ctx.fillRect(x,y,1.2+i%3*.4,2.5+i%4);
   }ctx.restore();
  }
  for(const p of debris){
   const age=t-6.25-p.delay;if(age<0||age>2.4)continue;
   const u=age/2.4,alpha=cue.debris*(1-smooth(.65,1,u));
   const x=width*(.46+(p.x-.5)*.19*age),y=height*(.755-(.07+p.v*.055)*age+.055*age*age);
   ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(age*p.spin*3);ctx.fillStyle='#241817';ctx.strokeStyle='#be5328';ctx.lineWidth=.65;
   ctx.beginPath();ctx.moveTo(-p.s,-p.s*.6);ctx.lineTo(p.s*.4,-p.s);ctx.lineTo(p.s,p.s*.6);ctx.lineTo(-p.s*.5,p.s);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  }
  if(cue.debris>0){
   const u=(t-6.25)/3.25;
   cloud(width*.48+u*width*.03,height*.72-u*height*.08,width*(.32+u*.09),height*(.16+u*.07),cue.debris*.24,u);
  }
 }
 function render(seconds,{battle=false,ambient=true,lava=true,atmosphere=true,cloudMotion=true,bossMotion=true,eyeLight=true}={}){
  if(destroyed)return getArenaCue(seconds,false);
  const phase=frac(seconds/ARENA_PERIOD),battleActive=battle&&BATTLE_EFFECTS_ENABLED,cue=getArenaCue(seconds,battleActive);
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(background,0,0);
  if(ambient&&cloudMotion)paintedClouds(phase);
  if(ambient&&lava)lavaLight(phase);
  if(ambient&&bossMotion)furnaceBreathing(phase);
  if(ambient&&eyeLight)eyeStreaming(phase);
  if(ambient&&atmosphere){
   for(let i=0;i<7;i++){
    const u=frac(phase*2+i/7),fade=Math.sin(Math.PI*u)**2;
    cloud(width*(.12+i*.12)-u*width*.10,height*(.56+i%2*.025)-u*height*.09,
     width*(.25+u*.14),height*(.13+u*.065),fade*.25,u,i%2===1);
   }
   // Continuous steam rises from the two falls, independent of combat cues.
   for(const [x,y] of [[.485,.565],[.921,.617]])for(let i=0;i<4;i++){
    const u=frac(phase*4+i/4+x),fade=Math.sin(Math.PI*u)**2;
    cloud(width*(x-u*.052),height*(y-u*.16),width*(.045+u*.16),height*(.032+u*.14),fade*.31,u,i%2===1);
   }
   for(let i=0;i<4;i++){
    const u=frac(phase*2+i/4+.23),fade=Math.sin(Math.PI*u)**2;
    cloud(width*(.08+i*.28)+u*width*.10,height*.98-u*height*.075,width*(.28+u*.12),height*.16,fade*.23,u,i%2===1);
   }
   ctx.save();ctx.globalCompositeOperation='lighter';
   for(const p of dust){
    const u=frac(phase*3+p.offset),alpha=Math.sin(Math.PI*u)**2*.52;
    const x=p.x*width+p.drift*u*width*.12,y=height*(1.04-u*1.12);
    ctx.fillStyle=`rgba(228,128,65,${alpha})`;ctx.fillRect(x,y,p.s,p.s*1.4);
   }ctx.restore();
  }
  if(battleActive)hazards(cue);
  return cue;
 }
 return {render,width,height,period:ARENA_PERIOD,destroy(){destroyed=true;for(const c of buffers)c.width=c.height=1;canvas.width=canvas.height=1;}};
}
