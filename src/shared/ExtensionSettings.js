/** Extension-private profile settings. No skin dependencies or presentation. */
export const THEME_KEY = 'iw-skin-theme';
export const ENABLED_KEY = 'iw-skin-enabled';

export function resolveTheme(value) {
  if (value == null) return 'legacy';
  return value === 'legacy' || value === 'fantasy' ? value : null;
}

export async function readSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return { enabled: true, theme: 'legacy' };
  try {
    const [enabled, theme] = await Promise.all([
      chrome.storage.local.get(ENABLED_KEY), chrome.storage.local.get(THEME_KEY),
    ]);
    return { enabled: enabled?.[ENABLED_KEY] !== false, theme: resolveTheme(theme?.[THEME_KEY]) };
  } catch (err) {
    // An unreadable Fantasy preference must never accidentally enable Legacy.
    console.warn('[IW Fantasy Skin] Unable to read profile settings:', err.message);
    return { enabled: false, theme: null };
  }
}

/** Report only changed fields; keep listening even when the extension is off. */
export function watchSettings(handler) {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return () => {};
  const listener = (changes, area) => {
    if (area !== 'local') return;
    const patch = {};
    if (Object.hasOwn(changes, ENABLED_KEY)) patch.enabled = changes[ENABLED_KEY].newValue !== false;
    if (Object.hasOwn(changes, THEME_KEY)) patch.theme = resolveTheme(changes[THEME_KEY].newValue);
    if (Object.keys(patch).length) handler(patch);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener?.(listener);
}
