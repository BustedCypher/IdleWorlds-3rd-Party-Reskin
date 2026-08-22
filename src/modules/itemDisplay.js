function finite(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function effectNumber(text, pattern) {
  const match = pattern.exec(String(text || ''));
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}
function fieldOrEffect(item, field, pattern) {
  const structured = finite(item?.[field]);
  if (structured !== null) return structured;
  return effectNumber(item?.effects_raw, pattern);
}
export function deriveDisplayStats(item) {
  const text = item?.effects_raw || '';
  return {
    atk: fieldOrEffect(item, 'atk', /\bATK\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
    def: fieldOrEffect(item, 'def', /\bDEF\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
    hp: fieldOrEffect(item, 'hp', /\bHP\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
    warfare: fieldOrEffect(item, 'warfare', /\bWarfare\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
    xpPerTask: fieldOrEffect(item, 'xp_per_task', /\bXP\s*\+?\s*(-?\d+(?:\.\d+)?)\s*\/\s*task\b/i),
    doubleGatherPct: fieldOrEffect(item, 'double_gather_pct', /([+-]?\d+(?:\.\d+)?)%\s*(?:2x|2×)\s*gather(?:\s+chance)?\b/i),
    goldFindPct: fieldOrEffect(item, 'gold_find_pct', /([+-]?\d+(?:\.\d+)?)%\s*gold\s+find\b/i),
    itemFindPct: fieldOrEffect(item, 'item_find_pct', /([+-]?\d+(?:\.\d+)?)%\s*item\s+find\b/i),
    sockets: fieldOrEffect(item, 'sockets', /\b(\d+)\s+Sockets?\b/i),
    allResists: effectNumber(text, /\bAll\s+Resists?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
    fireResist: effectNumber(text, /\bFire\s+Resist(?:ance)?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
    frostResist: effectNumber(text, /\bFrost\s+Resist(?:ance)?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
    lightningResist: effectNumber(text, /\bLightning\s+Resist(?:ance)?\s*\+?\s*(-?\d+(?:\.\d+)?)/i),
    bonusBrewPct: effectNumber(text, /([+-]?\d+(?:\.\d+)?)%\s*Bonus\s+Brew\b/i),
    bonusEnhancePct: effectNumber(text, /([+-]?\d+(?:\.\d+)?)%\s*Bonus\s+Enhance\b/i),
    bonusEnchantPct: effectNumber(text, /([+-]?\d+(?:\.\d+)?)%\s*Bonus\s+Enchant\b/i),
  };
}
/**
 * itemDisplay
 *
 * Shared presentation helpers. Inventory rows and tooltip cards both derive
 * their display data here so a stat is labelled and coloured identically
 * wherever it appears.
 */

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

export function slotLabel(item) {
  const sub = String((item && item.subcategory) || '').trim();
  return sub.replace(/\s+slot$/i, '');
}

function has(v) {
  return v !== undefined && v !== null && v !== '' && v !== 0;
}

/** Build the compact stat rail used by Inventory. */
export function statChips(item, opts = {}) {
  if (!item) return [];
  const max = opts.max || 5;
  const chips = [];
  const stats = deriveDisplayStats(item);

  const slot = slotLabel(item);
  const tier = has(item.tier) ? `Tier ${item.tier}` : '';
  const context = [tier, slot].filter(Boolean).join(' · ');
  if (context) chips.push({ text: context, kind: 'tier' });

  if (has(stats.atk))     chips.push({ text: `ATK +${stats.atk}`, kind: 'pos' });
  if (has(stats.def))     chips.push({ text: `DEF +${stats.def}`, kind: 'pos' });
  if (has(stats.hp))      chips.push({ text: `HP +${stats.hp}`, kind: 'pos' });
  if (has(stats.warfare)) chips.push({ text: `WAR +${stats.warfare}`, kind: 'pos' });

  if (has(stats.xpPerTask))      chips.push({ text: `XP +${stats.xpPerTask}`, kind: 'pos' });
  if (has(stats.doubleGatherPct)) chips.push({ text: `2× gather ${stats.doubleGatherPct}%`, kind: 'pos' });
  if (has(stats.goldFindPct))    chips.push({ text: `Gold +${stats.goldFindPct}%`, kind: 'pos' });
  if (has(stats.itemFindPct))    chips.push({ text: `Find +${stats.itemFindPct}%`, kind: 'pos' });
  if (has(stats.allResists)) {
    chips.push({ text: `All Resists +${stats.allResists}`, kind: 'pos' });
  } else {
    if (has(stats.fireResist)) chips.push({ text: `Fire Resist +${stats.fireResist}`, kind: 'pos' });
    if (has(stats.frostResist)) chips.push({ text: `Frost Resist +${stats.frostResist}`, kind: 'pos' });
    if (has(stats.lightningResist)) chips.push({ text: `Lightning Resist +${stats.lightningResist}`, kind: 'pos' });
  }
  if (has(stats.bonusBrewPct))    chips.push({ text: `Bonus Brew ${stats.bonusBrewPct}%`, kind: 'pos' });
  if (has(stats.bonusEnhancePct)) chips.push({ text: `Bonus Enhance ${stats.bonusEnhancePct}%`, kind: 'pos' });
  if (has(stats.bonusEnchantPct)) chips.push({ text: `Bonus Enchant ${stats.bonusEnchantPct}%`, kind: 'pos' });

  if (has(item.skill_bonus_skill) && has(item.skill_bonus_value)) {
    chips.push({ text: `${item.skill_bonus_skill} +${item.skill_bonus_value}`, kind: 'pos' });
  }

  if (has(stats.sockets)) {
    const n = Number(stats.sockets);
    chips.push({ text: n === 1 ? '1 socket' : `${n} sockets`, kind: 'plain' });
  }

  return chips.slice(0, max);
}

/** Full stat list used by the rich tooltip card. */
export function statRows(item) {
  if (!item) return [];
  const rows = [];
  const stats = deriveDisplayStats(item);
  const gold = value => `${Number(value).toLocaleString()}g`;
  if (has(stats.atk))     rows.push({ label: '⚔️ ATK', value: String(stats.atk) });
  if (has(stats.def))     rows.push({ label: '🛡️ DEF', value: String(stats.def) });
  if (has(stats.hp))      rows.push({ label: '❤️ HP', value: String(stats.hp) });
  if (has(stats.warfare)) rows.push({ label: '⚔️ Warfare', value: String(stats.warfare) });
  if (has(stats.xpPerTask))      rows.push({ label: '✨ XP/task', value: String(stats.xpPerTask) });
  if (has(stats.doubleGatherPct)) rows.push({ label: '🌿 2× Gather', value: `${stats.doubleGatherPct}%` });
  if (has(stats.goldFindPct))    rows.push({ label: '💰 Gold Find', value: `${stats.goldFindPct}%` });
  if (has(stats.itemFindPct))    rows.push({ label: '🔎 Item Find', value: `${stats.itemFindPct}%` });
  if (has(stats.allResists)) {
    rows.push({ label: '🜁 All Resists', value: `+${stats.allResists}` });
  } else {
    if (has(stats.fireResist)) rows.push({ label: '🔥 Fire Resist', value: `+${stats.fireResist}` });
    if (has(stats.frostResist)) rows.push({ label: '❄️ Frost Resist', value: `+${stats.frostResist}` });
    if (has(stats.lightningResist)) rows.push({ label: '⚡ Lightning Resist', value: `+${stats.lightningResist}` });
  }
  if (has(stats.bonusBrewPct)) rows.push({ label: 'Bonus Brew', value: `${stats.bonusBrewPct}%` });
  if (has(stats.bonusEnhancePct)) rows.push({ label: 'Bonus Enhance', value: `${stats.bonusEnhancePct}%` });
  if (has(stats.bonusEnchantPct)) rows.push({ label: 'Bonus Enchant', value: `${stats.bonusEnchantPct}%` });
  if (has(item.skill_bonus_skill) && has(item.skill_bonus_value)) {
    rows.push({ label: `✨ ${item.skill_bonus_skill}`, value: `+${item.skill_bonus_value}` });
  }
  if (has(stats.sockets)) rows.push({ label: '🔷 Sockets', value: String(stats.sockets) });
  if (has(item.work_order_turn_in_gold) && /work order/i.test(String(item.work_order_turn_in_note || ''))) {
    rows.push({ label: '📦 Work order', value: gold(item.work_order_turn_in_gold), cls: 'amber', note: String(item.work_order_turn_in_note || '').trim() });
  }
  if (has(item.base_value)) rows.push({ label: '💰 Base value', value: gold(item.base_value), cls: 'amber' });
  if (has(item.trader_token_value)) {
    const n = Number(item.trader_token_value);
    rows.push({ label: '🏷️ Turn-in', value: `${n} token${n === 1 ? '' : 's'}` });
  }
  return rows;
}
