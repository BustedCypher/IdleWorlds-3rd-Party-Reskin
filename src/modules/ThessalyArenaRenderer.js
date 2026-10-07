// Painterly plague atmosphere over a stable boss and courtyard. Every motion
// uses integer harmonics or faded particle lifetimes of one shared phase.
export const THESSALY_PERIOD=16;
const TAU=Math.PI*2,frac=x=>x-Math.floor(x);

export function createThessalyArenaScene(canvas,{background,clouds:cloudArt,mist,hair,body,maxWidth}={}){
 const sw=background.naturalWidth||background.width,sh=background.naturalHeight||background.height;
 const scale=Math.min(1,(maxWidth||sw)/sw),width=Math.round(sw*scale),height=Math.round(sh*scale);
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return null;
 const buffers=[];let destroyed=false;
 const layer=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;buffers.push(c);return c;};
 if(scale<1){const c=layer(width,height);c.getContext('2d').drawImage(background,0,0,width,height);background=c;}
 // Fresh transparent atlases contain four independently painted formations.
 // Cache modest-sized sprites, soften cell borders and preserve their alpha.
 // No animated cloud texture is taken from the background painting.
 const atlas=image=>Array.from({length:4},(_,index)=>{
  const c=layer(384,384),cx=c.getContext('2d');if(!image)return c;
  const w=(image.naturalWidth||image.width)/2,h=(image.naturalHeight||image.height)/2;
  cx.drawImage(image,(index%2)*w,Math.floor(index/2)*h,w,h,0,0,384,384);
  const p=cx.getImageData(0,0,384,384);
  for(let y=0;y<384;y++)for(let x=0;x<384;x++){
   const edge=Math.min(x,y,383-x,383-y),i=(y*384+x)*4+3;
   p.data[i]*=Math.min(1,edge/18);
  }cx.putImageData(p,0,0);return c;
 });
 const storm=atlas(cloudArt),fog=atlas(mist),bodyParts=atlas(body);
 const hairTexture=layer(768,384);if(hair)hairTexture.getContext('2d').drawImage(hair,0,0,768,384);
 // Fixed sky masks protect Thessaly, the ward tower and nearby arches.
 const clouds=[
  {points:[[.17,0],[.67,0],[.67,.17],[.56,.235],[.48,.255],[.47,.095],[.36,.095],[.35,.23],[.30,.26],[.22,.23],[.17,.08]]}
 ].map(f=>{
  const x=Math.max(0,Math.floor(Math.min(...f.points.map(p=>p[0]))*width)-36),w=Math.min(width,Math.ceil(Math.max(...f.points.map(p=>p[0]))*width)+36)-x;
  const h=Math.ceil(Math.max(...f.points.map(p=>p[1]))*height)+36,mask=layer(w,h),mc=mask.getContext('2d');
  mc.filter='blur(12px)';mc.fillStyle='#fff';mc.beginPath();f.points.forEach(([a,b],i)=>i?mc.lineTo(a*width-x,b*height):mc.moveTo(a*width-x,b*height));mc.closePath();mc.fill();
  // The tower exclusion is crisp and independent of the feathered sky edge.
  mc.filter='none';mc.clearRect(width*.383-x,height*.135,width*.057,height*.21);
  const surface=layer(w,h);return {...f,x,w,h,mask,surface,sc:surface.getContext('2d')};
 });
 let seed=723;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const spores=Array.from({length:110},()=>({x:random(),offset:random(),size:.6+random()*1.5,drift:random()*2-1}));
 const banks=[
  {x:.02,y:.69,w:.24,h:.16,flow:.030,rise:.050,cycles:1,alpha:.22},
  {x:.17,y:.59,w:.30,h:.09,flow:.055,rise:.025,cycles:2,alpha:.17},
  {x:.31,y:.56,w:.21,h:.17,flow:-.025,rise:.075,cycles:1,alpha:.23},
  {x:.48,y:.60,w:.34,h:.065,flow:.040,rise:.014,cycles:2,alpha:.15},
  {x:.63,y:.54,w:.21,h:.16,flow:.025,rise:.080,cycles:2,alpha:.22},
  {x:.81,y:.57,w:.28,h:.095,flow:.070,rise:.035,cycles:3,alpha:.16},
  {x:.96,y:.66,w:.24,h:.18,flow:-.045,rise:.055,cycles:1,alpha:.22},
  {x:1,y:.79,w:.30,h:.08,flow:-.075,rise:.018,cycles:2,alpha:.17},
  ...Array.from({length:4},(_,i)=>({x:-.04+i*.35,y:1.01,w:.36,h:i%2?.07:.12,flow:.065,rise:.035,cycles:i%2+1,alpha:.14})),
  {x:.68,y:.575,w:.24,h:.18,flow:.050,rise:.100,cycles:1,alpha:.22},
  {x:.75,y:.54,w:.17,h:.105,flow:.070,rise:.065,cycles:2,alpha:.16}
 ];
 // Different banks have their own pace, aspect, tint and direction. Seeded
 // variation avoids synchronized copies while retaining the exact loop.
 const fogPuffs=banks.flatMap(b=>Array.from({length:3},()=>({
  ...b,x:b.x+(random()-.5)*.025,y:b.y+(random()-.5)*.018,
  w:b.w*(.78+random()*.44),h:b.h*(.72+random()*.5),offset:random(),
  angle:(random()-.5)*.22,grow:.10+random()*.35,
  alpha:b.alpha*(.68+random()*.32)*.50,flip:random()<.5
 })));
 const skyPuffs=[
  {x:.22,y:.005,w:.25,h:.21,offset:.07,variant:0,alpha:.21,flow:.052},
  {x:.46,y:.055,w:.28,h:.22,offset:.36,variant:1,alpha:.19,flow:.055},
  {x:.32,y:.20,w:.23,h:.17,offset:.64,variant:2,alpha:.14,flow:.044},
  {x:.63,y:.003,w:.22,h:.20,offset:.84,variant:3,alpha:.17,flow:.040}
 ];
 // Follow the painting's actual green haze rather than laying generic smoke
 // over every stone. Read once; the animated surface is clipped to this mask.
 const hazeMask=layer(width,height),hmc=hazeMask.getContext('2d');hmc.drawImage(background,0,0);
 const hazePixels=hmc.getImageData(0,0,width,height),clamp=v=>Math.max(0,Math.min(1,v));
 for(let i=0;i<hazePixels.data.length;i+=4){
  const y=Math.floor(i/4/width)/height,r=hazePixels.data[i],g=hazePixels.data[i+1],b=hazePixels.data[i+2];
  const strength=clamp((g-(r+b)*.5-5)/15)*clamp((g-b-2)/12)*clamp((y-.50)/.06);
  hazePixels.data[i]=hazePixels.data[i+1]=hazePixels.data[i+2]=255;hazePixels.data[i+3]=Math.round(strength*255);
 }hmc.putImageData(hazePixels,0,0);
 const hazeFeather=layer(width,height),hfc=hazeFeather.getContext('2d');hfc.filter='blur(5px)';hfc.drawImage(hazeMask,0,0);
 const hazeSurface=layer(width,height),hsc=hazeSurface.getContext('2d');
 const hazeSources=[[.025,.68],[.13,.66],[.24,.65],[.42,.64],[.57,.64],[.70,.63],[.84,.66],[.96,.70],[.055,.82],[.955,.83]];
 const hazeWisps=hazeSources.flatMap(([x,y],index)=>Array.from({length:3},()=>({x,y,offset:random(),flow:(x<.5?1:-1)*(.035+random()*.04),rise:.018+random()*.03,w:.085+random()*.08,h:.025+random()*.025,flip:random()<.5,cycles:index%3===0?2:1})));
 function plume(target,texture,x,y,w,h,alpha,u,flip=false,angle=0,turn=.09){
  if(alpha<=0)return;target.save();target.globalAlpha=alpha;target.translate(x,y);target.rotate(angle+turn*Math.sin(TAU*u));target.scale(flip?-1:1,1);target.drawImage(texture,-w/2,-h/2,w,h);target.restore();
 }
 function glow(x,y,rx,ry,color,alpha){
  ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);
  g.addColorStop(0,`rgba(${color},${alpha})`);g.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 function sky(phase){
  for(const f of clouds){
   const sc=f.sc;sc.globalCompositeOperation='source-over';sc.clearRect(0,0,f.w,f.h);
   for(const p of skyPuffs){
    // Slow one-way wind. Each bank fades fully before its hidden reset;
    // no backtracking, bobbing or turning is needed to close the loop.
    const u=frac(phase+p.offset),fade=Math.sin(Math.PI*u)**2,swell=1+.04*u;
    plume(sc,storm[p.variant],width*(p.x+p.flow*(u-.5))-f.x,height*(p.y-u*.009),width*p.w*swell,height*p.h*swell,p.alpha*fade,u,false,0,0);
   }
   sc.globalCompositeOperation='destination-in';sc.drawImage(f.mask,0,0);ctx.drawImage(f.surface,f.x,0);
  }
 }
 function miasma(phase){
  // Background plumes and low foreground fog leave the party's centre clear.
  for(const [index,p]of fogPuffs.entries()){
   const u=frac(phase*p.cycles+p.offset),fade=Math.sin(Math.PI*u)**2;
   plume(ctx,fog[index%4],width*(p.x+p.flow*u),height*(p.y-p.rise*u),width*p.w*(.86+p.grow*u),height*p.h*(.9+p.grow*u),fade*p.alpha,u,p.flip,p.angle,.035);
  }
 }
 function courtyardHaze(phase){
  hsc.globalCompositeOperation='source-over';hsc.clearRect(0,0,width,height);
  for(const [index,p]of hazeWisps.entries()){
   const u=frac(phase*p.cycles+p.offset),fade=Math.sin(Math.PI*u)**2;
   const x=width*(p.x+p.flow*u),y=height*(p.y-p.rise*u);
   plume(hsc,fog[index%4],x,y,width*p.w*(1+.45*u),height*p.h*(1+.5*u),fade*.26,u,p.flip,0,.018);
  }
  hsc.globalCompositeOperation='destination-in';hsc.drawImage(hazeFeather,0,0);ctx.drawImage(hazeSurface,0,0);
 }
 function aura(phase){
  const breath=.5-.5*Math.cos(TAU*phase*2);
  ctx.save();ctx.globalCompositeOperation='lighter';
  // Cold eye corners stay on the painted face; hair and hands shed vapour.
  for(const [x,y]of [[.696,.079],[.703,.078]]){
   glow(width*x,height*y,width*.007,height*.012,'151,210,227',.055+.07*breath);
   for(let i=0;i<3;i++){
    const u=frac(phase*2+i/3+x),fade=Math.sin(Math.PI*u)**2;
    glow(width*(x+u*.023),height*(y-u*.028),width*.0012,height*.002,'157,208,228',fade*.25);
   }
  }
  for(const [x,y,side]of [[.563,.282,-1],[.841,.350,1]]){
   glow(width*x,height*y,width*.026,height*.030,'109,161,185',.02+.026*breath);
   for(let i=0;i<4;i++){
    const u=frac(phase*2+i/4+.19),fade=Math.sin(Math.PI*u)**2;
    const startX=width*x,startY=height*y,endX=startX+width*.041*u*side,endY=startY-height*.071*u;
    const g=ctx.createLinearGradient(startX,startY,endX||startX+1,endY);g.addColorStop(0,'rgba(149,189,213,0)');g.addColorStop(.6,`rgba(149,189,213,${fade*.12})`);g.addColorStop(1,'rgba(149,189,213,0)');
    ctx.strokeStyle=g;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(startX,startY);ctx.bezierCurveTo(startX-width*.02*side,startY-height*.04*u,endX+width*.01*side,endY,endX,endY);ctx.stroke();
   }
  }
  ctx.restore();
  for(const [x,y,side]of [[.563,.282,-1],[.841,.350,1]])for(let i=0;i<3;i++){
   const u=frac(phase*2+i/3+x),fade=Math.sin(Math.PI*u)**2;
   plume(ctx,storm[i%4],width*(x+side*u*.07),height*(y-u*.055),width*(.025+u*.065),height*(.02+u*.045),fade*.12,u,i%2===1);
  }
 }
 // A restrained two-joint cloud rig: the upper form follows the anchored
 // waist with a delayed shoulder sway. Only new vapour sprites are rigged;
 // no face, hands, stonework or copied silhouette can drift or double.
 const cloudRig=[
  {part:3,x:.708,y:.476,w:.235,h:.245,joint:'waist',angle:0,alpha:.16},
  {part:2,x:.698,y:.404,w:.245,h:.185,joint:'waist',angle:-.10,alpha:.18},
  {part:1,x:.714,y:.300,w:.17,h:.24,joint:'shoulder',angle:.12,alpha:.14},
  {part:0,x:.752,y:.235,w:.145,h:.17,joint:'shoulder',angle:-.1,alpha:.13},
  {part:0,x:.645,y:.204,w:.12,h:.14,joint:'shoulder',angle:.16,alpha:.11}
 ];
 function cloudBody(phase){
  const a=TAU*phase,waist=.006*Math.sin(a),shoulder=waist+.005*Math.sin(a-.65);
  for(const p of cloudRig){
   const joint=p.joint==='waist'?waist:shoulder,pivotX=width*.705,pivotY=height*(p.joint==='waist'?.47:.38);
   ctx.save();ctx.translate(pivotX+width*.0011*Math.sin(a),pivotY);ctx.rotate(joint);
   plume(ctx,bodyParts[p.part],width*p.x-pivotX,height*p.y-pivotY+height*.0015*Math.sin(a-.4),width*p.w,height*p.h,p.alpha,phase,false,p.angle,0);ctx.restore();
  }
 }
 function windHair(phase){
  // Connected sheared strips bend continuously rather than translating the
  // whole graphic. The roots stay fixed; travel grows toward the fading tips.
  const a=TAU*phase,x=width*.711,y=height*.002,w=width*.282,h=height*.157,segments=40;
  const bend=u=>u*u*height*(.007*Math.sin(a*2-u*4)+.0035*Math.sin(a*3-u*6));
  ctx.save();ctx.globalAlpha=.36;
  for(let i=0;i<segments;i++){
   const u=i/segments,v=(i+1)/segments,dx=w*u,dw=w/segments,dy=bend(u),slope=(bend(v)-dy)/dw;
   ctx.setTransform(1,slope,0,1,x+dx,y+dy);ctx.drawImage(hairTexture,768*u,0,768/segments,384,0,0,dw+.2,h);
  }ctx.restore();
  // Sparse fine trails continue the painted ribbons into the wind, with
  // staggered lengths and curves. This does not stamp repeated hair copies.
  for(let i=0;i<14;i++){
   const sx=width*(.729+(i%3)*.006),sy=height*(.047+i*.0064),length=width*(.168+(i%5)*.012);
   const wave=Math.sin(a*2-i*.36),tipY=sy-height*(.018+i*.001)+height*.010*wave;
   const g=ctx.createLinearGradient(sx,sy,sx+length,tipY);g.addColorStop(0,'rgba(185,206,211,0)');g.addColorStop(.26,'rgba(185,206,211,.18)');g.addColorStop(1,'rgba(185,206,211,0)');
   ctx.strokeStyle=g;ctx.lineWidth=width*(.00038+(i%3)*.00016);ctx.beginPath();ctx.moveTo(sx,sy);
   ctx.bezierCurveTo(sx+length*.3,sy+height*.009*Math.sin(a*2-i*.36-.8),sx+length*.65,tipY+height*.020*Math.sin(a*2-i*.36-.5),sx+length,tipY);ctx.stroke();
  }
 }
 // Electrical branches live outside her cloud silhouette. Every bolt shape
 // and event is seeded once, so the crackle repeats without per-frame noise.
 // There are no bolts in the base painting and no whole-scene flashes.
 const arcPaths=[
  [[.660,.175],[.633,.153],[.605,.128],[.562,.101],[.535,.052]],
  [[.553,.290],[.529,.267],[.501,.278],[.478,.235],[.456,.221]],
  [[.650,.397],[.616,.421],[.576,.403],[.552,.435],[.521,.478]],
  [[.838,.355],[.863,.367],[.880,.348],[.914,.389],[.945,.412]],
  [[.854,.253],[.874,.219],[.902,.228],[.930,.180],[.964,.150]],
  [[.848,.151],[.884,.146],[.907,.107],[.947,.087],[.970,.037]],
  [[.810,.460],[.843,.484],[.871,.477],[.894,.509],[.939,.520]],
  [[.640,.475],[.609,.490],[.591,.522],[.555,.511],[.540,.552]]
 ];
 const roughen=points=>{
  const out=[points[0]];
  for(let i=1;i<points.length;i++){
   const [x,y]=points[i-1],[ex,ey]=points[i];
   for(let j=1;j<=3;j++)out.push(j===3?[ex,ey]:[x+(ex-x)*j/3+(random()-.5)*.007,y+(ey-y)*j/3+(random()-.5)*.014]);
  }return out;
 };
 const starts=[.38,1.91,3.06,4.62,5.87,7.11,8.35,10.18];
 const bolts=arcPaths.flatMap((points,index)=>[0,1].map(pass=>{
  const path=roughen(points),[x,y]=path[6],side=index<3||index===7?-1:1;
  const branch=roughen([[x,y],[x+side*.020,y+.015],[x+side*.032,y+.040]]);
  return {path,branch,start:pass===1?(index===0?15.86:frac((starts[index]+6.3)/16)*16):starts[index],duration:.32+random()*.18};
 }));
 function electricity(phase){
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const bolt of bolts){
   const elapsed=frac(phase-bolt.start/THESSALY_PERIOD)*THESSALY_PERIOD;
   if(elapsed>=bolt.duration)continue;
   const u=elapsed/bolt.duration,pulse=Math.sin(Math.PI*u)**2*(.62+.38*Math.sin(TAU*u*2)**2);
   for(const [branch,points]of [[false,bolt.path],[true,bolt.branch]]){
    const strength=pulse*(branch?.55:1);
    for(const [thickness,alpha]of [[.0027,.11],[.0007,.72]]){
     ctx.strokeStyle=`rgba(162,220,243,${strength*alpha})`;ctx.lineWidth=width*thickness;
     ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*width,y*height):ctx.moveTo(x*width,y*height));ctx.stroke();
    }
   }
   const [x,y]=bolt.path[0];glow(width*x,height*y,width*.015,height*.027,'125,190,220',pulse*.13);
  }
  ctx.restore();
 }
 function motes(phase){
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const s of spores){
   const u=frac(phase*2+s.offset),fade=Math.sin(Math.PI*u)**2*.32;
   const x=width*(s.x+s.drift*u*.10),y=height*(1.04-u*1.12);
   ctx.fillStyle=`rgba(142,175,107,${fade})`;ctx.fillRect(x,y,s.size,s.size);
  }ctx.restore();
 }
 function render(seconds,{ambient=true,cloudMotion=true,atmosphere=true,courtyardMist=true,bossMotion=true,bodyClouds=true,hairMotion=true,spectralWisps=true,lightning=true,spores:drift=true}={}){
  const phase=frac(seconds/THESSALY_PERIOD),cue={t:phase*THESSALY_PERIOD,battle:false};if(destroyed)return cue;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(background,0,0);
  if(ambient&&cloudMotion)sky(phase);if(ambient&&bossMotion){if(bodyClouds)cloudBody(phase);if(hairMotion)windHair(phase);if(spectralWisps)aura(phase);}
  if(ambient&&atmosphere)miasma(phase);if(ambient&&courtyardMist)courtyardHaze(phase);if(ambient&&lightning)electricity(phase);if(ambient&&drift)motes(phase);
  return cue;
 }
 return {render,width,height,period:THESSALY_PERIOD,destroy(){destroyed=true;for(const c of buffers)c.width=c.height=1;canvas.width=canvas.height=1;}};
}
