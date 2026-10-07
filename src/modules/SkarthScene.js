import {assetUrl} from './Runtime.js';
import {createSkarthArenaScene,SKARTH_PERIOD} from './SkarthArenaRenderer.js';

export const SKARTH_LOOP_SECONDS=SKARTH_PERIOD;
const scenes=new Map();
const bossSelector='img[src*="boss-skarth"],img[alt^="Skarth"]';

export function createSkarthRenderer(canvas,environment,assets={},options={}){
 return createSkarthArenaScene(canvas,{background:environment,...assets,...options});
}

export function clearSkarthScene(arena){
 const state=scenes.get(arena);if(!state)return;
 state.disposed=true;cancelAnimationFrame(state.frame);state.visible?.disconnect();state.renderer?.destroy();state.renderer=null;
 document.removeEventListener('visibilitychange',state.resume);state.motion.removeEventListener('change',state.resume);
 state.art.remove();state.stage.removeAttribute('data-iw-raid-boss-stage');
 arena.removeAttribute('data-iw-raid-scene');scenes.delete(arena);
}

export function reconcileSkarthScene(arena){
 pruneSkarthScenes();
 const boss=arena.querySelector(bossSelector);
 const nativeBackground=arena.style.getPropertyValue('--raid-bg-image');
 if(!boss||(nativeBackground&&!/skarth/i.test(nativeBackground))){clearSkarthScene(arena);return;}
 const current=scenes.get(arena);
 if(current){if(current.art.parentElement===arena&&current.stage===boss.parentElement)return;clearSkarthScene(arena);}
 const art=document.createElement('div');art.setAttribute('data-iw-skarth-art','');art.setAttribute('aria-hidden','true');
 const env=new Image(),textures={atmosphere:new Image(),ice:new Image(),water:new Image()},canvas=document.createElement('canvas');
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
  if(!arena.isConnected){clearSkarthScene(arena);return;}
  if(state.disposed||document.hidden||!state.onScreen||state.motion.matches)return;
  if(now-last>=1000/30){state.renderer.render((now-start)/1000);last=now;}
  state.frame=requestAnimationFrame(tick);
 }
 document.addEventListener('visibilitychange',state.resume);state.motion.addEventListener('change',state.resume);
 const load=img=>new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Raid art unavailable'));});
 const loaded=Promise.all([load(env),...Object.values(textures).map(image=>load(image).catch(()=>null))]);
 env.src=assetUrl('assets/raids/skarth/arena.png');
 for(const [key,name]of Object.entries({atmosphere:'atmosphere',ice:'ice',water:'water'}))textures[key].src=assetUrl('assets/raids/skarth/'+name+'.png');
 loaded.then(([background,atmosphere,ice,water])=>{
  if(state.disposed||!arena.isConnected)return;
  // A late load must not reactivate art after the native encounter changed.
  const nativeBackground=arena.style.getPropertyValue('--raid-bg-image');
  if(arena.querySelector(bossSelector)!==boss||boss.parentElement!==state.stage||(nativeBackground&&!/skarth/i.test(nativeBackground))){clearSkarthScene(arena);return;}
  arena.setAttribute('data-iw-raid-scene','skarth');state.stage.setAttribute('data-iw-raid-boss-stage','skarth');
  try{
   state.renderer=createSkarthRenderer(canvas,background,{atmosphere,ice,water},{maxWidth:1440});
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
 }).catch(()=>{if(!state.disposed)clearSkarthScene(arena);});
}

export function clearSkarthScenes(root){
 for(const arena of scenes.keys())if(root===arena||root.contains(arena)||!arena.isConnected)clearSkarthScene(arena);
}
export function pruneSkarthScenes(){
 for(const arena of scenes.keys())if(!arena.isConnected)clearSkarthScene(arena);
}

