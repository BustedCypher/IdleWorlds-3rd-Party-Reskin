const URL = 'https://idleworlds.com/items.json';
const KNOWN_ACQUISITION = new Set([
  'Upgrade', 'Crafted', 'Unknown', 'ZoneDrop',
  'Gathered', 'Cache', 'Shop', 'BossDrop',
]);
const NUMERIC_FIELDS = [
  'tier', 'req_level', 'atk', 'def', 'hp', 'warfare',
  'xp_per_task', 'double_gather_pct', 'gold_find_pct',
  'item_find_pct', 'sockets', 'skill_bonus_value', 'base_value',
  'suggested_market_price', 'trader_token_value', 'work_order_turn_in_gold',
];
const EFFECT_PATTERNS = {
  allResists: /\bAll\s+Resists?\s*\+?\s*-?\d/i,
  fireResist: /\bFire\s+Resist(?:ance)?\s*\+?\s*-?\d/i,
  frostResist: /\bFrost\s+Resist(?:ance)?\s*\+?\s*-?\d/i,
  lightningResist: /\bLightning\s+Resist(?:ance)?\s*\+?\s*-?\d/i,
  bonusBrew: /\d+(?:\.\d+)?%\s*Bonus\s+Brew\b/i,
  bonusEnhance: /\d+(?:\.\d+)?%\s*Bonus\s+Enhance\b/i,
  bonusEnchant: /\d+(?:\.\d+)?%\s*Bonus\s+Enchant\b/i,
};

const response = await fetch(URL, { headers: { accept: 'application/json' } });
if (!response.ok) throw new Error(`items.json HTTP ${response.status}`);
const payload = await response.json();
const items = Array.isArray(payload) ? payload : payload.items;
if (!Array.isArray(items)) throw new Error('items.json has no items array');const failures = [];
const warnings = [];
const ids = new Set();
const names = new Set();
const acquisitionCounts = new Map();
const effectCounts = Object.fromEntries(Object.keys(EFFECT_PATTERNS).map(k => [k, 0]));
let enhanced = 0;

for (const item of items) {
  const id = String(item?.item_id || '').trim();
  const name = String(item?.name || '').trim();
  if (!id) failures.push('record missing item_id');
  else if (ids.has(id)) failures.push(`duplicate item_id: ${id}`);
  else ids.add(id);
  if (!name) failures.push(`record ${id || '<unknown>'} missing name`);
  else if (names.has(name)) warnings.push(`duplicate name: ${name}`);
  else names.add(name);

  const acq = item?.acquisition_type || 'Unknown';
  acquisitionCounts.set(acq, (acquisitionCounts.get(acq) || 0) + 1);
  if (!KNOWN_ACQUISITION.has(acq)) failures.push(`unknown acquisition_type: ${acq}`);

  for (const field of NUMERIC_FIELDS) {
    const value = item?.[field];
    if (value === '' || value == null) continue;
    if (!Number.isFinite(Number(value))) failures.push(`${id}: ${field} is not numeric (${value})`);
  }

  const suffix = name.match(/\+(\d+)$/);
  if (suffix) {
    enhanced += 1;
    const level = Number(suffix[1]);
    if (level < 1 || level > 4) failures.push(`${id}: unsupported enhancement suffix +${level}`);
  }
  const effect = String(item?.effects_raw || '');
  for (const [key, pattern] of Object.entries(EFFECT_PATTERNS)) {
    if (pattern.test(effect)) effectCounts[key] += 1;
  }
}const generatedAt = payload?.generatedAt || 'unknown';
console.log(`items.json generatedAt: ${generatedAt}`);
console.log(`records: ${items.length}`);
console.log(`enhanced +1..+4 records: ${enhanced}`);
console.log('acquisition types:');
for (const [type, count] of [...acquisitionCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type}: ${count}`);
}
console.log('effect-only modern stat phrases:');
for (const [key, count] of Object.entries(effectCounts)) console.log(`  ${key}: ${count}`);

if (warnings.length) {
  console.log(`warnings: ${warnings.length}`);
  for (const warning of warnings.slice(0, 20)) console.log(`  ! ${warning}`);
  if (warnings.length > 20) console.log(`  ... ${warnings.length - 20} more`);
}
if (failures.length) {
  console.error(`FAIL items contract: ${failures.length} issue(s)`);
  for (const failure of failures.slice(0, 50)) console.error(`  - ${failure}`);
  if (failures.length > 50) console.error(`  ... ${failures.length - 50} more`);
  process.exitCode = 1;
} else {
  console.log('PASS items contract');
}
