import {assetUrl} from './Runtime.js';
import {createMorwennaArenaScene,MORWENNA_PERIOD} from './MorwennaArenaRenderer.js';

export const MORWENNA_LOOP_SECONDS=MORWENNA_PERIOD;
const scenes=new Map();
const bossSelector='img[src*="boss-morwenna"],img[alt^="Morwenna"]';

export function createMorwennaRenderer(canvas,environment,assets={},options={}){
 return createMorwennaArenaScene(canvas,{background:environment,...assets,...options});
}

export function clearMorwennaScene(arena){
 const state=scenes.get(arena);if(!state)return;
 state.disposed=true;cancelAnimationFrame(state.frame);state.visible?.disconnect();state.renderer?.destroy();state.renderer=null;
 document.removeEventListener('visibilitychange',state.resume);state.motion.removeEventListener('change',state.resume);
 state.art.remove();state.stage.removeAttribute('data-iw-raid-boss-stage');
 arena.removeAttribute('data-iw-raid-scene');scenes.delete(arena);
}

export function reconcileMorwennaScene(arena){
 pruneMorwennaScenes();
 const boss=arena.querySelector(bossSelector);
 const nativeBackground=arena.style.getPropertyValue('--raid-bg-image');
 if(!boss||(nativeBackground&&!/morwenna/i.test(nativeBackground))){clearMorwennaScene(arena);return;}
 const current=scenes.get(arena);
 if(current){if(current.art.parentElement===arena&&current.stage===boss.parentElement)return;clearMorwennaScene(arena);}
 const art=document.createElement('div');art.setAttribute('data-iw-morwenna-art','');art.setAttribute('aria-hidden','true');
 const env=new Image(),textures={clouds:new Image(),mist:new Image()},canvas=document.createElement('canvas');
 // Extension textures must be CORS-clean for cached atlas alpha and masks.
 for(const image of [env,...Object.values(textures)])image.crossOrigin='anonymous';
 env.setAttribute('data-iw-art','environment');art.append(env,canvas);arena.append(art);
 const state={art,stage:boss.parentElement,frame:0,disposed:false,onScreen:true,motion:matchMedia('(prefers-reduced-motion: reduce)')};
 scenes.set(arena,state);const start=performance.now();let last=0;
 state.resume=()=>{
  cancelAnimationFrame(state.frame);state.frame=0;
  if(!state.renderer||state.disposed||document.hidden||!state.onScreen)return;
  if(state.motion.matches){state.renderer.render(0);return;}
  state.frame=requestAnimationFrame(tick);
 };
 function tick(now){
  if(!arena.isConnected){clearMorwennaScene(arena);return;}
  if(state.disposed||document.hidden||!state.onScreen||state.motion.matches)return;
  if(now-last>=1000/30){state.renderer.render((now-start)/1000);last=now;}
  state.frame=requestAnimationFrame(tick);
 }
 document.addEventListener('visibilitychange',state.resume);state.motion.addEventListener('change',state.resume);
 const load=img=>new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Raid art unavailable'));});
 const loaded=Promise.all([load(env),...Object.values(textures).map(image=>load(image).catch(()=>null))]);
 env.src=assetUrl('assets/raids/morwenna/arena.png');
 for(const [key,name]of Object.entries({clouds:'storm-clouds',mist:'courtyard-mist'}))textures[key].src=assetUrl('assets/raids/morwenna/'+name+'.png');
 loaded.then(([background,clouds,mist])=>{
  if(state.disposed||!arena.isConnected)return;
  // A late load must not reactivate art after the native encounter changed.
  const nativeBackground=arena.style.getPropertyValue('--raid-bg-image');
  if(arena.querySelector(bossSelector)!==boss||boss.parentElement!==state.stage||(nativeBackground&&!/morwenna/i.test(nativeBackground))){clearMorwennaScene(arena);return;}
  arena.setAttribute('data-iw-raid-scene','morwenna');state.stage.setAttribute('data-iw-raid-boss-stage','morwenna');
  try{
   state.renderer=createMorwennaRenderer(canvas,background,{clouds,mist},{maxWidth:1440});
   state.renderer.render(0);
  }catch{
   state.renderer?.destroy();state.renderer=null;
   return; // The approved still painting remains above the native backdrop.
  }
  art.setAttribute('data-iw-animated','');
  if(typeof IntersectionObserver==='function'){
   state.visible=new IntersectionObserver(([entry])=>{state.onScreen=entry.isIntersecting;state.resume();});state.visible.observe(arena);
  }
  state.resume();
 }).catch(()=>{if(!state.disposed)clearMorwennaScene(arena);});
}

export function clearMorwennaScenes(root){
 for(const arena of scenes.keys())if(root===arena||root.contains(arena)||!arena.isConnected)clearMorwennaScene(arena);
}
export function pruneMorwennaScenes(){
 for(const arena of scenes.keys())if(!arena.isConnected)clearMorwennaScene(arena);
}
