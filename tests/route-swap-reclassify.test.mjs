/**
 * Route-swap reclassification regression.
 *
 * IdleWorlds is a single-page app: swapping the Game / Market / Leaderboards
 * tab replaces the route outlet's subtree, it does not reload the page. Every
 * UIFoundation classifier caches WHICH element plays its role and revalidates
 * cheaply instead of rescanning (see the flush-path caching section of
 * CLAUDE.md), and the guard is `resolutions.every(valid)`.
 *
 * `[].every(...)` is vacuously TRUE. So a classifier whose panel is
 * route-specific — Market only exists on /market, World Bosses only on /game —
 * resolves to an EMPTY array the first time it runs on a route that does not
 * have its panel, and from then on the cached early-return fires forever: it
 * never rescans, so the panel is never tagged when the player navigates to it.
 *
 * Symptom, reported live: land on Game, click Market, and the market rows keep
 * the game's own plates because `data-iw-market` is never applied. The frame
 * still looks right (classifySectionFrames revalidates against DISCONNECTED
 * nodes, so it does re-resolve), which is what makes it read as "the CSS was
 * forgotten" rather than "a classifier stopped running".
 *
 * Negative control: revert either cache guard in UIFoundation.js to the bare
 * `.every(valid)` form and the corresponding check below fails.
 */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../dist/content.bundle.js', import.meta.url), 'utf8');
const settle = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate, { timeout = 5000, step = 40 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await settle(step);
  }
  return predicate();
}

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

/* The game's persistent chrome plus an empty route outlet. Five nav labels so
   resolveMainNav() clears its `byLabel.size < 4` floor. */
const SHELL = `<!doctype html><html><head><title>IdleWorlds</title></head><body>
  <div id="root">
    <header id="top-header"><div><h1>BustedCypher</h1></div></header>
    <nav id="main-nav">
      <a>Game</a><a>Market</a><a>Leaderboards</a><a>Village</a><a>Dungeon</a>
    </nav>
    <main id="route"></main>
  </div>
</body></html>`;

/* Route bodies. Both wrap their content in the game's own `.panel` primitive,
   which is what classifySectionFrames prefers as the frame. */
const GAME_ROUTE = `
  <div class="zone-bar" data-route="game-zone">
    <div><p>Zone 19: Eternium Verge</p></div>
    <div><button>Zones</button><button>Previous Zone</button><button>Next Zone</button></div>
  </div>
  <div class="panel p-3.5" data-route="game">
    <div class="mb-2 flex items-center justify-between"><h2 class="text-sm font-semibold">World Bosses</h2></div>
    <div class="compact-panel"><p>Abyssal Behemoth</p><p>Raid</p><p>Respawns 1h 26m left</p></div>
    <div class="compact-panel"><p>Ancient Treant</p><p>Raid</p><p>Respawns 12m left</p></div>
  </div>`;

const MARKET_ROUTE = `
  <div class="panel p-3.5" data-route="market">
    <div class="mb-2 flex items-center justify-between"><h2 class="text-sm font-semibold">Market</h2></div>
    <p class="mb-2 text-[10px]">Times shown in Australia/Sydney.</p>
    <input class="mb-2 w-full" placeholder="Search by name or effect (e.g. fire resist, item find)...">
    <div class="grid gap-1.5 xl:grid-cols-2">
      <div class="compact-row py-2">
        <div class="flex items-start justify-between gap-2">
          <button class="min-w-0 flex-1 text-left"><p>Salvage Material</p><p>Tier 1 - Processed - x1945134 - 2 offers</p></button>
          <div class="flex shrink-0 flex-col items-end gap-1"><p>5g</p><button class="rounded-lg">History</button></div>
        </div>
      </div>
      <div class="compact-row py-2">
        <div class="flex items-start justify-between gap-2">
          <button class="min-w-0 flex-1 text-left"><p>Cotton Cloth</p><p>Tier 1 - Processed - x46 - 3 offers</p></button>
          <div class="flex shrink-0 flex-col items-end gap-1"><p>7g</p><button class="rounded-lg">History</button></div>
        </div>
      </div>
    </div>
  </div>`;

const dom = new JSDOM(SHELL, { url: 'https://idleworlds.com/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

/* jsdom reports every box as 0x0, which fails classifySectionFrames' width
   gate and its "roomy" fallback alike — nothing would ever be framed. Give the
   whole document one plausible box. Height stays under resolveMainNav's 110px
   shell ceiling so the nav walk still terminates where it does live. */
window.Element.prototype.getBoundingClientRect = function () {
  return { width: 960, height: 64, top: 0, left: 0, right: 960, bottom: 64, x: 0, y: 0 };
};

window.fetch = () => Promise.reject(new Error('network disabled in route-swap test'));
window.matchMedia = () => ({
  matches: false,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
});

const storage = new Map();
window.chrome = {
  runtime: { id: 'route-swap-test', getURL: p => `chrome-extension://route/${p}` },
  storage: {
    local: {
      get: async key => (storage.has(key) ? { [key]: storage.get(key) } : {}),
      set: async bag => { for (const [k, v] of Object.entries(bag)) storage.set(k, v); },
      remove: async key => { storage.delete(key); },
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};

const doc = window.document;
const outlet = doc.getElementById('route');
const navigate = html => { outlet.innerHTML = html; };

const marketRows = () => [...doc.querySelectorAll('.compact-row')];
const taggedMarketRows = () => [...doc.querySelectorAll('[data-iw-market="row"]')];
const bossCards = () => [...doc.querySelectorAll('.compact-panel')];
const taggedBossCards = () => [...doc.querySelectorAll('[data-iw-boss="card"]')];
const zoneBar = () => doc.querySelector('[data-iw-ui="zone-bar"]');
const zoneTitle = () => doc.querySelector('[data-iw-ui="zone-title"]');

/* -- Boot on the Game route ------------------------------------------- */
navigate(GAME_ROUTE);
new window.Function('window', 'document', 'chrome', bundle)(window, doc, window.chrome);

await waitFor(() => bossCards().length > 0 && taggedBossCards().length === bossCards().length);
check('baseline: boss cards tagged on the boot route',
  bossCards().length === 2 && taggedBossCards().length === 2,
  `${taggedBossCards().length}/${bossCards().length} tagged`);
check('baseline: nothing market-tagged on a route with no Market',
  doc.querySelectorAll('[data-iw-market]').length === 0);
check('baseline: zone bar classified on the boot route',
  !!zoneBar() && !!zoneTitle());

/* -- Game -> Market ---------------------------------------------------- */
navigate(MARKET_ROUTE);

await waitFor(() => marketRows().length > 0 && taggedMarketRows().length === marketRows().length);
check('Market panel is framed after navigating to it',
  !!doc.querySelector('[data-route="market"][data-iw-ui="section-frame"]'));
check('Market rows are tagged after navigating from Game',
  marketRows().length === 2 && taggedMarketRows().length === 2,
  `${taggedMarketRows().length}/${marketRows().length} rows carry data-iw-market="row"`);
check('the row name button opts out of the shared control plate',
  doc.querySelectorAll('[data-iw-market="namebtn"]').length === 2,
  `${doc.querySelectorAll('[data-iw-market="namebtn"]').length}/2 name buttons tagged`);

/* -- Market -> Game (fresh boss nodes) --------------------------------- */
navigate(GAME_ROUTE);

await waitFor(() => bossCards().length > 0 && taggedBossCards().length === bossCards().length);
check('boss cards are re-tagged after navigating back to Game',
  bossCards().length === 2 && taggedBossCards().length === 2,
  `${taggedBossCards().length}/${bossCards().length} tagged`);
check('the departed Market resolution does not linger on the Game route',
  doc.querySelectorAll('[data-iw-market]').length === 0,
  `${doc.querySelectorAll('[data-iw-market]').length} stale market marks`);

// The zone bar is Game-only too, and HeaderRenderer.applyZoneSurface reads the
// zone number off `data-iw-ui="zone-title"` to pick the per-zone header art --
// so the same freeze silently stranded the header background as well.
await waitFor(() => !!zoneBar() && !!zoneTitle());
check('zone bar is re-classified after navigating back to Game',
  !!zoneBar() && !!zoneTitle(),
  `zone-bar=${!!zoneBar()} zone-title=${!!zoneTitle()}`);
check('zone action buttons are re-tagged after navigating back to Game',
  doc.querySelectorAll('[data-iw-zone-action]').length === 3,
  `${doc.querySelectorAll('[data-iw-zone-action]').length}/3 zone actions tagged`);

/* -- Game -> Market a second time (cache must not re-freeze) ------------ */
navigate(MARKET_ROUTE);

await waitFor(() => marketRows().length > 0 && taggedMarketRows().length === marketRows().length);
check('Market rows are tagged on a SECOND visit',
  marketRows().length === 2 && taggedMarketRows().length === 2,
  `${taggedMarketRows().length}/${marketRows().length} rows carry data-iw-market="row"`);

console.log(failures ? `\nFAIL — ${failures} check(s)` : '\nPASS route-swap reclassification');
process.exit(failures ? 1 : 0);
