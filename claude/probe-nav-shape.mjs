import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const ROOT = 'C:/Users/curti/Desktop/idleworlds-fantasy-skin';
const bundle = await readFile(`${ROOT}/dist/content.bundle.js`, 'utf8');
const shapes = {
  wrapped: `<div class="panel"><nav><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button></nav></div>`,
  flat:    `<div class="panel"><button>Game</button><button>Market</button><button>Leaderboards</button><button>Village</button></div>`,
};
const browser = await chromium.launch({ args: ['--headless=new'], ignoreDefaultArgs: ['--headless=old'] });
for (const [name, nav] of Object.entries(shapes)) {
  const PAGE = `<!doctype html><html><body><div id="root">
  <header><div><h1>BustedCypher</h1></div><div><button>1</button></div></header>
  ${nav}
  <div id="zone"><div><p>Zone 19: Eternium Verge</p><p>Next zone target</p></div><div><button>Zones</button><button>Previous Zone</button><button>Next Zone</button></div></div>
  </div><script>${bundle}</` + `script></body></html>`;
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.pathname === '/p.html') return r.fulfill({ contentType: 'text/html', body: PAGE });
    return readFile(ROOT + u.pathname).then(b => r.fulfill({ body: b })).catch(() => r.fulfill({ status: 404, body: '' })); });
  await page.goto('http://iw.test/p.html');
  await page.waitForTimeout(2500);
  // count role flips on the tab container over 1.5s
  const r = await page.evaluate(async () => {
    const tab = [...document.querySelectorAll('button')].find(b => b.textContent === 'Market');
    const host = tab.parentElement;
    let flips = 0;
    const mo = new MutationObserver(recs => { flips += recs.length; });
    mo.observe(host, { attributes: true, attributeFilter: ['data-iw-ui'] });
    // nudge flushes with real mutations
    for (let i = 0; i < 10; i++) { const s = document.createElement('span'); document.body.append(s); await new Promise(res => setTimeout(res, 120)); s.remove(); }
    mo.disconnect();
    const f = tab.closest('.panel');
    return { hostRole: host.dataset.iwUi, panelRole: f.dataset.iwUi, mainNavCount: document.querySelectorAll('[data-iw-ui="main-nav"]').length,
      panelH: +f.getBoundingClientRect().height.toFixed(1), pad: getComputedStyle(f).padding, flipsIn1_2s: flips };
  });
  console.log(name, JSON.stringify(r));
  await page.close();
}
await browser.close();
