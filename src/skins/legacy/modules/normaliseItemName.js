/**
 * Shared item-name normalisation.
 *
 * ItemDatabase and AtlasService must agree on what constitutes the same
 * item name. Keeping this in one module prevents an icon resolving while
 * the corresponding database record silently fails to resolve.
 */
export function normaliseItemName(name) {
  let s = String(name == null ? '' : name).trim();
  try { s = s.normalize('NFKD'); } catch (e) {}
  return s
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/'/g, '')
    .replace(/\blv\.\s*/gi, 'lv ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}
