/** Zone-frame travel proxies and reversible skill daily-info layout markers. */
import { ownerOf, mark, label } from '../core/dom.js';
import { isRendered } from '../core/Viewport.js';
import { isRuntimeActive, guard } from '../core/Runtime.js';
import travelCss from '../styles/skill-travel.css';

const OWNED='data-iw-fantasy-skill-header-owned';
const HOST='data-iw-fantasy-zone-travel';
const SURFACE='data-iw-fantasy-zone-surface';
const PANEL='data-iw-fantasy-skill-header';
const HEAD='data-iw-fantasy-skill-heading-row';
const SPINE='data-iw-fantasy-skill-heading-spine';
const TITLE='data-iw-fantasy-skill-heading-title';
const DAILY='data-iw-fantasy-daily-info';
const COLLAPSE='data-iw-fantasy-skill-collapse';
const SOURCE='data-iw-fantasy-zone-source';
const GROUP='data-iw-fantasy-zone-group';
const own=ownerOf(OWNED);
const KEYS=['prev','zones','next'];
let view=null;
let sources=new Map();
let marked=new Map();

function set(el,key,value){
  if(value==null){if(el.hasAttribute(key))el.removeAttribute(key);}
  else if(el.getAttribute(key)!==String(value))el.setAttribute(key,String(value));
}
const disabled=el=>!!el.disabled||el.getAttribute('aria-disabled')==='true'||!!el.closest('fieldset[disabled]');

function panelModel(){
  const panel=[...document.querySelectorAll('.iw-skill-tabs')].map(tabs=>tabs.closest('.panel')).find(isRendered);
  if(!panel)return null;
  const heading=panel.querySelector('[data-iw-collapse-head] h2')||panel.querySelector('h2');
  const head=heading?.closest('[data-iw-collapse-head]')||heading?.parentElement;
  if(!head||head.parentElement!==panel)return null;
  const spine=heading.parentElement;
  if(spine!==head&&spine.parentElement!==head)return null;
  const boost=head.querySelector('[data-iw-skill-boost]');
  const daily=boost?.parentElement;
  return {panel,head,heading,spine:spine===head?null:spine,
    daily:daily&&!daily.contains(heading)&&!daily.querySelector('button,input,select,textarea')?daily:null,
    collapse:head.querySelector('[data-iw-collapse]')};
}

function sourceModels(){
  return [...document.querySelectorAll('[data-iw-chrome="zone-actions"]')].map(group=>{
    const controls=new Map(KEYS.map(key=>[key,group.querySelector(`button[data-iw-zone-action="${key}"]`)]));
    const text=group.closest('[data-iw-chrome="zone-bar"]')?.querySelector('[data-iw-chrome="zone-text"]');
    const interactive=text&&[...text.querySelectorAll('button,a,input,select,textarea,[role="button"],[tabindex]')].some(isRendered);
    return text&&!interactive&&KEYS.every(key=>controls.get(key))?{group,controls,text}:null;
  }).filter(Boolean);
}

function visibleSource(group){
  // The port flattens the zone bar with display:contents. Inspect the next
  // real box, including any hidden responsive column inside a shared shell.
  let parent=group.parentElement;
  while(parent&&typeof getComputedStyle==='function'&&getComputedStyle(parent).display==='contents')parent=parent.parentElement;
  return isRendered(parent);
}

function buildView(){
  const host=own('div');host.setAttribute(HOST,'1');
  const root=host.attachShadow({mode:'open'});
  const style=own('style');style.textContent=travelCss;
  const nav=own('nav','travel');nav.setAttribute('aria-label','Zone travel');
  const buttons=new Map();
  for(const key of KEYS){
    const button=own('button',key);button.type='button';
    if(key!=='zones'){const arrow=own('span','arrow',key==='prev'?'‹':'›');arrow.setAttribute('aria-hidden','true');button.append(arrow);}
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      guard('skill-header:activate',()=>{
        skillHeaderPass();
        const native=sources.get(key);
        if(native?.isConnected&&!disabled(native))native.click();
        skillHeaderPass();
      });
    });
    buttons.set(key,button);nav.append(button);
  }
  root.append(style,nav);return {host,buttons};
}

function syncMarks(desired){
  for(const [el,attrs] of marked)for(const attr of attrs)if(!desired.get(el)?.has(attr))mark(el,attr,null);
  for(const [el,attrs] of desired)for(const attr of attrs)mark(el,attr,'1');
  marked=desired;
}

export function skillHeaderPass(){
  if(!isRuntimeActive())return;
  const model=panelModel();
  const groups=sourceModels();
  const desired=new Map();
  const tag=(el,attr)=>{if(!el)return;if(!desired.has(el))desired.set(el,new Set());desired.get(el).add(attr);};
  // Keep originals mounted for React, but remove their header presentation.
  for(const {group,controls} of groups){tag(group,GROUP);for(const button of controls.values())tag(button,SOURCE);}
  if(model){
    tag(model.panel,PANEL);tag(model.head,HEAD);tag(model.heading,TITLE);
    tag(model.spine,SPINE);tag(model.daily,DAILY);tag(model.collapse,COLLAPSE);
  }
  const live=groups.filter(({group})=>visibleSource(group));
  const shell=model?.panel.closest('[data-iw-chrome="shell"]');
  const source=live.find(({group})=>shell&&group.closest('[data-iw-chrome="shell"]')===shell)||live[0];
  sources=source?.controls||new Map();
  if(source){
    tag(source.text,SURFACE);
    if(!view)view=buildView();
    if(view.host.parentElement!==source.text)source.text.append(view.host);
    for(const [key,button] of view.buttons){
      const native=sources.get(key);const text=label(native.textContent);
      set(button,'aria-label',native.getAttribute('aria-label')||text);
      set(button,'aria-description',native.getAttribute('aria-description')||(key==='zones'?label(source.text.querySelector('[data-iw-ui="zone-title"]')?.textContent):null));
      set(button,'title',native.getAttribute('title')||(key==='zones'?'Show zones':null));
      set(button,'aria-disabled',disabled(native)?'true':null);
      if(button.disabled!==disabled(native))button.disabled=disabled(native);
    }
  }else{view?.host.remove();view=null;}
  syncMarks(desired);
}

export function skillHeaderText(parents){
  if(parents.some(p=>p.closest?.('[data-iw-chrome="zone-actions"],[data-iw-ui="zone-title"],[data-iw-skill-boost]')))skillHeaderPass();
}

export function clearSkillHeader(){
  view?.host.remove();view=null;sources.clear();syncMarks(new Map());
}
