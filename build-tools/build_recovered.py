#!/usr/bin/env python3
"""Small deterministic bundler for the source recovered from the v1.4.0 inline map.

This is not intended to replace the project's original esbuild pipeline. It exists
so the stability patch can be rebuilt faithfully from the recovered source tree
without shipping another inline source map.
"""
from pathlib import Path
import json, re, posixpath, shutil, sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
DIST = ROOT / 'dist'
ASSETS = ROOT / 'assets'
DIST.mkdir(parents=True, exist_ok=True)

# v1.6.x lifecycle hardening: every stylesheet, including base.css, is bundled
# as a text module and injected by StyleInjector. A manifest-declared base.css
# cannot be removed by the runtime kill switch, so it made "native restore"
# impossible. StyleInjector rewrites ../assets/... url() references to extension
# URLs before injection, preserving the CSP-proof self-hosted fonts.
STANDALONE_CSS = set()

# Assets that must be present for icons and typefaces to render at runtime.
# Populated by `npm run vendor` (build-tools/vendor-assets.mjs).
REQUIRED_ASSETS = [
    'gear_icons_atlas.png',
    'gear_icons_manifest.json',
    'item_icons_atlas.png',
    'item_icons_index.csv',
    'fonts/cinzel-variable.woff2',
    'fonts/barlow-400.woff2',
    'fonts/barlow-500.woff2',
    'fonts/barlow-600.woff2',
    'fonts/barlow-700.woff2',
    'fonts/crimson-text-italic.woff2',
]


def module_id(path: Path) -> str:
    return path.relative_to(SRC).as_posix()


def resolve_import(cur_id: str, spec: str) -> str:
    if not spec.startswith('.'):
        raise ValueError(f'Only relative imports are supported: {cur_id} -> {spec}')
    base = posixpath.dirname(cur_id)
    return posixpath.normpath(posixpath.join(base, spec))


def transform_js(path: Path) -> str:
    mid = module_id(path)
    src = path.read_text(encoding='utf-8')

    # Named imports: import { a, b as c } from './x.js';
    pat_named = re.compile(r"^\s*import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]\s*;\s*$", re.M)
    def repl_named(m):
        names = []
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            bits = re.split(r'\s+as\s+', part)
            if len(bits) == 2:
                names.append(f'{bits[0].strip()}: {bits[1].strip()}')
            else:
                names.append(part)
        dep = resolve_import(mid, m.group(2))
        return f"const {{ {', '.join(names)} }} = require({json.dumps(dep)});"
    src = pat_named.sub(repl_named, src)

    # Default imports are used for CSS text modules in this project.
    pat_default = re.compile(r"^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s*['\"]([^'\"]+)['\"]\s*;\s*$", re.M)
    def repl_default(m):
        dep = resolve_import(mid, m.group(2))
        return f"const {m.group(1)} = require({json.dumps(dep)}).default;"
    src = pat_default.sub(repl_default, src)

    exports = []

    def exp_func(m):
        name = m.group(1)
        exports.append(name)
        return f'function {name}('
    src = re.sub(r'\bexport\s+function\s+([A-Za-z_$][\w$]*)\s*\(', exp_func, src)

    def exp_const(m):
        name = m.group(1)
        exports.append(name)
        return f'const {name} ='
    src = re.sub(r'\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=', exp_const, src)

    def exp_let(m):
        name = m.group(1)
        exports.append(name)
        return f'let {name} ='
    src = re.sub(r'\bexport\s+let\s+([A-Za-z_$][\w$]*)\s*=', exp_let, src)

    if re.search(r'^\s*import\b|\bexport\s+(?:default|class|\{)', src, re.M):
        raise ValueError(f'Unsupported module syntax remains in {mid}')

    if exports:
        src += '\n\n' + '\n'.join(f'exports.{name} = {name};' for name in dict.fromkeys(exports)) + '\n'
    return src


modules = []
for path in sorted(SRC.rglob('*')):
    if not path.is_file():
        continue
    mid = module_id(path)
    if mid in STANDALONE_CSS:
        continue
    if path.suffix == '.js':
        body = transform_js(path)
    elif path.suffix == '.css':
        css = path.read_text(encoding='utf-8')
        body = f'exports.default = {json.dumps(css, ensure_ascii=False)};'
    else:
        continue
    modules.append((mid, body))

parts = [
    '(() => {',
    '  "use strict";',
    '  const __modules = Object.create(null);',
]
for mid, body in modules:
    parts.append(f'  __modules[{json.dumps(mid)}] = (module, exports, require) => {{')
    for line in body.splitlines():
        parts.append('    ' + line)
    parts.append('  };')

parts.extend([
    '  const __cache = Object.create(null);',
    '  function __require(id) {',
    '    if (__cache[id]) return __cache[id].exports;',
    '    const fn = __modules[id];',
    '    if (!fn) throw new Error(`IW Fantasy Skin bundle: module not found: ${id}`);',
    '    const module = { exports: {} };',
    '    __cache[id] = module;',
    '    fn(module, module.exports, __require);',
    '    return module.exports;',
    '  }',
    '  __require("content.js");',
    '})();',
    '',
])

out = DIST / 'content.bundle.js'
out.write_text('\n'.join(parts), encoding='utf-8')
print(f'Built {out} ({out.stat().st_size:,} bytes, {len(modules)} modules)')

# A previous build may have left dist/base.css behind. It is no longer a runtime
# artifact and keeping it risks someone re-adding it to manifest.json later.
stale_base = DIST / 'base.css'
if stale_base.exists():
    stale_base.unlink()
    print(f'Removed stale {stale_base}')

# Missing assets are a BUILD FAILURE, not a warning.
#
# v1.6.0 moved the atlases out of runtime GitHub fetches and into assets/. The
# failure mode of that change is silent and total: every icon renders as the
# fallback glyph and every typeface degrades, while the build still reports
# success. A warning scrolls past. A non-zero exit does not.
#
# Escape hatch for deliberately building the JS without assets present:
#     python3 build-tools/build_recovered.py --allow-missing-assets
missing = [rel for rel in REQUIRED_ASSETS if not (ASSETS / rel).is_file()]
if missing:
    allow = '--allow-missing-assets' in sys.argv
    print('\n' + ('WARNING' if allow else 'ERROR') + ' - missing bundled assets:')
    for rel in missing:
        print(f'         assets/{rel}')
    print('\n         Fix:  npm run vendor')
    print('         Without these, icons render as the fallback glyph and the')
    print('         dark-fantasy typefaces silently fall back to system fonts.\n')
    if not allow:
        sys.exit(1)
