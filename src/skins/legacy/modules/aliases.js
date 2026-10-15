/**
 * Cloak Material Aliases
 *
 * TEMPORARY — remove this file once the gear icon atlas / manifest is
 * updated in the GitHub repo to use the game's actual material names.
 *
 * The game's items.json uses short material names ("Mythril Cloak") but
 * the gear atlas manifest was built with an earlier, longer naming
 * convention ("Mythril Silk Cloak"). All 14 affected materials map
 * one-to-one — confirmed by diffing every Cloak-slot item in the game
 * API against every cloak entry in the gear manifest.
 *
 * Once the repo's manifest is regenerated with matching names, this
 * file and its one call site in AtlasService.js can be deleted.
 */

// game material (lowercase) → atlas material (lowercase)
export const CLOAK_MATERIAL_ALIASES = {
  'abyssal':      'abyssal silk',
  'aether':       'aether silk',
  'astral':       'astral silk',
  'celestial':    'celestial silk',
  'dragonscale':  'dragonscale silk',
  'eternal':      'eternal weave',
  'glacial':      'glacial silk',
  'gravity':      'gravity weave',
  'mythril':      'mythril silk',
  'primordial':   'primordial weave',
  'regal':        'regal silk',
  'runic':        'runic thread',
  'void':         'void thread',
  'voidglass':    'voidglass silk',
};

// Matches: [optional prefix affix] [material] Cloak of [suffix]
// Captures the material word so it can be swapped via the alias table.
const CLOAK_PATTERN = /^((?:gilded|fortunate|nimble)\s+)?(\w+)(\s+cloak\s+of\s+.+)$/i;

/**
 * Given an item name, return the atlas-equivalent name if it matches
 * the known cloak drift pattern, otherwise return the name unchanged.
 */
export function applyCloakAlias(name) {
  const match = CLOAK_PATTERN.exec(name);
  if (!match) return name;

  const [, prefix = '', material, suffix] = match;
  const aliased = CLOAK_MATERIAL_ALIASES[material.toLowerCase()];
  if (!aliased) return name;

  return `${prefix}${aliased}${suffix}`;
}
