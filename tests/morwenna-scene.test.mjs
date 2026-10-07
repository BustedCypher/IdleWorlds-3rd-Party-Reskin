import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';

const compiled=await build({entryPoints:['src/modules/GuildPanels.js'],bundle:true,write:false,format:'iife',globalName:'Guild'});
const dom=new JSDOM(`<div id="root"><h2>Raid Dungeon</h2><div class="raid-battle-backdrop" style="--raid-bg-image:url(/raid-backgrounds/boss-morwenna.png)"><div><span>Morwenna, the Hollow Oracle</span><div><img alt="Morwenna, the Hollow Oracle" src="/raid-sprites/boss-morwenna.png"></div><div id="hp"><div style="width:73%"></div></div></div><div><button class="raid-readable-panel">Combat Log</button></div></div></div>`,{url:'https://idleworlds.com/guild',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.eval(compiled.outputFiles[0].text);
const root=w.document.querySelector('#root'),arena=root.querySelector('.raid-battle-backdrop'),boss=arena.querySelector('img'),button=arena.querySelector('button');
const parents=[boss.parentElement,button.parentElement];let clicks=0;button.addEventListener('click',()=>clicks++);
const decorate=()=>w.Guild.decorateGuildPanel({root,heading:root.querySelector('h2')});
const names={morwenna:'Morwenna, the Hollow Oracle',thessaly:'Thessaly, the Plague Warden',ashmaw:'Ashmaw, the Cinder Tyrant',skarth:'Skarth, the Rime Wyrm'};
const changeBoss=name=>{boss.alt=names[name];boss.src=`/raid-sprites/boss-${name}.png`;arena.style.setProperty('--raid-bg-image',`url(/raid-backgrounds/boss-${name}.png)`);decorate();};
decorate();
const art=arena.querySelector('[data-iw-morwenna-art]');assert.ok(art,'Morwenna receives the approved Embercourt scene');
assert.equal(art.getAttribute('aria-hidden'),'true');assert.ok(art.querySelector('img').src.endsWith('/assets/raids/morwenna/arena.png'));
decorate();assert.equal(arena.querySelector('[data-iw-morwenna-art]'),art,'HP ticks retain scene identity');assert.equal(arena.querySelectorAll('[data-iw-morwenna-art]').length,1);
assert.equal(boss.parentElement,parents[0]);assert.equal(button.parentElement,parents[1]);
button.click();assert.equal(clicks,1);assert.equal(arena.querySelector('#hp>div').style.width,'73%');
for(const name of ['ashmaw','thessaly','morwenna']){
 changeBoss(name);assert.ok(arena.querySelector(`[data-iw-${name}-art]`));
 assert.equal(arena.querySelectorAll('[data-iw-ashmaw-art],[data-iw-thessaly-art],[data-iw-morwenna-art]').length,1,'boss changes leave exactly one owned scene');
 assert.equal(boss.parentElement,parents[0]);assert.equal(button.parentElement,parents[1]);
}
changeBoss('skarth');assert.equal(arena.querySelector('[data-iw-morwenna-art]'),null,'unsupported encounters keep native art');
changeBoss('morwenna');arena.style.setProperty('--raid-bg-image','url(/raid-backgrounds/boss-skarth.png)');decorate();assert.equal(arena.querySelector('[data-iw-morwenna-art]'),null,'contradicting native backdrop prevents activation');
changeBoss('morwenna');const prior=arena.querySelector('[data-iw-morwenna-art]');prior.remove();decorate();assert.notEqual(arena.querySelector('[data-iw-morwenna-art]'),prior,'removed decoration remounts safely');
const old=arena.querySelector('[data-iw-morwenna-art]'),stage=w.document.createElement('div');boss.parentElement.replaceWith(stage);stage.append(boss);decorate();assert.notEqual(arena.querySelector('[data-iw-morwenna-art]'),old,'replaced native boss stage is rebound');
w.Guild.clearGuildPanel(root);assert.equal(arena.querySelector('[data-iw-morwenna-art]'),null);assert.equal(stage.hasAttribute('data-iw-raid-boss-stage'),false);assert.equal(root.querySelector('[data-iw-guild-role]'),null);
decorate();arena.remove();decorate();assert.equal(arena.querySelector('[data-iw-morwenna-art]'),null,'route removal prunes a reduced-motion scene');
dom.window.close();console.log('Morwenna native ownership, handlers, transitions and teardown passed');
