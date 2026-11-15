const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const pg = await b.newPage(); const e=[]; pg.on('pageerror', x=>e.push(x.message));
await pg.goto('http://localhost:8765/'); await pg.waitForTimeout(3000); console.log(e); await b.close(); })();
