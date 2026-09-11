import { JSDOM } from 'jsdom';
import {
  DEFAULT_SKILL_CARD_DESIGN,
  normalizeSkillCardDesign,
  applySkillCardDesign,
  ensureSkillCardDesignToggle,
  enhanceSkillCardV2,
  setSkillCardExpanded,
  setSkillCardTab,
  clearSkillCardV2,
} from '../src/modules/SkillCardDesignController.js';

function installDom(html = '') {
  const dom = new JSDOM(`<body>${html}</body>`, { url: 'https://idleworlds.com/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.NodeFilter = dom.window.NodeFilter;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  return dom;
}

const cases = [];
function check(label, condition, detail = '') {
  cases.push({ label, ok: !!condition, detail });
}

// Default / normalisation contract: this branch is intentionally NEW-first.
{
  const dom = installDom();
  check('default design is new', DEFAULT_SKILL_CARD_DESIGN === 'new', DEFAULT_SKILL_CARD_DESIGN);
  check('unknown stored value falls back to new', normalizeSkillCardDesign('wat') === 'new');
  check('current stored value is preserved', normalizeSkillCardDesign('current') === 'current');
  applySkillCardDesign(undefined, dom.window.document.documentElement);
  check('apply without value marks root as new', dom.window.document.documentElement.dataset.iwSkillCardDesign === 'new');
}

// Toggle is skin-owned, reversible, and exposes pressed state without touching game controls.
{
  installDom('<section id="frame"><h2>Skill Actions</h2></section>');
  const frame = document.querySelector('#frame');
  const toggle = ensureSkillCardDesignToggle(frame, 'new');
  check('toggle appended once', !!toggle && frame.querySelectorAll('[data-iw-skill-design-toggle]').length === 1);
  check('new button pressed', toggle.querySelector('[data-iw-skill-design="new"]')?.getAttribute('aria-pressed') === 'true');
  check('current button unpressed', toggle.querySelector('[data-iw-skill-design="current"]')?.getAttribute('aria-pressed') === 'false');
  ensureSkillCardDesignToggle(frame, 'current');
  check('toggle remains singleton after reconcile', frame.querySelectorAll('[data-iw-skill-design-toggle]').length === 1);
  check('current button updates pressed state', toggle.querySelector('[data-iw-skill-design="current"]')?.getAttribute('aria-pressed') === 'true');
}

// A dense construction card gets presentation controls derived from roles already
// assigned by SkillPanelRenderer. Native gameplay nodes stay in place.
{
  installDom(`
    <div class="compact-panel" id="card">
      <div data-iw-skill-zone="identity"><span data-iw-skill-role="identity">Construction</span></div>
      <div data-iw-skill-zone="content">
        <h3 data-iw-skill-role="action-title">Build Moonsteel Arboretum</h3>
        <button data-iw-skill-role="level-progress">Lv 56 - 12.6% • 4,000 XP to go</button>
        <p data-iw-skill-role="requirement">Needs Construction Lv 53 + Woodcutting Lv 49</p>
        <div data-iw-skill-ingredient-list="1" role="list"><span role="listitem">Moonsteel Ore 3 / 9800</span></div>
        <p data-iw-skill-role="action-detail">Missing materials — will queue</p>
        <p data-iw-skill-role="reward">Base Reward: 252</p>
      </div>
      <div data-iw-skill-zone="commands"><button data-iw-skill-role="action-button">Build</button></div>
    </div>
  `);
  const panel = document.querySelector('#card');
  const action = panel.querySelector('[data-iw-skill-role="action-button"]');
  const actionParent = action.parentElement;
  const title = panel.querySelector('[data-iw-skill-role="action-title"]');
  const titleParent = title.parentElement;

  const controls = enhanceSkillCardV2(panel, 'construction');
  check('card is marked as V2-ready', panel.dataset.iwSkillV2 === '1');
  check('V2 starts collapsed', panel.dataset.iwSkillV2State === 'collapsed');
  check('requirements is initial tab when present', panel.dataset.iwSkillV2Tab === 'requirements');
  check('requirements tab exists', !!controls.querySelector('[data-iw-skill-v2-tab-button="requirements"]'));
  check('materials tab exists', !!controls.querySelector('[data-iw-skill-v2-tab-button="materials"]'));
  check('details tab exists', !!controls.querySelector('[data-iw-skill-v2-tab-button="details"]'));
  check('rewards tab exists', !!controls.querySelector('[data-iw-skill-v2-tab-button="rewards"]'));
  check('native action button is not reparented', action.parentElement === actionParent);
  check('native title is not reparented', title.parentElement === titleParent);

  setSkillCardExpanded(panel, true);
  check('expand changes state only', panel.dataset.iwSkillV2State === 'expanded');
  setSkillCardTab(panel, 'materials');
  check('tab switch updates active tab', panel.dataset.iwSkillV2Tab === 'materials');
  check('materials button pressed after switch', controls.querySelector('[data-iw-skill-v2-tab-button="materials"]')?.getAttribute('aria-selected') === 'true');

  clearSkillCardV2(panel);
  check('teardown removes V2 marker', !panel.hasAttribute('data-iw-skill-v2'));
  check('teardown removes owned controls', !panel.querySelector('[data-iw-skill-v2-controls]'));
  check('teardown leaves native action button connected', panel.contains(action));
}

let fail = 0;
console.log('case                                                     result');
console.log('-'.repeat(72));
for (const c of cases) {
  if (!c.ok) fail += 1;
  console.log(`${c.label.padEnd(56)} ${c.ok ? 'PASS' : 'FAIL'}${c.detail ? `  ${c.detail}` : ''}`);
}
console.log('-'.repeat(72));
console.log(fail === 0 ? `\nPASS (${cases.length} checks)` : `\nFAIL - ${fail} of ${cases.length} check(s)`);
process.exit(fail === 0 ? 0 : 1);
