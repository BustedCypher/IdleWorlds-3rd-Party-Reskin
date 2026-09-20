#!/usr/bin/env node
/**
 * import-launch-glove-icons.mjs
 *
 * Scoped launch hotfix importer for the two Ancient Treant glove rewards that
 * became live after the extension's offline legacy gear atlas was pinned.
 *
 * Usage:
 *   node build-tools/import-launch-glove-icons.mjs [spriteRepo]
 *   node build-tools/import-launch-glove-icons.mjs --check [spriteRepo]
 *
 * The source of truth is the sibling sprite repository's hashed v2 manifest,
 * audit and gear:gloves chunk. The importer refuses to substitute artwork:
 * both source cells must match their audited RGBA SHA-256 before any write.
 */

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const sourceArg = args.find(arg => arg !== '--check');
const SOURCE_ROOT = sourceArg
  ? path.resolve(sourceArg)
  : path.resolve(ROOT, '..', 'idleWorlds-game-sprites-BC');
const SOURCE_V2 = path.join(SOURCE_ROOT, 'assets', 'icons', 'v2');
const TARGET_ATLAS = path.join(ROOT, 'assets', 'gear_icons_atlas.png');
const TARGET_MANIFEST = path.join(ROOT, 'assets', 'gear_icons_manifest.json');

const CELL = 128;
const SOURCE_CHUNK = 'gear:gloves';
const EXPECTED = Object.freeze([
  {
    id: 'woodcutters_gloves',
    sourceKey: 'woodcutters gloves',
    name: "Woodcutter's Gloves",
    sourceX: 896,
    sourceY: 1024,
    targetX: 896,
    targetY: 19456,
    sha256: 'c144f2b6bc0dafbb0db85ef5a97c22c2532959f02d998a1ca25c6c0b9f0ed435',
  },
  {
    id: 'builders_gloves',
    sourceKey: 'builders gloves',
    name: "Builder's Gloves",
    sourceX: 1024,
    sourceY: 1024,
    targetX: 1024,
    targetY: 19456,
    sha256: '542242e3c86ee9c8d1a104cc0c8fd121a7e471a96583041171dfe6918402b155',
  },
]);

const normalise = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2018\u2019\u02bc`\u00b4']/g, '')
  .replace(/[^a-z0-9]+/gi, ' ')
  .trim()
  .toLowerCase();

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function discoverSingle(regex, label) {
  const names = (await readdir(SOURCE_V2)).filter(name => regex.test(name));
  if (names.length !== 1) {
    throw new Error(`expected exactly one ${label} in ${SOURCE_V2}, found ${names.length}: ${names.join(', ') || 'none'}`);
  }
  return path.join(SOURCE_V2, names[0]);
}

async function atomicWrite(file, bytes) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, bytes);
  await rename(tmp, file);
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function targetEntryFor(spec, index) {
  return {
    name: spec.name,
    index,
    row: spec.targetY / CELL,
    column: spec.targetX / CELL,
    x: spec.targetX,
    y: spec.targetY,
    width: CELL,
    height: CELL,
  };
}

function findAuditRecord(audit, spec) {
  return (audit.gear_records || []).find(record =>
    record.chunk === SOURCE_CHUNK &&
    normalise(record.normalised_name || record.name) === spec.sourceKey
  );
}

function base64FromBytes(data) {
  let binary = '';
  const size = 0x8000;
  for (let i = 0; i < data.length; i += size) {
    binary += String.fromCharCode(...data.subarray(i, i + size));
  }
  return btoa(binary);
}

async function decodeAndPatch({ sourceBytes, targetBytes, patch }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    return await page.evaluate(async ({ sourceUri, targetUri, cell, patch }) => {
      const load = async uri => {
        const img = new Image();
        img.src = uri;
        await img.decode();
        return img;
      };
      const [source, target] = await Promise.all([load(sourceUri), load(targetUri)]);

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = source.naturalWidth;
      sourceCanvas.height = source.naturalHeight;
      const sx = sourceCanvas.getContext('2d', { willReadFrequently: true });
      sx.drawImage(source, 0, 0);

      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = target.naturalWidth;
      targetCanvas.height = target.naturalHeight;
      const tx = targetCanvas.getContext('2d', { willReadFrequently: true });
      tx.drawImage(target, 0, 0);

      const before = [];
      const sourceCells = [];
      for (const spec of patch) {
        const src = sx.getImageData(spec.sourceX, spec.sourceY, cell, cell);
        const dst = tx.getImageData(spec.targetX, spec.targetY, cell, cell);
        sourceCells.push(base64FromBytes(src.data));
        before.push({
          rgba: base64FromBytes(dst.data),
          occupied: dst.data.some((value, index) => index % 4 === 3 && value !== 0),
        });
      }

      for (const spec of patch) {
        tx.drawImage(source,
          spec.sourceX, spec.sourceY, cell, cell,
          spec.targetX, spec.targetY, cell, cell);
      }

      const after = patch.map(spec => {
        const data = tx.getImageData(spec.targetX, spec.targetY, cell, cell).data;
        return base64FromBytes(data);
      });

      return {
        sourceWidth: source.naturalWidth,
        sourceHeight: source.naturalHeight,
        targetWidth: target.naturalWidth,
        targetHeight: target.naturalHeight,
        sourceCells,
        before,
        after,
        png: targetCanvas.toDataURL('image/png').split(',')[1],
      };
    }, {
      sourceUri: `data:image/png;base64,${sourceBytes.toString('base64')}`,
      targetUri: `data:image/png;base64,${targetBytes.toString('base64')}`,
      cell: CELL,
      patch,
    });
  } finally {
    await browser.close();
  }
}

const manifestPath = await discoverSingle(/^icon-manifest\.[a-f0-9]+\.json$/i, 'hashed v2 icon manifest');
const auditPath = await discoverSingle(/^icon-audit\.[a-f0-9]+\.json$/i, 'hashed v2 icon audit');
const [sourceManifest, sourceAudit, targetManifest, targetBytes] = await Promise.all([
  readFile(manifestPath, 'utf8').then(JSON.parse),
  readFile(auditPath, 'utf8').then(JSON.parse),
  readFile(TARGET_MANIFEST, 'utf8').then(JSON.parse),
  readFile(TARGET_ATLAS),
]);

requireEqual(Number(sourceManifest.cell_size), CELL, 'source manifest cell_size');
const gloveChunk = sourceManifest.chunks?.[SOURCE_CHUNK];
if (!gloveChunk?.path) throw new Error(`${SOURCE_CHUNK} missing from ${path.basename(manifestPath)}`);

for (const spec of EXPECTED) {
  const mapped = sourceManifest.gear?.icons?.[spec.sourceKey];
  const wanted = [SOURCE_CHUNK, spec.sourceX, spec.sourceY];
  if (!Array.isArray(mapped) || mapped.length < 3 ||
      mapped[0] !== wanted[0] || Number(mapped[1]) !== wanted[1] || Number(mapped[2]) !== wanted[2]) {
    throw new Error(`${spec.sourceKey}: expected source mapping ${JSON.stringify(wanted)}, got ${JSON.stringify(mapped)}`);
  }
  const audited = findAuditRecord(sourceAudit, spec);
  if (!audited) throw new Error(`${spec.sourceKey}: missing from ${path.basename(auditPath)}`);
  requireEqual(audited.sha256_rgba, spec.sha256, `${spec.sourceKey} audit RGBA hash`);
}

const normalisedTargetNames = new Map();
for (const icon of targetManifest.icons || []) {
  const key = normalise(icon.name);
  const list = normalisedTargetNames.get(key) || [];
  list.push(icon);
  normalisedTargetNames.set(key, list);
}
for (const spec of EXPECTED) {
  const hits = normalisedTargetNames.get(normalise(spec.name)) || [];
  if (hits.length > 1) throw new Error(`duplicate target manifest name "${spec.name}"`);
}

const sourceBytes = await readFile(path.join(SOURCE_V2, gloveChunk.path));
const pixels = await decodeAndPatch({ sourceBytes, targetBytes, patch: EXPECTED });
requireEqual(pixels.sourceWidth, Number(gloveChunk.width), 'source glove chunk width');
requireEqual(pixels.sourceHeight, Number(gloveChunk.height), 'source glove chunk height');
requireEqual(pixels.targetWidth, Number(targetManifest.columns) * CELL, 'target atlas width');
requireEqual(pixels.targetHeight, Number(targetManifest.rows) * CELL, 'target atlas height');

for (let i = 0; i < EXPECTED.length; i += 1) {
  const spec = EXPECTED[i];
  const sourceHash = sha256(Buffer.from(pixels.sourceCells[i], 'base64'));
  requireEqual(sourceHash, spec.sha256, `${spec.sourceKey} decoded source RGBA hash`);
  const afterHash = sha256(Buffer.from(pixels.after[i], 'base64'));
  requireEqual(afterHash, spec.sha256, `${spec.sourceKey} patched destination RGBA hash`);
}

const existing = EXPECTED.map(spec => (normalisedTargetNames.get(normalise(spec.name)) || [])[0] || null);
const alreadyImported = existing.every((entry, i) =>
  entry &&
  Number(entry.x) === EXPECTED[i].targetX &&
  Number(entry.y) === EXPECTED[i].targetY &&
  Number(entry.width) === CELL &&
  Number(entry.height) === CELL &&
  sha256(Buffer.from(pixels.before[i].rgba, 'base64')) === EXPECTED[i].sha256
);

if (CHECK) {
  if (!alreadyImported) {
    throw new Error('launch glove import is not current: manifest entries and/or destination RGBA cells do not match');
  }
  for (const spec of EXPECTED) console.log(`OK ${spec.name}: ${spec.sha256}`);
  console.log('OK launch glove atlas import is current');
  process.exit(0);
}

if (alreadyImported) {
  for (const spec of EXPECTED) console.log(`UNCHANGED ${spec.name}: ${spec.sha256}`);
  console.log('Launch glove atlas import already current');
  process.exit(0);
}

for (let i = 0; i < EXPECTED.length; i += 1) {
  const spec = EXPECTED[i];
  if (existing[i]) {
    throw new Error(`target manifest already contains "${spec.name}" but its cell/hash is not the expected import`);
  }
  const collision = (targetManifest.icons || []).find(icon =>
    Number(icon.x) === spec.targetX && Number(icon.y) === spec.targetY
  );
  if (collision) throw new Error(`destination cell ${spec.targetX},${spec.targetY} is occupied by "${collision.name}"`);
  if (pixels.before[i].occupied) throw new Error(`destination cell ${spec.targetX},${spec.targetY} contains non-transparent pixels`);
}

const nextIndex = Math.max(-1, ...(targetManifest.icons || []).map(icon => Number(icon.index)).filter(Number.isFinite)) + 1;
targetManifest.icons.push(...EXPECTED.map((spec, offset) => targetEntryFor(spec, nextIndex + offset)));

await atomicWrite(TARGET_ATLAS, Buffer.from(pixels.png, 'base64'));
await atomicWrite(TARGET_MANIFEST, Buffer.from(JSON.stringify(targetManifest, null, 2) + '\n', 'utf8'));

for (const spec of EXPECTED) console.log(`IMPORTED ${spec.name}: ${spec.sha256}`);
console.log(`Updated ${path.relative(ROOT, TARGET_ATLAS)} and ${path.relative(ROOT, TARGET_MANIFEST)} without changing atlas dimensions`);
