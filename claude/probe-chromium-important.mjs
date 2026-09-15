import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent('<div id="a"></div>');
const r = await p.evaluate(() => {
  const el = document.getElementById('a');
  const out = {};
  const run = (label, fn) => {
    el.setAttribute('style', '');
    let n = 0;
    const o = new MutationObserver(l => { n += l.length; });
    o.observe(document.body, { attributes: true, subtree: true });
    fn(el);
    return new Promise(res => setTimeout(() => { o.disconnect(); out[label] = n; res(); }, 30));
  };
  return (async () => {
    await run('50x align-self+margin, both !important', el => {
      for (let i = 0; i < 50; i++) { el.style.setProperty('align-self','auto','important'); el.style.setProperty('margin','0','important'); }
    });
    await run('50x the full READOUT_STYLES map + cursor/transform/filter/align-self', el => {
      const M = { background:'none', border:'none', 'border-radius':'0', outline:'none', 'box-shadow':'none',
                  padding:'0', margin:'0', width:'auto', 'min-width':'0', height:'auto', 'min-height':'0', 'max-height':'none' };
      for (let i = 0; i < 50; i++) {
        for (const [k,v] of Object.entries(M)) el.style.setProperty(k, v, 'important');
        el.style.setProperty('cursor','pointer','important');
        el.style.setProperty('transform','none','important');
        el.style.setProperty('filter','none','important');
        el.style.setProperty('align-self','auto','important');
      }
    });
    await run('sensitivity control: 50x alternating color', el => {
      for (let i = 0; i < 50; i++) el.style.setProperty('color', i % 2 ? 'red' : 'blue');
    });
    return out;
  })();
});
console.log(JSON.stringify(r, null, 2));
await b.close();
