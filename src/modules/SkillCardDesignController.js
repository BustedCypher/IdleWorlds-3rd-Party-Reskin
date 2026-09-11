import { on } from './DOMWatcher.js';
import { guard, isRuntimeActive, storageGet, storageSet, onStorageChanged } from './Runtime.js';

export const SKILL_CARD_DESIGN_KEY = 'iw-skill-card-design';
export const DEFAULT_SKILL_CARD_DESIGN = 'new';
const designs = new Set(['new', 'current']);
const tabs = ['requirements', 'materials', 'details', 'rewards'];
let bound = false, active = false, design = DEFAULT_SKILL_CARD_DESIGN;

export const normalizeSkillCardDesign = value => designs.has(value) ? value : DEFAULT_SKILL_CARD_DESIGN;

function pressed(el, yes) {
  if (!el) return;
  el.setAttribute('aria-pressed', yes ? 'true' : 'false');
  el.setAttribute('aria-checked', yes ? 'true' : 'false');
}
function syncToggles(mode, root = document) {
  root.querySelectorAll?.('[data-iw-skill-design-toggle]').forEach(t => {
    pressed(t.querySelector('[data-iw-skill-design="new"]'), mode === 'new');
    pressed(t.querySelector('[data-iw-skill-design="current"]'), mode === 'current');
  });
}
export function applySkillCardDesign(value, root = document.documentElement) {
  design = normalizeSkillCardDesign(value);
  root?.setAttribute?.('data-iw-skill-card-design', design);
  syncToggles(design, root?.ownerDocument || document);
  return design;
}
function frameFor(panel) {
  let el = panel?.parentElement;
  for (let n = 0; el && n < 8; n++, el = el.parentElement) {
    const h = el.querySelector?.('h1,h2,h3,h4');
    if (h && /^skill actions$/i.test((h.textContent || '').replace(/\s+/g, ' ').trim())) return el;
  }
  return null;
}
export function ensureSkillCardDesignToggle(frame, mode = design) {
  if (!frame) return null;
  let t = frame.querySelector(':scope > [data-iw-skill-design-toggle]');
  if (!t) {
    t = document.createElement('div');
    t.className = 'iw-skill-design-toggle';
    t.dataset.iwSkillDesignToggle = '1';
    t.setAttribute('role', 'radiogroup');
    const label = document.createElement('span'); label.textContent = 'Skill cards'; label.className = 'iw-skill-design-toggle__label';
    t.append(label);
    for (const [value, text] of [['new','New'],['current','Current']]) {
      const el = document.createElement('span');
      el.dataset.iwSkillDesign = value; el.className = 'iw-skill-design-toggle__option';
      el.setAttribute('role','radio'); el.setAttribute('tabindex','0'); el.textContent = text; t.append(el);
    }
    const h = [...frame.querySelectorAll('h1,h2,h3,h4')].find(el => /^skill actions$/i.test((el.textContent || '').trim()));
    h?.parentElement === frame ? h.after(t) : frame.prepend(t);
  }
  mode = normalizeSkillCardDesign(mode);
  pressed(t.querySelector('[data-iw-skill-design="new"]'), mode === 'new');
  pressed(t.querySelector('[data-iw-skill-design="current"]'), mode === 'current');
  return t;
}
function available(panel) {
  const q = {
    requirements: '[data-iw-skill-role="requirement"]',
    materials: '[data-iw-skill-ingredient-list],.fs-skill-ingredient-grid,[data-iw-skill-role="ingredient"]',
    details: '[data-iw-skill-role="action-detail"]',
    rewards: '[data-iw-skill-role="reward"]',
  };
  return tabs.filter(name => panel.querySelector(q[name]));
}
function markSections(panel) {
  panel.querySelectorAll('[data-iw-skill-v2-section]').forEach(el => delete el.dataset.iwSkillV2Section);
  for (const [name, selector] of [
    ['requirements','[data-iw-skill-role="requirement"]'],
    ['materials','[data-iw-skill-ingredient-list],.fs-skill-ingredient-grid'],
    ['details','[data-iw-skill-role="action-detail"]'],
    ['rewards','[data-iw-skill-role="reward"]'],
  ]) panel.querySelectorAll(selector).forEach(el => el.dataset.iwSkillV2Section = name);
}
function levelReadout(panel) {
  const zone = panel.querySelector('[data-iw-skill-zone="identity"]'); if (!zone) return;
  const text = panel.querySelector('[data-iw-skill-role="level-progress"]')?.textContent || '';
  const pct = (panel.querySelector('.fs-skill-identity-percent')?.textContent || text).match(/(\d+(?:\.\d+)?)\s*%/);
  const lvl = text.match(/\bLv\s*([\d]+(?:\s*\+\s*\d+)?|-)/i);
  const value = pct ? Math.max(0, Math.min(100, Number(pct[1]))) : 0;
  panel.style.setProperty('--iw-skill-v2-progress', `${Number.isFinite(value) ? value : 0}%`);
  let out = zone.querySelector(':scope > [data-iw-skill-v2-level-readout]');
  if (!out) {
    out = document.createElement('span'); out.dataset.iwSkillV2LevelReadout = '1'; out.className = 'iw-skill-v2-level-readout';
    const a = document.createElement('span'); a.className = 'iw-skill-v2-level';
    const b = document.createElement('span'); b.className = 'iw-skill-v2-percent'; out.append(a,b); zone.append(out);
  }
  out.children[0].textContent = lvl ? `Lv ${lvl[1].replace(/\s+/g,' ')}` : 'Lv —';
  out.children[1].textContent = pct ? `${pct[1]}%` : '—';
}
function createControls(panel) {
  const c = document.createElement('div'); c.dataset.iwSkillV2Controls='1'; c.className='iw-skill-v2-controls';
  const t = document.createElement('div'); t.dataset.iwSkillV2Tabs='1'; t.className='iw-skill-v2-tabs'; t.setAttribute('role','tablist');
  const e = document.createElement('span'); e.dataset.iwSkillV2Expand='1'; e.className='iw-skill-v2-expand'; e.setAttribute('role','switch'); e.setAttribute('tabindex','0');
  c.append(t,e); panel.append(c); return c;
}
function syncTabs(panel, controls) {
  const host = controls.querySelector('[data-iw-skill-v2-tabs]'), list = available(panel);
  panel.dataset.iwSkillV2Tab = list.includes(panel.dataset.iwSkillV2Tab) ? panel.dataset.iwSkillV2Tab : (list.includes('requirements') ? 'requirements' : list[0] || 'requirements');
  if (host.dataset.iwSkillV2TabSignature !== list.join('|')) {
    host.replaceChildren(...list.map(name => {
      const el=document.createElement('span'); el.dataset.iwSkillV2TabButton=name; el.className='iw-skill-v2-tab'; el.setAttribute('role','tab'); el.setAttribute('tabindex','0'); el.textContent=name[0].toUpperCase()+name.slice(1); return el;
    })); host.dataset.iwSkillV2TabSignature=list.join('|');
  }
  host.querySelectorAll('[data-iw-skill-v2-tab-button]').forEach(el => el.setAttribute('aria-selected', el.dataset.iwSkillV2TabButton === panel.dataset.iwSkillV2Tab ? 'true':'false'));
  host.hidden = !list.length;
}
function syncExpand(panel) {
  const el=panel.querySelector('[data-iw-skill-v2-expand]'); if(!el)return;
  const yes=panel.dataset.iwSkillV2State==='expanded'; el.setAttribute('aria-checked',yes?'true':'false'); el.setAttribute('aria-expanded',yes?'true':'false'); el.dataset.iwSkillV2ExpandState=yes?'expanded':'collapsed';
}
export function setSkillCardExpanded(panel, expanded) { if(panel){panel.dataset.iwSkillV2State=expanded?'expanded':'collapsed';syncExpand(panel);} }
export function setSkillCardTab(panel, tab) { if(!panel||!tabs.includes(tab)||!available(panel).includes(tab))return false; panel.dataset.iwSkillV2Tab=tab; const c=panel.querySelector('[data-iw-skill-v2-controls]'); if(c)syncTabs(panel,c); return true; }
export function enhanceSkillCardV2(panel, skillType) {
  if(!panel||!panel.isConnected||!skillType||skillType==='unknown')return null;
  panel.dataset.iwSkillV2='1'; panel.dataset.iwSkillV2Type=skillType; if(!panel.dataset.iwSkillV2State)panel.dataset.iwSkillV2State='collapsed';
  markSections(panel); levelReadout(panel); let c=panel.querySelector(':scope > [data-iw-skill-v2-controls]'); if(!c)c=createControls(panel); syncTabs(panel,c); syncExpand(panel); return c;
}
export function clearSkillCardV2(panel) {
  if(!panel)return; panel.querySelectorAll('[data-iw-skill-v2-controls],[data-iw-skill-v2-level-readout]').forEach(el=>el.remove()); panel.querySelectorAll('[data-iw-skill-v2-section]').forEach(el=>delete el.dataset.iwSkillV2Section); panel.style.removeProperty('--iw-skill-v2-progress');
  delete panel.dataset.iwSkillV2; delete panel.dataset.iwSkillV2Type; delete panel.dataset.iwSkillV2State; delete panel.dataset.iwSkillV2Tab;
}
function reconcile(panel, skill) { if(!panel?.isConnected)return; if(!skill||skill==='unknown'||!panel.classList.contains('fs-skill-panel'))return clearSkillCardV2(panel); const frame=frameFor(panel); if(frame)ensureSkillCardDesignToggle(frame,design); enhanceSkillCardV2(panel,skill); }
function activate(target) {
  const d=target?.closest?.('[data-iw-skill-design]'); if(d){const mode=applySkillCardDesign(d.dataset.iwSkillDesign);storageSet(SKILL_CARD_DESIGN_KEY,mode);return;}
  const panel=target?.closest?.('.compact-panel.fs-skill-panel'); if(!panel)return;
  if(target.closest?.('[data-iw-skill-v2-expand]'))return setSkillCardExpanded(panel,panel.dataset.iwSkillV2State!=='expanded');
  const tab=target.closest?.('[data-iw-skill-v2-tab-button]'); if(tab){setSkillCardExpanded(panel,true);setSkillCardTab(panel,tab.dataset.iwSkillV2TabButton);}
}
function bindOnce(){if(bound)return;bound=true;on('iw:skill-panel',e=>guard('skill-v2:panel',()=>reconcile(e.detail?.panel,e.detail?.skill)));document.addEventListener('click',e=>{if(active&&isRuntimeActive())guard('skill-v2:click',()=>activate(e.target));});document.addEventListener('keydown',e=>{if(!active||!isRuntimeActive()||!['Enter',' '].includes(e.key))return;const t=e.target?.closest?.('[data-iw-skill-design],[data-iw-skill-v2-expand],[data-iw-skill-v2-tab-button]');if(t){e.preventDefault();guard('skill-v2:key',()=>activate(t));}});onStorageChanged(SKILL_CARD_DESIGN_KEY,value=>{if(active&&isRuntimeActive())applySkillCardDesign(value);});}
export function initSkillCardDesignController(){active=true;bindOnce();applySkillCardDesign(DEFAULT_SKILL_CARD_DESIGN);storageGet(SKILL_CARD_DESIGN_KEY).then(value=>{if(active&&isRuntimeActive())applySkillCardDesign(value===null?DEFAULT_SKILL_CARD_DESIGN:value);});}
export function clearSkillCardDesignController(){active=false;document.documentElement?.removeAttribute('data-iw-skill-card-design');document.querySelectorAll('[data-iw-skill-design-toggle]').forEach(el=>el.remove());document.querySelectorAll('.compact-panel[data-iw-skill-v2]').forEach(clearSkillCardV2);}
