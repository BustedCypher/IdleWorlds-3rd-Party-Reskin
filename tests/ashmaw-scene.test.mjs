import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

// Catches art leaking to another boss, replacing React nodes, duplicate mounts,
// and an animation surviving route removal or the skin kill switch.
const compiled = await build({ entryPoints: ['src/modules/GuildPanels.js'], bundle: true,
  write: false, format: 'iife', globalName: 'Guild' });
const dom = new JSDOM(`<div id="root"><h2>Raid Dungeon</h2>
  <div class="raid-battle-backdrop" style="--raid-bg-image: url(/raid-backgrounds/boss-ashmaw.png)">
    <div><span>Ashmaw, the Cinder Tyrant</span><div><img alt="Ashmaw, the Cinder Tyrant" src="/raid-sprites/boss-ashmaw.png"></div>
    <div><div style="width: 50%"></div></div></div><button class="raid-readable-panel">Combat Log</button>
  </div></div>`, { url: 'https://idleworlds.com/guild', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
w.eval(compiled.outputFiles[0].text);
const root = w.document.querySelector('#root');
const arena = root.querySelector('.raid-battle-backdrop');
const boss = arena.querySelector('img');
const button = arena.querySelector('button');
let clicks = 0;
button.addEventListener('click', () => clicks++);
const decorate = () => w.Guild.decorateGuildPanel({ root, heading: root.querySelector('h2') });
decorate();
const scene = arena.querySelector('[data-iw-ashmaw-art]');
assert.ok(scene, 'Ashmaw gets his painted scene');
assert.equal(scene.getAttribute('aria-hidden'), 'true');
assert.ok(scene.querySelector('[data-iw-art="environment"]').src.endsWith('/assets/raids/ashmaw/arena.png'), 'live raid loads the approved arena painting');
assert.equal(scene.querySelector('[data-iw-art="dragon"]'),null,'the rejected full-body animation is not loaded');
decorate();
assert.equal(arena.querySelectorAll('[data-iw-ashmaw-art]').length, 1, 'ticks never duplicate the scene');
assert.equal(arena.querySelector('[data-iw-ashmaw-art]'), scene, 'ticks preserve animation identity');
assert.equal(arena.querySelector('img:not([data-iw-art])'), boss, 'native boss node survives');
button.click();
assert.equal(clicks, 1, 'native handlers survive');
w.Guild.clearGuildPanel(root);
assert.equal(arena.querySelector('[data-iw-ashmaw-art]'), null, 'kill switch removes owned art');
assert.equal(arena.hasAttribute('data-iw-raid-scene'), false);
assert.equal(boss.parentElement.hasAttribute('data-iw-raid-boss-stage'), false);
arena.style.setProperty('--raid-bg-image', 'url(/raid-backgrounds/boss-skarth.png)');
boss.alt = 'Skarth, the Rime Wyrm'; boss.src = '/raid-sprites/boss-skarth.png';
decorate();
assert.equal(arena.querySelector('[data-iw-ashmaw-art]'), null, 'another boss never receives Ashmaw');
boss.alt = 'Ashmaw, the Cinder Tyrant'; boss.src = '/raid-sprites/boss-ashmaw.png';
arena.style.setProperty('--raid-bg-image', 'url(/raid-backgrounds/boss-ashmaw.png)');
decorate();
boss.alt = 'Thessaly, the Plague Warden'; boss.src = '/raid-sprites/boss-thessaly.png';
arena.style.setProperty('--raid-bg-image', 'url(/raid-backgrounds/boss-thessaly.png)');
decorate();
assert.equal(arena.querySelector('[data-iw-ashmaw-art]'), null, 'in-place encounter change removes old art');
boss.alt = 'Ashmaw, the Cinder Tyrant'; boss.src = '/raid-sprites/boss-ashmaw.png';
arena.style.setProperty('--raid-bg-image', 'url(/raid-backgrounds/boss-ashmaw.png)');
decorate();
const removedArt = arena.querySelector('[data-iw-ashmaw-art]');
removedArt.remove(); decorate();
assert.ok(arena.querySelector('[data-iw-ashmaw-art]'), 'React removing decoration gets a fresh scene');
assert.notEqual(arena.querySelector('[data-iw-ashmaw-art]'), removedArt);
const priorArt = arena.querySelector('[data-iw-ashmaw-art]');
const oldStage = boss.parentElement, newStage = w.document.createElement('div');
oldStage.replaceWith(newStage); newStage.append(boss); decorate();
assert.notEqual(arena.querySelector('[data-iw-ashmaw-art]'), priorArt, 'replaced boss stage is rebound');
arena.remove(); decorate();
assert.equal(arena.querySelector('[data-iw-ashmaw-art]'), null, 'a removed encounter is cleaned up even with motion disabled');
dom.window.close();
console.log('Ashmaw scene ownership and encounter isolation passed');
