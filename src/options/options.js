import { THEME_KEY, resolveTheme } from '../shared/ExtensionSettings.js';

export async function initThemeSettings(doc = document, extension = chrome) {
  const select = doc.querySelector('#skin-theme');
  const status = doc.querySelector('#save-status');
  let persisted = null;
  let revision = 0;
  let saving = false;
  function render(value) {
    persisted = resolveTheme(value);
    select.value = persisted ?? '';
    select.disabled = saving;
  }

  // A different popup/options page can change the selection during the read.
  extension.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, THEME_KEY)) return;
    revision++;
    render(changes[THEME_KEY].newValue);
    status.textContent = persisted ? 'Theme updated.' : 'Choose Legacy or Fantasy to restore a valid selection.';
  });

  select.addEventListener('change', async () => {
    const next = select.value;
    if (saving || (next !== 'legacy' && next !== 'fantasy')) return;
    const before = revision;
    const previous = persisted;
    saving = true;
    select.disabled = true;
    status.textContent = 'Saving…';
    try {
      await extension.storage.local.set({ [THEME_KEY]: next });
      if (before === revision) render(next);
      status.textContent = persisted === next ? 'Theme saved. Open game tabs update automatically.' : 'Theme updated in another window.';
    } catch {
      if (before === revision) {
        persisted = previous;
        select.value = previous ?? '';
      }
      status.textContent = 'Could not save the theme. Please try again.';
    } finally {
      saving = false;
      select.disabled = false;
    }
  });

  const before = revision;
  try {
    const stored = await extension.storage.local.get(THEME_KEY);
    if (before !== revision) return;
    render(stored?.[THEME_KEY]);
    status.textContent = persisted ? '' : 'Choose Legacy or Fantasy to restore a valid selection.';
  } catch {
    if (before !== revision) return;
    select.value = '';
    select.disabled = false;
    status.textContent = 'Could not load settings. Choose a theme to try saving again.';
  }
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') initThemeSettings();
