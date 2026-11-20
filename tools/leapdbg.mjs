import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)(process.env.PW);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:5174/?shot=1&start=bot&lv=0');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  window.__sim(2.2); window.__place(2.2, -1.9); window.__sim(0.1); window.__press('leap');
  const out = [];
  for (let i = 0; i < 50; i++) { window.__sim(1 / 30); const s = window.__state(); const hip = window.__hip(); out.push(`${i} ${s.act[0]} at=${window.__actT().toFixed(2)} z=${s.pos[0][1]} hipY=${hip.toFixed(2)} hp=${s.hp} ${window.__blade()}`); }
  return out;
});
console.log(r.filter((_, i) => i >= 20 && i <= 34 && i % 2 === 0).join('\n'));
await browser.close();
