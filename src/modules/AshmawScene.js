import { assetUrl } from './Runtime.js';
import { createArenaScene, ARENA_PERIOD } from './AshmawArenaRenderer.js';

export const ASHMAW_LOOP_SECONDS=ARENA_PERIOD;
const scenes=new Map();

/** The approved renderer also powers the portable preview and loop checks. */
export function createAshmawRenderer(canvas,environment,smoke,options={}){
 return createArenaScene(canvas,{background:environment,smoke,...options});
}

export function clearAshmawScene(arena){
 const state=scenes.get(arena);if(!state)return;
 state.disposed=true;cancelAnimationFrame(state.frame);state.visible?.disconnect();state.renderer?.destroy();state.renderer=null;
 document.removeEventListener('visibilitychange',state.resume);state.motion.removeEventListener('change',state.resume);
 state.art.remove();state.stage.removeAttribute('data-iw-raid-boss-stage');
 arena.removeAttribute('data-iw-raid-scene');scenes.delete(arena);
}

export function reconcileAshmawScene(arena){
 pruneAshmawScenes();
 const boss=arena.querySelector('img[src*="boss-ashmaw"],img[alt^="Ashmaw"]');
 const nativeBackground=arena.style.getPropertyValue('--raid-bg-image');
 if(!boss||(nativeBackground&&!/ashmaw/i.test(nativeBackground))){clearAshmawScene(arena);return;}
 const current=scenes.get(arena);
 if(current){if(current.art.parentElement===arena&&current.stage===boss.parentElement)return;clearAshmawScene(arena);}
 const art=document.createElement('div');art.setAttribute('data-iw-ashmaw-art','');art.setAttribute('aria-hidden','true');
 const env=new Image(),smoke=new Image(),canvas=document.createElement('canvas');
 // Extension pixels must stay CORS-clean for the renderer's painted masks.
 env.crossOrigin=smoke.crossOrigin='anonymous';env.setAttribute('data-iw-art','environment');
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
  if(!arena.isConnected){clearAshmawScene(arena);return;}
  if(state.disposed||document.hidden||!state.onScreen||state.motion.matches)return;
  if(now-last>=1000/30){state.renderer.render((now-start)/1000);last=now;}
  state.frame=requestAnimationFrame(tick);
 }
 document.addEventListener('visibilitychange',state.resume);state.motion.addEventListener('change',state.resume);
 const load=img=>new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Raid art unavailable'));});
 const loaded=Promise.all([load(env),load(smoke).catch(()=>null)]);
 env.src=assetUrl('assets/raids/ashmaw/arena.png');smoke.src=assetUrl('assets/raids/ashmaw/smoke.png');
 loaded.then(([background,plumes])=>{
  if(state.disposed||!arena.isConnected)return;
  arena.setAttribute('data-iw-raid-scene','ashmaw');state.stage.setAttribute('data-iw-raid-boss-stage','ashmaw');
  try{state.renderer=createAshmawRenderer(canvas,background,plumes,{maxWidth:1440});}catch{/* The approved painting remains as the still fallback. */}
  if(!state.renderer)return;
  art.setAttribute('data-iw-animated','');state.renderer.render(0);
  if(typeof IntersectionObserver==='function'){
   state.visible=new IntersectionObserver(([entry])=>{state.onScreen=entry.isIntersecting;state.resume();});state.visible.observe(arena);
  }
  state.resume();
 }).catch(()=>{if(!state.disposed)clearAshmawScene(arena);});
}

export function clearAshmawScenes(root){
 for(const arena of scenes.keys())if(root===arena||root.contains(arena)||!arena.isConnected)clearAshmawScene(arena);
}
export function pruneAshmawScenes(){
 for(const arena of scenes.keys())if(!arena.isConnected)clearAshmawScene(arena);
}
