/** Documentation inventory only. No downloads, production writes, or browser access. */
import {readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).filter(p=>!p.startsWith('handoff/technical/')&&p!=='handoff/TECHNICAL_HANDOVER.md');
const sha=b=>createHash('sha256').update(b).digest('hex');
const link=p=>`[${p}](../../${p.split('/').map(encodeURIComponent).join('/')})`;
const cell=s=>String(s??'').replace(/\|/g,'&#124;').replace(/\r?\n/g,' ');
const exclude=[/\.md$/i,/\.html$/i,/(^|\/)prompts?\.(txt|json)$/i,/^assets\/skills-ui\/buttons\/themes-v2\//,/^assets\/skills-ui\/buttons\/source-v4\//];
async function walk(dir){const out=[];for(const e of await readdir(path.join(root,dir),{withFileTypes:true})){if(e.isSymbolicLink())continue;const p=dir+'/'+e.name;if(e.isDirectory())out.push(...await walk(p));else if(e.isFile())out.push(p);}return out;}
function purpose(p){
  if(p==='manifest.json')return 'Extension entry points, permissions, host and resource exposure';
  if(p==='package.json')return 'Developer commands and direct development dependency ranges';
  if(p==='package-lock.json')return 'Exact transitive dependency graph and integrity pins';
  if(p==='dist/content.bundle.js')return 'Generated runtime IIFE; manifest entry point';
  if(p==='src/page/hydration-signal.js')return 'MAIN-world React hydration probe; separate manifest entry';
  if(p.startsWith('src/modules/'))return 'Runtime module; behavior and ownership documented in JavaScript chapters';
  if(p==='src/content.js')return 'Runtime activation, boot order, service startup and teardown';
  if(p.startsWith('src/styles/'))return p.endsWith('header.claude.css')?'Inactive alternative header stylesheet; not imported':'Runtime stylesheet; every rule documented in CSS reference';
  if(p.startsWith('tests/'))return 'Standalone regression suite; see test matrix';
  if(p.startsWith('build-tools/'))return 'Build/import/audit utility; see build-tool catalog';
  if(p.startsWith('claude/captures/'))return 'Historical DOM geometry evidence, not runtime input';
  if(p.startsWith('claude/'))return /\.bak$|\.patch$/.test(p)?'Historical stylesheet/patch reference; not runtime input':'Developer diagnostic or capture script; not runtime input';
  if(p.startsWith('.github/'))return 'CI build and test automation';
  if(p.startsWith('handoff/'))return 'Historical feature specification or derived rendition';
  if(p.startsWith('docs/'))return 'Design history or regression trap documentation';
  if(p.startsWith('assets/')){
    if(/\/sources\//.test(p))return 'Artwork generator source; packaging may include this file';
    if(/prompts?\.(txt|json)$/.test(p))return 'Artwork provenance/prompt; excluded from release';
    if(/\.html$|\.md$/.test(p))return 'Asset documentation/preview; excluded from release';
    if(/\/fonts\//.test(p))return 'Bundled font face; base.css @font-face';
    if(/\/header\/zones\//.test(p))return /_mobile/.test(p)?'Portrait zone backdrop':'Desktop zone backdrop';
    if(/\/header\//.test(p))return 'Header chrome or legacy fallback artwork; inclusion does not prove current use';
    if(/\/village\/building_/.test(p))return 'Building tier illustration, imported from construction artwork';
    if(/\/village\/house_/.test(p))return 'Housing tier illustration';
    if(/\/village\//.test(p))return 'Village scene ground or generated building provenance';
    if(/\/buttons\//.test(p))return /\.json$/.test(p)?'Button sprite windows, registration or verification data':'Button theme/state artwork; see asset-family active/fallback status';
    if(/\/action-icons\//.test(p))return 'V2 discipline glyph, or its ten-skill index';
    if(/\/quest-frames\//.test(p))return 'Approved quest frame sheet or crop index';
    if(/\/world-bosses\//.test(p))return 'Encounter/zone-control illustration or fallback reward metadata';
    if(/\/panel_corners_|\/inventory\/panel_corners/.test(p))return 'Mirrored filigree for border-image';
    if(/separator_flourish/.test(p))return 'Centered bilateral heading divider';
    if(/\/theme_/.test(p))return 'Zone theme Skills UI atlas';
    if(/\.csv$|\.json$/.test(p))return 'Sprite index/manifest or generated theme map';
    return 'Shared item, gear, skill or panel art; see asset-family catalog';
  }
  if(/\.md$/.test(p))return 'Project guide or historical release notes';
  return 'Repository configuration/support file';
}
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
const entries=new Set(manifest.content_scripts.flatMap(s=>[...(s.js||[]),...(s.css||[])]));
const assets=(await walk('assets')).sort();
const all=[...new Set([...tracked,...assets])].sort();
const trackedSet=new Set(tracked);
const records=[];
for(const p of all){const b=await readFile(path.join(root,p));records.push({path:p,bytes:b.length,sha256:sha(b),tracked:trackedSet.has(p),release:p==='manifest.json'||entries.has(p)||(p.startsWith('assets/')&&!exclude.some(rx=>rx.test(p))),purpose:purpose(p)});}
const pkg=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
const deps=Object.entries(pkg.packages).filter(([p])=>p).map(([p,v])=>({path:p,...v}));
let out='# Complete project, asset, and dependency reference\n\n';
out+='Generated from actual files by `node handoff/technical/generate-project-reference.mjs`. This inventory covers every Git-tracked project file plus every local file under `assets/`, including ignored artwork inputs. It deliberately excludes installed `node_modules` file contents, Git internals, unrelated `output/`, private browser profiles, scratch captures and release archives; dependencies and exclusions are described separately. SHA-256 values identify the audited bytes, not an assertion of licensing or safety. New handover documents are excluded to avoid self-referential hashes.\n\n';
out+=`Baseline commit: \`${execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()}\`. ${tracked.length} tracked baseline files; ${assets.length} local asset files; ${records.length} unique inventoried files. ${records.filter(r=>r.release).length} files qualify under the current packaging allowlist.\n\n`;
out+='## File and asset inventory\n\n“Packaged” applies the actual asset exclusions in `package-release.mjs`; it does not mean an asset is actively requested. Untracked assets can enter a release. Production source modules/styles are bundled, rather than separately shipped.\n\n| File | Bytes | Git tracked | Packaged | Role | SHA-256 |\n|---|---:|---|---|---|---|\n';
for(const r of records)out+=`| ${link(r.path)} | ${r.bytes} | ${r.tracked?'yes':'no'} | ${r.release?'yes':'no'} | ${cell(r.purpose)} | \`${r.sha256}\` |\n`;
out+='\n## Complete locked dependency inventory\n\nAll npm dependencies are development/build/test dependencies; none is imported as a runtime npm library into the content entry graph. Optional platform packages are listed even when not installed on this machine. `package-lock.json` preserves each resolved URL and integrity value; regenerate via reviewed lockfile changes, not by editing this table. License values below are metadata from the lockfile, not an independent legal review.\n\n| Lockfile package path | Version | Dev | Optional | License metadata | Node engine | Resolved source |\n|---|---|---|---|---|---|---|\n';
for(const d of deps)out+=`| \`${d.path}\` | ${d.version||''} | ${d.dev?'yes':'no'} | ${d.optional?'yes':'no'} | ${cell(d.license||'not recorded')} | ${cell(d.engines?.node||'not recorded')} | ${d.resolved?`[registry artifact](${d.resolved})`:'not recorded'} |\n`;
out+='\n## Source imports\n\nEvery literal import in `src/`, including inactive files if present. CSS composition order and the separate MAIN-world entry are explained in the handover.\n\n| Source | Line | Imported resource |\n|---|---:|---|\n';
for(const p of tracked.filter(p=>p.startsWith('src/')&&p.endsWith('.js'))){const s=await readFile(path.join(root,p),'utf8');for(const m of s.matchAll(/\bimport\s+(?:[^;]*?\sfrom\s*)?['"]([^'"]+)['"]/g)){out+=`| ${link(p)} | ${s.slice(0,m.index).split('\n').length} | \`${m[1]}\` |\n`;}}
await writeFile(path.join(root,'handoff/technical/PROJECT_REFERENCE.md'),out);
await writeFile(path.join(root,'handoff/technical/project-inventory.json'),JSON.stringify({baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),records,dependencies:deps.map(d=>({path:d.path,version:d.version,dev:!!d.dev,optional:!!d.optional,resolved:d.resolved,integrity:d.integrity}))},null,2)+'\n');
console.log(JSON.stringify({tracked:tracked.length,assets:assets.length,records:records.length,packaged:records.filter(r=>r.release).length,dependencies:deps.length,markdownBytes:Buffer.byteLength(out)}));
