import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
assert.ok(existsSync(new URL('../src/options/options.html', import.meta.url)),
  'the extension must provide a theme dropdown in its settings');
const html = readFileSync(new URL('../src/options/options.html', import.meta.url), 'utf8');
const { initThemeSettings } = await import('../src/options/options.js');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function fixture(value, { failure = false, delayed = false } = {}) {
  const dom = new JSDOM(html), doc = dom.window.document, listeners = new Set();
  const bag = { 'iw-skin-theme': value, 'iw-skin-enabled': false };
  let release;
  const api = { storage: { local: {
    get: key => delayed ? new Promise(resolve => { release = () => resolve({ [key]: value }); }) : Promise.resolve({ [key]: bag[key] }),
    set: async patch => { if (failure) throw new Error('quota denied'); Object.assign(bag, patch); },
  }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
  const initializing = initThemeSettings(doc, api);
  const select = doc.querySelector('select'), status = doc.querySelector('[role="status"]');
  function change(value, area = 'local') { for (const fn of listeners) fn({ 'iw-skin-theme': { newValue: value } }, area); }
  if (!delayed) await initializing;
  return { dom, doc, bag, select, status, change, initializing, release: () => release(),
    choose: async value => { select.value = value; select.dispatchEvent(new dom.window.Event('change')); await tick(); },
    close: () => dom.window.close() };
}

let f = await fixture(undefined);
try {
  assert.equal(f.select.value, 'legacy', 'existing installs default to Legacy');
  assert.equal(f.doc.querySelector(`label[for="${f.select.id}"]`)?.textContent.trim(), 'Active game theme');
  assert.deepEqual([...f.select.options].filter(o => !o.disabled).map(o => [o.value, o.textContent.trim()]), [['legacy','Legacy'],['fantasy','Fantasy']]);
  assert.ok([...f.doc.scripts].every(s => s.src && s.type === 'module'), 'settings must satisfy MV3 external-script CSP');
  await f.choose('fantasy');
  assert.equal(f.bag['iw-skin-theme'], 'fantasy');
  assert.equal(f.bag['iw-skin-enabled'], false, 'the profile selector must not re-enable the extension');
  assert.match(f.status.textContent, /saved/i);
  f.change('legacy', 'sync'); assert.equal(f.select.value, 'fantasy');
  f.change('legacy'); assert.equal(f.select.value, 'legacy', 'settings follow other windows');
} finally { f.close(); }

f = await fixture('legacy', { failure: true });
try { await f.choose('fantasy'); assert.equal(f.bag['iw-skin-theme'], 'legacy');
  assert.equal(f.select.value, 'legacy', 'failed saves restore the persisted choice');
  assert.match(f.status.textContent, /could not save/i); assert.equal(f.select.disabled, false); } finally { f.close(); }

f = await fixture('broken');
try { assert.equal(f.select.value, '', 'invalid stored themes must not be misrepresented as Legacy');
  await f.choose('fantasy'); assert.equal(f.bag['iw-skin-theme'], 'fantasy'); } finally { f.close(); }

f = await fixture('legacy', { delayed: true });
try { f.change('fantasy'); f.release(); await f.initializing;
  assert.equal(f.select.value, 'fantasy', 'a stale settings read must not replace a newer change'); } finally { f.close(); }
console.log('theme settings: accessible selector, save/failure, external updates, invalid recovery PASS');
