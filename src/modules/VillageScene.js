/** Read-only village mirror. All scene nodes belong to the extension. */
import { assetUrl, isRuntimeActive } from './Runtime.js';
import { pickRendered, getLayoutEpoch } from './Viewport.js';
import { VILLAGE_BUILDINGS, VILLAGE_HOUSES } from './villageBuildings.js';

const buildings = Object.values(VILLAGE_BUILDINGS);
const houses = Object.values(VILLAGE_HOUSES);
// The Village route's own DOM is the fast path (an install or a housing
// upgrade shows up on the very next flush), so the poll is only a safety net
// for a change made in another tab. RETRY_MS keeps a transient failure from
// stranding the frame on its error copy for the whole refresh window.
const REFRESH_MS = 300_000;
const RETRY_MS = 30_000;
// Floor between route-change refreshes, so tab-drumming cannot spam the server.
const ROUTE_REFRESH_MS = 10_000;
let frame = null;
let anchor = null;
let anchorEpoch = -1;
let snapshot = null;
let signature = '';
let nextRead = 0;
let request = null;
let generation = 0;
let context = '';
let league = '';
let message = 'Loading your village…';

/**
 * The game serves two leagues off one origin, split by a `/ssf` path prefix,
 * and it selects between them with an `x-idleworlds-league` request header.
 * The page installs that header by monkey-patching `globalThis.fetch`; a
 * content script runs in an ISOLATED world and never sees that patch, so a
 * read from here has to stamp the header itself or an SSF player is served
 * their STANDARD village — right shape, wrong character, no error anywhere.
 */
function leagueOf(path) {
  return /^\/ssf(?:\/|$)/.test(path) ? 'ssf' : 'standard';
}

/**
 * `section` is not free-form: the app passes the route's own name and an
 * unknown value is a guess at someone else's contract. The scene only mounts
 * beside Skill Actions, which is the dashboard, but deriving it keeps the read
 * honest if that panel ever appears on another route.
 */
const SECTIONS = { '': 'dashboard', housing: 'housing', market: 'market',
  leaderboards: 'leaderboards', dungeon: 'dungeon' };
function sectionOf(path) {
  const rest = path.replace(/^\/ssf(?=\/|$)/, '').replace(/^\/+|\/+$/g, '');
  return SECTIONS[rest] || 'dashboard';
}

export function normaliseVillage(data) {
  const player = data?.player;
  const tier = player?.housing?.tier;
  const addons = player?.villageAddons;
  if (!Number.isInteger(tier) || tier < 0 || tier > 5 || !addons
      || !Number.isInteger(addons.totalSlots) || addons.totalSlots < 0 || addons.totalSlots > 5
      || !Array.isArray(addons.installed)) return null;
  const slots = Array.from({ length: 5 }, (_, i) => ({ slot: i + 1,
    state: i < addons.totalSlots ? 'empty' : 'locked', name: '', file: null }));
  for (const row of addons.installed) {
    if (!Number.isInteger(row.slot) || row.slot < 1 || row.slot > addons.totalSlots) return null;
    // itemKey first (the API always carries it); the NAME is the only join the
    // rendered Village route offers, and VILLAGE_BUILDINGS is keyed normalised,
    // so normalise the same way VillagePanels.resolveBuilding does.
    const entry = buildings.find(b => row.itemKey === `construction_building_tier_${b.tier}`)
      || VILLAGE_BUILDINGS[String(row.name || '').replace(/\s+/g, ' ').trim().toLowerCase()];
    if (!entry && !row.name) return null;
    if (slots[row.slot - 1].state === 'installed') return null;
    slots[row.slot - 1] = { slot: row.slot, state: 'installed',
      name: row.name || entry.name, file: entry?.file || null };
  }
  return { tier, capacity: addons.totalSlots, slots };
}

/**
 * Every node in the scene is the extension's own, marked in the scene's OWN
 * namespace. It deliberately is NOT `data-iw-village-owned`: that belongs to
 * VillagePanels, whose teardown sweeps `[data-iw-village-owned]` across the
 * whole body, so sharing the marker let the wrong module delete this frame —
 * teardown then "passed" no matter what `clearVillageScene()` did, which is
 * the same shared-attribute trap CLAUDE.md records for the boss cards.
 */
function own(tag, cls, text) {
  const el = document.createElement(tag);
  el.className = cls;
  el.dataset.iwVillageSceneOwned = '1';
  if (text) el.textContent = text;
  return el;
}

function art(file, fallback) {
  if (!file) return own('span', 'iw-vs-placeholder', fallback);
  const img = own('img', 'iw-vs-sprite');
  img.src = assetUrl(`assets/${file}`);
  img.alt = '';
  img.decoding = 'async';
  return img;
}

function findAnchor() {
  if (anchor?.isConnected && anchorEpoch === getLayoutEpoch()
      && /^(skill actions|actions)$/i.test(anchor.querySelector('h2')?.textContent.trim() || '')) return anchor;
  const headings = [...document.querySelectorAll('h2')].filter(h =>
    !h.closest('[data-iw-village-scene], [role="dialog"], [data-iw-overlay]')
    && /^(skill actions|actions)$/i.test(h.textContent.trim()));
  anchor = pickRendered(headings.map(h => h.closest('.panel') || h.closest('.fs-skills-section-frame')).filter(Boolean));
  anchorEpoch = getLayoutEpoch();
  return anchor;
}

/** Use the native Village route whenever it is available: installations and
 * housing upgrades then appear immediately on returning to Game. */
function readRenderedVillage() {
  const house = pickRendered([...document.querySelectorAll('[data-iw-village="housing"]')]);
  const addons = pickRendered([...document.querySelectorAll('[data-iw-village="addons"]')]);
  if (!house || !addons) return null;
  const tier = Number(house.textContent.match(/Current tier:\s*(\d+)/i)?.[1]);
  const capacity = Number(addons.querySelector('[data-iw-village-role="intro"]')?.textContent.match(/(\d+)\s+slots? available/i)?.[1]);
  if (!Number.isInteger(capacity)) return null;
  const cards = [...addons.querySelectorAll('[data-iw-village="slot"]')];
  if (cards.length !== capacity) return null; // React may be mid-update.
  const installed = cards.filter(c => c.dataset.iwVillageState === 'installed').map(c => ({
    slot: Number(c.querySelector('[data-iw-village-role="index"]')?.textContent.match(/\d+/)?.[0]),
    name: c.querySelector('[data-iw-village-role="name"]')?.textContent.trim(),
  }));
  return normaliseVillage({ player: { housing: { tier }, villageAddons: { totalSlots: capacity, installed } } });
}

function render(status = message) {
  message = status;
  if (!frame) return;
  const key = JSON.stringify([snapshot, status]);
  if (signature === key) return;
  signature = key;
  // Remove only what THIS module put here, not everything: the frame is shared
  // chrome now — CollapsibleFrames appends its per-panel toggle to it — and a
  // `replaceChildren()` deleted that control on every village change, leaving
  // the scene as the one panel on the page that could not be folded.
  for (const child of [...frame.children]) {
    if (child.dataset.iwVillageSceneOwned === '1') child.remove();
  }
  const head = own('div', 'iw-vs-heading');
  const title = own('div', 'iw-vs-title', 'Village');
  title.setAttribute('role', 'heading');
  title.setAttribute('aria-level', '2');
  head.append(title);
  frame.append(head);
  if (snapshot) {
    const installed = snapshot.slots.filter(s => s.state === 'installed').length;
    head.append(own('span', 'iw-vs-count', `${installed} installed / ${snapshot.capacity} slots`));
    const scene = own('div', 'iw-vs-scene');
    const house = houses.find(h => h.tier === snapshot.tier);
    const home = own('div', 'iw-vs-house');
    home.append(art(house?.file, '⌂'), own('strong', '', house?.name || 'No House'),
      own('span', 'iw-vs-status', `Housing tier ${snapshot.tier}`));
    scene.append(home);
    for (const slot of snapshot.slots) {
      const plot = own('div', 'iw-vs-plot');
      plot.dataset.slot = String(slot.slot);
      plot.dataset.plotState = slot.state;
      plot.append(art(slot.file, slot.state === 'locked' ? '◇' : '⌂'),
        own('strong', 'iw-vs-name', slot.name || (slot.state === 'locked' ? 'Locked plot' : 'Empty plot')),
        own('span', 'iw-vs-status', `Slot ${slot.slot} · ${slot.state === 'locked' ? 'Upgrade housing' : slot.state === 'installed' ? 'Installed' : 'Available'}`));
      scene.append(plot);
    }
    frame.append(scene);
  }
  frame.append(own('p', 'iw-vs-note', status || 'Your installed village. Manage housing and buildings in the Village tab.'));
}

export async function reconcileVillageScene() {
  if (!isRuntimeActive()) return;
  const route = `${location.pathname}${location.search}`;
  if (context !== route) {
    // A LEAGUE swap is a different character, so its village is not ours to
    // show; a TAB swap is the same character and the snapshot must SURVIVE it.
    // Dropping it here was the bug that made the frame useless: the Village
    // route is the only place the village is in the DOM, so the read taken
    // there was thrown away at the exact moment the dashboard needed it, and
    // an unavailable API left the frame stuck on "Loading your village…".
    // Same family as the zone label HeaderRenderer has to remember.
    const current = leagueOf(location.pathname);
    if (current !== league) {
      snapshot = null;
      message = 'Loading your village…';
      signature = '';
    }
    league = current;
    // In-flight reads belong to the old route: let them land nowhere.
    generation += 1;
    request?.abort();
    request = null;
    nextRead = Math.min(nextRead, Date.now() + ROUTE_REFRESH_MS);
    context = route;
  }
  const rendered = readRenderedVillage();
  if (rendered) { snapshot = rendered; message = ''; }
  const target = findAnchor();
  if (!target) {
    frame?.remove();
    frame = null;
    signature = '';
    request?.abort();
    request = null;
    return;
  }
  if (!frame?.isConnected || frame.previousElementSibling !== target) {
    frame?.remove();
    frame = own('section', 'iw-village-scene');
    frame.dataset.iwVillageScene = '1';
    frame.dataset.iwUi = 'section-frame';
    frame.dataset.iwPanel = 'village-scene';
    frame.setAttribute('aria-label', 'Village');
    target.after(frame);
    signature = '';
  }
  render();
  if (request || Date.now() < nextRead || document.visibilityState === 'hidden') return;
  const token = generation;
  const controller = new AbortController();
  request = controller;
  nextRead = Date.now() + REFRESH_MS;
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `/api/player?section=${encodeURIComponent(sectionOf(location.pathname))}&scope=core`, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'x-idleworlds-league': league || leagueOf(location.pathname) },
      });
    if (!response.ok) throw new Error('Village unavailable');
    const result = normaliseVillage(await response.json());
    if (!result) throw new Error('Village unavailable');
    if (controller.signal.aborted || token !== generation || !isRuntimeActive()) return;
    snapshot = result;
    render('');
  } catch {
    if (token !== generation || !isRuntimeActive()) return;
    nextRead = Date.now() + RETRY_MS;
    render(snapshot ? 'Showing the last loaded village. Refresh unavailable; retrying shortly.'
      : 'Village could not be loaded. Open the Village tab to view your buildings.');
  } finally {
    clearTimeout(timeout);
    if (request === controller) request = null;
  }
}

export function clearVillageScene() {
  generation++;
  request?.abort();
  request = null;
  frame?.remove();
  frame = anchor = snapshot = null;
  signature = context = league = '';
  message = 'Loading your village…';
  nextRead = 0;
  anchorEpoch = -1;
}
