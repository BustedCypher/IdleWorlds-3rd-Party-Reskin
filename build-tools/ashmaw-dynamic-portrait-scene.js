// Experimental idle: a fixed detailed portrait follows a deliberate lean and
// settling head dip, with painted blinks and a timed smoky exhale.
// Head detail stays attached to the same plate; no skin or mesh deformation.
export const PORTRAIT_PERIOD=8;
const TAU=Math.PI*2;
const frac=x=>x-Math.floor(x);
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
function createMoltenGpu(background,width,height,fields,bright,dark){
 const output=document.createElement('canvas');output.width=width;output.height=height;
 const gl=output.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false,depth:false,stencil:false});
 if(!gl)return null;
 const info=gl.getExtension('WEBGL_debug_renderer_info');
 if(info&&/swiftshader|llvmpipe|software|basic render/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))){
  gl.getExtension('WEBGL_lose_context')?.loseContext();return null;
 }
 const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);return null;}return shader;};
 const vertex=compile(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 uv;void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}');
 const fragment=compile(gl.FRAGMENT_SHADER,`precision highp float;
 varying vec2 uv;uniform sampler2D scene,flowMap,hotTile,coolTile;uniform vec2 resolution;uniform float phase;
 void main(){
  vec4 field=texture2D(flowMap,uv);if(field.r<0.001){gl_FragColor=vec4(0.0);return;}
  vec2 direction=normalize(field.gb*2.0-1.0),p=vec2(uv.x,1.0-uv.y)*resolution;
  float cycles=floor(field.a*255.0+0.5),travel=phase*256.0*cycles;
  float lateral=3.0*sin(6.28318530718*phase+dot(direction,vec2(1.7,2.3)));
  vec2 local=vec2(dot(p,vec2(-direction.y,direction.x))-lateral,dot(p,direction)-travel);
  vec2 tileUv=local/256.0;vec4 hot=texture2D(hotTile,tileUv),cool=texture2D(coolTile,tileUv);
  vec3 original=texture2D(scene,uv).rgb;
  vec3 molten=original*(1.0-cool.a*(1.0-cool.rgb))+hot.rgb*hot.a;
  gl_FragColor=vec4(molten,field.r);
 }`);
 if(!vertex||!fragment)return null;
 const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;
 // Upload raw RGBA bytes: alpha stores a small integer speed, which would
 // lose the direction channels if premultiplied through a Canvas bitmap.
 const data=new Uint8Array(width*height*4);
 for(const {x,y,w,h,mask,dx,dy,cycles} of fields){
  const pixels=mask.getContext('2d').getImageData(0,0,w,h).data;
  for(let sy=0;sy<h;sy++)for(let sx=0;sx<w;sx++){
   const strength=pixels[(sy*w+sx)*4+3],i=((height-y-sy-1)*width+x+sx)*4;
   if(strength<=data[i])continue;
   data[i]=strength;data[i+1]=Math.round((dx+1)*127.5);data[i+2]=Math.round((dy+1)*127.5);data[i+3]=cycles;
  }
 }
 gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
 for(const [unit,name,source] of [[0,'scene',background],[1,'flowMap',data],[2,'hotTile',bright],[3,'coolTile',dark]]){
  gl.activeTexture(gl.TEXTURE0+unit);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,unit>=2?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,unit>=2?gl.REPEAT:gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,unit===1?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,unit===1?gl.NEAREST:gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,unit!==1);
  if(unit===1)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
  else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  gl.uniform1i(gl.getUniformLocation(program,name),unit);
 }
 gl.uniform2f(gl.getUniformLocation(program,'resolution'),width,height);
 const time=gl.getUniformLocation(program,'phase');gl.viewport(0,0,width,height);
 return (ctx,phase)=>{gl.uniform1f(time,phase);gl.drawArrays(gl.TRIANGLES,0,6);ctx.drawImage(output,0,0);};
}
function createMoltenSurface(background,width,height,fallShapes){
 const tileSize=256;
 const hash=(x,y)=>{let h=Math.imul(x+19,374761393)^Math.imul(y+73,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
 const wrap=(x,n)=>((x%n)+n)%n;
 const noise=(x,y,nx,ny)=>{
  const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(0,1,frac(x)),fy=smooth(0,1,frac(y));
  const a=hash(wrap(ix,nx),wrap(iy,ny)),b=hash(wrap(ix+1,nx),wrap(iy,ny));
  const c=hash(wrap(ix,nx),wrap(iy+1,ny)),d=hash(wrap(ix+1,nx),wrap(iy+1,ny));
  return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
 };
 const tile=()=>{const c=document.createElement('canvas');c.width=tileSize;c.height=tileSize;return c;};
 const bright=tile(),dark=tile(),bc=bright.getContext('2d'),dc=dark.getContext('2d');
 const bp=bc.createImageData(tileSize,tileSize),dp=dc.createImageData(tileSize,tileSize);
 for(let y=0;y<tileSize;y++)for(let x=0;x<tileSize;x++){
  const u=(x+.5)/tileSize,v=(y+.5)/tileSize;
  // Periodic domain distortion makes irregular molten eddies. Both image
  // edges match, so advecting a complete tile returns to the same surface.
  const a=u+.11*Math.sin(TAU*v)+.07*Math.sin(TAU*(u*2+v));
  const b=v+.06*Math.sin(TAU*(u*3-v*2));
  const n=.52*noise(a*5,b*3,5,3)+.28*noise(a*11,b*7,11,7)
   +.14*noise(a*23,b*13,23,13)+.06*noise(a*47,b*29,47,29);
  const heat=smooth(.50,.70,n),crust=1-smooth(.31,.57,n),i=(y*tileSize+x)*4;
  bp.data.set([255,205,65,Math.round(heat*62)],i);
  dp.data.set([56,19,12,Math.round(crust*58)],i);
 }
 bc.putImageData(bp,0,0);dc.putImageData(dp,0,0);
 const rivers=[
  {points:[[110,489],[205,516],[328,568],[306,603],[202,565],[115,544]],direction:[.83,.56],cycles:1},
  {points:[[270,571],[420,574],[644,572],[795,537],[807,573],[659,609],[432,631],[271,620]],direction:[-1,.12],cycles:1},
  {points:[[466,290],[556,306],[677,321],[889,365],[1040,374],[1056,401],[885,393],[704,358],[551,343],[479,324]],direction:[1,.18],cycles:1},
  {points:[[541,368],[671,386],[789,395],[1012,425],[1010,454],[786,423],[659,414],[550,403]],direction:[1,.12],cycles:1},
  {points:[[253,688],[355,681],[460,684],[543,718],[517,791],[575,821],[362,821],[315,770],[261,740]],direction:[.32,1],cycles:1},
  {points:[[341,688],[531,620],[928,610],[1370,683],[1370,821],[341,821]],direction:[1,.10],cycles:1},
  {points:[[1100,278],[1213,286],[1377,354],[1517,369],[1718,343],[1756,369],[1550,400],[1373,391],[1209,322],[1100,303]],direction:[1,.28],cycles:1},
  {points:[[1100,382],[1212,418],[1360,430],[1510,423],[1677,393],[1694,431],[1522,467],[1345,469],[1203,446],[1100,408]],direction:[-1,.17],cycles:1},
  {points:[[1223,451],[1281,449],[1247,568],[1200,572]],direction:[-.22,1],cycles:4},
  {points:[[1145,300],[1208,303],[1210,392],[1150,394]],direction:[0,1],cycles:4},
  {points:[[1605,440],[1663,440],[1644,612],[1599,618]],direction:[-.10,1],cycles:4}
 ];
 const shapes=[...fallShapes.map(f=>({...f,direction:[0,1],cycles:4})),...rivers];
 const fields=shapes.map(({points,direction,cycles},index)=>{
  const x=Math.max(0,Math.min(...points.map(p=>p[0]))),y=Math.max(0,Math.min(...points.map(p=>p[1])));
  const w=Math.min(width,Math.max(...points.map(p=>p[0])))-x,h=Math.min(height,Math.max(...points.map(p=>p[1])))-y;
  const mask=document.createElement('canvas');mask.width=w;mask.height=h;const mc=mask.getContext('2d');
  mc.drawImage(background,-x,-y,width,height);const pixels=mc.getImageData(0,0,w,h),data=pixels.data;
  for(let i=0;i<data.length;i+=4){
   const [r,g,b]=[data[i],data[i+1],data[i+2]];
   const heat=smooth(160,234,r)*smooth(66,146,g)*smooth(20,82,r-b)*smooth(12,42,g-b);
   data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(heat*230);
  }
  mc.putImageData(pixels,0,0);
  const edge=document.createElement('canvas');edge.width=w;edge.height=h;const ec=edge.getContext('2d');
  ec.filter='blur(2px)';ec.fillStyle='#fff';ec.beginPath();points.forEach(([px,py],i)=>i?ec.lineTo(px-x,py-y):ec.moveTo(px-x,py-y));ec.closePath();ec.fill();
  mc.globalCompositeOperation='destination-in';mc.drawImage(edge,0,0);
  // A reduced-resolution texture pass keeps the Canvas fallback economical;
  // masks and channel placement are still derived from the native artwork.
  const flow=document.createElement('canvas');flow.width=Math.ceil(w/3);flow.height=Math.ceil(h/3);const fc=flow.getContext('2d');fc.scale(flow.width/w,flow.height/h);
  const length=Math.hypot(...direction),dx=direction[0]/length,dy=direction[1]/length;
  return {x,y,w,h,mask,flow,fc,dx,dy,cycles,index,brightPattern:fc.createPattern(bright,'repeat'),darkPattern:fc.createPattern(dark,'repeat')};
 });
 const gpu=createMoltenGpu(background,width,height,fields,bright,dark);
 if(gpu)return gpu;
 return (ctx,phase)=>{
  ctx.save();
  for(const {x,y,w,h,mask,flow,fc,dx,dy,cycles,index,brightPattern,darkPattern} of fields){
   const travel=phase*tileSize*cycles,lateral=3*Math.sin(TAU*phase+index*.67);
   const transform=new DOMMatrix([-dy,dx,dx,dy,-x+travel*dx-lateral*dy+index*29,-y+travel*dy+lateral*dx+index*41]);
   for(const [pattern,blend] of [[darkPattern,'multiply'],[brightPattern,'lighter']]){
    pattern.setTransform(transform);fc.globalCompositeOperation='source-over';fc.clearRect(0,0,w,h);fc.drawImage(mask,0,0);
    fc.globalCompositeOperation='source-in';fc.fillStyle=pattern;fc.fillRect(0,0,w,h);
    ctx.globalCompositeOperation=blend;ctx.drawImage(flow,x,y,w,h);
   }
  }
  ctx.restore();
 };
}
export function createPortraitScene(canvas,{background,dragon,blink,smoke}){
 const width=1915,height=821;canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{alpha:false});
 const layer=()=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
 const eye=layer(),ec=eye.getContext('2d');ec.drawImage(blink,0,0,width,height);
 ec.globalCompositeOperation='destination-in';ec.save();ec.translate(width*.715,height*.267);ec.scale(45,23);
 const mask=ec.createRadialGradient(0,0,.55,0,0,1);mask.addColorStop(0,'#fff');mask.addColorStop(1,'#fff0');ec.fillStyle=mask;ec.fillRect(-1,-1,2,2);ec.restore();
 const original=layer(),oc=original.getContext('2d',{willReadFrequently:true});oc.drawImage(dragon,0,0,width,height);
 // The original painting stays intact; rejected jaw cels are not used.
 const headFrames=[original];
 const hotFrames=headFrames.map(frame=>{
  const hot=layer(),hc=hot.getContext('2d',{willReadFrequently:true});hc.drawImage(frame,0,0);
  const hotPixels=hc.getImageData(0,0,width,height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const i=(y*width+x)*4,d=hotPixels.data;
   const inMouth=x>width*.62&&x<width*.77&&y>height*.34&&y<height*.70;
   const intensity=inMouth?Math.max(0,Math.min(1,(d[i]-175)/80))*Math.max(0,Math.min(1,(d[i+1]-75)/150)):0;
   d[i]=255;d[i+1]=155;d[i+2]=38;d[i+3]=Math.round(d[i+3]*intensity);
  }
  hc.putImageData(hotPixels,0,0);return hot;
 });
 let seed=1717;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const embers=Array.from({length:96},()=>({x:random(),start:random(),size:.7+random()*1.8,drift:random()*2-1,speed:random()*2+1}));
 // Extract light only from the existing lava, inside the selected waterfalls.
 // Animated highlights therefore retain the painted rock and lava boundaries.
 const fallShapes=[
  {points:[[527,0],[549,0],[551,239],[522,239]],cycles:6,offset:.12},
  {points:[[775,112],[797,115],[814,282],[781,282]],cycles:5,offset:.44},
  {points:[[466,317],[499,320],[511,487],[468,487]],cycles:5,offset:.73},
  {points:[[562,394],[592,395],[606,511],[566,515]],cycles:6,offset:.31},
  {points:[[262,621],[329,622],[352,688],[384,799],[350,813],[332,735],[298,682],[262,674]],cycles:5,offset:.66},
  {points:[[1380,697],[1427,696],[1448,785],[1405,790]],cycles:6,offset:.08}
 ];
 const moltenSurface=createMoltenSurface(background,width,height,fallShapes);
 const falls=fallShapes.map(({points,cycles,offset})=>{
  const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));
  const w=Math.max(...points.map(p=>p[0]))-x,h=Math.max(...points.map(p=>p[1]))-y;
  const plate=document.createElement('canvas');plate.width=w;plate.height=h;
  const pc=plate.getContext('2d');pc.drawImage(background,-x,-y,width,height);
  const pixels=pc.getImageData(0,0,w,h),d=pixels.data;
  for(let i=0;i<d.length;i+=4){
   const strength=Math.max(0,Math.min(1,(d[i]-165)/90))*Math.max(0,Math.min(1,(d[i+1]-65)/140));
   d[i]=255;d[i+1]=178;d[i+2]=62;d[i+3]=Math.round(strength*255);
  }
  pc.putImageData(pixels,0,0);pc.globalCompositeOperation='destination-in';
  pc.beginPath();points.forEach(([px,py],i)=>i?pc.lineTo(px-x,py-y):pc.moveTo(px-x,py-y));pc.closePath();pc.fill();
  const flow=document.createElement('canvas');flow.width=w;flow.height=h;
  return {x,y,w,h,plate,flow,fc:flow.getContext('2d'),cycles,offset};
 });
 function lavaLight(phase){
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const {x,y,w,h,plate,flow,fc,cycles,offset} of falls){
   fc.globalCompositeOperation='source-over';fc.clearRect(0,0,w,h);fc.drawImage(plate,0,0);
   fc.globalCompositeOperation='source-in';
   const band=h*.52,shift=frac(phase*cycles+offset)*band;
   // Extend the gradient beyond both ends of the fall. Moving stops enter
   // outside the painted region, so they cannot pop at its visible boundary.
   const g=fc.createLinearGradient(0,-band,0,h+band),gradientHeight=h+2*band;
   // The broad dim base prevents obvious stripe gaps; soft brighter bands
   // descend through the original lava texture at different speeds.
   const stops=[{at:0,alpha:.035},{at:1,alpha:.035}];
   for(let j=-3;j<6;j++)for(const [t,a] of [[0,.035],[.35,.28],[.62,.10],[1,.035]]){
    const at=(shift+(j+t)*band+band)/gradientHeight;if(at>0&&at<1)stops.push({at,alpha:a});
   }
   stops.sort((a,b)=>a.at-b.at).forEach(s=>g.addColorStop(s.at,`rgba(255,190,75,${s.alpha})`));
   fc.fillStyle=g;fc.fillRect(0,0,w,h);ctx.drawImage(flow,x,y);
  }
  ctx.restore();
 }
 function smokeCloud(x,y,w,h,alpha,rotation=0,flip=false){
  if(!smoke||alpha<.001)return;
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(rotation);
  ctx.scale(flip?-1:1,1);ctx.drawImage(smoke,-w*.5,-h*.5,w,h);ctx.restore();
 }
 function backgroundSmoke(phase){
  // Slower-looking small curls among the distant ruins give the background
  // its own atmospheric depth, independently of the foreground neck bank.
  for(let i=0;i<6;i++){
   const u=frac(phase+i/6+.18),fade=Math.sin(Math.PI*u)**2;
   smokeCloud(width*(.19+i*.12)-u*30,height*(.47+i%2*.025)-u*50,
    330+u*90,140+u*55,.20*fade,-.07+u*.08,i%2===1);
  }
  for(let i=0;i<6;i++){
   const u=frac(phase+i/6),fade=Math.sin(Math.PI*u)**2;
   smokeCloud(width*(.15+i*.135)-u*55,height*(.88-i%2*.035)-u*84,
    370+u*180,160+u*95,.33*fade,-.09+u*.11,i%2===1);
  }
  for(let i=0;i<3;i++){
   const u=frac(phase+i/3),fade=Math.sin(Math.PI*u)**2;
   smokeCloud(width*.87-u*95,height*.80-u*135,560+u*170,260+u*100,.52*fade,-.18+u*.12,i%2===1);
  }
 }
 function puff(x,y,rx,ry,alpha,warm=false){
  ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
  const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,warm?`rgba(192,95,54,${alpha})`:`rgba(94,74,77,${alpha})`);g.addColorStop(1,'rgba(45,34,42,0)');
  ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 function render(seconds,{showSmoke=true,flowLava=true,flowSurface=true,showBlink=true}={}){
  const phase=frac(seconds/PORTRAIT_PERIOD),angle=phase*TAU;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  ctx.drawImage(background,0,0,width,height);
  if(flowLava&&flowSurface)moltenSurface(ctx,phase);
  if(flowLava)lavaLight(phase);
  const light=ctx.createRadialGradient(width*.39,height*.60,0,width*.39,height*.60,width*.62);
  light.addColorStop(0,`rgba(255,130,38,${.021+.012*Math.sin(angle*2+.5)})`);light.addColorStop(1,'rgba(255,120,30,0)');ctx.fillStyle=light;ctx.fillRect(0,0,width,height);
  if(showSmoke)backgroundSmoke(phase);
  // A sequence of intentional gestures: inhale, lean toward the arena,
  // exhale on the recovery, then settle with a small head dip.
  // Overscan is constant, so the skull never expands or contracts.
  const breathPhase=phase<.42?phase/.42:(1-phase)/.58;
  const breathLift=smooth(0,1,breathPhase);
  const lean=smooth(.08,.31,phase)*(1-smooth(.46,.71,phase));
  const nod=smooth(.66,.76,phase)*(1-smooth(.80,.96,phase));
  const exhale=smooth(.47,.58,phase)*(1-smooth(.73,.89,phase));
  const dx=5*Math.sin(angle)-25*lean+6*nod,dy=-21*breathLift+16*lean+10*nod;
  const tilt=.0025*Math.sin(angle)-.014*lean+.009*nod;
  const pivotX=width*.60-35.533+dx,pivotY=height*1.025+38.53+dy;
  ctx.save();ctx.translate(pivotX,pivotY);ctx.rotate(tilt);ctx.scale(1.10,1.10);ctx.translate(-width*.60,-height*1.025);
  ctx.drawImage(original,0,0);
  const blinkAmount=Math.max(smooth(.60,.625,phase)*(1-smooth(.647,.683,phase)),smooth(.16,.177,phase)*(1-smooth(.185,.213,phase)));
  if(showBlink){ctx.globalAlpha=blinkAmount;ctx.drawImage(eye,0,0);}
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.11+.07*Math.sin(angle-.7)+.08*exhale;ctx.drawImage(hotFrames[0],0,0);
  // Exhaust originates in head coordinates, so it follows the breathing pose.
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  if(showSmoke){
   for(let i=0;i<3;i++){
    const u=frac(phase*2+i/3+.13),fade=Math.sin(Math.PI*u)**2;
    smokeCloud(width*.641-u*158,height*.474-u*52,72+u*205,41+u*90,
     (.42+.28*exhale)*fade,-.16-u*.16,i%2===1);
   }
   for(let i=0;i<2;i++){
    const u=frac(phase*2+i/2+.29),fade=Math.sin(Math.PI*u)**2;
    smokeCloud(width*.631-u*118,height*.359-u*46,55+u*140,29+u*55,
     (.17+.10*exhale)*fade,-.15-u*.20,i%2===1);
   }
  }
  ctx.restore();
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  // Foreground curls and soft haze soften the shoulder edge. Individual
  // clouds fade completely before their reset, preserving the loop seam.
  if(showSmoke)smokeCloud(width*.86+Math.sin(angle)*12,height*.925-Math.cos(angle)*6,
   930,345,.32,.018*Math.sin(angle),true);
  if(showSmoke)for(let i=0;i<7;i++){
   const u=frac(phase+i/7),envelope=Math.sin(Math.PI*u)**2;
   const x=width*(.72+i*.043)-u*70,y=height*(.88+i*.010)-u*45;
   puff(x,y,220+u*60,100+u*35,.12*envelope,i%2===0);
   smokeCloud(x,y,490+u*160,250+u*75,.64*envelope,.12-u*.14,i%2===1);
  }
  ctx.globalCompositeOperation='lighter';
  for(const e of embers){
   const u=frac(phase+e.start),alpha=Math.sin(Math.PI*u)**2*.58;
   const x=e.x*width+e.drift*u*66+Math.sin(TAU*u*e.speed+e.start*TAU)*7;
   const y=height*(1.08-u*1.20);
   ctx.fillStyle=`rgba(255,${150+Math.round(70*e.x)},65,${alpha})`;ctx.fillRect(x,y,e.size,e.size*1.5);
  }
  ctx.globalCompositeOperation='source-over';
  const point=(x,y)=>({x:pivotX+1.10*((x-width*.60)*Math.cos(tilt)-(y-height*1.025)*Math.sin(tilt)),
   y:pivotY+1.10*((x-width*.60)*Math.sin(tilt)+(y-height*1.025)*Math.cos(tilt))});
  return {phase,dx,dy,tilt,blinkAmount,lean,nod,exhale,eye:point(width*.715,height*.267),
   muzzle:point(width*.641,height*.474),rightOverscan:Math.min(point(width,0).x,point(width,height).x)-width,
   topOverscan:Math.max(point(width*.54,0).y,point(width,0).y)};
 }
 return {render,width,height,period:PORTRAIT_PERIOD,headFrames};
}
