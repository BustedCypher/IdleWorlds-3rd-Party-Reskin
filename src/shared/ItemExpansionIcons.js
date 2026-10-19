/** Read-only item art shared by the two independent tooltip presentations. */
import index from '../../assets/item-expansions/index.json' with { type: 'json' };

const key = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const byId = new Map(index.items.map(item => [item.item_id, item]));
const byName = new Map(index.items.map(item => [key(item.name), item]));
const UPGRADE = /\s*\+\s*(\d+)\s*$/;

export function findExpansionIcon({ id, name } = {}) {
  const match = UPGRADE.exec(name || '');
  const item = byId.get(String(id || '')) || byName.get(key(String(name || '').replace(UPGRADE, '')));
  return item ? { ...item, badge: match ? Number(match[1]) : 0 } : null;
}
