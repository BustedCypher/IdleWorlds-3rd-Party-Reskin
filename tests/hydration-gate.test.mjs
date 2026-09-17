/**
 * The hydration gate and the page-world signal it waits for.
 *
 * Two files cooperate across the content-script / page-world boundary with no
 * shared code, only a protocol: src/page/hydration-signal.js (MAIN world,
 * document_start) writes `data-iw-page-hydrated` on <html> once React's root
 * has hydrated, and src/modules/HydrationGate.js (the bundle, document_idle)
 * holds the skin's first boot until it sees that latch, then removes it.
 *
 * This pins both halves and the protocol between them, because a drift in
 * either (a renamed attribute, a manifest entry in the wrong world) degrades
 * silently: the gate simply times out and every page load boots late. That is
 * exactly how the rest of the suite broke when the gate first landed - every
 * fixture lacked the latch, boot waited out the timeout, and four suites
 * failed for reasons that had nothing to do with what they test.
 *
 * Negative controls are built in: no latch -> 'timeout', never an early
 * release; a still-dehydrated root -> no latch; an unrecognised React shape ->
 * 'unknown', never a wait.
 */

import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  waitForPageHydration,
  clearHydrationLatch,
  HYDRATION_ATTR,
  HYDRATION_GATE_ENABLED,
} from '../src/modules/HydrationGate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const settle = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) console.log(`  ok    ${label}`);
  else { failures += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

const fresh = () => new JSDOM('<!doctype html><html><body><div id="__next"></div></body></html>',
  { url: 'https://idleworlds.com/', runScripts: 'outside-only' }).window;

/* ── Gate ──────────────────────────────────────────────────────────────── */
console.log('\nhydration gate');
check('the gate ships enabled', HYDRATION_GATE_ENABLED === true);

{
  const root = fresh().document.documentElement;
  root.setAttribute(HYDRATION_ATTR, '1');
  const r = await waitForPageHydration({ root, timeoutMs: 1000, pollMs: 10 });
  check('an already-hydrated page releases at once', r.state === '1' && r.waitedMs < 50, JSON.stringify(r));
  check('the release removes the latch from <html>', !root.hasAttribute(HYDRATION_ATTR));
}
{
  const root = fresh().document.documentElement;
  setTimeout(() => root.setAttribute(HYDRATION_ATTR, '1'), 80);
  const r = await waitForPageHydration({ root, timeoutMs: 2000, pollMs: 10 });
  check('a late latch releases when it appears, not at the timeout',
    r.state === '1' && r.waitedMs >= 60 && r.waitedMs < 1000, JSON.stringify(r));
}
{
  const root = fresh().document.documentElement;
  const r = await waitForPageHydration({ root, timeoutMs: 150, pollMs: 10 });
  check('negative control: no latch waits out the timeout', r.state === 'timeout' && r.waitedMs >= 140, JSON.stringify(r));
}
{
  const root = fresh().document.documentElement;
  root.setAttribute(HYDRATION_ATTR, 'unknown');
  const r = await waitForPageHydration({ root, timeoutMs: 1000, pollMs: 10 });
  check('"unknown" (unreadable React) releases at once', r.state === 'unknown' && r.waitedMs < 50, JSON.stringify(r));
  check('...and is removed too', !root.hasAttribute(HYDRATION_ATTR));
}
{
  const root = fresh().document.documentElement;
  const r = await waitForPageHydration({ root, enabled: false, timeoutMs: 1000 });
  check('a disabled gate never waits', r.state === 'disabled' && r.waitedMs === 0, JSON.stringify(r));
}
{
  const root = fresh().document.documentElement;
  root.setAttribute(HYDRATION_ATTR, '1');
  clearHydrationLatch(root);
  check('teardown clears a latch the gate never consumed (rule 3)', !root.hasAttribute(HYDRATION_ATTR));
}

/* ── Page-world signal ─────────────────────────────────────────────────── */
console.log('\npage-world hydration signal');
const signalSrc = await readFile(resolve(ROOT, 'src/page/hydration-signal.js'), 'utf8');
check('the signal writes the attribute the gate reads',
  signalSrc.includes(`'${HYDRATION_ATTR}'`), `expected '${HYDRATION_ATTR}' in hydration-signal.js`);

async function runSignal(setup, waitMs = 160) {
  const window = fresh();
  setup(window);
  window.eval(signalSrc);
  await settle(waitMs);
  return window;
}

{
  let hostRoot = { memoizedState: { isDehydrated: true } };
  const w = await runSignal(win => {
    win.document['__reactContainer$test'] = { stateNode: { get current() { return hostRoot; } } };
  });
  const html = w.document.documentElement;
  check('negative control: a root still hydrating writes no latch', !html.hasAttribute(HYDRATION_ATTR));
  hostRoot = { memoizedState: { isDehydrated: false } };
  await settle(160);
  check('the latch appears once the root reports hydrated', html.getAttribute(HYDRATION_ATTR) === '1',
    String(html.getAttribute(HYDRATION_ATTR)));
  w.close();
}
{
  const w = await runSignal(win => {
    win.document.getElementById('__next')['__reactContainer$test'] = { stateNode: { current: { memoizedState: { isDehydrated: false } } } };
  });
  check('a #__next mount (pages router shape) is found too',
    w.document.documentElement.getAttribute(HYDRATION_ATTR) === '1');
  w.close();
}
{
  const w = await runSignal(win => {
    win.document['__reactContainer$test'] = { stateNode: { current: { memoizedState: { element: null } } } };
  });
  check('an unrecognised React shape signals "unknown" instead of stalling boot',
    w.document.documentElement.getAttribute(HYDRATION_ATTR) === 'unknown');
  w.close();
}
{
  const w = await runSignal(() => {});
  check('negative control: no React root at all writes nothing (the gate times out)',
    !w.document.documentElement.hasAttribute(HYDRATION_ATTR));
  w.close();
}

/* ── Manifest wiring ───────────────────────────────────────────────────── */
console.log('\nmanifest wiring');
const manifest = JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts || [];
const signalEntry = scripts.find(s => (s.js || []).includes('src/page/hydration-signal.js'));
const bundleEntry = scripts.find(s => (s.js || []).includes('dist/content.bundle.js'));
check('the signal runs in the PAGE world (only it can see React internals)', signalEntry?.world === 'MAIN');
check('the signal runs at document_start, before the bundle', signalEntry?.run_at === 'document_start');
check('the bundle stays in the isolated world at document_idle',
  bundleEntry && !bundleEntry.world && bundleEntry.run_at === 'document_idle');
check('both entries match the same hosts',
  JSON.stringify(signalEntry?.matches) === JSON.stringify(bundleEntry?.matches));

console.log(failures ? `\nFAIL hydration-gate (${failures})` : '\nPASS hydration-gate');
process.exit(failures ? 1 : 0);
