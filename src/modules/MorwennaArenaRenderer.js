// Stable approved painting with independently painted atmosphere layers.
// All lifetimes share one period; particles reset only at zero opacity.
export const MORWENNA_PERIOD = 24;
const TAU = Math.PI * 2;
const frac = value => value - Math.floor(value);
const envelope = u => Math.sin(Math.PI * u) ** 2;

export function createMorwennaArenaScene(canvas, {background, clouds, mist, maxWidth} = {}) {
 const sw = background.naturalWidth || background.width;
 const sh = background.naturalHeight || background.height;
 const scale = Math.min(1, (maxWidth || sw) / sw);
 const width = Math.round(sw * scale), height = Math.round(sh * scale);
 canvas.width = width; canvas.height = height;
 const ctx = canvas.getContext('2d', {alpha:false});
 if (!ctx) throw new Error('Unable to create the Morwenna scene canvas');
 const buffers = []; let destroyed = false;
 const layer = (w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  buffers.push(c); return c;
 };
 const painting = layer(width, height);
 painting.getContext('2d').drawImage(background, 0, 0, width, height);
 // Four distinct, freshly generated formations per atlas, with true alpha.
 const atlas = image => Array.from({length:4}, (_, index) => {
  const c = layer(512, 256), cx = c.getContext('2d');
  if (!image) return c;
  const w = (image.naturalWidth || image.width) / 2;
  const h = (image.naturalHeight || image.height) / 2;
  cx.drawImage(image, (index % 2) * w, Math.floor(index / 2) * h, w, h, 0, 0, 512, 256);
  const p = cx.getImageData(0, 0, 512, 256);
  for (let y=0;y<256;y++) for (let x=0;x<512;x++) {
   const edge = Math.min(x,y,511-x,255-y);
   p.data[(y*512+x)*4+3] *= Math.min(1,edge/22);
  }
  cx.putImageData(p,0,0); return c;
 });
 const storm = atlas(clouds), fog = atlas(mist);
 const skyMask = layer(width, Math.ceil(height*.50));
 const sm = skyMask.getContext('2d');
 // The mask stays fixed: no architecture, banners or boss silhouette slides.
 const skyZones = [
  [[.237,0],[.726,0],[.699,.104],[.649,.178],[.603,.274],[.565,.392],[.540,.468],[.481,.422],[.472,.350],[.439,.312],[.42,.28],[.409,.19],[.385,.104],[.364,.079],[.348,.086],[.331,.191],[.305,.218],[.286,.233],[.254,.196],[.242,.093]],
  [[.875,0],[.963,0],[.945,.134],[.92,.169],[.90,.12]]
 ];
 sm.filter = 'blur('+Math.max(5,width*.006)+'px)'; sm.fillStyle = '#fff';
 for (const points of skyZones) {
  sm.beginPath(); points.forEach(([x,y],i) => i ? sm.lineTo(x*width,y*height) : sm.moveTo(x*width,y*height));
  sm.closePath(); sm.fill();
 }
 sm.filter = 'none';
 // Crisp exclusion over the distant cathedral's silhouette and the near arch.
 sm.clearRect(width*.302,height*.082,width*.116,height*.305);
 sm.clearRect(0,0,width*.235,skyMask.height);
 const skyLayer = layer(width,skyMask.height), sc = skyLayer.getContext('2d');
 const skyBanks = [
  {x:.37,y:.027,w:.35,h:.23,flow:.092,alpha:.23,offset:.03,part:0},
  {x:.55,y:.105,w:.37,h:.29,flow:.083,alpha:.21,offset:.42,part:1},
  {x:.49,y:.284,w:.29,h:.24,flow:.072,alpha:.15,offset:.69,part:2},
  {x:.62,y:.028,w:.30,h:.20,flow:.098,alpha:.18,offset:.84,part:3},
  {x:.86,y:.075,w:.22,h:.17,flow:.075,alpha:.14,offset:.22,part:0}
 ];
 const fogBanks = [
  {x:.10,y:.604,w:.28,h:.072,alpha:.14,flow:.085,offset:.13},
  {x:.29,y:.606,w:.28,h:.082,alpha:.19,flow:.07,offset:.61},
  {x:.44,y:.624,w:.31,h:.055,alpha:.16,flow:.09,offset:.32},
  {x:.58,y:.631,w:.27,h:.070,alpha:.17,flow:.065,offset:.81},
  {x:.73,y:.64,w:.24,h:.073,alpha:.15,flow:.08,offset:.04},
  {x:.87,y:.615,w:.27,h:.080,alpha:.12,flow:.075,offset:.48},
  {x:.005,y:.782,w:.22,h:.12,alpha:.09,flow:.055,offset:.24},
  {x:.96,y:.835,w:.22,h:.08,alpha:.08,flow:.06,offset:.74}
 ].flatMap((p,index)=>[ {...p,part:index%4}, {...p,x:p.x-.045,y:p.y+.013,w:p.w*.78,h:p.h*.72,alpha:p.alpha*.58,offset:frac(p.offset+.47),part:(index+2)%4} ]);
 const shroudWisps = [
  {x:.593,y:.451,w:.09,h:.058,offset:.04,alpha:.085,angle:-.8},
  {x:.553,y:.566,w:.105,h:.06,offset:.42,alpha:.08,angle:-.55},
  {x:.88,y:.437,w:.095,h:.057,offset:.72,alpha:.075,angle:-.6},
  {x:.846,y:.584,w:.08,h:.055,offset:.25,alpha:.095,angle:-.85},
  {x:.773,y:.565,w:.042,h:.054,offset:.56,alpha:.065,angle:-1.12}
 ];
 const strings = [
  [[.653,.23],[.691,.488]],
  [[.674,.229],[.717,.410]],
  [[.686,.237],[.721,.40]],
  [[.818,.282],[.775,.418]],
  [[.829,.275],[.819,.384]]
 ];
 let seed=8143;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const motes=Array.from({length:34},()=>({x:.56+random()*.36,y:.56+random()*.12,offset:random(),rise:.05+random()*.11,flow:.013+random()*.03,size:.6+random()*1.1}));
 const nearMist=[
  {x:.035,y:.892,w:.37,h:.11,flow:.16,alpha:.22,offset:.14,part:3},
  {x:.32,y:.986,w:.47,h:.115,flow:.20,alpha:.25,offset:.61,part:0},
  {x:.66,y:.93,w:.40,h:.081,flow:.19,alpha:.19,offset:.32,part:1},
  {x:.94,y:.845,w:.30,h:.092,flow:.14,alpha:.20,offset:.83,part:2}
 ];
 const nearAsh=Array.from({length:28},()=>({
  x:-.06+random()*1.02,y:.94+random()*.14,offset:random(),
  rise:.10+random()*.14,flow:.08+random()*.08,size:1.1+random()*1.6,
  tilt:random()*TAU,warm:random()<.32
 }));
 const emberSprite=layer(32,32),ec=emberSprite.getContext('2d');
 const eg=ec.createRadialGradient(16,16,0,16,16,16);
 eg.addColorStop(0,'rgba(255,204,138,.7)');eg.addColorStop(.18,'rgba(233,134,60,.4)');eg.addColorStop(1,'rgba(193,84,34,0)');
 ec.fillStyle=eg;ec.fillRect(0,0,32,32);

 function plume(target,texture,x,y,w,h,alpha,angle=0) {
  if(alpha<.00001)return;
  target.save();target.globalAlpha=alpha;target.translate(x,y);target.rotate(angle);
  target.drawImage(texture,-w/2,-h/2,w,h);target.restore();
 }
 function glow(x,y,rx,ry,color,alpha) {
  ctx.save();ctx.translate(x*width,y*height);ctx.scale(rx*width,ry*height);
  const g=ctx.createRadialGradient(0,0,0,0,0,1);
  g.addColorStop(0,`rgba(${color},${alpha})`);g.addColorStop(1,`rgba(${color},0)`);
  ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 function drawClouds(phase) {
  sc.globalCompositeOperation='source-over';sc.clearRect(0,0,skyLayer.width,skyLayer.height);
  for (const p of skyBanks) {
   const u=frac(phase+p.offset),growth=1+u*.035;
   plume(sc,storm[p.part],width*(p.x+p.flow*(u-.5)),height*(p.y-.008*u),width*p.w*growth,height*p.h*growth,p.alpha*envelope(u));
  }
  sc.globalCompositeOperation='destination-in';sc.drawImage(skyMask,0,0);ctx.drawImage(skyLayer,0,0);
 }
 function drawMist(phase) {
  for (const p of fogBanks) {
   const u=frac(phase+p.offset),growth=1+.15*u;
   plume(ctx,fog[p.part],width*(p.x+p.flow*(u-.5)),height*(p.y-.013*u),width*p.w*growth,height*p.h*(1+.2*u),p.alpha*envelope(u));
  }
 }
 function drawShroud(phase) {
  for (const [index,p] of shroudWisps.entries()) {
   const u=frac(phase*2+p.offset);
   // Vapour peels upward from the painted veil, with no duplicate boss art.
   plume(ctx,fog[(index+1)%4],width*(p.x+.018*u),height*(p.y-.052*u),width*p.w*(.8+.3*u),height*p.h*(.7+.3*u),p.alpha*envelope(u),p.angle);
  }
  // Rooted, translucent fabric-edge highlights suggest a faint flutter.
  for (const [index,[x,y,side]] of [[.604,.353,-1],[.584,.462,-1],[.87,.371,1],[.854,.48,1]].entries()) {
   const a=TAU*phase*2-index*.8,length=height*.09,tip=width*.004*Math.sin(a);
   const g=ctx.createLinearGradient(x*width,y*height,x*width+side*width*.027,y*height+length);
   g.addColorStop(0,'rgba(148,128,151,0)');g.addColorStop(.35,'rgba(148,128,151,.10)');g.addColorStop(1,'rgba(148,128,151,0)');
   ctx.strokeStyle=g;ctx.lineWidth=width*.00065;ctx.beginPath();ctx.moveTo(x*width,y*height);
   ctx.bezierCurveTo(x*width+side*width*.007,y*height+length*.32,x*width+side*width*.015+tip,y*height+length*.65,x*width+side*width*.027+tip,y*height+length);ctx.stroke();
  }
 }
 function drawCurse(phase) {
  const breath=.5-.5*Math.cos(TAU*phase*3);
  ctx.save();ctx.globalCompositeOperation='lighter';
  glow(.749,.447,.014,.028,'229,133,71',.055+.045*breath);
  glow(.744,.11,.003,.013,'240,153,77',.065+.075*breath);
  glow(.755,.11,.003,.013,'240,153,77',.065+.075*breath);
  glow(.674,.362,.009,.016,'164,103,200',.026+.035*(1-breath));
  for (const [index,[start,end]] of strings.entries()) {
   const point=v=>[width*(start[0]+(end[0]-start[0])*v),height*(start[1]+(end[1]-start[1])*v)];
   const trace=(from,to,style,lineWidth)=>{
    ctx.strokeStyle=style;ctx.lineWidth=Math.max(.5,width*lineWidth);
    ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(...to);ctx.stroke();
   };
   // A dim continuous thread keeps the attachment readable between pulses.
   const pulse=.5-.5*Math.cos(TAU*phase*3-index*.7);
   trace(point(0),point(1),`rgba(162,103,201,${.055+.075*pulse})`,.0011);
   for(let packet=0;packet<2;packet++) {
    const u=frac(phase*3+index*.213+packet*.5),fade=envelope(u);
    const from=point(Math.max(0,u-.19)),to=point(Math.min(1,u+.10)),center=point(u);
    const gradient=(color,alpha)=>{
     const g=ctx.createLinearGradient(...from,...to);
     g.addColorStop(0,`rgba(${color},0)`);g.addColorStop(.65,`rgba(${color},${alpha*fade})`);g.addColorStop(1,`rgba(${color},0)`);return g;
    };
    // Broad violet halo, bright fine core and tiny sparks all follow the
    // existing straight thread; endpoints and painted hands remain anchored.
    trace(from,to,gradient('169,89,220',.23),.004);
    trace(from,to,gradient('215,157,250',.70),.0015);
    trace(from,to,gradient('240,210,255',.90),.00065);
    glow(center[0]/width,center[1]/height,.004,.007,'182,105,230',.25*fade);
    for(let spark=0;spark<2;spark++) {
     const v=u-spark*.029;if(v<0)continue;
     const p=point(v),size=width*(spark?.00040:.00065);
     ctx.fillStyle=`rgba(242,217,255,${fade*(spark?.48:.82)})`;
     ctx.beginPath();ctx.arc(p[0],p[1],Math.max(.6,size),0,TAU);ctx.fill();
    }
   }
  }
  // The reflected ember glow remains at the Matriarch's feet.
  glow(.887,.638,.034,.009,'205,116,58',.022+.020*breath);ctx.restore();
 }
 function drawEmbers(phase) {
  ctx.save();ctx.globalCompositeOperation='lighter';
  for (const p of motes) {
   const u=frac(phase*2+p.offset),size=p.size*width/1774;
   ctx.globalAlpha=.28*envelope(u);
   ctx.drawImage(emberSprite,width*(p.x+p.flow*u)-size*3,height*(p.y-p.rise*u)-size*3,size*6,size*6);
  }ctx.restore();
 }
 function drawForeground(phase) {
  for(const p of nearMist) {
   const u=frac(phase+p.offset),growth=1+.16*u;
   plume(ctx,fog[p.part],width*(p.x+p.flow*(u-.5)),height*(p.y-.019*u),width*p.w*growth,height*p.h*(1+.12*u),p.alpha*envelope(u));
  }
  // Larger near-camera ash flakes travel with the same wind as the mist.
  // Their staggered zero-alpha resets keep the 24-second loop seamless.
  ctx.save();
  for(const p of nearAsh) {
   const u=frac(phase*3+p.offset),alpha=envelope(u),size=p.size*width/1774;
   ctx.save();ctx.translate(width*(p.x+p.flow*u),height*(p.y-p.rise*u));
   ctx.rotate(p.tilt+u*2.6);ctx.globalAlpha=alpha*(p.warm?.37:.35);
   ctx.fillStyle=p.warm?'#bc835a':'#8e829a';
   // A narrow changing aspect suggests tumbling char, with no camera shake.
   const thin=.28+.42*Math.abs(Math.sin(p.tilt+TAU*u));
   ctx.beginPath();ctx.ellipse(0,0,size*thin,size,0,0,TAU);ctx.fill();
   if(p.warm) {ctx.globalAlpha=alpha*.17;ctx.drawImage(emberSprite,-size*3,-size*3,size*6,size*6);}
   ctx.restore();
  }
  ctx.restore();
 }
 function render(seconds,{ambient=true,clouds=true,mist=true,shroud=true,curse=true,embers=true,foreground=true}={}) {
  if(destroyed)return {t:0};
  // Snap subnanosecond roundoff, so t and t+period use identical raster input.
  const t=Math.round(((seconds%MORWENNA_PERIOD+MORWENNA_PERIOD)%MORWENNA_PERIOD)*1e9)/1e9;
  const phase=t/MORWENNA_PERIOD;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  ctx.drawImage(painting,0,0);
  if(ambient) {
   if(clouds)drawClouds(phase);
   if(shroud)drawShroud(phase);
   if(curse)drawCurse(phase);
   if(mist)drawMist(phase);
   if(embers)drawEmbers(phase);
   if(foreground)drawForeground(phase);
  }
  return {t};
 }
 return {render,period:MORWENNA_PERIOD,destroy(){
  if(destroyed)return;destroyed=true;for(const c of buffers)c.width=c.height=1;
  canvas.width=canvas.height=1;
 }};
}
