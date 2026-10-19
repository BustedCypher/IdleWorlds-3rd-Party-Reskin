/** Import the October item art without replacing the existing shared atlases. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REVISION = '3ad7e2563e342098c535727f35d6827b7ee75cd4';
const BASE = `https://raw.githubusercontent.com/BustedCypher/idleWorlds-game-sprites-BC/${REVISION}/`;

export async function vendorItemExpansions() {
  const get = async path => {
    const response = await fetch(BASE + path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response;
  };
  const manifests = await Promise.all(['raidforged_artwork_manifest.json', 'october_item_artwork_manifest.json']
    .map(async path => (await get(path)).json()));
  const source = await (await get('assets/item-expansions/october-2026-additions/items.json')).json();
  const items = [];
  for (const item of manifests.flatMap(manifest => manifest.items)) {
    if (!/^assets\/(?:raidforged|item-expansions)\/[a-z0-9_/-]+\.png$/.test(item.path)) {
      throw new Error(`Unexpected expansion asset path: ${item.path}`);
    }
    const data = Buffer.from(await (await get(item.path)).arrayBuffer());
    if (createHash('sha256').update(data).digest('hex') !== item.sha256_png) {
      throw new Error(`Expansion icon checksum mismatch: ${item.path}`);
    }
    if (data.subarray(1, 4).toString() !== 'PNG' || data.readUInt32BE(16) !== 128 || data.readUInt32BE(20) !== 128) {
      throw new Error(`Expansion icon must be a 128px PNG: ${item.path}`);
    }
    const path = `assets/item-expansions/october-2026/${item.item_id}.png`;
    await mkdir(dirname(resolve(ROOT, path)), { recursive: true });
    await writeFile(resolve(ROOT, path), data);
    items.push({ item_id: item.item_id, name: item.name, path });
  }
  // The retired generic scroll art is shared by all ten live skill scrolls.
  const scroll = items.find(item => item.item_id === 'hollow_scroll');
  for (const item of source.items.filter(item => item.item_id.startsWith('hollow_scroll_'))) {
    items.push({ item_id: item.item_id, name: item.name, path: scroll.path });
  }
  await writeFile(resolve(ROOT, 'assets/item-expansions/index.json'), JSON.stringify({
    version: 1, source: `BustedCypher/idleWorlds-game-sprites-BC@${REVISION}`,
    source_generated_at: source.source_generated_at, items,
  }, null, 2) + '\n');
  console.log(`  item expansions: ${items.length} item IDs, ${new Set(items.map(item => item.path)).size} icons`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  vendorItemExpansions().catch(error => { console.error(error); process.exitCode = 1; });
}
