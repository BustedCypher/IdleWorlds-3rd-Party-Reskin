import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {resolve} from 'node:path';

const result=await build({stdin:{resolveDir:resolve(import.meta.dirname,'..'),contents:`
  import {decorateCompactButtons,clearCompactButtons} from './src/modules/CompactButtons.js';
  import {startWatcher,stopWatcher,on} from './src/modules/DOMWatcher.js';
  window.flushes=0;
  on('iw:dom-flush',()=>{window.flushes++;decorateCompactButtons();});
  window.stop=()=>{stopWatcher();clearCompactButtons();};
  startWatcher();`},bundle:true,write:false,format:'iife',platform:'browser'});
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  await page.setContent('<button id="send" data-iw-panel-part="send">Send</button><div><button id="one" aria-pressed="true">I</button><button id="two" aria-pressed="false">II</button></div>');
  await page.addScriptTag({content:result.outputFiles[0].text});
  await page.waitForFunction(()=>document.querySelectorAll('#send [data-iw-compact-layer]').length===3);
  // Let initialization settle so its pending mount flush cannot conceal the
  // missing text-only update path.
  await page.waitForTimeout(250);
  await page.evaluate(()=>document.getElementById('send').replaceChildren('Send'));
  await page.waitForFunction(()=>document.querySelectorAll('#send [data-iw-compact-layer]').length===3,{},{timeout:1500});
  await page.evaluate(()=>{document.getElementById('one').setAttribute('aria-pressed','false');document.getElementById('two').setAttribute('aria-pressed','true');});
  await page.waitForFunction(()=>document.getElementById('two').dataset.iwCompactSelected==='true');
  assert.equal(await page.locator('#one').getAttribute('data-iw-compact-selected'),null);
  await page.waitForTimeout(250);const before=await page.evaluate(()=>window.flushes);
  await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.flushes),before,'quiet controls must not create repeating mutation flushes');
  await page.evaluate(()=>window.stop());assert.equal(await page.locator('[data-iw-compact-layer]').count(),0);
  console.log('PASS compact-button reconciliation: native text replacement, aria-only selection, quiet idle and teardown');
}finally{await browser.close();}
