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

import { createHash } from 'node:crypto';
import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';
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


const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(bytes) {
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('expected PNG signature');
  }

  const chunks = [];
  const idats = [];
  let ihdr = null;
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const rawEnd = dataEnd + 4;
    if (rawEnd > bytes.length) throw new Error(`truncated PNG chunk ${type}`);
    const data = bytes.subarray(dataStart, dataEnd);
    chunks.push({ type, raw: bytes.subarray(offset, rawEnd) });
    if (type === 'IHDR') ihdr = Buffer.from(data);
    if (type === 'IDAT') idats.push(Buffer.from(data));
    offset = rawEnd;
    if (type === 'IEND') break;
  }

  if (!ihdr || idats.length === 0) throw new Error('PNG missing IHDR or IDAT');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const compression = ihdr[10];
  const filterMethod = ihdr[11];
  const interlace = ihdr[12];
  if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filterMethod !== 0 || interlace !== 0) {
    throw new Error(`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType} compression=${compression} filter=${filterMethod} interlace=${interlace}`);
  }

  const bpp = 4;
  const stride = width * bpp;
  const packed = inflateSync(Buffer.concat(idats));
  const expectedLength = height * (stride + 1);
  requireEqual(packed.length, expectedLength, 'decoded PNG scanline byte length');

  const pixels = Buffer.alloc(width * height * bpp);
  const filters = new Uint8Array(height);
  for (let y = 0; y < height; y += 1) {
    const packedRow = y * (stride + 1);
    const filter = packed[packedRow];
    if (filter > 4) throw new Error(`unsupported PNG row filter ${filter}`);
    filters[y] = filter;
    const outRow = y * stride;
    const prevRow = outRow - stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[packedRow + 1 + x];
      const a = x >= bpp ? pixels[outRow + x - bpp] : 0;
      const b = y > 0 ? pixels[prevRow + x] : 0;
      const cc = y > 0 && x >= bpp ? pixels[prevRow + x - bpp] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = (raw + a) & 0xff;
      else if (filter === 2) value = (raw + b) & 0xff;
      else if (filter === 3) value = (raw + Math.floor((a + b) / 2)) & 0xff;
      else value = (raw + paeth(a, b, cc)) & 0xff;
      pixels[outRow + x] = value;
    }
  }

  return { width, height, pixels, filters, chunks };
}

function encodePng(decoded) {
  const { width, height, pixels, filters, chunks } = decoded;
  const bpp = 4;
  const stride = width * bpp;
  const packed = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y += 1) {
    const filter = filters[y];
    const packedRow = y * (stride + 1);
    const row = y * stride;
    const prevRow = row - stride;
    packed[packedRow] = filter;
    for (let x = 0; x < stride; x += 1) {
      const value = pixels[row + x];
      const a = x >= bpp ? pixels[row + x - bpp] : 0;
      const b = y > 0 ? pixels[prevRow + x] : 0;
      const cc = y > 0 && x >= bpp ? pixels[prevRow + x - bpp] : 0;
      let filtered;
      if (filter === 0) filtered = value;
      else if (filter === 1) filtered = (value - a + 256) & 0xff;
      else if (filter === 2) filtered = (value - b + 256) & 0xff;
      else if (filter === 3) filtered = (value - Math.floor((a + b) / 2) + 256) & 0xff;
      else filtered = (value - paeth(a, b, cc) + 256) & 0xff;
      packed[packedRow + 1 + x] = filtered;
    }
  }

  const idat = pngChunk('IDAT', deflateSync(packed, { level: 9 }));
  const out = [PNG_SIGNATURE];
  let emittedIdat = false;
  for (const chunk of chunks) {
    if (chunk.type === 'IDAT') {
      if (!emittedIdat) {
        out.push(idat);
        emittedIdat = true;
      }
      continue;
    }
    out.push(Buffer.from(chunk.raw));
  }
  if (!emittedIdat) throw new Error('cannot encode PNG without IDAT slot');
  return Buffer.concat(out);
}

function readCell(decoded, x, y) {
  if (x < 0 || y < 0 || x + CELL > decoded.width || y + CELL > decoded.height) {
    throw new Error(`cell ${x},${y} is outside PNG bounds ${decoded.width}x${decoded.height}`);
  }
  const out = Buffer.alloc(CELL * CELL * 4);
  const sourceStride = decoded.width * 4;
  const cellStride = CELL * 4;
  for (let row = 0; row < CELL; row += 1) {
    const srcStart = (y + row) * sourceStride + x * 4;
    decoded.pixels.copy(out, row * cellStride, srcStart, srcStart + cellStride);
  }
  return out;
}

function writeCell(decoded, x, y, cell) {
  const targetStride = decoded.width * 4;
  const cellStride = CELL * 4;
  for (let row = 0; row < CELL; row += 1) {
    const dstStart = (y + row) * targetStride + x * 4;
    cell.copy(decoded.pixels, dstStart, row * cellStride, (row + 1) * cellStride);
  }
}

function hasVisibleAlpha(cell) {
  for (let i = 3; i < cell.length; i += 4) if (cell[i] !== 0) return true;
  return false;
}

function decodeAndPatch({ sourceBytes, targetBytes, patch }) {
  const source = decodePng(sourceBytes);
  const target = decodePng(targetBytes);
  const sourceCells = patch.map(spec => readCell(source, spec.sourceX, spec.sourceY));
  const before = patch.map(spec => {
    const rgba = readCell(target, spec.targetX, spec.targetY);
    return { rgba, occupied: hasVisibleAlpha(rgba) };
  });

  for (let i = 0; i < patch.length; i += 1) {
    writeCell(target, patch[i].targetX, patch[i].targetY, sourceCells[i]);
  }
  const after = patch.map(spec => readCell(target, spec.targetX, spec.targetY));

  return {
    sourceWidth: source.width,
    sourceHeight: source.height,
    targetWidth: target.width,
    targetHeight: target.height,
    sourceCells,
    before,
    after,
    png: encodePng(target),
  };
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
const pixels = decodeAndPatch({ sourceBytes, targetBytes, patch: EXPECTED });
requireEqual(pixels.sourceWidth, Number(gloveChunk.width), 'source glove chunk width');
requireEqual(pixels.sourceHeight, Number(gloveChunk.height), 'source glove chunk height');
requireEqual(pixels.targetWidth, Number(targetManifest.columns) * CELL, 'target atlas width');
requireEqual(pixels.targetHeight, Number(targetManifest.rows) * CELL, 'target atlas height');

for (let i = 0; i < EXPECTED.length; i += 1) {
  const spec = EXPECTED[i];
  const sourceHash = sha256(pixels.sourceCells[i]);
  requireEqual(sourceHash, spec.sha256, `${spec.sourceKey} decoded source RGBA hash`);
  const afterHash = sha256(pixels.after[i]);
  requireEqual(afterHash, spec.sha256, `${spec.sourceKey} patched destination RGBA hash`);
}

const existing = EXPECTED.map(spec => (normalisedTargetNames.get(normalise(spec.name)) || [])[0] || null);
const alreadyImported = existing.every((entry, i) =>
  entry &&
  Number(entry.x) === EXPECTED[i].targetX &&
  Number(entry.y) === EXPECTED[i].targetY &&
  Number(entry.width) === CELL &&
  Number(entry.height) === CELL &&
  sha256(pixels.before[i].rgba) === EXPECTED[i].sha256
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

await atomicWrite(TARGET_ATLAS, pixels.png);
await atomicWrite(TARGET_MANIFEST, Buffer.from(JSON.stringify(targetManifest, null, 2) + '\n', 'utf8'));

for (const spec of EXPECTED) console.log(`IMPORTED ${spec.name}: ${spec.sha256}`);
console.log(`Updated ${path.relative(ROOT, TARGET_ATLAS)} and ${path.relative(ROOT, TARGET_MANIFEST)} without changing atlas dimensions`);
