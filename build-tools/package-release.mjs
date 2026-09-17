/**
 * Assemble the release zip - `npm run package` (which rebuilds the bundle first).
 *
 * "Load unpacked -> this folder" works for development because Chrome only
 * reads what the manifest names. A release zip made from the same folder would
 * carry everything else in it: node_modules, tmp/ and output/ (hundreds of MB),
 * the button-art generator inputs, and build-tools/header-live-profile/ - a real
 * browser profile with saved logins, autofill and wallet state (.gitignore).
 * So the package is built from an ALLOWLIST, never by excluding from the repo:
 *
 *   manifest.json, every file its content_scripts load, and assets/ minus
 *   documentation, previews, prompts and the gitignored generator inputs.
 *
 * Before writing anything it verifies what would otherwise only fail in the
 * browser: the three version strings agree, every content-script file exists
 * and is inside the package, every web_accessible_resources pattern matches a
 * packaged file, and the bundle carries no source map reference.
 *
 * Output: release/idleworlds-fantasy-skin-v<version>.zip (gitignored).
 * Dependency-free: a stored/deflated zip written with node:zlib.
 */
import { crc32, deflateRawSync } from 'node:zlib';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const problems = [];
const fail = message => problems.push(message);

const manifest = JSON.parse(await readFile(path.join(ROOT, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const contentJs = await readFile(path.join(ROOT, 'src/content.js'), 'utf8');
const codeVersion = (contentJs.match(/const VERSION = '([^']+)'/) || [])[1];
if (manifest.version !== pkg.version || manifest.version !== codeVersion) {
  fail(`version mismatch: manifest ${manifest.version}, package.json ${pkg.version}, src/content.js ${codeVersion}`);
}

/* Not shipped: documentation and design previews that sit beside the art, and
   the generator inputs .gitignore already keeps out of the repository. */
const EXCLUDE = [
  /\.md$/i,
  /\.html$/i,
  /(^|\/)prompts?\.(txt|json)$/i,
  /^assets\/skills-ui\/buttons\/themes-v2\//,
  /^assets\/skills-ui\/buttons\/source-v4\//,
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(rel(full));
  }
  return out;
}

const files = new Set(['manifest.json']);
for (const script of manifest.content_scripts || []) {
  for (const file of [...(script.js || []), ...(script.css || [])]) {
    try { await stat(path.join(ROOT, file)); files.add(file); }
    catch { fail(`content script file missing: ${file}`); }
  }
}
for (const file of await walk(path.join(ROOT, 'assets'))) {
  if (!EXCLUDE.some(rx => rx.test(file))) files.add(file);
}

// web_accessible_resources: Chrome's `*` matches across directories.
const globToRegExp = glob => new RegExp(`^${glob.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
for (const group of manifest.web_accessible_resources || []) {
  for (const pattern of group.resources || []) {
    const rx = globToRegExp(pattern);
    if (![...files].some(f => rx.test(f))) fail(`web_accessible_resources pattern matches no packaged file: ${pattern}`);
  }
}

const bundlePath = (manifest.content_scripts || []).flatMap(s => s.js || []).find(f => f.startsWith('dist/'));
if (bundlePath) {
  const bundle = await readFile(path.join(ROOT, bundlePath), 'utf8');
  if (/sourceMappingURL=/.test(bundle)) fail(`${bundlePath} references a source map that is not shipped`);
}
if (!manifest.icons) {
  console.warn('WARNING - manifest.json has no "icons". Chrome shows a generic icon, and the Chrome Web Store requires a 128x128 one.');
}

if (problems.length) {
  console.error('\nPackage NOT written:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

/* Minimal zip: local headers, central directory, end record. Deflated unless
   that does not shrink the entry (already-compressed PNG/WebP/WOFF2). */
function dosDateTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}
const locals = [];
const central = [];
let offset = 0;
let rawBytes = 0;
const sizes = [];
for (const name of [...files].sort()) {
  const data = await readFile(path.join(ROOT, name));
  const { mtime } = await stat(path.join(ROOT, name));
  const deflated = deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const nameBuf = Buffer.from(name, 'utf8');
  const { time, date } = dosDateTime(mtime);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(useDeflate ? 8 : 0, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8); header.writeUInt16LE(useDeflate ? 8 : 0, 10); header.writeUInt16LE(time, 12);
  header.writeUInt16LE(date, 14); header.writeUInt32LE(crc, 16); header.writeUInt32LE(body.length, 20);
  header.writeUInt32LE(data.length, 24); header.writeUInt16LE(nameBuf.length, 28); header.writeUInt32LE(offset, 42);
  locals.push(local, nameBuf, body);
  central.push(header, nameBuf);
  offset += local.length + nameBuf.length + body.length;
  rawBytes += data.length;
  sizes.push([name, data.length]);
}
const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);

const outDir = path.join(ROOT, 'release');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `idleworlds-fantasy-skin-v${manifest.version}.zip`);
await writeFile(outFile, Buffer.concat([...locals, centralBuf, end]));
const zipBytes = (await stat(outFile)).size;

const mb = n => `${(n / 1e6).toFixed(1)} MB`;
console.log(`Packaged ${files.size} files, ${mb(rawBytes)} -> ${rel(outFile)} (${mb(zipBytes)})`);
console.log('Largest entries:');
for (const [name, size] of sizes.sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${mb(size).padStart(8)}  ${name}`);
