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
    <header id="top-header"><div><h1>BustedCypher</h1>
      <p>Combat Lv 62</p><p>Players online: 145</p><p>ATK 120 DEF 90 HP 500</p>
    </div><div><button>1</button></div></header>
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
  </div>
  <div class="panel p-3.5" data-route="market-history">
    <h2 class="text-sm font-semibold">📈 Your Recent Trades</h2>
    <div class="py-2"><p>Sold Cotton Cloth x46</p><p>+322g</p></div>
  </div>`;

/* Village ships three separate panels, each with its own heading, rather than
   one "Village" panel -- and two of the three lead with an emoji ("🏗️ Village
   Add-ons", "🏦 Housing Bank") the way the zone bar's labels do. */
const VILLAGE_ROUTE = `
  <div class="panel p-3.5" data-route="village-housing">
    <h2 class="text-sm font-semibold">Village</h2>
    <div class="compact-panel p-3">
      <p class="text-sm font-semibold">🏠 Manor</p>
      <p class="mt-1 text-xs">Current tier: 4 • Base actions take 6s</p>
      <button class="button-primary">Upgrade Housing</button>
    </div>
  </div>
  <div class="panel p-3.5" data-route="village-addons">
    <h2 class="text-sm font-semibold">🏗️ Village Add-ons</h2>
    <p>4 slots available (1 per housing tier). Only one of each building type per village.</p>
    <div class="space-y-2">
      <div class="compact-panel p-2.5"><div class="flex items-center justify-between gap-2">
        <div class="min-w-0"><p>Slot 1</p><p>Voidiron Archive</p><p>+4 ATK • +2 smithing level</p></div>
        <div class="flex shrink-0 flex-col gap-1"><button>Destroy</button><button>Uninstall (100k)</button></div>
      </div></div>
      <div class="compact-panel p-2.5"><div class="flex items-center justify-between gap-2">
        <div class="min-w-0"><p>Slot 2</p><p>Empty slot</p></div>
        <button class="button-primary">Install</button>
      </div></div>
    </div>
  </div>
  <div class="panel p-3.5" data-route="housing-bank">
    <h2 class="text-sm font-semibold">🏦 Housing Bank</h2>
    <p>Safe storage for your items. Stored items cannot be accidentally salvaged.</p>
    <div class="compact-panel"><p>Astral Lens</p><button>Deposit</button></div>
  </div>
  <div class="panel p-3.5" data-route="village-npcs">
    <h2 class="text-sm font-semibold">Village NPCs</h2>
    <div class="compact-panel"><p>Grimsby the Fence</p></div>
  </div>`;

/* Sub-panels on the routes below Game. NONE of these headings is in
   SECTION_FRAME_NAMES, and that is the point: the frame is triggered by the
   game's own `.panel` primitive, so a route the skin has never been told about
   is covered anyway. Two shapes that used to be impossible are included --
   a panel with a leading icon in its heading, and one with NO heading at all.

   `data-route="leaderboards"` also carries a nested `.panel`: the outer one
   must come out as a stripped layout column and the inner one as the framed
   leaf (ui-system.css's `:not(:has(...))` rule), which is the split the old
   heading walk needed a size heuristic to guess at. */
const LEADERBOARDS_ROUTE = `
  <div class="panel" data-route="leaderboards-column">
    <div class="panel p-3.5" data-route="leaderboards">
      <h2 class="text-sm font-semibold">Leaderboards</h2>
      <div class="compact-row"><p>1. BustedCypher</p><p>Combat 62</p></div>
    </div>
    <div class="panel p-3.5" data-route="top-gatherers">
      <h2 class="text-sm font-semibold">🌾 Top Gatherers This Week</h2>
      <div class="compact-row"><p>1. Thornwake</p><p>1,284,500</p></div>
    </div>
  </div>`;

const DUNGEON_ROUTE = `
  <div class="panel p-3.5" data-route="raid-dungeon">
    <h2 class="text-sm font-semibold">⚔️ Raid Dungeon</h2>
    <p>Party of 5. Leave Dungeon to abandon the run.</p>
    <div class="compact-panel"><p>⏳ Prejoined</p></div>
  </div>
  <div class="panel p-3.5" data-route="dungeon-loot">
    <div class="compact-row"><p>Voidglass Gloves</p><p>Tier 8</p></div>
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

/* -- Market -> Village --------------------------------------------------- */
navigate(VILLAGE_ROUTE);

const villagePanels = () => ['village-housing', 'village-addons', 'housing-bank', 'village-npcs']
  .map(route => doc.querySelector(`[data-route="${route}"]`));

await waitFor(() => villagePanels().every(p => p?.dataset.iwUi === 'section-frame'));
check('Village, Village Add-ons, Housing Bank and Village NPCs are each framed as their own section',
  villagePanels().every(p => p?.dataset.iwUi === 'section-frame'),
  villagePanels().map(p => `${p?.dataset.route}=${p?.dataset.iwUi}`).join(' '));
check('their headings (including the leading-icon ones) are tagged section-title',
  villagePanels().every(p => p?.querySelector('h2')?.dataset.iwUi === 'section-title'));

/* -- Village: the illustrated slot + housing panels ----------------------- */
/* Same vacuous-`[].every()` shape as Market above. classifyVillagePanels
   resolves to an EMPTY array on Game/Market/Leaderboards, so the bare validity
   guard would freeze it for the session and no amount of navigating to Village
   would ever paint a building. Negative control: drop the
   `headings.every(h => villageSeen.has(h))` coverage clause in UIFoundation and
   the SECOND-visit check below fails while the first still passes. */
const slotCards = () => [...(doc.querySelector('[data-route="village-addons"]')?.querySelectorAll('.compact-panel') || [])];
// The sprite rides on --iw-village-sprite (a ::before paints it over the
// medallion's own ground); see VillagePanels.ensureArt.
const slotArt = i => slotCards()[i]?.querySelector('.iw-village-art');
const sprite = el => el?.style.getPropertyValue('--iw-village-sprite') || '';
const houseCard = () => doc.querySelector('[data-route="village-housing"] .compact-panel');

await waitFor(() => slotCards()[0]?.dataset.iwVillageState === 'installed');
check('Village Add-on slots are classified by occupancy',
  slotCards()[0]?.dataset.iwVillageState === 'installed' &&
  slotCards()[1]?.dataset.iwVillageState === 'vacant',
  slotCards().map(c => c.dataset.iwVillageState).join(' '));
check('the installed slot paints its own hand-painted building',
  /building_11\.webp/.test(sprite(slotArt(0))),
  sprite(slotArt(0)) || '(none)');
check('the empty slot paints no building sprite',
  slotArt(1) !== null && !sprite(slotArt(1)),
  sprite(slotArt(1)) || '(none)');
check('the housing hero resolves its tier from "Current tier: N"',
  houseCard()?.dataset.iwVillageTier === '4' &&
  /house_4\.webp/.test(sprite(houseCard()?.querySelector('.iw-village-art'))),
  `tier=${houseCard()?.dataset.iwVillageTier}`);

/* Leave the route and come back: this is the visit the frozen empty resolution
   used to lose. */
navigate(GAME_ROUTE);
await waitFor(() => !doc.querySelector('[data-route="village-addons"]'));
navigate(VILLAGE_ROUTE);
await waitFor(() => slotCards()[0]?.dataset.iwVillageState === 'installed');
check('Village panels are re-decorated on a SECOND visit',
  slotCards()[0]?.dataset.iwVillageState === 'installed' &&
  /building_11\.webp/.test(sprite(slotArt(0))) &&
  houseCard()?.dataset.iwVillageTier === '4',
  `state=${slotCards()[0]?.dataset.iwVillageState} tier=${houseCard()?.dataset.iwVillageTier}`);

/* -- Panels the skin was never told the name of ------------------------- */
/* Every check below uses a heading absent from SECTION_FRAME_NAMES. Negative
   control: put the name list back in charge of the trigger (revert
   sectionFramePanels() to the old sectionFrameHeadings()) and all of these
   fail, because that is exactly the state the Village report came from. */
const framed = route => doc.querySelector(`[data-route="${route}"]`)?.dataset.iwUi === 'section-frame';

navigate(MARKET_ROUTE);
await waitFor(() => framed('market-history'));
check('Market: a sub-panel below the named top-level card is framed',
  framed('market') && framed('market-history'),
  `market=${framed('market')} history=${framed('market-history')}`);

navigate(LEADERBOARDS_ROUTE);
await waitFor(() => framed('top-gatherers'));
check('Leaderboards: an unnamed sibling panel is framed',
  framed('leaderboards') && framed('top-gatherers'),
  `leaderboards=${framed('leaderboards')} top-gatherers=${framed('top-gatherers')}`);
// The outer .panel wraps two others, so ui-system.css strips it as a layout
// column. It is still MARKED -- the CSS, not the classifier, tells them apart
// -- so assert the marking, which is what the nesting rule keys on.
check('the wrapping column is marked too, for the leaf-vs-column CSS rule to strip',
  framed('leaderboards-column'));

navigate(DUNGEON_ROUTE);
await waitFor(() => framed('raid-dungeon'));
check('Dungeon: the route the skin reached nothing inside is framed',
  framed('raid-dungeon'), `raid-dungeon=${framed('raid-dungeon')}`);
check('a panel with NO heading is framed too (frame does not require a title)',
  framed('dungeon-loot'), `dungeon-loot=${framed('dungeon-loot')}`);
check('a panel with no heading gets no section-title',
  doc.querySelector('[data-route="dungeon-loot"] [data-iw-ui="section-title"]') === null);

/* -- A modal card stays OverlayFramer's ---------------------------------- */
/* OverlayFramer draws on the border box only because these cards are their own
   scroll container; the section-frame rule's ::before/::after would scroll away
   with the content. Both treatments on one card is the bug. */
navigate(`${DUNGEON_ROUTE}
  <div class="fixed inset-0 z-50" style="position:fixed;background:rgba(0,0,0,.6)">
    <div class="panel p-3.5" data-route="dungeon-modal">
      <h2>Leave Dungeon</h2><p>Abandon the run? Progress in this dungeon is lost.</p>
    </div>
  </div>`);
await waitFor(() => doc.querySelector('[data-route="dungeon-modal"]')?.dataset.iwOverlay === 'panel');
// Asserted as "the section classifier keeps its hands off", not as "OverlayFramer
// tagged it": jsdom lays nothing out, so OverlayFramer's own viewport-covering
// backdrop test cannot fire here -- tests/overlay-framer.test.mjs pins that half
// in a real browser. This half is the one that regressed: with the exclusion
// keyed only on OverlayFramer's tag, the card came back section-framed.
check('a modal card is left to OverlayFramer, never section-framed as well',
  !framed('dungeon-modal'),
  `section=${framed('dungeon-modal')}`);

/* -- The zone survives leaving the Game route ---------------------------- */
/* The "Zone N:" label lives in the zone bar, which only the Game route mounts.
   Reading it fresh every flush meant every OTHER tab resolved zone=null: the
   header dropped its per-zone artwork back to the generic strip and <html> lost
   data-iw-zone-theme, so Market/Village/Leaderboards/Dungeon rendered un-themed
   while Game looked right. Reported live: "removed the header graphics and
   didn't actually theme the other pages".
   Negative control: drop the lastZoneNumber cache in HeaderRenderer and both
   checks below fail. */
const html = doc.documentElement;
const headerRoot = () => doc.querySelector('[data-iw-header="root"]');
const zoneSurface = () => headerRoot()?.style.getPropertyValue('--iw-header-surface') || '';

navigate(GAME_ROUTE);
await waitFor(() => html.dataset.iwZoneTheme && html.dataset.iwZoneTheme !== 'default');
const gameTheme = html.dataset.iwZoneTheme;
const gameSurface = zoneSurface();
check('baseline: the Game route resolves zone 19 to its palette and artwork',
  gameTheme === 'voidborn' && /zone_19\.webp/.test(gameSurface),
  `theme=${gameTheme} surface=${gameSurface}`);

for (const [label, route] of [['Market', MARKET_ROUTE], ['Village', VILLAGE_ROUTE],
                              ['Leaderboards', LEADERBOARDS_ROUTE], ['Dungeon', DUNGEON_ROUTE]]) {
  navigate(route);
  await settle(120);
  check(`${label}: keeps the zone palette after the zone bar unmounts`,
    html.dataset.iwZoneTheme === gameTheme,
    `theme=${html.dataset.iwZoneTheme} (expected ${gameTheme})`);
  check(`${label}: keeps the per-zone header artwork`,
    zoneSurface() === gameSurface,
    `surface=${zoneSurface()}`);
}

console.log(failures ? `\nFAIL — ${failures} check(s)` : '\nPASS route-swap reclassification');
process.exit(failures ? 1 : 0);
