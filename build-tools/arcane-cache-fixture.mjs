/** Local visual fixture that boots the real extension bundle. No game session. */
export function cacheFixture() {
  return `<!doctype html><html data-iw-page-hydrated="1"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>Arcane Cache preview</title>
  <style>*,::before,::after{box-sizing:border-box;border:0 solid}body{margin:0;background:#111015;color:#ddd5c1;font-family:Arial,sans-serif}
  button,a{font:inherit;color:inherit;background:none}button{cursor:pointer}p,h1,h2{margin:0}
  #shell{max-width:1250px;margin:0 auto;padding:24px;display:flex;flex-direction:column;gap:16px}
  .panel{padding:18px;border:1px solid #443d32;background:#1b181a;border-radius:4px}
  #rail{display:flex;flex-wrap:wrap;align-items:center;gap:8px}#rail button{padding:8px 14px}
  .preview-info{padding:55px 18px;text-align:center;line-height:1.7;color:#b4aea0}
  .preview-info h2{font-family:Georgia,serif;font-size:24px;font-weight:400;color:#e0d5ba;margin-bottom:12px}
  .preview-info p{font-size:14px} .preview-info small{display:block;margin-top:20px;font-size:12px;color:#90897e}
  @media(max-width:768px){#shell{padding:8px}}</style></head><body>
  <main id="shell"><header class="panel"><h1>IdleWorlds</h1></header>
  <nav id="rail" class="panel" aria-label="Main navigation">${['Game','Market','Leaderboards','Village','Dungeon'].map(r=>`<button type="button">${r}</button>`).join('')}</nav>
  <section class="preview-info"><h2>A little magic, ready to open.</h2>
  <p>Choose <strong>Arcane Cache</strong> or <strong>Caches ×20</strong> beside Toolkit in the toolbar.</p>
  <p>Batch preview supports 20, 50 or 100 caches. Rare treasures float above; resources collect below.</p>
  <p>The chest will arrive, then wait for you to break the seal.</p>
  <small>Local animation preview · Sample rewards · No game account connected</small></section></main>
  <script>window.__skinListeners=[];window.chrome={runtime:{id:'preview',getURL:p=>new URL('/'+p,location).href},storage:{local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener:f=>window.__skinListeners.push(f)}}};</script>
  <script src="/dist/content.bundle.js"></script></body></html>`;
}
