// Sample data only. This preview does not connect to IdleWorlds or game state.
const raiders = [
  {name:'BustedCypher',skill:'Jewelcrafting',icon:'jewelcrafting',hp:52,charge:55,mine:true,effects:[['shield','126'],['war-cry','3s'],['ward','13s'],['curse','8s']]},
  {name:'Noook',skill:'Combat (Tank)',icon:'combat',hp:100,charge:92,effects:[['shield','126'],['taunt','21s'],['ward','13s'],['bleed','6s']]},
  {name:'Alex',skill:'Combat (Tank)',icon:'combat',hp:79,charge:68,effects:[['shield','126'],['war-cry','3s'],['ward','13s'],['curse','8s']]},
  {name:'Oat',skill:'Tailoring',icon:'tailoring',hp:70,charge:61,effects:[['shield','126'],['war-cry','3s'],['ward','13s'],['bleed','6s']]},
  {name:'TadFish',skill:'Construction',icon:'construction',hp:68,charge:74,effects:[['shield','126'],['war-cry','3s'],['ward','13s'],['bleed','6s']]},
  {name:'Xanthippe',skill:'Mining',icon:'mining',hp:68,charge:39,effects:[['shield','126'],['war-cry','3s'],['ward','13s'],['curse','8s']]},
  {name:'Guest 63AC',skill:'Woodcutting',icon:'woodcutting',hp:67,charge:82,effects:[['shield','126'],['war-cry','3s'],['ward','13s'],['bleed','6s']]}
];
const labels={shield:'Absorb shield',ward:'Ward: +27 fire resistance','war-cry':'War Cry: +15% raid attack',curse:'Curse: reduced healing',bleed:'Bleeding',taunt:'Challenge: tanking'};
const party=document.querySelector('.party');let selected=0;let more=false;
function render(){
  party.replaceChildren();
  for(const [i,r] of raiders.entries()){
    const unit=document.createElement('div');unit.className=`unit${i===selected?' selected':''}${r.mine?' mine':''}${r.hp<30?' critical':''}`;unit.tabIndex=0;unit.setAttribute('role','button');unit.setAttribute('aria-label',`${r.name}, ${r.skill}, ${r.hp}% health`);unit.setAttribute('aria-pressed',String(i===selected));
    const frame=r.hp<30?'unit-critical':i===selected?'unit-selected':'unit-normal';
    unit.innerHTML=`<i class="unit-frame raid-art" data-sprite="${frame}" aria-hidden="true"></i><header><i class="skill-icon raid-art" data-sprite="skill-${r.icon}" aria-hidden="true"></i><div><p class="unit-name" title="${r.name}">${r.name}</p><p class="unit-skill">${r.skill}</p></div><b class="unit-pct">${r.hp}%</b></header><div class="mini-bars"><div class="mini-bar hp"><i class="bar-fill" style="--value:${r.hp}%"></i></div><div class="mini-bar action"><i class="bar-fill" style="--value:${r.charge}%"></i></div></div><div class="effects"></div>`;
    const effects=more?[...r.effects,['taunt','12s'],['curse','5s']]:r.effects;
    for(const [kind,value] of effects){const e=document.createElement('span');e.className='effect';e.dataset.kind=kind;e.tabIndex=0;e.title=`${labels[kind]} · ${value}`;e.setAttribute('aria-label',e.title);e.innerHTML=`<i class="raid-art" data-sprite="${kind}" aria-hidden="true"></i>${value}`;unit.querySelector('.effects').append(e);}
    const select=()=>{selected=i;render();party.children[i].focus({preventScroll:true});};unit.addEventListener('click',select);unit.addEventListener('keydown',e=>{if(e.target===unit&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select();}});party.append(unit);
  }
}
render();
document.querySelectorAll('[data-view]').forEach(button=>{if(button.tagName!=='BUTTON')return;button.addEventListener('click',()=>{document.querySelector('.scene').dataset.view=button.dataset.view;document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('.utility').forEach(d=>d.open=button.dataset.view==='desktop');});});
document.querySelector('#boss-hp').addEventListener('input',e=>{const n=Number(e.target.value);document.querySelector('.boss-fill').style.setProperty('--value',`${n}%`);document.querySelector('.boss-hp').innerHTML=`${Math.round(21000*n/100).toLocaleString('en-US')} <em>/ 21,000 HP</em>`;document.querySelector('.boss-percent').textContent=`${Math.round(n)}%`;});
document.querySelector('#your-hp').addEventListener('input',e=>{const n=Number(e.target.value);raiders[0].hp=n;document.querySelector('.health .bar-fill').style.setProperty('--value',`${n}%`);document.querySelector('.health b').textContent=`${n}%`;render();});
document.querySelector('#more-effects').addEventListener('click',e=>{more=!more;e.target.setAttribute('aria-pressed',String(more));render();});
window.previewData={raiders,labels};
Promise.resolve(window.RAID_UI_ATLAS).then(index=>{window.raidAtlas=index;for(const e of index.entries){const card=document.createElement('div');card.className=`sprite-card ${e.kind==='chrome'?'':'icon'}`;card.innerHTML=`<i class="raid-art" data-sprite="${e.name}"></i><code>${e.name} · ${e.width} × ${e.height}</code>`;document.querySelector('#gallery').append(card);}});
