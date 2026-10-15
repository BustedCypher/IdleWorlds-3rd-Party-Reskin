import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
assert.ok(existsSync(new URL('../src/shared/SkinController.js', import.meta.url)),
  'the extension needs an exclusive skin controller before it can select Fantasy');
const { createSkinController } = await import('../src/shared/SkinController.js');
const { readSettings, watchSettings, resolveTheme } = await import('../src/shared/ExtensionSettings.js');

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const events = [];
const live = new Set();
const skin = name => ({ start() { assert.equal(live.size, 0, 'stop the previous skin before starting another'); live.add(name); events.push(`start:${name}`); },
  stop() { live.delete(name); events.push(`stop:${name}`); } });
const ready = deferred();
const controller = createSkinController({ skins: { legacy: skin('legacy'), fantasy: skin('fantasy') }, waitUntilReady: () => ready.promise });
const pendingLegacy = controller.update({ enabled: true, theme: 'legacy' });
const pendingFantasy = controller.update({ enabled: true, theme: 'fantasy' });
ready.resolve();
await Promise.all([pendingLegacy, pendingFantasy]);
assert.deepEqual(events, ['start:fantasy'], 'a late hydration must not resurrect the old Legacy selection');
await controller.update({ enabled: true, theme: 'fantasy' });
assert.deepEqual(events, ['start:fantasy'], 'same selection must not restart a skin');
await controller.update({ enabled: true, theme: 'legacy' });
assert.deepEqual(events, ['start:fantasy','stop:fantasy','start:legacy']);
await controller.update({ enabled: false, theme: 'legacy' });
await controller.update({ enabled: false, theme: 'fantasy' });
assert.equal(live.size, 0, 'changing the selected theme while disabled must keep both skins stopped');
await controller.update({ enabled: true, theme: 'fantasy' });
assert.deepEqual([...live], ['fantasy']);
await controller.update({ enabled: true, theme: null });
assert.equal(live.size, 0, 'unsupported theme fails closed');
await controller.update({ enabled: true, theme: '__proto__' });
assert.equal(live.size, 0, 'inherited object properties are not registered skins');
await controller.update({ enabled: true, theme: 'legacy' });
await controller.stop();
assert.equal(live.size, 0);

const wait = deferred();
const stopped = createSkinController({ skins: { legacy: skin('legacy') }, waitUntilReady: () => wait.promise });
const loading = stopped.update({ enabled: true, theme: 'legacy' });
await stopped.stop();
wait.resolve();
await loading;
assert.equal(live.size, 0, 'disable cancels an activation waiting for hydration');

assert.equal(resolveTheme(undefined), 'legacy');
assert.equal(resolveTheme(null), 'legacy');
assert.equal(resolveTheme('fantasy'), 'fantasy');
for (const invalid of ['', false, {}, 'Fantasy', '__proto__']) assert.equal(resolveTheme(invalid), null);

const listeners = new Set();
globalThis.chrome = { storage: { local: { get: async key => ({ [key]: key === 'iw-skin-theme' ? 'fantasy' : false }) },
  onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
assert.deepEqual(await readSettings(), { enabled: false, theme: 'fantasy' });
const patches = [];
const unsubscribe = watchSettings(patch => patches.push(patch));
for (const fn of listeners) fn({ 'iw-skin-theme': { newValue: 'legacy' } }, 'sync');
assert.equal(patches.length, 0, 'only the extension local settings area selects a profile');
for (const fn of listeners) fn({ 'iw-skin-theme': { newValue: 'legacy' }, 'iw-skin-enabled': { newValue: true } }, 'local');
assert.deepEqual(patches, [{ theme: 'legacy', enabled: true }]);
unsubscribe();
assert.equal(listeners.size, 0);
delete globalThis.chrome;
console.log('skin controller: exclusive transitions, races, disabled selection, validation PASS');
