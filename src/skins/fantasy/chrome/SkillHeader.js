/** Zone-frame travel proxies and reversible skill daily-info layout markers. */
import { ownerOf, mark, label } from '../core/dom.js';
import { isRendered } from '../core/Viewport.js';
import { isRuntimeActive, guard } from '../core/Runtime.js';
import travelCss from '../styles/skill-travel.css';
import { zones as zoneCatalogue } from '../../../../assets/skills-ui/zone-theme-map.json';

const OWNED='data-iw-fantasy-skill-header-owned';
const HOST='data-iw-fantasy-zone-travel';
const SURFACE='data-iw-fantasy-zone-surface';
const LABELLED='data-iw-fantasy-zone-labelled';
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

function arrowIcon(direction){
  const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const path=document.createElementNS(arrow.namespaceURI,'path');
  for(const node of [arrow,path]){
    node.setAttribute(OWNED,'1');node.setAttribute('data-iw-fantasy-owned','1');
  }
  for(const [key,value] of Object.entries({class:'arrow',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))arrow.setAttribute(key,value);
  path.setAttribute('d',direction==='prev'?'M21 12H3m8-8-8 8 8 8':'M3 12h18m-8-8 8 8-8 8');
  arrow.append(path);return arrow;
}

function buildView(){
  const host=own('div');host.setAttribute(HOST,'1');
  const root=host.attachShadow({mode:'open'});
  const style=own('style');style.textContent=travelCss;
  const nav=own('nav','travel');nav.setAttribute('aria-label','Zone travel');
  const buttons=new Map(),labels=new Map();
  for(const key of KEYS){
    const button=own('button',key);button.type='button';
    if(key!=='zones'){
      const arrow=arrowIcon(key);
      const name=own('span','zone-label','');name.setAttribute('aria-hidden','true');
      button.append(...(key==='prev'?[arrow,name]:[name,arrow]));labels.set(key,name);
    }
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
  root.append(style,nav);return {host,buttons,labels};
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
    const current=label(source.text.querySelector('[data-iw-ui="zone-title"]')?.textContent).match(/^zone\s*(\d+)\b/i);
    const destinations=new Map(['prev','next'].map(key=>{
      const number=current?Number(current[1])+(key==='prev'?-1:1):null;
      const name=number&&zoneCatalogue[number]?.name;
      return [key,name?`Zone ${number}: ${name}`:''];
    }));
    const labelled=[...destinations.values()].some(Boolean);
    if(labelled)tag(source.text,LABELLED);
    if(!view)view=buildView();
    if(view.host.parentElement!==source.text)source.text.append(view.host);
    set(view.host,LABELLED,labelled?'1':null);
    for(const [key,button] of view.buttons){
      const native=sources.get(key);const text=label(native.textContent);
      const destination=destinations.get(key);
      const name=view.labels.get(key);
      if(name){
        if(name.textContent!==destination)name.textContent=destination;
        if(name.hidden!==!destination)name.hidden=!destination;
      }
      set(button,'aria-label',native.getAttribute('aria-label')||text);
      const nativeTitle=native.getAttribute('title');
      const description=[destination,native.getAttribute('aria-description')||nativeTitle].filter(Boolean).join('. ');
      set(button,'aria-description',description||(key==='zones'?label(source.text.querySelector('[data-iw-ui="zone-title"]')?.textContent):null));
      const tooltip=destination&&nativeTitle&&!nativeTitle.includes(destination)?`${destination}\n${nativeTitle}`:nativeTitle||destination;
      set(button,'title',tooltip||(key==='zones'?'Show zones':null));
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
