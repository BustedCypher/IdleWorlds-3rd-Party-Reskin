import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

/* SkillPanelRenderer receives iw:skill-panel before the V2 controller does.
   The first renderer pass must therefore recognise the renderer-owned
   fs-skill-panel marker; waiting for data-iw-skill-v2 leaves native button text
   and legacy 155px geometry behind until some unrelated mutation causes a
   second pass. */
const source = await readFile(new URL('../src/modules/SkillPanelRenderer.js', import.meta.url), 'utf8');
const declaration = source.match(/function compactCommandButton\(btn\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(declaration, 'shipping compactCommandButton implementation is present');

const dom = new JSDOM(`<!doctype html><html data-iw-skill-card-design="new"><body>
  <div class="compact-panel fs-skill-panel"><button id="skill">Craft</button></div>
  <div class="compact-panel"><button id="other">Buy</button></div>
</body></html>`);
const compactCommandButton = new Function('document', `${declaration}\nreturn compactCommandButton;`)(dom.window.document);

assert.equal(compactCommandButton(dom.window.document.querySelector('#skill')), true,
  'a renderer-identified skill button is compact on its first pass, before the V2 listener runs');
assert.equal(compactCommandButton(dom.window.document.querySelector('#other')), false,
  'the new-design root does not compact controls outside renderer-identified skill panels');

dom.window.close();
console.log('PASS skill-card first-pass command classification');
