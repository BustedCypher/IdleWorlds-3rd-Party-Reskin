// Bake-only rig. Its source UVs never change: all frames reuse the same painted
// scale/crack map. The delivered sprite sheets play without this rig or WebGL.
const VERTEX=`
precision highp float;
attribute vec2 aUV;
varying vec2 vUV;
uniform float uPhase, uFire, uLayer;
uniform vec4 uDragonRect;
float pulse(float t) { return smoothstep(.16,.36,t)*(1.0-smoothstep(.68,.94,t)); }
vec2 pose(vec2 p) {
  vec2 q=p;
  float angle=uPhase*6.28318530718;
  float burn=pulse(uPhase)*uFire;
  float inhale=sin(clamp(uPhase/.32,0.0,1.0)*3.14159265359)*uFire;
  float free=1.0-smoothstep(.80,.88,p.y);
  float wing=(1.0-smoothstep(.38,.66,p.y))*smoothstep(.07,.2,p.x)*(1.0-smoothstep(.64,.77,p.x));
  float rotation=.10*sin(angle)+.025*sin(angle*2.0)+burn*.065;
  vec2 pivot=vec2(.63,.58), d=p-pivot;
  vec2 rotated=vec2(d.x*cos(rotation)-d.y*sin(rotation),d.x*sin(rotation)+d.y*cos(rotation));
  p+=(rotated-d)*wing*free;
  float head=exp(-pow((q.x-.88)/.145,2.0)-pow((q.y-.44)/.17,2.0));
  p.x+=head*(.009*sin(angle)+burn*.022-inhale*.016)*free;
  p.y+=head*(.012*sin(angle)-inhale*.012+burn*.012)*free;
  float jaw=exp(-pow((q.x-.92)/.07,2.0)-pow((q.y-.51)/.038,2.0));
  p.y+=jaw*burn*.024;
  float chest=exp(-pow((q.x-.69)/.16,2.0)-pow((q.y-.68)/.16,2.0));
  p.x+=(q.x-.63)*chest*(.030*sin(angle)+inhale*.045)*free;
  p.y-=chest*(.009*sin(angle)+inhale*.014)*free;
  float tail=(1.0-smoothstep(.40,.58,q.x))*smoothstep(.55,.76,q.y);
  p.y+=tail*(.018*sin(angle+q.x*4.0)+.005*sin(angle*2.0+q.x*5.0))*free;
  p.x+=tail*.010*sin(angle*2.0)*free;
  return p;
}
void main() {
  vUV=aUV;vec2 p;
  if(uLayer<.5) { p=uDragonRect.xy+pose(aUV)*uDragonRect.zw; }
  else {
    vec2 mouth=uDragonRect.xy+pose(vec2(.951,.477))*uDragonRect.zw;
    float burn=pulse(uPhase)*uFire;
    float width=.244*pow(burn,.75);
    float height=.22*pow(burn,.65);
    p=mouth+vec2((aUV.x-.065)*width,(aUV.y-.5)*height);
    p.y+=sin(uPhase*18.8495559+aUV.x*14.0)*aUV.x*.006*burn;
  }
  gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);
}`;
const FRAGMENT=`
precision highp float;
varying vec2 vUV;
uniform sampler2D uImage;
uniform float uPhase,uFire,uLayer;
float pulse(float t) { return smoothstep(.16,.36,t)*(1.0-smoothstep(.68,.94,t)); }
void main() {
  vec4 c=texture2D(uImage,vUV);
  float active=pulse(uPhase)*uFire;
  if(uLayer>.5) { c.a*=active; }
  else {
    float hot=smoothstep(.1,.7,c.r-c.b)*smoothstep(.3,.85,c.r);
    c.rgb*=1.0+active*hot*.09;
  }
  gl_FragColor=c;
}`;

export function createSpriteRig(canvas,dragon,flame) {
  const gl=canvas.getContext('webgl',{alpha:true,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw new Error('WebGL unavailable for sprite baking');
  const shaders=[gl.VERTEX_SHADER,gl.FRAGMENT_SHADER].map((type,i)=>{
    const shader=gl.createShader(type);gl.shaderSource(shader,i?FRAGMENT:VERTEX);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;
  });
  const program=gl.createProgram();for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  shaders.forEach(shader=>gl.deleteShader(shader));
  const cells=[];
  for(let y=0;y<80;y++)for(let x=0;x<120;x++){
    const l=x/120,r=(x+1)/120,t=y/80,b=(y+1)/80;
    cells.push(l,t,r,t,l,b,r,t,r,b,l,b);
  }
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(cells),gl.STATIC_DRAW);
  const textures=[dragon,flame].map(img=>{
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);return texture;
  });
  gl.useProgram(program);
  const uv=gl.getAttribLocation(program,'aUV');gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,0,0);
  const u=Object.fromEntries(['uPhase','uFire','uLayer','uDragonRect','uImage'].map(k=>[k,gl.getUniformLocation(program,k)]));
  gl.uniform1i(u.uImage,0);gl.uniform4f(u.uDragonRect,.035,.032,.735,.90);
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0,0,canvas.width,canvas.height);
  return {
    draw(animation,phase) {
      const t=((phase%1)+1)%1;
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.uPhase,t);gl.uniform1f(u.uFire,animation==='fireBreath'?1:0);
      gl.uniform1f(u.uLayer,0);gl.bindTexture(gl.TEXTURE_2D,textures[0]);gl.drawArrays(gl.TRIANGLES,0,cells.length/2);
      if(animation==='fireBreath'){
        gl.uniform1f(u.uLayer,1);gl.bindTexture(gl.TEXTURE_2D,textures[1]);gl.drawArrays(gl.TRIANGLES,0,cells.length/2);
      }
    },
    destroy(){textures.forEach(t=>gl.deleteTexture(t));gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();},
  };
}
