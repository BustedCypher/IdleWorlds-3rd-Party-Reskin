(()=>{const q=s=>document.querySelectorAll(s),d=document.documentElement;
const t=document.querySelector('[data-iw-nav-link="rearrange"]');
const was=d.dataset.iwOrderMode==='1';if(!was&&t)t.click();
const h=[...q('[data-iw-order-handle]')].filter(e=>e.getBoundingClientRect().width>0);
const g=h.find(e=>{const r=e.getBoundingClientRect();return r.top<innerHeight-40&&r.bottom>60})||h[0];
const r={sheets:q('style[data-iw-style]').length,rearrangeBtn:!!t,modeWasOn:was,
modeNow:d.dataset.iwOrderMode??null,leafPanels:[...q('.panel')].filter(p=>!p.querySelector('.panel')).length,
containers:q('[data-iw-order-container="1"]').length,slots:q('[data-iw-order]').length,
handlesTotal:q('[data-iw-order-handle]').length,handlesVisible:h.length};
if(g){const c=getComputedStyle(g),b=g.getBoundingClientRect(),p=g.parentElement;
const x=Math.round(b.left+b.width/2),y=Math.round(b.top+Math.min(b.height/2,60));
const top=document.elementFromPoint(x,y);
r.handle={pos:c.position,z:c.zIndex,display:c.display,pointerEvents:c.pointerEvents,
w:Math.round(b.width),h:Math.round(b.height),panelW:Math.round(p.getBoundingClientRect().width)};
r.onTopAtHandle=(top===g||g.contains(top))?'the handle':(top?top.tagName+' '+String(top.className||'').slice(0,50):'nothing');
const ev=(ty,yy)=>g.dispatchEvent(new PointerEvent(ty,{bubbles:!0,cancelable:!0,pointerId:1,
pointerType:'mouse',isPrimary:!0,button:0,buttons:ty==='pointerup'?0:1,clientX:x,clientY:yy}));
try{ev('pointerdown',y);ev('pointermove',y-20);ev('pointermove',y-140)}catch(e){r.threw=String(e)}
r.dragEngaged=p.getAttribute('data-iw-order-drag')==='source';
try{g.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:!0,cancelable:!0}));ev('pointerup',y-140)}catch(e){}}
if(!was&&t&&d.dataset.iwOrderMode==='1')t.click();
console.log(r);try{copy(JSON.stringify(r,null,2));console.log('[iw] copied to clipboard')}catch(e){}})()
