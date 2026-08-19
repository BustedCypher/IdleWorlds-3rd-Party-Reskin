/**
 * itemDisplay
 *
 * Shared presentation helpers. Inventory rows and tooltip cards both
 * derive their display data here so a stat is labelled and coloured
 * identically wherever it appears.
 */

/* The game ships ~34 tiers. Bucketing them into six named bands lets the
   tier colour scale carry meaning without inventing 34 colours nobody
   could distinguish on a dark background. */
const TIER_BANDS = [
  { max: 5,        cls: 'tier-common'    },
  { max: 11,       cls: 'tier-uncommon'  },
  { max: 17,       cls: 'tier-rare'      },
  { max: 23,       cls: 'tier-epic'      },
  { max: 29,       cls: 'tier-legendary' },
  { max: Infinity, cls: 'tier-mythic'    },
];

export function tierClass(item) {
  const t = Number(item && item.tier);
  if (!Number.isFinite(t)) return 'tier-common';
  return (TIER_BANDS.find(b => t <= b.max) || TIER_BANDS[0]).cls;
}

/** "Weapon slot" → "Weapon", "Raw material" → "Raw material" */
export function slotLabel(item) {
  const sub = String((item && item.subcategory) || '').trim();
  return sub.replace(/\s+slot$/i, '');
}

function has(v) {
  return v !== undefined && v !== null && v !== '' && v !== 0;
}

/**
 * Build the stat chip list for an item.
 * @returns {{ text: string, kind: 'plain'|'pos'|'tier' }[]}
 */
export function statChips(item, opts = {}) {
  if (!item) return [];
  const max = opts.max || 5;
  const chips = [];

  // Leading context chip: tier + slot
  const slot = slotLabel(item);
  const tier = has(item.tier) ? `Tier ${item.tier}` : '';
  const context = [tier, slot].filter(Boolean).join(' · ');
  if (context) chips.push({ text: context, kind: 'tier' });

  // Combat stats
  if (has(item.atk))     chips.push({ text: `ATK +${item.atk}`, kind: 'pos' });
  if (has(item.def))     chips.push({ text: `DEF +${item.def}`, kind: 'pos' });
  if (has(item.hp))      chips.push({ text: `HP +${item.hp}`,   kind: 'pos' });
  if (has(item.warfare)) chips.push({ text: `WAR +${item.warfare}`, kind: 'pos' });

  // Percentage bonuses
  if (has(item.xp_per_task))       chips.push({ text: `XP +${item.xp_per_task}`, kind: 'pos' });
  if (has(item.double_gather_pct)) chips.push({ text: `2× gather ${item.double_gather_pct}%`, kind: 'pos' });
  if (has(item.gold_find_pct))     chips.push({ text: `Gold +${item.gold_find_pct}%`, kind: 'pos' });
  if (has(item.item_find_pct))     chips.push({ text: `Find +${item.item_find_pct}%`, kind: 'pos' });

  // Skill bonus
  if (has(item.skill_bonus_skill) && has(item.skill_bonus_value)) {
    chips.push({ text: `${item.skill_bonus_skill} +${item.skill_bonus_value}`, kind: 'pos' });
  }

  // Sockets
  if (has(item.sockets)) {
    const n = Number(item.sockets);
    chips.push({ text: n === 1 ? '1 socket' : `${n} sockets`, kind: 'plain' });
  }

  return chips.slice(0, max);
}

/**
 * Stat rows for the tooltip card — fuller than the chip list, and
 * key/value rather than a single string.
 */
export function statRows(item) {
  if (!item) return [];
  const rows = [];

  if (has(item.atk))     rows.push({ label: 'Attack',   value: `+${item.atk}`, cls: 'good' });
  if (has(item.def))     rows.push({ label: 'Defence',  value: `+${item.def}`, cls: 'good' });
  if (has(item.hp))      rows.push({ label: 'Health',   value: `+${item.hp}`,  cls: 'good' });
  if (has(item.warfare)) rows.push({ label: 'Warfare',  value: `+${item.warfare}`, cls: 'good' });

  if (has(item.xp_per_task))       rows.push({ label: 'XP per task',    value: `+${item.xp_per_task}` });
  if (has(item.double_gather_pct)) rows.push({ label: 'Double gather',  value: `${item.double_gather_pct}%` });
  if (has(item.gold_find_pct))     rows.push({ label: 'Gold find',      value: `+${item.gold_find_pct}%` });
  if (has(item.item_find_pct))     rows.push({ label: 'Item find',      value: `+${item.item_find_pct}%` });

  if (has(item.skill_bonus_skill) && has(item.skill_bonus_value)) {
    rows.push({ label: item.skill_bonus_skill, value: `+${item.skill_bonus_value}` });
  }

  if (has(item.sockets)) rows.push({ label: 'Sockets', value: String(item.sockets) });

  if (has(item.suggested_market_price)) {
    rows.push({
      label: 'Market price',
      value: `${Number(item.suggested_market_price).toLocaleString()}g`,
      cls: 'amber',
    });
  }

  return rows;
}
