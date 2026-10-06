/**
 * The UNPACKED EXTENSION, end to end - manifest and all.
 *
 * Every other suite injects dist/content.bundle.js into a page by hand, so none
 * of them can see the things only the real extension does: the manifest's two
 * content scripts in two worlds (src/page/hydration-signal.js in MAIN at
 * document_start, the bundle ISOLATED at document_idle), the page-world latch
 * releasing the isolated-world boot, `chrome.storage`, and asset URLs resolving
 * through `web_accessible_resources`. This loads the repo folder into Chromium
 * exactly as "Load unpacked" does and runs it on a routed https://idleworlds.com
 * page, twice:
 *
 *   1. with a stand-in React root that finishes hydrating 600ms after load -
 *      boot must be released by the signal, as hydrated, shortly after that;
 *   2. with no React root at all - the gate must time out and boot anyway
 *      (the negative control: the "hydrated" check above cannot pass here).
 *
 * The fixture's markup is whitespace-free, as React's is: that is what exposed
 * the isQuestCard prefilter bug (tests/quest-card-detection.test.mjs).
 *
 * Needs Playwright's full Chromium (`channel: 'chromium'`): the headless shell
 * cannot load extensions. `npx playwright install chromium` installs both.
 *
 * Release check: `npm run package`, unzip the result, then
 *   IW_EXTENSION_DIR=<unzipped folder> node tests/extension-e2e.test.mjs
 */
import { chromium } from 'playwright';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// IW_EXTENSION_DIR runs the same checks against another folder - e.g. the
// unzipped output of `npm run package`, to prove the release zip itself works.
const EXT = resolve(process.env.IW_EXTENSION_DIR || resolve(import.meta.dirname, '..'));

const page = react => `<!doctype html><html><head><meta charset="utf-8"><title>IdleWorlds</title>
<script>${react ? `
  const hostRoot = { memoizedState: { isDehydrated: true } };
  document['__reactContainer$e2e'] = { stateNode: { current: hostRoot } };
  setTimeout(() => { hostRoot.memoizedState = { isDehydrated: false }; }, 600);` : ''}
</script>
<style>body{margin:0;background:#0f172a;color:#e2e8f0;font:14px system-ui}.panel{padding:8px}</style></head>
<body><div id="root"><div class="app"><header><div><h1>BustedCypher</h1><p>⚔ Combat Lv 62</p></div><div><button>☆</button><button>⚙</button></div><div id="status-grid"><div>💰 515,686</div><div>⚔ ATK 292 · DEF 252</div></div></header><nav><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button></nav><div id="zone-bar-panel" class="panel"><div><p>🧭 Zone 19: Eternium Verge</p></div><div><button>🌐 Zones</button><button>Next Zone</button></div></div><div style="display:flex;flex-direction:column;gap:12px"><div class="panel"><div><h2>Quests</h2></div><div class="compact-panel" id="quest"><div><p>Smithing Work Order</p><p>Iron Gloves+3 0/1</p><p>Reward: +2,100g • +900 smithing XP</p></div><div><button>Turn In</button><button>Skip</button></div><div>0% complete</div></div></div><h2>Inventory</h2><section aria-label="Inventory" class="panel"><div class="space-y-1.5"><div class="compact-row"><div><span>Iron Sword</span><span>+2</span></div><div><span>Tier 4 · Weapon</span></div><div><span>x1</span></div><button>Equip</button><button>List</button></div></div></section></div></div></div></body></html>`;

const ITEMS = JSON.stringify({ generatedAt: 'e2e', items: [{ item_id: 'iron_sword', name: 'Iron Sword', category: 'Equipment', tier: 4 }] });
const raidPage=react=>page(react).replace('</div></div></body>',`<section><div class="panel"><h2>Raid Dungeon</h2><div class="raid-battle-backdrop" style="--raid-bg-image:url(/raid-backgrounds/boss-ashmaw.png)"><div class="raid-readable-panel">Claw Rake in 10s</div><div><span>Ashmaw, the Cinder Tyrant</span><div><img alt="Ashmaw, the Cinder Tyrant" src="/raid-sprites/boss-ashmaw.png"></div><div style="height:10px"><div style="width:49%;height:100%;background:#da5b55"></div></div><p>10,352 / 21,000 HP</p></div><div class="raid-readable-panel"><button id="raid-skills" onclick="window.raidClicks=(window.raidClicks||0)+1">Raid skills</button><p>Ward active +27 fire resistance</p></div><div class="raid-arena-floor"><button disabled>BustedCypher · Jewelcrafting</button></div><button class="raid-readable-panel">Combat Log</button><p>Charging your action bar…</p></div></div></section></div></div></body>`);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

async function run(react) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'iw-ext-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    const tab = await context.newPage();
    const logs = [];
    const errors = [];
    let assets = 0;
    tab.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
    tab.on('pageerror', e => errors.push(String(e)));
    tab.on('requestfinished', r => { if (r.url().startsWith('chrome-extension://')) assets += 1; });
    tab.on('requestfailed', r => { if (r.url().startsWith('chrome-extension://')) errors.push(`asset failed: ${r.url()}`); });
    await context.route('https://idleworlds.com/**', route => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/game') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: page(react) });
      if (pathname === '/guild') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: raidPage(react) });
      if (pathname.startsWith('/raid-')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#943b20"/></svg>'});
      if (pathname === '/items.json') return route.fulfill({ contentType: 'application/json', body: ITEMS });
      return route.fulfill({ status: 404, body: '' });
    });

    const t0 = Date.now();
    await tab.goto('https://idleworlds.com/game');
    const bootedAt = await tab.waitForFunction(() => document.querySelectorAll('style[data-iw-style]').length === 7, null, { timeout: 15000 })
      .then(() => Date.now() - t0).catch(() => null);
    await tab.waitForFunction(() => !!document.querySelector('.compact-row > .fs-inv-row') && !!document.querySelector('#quest.fs-quest-panel'), null, { timeout: 8000 }).catch(() => {});

    const state = await tab.evaluate(() => ({
      latchLeft: document.documentElement.hasAttribute('data-iw-page-hydrated'),
      nav: document.querySelector('nav')?.dataset.iwUi || null,
      quest: !!document.querySelector('#quest.fs-quest-panel'),
      invOverlay: !!document.querySelector('.compact-row > .fs-inv-row'),
      font: (document.querySelector('style[data-iw-style="base"]')?.textContent.match(/url\("?(chrome-extension:[^")]+)/) || [])[1] || null,
    }));
    const fontOk = state.font ? await tab.evaluate(u => fetch(u).then(r => r.ok, () => false), state.font) : false;
    const bootLine = logs.find(l => l.includes('boot after page hydration')) || '(no boot line)';

    console.log(`\nextension e2e: ${react ? 'React root hydrating at 600ms' : 'no React root'}`);
    check('the extension boots on idleworlds.com (7 stylesheets)', bootedAt !== null);
    if (react) {
      check('the page-world signal released boot as hydrated', /hydration: 1 \(/.test(bootLine), bootLine);
      check('...shortly after hydration, not at the gate timeout', bootedAt !== null && bootedAt < 3000, `${bootedAt}ms`);
    } else {
      check('with no React root the gate times out, then boots', /hydration: timeout \(/.test(bootLine), bootLine);
    }
    check('the latch is removed from <html> after release', state.latchLeft === false);
    check('main nav classified', state.nav === 'main-nav', String(state.nav));
    check('whitespace-free quest card rendered', state.quest);
    check('inventory row overlay rendered', state.invOverlay);
    check('bundled font resolves through web_accessible_resources', fontOk === true, String(state.font));
    if (react) {
      await tab.emulateMedia({ reducedMotion: 'reduce' });
      await tab.locator('[data-iw-nav-link="arcane-cache"]').click();
      await tab.locator('.scene[data-phase="waiting"]').waitFor({ timeout: 10000 });
      const chestUrl = await tab.locator('.chest-closed').evaluate(el => getComputedStyle(el).backgroundImage);
      check('cache chest loads from the real extension with its shadow styles',
        chestUrl.includes('chrome-extension://') && chestUrl.includes('arcane-cache/chest-states.png'), chestUrl);
      await tab.locator('.open-cache').click();
      await tab.locator('.scene[data-phase="revealed"]').waitFor();
      check('real extension renders the three sample rewards', await tab.locator('.reward').count() === 3);
      await tab.keyboard.press('Escape');
      check('cache closes without removing native controls',
        await tab.locator('dialog[data-iw-arcane-cache]').count() === 0 && await tab.locator('nav > button:not([data-iw-cache-trigger])').count() === 4);
      await tab.goto('https://idleworlds.com/guild');
      await tab.locator('[data-iw-raid-scene="ashmaw"] [data-iw-animated]').waitFor({timeout:10000});
      await tab.locator('.raid-battle-backdrop').scrollIntoViewIfNeeded();
      const arenaArt=await tab.locator('[data-iw-art="environment"]').getAttribute('src');
      check('live Guild raid uses the approved bundled arena',arenaArt.startsWith('chrome-extension://')&&arenaArt.endsWith('/assets/raids/ashmaw/arena.png'),arenaArt);
      check('live Guild mounts one separate animated backdrop',await tab.locator('[data-iw-ashmaw-art]').count()===1);
      // The live game wraps its log button; grid placement belongs to that
      // native wrapper, while interaction and panel styling stay on the button.
      await tab.locator('[data-iw-guild-role="combat-log"]').evaluate(log=>{const wrapper=document.createElement('div');log.replaceWith(wrapper);wrapper.append(log);});
      await tab.waitForTimeout(250);
      await tab.locator('.raid-arena-floor').evaluate(floor=>{
        // Native layout and realistic party capacity; the skin never builds
        // these controls, this fixture simulates the game's roster update.
        floor.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
        for(let i=1;i<12;i++){const player=floor.firstElementChild.cloneNode(true);player.textContent=`Raider ${i} · Woodcutting`;floor.append(player);}
      });
      await tab.locator('#raid-skills').evaluate(button=>{
        const expanded=document.createElement('div');expanded.id='expanded-skills';
        for(let i=0;i<12;i++){const row=document.createElement('p');row.textContent=`Raider ${i}: War Cry ready`;expanded.append(row);}
        button.parentElement.append(expanded);
      });
      await tab.waitForTimeout(250);
      for(const width of [1440,900,390,320]){
        await tab.setViewportSize({width,height:900});
        const layout=await tab.locator('.raid-battle-backdrop').evaluate(arena=>{
          const log=arena.querySelector('[data-iw-guild-role="combat-log"]');
          const item=log.parentElement===arena?log:log.parentElement;
          const floor=arena.querySelector('.raid-arena-floor');
          const rect=arena.getBoundingClientRect();
          const expanded=arena.querySelector('#expanded-skills').getBoundingClientRect();
          return {row:getComputedStyle(item).gridRowStart,column:getComputedStyle(item).gridColumnEnd,below:item.getBoundingClientRect().top>=floor.getBoundingClientRect().bottom,overflow:rect.left<0||rect.right>innerWidth+1,expanded:expanded.bottom<=floor.getBoundingClientRect().top,party:floor.children.length};
        });
        check(`native wrapped combat log is below the party at ${width}px`,layout.row==='6'&&layout.column==='-1'&&layout.below&&!layout.overflow,JSON.stringify(layout));
        check(`expanded native skills and twelve raiders fit at ${width}px`,layout.expanded&&layout.party===12&&!layout.overflow,JSON.stringify(layout));
      }
      await tab.locator('#expanded-skills').evaluate(el=>el.remove());
      await tab.setViewportSize({width:1280,height:900});
      await tab.locator('#raid-skills').click();check('native live raid handler survives the art layer',await tab.evaluate(()=>window.raidClicks)===1);
      await tab.emulateMedia({reducedMotion:'no-preference'});await tab.waitForTimeout(150);
      check('real extension pixels animate and remain CORS-clean',await tab.locator('canvas').evaluate(async c=>{const before=c.toDataURL();await new Promise(r=>setTimeout(r,180));return before!==c.toDataURL();}));
      mkdirSync('output/ashmaw-live',{recursive:true});await tab.locator('.raid-battle-backdrop').screenshot({path:'output/ashmaw-live/unpacked-raid.png'});
    }
    check('extension assets load and none fail', assets > 0 && !errors.some(e => e.startsWith('asset failed')),
      `${assets} loaded; ${errors.filter(e => e.startsWith('asset')).slice(0, 2).join(' | ')}`);
    check('no page errors', !errors.some(e => !e.startsWith('asset')), errors.slice(0, 3).join(' | '));
    const warnings = logs.filter(l => /^(warning|error): \[IW|^(warning|error): \[(ItemDatabase|AtlasService)/.test(l));
    check('no skin warnings or errors in the console', warnings.length === 0, warnings.slice(0, 3).join(' | '));
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

await run(true);
await run(false);
console.log(failures ? `\nFAIL extension e2e (${failures})` : '\nPASS extension e2e');
process.exit(failures ? 1 : 0);
