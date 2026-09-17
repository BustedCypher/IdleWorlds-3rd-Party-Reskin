import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');

function installDom() {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="current-action-panel" data-iw-panel="current-action">
      <header><h2>Current Action</h2><span id="remaining">11s</span></header>
      <div data-iw-panel-part="progress"><span style="width:8%"></span></div>
    </section>
    <div class="compact-panel fs-skill-panel" id="card" data-iw-skill-layout="three-zone">
      <div data-iw-skill-layout-shell="1">
        <div data-iw-skill-zone="identity"><span data-iw-skill-role="identity">Mining</span></div>
        <div data-iw-skill-zone="content"><h3 data-iw-skill-role="action-title">Mine Deep Ore</h3></div>
        <div data-iw-skill-zone="commands">
          <button data-iw-skill-role="action-button"><span id="label">Mine</span><span id="fill" style="width:8%"></span></button>
        </div>
      </div>
    </div>
  </body>`, { url: 'https://idleworlds.com/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.NodeFilter = dom.window.NodeFilter;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  return dom;
}

installDom();
const { enhanceSkillCardV2, clearSkillCardV2 } = await import('../src/modules/SkillCardDesignController.js');
const panel = document.querySelector('#card');
const button = panel.querySelector('[data-iw-skill-role="action-button"]');
const state = () => {
  const timer = panel.querySelector('[data-iw-skill-v2-action-timer]');
  return {
    active: panel.dataset.iwSkillV2LongAction === '1',
    timer: timer?.textContent || '',
    timerParentIsButtonParent: timer?.parentElement === button.parentElement,
  };
};

enhanceSkillCardV2(panel, 'mining');
assert.deepEqual(state(), {
  active: false,
  timer: '',
  timerParentIsButtonParent: false,
}, 'an action starting at exactly 11 seconds keeps its ordinary button');

document.querySelector('#remaining').textContent = '180s';
enhanceSkillCardV2(panel, 'mining');
assert.deepEqual(state(), {
  active: true,
  timer: '180s',
  timerParentIsButtonParent: true,
}, 'an action starting above 11 seconds immediately replaces the glyph and label with its remaining time');

document.querySelector('#remaining').textContent = '10s';
enhanceSkillCardV2(panel, 'mining');
assert.equal(state().active, true, 'the countdown remains active after remaining time falls below the starting threshold');
assert.equal(state().timer, '10s', 'the countdown follows the game-owned remaining time');

/* Live, the countdown ticks in the Current Action panel while the card itself
   does not mutate, so no `iw:skill-panel` fires. The tick reaches the card
   only through the flush events: the timer used to freeze until the card's
   own fill stepped (~10s on a long craft). */
const { initSkillCardDesignController, clearSkillCardDesignController } = await import('../src/modules/SkillCardDesignController.js');
initSkillCardDesignController();
const tick = (text, type = 'iw:name-scan-flush') => {
  const el = document.querySelector('#remaining');
  el.textContent = text;
  document.dispatchEvent(new CustomEvent(type, { detail: { roots: [el] } }));
};
tick('9s');
assert.equal(state().timer, '9s', 'a Current Action tick alone advances the card countdown');
tick('8s', 'iw:dom-flush');
assert.equal(state().timer, '8s', 'a dom-flush carrying the tick also advances it');
const elsewhere = document.createElement('p');
document.body.append(elsewhere);
document.querySelector('#remaining').textContent = '7s';
document.dispatchEvent(new CustomEvent('iw:name-scan-flush', { detail: { roots: [elsewhere] } }));
assert.equal(state().timer, '8s', 'negative control: a flush outside Current Action does not re-read the clock');
elsewhere.remove();
clearSkillCardDesignController();
document.querySelector('#remaining').textContent = '70s';
enhanceSkillCardV2(panel, 'mining');
assert.equal(state().timer, '70s');
tick('69s');
assert.equal(state().timer, '70s', 'negative control: an inactive controller ignores ticks');

document.querySelector('#fill').remove();
enhanceSkillCardV2(panel, 'mining');
assert.deepEqual(state(), {
  active: false,
  timer: '',
  timerParentIsButtonParent: false,
}, 'completion restores the ordinary action button');

const fill = document.createElement('span');
fill.id = 'fill';
fill.style.width = '8%';
button.append(fill);
document.querySelector('#remaining').textContent = '90s';
enhanceSkillCardV2(panel, 'mining');
clearSkillCardV2(panel);
assert.deepEqual(state(), {
  active: false,
  timer: '',
  timerParentIsButtonParent: false,
}, 'teardown removes long-action presentation state');

const css = await readFile(resolve(root, 'src/styles/skillcard-v2.css'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 420 } });
try {
  await page.setContent(`<!doctype html>
    <html data-iw-skill-card-design="new"><head><style>
      *,::before,::after { box-sizing: border-box; }
      body { margin: 0; }
      .compact-panel { width: 600px; min-height: 150px; position: relative; }
      [data-iw-skill-layout-shell] { position: relative; display: grid; min-height: 150px; }
    </style><style>${css}</style></head><body>
      <div class="compact-panel fs-skill-panel" data-iw-skill-v2="1" data-iw-skill-v2-long-action="1" data-iw-skill-layout="three-zone">
        <div data-iw-skill-layout-shell="1"><div data-iw-skill-zone="commands">
          <button data-iw-skill-role="action-button"><span id="label">Mine</span><span style="width:8%"></span></button>
          <span class="iw-skill-v2-action-label" data-iw-skill-v2-action-label="1">Mine</span>
          <span class="iw-skill-v2-action-glyph" data-iw-skill-v2-action-glyph="1" data-iw-skill-v2-action-timer="1">180s</span>
        </div></div>
      </div>
    </body></html>`);
  const visual = await page.evaluate(() => ({
    labelOpacity: getComputedStyle(document.querySelector('#label')).opacity,
    externalLabelOpacity: getComputedStyle(document.querySelector('[data-iw-skill-v2-action-label]')).opacity,
    glyphOpacity: getComputedStyle(document.querySelector('[data-iw-skill-v2-action-glyph]')).opacity,
    timerDisplay: getComputedStyle(document.querySelector('[data-iw-skill-v2-action-timer]')).display,
  }));
  assert.deepEqual(visual, {
    labelOpacity: '0',
    externalLabelOpacity: '0',
    glyphOpacity: '1',
    timerDisplay: 'grid',
  }, 'long-action styling replaces the ordinary icon and label with the timer');
} finally {
  await browser.close();
}

console.log('PASS skill action countdown lifecycle');
