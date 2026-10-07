import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

// The Guild integration must preserve native ownership while changing bosses.
const compiled=await build({entryPoints:['src/modules/GuildPanels.js'],bundle:true,write:false,format:'iife',globalName:'Guild'});
const dom=new JSDOM(`<div id="root"><h2>Raid Dungeon</h2><div class="raid-battle-backdrop" style="--raid-bg-image:url(/raid-backgrounds/boss-thessaly.png)"><div><span>Thessaly, the Plague Warden</span><div><img alt="Thessaly, the Plague Warden" src="/raid-sprites/boss-thessaly.png"></div><div id="hp"><div style="width:73%"></div></div></div><div><button class="raid-readable-panel">Combat Log</button></div></div></div>`,{url:'https://idleworlds.com/guild',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.eval(compiled.outputFiles[0].text);
const root=w.document.querySelector('#root'),arena=root.querySelector('.raid-battle-backdrop'),boss=arena.querySelector('img'),button=arena.querySelector('button');
const parents=[boss.parentElement,button.parentElement];let clicks=0;button.addEventListener('click',()=>clicks++);
const decorate=()=>w.Guild.decorateGuildPanel({root,heading:root.querySelector('h2')});
const changeBoss=name=>{boss.alt=name==='thessaly'?'Thessaly, the Plague Warden':name==='ashmaw'?'Ashmaw, the Cinder Tyrant':'Skarth, the Rime Wyrm';boss.src=`/raid-sprites/boss-${name}.png`;arena.style.setProperty('--raid-bg-image',`url(/raid-backgrounds/boss-${name}.png)`);decorate();};
decorate();
const art=arena.querySelector('[data-iw-thessaly-art]');assert.ok(art,'Thessaly receives her own plague arena');
assert.equal(art.getAttribute('aria-hidden'),'true');assert.ok(art.querySelector('img').src.endsWith('/assets/raids/thessaly/arena-storm.png'));
decorate();assert.equal(arena.querySelector('[data-iw-thessaly-art]'),art,'game ticks retain renderer identity');assert.equal(arena.querySelectorAll('[data-iw-thessaly-art]').length,1);
assert.equal(boss.parentElement,parents[0]);assert.equal(button.parentElement,parents[1]);assert.equal(button.parentElement.getAttribute('data-iw-guild-role'),'combat-log-region');
button.click();assert.equal(clicks,1);assert.equal(arena.querySelector('#hp>div').style.width,'73%');
changeBoss('ashmaw');assert.equal(arena.querySelector('[data-iw-thessaly-art]'),null);assert.ok(arena.querySelector('[data-iw-ashmaw-art]'),'switching to Ashmaw preserves his scene');
changeBoss('thessaly');assert.equal(arena.querySelector('[data-iw-ashmaw-art]'),null);assert.ok(arena.querySelector('[data-iw-thessaly-art]'));
changeBoss('skarth');assert.equal(arena.querySelector('[data-iw-thessaly-art]'),null);assert.equal(arena.querySelector('[data-iw-ashmaw-art]'),null,'other encounters retain native art');
changeBoss('thessaly');const oldArt=arena.querySelector('[data-iw-thessaly-art]');oldArt.remove();decorate();assert.notEqual(arena.querySelector('[data-iw-thessaly-art]'),oldArt,'React replacing decoration remounts safely');
const prior=arena.querySelector('[data-iw-thessaly-art]'),stage=w.document.createElement('div');boss.parentElement.replaceWith(stage);stage.append(boss);decorate();assert.notEqual(arena.querySelector('[data-iw-thessaly-art]'),prior,'a replaced native stage is rebound');
w.Guild.clearGuildPanel(root);assert.equal(arena.querySelector('[data-iw-thessaly-art]'),null);assert.equal(stage.hasAttribute('data-iw-raid-boss-stage'),false);assert.equal(root.querySelector('[data-iw-guild-role]'),null);
decorate();arena.remove();decorate();assert.equal(arena.querySelector('[data-iw-thessaly-art]'),null,'route removal prunes a still scene');
dom.window.close();console.log('Thessaly ownership, native handlers and encounter transitions passed');
