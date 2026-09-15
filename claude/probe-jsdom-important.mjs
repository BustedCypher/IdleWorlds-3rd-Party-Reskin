import { JSDOM } from 'jsdom';
const d = new JSDOM('<div id="a"></div>');
const el = d.window.document.getElementById('a');
for (const p of ['align-self','background','border-radius','color','padding','width']) {
  el.setAttribute('style','');
  el.style.setProperty(p, p==='color'?'red':(p==='width'?'auto':(p==='padding'?'0':(p==='border-radius'?'0':(p==='background'?'none':'auto')))), 'important');
  const v1 = el.style.getPropertyValue(p), pr1 = el.style.getPropertyPriority(p);
  // write a SECOND unrelated property, then re-read the first
  el.style.setProperty('margin','0','important');
  const v2 = el.style.getPropertyValue(p), pr2 = el.style.getPropertyPriority(p);
  console.log(p.padEnd(14), 'after write:', JSON.stringify(v1), pr1||'(none)',
              '| after a 2nd write:', JSON.stringify(v2), pr2||'(none)',
              pr1===pr2 ? '' : '   <-- PRIORITY LOST');
}
let n=0; const o=new d.window.MutationObserver(l=>{n+=l.length;});
o.observe(d.window.document.body,{attributes:true,subtree:true,attributeOldValue:true});
el.setAttribute('style','');
for(let i=0;i<50;i++){ el.style.setProperty('align-self','auto','important'); el.style.setProperty('margin','0','important'); }
await new Promise(r=>setTimeout(r,50));
console.log('\n50 identical (align-self+margin) pairs ->', n, 'records  (0 expected if stable)');
