/** Exact raid equipment identity, shared by presentation surfaces. */
import index from '../../../../assets/raid_gear/index.json';

const byId = new Map();
const byName = new Map();
const nameKey = value => String(value || '').replace(/\+\s*\d+\s*$/, '')
  .normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');

for (const item of index.items) {
  // The same atlases contain crafting drops. A raid source alone is not gear.
  if (item.category !== 'Equipment') continue;
  const gear = { boss: item.raid, id: item.item_id, name: item.name };
  byId.set(item.item_id, gear);
  byName.set(nameKey(item.name), gear);
}

export function findRaidGear({ id, name } = {}) {
  // An explicit native id is authoritative when a row is being recycled;
  // never let the previous visible name put the old boss back on the frame.
  return (id ? byId.get(String(id)) : byName.get(nameKey(name))) || null;
}
