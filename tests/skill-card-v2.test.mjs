import { JSDOM } from 'jsdom';

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

/* The controller reads `document` at call time, so a DOM must exist before the
   module's functions run - but not before it is imported. */
installDom();
const {
  enhanceSkillCardV2,
  clearSkillCardV2,
  initSkillCardDesignController,
  clearSkillCardDesignController,
} = await import('../src/modules/SkillCardDesignController.js');

const cases = [];
function check(label, condition, detail = '') {
  cases.push({ label, ok: !!condition, detail });
}

/* The V2 card is the ONLY design (Curtis, 2026-09): no old/new switch, no
   stored preference. The root attribute every V2 rule keys on is still set. */
{
  installDom('<section id="frame"><h2>Skill Actions</h2><div data-iw-skill-design-toggle="1">stale</div></section>');
  initSkillCardDesignController();
  check('the root is marked new on init', document.documentElement.getAttribute('data-iw-skill-card-design') === 'new');
  check('a toggle mounted by an older build is removed on init', !document.querySelector('[data-iw-skill-design-toggle]'));
  clearSkillCardDesignController();
  check('teardown removes the root mark', !document.documentElement.hasAttribute('data-iw-skill-card-design'));
}

// A dense construction card gets presentation derived from roles already
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
        <p>Found in the Bloodoak Grove</p>
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

  enhanceSkillCardV2(panel, 'construction');
  check('card is marked as V2-ready', panel.dataset.iwSkillV2 === '1');
  check('the card carries its discipline, which picks its action icon', panel.dataset.iwSkillV2Type === 'construction');
  check('the action glyph is appended to the command zone, not the button',
    panel.querySelector('[data-iw-skill-zone="commands"] > [data-iw-skill-v2-action-glyph]')
      && !action.querySelector('[data-iw-skill-v2-action-glyph]'));
  check('the glyph writes no inline style - the sheet picks the icon',
    !panel.querySelector('[data-iw-skill-v2-action-glyph]').getAttribute('style'));

  /* No tabs at all: Materials and Sources are the frame's default content, and
     Requirements, Queue and Rewards are not shown as tabs either. */
  check('no tab strip and no tab buttons',
    !panel.querySelector('[data-iw-skill-v2-tabs], [data-iw-skill-v2-tab-button]'));
  const bodyText = () => panel.querySelector('[data-iw-skill-v2-body]')?.textContent || '';
  check('the frame shows the materials', /Moonsteel Ore 3 \/ 9800/.test(bodyText()), bodyText());
  check('the frame shows the source line after the materials',
    bodyText().indexOf('Bloodoak Grove') > bodyText().indexOf('Moonsteel Ore'), bodyText());
  check('the frame shows neither the queue status nor the reward',
    !/will queue|Base Reward/.test(bodyText()), bodyText());
  check('the requirement line is still marked, so the game copy stays clipped',
    panel.querySelector('[data-iw-skill-role="requirement"]')?.dataset.iwSkillV2Section === 'requirements');

  check('a requirement with no unmet state shows no note or foot row',
    !panel.querySelector('[data-iw-skill-v2-req-note], [data-iw-skill-v2-controls]'));
  panel.querySelector('[data-iw-skill-role="requirement"]').dataset.iwReqState = 'unmet';
  enhanceSkillCardV2(panel, 'construction');
  check('an unmet requirement shows its line on the foot row',
    panel.querySelector('[data-iw-skill-v2-controls] > [data-iw-skill-v2-req-note]')?.textContent === 'Needs Construction Lv 53 + Woodcutting Lv 49');
  panel.querySelector('[data-iw-skill-role="requirement"]').dataset.iwReqState = 'met';
  enhanceSkillCardV2(panel, 'construction');
  check('the note and its row go away once the requirement is met',
    !panel.querySelector('[data-iw-skill-v2-req-note], [data-iw-skill-v2-controls]'));

  check('native action button is not reparented', action.parentElement === actionParent);
  check('native title is not reparented', title.parentElement === titleParent);

  clearSkillCardV2(panel);
  check('teardown removes V2 marker', !panel.hasAttribute('data-iw-skill-v2'));
  check('teardown removes the frame and the glyph',
    !panel.querySelector('[data-iw-skill-v2-body], [data-iw-skill-v2-action-glyph], [data-iw-skill-v2-controls]'));
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
