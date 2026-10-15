import { assetUrl } from './Runtime.js';
import { createThessalyArenaScene, THESSALY_PERIOD } from './ThessalyArenaRenderer.js';

export const THESSALY_LOOP_SECONDS=THESSALY_PERIOD;
const scenes=new Map();

/** The approved renderer also powers the portable preview and loop checks. */
export function createThessalyRenderer(canvas,environment,assets={},options={}){
 return createThessalyArenaScene(canvas,{background:environment,...assets,...options});
}

export function clearThessalyScene(arena){
 const state=scenes.get(arena);if(!state)return;
 state.disposed=true;cancelAnimationFrame(state.frame);state.visible?.disconnect();state.renderer?.destroy();state.renderer=null;
 document.removeEventListener('visibilitychange',state.resume);state.motion.removeEventListener('change',state.resume);
 state.art.remove();state.stage.removeAttribute('data-iw-raid-boss-stage');
 arena.removeAttribute('data-iw-raid-scene');scenes.delete(arena);
}

export function reconcileThessalyScene(arena){
 pruneThessalyScenes();
 const boss=arena.querySelector('img[src*="boss-thessaly"],img[alt^="Thessaly"]');
 const nativeBackground=arena.style.getPropertyValue('--raid-bg-image');
 if(!boss||(nativeBackground&&!/thessaly/i.test(nativeBackground))){clearThessalyScene(arena);return;}
 const current=scenes.get(arena);
 if(current){if(current.art.parentElement===arena&&current.stage===boss.parentElement)return;clearThessalyScene(arena);}
 const art=document.createElement('div');art.setAttribute('data-iw-thessaly-art','');art.setAttribute('aria-hidden','true');
 const env=new Image(),textures=Object.fromEntries(['clouds','mist','hair','body'].map(key=>[key,new Image()])),canvas=document.createElement('canvas');
 // Extension pixels must stay CORS-clean for the renderer's painted masks.
 for(const image of [env,...Object.values(textures)])image.crossOrigin='anonymous';env.setAttribute('data-iw-art','environment');
 art.append(env,canvas);arena.append(art);
 const state={art,stage:boss.parentElement,frame:0,disposed:false,onScreen:true,motion:matchMedia('(prefers-reduced-motion: reduce)')};
 scenes.set(arena,state);
 const start=performance.now();let last=0;
 state.resume=()=>{
  cancelAnimationFrame(state.frame);state.frame=0;
  if(!state.renderer||state.disposed||document.hidden||!state.onScreen)return;
  if(state.motion.matches){state.renderer.render(0);return;}
  state.frame=requestAnimationFrame(tick);
 };
 function tick(now){
  if(!arena.isConnected){clearThessalyScene(arena);return;}
  if(state.disposed||document.hidden||!state.onScreen||state.motion.matches)return;
  if(now-last>=1000/30){state.renderer.render((now-start)/1000);last=now;}
  state.frame=requestAnimationFrame(tick);
 }
 document.addEventListener('visibilitychange',state.resume);state.motion.addEventListener('change',state.resume);
 const load=img=>new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Raid art unavailable'));});
 const loaded=Promise.all([load(env),...Object.values(textures).map(image=>load(image).catch(()=>null))]);
 env.src=assetUrl('assets/raids/thessaly/arena-storm.png');
 for(const [key,name]of Object.entries({clouds:'storm-clouds',mist:'courtyard-mist',hair:'hair-wisps',body:'body-clouds'}))textures[key].src=assetUrl('assets/raids/thessaly/'+name+'.png');
 loaded.then(([background,...images])=>{
  if(state.disposed||!arena.isConnected)return;
  arena.setAttribute('data-iw-raid-scene','thessaly');state.stage.setAttribute('data-iw-raid-boss-stage','thessaly');
  const assets=Object.fromEntries(Object.keys(textures).map((key,index)=>[key,images[index]]));
  try{state.renderer=createThessalyRenderer(canvas,background,assets,{maxWidth:1440});}catch{/* The approved painting remains as the still fallback. */}
  if(!state.renderer)return;
  art.setAttribute('data-iw-animated','');state.renderer.render(0);
  if(typeof IntersectionObserver==='function'){
   state.visible=new IntersectionObserver(([entry])=>{state.onScreen=entry.isIntersecting;state.resume();});state.visible.observe(arena);
  }
  state.resume();
 }).catch(()=>{if(!state.disposed)clearThessalyScene(arena);});
}

export function clearThessalyScenes(root){
 for(const arena of scenes.keys())if(root===arena||root.contains(arena)||!arena.isConnected)clearThessalyScene(arena);
}
export function pruneThessalyScenes(){
 for(const arena of scenes.keys())if(!arena.isConnected)clearThessalyScene(arena);
}
